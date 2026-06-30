-- ─────────────────────────────────────────────────────────────
-- One-time codes for unlocking email-restricted timetable shares
-- (magic-link / OTP verification of email ownership).
-- ─────────────────────────────────────────────────────────────

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
