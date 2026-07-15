import { useState, useEffect, useRef, useMemo } from "react"
import { useTimetableStore } from "@/store/timetableStore"
import { useTerminology } from "@/hooks/useTerminology"
import { buildPeriodSequence, buildPeriodSequenceFromCw, rebuildTeacherTT } from "@/lib/aiEngine"
import { solveTimetable, generateSuggestions, durationToWeeklyPeriods } from "@/lib/schedulingEngine"
import { parseAllocation } from "@/lib/allocationSyntax"
import { ReviewDashboard } from "@/components/master/ReviewDashboard"
import { getCountry } from "@/lib/orgData"
import type { OptionalBlock, OptionalOption, Period, ClassTimetable } from "@/types"
import { GraduationCap, Users, BookOpen, Building2, CalendarDays, Clock } from "lucide-react"
import { P, P_D, P_L, P_B } from "@/components/resources/shared"

// ── DLG → OptionalBlock bridge ─────────────────────────────────────────────
//
// Step 4 (Student Groups) produces `dynamicLearningGroups` — one DLG per
// subject group with an explicit day + periodId (e.g. "Monday" / "P6").
// The solver, however, expects `optionalBlocks` (OptionalBlock[]).
//
// When the user has gone through Step 4 but never hand-authored manual
// optional blocks, we convert the Step-4 DLGs into OptionalBlocks so the
// solver honours the user's period assignments instead of re-deriving from
// scratch (which would pick Period 2 — the first available slot).
//
// Normalisation:
//   - day: "Monday" / "monday"  → "MONDAY"   (matches workDays format)
//   - periodId: "P6" / "p6"    → "p6"        (matches buildPeriodSequence ids)
//   - Fallback: if the normalised period doesn't exist in the bell schedule,
//     use the last class period so the block is still placed.
//
// Grouping: DLGs with the same (sorted) sectionNames are parallel subject
// choices for those sections → one OptionalBlock with multiple options.
function dlgsToOptionalBlocks(
  dlgs: Array<{
    id: string; subject: string; sectionNames: string[]
    totalStrength: number; teacher: string; room: string
    behavior: string; day: string; periodId: string
    slotId?: string; slotLabel?: string
  }>,
  classPeriods: Period[],
  workDays: string[],
): OptionalBlock[] {
  if (!dlgs.length) return []

  const validPids  = new Set(classPeriods.map(p => p.id))
  const blockMap = new Map<string, OptionalBlock & { _secSet?: Set<string> }>()

  dlgs.forEach(dlg => {
    // Groups no longer carry a pinned slot — leave day/periodId EMPTY so the
    // engine schedules the block across its full period quota on free slots.
    // (Any legacy day/periodId is still honoured as a starting hint if present.)
    const day = (dlg.day || '').toUpperCase()
    const rawPid = (dlg.periodId || '').toLowerCase()
    const periodId = validPids.has(rawPid) ? rawPid : ''

    // Grouping key:
    //  • slotted DLG (R1/R2/R3) → group by slotId, so all options of a slot form
    //    ONE block (Hindi/Odia/English under R1) and a DIFFERENT slot with the
    //    same subject (R2:Hindi) stays a SEPARATE block — the section attends
    //    both, so the solver schedules them in different periods.
    //  • plain DLG → group by its section set (unchanged behaviour).
    const secKey = dlg.slotId
      ? `slot:${dlg.slotId}`
      : [...(dlg.sectionNames ?? [])].sort().join('|')

    if (!blockMap.has(secKey)) {
      const idx = blockMap.size + 1
      blockMap.set(secKey, {
        id: dlg.slotId ? `slot-${dlg.slotId}` : `dlg-block-${idx}`,
        name: dlg.slotId ? `Slot ${dlg.slotId}` : `Optional Block ${idx}`,
        sectionNames: [...(dlg.sectionNames ?? [])],
        day,
        periodId,
        options: [],
        logic: 'OR',
        slotId: dlg.slotId,
        _secSet: new Set(dlg.sectionNames ?? []),
      } as any)
    }

    const block = blockMap.get(secKey)!
    // Union sections across a slot's options (students of each choice differ)
    for (const sn of (dlg.sectionNames ?? [])) (block as any)._secSet.add(sn)
    block.sectionNames = [...(block as any)._secSet]
    ;(block.options as any[]).push({
      subject: dlg.subject,
      teacher: dlg.teacher ?? '',
      room: dlg.room ?? '',
      capacity: dlg.totalStrength ?? 0,
      allocatedStrength: dlg.totalStrength ?? 0,
    })
  })

  return [...blockMap.values()].map(({ _secSet, ...b }) => b as OptionalBlock)
}

// ── Subject Combos (Step 4, Tab 2) → OptionalBlock bridge ──────────────────
//
// OR/AND combos live in `store.subjectGroups` (SubjectAndOrGroup[]). The
// solver only understands OptionalBlocks, so each combo becomes one block:
//
//   AND — all subjects run in parallel in the same slot, students split —
//         exactly the engine's parallel-options semantics.
//   OR  — one of the subjects runs per slot (rotation). Same shared-slot
//         block; the engine books every option's teacher in those slots,
//         the conservative reading that guarantees zero teacher clashes.
//
// Sections: the authored list when present; otherwise every section where
// ALL the combo's subjects are offered (intersection of their assignments).
// A combo whose subjects carry no assignments anywhere is skipped rather
// than assumed to apply school-wide.
// Teachers: resolved per option (subjectMappings first, then any teacher of
// the subject), each teacher used for at most one option per block.
function comboGroupsToOptionalBlocks(
  groups: Array<{
    id: string; name?: string; logic: 'AND' | 'OR'
    subjects: string[]; sections?: string[]; periodsPerWeek?: number; slotLabel?: string
  }>,
  subjects: any[],
  sections: any[],
  staff: any[],
): OptionalBlock[] {
  if (!groups?.length) return []
  const allSecNames = sections.map((s: any) => s.name as string)

  // subject → sections it is explicitly offered in ([] = unconstrained)
  const subjSecs = (subName: string): string[] => {
    const sub = subjects.find((s: any) => s.name === subName)
    if (!sub) return []
    const fromConfigs = ((sub as any).classConfigs ?? [])
      .map((c: any) => c.sectionName).filter(Boolean) as string[]
    return [...new Set([...((sub.sections as string[]) ?? []), ...fromConfigs])]
  }

  const teacherFor = (subName: string, secNames: string[], taken: Set<string>): string => {
    const mapped = staff.find((t: any) =>
      !taken.has(t.name) &&
      ((t.subjectMappings ?? []) as Array<{ subject: string; classes?: string[] }>)
        .some(m => m.subject === subName && (m.classes ?? []).some(c => secNames.includes(c))))
    if (mapped) return mapped.name
    const any = staff.find((t: any) => !taken.has(t.name) && (
      ((t.subjects ?? []) as string[]).some(s => s === subName || s.endsWith(`::${subName}`)) ||
      ((t.subjectMappings ?? []) as Array<{ subject: string }>).some(m => m.subject === subName)))
    return any?.name ?? ''
  }

  const blocks: OptionalBlock[] = []
  groups.forEach((g, gi) => {
    const subs = (g.subjects ?? []).filter(Boolean)
    if (subs.length < 2) return

    let secNames = (g.sections ?? []).filter(sn => allSecNames.includes(sn))
    if (!secNames.length) {
      if (subs.every(sub => subjSecs(sub).length === 0)) return
      secNames = allSecNames.filter(sn =>
        subs.every(sub => {
          const ss = subjSecs(sub)
          return ss.length === 0 || ss.includes(sn)
        }))
    }
    if (!secNames.length) return

    const taken = new Set<string>()
    const options = subs.map(sub => {
      const t = teacherFor(sub, secNames, taken)
      if (t) taken.add(t)
      return { subject: sub, teacher: t, room: '' }
    })

    blocks.push({
      id: `combo-${g.id || gi}`,
      name: g.slotLabel || g.name || `${g.logic} Combo ${gi + 1}`,
      sectionNames: secNames,
      day: '', periodId: '',
      options,
      periodsPerWeek: g.periodsPerWeek && g.periodsPerWeek > 0 ? g.periodsPerWeek : undefined,
      logic: g.logic,
      slotId: g.slotLabel || undefined,
    })
  })
  return blocks
}

