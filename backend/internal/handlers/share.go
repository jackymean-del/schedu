package handlers

import (
	"crypto/rand"
	"encoding/json"
	"fmt"
	"log/slog"
	"math/big"
	"net/mail"
	"strings"

	"github.com/gofiber/fiber/v3"
	"github.com/google/uuid"
	"github.com/jackymean-del/smart-sched/internal/mailer"
)

// gen6 returns a zero-padded, cryptographically-random 6-digit code.
func gen6() string {
	n, err := rand.Int(rand.Reader, big.NewInt(1_000_000))
	if err != nil {
		return "000000"
	}
	return fmt.Sprintf("%06d", n.Int64())
}

// normalizeEmails trims, lower-cases, validates and de-duplicates a list.
func normalizeEmails(in []string) []string {
	seen := map[string]bool{}
	out := make([]string, 0, len(in))
	for _, e := range in {
		e = strings.ToLower(strings.TrimSpace(e))
		if e == "" || seen[e] {
			continue
		}
		if _, err := mail.ParseAddress(e); err != nil {
			continue
		}
		seen[e] = true
		out = append(out, e)
	}
	return out
}

func contains(list []string, v string) bool {
	for _, x := range list {
		if x == v {
			return true
		}
	}
	return false
}

// CreateShare stores a self-contained timetable snapshot and returns a public
// token. Registered under the authenticated API group. The share is either
// 'public' (anyone with the link) or 'restricted' (allow-listed emails).
func (h *Handler) CreateShare(c fiber.Ctx) error {
	var body struct {
		Title      string          `json:"title"`
		Payload    json.RawMessage `json:"payload"`
		Visibility string          `json:"visibility"` // "public" | "restricted"
		Emails     []string        `json:"emails"`
	}
	if err := c.Bind().JSON(&body); err != nil {
		return fiber.NewError(fiber.StatusBadRequest, "invalid body")
	}

	title := strings.TrimSpace(body.Title)
	if title == "" {
		title = "Timetable"
	}
	if len(body.Payload) == 0 || len(body.Payload) > 2_000_000 {
		return fiber.NewError(fiber.StatusBadRequest, "payload missing or too large")
	}

	visibility := "public"
	emails := []string{}
	if body.Visibility == "restricted" {
		visibility = "restricted"
		emails = normalizeEmails(body.Emails)
		if len(emails) == 0 {
			return fiber.NewError(fiber.StatusBadRequest, "add at least one valid email to restrict access")
		}
	}

	token := strings.ReplaceAll(uuid.NewString(), "-", "")

	var createdBy any
	if uid, ok := c.Locals("user_id").(string); ok && uid != "" {
		createdBy = uid
	}

	_, err := h.db.Exec(c.Context(), `
		INSERT INTO shared_timetables (token, title, payload, visibility, allowed_emails, created_by)
		VALUES ($1, $2, $3, $4, $5, $6)`,
		token, title, string(body.Payload), visibility, emails, createdBy,
	)
	if err != nil {
		slog.Error("share: insert failed", "err", err)
		return fiber.NewError(fiber.StatusInternalServerError, "could not create share link")
	}

	return c.Status(fiber.StatusCreated).JSON(fiber.Map{"token": token, "visibility": visibility})
}

// shareRow loads a share by token.
func (h *Handler) shareRow(c fiber.Ctx, token string) (title, visibility string, payload []byte, allowed []string, err error) {
	err = h.db.QueryRow(c.Context(), `
		SELECT title, visibility, payload, allowed_emails FROM shared_timetables
		WHERE token = $1 AND (expires_at IS NULL OR expires_at > NOW())`,
		token,
	).Scan(&title, &visibility, &payload, &allowed)
	return
}

func (h *Handler) bumpViews(c fiber.Ctx, token string) {
	_, _ = h.db.Exec(c.Context(), `UPDATE shared_timetables SET views = views + 1 WHERE token = $1`, token)
}

