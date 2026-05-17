/**
 * Schedu Scheduling Engine
 * 
 * Implements CSP (Constraint Satisfaction Problem) solver in TypeScript.
 * This is the frontend JS equivalent of OR-Tools CP-SAT.
 * 
 * Supports:
 *   MODE 1 — Period-Based (weekly_periods given directly)
 *   MODE 2 — Duration-Based (convert total hours → weekly periods)
 * 
 * All scheduling data internally converts to:
 *   Class + Subject + WeeklyFrequency
 * before entering the constraint engine.
 */

import type { Section, Staff, Subject, Period, ClassTimetable, TeacherSchedule, Conflict, Suggestion, SchedulingRequirement } from '@/types'
import { parseAllocation } from './allocationSyntax'

// ─── Mode 2: Duration → Weekly Periods Formula ───────────
export interface DurationInput {
  subjectName: string
  className: string
  requiredHours: number    // total instructional hours needed
  periodDurationMins: number
  workingDaysPerYear: number
  workingDaysPerWeek: number
}

export function durationToWeeklyPeriods(input: DurationInput): number {
  const workingWeeks = input.workingDaysPerYear / input.workingDaysPerWeek
  const weekly = (input.requiredHours * 60) / (input.periodDurationMins * workingWeeks)
  return Math.round(weekly)
}


// ─── Hard Constraints ─────────────────────────────────────
export interface HardConstraint {
  type: 'teacher-clash' | 'room-clash' | 'weekly-frequency' | 'teacher-eligibility' | 'shift-boundary' | 'break' | 'daily-limit'
  description: string
}

// ─── Soft Constraints with Penalty Weights ────────────────
export interface SoftConstraint {
  type: string
  penaltyWeight: number
  description: string
}

export const DEFAULT_SOFT_CONSTRAINTS: SoftConstraint[] = [
  { type: 'teacher-gap',          penaltyWeight: 5,  description: 'Minimize free periods between classes for a teacher' },
  { type: 'teacher-overload',     penaltyWeight: 10, description: 'Avoid exceeding max weekly periods' },
  { type: 'consecutive-heavy',    penaltyWeight: 7,  description: 'Avoid consecutive heavy subjects (Maths after Maths)' },
  { type: 'last-period-overload', penaltyWeight: 4,  description: 'Avoid heavy subjects in last period' },
  { type: 'workload-imbalance',   penaltyWeight: 8,  description: 'Balance teacher workload evenly' },
  { type: 'subject-spread',       penaltyWeight: 6,  description: 'Distribute subjects evenly across week' },
]

// ─── CSP Solver ───────────────────────────────────────────
export interface SolverInput {
  sections: Section[]
  staff: Staff[]
  subjects: Subject[]
  periods: Period[]
  workDays: string[]
  requirements: SchedulingRequirement[]
  softConstraints?: SoftConstraint[]
  /** schedU Phase 3: Optional blocks to pin into specific (day, period, sections) slots */
  optionalBlocks?: import('@/types').OptionalBlock[]
  /** Per-class combination strengths — used for capacity overflow detection */
  subjectCombinations?: import('@/types').SubjectCombination[]
  /** schedU Phase 6: Section-subject strength matrix.
   *  When provided AND optionalBlocks is empty, the engine AUTO-INFERS
   *  optional blocks from the matrix (the "simple input" mode). */
  sectionStrengths?: import('@/types').SectionStrength[]
  /** Doc Part 1: per-(section, subject) period allocation cell syntax.
   *  Shape: { [sectionName]: { [subjectName]: "5+1" | "3(2X)" | ... } }
   *  Empty/missing → fall back to Subject.periodsPerWeek. */
  subjectAllocations?: Record<string, Record<string, string>>
}

/** schedU Phase 6 — Auto-infer Optional Blocks from section strengths.
 *
 *  Heuristics:
 *    1. For each section, find the maximum subject strength = section size.
 *    2. Subjects with 0 < strength < max are "optional" for that section.
 *    3. Within a section, optionals whose strengths sum to ≈ section size
 *       are parallel choices → group into one block.
 *    4. Across sections, the same parallel-optional group is pooled
 *       (cross-section pooling) into a single OptionalBlock.
 *    5. Block gets assigned to the first available class period that's not
 *       already taken by another auto-block in any of its sections.
 */
