package handlers

import (
	"testing"
	"time"
)

// opt is the option shape mayClaim checks. It comes from the SCHOOL's stored
// timetable now, not from the request body — see orCell.
type opt = orOption

// mayClaim is the entire authorisation decision for a teacher taking an OR
// slot; everything else in DecideOr is plumbing. Without it, handing a school's
// link to its staff would be handing them each other's afternoons.
func TestMayClaim(t *testing.T) {
	options := []opt{
		{Subject: "Physics", Teacher: "R. Rao"},
		{Subject: "Chemistry", Teacher: "S. Devi"},
	}

	cases := []struct {
		name    string
		subject string
		staff   string
		want    bool
	}{
		{"teacher claims their own subject", "Physics", "R. Rao", true},
		{"the other teacher claims theirs", "Chemistry", "S. Devi", true},

		// The case this exists to stop: Rao takes the slot for Chemistry, and
		// Devi arrives to find her period gone.
		{"teacher cannot claim a colleague's subject", "Chemistry", "R. Rao", false},
		{"nor can a teacher outside the group claim anything", "Physics", "T. Iyer", false},

		// A subject nobody offers here is not claimable even by its own teacher.
		{"a subject outside the group is refused", "Biology", "R. Rao", false},

		// No roster name means no way to check, so no claim. Refusing is the
		// safe direction: waving it through would let anyone with an account
		// and no mapping take any slot.
		{"an unmapped account cannot claim", "Physics", "", false},
		{"and whitespace is not a name", "Physics", "   ", false},

		// Names come from a roster and a timetable that people type into
		// separately; case and stray spaces must not decide who teaches.
		{"case differences do not block a real teacher", "physics", "r. rao", true},
		{"nor do surrounding spaces", "  Physics  ", "  R. Rao  ", true},
	}

	for _, c := range cases {
		if got := mayClaim(options, c.subject, c.staff); got != c.want {
			t.Errorf("%s: mayClaim(%q, %q) = %v, want %v", c.name, c.subject, c.staff, got, c.want)
		}
	}
}

func TestMayClaimEmptyOptions(t *testing.T) {
	// A slot with no options is not an OR slot. Nothing to claim.
	if mayClaim(nil, "Physics", "R. Rao") {
		t.Fatal("claimed a slot that offers no options")
	}
	if mayClaim([]opt{}, "Physics", "R. Rao") {
		t.Fatal("claimed a slot with an empty option list")
	}
}

func TestNormEmail(t *testing.T) {
	// Membership is unique per (school, email), so the normalisation is what
	// makes that constraint mean anything.
	for in, want := range map[string]string{
		"  Teacher@School.org ": "teacher@school.org",
		"TEACHER@SCHOOL.ORG":    "teacher@school.org",
		"":                      "",
	} {
		if got := normEmail(in); got != want {
			t.Errorf("normEmail(%q) = %q, want %q", in, got, want)
		}
	}
}

// mayClear is the other half of the authorisation. Guarding only the claim
// leaves a teacher able to drop a colleague's period and let syllabus coverage
// hand it back to them — the same outcome mayClaim refuses, reached sideways.
func TestMayClear(t *testing.T) {
	cases := []struct {
		name      string
		decidedBy string
		staff     string
		want      bool
	}{
		{"a teacher hands back their own claim", "R. Rao", "R. Rao", true},
		{"case and spacing do not lock somebody out of their own slot", "  r. rao ", "R. Rao", true},

		// The hole this closes.
		{"a teacher cannot drop a colleague's claim", "S. Devi", "R. Rao", false},

		// A claim nobody is named on belongs to nobody. An admin still clears
		// it; letting any teacher do so would make every legacy row fair game.
		{"an unattributed claim is not any teacher's to clear", "", "R. Rao", false},
		{"an unmapped account clears nothing", "R. Rao", "", false},
		{"and two blanks do not match each other", "", "", false},
		{"nor do two whitespace names", "   ", "  ", false},
	}
	for _, c := range cases {
		if got := mayClear(c.decidedBy, c.staff); got != c.want {
			t.Errorf("%s: mayClear(%q, %q) = %v, want %v", c.name, c.decidedBy, c.staff, got, c.want)
		}
	}
}

// dayKeyOf has to agree with lib/days.ts DAY_NAMES exactly. If it drifts, the
// server looks up a slot that is not there, orCell returns nothing, and every
// teacher claim is refused with "that period is not a subject choice" — a
// failure that looks like a permissions bug and is really an off-by-one.
func TestDayKeyOf(t *testing.T) {
	// 2026-09-06 is a Sunday, so this walks a full week from index 0.
	base := time.Date(2026, 9, 6, 12, 0, 0, 0, time.UTC)
	want := []string{"SUNDAY", "MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY",
		"FRIDAY", "SATURDAY"}
	for i, w := range want {
		if got := dayKeyOf(base.AddDate(0, 0, i)); got != w {
			t.Errorf("day +%d = %q, want %q", i, got, w)
		}
	}
	// And it wraps rather than running off the end of the array.
	if got := dayKeyOf(base.AddDate(0, 0, 7)); got != "SUNDAY" {
		t.Errorf("day +7 = %q, want SUNDAY", got)
	}
}

// The claim path is only as good as the options it checks. These are the
// options a caller could once have invented; they now come from the school's
// own timetable, so the test names what mayClaim must do with a hostile set.
func TestMayClaimRejectsForgedOptions(t *testing.T) {
	// What a teacher would post to take a colleague's period: an option list
	// asserting they teach Chemistry. Against the SCHOOL's list they do not.
	forged := []opt{{Subject: "Chemistry", Teacher: "R. Rao"}}
	if !mayClaim(forged, "Chemistry", "R. Rao") {
		t.Fatal("the forged list is internally consistent — this is why it must never be the one checked")
	}
	real := []opt{
		{Subject: "Physics", Teacher: "R. Rao"},
		{Subject: "Chemistry", Teacher: "S. Devi"},
	}
	if mayClaim(real, "Chemistry", "R. Rao") {
		t.Error("against the school's own options the same claim is refused")
	}
}
