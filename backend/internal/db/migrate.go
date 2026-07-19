package db

import (
	"context"
	"fmt"

	"github.com/jackc/pgx/v5/pgxpool"
)

// billingSchema mirrors database/migrations/007_billing.sql. It is inlined (not
// embedded from the repo-root migrations dir) because Railway builds with the
// backend/ directory as the build root, so files outside it aren't in the build
// context. Every statement is idempotent, so running it on each boot is safe —
// this lets the service migrate itself using its own (private) DATABASE_URL,
// with no public DB proxy and no manual step.
const billingSchema = `
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS billing_provider    TEXT,
  ADD COLUMN IF NOT EXISTS subscription_id     TEXT,
  ADD COLUMN IF NOT EXISTS subscription_status TEXT,
  ADD COLUMN IF NOT EXISTS billing_interval    TEXT,
  ADD COLUMN IF NOT EXISTS current_period_end  TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS users_subscription_id_idx ON users (subscription_id);

CREATE TABLE IF NOT EXISTS billing_events (
    id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    provider    TEXT        NOT NULL DEFAULT 'razorpay',
    event_id    TEXT        UNIQUE,
    event_type  TEXT,
    payload     JSONB       NOT NULL DEFAULT '{}',
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
`

// EnsureSchema applies idempotent schema needed by features that must not
// depend on an out-of-band migration step. Currently just the billing schema.
// Safe to call on every startup; a failure is returned so the caller can log it
// without necessarily crashing the whole service.
func EnsureSchema(ctx context.Context, pool *pgxpool.Pool) error {
	if _, err := pool.Exec(ctx, billingSchema); err != nil {
		return fmt.Errorf("ensure billing schema: %w", err)
	}
	return nil
}
