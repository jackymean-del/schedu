package handlers

import "testing"

// opt mirrors the anonymous option struct DecideOr binds from the request body.
type opt = struct {
	Subject string `json:"subject"`
	Teacher string `json:"teacher"`
}

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
