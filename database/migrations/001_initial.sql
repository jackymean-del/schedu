-- SmartSched v3 Schema — PostgreSQL 17 + Drizzle ORM
-- Run: psql $DATABASE_URL -f 001_initial.sql

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TYPE org_type AS ENUM (
  'school', 'college', 'corporate', 'hospital', 'ngo', 'factory'
);
CREATE TYPE timetable_status AS ENUM (
  'draft', 'generating', 'ready', 'error'
);

CREATE TABLE IF NOT EXISTS users (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clerk_id    TEXT UNIQUE NOT NULL,
  email       TEXT,
  name        TEXT,
  plan        TEXT DEFAULT 'free',
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS timetables (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID REFERENCES users(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  org_type    org_type NOT NULL,
  country     TEXT NOT NULL,
  -- Full config: sections, staff, periods, subjects, breaks
  config      JSONB NOT NULL DEFAULT '{}',
  -- Generated timetable data: classTT, teacherTT, conflicts
  data        JSONB NOT NULL DEFAULT '{}',
  status      timetable_status DEFAULT 'draft',
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS substitutions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  timetable_id    UUID REFERENCES timetables(id) ON DELETE CASCADE,
  absent_staff    TEXT NOT NULL,
  day             TEXT NOT NULL,
  substitutions   JSONB DEFAULT '[]',
  applied_at      TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_timetables_user   ON timetables(user_id);
CREATE INDEX IF NOT EXISTS idx_timetables_status ON timetables(status);
CREATE INDEX IF NOT EXISTS idx_subs_tt           ON substitutions(timetable_id);

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$;

CREATE TRIGGER timetables_updated_at
  BEFORE UPDATE ON timetables
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER users_updated_at
  BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
