import { z } from 'zod'

// ═══════════════════════════════════════════════════════════════
//  SCHEDU — Complete Data Model
//  Aligned with: Schedu Detailed Workaround & Implementation Doc
// ═══════════════════════════════════════════════════════════════

// ─────────────────────────────────────────────────────────────
// 1. CORE ENUMS
// ─────────────────────────────────────────────────────────────

/** Board/curriculum type */
export type BoardType = 'CBSE' | 'ICSE' | 'STATE' | 'IB' | 'CAMBRIDGE' | 'OTHER'

/** Academic stream for XI/XII */
export type StreamType = 'Science' | 'Commerce' | 'Humanities' | 'General' | string

/**
 * Scheduling profile determines HOW the timetable is built.
 * - fixed:    Nursery/KG/Primary — students stay, teachers rotate
 * - standard: Grade VI–X         — standard subject+teacher scheduling
 * - dynamic:  Grade XI–XII       — students move, optional subjects, parallel blocks
 */
export type ProfileType = 'fixed' | 'standard' | 'dynamic'

/** Subject category as used in CBSE academic matrix */
export type SubjectCategoryType =
  | 'Compulsory'
  | '4th Optional'
  | '5th Optional'
  | '6th Optional'
  | 'Practical'
  | 'Activity'
  | 'EST'
  | 'CCA'
  | 'Language'
  | 'Skill'
  | string

/** Room/facility type */
export type RoomType = 'classroom' | 'lab' | 'hall' | 'library' | 'ground' | 'other'

/** Slot type within a bell schedule */
export type SlotType = 'period' | 'break' | 'assembly' | 'activity' | 'dispersal' | 'lunch'

/** Timetable lifecycle status */
export type TimetableStatus = 'draft' | 'generating' | 'ready' | 'published' | 'error' | 'locked'

/** Subscription tier */
export type SubscriptionPlan = 'free' | 'basic' | 'pro' | 'enterprise'

/** Org type — kept for multi-context support */
export type OrgType = 'school' | 'college' | 'corporate' | 'hospital' | 'ngo' | 'factory'
export const OrgTypeSchema = z.enum(['school', 'college', 'corporate', 'hospital', 'ngo', 'factory'])

// ─────────────────────────────────────────────────────────────
// 2. ORGANIZATION & SESSION
// ─────────────────────────────────────────────────────────────

export interface Organization {
  id: string
  name: string
  board: BoardType
  country: string
  timezone: string
  subscriptionPlan: SubscriptionPlan
  logoUrl?: string
}

export const OrganizationSchema = z.object({
  id: z.string(),
  name: z.string().min(1),
  board: z.string(),
  country: z.string(),
  timezone: z.string(),
  subscriptionPlan: z.enum(['free', 'basic', 'pro', 'enterprise']).default('free'),
  logoUrl: z.string().optional(),
})

export interface AcademicSession {
  id: string
  organizationId: string
  name: string           // e.g. "2024–25"
  startDate: string      // ISO date
  endDate: string        // ISO date
  workingDays: number    // total working days in session
  weeklyDays: number     // days per week (5 or 6)
}

export const AcademicSessionSchema = z.object({
  id: z.string(),
  organizationId: z.string(),
  name: z.string().min(1),
  startDate: z.string(),
  endDate: z.string(),
  workingDays: z.number().int().positive(),
  weeklyDays: z.number().int().min(1).max(7),
})

// ─────────────────────────────────────────────────────────────
// 3. SCHEDULING PROFILE
// ─────────────────────────────────────────────────────────────

export interface SchedulingProfile {
  id: string
  organizationId: string
  name: string
  profileType: ProfileType
  /**
   * Grades covered by this profile, e.g. ["Nursery","KG","I","II","III"]
   * or ["XI","XII"]
   */
  grades: string[]
}

export const SchedulingProfileSchema = z.object({
  id: z.string(),
  organizationId: z.string(),
  name: z.string().min(1),
  profileType: z.enum(['fixed', 'standard', 'dynamic']),
  grades: z.array(z.string()).default([]),
})

// ─────────────────────────────────────────────────────────────
// 4. CLASSES
// ─────────────────────────────────────────────────────────────

export interface SchoolClass {
  id: string
  organizationId: string
  profileId: string
  grade: string          // e.g. "XI", "IX", "V"
  section: string        // e.g. "A", "B", "COM-1"
  stream: StreamType     // "Science" | "Commerce" | "Humanities" | "General"
  strength: number       // total students
  roomId: string         // default classroom
  classTeacherId?: string
}

export const SchoolClassSchema = z.object({
  id: z.string(),
  organizationId: z.string(),
  profileId: z.string(),
  grade: z.string().min(1),
  section: z.string().min(1),
  stream: z.string().default('General'),
  strength: z.number().int().min(0),
  roomId: z.string(),
  classTeacherId: z.string().optional(),
})

/** Derived display helper */
export function classLabel(c: SchoolClass): string {
  return `${c.grade}-${c.section}`
}

// ─────────────────────────────────────────────────────────────
// 5. SUBJECTS & CATEGORIES
// ─────────────────────────────────────────────────────────────

export interface SubjectCategory {
  id: string
  name: SubjectCategoryType
  description?: string
}

export const BUILT_IN_CATEGORIES: SubjectCategoryType[] = [
  'Compulsory',
  '4th Optional',
  '5th Optional',
  '6th Optional',
  'Practical',
  'Activity',
  'EST',
  'CCA',
  'Language',
  'Skill',
]

