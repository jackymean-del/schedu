package handlers

import (
	"encoding/json"
	"log/slog"
	"net/mail"
	"strings"

	"github.com/gofiber/fiber/v3"
	"github.com/google/uuid"
)

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

// AccessShare unlocks a restricted share for an allow-listed email. Public.
func (h *Handler) AccessShare(c fiber.Ctx) error {
	token := c.Params("token")
	if token == "" {
		return fiber.NewError(fiber.StatusBadRequest, "missing token")
	}
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
