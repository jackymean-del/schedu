-- ====== database/migrations/001_initial.sql ======
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

-- ====== database/migrations/002_schedu_full_schema.sql ======
-- ═══════════════════════════════════════════════════════════════
-- Migration 002 — Schedu Full Schema
-- Adds all tables for the complete Schedu academic scheduling model
-- ═══════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────
-- ENUMS
-- ─────────────────────────────────────────────────────────────

DO $$ BEGIN
  CREATE TYPE board_type AS ENUM ('CBSE','ICSE','STATE','IB','CAMBRIDGE','OTHER');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE subscription_plan AS ENUM ('free','basic','pro','enterprise');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  -- fixed=Nursery/KG/Primary, standard=VI-X, dynamic=XI-XII
  CREATE TYPE profile_type AS ENUM ('fixed','standard','dynamic');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE room_type AS ENUM ('classroom','lab','hall','library','ground','other');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE slot_type AS ENUM ('period','break','assembly','activity','dispersal','lunch');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE timetable_status AS ENUM ('draft','generating','ready','published','error','locked');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ─────────────────────────────────────────────────────────────
-- USERS (update plan column to new enum)
-- ─────────────────────────────────────────────────────────────
ALTER TABLE users
  ALTER COLUMN plan DROP DEFAULT,
  ALTER COLUMN plan TYPE text;