function inferOptionalBlocksFromStrengths(
  sectionStrengths: import('@/types').SectionStrength[],
  staff: Staff[],
  sections: Section[],
  classPeriods: Period[],
  workDays: string[],
  subjects: Subject[] = [],
): import('@/types').OptionalBlock[] {
  if (!sectionStrengths.length || !classPeriods.length || !workDays.length) return []

  // 1) Identify optional subjects per section
  type OptInfo = { section: string; subject: string; strength: number }
  const optsBySection = new Map<string, OptInfo[]>()
  sectionStrengths.forEach(row => {
    const vals = Object.entries(row.subjectStrengths ?? {})
      .filter(([, v]) => typeof v === 'number' && v > 0)
    if (!vals.length) return
    const max = Math.max(...vals.map(([, v]) => v))
    const sectionSize = row.totalStudents ?? max
    const opts = vals
      .filter(([, v]) => v < sectionSize)
      .map(([sub, v]) => ({ section: row.sectionName, subject: sub, strength: v }))
    if (opts.length > 0) optsBySection.set(row.sectionName, opts)
  })
  if (optsBySection.size === 0) return []

  // 2) For each section, group its optionals into "parallel sets" (subjects
  //    whose strengths sum to roughly the section total — they're offered
  //    at the same time slot).
  type ParallelSet = { sectionName: string; subjects: string[]; perSubjectStrength: Record<string, number> }
  const parallelSets: ParallelSet[] = []
  optsBySection.forEach((opts, secName) => {
    parallelSets.push({
      sectionName: secName,
      subjects: opts.map(o => o.subject).sort(),
      perSubjectStrength: Object.fromEntries(opts.map(o => [o.subject, o.strength])),
    })
  })

  // 3) Doc Part 3 — Dynamic Cross-Class Same-Period Assignment Engine.
  //    Pool parallel sets across sections using each subject's
  //    `groupingBehavior` metadata to decide what may merge:
  //      NO_GROUPING         → no pooling; one block per section
  //      SAME_GRADE_ONLY     → pool only sections of the same grade
  //      CROSS_GRADE_ALLOWED → pool all sections offering this set
  //      FLEXIBLE_GROUPING   → AI default: pool all (room-capacity
  //                             splitting can come later)
  //    The most-restrictive behavior across the subjects in a set governs.

  type PoolEntry = {
    sectionNames: string[]
    subjects: string[]
    capacityBySubject: Record<string, number>
    behavior: string
  }
  const behaviorRank: Record<string, number> = {
    NO_GROUPING: 0,
    SAME_GRADE_ONLY: 1,
    FLEXIBLE_GROUPING: 2,
    CROSS_GRADE_ALLOWED: 3,
  }
  const mostRestrictive = (subjectNames: string[]): string => {
    let best = 'CROSS_GRADE_ALLOWED'
    let bestRank = 99
    subjectNames.forEach(name => {
      const sub = subjects.find(s => s.name === name) as any
      const b = (sub?.groupingBehavior ?? 'FLEXIBLE_GROUPING') as string
      const r = behaviorRank[b] ?? 2
      if (r < bestRank) { bestRank = r; best = b }
    })
    return best
  }
  const sectionGrade = new Map<string, string>()
  sections.forEach(s => sectionGrade.set(s.name, (s as any).grade ?? ''))

  // First bucket parallel sets by subject-set signature (sections that offer
  // identical optional menus). Then split each bucket per the rule above.
  const sigToSets = new Map<string, ParallelSet[]>()
  parallelSets.forEach(ps => {
    const sig = ps.subjects.join('|')
    const arr = sigToSets.get(sig) ?? []
    arr.push(ps)
    sigToSets.set(sig, arr)
  })

  const pools: PoolEntry[] = []
  const mergeSets = (sets: ParallelSet[], subjs: string[]): PoolEntry => {
    const cap: Record<string, number> = Object.fromEntries(subjs.map(s => [s, 0]))
    const secs: string[] = []
    sets.forEach(ps => {
      secs.push(ps.sectionName)
      subjs.forEach(s => { cap[s] += (ps.perSubjectStrength[s] ?? 0) })
    })
    return { sectionNames: secs, subjects: subjs, capacityBySubject: cap, behavior: '' }
  }

  sigToSets.forEach(sets => {
    const subjs = sets[0].subjects
    const behavior = mostRestrictive(subjs)

    if (behavior === 'NO_GROUPING') {
      // Each section gets its own block — never merge.
      sets.forEach(ps => {
        const p = mergeSets([ps], subjs)
        p.behavior = behavior
        pools.push(p)
      })
    } else if (behavior === 'SAME_GRADE_ONLY') {
      // Bucket by grade, then merge within each bucket.
      const byGrade = new Map<string, ParallelSet[]>()
      sets.forEach(ps => {
        const g = sectionGrade.get(ps.sectionName) ?? '?'
        const arr = byGrade.get(g) ?? []
        arr.push(ps)
        byGrade.set(g, arr)
      })
      byGrade.forEach(setsInGrade => {
        const p = mergeSets(setsInGrade, subjs)
        p.behavior = behavior
        pools.push(p)
      })
    } else {
      // CROSS_GRADE_ALLOWED or FLEXIBLE_GROUPING — pool all into one.
      const p = mergeSets(sets, subjs)
      p.behavior = behavior
      pools.push(p)
    }
  })

  // 4) Assign each pool to a (day, period) — first available across
  //    every section in the pool.
  const usedSlot = new Set<string>() // "section|day|period"
  const inferred: import('@/types').OptionalBlock[] = []
  let blockIdx = 1
  pools.forEach(entry => {
    let placedDay = workDays[0], placedPid = classPeriods[0]?.id ?? ''
    outer: for (const day of workDays) {
      for (const p of classPeriods) {
        // First class period is reserved for class teachers — skip
        if (p.id === classPeriods[0]?.id) continue
        const allFree = entry.sectionNames.every(s => !usedSlot.has(`${s}|${day}|${p.id}`))
        if (allFree) {
          placedDay = day
          placedPid = p.id
          entry.sectionNames.forEach(s => usedSlot.add(`${s}|${day}|${p.id}`))
          break outer
        }
      }
    }

    // Match a teacher per option (subject-aware, no double-booking)
    const teacherBusyAtBlock = new Set<string>()
    const options = entry.subjects.map(sub => {
      const t = staff.find(st =>
        ((st as any).subjects ?? []).some((s: string) => s === sub || s.endsWith(`::${sub}`))
        && !teacherBusyAtBlock.has(st.name)
      ) ?? staff.find(st => !teacherBusyAtBlock.has(st.name))
      if (t) teacherBusyAtBlock.add(t.name)
      // Pick a sensible room based on subject keyword
      const roomGuess = guessRoom(sub, sections)
      return {
        subject: sub,
        teacher: t?.name ?? '',
        room: roomGuess,
        capacity: entry.capacityBySubject[sub] ?? 0,
        allocatedStrength: entry.capacityBySubject[sub] ?? 0,
      }
    })

    inferred.push({
      id: `auto-block-${blockIdx++}`,
      name: `Optional Block ${blockIdx - 1}`,
      sectionNames: entry.sectionNames,
      day: placedDay,
      periodId: placedPid,
      options,
    })
  })

  return inferred
}

