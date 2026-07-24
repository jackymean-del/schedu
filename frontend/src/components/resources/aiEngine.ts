/**
 * aiEngine.ts — SmartSched AI Resource Assignment Engine
 *
 * Performs synchronized curriculum-aware assignment across ALL 4 resource types:
 *   1. Subjects → Classes    (board + grade relevance rules)
 *   2. Slots / Week          (board curriculum standards, grade-specific)
 *   3. Teachers → Subjects / Classes  (load-balanced distribution)
 *   4. Class Teacher assignment       (fair, non-overloaded)
 *   5. Room → Subject mappings        (lab subjects → lab rooms)
 *
 * Architecture principles:
 *   - Pure function: inputs in, result out — no side effects
 *   - Deterministic: same inputs always produce same result
 *   - Graceful degradation: works with partial data (no teachers, no rooms, etc.)
 */

import type { Subject, Section, Staff, SubjectClassConfig } from '@/types'
import type { RoomExt } from './RoomsPanel'
import {
  suggestClassesForSubject,
  suggestSlotsPerWeek,
  dominantGradeGroup,
  CURRICULUM,
  type CurriculumBoard,
} from './curriculum'

// ─── Shared types ─────────────────────────────────────────────────────────────
export interface SubjectMapping { subject: string; classes: string[] }
export type StaffExt = Staff & { subjectMappings?: SubjectMapping[] }

/** A subject/class combination that couldn't be given a teacher without
 *  exceeding someone's safe workload cap — i.e. current staff supply is short. */
export interface StaffingGap {
  subject:     string
  classes:     string[]
  unmetPeriods: number
  /** Rough estimate of how many additional teachers would close this gap. */
  suggestedExtraTeachers: number
}

export interface AIAssignResult {
  subjects: Subject[]
  sections: Section[]
  staff:    Staff[]
  rooms:    RoomExt[]
  /** Empty when every class got a teacher within a safe workload. */
  staffingGaps: StaffingGap[]
}

export interface AISnapshot {
  subjects: Subject[]
  sections: Section[]
  staff:    Staff[]
  rooms:    RoomExt[]
}

// ─── Workload constants ───────────────────────────────────────────────────────
/** Hard cap — no teacher should exceed this (slots/week) */
const MAX_SLOTS = 32
/** Target optimal load */
const TARGET_SLOTS = 25
/** Max distinct subjects per teacher before penalizing */
const MAX_SUBJECTS_PER_TEACHER = 3
/** Max classes per teacher per subject */
const MAX_CLASSES_PER_SUBJECT = 5

// ─── Internal helpers ─────────────────────────────────────────────────────────

/** Subject assignment priority — core academics first */
function subjectPriority(name: string): number {
  const rule = CURRICULUM[name]
  if (!rule) return 5
  if (!rule.isActivity && !rule.isLanguage) return 1   // core academic (Math, Science…)
  if (!rule.isActivity) return 2                        // language (English, Hindi…)
  return 4                                              // CCA / activity
}

/** Get recommended slots/week for a subject given its assigned classes */
function recommendedSlots(
  sub: Subject,
  classes: string[],
  board: CurriculumBoard,
): number {
  if (classes.length === 0) return sub.periodsPerWeek
  const grp = dominantGradeGroup(classes)
  return suggestSlotsPerWeek(sub.name, grp, board) ?? sub.periodsPerWeek
}

/** Pick the best teacher for a new (subject, batch) assignment, or null if NO
 *  teacher has room within their safe workload cap — the caller must never
 *  force an assignment past this; a null means the load should be reported
 *  as an unmet staffing need instead. */
