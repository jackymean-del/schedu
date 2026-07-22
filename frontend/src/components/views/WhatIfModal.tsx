/**
 * WhatIfModal — AI What-If Simulation per Final Doc §10.
 *
 * "What if 20 more students choose PE?"
 *   → predicts section pressure, room shortages, teacher load,
 *     and emits mitigation suggestions.
 *
 * Self-contained modal triggered from OptionalBlockView card.
 */

import { useState, useMemo, useEffect } from 'react'
import type { OptionalBlock, SubjectCombination, Period, Staff, ClassTimetable } from '@/types'
import { getSubjectColor } from '@/lib/orgData'
import { X, Sparkles, AlertTriangle, CheckCircle2, TrendingUp, Lightbulb, RotateCcw } from 'lucide-react'

interface Props {
  block: OptionalBlock
  subjectCombinations: SubjectCombination[]
  classTT: ClassTimetable
  staff: Staff[]
  periods: Period[]
  workDays: string[]
  onClose: () => void
}

const DAY_LABEL: Record<string, string> = {
  MONDAY: 'Mon', TUESDAY: 'Tue', WEDNESDAY: 'Wed',
  THURSDAY: 'Thu', FRIDAY: 'Fri', SATURDAY: 'Sat', SUNDAY: 'Sun',
}

interface SimResult {
  totalCap: number
  baselineDemand: number
  simulatedDemand: number
  delta: number
  perOption: Array<{
    subject: string
    capacity: number
    actual: number
    simulated: number
    overflow: boolean
    utilization: number
  }>
  blockOverflow: boolean
  affectedTeachers: string[]
  affectedRooms: string[]
  suggestions: Array<{ kind: 'critical' | 'warning' | 'info'; message: string }>
}

