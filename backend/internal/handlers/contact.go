package handlers

import (
	"log/slog"
	"net/mail"
	"strings"

	"github.com/gofiber/fiber/v3"
)

// SubmitContact accepts a public contact-form submission from the marketing
// site and stores it. Registered WITHOUT auth (see main.go).
func (h *Handler) SubmitContact(c fiber.Ctx) error {
	var body struct {
		Name    string `json:"name"`
		Email   string `json:"email"`
		Message string `json:"message"`
	}
	if err := c.Bind().JSON(&body); err != nil {
		return fiber.NewError(fiber.StatusBadRequest, "invalid body")
	}

	name := strings.TrimSpace(body.Name)
	email := strings.TrimSpace(body.Email)
	message := strings.TrimSpace(body.Message)

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
		name, email, message, "marketing-contact", c.IP(), c.Get("User-Agent"),
	)
	if err != nil {
		slog.Error("contact: insert failed", "err", err)
		return fiber.NewError(fiber.StatusInternalServerError, "could not save your message — please email us directly")
	}

	slog.Info("contact: message received", "email", email)
	return c.Status(fiber.StatusCreated).JSON(fiber.Map{"ok": true})
}
