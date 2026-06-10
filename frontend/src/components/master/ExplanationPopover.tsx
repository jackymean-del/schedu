/**
 * ExplanationPopover — UI for the AI Explanation System.
 *
 * Compact popover that surfaces every factor the explanation engine
 * derived for a (teacher, section, subject) assignment. Two surface
 * shapes:
 *
 *   <ExplanationInfoIcon explanation={...} />  inline 14px info icon
 *                                              with hover/click popover
 *   <ExplanationCard explanation={...} />      full inline card for
 *                                              modals
 */

import { useState } from 'react'
import { Info, CheckCircle2, XCircle, Sparkles } from 'lucide-react'
import type { AssignmentExplanation, ExplanationFactor } from '@/lib/explanationEngine'
import { categoryLabel, categoryColor } from '@/lib/explanationEngine'

// ─── Compact info icon — clickable for popover ───
export function ExplanationInfoIcon({
  explanation, anchor = 'top-right',
}: {
  explanation: AssignmentExplanation
  anchor?: 'top-right' | 'top-left'
}) {
  const [open, setOpen] = useState(false)
  if (!explanation || explanation.factors.length === 0) return null

  const score = explanation.score
  const tone =
    score >= 80 ? '#16A34A' :
    score >= 40 ? '#7C6FE0' :
    score >= 0  ? '#D4920E' : '#DC2626'

  return (
    <span style={{ position: 'relative' as const, display: 'inline-flex' }}>
      <button
        onClick={e => { e.stopPropagation(); setOpen(v => !v) }}
        title="Why this assignment?"
        style={{
          background: 'transparent', border: 'none', padding: 2,
          cursor: 'pointer', color: tone, display: 'inline-flex',
          alignItems: 'center', opacity: 0.6,
          transition: 'opacity 0.12s',
        }}
        onMouseEnter={e => (e.currentTarget as HTMLButtonElement).style.opacity = '1'}
        onMouseLeave={e => (e.currentTarget as HTMLButtonElement).style.opacity = '0.6'}
      >
        <Info size={12} />
      </button>
      {open && (
        <>
          <div onClick={() => setOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 9998 }} />
          <div
            onClick={e => e.stopPropagation()}
            style={{
              position: 'absolute' as const,
              ...(anchor === 'top-right' ? { right: 0, top: '100%', marginTop: 4 } : { left: 0, top: '100%', marginTop: 4 }),
              zIndex: 9999,
              minWidth: 320, maxWidth: 380,
              background: '#fff',
              border: '1px solid #ECEAFB',
              borderRadius: 12,
              boxShadow: '0 14px 38px rgba(19,17,30,0.18)',
              padding: 0,
              fontFamily: "'Hanken Grotesk', sans-serif",
              textAlign: 'left' as const,
            }}>
            <ExplanationCard explanation={explanation} compact />
          </div>
        </>
      )}
    </span>
  )
}

// ─── Full card ───
export function ExplanationCard({
  explanation, compact = false,
}: {
  explanation: AssignmentExplanation
  compact?: boolean
}) {
  const { teacher, section, subject, factors, summary, score, recommended } = explanation

  const tone =
    score >= 80 ? '#16A34A' :
    score >= 40 ? '#7C6FE0' :
    score >= 0  ? '#D4920E' : '#DC2626'

  return (
    <div>
      {/* Header */}
      <div style={{
        padding: compact ? '10px 14px' : '14px 16px',
        borderBottom: '1px solid #F3F1FF',
        background: 'linear-gradient(135deg, #EDE9FF 0%, #FAFAFE 100%)',
        borderRadius: '12px 12px 0 0',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
          <Sparkles size={12} color="#7C6FE0" />
          <span style={{
            fontSize: 9, fontWeight: 800, letterSpacing: '0.16em',
            textTransform: 'uppercase' as const, color: '#7C6FE0',
          }}>
            Why this assignment?
          </span>
        </div>
        <div style={{ fontSize: compact ? 13 : 14, fontWeight: 900, color: '#13111E', letterSpacing: '-0.3px' }}>
          {teacher}
        </div>
        <div style={{ fontSize: 11, color: '#4B5275', marginTop: 2 }}>
          {subject} · {section}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 8 }}>
          {recommended ? (
            <CheckCircle2 size={12} color="#16A34A" />
          ) : (
            <XCircle size={12} color="#D4920E" />
          )}
          <span style={{ fontSize: 11, color: tone, fontWeight: 700 }}>
            {recommended ? 'Recommended' : 'Acceptable but not optimal'}
          </span>
          <span style={{ flex: 1 }} />
          <span style={{
            padding: '2px 8px', borderRadius: 10,
            background: `${tone}1A`, color: tone, border: `1px solid ${tone}33`,
            fontSize: 10, fontWeight: 800,
            fontFamily: "'DM Mono', monospace",
          }}>
            score {score > 0 ? '+' : ''}{score}
          </span>
        </div>
        <div style={{ fontSize: 11.5, color: '#13111E', marginTop: 8, fontStyle: 'italic' as const, lineHeight: 1.5 }}>
          “{summary}”
        </div>
      </div>

      {/* Factors */}
      <div style={{
        padding: compact ? '8px 14px 12px' : '12px 16px 16px',
        maxHeight: 260, overflowY: 'auto' as const,
      }}>
        <div style={{
          fontSize: 9, fontWeight: 800, letterSpacing: '0.12em',
          textTransform: 'uppercase' as const, color: '#8B87AD', marginBottom: 8,
        }}>
          Reasoning factors ({factors.length})
        </div>
        <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 5 }}>
          {factors.map((f, i) => (
            <FactorRow key={i} factor={f} />
          ))}
        </div>
      </div>
    </div>
  )
}

function FactorRow({ factor }: { factor: ExplanationFactor }) {
  const color = categoryColor(factor.category)
  return (
    <div style={{
      display: 'flex', alignItems: 'flex-start', gap: 8,
      padding: '6px 8px', background: '#FAFAFE',
      border: '1px solid #F3F1FF', borderRadius: 7,
    }}>
      <span style={{
        flexShrink: 0, marginTop: 1,
        minWidth: 72, textAlign: 'center' as const,
        padding: '2px 6px', borderRadius: 4,
        fontSize: 8.5, fontWeight: 800, letterSpacing: '0.04em',
        background: color.bg, color: color.fg,
      }}>
        {categoryLabel(factor.category)}
      </span>
      <span style={{ flex: 1, minWidth: 0, fontSize: 11, color: '#13111E', lineHeight: 1.5 }}>
        {factor.positive ? '✓ ' : '× '}{factor.reason}
      </span>
      <span style={{
        flexShrink: 0,
        fontSize: 10, fontWeight: 700,
        fontFamily: "'DM Mono', monospace",
        color: factor.positive ? '#16A34A' : '#DC2626',
      }}>
        {factor.weight > 0 ? `+${factor.weight}` : factor.weight}
      </span>
    </div>
  )
}