export function WhatIfModal({
  block, subjectCombinations, classTT, staff, periods, workDays, onClose,
}: Props) {
  const period = periods.find(p => p.id === block.periodId)

  // ── Inputs ──
  // Global "what if N more students choose this block" slider
  const [globalDelta, setGlobalDelta] = useState(0)
  // Per-option override (if user wants to model specific subject demand shifts)
  const [optionOverrides, setOptionOverrides] = useState<Record<number, number | null>>({})

  // Reset when block changes
  useEffect(() => {
    setGlobalDelta(0)
    setOptionOverrides({})
  }, [block.id])

  // ── Simulation ──
  const sim: SimResult = useMemo(() => {
    const totalCap = block.options.reduce((s, o) => s + (o.capacity ?? 0), 0)
    // Baseline demand from combinations attached to this block's sections
    const baselineDemand = subjectCombinations
      .filter(c => block.sectionNames.some(sn => sn === c.className || sn.startsWith(c.className)))
      .reduce((s, c) => s + (c.strength ?? 0), 0)

    const simulatedDemand = baselineDemand + globalDelta

    // For each option, allocate proportionally based on capacity unless overridden
    const totalActualAlloc = block.options.reduce((s, o) => s + (o.allocatedStrength ?? 0), 0)
    const perOption = block.options.map((opt, i) => {
      const cap = opt.capacity ?? 0
      const actual = opt.allocatedStrength ?? Math.round((cap / Math.max(1, totalCap)) * baselineDemand)
      const override = optionOverrides[i]
      // If user overrode, use that. Else scale actual by simulated/baseline ratio.
      const ratio = baselineDemand > 0 ? simulatedDemand / baselineDemand : 1
      const simulated = override != null ? override : Math.round(actual * ratio)
      return {
        subject: opt.subject,
        capacity: cap,
        actual,
        simulated,
        overflow: cap > 0 && simulated > cap,
        utilization: cap > 0 ? Math.round((simulated / cap) * 100) : 0,
      }
    })

    const blockOverflow = totalCap > 0 && simulatedDemand > totalCap

    // Affected teachers & rooms
    const teachers = block.options.map(o => o.teacher).filter(Boolean) as string[]
    const rooms    = block.options.map(o => o.room).filter(Boolean) as string[]

    // ── Mitigation suggestions ──
    const suggestions: SimResult['suggestions'] = []
    if (blockOverflow) {
      const shortfall = simulatedDemand - totalCap
      suggestions.push({
        kind: 'critical',
        message: `Block is over capacity by ${shortfall} student${shortfall !== 1 ? 's' : ''}. Total demand ${simulatedDemand} exceeds ${totalCap} seats.`,
      })
      // Suggest capacity expansion of the most strained option
      const worst = [...perOption].sort((a, b) => b.utilization - a.utilization)[0]
      if (worst && worst.overflow) {
        suggestions.push({
          kind: 'warning',
          message: `Increase ${worst.subject} capacity by at least ${worst.simulated - worst.capacity} seats, or move the overflow to a less-utilized option.`,
        })
      }
      suggestions.push({
        kind: 'info',
        message: `Consider pooling another section into this block to redistribute load (cross-section pooling).`,
      })
    }
    perOption.forEach(o => {
      if (o.overflow && !blockOverflow) {
        suggestions.push({
          kind: 'warning',
          message: `${o.subject} is over capacity (${o.simulated}/${o.capacity}). Consider redirecting ${o.simulated - o.capacity} students to less-utilized options.`,
        })
      }
      if (o.capacity > 0 && o.utilization < 30 && o.simulated > 0) {
        suggestions.push({
          kind: 'info',
          message: `${o.subject} is under-utilized (${o.utilization}%) — consider reducing capacity or merging with another option.`,
        })
      }
    })
    if (suggestions.length === 0 && simulatedDemand > 0) {
      suggestions.push({
        kind: 'info',
        message: `All options within capacity. ${simulatedDemand}/${totalCap} students seated (${Math.round((simulatedDemand / Math.max(1, totalCap)) * 100)}% utilization).`,
      })
    }

    return { totalCap, baselineDemand, simulatedDemand, delta: globalDelta, perOption, blockOverflow, affectedTeachers: teachers, affectedRooms: rooms, suggestions }
  }, [block, subjectCombinations, globalDelta, optionOverrides])

  // Teacher load impact: count current periods for each affected teacher
  const teacherLoad = useMemo(() => {
    const load: Record<string, number> = {}
    sim.affectedTeachers.forEach(t => {
      let count = 0
      Object.values(classTT).forEach(secData =>
        Object.values(secData ?? {}).forEach(dayData =>
          Object.values(dayData ?? {}).forEach((cell: any) => {
            if (cell?.teacher === t) count++
            if (cell?.options) cell.options.forEach((o: any) => { if (o.teacher === t) count++ })
          })
        )
      )
      load[t] = count
    })
    return load
  }, [sim.affectedTeachers, classTT])

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(19,17,30,0.6)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 9999, padding: 20, backdropFilter: 'blur(4px)',
    }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{
        background: '#fff', borderRadius: 14, width: '100%', maxWidth: 900,
        maxHeight: '90vh', display: 'flex', flexDirection: 'column',
        boxShadow: '0 24px 60px rgba(19,17,30,0.35)',
      }}>

        {/* Header */}
        <div style={{
          padding: '16px 22px', borderBottom: '1px solid #E8E4FF',
          display: 'flex', alignItems: 'center', gap: 12,
          background: 'linear-gradient(135deg, #EDE9FF 0%, #FAFAFE 100%)', borderRadius: '14px 14px 0 0',
        }}>
          <div style={{ width: 38, height: 38, borderRadius: 9, background: '#7C6FE0', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Sparkles size={18} color="#fff" />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 9, fontWeight: 800, letterSpacing: '0.18em', textTransform: 'uppercase', color: '#7C6FE0' }}>
              AI What-If Simulation
            </div>
            <div style={{ fontSize: 16, fontWeight: 900, color: '#13111E', letterSpacing: '-0.3px' }}>
              {block.name}
            </div>
            <div style={{ fontSize: 11, color: '#4B5275', marginTop: 2 }}>
              {DAY_LABEL[block.day] ?? block.day} · {period?.name ?? '—'} · {block.sectionNames.join(', ') || 'No sections'}
            </div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 6, color: '#8B87AD', display: 'flex' }} title="Close">
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div data-app-shell="whatif-body" style={{ display: 'grid', gridTemplateColumns: '320px 1fr', gap: 0, flex: 1, overflow: 'hidden' }}>

          {/* ─── Left: Inputs ─── */}
          <div style={{ padding: 18, borderRight: '1px solid #E8E4FF', overflowY: 'auto', background: '#FAFAFE' }}>
            <div style={{ fontSize: 9, fontWeight: 800, letterSpacing: '0.14em', textTransform: 'uppercase', color: '#8B87AD', marginBottom: 12 }}>
              Simulation Inputs
            </div>

            {/* Global delta slider */}
            <div style={{ background: '#fff', border: '1px solid #E8E4FF', borderRadius: 10, padding: '14px 14px', marginBottom: 12 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#13111E', marginBottom: 4 }}>
                Global demand shift
              </div>
              <div style={{ fontSize: 10, color: '#8B87AD', marginBottom: 12, lineHeight: 1.5 }}>
                What if {globalDelta >= 0 ? globalDelta : Math.abs(globalDelta)} {globalDelta >= 0 ? 'more' : 'fewer'} students chose this block?
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                <button onClick={() => setGlobalDelta(d => Math.max(-100, d - 5))}
                  style={{ width: 26, height: 26, borderRadius: 6, border: '1px solid #E8E4FF', background: '#fff', cursor: 'pointer', color: '#7C6FE0', fontWeight: 700 }}>−</button>
                <input type="range" min={-50} max={100} step={1} value={globalDelta}
                  onChange={e => setGlobalDelta(parseInt(e.target.value))}
                  style={{ flex: 1, accentColor: '#7C6FE0' }} />
                <button onClick={() => setGlobalDelta(d => Math.min(100, d + 5))}
                  style={{ width: 26, height: 26, borderRadius: 6, border: '1px solid #E8E4FF', background: '#fff', cursor: 'pointer', color: '#7C6FE0', fontWeight: 700 }}>+</button>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <span style={{ fontSize: 22, fontWeight: 900, color: globalDelta === 0 ? '#13111E' : globalDelta > 0 ? '#7C6FE0' : '#DC2626', fontFamily: "'DM Mono', monospace" }}>
                  {globalDelta > 0 ? '+' : ''}{globalDelta}
                </span>
                <span style={{ fontSize: 11, color: '#8B87AD', marginLeft: 6 }}>students</span>
              </div>
            </div>

            {/* Per-option overrides */}
            <div style={{ background: '#fff', border: '1px solid #E8E4FF', borderRadius: 10, padding: '12px 14px', marginBottom: 12 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#13111E', marginBottom: 4 }}>
                Per-option overrides
              </div>
              <div style={{ fontSize: 10, color: '#8B87AD', marginBottom: 12, lineHeight: 1.5 }}>
                Force a specific demand for each subject (leave blank to scale automatically).
              </div>
              {block.options.map((opt, i) => {
                const cc = getSubjectColor(opt.subject || ' ')
                return (
                  <div key={i} className={cc} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 8px', borderRadius: 6, marginBottom: 5 }}>
                    <span style={{ flex: 1, fontSize: 11, fontWeight: 700 }}>{opt.subject}</span>
                    <input type="number" min={0} placeholder={String(sim.perOption[i]?.simulated ?? '')}
                      value={optionOverrides[i] ?? ''}
                      onChange={e => setOptionOverrides(prev => ({ ...prev, [i]: e.target.value === '' ? null : parseInt(e.target.value) }))}
                      style={{ width: 60, padding: '3px 6px', fontSize: 11, fontFamily: "'DM Mono', monospace", borderRadius: 4, border: '1px solid rgba(255,255,255,0.5)', background: 'rgba(255,255,255,0.7)', textAlign: 'right' as const }} />
                  </div>
                )
              })}
            </div>

            {/* Reset */}
            <button onClick={() => { setGlobalDelta(0); setOptionOverrides({}) }}
              style={{ width: '100%', padding: '8px 12px', borderRadius: 7, border: '1px solid #E8E4FF', background: '#fff', color: '#4B5275', fontSize: 12, fontWeight: 600, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
              <RotateCcw size={12} /> Reset to baseline
            </button>
          </div>

          {/* ─── Right: Impact analysis ─── */}
          <div style={{ padding: 18, overflowY: 'auto' }}>
            <div style={{ fontSize: 9, fontWeight: 800, letterSpacing: '0.14em', textTransform: 'uppercase', color: '#8B87AD', marginBottom: 12 }}>
              Projected Impact
            </div>

            {/* Headline numbers */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginBottom: 16 }}>
              <Stat label="Baseline" value={sim.baselineDemand} sub="students" />
              <Stat label="Simulated" value={sim.simulatedDemand} sub="students" emphasize={sim.delta !== 0} accent={sim.blockOverflow ? '#DC2626' : '#7C6FE0'} />
              <Stat label="Capacity" value={sim.totalCap} sub="seats" />
            </div>

            {/* Per-option breakdown */}
            <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#8B87AD', marginBottom: 8 }}>
              Per-Option Projection
            </div>
            <div style={{ background: '#fff', border: '1px solid #E8E4FF', borderRadius: 10, padding: 4, marginBottom: 16 }}>
              {sim.perOption.map((o, i) => {
                const cc = getSubjectColor(o.subject || ' ')
                const cappedWidth = Math.min(100, o.utilization)
                return (
                  <div key={i} className={cc} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', borderRadius: 6, marginBottom: i < sim.perOption.length - 1 ? 4 : 0 }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 11, fontWeight: 800, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const }}>{o.subject}</div>
                      <div style={{ height: 4, background: 'rgba(0,0,0,0.06)', borderRadius: 2, marginTop: 4, overflow: 'hidden' }}>
                        <div style={{ height: '100%', width: `${cappedWidth}%`, background: o.overflow ? 'linear-gradient(90deg, #DC2626, #991B1B)' : 'linear-gradient(90deg, #7C6FE0, #9B8EF5)', transition: 'width 0.25s' }} />
                      </div>
                    </div>
                    <div style={{ fontSize: 11, fontFamily: "'DM Mono', monospace", fontWeight: 700, minWidth: 64, textAlign: 'right' as const, color: o.overflow ? '#991B1B' : 'inherit' }}>
                      {o.simulated}/{o.capacity}
                    </div>
                    <div style={{ fontSize: 10, fontWeight: 700, minWidth: 36, textAlign: 'right' as const, opacity: 0.85 }}>
                      {o.utilization}%
                    </div>
                  </div>
                )
              })}
            </div>

            {/* Resource impact */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 16 }}>
              <div style={{ background: '#fff', border: '1px solid #E8E4FF', borderRadius: 10, padding: '10px 12px' }}>
                <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#8B87AD', marginBottom: 6 }}>
                  Teachers Affected ({sim.affectedTeachers.length})
                </div>
                {sim.affectedTeachers.length === 0
                  ? <div style={{ fontSize: 11, color: '#B8B4D4' }}>—</div>
                  : sim.affectedTeachers.map(t => (
                    <div key={t} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 11, color: '#13111E', padding: '3px 0' }}>
                      <span>👤 {t}</span>
                      <span style={{ fontSize: 9, color: '#8B87AD', fontFamily: "'DM Mono', monospace" }}>{teacherLoad[t] ?? 0} pds/wk</span>
                    </div>
                  ))
                }
              </div>
              <div style={{ background: '#fff', border: '1px solid #E8E4FF', borderRadius: 10, padding: '10px 12px' }}>
                <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#8B87AD', marginBottom: 6 }}>
                  Rooms Affected ({sim.affectedRooms.length})
                </div>
                {sim.affectedRooms.length === 0
                  ? <div style={{ fontSize: 11, color: '#B8B4D4' }}>—</div>
                  : sim.affectedRooms.map(r => (
                    <div key={r} style={{ fontSize: 11, color: '#13111E', padding: '3px 0' }}>
                      → {r}
                    </div>
                  ))
                }
              </div>
            </div>

            {/* Smart suggestions */}
            <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#8B87AD', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
              <Lightbulb size={11} /> Smart suggestions
            </div>
            <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 6 }}>
              {sim.suggestions.map((s, i) => {
                const colors = s.kind === 'critical'
                  ? { bg: '#FEE2E2', border: '#FECACA', icon: '#DC2626', text: '#991B1B', Icon: AlertTriangle }
                  : s.kind === 'warning'
                  ? { bg: '#FEF3C7', border: '#FDE68A', icon: '#D4920E', text: '#92400E', Icon: TrendingUp }
                  : { bg: '#EDE9FF', border: '#D8D2FF', icon: '#7C6FE0', text: '#13111E', Icon: CheckCircle2 }
                const Icon = colors.Icon
                return (
                  <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 9, padding: '10px 12px', background: colors.bg, border: `1px solid ${colors.border}`, borderRadius: 8 }}>
                    <Icon size={13} color={colors.icon} style={{ flexShrink: 0, marginTop: 1 }} />
                    <div style={{ fontSize: 11.5, color: colors.text, lineHeight: 1.5 }}>{s.message}</div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>

      </div>
    </div>
  )
}

function Stat({ label, value, sub, emphasize, accent = '#13111E' }: { label: string; value: number; sub: string; emphasize?: boolean; accent?: string }) {
  return (
    <div style={{ background: '#fff', border: emphasize ? `1.5px solid ${accent}` : '1px solid #E8E4FF', borderRadius: 9, padding: '10px 12px' }}>
      <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#8B87AD' }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 900, color: accent, fontFamily: "'DM Mono', monospace", lineHeight: 1.1, marginTop: 3 }}>{value}</div>
      <div style={{ fontSize: 10, color: '#8B87AD', marginTop: 1 }}>{sub}</div>
    </div>
  )
}
