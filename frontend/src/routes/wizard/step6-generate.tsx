import { useState, useEffect, useRef } from "react"
import { useTimetableStore } from "@/store/timetableStore"
import { useTerminology } from "@/hooks/useTerminology"
import { buildPeriodSequence, buildPeriodSequenceFromCw, rebuildTeacherTT } from "@/lib/aiEngine"
import { solveTimetable, generateSuggestions, durationToWeeklyPeriods } from "@/lib/schedulingEngine"
import { ReviewDashboard } from "@/components/master/ReviewDashboard"
import { getCountry } from "@/lib/orgData"
import type { OptionalBlock, Period } from "@/types"

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
  }>,
  classPeriods: Period[],
  workDays: string[],
): OptionalBlock[] {
  if (!dlgs.length) return []

  const validPids  = new Set(classPeriods.map(p => p.id))
  const blockMap = new Map<string, OptionalBlock>()

  dlgs.forEach(dlg => {
    // Groups no longer carry a pinned slot — leave day/periodId EMPTY so the
    // engine schedules the block across its full period quota on free slots.
    // (Any legacy day/periodId is still honoured as a starting hint if present.)
    const day = (dlg.day || '').toUpperCase()
    const rawPid = (dlg.periodId || '').toLowerCase()
    const periodId = validPids.has(rawPid) ? rawPid : ''

    // DLGs sharing the same (sorted) sections → one OptionalBlock
    const secKey = [...(dlg.sectionNames ?? [])].sort().join('|')

    if (!blockMap.has(secKey)) {
      const idx = blockMap.size + 1
      blockMap.set(secKey, {
        id: `dlg-block-${idx}`,
        name: `Optional Block ${idx}`,
        sectionNames: dlg.sectionNames ?? [],
        day,
        periodId,
        options: [],
      })
    }

    ;(blockMap.get(secKey)!.options as any[]).push({
      subject: dlg.subject,
      teacher: dlg.teacher ?? '',
      room: dlg.room ?? '',
      capacity: dlg.totalStrength ?? 0,
      allocatedStrength: dlg.totalStrength ?? 0,
    })
  })

  return [...blockMap.values()]
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

/** Teaching periods a section actually has, per a set of bell rows (null = unknown). */
function teachCountFromRows(secName: string, rows: any[] | undefined): number | null {
  if (!rows?.length) return null
  const key = sectionKey(secName)
  if (!rows.some((r: any) => r.type === 'teaching' && (r.classes ?? []).includes(key))) return null
  return rows.filter((r: any) =>
    r.type === 'teaching' && (!(r.classes ?? []).length || r.classes.includes(key))).length
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
    if (tc == null || tc >= classPeriods.length) return sec
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
    { icon:"🏫", label:"Classes",  value: sections.length },
    { icon:"👩‍🏫", label:"Teachers", value: store.staff.length },
    { icon:"📖", label:"Subjects",  value: subjects.length },
    { icon:"🚪", label:"Rooms",     value: facilities.length || sections.length },
    { icon:"📅", label:"Days/week", value: config.workDays?.length ?? 5 },
    { icon:"⏰", label:"Periods/day",value: config.periodsPerDay ?? 8 },
  ]

  // ── Start generation ─────────────────────────────────────────
  const startGenerate = () => {
    // Persist timetable identity into config before running
    setConfig({ timetableName: ttName.trim() || "My Timetable", timetableStartDate: ttStart, timetableEndDate: ttEnd })
    setTimetableStatus('generating')

    const jobId    = crypto.randomUUID()
    const startedAt = Date.now()
    setJob({ id: jobId, status: "running", progress: 3, currentStep: "Starting…", startedAt })

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
      const storeDLGs            = (store as any).dynamicLearningGroups ?? []
      const subjectCombinations  = (store as any).subjectCombinations ?? []
      const sectionStrengths     = (store as any).sectionStrengths ?? []
      const subjectAllocations   = (store as any).subjectAllocations ?? {}
      const rooms                = (store as any).rooms ?? []

      // Prefer manually-authored optional blocks; if none exist but the user
      // ran Step 4 (Student Groups), convert those DLGs into OptionalBlocks
      // so the solver honours the user's period assignments.
      const classPeriods = periods.filter((p: Period) => p.type === 'class')
      const optionalBlocks: OptionalBlock[] =
        manualOptionalBlocks.length > 0
          ? manualOptionalBlocks
          : dlgsToOptionalBlocks(storeDLGs, classPeriods, workDays)

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

          const out = solveTimetable({
            sections: lockedBlockSections, staff, subjects: resolvedSubjects, periods: bp, workDays,
            requirements: [], optionalBlocks, subjectCombinations, sectionStrengths,
            subjectAllocations, rooms, teacherAvailability: avail,
            dayOffRules: (store as any).config?.dayOffRules ?? [],
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

    // ── Animate progress through STEPS at 110ms each ──
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
      step++
    }, 110)
  }

  // ── Circular SVG ring ─────────────────────────────────────────
  const R   = 54
  const circ = 2 * Math.PI * R   // ≈ 339
  const progress = job?.progress ?? 0
  const dashOffset = circ * (1 - progress / 100)

  const ringColor =
    job?.status === "completed" ? "#7C6FE0" :
    job?.status === "failed"    ? "#dc2626" : "#7C6FE0"

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
        {job && (
          <p style={{ fontSize:12, color:"#8B87AD", margin:0, fontFamily:"monospace" }}>
            Job {job.id.slice(0,8)}
            {job.status === "running" && ` · ${elapsed}s`}
          </p>
        )}
      </div>

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
                  <stop offset="100%" stopColor="#7C6FE0"/>
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
          style={{ animation:"fade-up 0.3s ease", fontSize:14, color: job.status==="failed"?"#dc2626": job.status==="completed"?"#7C6FE0":"#4B5275", fontWeight:500, maxWidth:420, lineHeight:1.5 }}>
          {job.status === "running" && (
            <span style={{ display:"inline-block", width:8, height:8, borderRadius:"50%", background:"#7C6FE0", marginRight:8, animation:"pulse-dot 1s ease-in-out infinite", verticalAlign:"middle" }}/>
          )}
          {job.currentStep}
        </div>
      )}

      {/* ── Stats cards ── */}
      <div style={{ display:"flex", gap:10, flexWrap:"wrap" as const, justifyContent:"center", maxWidth:520, animation:"fade-up 0.4s ease 0.2s both" }}>
        {stats.map((s, i) => (
          <div key={s.label} style={{
            display:"flex", flexDirection:"column" as const, alignItems:"center", gap:3,
            padding:"12px 16px", borderRadius:12,
            background: job?.status==="completed" ? "#f0fdf4" : "#F8F7FF",
            border: `1.5px solid ${job?.status==="completed" ? "#D8D2FF" : "#E8E4FF"}`,
            minWidth:72,
            transition:"all 0.3s ease",
            animationDelay: `${0.3 + i * 0.05}s`,
          }}>
            <span style={{ fontSize:20 }}>{s.icon}</span>
            <span style={{ fontSize:22, fontWeight:800, fontFamily:"'DM Mono',monospace", color:"#13111E", lineHeight:1 }}>{s.value}</span>
            <span style={{ fontSize:10, color:"#8B87AD", fontWeight:600, textTransform:"uppercase" as const, letterSpacing:"0.05em" }}>{s.label}</span>
          </div>
        ))}
      </div>

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
              style={{ padding:"11px 28px", borderRadius:10, border:"none", background:"#7C6FE0", color:"#fff", fontSize:14, fontWeight:700, cursor:"pointer", boxShadow:"0 4px 16px rgba(124,111,224,0.3)" }}>
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
          <div style={{ fontSize:11, fontWeight:700, textTransform:"uppercase" as const, letterSpacing:"0.08em", color:"#8B87AD", marginBottom:14 }}>📋 Timetable Details</div>
          <div style={{ display:"flex", flexDirection:"column" as const, gap:12 }}>

            {/* Name */}
            <div>
              <label style={{ fontSize:11, fontWeight:600, color:"#4B5275", display:"block", marginBottom:4 }}>Timetable Name</label>
              <input
                value={ttName} onChange={e => setTtName(e.target.value)}
                placeholder="e.g. Annual Timetable 2025-26"
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
              style={{ display:"flex", alignItems:"center", gap:8, padding:"13px 36px", borderRadius:10, border:"none", background:"#7C6FE0", color:"#fff", fontSize:15, fontWeight:700, cursor:"pointer", boxShadow:"0 4px 20px rgba(79,70,229,0.35)" }}>
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
          <>
            <button onClick={() => window.location.href='/timetable'}
              style={{ padding:"13px 32px", borderRadius:10, border:"none", background:"#7C6FE0", color:"#fff", fontSize:15, fontWeight:700, cursor:"pointer", boxShadow:"0 4px 20px rgba(124,111,224,0.3)" }}>
              View {T.schedule} (Draft) →
            </button>
            <button onClick={() => { setJob(null); setShowRegenConfirm(false) }}
              style={{ padding:"13px 18px", borderRadius:10, border:"1px solid #E8E4FF", background:"#fff", fontSize:13, color:"#4B5275", cursor:"pointer" }}>
              ↺ Re-generate
            </button>
          </>
        )}

        {job?.status === "failed" && (
          <button onClick={() => setJob(null)}
            style={{ padding:"13px 22px", borderRadius:10, border:"none", background:"#dc2626", color:"#fff", fontSize:13, fontWeight:600, cursor:"pointer" }}>
            Try Again
          </button>
        )}
      </div>
    </div>
  )
}
