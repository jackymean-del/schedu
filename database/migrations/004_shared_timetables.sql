-- ─────────────────────────────────────────────────────────────
-- Public, read-only timetable shares (share-by-link, like a calendar link)
-- A share stores a self-contained snapshot of the rendered grid, so it is
-- independent of the live timetable and never changes after sharing.
-- ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS shared_timetables (
    token          TEXT        PRIMARY KEY,
    title          TEXT        NOT NULL,
    payload        JSONB       NOT NULL,
    -- 'public'     → anyone with the link can view
    -- 'restricted' → only the email addresses in allowed_emails can view
    visibility     TEXT        NOT NULL DEFAULT 'public',
    allowed_emails TEXT[]      NOT NULL DEFAULT '{}',
    created_by     TEXT,
    views          BIGINT      NOT NULL DEFAULT 0,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at     TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS shared_timetables_created_idx ON shared_timetables (created_at DESC);
