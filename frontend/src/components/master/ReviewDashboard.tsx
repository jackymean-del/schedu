/**
 * ReviewDashboard — Doc 2 Step 5.
 *
 * Visual summary of the generated timetable for the user to inspect
 * before publishing. Five sections per spec:
 *   A. Academic Summary    — class / teacher / subject counts
 *   B. Capacity Summary    — per-band allocated vs capacity
 *   C. Teacher Load Chart  — per-teacher weekly load + fairness stddev
 *   D. Room Utilization    — % occupied per room
 *   E. Conflicts & Warnings — hard + soft from solver output
 *
 * Consumes the SolverOutput plus raw store data. Pure display component.
 */

import { useMemo, useState, useEffect, useRef } from 'react'
import type { Section, Subject, Staff, Period, OptionalBlock, Conflict, ClassTimetable } from '@/types'
import { computeCapacity, inferBandFromSection, utilisationStatus } from '@/lib/capacityEngine'
import { suggestFixes, type FixSuggestion } from '@/lib/fixSuggester'
import { previewFix, type FixPreview } from '@/lib/fixPreview'
import { recomputeWorkloadPenalties, mergeLivePenalties } from '@/lib/penaltyRecompute'
import { PenaltyTrendChart, type ScorePoint } from './PenaltyTrendChart'
import { ScoreBreakdownPopover } from './ScoreBreakdownPopover'
import {
  type BlockedSlot, type DynamicLearningGroup,
  blockedCategoryLabel, blockedRemedy,
  reoptimizeTeachers, buildTeacherTT, deriveTeacherAllocations,
} from '@/lib/schedulingEngine'
import { BackwardSyncReport } from './BackwardSyncReport'
import { DLGInspector } from './DLGInspector'
import { ConflictResolutionWizard } from './ConflictResolutionWizard'
import { PublishExportPanel } from './PublishExportPanel'
import { TimetableSwapModal } from './TimetableSwapModal'
import { TeacherAvailabilityEditor } from './TeacherAvailabilityEditor'
import { useTimetableStore } from '@/store/timetableStore'
import {
  Users2, BookOpen, Building2, Layers, Sparkles,
  AlertTriangle, CheckCircle2, TrendingUp, Gauge, Clock,
  Wrench, ChevronDown, ChevronRight, Zap, Calendar as CalendarIcon,
  Ban, RefreshCw, Wand2, Download, PencilRuler, CalendarCheck,
} from 'lucide-react'

interface Props {
  classTT: ClassTimetable
  sections: Section[]
  staff: Staff[]
  subjects: Subject[]
  periods: Period[]
  workDays: string[]
  optionalBlocks?: OptionalBlock[]
  teacherWeeklyLoad?: Record<string, number>
  teacherLoadStddev?: number
  conflicts: Conflict[]
  penalties: { constraint: string; penalty: number; details: string }[]
  rooms?: any[]
  score: number
  blockedSlots?: BlockedSlot[]
  dynamicLearningGroups?: DynamicLearningGroup[]
  /** Called with the modified classTT after the conflict wizard applies fixes. */
  onApplyConflictFixes?: (updatedClassTT: ClassTimetable) => void
}

