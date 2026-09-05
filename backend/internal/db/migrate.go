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

// shareSchema mirrors database/migrations/006_share_access_codes.sql plus
// 008_share_code_attempts.sql, inlined for the same reason as billingSchema
// above. VerifyShareCode reads and writes `attempts` on every call, so the
// column has to exist before the new binary serves its first request — it
// cannot wait for a manual migration.
//
// The CREATE is repeated here rather than assuming 006 ran: ALTER TABLE fails
// outright on a missing table, which would take the ADD COLUMN with it and
// leave restricted shares unopenable on any database provisioned from scratch.
const shareSchema = `
CREATE TABLE IF NOT EXISTS share_access_codes (
    id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    token       TEXT        NOT NULL,
    email       TEXT        NOT NULL,
    code        TEXT        NOT NULL,
    expires_at  TIMESTAMPTZ NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS share_access_codes_lookup_idx ON share_access_codes (token, email);
CREATE INDEX IF NOT EXISTS share_access_codes_expiry_idx ON share_access_codes (expires_at);

ALTER TABLE share_access_codes
  ADD COLUMN IF NOT EXISTS attempts INT NOT NULL DEFAULT 0;
`

// collabSchema mirrors database/migrations/009_members_and_or_decisions.sql,
// inlined for the same reason as the two above.
//
// These are the first tables written by somebody who does not own the row. Up
// to now the server has held one account's snapshot and the browser has held
// everything else; a teacher tapping "I'll take this slot" on their own phone
// has nowhere to put that fact, and the corridor board has no way to learn it.
//
// The school is an owner_id rather than a school_id because there is no schools
// table yet, and inventing one here would mean migrating every existing account
// into it blind. A school is currently "the account that owns the timetables".
// When schools become first-class this is a rename, not a rethink.
const collabSchema = `
CREATE TABLE IF NOT EXISTS school_members (
    id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_id    UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    email       TEXT        NOT NULL,
    user_id     UUID        REFERENCES users(id) ON DELETE SET NULL,
    staff_name  TEXT,
    role        TEXT        NOT NULL DEFAULT 'teacher'
                            CHECK (role IN ('admin', 'teacher', 'viewer')),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (owner_id, email)
);

CREATE INDEX IF NOT EXISTS idx_school_members_email ON school_members (email);
CREATE INDEX IF NOT EXISTS idx_school_members_user  ON school_members (user_id);
CREATE INDEX IF NOT EXISTS idx_school_members_owner ON school_members (owner_id);

CREATE TABLE IF NOT EXISTS or_decisions (
    id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    timetable_id  UUID        NOT NULL REFERENCES timetables(id) ON DELETE CASCADE,
    section       TEXT        NOT NULL,
    on_date       DATE        NOT NULL,
    period_id     TEXT        NOT NULL,
    subject       TEXT        NOT NULL,
    decided_by    TEXT,
    decided_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (timetable_id, section, on_date, period_id)
);

CREATE INDEX IF NOT EXISTS idx_or_decisions_lookup ON or_decisions (timetable_id, on_date);
`

// EnsureSchema applies idempotent schema needed by features that must not
// depend on an out-of-band migration step.
// Safe to call on every startup; a failure is returned so the caller can log it
// without necessarily crashing the whole service.
func EnsureSchema(ctx context.Context, pool *pgxpool.Pool) error {
	if _, err := pool.Exec(ctx, billingSchema); err != nil {
		return fmt.Errorf("ensure billing schema: %w", err)
	}
	if _, err := pool.Exec(ctx, collabSchema); err != nil {
		return fmt.Errorf("ensure collaboration schema: %w", err)
	}
	if _, err := pool.Exec(ctx, shareSchema); err != nil {
		return fmt.Errorf("ensure share schema: %w", err)
	}
	return nil
}
