// Drizzle ORM — Schedu Full Schema
// Aligned with: Schedu Detailed Workaround & Implementation Document
import {
  pgTable, uuid, text, integer, boolean, jsonb,
  timestamp, pgEnum, index, primaryKey,
} from "drizzle-orm/pg-core"

// ─────────────────────────────────────────────────────────────
// ENUMS
// ─────────────────────────────────────────────────────────────

export const boardEnum = pgEnum("board_type", [
  "CBSE", "ICSE", "STATE", "IB", "CAMBRIDGE", "OTHER"
])

export const subscriptionEnum = pgEnum("subscription_plan", [
  "free", "basic", "pro", "enterprise"
])

export const profileTypeEnum = pgEnum("profile_type", [
  "fixed",     // Nursery/KG/Primary — students stay, teachers rotate
  "standard",  // Grade VI–X
  "dynamic",   // Grade XI–XII — optional subjects, parallel blocks
])

export const roomTypeEnum = pgEnum("room_type", [
  "classroom", "lab", "hall", "library", "ground", "other"
])

export const slotTypeEnum = pgEnum("slot_type", [
  "period", "break", "assembly", "activity", "dispersal", "lunch"
])

export const timetableStatusEnum = pgEnum("timetable_status", [
  "draft", "generating", "ready", "published", "error", "locked"
])

// Legacy — kept for backward compat with v2 data
export const orgTypeEnum = pgEnum("org_type", [
  "school", "college", "corporate", "hospital", "ngo", "factory"
])

// ─────────────────────────────────────────────────────────────
// LAYER 0: PLATFORM USERS
// ─────────────────────────────────────────────────────────────