// ── AND Combo Groups → OptionalBlocks bridge ──────────────────────────────────
//
// Each AndComboGroup defines mutually-exclusive bundles (PCM vs PCB).
// For the solver, each bundle that runs parallel to other bundles in the same
// time slot becomes an AND-logic OptionalBlock. We create one OptionalBlock
// per AndComboGroup that has generated teaching groups — the solver then
// knows to run all bundles simultaneously in the same period.
/** Map the Groups-step merge rule (Same/Cross × section/grade/stream/block) to a
 *  behaviour key the views label (NO_GROUPING/SAME_GRADE_ONLY/SAME_STREAM_ONLY/
 *  SAME_GRADE_STREAM/CROSS_GRADE_ALLOWED). */
function scopeToBehavior(scope: any): string {
  if (!scope || typeof scope !== 'object') return 'FLEXIBLE_GROUPING'
  if (scope.section === 'same') return 'NO_GROUPING'          // each section its own group
  if (scope.grade === 'same' && scope.stream === 'same') return 'SAME_GRADE_STREAM'
  if (scope.grade === 'same') return 'SAME_GRADE_ONLY'
  if (scope.stream === 'same') return 'SAME_STREAM_ONLY'
  return 'CROSS_GRADE_ALLOWED'
}

function andGroupsToOptionalBlocks(
  andGroups: import('@/types').AndComboGroup[],
  subjects: any[],
  staff: any[],
): OptionalBlock[] {
  if (!andGroups?.length) return []
  const blocks: OptionalBlock[] = []

  for (const group of andGroups) {
    if (!group.bundles?.length || !group.applicableSections?.length) continue

    // Find a teacher for a subject from the staff list
    const teacherFor = (subName: string, secNames: string[], taken: Set<string>): string => {
      const found = staff.find((t: any) =>
        !taken.has(t.name) &&
        ((t.subjectMappings ?? []) as Array<{ subject: string; classes?: string[] }>)
          .some(m => m.subject === subName && (m.classes ?? []).some(c => secNames.includes(c))))
      if (found) return found.name
      const any = staff.find((t: any) => !taken.has(t.name) &&
        ((t.subjects ?? []) as string[]).some(s => s === subName))
      return any?.name ?? ''
    }

    // If teaching groups have been generated, use them for precise room/section data
    if (group.generatedGroups && group.generatedGroups.length > 0) {
      // Group by bundleId — each bundle's groups run in the same slot type
      const byBundle = new Map<string, typeof group.generatedGroups>()
      for (const tg of group.generatedGroups) {
        if (!byBundle.has(tg.bundleId)) byBundle.set(tg.bundleId, [])
        byBundle.get(tg.bundleId)!.push(tg)
      }

      // One OptionalBlock covering all applicable sections, logic=AND
      const taken = new Set<string>()
      const options: OptionalOption[] = []
      for (const bundle of group.bundles) {
        const tgs = byBundle.get(bundle.id) ?? []
        const allSecs = tgs.flatMap(tg => tg.sectionSlices.map(s => s.sectionName))
        const repSubject = bundle.subjects[0] ?? bundle.name
        const t = teacherFor(repSubject, allSecs, taken)
        if (t) taken.add(t)
        options.push({
          subject: repSubject,
          teacher: tg_teacher(tgs) || t,
          room: tgs[0]?.room ?? '',
          allocatedStrength: tgs.reduce((a, tg) => a + tg.totalStrength, 0),
        })
      }

      if (options.length >= 2) {
        blocks.push({
          id: `and-group-${group.id}`,
          name: group.name,
          sectionNames: group.applicableSections,
          day: '', periodId: '',
          options,
          logic: 'AND',
          behavior: scopeToBehavior(group.groupingScope),
        })
      }
    } else {
      // Fallback: use the strengthMatrix directly
      const taken = new Set<string>()
      const options: OptionalOption[] = group.bundles.map(bundle => {
        const repSubject = bundle.subjects[0] ?? bundle.name
        const t = teacherFor(repSubject, group.applicableSections, taken)
        if (t) taken.add(t)
        const strength = group.applicableSections.reduce(
          (a, sec) => a + (group.strengthMatrix?.[sec]?.[bundle.id] ?? 0), 0)
        return { subject: repSubject, teacher: t, room: '', allocatedStrength: strength || undefined }
      })

      if (options.length >= 2) {
        blocks.push({
          id: `and-group-${group.id}`,
          name: group.name,
          sectionNames: group.applicableSections,
          day: '', periodId: '',
          options,
          logic: 'AND',
          behavior: scopeToBehavior(group.groupingScope),
        })
      }
    }
  }
  return blocks
}

function tg_teacher(tgs: Array<{ teacher?: string }>): string {
  return tgs.find(tg => tg.teacher)?.teacher ?? ''
}

type JobStatus = "idle" | "running" | "completed" | "failed"

interface Job {
  id: string
  status: JobStatus
  progress: number
  currentStep: string
  startedAt?: number
}

// Each step: progress % it animates to + a short human label
const STEPS = [
  { pct:  8, label: "Reading school setup…" },
  { pct: 18, label: "Mapping lesson slots across the week…" },
  { pct: 30, label: "Matching teachers to subjects…" },
  { pct: 42, label: "Pairing every subject with a teacher…" },
  { pct: 55, label: "Building the weekly schedule…" },
  { pct: 65, label: "Ensuring no teacher is double-booked…" },
  { pct: 75, label: "Balancing workload across all classes…" },
  { pct: 83, label: "Spreading subjects evenly across the week…" },
  { pct: 90, label: "Checking for conflicts and gaps…" },
  { pct: 95, label: "Validating all constraints…" },
  { pct: 98, label: "Building class and teacher views…" },
]

// The solve completes synchronously before this progress ceremony even
// starts (see startGenerate below) — so instead of a fabricated animation
// with no relation to the user's actual data, we flatten the just-computed
// classTT into real "class → subject · teacher" lines and reveal a few per
// tick alongside the ring. Same cadence, but genuinely shows the schedule
// being assembled instead of a generic spinner.
function flattenAssignments(classTT: ClassTimetable): string[] {
  const lines: string[] = []
  for (const [section, days] of Object.entries(classTT ?? {})) {
    for (const slots of Object.values(days ?? {})) {
      for (const cell of Object.values(slots ?? {})) {
        const c = cell as any
        if (!c?.subject) continue
        lines.push(`${section} → ${c.subject}${c.teacher ? ` · ${c.teacher}` : ''}`)
      }
    }
  }
  // Shuffle so the feed doesn't just march through one section at a time.
  for (let i = lines.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[lines[i], lines[j]] = [lines[j], lines[i]]
  }
  return lines
}

// Default academic year boundaries
function defaultStartDate(): string {
  const now = new Date()
  const year = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1
  return `${year}-06-01`
}
function defaultEndDate(): string {
  const now = new Date()
  const year = now.getMonth() >= 3 ? now.getFullYear() + 1 : now.getFullYear()
  return `${year}-03-31`
}

// ── Block-wise (per-shift) timetable generation helpers ───────────────────────
const _toMins = (s: string) => { const [h, m] = (s || '08:00').split(':').map(Number); return h * 60 + m }

/** Class key from a section name — mirrors the timetable view's getSectionClassKey. */
function sectionKey(sectionName: string): string {
  const norm = sectionName.toLowerCase().replace(/[\s-]/g, '')
  if (norm.startsWith('nur')) return 'nur'
  if (norm.startsWith('lkg')) return 'lkg'
  if (norm.startsWith('ukg')) return 'ukg'
  return sectionName.split(/[\s-]/)[0].toLowerCase()
}