export interface Subject {
  id: string
  organizationId?: string  // optional for wizard-created subjects
  name: string
  shortName?: string
  category?: SubjectCategoryType
  /** schedU subject type — drives scheduling path:
   *  'core' = mandatory single-subject period
   *  'optional' = part of an OptionalBlock (parallel offerings)
   *  'lab' = specialized room required (Chemistry Lab, Computer Lab, etc.) */
  subjectType?: SubjectType
  isOptional?: boolean
  /** If set, this subject belongs to a named regional-language / elective slot
   *  (e.g. "R1", "R2", "R3"). Subjects sharing the same slot are mutually
   *  exclusive — students pick exactly one per slot. The slot name is used as the
   *  column-group header in the Student Groups preference matrix. For subjects
   *  that appear in MULTIPLE slots simultaneously (e.g. Hindi in R1, R2 and R3)
   *  the slot relationship is defined on the OR-combo's `slotLabel` instead — see
   *  SubjectAndOrGroup. */
  electiveSlotId?: string
  requiresLab?: boolean
  requiresConsecutiveSlots?: boolean
  periodsPerWeek: number
  sessionDuration: number
  maxPeriodsPerDay: number
  color: string
  sections?: string[]      // legacy: section names this subject applies to
  classConfigs: SubjectClassConfig[]
  /** Optional capacity per session — relevant for activity/elective subjects */
  capacity?: number
  /** Room type required (e.g. 'lab', 'ground', 'art-room') — drives room allocation */
  roomTypeRequired?: RoomType
  /** schedU Scope System — when set, subject can only be scheduled where allowed */
  scope?: ScopeMatrix
  /** schedU Cross-Class Grouping behavior (Doc: Part 3).
   *  Controls how the AI may merge sections for parallel/optional sessions.
   *    NO_GROUPING         — isolated to one section only
   *    SAME_GRADE_ONLY     — only siblings within the same grade may pool
   *    CROSS_GRADE_ALLOWED — different grades may pool (PE, assembly, etc.)
   *    FLEXIBLE_GROUPING   — AI decides dynamically based on capacity + room */
  groupingBehavior?: 'NO_GROUPING' | 'SAME_GRADE_ONLY' | 'CROSS_GRADE_ALLOWED' | 'FLEXIBLE_GROUPING'
}

export interface SubjectClassConfig {
  classId?: string
  sectionName?: string     // legacy alias (used by wizard steps)
  periodsPerWeek: number
  maxPeriodsPerDay: number
  sessionDuration: number
  /** Per-section category override (falls back to Subject.category when absent) */
  category?: string
  /** Per-section lab requirement override */
  requiresLab?: boolean
  /** Per-section elective flag — when true, students choose this subject from a
   *  list of options for this specific class. Drives the Groups preference matrix.
   *  Setting this on any section also sets the global Subject.isOptional flag. */
  isOptional?: boolean
  /** Per-section elective slot name (e.g. "R1", "R2", "PCM", "4th-Option").
   *  Subjects sharing the same slot are mutually exclusive for that class. */
  electiveSlotId?: string
}

export const SubjectSchema = z.object({
  id: z.string(),
  organizationId: z.string(),
  name: z.string().min(1),
  shortName: z.string().default(''),
  category: z.string().default('Compulsory'),
  isOptional: z.boolean().default(false),
  electiveSlotId: z.string().optional(),
  requiresLab: z.boolean().default(false),
  requiresConsecutiveSlots: z.boolean().default(false),
  periodsPerWeek: z.number().int().min(0).default(5),
  sessionDuration: z.number().default(40),
  maxPeriodsPerDay: z.number().default(2),
  color: z.string().default('#7C6FE0'),
  classConfigs: z.array(z.object({
    classId: z.string(),
    periodsPerWeek: z.number(),
    maxPeriodsPerDay: z.number(),
    sessionDuration: z.number(),
  })).default([]),
})

/** Subject expression types for the Academic Matrix */
export type ExpressionType = 'AND' | 'OR' | 'NONE'

/** A single cell entry in the Academic Combination Matrix */
export interface SubjectExpression {
  raw: string               // e.g. "PE OR Painting", "Eng+Phy+Chem", "NONE"
  type: ExpressionType
  subjects: string[]        // resolved subject names
  strengthMap: Record<string, number> // subjectName → studentCount
}

/** Parse a raw expression string into a SubjectExpression */
export function parseSubjectExpression(raw: string): SubjectExpression {
  const trimmed = raw.trim()
  if (!trimmed || trimmed.toUpperCase() === 'NONE') {
    return { raw, type: 'NONE', subjects: [], strengthMap: {} }
  }
  if (trimmed.includes(' OR ')) {
    const subjects = trimmed.split(' OR ').map(s => s.trim()).filter(Boolean)
    return { raw, type: 'OR', subjects, strengthMap: {} }
  }
  const subjects = trimmed.split(/[+,]/).map(s => s.trim()).filter(Boolean)
  return { raw, type: 'AND', subjects, strengthMap: {} }
}

// PCM / PCB alias expansion
export const SUBJECT_ALIASES: Record<string, string[]> = {
  PCM:  ['Physics', 'Chemistry', 'Mathematics'],
  PCB:  ['Physics', 'Chemistry', 'Biology'],
  PCMB: ['Physics', 'Chemistry', 'Mathematics', 'Biology'],
  CBSE_SCI: ['English', 'Physics', 'Chemistry'],
}

// ─────────────────────────────────────────────────────────────
// 6. TEACHERS
// ─────────────────────────────────────────────────────────────