function guessRoom(subject: string, sections: Section[]): string {
  const u = subject.toUpperCase()
  if (/(PE|PHYSICAL|SPORT|GAMES|YOGA)/.test(u)) return 'Ground'
  if (/(ART|CRAFT|DRAWING|PAINTING)/.test(u))  return 'Art Room'
  if (/(MUSIC|DANCE|DRAMA)/.test(u))           return 'Music Room'
  if (/(LAB|COMPUTER|IT|ICT)/.test(u))         return 'Computer Lab'
  if (/(CHEMISTRY|PHYSICS|BIOLOGY|SCIENCE)/.test(u)) return 'Science Lab'
  return (sections[0] as any)?.room ?? 'Room 101'
}

export interface SolverOutput {
  classTT: ClassTimetable
  teacherTT: Record<string, TeacherSchedule>
  conflicts: Conflict[]
  penalties: { constraint: string; penalty: number; details: string }[]
  score: number       // lower = better (total penalty)
  iterations: number
  /** Optional Blocks placed by the solver (manual + AI-inferred). */
  optionalBlocks?: import('@/types').OptionalBlock[]
  /** Dynamic Learning Groups produced from grouping_behavior + strengths.
   *  Each DLG represents a pooled cohort across sections for one subject. */
  dynamicLearningGroups?: DynamicLearningGroup[]
  /** Per-teacher final weekly load (for fairness diagnostics). */
  teacherWeeklyLoad?: Record<string, number>
  /** Stddev of teacher loads — lower is more balanced. */
  teacherLoadStddev?: number
}

/** A Dynamic Learning Group is a pooled cohort across sections for one
 *  optional subject. Multiple DLGs may share the same (day, period) when
 *  they belong to the same parallel block. */
export interface DynamicLearningGroup {
  id: string
  subject: string
  sectionNames: string[]
  totalStrength: number
  teacher: string
  room: string
  behavior: string    // NO_GROUPING | SAME_GRADE_ONLY | CROSS_GRADE_ALLOWED | FLEXIBLE_GROUPING
  day: string
  periodId: string
}

/** Extract Dynamic Learning Groups from the solver's effective blocks.
 *  Each option in each block becomes its own DLG entity. */
export function extractDynamicLearningGroups(
  blocks: import('@/types').OptionalBlock[],
  subjects: Subject[],
): DynamicLearningGroup[] {
  const out: DynamicLearningGroup[] = []
  let idx = 1
  blocks.forEach(b => {
    b.options.forEach(opt => {
      const sub = subjects.find(s => s.name === opt.subject) as any
      out.push({
        id: `dlg-${idx++}`,
        subject: opt.subject,
        sectionNames: b.sectionNames,
        totalStrength: opt.allocatedStrength ?? opt.capacity ?? 0,
        teacher: opt.teacher ?? '',
        room: opt.room ?? '',
        behavior: sub?.groupingBehavior ?? 'FLEXIBLE_GROUPING',
        day: b.day,
        periodId: b.periodId,
      })
    })
  })
  return out
}