// GetShare returns a shared timetable by token. Public — no auth.
// For restricted shares it returns only {restricted:true, title} (no payload);
// the viewer must then call AccessShare with an allow-listed email.
func (h *Handler) GetShare(c fiber.Ctx) error {
	token := c.Params("token")
	if token == "" {
		return fiber.NewError(fiber.StatusBadRequest, "missing token")
	}

	title, visibility, payload, _, err := h.shareRow(c, token)
	if err != nil {
		return fiber.NewError(fiber.StatusNotFound, "this share link is invalid or has expired")
	}

	if visibility == "restricted" {
		return c.JSON(fiber.Map{"restricted": true, "title": title})
	}

	h.bumpViews(c, token)
	return c.JSON(fiber.Map{"title": title, "timetable": json.RawMessage(payload)})
}

// REMOVED: AccessShare (POST /api/share/:token/access).
//
// It returned a RESTRICTED share's full payload to anyone who posted an
// allow-listed email — no code, no proof of owning it. A school publishes its
// staff addresses on its own website, so "knows an allowed email" is not a
// secret; the endpoint reduced a restricted share to a public one for anyone
// holding the link. The request-code → verify pair right below exists to prove
// the caller controls that mailbox, and this endpoint let a caller skip it.
//
// Nothing called it: the viewer page has always used request-code/verify. It
// was pure attack surface, so it is gone rather than patched — there is no
// behaviour left for it to provide that GetShare (public) or VerifyShareCode
// (restricted) doesn't already cover correctly.

// maxCodeAttempts caps guesses against one issued code. A 6-digit code inside a
// 10-minute window is only ~10^6 wide, which is minutes of work for a script;
// the window alone is not the defence, the attempt count is.
const maxCodeAttempts = 5

// codeAttempt is one live code row after its guess has been counted.
type codeAttempt struct {
	attempts int  // including the guess being judged
	matched  bool // did the submitted code equal this row's code
}

type codeVerdict int

const (
	codeInvalid   codeVerdict = iota // no live code, or a wrong guess with budget left
	codeAccepted                     // right code, within budget
	codeExhausted                    // out of guesses — a new code is required
)

// judgeCode decides a verification from the counted attempts. Pure, so the rule
// can be tested without a database.
//
// A correct code past the budget still loses: otherwise an attacker who burns
// the budget guessing only has to guess once more to win, and the cap buys
// nothing. Exhaustion is only reported when nothing matched, so someone typing
// the right code on their last try is let through rather than locked out.
// Decided from the whole set, never row by row: with the rows in a different
// order a running verdict would answer differently for the same codes.
func judgeCode(rows []codeAttempt, max int) codeVerdict {
	usable := false
	for _, r := range rows {
		if r.attempts > max {
			continue
		}
		if r.matched {
			return codeAccepted
		}
		usable = true // in budget and wrong: a plain wrong guess, still retryable
	}
	if len(rows) > 0 && !usable {
		return codeExhausted
	}
	return codeInvalid
}