export interface TeacherPreferences {
  preferredPeriods: string[]      // period IDs preferred
  avoidedPeriods: string[]        // period IDs to avoid
  preferredClasses: string[]      // class IDs preferred
  floorPreference: number | null
  maxConsecutivePeriods: number
  preferredOffDay: string | null  // e.g. "SATURDAY"
}

/**
 * Per-teacher slot availability matrix.
 *   'available'  — normal teachable slot (default)
 *   'preferred'  — soft preference to schedule here (solver bonus)
 *   'blocked'    — hard constraint — solver must NOT place lessons here
 *
 * Shape: teacherName → day (uppercase) → periodId → SlotStatus
 * Absence of a key is treated as 'available'.
 */
export type SlotStatus = 'available' | 'preferred' | 'blocked'
export type TeacherAvailability = Record<string, Record<string, Record<string, SlotStatus>>>

export interface Teacher {
  id: string
  organizationId: string
  name: string
  shortName: string
  specialization: string[]        // subject IDs they can teach
  maxPeriodsPerWeek: number
  qualification: string
  preferences: TeacherPreferences
}

export const TeacherSchema = z.object({
  id: z.string(),
  organizationId: z.string(),
  name: z.string().min(1),
  shortName: z.string().default(''),
  specialization: z.array(z.string()).default([]),
  maxPeriodsPerWeek: z.number().int().positive().default(30),
  qualification: z.string().default(''),
  preferences: z.object({
    preferredPeriods: z.array(z.string()).default([]),
    avoidedPeriods: z.array(z.string()).default([]),
    preferredClasses: z.array(z.string()).default([]),
    floorPreference: z.number().nullable().default(null),
    maxConsecutivePeriods: z.number().default(3),
    preferredOffDay: z.string().nullable().default(null),
  }).default({}),
})

// ─────────────────────────────────────────────────────────────
// 7. CLASSROOMS
// ─────────────────────────────────────────────────────────────

export interface Classroom {
  id: string
  organizationId: string
  name: string           // e.g. "Room 302", "Lab-1"
  building: string
  floor: number
  capacity: number
  roomType: RoomType
}

export const ClassroomSchema = z.object({
  id: z.string(),
  organizationId: z.string(),
  name: z.string().min(1),
  building: z.string().default('Main'),
  floor: z.number().int().default(0),
  capacity: z.number().int().min(1).default(40),
  roomType: z.enum(['classroom', 'lab', 'hall', 'library', 'ground', 'other']).default('classroom'),
})

// ─────────────────────────────────────────────────────────────
// 8. STUDENTS
// ─────────────────────────────────────────────────────────────

export interface Student {
  id: string
  organizationId: string
  classId: string
  rollNo: string
  name: string
}

export const StudentSchema = z.object({
  id: z.string(),
  organizationId: z.string(),
  classId: z.string(),
  rollNo: z.string().default(''),
  name: z.string().min(1),
})

// ─────────────────────────────────────────────────────────────
// 9. SECTION SUBJECT STRENGTHS (THE MOST IMPORTANT TABLE)
//    Foundation of XI/XII scheduling
// ─────────────────────────────────────────────────────────────

/**
 * How many students in a given class take a specific subject under a category.
 * e.g. XI-C → Maths (4th Optional) → 20 students
 */
export interface SectionSubjectStrength {
  id: string
  classId: string
  subjectId: string
  categoryId: string   // SubjectCategory.id
  studentCount: number
}

export const SectionSubjectStrengthSchema = z.object({
  id: z.string(),
  classId: z.string(),
  subjectId: z.string(),
  categoryId: z.string(),
  studentCount: z.number().int().min(0),
})

/** Per-student subject selection (for personalised timetables) */
export interface StudentSubjectSelection {
  id: string
  studentId: string
  subjectId: string
  categoryId: string
}

// ─────────────────────────────────────────────────────────────
// 10. INSTRUCTIONAL CLUSTERS & PARALLEL BLOCKS
//     Core of dynamic XI/XII scheduling
// ─────────────────────────────────────────────────────────────

/**
 * An instructional cluster is the actual teaching unit.
 * e.g. "XI-C Maths" = students from XI-C who take Maths
 * Multiple clusters across sections can share a parallel block.
 */
export interface InstructionalCluster {
  id: string
  classId: string
  subjectId: string
  clusterName: string      // e.g. "XI-C Maths", "XI-C Biology"
  studentCount: number
  parallelBlockId: string | null
  assignedRoomId?: string
  assignedTeacherId?: string
}

export const InstructionalClusterSchema = z.object({
  id: z.string(),
  classId: z.string(),
  subjectId: z.string(),
  clusterName: z.string(),
  studentCount: z.number().int().min(0),
  parallelBlockId: z.string().nullable().default(null),
  assignedRoomId: z.string().optional(),
  assignedTeacherId: z.string().optional(),
})

/**
 * A parallel block groups mutually exclusive optional subjects
 * that must run at the SAME time slot.
 * e.g. {Maths, Biology, PED, Painting} — one time slot, students split into clusters
 */
export interface ParallelBlock {
  id: string
  name: string
  grade: string
  stream: StreamType
  subjectIds: string[]     // subjects in this block (run simultaneously)
}

export const ParallelBlockSchema = z.object({
  id: z.string(),
  name: z.string(),
  grade: z.string(),
  stream: z.string(),
  subjectIds: z.array(z.string()).default([]),
})

// ─────────────────────────────────────────────────────────────
// 11. BELL SCHEDULE & TIME SLOTS
// ─────────────────────────────────────────────────────────────

