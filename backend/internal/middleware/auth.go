package middleware

import (
	"context"
	"log/slog"
	"os"
	"strings"
	"sync"

	"github.com/gofiber/fiber/v3"
	"github.com/golang-jwt/jwt/v5"

	"github.com/clerk/clerk-sdk-go/v2"
	clerkjwt "github.com/clerk/clerk-sdk-go/v2/jwt"
)

var clerkOnce sync.Once

// initClerk sets the Clerk secret key once (no-op if unset).
func initClerk() {
	clerkOnce.Do(func() {
		if key := os.Getenv("CLERK_SECRET_KEY"); key != "" {
			clerk.SetKey(key)
		}
	})
}

// authMode is how this process verifies bearer tokens.
type authMode int

const (
	// modeUnconfigured — nothing is set up to verify a token. Authenticated
	// routes refuse to serve. This is deliberately NOT a fallback that lets
	// callers through: see resolveMode.
	modeUnconfigured authMode = iota
	modeSkip                  // SKIP_AUTH=true — explicit local bypass
	modeClerk                 // verify a Clerk session JWT against Clerk's JWKS
	modeJWT                   // verify an HS256 JWT signed with JWT_SECRET
)

// resolveMode picks the verification strategy from the environment. Pure, so
// the precedence — and, more importantly, the absence of a permissive default —
// can be tested without a server.
//
// There used to be a fourth strategy here: with no key configured, accept ANY
// non-empty token and derive the user id from the token text. That is an open
// door with a self-service impersonation feature attached — a caller picked
// their own user id by picking their own token. It needed no attack, just a
// CLERK_SECRET_KEY that failed to reach the process: a typo, an unset variable
// in a new environment, a secret that didn't propagate on deploy. Nothing would
// have logged, errored, or looked different.
//
// It was also redundant. Local development already has an explicit switch in
// SKIP_AUTH, which docker-compose sets, so the silent path bought nothing that
// the named one didn't already provide — it only removed the need to say so
// out loud. Now an unconfigured process fails closed and says why.
func resolveMode(skipAuth, clerkKey, jwtSecret string) authMode {
	if skipAuth == "true" {
		return modeSkip
	}
	if strings.TrimSpace(clerkKey) != "" {
		return modeClerk
	}
	if strings.TrimSpace(jwtSecret) != "" {
		return modeJWT
	}
	return modeUnconfigured
}

// Auth validates the request's bearer token and stores the user id in
// c.Locals("user_id"). The strategy is resolved once, when routes are built, so
// a misconfiguration is visible in the boot log rather than at the first
// request — and an unconfigured process rejects instead of admitting everyone.
func Auth() fiber.Handler {
	mode := resolveMode(os.Getenv("SKIP_AUTH"), os.Getenv("CLERK_SECRET_KEY"), os.Getenv("JWT_SECRET"))

	switch mode {
	case modeSkip:
		slog.Warn("auth: SKIP_AUTH=true — every authenticated request runs as 'dev-user'. Never set this in production.")
	case modeClerk:
		slog.Info("auth: verifying Clerk session tokens")
	case modeJWT:
		slog.Info("auth: verifying HS256 tokens with JWT_SECRET")
	case modeUnconfigured:
		slog.Error("auth: no CLERK_SECRET_KEY and no JWT_SECRET — authenticated routes will refuse every request. " +
			"Set CLERK_SECRET_KEY (production) or SKIP_AUTH=true (local only).")
	}

	return func(c fiber.Ctx) error {
		if mode == modeSkip {
			c.Locals("user_id", "dev-user")
			return c.Next()
		}
		if mode == modeUnconfigured {
			// 503, not 401: the caller's credentials are not the problem, and a
			// 401 would invite them to go and fetch a "better" token forever.
			return fiber.NewError(fiber.StatusServiceUnavailable, "authentication is not configured on this server")
		}

		authHeader := c.Get("Authorization")
		if authHeader == "" {
			return fiber.NewError(fiber.StatusUnauthorized, "missing Authorization header")
		}
		parts := strings.SplitN(authHeader, " ", 2)
		if len(parts) != 2 || parts[0] != "Bearer" || parts[1] == "" {
			return fiber.NewError(fiber.StatusUnauthorized, "invalid token format")
		}
		tokenStr := parts[1]

		var userID string
		switch mode {
		case modeClerk:
			initClerk()
			claims, err := clerkjwt.Verify(context.Background(), &clerkjwt.VerifyParams{Token: tokenStr})
			if err != nil {
				return fiber.NewError(fiber.StatusUnauthorized, "invalid token")
			}
			userID = claims.Subject

		case modeJWT:
			// Pin the algorithm. Without this the token gets to nominate how it
			// is checked, which is the caller's choice to make only if you want
			// them making it.
			token, err := jwt.Parse(tokenStr, func(*jwt.Token) (interface{}, error) {
				return []byte(os.Getenv("JWT_SECRET")), nil
			}, jwt.WithValidMethods([]string{"HS256"}))
			if err != nil || !token.Valid {
				return fiber.NewError(fiber.StatusUnauthorized, "invalid token")
			}
			claims, ok := token.Claims.(jwt.MapClaims)
			if !ok {
				return fiber.NewError(fiber.StatusUnauthorized, "invalid token")
			}
			userID, _ = claims["sub"].(string)
		}

		// A verified token with no subject identifies nobody. Handlers treat an
		// empty user id as unauthorized anyway; rejecting here keeps that from
		// depending on every handler remembering to.
		if strings.TrimSpace(userID) == "" {
			return fiber.NewError(fiber.StatusUnauthorized, "token carries no subject")
		}

		c.Locals("user_id", userID)
		return c.Next()
	}
}