function pickTeacher(
  staff: Staff[],
  teacherLoad: Map<string, number>,
  teacherMappings: Map<string, SubjectMapping[]>,
  teacherSubjectCount: Map<string, number>,
  subjectName: string,
  batchLoad: number,
): string | null {
  let bestId: string | null = null
  let bestScore = Infinity

  for (const t of staff) {
    const load       = teacherLoad.get(t.id) ?? 0
    const subCount   = teacherSubjectCount.get(t.id) ?? 0
    const hasSub     = (teacherMappings.get(t.id) ?? []).some(m => m.subject === subjectName)
    // Each teacher's own configured cap, falling back to the global default —
    // never the other way around, so a custom (lower) cap is always honored.
    const cap = (t as any).maxPeriodsPerWeek ?? MAX_SLOTS

    // Hard cap — skip any teacher this assignment would push over their limit.
    // No exceptions: if nobody fits, bestId stays null and the caller records
    // this as an unmet staffing need instead of overloading someone.
    if (load + batchLoad > cap) continue

    // Score: lower is better. LOAD dominates so the least-loaded teacher wins
    // (even balance / low makespan) — previously subCount×4 could make a
    // heavier-but-fewer-subjects teacher win, piling heavy subjects onto one
    // person. Continuity (already teaches it) is a gentle nudge to keep a
    // subject's sections together without overriding load balance; distinct
    // subject count is only a minor tiebreaker, with a hard push past the max.
    const score =
      load
      - (hasSub ? 8 : 0)
      + (subCount >= MAX_SUBJECTS_PER_TEACHER ? 100 : subCount)

    if (score < bestScore) { bestScore = score; bestId = t.id }
  }

  return bestId
}

// ─── Class teacher assignment ─────────────────────────────────────────────────
function assignClassTeachers(
  sections: Section[],
  subjects: Subject[],
  staff:    Staff[],
  teacherMappings: Map<string, SubjectMapping[]>,
): Section[] {
  if (staff.length === 0) return sections

  const subjectSlotMap = new Map(subjects.map(s => [s.name, s.periodsPerWeek]))

  // class name → sorted list of (teacherName, slotsInClass) candidates
  const candidateMap = new Map<string, {name: string; slots: number}[]>()
  for (const sec of sections) candidateMap.set(sec.name, [])

  for (const t of staff) {
    const mappings = teacherMappings.get(t.id) ?? []
    for (const m of mappings) {
      const ppw = subjectSlotMap.get(m.subject) ?? 0
      for (const cls of m.classes) {
        const list = candidateMap.get(cls)
        if (list) {
          const existing = list.find(c => c.name === t.name)
          if (existing) existing.slots += ppw
          else list.push({ name: t.name, slots: ppw })
        }
      }
    }
  }

  // Sort candidates descending by slots
  for (const list of candidateMap.values()) list.sort((a, b) => b.slots - a.slots)

  const usedAsClassTeacher = new Set<string>()

  return sections.map(sec => {
    const candidates = candidateMap.get(sec.name) ?? []
    for (const c of candidates) {
      if (!usedAsClassTeacher.has(c.name)) {
        usedAsClassTeacher.add(c.name)
        return { ...sec, classTeacher: c.name }
      }
    }
    return sec
  })
}

// ─── Room subject mapping ─────────────────────────────────────────────────────
function assignRoomSubjects(rooms: RoomExt[], subjects: Subject[]): RoomExt[] {
  const labSubjects = subjects
    .filter(s => CURRICULUM[s.name]?.requiresLab)
    .map(s => s.name)
  const csSubjects = subjects
    .filter(s => ['Computer Science', 'Informatics Practices', 'Information Technology', 'Artificial Intelligence'].includes(s.name))
    .map(s => s.name)
  const libSubjects = subjects.filter(s => s.name === 'Library').map(s => s.name)
  const artSubjects = subjects.filter(s => ['Art & Craft', 'Fine Arts'].includes(s.name)).map(s => s.name)
  const musicSubjects = subjects.filter(s => ['Music', 'Dance'].includes(s.name)).map(s => s.name)
  const peSubjects = subjects.filter(s => ['Physical Education', 'Yoga & Health', 'Scout & Guide'].includes(s.name)).map(s => s.name)

  return rooms.map(r => {
    if ((r.subjectMappings ?? []).length > 0) return r  // keep existing
    const t = r.type
    if (t === 'Lab')          return { ...r, subjectMappings: labSubjects.slice(0, 3) }
    if (t === 'Computer Lab') return { ...r, subjectMappings: csSubjects }
    if (t === 'Library')      return { ...r, subjectMappings: libSubjects }
    if (t === 'Hall' && r.name.toLowerCase().includes('dance'))
      return { ...r, subjectMappings: musicSubjects }
    if (t === 'Hall')         return { ...r, subjectMappings: peSubjects }
    if (t === 'Gym')          return { ...r, subjectMappings: peSubjects }
    if (t === 'Other' && r.name.toLowerCase().includes('art'))
      return { ...r, subjectMappings: artSubjects }
    if (t === 'Other' && r.name.toLowerCase().includes('music'))
      return { ...r, subjectMappings: musicSubjects }
    return r
  })
}

