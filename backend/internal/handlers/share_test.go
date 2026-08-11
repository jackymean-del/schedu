package handlers

import "testing"

// A one-time code is six digits inside a ten-minute window — roughly 10^6
// values, which a script walks through in minutes. The window was never the
// defence; the guess budget is. These pin the rule that spends it.
func TestJudgeCode(t *testing.T) {
	const max = 5

	cases := []struct {
		name string
		rows []codeAttempt
		want codeVerdict
	}{
		{"no live code at all", nil, codeInvalid},
		{"right code, first try", []codeAttempt{{attempts: 1, matched: true}}, codeAccepted},
		{"wrong code, budget left", []codeAttempt{{attempts: 2}}, codeInvalid},

		// The boundary is the whole point of the cap, so it is pinned in both
		// directions: the last allowed guess still works, the next one does not.
		{"right code on the last allowed try", []codeAttempt{{attempts: max, matched: true}}, codeAccepted},
		{"wrong code on the last allowed try", []codeAttempt{{attempts: max}}, codeInvalid},
		{"one guess past the cap", []codeAttempt{{attempts: max + 1}}, codeExhausted},

		// Otherwise burning the budget guessing would cost an attacker nothing:
		// they would simply guess once more and be let in.
		{"right code past the cap is refused", []codeAttempt{{attempts: max + 1, matched: true}}, codeExhausted},
	}
	for _, tc := range cases {
		if got := judgeCode(tc.rows, max); got != tc.want {
			t.Errorf("%s: judgeCode = %v, want %v", tc.name, got, tc.want)
		}
	}
}

// RequestShareCode supersedes outstanding codes rather than adding to them, but
// a retry racing an expiry can still leave more than one row live. The verdict
// must not depend on which order the database hands them back.
func TestJudgeCodeIgnoresRowOrder(t *testing.T) {
	const max = 5
	mixes := map[string][]codeAttempt{
		"spent first":   {{attempts: max + 1}, {attempts: 1}},
		"usable first":  {{attempts: 1}, {attempts: max + 1}},
		"match last":    {{attempts: max + 1}, {attempts: 1, matched: true}},
		"match first":   {{attempts: 1, matched: true}, {attempts: max + 1}},
		"all spent":     {{attempts: max + 1}, {attempts: max + 2}},
		"match is dead": {{attempts: max + 1, matched: true}, {attempts: max + 3}},
	}
	want := map[string]codeVerdict{
		"spent first": codeInvalid, "usable first": codeInvalid,
		"match last": codeAccepted, "match first": codeAccepted,
		"all spent": codeExhausted, "match is dead": codeExhausted,
	}
	for name, rows := range mixes {
		if got := judgeCode(rows, max); got != want[name] {
			t.Errorf("%s: judgeCode = %v, want %v", name, got, want[name])
		}
	}
}

// A share is restricted by a list of addresses, so the list has to be the same
// set however the addresses were typed.
func TestNormalizeEmails(t *testing.T) {
	got := normalizeEmails([]string{
		" Head@School.edu ", "head@school.edu", // same mailbox, twice
		"not-an-email", "", "  ",
		"office@school.edu",
	})
	want := []string{"head@school.edu", "office@school.edu"}
	if len(got) != len(want) {
		t.Fatalf("normalizeEmails = %v, want %v", got, want)
	}
	for i := range want {
		if got[i] != want[i] {
			t.Fatalf("normalizeEmails = %v, want %v", got, want)
		}
	}
}

// gen6 feeds a code the viewer types by hand; a short one would silently fail
// to match the six characters the form collects.
func TestGen6IsAlwaysSixDigits(t *testing.T) {
	for i := 0; i < 500; i++ {
		c := gen6()
		if len(c) != 6 {
			t.Fatalf("gen6() = %q, want 6 characters", c)
		}
		for _, r := range c {
			if r < '0' || r > '9' {
				t.Fatalf("gen6() = %q, want digits only", c)
			}
		}
	}
}
