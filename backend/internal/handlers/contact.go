package handlers

import (
	"log/slog"
	"net/mail"
	"strings"
	"unicode"

	"github.com/gofiber/fiber/v3"
	"github.com/jackymean-del/smart-sched/internal/mailer"
)

// contactAckDailyCap stops auto-replies once this many messages arrive in 24
// hours, keeping a flood of fake submissions from burning the email quota.
const contactAckDailyCap = 50

// contactMinFillMs is the fastest a person can plausibly fill in the form.
// Anything quicker is a bot.
const contactMinFillMs = 3000

// SubmitContact accepts a public contact-form submission from the marketing
// site and stores it. Registered WITHOUT auth (see main.go).
func (h *Handler) SubmitContact(c fiber.Ctx) error {
	var body struct {
		Name    string `json:"name"`
		Email   string `json:"email"`
		Message string `json:"message"`
		Source  string `json:"source"`
		// Spam guards sent by the website forms: Website is a hidden field only
		// bots fill in, ElapsedMs is how long the form was open before sending.
		Website   string `json:"website"`
		ElapsedMs *int   `json:"elapsed_ms"`
	}
	if err := c.Bind().JSON(&body); err != nil {
		return fiber.NewError(fiber.StatusBadRequest, "invalid body")
	}

	name := strings.TrimSpace(body.Name)
	email := strings.TrimSpace(body.Email)
	message := strings.TrimSpace(body.Message)

	// Source is allowlisted (never trust arbitrary client input in a stored,
	// team-visible field). Defaults to the marketing contact form; the app's
	// "Notify me when Pro launches" button sends "pro-waitlist"; the bhusku
	// parent-brand site's contact form sends "bhusku-contact".
	source := "marketing-contact"
	switch body.Source {
	case "pro-waitlist":
		source = "pro-waitlist"
	case "bhusku-contact":
		source = "bhusku-contact"
	}

	// Drop bot submissions without saving or emailing anything, but answer as
	// if they succeeded so the bot has no signal to adapt to. The bhusku form
	// always sends a fill time, so a request without one didn't come from it.
	// (schedU's form is checked only when it sends one, until it's deployed.)
	if reason := botReason(body.Website, body.ElapsedMs, source == "bhusku-contact"); reason != "" {
		slog.Info("contact: dropped as spam", "reason", reason, "email", email, "source", source)
		return c.Status(fiber.StatusCreated).JSON(fiber.Map{"ok": true})
	}

	if name == "" || email == "" || message == "" {
		return fiber.NewError(fiber.StatusBadRequest, "name, email and message are required")
	}
	if len(name) > 200 || len(email) > 320 || len(message) > 5000 {
		return fiber.NewError(fiber.StatusBadRequest, "one or more fields are too long")
	}
	if _, err := mail.ParseAddress(email); err != nil {
		return fiber.NewError(fiber.StatusBadRequest, "please enter a valid email address")
	}

	_, err := h.db.Exec(c.Context(), `
		INSERT INTO contact_messages (name, email, message, source, ip, user_agent)
		VALUES ($1, $2, $3, $4, $5, $6)`,
		name, email, message, source, c.IP(), c.Get("User-Agent"),
	)
	if err != nil {
		slog.Error("contact: insert failed", "err", err)
		return fiber.NewError(fiber.StatusInternalServerError, "could not save your message - please email us directly")
	}

	slog.Info("contact: message received", "email", email, "source", source)
	// Stored already; the email is a best-effort heads-up, so do not block on SMTP.
	go mailer.SendContactNotification(name, email, message, source)

	// Auto-reply to the sender, throttled because the endpoint is public and
	// anyone can type someone else's address: at most one per address per
	// day, and none once the day's volume suggests abuse. The client IP can't
	// be used here - behind the Vercel rewrite every request shares one.
	// Addresses are compared normalised (see normalizeEmail) so dotted or
	// +tagged variants of one inbox count as the same sender.
	var sameSender, total int
	err = h.db.QueryRow(c.Context(), `
		SELECT count(*) FILTER (WHERE `+normalizedEmailSQL+` = $1), count(*)
		FROM contact_messages WHERE created_at > NOW() - INTERVAL '24 hours'`,
		normalizeEmail(email),
	).Scan(&sameSender, &total)
	switch {
	case err != nil:
		slog.Error("contact: acknowledgement check failed", "err", err)
	case looksLikeGibberish(message):
		slog.Info("contact: acknowledgement skipped (gibberish)", "email", email)
	case sameSender <= 1 && total <= contactAckDailyCap:
		go mailer.SendContactAcknowledgement(name, email, source)
	default:
		slog.Info("contact: acknowledgement skipped (throttled)", "email", email, "sameSender", sameSender, "total", total)
	}
	return c.Status(fiber.StatusCreated).JSON(fiber.Map{"ok": true})
}

// botReason says why a submission looks automated, or "" if it doesn't.
func botReason(website string, elapsedMs *int, requireElapsed bool) string {
	switch {
	case website != "":
		return "hidden field filled"
	case elapsedMs == nil && requireElapsed:
		return "no fill time"
	case elapsedMs != nil && *elapsedMs < contactMinFillMs:
		return "filled too fast"
	}
	return ""
}

// normalizeEmail maps every spelling of one inbox to a single key: lowercase,
// "+tag" removed, and for Gmail the dots too (Gmail ignores them, which spam
// bots exploit to slip past per-address limits).
func normalizeEmail(email string) string {
	email = strings.ToLower(strings.TrimSpace(email))
	at := strings.LastIndex(email, "@")
	if at < 0 {
		return email
	}
	local, domain := email[:at], email[at+1:]
	if i := strings.Index(local, "+"); i >= 0 {
		local = local[:i]
	}
	if domain == "gmail.com" || domain == "googlemail.com" {
		local, domain = strings.ReplaceAll(local, ".", ""), "gmail.com"
	}
	return local + "@" + domain
}

// normalizedEmailSQL is normalizeEmail applied to the email column, so stored
// rows can be compared with a normalised address.
const normalizedEmailSQL = `(CASE
	WHEN lower(split_part(email, '@', 2)) IN ('gmail.com', 'googlemail.com')
		THEN replace(split_part(lower(split_part(email, '@', 1)), '+', 1), '.', '') || '@gmail.com'
	ELSE split_part(lower(split_part(email, '@', 1)), '+', 1) || '@' || lower(split_part(email, '@', 2))
	END)`

// looksLikeGibberish flags messages that are one long unbroken run of
// characters, like the random strings spam bots send. Real messages, even
// short ones, have spaces.
func looksLikeGibberish(message string) bool {
	return len(message) >= 12 && strings.IndexFunc(message, unicode.IsSpace) < 0
}
