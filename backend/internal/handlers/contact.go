package handlers

import (
	"log/slog"
	"net/mail"
	"strings"

	"github.com/gofiber/fiber/v3"
	"github.com/jackymean-del/smart-sched/internal/mailer"
)

// contactAckDailyCap stops auto-replies once this many messages arrive in 24
// hours, keeping a flood of fake submissions from burning the email quota.
const contactAckDailyCap = 50

// SubmitContact accepts a public contact-form submission from the marketing
// site and stores it. Registered WITHOUT auth (see main.go).
func (h *Handler) SubmitContact(c fiber.Ctx) error {
	var body struct {
		Name    string `json:"name"`
		Email   string `json:"email"`
		Message string `json:"message"`
		Source  string `json:"source"`
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
	var sameSender, total int
	err = h.db.QueryRow(c.Context(), `
		SELECT count(*) FILTER (WHERE lower(email) = lower($1)), count(*)
		FROM contact_messages WHERE created_at > NOW() - INTERVAL '24 hours'`,
		email,
	).Scan(&sameSender, &total)
	switch {
	case err != nil:
		slog.Error("contact: acknowledgement check failed", "err", err)
	case sameSender <= 1 && total <= contactAckDailyCap:
		go mailer.SendContactAcknowledgement(name, email, source)
	default:
		slog.Info("contact: acknowledgement skipped (throttled)", "email", email, "sameSender", sameSender, "total", total)
	}
	return c.Status(fiber.StatusCreated).JSON(fiber.Map{"ok": true})
}
