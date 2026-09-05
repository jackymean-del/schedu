package handlers

import (
	"context"
	"strings"
	"time"

	"github.com/gofiber/fiber/v3"
	"github.com/google/uuid"
)

// Members and OR decisions — the first things in this app that somebody other
// than the account owner may write.
//
// Everything else is local-first: a school's roster and its dated overlays live
// in the admin's browser, and the server holds one snapshot for that account.
// That works while one person edits. It cannot work when a teacher on their own
// phone claims an OR period and the corridor board is expected to notice.
//
// The rule enforced here, and the reason this is server-side at all: a teacher
// may claim an OR slot ONLY for a subject they themselves teach. Anything less
// and a link is an invitation to rewrite somebody else's afternoon.

func normEmail(e string) string { return strings.ToLower(strings.TrimSpace(e)) }

// ownerOfTimetable returns the user_id that owns a timetable.
func (h *Handler) ownerOfTimetable(ctx context.Context, ttID uuid.UUID) (uuid.UUID, error) {
	var owner uuid.UUID
	err := h.db.QueryRow(ctx, `SELECT user_id FROM timetables WHERE id = $1`, ttID).Scan(&owner)
	return owner, err
}

// callerFor resolves the signed-in user against a timetable: are they the owner,
// and if not, what does the school's roster say about them?
//
// Returned staffName is the ROSTER name ("R. Rao"), which is how the timetable
// identifies teachers — logins do not appear in a timetable cell. Without that
// mapping a signed-in user cannot be matched to the lessons that are theirs.
type callerRole struct {
	userID    uuid.UUID
	isOwner   bool
	isMember  bool
	role      string
	staffName string
}

func (h *Handler) callerFor(ctx context.Context, clerkID string, ttID uuid.UUID) (callerRole, error) {
	var out callerRole
	var email string
	err := h.db.QueryRow(ctx,
		`SELECT id, COALESCE(email, '') FROM users WHERE clerk_id = $1`, clerkID).
		Scan(&out.userID, &email)
	if err != nil {
		return out, err
	}

	owner, err := h.ownerOfTimetable(ctx, ttID)
	if err != nil {
		return out, err
	}
	if owner == out.userID {
		out.isOwner, out.isMember, out.role = true, true, "admin"
		return out, nil
	}

	// Matched on user_id once they have signed in, or on email while the
	// invitation is still open — so an invited teacher is recognised the first
	// time they arrive, without an extra claim step.
	var role, staff string
	err = h.db.QueryRow(ctx, `
		SELECT role, COALESCE(staff_name, '')
		FROM school_members
		WHERE owner_id = $1 AND (user_id = $2 OR email = $3)
		LIMIT 1`, owner, out.userID, normEmail(email)).Scan(&role, &staff)
	if err != nil {
		return out, nil // not a member; caller decides what that means
	}
	out.isMember, out.role, out.staffName = true, role, staff

	// Bind the membership to the account on first recognition, so a later email
	// change does not silently orphan them.
	_, _ = h.db.Exec(ctx, `
		UPDATE school_members SET user_id = $1, updated_at = NOW()
		WHERE owner_id = $2 AND email = $3 AND user_id IS NULL`,
		out.userID, owner, normEmail(email))
	return out, nil
}

// ── Members ────────────────────────────────────────────────────────────────

// ListMembers returns the signed-in owner's roster.
func (h *Handler) ListMembers(c fiber.Ctx) error {
	uid := clerkID(c)
	if uid == "" {
		return fiber.NewError(fiber.StatusUnauthorized, "no user")
	}
	ctx := context.Background()
	rows, err := h.db.Query(ctx, `
		SELECT m.id::text, m.email, COALESCE(m.staff_name, ''), m.role,
		       (m.user_id IS NOT NULL) AS joined, m.created_at
		FROM school_members m
		JOIN users u ON u.id = m.owner_id
		WHERE u.clerk_id = $1
		ORDER BY m.created_at`, uid)
	if err != nil {
		return fiber.NewError(fiber.StatusInternalServerError, "list failed")
	}
	defer rows.Close()

	out := []fiber.Map{}
	for rows.Next() {
		var id, email, staff, role string
		var joined bool
		var created any
		if err := rows.Scan(&id, &email, &staff, &role, &joined, &created); err != nil {
			return fiber.NewError(fiber.StatusInternalServerError, "scan failed")
		}
		out = append(out, fiber.Map{
			"id": id, "email": email, "staffName": staff, "role": role,
			"status": map[bool]string{true: "active", false: "invited"}[joined],
			"addedAt": created,
		})
	}
	return c.JSON(fiber.Map{"members": out})
}