// ─── Main AI engine ───────────────────────────────────────────────────────────
/**
 * runAIAssignment
 *
 * Pure function. Returns updated state for all 4 resource types.
 * Safe to call with partial data (empty arrays degrade gracefully).
 */
export function runAIAssignment(
  subjects: Subject[],
  sections: Section[],
  staff:    Staff[],
  rooms:    RoomExt[],
  board:    CurriculumBoard,
): AIAssignResult {

  if (subjects.length === 0 || sections.length === 0) {
    return { subjects, sections, staff, rooms, staffingGaps: [] }
  }

  // ── 1. Map subjects → classes + update slots/week ─────────────────────────
  const subjectClassMap = new Map<string, string[]>()
  const updatedSubjects: Subject[] = subjects.map(sub => {
    const classes = suggestClassesForSubject(sub.name, sections, board)
    subjectClassMap.set(sub.id, classes)
    const newSlots = recommendedSlots(sub, classes, board)
    // Build classConfigs so getAssignedClasses() reads the new data (not stale old classConfigs)
    const newConfigs: SubjectClassConfig[] = classes.map(name => {
      const existing = (sub.classConfigs ?? []).find(c => c.sectionName === name)
      return {
        sectionName:      name,
        periodsPerWeek:   newSlots,
        maxPeriodsPerDay: existing?.maxPeriodsPerDay ?? (sub.maxPeriodsPerDay ?? 2),
        sessionDuration:  existing?.sessionDuration  ?? (sub.sessionDuration  ?? 45),
      }
    })
    return {
      ...sub,
      sections:       classes,
      classConfigs:   newConfigs,
      periodsPerWeek: newSlots,
      requiresLab:    CURRICULUM[sub.name]?.requiresLab ?? sub.requiresLab,
    }
  })

  // ── 2. Teacher assignment (skip if no staff) ──────────────────────────────
  const teacherLoad        = new Map<string, number>()
  const teacherMappings    = new Map<string, SubjectMapping[]>()
  const teacherSubjectCount = new Map<string, number>()

  for (const t of staff) {
    teacherLoad.set(t.id, 0)
    teacherMappings.set(t.id, [])
    teacherSubjectCount.set(t.id, 0)
  }

  // subject name → classes that couldn't be placed within ANY teacher's safe
  // workload cap — surfaced to the caller as staffingGaps instead of ever
  // forcing an over-cap assignment.
  const gapsBySubject = new Map<string, string[]>()

  const applyAssignment = (tid: string, classesToAdd: string[], load: number, subjectName: string) => {
    const maps = teacherMappings.get(tid)!
    const existing = maps.find(m => m.subject === subjectName)
    if (existing) {
      existing.classes.push(...classesToAdd)
    } else {
      maps.push({ subject: subjectName, classes: classesToAdd })
      teacherSubjectCount.set(tid, (teacherSubjectCount.get(tid) ?? 0) + 1)
    }
    teacherLoad.set(tid, (teacherLoad.get(tid) ?? 0) + load)
  }

  if (staff.length > 0) {
    // Assign the HEAVIEST subjects first (Longest-Processing-Time bin-packing),
    // each to the least-loaded eligible teacher. This minimises the spread in
    // total teacher load far better than the old core-first order, which could
    // pile several heavy subjects onto one teacher (e.g. one at 30 while others
    // sat at 12). Subject priority is only a tie-breaker now.
    const totalLoadOf = (s: Subject) =>
      (s.periodsPerWeek || 1) * (subjectClassMap.get(s.id)?.length ?? 0)
    const sorted = [...updatedSubjects].sort(
      (a, b) => totalLoadOf(b) - totalLoadOf(a) || subjectPriority(a.name) - subjectPriority(b.name)
    )

    for (const sub of sorted) {
      const classes    = subjectClassMap.get(sub.id) ?? []
      if (classes.length === 0) continue

      const ppw        = sub.periodsPerWeek || 1
      const maxPerTeacher = Math.min(
        MAX_CLASSES_PER_SUBJECT,
        Math.max(1, Math.floor(TARGET_SLOTS / ppw))
      )

      for (let i = 0; i < classes.length; i += maxPerTeacher) {
        const batch    = classes.slice(i, i + maxPerTeacher)
        const batchLoad = batch.length * ppw

        const tid = pickTeacher(
          staff, teacherLoad, teacherMappings, teacherSubjectCount,
          sub.name, batchLoad,
        )
        if (tid) {
          applyAssignment(tid, batch, batchLoad, sub.name)
          continue
        }

        // The full batch doesn't fit anywhere as one block — never force it
        // onto whoever's least loaded (that's how a teacher ends up at 49/32).
        // Instead try placing each class individually, so partial capacity on
        // OTHER teachers isn't wasted; anything still unplaced becomes a gap.
        const stillUnplaced: string[] = []
        for (const cls of batch) {
          const single = pickTeacher(
            staff, teacherLoad, teacherMappings, teacherSubjectCount,
            sub.name, ppw,
          )
          if (single) applyAssignment(single, [cls], ppw, sub.name)
          else stillUnplaced.push(cls)
        }
        if (stillUnplaced.length) {
          gapsBySubject.set(sub.name, [...(gapsBySubject.get(sub.name) ?? []), ...stillUnplaced])
        }
      }
    }
  } else {
    // No staff at all — every assigned class is an unmet staffing need.
    for (const sub of updatedSubjects) {
      const classes = subjectClassMap.get(sub.id) ?? []
      if (classes.length > 0) gapsBySubject.set(sub.name, classes)
    }
  }

  const staffingGaps: StaffingGap[] = [...gapsBySubject].map(([subjectName, classes]) => {
    const sub = updatedSubjects.find(s => s.name === subjectName)
    const ppw = sub?.periodsPerWeek || 1
    const unmetPeriods = classes.length * ppw
    return {
      subject: subjectName,
      classes,
      unmetPeriods,
      suggestedExtraTeachers: Math.max(1, Math.ceil(unmetPeriods / TARGET_SLOTS)),
    }
  })

  // ── 3. Build updated staff ────────────────────────────────────────────────
  const updatedStaff: Staff[] = staff.map(t => {
    const maps = teacherMappings.get(t.id) ?? []
    return {
      ...t,
      subjectMappings: maps,
      subjects:        maps.map(m => m.subject),
      classes:         [...new Set(maps.flatMap(m => m.classes))],
    } as any
  })

  // ── 4. Assign class teachers ──────────────────────────────────────────────
  const updatedSections = assignClassTeachers(
    sections, updatedSubjects, updatedStaff, teacherMappings,
  )

  // ── 5. Update room subject mappings ───────────────────────────────────────
  const updatedRooms = assignRoomSubjects(rooms, updatedSubjects)

  return {
    subjects: updatedSubjects,
    sections: updatedSections,
    staff:    updatedStaff,
    rooms:    updatedRooms,
    staffingGaps,
  }
}

