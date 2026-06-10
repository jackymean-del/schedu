/**
 * ScoreBreakdownPopover — clickable Score pill that reveals per-
 * constraint contributions to the total score.
 *
 * v2: two-tab view inside the popover:
 *   NOW   — the existing bar chart of current penalty contributions
 *   TREND — per-constraint mini-sparklines showing how each constraint's
 *           penalty evolved across the score history
 *
 * The TREND tab requires `history` prop (ScorePoint[] with `breakdown`
 * populated). Falls back gracefully when history has < 2 points.
 */

import { useMemo, useState } from 'react'
import { TrendingDown, Activity, ChevronDown, ChevronUp, BarChart2, TrendingUp } from 'lucide-react'
import type { ScorePoint } from './PenaltyTrendChart'

interface PenaltyEntry {
  constraint: string
  penalty: number
  details: string
}

interface Props {
  penalties: PenaltyEntry[]
  liveScore: number
  originalScore: number
  /** Score history with per-point breakdowns — enables the TREND tab. */
  history?: ScorePoint[]
}

export const CONSTRAINT_LABEL: Record<string, string> = {
  'workload-imbalance':      'Workload imbalance',
  'teacher-overload':        'Teacher overload',
  'subject-scope-locked':    'Subject scope locked',
  'section-scope-disabled':  'Section scope disabled',
  'subject-scope-disabled':  'Subject scope disabled',
  'teacher-scope-disabled':  'Teacher scope disabled',
  'consecutive-heavy':       'Consecutive same subject',
  'teacher-availability':    'No teacher available',
  'block-capacity-overflow': 'Block capacity overflow',
}

export const CONSTRAINT_COLOR: Record<string, { bg: string; fg: string }> = {
  'workload-imbalance':      { bg: '#EDE9FF', fg: '#7C6FE0' },
  'teacher-overload':        { bg: '#FEE2E2', fg: '#991B1B' },
  'subject-scope-locked':    { bg: '#FEE2E2', fg: '#DC2626' },
  'section-scope-disabled':  { bg: '#FEF3C7', fg: '#92400E' },
  'subject-scope-disabled':  { bg: '#FEF3C7', fg: '#92400E' },
  'teacher-scope-disabled':  { bg: '#FEF3C7', fg: '#92400E' },
  'consecutive-heavy':       { bg: '#FFFBEB', fg: '#D4920E' },
  'teacher-availability':    { bg: '#FEE2E2', fg: '#991B1B' },
  'block-capacity-overflow': { bg: '#FEE2E2', fg: '#991B1B' },
}

// ── Tiny per-constraint sparkline (SVG, no library) ─────
function ConstraintSparkline({
  values, color, width = 72, height = 20,
}: {
  values: number[]
  color: string
  width?: number
  height?: number
}) {
  if (values.length < 2) {
    // Single point — flat line
    const mid = height / 2
    return (
      <svg width={width} height={height} style={{ display: 'block' }}>
        <line x1={0} y1={mid} x2={width} y2={mid}
          stroke={color} strokeWidth="1.5" strokeDasharray="3 2" opacity="0.4" />
      </svg>
    )
  }

  const pad = 2
  const iW = width - pad * 2
  const iH = height - pad * 2
  const minV = Math.min(...values)
  const maxV = Math.max(...values)
  const range = Math.max(1, maxV - minV)

  const xFor = (i: number) => pad + (i / (values.length - 1)) * iW
  const yFor = (v: number) => pad + iH - ((v - minV) / range) * iH

  let path = ''
  values.forEach((v, i) => {
    const x = xFor(i).toFixed(1)
    const y = yFor(v).toFixed(1)
    path += i === 0 ? `M ${x} ${y}` : ` L ${x} ${y}`
  })

  const last = values[values.length - 1]
  const first = values[0]

  return (
    <svg width={width} height={height} style={{ display: 'block' }}>
      <path d={path} fill="none" stroke={color} strokeWidth="1.5"
        strokeLinecap="round" strokeLinejoin="round" />
      {/* First dot — open */}
      <circle cx={xFor(0)} cy={yFor(first)} r={2}
        fill="#fff" stroke={color} strokeWidth="1.5" />
      {/* Last dot — filled */}
      <circle cx={xFor(values.length - 1)} cy={yFor(last)} r={2.5}
        fill={color} stroke={color} strokeWidth="1" />
    </svg>
  )
}

