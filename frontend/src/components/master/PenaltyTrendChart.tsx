/**
 * PenaltyTrendChart — compact sparkline showing score evolution as
 * the user applies fixes. Each tick is one penalty score snapshot.
 *
 * Lower score = better, so the line trending DOWN is good.
 * Color gradient applied per segment: red → amber → green based on
 * the trend direction.
 *
 * v2: hover-to-inspect — each dot is interactive. Hovering reveals a
 * floating tooltip with score, event label, per-point delta, and
 * position. An invisible larger hit-target circle sits over each dot
 * so small dots are easy to hover.
 *
 * Self-contained SVG, no charting library, no external deps.
 */

import { useState } from 'react'
import { TrendingDown, TrendingUp, Minus } from 'lucide-react'

export interface ScorePoint {
  /** Cumulative score at this point */
  score: number
  /** Optional event label ("initial", "fix", "auto-fix", "reoptimize", etc.) */
  event?: string
  /** Optional human-readable timestamp ("Just now", "2s ago") */
  label?: string
  /** Per-constraint penalty totals at this snapshot — drives breakdown trend. */
  breakdown?: Record<string, number>
}

interface Props {
  history: ScorePoint[]
  width?: number
  height?: number
}

const EVENT_LABEL: Record<string, string> = {
  'initial':    'Initial solve',
  'fix':        'Manual fix',
  'auto-fix':   'Auto-fix',
  'reoptimize': 'Re-optimize',
}

function eventLabel(e?: string) {
  if (!e) return 'Update'
  return EVENT_LABEL[e] ?? e
}

