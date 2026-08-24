package middleware

import (
	"io"
	"net/http/httptest"
	"os"
	"strings"
	"testing"

	"github.com/gofiber/fiber/v3"
)

func TestParseAdmins(t *testing.T) {
	// The one that matters: nothing configured must mean nobody, not everybody.
	if got := parseAdmins(""); len(got) != 0 {
		t.Errorf("parseAdmins(\"\") = %v, want empty", got)
	}
	if got := parseAdmins("  ,  , "); len(got) != 0 {
		t.Errorf("parseAdmins of separators only = %v, want empty", got)
	}

	got := parseAdmins(" user_abc , user_def,")
	if len(got) != 2 || !got["user_abc"] || !got["user_def"] {
		t.Errorf("parseAdmins = %v, want user_abc and user_def", got)
	}
	if got["user_ghi"] || got[""] {
		t.Errorf("parseAdmins admitted something it was not given: %v", got)
	}
}

// Fiber v3 takes middleware variadically AFTER the handler, so the registration
// reads as though the handler runs first. It does not — but that is worth
// pinning rather than trusting, because getting it backwards would leave the
// route wide open while looking exactly like this.
func TestRequireAdminRunsBeforeTheHandler(t *testing.T) {
	t.Setenv("ADMIN_CLERK_IDS", "user_admin")

	reached := false
	app := fiber.New()
	app.Post("/curriculum/reset",
		func(c fiber.Ctx) error {
			reached = true
			return c.SendString("reset")
		},
		func(c fiber.Ctx) error { // stands in for Auth()
			c.Locals("user_id", c.Get("X-Test-User"))
			return c.Next()
		},
		RequireAdmin(),
	)

	cases := []struct {
		who        string
		wantStatus int
		wantReach  bool
	}{
		{"user_admin", fiber.StatusOK, true},
		{"user_someone_else", fiber.StatusForbidden, false},
		{"", fiber.StatusForbidden, false},
	}
	for _, tc := range cases {
		reached = false
		req := httptest.NewRequest("POST", "/curriculum/reset", nil)
		req.Header.Set("X-Test-User", tc.who)
		res, err := app.Test(req)
		if err != nil {
			t.Fatalf("%q: %v", tc.who, err)
		}
		body, _ := io.ReadAll(res.Body)
		res.Body.Close()
		if res.StatusCode != tc.wantStatus {
			t.Errorf("%q: status = %d, want %d (body %q)", tc.who, res.StatusCode, tc.wantStatus, strings.TrimSpace(string(body)))
		}
		if reached != tc.wantReach {
			t.Errorf("%q: handler reached = %v, want %v", tc.who, reached, tc.wantReach)
		}
	}
}

// A refusal has to be actionable. Enabling these endpoints means putting the
// caller's own id in ADMIN_CLERK_IDS, so the refusal says what that id is —
// otherwise the only way to learn it is the Clerk dashboard, for a value the
// request already carried.
func TestRequireAdminRefusalNamesTheCallersOwnId(t *testing.T) {
	t.Setenv("ADMIN_CLERK_IDS", "user_admin")

	app := fiber.New()
	app.Post("/curriculum/reset",
		func(c fiber.Ctx) error { return c.SendString("reset") },
		func(c fiber.Ctx) error { c.Locals("user_id", c.Get("X-Test-User")); return c.Next() },
		RequireAdmin(),
	)

	req := httptest.NewRequest("POST", "/curriculum/reset", nil)
	req.Header.Set("X-Test-User", "user_hopeful")
	res, err := app.Test(req)
	if err != nil {
		t.Fatal(err)
	}
	body, _ := io.ReadAll(res.Body)
	res.Body.Close()
	if !strings.Contains(string(body), "user_hopeful") {
		t.Errorf("refusal should name the caller's own id so it can be added; got %q", strings.TrimSpace(string(body)))
	}
	if !strings.Contains(string(body), "ADMIN_CLERK_IDS") {
		t.Errorf("and should name the variable to put it in; got %q", strings.TrimSpace(string(body)))
	}
}

// With no admins configured the route rejects everyone, including a caller with
// a perfectly valid session. An empty allowlist is not an open one.
func TestRequireAdminFailsClosedWhenUnset(t *testing.T) {
	os.Unsetenv("ADMIN_CLERK_IDS")

	app := fiber.New()
	app.Post("/curriculum/apply",
		func(c fiber.Ctx) error { return c.SendString("applied") },
		func(c fiber.Ctx) error { c.Locals("user_id", "user_anyone"); return c.Next() },
		RequireAdmin(),
	)

	res, err := app.Test(httptest.NewRequest("POST", "/curriculum/apply", nil))
	if err != nil {
		t.Fatal(err)
	}
	res.Body.Close()
	if res.StatusCode != fiber.StatusForbidden {
		t.Errorf("status = %d, want 403 when ADMIN_CLERK_IDS is unset", res.StatusCode)
	}
}
