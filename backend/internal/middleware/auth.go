package middleware

import (
	"context"
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

// Auth validates the request's bearer token and stores the user id in
// c.Locals("user_id"). Verification strategy, in order:
//   1. SKIP_AUTH=true            → dev bypass (user "dev-user")
//   2. CLERK_SECRET_KEY set      → verify a Clerk session JWT (JWKS)
//   3. JWT_SECRET set            → verify an HS256 JWT signed with that secret
//   4. otherwise                 → dev fallback: accept any non-empty token
func Auth() fiber.Handler {
	return func(c fiber.Ctx) error {
		if os.Getenv("SKIP_AUTH") == "true" {
			c.Locals("user_id", "dev-user")
			return c.Next()
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

		// 2. Clerk session token (preferred when configured).
		if os.Getenv("CLERK_SECRET_KEY") != "" {
			initClerk()
			claims, err := clerkjwt.Verify(context.Background(), &clerkjwt.VerifyParams{Token: tokenStr})
			if err != nil {
				return fiber.NewError(fiber.StatusUnauthorized, "invalid token")
			}
			c.Locals("user_id", claims.Subject)
			return c.Next()
		}

		// 3. Plain HS256 JWT.
		if secret := os.Getenv("JWT_SECRET"); secret != "" {
			token, err := jwt.Parse(tokenStr, func(t *jwt.Token) (interface{}, error) {
				return []byte(secret), nil
			})
			if err != nil || !token.Valid {
				return fiber.NewError(fiber.StatusUnauthorized, "invalid token")
			}
			claims := token.Claims.(jwt.MapClaims)
			userID, _ := claims["sub"].(string)
			c.Locals("user_id", userID)
			return c.Next()
		}

		// 4. Dev fallback — accept any non-empty token.
		c.Locals("user_id", "user-"+tokenStr[:min(8, len(tokenStr))])
		return c.Next()
	}
}

func min(a, b int) int {
	if a < b {
		return a
	}
	return b
}
