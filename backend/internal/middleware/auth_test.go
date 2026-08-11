package middleware

import "testing"

// The precedence itself matters less than the last case: with nothing
// configured the answer must be "refuse", not "let everyone in". This used to
// resolve to a fallback that accepted any non-empty token and read the user id
// out of the token text, so a single missing environment variable was the whole
// authentication system.
func TestResolveMode(t *testing.T) {
	cases := []struct {
		name                string
		skip, clerk, secret string
		want                authMode
	}{
		{"nothing configured fails closed", "", "", "", modeUnconfigured},
		{"clerk key wins", "", "sk_live_x", "s3cret", modeClerk},
		{"jwt secret when no clerk key", "", "", "s3cret", modeJWT},
		{"skip beats everything, since it is explicit", "true", "sk_live_x", "s3cret", modeSkip},

		// Only the exact string enables the bypass — "1"/"yes"/"TRUE" must not
		// half-open the door on a hand-edited env file.
		{"skip is not truthy-guessing", "1", "", "", modeUnconfigured},
		{"skip is case-sensitive", "TRUE", "", "", modeUnconfigured},
		{"skip=false is off", "false", "", "", modeUnconfigured},

		// A variable that exists but is blank (or whitespace, as happens when a
		// secret fails to interpolate on deploy) is not a configured key.
		{"blank clerk key is not configured", "", "", "", modeUnconfigured},
		{"whitespace-only clerk key is not configured", "", "   ", "", modeUnconfigured},
		{"whitespace-only jwt secret is not configured", "", "", "  ", modeUnconfigured},
		{"whitespace clerk falls through to a real jwt secret", "", " ", "s3cret", modeJWT},
	}
	for _, tc := range cases {
		if got := resolveMode(tc.skip, tc.clerk, tc.secret); got != tc.want {
			t.Errorf("%s: resolveMode(%q,%q,%q) = %v, want %v",
				tc.name, tc.skip, tc.clerk, tc.secret, got, tc.want)
		}
	}
}

// modeUnconfigured is the zero value on purpose: anything that forgets to set a
// mode fails closed rather than picking whichever strategy sorts first.
func TestUnconfiguredIsTheZeroValue(t *testing.T) {
	var m authMode
	if m != modeUnconfigured {
		t.Fatalf("zero authMode = %v, want modeUnconfigured", m)
	}
}