// ─── Main Solver (JS CSP implementation) ─────────────────
export function solveTimetable(input: SolverInput): SolverOutput {
  const { sections, staff, subjects, periods, workDays } = input
  const classPeriods = periods.filter(p => p.type === 'class')
  const classTT: ClassTimetable = {}
  const penalties: SolverOutput['penalties'] = []
  
  // Initialize empty timetable
  sections.forEach(sec => {
    classTT[sec.name] = {}
    workDays.forEach(day => { classTT[sec.name][day] = {} })
  })

  // Build teacher availability map
  const teacherBusy: Record<string, Record<string, Set<string>>> = {}
  staff.forEach(st => {
    teacherBusy[st.name] = {}
    workDays.forEach(day => { teacherBusy[st.name][day] = new Set() })
  })

  // Build subject frequency tracker
  const subjectCount: Record<string, Record<string, number>> = {}
  sections.forEach(sec => {
    subjectCount[sec.name] = {}
    subjects.forEach(sub => { subjectCount[sec.name][sub.name] = 0 })
  })

  // ── Doc Part 1: per-(section, subject) target periods/week ──
  //   Read subjectAllocations matrix (cell syntax → numeric weekly total),
  //   fall back to Subject.periodsPerWeek when not overridden.
  const subjectAllocations = input.subjectAllocations ?? {}
  const targetPeriods: Record<string, Record<string, number>> = {}
  sections.forEach(sec => {
    targetPeriods[sec.name] = {}
    subjects.forEach(sub => {
      const cell = subjectAllocations[sec.name]?.[sub.name]
      if (cell) {
        const p = parseAllocation(cell)
        targetPeriods[sec.name][sub.name] = p.valid ? p.weeklyTotal : (sub.periodsPerWeek ?? 0)
      } else {
        targetPeriods[sec.name][sub.name] = sub.periodsPerWeek ?? 0
      }
    })
  })

  // ── AI teacher-load balancing baselines ──
  //   Compute the total periods we need to place across all sections,
  //   then derive a target weekly load per teacher. The scorer prefers
  //   teachers below their target and penalises those near max load.
  const totalRequiredPeriods = sections.reduce(
    (s, sec) => s + Object.values(targetPeriods[sec.name] ?? {}).reduce((a, n) => a + n, 0), 0)
  const targetWeeklyLoadPerTeacher = Math.ceil(totalRequiredPeriods / Math.max(1, staff.length))

  // Running per-teacher trackers (updated as we place)
  const teacherWeeklyLoad: Record<string, number> = {}
  staff.forEach(t => { teacherWeeklyLoad[t.name] = 0 })
  // Subjects each teacher has already taught (for vertical continuity)
  const teacherSubjectSet: Record<string, Set<string>> = {}
  staff.forEach(t => { teacherSubjectSet[t.name] = new Set() })
  // Sections each teacher has been seen in (for section familiarity)
  const teacherSectionSet: Record<string, Set<string>> = {}
  staff.forEach(t => { teacherSectionSet[t.name] = new Set() })

  // Class teacher map — resolve IDs to names (UI stores staff.id, engine needs staff.name)
  const classTeacherMap: Record<string, string> = {}
  staff.forEach(st => { if (st.isClassTeacher) classTeacherMap[st.isClassTeacher] = st.name })
  sections.forEach(sec => {
    if (!sec.classTeacher) return
    // sec.classTeacher may be a staff ID or a staff name — resolve to name
    const resolved = staff.find(s => s.id === sec.classTeacher || s.name === sec.classTeacher)
    if (resolved) classTeacherMap[sec.name] = resolved.name
  })

  // Helper: ensure teacherBusy entry exists for a name (guards against dynamic additions)
  const ensureBusy = (name: string) => {
    if (!teacherBusy[name]) {
      teacherBusy[name] = Object.fromEntries(workDays.map(d => [d, new Set<string>()]))
    }
  }

  // ── Phase 6: Auto-infer Optional Blocks from section strengths ──
  // If no manual blocks were authored AND a strength matrix is present,
  // derive blocks automatically. This is the new simplified flow.
  const effectiveBlocks: import('@/types').OptionalBlock[] = (input.optionalBlocks && input.optionalBlocks.length > 0)
    ? input.optionalBlocks
    : inferOptionalBlocksFromStrengths(
        input.sectionStrengths ?? [], staff, sections, classPeriods, workDays, subjects,
      )

  // ── Pass 0: Place Optional Blocks (schedU Phase 3) ────
  // Pinned slots — must run FIRST so other passes skip them.
  // Each block applies across all listed sections (cross-section pooling).
  effectiveBlocks.forEach(block => {
    // Validate: no teacher should appear twice within the same block
    const teacherInBlock = new Map<string, string>()
    block.options.forEach((opt, idx) => {
      if (!opt.teacher) return
      const prev = teacherInBlock.get(opt.teacher)
      if (prev != null) {
        penalties.push({
          constraint: 'block-teacher-conflict',
          penalty: 50,
          details: `${block.name}: ${opt.teacher} is assigned to multiple options (${prev} & ${opt.subject})`,
        })
      } else {
        teacherInBlock.set(opt.teacher, opt.subject)
      }
    })

    // Capacity overflow check vs combination strengths
    const totalCap = block.options.reduce((sum, o) => sum + (o.capacity ?? 0), 0)
    if (totalCap > 0 && (input.subjectCombinations ?? []).length > 0) {
      // Sum combination strengths whose className matches any section in this block
      // (matches if section.name starts with combo.className or equals it)
      const blockStrength = (input.subjectCombinations ?? [])
        .filter(c => block.sectionNames.some(sn => sn === c.className || sn.startsWith(c.className)))
        .reduce((sum, c) => sum + (c.strength ?? 0), 0)
      if (blockStrength > totalCap) {
        penalties.push({
          constraint: 'block-capacity-overflow',
          penalty: 30,
          details: `${block.name}: ${blockStrength} students need a seat but total capacity is only ${totalCap}`,
        })
      }
    }

    // Place the multi-option cell in every section sharing this block
    block.sectionNames.forEach(secName => {
      if (!classTT[secName]) classTT[secName] = {}
      if (!classTT[secName][block.day]) classTT[secName][block.day] = {}
      classTT[secName][block.day][block.periodId] = {
        subject: block.options.map(o => o.subject).filter(Boolean).join(' / '),
        teacher: block.options[0]?.teacher ?? '',
        room: block.options[0]?.room ?? '',
        optionalBlockId: block.id,
        options: block.options,
      } as any

      // Reserve every option's teacher across this slot
      block.options.forEach(opt => {
        if (opt.teacher) {
          ensureBusy(opt.teacher)
          teacherBusy[opt.teacher][block.day].add(block.periodId)
        }
      })

      // Initialize subjectCount entries for option subjects (so regular passes don't double-count)
      if (!subjectCount[secName]) subjectCount[secName] = {}
      block.options.forEach(opt => {
        if (opt.subject) subjectCount[secName][opt.subject] = (subjectCount[secName][opt.subject] ?? 0) + 1
      })
    })
  })

  // ── Pass 1: Place class teachers in Period 1 (hard constraint) ──
  sections.forEach((sec) => {
    const ctName = classTeacherMap[sec.name]
    if (!ctName) return
    ensureBusy(ctName)
    const ctStaff = staff.find(s => s.name === ctName)
    // Pick a subject this teacher can actually teach for this section
    const ctRawSubs: string[] = ctStaff?.subjects ?? []
    const ctSubjectRaw = ctRawSubs.find(s =>
      s === `${sec.name}::${s.replace(/.*::/, '')}` ||   // section-specific
      (!s.includes('::'))                                  // or global
    ) ?? ctRawSubs[0] ?? subjects[0]?.name ?? ''
    const ctSubject = ctSubjectRaw.replace(/.*::/, '')

    workDays.forEach(day => {
      const p = classPeriods[0]
      if (!p) return
      // Skip if Pass 0 already placed an optional block here
      if (classTT[sec.name]?.[day]?.[p.id]) return
      // schedU Scope: skip if class teacher or section is locked at this slot
      const sec_state = sec.scope?.cells?.[day]?.[p.id] ?? 'allowed'
      const ct_state = (ctStaff as any)?.scope?.cells?.[day]?.[p.id] ?? 'allowed'
      if (sec_state === 'locked' || ct_state === 'locked') return
      if (!teacherBusy[ctName][day].has(p.id)) {
        classTT[sec.name][day][p.id] = {
          subject: ctSubject,
          teacher: ctName,
          room: sec.room,
          isClassTeacher: true,
        }
        teacherBusy[ctName][day].add(p.id)
        subjectCount[sec.name][ctSubject] = (subjectCount[sec.name][ctSubject] ?? 0) + 1
      }
    })
  })

  // ── Pass 2: Fill remaining periods with constraint checking ──
  sections.forEach((sec, si) => {
    // Get subjects for this section.
    // Empty sub.sections means "applies to all classes" — treat as universal.
    const sectionSubjects = subjects.filter(sub => {
      const secs = sub.sections ?? []
      return secs.length === 0 || secs.includes(sec.name)
    })
    if (!sectionSubjects.length) return

    // Sort subjects by weekly periods (highest first — greedy)
    const sorted = [...sectionSubjects].sort((a, b) => b.periodsPerWeek - a.periodsPerWeek)

    workDays.forEach((day, di) => {
      classPeriods.forEach((period, pi) => {
        if (pi === 0) return // already filled by class teacher pass

        // Skip if already filled
        if (classTT[sec.name][day][period.id]) return

        // Find best subject to place (rotating, respecting max per day).
        // Target periods comes from subjectAllocations matrix (Doc Part 1) or
        // falls back to Subject.periodsPerWeek default.
        const availableSubs = sorted.filter(sub => {
          const weeklyDone = subjectCount[sec.name][sub.name] ?? 0
          const target = targetPeriods[sec.name]?.[sub.name] ?? (sub.periodsPerWeek ?? 0)
          if (target <= 0) return false
          const maxPD = (sub as any).maxPeriodsPerDay ?? 2
          const todayCount = Object.values(classTT[sec.name][day] ?? {})
            .filter(cell => cell?.subject === sub.name).length
          return weeklyDone < target && todayCount < maxPD
        })

        if (!availableSubs.length) {
          // No subject fits — mark as free
          return
        }

        // Rotate subject selection to distribute evenly
        const subIdx = (si * 11 + di * 7 + pi * 3) % availableSubs.length
        const chosenSub = availableSubs[subIdx]

        // ── Teacher eligibility ───────────────────────────────
        // Priority 1: teacher explicitly assigned to this section+subject via matrix
        // Priority 2: teacher with grade-level assignment
        // Priority 3: teacher with global subject name
        // In all cases: hard constraint — teacher must not be already busy this slot

        const sectionKey = `${sec.name}::${chosenSub.name}`
        const gradeKey   = sec.grade ? `${sec.grade}::${chosenSub.name}` : ''
        const simpleKey  = chosenSub.name

        // ── schedU Scope System integration ──
        // Skip placement entirely if SECTION scope LOCKS this slot.
        // 'disabled' applies a soft penalty but allows placement.
        const sectionScopeState = sec.scope
          ? (sec.scope.cells?.[day]?.[period.id] ?? 'allowed')
          : 'allowed'
        if (sectionScopeState === 'locked') return

        // Skip if SUBJECT scope LOCKS this slot.
        const subScopeState = (chosenSub as any).scope
          ? (((chosenSub as any).scope.cells?.[day]?.[period.id]) ?? 'allowed')
          : 'allowed'
        if (subScopeState === 'locked') {
          penalties.push({ constraint: 'subject-scope-locked', penalty: 0, details: `${chosenSub.name} is scope-locked off ${day} ${period.id}` })
          return
        }

        const isAvailable = (st: any) => {
          if (teacherBusy[st.name]?.[day]?.has(period.id)) return false
          // TEACHER scope hard exclusion
          const tScope = (st as any).scope
          if (tScope) {
            const s = tScope.cells?.[day]?.[period.id] ?? 'allowed'
            if (s === 'locked') return false
          }
          return true
        }

        const matchesSub = (st: any): boolean => {
          const subs: string[] = st.subjects ?? []
          if (!subs.length) return false
          // If this teacher has any section-specific assignments, use section/grade matching
          if (subs.some(s => s.includes('::'))) {
            return subs.some(s =>
              s === sectionKey ||
              (gradeKey !== '' && s === gradeKey)
            )
          }
          // Global subject name
          return subs.includes(simpleKey)
        }

        // Build candidate list: section-specific first, then global fallback
        let eligibleTeachers = staff.filter(st => matchesSub(st) && isAvailable(st))

        // Fallback: if no section-specific teacher available, use any teacher
        // who knows this subject globally and isn't busy
        if (!eligibleTeachers.length) {
          eligibleTeachers = staff.filter(st =>
            (st.subjects ?? []).includes(simpleKey) && isAvailable(st)
          )
        }
        // Last resort: any non-busy teacher at all (prevents empty slots when
        // teacher-subject links are incomplete)
        if (!eligibleTeachers.length) {
          eligibleTeachers = staff.filter(st => isAvailable(st))
        }

        // ── AI teacher selection — composite scoring ──
        // Replaces simple "least-busy-today" with a weighted score:
        //   + vertical continuity (already teaches this subject elsewhere)
        //   + section familiarity (already seen in this section)
        //   + load-balance bias (under target weekly load = preferred)
        //   − overload penalty (near max weekly periods = avoid)
        //   − today's load (avoid back-to-back exhaustion)
        //   − scope-disabled soft penalty
        //   − consecutive same-subject taught by same teacher

        // Pre-compute today's load for each teacher (cheap O(staff))
        const teacherLoadToday: Record<string, number> = {}
        Object.values(classTT).forEach(secData => {
          Object.values(secData[day] ?? {}).forEach((cell: any) => {
            if (cell?.teacher) teacherLoadToday[cell.teacher] = (teacherLoadToday[cell.teacher] ?? 0) + 1
          })
        })

        const scoreTeacher = (st: any): number => {
          let score = 0
          const name = st.name
          const weeklyLoad = teacherWeeklyLoad[name] ?? 0
          const todayLoad = teacherLoadToday[name] ?? 0
          const maxWeek = (st as any).maxPeriodsPerWeek ?? 40

          // Vertical continuity — already teaches this subject in another section
          if (teacherSubjectSet[name]?.has(chosenSub.name)) score += 25
          // Section familiarity — already teaches something in this section
          if (teacherSectionSet[name]?.has(sec.name)) score += 8

          // Load-balance bias: prefer teachers under the global target
          if (weeklyLoad < targetWeeklyLoadPerTeacher) {
            score += Math.min(30, (targetWeeklyLoadPerTeacher - weeklyLoad) * 2)
          } else {
            // Over target — penalise proportionally
            score -= Math.min(40, (weeklyLoad - targetWeeklyLoadPerTeacher) * 3)
          }
          // Strong avoid near max load (90%+)
          if (maxWeek > 0 && weeklyLoad >= maxWeek * 0.9) score -= 60

          // Avoid exhaustion today (each period taught today = -3)
          score -= todayLoad * 3

          // Scope-disabled soft penalty
          const tScope = (st as any).scope
          if (tScope) {
            const s = tScope.cells?.[day]?.[period.id] ?? 'allowed'
            if (s === 'disabled') score -= 10
          }

          // Anti-back-to-back: penalise if this teacher taught the same subject
          // in the previous period in this section
          const prev = classPeriods[pi - 1]
          if (prev) {
            const prevCell: any = classTT[sec.name]?.[day]?.[prev.id]
            if (prevCell?.teacher === name && prevCell?.subject === chosenSub.name) score -= 8
          }

          return score
        }

        const sortedTeachers = eligibleTeachers
          .map(t => ({ t, s: scoreTeacher(t) }))
          .sort((a, b) => b.s - a.s)
          .map(x => x.t)

        const teacher = sortedTeachers[0]
        if (!teacher) {
          // Soft penalty: no teacher available
          penalties.push({
            constraint: 'teacher-availability',
            penalty: 5,
            details: `No teacher for ${chosenSub.name} in ${sec.name} ${day} ${period.id}`,
          })
          return
        }

        // Soft constraint: avoid consecutive same subject
        const prevPeriod = classPeriods[pi - 1]
        if (prevPeriod && classTT[sec.name][day][prevPeriod.id]?.subject === chosenSub.name) {
          penalties.push({ constraint: 'consecutive-heavy', penalty: 7, details: `${chosenSub.name} consecutive in ${sec.name}` })
        }

        // Scope 'disabled' state — soft penalty (placement allowed but discouraged)
        if (sectionScopeState === 'disabled') {
          penalties.push({ constraint: 'section-scope-disabled', penalty: 15, details: `${sec.name} marked disabled at ${day} ${period.id}` })
        }
        if (subScopeState === 'disabled') {
          penalties.push({ constraint: 'subject-scope-disabled', penalty: 12, details: `${chosenSub.name} marked disabled at ${day} ${period.id}` })
        }
        const tScopeState = (teacher as any).scope
          ? (((teacher as any).scope.cells?.[day]?.[period.id]) ?? 'allowed')
          : 'allowed'
        if (tScopeState === 'disabled') {
          penalties.push({ constraint: 'teacher-scope-disabled', penalty: 10, details: `${teacher.name} marked disabled at ${day} ${period.id}` })
        }

        ensureBusy(teacher.name)
        classTT[sec.name][day][period.id] = {
          subject: chosenSub.name,
          teacher: teacher.name,
          room: sec.room,
        }
        teacherBusy[teacher.name][day].add(period.id)
        subjectCount[sec.name][chosenSub.name] = (subjectCount[sec.name][chosenSub.name] ?? 0) + 1
        // ── AI trackers: bump load + record subject/section pairing ──
        teacherWeeklyLoad[teacher.name] = (teacherWeeklyLoad[teacher.name] ?? 0) + 1
        teacherSubjectSet[teacher.name]?.add(chosenSub.name)
        teacherSectionSet[teacher.name]?.add(sec.name)
      })
    })
  })

  // ── Build Teacher Timetable ──
  const teacherTT: Record<string, TeacherSchedule> = {}
  staff.forEach(st => {
    teacherTT[st.name] = {
      classes: [...(st.classes ?? [])],
      subjects: [...(st.subjects ?? [])],
      schedule: Object.fromEntries(workDays.map(d => [d, {}])),
    }
  })

  Object.entries(classTT).forEach(([secName, secData]) => {
    Object.entries(secData).forEach(([day, dayData]) => {
      Object.entries(dayData).forEach(([periodId, cell]) => {
        if (!cell?.teacher) return
        if (!teacherTT[cell.teacher]) {
          teacherTT[cell.teacher] = { classes: [], subjects: [], schedule: Object.fromEntries(workDays.map(d => [d, {}])) }
        }
        const existing = teacherTT[cell.teacher].schedule[day]?.[periodId]
        if (existing) {
          existing.subject += ` / ${cell.subject}(${secName})`
          existing.conflict = true
        } else {
          teacherTT[cell.teacher].schedule[day][periodId] = {
            subject: `${cell.subject} (${secName})`,
            room: cell.room,
            sectionName: secName,
            isClassTeacher: cell.isClassTeacher,
          }
        }
      })
    })
  })

  // ── Detect Hard Conflicts ──
  const conflicts: Conflict[] = []
  classPeriods.forEach(p => {
    workDays.forEach(day => {
      const teacherMap: Record<string, string> = {}
      Object.entries(classTT).forEach(([sec, sd]) => {
        const cell = sd[day]?.[p.id]
        if (cell?.teacher) {
          if (teacherMap[cell.teacher]) {
            conflicts.push({
              type: 'double-booking',
              message: `${cell.teacher} double-booked: ${teacherMap[cell.teacher]} & ${sec} on ${day} ${p.name}`,
              teacher: cell.teacher, day, period: p.name,
            })
          } else teacherMap[cell.teacher] = sec
        }
      })
    })
  })

  // ── Final workload-balance health check ──
  //   Standard deviation of teacher weekly loads vs the target. The lower
  //   the better. Emitted as a soft penalty so the score reflects fairness.
  let finalStddev = 0
  const loads = Object.values(teacherWeeklyLoad)
  if (loads.length > 0) {
    const mean = loads.reduce((a, b) => a + b, 0) / loads.length
    const variance = loads.reduce((a, l) => a + (l - mean) ** 2, 0) / loads.length
    const stddev = Math.sqrt(variance)
    finalStddev = stddev
    // Penalty: 1 point per 1 stddev unit. Clamped to keep score readable.
    const balancePenalty = Math.min(50, Math.round(stddev * 4))
    if (balancePenalty > 0) {
      penalties.push({
        constraint: 'workload-imbalance',
        penalty: balancePenalty,
        details: `Teacher loads stddev=${stddev.toFixed(2)} around target=${targetWeeklyLoadPerTeacher}`,
      })
    }
    // Per-teacher overload penalties — exceeded individual max
    staff.forEach(t => {
      const load = teacherWeeklyLoad[t.name] ?? 0
      const max = (t as any).maxPeriodsPerWeek ?? 40
      if (load > max) {
        penalties.push({
          constraint: 'teacher-overload',
          penalty: (load - max) * 5,
          details: `${t.name} has ${load} periods/week (max ${max})`,
        })
      }
    })
  }

  const totalPenalty = penalties.reduce((a, p) => a + p.penalty, 0)

  return {
    classTT,
    teacherTT,
    conflicts,
    penalties,
    score: totalPenalty,
    iterations: sections.length * workDays.length * classPeriods.length,
    optionalBlocks: effectiveBlocks,
    dynamicLearningGroups: extractDynamicLearningGroups(effectiveBlocks, subjects),
    teacherWeeklyLoad,
    teacherLoadStddev: finalStddev,
  }
}

