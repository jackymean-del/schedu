/**
 * Generation pipeline — the PURE compute half of timetable generation,
 * extracted from step6-generate.tsx so it can run inside a Web Worker.
 *
 * Everything here takes plain serializable data and returns plain data:
 * no React, no zustand, no DOM. The wizard builds a GenerationPayload
 * snapshot from the store, runs this (in a worker when available, inline as
 * a fallback), and writes the result back to the store.
 *
 * The helper functions (DLG/combo → OptionalBlock bridges, bell-row parsing,
 * early-dispersal locking, block period building) moved here verbatim from
 * step6-generate.tsx — the wizard re-imports the ones it still uses.
 */
import { buildPeriodSequence, buildPeriodSequenceFromCw, rebuildTeacherTT } from './aiEngine'
import { solveTimetable, generateSuggestions, durationToWeeklyPeriods } from './schedulingEngine'
import type { OptionalBlock, OptionalOption, Period, Suggestion } from '@/types'

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
export function dlgsToOptionalBlocks(
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
export function comboGroupsToOptionalBlocks(
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
export function scopeToBehavior(scope: any): string {
  if (!scope || typeof scope !== 'object') return 'FLEXIBLE_GROUPING'
  if (scope.section === 'same') return 'NO_GROUPING'          // each section its own group
  if (scope.grade === 'same' && scope.stream === 'same') return 'SAME_GRADE_STREAM'
  if (scope.grade === 'same') return 'SAME_GRADE_ONLY'
  if (scope.stream === 'same') return 'SAME_STREAM_ONLY'
  return 'CROSS_GRADE_ALLOWED'
}

export function andGroupsToOptionalBlocks(
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

// ── Block-wise (per-shift) timetable generation helpers ───────────────────────
const _toMins = (s: string) => { const [h, m] = (s || '08:00').split(':').map(Number); return h * 60 + m }

/** Class key from a section name — mirrors the timetable view's getSectionClassKey. */
export function sectionKey(sectionName: string): string {
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
export function teachCountFromRows(secName: string, rows: any[] | undefined): number | null {
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
export function adjacencyIdsFromRows(secName: string, rows: any[] | undefined, classPeriodIds: string[]): string[] | null {
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
export function lockEarlyDispersal(
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
    // Remember WHICH locks are dispersal locks (day already over) so the gap
    // report can say "this class's day has ended" instead of the misleading
    // generic "unlock this section scope".
    scope.dispersalIds = classPeriods.slice(tc).map(p => p.id)
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
export function buildBlockPeriods(shift: any, rows: any[]): { periods: Period[]; clock: Record<string, [number, number]> } {
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

// ── The pipeline itself ────────────────────────────────────────────────────

/** Plain-data snapshot of everything generation needs from the store. */
export interface GenerationPayload {
  config: any
  sections: any[]
  staff: any[]
  subjects: any[]
  breaks: any[]
  schedulingMode?: string
  workingDaysPerYear?: number
  optionalBlocks: any[]
  andComboGroups: any[]
  dynamicLearningGroups: any[]
  subjectCombinations: any[]
  sectionStrengths: any[]
  subjectAllocations: Record<string, Record<string, string>>
  rooms: any[]
  teacherAvailability: any
  subjectGroups: any[]
}

export interface GenerationResult {
  blockWise: boolean
  periods: Period[]
  classTT: any
  teacherTT: any
  conflicts: any[]
  output: any               // full SolverOutput (score, penalties, blockedSlots, DLGs, optionalBlocks)
  blockMeta?: any[]         // block-wise only
  suggestions: Suggestion[] // single mode only ([] for block-wise)
  solveMs: number
}

/** Run the full generation compute. Pure: safe on a worker thread. */
export function runGenerationPipeline(p: GenerationPayload): GenerationResult {
  const startedAt = Date.now()
  const config = p.config ?? {}
  const sections = p.sections ?? []
  const workDays: string[] = config.workDays?.length ? config.workDays : ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY']

  // Build period sequence:
  //   • If class-wise breaks are configured use buildPeriodSequenceFromCw which
  //     places each break at its EXACT afterPeriod position (correct distribution).
  //   • Otherwise fall back to the legacy even-distribution builder.
  const classwiseBreaks = config.classwiseBreaks as Array<{ id: string; name: string; type: string; afterPeriod: number; duration: number }> | undefined
  const fixedStarts = (p.breaks ?? []).filter((b: any) => b.type === 'fixed-start') as Period[]
  const periods = classwiseBreaks?.length
    ? buildPeriodSequenceFromCw(classwiseBreaks, config.periodsPerDay ?? 8, config.defaultSessionDuration ?? 40, fixedStarts)
    : buildPeriodSequence(p.breaks ?? [], config.periodsPerDay ?? 8)

  const resolvedSubjects = p.schedulingMode === 'duration-based'
    ? (p.subjects ?? []).map((sub: any) => {
        const rh = sub.requiredHours
        if (!rh) return sub
        const weekly = durationToWeeklyPeriods({
          subjectName: sub.name, className: 'all',
          requiredHours: rh,
          periodDurationMins: sub.sessionDuration ?? 45,
          workingDaysPerYear: p.workingDaysPerYear ?? 220,
          workingDaysPerWeek: workDays.length,
        })
        return { ...sub, periodsPerWeek: weekly }
      })
    : (p.subjects ?? [])

  const staff = p.staff ?? []
  const manualOptionalBlocks = p.optionalBlocks ?? []
  const storeAndComboGroups = p.andComboGroups ?? []
  const storeDLGs = p.dynamicLearningGroups ?? []
  const subjectCombinations = p.subjectCombinations ?? []
  const sectionStrengths = p.sectionStrengths ?? []
  const subjectAllocations = p.subjectAllocations ?? {}
  const rooms = p.rooms ?? []

  // Prefer manually-authored optional blocks; if none exist but the user
  // ran Step 4 (Student Groups), convert those DLGs into OptionalBlocks
  // so the solver honours the user's period assignments.
  const classPeriods = periods.filter((per: Period) => per.type === 'class')
  const baseBlocks: OptionalBlock[] =
    manualOptionalBlocks.length > 0
      ? manualOptionalBlocks
      : dlgsToOptionalBlocks(storeDLGs, classPeriods, workDays)

  // OR/AND combos from Step 4 Tab 2 are an independent source — always
  // merged in, deduped against blocks covering the same sections+subjects.
  const comboBlocks = comboGroupsToOptionalBlocks(p.subjectGroups ?? [], resolvedSubjects, sections, staff)
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
  const scheduleMode = config.scheduleMode
  const shiftsCfg = config.shifts as any[] | undefined
  const shiftRowsCfg = config.shiftRows as Record<string, any[]> | undefined
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
      const blockSections = sections.filter((sec: any) => (shift.classes || []).includes(sectionKey(sec.name)))
      if (!blockSections.length) continue

      // Block teacher slots that clash (clock-overlap) with already-solved blocks.
      const avail: any = JSON.parse(JSON.stringify(p.teacherAvailability ?? {}))
      for (const [tName, dayMap] of Object.entries(busy)) {
        for (const [day, ivals] of Object.entries(dayMap)) {
          for (const per of bp) {
            if (per.type !== 'class') continue
            const c = clock[per.id]
            if (c && ivals.some(iv => overlaps(iv, c))) {
              avail[tName] ??= {}; avail[tName][day] ??= {}; avail[tName][day][per.id] = 'blocked'
            }
          }
        }
      }

      // Early dispersal within the block: lock periods a section doesn't have
      const bpClass = bp.filter(per => per.type === 'class')
      const lockedBlockSections = lockEarlyDispersal(
        blockSections, bpClass, workDays, name => teachCountFromRows(name, rows))

      // Bell-true adjacency: double periods must not straddle a break
      const bpClassIds = bpClass.map(per => per.id)
      const blockAdjacency: Record<string, string[]> = {}
      for (const sec of blockSections) {
        const adj = adjacencyIdsFromRows(sec.name, rows, bpClassIds)
        if (adj) blockAdjacency[sec.name] = adj
      }

      const out = solveTimetable({
        sections: lockedBlockSections, staff, subjects: resolvedSubjects, periods: bp, workDays,
        requirements: [], optionalBlocks, subjectCombinations, sectionStrengths,
        subjectAllocations, rooms, teacherAvailability: avail,
        dayOffRules: config.dayOffRules ?? [],
        sectionAdjacency: blockAdjacency,
      })

      Object.assign(mergedClassTT, out.classTT)
      for (const [tn, ts] of Object.entries(out.teacherTT)) if (!mergedTeacherTT[tn]) mergedTeacherTT[tn] = ts
      mergedConflicts.push(...out.conflicts)
      unionPeriods.push(...bp)
      blockMeta.push({ id: shift.id, name: shift.name, startTime: shift.startTime, sectionNames: blockSections.map((s: any) => s.name), periods: bp })

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
    const output = { classTT: mergedClassTT, teacherTT: mergedTeacherTT, conflicts: mergedConflicts, penalties: [], score: 0, iterations: 0 }
    return {
      blockWise: true, periods: unionPeriods, classTT: mergedClassTT, teacherTT: mergedTeacherTT,
      conflicts: mergedConflicts, output, blockMeta, suggestions: [], solveMs: Date.now() - startedAt,
    }
  }

  // ── Single-schedule generation ────────────────────────────────────────
  // Early dispersal: lock the periods each section doesn't have per the
  // ground-truth bell schedule, so juniors never get subjects scheduled
  // after their dispersal time.
  const bellSchedules = config.bellSchedules as Array<{ startTime: string; rows: any[] }> | undefined
  const countFor = (name: string): number | null => {
    for (const bs of bellSchedules ?? []) {
      const c = teachCountFromRows(name, bs.rows)
      if (c != null) return c
    }
    return null
  }
  const effSections = lockEarlyDispersal(sections, classPeriods, workDays, countFor)

  // Bell-true adjacency: double periods must not straddle a break
  const classPeriodIds = classPeriods.map((per: Period) => per.id)
  const sectionAdjacency: Record<string, string[]> = {}
  for (const sec of sections) {
    for (const bs of bellSchedules ?? []) {
      const adj = adjacencyIdsFromRows(sec.name, bs.rows, classPeriodIds)
      if (adj) { sectionAdjacency[sec.name] = adj; break }
    }
  }

  const output = solveTimetable({
    sections: effSections, staff, subjects: resolvedSubjects, periods, workDays,
    requirements: [],
    optionalBlocks,
    subjectCombinations,
    sectionStrengths,
    subjectAllocations,
    rooms,
    teacherAvailability: p.teacherAvailability ?? {},
    // Class-specific day-off rules from bell schedule step (e.g. Sat off for Nursery/LKG)
    dayOffRules: config.dayOffRules ?? [],
    sectionAdjacency,
  })

  const suggestions = generateSuggestions(output.classTT, output.teacherTT, staff, resolvedSubjects, workDays, periods)
  return {
    blockWise: false, periods, classTT: output.classTT, teacherTT: output.teacherTT,
    conflicts: output.conflicts, output, suggestions, solveMs: Date.now() - startedAt,
  }
}