export interface BellSchedule {
  id: string
  organizationId: string
  name: string
  workDays: string[]     // ["MONDAY","TUESDAY",...]
  slots: TimeSlot[]
}

export interface TimeSlot {
  id: string
  dayIndex: number       // 0 = Monday
  slotIndex: number      // order within day
  startTime: string      // "09:00"
  endTime: string        // "09:45"
  slotType: SlotType
  shiftId?: string       // for multi-shift schools
}

export const TimeSlotSchema = z.object({
  id: z.string(),
  dayIndex: z.number().int().min(0),
  slotIndex: z.number().int().min(0),
  startTime: z.string(),
  endTime: z.string(),
  slotType: z.enum(['period', 'break', 'assembly', 'activity', 'dispersal', 'lunch']).default('period'),
  shiftId: z.string().optional(),
})

/** Multi-shift support (morning/afternoon shifts) */
export interface Shift {
  id: string
  name: string               // "Morning Shift", "Afternoon Shift"
  startTime: string          // "07:00"
  endTime: string            // "12:30"
  assignedClasses: string[]  // class IDs
}

// ─────────────────────────────────────────────────────────────
// 12. SESSION INSTANCES (Scheduled Periods)
//     The actual timetable — what happens where and when
// ─────────────────────────────────────────────────────────────

export interface SessionInstance {
  id: string
  clusterId: string       // InstructionalCluster.id
  teacherId: string
  roomId: string
  timeSlotId: string
  isSubstituted?: boolean
  substituteTeacherId?: string
}

// ─────────────────────────────────────────────────────────────
// OPTIONAL-BLOCK / COMBINATION SUPPORT (Final spec MVP)
// schedU's key differentiator: one period can host multiple
// parallel subjects (PE / Art / Painting) — each with its own
// teacher, room, and capacity. Students self-select; the system
// only tracks combination-wise strength, not individual students.
// ─────────────────────────────────────────────────────────────

/** Subject scheduling type — drives which engine path is used */
export type SubjectType = 'core' | 'optional' | 'lab'

/** A single option inside an optional block.
 *  Example: PE → Ground (Capacity 50, Teacher M.Rao). */
export interface OptionalOption {
  subjectId?: string
  subject: string
  teacher: string
  teacherId?: string
  room: string
  roomId?: string
  capacity?: number          // max seats for this option
  allocatedStrength?: number // students choosing this option
}

/** An Optional Block — multiple parallel subjects scheduled
 *  into the same period across one or more sections.
 *  E.g. OPTIONAL_BLOCK_1 = [PE, Art, Painting] on Tue Period 3. */
export interface OptionalBlock {
  id: string
  name: string                 // e.g. "OPTIONAL_BLOCK_1" or "XI Optional A"
  sectionNames: string[]       // sections sharing this block (cross-section pooling)
  day: string                  // DOW key, e.g. "MONDAY"
  periodId: string             // bell schedule slot id
  options: OptionalOption[]    // parallel subjects in this block
  totalCapacity?: number       // sum of option capacities
  periodsPerWeek?: number      // pinned weekly slot count (overrides subject-derived quota)
  logic?: 'AND' | 'OR'         // cell display joiner — AND = parallel split, OR = rotation (default)
  slotId?: string              // named elective slot (R1/R2/R3) — independent teaching instance
}

export const OptionalBlockSchema = z.object({
  id: z.string(),
  name: z.string().min(1),
  sectionNames: z.array(z.string()),
  day: z.string(),
  periodId: z.string(),
  options: z.array(z.object({
    subjectId: z.string().optional(),
    subject: z.string(),
    teacher: z.string(),
    teacherId: z.string().optional(),
    room: z.string(),
    roomId: z.string().optional(),
    capacity: z.number().int().optional(),
    allocatedStrength: z.number().int().optional(),
  })),
  totalCapacity: z.number().int().optional(),
  periodsPerWeek: z.number().int().optional(),
  logic: z.enum(['AND', 'OR']).optional(),
  slotId: z.string().optional(),
})

/** A subject combination — e.g. "PCM + CS" with strength.
 *  schedU uses combinations (not student rosters) to size sessions. */
export interface SubjectCombination {
  id: string
  className: string            // "XI Science", "XI Commerce" etc.
  name: string                 // "PCM + CS", "Commerce + Applied Math"
  subjects: string[]           // resolved subject names
  strength: number             // student headcount in this combination
}

export const SubjectCombinationSchema = z.object({
  id: z.string(),
  className: z.string(),
  name: z.string().min(1),
  subjects: z.array(z.string()),
  strength: z.number().int().min(0),
})

// ─────────────────────────────────────────────────────────────
// schedU Scope System — per-entity slot allowability matrix
// ─────────────────────────────────────────────────────────────

/** A single cell in a ScopeMatrix: structural allow/disallow.
 *  - allowed  = entity may be scheduled in this slot (default)
 *  - disabled = entity may NOT be scheduled (soft visual hint, AI avoids)
 *  - locked   = HARD constraint, AI must never violate */
export type ScopeState = 'allowed' | 'disabled' | 'locked'

/** Slot-allowability matrix attached to any entity (Teacher, Subject,
 *  Room, Class, Section, ElectivePool, Activity).
 *
 *  Shape: day -> periodId -> state. Missing entries default to 'allowed'.
 *  When ALL entries are missing/'allowed', the entity is unscoped.
 *
 *  AI Engine treats 'locked' as a HARD constraint; 'disabled' as a
 *  strong soft penalty. */