// ─── Workload summary (used by TeachersPanel) ─────────────────────────────────
/**
 * Calculate total slots/week for a teacher based on their subject mappings.
 * Each (subject × class) counts as periodsPerWeek slots.
 */
export function calcTeacherSlots(
  teacher: StaffExt,
  subjects: Subject[],
): number {
  const mappings = teacher.subjectMappings && teacher.subjectMappings.length > 0
    ? teacher.subjectMappings
    : (teacher.subjects ?? []).map(s => ({ subject: s, classes: teacher.classes ?? [] }))

  const slotMap = new Map(subjects.map(s => [s.name, s.periodsPerWeek]))
  return mappings.reduce((total, m) => {
    const ppw = slotMap.get(m.subject) ?? 0
    return total + ppw * m.classes.length
  }, 0)
}

/** Workload classification for visual indicators */
export function slotLoadLevel(slots: number): 'none' | 'low' | 'good' | 'high' | 'over' {
  if (slots === 0)   return 'none'
  if (slots < 16)    return 'low'
  if (slots <= 28)   return 'good'
  if (slots <= 34)   return 'high'
  return 'over'
}

// ════════════════════════════════════════════════════════════════════════════
//  SMART CREATE — bootstrap Faculty / Rooms from the subject + class list.
//  Used by each tab's first-run "Let me create smartly" empty state.
// ════════════════════════════════════════════════════════════════════════════

function seedId() { return Math.random().toString(36).slice(2, 9) }

