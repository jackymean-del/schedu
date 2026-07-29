/**
 * Syllabus alert — the "you don't have to go looking" surface.
 *
 * Renders NOTHING when every tracked syllabus is fine, so it never becomes
 * wallpaper. When something is slipping it names exactly what: subject, class-
 * section, the faculty responsible, how far behind, and whether the cause is
 * lost teaching time (holiday / event / absence) that has to be rescheduled.
 */
import { useMemo } from 'react'
import { lagging, RISK_LABELS } from '@/lib/syllabusTracking'
import { useEffectiveCoverage } from '@/lib/effectiveCoverage'
import { AlertTriangle, ChevronRight } from 'lucide-react'

export function SyllabusAlert({ limit = 4, compact = false }: { limit?: number; compact?: boolean }) {
  // Holidays, uncarried cover and uncovered absences all count against coverage
  // here, via the same composition the Syllabus page uses — the one surface
  // meant to save people from hunting must never be the rosier one.
  const { plans } = useEffectiveCoverage()
  const rows = useMemo(() => lagging(plans), [plans])
  if (rows.length === 0) return null

  const critical = rows.filter(r => r.risk === 'critical').length
  const shown = rows.slice(0, limit)
  const more = rows.length - shown.length

  return (
    <div style={{
      background: '#fff', border: '1px solid #FDE68A', borderLeft: '4px solid #F59E0B',
      borderRadius: 12, padding: compact ? '12px 14px' : '16px 18px', marginBottom: 16,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <AlertTriangle size={15} color="#B45309" />
        <span style={{ fontSize: 13.5, fontWeight: 800, color: '#92400E' }}>
          Syllabus needs attention
        </span>
        <span style={{ fontSize: 11.5, color: '#B45309' }}>
          {rows.length} subject{rows.length > 1 ? 's' : ''} slipping
          {critical > 0 && <> · <strong>{critical} needing rescheduling</strong></>}
        </span>
        <div style={{ flex: 1 }} />
        <a href="/syllabus" style={{
          display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 11.5, fontWeight: 700,
          color: '#92400E', textDecoration: 'none', flexShrink: 0,
        }}>
          Open syllabus <ChevronRight size={12} />
        </a>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
        {shown.map(r => (
          <a key={r.key} href="/syllabus" style={{
            display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap',
            padding: '7px 10px', borderRadius: 8, textDecoration: 'none',
            background: r.risk === 'critical' ? '#FFFBEB' : '#FAFAFE',
            border: `1px solid ${r.risk === 'critical' ? '#FDE68A' : '#ECE9FB'}`,
          }}>
            <span style={{ fontSize: 12.5, fontWeight: 700, color: '#13111E' }}>{r.subject}</span>
            <span style={{ fontSize: 11.5, color: '#4B5275' }}>{r.section}</span>
            {r.teacher && <span style={{ fontSize: 11, color: '#8B87AD' }}>· {r.teacher}</span>}
            <div style={{ flex: 1, minWidth: 40 }} />
            {r.lost > 0 && (
              <span style={{ fontSize: 10.5, fontWeight: 700, color: '#B45309', background: '#FEF3C7', borderRadius: 999, padding: '2px 8px' }}>
                {r.lost} h lost
              </span>
            )}
            <span style={{
              fontSize: 10.5, fontWeight: 700, borderRadius: 999, padding: '2px 8px',
              color: r.risk === 'critical' ? '#92400E' : '#4B41C4',
              background: r.risk === 'critical' ? '#FDE68A' : '#EDE9FF',
            }}>
              {RISK_LABELS[r.risk]}
            </span>
            <span style={{ fontSize: 11.5, fontFamily: "'DM Mono', monospace", color: '#4B5275', minWidth: 86, textAlign: 'right' }}>
              {r.pct}% · {r.remaining} h left
            </span>
          </a>
        ))}
      </div>

      {more > 0 && (
        <a href="/syllabus" style={{ display: 'inline-block', marginTop: 8, fontSize: 11.5, color: '#92400E', fontWeight: 700, textDecoration: 'none' }}>
          +{more} more →
        </a>
      )}
    </div>
  )
}
