-- ─────────────────────────────────────────────────────────────
-- Billing / subscriptions (Razorpay).
--
-- The `users.plan` column already exists (TEXT DEFAULT 'free'). These
-- columns hold the provider-side subscription state that DRIVES `plan`:
-- a webhook flips `plan` to 'pro' on activation and back to 'free' when a
-- subscription is cancelled or lapses. `plan` stays the single source of
-- truth the app reads; everything here is the billing machinery behind it.
-- ─────────────────────────────────────────────────────────────

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS billing_provider    TEXT,        -- 'razorpay' (future: 'stripe')
  ADD COLUMN IF NOT EXISTS subscription_id     TEXT,        -- provider subscription id
  ADD COLUMN IF NOT EXISTS subscription_status TEXT,        -- created|authenticated|active|halted|cancelled|completed|expired
  ADD COLUMN IF NOT EXISTS billing_interval    TEXT,        -- 'monthly' | 'yearly'
  ADD COLUMN IF NOT EXISTS current_period_end  TIMESTAMPTZ; -- end of the currently paid period

CREATE INDEX IF NOT EXISTS users_subscription_id_idx ON users (subscription_id);

-- Idempotent webhook log: Razorpay may deliver an event more than once, so we
-- record each provider event id and skip anything already processed. Also a
-- durable audit trail of every billing event we acted on.
CREATE TABLE IF NOT EXISTS billing_events (
    id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    provider    TEXT        NOT NULL DEFAULT 'razorpay',
    event_id    TEXT        UNIQUE,        -- provider event id (idempotency key)
    event_type  TEXT,
    payload     JSONB       NOT NULL DEFAULT '{}',
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
