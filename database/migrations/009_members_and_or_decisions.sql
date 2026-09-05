-- 009_members_and_or_decisions.sql
--
-- Two tables that together let a TEACHER act on a school's timetable, which is
-- the first thing in this app that more than one person has ever needed to
-- write to.
--
-- Everything until now has been local-first: a school's roster, its schedules
-- and its dated overlays live in the admin's browser, with the server holding
-- a snapshot for that one account. That is fine while one person edits. It
-- cannot work the moment a teacher on their own phone taps "I'll take this
-- slot" and the corridor board is expected to notice.
--
-- WHY THE SCHOOL IS AN OWNER_ID AND NOT A SCHOOL_ID. There is no schools table,
-- and inventing one here would mean migrating every existing account into it
-- blind. A school is currently "the account that owns the timetables", so
-- membership hangs off that user. When schools become first-class this becomes
-- a rename, not a rethink.

-- ── Who belongs to a school, and as what ───────────────────────────────────
--
-- The roster in store/members.ts is client-side and says so in its own doc
-- comment: "nothing here is enforced on the server... someone determined can
-- edit their own browser storage." This is the server's answer, and it is the
-- one that decides whether a request is allowed.
--
-- staff_name matters as much as email: the timetable names teachers by their
-- ROSTER NAME ("R. Rao"), not by login. Without the mapping, a signed-in user
-- cannot be matched to the lessons that are theirs.
CREATE TABLE IF NOT EXISTS school_members (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  email       TEXT NOT NULL,
  -- Set once the invited person signs in; NULL while the invitation is open.
  user_id     UUID REFERENCES users(id) ON DELETE SET NULL,
  staff_name  TEXT,
  role        TEXT NOT NULL DEFAULT 'teacher'
                CHECK (role IN ('admin', 'teacher', 'viewer')),
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW(),
  -- One membership per person per school. Emails are stored lower-cased by the
  -- handler so this actually holds.
  UNIQUE (owner_id, email)
);

CREATE INDEX IF NOT EXISTS idx_school_members_email   ON school_members (email);
CREATE INDEX IF NOT EXISTS idx_school_members_user    ON school_members (user_id);
CREATE INDEX IF NOT EXISTS idx_school_members_owner   ON school_members (owner_id);

-- ── Which subject an OR period actually runs, on one date ──────────────────
--
-- An OR group is a subject choice for a whole class — "Physics OR Chemistry" —
-- resolved by syllabus coverage unless a person decides otherwise. The choice
-- is DATED, not permanent, for the same reason a substitution is: "we are doing
-- Physics this Tuesday because I have the lab" is a fact about Tuesday, and
-- writing it into the timetable would make it true every Tuesday until somebody
-- noticed.
--
-- Absence of a row is meaningful: it means nobody has decided, and coverage
-- picks. Clearing a decision deletes the row rather than writing a blank.
CREATE TABLE IF NOT EXISTS or_decisions (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  timetable_id  UUID NOT NULL REFERENCES timetables(id) ON DELETE CASCADE,
  section       TEXT NOT NULL,
  on_date       DATE NOT NULL,
  period_id     TEXT NOT NULL,
  subject       TEXT NOT NULL,
  -- The roster name of whoever claimed it, for "chosen by R. Rao" on the day.
  decided_by    TEXT,
  decided_at    TIMESTAMPTZ DEFAULT NOW(),
  -- One decision per slot per day. A second claim UPDATEs rather than stacking,
  -- so two teachers racing for the same period cannot leave the class with two
  -- answers — the later one wins and is visible as such.
  UNIQUE (timetable_id, section, on_date, period_id)
);

CREATE INDEX IF NOT EXISTS idx_or_decisions_lookup
  ON or_decisions (timetable_id, on_date);