export interface ScopeMatrix {
  /** day key (DOW_KEY) -> periodId -> state */
  cells: Record<string, Record<string, ScopeState>>
  /** Optional human-readable rationale for the constraint */
  note?: string
}

export const ScopeMatrixSchema = z.object({
  cells: z.record(z.string(), z.record(z.string(), z.enum(['allowed', 'disabled', 'locked']))),
  note: z.string().optional(),
})

/** Helper: lookup state for (day, periodId); defaults to 'allowed' */
export function getScopeState(matrix: ScopeMatrix | undefined, day: string, periodId: string): ScopeState {
  return matrix?.cells?.[day]?.[periodId] ?? 'allowed'
}

/** Helper: is the entity allowed in this slot? (locked = no, disabled = no) */
export function isScopeAllowed(matrix: ScopeMatrix | undefined, day: string, periodId: string): boolean {
  return getScopeState(matrix, day, periodId) === 'allowed'
}

/** schedU Phase 6 — Simplified section-strength matrix.
 *
 *  Per-section, how many students take each subject. From this single
 *  matrix the AI engine infers EVERYTHING:
 *    - Which subjects are core (strength = section total)
 *    - Which are optional (strength < section total)
 *    - Which optionals run in parallel within a section (sum to total)
 *    - Which subjects pool across sections (same optional in multiple sections)
 *
 *  Example:
 *    XI-A (Science): English=40, Maths=40, PE=20, Art=20  -> 40 total
 *    XI-B (Commerce): English=40, Maths=40, PE=15, Art=25 -> 40 total
 *
 *  Engine derives: PE+Art is a parallel optional block, pooled across
 *  XI-A & XI-B, total capacity PE=35 / Art=45. No manual block authoring. */
export interface SectionStrength {
  sectionName: string
  stream?: string                          // "Science" / "Commerce" / "Humanities" / "General"
  totalStudents?: number                   // optional explicit roster size
  subjectStrengths: Record<string, number> // { "English": 40, "PE": 20, ... }
}

export const SectionStrengthSchema = z.object({
  sectionName: z.string().min(1),
  stream: z.string().optional(),
  totalStudents: z.number().int().min(0).optional(),
  subjectStrengths: z.record(z.string(), z.number().int().min(0)).default({}),
})

/** A single cell in any timetable grid view.
 *  Either a SINGLE subject (core/lab) OR an OPTIONAL BLOCK (multiple parallel options). */
export interface TimetableCell {
  subject: string
  subjectId?: string
  teacher: string
  teacherId?: string
  room: string
  roomId?: string
  clusterId?: string
  isClassTeacher?: boolean
  isSubstituted?: boolean
  substituteTeacher?: string
  /** When this cell is an optional block, options[] is populated
   *  with the parallel subjects. The top-level subject/teacher/room
   *  still reflect the first option for backwards compatibility. */
  optionalBlockId?: string
  options?: OptionalOption[]
  /**
   * Per-subject teacher + room for OR / AND group cells.
   * When present, each entry overrides the cell-level teacher/room for
   * that specific subject. The cell-level teacher/room fields are kept
   * as the first subject's values for backward-compatibility with
   * rebuildTeacherTT and conflict detection.
   */
  groupAssignments?: Array<{ subject: string; teacher?: string; room?: string }>
}

/** Class-view timetable: section → day → periodId → cell */
export interface ClassTimetable {
  [sectionId: string]: {
    [day: string]: {
      [slotId: string]: TimetableCell
    }
  }
}

/** Teacher-view schedule */
export interface TeacherSchedule {
  teacherId?: string
  classes: string[]
  subjects: string[]
  schedule: {
    [day: string]: {
      [slotId: string]: {
        subject: string
        room: string
        sectionName: string
        isClassTeacher?: boolean
        conflict?: boolean
      }
    }
  }
}

// ─────────────────────────────────────────────────────────────
// 13. ACADEMIC COMBINATION MATRIX (XI/XII)
//     The heart of optional subject scheduling
// ─────────────────────────────────────────────────────────────

/**
 * A combination group describes a set of students in a class
 * who share the same subject combination.
 * e.g. SCI-1: XI-C | Science | 20 students | Eng+Phy+Chem | Maths | Eco | PE OR Painting
 */
export interface AcademicCombination {
  id: string
  groupName: string       // "SCI-1", "COM-2"
  classId: string
  stream: StreamType
  totalStrength: number
  /**
   * Ordered list of subject slots. Each slot corresponds to a category column
   * in the Academic Matrix (Compulsory, 4th Optional, 5th Optional, etc.)
   */
  subjectSlots: AcademicSubjectSlot[]
}

export interface AcademicSubjectSlot {
  category: SubjectCategoryType
  expression: SubjectExpression
}

/** Column definition for the dynamic Academic Matrix */
export interface MatrixColumn {
  id: string
  label: string             // "4th Optional", "Skill Subject"
  category: SubjectCategoryType
  required: boolean
  expressionMode: boolean   // allow OR / NONE expressions
  strengthRequired: boolean // must enter student count per subject
}

export const DEFAULT_MATRIX_COLUMNS: MatrixColumn[] = [
  { id: 'col-compulsory', label: 'Compulsory',   category: 'Compulsory',   required: true,  expressionMode: false, strengthRequired: false },
  { id: 'col-4th',        label: '4th Optional', category: '4th Optional', required: false, expressionMode: true,  strengthRequired: true  },
  { id: 'col-5th',        label: '5th Optional', category: '5th Optional', required: false, expressionMode: true,  strengthRequired: true  },
  { id: 'col-6th',        label: '6th Optional', category: '6th Optional', required: false, expressionMode: true,  strengthRequired: true  },
]