// UpsertMember adds or updates one person on the signed-in owner's roster.
func (h *Handler) UpsertMember(c fiber.Ctx) error {
	uid := clerkID(c)
	if uid == "" {
		return fiber.NewError(fiber.StatusUnauthorized, "no user")
	}
	var body struct {
		Email     string `json:"email"`
		StaffName string `json:"staffName"`
		Role      string `json:"role"`
	}
	if err := c.Bind().JSON(&body); err != nil {
		return fiber.NewError(fiber.StatusBadRequest, "invalid body")
	}
	email := normEmail(body.Email)
	if email == "" || !strings.Contains(email, "@") {
		return fiber.NewError(fiber.StatusBadRequest, "a valid email is required")
	}
	role := strings.ToLower(strings.TrimSpace(body.Role))
	switch role {
	case "admin", "teacher", "viewer":
	case "":
		role = "teacher"
	default:
		return fiber.NewError(fiber.StatusBadRequest, "role must be admin, teacher or viewer")
	}

	ctx := context.Background()
	var id string
	err := h.db.QueryRow(ctx, `
		WITH o AS (SELECT id FROM users WHERE clerk_id = $1)
		INSERT INTO school_members (owner_id, email, staff_name, role)
		SELECT o.id, $2, NULLIF($3, ''), $4 FROM o
		ON CONFLICT (owner_id, email) DO UPDATE
		  SET staff_name = EXCLUDED.staff_name, role = EXCLUDED.role, updated_at = NOW()
		RETURNING id::text`, uid, email, strings.TrimSpace(body.StaffName), role).Scan(&id)
	if err != nil {
		return fiber.NewError(fiber.StatusInternalServerError, "could not save member")
	}
	return c.JSON(fiber.Map{"id": id, "email": email, "role": role})
}