export const users = pgTable("users", {
  id:        uuid("id").primaryKey().defaultRandom(),
  clerkId:   text("clerk_id").unique().notNull(),
  email:     text("email"),
  name:      text("name"),
  plan:      subscriptionEnum("plan").default("free"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
})

// ─────────────────────────────────────────────────────────────
// LAYER 1: RESOURCE ENGINE
// ─────────────────────────────────────────────────────────────

export const organizations = pgTable("organizations", {
  id:               uuid("id").primaryKey().defaultRandom(),
  userId:           uuid("user_id").references(() => users.id, { onDelete: "cascade" }),
  name:             text("name").notNull(),
  board:            boardEnum("board").default("CBSE"),
  country:          text("country").notNull().default("IN"),
  timezone:         text("timezone").notNull().default("Asia/Kolkata"),
  subscriptionPlan: subscriptionEnum("subscription_plan").default("free"),
  logoUrl:          text("logo_url"),
  createdAt:        timestamp("created_at").defaultNow(),
  updatedAt:        timestamp("updated_at").defaultNow(),
}, (t) => [
  index("organizations_user_idx").on(t.userId),
])

export const academicSessions = pgTable("academic_sessions", {
  id:             uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").references(() => organizations.id, { onDelete: "cascade" }),
  name:           text("name").notNull(),         // "2024–25"
  startDate:      text("start_date").notNull(),   // ISO date
  endDate:        text("end_date").notNull(),
  workingDays:    integer("working_days").notNull().default(220),
  weeklyDays:     integer("weekly_days").notNull().default(5),
  createdAt:      timestamp("created_at").defaultNow(),
}, (t) => [
  index("sessions_org_idx").on(t.organizationId),
])

export const schedulingProfiles = pgTable("scheduling_profiles", {
  id:             uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").references(() => organizations.id, { onDelete: "cascade" }),
  name:           text("name").notNull(),
  profileType:    profileTypeEnum("profile_type").notNull().default("standard"),
  grades:         jsonb("grades").default([]),  // string[]
  createdAt:      timestamp("created_at").defaultNow(),
}, (t) => [
  index("profiles_org_idx").on(t.organizationId),
])

export const classes = pgTable("classes", {
  id:              uuid("id").primaryKey().defaultRandom(),
  organizationId:  uuid("organization_id").references(() => organizations.id, { onDelete: "cascade" }),
  sessionId:       uuid("session_id").references(() => academicSessions.id, { onDelete: "cascade" }),
  profileId:       uuid("profile_id").references(() => schedulingProfiles.id, { onDelete: "set null" }),
  grade:           text("grade").notNull(),       // "XI", "IX", "V"
  section:         text("section").notNull(),     // "A", "B", "COM-1"
  stream:          text("stream").default("General"),
  strength:        integer("strength").default(0),
  roomId:          uuid("room_id"),               // FK to classrooms (set after classrooms inserted)
  classTeacherId:  uuid("class_teacher_id"),      // FK to teachers
  createdAt:       timestamp("created_at").defaultNow(),
  updatedAt:       timestamp("updated_at").defaultNow(),
}, (t) => [
  index("classes_org_idx").on(t.organizationId),
  index("classes_session_idx").on(t.sessionId),
])

export const subjectCategories = pgTable("subject_categories", {
  id:   uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull().unique(),
  // Built-in: Compulsory, 4th Optional, 5th Optional, 6th Optional,
  //           Practical, Activity, EST, CCA, Language, Skill
})

export const subjects = pgTable("subjects", {
  id:                       uuid("id").primaryKey().defaultRandom(),
  organizationId:           uuid("organization_id").references(() => organizations.id, { onDelete: "cascade" }),
  name:                     text("name").notNull(),
  shortName:                text("short_name").default(""),
  categoryId:               uuid("category_id").references(() => subjectCategories.id, { onDelete: "set null" }),
  isOptional:               boolean("is_optional").default(false),
  requiresLab:              boolean("requires_lab").default(false),
  requiresConsecutiveSlots: boolean("requires_consecutive_slots").default(false),
  periodsPerWeek:           integer("periods_per_week").default(5),
  sessionDuration:          integer("session_duration").default(45),  // minutes
  maxPeriodsPerDay:         integer("max_periods_per_day").default(2),
  color:                    text("color").default("#6366f1"),
  classConfigs:             jsonb("class_configs").default([]),
  createdAt:                timestamp("created_at").defaultNow(),
}, (t) => [
  index("subjects_org_idx").on(t.organizationId),
])

export const teachers = pgTable("teachers", {
  id:                 uuid("id").primaryKey().defaultRandom(),
  organizationId:     uuid("organization_id").references(() => organizations.id, { onDelete: "cascade" }),
  name:               text("name").notNull(),
  shortName:          text("short_name").default(""),
  specialization:     jsonb("specialization").default([]),   // subject IDs string[]
  maxPeriodsPerWeek:  integer("max_periods_per_week").default(30),
  qualification:      text("qualification").default(""),
  preferences:        jsonb("preferences").default({}),      // TeacherPreferences
  createdAt:          timestamp("created_at").defaultNow(),
  updatedAt:          timestamp("updated_at").defaultNow(),
}, (t) => [
  index("teachers_org_idx").on(t.organizationId),
])

export const classrooms = pgTable("classrooms", {
  id:             uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").references(() => organizations.id, { onDelete: "cascade" }),
  name:           text("name").notNull(),        // "Room 302", "Lab-1"
  building:       text("building").default("Main"),
  floor:          integer("floor").default(0),
  capacity:       integer("capacity").default(40),
  roomType:       roomTypeEnum("room_type").default("classroom"),
  createdAt:      timestamp("created_at").defaultNow(),
}, (t) => [
  index("classrooms_org_idx").on(t.organizationId),
])

export const students = pgTable("students", {
  id:             uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").references(() => organizations.id, { onDelete: "cascade" }),
  classId:        uuid("class_id").references(() => classes.id, { onDelete: "cascade" }),
  rollNo:         text("roll_no").default(""),
  name:           text("name").notNull(),
  createdAt:      timestamp("created_at").defaultNow(),
}, (t) => [
  index("students_class_idx").on(t.classId),
])

// ─────────────────────────────────────────────────────────────
// LAYER 2: ACADEMIC ENGINE
// ─────────────────────────────────────────────────────────────

/**
 * THE MOST IMPORTANT TABLE for XI/XII scheduling.
 * How many students in a class take a subject under a category.
 */
export const sectionSubjectStrengths = pgTable("section_subject_strengths", {
  id:           uuid("id").primaryKey().defaultRandom(),
  classId:      uuid("class_id").references(() => classes.id, { onDelete: "cascade" }),
  subjectId:    uuid("subject_id").references(() => subjects.id, { onDelete: "cascade" }),
  categoryId:   uuid("category_id").references(() => subjectCategories.id, { onDelete: "set null" }),
  studentCount: integer("student_count").default(0),
  createdAt:    timestamp("created_at").defaultNow(),
}, (t) => [
  index("sss_class_idx").on(t.classId),
  index("sss_subject_idx").on(t.subjectId),
])

export const studentSubjectSelections = pgTable("student_subject_selections", {
  id:         uuid("id").primaryKey().defaultRandom(),
  studentId:  uuid("student_id").references(() => students.id, { onDelete: "cascade" }),
  subjectId:  uuid("subject_id").references(() => subjects.id, { onDelete: "cascade" }),
  categoryId: uuid("category_id").references(() => subjectCategories.id, { onDelete: "set null" }),
}, (t) => [
  index("sss_sel_student_idx").on(t.studentId),
])

/** Auto-calculated by Period Allocation Engine */
export const periodAllocations = pgTable("period_allocations", {
  id:                    uuid("id").primaryKey().defaultRandom(),
  sessionId:             uuid("session_id").references(() => academicSessions.id, { onDelete: "cascade" }),
  subjectId:             uuid("subject_id").references(() => subjects.id, { onDelete: "cascade" }),
  classId:               uuid("class_id").references(() => classes.id, { onDelete: "cascade" }),
  suggestedWeeklyPeriods: integer("suggested_weekly_periods").default(5),
  suggestedDailyPeriods:  integer("suggested_daily_periods").default(1),
  totalAnnualHours:       integer("total_annual_hours").default(0),
  cbseNormHours:          integer("cbse_norm_hours"),
  createdAt:              timestamp("created_at").defaultNow(),
})

/** Academic combination groups — the heart of XI/XII optional scheduling */
export const academicCombinations = pgTable("academic_combinations", {
  id:             uuid("id").primaryKey().defaultRandom(),
  sessionId:      uuid("session_id").references(() => academicSessions.id, { onDelete: "cascade" }),
  classId:        uuid("class_id").references(() => classes.id, { onDelete: "cascade" }),
  groupName:      text("group_name").notNull(),    // "SCI-1", "COM-2"
  stream:         text("stream").default("General"),
  totalStrength:  integer("total_strength").default(0),
  subjectSlots:   jsonb("subject_slots").default([]),  // AcademicSubjectSlot[]
  createdAt:      timestamp("created_at").defaultNow(),
  updatedAt:      timestamp("updated_at").defaultNow(),
}, (t) => [
  index("combos_class_idx").on(t.classId),
])

/** Subject scheduling rules */
export const subjectRules = pgTable("subject_rules", {
  id:                       uuid("id").primaryKey().defaultRandom(),
  subjectId:                uuid("subject_id").references(() => subjects.id, { onDelete: "cascade" }).unique(),
  requiresConsecutiveSlots: boolean("requires_consecutive_slots").default(false),
  onlyAfterBreak:           boolean("only_after_break").default(false),
  onlyInFirstHalf:          boolean("only_in_first_half").default(false),
  notLastPeriod:            boolean("not_last_period").default(false),
  notConsecutive:           boolean("not_consecutive").default(false),
  requiredRoomType:         roomTypeEnum("required_room_type"),
  maxConsecutiveCount:      integer("max_consecutive_count").default(1),
})

// ─────────────────────────────────────────────────────────────
// LAYER 3: DYNAMIC SCHEDULING ENGINE
// ─────────────────────────────────────────────────────────────

/**
 * Parallel blocks: a set of optional subjects that MUST run simultaneously.
 * e.g. {Maths, Biology, PED, Painting} — students split into clusters.
 */
export const parallelBlocks = pgTable("parallel_blocks", {
  id:         uuid("id").primaryKey().defaultRandom(),
  sessionId:  uuid("session_id").references(() => academicSessions.id, { onDelete: "cascade" }),
  name:       text("name").notNull(),
  grade:      text("grade").notNull(),
  stream:     text("stream").default("General"),
  subjectIds: jsonb("subject_ids").default([]),  // string[]
  createdAt:  timestamp("created_at").defaultNow(),
}, (t) => [
  index("blocks_session_idx").on(t.sessionId),
])

/**
 * Instructional clusters: the actual teaching unit.
 * e.g. "XI-C Maths" = students from XI-C who take Maths (20 students).
 * Multiple clusters share a parallel block and run at the same time.
 */
export const instructionalClusters = pgTable("instructional_clusters", {
  id:              uuid("id").primaryKey().defaultRandom(),
  sessionId:       uuid("session_id").references(() => academicSessions.id, { onDelete: "cascade" }),
  classId:         uuid("class_id").references(() => classes.id, { onDelete: "cascade" }),
  subjectId:       uuid("subject_id").references(() => subjects.id, { onDelete: "cascade" }),
  clusterName:     text("cluster_name").notNull(),   // "XI-C Maths"
  studentCount:    integer("student_count").default(0),
  parallelBlockId: uuid("parallel_block_id").references(() => parallelBlocks.id, { onDelete: "set null" }),
  assignedRoomId:  uuid("assigned_room_id").references(() => classrooms.id, { onDelete: "set null" }),
  assignedTeacherId: uuid("assigned_teacher_id").references(() => teachers.id, { onDelete: "set null" }),
  createdAt:       timestamp("created_at").defaultNow(),
}, (t) => [
  index("clusters_session_idx").on(t.sessionId),
  index("clusters_class_idx").on(t.classId),
  index("clusters_block_idx").on(t.parallelBlockId),
])

/** Bell schedule definition */
export const bellSchedules = pgTable("bell_schedules", {
  id:             uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").references(() => organizations.id, { onDelete: "cascade" }),
  name:           text("name").notNull(),
  workDays:       jsonb("work_days").default([]),  // ["MONDAY","TUESDAY",...]
  createdAt:      timestamp("created_at").defaultNow(),
})

/** Individual time slots within a bell schedule */
export const timeSlots = pgTable("time_slots", {
  id:             uuid("id").primaryKey().defaultRandom(),
  bellScheduleId: uuid("bell_schedule_id").references(() => bellSchedules.id, { onDelete: "cascade" }),
  dayIndex:       integer("day_index").notNull(),    // 0 = Monday
  slotIndex:      integer("slot_index").notNull(),   // order within day
  startTime:      text("start_time").notNull(),
  endTime:        text("end_time").notNull(),
  slotType:       slotTypeEnum("slot_type").default("period"),
  shiftId:        text("shift_id"),
  createdAt:      timestamp("created_at").defaultNow(),
}, (t) => [
  index("slots_schedule_idx").on(t.bellScheduleId),
])

// ─────────────────────────────────────────────────────────────
// LAYER 4: TIMETABLE OUTPUT
// ─────────────────────────────────────────────────────────────

/**
 * A session instance is a single scheduled occurrence:
 * cluster X taught by teacher Y in room Z at time slot T.
 */
export const sessionInstances = pgTable("session_instances", {
  id:                  uuid("id").primaryKey().defaultRandom(),
  sessionId:           uuid("session_id").references(() => academicSessions.id, { onDelete: "cascade" }),
  clusterId:           uuid("cluster_id").references(() => instructionalClusters.id, { onDelete: "cascade" }),
  teacherId:           uuid("teacher_id").references(() => teachers.id, { onDelete: "set null" }),
  roomId:              uuid("room_id").references(() => classrooms.id, { onDelete: "set null" }),
  timeSlotId:          uuid("time_slot_id").references(() => timeSlots.id, { onDelete: "cascade" }),
  isSubstituted:       boolean("is_substituted").default(false),
  substituteTeacherId: uuid("substitute_teacher_id").references(() => teachers.id, { onDelete: "set null" }),
  createdAt:           timestamp("created_at").defaultNow(),
}, (t) => [
  index("instances_session_idx").on(t.sessionId),
  index("instances_cluster_idx").on(t.clusterId),
  index("instances_slot_idx").on(t.timeSlotId),
])

/** Timetable meta + full generated data (used by API) */
export const timetables = pgTable("timetables", {
  id:           uuid("id").primaryKey().defaultRandom(),
  userId:       uuid("user_id").references(() => users.id, { onDelete: "cascade" }),
  sessionId:    uuid("session_id").references(() => academicSessions.id, { onDelete: "set null" }),
  name:         text("name").notNull(),
  status:       timetableStatusEnum("status").default("draft"),
  healthScore:  jsonb("health_score").default({}),    // TimetableHealthScore
  config:       jsonb("config").default({}),          // WizardConfig snapshot
  data:         jsonb("data").default({}),            // Full timetable data
  publishedAt:  timestamp("published_at"),
  lockedAt:     timestamp("locked_at"),
  createdAt:    timestamp("created_at").defaultNow(),
  updatedAt:    timestamp("updated_at").defaultNow(),
}, (t) => [
  index("timetables_user_idx").on(t.userId),
  index("timetables_session_idx").on(t.sessionId),
])

/** Versioned snapshots for rollback */
export const timetableVersions = pgTable("timetable_versions", {
  id:          uuid("id").primaryKey().defaultRandom(),
  timetableId: uuid("timetable_id").references(() => timetables.id, { onDelete: "cascade" }),
  version:     integer("version").notNull(),
  label:       text("label"),              // "Before Sports Day adjustment"
  data:        jsonb("data").default({}),
  createdAt:   timestamp("created_at").defaultNow(),
}, (t) => [
  index("versions_timetable_idx").on(t.timetableId),
])

/** Audit log for institutional accountability */
export const auditLogs = pgTable("audit_logs", {
  id:           uuid("id").primaryKey().defaultRandom(),
  timetableId:  uuid("timetable_id").references(() => timetables.id, { onDelete: "cascade" }),
  userId:       uuid("user_id").references(() => users.id, { onDelete: "set null" }),
  action:       text("action").notNull(),      // "cell_edited", "teacher_changed", etc.
  entityType:   text("entity_type"),           // "session_instance", "teacher", etc.
  entityId:     text("entity_id"),
  previousValue: jsonb("previous_value"),
  newValue:      jsonb("new_value"),
  createdAt:    timestamp("created_at").defaultNow(),
}, (t) => [
  index("audit_timetable_idx").on(t.timetableId),
])

// ─────────────────────────────────────────────────────────────
// OPERATIONAL: SUBSTITUTIONS
// ─────────────────────────────────────────────────────────────

export const absenceRecords = pgTable("absence_records", {
  id:            uuid("id").primaryKey().defaultRandom(),
  timetableId:   uuid("timetable_id").references(() => timetables.id, { onDelete: "cascade" }),
  teacherId:     uuid("teacher_id").references(() => teachers.id, { onDelete: "cascade" }),
  date:          text("date").notNull(),     // ISO date
  periodIds:     jsonb("period_ids").default([]),
  reason:        text("reason"),
  substitutions: jsonb("substitutions").default([]),  // AppliedSubstitution[]
  createdAt:     timestamp("created_at").defaultNow(),
}, (t) => [
  index("absence_timetable_idx").on(t.timetableId),
  index("absence_teacher_idx").on(t.teacherId),
])

// Legacy — kept for backward compat
export const substitutions = pgTable("substitutions", {
  id:            uuid("id").primaryKey().defaultRandom(),
  timetableId:   uuid("timetable_id").references(() => timetables.id, { onDelete: "cascade" }),
  absentStaff:   text("absent_staff").notNull(),
  day:           text("day").notNull(),
  substitutions: jsonb("substitutions").default([]),
  appliedAt:     timestamp("applied_at").defaultNow(),
})