/** Sections a subject is taught in (classConfigs first, then sections[]). */
function assignedSections(sub: Subject): string[] {
  const fromConfigs = (sub.classConfigs ?? []).map(c => c.sectionName).filter(Boolean) as string[]
  return [...new Set([...(fromConfigs.length ? fromConfigs : (sub.sections ?? []))])]
}

function slotForSection(sub: Subject, sectionName: string): number {
  const cfg = (sub.classConfigs ?? []).find(c => c.sectionName === sectionName)
  return cfg?.periodsPerWeek ?? sub.periodsPerWeek ?? 5
}

/** Split a list into n roughly-equal contiguous chunks. */
function splitEven<T>(items: T[], n: number): T[][] {
  if (n <= 1) return [items]
  const out: T[][] = Array.from({ length: n }, () => [])
  items.forEach((it, i) => out[i % n].push(it))
  return out.filter(g => g.length > 0)
}

/**
 * Seed a realistic faculty roster from the subject list. Each subject gets one
 * or more teachers sized to its total weekly load (≈ TARGET_SLOTS each), with
 * sections split between them and subjectMappings wired so the Faculty tab,
 * timetable and solver can use them immediately. The user renames the
 * placeholder names ("Mathematics Teacher 1") and tweaks loads afterwards.
 */
export function seedStandardStaff(subjects: Subject[], _board: CurriculumBoard): StaffExt[] {
  const staff: StaffExt[] = []
  const sorted = [...subjects].sort((a, b) => subjectPriority(a.name) - subjectPriority(b.name))
  for (const sub of sorted) {
    const secs = assignedSections(sub)
    if (secs.length === 0) continue
    const totalLoad = secs.reduce((sum, sn) => sum + slotForSection(sub, sn), 0)
    const nTeachers = Math.min(secs.length, Math.max(1, Math.ceil(totalLoad / TARGET_SLOTS)))
    splitEven(secs, nTeachers).forEach((group, i) => {
      staff.push({
        id: seedId(),
        name: nTeachers > 1 ? `${sub.name} Teacher ${i + 1}` : `${sub.name} Teacher`,
        shortName: '',
        role: 'Teacher',
        subjects: [sub.name],
        classes: group,
        isClassTeacher: '',
        maxPeriodsPerWeek: MAX_SLOTS - 2,
        subjectMappings: [{ subject: sub.name, classes: group }],
      } as StaffExt)
    })
  }
  return staff
}

/**
 * Seed a standard room set: one homeroom per section plus the shared special
 * rooms implied by the subjects present (Computer Lab, Physics/Chemistry/
 * Biology Labs, Library), with lab→subject mappings pre-wired.
 */
export function seedStandardRooms(sections: Section[], subjects: Subject[]): RoomExt[] {
  const rooms: RoomExt[] = sections.map(sec => ({
    id: seedId(),
    name: `Room ${sec.name}`,
    type: 'Classroom',
    capacity: (sec as any).strength || 40,
    building: 'Main Block',
    floor: '',
    subjectMappings: [],
    notes: '',
    // Pre-wire the home section so the room shows its class immediately,
    // and so the assignment is many-to-many safe from the start.
    assignedSections: [sec.name],
  } as RoomExt))

  const present = new Set(subjects.map(s => s.name))
  const specials: Array<{ name: string; type: string; subs: string[] }> = [
    { name: 'Computer Lab',  type: 'Computer Lab', subs: ['Computer Science', 'Information Technology', 'Informatics Practices', 'Artificial Intelligence'] },
    { name: 'Physics Lab',   type: 'Lab',          subs: ['Physics'] },
    { name: 'Chemistry Lab', type: 'Lab',          subs: ['Chemistry'] },
    { name: 'Biology Lab',   type: 'Lab',          subs: ['Biology', 'Botany', 'Zoology', 'Biotechnology'] },
    { name: 'Library',       type: 'Library',      subs: ['Library'] },
  ]
  for (const sp of specials) {
    const mapped = sp.subs.filter(s => present.has(s))
    if (mapped.length === 0) continue
    rooms.push({
      id: seedId(),
      name: sp.name,
      type: sp.type,
      capacity: 40,
      building: 'Main Block',
      floor: '',
      subjectMappings: mapped,
      notes: '',
    } as RoomExt)
  }
  return rooms
}