// ─────────────────────────────────────────────────────────────
// 14. SUBJECT RULES
// ─────────────────────────────────────────────────────────────

export interface SubjectRule {
  id: string
  subjectId: string
  requiresConsecutiveSlots: boolean  // practicals need double period
  onlyAfterBreak: boolean            // PT only after recess
  onlyInFirstHalf: boolean           // labs only in first half
  notLastPeriod: boolean             // Maths not last
  notConsecutive: boolean            // Language subjects not consecutive
  requiredRoomType: RoomType | null
  maxConsecutiveCount: number        // max consecutive periods (default 1)
}

export const SubjectRuleSchema = z.object({
  id: z.string(),
  subjectId: z.string(),
  requiresConsecutiveSlots: z.boolean().default(false),
  onlyAfterBreak: z.boolean().default(false),
  onlyInFirstHalf: z.boolean().default(false),
  notLastPeriod: z.boolean().default(false),
  notConsecutive: z.boolean().default(false),
  requiredRoomType: z.string().nullable().default(null),
  maxConsecutiveCount: z.number().default(1),
})

// ─────────────────────────────────────────────────────────────
// 15. PERIOD ALLOCATION & TEACHER REQUIREMENTS
//     Auto-calculated by the Academic Engine
// ─────────────────────────────────────────────────────────────

/** Output of the Period Allocation Engine */
export interface PeriodAllocationResult {
  subjectId: string
  subjectName: string
  suggestedWeeklyPeriods: number
  suggestedDailyPeriods: number
  totalAnnualHours: number
  cbseNormHours?: number
}

/** Output of the Teacher Requirement Engine */
export interface TeacherRequirementResult {
  subjectId: string
  subjectName: string
  totalWeeklyLoad: number        // sum across all classes
  teacherCapacity: number        // max periods per teacher per week
  teachersRequired: number       // ceil(load / capacity)
  teachersAvailable: number      // currently assigned
  isUnderstaffed: boolean
}

// ─────────────────────────────────────────────────────────────
// 16. TIMETABLE QUALITY & HEALTH
// ─────────────────────────────────────────────────────────────

export interface TimetableHealthScore {
  overall: number           // 0–100
  conflictCount: number     // hard constraint violations
  teacherBalance: number    // workload evenness score
  studentMovement: number   // movement minimization score
  gapQuality: number        // teacher gap score
  subjectDistribution: number
  practicalBalance: number
  breakdown: HealthFactor[]
}

export interface HealthFactor {
  name: string
  score: number
  weight: number
  detail: string
}

// ─────────────────────────────────────────────────────────────
// 17. SUBSTITUTION ENGINE
// ─────────────────────────────────────────────────────────────

export interface SubstituteMatch {
  teacherId: string
  teacherName: string
  matchScore: number         // 0–100
  reasons: string[]          // ["Same subject", "Free period", "Low workload"]
  workloadRisk: 'low' | 'medium' | 'high'
}

export interface AbsenceRecord {
  id: string
  teacherId: string
  date: string               // ISO date
  periodIds: string[]        // affected period IDs
  reason?: string
  substitutions: AppliedSubstitution[]
}

export interface AppliedSubstitution {
  periodId: string
  classId: string
  subjectId: string
  substituteTeacherId: string
  appliedAt: string
}

// ─────────────────────────────────────────────────────────────
// 18. CONFLICT & SUGGESTION
// ─────────────────────────────────────────────────────────────

export interface Conflict {
  type:
    | 'double-booking'
    | 'room-clash'
    | 'overload'
    | 'missing-ct'
    | 'student-clash'
    | 'parallel-sync'
    | 'capacity-exceeded'
    | 'rule-violation'
  message: string
  severity?: 'error' | 'warning'
  teacher?: string
  teacherId?: string
  classId?: string
  day?: string
  period?: string
  subjectId?: string
}

export interface Suggestion {
  type: 'warning' | 'info' | 'error'
  message: string
  action?: string
  affectedEntity?: string
}

// ─────────────────────────────────────────────────────────────
// 19. SCHEDULING ENGINE INTERNALS
// ─────────────────────────────────────────────────────────────

export interface SchedulingRequirement {
  classId: string
  subjectId: string
  weeklyPeriods: number
  maxPeriodsPerDay: number
  sessionDuration: number
  mode: 'period-based' | 'duration-based'
  requiredHours?: number
  clusterId?: string
  parallelBlockId?: string
}

export interface HardConstraint {
  type:
    | 'teacher-clash'
    | 'room-clash'
    | 'weekly-frequency'
    | 'teacher-eligibility'
    | 'shift-boundary'
    | 'break'
    | 'daily-limit'
    | 'parallel-sync'
    | 'capacity'
  description: string
}

export interface SoftConstraint {
  type: string
  penaltyWeight: number
  description: string
}

export const DEFAULT_SOFT_CONSTRAINTS: SoftConstraint[] = [
  { type: 'teacher-gap',          penaltyWeight: 5,  description: 'Minimize free periods between classes for a teacher' },
  { type: 'teacher-overload',     penaltyWeight: 10, description: 'Avoid exceeding max weekly periods' },
  { type: 'consecutive-heavy',    penaltyWeight: 7,  description: 'Avoid consecutive heavy subjects' },
  { type: 'last-period-overload', penaltyWeight: 4,  description: 'Avoid heavy subjects in last period' },
  { type: 'workload-imbalance',   penaltyWeight: 8,  description: 'Balance teacher workload evenly' },
  { type: 'subject-spread',       penaltyWeight: 6,  description: 'Distribute subjects evenly across week' },
  { type: 'student-movement',     penaltyWeight: 5,  description: 'Minimize student movement between rooms' },
]

