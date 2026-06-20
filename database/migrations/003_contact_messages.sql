-- ─────────────────────────────────────────────────────────────
-- Contact form submissions (public marketing site → /api/contact)
-- ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS contact_messages (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name        TEXT        NOT NULL,
    email       TEXT        NOT NULL,
    message     TEXT        NOT NULL,
    source      TEXT        NOT NULL DEFAULT 'marketing-contact',
    ip          TEXT,
    user_agent  TEXT,
    handled     BOOLEAN     NOT NULL DEFAULT FALSE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS contact_messages_created_idx ON contact_messages (created_at DESC);
CREATE INDEX IF NOT EXISTS contact_messages_unhandled_idx ON contact_messages (handled) WHERE handled = FALSE;