// RemoveMember drops somebody from the signed-in owner's roster.
func (h *Handler) RemoveMember(c fiber.Ctx) error {
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
		DELETE FROM school_members m
		USING users u
		WHERE m.owner_id = u.id AND u.clerk_id = $1 AND m.id = $2`, uid, id)
	if err != nil {
		return fiber.NewError(fiber.StatusInternalServerError, "delete failed")
	}
	if tag.RowsAffected() == 0 {
		return fiber.NewError(fiber.StatusNotFound, "not found")
	}
	return c.JSON(fiber.Map{"id": id.String(), "deleted": true})
}

// MySchedules lists the timetables a signed-in teacher may see: their own, plus
// any belonging to a school that has them on its roster.
func (h *Handler) MySchedules(c fiber.Ctx) error {
	uid := clerkID(c)
	if uid == "" {
		return fiber.NewError(fiber.StatusUnauthorized, "no user")
	}
	ctx := context.Background()
	rows, err := h.db.Query(ctx, `
		SELECT t.id::text, t.name, t.status::text,
		       (t.user_id = me.id) AS mine,
		       COALESCE(m.role, 'admin') AS role,
		       COALESCE(m.staff_name, '') AS staff_name
		FROM users me
		JOIN timetables t ON TRUE
		LEFT JOIN school_members m
		       ON m.owner_id = t.user_id
		      AND (m.user_id = me.id OR m.email = COALESCE(me.email, ''))
		WHERE me.clerk_id = $1
		  AND (t.user_id = me.id OR m.id IS NOT NULL)
		ORDER BY t.created_at DESC`, uid)
	if err != nil {
		return fiber.NewError(fiber.StatusInternalServerError, "list failed")
	}
	defer rows.Close()

	out := []fiber.Map{}
	for rows.Next() {
		var id, name, status, role, staff string
		var mine bool
		if err := rows.Scan(&id, &name, &status, &mine, &role, &staff); err != nil {
			return fiber.NewError(fiber.StatusInternalServerError, "scan failed")
		}
		out = append(out, fiber.Map{
			"id": id, "name": name, "status": status,
			"mine": mine, "role": role, "staffName": staff,
		})
	}
	return c.JSON(fiber.Map{"schedules": out})
}

// ── OR decisions ───────────────────────────────────────────────────────────

// ListOrDecisions returns the decisions recorded for one timetable, optionally
// narrowed to a date range.
func (h *Handler) ListOrDecisions(c fiber.Ctx) error {
	uid := clerkID(c)
	if uid == "" {
		return fiber.NewError(fiber.StatusUnauthorized, "no user")
	}
	ttID, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return fiber.NewError(fiber.StatusNotFound, "not found")
	}
	ctx := context.Background()
	caller, err := h.callerFor(ctx, uid, ttID)
	if err != nil || !caller.isMember {
		// Same answer for "no such timetable" and "not yours": a stranger
		// should not be able to tell one from the other.
		return fiber.NewError(fiber.StatusNotFound, "not found")
	}

	from := c.Query("from", "")
	to := c.Query("to", "")
	rows, err := h.db.Query(ctx, `
		SELECT section, to_char(on_date, 'YYYY-MM-DD'), period_id, subject,
		       COALESCE(decided_by, ''), decided_at
		FROM or_decisions
		WHERE timetable_id = $1
		  AND ($2 = '' OR on_date >= $2::date)
		  AND ($3 = '' OR on_date <= $3::date)
		ORDER BY on_date, period_id`, ttID, from, to)
	if err != nil {
		return fiber.NewError(fiber.StatusInternalServerError, "list failed")
	}
	defer rows.Close()

	out := []fiber.Map{}
	for rows.Next() {
		var section, date, periodID, subject, by string
		var at any
		if err := rows.Scan(&section, &date, &periodID, &subject, &by, &at); err != nil {
			return fiber.NewError(fiber.StatusInternalServerError, "scan failed")
		}
		out = append(out, fiber.Map{
			"key":     section + "|" + date + "|" + periodID,
			"section": section, "date": date, "periodId": periodID,
			"subject": subject, "by": by, "at": at,
		})
	}
	return c.JSON(fiber.Map{"decisions": out})
}

// DecideOr records (or clears) which subject an OR period runs on one date.
//
// AUTHORISATION IS THE POINT OF THIS ENDPOINT. An admin may set any slot. A
// teacher may claim a slot ONLY for a subject they themselves teach — the
// caller sends the options as the timetable holds them, and the server checks
// that the caller's roster name is against the subject being claimed. Without
// that check a school's link would be an invitation to rewrite somebody else's
// afternoon.
func (h *Handler) DecideOr(c fiber.Ctx) error {
	uid := clerkID(c)
	if uid == "" {
		return fiber.NewError(fiber.StatusUnauthorized, "no user")
	}
	ttID, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return fiber.NewError(fiber.StatusNotFound, "not found")
	}
	var body struct {
		Section  string `json:"section"`
		Date     string `json:"date"`     // YYYY-MM-DD
		PeriodID string `json:"periodId"`
		Subject  string `json:"subject"` // empty clears the decision
		Options  []struct {
			Subject string `json:"subject"`
			Teacher string `json:"teacher"`
		} `json:"options"`
	}
	if err := c.Bind().JSON(&body); err != nil {
		return fiber.NewError(fiber.StatusBadRequest, "invalid body")
	}
	if strings.TrimSpace(body.Section) == "" || strings.TrimSpace(body.PeriodID) == "" {
		return fiber.NewError(fiber.StatusBadRequest, "section and periodId are required")
	}
	if _, err := time.Parse("2006-01-02", body.Date); err != nil {
		return fiber.NewError(fiber.StatusBadRequest, "date must be YYYY-MM-DD")
	}

	ctx := context.Background()
	caller, err := h.callerFor(ctx, uid, ttID)
	if err != nil || !caller.isMember {
		return fiber.NewError(fiber.StatusNotFound, "not found")
	}
	if caller.role == "viewer" {
		return fiber.NewError(fiber.StatusForbidden, "viewers cannot change the timetable")
	}

	subject := strings.TrimSpace(body.Subject)

	// Clearing hands the slot back to syllabus coverage.
	if subject == "" {
		if _, err := h.db.Exec(ctx, `
			DELETE FROM or_decisions
			WHERE timetable_id = $1 AND section = $2 AND on_date = $3::date AND period_id = $4`,
			ttID, body.Section, body.Date, body.PeriodID); err != nil {
			return fiber.NewError(fiber.StatusInternalServerError, "could not clear")
		}
		return c.JSON(fiber.Map{"cleared": true})
	}

	if !caller.isOwner && caller.role != "admin" {
		if !mayClaim(body.Options, subject, caller.staffName) {
			return fiber.NewError(fiber.StatusForbidden,
				"you can only take a slot for a subject you teach")
		}
	}

	if _, err := h.db.Exec(ctx, `
		INSERT INTO or_decisions (timetable_id, section, on_date, period_id, subject, decided_by)
		VALUES ($1, $2, $3::date, $4, $5, NULLIF($6, ''))
		ON CONFLICT (timetable_id, section, on_date, period_id) DO UPDATE
		  SET subject = EXCLUDED.subject, decided_by = EXCLUDED.decided_by, decided_at = NOW()`,
		ttID, body.Section, body.Date, body.PeriodID, subject, caller.staffName); err != nil {
		return fiber.NewError(fiber.StatusInternalServerError, "could not record the decision")
	}
	return c.JSON(fiber.Map{
		"section": body.Section, "date": body.Date, "periodId": body.PeriodID,
		"subject": subject, "by": caller.staffName,
	})
}

// mayClaim reports whether `staffName` teaches `subject` among the OR options.
//
// Split out and named so it can be tested without a database, because it is the
// whole authorisation decision: everything else in DecideOr is plumbing.
func mayClaim(options []struct {
	Subject string `json:"subject"`
	Teacher string `json:"teacher"`
}, subject, staffName string) bool {
	who := strings.TrimSpace(staffName)
	if who == "" {
		// Nobody on the roster maps to a timetable name, so no claim can be
		// checked. Refuse rather than wave it through.
		return false
	}
	want := strings.TrimSpace(subject)
	for _, o := range options {
		if strings.EqualFold(strings.TrimSpace(o.Subject), want) &&
			strings.EqualFold(strings.TrimSpace(o.Teacher), who) {
			return true
		}
	}
	return false
}
