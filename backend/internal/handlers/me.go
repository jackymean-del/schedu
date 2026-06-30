package handlers

import (
	"context"

	"github.com/gofiber/fiber/v3"
)

// Me upserts the signed-in user (keyed by Clerk id from the auth middleware)
// and returns the canonical DB record. The frontend calls this right after
// sign-in so a users row always exists and the DB stays authoritative for plan.
func (h *Handler) Me(c fiber.Ctx) error {
	clerkID, _ := c.Locals("user_id").(string)
	if clerkID == "" {
		return fiber.NewError(fiber.StatusUnauthorized, "no user")
	}

	var body struct {
		Email      string `json:"email"`
		Name       string `json:"name"`
		SchoolName string `json:"schoolName"`
	}
	_ = c.Bind().JSON(&body) // body is optional

	ctx := context.Background()
	var (
		id, email, name, plan string
	)
	err := h.db.QueryRow(ctx, `
		INSERT INTO users (clerk_id, email, name)
		VALUES ($1, $2, $3)
		ON CONFLICT (clerk_id) DO UPDATE SET
			email      = COALESCE(NULLIF(EXCLUDED.email, ''), users.email),
			name       = COALESCE(NULLIF(EXCLUDED.name,  ''), users.name),
			updated_at = NOW()
		RETURNING id::text, COALESCE(email, ''), COALESCE(name, ''), COALESCE(plan, 'free')
	`, clerkID, body.Email, body.Name).Scan(&id, &email, &name, &plan)
	if err != nil {
		return fiber.NewError(fiber.StatusInternalServerError, "user upsert failed")
	}

	return c.JSON(fiber.Map{"id": id, "email": email, "name": name, "plan": plan})
}