export function ReviewDashboard({
  classTT, sections, staff, subjects, periods, workDays,
  optionalBlocks = [],
  conflicts, penalties, rooms = [], score, blockedSlots = [],
  dynamicLearningGroups = [], onApplyConflictFixes,
}: Props) {

  // ── Capacity summary per band ──
  const cap = useMemo(() => computeCapacity(workDays, periods), [workDays, periods])
  const bandSummary = useMemo(() => {
    const m = new Map<string, { allocated: number; sectionsCount: number }>()
    sections.forEach(sec => {
      const band = inferBandFromSection(sec.name)
      const row = m.get(band) ?? { allocated: 0, sectionsCount: 0 }
      const used = Object.values(classTT[sec.name] ?? {}).reduce(
        (a, dayMap: any) => a + Object.values(dayMap ?? {}).filter((c: any) => c?.subject).length, 0
      )
      // Average per section in this band
      row.allocated += used
      row.sectionsCount += 1
      m.set(band, row)
    })
    return Array.from(m.entries()).map(([band, v]) => ({
      band,
      avgAllocated: Math.round(v.allocated / Math.max(1, v.sectionsCount)),
      sectionsCount: v.sectionsCount,
    }))
  }, [classTT, sections])

  // ── Re-optimise teachers state — declared before teacherLoads/loadStats memos ──
  const [reoptimizing, setReoptimizing] = useState(false)
  const [reoptimizeResult, setReoptimizeResult] = useState<{
    reassignedCount: number; stddevBefore: number; stddevAfter: number
  } | null>(null)
  // Local override for the bar-chart loads after a re-optimise run

  // ── Teacher load chart ──
  // Count load DIRECTLY from the current timetable (the source of truth) so the
  // bars always match what's actually scheduled. This fixes two issues:
  //  (1) the solver-emitted teacherWeeklyLoad undercounted (e.g. it missed some
  //      cells), so bars showed a lower load than the schedule really had;
  //  (2) re-optimise used to swap in a different `reoptimizedLoad` override even
  //      on a no-op run, making every load appear to jump up for no reason.
  // Re-optimise now updates classTT (via onApplyConflictFixes → the classTT
  // prop), so a real reassignment recomputes here; a no-op changes nothing.
  const teacherLoads = useMemo(() => {
    const derived = deriveTeacherAllocations(classTT)
    const loadOf = (name: string) => {
      const secs = derived[name]; if (!secs) return 0
      let s = 0; for (const sec in secs) for (const sub in secs[sec]) s += secs[sec][sub]
      return s
    }
    const list = staff.map(t => ({
      name: t.name,
      load: loadOf(t.name),
      max: (t as any).maxPeriodsPerWeek ?? 40,
    }))
    return list.sort((a, b) => b.load - a.load)
  }, [staff, classTT])
  const loadStats = useMemo(() => {
    const loads = teacherLoads.map(t => t.load).filter(l => l > 0)
    if (loads.length === 0) return { mean: 0, min: 0, max: 0, stddev: 0 }
    const mean = loads.reduce((a, b) => a + b, 0) / loads.length
    const min  = Math.min(...loads)
    const max  = Math.max(...loads)
    // Compute stddev from the SAME actual-timetable loads shown in the bars, so
    // Mean/Min/Max/Stddev are always internally consistent (no mixing a solver-
    // emitted or re-optimise-reported stddev with a differently-counted load).
    const stddev = Math.sqrt(loads.reduce((a, l) => a + (l - mean) ** 2, 0) / loads.length)
    return { mean, min, max, stddev }
  }, [teacherLoads])
  const maxLoadInChart = Math.max(1, ...teacherLoads.map(t => t.load))

  // ── Room utilisation ──
  const roomUsage = useMemo(() => {
    const totalSlots = workDays.length * periods.filter(p => p.type === 'class' || !p.type).length
    if (totalSlots === 0) return []
    const counts = new Map<string, number>()
    Object.values(classTT).forEach(secMap =>
      Object.values(secMap ?? {}).forEach((dayMap: any) =>
        Object.values(dayMap ?? {}).forEach((cell: any) => {
          if (cell?.room) counts.set(cell.room, (counts.get(cell.room) ?? 0) + 1)
        })
      )
    )
    // Include rooms from store with 0 usage
    rooms.forEach((r: any) => {
      const name = r.actualName ?? r.name ?? r.generatedName
      if (name && !counts.has(name)) counts.set(name, 0)
    })
    return Array.from(counts.entries())
      .map(([room, used]) => ({ room, used, total: totalSlots, pct: Math.round((used / totalSlots) * 100) }))
      .sort((a, b) => b.pct - a.pct)
  }, [classTT, rooms, workDays, periods])

  // ── Issue categorisation ──
  const hardConflicts = conflicts.length
  // Live workload penalties — recompute from current store state so the
  // Conflicts card stays fresh after Apply Fix / Auto-fix safe actions
  // without requiring a full solver re-run.
  const liveStore = useTimetableStore() as any
  const liveWorkloadPenalties = useMemo(
    () => recomputeWorkloadPenalties({
      staff: liveStore.staff ?? staff,
      teacherAllocations: liveStore.teacherAllocations ?? {},
      subjectAllocations: liveStore.subjectAllocations ?? {},
    }),
    [liveStore.staff, liveStore.teacherAllocations, liveStore.subjectAllocations, staff]
  )
  // Merge: solver-emitted penalties for scope/placement, live ones for workload
  const livePenalties = useMemo(
    () => mergeLivePenalties(penalties, liveWorkloadPenalties),
    [penalties, liveWorkloadPenalties]
  )
  // Live score = sum of live penalty weights (so card score updates after fixes)
  const liveScore = useMemo(
    () => livePenalties.reduce((a, p) => a + p.penalty, 0),
    [livePenalties]
  )

  // ── Score-history sparkline + breakdown tracking ──
  //   Initial point = solver-emitted score + initial penalty breakdown.
  //   Each subsequent change appends a new tick with the current breakdown.
  //   Drives the PenaltyTrendChart and ScoreBreakdownPopover trend tab.
  const buildBreakdown = (ps: { constraint: string; penalty: number }[]): Record<string, number> => {
    const m: Record<string, number> = {}
    ps.forEach(p => { m[p.constraint] = (m[p.constraint] ?? 0) + p.penalty })
    return m
  }
  const [scoreHistory, setScoreHistory] = useState<ScorePoint[]>(() => [
    { score, event: 'initial', breakdown: buildBreakdown(penalties) },
  ])
  const lastTrackedScore = useRef(score)
  // Keep a ref to livePenalties so the effect can capture it without
  // being re-triggered on every re-render (only fires on score change).
  const livePenaltiesRef = useRef(livePenalties)
  useEffect(() => { livePenaltiesRef.current = livePenalties })
  useEffect(() => {
    if (liveScore !== lastTrackedScore.current) {
      const bd = buildBreakdown(livePenaltiesRef.current)
      setScoreHistory(h => [...h, { score: liveScore, event: 'fix', breakdown: bd }])
      lastTrackedScore.current = liveScore
    }
  }, [liveScore])

  const softPenalties = livePenalties.filter(p => p.penalty > 0)
  const overloadedTeachers = teacherLoads.filter(t => t.load > t.max)

  const handleReoptimize = () => {
    setReoptimizing(true)
    // Slight defer so React can paint the loading state before heavy work
    setTimeout(() => {
      const liveStore = useTimetableStore.getState() as any
      const result = reoptimizeTeachers({
        classTT,
        sections,
        staff,
        subjects,
        periods,
        workDays,
        subjectAllocations: liveStore.subjectAllocations ?? {},
      })
      const stddevBefore = loadStats.stddev
      // PERSIST the improved assignment — previously only the load bars were
      // updated, so the chart claimed reassignments the timetable never got.
      // reassignedCount === 0 means the engine kept the incumbent (it only
      // accepts genuinely better results now); nothing to write in that case.
      if (result.reassignedCount > 0) {
        liveStore.setClassTT?.(result.classTT)
        liveStore.setTeacherTT?.(buildTeacherTT(result.classTT, staff, workDays))
        // Keep the dashboard's own view (solverOutput.classTT) in sync so a
        // second re-optimise / swap starts from the optimised timetable.
        // NOTE: the allocation matrix is NOT auto-updated — the user reconciles
        // it deliberately via "Backward Sync" (see the /timetable editor), so an
        // intentional custom load is never silently overwritten.
        onApplyConflictFixes?.(result.classTT)
      }
      setReoptimizeResult({
        reassignedCount: result.reassignedCount,
        stddevBefore,
        stddevAfter: result.teacherLoadStddev,
      })
      // Push a score history point reflecting the updated workload balance
      const newWorkloadScore = result.penalties.reduce((a, p) => a + p.penalty, 0)
      const otherPenalties = livePenalties.filter(p =>
        p.constraint !== 'workload-imbalance' && p.constraint !== 'teacher-overload'
      )
      const newTotal = otherPenalties.reduce((a, p) => a + p.penalty, 0) + newWorkloadScore
      const reoptBd = buildBreakdown([...otherPenalties, ...result.penalties])
      setScoreHistory(h => [...h, { score: newTotal, event: 'reoptimize', breakdown: reoptBd }])
      setReoptimizing(false)
    }, 16)
  }

  // Persist a post-generation timetable edit (manual swap / conflict fix) to the
  // store, keeping the teacher timetable AND the allocation matrix in sync
  // (BACKWARD SYNC) so the Timetable and Allocation views both reflect the edit
  // — and a future re-generate starts from the edited reality, not the stale plan.
  const persistTimetableEdit = (updated: ClassTimetable) => {
    const s = useTimetableStore.getState() as any
    s.setClassTT?.(updated)
    s.setTeacherTT?.(buildTeacherTT(updated, staff, workDays))
    // Allocation is NOT auto-synced — the user reconciles it on demand via
    // "Backward Sync" so a deliberate custom allocation isn't silently replaced.
    onApplyConflictFixes?.(updated)
  }

  // ── Backward Sync report state ──
  const [backSyncOpen, setBackSyncOpen] = useState(false)

  // ── Conflict resolution wizard state ──
  const [wizardOpen, setWizardOpen] = useState(false)

  // ── Publish & Export panel state ──
  const [publishOpen, setPublishOpen] = useState(false)

  // ── Timetable Swap Modal state ──
  const [swapOpen, setSwapOpen] = useState(false)

  // ── Teacher Availability Editor state ──
  const [availOpen, setAvailOpen] = useState(false)

  // ── Auto-fix safe — applies every green-delta fix in one pass ──
  const [autoFixResult, setAutoFixResult] = useState<{ applied: number; skipped: number; delta: number } | null>(null)
  const handleAutoFix = () => {
    let applied = 0, skipped = 0, totalDelta = 0

    softPenalties.forEach(p => {
      // Pull latest store state on every iteration so previously-applied
      // fixes are reflected in subsequent previews.
      const live = useTimetableStore.getState() as any
      const ctx = {
        staff: live.staff ?? [],
        sections: live.sections ?? [],
        subjects: live.subjects ?? [],
        teacherAllocations: live.teacherAllocations ?? {},
        subjectAllocations: live.subjectAllocations ?? {},
        actions: {
          setTeacherAllocationCell: live.setTeacherAllocationCell,
          setTeacherAllocations: live.setTeacherAllocations,
        },
      }
      const fixes = suggestFixes(p, ctx)
      const fix = fixes.find(f => f.changes && f.changes.length > 0)
      if (!fix) { skipped++; return }

      const preview = previewFix(fix, { staff: ctx.staff, teacherAllocations: ctx.teacherAllocations })
      // SAFE = strictly improves score AND introduces no new overload
      if (!preview || preview.scoreDelta >= 0 || preview.summary.introduces.length > 0) {
        skipped++; return
      }

      fix.apply?.()
      applied++
      totalDelta += preview.scoreDelta
    })

    setAutoFixResult({ applied, skipped, delta: totalDelta })
  }

  const fairness = score === 0 ? 'perfect' : loadStats.stddev < 2 ? 'good' : loadStats.stddev < 4 ? 'ok' : 'poor'
  const fairnessLabel = fairness === 'perfect' ? 'Perfect'
    : fairness === 'good' ? 'Good balance'
    : fairness === 'ok' ? 'Acceptable'
    : 'Needs attention'

  return (
    <div style={{
      width: '100%', maxWidth: 980, margin: '0 auto',
      display: 'flex', flexDirection: 'column' as const, gap: 14,
      textAlign: 'left' as const, fontFamily: "'Plus Jakarta Sans', sans-serif",
    }}>

      {/* ─── A. Academic Summary ─── */}
      <Card
        title="Academic Summary"
        icon={<Sparkles size={14} />}
        action={
          <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
            <button
              onClick={() => setSwapOpen(true)}
              title="Interactively swap or move cells on the schedule grid"
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                padding: '6px 13px', borderRadius: 8,
                border: '1.5px solid #D8D2FF', background: '#F8F7FF',
                color: '#7C6FE0', fontSize: 11, fontWeight: 700, cursor: 'pointer',
                fontFamily: 'inherit',
              }}
            >
              <PencilRuler size={12} /> Edit Grid
            </button>
            <button
              onClick={() => setPublishOpen(true)}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                padding: '6px 14px', borderRadius: 8, border: 'none',
                background: 'linear-gradient(135deg, #7C6FE0 0%, #9B8EF5 100%)',
                color: '#fff', fontSize: 11, fontWeight: 800, cursor: 'pointer',
                fontFamily: 'inherit', letterSpacing: '0.04em',
                boxShadow: '0 2px 8px rgba(124,111,224,0.30)',
              }}
            >
              <Download size={12} /> Publish &amp; Export
            </button>
          </div>
        }
      >
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 10 }}>
          <Stat icon={<Users2 size={14} />}    color="#7C6FE0" label="Classes"   value={sections.length} />
          <Stat icon={<BookOpen size={14} />}  color="#9B8EF5" label="Subjects"  value={subjects.length} />
          <Stat icon={<Users2 size={14} />}    color="#D4920E" label="Teachers"  value={staff.length} />
          <Stat icon={<Building2 size={14} />} color="#D946EF" label="Rooms"     value={rooms.length} />
          <Stat icon={<Layers size={14} />}    color="#0EA5E9" label="Opt Blocks" value={optionalBlocks.length} />
        </div>
      </Card>

      {/* ─── B. Capacity Summary ─── */}
      <Card title="Capacity Summary" icon={<Gauge size={14} />}>
        <div style={{ fontSize: 11, color: '#4B5275', marginBottom: 10 }}>
          Weekly capacity per band: <strong style={{ color: '#13111E', fontFamily: "'DM Mono', monospace" }}>{cap.weeklyCapacity}</strong> periods
          {' '}({cap.workingDays} days × {cap.teachingPeriodsPerDay} teaching periods)
        </div>
        <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 6 }}>
          {bandSummary.length === 0 && <Empty text="No sections yet" />}
          {bandSummary.map(b => {
            const pct = Math.min(100, Math.round((b.avgAllocated / cap.weeklyCapacity) * 100))
            const status = utilisationStatus(b.avgAllocated, cap.weeklyCapacity)
            return (
              <div key={b.band} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <span style={{ width: 90, fontSize: 11, fontWeight: 700, color: '#13111E', textTransform: 'capitalize' as const }}>
                  {b.band} <span style={{ color: '#8B87AD', fontWeight: 500 }}>({b.sectionsCount})</span>
                </span>
                <div style={{ flex: 1, height: 14, background: '#F5F2FF', borderRadius: 4, overflow: 'hidden', position: 'relative' as const }}>
                  <div style={{
                    height: '100%', width: `${pct}%`,
                    background: status === 'over' ? '#DC2626' : status === 'tight' ? '#D4920E' : status === 'ok' ? '#16A34A' : '#7C6FE0',
                    transition: 'width 0.25s',
                  }} />
                </div>
                <span style={{ minWidth: 84, fontSize: 11, fontFamily: "'DM Mono', monospace", color: '#13111E', textAlign: 'right' as const }}>
                  {b.avgAllocated} / {cap.weeklyCapacity}
                </span>
              </div>
            )
          })}
        </div>
      </Card>

      {/* ─── C. Teacher Load Analysis ─── */}
      <Card
        title="Teacher Load Analysis"
        icon={<TrendingUp size={14} />}
        action={
          <button
            onClick={() => setAvailOpen(true)}
            title="Configure per-teacher day/period availability before the next solve"
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              padding: '5px 12px', borderRadius: 7,
              border: '1.5px solid #BBF7D0', background: '#F0FDF4',
              color: '#15803D', fontSize: 10.5, fontWeight: 700,
              cursor: 'pointer', fontFamily: 'inherit',
            }}
          >
            <CalendarCheck size={11} /> Availability
          </button>
        }
      >
        <div style={{ display: 'flex', flexWrap: 'wrap' as const, alignItems: 'center', gap: 12, marginBottom: 12, fontSize: 11 }}>
          <Tag label="Mean"    value={loadStats.mean.toFixed(1)} color="#7C6FE0" />
          <Tag label="Min"     value={String(loadStats.min)}     color="#0EA5E9" />
          <Tag label="Max"     value={String(loadStats.max)}     color="#D4920E" />
          <Tag label="Stddev"  value={loadStats.stddev.toFixed(2)} color="#9B8EF5" />
          <div style={{ flex: 1 }} />
          <FairnessChip status={fairness} label={fairnessLabel} />
          {/* Re-optimise teachers button */}
          <button
            onClick={handleReoptimize}
            disabled={reoptimizing}
            title="Re-run HI teacher assignment to rebalance workloads without a full re-solve"
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 5,
              padding: '5px 11px', borderRadius: 7,
              background: reoptimizing ? '#F5F2FF' : '#EDE9FF',
              color: '#7C6FE0', border: '1px solid #D8D2FF',
              fontSize: 10.5, fontWeight: 700, cursor: reoptimizing ? 'default' : 'pointer',
              fontFamily: 'inherit', opacity: reoptimizing ? 0.7 : 1,
            }}
          >
            <RefreshCw size={11} style={{ animation: reoptimizing ? 'spin 0.8s linear infinite' : 'none' }} />
            {reoptimizing ? 'Optimising…' : 'Re-optimize Teachers'}
          </button>
          <button
            onClick={() => setBackSyncOpen(true)}
            title="Push the current timetable back to your Allocation plan, and print/download the Class & Faculty allocation"
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 5,
              padding: '5px 11px', borderRadius: 7,
              background: '#F8F7FF', color: '#7C6FE0', border: '1px solid #E4E0FF',
              fontSize: 10.5, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
            }}
          >
            ⇄ Backward Sync
          </button>
        </div>

        {/* Re-optimise result banner */}
        {reoptimizeResult && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' as const,
            padding: '6px 10px', borderRadius: 7,
            background: reoptimizeResult.stddevAfter < reoptimizeResult.stddevBefore ? '#F0FDF4' : '#FFFBEB',
            border: `1px solid ${reoptimizeResult.stddevAfter < reoptimizeResult.stddevBefore ? '#BBF7D0' : '#FDE68A'}`,
            marginBottom: 10, fontSize: 11,
          }}>
            <span style={{ fontWeight: 700, color: reoptimizeResult.reassignedCount > 0 ? '#15803D' : '#92400E' }}>
              {reoptimizeResult.reassignedCount > 0 ? '✓ Improved' : '↔ Already optimal — kept as-is'}
            </span>
            {reoptimizeResult.reassignedCount > 0 ? (
              <>
                <span style={{ color: '#4B5275' }}>
                  {reoptimizeResult.reassignedCount} slot{reoptimizeResult.reassignedCount !== 1 ? 's' : ''} reassigned
                </span>
                <span style={{ color: '#8B87AD', fontFamily: "'DM Mono', monospace" }}>
                  stddev: {reoptimizeResult.stddevBefore.toFixed(2)} → {reoptimizeResult.stddevAfter.toFixed(2)}
                </span>
              </>
            ) : (
              <span style={{ color: '#4B5275' }}>
                No reassignment beats the current balance (stddev {reoptimizeResult.stddevBefore.toFixed(2)}) — your schedule was left untouched.
              </span>
            )}
            <button
              onClick={() => { setReoptimizeResult(null) }}
              style={{ marginLeft: 'auto', background: 'none', border: 'none', color: '#8B87AD', cursor: 'pointer', fontSize: 12, lineHeight: 1, padding: '0 2px' }}
              title="Dismiss"
            >×</button>
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 4, maxHeight: 280, overflowY: 'auto' as const }}>
          {teacherLoads.length === 0 && <Empty text="No teachers yet" />}
          {teacherLoads.map(t => {
            const pct = (t.load / maxLoadInChart) * 100
            const overloaded = t.load > t.max
            return (
              <div key={t.name} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '2px 0' }}>
                <span style={{ width: 130, fontSize: 11.5, color: '#13111E', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const, fontWeight: 600 }}>
                  {t.name}
                </span>
                <div style={{ flex: 1, height: 10, background: '#F5F2FF', borderRadius: 4, overflow: 'hidden' }}>
                  <div style={{
                    height: '100%', width: `${pct}%`,
                    background: overloaded ? '#DC2626' : t.load === 0 ? '#D8D2FF' : '#7C6FE0',
                    transition: 'width 0.25s',
                  }} />
                </div>
                <span style={{ minWidth: 56, fontSize: 11, fontFamily: "'DM Mono', monospace", textAlign: 'right' as const, color: overloaded ? '#DC2626' : '#13111E' }}>
                  {t.load} / {t.max}
                </span>
              </div>
            )
          })}
        </div>
      </Card>

      {/* ─── D. Room Utilization ─── */}
      <Card title="Room Utilization" icon={<Building2 size={14} />}>
        {roomUsage.length === 0 && <Empty text="No room assignments" />}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 8, maxHeight: 260, overflowY: 'auto' as const }}>
          {roomUsage.slice(0, 24).map(r => {
            const tone = r.pct >= 85 ? '#DC2626' : r.pct >= 60 ? '#16A34A' : r.pct >= 30 ? '#0EA5E9' : '#D8D2FF'
            return (
              <div key={r.room} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ flex: 1, fontSize: 11, fontWeight: 600, color: '#13111E', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const }}>
                  {r.room}
                </span>
                <div style={{ width: 80, height: 6, background: '#F5F2FF', borderRadius: 3, overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${r.pct}%`, background: tone, transition: 'width 0.25s' }} />
                </div>
                <span style={{ minWidth: 38, fontSize: 10.5, fontFamily: "'DM Mono', monospace", textAlign: 'right' as const, color: '#13111E' }}>
                  {r.pct}%
                </span>
              </div>
            )
          })}
        </div>
      </Card>

      {/* ─── E. Conflicts & Warnings ─── */}
      <Card
        title="Conflicts & Warnings"
        icon={hardConflicts > 0 ? <AlertTriangle size={14} /> : <CheckCircle2 size={14} />}
        accent={hardConflicts > 0 ? '#DC2626' : softPenalties.length > 0 ? '#D4920E' : '#16A34A'}
      >
        <div style={{ display: 'flex', gap: 10, marginBottom: 10, flexWrap: 'wrap' as const, alignItems: 'center' }}>
          <Pill color="#DC2626" bg="#FEE2E2" label={`${hardConflicts} hard`} />
          <Pill color="#D4920E" bg="#FEF3C7" label={`${softPenalties.length} soft`} />
          <ScoreBreakdownPopover penalties={livePenalties} liveScore={liveScore} originalScore={score} history={scoreHistory} />
          {scoreHistory.length >= 2 && (
            <PenaltyTrendChart history={scoreHistory} />
          )}
          {overloadedTeachers.length > 0 && (
            <Pill color="#DC2626" bg="#FEE2E2" label={`${overloadedTeachers.length} overloaded`} />
          )}
          <div style={{ flex: 1 }} />
          {hardConflicts > 0 && (
            <button
              onClick={() => setWizardOpen(true)}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 5,
                padding: '5px 11px', borderRadius: 6,
                background: '#FEE2E2', color: '#DC2626',
                border: '1px solid #FECACA',
                fontSize: 10.5, fontWeight: 700, cursor: 'pointer',
                fontFamily: 'inherit',
              }}
              title="Step through each hard conflict and apply targeted fixes"
            >
              <Wand2 size={10} /> Resolve Conflicts
            </button>
          )}
          {softPenalties.length > 0 && (
            <button onClick={handleAutoFix}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 5,
                padding: '5px 11px', borderRadius: 6,
                background: '#7C6FE0', color: '#fff', border: 'none',
                fontSize: 10.5, fontWeight: 700, cursor: 'pointer',
                fontFamily: 'inherit', letterSpacing: '0.02em',
              }}
              title="Walks every soft penalty, applies only fixes that strictly improve the score"
            >
              <Wrench size={10} /> Auto-fix safe
            </button>
          )}
        </div>

        {/* Auto-fix result banner */}
        {autoFixResult && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 10,
            padding: '8px 12px', marginBottom: 10,
            background: autoFixResult.applied > 0 ? '#DCFCE7' : '#FEF3C7',
            border: `1px solid ${autoFixResult.applied > 0 ? '#BBF7D0' : '#FDE68A'}`,
            borderRadius: 7,
          }}>
            {autoFixResult.applied > 0
              ? <CheckCircle2 size={14} color="#15803D" />
              : <AlertTriangle size={14} color="#92400E" />}
            <div style={{ fontSize: 11.5, flex: 1, color: autoFixResult.applied > 0 ? '#15803D' : '#92400E' }}>
              <strong>{autoFixResult.applied}</strong> fix{autoFixResult.applied !== 1 ? 'es' : ''} applied
              {autoFixResult.applied > 0 && (
                <> · projected improvement <strong style={{ fontFamily: "'DM Mono', monospace" }}>{autoFixResult.delta}</strong> points</>
              )}
              {autoFixResult.skipped > 0 && (
                <> · {autoFixResult.skipped} skipped (no safe fix or would worsen score)</>
              )}
            </div>
            <button onClick={() => setAutoFixResult(null)}
              style={{
                background: 'transparent', border: 'none', cursor: 'pointer',
                color: autoFixResult.applied > 0 ? '#15803D' : '#92400E',
                fontSize: 14, fontWeight: 800, padding: 0,
              }}
              title="Dismiss"
            >×</button>
          </div>
        )}
        {(hardConflicts === 0 && softPenalties.length === 0) ? (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 8,
            padding: '12px 14px', background: '#DCFCE7', borderRadius: 8, border: '1px solid #BBF7D0',
          }}>
            <CheckCircle2 size={14} color="#15803D" />
            <span style={{ fontSize: 12, color: '#15803D', fontWeight: 600 }}>
              No conflicts or warnings — clean timetable.
            </span>
          </div>
        ) : (
          <div style={{ maxHeight: 220, overflowY: 'auto' as const, display: 'flex', flexDirection: 'column' as const, gap: 5 }}>
            {conflicts.map((c, i) => (
              <IssueRow key={`c${i}`} severity="hard" label={c.type ?? 'conflict'} desc={c.message ?? ''} />
            ))}
            {softPenalties.slice(0, 30).map((p, i) => (
              <IssueRow key={`p${i}`} severity="soft" label={p.constraint} desc={p.details} weight={p.penalty} />
            ))}
            {softPenalties.length > 30 && (
              <div style={{ fontSize: 10.5, color: '#8B87AD', padding: '4px 8px', textAlign: 'center' as const }}>
                … +{softPenalties.length - 30} more
              </div>
            )}
          </div>
        )}
      </Card>

      {/* ─── F. Dynamic Learning Groups inspector ─── */}
      {dynamicLearningGroups.length > 0 && (
        <Card title="Dynamic Learning Groups" icon={<Layers size={14} />}>
          <DLGInspector dlgs={dynamicLearningGroups} periods={periods} rooms={rooms} />
        </Card>
      )}

      {/* ─── G. Unplaced Slots (Why-this-was-blocked) ─── */}
      {blockedSlots.length > 0 && (() => {
        // Split into three categories:
        // • "free" — quota-met / all-subjects-exhausted slots (expected empty periods, not errors)
        // • "dispersal" — the class's day is simply over (expected structure, not errors)
        // • "hard" — scope-locked, no-teacher, etc. (genuine placement failures)
        const freeCategories = new Set(['subject-quota-met', 'all-subjects-exhausted'])
        const expectedCategories = new Set([...freeCategories, 'after-dispersal'])
        const freeSlots = blockedSlots.filter(s =>
          s.reasons.length > 0 && s.reasons.every(r => freeCategories.has(r.category))
        )
        const dispersalSlots = blockedSlots.filter(s =>
          s.reasons.length > 0 &&
          s.reasons.every(r => expectedCategories.has(r.category)) &&
          s.reasons.some(r => r.category === 'after-dispersal')
        )
        const hardSlots = blockedSlots.filter(s =>
          s.reasons.some(r => !expectedCategories.has(r.category))
        )
        return (
          <Card
            title="Schedule Gaps"
            icon={<Ban size={14} />}
            accent={hardSlots.length > 0 ? '#D4920E' : '#8B87AD'}
          >
            {/* Summary row */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10, flexWrap: 'wrap' as const }}>
              {hardSlots.length > 0 && (
                <Pill color="#D4920E" bg="#FEF3C7" label={`${hardSlots.length} unplaced slot${hardSlots.length !== 1 ? 's' : ''}`} />
              )}
              {dispersalSlots.length > 0 && (
                <Pill color="#6B7280" bg="#F3F4F6" label={`${dispersalSlots.length} after day end`} />
              )}
              {freeSlots.length > 0 && (
                <Pill color="#6B7280" bg="#F3F4F6" label={`${freeSlots.length} free period${freeSlots.length !== 1 ? 's' : ''}`} />
              )}
              <span style={{ fontSize: 11, color: '#4B5275' }}>
                {hardSlots.length > 0
                  ? 'Some slots couldn\'t be filled — see details below.'
                  : dispersalSlots.length > 0
                  ? 'No genuine gaps — junior classes simply end their day earlier; those slots don\'t exist for them.'
                  : 'All subjects met their weekly quota — remaining slots are free/activity periods.'
                }
              </span>
            </div>

            {/* Hard failures first */}
            {hardSlots.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 6, maxHeight: 280, overflowY: 'auto' as const, marginBottom: freeSlots.length > 0 ? 10 : 0 }}>
                {hardSlots.slice(0, 40).map((slot, i) => (
                  <BlockedRow key={`h${i}`} slot={slot} periods={periods} />
                ))}
                {hardSlots.length > 40 && (
                  <div style={{ fontSize: 10.5, color: '#8B87AD', padding: '4px 8px', textAlign: 'center' as const }}>
                    … +{hardSlots.length - 40} more
                  </div>
                )}
              </div>
            )}

            {/* Day-already-over slots — collapsed summary, never a wall of rows */}
            {dispersalSlots.length > 0 && (() => {
              const bySection = new Map<string, number>()
              dispersalSlots.forEach(s => bySection.set(s.section, (bySection.get(s.section) ?? 0) + 1))
              const names = [...bySection.keys()].sort()
              const label = names.length <= 5 ? names.join(', ') : `${names.slice(0, 4).join(', ')} +${names.length - 4} more`
              return (
                <div style={{ padding: '8px 12px', borderRadius: 8, background: '#F8F9FA', border: '1px solid #E5E7EB', fontSize: 11, color: '#6B7280', marginBottom: freeSlots.length > 0 ? 8 : 0 }}>
                  🕒 <strong>{label}</strong> finish their day earlier than the longest grid — the {dispersalSlots.length} slot{dispersalSlots.length !== 1 ? 's' : ''} after
                  their dispersal simply don&rsquo;t exist for them. Nothing to fix; extend their bell in <em>Shift &amp; timing</em> only if they should stay longer.
                </div>
              )
            })()}

            {/* Free periods — collapsed summary, not a list of rows */}
            {freeSlots.length > 0 && (
              <div style={{ padding: '8px 12px', borderRadius: 8, background: '#F8F9FA', border: '1px solid #E5E7EB', fontSize: 11, color: '#6B7280' }}>
                💡 <strong>{freeSlots.length} period{freeSlots.length !== 1 ? 's' : ''}</strong> are unscheduled because all subjects reached their weekly target.
                These become free/study/activity periods. To fill them, increase the <em>periods-per-week</em> target for the affected subjects or sections.
              </div>
            )}
          </Card>
        )
      })()}

      {/* ─── Conflict Resolution Wizard ─── */}
      {wizardOpen && conflicts.length > 0 && (
        <ConflictResolutionWizard
          conflicts={conflicts}
          classTT={classTT}
          sections={sections}
          staff={staff}
          subjects={subjects}
          periods={periods}
          workDays={workDays}
          onClose={() => setWizardOpen(false)}
          onApplyFixes={updated => {
            persistTimetableEdit(updated)
            setWizardOpen(false)
          }}
        />
      )}

      {/* ─── Publish & Export panel ─── */}
      {publishOpen && (
        <PublishExportPanel
          onClose={() => setPublishOpen(false)}
          exportOptions={{
            classTT,
            sections,
            staff,
            subjects,
            periods,
            workDays,
          }}
        />
      )}

      {/* ─── Teacher Availability Editor ─── */}
      {availOpen && (
        <TeacherAvailabilityEditor
          staff={staff}
          periods={periods}
          workDays={workDays}
          onClose={() => setAvailOpen(false)}
        />
      )}

      {/* ─── Timetable Swap Modal ─── */}
      {swapOpen && (
        <TimetableSwapModal
          classTT={classTT}
          sections={sections}
          staff={staff}
          periods={periods}
          workDays={workDays}
          onClose={() => setSwapOpen(false)}
          onApplyFixes={updated => {
            persistTimetableEdit(updated)
            setSwapOpen(false)
          }}
        />
      )}

      {backSyncOpen && (() => {
        const cfg = (useTimetableStore.getState() as any).config ?? {}
        return (
          <BackwardSyncReport
            classTT={classTT}
            sections={sections}
            staff={staff}
            periodMinutes={cfg.periodMinutes ?? 40}
            countryCode={cfg.countryCode ?? 'IN'}
            onClose={() => setBackSyncOpen(false)}
          />
        )
      })()}
    </div>
  )
}

// ─── BlockedRow ───────────────────────────────────────────
function BlockedRow({ slot, periods }: { slot: BlockedSlot; periods: Period[] }) {
  const period = periods.find(p => p.id === slot.periodId)
  const primary = slot.reasons[0]
  const day = slot.day.slice(0, 3).toUpperCase()

  return (
    <div style={{
      background: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: 7,
      padding: '8px 10px',
      display: 'flex', alignItems: 'flex-start', gap: 10,
    }}>
      <div style={{
        flexShrink: 0,
        padding: '3px 8px', borderRadius: 5,
        background: '#D4920E', color: '#fff',
        fontSize: 9, fontWeight: 800, letterSpacing: '0.06em',
        fontFamily: "'DM Mono', monospace",
        minWidth: 90, textAlign: 'center' as const,
      }}>
        {slot.section} · {day}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontSize: 11.5, fontWeight: 700, color: '#13111E',
          display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' as const,
        }}>
          <CalendarIcon size={10} color="#92400E" />
          {period?.name ?? slot.periodId}
          <span style={{ color: '#D8D2FF' }}>·</span>
          <span style={{
            fontSize: 9.5, padding: '1px 6px', borderRadius: 4,
            background: '#FEF3C7', color: '#92400E',
            border: '1px solid #FDE68A',
            fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase' as const,
          }}>
            {blockedCategoryLabel(primary.category)}
          </span>
        </div>
        <div style={{ fontSize: 11, color: '#92400E', marginTop: 3, lineHeight: 1.5 }}>
          {primary.detail}
        </div>
        <div style={{ fontSize: 10.5, color: '#4B5275', marginTop: 4, fontStyle: 'italic' as const }}>
          💡 {blockedRemedy(primary.category)}
        </div>
        {slot.reasons.length > 1 && (
          <div style={{ fontSize: 10, color: '#8B87AD', marginTop: 3 }}>
            +{slot.reasons.length - 1} additional reason{slot.reasons.length - 1 !== 1 ? 's' : ''}
          </div>
        )}
      </div>
    </div>
  )
}

// ─── sub-components ───────────────────────────────────────

// Spinner keyframe injected once
if (typeof document !== 'undefined' && !document.getElementById('rd-spin-kf')) {
  const s = document.createElement('style')
  s.id = 'rd-spin-kf'
  s.textContent = '@keyframes spin { to { transform: rotate(360deg); } }'
  document.head.appendChild(s)
}

function Card({ title, icon, accent, action, children }: {
  title: string; icon?: React.ReactNode; accent?: string;
  action?: React.ReactNode; children: React.ReactNode;
}) {
  return (
    <div style={{
      background: '#fff', border: '1px solid #ECEAFB', borderRadius: 14,
      padding: '14px 16px',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
        <div style={{ color: accent ?? '#7C6FE0', display: 'flex' }}>{icon}</div>
        <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.14em', textTransform: 'uppercase', color: '#4B5275' }}>
          {title}
        </span>
        {action && <div style={{ marginLeft: 'auto' }}>{action}</div>}
      </div>
      {children}
    </div>
  )
}

function Stat({ icon, color, label, value }: { icon: React.ReactNode; color: string; label: string; value: number }) {
  return (
    <div style={{
      background: '#FAFAFE', border: '1px solid #ECEAFB', borderRadius: 9,
      padding: '10px 12px', display: 'flex', alignItems: 'center', gap: 9,
    }}>
      <div style={{
        width: 26, height: 26, borderRadius: 6, color,
        background: `${color}1A`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        {icon}
      </div>
      <div>
        <div style={{ fontSize: 18, fontWeight: 800, color: '#13111E', lineHeight: 1, fontFamily: "'DM Mono', monospace" }}>{value}</div>
        <div style={{ fontSize: 9.5, color: '#8B87AD', marginTop: 3, fontWeight: 600, letterSpacing: '0.04em' }}>{label}</div>
      </div>
    </div>
  )
}

function Tag({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 5,
      padding: '4px 10px', borderRadius: 12,
      background: `${color}14`, color, border: `1px solid ${color}33`,
      fontSize: 10.5, fontWeight: 700,
    }}>
      <span style={{ opacity: 0.7 }}>{label}</span>
      <span style={{ fontFamily: "'DM Mono', monospace" }}>{value}</span>
    </span>
  )
}

function Pill({ label, color, bg }: { label: string; color: string; bg: string }) {
  return (
    <span style={{
      padding: '3px 10px', borderRadius: 12, fontSize: 10.5, fontWeight: 700,
      background: bg, color, border: `1px solid ${color}22`,
    }}>
      {label}
    </span>
  )
}

function FairnessChip({ status, label }: { status: string; label: string }) {
  const map: Record<string, { bg: string; fg: string }> = {
    perfect: { bg: '#DCFCE7', fg: '#15803D' },
    good:    { bg: '#DCFCE7', fg: '#15803D' },
    ok:      { bg: '#FEF3C7', fg: '#92400E' },
    poor:    { bg: '#FEE2E2', fg: '#991B1B' },
  }
  const s = map[status] ?? map.ok
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 5,
      padding: '4px 10px', borderRadius: 12, fontSize: 10.5, fontWeight: 800,
      background: s.bg, color: s.fg, letterSpacing: '0.04em',
    }}>
      <Clock size={10} /> Fairness: {label}
    </span>
  )
}

function IssueRow({ severity, label, desc, weight }: {
  severity: 'hard' | 'soft'; label: string; desc: string; weight?: number;
}) {
  const [expanded, setExpanded] = useState(false)
  const colors = severity === 'hard'
    ? { bg: '#FEE2E2', fg: '#991B1B', border: '#FECACA' }
    : { bg: '#FFFBEB', fg: '#92400E', border: '#FDE68A' }

  const store = useTimetableStore() as any
  const fixes: FixSuggestion[] = useMemo(() => {
    try {
      return suggestFixes(
        { constraint: label, details: desc, penalty: weight ?? 0 },
        {
          staff: store.staff ?? [],
          sections: store.sections ?? [],
          subjects: store.subjects ?? [],
          teacherAllocations: store.teacherAllocations ?? {},
          subjectAllocations: store.subjectAllocations ?? {},
          actions: {
            setTeacherAllocationCell: store.setTeacherAllocationCell ?? (() => {}),
            setTeacherAllocations: store.setTeacherAllocations ?? (() => {}),
          },
        },
      )
    } catch { return [] }
  }, [label, desc, weight, store])

  const hasApplyableFix = fixes.some(f => !!f.apply)

  return (
    <div style={{
      background: colors.bg, border: `1px solid ${colors.border}`, borderRadius: 7,
      overflow: 'hidden' as const,
    }}>
      <div style={{
        display: 'flex', alignItems: 'flex-start', gap: 9,
        padding: '7px 10px',
      }}>
        <span style={{
          fontSize: 9, fontWeight: 800, padding: '2px 6px',
          background: colors.fg, color: '#fff', borderRadius: 4,
          flexShrink: 0, marginTop: 1, letterSpacing: '0.04em',
        }}>{severity.toUpperCase()}</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 11.5, fontWeight: 700, color: '#13111E', fontFamily: "'DM Mono', monospace" }}>
            {label} {weight ? <span style={{ color: '#8B87AD', fontWeight: 500 }}>(+{weight})</span> : null}
          </div>
          <div style={{ fontSize: 11, color: colors.fg, marginTop: 1 }}>{desc}</div>
        </div>
        {fixes.length > 0 && (
          <button onClick={() => setExpanded(v => !v)}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 4,
              padding: '3px 8px', borderRadius: 5,
              background: '#fff', border: `1px solid ${colors.border}`,
              color: colors.fg, fontSize: 10, fontWeight: 700, cursor: 'pointer',
              fontFamily: 'inherit', flexShrink: 0,
            }}>
            <Wrench size={10} />
            {fixes.length} fix{fixes.length !== 1 ? 'es' : ''}
            {expanded ? <ChevronDown size={10} /> : <ChevronRight size={10} />}
          </button>
        )}
      </div>

      {/* Fix suggestions panel */}
      {expanded && fixes.length > 0 && (
        <div style={{
          padding: '8px 10px', borderTop: `1px dashed ${colors.border}`,
          background: '#fff',
        }}>
          <div style={{ fontSize: 9, fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase' as const, color: '#8B87AD', marginBottom: 6 }}>
            Suggested fixes
          </div>
          <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 6 }}>
            {fixes.map(f => <FixCard key={f.id} fix={f} />)}
          </div>
          {!hasApplyableFix && (
            <div style={{ fontSize: 10, color: '#8B87AD', fontStyle: 'italic' as const, marginTop: 6 }}>
              No auto-fix available — guidance only.
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function FixCard({ fix }: { fix: FixSuggestion }) {
  const [applied, setApplied] = useState(false)
  const [showPreview, setShowPreview] = useState(false)
  const store = useTimetableStore() as any

  const categoryStyle: Record<string, { bg: string; fg: string }> = {
    rebalance: { bg: '#EDE9FF', fg: '#7C6FE0' },
    reassign:  { bg: '#DBEAFE', fg: '#1D4ED8' },
    unscope:   { bg: '#FEF3C7', fg: '#92400E' },
    manual:    { bg: '#F1F5F9', fg: '#475569' },
  }
  const s = categoryStyle[fix.category] ?? categoryStyle.manual
  const handleApply = () => {
    fix.apply?.()
    setApplied(true)
  }

  const preview: FixPreview | null = useMemo(() => {
    if (!fix.changes || fix.changes.length === 0 || applied) return null
    try {
      return previewFix(fix, {
        staff: store.staff ?? [],
        teacherAllocations: store.teacherAllocations ?? {},
      })
    } catch { return null }
  }, [fix, applied, store])

  const hasPreview = preview != null
  const scoreDelta = preview?.scoreDelta ?? 0
  const previewTone = !preview
    ? '#8B87AD'
    : scoreDelta < 0 ? '#16A34A'
    : scoreDelta > 0 ? '#DC2626'
    : '#4B5275'

  return (
    <div style={{
      background: '#FAFAFE', border: '1px solid #ECEAFB', borderRadius: 7,
      padding: '8px 10px',
    }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
        <span style={{
          padding: '2px 7px', borderRadius: 10,
          fontSize: 8.5, fontWeight: 800, letterSpacing: '0.06em',
          background: s.bg, color: s.fg, flexShrink: 0,
          textTransform: 'uppercase' as const,
        }}>
          {fix.category}
        </span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 11.5, fontWeight: 700, color: '#13111E' }}>
            {fix.title}
          </div>
          <div style={{ fontSize: 10.5, color: '#4B5275', marginTop: 2, lineHeight: 1.5 }}>
            {fix.description}
          </div>
          {fix.diff && fix.diff.length > 0 && (
            <div style={{ marginTop: 6, padding: '5px 8px', background: '#fff', border: '1px solid #ECEAFB', borderRadius: 5 }}>
              {fix.diff.map((line, i) => (
                <div key={i} style={{ fontSize: 10, fontFamily: "'DM Mono', monospace", color: '#13111E', lineHeight: 1.6 }}>
                  {line}
                </div>
              ))}
            </div>
          )}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 4, flexShrink: 0, alignItems: 'flex-end' as const }}>
          {hasPreview && !applied && (
            <button onClick={() => setShowPreview(v => !v)}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 4,
                padding: '4px 8px', borderRadius: 5,
                background: '#fff', border: '1px solid #ECEAFB',
                color: previewTone, fontSize: 9.5, fontWeight: 700, cursor: 'pointer',
                fontFamily: 'inherit',
                letterSpacing: '0.04em',
              }}>
              {showPreview ? <ChevronDown size={9} /> : <ChevronRight size={9} />}
              IMPACT {scoreDelta > 0 ? '+' : ''}{scoreDelta}
            </button>
          )}
          {fix.apply && (
            <button onClick={handleApply} disabled={applied}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 4,
                padding: '5px 10px', borderRadius: 6, border: 'none',
                background: applied ? '#DCFCE7' : s.fg, color: applied ? '#15803D' : '#fff',
                fontSize: 10.5, fontWeight: 700, cursor: applied ? 'default' : 'pointer',
                fontFamily: 'inherit',
              }}>
              {applied
                ? <><CheckCircle2 size={10} /> Applied</>
                : <><Zap size={10} /> Apply</>}
            </button>
          )}
        </div>
      </div>

      {/* Conflict-aware preview panel */}
      {hasPreview && showPreview && preview && (
        <div style={{
          marginTop: 8, padding: '8px 10px',
          background: '#fff', border: '1px solid #ECEAFB', borderRadius: 6,
        }}>
          <div style={{
            fontSize: 9, fontWeight: 800, letterSpacing: '0.12em',
            textTransform: 'uppercase' as const, color: '#8B87AD', marginBottom: 6,
          }}>
            If applied · projected impact
          </div>
          {/* Resolves */}
          {preview.summary.resolves.map((r, i) => (
            <div key={`r${i}`} style={{ display: 'flex', alignItems: 'flex-start', gap: 6, marginBottom: 3, fontSize: 10.5, color: '#15803D' }}>
              <CheckCircle2 size={10} style={{ marginTop: 1, flexShrink: 0 }} />
              <span>{r}</span>
            </div>
          ))}
          {/* Introduces */}
          {preview.summary.introduces.map((n, i) => (
            <div key={`n${i}`} style={{ display: 'flex', alignItems: 'flex-start', gap: 6, marginBottom: 3, fontSize: 10.5, color: '#DC2626' }}>
              <Zap size={10} style={{ marginTop: 1, flexShrink: 0 }} />
              <span>{n}</span>
            </div>
          ))}
          {/* Warnings */}
          {preview.summary.warnings.map((w, i) => (
            <div key={`w${i}`} style={{ display: 'flex', alignItems: 'flex-start', gap: 6, marginBottom: 3, fontSize: 10.5, color: '#D4920E' }}>
              <span style={{ marginTop: 1, flexShrink: 0 }}>⚠</span>
              <span>{w}</span>
            </div>
          ))}
          {/* Load deltas */}
          {preview.loadDeltas.length > 0 && (
            <div style={{ marginTop: 8, paddingTop: 6, borderTop: '1px dashed #ECEAFB' }}>
              <div style={{
                fontSize: 9, fontWeight: 800, letterSpacing: '0.1em',
                textTransform: 'uppercase' as const, color: '#8B87AD', marginBottom: 4,
              }}>
                Teacher load changes
              </div>
              {preview.loadDeltas.map((d, i) => {
                const overBefore = d.before > d.max
                const overAfter  = d.after > d.max
                const goodNow = overBefore && !overAfter
                const badNow  = !overBefore && overAfter
                const color = goodNow ? '#15803D' : badNow ? '#DC2626' : '#13111E'
                return (
                  <div key={i} style={{
                    display: 'flex', alignItems: 'center', gap: 6,
                    fontSize: 10, fontFamily: "'DM Mono', monospace",
                    color, marginBottom: 2,
                  }}>
                    <span style={{ flex: 1 }}>{d.teacher}</span>
                    <span>{d.before} → {d.after}</span>
                    <span style={{ color: '#8B87AD' }}>/ {d.max}</span>
                  </div>
                )
              })}
            </div>
          )}
          {/* Score delta */}
          <div style={{
            marginTop: 8, paddingTop: 6, borderTop: '1px solid #ECEAFB',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          }}>
            <span style={{ fontSize: 10, color: '#4B5275', fontWeight: 600 }}>
              Estimated score delta
            </span>
            <span style={{
              fontSize: 11, fontWeight: 800, fontFamily: "'DM Mono', monospace",
              color: previewTone,
            }}>
              {scoreDelta > 0 ? '+' : ''}{scoreDelta}
              {' '}
              <span style={{ fontWeight: 500, opacity: 0.7 }}>
                ({scoreDelta < 0 ? 'better' : scoreDelta > 0 ? 'worse' : 'neutral'})
              </span>
            </span>
          </div>
        </div>
      )}
    </div>
  )
}

function Empty({ text }: { text: string }) {
  return <div style={{ fontSize: 11, color: '#8B87AD', fontStyle: 'italic' as const, padding: '8px 0' }}>{text}</div>
}
