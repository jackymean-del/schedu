package handlers

import "testing"

// mayReport is the whole authorisation decision for recording somebody as
// unavailable. Without it, a school's link would let any teacher mark any
// colleague absent - and with automatic cover on, hand that colleague's
// lessons to somebody else.
func TestMayReport(t *testing.T) {
	owner := callerRole{isOwner: true, isMember: true, role: "admin"}
	admin := callerRole{isMember: true, role: "admin"}
	rao := callerRole{isMember: true, role: "teacher", staffName: "R. Rao"}
	unmapped := callerRole{isMember: true, role: "teacher", staffName: ""}
	viewer := callerRole{isMember: true, role: "viewer", staffName: "R. Rao"}

	cases := []struct {
		name   string
		caller callerRole
		staff  string
		want   bool
	}{
		{"the owner may record anyone", owner, "S. Devi", true},
		{"an administrator may record anyone", admin, "S. Devi", true},
		{"a teacher may record themselves", rao, "R. Rao", true},
		{"matching ignores case and spacing", rao, "  r. rao ", true},
		{"a teacher may not record a colleague", rao, "S. Devi", false},
		{"an unmapped teacher may record nobody", unmapped, "R. Rao", false},
		{"a viewer may record nobody, even themselves", viewer, "R. Rao", false},
		{"nobody may record a blank name", owner, "  ", false},
	}
	for _, tc := range cases {
		if got := mayReport(tc.caller, tc.staff); got != tc.want {
			t.Errorf("%s: mayReport = %v, want %v", tc.name, got, tc.want)
		}
	}
}

// A teacher withdraws only what they reported. An absence the school recorded
// for them - say, a suspension of duties - is the school's to change.
func TestMayWithdraw(t *testing.T) {
	admin := callerRole{isMember: true, role: "admin"}
	rao := callerRole{isMember: true, role: "teacher", staffName: "R. Rao"}
	viewer := callerRole{isMember: true, role: "viewer"}

	cases := []struct {
		name   string
		caller callerRole
		staff  string
		source string
		want   bool
	}{
		{"an administrator may withdraw anything", admin, "R. Rao", "self", true},
		{"an administrator may withdraw what the school recorded", admin, "R. Rao", "admin", true},
		{"a teacher may withdraw their own report", rao, "R. Rao", "self", true},
		{"a teacher may not withdraw what the school recorded for them", rao, "R. Rao", "admin", false},
		{"a teacher may not withdraw a colleague's", rao, "S. Devi", "self", false},
		{"a viewer may withdraw nothing", viewer, "R. Rao", "self", false},
	}
	for _, tc := range cases {
		if got := mayWithdraw(tc.caller, tc.staff, tc.source); got != tc.want {
			t.Errorf("%s: mayWithdraw = %v, want %v", tc.name, got, tc.want)
		}
	}
}

func TestValidateUnavailability(t *testing.T) {
	i := func(n int) *int { return &n }
	ok := func(b unavailabilityBody) unavailabilityBody {
		t.Helper()
		out, problem := validateUnavailability(b)
		if problem != "" {
			t.Fatalf("expected %+v to pass, got %q", b, problem)
		}
		return out
	}
	bad := func(name string, b unavailabilityBody) {
		t.Helper()
		if _, problem := validateUnavailability(b); problem == "" {
			t.Errorf("%s: expected a refusal", name)
		}
	}

	full := ok(unavailabilityBody{StaffName: " R. Rao ", Date: "2026-10-05", Duration: "full", Reason: "Sick leave", EndDate: "2030-01-01"})
	if full.EndDate != "2026-10-05" || full.StaffName != "R. Rao" {
		t.Errorf("a full day ends the day it starts and names are trimmed: %+v", full)
	}
	ok(unavailabilityBody{StaffName: "R. Rao", Date: "2026-10-05", Duration: "half", Part: "second", Reason: "Meeting"})
	ok(unavailabilityBody{StaffName: "R. Rao", Date: "2026-10-05", EndDate: "2026-10-09", Duration: "long", Reason: "Training"})
	ok(unavailabilityBody{StaffName: "R. Rao", Date: "2026-10-05", Duration: "hours", FromMin: i(600), ToMin: i(720), Reason: "Exam duty"})

	bad("no reason", unavailabilityBody{StaffName: "R. Rao", Date: "2026-10-05", Duration: "full"})
	bad("no name", unavailabilityBody{Date: "2026-10-05", Duration: "full", Reason: "Sick leave"})
	bad("bad date", unavailabilityBody{StaffName: "R. Rao", Date: "05/10/2026", Duration: "full", Reason: "Sick leave"})
	bad("a half day without a half", unavailabilityBody{StaffName: "R. Rao", Date: "2026-10-05", Duration: "half", Reason: "Meeting"})
	bad("several days ending before they start", unavailabilityBody{StaffName: "R. Rao", Date: "2026-10-05", EndDate: "2026-10-01", Duration: "long", Reason: "Training"})
	bad("more than a year", unavailabilityBody{StaffName: "R. Rao", Date: "2026-01-01", EndDate: "2027-06-01", Duration: "long", Reason: "Training"})
	bad("hours backwards", unavailabilityBody{StaffName: "R. Rao", Date: "2026-10-05", Duration: "hours", FromMin: i(720), ToMin: i(600), Reason: "Exam duty"})
	bad("hours missing", unavailabilityBody{StaffName: "R. Rao", Date: "2026-10-05", Duration: "hours", Reason: "Exam duty"})
	bad("unknown duration", unavailabilityBody{StaffName: "R. Rao", Date: "2026-10-05", Duration: "fortnight", Reason: "Training"})
}
