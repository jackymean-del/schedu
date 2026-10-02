package handlers

import (
	"context"
	"errors"
	"strings"
	"time"

	"github.com/gofiber/fiber/v3"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
)

// Unavailability - who is away, when and why.
//
// It used to live only in the planner's browser, which made it a note to
// self: a teacher waking up ill had no way to say so except by phoning
// somebody, and the corridor board and every other administrator saw nothing
// until that one browser was opened. It is the second thing in this app that
// somebody other than the account owner may write, after OR decisions, and it
// follows the same rule: the server decides who may write what.
//
//   - an administrator (or the owner) may record anyone as unavailable;
//   - a teacher may record ONLY themselves, by the roster name that matches
//     them to the timetable;
//   - a teacher may withdraw only what they reported themselves - an absence
//     the school recorded for them is the school's to change;
//   - viewers write nothing.
//
// An absence belongs to a person at a school, not to one timetable, so rows
// are keyed by the school's owner and apply to every schedule it runs.

const maxReasonLen = 80
const maxNoteLen = 500
const maxSpanDays = 366

type unavailabilityBody struct {
	StaffName string `json:"staffName"`
	Date      string `json:"date"`    // YYYY-MM-DD
	EndDate   string `json:"endDate"` // YYYY-MM-DD, several days only
	Duration  string `json:"duration"`
	Part      string `json:"part"`    // first | second, half days only
	FromMin   *int   `json:"fromMin"` // specific hours only
	ToMin     *int   `json:"toMin"`
	Reason    string `json:"reason"`
	Note      string `json:"note"`
}

// mayReport decides whether the caller may record `staffName` as unavailable.
// Split out so the whole authorisation decision is testable without a database.
func mayReport(c callerRole, staffName string) bool {
	who := strings.TrimSpace(staffName)
	if who == "" {
		return false
	}
	if c.isOwner || c.role == "admin" {
		return true
	}
	if c.role != "teacher" {
		return false
	}
	// No roster name means nothing to match against; refuse rather than let an
	// unmapped account report anybody at all.
	me := strings.TrimSpace(c.staffName)
	return me != "" && strings.EqualFold(me, who)
}

// mayWithdraw decides whether the caller may remove a recorded absence.
func mayWithdraw(c callerRole, rowStaff, rowSource string) bool {
	if c.isOwner || c.role == "admin" {
		return true
	}
	if c.role != "teacher" {
		return false
	}
	me := strings.TrimSpace(c.staffName)
	return me != "" && strings.EqualFold(me, strings.TrimSpace(rowStaff)) && rowSource == "self"
}

// validateUnavailability normalises a request body, or says what is wrong
// with it. Pure, so the rules are tested where they are written.
func validateUnavailability(b unavailabilityBody) (unavailabilityBody, string) {
	b.StaffName = strings.TrimSpace(b.StaffName)
	b.Reason = strings.TrimSpace(b.Reason)
	b.Note = strings.TrimSpace(b.Note)
	if b.StaffName == "" {
		return b, "staffName is required"
	}
	if b.Reason == "" {
		return b, "a reason is required"
	}
	if len(b.Reason) > maxReasonLen {
		return b, "reason is too long"
	}
	if len(b.Note) > maxNoteLen {
		return b, "note is too long"
	}
	start, err := time.Parse("2006-01-02", b.Date)
	if err != nil {
		return b, "date must be YYYY-MM-DD"
	}
	switch b.Duration {
	case "full":
		b.EndDate, b.Part, b.FromMin, b.ToMin = b.Date, "", nil, nil
	case "half":
		if b.Part != "first" && b.Part != "second" {
			return b, "a half day must say which half"
		}
		b.EndDate, b.FromMin, b.ToMin = b.Date, nil, nil
	case "long":
		end, err := time.Parse("2006-01-02", b.EndDate)
		if err != nil {
			return b, "endDate must be YYYY-MM-DD"
		}
		if end.Before(start) {
			return b, "endDate is before date"
		}
		if end.Sub(start) > maxSpanDays*24*time.Hour {
			return b, "that is longer than a year"
		}
		b.Part, b.FromMin, b.ToMin = "", nil, nil
	case "hours":
		if b.FromMin == nil || b.ToMin == nil || *b.FromMin < 0 || *b.ToMin > 24*60 || *b.FromMin >= *b.ToMin {
			return b, "give a from and to time on the same day"
		}
		b.EndDate, b.Part = b.Date, ""
	default:
		return b, "duration must be full, half, long or hours"
	}
	return b, ""
}