// ─────────────────────────────────────────────────────────────
// 20. WIZARD CONFIG (setup flow)
// ─────────────────────────────────────────────────────────────

export interface WizardConfig {
  // Step 1 — Organization
  orgType: OrgType | null
  countryCode: string | null
  board: BoardType
  timeFormat: '12h' | '24h'
  timezone: string

  // Step 2 — Bell Schedule
  workDays: string[]
  startTime: string
  endTime: string
  periodsPerDay: number
  numBreaks: number
  defaultSessionDuration: number
  shifts: Shift[]

  // Step 1 — Grade groups selected (e.g. ["primary","middle"])
  gradeGroups: string[]
  schoolName: string
  academicYear: string

  // Step 3 — Resources (counts for quick generation)
  numStaff: number
  numSections: number
  numSubjects: number

  // Step 4 — Academic
  schedulingMode: ProfileType
  hasOptionals: boolean      // XI/XII optional subject mode
  workingDaysPerYear: number

  // Step 6 — Timetable identity
  timetableName: string
  timetableStartDate: string   // YYYY-MM-DD
  timetableEndDate: string     // YYYY-MM-DD

  // Step 2 — class-specific day-off rules  (e.g. Saturday off for Nursery/LKG/UKG)
  // day: short format ('Sat', 'Mon', …)  ·  classes: class keys ('nur', 'lkg', 'ukg', 'i', …)
  dayOffRules?: Array<{ id: string; day: string; classes: string[] }>

  // Step 2 — class-wise break configuration (different break timings per class group)
  // afterPeriod: 0 = after assembly (before P1), 1 = after P1, etc.
  classwiseBreaks?: Array<{
    id: string; name: string; type: 'short-break' | 'lunch' | 'assembly' | 'dispersal'
    classes: string[]   // class keys ('nur', 'lkg', …) — empty = all
    afterPeriod: number
    duration: number
  }>
}

export const defaultWizardConfig: WizardConfig = {
  orgType: null,
  countryCode: null,
  board: 'CBSE',
  timeFormat: '12h',
  timezone: 'Asia/Kolkata',
  gradeGroups: ['primary', 'middle', 'secondary'],
  schoolName: '',
  academicYear: '2025-26',
  workDays: ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY'],
  startTime: '09:00',
  endTime: '15:30',
  periodsPerDay: 8,
  numBreaks: 2,
  defaultSessionDuration: 45,
  shifts: [],
  numStaff: 12,
  numSections: 8,
  numSubjects: 8,
  schedulingMode: 'standard',
  hasOptionals: false,
  workingDaysPerYear: 220,
  timetableName: '',
  timetableStartDate: '',
  timetableEndDate: '',
}

// ─────────────────────────────────────────────────────────────
// 21. COUNTRY & STANDARDS (for multi-country support)
// ─────────────────────────────────────────────────────────────

export interface Country {
  code: string
  flag: string
  name: string
  subtitle: string
  standard: string
  maxPeriodsWeek: number
  maxPeriodsDay: number
  firstNames: string[]
  lastNames: string[]
  titles: string[]
  grades: string[]
  sections: string[]
  subjects: string[]
  breaks: string[]
  roomPrefix: string
  roomStart: number
}

// ─────────────────────────────────────────────────────────────
// 22. OPTIONAL SUBJECT ENGINE TYPES
//     Used by optionalEngine.ts and XI/XII wizard steps
// ─────────────────────────────────────────────────────────────

/** A mutually-exclusive line of optional subjects */
export interface OptionalLine {
  id: string
  name: string         // "Optional Line A"
  subjects: string[]   // subject names (one will be chosen)
}

export interface OptionalCombination {
  id: string
  subjects: string[]   // one from each line
  label: string        // "Maths + PED"
}

export interface CombinationStrength {
  sectionId: string
  combinationId: string
  studentCount: number
}

export interface SubjectPool {
  subjectName: string
  totalStudents: number
  sections: string[]
  assignedRoom?: string
  assignedTeacher?: string
}

export interface ClassOptionalConfig {
  classId: string
  hasOptionals: boolean
  totalStudents: number
  optionalLines: OptionalLine[]
  combinations: OptionalCombination[]
  combinationStrengths: CombinationStrength[]
}

// ─────────────────────────────────────────────────────────────
// 23. LEGACY BACKWARD-COMPAT TYPES
//     Used by existing wizard steps and scheduling engine.
//     New code should use the Schedu model above.
// ─────────────────────────────────────────────────────────────

/**
 * @deprecated Use SchoolClass instead.
 * Kept for compatibility with schedulingEngine.ts and wizard steps.
 */
export const SectionSchema = z.object({
  id: z.string(),
  name: z.string().min(1),
  room: z.string(),
  grade: z.string(),
  stream: z.string().optional(),         // full stream name, e.g. "Science", "Spark"
  classTeacher: z.string().optional().default(''),
  shiftId: z.string().optional(),
  scope: ScopeMatrixSchema.optional(),   // schedU Scope System
})
export type Section = z.infer<typeof SectionSchema>

/**
 * @deprecated Use Teacher instead.
 * Kept for compatibility with schedulingEngine.ts and wizard steps.
 */
