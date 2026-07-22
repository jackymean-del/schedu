import { useState, useEffect, useRef, useMemo } from "react"
import { useTimetableStore } from "@/store/timetableStore"
import { useTerminology } from "@/hooks/useTerminology"
import { parseAllocation } from "@/lib/allocationSyntax"
import {
  runGenerationPipeline, sectionKey, teachCountFromRows,
  type GenerationPayload, type GenerationResult,
} from "@/lib/generationPipeline"
import {
  bandForSection, checkBellCompliance, computeTeacherRequirement, type GradeBand,
} from "@/lib/educationNorms"
import { ReviewDashboard } from "@/components/master/ReviewDashboard"
import { getCountry } from "@/lib/orgData"
import type { OptionalBlock, OptionalOption, Period, ClassTimetable } from "@/types"
import { GraduationCap, Users, BookOpen, Building2, CalendarDays, Clock } from "lucide-react"
import { P, P_D, P_L, P_B } from "@/components/resources/shared"

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

export function Step6Generate() {
  const store = useTimetableStore()
  const { config, sections, participantPools, facilities, subjects, breaks,
          setPeriods, setClassTT, setTeacherTT, setConflicts, setSuggestions,
          setStep, setConfig, setTimetableStatus } = store
  const T = useTerminology()
  const [job, setJob] = useState<Job | null>(null)
  const [solverOutput, setSolverOutput] = useState<import("@/lib/schedulingEngine").SolverOutput | null>(null)
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

    // Per grade band: the LOWEST weekly teaching minutes seen (worst case for
    // the national instructional-hours norm check).
    const bandWeeklyMins = new Map<GradeBand, number>()

    for (const sec of sections as any[]) {
      let count: number | null = null, endMin = 0, teachMins = 0
      for (const bs of bellSchedules) {
        const c = teachCountFromRows(sec.name, bs.rows)
        if (c == null) continue
        count = c
        const key = sectionKey(sec.name)
        endMin = toMin(bs.startTime) + bs.rows
          .filter((r: any) => r.type !== 'dispersal' && (!(r.classes ?? []).length || r.classes.includes(key)))
          .reduce((s: number, r: any) => s + r.duration, 0)
        teachMins = bs.rows
          .filter((r: any) => r.type === 'teaching' && (!(r.classes ?? []).length || r.classes.includes(key)))
          .reduce((s: number, r: any) => s + r.duration, 0)
        break
      }
      if (count == null) continue
      const band = bandForSection(sec.name)
      const weekly = teachMins * workDayCount
      if (weekly > 0 && (!bandWeeklyMins.has(band) || weekly < bandWeeklyMins.get(band)!)) {
        bandWeeklyMins.set(band, weekly)
      }
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

    // ── National-norms brain: staffing requirement + bell compliance ──────
    // Human-Intelligence check built from published policy (RTE/NCTE, STPCD,
    // US state hours, AU face-to-face caps — see lib/educationNorms.ts).
    const country = (config as any).countryCode || 'IN'
    const board = (config as any).board || (config as any).boardName
    const staffing = totalWeekly > 0
      ? computeTeacherRequirement(totalWeekly, store.staff.length, country)
      : null
    const bellChecks = [...bandWeeklyMins.entries()]
      .map(([band, mins]) => checkBellCompliance(country, board, band, mins))
      .filter(c => c.status !== 'ok')

    return { shapes, totalWeekly, doubleSubjects, parallelGroups, dayOffRules, overCap, unallocated, staffing, bellChecks }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config, sections, (store as any).subjectAllocations, store.staff.length])

  // ── Start generation ─────────────────────────────────────────
  const startGenerate = () => {
    // Persist timetable identity into config before running
    setConfig({ timetableName: ttName.trim() || "My Schedule", timetableStartDate: ttStart, timetableEndDate: ttEnd })
    setTimetableStatus('generating')

    const jobId    = crypto.randomUUID()
    const startedAt = Date.now()
    setJob({ id: jobId, status: "running", progress: 3, currentStep: "Starting…", startedAt })
    setLiveFeed([])

    // ── Plain-data snapshot for the pipeline. The solve runs in a Web
    //    Worker so the page never freezes — the ring animates and every tab
    //    stays responsive during generation. Falls back to inline compute if
    //    workers are unavailable.
    const payload: GenerationPayload = {
      config, sections, staff: store.staff, subjects, breaks,
      schedulingMode: store.schedulingMode,
      workingDaysPerYear: store.workingDaysPerYear,
      optionalBlocks: (store as any).optionalBlocks ?? [],
      andComboGroups: (store as any).andComboGroups ?? [],
      dynamicLearningGroups: (store as any).dynamicLearningGroups ?? [],
      subjectCombinations: (store as any).subjectCombinations ?? [],
      sectionStrengths: (store as any).sectionStrengths ?? [],
      subjectAllocations: (store as any).subjectAllocations ?? {},
      rooms: (store as any).rooms ?? [],
      teacherAvailability: (store as any).teacherAvailability ?? {},
      subjectGroups: (store as any).subjectGroups ?? [],
    }

    const runInWorker = (): Promise<GenerationResult> => new Promise((resolve, reject) => {
      let worker: Worker
      try {
        worker = new Worker(new URL('../../lib/generation.worker.ts', import.meta.url), { type: 'module' })
      } catch (e) { reject(e); return }
      worker.onmessage = (e: MessageEvent<{ ok: boolean; result?: GenerationResult; error?: string }>) => {
        worker.terminate()
        if (e.data.ok && e.data.result) resolve(e.data.result)
        else reject(new Error(e.data.error || 'generation failed'))
      }
      worker.onerror = (ev) => { worker.terminate(); reject(new Error(ev.message || 'worker error')) }
      // Structured clone rejects functions/proxies — snapshot to plain JSON first.
      worker.postMessage(JSON.parse(JSON.stringify(payload)))
    })

    void (async () => {
      let res: GenerationResult
      try {
        try {
          res = await runInWorker()
        } catch {
          // Worker unavailable (very old browser / dev quirk) — solve inline.
          // The UI freezes for the duration, but generation still completes.
          res = runGenerationPipeline(JSON.parse(JSON.stringify(payload)))
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        setJob(j => j ? { ...j, status: 'failed', progress: 0, currentStep: `Error: ${msg}` } : j)
        return
      }

      // ── Apply the result to the store ──
      const output = res.output
      const solveMs = res.solveMs
      if (res.blockWise) {
        setPeriods(res.periods)
        setClassTT(res.classTT)
        setTeacherTT(res.teacherTT)
        setConflicts(res.conflicts)
        setSolverOutput(output)
        setConfig({ blockMeta: res.blockMeta } as any)
        setSuggestions([])
      } else {
        setConfig({ blockMeta: undefined } as any)   // single schedule — clear any stale block metadata
        setPeriods(res.periods)
        setClassTT(res.classTT)
        setTeacherTT(res.teacherTT)
        setConflicts(res.conflicts)
        setSolverOutput(output)
        // Persist blocked-slot telemetry to the store so any view (timetable
        // cells, dashboard, conflict panel) can surface 'why is this empty?'
        ;(store as any).setBlockedSlots?.(output.blockedSlots ?? [])
        // Persist DLG metadata for the timetable-cell inspector
        ;(store as any).setDynamicLearningGroups?.(output.dynamicLearningGroups ?? [])
        setSuggestions(res.suggestions)
      }

      // ── Animate progress through STEPS at 110ms each, revealing real
      //    assignments from the just-computed schedule alongside it ──
      const assignments = flattenAssignments(res.classTT)
      const perTick = Math.max(1, Math.ceil(assignments.length / STEPS.length))
      let step = 0
      pollRef.current = setInterval(() => {
        if (step >= STEPS.length) {
          clearInterval(pollRef.current!)
          setTimetableStatus('draft')   // saved as draft — user must publish
          const conflicts = res.conflicts.length
          setJob(j => j ? {
            ...j, status: 'completed', progress: 100,
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
    })()
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
    <div style={{ display:"flex", flexDirection:"column" as const, alignItems:"center", minHeight:"70vh", gap:24, padding:"36px 24px 48px", textAlign:"center" as const }}>

      <style>{`
        @keyframes spin-ring { to { transform: rotate(360deg) } }
        @keyframes fade-up   { from { opacity:0; transform:translateY(10px) } to { opacity:1; transform:translateY(0) } }
        @keyframes pulse-dot { 0%,100%{opacity:1} 50%{opacity:0.25} }
        @keyframes gen-glow  { 0%,100%{ box-shadow: 0 6px 26px rgba(124,111,224,0.35) } 50%{ box-shadow: 0 6px 34px rgba(124,111,224,0.55) } }
        .g6-input { width:100%; padding:10px 13px; border:1.5px solid #E8E4FF; border-radius:10px; font-size:13.5px; outline:none; box-sizing:border-box; background:#fff; font-family:inherit; color:#13111E; transition: border-color .15s, box-shadow .15s; }
        .g6-input:focus { border-color:#7C6FE0; box-shadow: 0 0 0 3px rgba(124,111,224,0.13); }
        .g6-gen:hover { filter: brightness(1.05); }
        .g6-ghost:hover { background:#F8F7FF; }
      `}</style>

      {/* ── Title ── */}
      <div style={{ animation:"fade-up 0.4s ease" }}>
        <h2 style={{ fontFamily:"'Plus Jakarta Sans',Georgia,serif", fontSize:30, letterSpacing:"-0.5px", margin:"0 0 6px" }}>
          {!job && hasExistingTT && !showRegenConfirm ? `Your ${T.schedule.toLowerCase()} is saved ✓` :
           !job                       ? <>Everything&rsquo;s staged. <span style={{ color:P, fontStyle:"italic" }}>Generate.</span></> :
           job.status === "running"   ? `Building your ${T.schedule.toLowerCase()}…` :
           job.status === "completed" ? `${T.schedule} is ready! 🎉` :
           "Something went wrong"}
        </h2>
        {!job && !hasExistingTT && (
          <p style={{ fontSize:13, color:"#8B87AD", margin:0 }}>Review the briefing, name your {T.schedule.toLowerCase()}, and press the button — the solver does the rest.</p>
        )}
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
          { label: 'Generate', sub: 'the HI engine builds the draft' },
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
        <div style={{
          width:"100%", maxWidth:460, background:"#171522", borderRadius:14,
          border:"1px solid #2C2844", padding:"12px 16px", textAlign:"left" as const,
          boxShadow:"0 16px 44px rgba(19,17,30,0.28)",
        }}>
          <div style={{ fontSize:9.5, fontWeight:800, textTransform:"uppercase" as const, letterSpacing:"0.1em", color:"#7C6FE0", marginBottom:8 }}>
            ● Solver — placing real lessons
          </div>
          <div style={{ display:"flex", flexDirection:"column" as const, gap:5 }}>
            {liveFeed.map((line, i) => (
              <div key={line + i} style={{
                animation:"fade-up 0.25s ease", fontSize:12, color:"#C9C4E4",
                fontFamily:"'DM Mono',monospace",
                opacity: 1 - i * 0.22,
              }}>
                <span style={{ color:"#22C55E", fontWeight:700, marginRight:8 }}>✓</span>{line}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Launch console — briefing on the left, identity + launch on the
           right. One glance answers: what will be generated, is it healthy,
           and what happens when I press the button. ── */}
      {!job && (
        <div style={{
          display:"grid", gridTemplateColumns:"repeat(auto-fit, minmax(320px, 1fr))", gap:16,
          width:"100%", maxWidth:960, textAlign:"left" as const, animation:"fade-up 0.4s ease 0.15s both",
        }}>

          {/* LEFT · Briefing */}
          <div style={{ background:"#fff", borderRadius:16, border:`1.5px solid ${P_B}`, padding:"20px 22px", display:"flex", flexDirection:"column" as const, gap:14 }}>
            <div style={{ fontSize:11, fontWeight:800, textTransform:"uppercase" as const, letterSpacing:"0.08em", color:"#8B87AD" }}>
              Briefing — what the solver will work with
            </div>

            {/* Stat tiles */}
            <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit, minmax(96px, 1fr))", gap:8 }}>
              {stats.map(s => {
                const Icon = s.icon
                return (
                  <div key={s.label} style={{ background:"#FAFAFE", border:"1px solid #F0EEFA", borderRadius:12, padding:"10px 12px", display:"flex", flexDirection:"column" as const, gap:3 }}>
                    <Icon size={15} color={P} />
                    <span style={{ fontSize:21, fontWeight:800, fontFamily:"'DM Mono',monospace", color:"#13111E", lineHeight:1.1 }}>{s.value}</span>
                    <span style={{ fontSize:9.5, color:"#8B87AD", fontWeight:700, textTransform:"uppercase" as const, letterSpacing:"0.05em" }}>{s.label}</span>
                  </div>
                )
              })}
            </div>

            {preflight && (
              <>
                {/* Day shapes */}
                <div style={{ display:"flex", flexDirection:"column" as const, gap:5 }}>
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
                <div style={{ display:"flex", alignItems:"center", gap:8, fontSize:12, color:"#4B5275", flexWrap:"wrap" as const }}>
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

                {/* Readiness check */}
                {preflight.overCap.length > 0 ? (
                  <div style={{ display:"flex", alignItems:"flex-start", gap:8, fontSize:11.5, color:"#92400E", background:"#FFFBEB", border:"1px solid #FDE68A", borderRadius:10, padding:"9px 12px" }}>
                    <span>⚠</span>
                    <span>
                      <strong>{preflight.overCap.length} class{preflight.overCap.length !== 1 ? "es" : ""}</strong> allocated more lessons than the bell allows
                      ({preflight.overCap.slice(0, 3).join(", ")}{preflight.overCap.length > 3 ? ` +${preflight.overCap.length - 3}` : ""}) —
                      extra lessons will be dropped. Trim in <button onClick={() => setStep(3)} style={{ border:"none", background:"none", color:"#B45309", fontWeight:700, cursor:"pointer", textDecoration:"underline", padding:0, fontSize:11.5, fontFamily:"inherit" }}>Allocation</button>.
                    </span>
                  </div>
                ) : preflight.unallocated.length > 0 ? (
                  <div style={{ display:"flex", alignItems:"flex-start", gap:8, fontSize:11.5, color:"#6B6891", background:"#F8F7FF", border:`1px solid ${P_B}`, borderRadius:10, padding:"9px 12px" }}>
                    <span>ℹ</span>
                    <span>
                      {preflight.unallocated.length} class{preflight.unallocated.length !== 1 ? "es have" : " has"} no period allocation yet
                      ({preflight.unallocated.slice(0, 3).join(", ")}{preflight.unallocated.length > 3 ? ` +${preflight.unallocated.length - 3}` : ""}) — they'll come out empty.
                    </span>
                  </div>
                ) : (
                  <div style={{ display:"flex", alignItems:"center", gap:8, fontSize:12, fontWeight:600, color:"#15803D", background:"#F0FDF4", border:"1px solid #BBF7D0", borderRadius:10, padding:"9px 12px" }}>
                    <span>✓</span><span>Every class fits its weekly capacity — ready to generate.</span>
                  </div>
                )}

                {/* National-norms staffing check (Human Intelligence brain) */}
                {preflight.staffing && (
                  <div style={{
                    display:"flex", alignItems:"flex-start", gap:8, fontSize:11.5, borderRadius:10, padding:"9px 12px",
                    color: preflight.staffing.status === 'over' ? "#991B1B" : preflight.staffing.status === 'tight' ? "#92400E" : "#15803D",
                    background: preflight.staffing.status === 'over' ? "#FEF2F2" : preflight.staffing.status === 'tight' ? "#FFFBEB" : "#F0FDF4",
                    border: `1px solid ${preflight.staffing.status === 'over' ? "#FECACA" : preflight.staffing.status === 'tight' ? "#FDE68A" : "#BBF7D0"}`,
                  }}>
                    <span>{preflight.staffing.status === 'over' ? '🚨' : preflight.staffing.status === 'tight' ? '⚠' : '👥'}</span>
                    <span>
                      <strong>Faculty workload ({Math.round(preflight.staffing.utilization * 100)}%):</strong> {preflight.staffing.message}
                      <span style={{ display:"block", marginTop:3, fontSize:10.5, opacity:0.75 }}>Norm: {preflight.staffing.source}</span>
                    </span>
                  </div>
                )}

                {/* Grade-band instructional-hours compliance vs national policy */}
                {(preflight.bellChecks ?? []).map(c => (
                  <div key={c.band} style={{
                    display:"flex", alignItems:"flex-start", gap:8, fontSize:11.5, borderRadius:10, padding:"9px 12px",
                    color: c.statutory && c.status === 'short' ? "#991B1B" : "#92400E",
                    background: c.statutory && c.status === 'short' ? "#FEF2F2" : "#FFFBEB",
                    border: `1px solid ${c.statutory && c.status === 'short' ? "#FECACA" : "#FDE68A"}`,
                  }}>
                    <span>{c.status === 'short' ? '📉' : '📈'}</span>
                    <span>
                      {c.message}
                      <span style={{ display:"block", marginTop:3, fontSize:10.5, opacity:0.75 }}>Norm: {c.source}</span>
                    </span>
                  </div>
                ))}
              </>
            )}
          </div>

          {/* RIGHT · Saved state OR identity + launch */}
          {hasExistingTT && !showRegenConfirm ? (
            <div style={{ background:"#fff", borderRadius:16, border:"1.5px solid #BBF7D0", padding:"22px 24px", display:"flex", flexDirection:"column" as const, gap:12, justifyContent:"center", textAlign:"center" as const }}>
              <div style={{ fontSize:30 }}>✅</div>
              <div style={{ fontSize:16, fontWeight:800, color:"#059669" }}>
                {T.schedule} already generated
              </div>
              <div style={{ fontSize:12.5, color:"#4B5275" }}>
                {config.timetableName && <><strong>{config.timetableName}</strong> · </>}
                {Object.keys(store.classTT ?? {}).length} classes · {store.timetableStatus === 'published' ? '🟢 Published' : '🟡 Draft'}
              </div>
              <div style={{ display:"flex", gap:10, justifyContent:"center", flexWrap:"wrap" as const, marginTop:6 }}>
                <button
                  onClick={() => window.location.href='/timetable'}
                  style={{ padding:"12px 28px", borderRadius:11, border:"none", background:P, color:"#fff", fontSize:14, fontWeight:700, cursor:"pointer", boxShadow:"0 4px 16px rgba(124,111,224,0.3)", fontFamily:"inherit" }}>
                  View {T.schedule} →
                </button>
                <button className="g6-ghost"
                  onClick={() => setShowRegenConfirm(true)}
                  style={{ padding:"12px 20px", borderRadius:11, border:"1.5px solid #E8E4FF", background:"#fff", fontSize:13, color:"#4B5275", cursor:"pointer", fontFamily:"inherit" }}>
                  ↺ Regenerate
                </button>
              </div>
            </div>
          ) : (
            <div style={{ background:"#fff", borderRadius:16, border:`1.5px solid ${P_B}`, padding:"20px 22px", display:"flex", flexDirection:"column" as const, gap:13 }}>
              <div style={{ fontSize:11, fontWeight:800, textTransform:"uppercase" as const, letterSpacing:"0.08em", color:"#8B87AD" }}>
                Identity &amp; launch
              </div>

              {showRegenConfirm && (
                <div style={{ background:"#fffbeb", border:"1px solid #fde68a", borderRadius:10, padding:"10px 14px", fontSize:12, color:"#92400e" }}>
                  ⚠️ This will <strong>replace</strong> your existing timetable. Make sure you've reviewed the draft first.
                </div>
              )}

              <div>
                <label style={{ fontSize:11.5, fontWeight:700, color:"#4B5275", display:"block", marginBottom:5 }}>Schedule name</label>
                <input className="g6-input"
                  value={ttName} onChange={e => setTtName(e.target.value)}
                  placeholder="e.g. Annual Schedule 2025-26"
                />
              </div>

              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10 }}>
                <div>
                  <label style={{ fontSize:11.5, fontWeight:700, color:"#4B5275", display:"block", marginBottom:5 }}>Start date</label>
                  <input className="g6-input" type="date" value={ttStart} onChange={e => setTtStart(e.target.value)} style={{ cursor:"pointer" }} />
                </div>
                <div>
                  <label style={{ fontSize:11.5, fontWeight:700, color:"#4B5275", display:"block", marginBottom:5 }}>End date</label>
                  <input className="g6-input" type="date" value={ttEnd} onChange={e => setTtEnd(e.target.value)} style={{ cursor:"pointer" }} />
                </div>
              </div>

              {/* Launch */}
              <button className="g6-gen" onClick={startGenerate}
                style={{
                  marginTop:2, width:"100%", padding:"15px 20px", borderRadius:12, border:"none",
                  background:`linear-gradient(135deg, ${P}, #5D4FCF)`, color:"#fff",
                  fontSize:15.5, fontWeight:800, cursor:"pointer", fontFamily:"inherit",
                  animation:"gen-glow 2.4s ease-in-out infinite",
                }}>
                {showRegenConfirm ? "↺ Regenerate now" : `✨ Generate ${T.schedule}`}
              </button>

              <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", gap:8 }}>
                <div style={{ fontSize:10.5, color:"#8B87AD", display:"flex", alignItems:"center", gap:6 }}>
                  <span style={{ fontSize:13 }}>💡</span>
                  Saved as a <strong>Draft</strong> — review, then publish.
                </div>
                {showRegenConfirm
                  ? <button className="g6-ghost" onClick={() => setShowRegenConfirm(false)}
                      style={{ padding:"7px 14px", borderRadius:9, border:"1px solid #E8E4FF", background:"#fff", fontSize:11.5, color:"#4B5275", cursor:"pointer", fontFamily:"inherit" }}>
                      Cancel
                    </button>
                  : <button className="g6-ghost" onClick={() => setStep(4)}
                      style={{ padding:"7px 14px", borderRadius:9, border:"1px solid #E8E4FF", background:"#fff", fontSize:11.5, color:"#4B5275", cursor:"pointer", fontFamily:"inherit" }}>
                      ← Student Groups
                    </button>
                }
              </div>
            </div>
          )}
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

      {/* ── CTA buttons (post-run states only — pre-run launch lives in the
           right console panel) ── */}
      <div style={{ display:"flex", gap:10, flexWrap:"wrap" as const, justifyContent:"center", animation:"fade-up 0.4s ease 0.35s both" }}>
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