// ListUnavailability returns absences overlapping a date window for the
// school that owns this timetable. Reasons are personal: a teacher sees their
// own reasons, and only "Unavailable" for colleagues.
func (h *Handler) ListUnavailability(c fiber.Ctx) error {
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
		return fiber.NewError(fiber.StatusNotFound, "not found")
	}
	owner, err := h.ownerOfTimetable(ctx, ttID)
	if err != nil {
		return fiber.NewError(fiber.StatusNotFound, "not found")
	}

	from := c.Query("from", "")
	to := c.Query("to", "")
	rows, err := h.db.Query(ctx, `
		SELECT id, staff_name, to_char(start_date, 'YYYY-MM-DD'), to_char(end_date, 'YYYY-MM-DD'),
		       duration, COALESCE(part, ''), from_min, to_min, reason, COALESCE(note, ''),
		       COALESCE(reported_by, ''), source
		FROM unavailability
		WHERE owner_id = $1
		  AND ($2 = '' OR end_date >= $2::date)
		  AND ($3 = '' OR start_date <= $3::date)
		ORDER BY start_date, staff_name`, owner, from, to)
	if err != nil {
		return fiber.NewError(fiber.StatusInternalServerError, "list failed")
	}
	defer rows.Close()

	admin := caller.isOwner || caller.role == "admin"
	out := []fiber.Map{}
	for rows.Next() {
		var id uuid.UUID
		var staff, start, end, duration, part, reason, note, by, source string
		var fromMin, toMin *int
		if err := rows.Scan(&id, &staff, &start, &end, &duration, &part, &fromMin, &toMin, &reason, &note, &by, &source); err != nil {
			return fiber.NewError(fiber.StatusInternalServerError, "scan failed")
		}
		mine := strings.EqualFold(strings.TrimSpace(caller.staffName), strings.TrimSpace(staff))
		if !admin && !mine {
			reason, note, by = "Unavailable", "", ""
		}
		out = append(out, fiber.Map{
			"id": id.String(), "staffName": staff, "date": start, "endDate": end,
			"duration": duration, "part": part, "fromMin": fromMin, "toMin": toMin,
			"reason": reason, "note": note, "reportedBy": by, "source": source,
		})
	}
	return c.JSON(fiber.Map{"unavailability": out})
}

// ReportUnavailability records somebody as unavailable. See the rules above.
func (h *Handler) ReportUnavailability(c fiber.Ctx) error {
	uid := clerkID(c)
	if uid == "" {
		return fiber.NewError(fiber.StatusUnauthorized, "no user")
	}
	ttID, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return fiber.NewError(fiber.StatusNotFound, "not found")
	}
	var body unavailabilityBody
	if err := c.Bind().JSON(&body); err != nil {
		return fiber.NewError(fiber.StatusBadRequest, "invalid body")
	}
	body, problem := validateUnavailability(body)
	if problem != "" {
		return fiber.NewError(fiber.StatusBadRequest, problem)
	}

	ctx := context.Background()
	caller, err := h.callerFor(ctx, uid, ttID)
	if err != nil || !caller.isMember {
		return fiber.NewError(fiber.StatusNotFound, "not found")
	}
	if !mayReport(caller, body.StaffName) {
		return fiber.NewError(fiber.StatusForbidden, "you can only report yourself as unavailable")
	}
	owner, err := h.ownerOfTimetable(ctx, ttID)
	if err != nil {
		return fiber.NewError(fiber.StatusNotFound, "not found")
	}
	source := "admin"
	if !caller.isOwner && caller.role != "admin" {
		source = "self"
	}
	reporter := caller.staffName
	if reporter == "" {
		reporter = "administrator"
	}

	var id uuid.UUID
	err = h.db.QueryRow(ctx, `
		INSERT INTO unavailability
		  (owner_id, staff_name, start_date, end_date, duration, part, from_min, to_min, reason, note, reported_by, source)
		VALUES ($1, $2, $3::date, $4::date, $5, NULLIF($6, ''), $7, $8, $9, NULLIF($10, ''), $11, $12)
		RETURNING id`,
		owner, body.StaffName, body.Date, body.EndDate, body.Duration, body.Part,
		body.FromMin, body.ToMin, body.Reason, body.Note, reporter, source).Scan(&id)
	if err != nil {
		return fiber.NewError(fiber.StatusInternalServerError, "could not record it")
	}
	return c.JSON(fiber.Map{"id": id.String(), "source": source})
}

// WithdrawUnavailability removes a recorded absence.
func (h *Handler) WithdrawUnavailability(c fiber.Ctx) error {
	uid := clerkID(c)
	if uid == "" {
		return fiber.NewError(fiber.StatusUnauthorized, "no user")
	}
	ttID, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return fiber.NewError(fiber.StatusNotFound, "not found")
	}
	rowID, err := uuid.Parse(c.Params("uid"))
	if err != nil {
		return fiber.NewError(fiber.StatusNotFound, "not found")
	}
	ctx := context.Background()
	caller, err := h.callerFor(ctx, uid, ttID)
	if err != nil || !caller.isMember {
		return fiber.NewError(fiber.StatusNotFound, "not found")
	}
	owner, err := h.ownerOfTimetable(ctx, ttID)
	if err != nil {
		return fiber.NewError(fiber.StatusNotFound, "not found")
	}
	var staff, source string
	err = h.db.QueryRow(ctx,
		`SELECT staff_name, source FROM unavailability WHERE id = $1 AND owner_id = $2`,
		rowID, owner).Scan(&staff, &source)
	if errors.Is(err, pgx.ErrNoRows) {
		return fiber.NewError(fiber.StatusNotFound, "not found")
	}
	if err != nil {
		return fiber.NewError(fiber.StatusInternalServerError, "could not read it")
	}
	if !mayWithdraw(caller, staff, source) {
		return fiber.NewError(fiber.StatusForbidden, "only the school can change an absence it recorded")
	}
	if _, err := h.db.Exec(ctx, `DELETE FROM unavailability WHERE id = $1 AND owner_id = $2`, rowID, owner); err != nil {
		return fiber.NewError(fiber.StatusInternalServerError, "could not remove it")
	}
	return c.JSON(fiber.Map{"removed": true})
}
