package handlers

import (
	"context"
	"encoding/json"

	"github.com/gofiber/fiber/v3"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
)

type Handler struct{ db *pgxpool.Pool }

func New(db *pgxpool.Pool) *Handler { return &Handler{db: db} }

// clerkID pulls the authenticated user's Clerk id from the request locals.
// Empty means the auth middleware did not set one (treated as unauthorized).
func clerkID(c fiber.Ctx) string {
	id, _ := c.Locals("user_id").(string)
	return id
}

// rawOrEmpty normalises an optional JSON body field to a valid JSON document
// string so it can be cast to jsonb (empty/null → "{}").
func rawOrEmpty(r json.RawMessage) string {
	if len(r) == 0 || string(r) == "null" {
		return "{}"
	}
	return string(r)
}

// ListTimetables returns the signed-in user's timetables (newest first).
// Only metadata (name + config) is returned — the heavy `data` snapshot is
// fetched per-timetable via GetTimetable when a timetable is opened.
func (h *Handler) ListTimetables(c fiber.Ctx) error {
	uid := clerkID(c)
	if uid == "" {
		return fiber.NewError(fiber.StatusUnauthorized, "no user")
	}
	ctx := context.Background()
	rows, err := h.db.Query(ctx, `
		SELECT t.id::text, t.name, t.config, t.status::text,
		       t.created_at, t.updated_at
		FROM timetables t
		JOIN users u ON u.id = t.user_id
		WHERE u.clerk_id = $1
		ORDER BY t.created_at DESC
	`, uid)
	if err != nil {
		return fiber.NewError(fiber.StatusInternalServerError, "list failed")
	}
	defer rows.Close()

	out := []fiber.Map{}
	for rows.Next() {
		var (
			id, name, status   string
			config             []byte
			createdAt, updated any
		)
		if err := rows.Scan(&id, &name, &config, &status, &createdAt, &updated); err != nil {
			return fiber.NewError(fiber.StatusInternalServerError, "scan failed")
		}
		out = append(out, fiber.Map{
			"id": id, "name": name, "status": status,
			"config":     json.RawMessage(config),
			"created_at": createdAt, "updated_at": updated,
		})
	}
	return c.JSON(fiber.Map{"timetables": out, "total": len(out)})
}

// CreateTimetable inserts a new timetable owned by the signed-in user. The
// user row is ensured first (keyed by clerk_id) so a create can't fail on a
// missing FK even if /me hasn't been called yet.
func (h *Handler) CreateTimetable(c fiber.Ctx) error {
	uid := clerkID(c)
	if uid == "" {
		return fiber.NewError(fiber.StatusUnauthorized, "no user")
	}
	var body struct {
		Name    string          `json:"name"`
		Country string          `json:"country"`
		Config  json.RawMessage `json:"config"`
		Data    json.RawMessage `json:"data"`
	}
	if err := c.Bind().JSON(&body); err != nil {
		return fiber.NewError(fiber.StatusBadRequest, "invalid body")
	}
	if body.Name == "" {
		body.Name = "Untitled timetable"
	}
	if body.Country == "" {
		body.Country = "IN"
	}

	ctx := context.Background()
	var (
		id, status         string
		createdAt          any
	)
	err := h.db.QueryRow(ctx, `
		WITH u AS (
			INSERT INTO users (clerk_id) VALUES ($1)
			ON CONFLICT (clerk_id) DO UPDATE SET updated_at = NOW()
			RETURNING id
		)
		INSERT INTO timetables (user_id, name, org_type, country, config, data)
		SELECT u.id, $2, 'school', $3, $4::jsonb, $5::jsonb FROM u
		RETURNING id::text, status::text, created_at
	`, uid, body.Name, body.Country, rawOrEmpty(body.Config), rawOrEmpty(body.Data)).
		Scan(&id, &status, &createdAt)
	if err != nil {
		return fiber.NewError(fiber.StatusInternalServerError, "create failed")
	}
	return c.Status(fiber.StatusCreated).JSON(fiber.Map{
		"id": id, "name": body.Name, "status": status,
		"config":     rawOrEmpty(body.Config),
		"data":       rawOrEmpty(body.Data),
		"created_at": createdAt,
	})
}

// GetTimetable returns a single timetable (including the full data snapshot),
// but only if it belongs to the signed-in user.
func (h *Handler) GetTimetable(c fiber.Ctx) error {
	uid := clerkID(c)
	if uid == "" {
		return fiber.NewError(fiber.StatusUnauthorized, "no user")
	}
	id, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return fiber.NewError(fiber.StatusNotFound, "not found")
	}
	ctx := context.Background()
	var (
		name, status        string
		config, data        []byte
		createdAt, updated  any
	)
	err = h.db.QueryRow(ctx, `
		SELECT t.name, t.config, t.data, t.status::text, t.created_at, t.updated_at
		FROM timetables t
		JOIN users u ON u.id = t.user_id
		WHERE t.id = $1 AND u.clerk_id = $2
	`, id, uid).Scan(&name, &config, &data, &status, &createdAt, &updated)
	if err != nil {
		return fiber.NewError(fiber.StatusNotFound, "not found")
	}
	return c.JSON(fiber.Map{
		"id": id.String(), "name": name, "status": status,
		"config":     json.RawMessage(config),
		"data":       json.RawMessage(data),
		"created_at": createdAt, "updated_at": updated,
	})
}

