-- Who is away, when and why. Written by the school, or by the teacher
-- themselves; see backend/internal/handlers/unavailability.go for the rules.
-- Applied on boot by backend/internal/db/migrate.go (unavailabilitySchema).

CREATE TABLE IF NOT EXISTS unavailability (
    id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_id     UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    staff_name   TEXT        NOT NULL,
    start_date   DATE        NOT NULL,
    end_date     DATE        NOT NULL,
    duration     TEXT        NOT NULL CHECK (duration IN ('full', 'half', 'long', 'hours')),
    part         TEXT        CHECK (part IN ('first', 'second')),
    from_min     INT,
    to_min       INT,
    reason       TEXT        NOT NULL,
    note         TEXT,
    reported_by  TEXT,
    source       TEXT        NOT NULL DEFAULT 'admin' CHECK (source IN ('self', 'admin')),
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CHECK (end_date >= start_date)
);

CREATE INDEX IF NOT EXISTS idx_unavailability_window ON unavailability (owner_id, start_date, end_date);