export const StaffSchema = z.object({
  id: z.string(),
  name: z.string().min(1),
  shortName: z.string().optional().default(''),  // Short name for timetable display (e.g. "MR" for "Mr. Raj")
  role: z.string(),
  subjects: z.array(z.string()),
  classes: z.array(z.string()),
  isClassTeacher: z.string().default(''),
  isCoClassTeacher: z.string().optional(),
  maxPeriodsPerWeek: z.number().int().positive(),
  gender: z.enum(['male', 'female', 'other']).optional(),
  scope: ScopeMatrixSchema.optional(),   // schedU Scope System
})
export type Staff = z.infer<typeof StaffSchema>

export const PeriodTypeSchema = z.enum(['class', 'fixed-start', 'break', 'lunch', 'fixed-end'])
export type PeriodType = z.infer<typeof PeriodTypeSchema>

/**
 * @deprecated Use TimeSlot instead.
 * Kept for compatibility with schedulingEngine.ts and wizard steps.
 */
export const PeriodSchema = z.object({
  id: z.string(),
  name: z.string(),
  duration: z.number().int().positive(),
  type: PeriodTypeSchema,
  shiftable: z.boolean(),
})
export type Period = z.infer<typeof PeriodSchema>

/** @deprecated Use Classroom instead. */
export interface Room {
  id: string
  generatedName: string
  actualName: string
  roomType: 'classroom' | 'lab' | 'hall' | 'gym' | 'other'
  capacity: number
  shiftId?: string
  /** schedU Scope System — when set, room can only be used where allowed */
  scope?: ScopeMatrix
}

/** @deprecated Use Teacher instead. */
export interface TeacherPool {
  id: string
  name: string
  subjectName: string
  gradeRangeStart: number
  gradeRangeEnd: number
  teacherCount: number
  maxPeriodsPerWeek: number
  teachers: GeneratedTeacher[]
}

export interface GeneratedTeacher {
  id: string
  generatedName: string
  actualName: string
  poolId: string
  assignedClasses: string[]
}

/** @deprecated Use Classroom instead. */
export interface Facility {
  id: string
  generatedName: string
  actualName: string
  facilityType: 'classroom' | 'lab' | 'hall' | 'gym' | 'other'
  capacity?: number
  shiftId?: string
}

// ─────────────────────────────────────────────────────────────
// 24. AND / OR GROUP TYPES (Step 4 redesign)
// ─────────────────────────────────────────────────────────────

/** A subject bundle = all subjects a student takes together.
 *  E.g. PCM = { id: 'pcm', name: 'PCM', subjects: ['Physics','Chemistry','Maths'] } */
export interface SubjectBundle {
  id: string
  name: string        // display name: "PCM", "PCB", "Arts", "Commerce"
  subjects: string[]  // ALL subject names in this bundle
  color?: string      // display color
}

/** One AND-group card represents a single split point:
 *  "In these sections, students are divided into these bundles."
 *  E.g. "Science XI-XII: PCM vs PCB" */
export interface AndComboGroup {
  id: string
  name: string                   // user-facing name: "Science XI-XII Combination"
  applicableSections: string[]   // which sections this split applies to
  bundles: SubjectBundle[]       // 2+ mutually exclusive options
  /** Student count matrix: sectionName → bundleId → headcount.
   *  Validation: for each section, sum(bundleHeadcounts) === section.totalStudents */
  strengthMatrix: Record<string, Record<string, number>>
  /** AI-suggested? Shows a badge if true, dismissed once user edits */
  aiSuggested?: boolean
  /** Resolved teaching groups (generated, not user-entered) */
  generatedGroups?: AndTeachingGroup[]
}

/** One concrete teaching group produced from an AndComboGroup.
 *  Multiple groups per bundle when room capacity < total bundle headcount. */
export interface AndTeachingGroup {
  id: string
  bundleId: string       // which bundle (PCM, PCB)
  bundleName: string
  subjects: string[]     // same as bundle.subjects
  sectionSlices: Array<{
    sectionName: string
    studentCount: number
  }>
  totalStrength: number
  teacher?: string
  room?: string
  roomCapacity?: number
  capacityWarning?: boolean
}

/** One OR-group slot: students pick exactly one subject from this slot.
 *  Separate slots are independent — a student can appear in R1, R2, AND R3. */
export interface ElectiveSlot {
  id: string
  name: string           // "R1 Regional Language", "Physical Activity Elective"
  slotLabel?: string     // short label: "R1", "R2", "PE"
  subjects: string[]     // choices within this slot
  applicableSections: string[]  // empty = all sections
  periodsPerWeek?: number
  /** Student count matrix: sectionName → subjectName → headcount.
   *  Validation: for each section, sum(subjectHeadcounts) === section.totalStudents */
  strengthMatrix: Record<string, Record<string, number>>
  /** Generated teaching groups, one per (slotLabel+subject) combination */
  generatedGroups?: ElectiveTeachingGroup[]
}

export interface ElectiveTeachingGroup {
  id: string
  slotId: string
  slotLabel?: string
  subjectName: string
  sectionNames: string[]
  totalStrength: number
  teacher?: string
  room?: string
}

/** @deprecated Use InstructionalCluster instead. */
export interface ParticipantPool {
  id: string
  name: string
  resourceName: string
  gradeRangeStart: number
  gradeRangeEnd: number
  participantCount: number
  maxSessionsPerWeek: number
  generatedParticipants: GeneratedParticipant[]
}

export interface GeneratedParticipant {
  id: string
  generatedName: string
  actualName: string
  poolId: string
}