// UpdateTimetable patches name/config/data on a timetable the user owns.
// Any field omitted from the body is left unchanged.
func (h *Handler) UpdateTimetable(c fiber.Ctx) error {
	uid := clerkID(c)
	if uid == "" {
		return fiber.NewError(fiber.StatusUnauthorized, "no user")
	}
	id, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return fiber.NewError(fiber.StatusNotFound, "not found")
	}
	var body struct {
		Name   *string         `json:"name"`
		Config json.RawMessage `json:"config"`
		Data   json.RawMessage `json:"data"`
	}
	if err := c.Bind().JSON(&body); err != nil {
		return fiber.NewError(fiber.StatusBadRequest, "invalid body")
	}

	// COALESCE keeps existing values when a field is null/omitted.
	var cfg, data *string
	if len(body.Config) > 0 && string(body.Config) != "null" {
		s := string(body.Config)
		cfg = &s
	}
	if len(body.Data) > 0 && string(body.Data) != "null" {
		s := string(body.Data)
		data = &s
	}

	ctx := context.Background()
	var updatedID string
	err = h.db.QueryRow(ctx, `
		UPDATE timetables t SET
			name       = COALESCE($3, t.name),
			config     = COALESCE($4::jsonb, t.config),
			data       = COALESCE($5::jsonb, t.data),
			updated_at = NOW()
		FROM users u
		WHERE t.user_id = u.id AND t.id = $1 AND u.clerk_id = $2
		RETURNING t.id::text
	`, id, uid, body.Name, cfg, data).Scan(&updatedID)
	if err != nil {
		return fiber.NewError(fiber.StatusNotFound, "not found")
	}
	return c.JSON(fiber.Map{"id": updatedID, "updated": true})
}

// DeleteTimetable removes a timetable the user owns.
func (h *Handler) DeleteTimetable(c fiber.Ctx) error {
	uid := clerkID(c)
	if uid == "" {
		return fiber.NewError(fiber.StatusUnauthorized, "no user")
	}
	id, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return fiber.NewError(fiber.StatusNotFound, "not found")
	}
	ctx := context.Background()
	tag, err := h.db.Exec(ctx, `
		DELETE FROM timetables t
		USING users u
		WHERE t.user_id = u.id AND t.id = $1 AND u.clerk_id = $2
	`, id, uid)
	if err != nil {
		return fiber.NewError(fiber.StatusInternalServerError, "delete failed")
	}
	if tag.RowsAffected() == 0 {
		return fiber.NewError(fiber.StatusNotFound, "not found")
	}
	return c.JSON(fiber.Map{"id": id.String(), "deleted": true})
}

func (h *Handler) GenerateTimetable(c fiber.Ctx) error {
	var req struct {
		OrgType  string `json:"org_type"`
		Country  string `json:"country"`
		Sections []any  `json:"sections"`
		Staff    []any  `json:"staff"`
	}
	if err := c.Bind().JSON(&req); err != nil {
		return fiber.NewError(fiber.StatusBadRequest, "invalid request")
	}
	jobID := uuid.New().String()
	return c.Status(fiber.StatusAccepted).JSON(fiber.Map{
		"job_id": jobID, "status": "queued",
		"estimated_seconds": 5,
		"poll_url": "/api/v1/jobs/" + jobID,
	})
}

func (h *Handler) ExportTimetable(c fiber.Ctx) error {
	format := c.Query("format", "xlsx")
	return c.JSON(fiber.Map{
		"id": c.Params("id"), "format": format,
		"download_url": "/exports/" + c.Params("id") + "." + format,
	})
}

func (h *Handler) Substitute(c fiber.Ctx) error {
	var req struct {
		AbsentStaff string `json:"absent_staff"`
		Day         string `json:"day"`
	}
	c.Bind().JSON(&req)
	return c.JSON(fiber.Map{
		"timetable_id": c.Params("id"),
		"absent": req.AbsentStaff, "day": req.Day,
		"suggestions": []fiber.Map{},
	})
}

func (h *Handler) GetOrgConfig(c fiber.Ctx) error {
	return c.JSON(fiber.Map{
		"org_type": c.Query("org_type", "school"),
		"country":  c.Query("country", "IN"),
		"norms": fiber.Map{"max_periods_week": 36, "max_periods_day": 6, "hours_week": 40},
	})
}