-- ─────────────────────────────────────────────────────────────
-- LAYER 1: RESOURCE ENGINE
-- ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS organizations (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID REFERENCES users(id) ON DELETE CASCADE,
  name              TEXT NOT NULL,
  board             board_type DEFAULT 'CBSE',
  country           TEXT NOT NULL DEFAULT 'IN',
  timezone          TEXT NOT NULL DEFAULT 'Asia/Kolkata',
  subscription_plan subscription_plan DEFAULT 'free',
  logo_url          TEXT,
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  updated_at        TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS organizations_user_idx ON organizations(user_id);

CREATE TABLE IF NOT EXISTS academic_sessions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,
  start_date      TEXT NOT NULL,
  end_date        TEXT NOT NULL,
  working_days    INTEGER NOT NULL DEFAULT 220,
  weekly_days     INTEGER NOT NULL DEFAULT 5,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS sessions_org_idx ON academic_sessions(organization_id);

CREATE TABLE IF NOT EXISTS scheduling_profiles (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,
  profile_type    profile_type NOT NULL DEFAULT 'standard',
  grades          JSONB DEFAULT '[]',
  created_at      TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS profiles_org_idx ON scheduling_profiles(organization_id);

CREATE TABLE IF NOT EXISTS classes (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id   UUID REFERENCES organizations(id) ON DELETE CASCADE,
  session_id        UUID REFERENCES academic_sessions(id) ON DELETE CASCADE,
  profile_id        UUID REFERENCES scheduling_profiles(id) ON DELETE SET NULL,
  grade             TEXT NOT NULL,
  section           TEXT NOT NULL,
  stream            TEXT DEFAULT 'General',
  strength          INTEGER DEFAULT 0,
  room_id           UUID,   -- FK to classrooms added after
  class_teacher_id  UUID,   -- FK to teachers added after
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  updated_at        TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS classes_org_idx ON classes(organization_id);
CREATE INDEX IF NOT EXISTS classes_session_idx ON classes(session_id);

CREATE TABLE IF NOT EXISTS subject_categories (
  id   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE
);
-- Seed built-in categories
INSERT INTO subject_categories (name) VALUES
  ('Compulsory'),('4th Optional'),('5th Optional'),('6th Optional'),
  ('Practical'),('Activity'),('EST'),('CCA'),('Language'),('Skill')
ON CONFLICT (name) DO NOTHING;

CREATE TABLE IF NOT EXISTS subjects (
  id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id           UUID REFERENCES organizations(id) ON DELETE CASCADE,
  name                      TEXT NOT NULL,
  short_name                TEXT DEFAULT '',
  category_id               UUID REFERENCES subject_categories(id) ON DELETE SET NULL,
  is_optional               BOOLEAN DEFAULT FALSE,
  requires_lab              BOOLEAN DEFAULT FALSE,
  requires_consecutive_slots BOOLEAN DEFAULT FALSE,
  periods_per_week          INTEGER DEFAULT 5,
  session_duration          INTEGER DEFAULT 45,
  max_periods_per_day       INTEGER DEFAULT 2,
  color                     TEXT DEFAULT '#6366f1',
  class_configs             JSONB DEFAULT '[]',
  created_at                TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS subjects_org_idx ON subjects(organization_id);

CREATE TABLE IF NOT EXISTS teachers (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id     UUID REFERENCES organizations(id) ON DELETE CASCADE,
  name                TEXT NOT NULL,
  short_name          TEXT DEFAULT '',
  specialization      JSONB DEFAULT '[]',
  max_periods_per_week INTEGER DEFAULT 30,
  qualification       TEXT DEFAULT '',
  preferences         JSONB DEFAULT '{}',
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  updated_at          TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS teachers_org_idx ON teachers(organization_id);

CREATE TABLE IF NOT EXISTS classrooms (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,
  building        TEXT DEFAULT 'Main',
  floor           INTEGER DEFAULT 0,
  capacity        INTEGER DEFAULT 40,
  room_type       room_type DEFAULT 'classroom',
  created_at      TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS classrooms_org_idx ON classrooms(organization_id);

-- Now add FK constraints to classes (Postgres has no ADD CONSTRAINT IF NOT
-- EXISTS, so guard each with a DO block to stay idempotent).
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'classes_room_fk') THEN
    ALTER TABLE classes ADD CONSTRAINT classes_room_fk
      FOREIGN KEY (room_id) REFERENCES classrooms(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'classes_teacher_fk') THEN
    ALTER TABLE classes ADD CONSTRAINT classes_teacher_fk
      FOREIGN KEY (class_teacher_id) REFERENCES teachers(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS students (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  class_id        UUID REFERENCES classes(id) ON DELETE CASCADE,
  roll_no         TEXT DEFAULT '',
  name            TEXT NOT NULL,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS students_class_idx ON students(class_id);

-- ─────────────────────────────────────────────────────────────
-- LAYER 2: ACADEMIC ENGINE
-- ─────────────────────────────────────────────────────────────

-- THE MOST IMPORTANT TABLE: how many students per class take each subject
CREATE TABLE IF NOT EXISTS section_subject_strengths (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  class_id      UUID REFERENCES classes(id) ON DELETE CASCADE,
  subject_id    UUID REFERENCES subjects(id) ON DELETE CASCADE,
  category_id   UUID REFERENCES subject_categories(id) ON DELETE SET NULL,
  student_count INTEGER DEFAULT 0,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS sss_class_idx ON section_subject_strengths(class_id);
CREATE INDEX IF NOT EXISTS sss_subject_idx ON section_subject_strengths(subject_id);

CREATE TABLE IF NOT EXISTS student_subject_selections (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id  UUID REFERENCES students(id) ON DELETE CASCADE,
  subject_id  UUID REFERENCES subjects(id) ON DELETE CASCADE,
  category_id UUID REFERENCES subject_categories(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS sss_sel_student_idx ON student_subject_selections(student_id);

CREATE TABLE IF NOT EXISTS period_allocations (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id               UUID REFERENCES academic_sessions(id) ON DELETE CASCADE,
  subject_id               UUID REFERENCES subjects(id) ON DELETE CASCADE,
  class_id                 UUID REFERENCES classes(id) ON DELETE CASCADE,
  suggested_weekly_periods INTEGER DEFAULT 5,
  suggested_daily_periods  INTEGER DEFAULT 1,
  total_annual_hours       INTEGER DEFAULT 0,
  cbse_norm_hours          INTEGER,
  created_at               TIMESTAMPTZ DEFAULT NOW()
);

-- Academic combination groups (heart of XI/XII optional scheduling)
CREATE TABLE IF NOT EXISTS academic_combinations (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id      UUID REFERENCES academic_sessions(id) ON DELETE CASCADE,
  class_id        UUID REFERENCES classes(id) ON DELETE CASCADE,
  group_name      TEXT NOT NULL,
  stream          TEXT DEFAULT 'General',
  total_strength  INTEGER DEFAULT 0,
  subject_slots   JSONB DEFAULT '[]',
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS combos_class_idx ON academic_combinations(class_id);

CREATE TABLE IF NOT EXISTS subject_rules (
  id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  subject_id                UUID REFERENCES subjects(id) ON DELETE CASCADE UNIQUE,
  requires_consecutive_slots BOOLEAN DEFAULT FALSE,
  only_after_break          BOOLEAN DEFAULT FALSE,
  only_in_first_half        BOOLEAN DEFAULT FALSE,
  not_last_period           BOOLEAN DEFAULT FALSE,
  not_consecutive           BOOLEAN DEFAULT FALSE,
  required_room_type        room_type,
  max_consecutive_count     INTEGER DEFAULT 1
);

-- ─────────────────────────────────────────────────────────────
-- LAYER 3: DYNAMIC SCHEDULING ENGINE
-- ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS parallel_blocks (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id  UUID REFERENCES academic_sessions(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  grade       TEXT NOT NULL,
  stream      TEXT DEFAULT 'General',
  subject_ids JSONB DEFAULT '[]',
  created_at  TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS blocks_session_idx ON parallel_blocks(session_id);

CREATE TABLE IF NOT EXISTS instructional_clusters (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id          UUID REFERENCES academic_sessions(id) ON DELETE CASCADE,
  class_id            UUID REFERENCES classes(id) ON DELETE CASCADE,
  subject_id          UUID REFERENCES subjects(id) ON DELETE CASCADE,
  cluster_name        TEXT NOT NULL,
  student_count       INTEGER DEFAULT 0,
  parallel_block_id   UUID REFERENCES parallel_blocks(id) ON DELETE SET NULL,
  assigned_room_id    UUID REFERENCES classrooms(id) ON DELETE SET NULL,
  assigned_teacher_id UUID REFERENCES teachers(id) ON DELETE SET NULL,
  created_at          TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS clusters_session_idx ON instructional_clusters(session_id);
CREATE INDEX IF NOT EXISTS clusters_class_idx ON instructional_clusters(class_id);
CREATE INDEX IF NOT EXISTS clusters_block_idx ON instructional_clusters(parallel_block_id);

CREATE TABLE IF NOT EXISTS bell_schedules (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,
  work_days       JSONB DEFAULT '[]',
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS time_slots (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bell_schedule_id UUID REFERENCES bell_schedules(id) ON DELETE CASCADE,
  day_index        INTEGER NOT NULL,
  slot_index       INTEGER NOT NULL,
  start_time       TEXT NOT NULL,
  end_time         TEXT NOT NULL,
  slot_type        slot_type DEFAULT 'period',
  shift_id         TEXT,
  created_at       TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS slots_schedule_idx ON time_slots(bell_schedule_id);

-- ─────────────────────────────────────────────────────────────
-- LAYER 4: TIMETABLE OUTPUT
-- ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS session_instances (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id            UUID REFERENCES academic_sessions(id) ON DELETE CASCADE,
  cluster_id            UUID REFERENCES instructional_clusters(id) ON DELETE CASCADE,
  teacher_id            UUID REFERENCES teachers(id) ON DELETE SET NULL,
  room_id               UUID REFERENCES classrooms(id) ON DELETE SET NULL,
  time_slot_id          UUID REFERENCES time_slots(id) ON DELETE CASCADE,
  is_substituted        BOOLEAN DEFAULT FALSE,
  substitute_teacher_id UUID REFERENCES teachers(id) ON DELETE SET NULL,
  created_at            TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS instances_session_idx ON session_instances(session_id);
CREATE INDEX IF NOT EXISTS instances_cluster_idx ON session_instances(cluster_id);
CREATE INDEX IF NOT EXISTS instances_slot_idx ON session_instances(time_slot_id);

-- Update timetables table (add new columns to existing table)
ALTER TABLE timetables
  ADD COLUMN IF NOT EXISTS session_id     UUID REFERENCES academic_sessions(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS health_score   JSONB DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS published_at   TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS locked_at      TIMESTAMPTZ;

-- Update status enum on timetables
ALTER TABLE timetables
  ALTER COLUMN status TYPE TEXT;
ALTER TABLE timetables
  ADD CONSTRAINT timetable_status_check CHECK (
    status IN ('draft','generating','ready','published','error','locked')
  );

CREATE TABLE IF NOT EXISTS timetable_versions (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  timetable_id UUID REFERENCES timetables(id) ON DELETE CASCADE,
  version      INTEGER NOT NULL,
  label        TEXT,
  data         JSONB DEFAULT '{}',
  created_at   TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS versions_timetable_idx ON timetable_versions(timetable_id);

CREATE TABLE IF NOT EXISTS audit_logs (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  timetable_id   UUID REFERENCES timetables(id) ON DELETE CASCADE,
  user_id        UUID REFERENCES users(id) ON DELETE SET NULL,
  action         TEXT NOT NULL,
  entity_type    TEXT,
  entity_id      TEXT,
  previous_value JSONB,
  new_value      JSONB,
  created_at     TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS audit_timetable_idx ON audit_logs(timetable_id);

-- ─────────────────────────────────────────────────────────────
-- OPERATIONAL: SUBSTITUTIONS
-- ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS absence_records (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  timetable_id  UUID REFERENCES timetables(id) ON DELETE CASCADE,
  teacher_id    UUID REFERENCES teachers(id) ON DELETE CASCADE,
  date          TEXT NOT NULL,
  period_ids    JSONB DEFAULT '[]',
  reason        TEXT,
  substitutions JSONB DEFAULT '[]',
  created_at    TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS absence_timetable_idx ON absence_records(timetable_id);
CREATE INDEX IF NOT EXISTS absence_teacher_idx ON absence_records(teacher_id);

-- ─────────────────────────────────────────────────────────────
-- AUTO-UPDATE TRIGGERS
-- ─────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

DO $$ DECLARE t TEXT;
BEGIN
  FOR t IN SELECT unnest(ARRAY[
    'organizations','classes','teachers','timetables','academic_combinations'
  ]) LOOP
    EXECUTE format(
      'DROP TRIGGER IF EXISTS trg_updated_at ON %I;
       CREATE TRIGGER trg_updated_at
       BEFORE UPDATE ON %I
       FOR EACH ROW EXECUTE FUNCTION update_updated_at();', t, t
    );
  END LOOP;
END $$;

-- ====== database/migrations/003_contact_messages.sql ======
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

-- ====== database/migrations/004_shared_timetables.sql ======
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

-- ====== database/migrations/005_curriculum.sql ======

-- ====== database/migrations/006_share_access_codes.sql ======
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