// ─── Auto Suggestions Engine ─────────────────────────────
// Suggestion type imported from @/types above

export function generateSuggestions(
  classTT: ClassTimetable,
  teacherTT: Record<string, TeacherSchedule>,
  staff: Staff[],
  subjects: Subject[],
  workDays: string[],
  periods: Period[]
): Suggestion[] {
  const suggestions: Suggestion[] = []
  const classPeriods = periods.filter(p => p.type === 'class')

  // Check workload imbalance
  staff.forEach(st => {
    const sched = teacherTT[st.name]?.schedule ?? {}
    const total = Object.values(sched).reduce((a, d) => a + Object.values(d).filter(x => x?.subject).length, 0)
    const max = st.maxPeriodsPerWeek
    if (total > max) {
      suggestions.push({ type: 'error', message: `${st.name} is overloaded: ${total}/${max} periods/week`, action: 'Reduce assignments' })
    } else if (total < max * 0.5 && total > 0) {
      suggestions.push({ type: 'info', message: `${st.name} is underutilized: ${total}/${max} periods/week`, action: 'Assign more classes' })
    }
  })

  // Check subject distribution
  Object.entries(classTT).forEach(([sec, secData]) => {
    subjects.forEach(sub => {
      let count = 0
      workDays.forEach(day => {
        count += Object.values(secData[day] ?? {}).filter(c => c?.subject === sub.name).length
      })
      if (count < sub.periodsPerWeek) {
        suggestions.push({ type: 'warning', message: `${sec}: ${sub.name} has ${count}/${sub.periodsPerWeek} periods placed`, action: 'Check teacher availability' })
      }
    })
  })

  // ── Cross-section pooling suggestions (schedU Phase 3) ──
  // Detect (subject, day, period) tuples that occur in MULTIPLE sections.
  // These are candidates for merging into a pooled optional block.
  const slotMap = new Map<string, string[]>() // "subject|day|periodId" -> [sections]
  Object.entries(classTT).forEach(([sec, secData]) => {
    Object.entries(secData ?? {}).forEach(([day, dayData]) => {
      Object.entries(dayData ?? {}).forEach(([pid, cell]: [string, any]) => {
        if (!cell?.subject || cell.optionalBlockId) return // skip if already pooled
        const key = `${cell.subject}|${day}|${pid}`
        const arr = slotMap.get(key) ?? []
        arr.push(sec)
        slotMap.set(key, arr)
      })
    })
  })
  const pooledSubjects = new Set<string>() // dedupe by subject to avoid spam
  slotMap.forEach((secs, key) => {
    if (secs.length < 2) return
    const [subject] = key.split('|')
    if (pooledSubjects.has(subject)) return
    pooledSubjects.add(subject)
    const periodLabel = periods.find(p => p.id === key.split('|')[2])?.name ?? key.split('|')[2]
    suggestions.push({
      type: 'info',
      message: `${subject} runs in parallel for ${secs.length} sections (${secs.join(', ')}) on ${key.split('|')[1]} ${periodLabel}`,
      action: 'Consider pooling into an Optional Block',
    })
  })

  return suggestions
}

