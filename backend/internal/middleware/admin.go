package middleware

import (
	"log/slog"
	"os"
	"strings"

	"github.com/gofiber/fiber/v3"
)

// parseAdmins turns "user_a, user_b" into a lookup set. Pure, so the important
// case — an unset or blank variable yielding NOBODY rather than everybody — can
// be tested without a server.
func parseAdmins(raw string) map[string]bool {
	out := map[string]bool{}
	for _, p := range strings.Split(raw, ",") {
		if p = strings.TrimSpace(p); p != "" {
			out[p] = true
		}
	}
	return out
}

// RequireAdmin gates the curriculum mutation endpoints, which write reference
// data that every school reads. It must be layered AFTER Auth(), which is what
// puts the caller's id in Locals.
//
// These routes were labelled "Admin-only mutation endpoints" in main.go and
// "Admin-only endpoint" in the handlers, and nothing anywhere enforced it. Any
// signed-in account could approve pending curriculum changes, write them into
// the shared templates, or reset every template to seed. ReviewChanges would
// also take the reviewer id straight from the request body, so the record of
// who approved a change was written by whoever asked for it.
//
// Unset ADMIN_CLERK_IDS means nobody is an admin, not everybody: the same
// fail-closed rule the billing config already follows, where absent keys
// disable the feature rather than opening it.
func RequireAdmin() fiber.Handler {
	admins := parseAdmins(os.Getenv("ADMIN_CLERK_IDS"))
	if len(admins) == 0 {
		slog.Warn("auth: ADMIN_CLERK_IDS is empty — curriculum mutation endpoints will reject everyone. " +
			"Set it to your Clerk user id (dashboard.clerk.com → Users → the id starting user_) to enable them.")
	} else {
		slog.Info("auth: curriculum admin endpoints enabled", "admins", len(admins))
	}

	return func(c fiber.Ctx) error {
		uid, _ := c.Locals("user_id").(string)
		if uid == "" || !admins[uid] {
			// The refusal names the caller's OWN id. Enabling these endpoints means
			// putting that id in ADMIN_CLERK_IDS, and finding it otherwise means
			// digging through the Clerk dashboard for a value the request already
			// carries. Telling you your own id discloses nothing you did not send.
			if uid != "" {
				return fiber.NewError(fiber.StatusForbidden,
					"this endpoint is restricted to administrators — add your id to ADMIN_CLERK_IDS to enable it: "+uid)
			}
			return fiber.NewError(fiber.StatusForbidden, "this endpoint is restricted to administrators")
		}
		return c.Next()
	}
}
