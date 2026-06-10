/**
 * DLGCellIcon — small icon on a timetable cell that's part of a
 * Dynamic Learning Group (cross-class pooled / parallel-options block).
 *
 * Click → popover showing:
 *   - "Part of Block X" (slot context)
 *   - Sections sharing this DLG
 *   - All parallel options at this slot (subject + teacher + room)
 *   - Per-option capacity status when room cap is known
 *
 * Same UX pattern as ExplanationInfoIcon / BlockedSlotIcon.
 */

import { useState } from 'react'
import { Layers } from 'lucide-react'
import type { DynamicLearningGroup } from '@/lib/schedulingEngine'
import { getSubjectColor } from '@/lib/orgData'

/** Build O(1) lookup: section|day|periodId → DLGs at that slot
 *  (multiple DLGs share a slot when they're parallel options) */
export function buildDLGMap(
  dlgs: DynamicLearningGroup[],
): Map<string, DynamicLearningGroup[]> {
  const m = new Map<string, DynamicLearningGroup[]>()
  dlgs.forEach(d => {
    d.sectionNames.forEach(sec => {
      const key = `${sec}|${d.day}|${d.periodId}`
      const arr = m.get(key) ?? []
      arr.push(d)
      m.set(key, arr)
    })
  })
  return m
}

const BEHAVIOR_LABEL: Record<string, string> = {
  NO_GROUPING:         'Isolated',
  SAME_GRADE_ONLY:     'Same grade',
  CROSS_GRADE_ALLOWED: 'Cross grade',
  FLEXIBLE_GROUPING:   'Flexible',
}

interface Props {
  /** All DLGs that share this slot (across the participating section). */
  dlgs: DynamicLearningGroup[]
  /** The current cell's subject, so we can mark which DLG IS this cell. */
  currentSubject?: string
  /** Optional rooms list for capacity gauges. */
  rooms?: Array<{ actualName?: string; generatedName?: string; name?: string; capacity?: number }>
}