// ─── Standalone Conflict Detector ────────────────────────
// Call this after any cell edit to keep the conflicts badge accurate.
// Derives workDays from the classTT keys so no extra parameter needed.
export function detectConflicts(
  classTT: ClassTimetable,
  periods: Period[]
): Conflict[] {
  const conflicts: Conflict[] = []
  const classPeriods = periods.filter(p => p.type === 'class')

  // Derive the full day set from the timetable itself
  const workDays = new Set<string>()
  Object.values(classTT).forEach(secData =>
    Object.keys(secData).forEach(d => workDays.add(d))
  )

  classPeriods.forEach(p => {
    workDays.forEach(day => {
      const teacherMap: Record<string, string> = {}
      // Track which sections share an optional block at this slot — they're
      // expected to have the same teachers and should NOT be flagged.
      const blockSlotIds: Record<string, string> = {} // sec -> blockId
      Object.entries(classTT).forEach(([sec, sd]) => {
        const cell: any = sd[day]?.[p.id]
        if (cell?.optionalBlockId) blockSlotIds[sec] = cell.optionalBlockId
        if (cell?.teacher) {
          if (teacherMap[cell.teacher]) {
            // Skip the conflict if both sections share the same optional block
            const otherSec = teacherMap[cell.teacher]
            if (blockSlotIds[sec] && blockSlotIds[otherSec] && blockSlotIds[sec] === blockSlotIds[otherSec]) {
              // intentional cross-section pooling — not a conflict
              return
            }
            conflicts.push({
              type: 'double-booking',
              message: `${cell.teacher} double-booked: ${teacherMap[cell.teacher]} & ${sec} on ${day} ${p.name}`,
              teacher: cell.teacher,
              day,
              period: p.name,
            })
          } else {
            teacherMap[cell.teacher] = sec
          }
        }
      })
    })
  })

  return conflicts
}