/** Teaching periods a section actually has, per a set of bell rows (null = unknown).
 *
 * Returns a count ONLY when the bell explicitly excludes this class from some
 * teaching rows — i.e. the class genuinely disperses earlier than others.
 * If every teaching row either has no class filter or still includes this class,
 * the class has a full day and we return null so no slots are locked.
 */
function teachCountFromRows(secName: string, rows: any[] | undefined): number | null {
  if (!rows?.length) return null
  const key = sectionKey(secName)
  const teachRows = rows.filter((r: any) => r.type === 'teaching')
  // Class must appear in at least one row to be relevant
  if (!teachRows.some((r: any) => (r.classes ?? []).includes(key))) return null
  // Only apply early-dispersal logic when some row EXPLICITLY excludes this class.
  // Class-wise breaks that merely shift timing still include every class in each
  // period row — those must NOT trigger locking.
  const excludedBySomeRow = teachRows.some((r: any) => {
    const cls: string[] = r.classes ?? []
    return cls.length > 0 && !cls.includes(key)
  })
  if (!excludedBySomeRow) return null
  return teachRows.filter((r: any) => {
    const cls: string[] = r.classes ?? []
    return cls.length === 0 || cls.includes(key)
  }).length
}

/**
 * Bell-true adjacency for one section: ids of class periods whose SUCCESSOR
 * teaching period is back-to-back in the bell (no break row between the Nth
 * and N+1th teaching rows). Used to stop double periods straddling a break.
 * Returns null when the rows don't cover this section (caller skips the map
 * entry → solver falls back to plain array adjacency).
 */
function adjacencyIdsFromRows(secName: string, rows: any[] | undefined, classPeriodIds: string[]): string[] | null {
  if (!rows?.length) return null
  const key = sectionKey(secName)
  if (!rows.some((r: any) => r.type === 'teaching' && (r.classes ?? []).includes(key))) return null
  const myRows = rows.filter((r: any) => !(r.classes ?? []).length || r.classes.includes(key))
  const ids: string[] = []
  let teachIdx = 0
  for (let i = 0; i < myRows.length; i++) {
    if (myRows[i].type !== 'teaching') continue
    const next = myRows[i + 1]
    if (next && next.type === 'teaching') {
      const pid = classPeriodIds[teachIdx]
      if (pid) ids.push(pid)
    }
    teachIdx++
  }
  return ids
}

/**
 * Early dispersal: clone sections with scope-locked slots for periods beyond
 * their bell-schedule period count, so the solver never places subjects after
 * a junior group has already dispersed.
 */
function lockEarlyDispersal(
  secs: any[], classPeriods: Period[], workDays: string[],
  countFor: (name: string) => number | null,
): any[] {
  return secs.map(sec => {
    const tc = countFor(sec.name)
    // Apply early dispersal only for a GENUINE partial day. An implausibly low
    // count (relative to the grid) means the bell isn't really configured for
    // this section — locking on it would wrongly seal off most of the day and
    // leave everything unplaced. Require the section to teach at least half the
    // grid's periods before we lock the tail.
    const minGenuine = Math.max(4, Math.ceil(classPeriods.length / 2))
    if (tc == null || tc >= classPeriods.length || tc < minGenuine) return sec
    const scope = JSON.parse(JSON.stringify(sec.scope ?? {}))
    scope.cells ??= {}
    for (const day of workDays) {
      scope.cells[day] ??= {}
      for (const p of classPeriods.slice(tc)) scope.cells[day][p.id] = 'locked'
    }
    return { ...sec, scope }
  })
}

/**
 * Build a block's abstract period sequence (block-prefixed ids so merged
 * timetables never collide) plus a periodId → [startMins, endMins] clock map.
 *
 * Derived from the block's ACTUAL bell rows (real assembly length, capped
 * period durations, real break positions) — falls back to a synthetic uniform
 * grid only when the block has no generated rows yet.
 */
function buildBlockPeriods(shift: any, rows: any[]): { periods: Period[]; clock: Record<string, [number, number]> } {
  const periods: Period[] = []
  const clock: Record<string, [number, number]> = {}
  let cur = _toMins(shift.startTime)
  const push = (suffix: string, name: string, dur: number, type: Period['type']) => {
    const id = `${shift.id}__${suffix}`
    periods.push({ id, name, duration: dur, type, shiftable: type === 'class' } as Period)
    clock[id] = [cur, cur + dur]; cur += dur
  }

  // ── Ground-truth path: walk the generated rows in order ──
  if (rows.some(r => r.type === 'teaching')) {
    const seen = new Set<string>()
    let pN = 0, brkN = 0
    for (const r of rows) {
      // Skip duplicate same-name rows (per-group variants merged by the bell grid)
      const sig = `${r.type}|${r.name}`
      if (seen.has(sig)) continue
      seen.add(sig)
      if (r.type === 'assembly')         push('asm', 'Assembly', r.duration, 'fixed-start')
      else if (r.type === 'teaching')    push(`p${++pN}`, `Period ${pN}`, r.duration, 'class')
      else if (r.type === 'lunch')       push(`brk${++brkN}`, r.name || 'Lunch', r.duration, 'lunch')
      else if (r.type === 'short-break') push(`brk${++brkN}`, r.name || 'Break', r.duration, 'break')
      // dispersal intentionally omitted — not a schedulable column
    }
    if (pN > 0) return { periods, clock }
    // fall through to synthetic if rows had no usable teaching periods
    periods.length = 0; cur = _toMins(shift.startTime)
  }

  // ── Synthetic fallback (no rows generated for this block yet) ──
  const asm = rows.find(r => r.type === 'assembly')
  if (asm) push('asm', 'Assembly', asm.duration, 'fixed-start')
  const lunchDur = Math.max(0, ...rows.filter(r => r.type === 'lunch').map(r => r.duration))
  const sbDur    = Math.max(0, ...rows.filter(r => r.type === 'short-break').map(r => r.duration))
  const N  = Math.max(1, shift.maxPeriods || 8)
  const pd = shift.periodDur || 40
  const sbAfter    = Math.max(1, Math.ceil(N * 0.3))
  const lunchAfter = Math.ceil(N / 2)
  for (let n = 1; n <= N; n++) {
    push(`p${n}`, `Period ${n}`, pd, 'class')
    if (n === sbAfter && sbDur > 0)    push('sb', 'Short Break', sbDur, 'break')
    if (n === lunchAfter && lunchDur > 0) push('ln', 'Lunch', lunchDur, 'lunch')
  }
  return { periods, clock }
}