// RequestShareCode emails a one-time code to an allow-listed email so the
// viewer can prove ownership before seeing a restricted share. Public.
func (h *Handler) RequestShareCode(c fiber.Ctx) error {
	token := c.Params("token")
	var body struct {
		Email string `json:"email"`
	}
	if err := c.Bind().JSON(&body); err != nil {
		return fiber.NewError(fiber.StatusBadRequest, "invalid body")
	}
	email := strings.ToLower(strings.TrimSpace(body.Email))
	if email == "" {
		return fiber.NewError(fiber.StatusBadRequest, "email is required")
	}

	_, visibility, _, allowed, err := h.shareRow(c, token)
	if err != nil {
		return fiber.NewError(fiber.StatusNotFound, "this share link is invalid or has expired")
	}
	if visibility != "restricted" {
		return c.JSON(fiber.Map{"sent": false, "public": true})
	}
	if !contains(allowed, email) {
		return fiber.NewError(fiber.StatusForbidden, "this email doesn’t have access to this timetable")
	}

	// Supersede any code already outstanding for this mailbox. Letting them
	// accumulate makes guessing EASIER, not harder — each live code is another
	// value a blind guess can land on, and each carries its own attempt budget.
	_, _ = h.db.Exec(c.Context(), `DELETE FROM share_access_codes WHERE token = $1 AND email = $2`, token, email)

	code := gen6()
	if _, err := h.db.Exec(c.Context(), `
		INSERT INTO share_access_codes (token, email, code, expires_at)
		VALUES ($1, $2, $3, NOW() + INTERVAL '10 minutes')`,
		token, email, code,
	); err != nil {
		slog.Error("share: code insert failed", "err", err)
		return fiber.NewError(fiber.StatusInternalServerError, "could not send a code, please try again")
	}

	mailer.SendShareCode(email, code)
	return c.JSON(fiber.Map{"sent": true})
}

// VerifyShareCode checks a one-time code and, if valid, returns the timetable.
func (h *Handler) VerifyShareCode(c fiber.Ctx) error {
	token := c.Params("token")
	var body struct {
		Email string `json:"email"`
		Code  string `json:"code"`
	}
	if err := c.Bind().JSON(&body); err != nil {
		return fiber.NewError(fiber.StatusBadRequest, "invalid body")
	}
	email := strings.ToLower(strings.TrimSpace(body.Email))
	code := strings.TrimSpace(body.Code)
	if email == "" || code == "" {
		return fiber.NewError(fiber.StatusBadRequest, "email and code are required")
	}

	// Charge the attempt BEFORE judging the code, in the same statement that
	// reads it. A guess that is abandoned mid-flight, or that races other
	// guesses, still costs its budget — otherwise the cap is advisory.
	rows, err := h.db.Query(c.Context(), `
		UPDATE share_access_codes
		   SET attempts = attempts + 1
		 WHERE token = $1 AND email = $2 AND expires_at > NOW()
		RETURNING attempts, (code = $3)`,
		token, email, code,
	)
	if err != nil {
		slog.Error("share: verify failed", "err", err)
		return fiber.NewError(fiber.StatusInternalServerError, "could not check that code, please try again")
	}
	var live []codeAttempt
	for rows.Next() {
		var a codeAttempt
		if err := rows.Scan(&a.attempts, &a.matched); err != nil {
			rows.Close()
			return fiber.NewError(fiber.StatusInternalServerError, "could not check that code, please try again")
		}
		live = append(live, a)
	}
	rows.Close()

	switch judgeCode(live, maxCodeAttempts) {
	case codeExhausted:
		// Burn the code outright: the only way forward is a fresh one, which
		// re-proves control of the mailbox and resets the budget.
		_, _ = h.db.Exec(c.Context(), `DELETE FROM share_access_codes WHERE token = $1 AND email = $2`, token, email)
		return fiber.NewError(fiber.StatusTooManyRequests, "too many incorrect codes — request a new one")
	case codeInvalid:
		return fiber.NewError(fiber.StatusBadRequest, "that code is invalid or has expired")
	}

	// One-time use — consume all codes for this token+email.
	_, _ = h.db.Exec(c.Context(), `DELETE FROM share_access_codes WHERE token = $1 AND email = $2`, token, email)

	title, visibility, payload, allowed, err := h.shareRow(c, token)
	if err != nil {
		return fiber.NewError(fiber.StatusNotFound, "this share link is invalid or has expired")
	}
	if visibility == "restricted" && !contains(allowed, email) {
		return fiber.NewError(fiber.StatusForbidden, "this email doesn’t have access to this timetable")
	}

	h.bumpViews(c, token)
	return c.JSON(fiber.Map{"title": title, "timetable": json.RawMessage(payload)})
}