// ─── Re-optimization after drag/drop ─────────────────────
export function reoptimizeAfterSwap(
  classTT: ClassTimetable,
  sec1: string, day1: string, periodId1: string,
  sec2: string, day2: string, periodId2: string,
  staff: Staff[],
  workDays: string[]
): { classTT: ClassTimetable; conflicts: Conflict[]; valid: boolean } {
  const newTT = JSON.parse(JSON.stringify(classTT)) as ClassTimetable

  // Perform swap
  const cell1 = newTT[sec1]?.[day1]?.[periodId1]
  const cell2 = newTT[sec2]?.[day2]?.[periodId2]

  if (newTT[sec1]?.[day1] && newTT[sec2]?.[day2]) {
    newTT[sec1][day1][periodId1] = cell2
    newTT[sec2][day2][periodId2] = cell1
  }

  // Validate no teacher clash after swap
  const conflicts: Conflict[] = []
  const classPeriods = [periodId1, periodId2]

  classPeriods.forEach(pid => {
    ;[day1, day2].forEach(day => {
      const teacherMap: Record<string, string> = {}
      Object.entries(newTT).forEach(([sec, sd]) => {
        const cell = sd[day]?.[pid]
        if (cell?.teacher) {
          if (teacherMap[cell.teacher]) {
            conflicts.push({
              type: 'double-booking',
              message: `Teacher clash after swap: ${cell.teacher}`,
              teacher: cell.teacher, day,
            })
          } else teacherMap[cell.teacher] = sec
        }
      })
    })
  })

  return { classTT: newTT, conflicts, valid: conflicts.length === 0 }
}