export function Step6Generate() {
  const store = useTimetableStore()
  const { config, sections, participantPools, facilities, subjects, breaks,
          setPeriods, setClassTT, setTeacherTT, setConflicts, setSuggestions,
          setStep, setConfig, setTimetableStatus } = store
  const T = useTerminology()
  const [job, setJob] = useState<Job | null>(null)
  const [solverOutput, setSolverOutput] = useState<ReturnType<typeof solveTimetable> | null>(null)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)
  // Whether to show the "already generated" banner (user came back after closing)
  const [showRegenConfirm, setShowRegenConfirm] = useState(false)
  // Real assignments from the just-computed schedule, revealed a few at a
  // time while the progress ring animates — see flattenAssignments above.
  const [liveFeed, setLiveFeed] = useState<string[]>([])

  // Detect existing timetable in the store (persisted across sessions)
  const hasExistingTT = Object.keys(store.classTT ?? {}).length > 0

  // Timetable identity — pre-filled with sensible defaults
  const [ttName, setTtName]         = useState(config.timetableName       || `${config.schoolName || "School"} Timetable`)
  const [ttStart, setTtStart]       = useState(config.timetableStartDate  || defaultStartDate())
  const [ttEnd, setTtEnd]           = useState(config.timetableEndDate    || defaultEndDate())

  useEffect(() => () => { if (pollRef.current) clearInterval(pollRef.current) }, [])

  const totalParticipants = participantPools.reduce((a, p) => a + p.participantCount, 0)

  // ── Stats for the info cards ──────────────────────────────────
  const stats = [
    { icon: GraduationCap, label:"Classes",  value: sections.length },
    { icon: Users,         label:"Teachers", value: store.staff.length },
    { icon: BookOpen,      label:"Subjects",  value: subjects.length },
    { icon: Building2,     label:"Venues",    value: facilities.length || sections.length },
    { icon: CalendarDays,  label:"Days/week", value: config.workDays?.length ?? 5 },
    { icon: Clock,         label:"Periods/day",value: config.periodsPerDay ?? 8 },
  ]

  // ── Pre-flight summary — what WILL be generated, judged before clicking ──
  // All derived from the ground-truth bell schedules + the allocation matrix,
  // so the user can sanity-check day shape, workload and capacity in one look.
  const preflight = useMemo(() => {
    const bellSchedules = (config as any).bellSchedules as Array<{ startTime: string; rows: any[] }> | undefined
    if (!bellSchedules?.length || !sections.length) return null
    const subjectAllocations: Record<string, Record<string, string>> = (store as any).subjectAllocations ?? {}
    const workDayCount = config.workDays?.length || 5
    const toMin = (s: string) => { const [h, m] = (s || '08:00').split(':').map(Number); return h * 60 + m }
    const fmt = (m: number) => `${(Math.floor(m / 60) % 12) || 12}:${String(m % 60).padStart(2, '0')} ${Math.floor(m / 60) >= 12 ? 'PM' : 'AM'}`

    // Bucket sections by (periods/day, end time) — one line per distinct day shape
    type Bucket = { count: number; endMin: number; secs: string[] }
    const buckets = new Map<string, Bucket>()
    const overCap: string[] = []
    const unallocated: string[] = []
    let totalWeekly = 0, doubleSubjects = 0

    for (const sec of sections as any[]) {
      let count: number | null = null, endMin = 0
      for (const bs of bellSchedules) {
        const c = teachCountFromRows(sec.name, bs.rows)
        if (c == null) continue
        count = c
        const key = sectionKey(sec.name)
        endMin = toMin(bs.startTime) + bs.rows
          .filter((r: any) => r.type !== 'dispersal' && (!(r.classes ?? []).length || r.classes.includes(key)))
          .reduce((s: number, r: any) => s + r.duration, 0)
        break
      }
      if (count == null) continue
      const bk = `${count}@${endMin}`
      if (!buckets.has(bk)) buckets.set(bk, { count, endMin, secs: [] })
      buckets.get(bk)!.secs.push(sec.name)

      // Workload + capacity (bell-true: this section's real periods × days)
      const row = subjectAllocations[sec.name] ?? {}
      let used = 0
      for (const raw of Object.values(row)) {
        const p = parseAllocation(raw)
        if (!p.valid) continue
        used += p.weeklyTotal
        if (p.doublePeriods > 0) doubleSubjects++
      }
      totalWeekly += used
      if (used === 0) unallocated.push(sec.name)
      else if (used > count * workDayCount) overCap.push(sec.name)
    }

    // Display label for a bucket: unique grade names, capped
    const gradeLabel = (secs: string[]) => {
      const grades = [...new Set(secs.map(s => {
        const parts = s.split(/[-\s]+/)
        const last = parts[parts.length - 1]
        return (parts.length > 1 && (/^[A-Za-z]$/.test(last) || /^\d{1,2}$/.test(last))) ? parts.slice(0, -1).join('-') : s
      }))]
      return grades.length <= 4 ? grades.join(', ') : `${grades.slice(0, 3).join(', ')} +${grades.length - 3}`
    }

    const shapes = [...buckets.values()]
      .sort((a, b) => a.endMin - b.endMin)
      .map(b => ({ label: gradeLabel(b.secs), count: b.count, end: fmt(b.endMin), nSecs: b.secs.length }))

    const parallelGroups =
      (((store as any).dynamicLearningGroups ?? []).length +
       ((store as any).subjectGroups ?? []).length) ||
      ((store as any).optionalBlocks ?? []).length
    const dayOffRules = ((config as any).dayOffRules ?? []).length

    return { shapes, totalWeekly, doubleSubjects, parallelGroups, dayOffRules, overCap, unallocated }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config, sections, (store as any).subjectAllocations])

  // ── Start generation ─────────────────────────────────────────
  const startGenerate = () => {
    // Persist timetable identity into config before running
    setConfig({ timetableName: ttName.trim() || "My Schedule", timetableStartDate: ttStart, timetableEndDate: ttEnd })
    setTimetableStatus('generating')

    const jobId    = crypto.randomUUID()
    const startedAt = Date.now()
    setJob({ id: jobId, status: "running", progress: 3, currentStep: "Starting…", startedAt })
    setLiveFeed([])

    let output: ReturnType<typeof solveTimetable>
    let solveMs: number

    try {
      const workDays = config.workDays?.length ? config.workDays : ['MONDAY','TUESDAY','WEDNESDAY','THURSDAY','FRIDAY']

      // Build period sequence:
      //   • If class-wise breaks are configured use buildPeriodSequenceFromCw which
      //     places each break at its EXACT afterPeriod position (correct distribution).
      //   • Otherwise fall back to the legacy even-distribution builder.
      const classwiseBreaks = (config as any).classwiseBreaks as Array<{id:string;name:string;type:string;afterPeriod:number;duration:number}> | undefined
      const fixedStarts = breaks.filter((b: any) => b.type === 'fixed-start') as Period[]
      const periods = classwiseBreaks?.length
        ? buildPeriodSequenceFromCw(classwiseBreaks, config.periodsPerDay ?? 8, config.defaultSessionDuration ?? 40, fixedStarts)
        : buildPeriodSequence(breaks, config.periodsPerDay ?? 8)

      const resolvedSubjects = store.schedulingMode === 'duration-based'
        ? subjects.map(sub => {
            const rh = (sub as any).requiredHours
            if (!rh) return sub
            const weekly = durationToWeeklyPeriods({
              subjectName: sub.name, className: 'all',
              requiredHours: rh,
              periodDurationMins: (sub as any).sessionDuration ?? 45,
              workingDaysPerYear: store.workingDaysPerYear ?? 220,
              workingDaysPerWeek: workDays.length,
            })
            return { ...sub, periodsPerWeek: weekly }
          })
        : subjects

      const staff = store.staff
      const manualOptionalBlocks = (store as any).optionalBlocks ?? []
      const storeAndComboGroups  = (store as any).andComboGroups ?? []
      const storeDLGs            = (store as any).dynamicLearningGroups ?? []
      const subjectCombinations  = (store as any).subjectCombinations ?? []
      const sectionStrengths     = (store as any).sectionStrengths ?? []
      const subjectAllocations   = (store as any).subjectAllocations ?? {}
      const rooms                = (store as any).rooms ?? []

      // Prefer manually-authored optional blocks; if none exist but the user
      // ran Step 4 (Student Groups), convert those DLGs into OptionalBlocks
      // so the solver honours the user's period assignments.
      const classPeriods = periods.filter((p: Period) => p.type === 'class')
      const baseBlocks: OptionalBlock[] =
        manualOptionalBlocks.length > 0
          ? manualOptionalBlocks
          : dlgsToOptionalBlocks(storeDLGs, classPeriods, workDays)

      // OR/AND combos from Step 4 Tab 2 are an independent source — always
      // merged in, deduped against blocks covering the same sections+subjects.
      const comboBlocks = comboGroupsToOptionalBlocks(
        (store as any).subjectGroups ?? [], resolvedSubjects, sections, staff)
      // AND Combo Groups from Step 4 Tab 1 (bundle-based splits like PCM vs PCB)
      const andComboBlocks = andGroupsToOptionalBlocks(storeAndComboGroups, resolvedSubjects, staff)
      const blockSig = (b: OptionalBlock) =>
        (b.slotId ?? '') + '::' +
        [...b.sectionNames].sort().join('|') + '::' +
        b.options.map(o => o.subject).filter(Boolean).sort().join('|')
      const seenSigs = new Set(baseBlocks.map(blockSig))
      const optionalBlocks: OptionalBlock[] = [
        ...baseBlocks,
        ...comboBlocks.filter(b => !seenSigs.has(blockSig(b))),
        ...andComboBlocks.filter(b => !seenSigs.has(blockSig(b))),
      ]

      // ── Block-wise (Advanced multi-shift) generation ──────────────────────
      // Each block (shift) is solved independently over its own classes + its own
      // period grid (block-prefixed ids), in sequence. After each block solves, its
      // teachers' busy CLOCK intervals are blocked in later blocks so a teacher is
      // never double-booked across blocks at the same wall-clock time.
      const scheduleMode = (config as any).scheduleMode
      const shiftsCfg    = (config as any).shifts as any[] | undefined
      const shiftRowsCfg = (config as any).shiftRows as Record<string, any[]> | undefined
      const blockWise = scheduleMode === 'advanced' && Array.isArray(shiftsCfg) && shiftsCfg.length > 1 && !!shiftRowsCfg

      if (blockWise) {
        const mergedClassTT: any = {}
        const mergedTeacherTT: any = {}
        const mergedConflicts: any[] = []
        const unionPeriods: Period[] = []
        const blockMeta: any[] = []
        // teacher → day → busy clock intervals [startMins, endMins]
        const busy: Record<string, Record<string, Array<[number, number]>>> = {}
        const overlaps = (a: [number, number], b: [number, number]) => a[0] < b[1] && b[0] < a[1]

        for (const shift of shiftsCfg!) {
          const rows = shiftRowsCfg![shift.id] ?? []
          const { periods: bp, clock } = buildBlockPeriods(shift, rows)
          const blockSections = sections.filter(sec => (shift.classes || []).includes(sectionKey(sec.name)))
          if (!blockSections.length) continue

          // Block teacher slots that clash (clock-overlap) with already-solved blocks.
          const avail: any = JSON.parse(JSON.stringify((store as any).teacherAvailability ?? {}))
          for (const [tName, dayMap] of Object.entries(busy)) {
            for (const [day, ivals] of Object.entries(dayMap)) {
              for (const p of bp) {
                if (p.type !== 'class') continue
                const c = clock[p.id]
                if (c && ivals.some(iv => overlaps(iv, c))) {
                  avail[tName] ??= {}; avail[tName][day] ??= {}; avail[tName][day][p.id] = 'blocked'
                }
              }
            }
          }

          // Early dispersal within the block: lock periods a section doesn't have
          const bpClass = bp.filter(p => p.type === 'class')
          const lockedBlockSections = lockEarlyDispersal(
            blockSections, bpClass, workDays, name => teachCountFromRows(name, rows))

          // Bell-true adjacency: double periods must not straddle a break
          const bpClassIds = bpClass.map(p => p.id)
          const blockAdjacency: Record<string, string[]> = {}
          for (const sec of blockSections) {
            const adj = adjacencyIdsFromRows(sec.name, rows, bpClassIds)
            if (adj) blockAdjacency[sec.name] = adj
          }

          const out = solveTimetable({
            sections: lockedBlockSections, staff, subjects: resolvedSubjects, periods: bp, workDays,
            requirements: [], optionalBlocks, subjectCombinations, sectionStrengths,
            subjectAllocations, rooms, teacherAvailability: avail,
            dayOffRules: (store as any).config?.dayOffRules ?? [],
            sectionAdjacency: blockAdjacency,
          })

          Object.assign(mergedClassTT, out.classTT)
          for (const [tn, ts] of Object.entries(out.teacherTT)) if (!mergedTeacherTT[tn]) mergedTeacherTT[tn] = ts
          mergedConflicts.push(...out.conflicts)
          unionPeriods.push(...bp)
          blockMeta.push({ id: shift.id, name: shift.name, startTime: shift.startTime, sectionNames: blockSections.map(s => s.name), periods: bp })

          // Record this block's teacher busy clock intervals for later blocks.
          for (const [, days] of Object.entries(out.classTT)) {
            for (const [day, slots] of Object.entries(days as any)) {
              for (const [pid, cell] of Object.entries(slots as any)) {
                const t = (cell as any).teacher
                const c = clock[pid]
                if (!t || !c) continue
                busy[t] ??= {}; busy[t][day] ??= []; busy[t][day].push(c)
              }
            }
          }
        }

        rebuildTeacherTT(mergedClassTT, mergedTeacherTT, workDays)
        output = { classTT: mergedClassTT, teacherTT: mergedTeacherTT, conflicts: mergedConflicts, penalties: [], score: 0, iterations: 0 } as ReturnType<typeof solveTimetable>
        solveMs = Date.now() - startedAt

        setPeriods(unionPeriods)
        setClassTT(mergedClassTT)
        setTeacherTT(mergedTeacherTT)
        setConflicts(mergedConflicts)
        setSolverOutput(output)
        setConfig({ blockMeta } as any)
        setSuggestions([])
      } else {

      // Early dispersal: lock the periods each section doesn't have per the
      // ground-truth bell schedule, so juniors never get subjects scheduled
      // after their dispersal time.
      const bellSchedules = (config as any).bellSchedules as Array<{ startTime: string; rows: any[] }> | undefined
      const countFor = (name: string): number | null => {
        for (const bs of bellSchedules ?? []) {
          const c = teachCountFromRows(name, bs.rows)
          if (c != null) return c
        }
        return null
      }
      const effSections = lockEarlyDispersal(sections, classPeriods, workDays, countFor)

      // Bell-true adjacency: double periods must not straddle a break
      const classPeriodIds = classPeriods.map((p: Period) => p.id)
      const sectionAdjacency: Record<string, string[]> = {}
      for (const sec of sections) {
        for (const bs of bellSchedules ?? []) {
          const adj = adjacencyIdsFromRows(sec.name, bs.rows, classPeriodIds)
          if (adj) { sectionAdjacency[sec.name] = adj; break }
        }
      }

      output  = solveTimetable({
        sections: effSections, staff, subjects: resolvedSubjects, periods, workDays,
        requirements: [],
        optionalBlocks,
        subjectCombinations,
        sectionStrengths,
        subjectAllocations,
        rooms,
        teacherAvailability: (store as any).teacherAvailability ?? {},
        // Class-specific day-off rules from bell schedule step (e.g. Sat off for Nursery/LKG)
        dayOffRules: (store as any).config?.dayOffRules ?? [],
        sectionAdjacency,
      })
      solveMs = Date.now() - startedAt

      const suggestions = generateSuggestions(output.classTT, output.teacherTT, staff, resolvedSubjects, workDays, periods)
      setConfig({ blockMeta: undefined } as any)   // single schedule — clear any stale block metadata
      setPeriods(periods)
      setClassTT(output.classTT)
      setTeacherTT(output.teacherTT)
      setConflicts(output.conflicts)
      setSolverOutput(output)
      // Persist blocked-slot telemetry to the store so any view (timetable
      // cells, dashboard, conflict panel) can surface "why is this empty?"
      ;(store as any).setBlockedSlots?.(output.blockedSlots ?? [])
      // Persist DLG metadata for the timetable-cell inspector
      ;(store as any).setDynamicLearningGroups?.(output.dynamicLearningGroups ?? [])
      setSuggestions(suggestions)
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      setJob(j => j ? { ...j, status: "failed", progress: 0, currentStep: `Error: ${msg}` } : j)
      return
    }

    // ── Animate progress through STEPS at 110ms each, revealing real
    //    assignments from the just-computed schedule alongside it ──
    const assignments = flattenAssignments(output.classTT)
    const perTick = Math.max(1, Math.ceil(assignments.length / STEPS.length))
    let step = 0
    pollRef.current = setInterval(() => {
      if (step >= STEPS.length) {
        clearInterval(pollRef.current!)
        setTimetableStatus('draft')   // saved as draft — user must publish
        const conflicts = output.conflicts.length
        setJob(j => j ? {
          ...j, status: "completed", progress: 100,
          currentStep: conflicts > 0
            ? `Done — ${conflicts} conflict(s) found, review in timetable`
            : `Done in ${solveMs}ms — zero conflicts ✅`,
        } : j)
        return
      }
      const idx = step
      setJob(j => j ? { ...j, progress: STEPS[idx].pct, currentStep: STEPS[idx].label } : j)
      if (assignments.length) {
        const slice = assignments.slice(idx * perTick, idx * perTick + perTick)
        if (slice.length) setLiveFeed(prev => [...slice.reverse(), ...prev].slice(0, 4))
      }
      step++
    }, 110)
  }

  // ── Circular SVG ring ─────────────────────────────────────────
  const R   = 54
  const circ = 2 * Math.PI * R   // ≈ 339
  const progress = job?.progress ?? 0
  const dashOffset = circ * (1 - progress / 100)

  const ringColor =
    job?.status === "completed" ? P :
    job?.status === "failed"    ? "#dc2626" : P

  const elapsed = job?.startedAt ? ((Date.now() - job.startedAt) / 1000).toFixed(1) : "0.0"

  return (
    <div style={{ display:"flex", flexDirection:"column" as const, alignItems:"center", minHeight:"70vh", gap:28, padding:"40px 24px", textAlign:"center" as const }}>

      <style>{`
        @keyframes spin-ring { to { transform: rotate(360deg) } }
        @keyframes fade-up   { from { opacity:0; transform:translateY(10px) } to { opacity:1; transform:translateY(0) } }
        @keyframes pulse-dot { 0%,100%{opacity:1} 50%{opacity:0.25} }
      `}</style>

      {/* ── Title ── */}
      <div style={{ animation:"fade-up 0.4s ease" }}>
        <h2 style={{ fontFamily:"'Plus Jakarta Sans',Georgia,serif", fontSize:28, margin:"0 0 4px" }}>
          {!job && hasExistingTT && !showRegenConfirm ? `Your ${T.schedule.toLowerCase()} is saved ✓` :
           !job                       ? `Ready to generate your ${T.schedule.toLowerCase()}` :
           job.status === "running"   ? `Building your ${T.schedule.toLowerCase()}…` :
           job.status === "completed" ? `${T.schedule} is ready! 🎉` :
           "Something went wrong"}
        </h2>
        {job?.status === "running" && (
          <p style={{ fontSize:12, color:"#8B87AD", margin:0, fontFamily:"'DM Mono',monospace" }}>{elapsed}s</p>
        )}
      </div>

      {/* ── Journey strip — where you are in the schedule's lifecycle, so the
           next move is always guessable without leaving the page ── */}
      {(() => {
        const published = store.timetableStatus === 'published'
        // Stage index: 0 Setup · 1 Generate · 2 Review · 3 Publish · 4 Live
        const current =
          job?.status === "running"   ? 1 :
          job?.status === "completed" ? 2 :
          job?.status === "failed"    ? 1 :
          hasExistingTT ? (published ? 4 : 2) : 1
        const STAGES = [
          { label: 'Set up',   sub: 'wizard steps 1–4' },
          { label: 'Generate', sub: 'AI builds the draft' },
          { label: 'Review',   sub: 'fine-tune any cell' },
          { label: 'Publish',  sub: 'share & export' },
          { label: 'Go live',  sub: 'calendar follows the clock' },
        ]
        return (
          <div style={{ display:"flex", alignItems:"flex-start", gap:0, animation:"fade-up 0.4s ease 0.05s both", maxWidth:560, width:"100%" }}>
            {STAGES.map((s, i) => {
              const done = i < current
              const isNow = i === current
              return (
                <div key={s.label} style={{ flex:1, display:"flex", flexDirection:"column" as const, alignItems:"center", position:"relative" }}>
                  {i > 0 && (
                    <div style={{ position:"absolute", top:11, right:"50%", width:"100%", height:2, background: i <= current ? P : "#E8E4FF", zIndex:0 }} />
                  )}
                  <div style={{
                    width:22, height:22, borderRadius:"50%", zIndex:1, display:"flex", alignItems:"center", justifyContent:"center",
                    fontSize:11, fontWeight:800, fontFamily:"inherit",
                    background: done ? P : isNow ? "#fff" : "#F1EEFB",
                    color: done ? "#fff" : isNow ? P : "#B5B0CF",
                    border: isNow ? `2.5px solid ${P}` : "2.5px solid transparent",
                    boxShadow: isNow ? `0 0 0 4px ${P_L}` : "none",
                  }}>
                    {done ? "✓" : i + 1}
                  </div>
                  <span style={{ fontSize:11, fontWeight: isNow ? 800 : 600, color: isNow ? "#13111E" : done ? "#4B5275" : "#B5B0CF", marginTop:6 }}>{s.label}</span>
                  <span style={{ fontSize:9, color: isNow ? "#8B87AD" : "#C4C0DC", marginTop:1 }}>{s.sub}</span>
                </div>
              )
            })}
          </div>
        )
      })()}

      {/* ── Progress ring + percentage ── */}
      {job && (
        <div style={{ position:"relative", width:148, height:148, animation:"fade-up 0.4s ease 0.1s both" }}>
          {/* Background track */}
          <svg width="148" height="148" style={{ position:"absolute", top:0, left:0 }}>
            <circle cx="74" cy="74" r={R} fill="none" stroke="#f0efeb" strokeWidth="10"/>
          </svg>

          {/* Spinning halo while running */}
          {job.status === "running" && (
            <svg width="148" height="148"
              style={{ position:"absolute", top:0, left:0, animation:"spin-ring 2s linear infinite" }}>
              <circle cx="74" cy="74" r={R} fill="none"
                stroke="url(#grad)" strokeWidth="10"
                strokeDasharray={`${circ * 0.15} ${circ * 0.85}`}
                strokeLinecap="round"/>
              <defs>
                <linearGradient id="grad" x1="0%" y1="0%" x2="100%" y2="0%">
                  <stop offset="0%" stopColor="#818cf8" stopOpacity="0"/>
                  <stop offset="100%" stopColor={P}/>
                </linearGradient>
              </defs>
            </svg>
          )}

          {/* Filled arc */}
          <svg width="148" height="148" style={{ position:"absolute", top:0, left:0 }}>
            <circle cx="74" cy="74" r={R} fill="none"
              stroke={ringColor} strokeWidth="10"
              strokeDasharray={circ}
              strokeDashoffset={dashOffset}
              strokeLinecap="round"
              transform="rotate(-90 74 74)"
              style={{ transition:"stroke-dashoffset 0.5s ease, stroke 0.3s" }}/>
          </svg>

          {/* Centre content */}
          <div style={{ position:"absolute", inset:0, display:"flex", flexDirection:"column" as const, alignItems:"center", justifyContent:"center" }}>
            {job.status === "completed" ? (
              <span style={{ fontSize:36 }}>✅</span>
            ) : job.status === "failed" ? (
              <span style={{ fontSize:36 }}>❌</span>
            ) : (
              <>
                <span style={{ fontSize:30, fontWeight:800, fontFamily:"'DM Mono',monospace", color:"#13111E", lineHeight:1 }}>
                  {progress}
                </span>
                <span style={{ fontSize:12, color:"#8B87AD", fontWeight:600 }}>%</span>
              </>
            )}
          </div>
        </div>
      )}

      {/* ── Current step label ── */}
      {job && (
        <div key={job.currentStep}
          style={{ animation:"fade-up 0.3s ease", fontSize:14, color: job.status==="failed"?"#dc2626": job.status==="completed"?P:"#4B5275", fontWeight:500, maxWidth:420, lineHeight:1.5 }}>
          {job.status === "running" && (
            <span style={{ display:"inline-block", width:8, height:8, borderRadius:"50%", background:P, marginRight:8, animation:"pulse-dot 1s ease-in-out infinite", verticalAlign:"middle" }}/>
          )}
          {job.currentStep}
        </div>
      )}

      {/* ── Live feed — real assignments from the just-built schedule,
           revealed a few at a time in step with the progress ring. Not
           fabricated: these are literally output.classTT entries. ── */}
      {job?.status === "running" && liveFeed.length > 0 && (
        <div style={{ width:"100%", maxWidth:420, display:"flex", flexDirection:"column" as const, gap:6 }}>
          {liveFeed.map((line, i) => (
            <div key={line + i} style={{
              animation:"fade-up 0.25s ease", fontSize:12.5, color:"#4B5275",
              background:"#F8F7FF", border:`1px solid ${P_B}`, borderRadius:9,
              padding:"7px 12px", textAlign:"left" as const,
              opacity: 1 - i * 0.22,
            }}>
              <span style={{ color:"#22C55E", fontWeight:700, marginRight:6 }}>✓</span>{line}
            </div>
          ))}
        </div>
      )}

      {/* ── Briefing card — stats + pre-flight judgment, merged into one
           panel, shown only before generating (irrelevant once it's
           actually running or done) ── */}
      {!job && (
        <div style={{ width:"100%", maxWidth:520, background:"#fff", borderRadius:14, border:`1.5px solid ${P_B}`, padding:"18px 20px", animation:"fade-up 0.4s ease 0.2s both", textAlign:"left" as const }}>
          {/* Stat row */}
          <div style={{ display:"flex", gap:8, flexWrap:"wrap" as const, justifyContent:"space-between", marginBottom: preflight ? 16 : 0 }}>
            {stats.map(s => {
              const Icon = s.icon
              return (
                <div key={s.label} style={{ display:"flex", flexDirection:"column" as const, alignItems:"center", gap:4, flex:"1 1 72px", minWidth:64 }}>
                  <Icon size={17} color={P} />
                  <span style={{ fontSize:20, fontWeight:800, fontFamily:"'DM Mono',monospace", color:"#13111E", lineHeight:1 }}>{s.value}</span>
                  <span style={{ fontSize:9.5, color:"#8B87AD", fontWeight:700, textTransform:"uppercase" as const, letterSpacing:"0.05em" }}>{s.label}</span>
                </div>
              )
            })}
          </div>

          {preflight && (
            <div style={{ borderTop: `1px solid ${P_L}`, paddingTop:14 }}>
              {/* Day shapes — one line per distinct (periods/day, end time) */}
              <div style={{ display:"flex", flexDirection:"column" as const, gap:5, marginBottom:10 }}>
                {preflight.shapes.map(s => (
                  <div key={`${s.label}-${s.end}`} style={{ display:"flex", alignItems:"center", gap:8, fontSize:12, color:"#4B5275" }}>
                    <Clock size={13} color="#9B96BD" />
                    <span style={{ fontWeight:700, color:"#13111E" }}>{s.label}</span>
                    <span style={{ color:"#9B96BD" }}>·</span>
                    <span>{s.count} period{s.count !== 1 ? "s" : ""}/day</span>
                    <span style={{ color:"#9B96BD" }}>·</span>
                    <span>ends <strong style={{ fontFamily:"'DM Mono',monospace", fontWeight:600 }}>{s.end}</strong></span>
                  </div>
                ))}
              </div>

              {/* Workload line */}
              <div style={{ display:"flex", alignItems:"center", gap:8, fontSize:12, color:"#4B5275", marginBottom:10, flexWrap:"wrap" as const }}>
                <BookOpen size={13} color="#9B96BD" />
                <span><strong style={{ fontFamily:"'DM Mono',monospace" }}>{preflight.totalWeekly}</strong> lessons/week</span>
                {preflight.doubleSubjects > 0 && (
                  <><span style={{ color:"#9B96BD" }}>·</span><span>{preflight.doubleSubjects} double-period subject{preflight.doubleSubjects !== 1 ? "s" : ""}</span></>
                )}
                {preflight.parallelGroups > 0 && (
                  <><span style={{ color:"#9B96BD" }}>·</span><span>{preflight.parallelGroups} parallel group{preflight.parallelGroups !== 1 ? "s" : ""}</span></>
                )}
                {preflight.dayOffRules > 0 && (
                  <><span style={{ color:"#9B96BD" }}>·</span><span>{preflight.dayOffRules} day-off rule{preflight.dayOffRules !== 1 ? "s" : ""}</span></>
                )}
              </div>

              {/* Checks */}
              {preflight.overCap.length > 0 ? (
                <div style={{ display:"flex", alignItems:"flex-start", gap:8, fontSize:11.5, color:"#92400E", background:"#FFFBEB", border:"1px solid #FDE68A", borderRadius:8, padding:"7px 11px" }}>
                  <span>⚠</span>
                  <span>
                    <strong>{preflight.overCap.length} class{preflight.overCap.length !== 1 ? "es" : ""}</strong> allocated more lessons than the bell allows
                    ({preflight.overCap.slice(0, 3).join(", ")}{preflight.overCap.length > 3 ? ` +${preflight.overCap.length - 3}` : ""}) —
                    extra lessons will be dropped. Trim in <button onClick={() => setStep(3)} style={{ border:"none", background:"none", color:"#B45309", fontWeight:700, cursor:"pointer", textDecoration:"underline", padding:0, fontSize:11.5, fontFamily:"inherit" }}>Allocation</button>.
                  </span>
                </div>
              ) : preflight.unallocated.length > 0 ? (
                <div style={{ display:"flex", alignItems:"flex-start", gap:8, fontSize:11.5, color:"#6B6891", background:"#F8F7FF", border:`1px solid ${P_B}`, borderRadius:8, padding:"7px 11px" }}>
                  <span>ℹ</span>
                  <span>
                    {preflight.unallocated.length} class{preflight.unallocated.length !== 1 ? "es have" : " has"} no period allocation yet
                    ({preflight.unallocated.slice(0, 3).join(", ")}{preflight.unallocated.length > 3 ? ` +${preflight.unallocated.length - 3}` : ""}) — they'll come out empty.
                  </span>
                </div>
              ) : (
                <div style={{ display:"flex", alignItems:"center", gap:8, fontSize:11.5, color:"#15803D" }}>
                  <span>✓</span><span>Every class fits its weekly capacity — ready to generate.</span>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── Already-generated banner (persisted across sessions) ── */}
      {!job && hasExistingTT && !showRegenConfirm && (
        <div style={{ width:"100%", maxWidth:500, background:"#f0fdf4", borderRadius:14, border:"1.5px solid #86efac", padding:"22px 26px", animation:"fade-up 0.4s ease 0.2s both", textAlign:"center" as const }}>
          <div style={{ fontSize:28, marginBottom:6 }}>✅</div>
          <div style={{ fontSize:15, fontWeight:700, color:"#059669", marginBottom:4 }}>
            {T.schedule} already generated
          </div>
          <div style={{ fontSize:12, color:"#4B5275", marginBottom:18 }}>
            {config.timetableName && <><strong>{config.timetableName}</strong> · </>}
            {Object.keys(store.classTT ?? {}).length} classes · {store.timetableStatus === 'published' ? '🟢 Published' : '🟡 Draft'}
          </div>
          <div style={{ display:"flex", gap:10, justifyContent:"center", flexWrap:"wrap" as const }}>
            <button
              onClick={() => window.location.href='/timetable'}
              style={{ padding:"11px 28px", borderRadius:10, border:"none", background:P, color:"#fff", fontSize:14, fontWeight:700, cursor:"pointer", boxShadow:"0 4px 16px rgba(124,111,224,0.3)" }}>
              View {T.schedule} →
            </button>
            <button
              onClick={() => setShowRegenConfirm(true)}
              style={{ padding:"11px 20px", borderRadius:10, border:"1.5px solid #E8E4FF", background:"#fff", fontSize:13, color:"#4B5275", cursor:"pointer" }}>
              ↺ Regenerate
            </button>
          </div>
        </div>
      )}

      {/* ── Timetable identity form (shown before first generate or on regen) ── */}
      {!job && (!hasExistingTT || showRegenConfirm) && (
        <div style={{ width:"100%", maxWidth:460, background:"#FAFAFE", borderRadius:12, border:"1px solid #E8E4FF", padding:"20px 24px", animation:"fade-up 0.4s ease 0.25s both", textAlign:"left" as const }}>
          {showRegenConfirm && (
            <div style={{ background:"#fffbeb", border:"1px solid #fde68a", borderRadius:8, padding:"10px 14px", marginBottom:14, fontSize:12, color:"#92400e" }}>
              ⚠️ This will <strong>replace</strong> your existing timetable. Make sure you've reviewed the draft first.
            </div>
          )}
          <div style={{ fontSize:11, fontWeight:700, textTransform:"uppercase" as const, letterSpacing:"0.08em", color:"#8B87AD", marginBottom:14 }}>📋 Schedule Details</div>
          <div style={{ display:"flex", flexDirection:"column" as const, gap:12 }}>

            {/* Name */}
            <div>
              <label style={{ fontSize:11, fontWeight:600, color:"#4B5275", display:"block", marginBottom:4 }}>Schedule Name</label>
              <input
                value={ttName} onChange={e => setTtName(e.target.value)}
                placeholder="e.g. Annual Schedule 2025-26"
                style={{ width:"100%", padding:"9px 12px", border:"1px solid #E8E4FF", borderRadius:8, fontSize:13, outline:"none", boxSizing:"border-box" as const, background:"#fff" }}
              />
            </div>

            {/* Dates */}
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10 }}>
              <div>
                <label style={{ fontSize:11, fontWeight:600, color:"#4B5275", display:"block", marginBottom:4 }}>Start Date</label>
                <input
                  type="date" value={ttStart} onChange={e => setTtStart(e.target.value)}
                  style={{ width:"100%", padding:"8px 10px", border:"1px solid #E8E4FF", borderRadius:8, fontSize:12, outline:"none", boxSizing:"border-box" as const, background:"#fff", cursor:"pointer" }}
                />
              </div>
              <div>
                <label style={{ fontSize:11, fontWeight:600, color:"#4B5275", display:"block", marginBottom:4 }}>End Date</label>
                <input
                  type="date" value={ttEnd} onChange={e => setTtEnd(e.target.value)}
                  style={{ width:"100%", padding:"8px 10px", border:"1px solid #E8E4FF", borderRadius:8, fontSize:12, outline:"none", boxSizing:"border-box" as const, background:"#fff", cursor:"pointer" }}
                />
              </div>
            </div>

            <div style={{ fontSize:10, color:"#8B87AD", display:"flex", alignItems:"center", gap:6 }}>
              <span style={{ fontSize:14 }}>💡</span>
              The timetable is saved as a <strong>Draft</strong> after generation. Review it, then publish when ready.
            </div>
          </div>
        </div>
      )}

      {/* ── Review dashboard (post-generation analytics) ── */}
      {job?.status === 'completed' && solverOutput && (
        <div style={{ width: '100%', animation: 'fade-up 0.4s ease 0.2s both' }}>
          <ReviewDashboard
            classTT={solverOutput.classTT}
            sections={store.sections}
            staff={store.staff}
            subjects={store.subjects}
            periods={store.periods}
            workDays={store.config?.workDays ?? []}
            optionalBlocks={solverOutput.optionalBlocks ?? []}
            teacherWeeklyLoad={solverOutput.teacherWeeklyLoad}
            teacherLoadStddev={solverOutput.teacherLoadStddev}
            conflicts={solverOutput.conflicts}
            penalties={solverOutput.penalties}
            rooms={(store as any).rooms ?? []}
            score={solverOutput.score}
            blockedSlots={solverOutput.blockedSlots}
            dynamicLearningGroups={solverOutput.dynamicLearningGroups}
          />
        </div>
      )}

      {/* ── CTA buttons ── */}
      <div style={{ display:"flex", gap:10, flexWrap:"wrap" as const, justifyContent:"center", animation:"fade-up 0.4s ease 0.35s both" }}>
        {!job && (!hasExistingTT || showRegenConfirm) && (
          <>
            <button onClick={startGenerate}
              style={{ display:"flex", alignItems:"center", gap:8, padding:"13px 36px", borderRadius:10, border:"none", background:P, color:"#fff", fontSize:15, fontWeight:700, cursor:"pointer", boxShadow:"0 4px 20px rgba(79,70,229,0.35)" }}>
              {showRegenConfirm ? "↺ Regenerate" : `✨ Generate ${T.schedule}`}
            </button>
            {showRegenConfirm
              ? <button onClick={() => setShowRegenConfirm(false)}
                  style={{ padding:"13px 20px", borderRadius:10, border:"1px solid #E8E4FF", background:"#fff", fontSize:13, color:"#4B5275", cursor:"pointer" }}>
                  Cancel
                </button>
              : <button onClick={() => setStep(4)}
                  style={{ padding:"13px 20px", borderRadius:10, border:"1px solid #E8E4FF", background:"#fff", fontSize:13, color:"#4B5275", cursor:"pointer" }}>
                  ← Student Groups
                </button>
            }
          </>
        )}

        {job?.status === "completed" && (
          <div style={{ display:"flex", flexDirection:"column" as const, alignItems:"center", gap:14, width:"100%" }}>
            {/* What's next — the three real paths from a fresh draft, so the
                next move never needs guessing */}
            <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit, minmax(180px, 1fr))", gap:10, width:"100%", maxWidth:640 }}>
              {[
                { icon:"✏️", title:`Review & fine-tune`, desc:"Open the draft — drag any lesson to move it, clashes checked live.", href:"/timetable", primary:true },
                { icon:"📤", title:"Publish & export", desc:"Share links, Excel, or print-ready PDFs when the draft looks right.", href:"/timetable" },
                { icon:"📡", title:"Watch it live", desc:"The Calendar's Live board follows the clock from day one.", href:"/calendar" },
              ].map(c => (
                <button key={c.title} onClick={() => window.location.href = c.href}
                  style={{
                    textAlign:"left" as const, padding:"13px 15px", borderRadius:12, cursor:"pointer", fontFamily:"inherit",
                    border: c.primary ? "none" : "1.5px solid #E8E4FF",
                    background: c.primary ? P : "#fff",
                    boxShadow: c.primary ? "0 4px 20px rgba(124,111,224,0.3)" : "none",
                  }}>
                  <div style={{ fontSize:17, marginBottom:5 }}>{c.icon}</div>
                  <div style={{ fontSize:13, fontWeight:800, color: c.primary ? "#fff" : "#13111E" }}>{c.title} →</div>
                  <div style={{ fontSize:11, lineHeight:1.5, marginTop:3, color: c.primary ? "rgba(255,255,255,0.85)" : "#8B87AD" }}>{c.desc}</div>
                </button>
              ))}
            </div>
            <button onClick={() => { setJob(null); setShowRegenConfirm(false) }}
              style={{ padding:"9px 16px", borderRadius:9, border:"1px solid #E8E4FF", background:"#fff", fontSize:12.5, color:"#4B5275", cursor:"pointer", fontFamily:"inherit" }}>
              ↺ Not happy? Re-generate with the same setup
            </button>
          </div>
        )}

        {job?.status === "failed" && (
          <div style={{ display:"flex", gap:10, flexWrap:"wrap" as const, justifyContent:"center" }}>
            <button onClick={() => setJob(null)}
              style={{ padding:"13px 22px", borderRadius:10, border:"none", background:"#dc2626", color:"#fff", fontSize:13, fontWeight:600, cursor:"pointer", fontFamily:"inherit" }}>
              Try Again
            </button>
            {/* Most generation failures trace back to allocation gaps — offer
                the fix path directly instead of a dead end */}
            <button onClick={() => setStep(3)}
              style={{ padding:"13px 20px", borderRadius:10, border:"1px solid #E8E4FF", background:"#fff", fontSize:13, color:"#4B5275", cursor:"pointer", fontFamily:"inherit" }}>
              ← Check Allocation (Step 3)
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