export function ScoreBreakdownPopover({ penalties, liveScore, originalScore, history = [] }: Props) {
  const [open, setOpen] = useState(false)
  const [tab, setTab] = useState<'now' | 'trend'>('now')

  // ── NOW tab data ──
  const breakdown = useMemo(() => {
    const m = new Map<string, { count: number; total: number; details: string[] }>()
    penalties.forEach(p => {
      const e = m.get(p.constraint) ?? { count: 0, total: 0, details: [] }
      e.count++
      e.total += p.penalty
      e.details.push(p.details)
      m.set(p.constraint, e)
    })
    return Array.from(m.entries())
      .map(([c, v]) => ({ constraint: c, ...v }))
      .sort((a, b) => b.total - a.total)
  }, [penalties])

  // ── TREND tab data ──
  // Collect all constraint keys that appear in any history breakdown,
  // build a per-constraint value series across history points.
  const trendData = useMemo(() => {
    const pointsWithBreakdown = history.filter(h => h.breakdown)
    if (pointsWithBreakdown.length < 2) return null

    const allConstraints = new Set<string>()
    pointsWithBreakdown.forEach(h => {
      Object.keys(h.breakdown!).forEach(k => allConstraints.add(k))
    })

    return Array.from(allConstraints).map(constraint => {
      const values = pointsWithBreakdown.map(h => h.breakdown![constraint] ?? 0)
      const first = values[0]
      const last  = values[values.length - 1]
      return { constraint, values, first, last, delta: last - first }
    }).sort((a, b) => b.last - a.last || a.delta - b.delta)
  }, [history])

  const maxPenalty = Math.max(1, ...breakdown.map(b => b.total))
  const delta   = liveScore - originalScore
  const improved = delta < 0
  const hasTrend = (trendData?.length ?? 0) > 0

  return (
    <span style={{ position: 'relative' as const, display: 'inline-flex' }}>
      <button
        onClick={() => setOpen(v => !v)}
        title="Click for score breakdown"
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 5,
          padding: '3px 10px', borderRadius: 12,
          background: '#EDE9FF', color: '#7C6FE0',
          border: '1px solid #D8D2FF',
          fontSize: 10.5, fontWeight: 700, cursor: 'pointer',
          fontFamily: 'inherit',
        }}
      >
        Score: {liveScore}
        {liveScore !== originalScore && (
          <span style={{ color: improved ? '#16A34A' : '#DC2626', fontWeight: 800, fontFamily: "'DM Mono', monospace" }}>
            ({delta > 0 ? '+' : ''}{delta})
          </span>
        )}
        {open ? <ChevronUp size={9} /> : <ChevronDown size={9} />}
      </button>

      {open && (
        <>
          <div onClick={() => setOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 9998 }} />
          <div
            onClick={e => e.stopPropagation()}
            style={{
              position: 'absolute' as const,
              left: 0, top: '100%',
              marginTop: 6,
              zIndex: 9999,
              minWidth: 340, maxWidth: 430,
              background: '#fff',
              border: '1px solid #ECEAFB',
              borderRadius: 12,
              boxShadow: '0 14px 38px rgba(19,17,30,0.18)',
              padding: 0,
              fontFamily: "'Hanken Grotesk', sans-serif",
              textAlign: 'left' as const,
            }}
          >
            {/* Header */}
            <div style={{
              padding: '12px 14px 10px',
              background: 'linear-gradient(135deg, #EDE9FF 0%, #FAFAFE 100%)',
              borderRadius: '12px 12px 0 0',
              borderBottom: '1px solid #F3F1FF',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                <Activity size={12} color="#7C6FE0" />
                <span style={{ fontSize: 9, fontWeight: 800, letterSpacing: '0.16em', textTransform: 'uppercase' as const, color: '#7C6FE0' }}>
                  Score Breakdown
                </span>
              </div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                <span style={{ fontSize: 24, fontWeight: 900, color: '#13111E', fontFamily: "'DM Mono', monospace", letterSpacing: '-0.5px' }}>
                  {liveScore}
                </span>
                <span style={{ fontSize: 11, color: '#8B87AD' }}>
                  total penalty points
                </span>
                {liveScore !== originalScore && (
                  <span style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, fontWeight: 700, color: improved ? '#16A34A' : '#DC2626' }}>
                    {improved && <TrendingDown size={11} />}
                    {delta > 0 ? '+' : ''}{delta} vs solve
                  </span>
                )}
              </div>

              {/* Tab switcher */}
              <div style={{ display: 'flex', gap: 4, marginTop: 10 }}>
                <TabBtn active={tab === 'now'} onClick={() => setTab('now')} icon={<BarChart2 size={10} />} label="Now" />
                <TabBtn
                  active={tab === 'trend'} onClick={() => setTab('trend')}
                  icon={<TrendingUp size={10} />} label="Trend"
                  disabled={!hasTrend}
                  title={!hasTrend ? 'Apply a fix to see trend data' : undefined}
                />
              </div>
            </div>

            {/* Body */}
            <div style={{ padding: '10px 14px 14px', maxHeight: 340, overflowY: 'auto' as const }}>

              {/* ── NOW tab ── */}
              {tab === 'now' && (
                breakdown.length === 0 ? (
                  <div style={{ padding: '20px 0', textAlign: 'center' as const, color: '#15803D', fontSize: 12, fontWeight: 600 }}>
                    ✓ No penalties — clean state
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 8 }}>
                    {breakdown.map(b => {
                      const c = CONSTRAINT_COLOR[b.constraint] ?? { bg: '#F1F5F9', fg: '#475569' }
                      const label = CONSTRAINT_LABEL[b.constraint] ?? b.constraint
                      const share = (b.total / maxPenalty) * 100
                      return (
                        <div key={b.constraint}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                            <span style={{ padding: '2px 8px', borderRadius: 10, fontSize: 9, fontWeight: 800, letterSpacing: '0.04em', background: c.bg, color: c.fg }}>
                              {label}
                            </span>
                            <span style={{ fontSize: 10, color: '#8B87AD' }}>
                              {b.count} occurrence{b.count !== 1 ? 's' : ''}
                            </span>
                            <span style={{ marginLeft: 'auto', fontSize: 12, fontWeight: 800, fontFamily: "'DM Mono', monospace", color: c.fg }}>
                              {b.total}
                            </span>
                          </div>
                          <div style={{ height: 4, background: '#F5F2FF', borderRadius: 2, overflow: 'hidden' }}>
                            <div style={{ height: '100%', width: `${share}%`, background: c.fg, opacity: 0.85, transition: 'width 0.25s' }} />
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )
              )}

              {/* ── TREND tab ── */}
              {tab === 'trend' && (
                !trendData || trendData.length === 0 ? (
                  <div style={{ padding: '20px 0', textAlign: 'center' as const, color: '#8B87AD', fontSize: 12 }}>
                    Apply at least one fix to see constraint trends.
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 10 }}>
                    <div style={{ fontSize: 10, color: '#8B87AD', marginBottom: 2 }}>
                      Each row shows how a constraint's penalty changed across {history.filter(h => h.breakdown).length} snapshots.
                    </div>
                    {trendData.map(row => {
                      const c = CONSTRAINT_COLOR[row.constraint] ?? { bg: '#F1F5F9', fg: '#475569' }
                      const label = CONSTRAINT_LABEL[row.constraint] ?? row.constraint
                      const improved = row.delta < 0
                      const worsened = row.delta > 0
                      const resolved = row.last === 0 && row.first > 0

                      return (
                        <div key={row.constraint} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          {/* Label */}
                          <span style={{
                            flexShrink: 0, minWidth: 120, maxWidth: 130,
                            padding: '2px 8px', borderRadius: 10,
                            fontSize: 9, fontWeight: 800, letterSpacing: '0.04em',
                            background: resolved ? '#DCFCE7' : c.bg,
                            color: resolved ? '#15803D' : c.fg,
                            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const,
                          }} title={label}>
                            {resolved ? '✓ ' : ''}{label}
                          </span>

                          {/* Sparkline */}
                          <ConstraintSparkline
                            values={row.values}
                            color={resolved ? '#16A34A' : c.fg}
                          />

                          {/* First → Last */}
                          <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, flexShrink: 0 }}>
                            <span style={{ fontFamily: "'DM Mono', monospace", color: '#8B87AD' }}>{row.first}</span>
                            <span style={{ color: '#D8D2FF' }}>→</span>
                            <span style={{
                              fontFamily: "'DM Mono', monospace", fontWeight: 800,
                              color: resolved ? '#15803D' : improved ? '#16A34A' : worsened ? '#DC2626' : '#8B87AD',
                            }}>{row.last}</span>
                          </div>

                          {/* Delta badge */}
                          {row.delta !== 0 && (
                            <span style={{
                              flexShrink: 0,
                              fontSize: 9, fontWeight: 800,
                              fontFamily: "'DM Mono', monospace",
                              color: improved ? '#15803D' : '#DC2626',
                            }}>
                              {row.delta > 0 ? '+' : ''}{row.delta}
                            </span>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )
              )}

              {/* Footer hint */}
              <div style={{
                fontSize: 10, color: '#8B87AD', marginTop: 12,
                padding: '6px 8px', background: '#FAFAFE', borderRadius: 6, lineHeight: 1.5,
              }}>
                {tab === 'now'
                  ? 'Lower is better. Workload penalties update live; scope/placement penalties need a re-solve.'
                  : 'Trend snapshots are captured on every fix, auto-fix, and re-optimise action.'}
              </div>
            </div>
          </div>
        </>
      )}
    </span>
  )
}

// ── Tab button sub-component ─────────────────────────────
function TabBtn({
  active, onClick, icon, label, disabled, title,
}: {
  active: boolean; onClick: () => void
  icon: React.ReactNode; label: string
  disabled?: boolean; title?: string
}) {
  return (
    <button
      onClick={disabled ? undefined : onClick}
      title={title}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 4,
        padding: '3px 10px', borderRadius: 6,
        background: active ? '#7C6FE0' : 'transparent',
        color: active ? '#fff' : disabled ? '#C4C0E0' : '#7C6FE0',
        border: active ? 'none' : '1px solid #ECEAFB',
        fontSize: 10, fontWeight: 700, cursor: disabled ? 'default' : 'pointer',
        fontFamily: 'inherit', letterSpacing: '0.04em',
        opacity: disabled && !active ? 0.5 : 1,
      }}
    >
      {icon}{label}
    </button>
  )
}