export function DLGCellIcon({ dlgs, currentSubject, rooms = [] }: Props) {
  const [open, setOpen] = useState(false)
  if (!dlgs || dlgs.length === 0) return null

  const roomCapByName = new Map<string, number>()
  rooms.forEach(r => {
    const name = r.actualName ?? r.name ?? r.generatedName
    if (name && r.capacity && r.capacity > 0) roomCapByName.set(name, r.capacity)
  })

  // Block context — first DLG's slot info, all sections aggregated
  const allSections = Array.from(new Set(dlgs.flatMap(d => d.sectionNames))).sort()
  const isCapSplit = dlgs.some(d => d.behavior.includes('+cap-split'))

  return (
    <span style={{ position: 'relative' as const, display: 'inline-flex' }}>
      <button
        onClick={e => { e.stopPropagation(); setOpen(v => !v) }}
        title="Part of a Dynamic Learning Group"
        style={{
          background: 'transparent', border: 'none', padding: 0,
          cursor: 'pointer', color: '#7C6FE0', display: 'inline-flex',
          alignItems: 'center', opacity: 0.7,
          transition: 'opacity 0.12s, transform 0.12s',
        }}
        onMouseEnter={e => {
          (e.currentTarget as HTMLButtonElement).style.opacity = '1'
          ;(e.currentTarget as HTMLButtonElement).style.transform = 'scale(1.15)'
        }}
        onMouseLeave={e => {
          (e.currentTarget as HTMLButtonElement).style.opacity = '0.7'
          ;(e.currentTarget as HTMLButtonElement).style.transform = 'scale(1)'
        }}
      >
        <Layers size={10} />
      </button>
      {open && (
        <>
          <div onClick={() => setOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 9998 }} />
          <div
            onClick={e => e.stopPropagation()}
            style={{
              position: 'absolute' as const,
              left: '50%', top: '100%',
              transform: 'translateX(-50%)',
              marginTop: 6,
              zIndex: 9999,
              minWidth: 300, maxWidth: 380,
              background: '#fff',
              border: '1px solid #D8D2FF',
              borderRadius: 10,
              boxShadow: '0 14px 38px rgba(19,17,30,0.18)',
              padding: 0,
              fontFamily: "'Hanken Grotesk', sans-serif",
              textAlign: 'left' as const,
            }}>
            {/* Header */}
            <div style={{
              padding: '10px 12px', borderBottom: '1px solid #EDE9FF',
              background: 'linear-gradient(135deg, #EDE9FF 0%, #FAFAFE 100%)',
              borderRadius: '10px 10px 0 0',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                <Layers size={13} color="#7C6FE0" />
                <span style={{
                  fontSize: 9, fontWeight: 800, letterSpacing: '0.14em',
                  textTransform: 'uppercase' as const, color: '#7C6FE0',
                }}>
                  Dynamic Learning Group
                </span>
                {isCapSplit && (
                  <span style={{
                    padding: '1px 6px', borderRadius: 8,
                    background: '#FEF3C7', color: '#92400E', border: '1px solid #FDE68A',
                    fontSize: 8.5, fontWeight: 800, letterSpacing: '0.06em',
                  }}>
                    CAP-SPLIT
                  </span>
                )}
              </div>
              <div style={{ fontSize: 11, color: '#4B5275', marginBottom: 6 }}>
                <strong style={{ color: '#13111E' }}>{allSections.length}</strong> section{allSections.length !== 1 ? 's' : ''} sharing this slot, with <strong style={{ color: '#13111E' }}>{dlgs.length}</strong> parallel option{dlgs.length !== 1 ? 's' : ''}.
              </div>
              {/* Sections row */}
              <div style={{ display: 'flex', flexWrap: 'wrap' as const, gap: 3 }}>
                {allSections.map(s => (
                  <span key={s} style={{
                    padding: '1px 7px', borderRadius: 8, fontSize: 9.5, fontWeight: 700,
                    background: '#fff', color: '#7C6FE0', border: '1px solid #D8D2FF',
                  }}>
                    {s}
                  </span>
                ))}
              </div>
            </div>

            {/* Parallel options */}
            <div style={{ padding: '10px 12px' }}>
              <div style={{
                fontSize: 9, fontWeight: 800, letterSpacing: '0.1em',
                textTransform: 'uppercase' as const, color: '#8B87AD', marginBottom: 6,
              }}>
                Parallel options at this slot
              </div>
              <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 5 }}>
                {dlgs.map(d => {
                  const colorCls = getSubjectColor(d.subject)
                  const isCurrent = currentSubject === d.subject
                  const cap = roomCapByName.get(d.room)
                  const over = cap != null && d.totalStrength > cap
                  const tight = cap != null && !over && d.totalStrength >= cap * 0.9
                  const behaviorBase = d.behavior.split('+')[0]
                  return (
                    <div
                      key={d.id}
                      className={colorCls}
                      style={{
                        borderRadius: 6, padding: '6px 9px',
                        outline: isCurrent ? '2px solid #7C6FE0' : 'none',
                        outlineOffset: -1,
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span style={{ fontSize: 11.5, fontWeight: 800, color: '#13111E', flex: 1 }}>
                          {d.subject}
                          {isCurrent && (
                            <span style={{
                              marginLeft: 6, fontSize: 8.5, fontWeight: 800,
                              padding: '1px 5px', borderRadius: 6,
                              background: '#7C6FE0', color: '#fff', letterSpacing: '0.04em',
                            }}>
                              THIS CELL
                            </span>
                          )}
                        </span>
                        <span style={{
                          padding: '1px 6px', borderRadius: 6,
                          background: 'rgba(255,255,255,0.6)',
                          fontSize: 8.5, fontWeight: 700, color: '#4B5275',
                          letterSpacing: '0.04em', textTransform: 'uppercase' as const,
                        }}>
                          {BEHAVIOR_LABEL[behaviorBase] ?? behaviorBase}
                        </span>
                      </div>
                      <div style={{
                        fontSize: 10, color: '#4B5275', marginTop: 3,
                        display: 'flex', flexWrap: 'wrap' as const, gap: 8,
                      }}>
                        {d.teacher && <span>👤 {d.teacher}</span>}
                        {d.room && (
                          <span style={{ fontFamily: "'DM Mono', monospace" }}>
                            → {d.room}
                          </span>
                        )}
                        <span style={{
                          fontFamily: "'DM Mono', monospace", fontWeight: 700,
                          marginLeft: 'auto',
                          color: over ? '#DC2626' : tight ? '#D4920E' : '#13111E',
                        }}>
                          {d.totalStrength}{cap != null && ` / ${cap}`}
                        </span>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
        </>
      )}
    </span>
  )
}