export function PenaltyTrendChart({ history, width = 220, height = 44 }: Props) {
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null)
  const [tooltipPos, setTooltipPos] = useState<{ x: number; y: number }>({ x: 0, y: 0 })

  if (history.length < 2) {
    // Not enough data — show a neutral placeholder
    return (
      <div style={{
        display: 'flex', alignItems: 'center', gap: 6,
        padding: '4px 10px', borderRadius: 6,
        background: '#F8F7FF', border: '1px solid #ECEAFB',
        fontSize: 10, color: '#8B87AD',
      }}>
        <Minus size={11} />
        <span>Trend appears after first fix</span>
      </div>
    )
  }

  const pad = 6
  const innerW = width - pad * 2
  const innerH = height - pad * 2
  const scores = history.map(p => p.score)
  const minScore = Math.min(...scores)
  const maxScore = Math.max(...scores)
  const range = Math.max(1, maxScore - minScore)

  const xFor = (i: number) =>
    pad + (history.length === 1 ? innerW / 2 : (i / (history.length - 1)) * innerW)
  const yFor = (score: number) =>
    pad + innerH - ((score - minScore) / range) * innerH

  // Build path
  let path = ''
  history.forEach((p, i) => {
    const x = xFor(i)
    const y = yFor(p.score)
    path += (i === 0 ? `M ${x.toFixed(1)} ${y.toFixed(1)}` : ` L ${x.toFixed(1)} ${y.toFixed(1)}`)
  })

  const first = history[0].score
  const last  = history[history.length - 1].score
  const delta = last - first
  const trendTone = delta < 0 ? '#16A34A' : delta > 0 ? '#DC2626' : '#7C6FE0'
  const trendIcon = delta < 0
    ? <TrendingDown size={12} color="#16A34A" />
    : delta > 0
      ? <TrendingUp size={12} color="#DC2626" />
      : <Minus size={12} color="#7C6FE0" />

  // Hovered point metadata
  const hoveredPoint  = hoveredIdx !== null ? history[hoveredIdx] : null
  const prevPoint     = hoveredIdx !== null && hoveredIdx > 0 ? history[hoveredIdx - 1] : null
  const pointDelta    = hoveredPoint && prevPoint ? hoveredPoint.score - prevPoint.score : null

  return (
    <>
      <div style={{
        display: 'inline-flex', alignItems: 'center', gap: 10,
        padding: '6px 12px', borderRadius: 8,
        background: '#FAFAFE', border: '1px solid #ECEAFB',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          {trendIcon}
          <span style={{
            fontSize: 10.5, fontWeight: 800, color: trendTone,
            fontFamily: "'DM Mono', monospace", letterSpacing: '0.02em',
          }}>
            {delta > 0 ? '+' : ''}{delta}
          </span>
        </div>

        <svg
          width={width} height={height}
          style={{ display: 'block', overflow: 'visible' }}
          onMouseLeave={() => setHoveredIdx(null)}
        >
          {/* Gradient: red→green based on trend */}
          <defs>
            <linearGradient id="trend-area" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%"   stopColor={trendTone} stopOpacity="0.18" />
              <stop offset="100%" stopColor={trendTone} stopOpacity="0" />
            </linearGradient>
          </defs>

          {/* Filled area */}
          <path
            d={`${path} L ${xFor(history.length - 1).toFixed(1)} ${(pad + innerH).toFixed(1)} L ${xFor(0).toFixed(1)} ${(pad + innerH).toFixed(1)} Z`}
            fill="url(#trend-area)"
          />

          {/* Trend line */}
          <path d={path} fill="none" stroke={trendTone} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />

          {/* Vertical crosshair on hover */}
          {hoveredIdx !== null && (
            <line
              x1={xFor(hoveredIdx)} y1={pad}
              x2={xFor(hoveredIdx)} y2={pad + innerH}
              stroke={trendTone} strokeWidth="1" strokeDasharray="2 2" opacity="0.5"
            />
          )}

          {/* Dots — visible circles + invisible larger hit-targets */}
          {history.map((p, i) => {
            const cx = xFor(i)
            const cy = yFor(p.score)
            const isLast    = i === history.length - 1
            const isFirst   = i === 0
            const isHovered = i === hoveredIdx
            const r = isHovered ? 4.5 : isLast ? 3.5 : isFirst ? 3 : 2

            return (
              <g key={i}>
                {/* Visible dot */}
                <circle
                  cx={cx} cy={cy}
                  r={r}
                  fill={isLast || isHovered ? trendTone : '#fff'}
                  stroke={trendTone}
                  strokeWidth={isHovered ? 2 : 1.5}
                  style={{ transition: 'r 0.1s, stroke-width 0.1s' }}
                />
                {/* Invisible hit-target (12 px radius for easy hover) */}
                <circle
                  cx={cx} cy={cy} r={12}
                  fill="transparent"
                  style={{ cursor: 'crosshair' }}
                  onMouseEnter={e => {
                    setHoveredIdx(i)
                    setTooltipPos({ x: e.clientX, y: e.clientY })
                  }}
                  onMouseMove={e => {
                    setTooltipPos({ x: e.clientX, y: e.clientY })
                  }}
                />
              </g>
            )
          })}
        </svg>

        <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, color: '#4B5275' }}>
          <span style={{ fontFamily: "'DM Mono', monospace", color: '#8B87AD' }}>{first}</span>
          <span>→</span>
          <span style={{ fontFamily: "'DM Mono', monospace", fontWeight: 700, color: trendTone }}>{last}</span>
        </div>
      </div>

      {/* Floating tooltip — rendered outside the chart container so it can
          escape overflow:hidden parents and sit above everything */}
      {hoveredPoint && (
        <div
          style={{
            position: 'fixed',
            left: tooltipPos.x + 14,
            top:  tooltipPos.y - 10,
            zIndex: 10001,
            pointerEvents: 'none',
            background: '#13111E',
            color: '#fff',
            borderRadius: 10,
            padding: '8px 12px',
            minWidth: 140,
            fontFamily: "'Hanken Grotesk', sans-serif",
            boxShadow: '0 6px 20px rgba(19,17,30,0.4)',
          }}
        >
          {/* Score value */}
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginBottom: 4 }}>
            <span style={{
              fontSize: 20, fontWeight: 900,
              fontFamily: "'DM Mono', monospace",
              color: trendTone, letterSpacing: '-0.5px',
            }}>
              {hoveredPoint.score}
            </span>
            <span style={{ fontSize: 9, color: '#8B87AD', fontWeight: 600 }}>pts</span>
            {pointDelta !== null && (
              <span style={{
                marginLeft: 'auto',
                fontSize: 11, fontWeight: 800,
                fontFamily: "'DM Mono', monospace",
                color: pointDelta < 0 ? '#4ADE80' : pointDelta > 0 ? '#F87171' : '#A78BFA',
              }}>
                {pointDelta > 0 ? '+' : ''}{pointDelta}
              </span>
            )}
          </div>

          {/* Event label */}
          <div style={{
            fontSize: 10, fontWeight: 700, letterSpacing: '0.1em',
            textTransform: 'uppercase' as const, color: '#A78BFA', marginBottom: 2,
          }}>
            {eventLabel(hoveredPoint.event)}
          </div>

          {/* Position indicator */}
          <div style={{ fontSize: 9.5, color: '#64748B' }}>
            Point {(hoveredIdx ?? 0) + 1} of {history.length}
            {hoveredPoint.label ? ` · ${hoveredPoint.label}` : ''}
          </div>
        </div>
      )}
    </>
  )
}
