/**
 * OptionalBlockView — block-centric timetable view.
 *
 * Lists every Optional Block as a card showing:
 *   - Block name, day + period slot
 *   - Sections sharing this block (cross-section pooling)
 *   - Per-option table: Subject • Teacher • Room • Capacity • Allocated
 *   - Utilization summary + capacity warnings
 */

import { useMemo, useState } from 'react'
import type { OptionalBlock, SubjectCombination, Period, Staff, ClassTimetable } from '@/types'
import { getSubjectColor } from '@/lib/orgData'
import { Calendar, Users2, MapPin, AlertTriangle, CheckCircle2, Layers, Sparkles } from 'lucide-react'
import { WhatIfModal } from './WhatIfModal'

const DAY_LABEL: Record<string, string> = {
  MONDAY: 'Mon', TUESDAY: 'Tue', WEDNESDAY: 'Wed',
  THURSDAY: 'Thu', FRIDAY: 'Fri', SATURDAY: 'Sat', SUNDAY: 'Sun',
}

interface Props {
  optionalBlocks: OptionalBlock[]
  subjectCombinations: SubjectCombination[]
  periods: Period[]
  // Phase 5 — optional props for What-If simulator
  classTT?: ClassTimetable
  staff?: Staff[]
  workDays?: string[]
}

export function OptionalBlockView({ optionalBlocks, subjectCombinations, periods, classTT, staff, workDays }: Props) {
  const [whatIfBlock, setWhatIfBlock] = useState<OptionalBlock | null>(null)
  const periodById = useMemo(() => {
    const m = new Map<string, Period>()
    periods.forEach(p => m.set(p.id, p))
    return m
  }, [periods])

  // For each block, compute the sum of combination strengths whose className
  // matches a section in this block — used as "expected demand" estimate.
  const computeDemand = (b: OptionalBlock) =>
    subjectCombinations
      .filter(c => b.sectionNames.some(sn => sn === c.className || sn.startsWith(c.className)))
      .reduce((sum, c) => sum + (c.strength ?? 0), 0)

  if (optionalBlocks.length === 0) {
    return (
      <div style={{ flex: 1, background: '#fff', borderRadius: 12, padding: '60px 24px', textAlign: 'center' }}>
        <div style={{ width: 64, height: 64, borderRadius: 16, background: '#EDE9FF', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginBottom: 14 }}>
          <Layers size={28} color="#7C6FE0" />
        </div>
        <h3 style={{ fontFamily: "'Fraunces', serif", fontSize: 20, color: '#13111E', margin: 0, marginBottom: 6 }}>
          No Optional Blocks yet
        </h3>
        <div style={{ fontSize: 12, color: '#8B87AD', maxWidth: 380, margin: '0 auto', lineHeight: 1.6 }}>
          Create blocks in the wizard's <strong style={{ color: '#7C6FE0' }}>Optional Blocks</strong> step to schedule parallel subjects in the same period.
        </div>
      </div>
    )
  }

  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: 4 }}>
      <div data-app-shell="block-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(420px, 1fr))', gap: 14 }}>
        {optionalBlocks.map(block => {
          const totalCap = block.options.reduce((s, o) => s + (o.capacity ?? 0), 0)
          const totalAlloc = block.options.reduce((s, o) => s + (o.allocatedStrength ?? 0), 0)
          const demand = computeDemand(block)
          const period = periodById.get(block.periodId)
          const utilization = totalCap > 0 ? Math.round((Math.max(totalAlloc, demand) / totalCap) * 100) : 0
          const isOverflow = totalCap > 0 && demand > totalCap

          return (
            <div key={block.id} style={{
              background: '#fff', border: '1px solid #E8E4FF',
              borderRadius: 12, overflow: 'hidden',
              boxShadow: '0 1px 3px rgba(124,111,224,0.06)',
            }}>
              {/* Header */}
              <div style={{
                background: 'linear-gradient(135deg, #EDE9FF 0%, #F5F2FF 100%)',
                padding: '12px 16px', borderBottom: '1px solid #E8E4FF',
              }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                  <div style={{ width: 32, height: 32, borderRadius: 8, background: '#7C6FE0', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <Layers size={16} color="#fff" />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 800, color: '#13111E', letterSpacing: '-0.3px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {block.name}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 4, fontSize: 11, color: '#4B5275' }}>
                      <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        <Calendar size={11} /> {DAY_LABEL[block.day] ?? block.day} · {period?.name ?? '—'}
                      </span>
                      <span style={{ color: '#D8D2FF' }}>·</span>
                      <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        <Users2 size={11} /> {block.sectionNames.length} section{block.sectionNames.length !== 1 ? 's' : ''}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Sections sharing this block */}
                {block.sectionNames.length > 0 && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 10 }}>
                    {block.sectionNames.map(sn => (
                      <span key={sn} style={{
                        padding: '2px 8px', borderRadius: 12, fontSize: 10, fontWeight: 700,
                        background: '#fff', color: '#7C6FE0', border: '1px solid #D8D2FF',
                        letterSpacing: '0.03em',
                      }}>
                        {sn}
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {/* Options table */}
              <div style={{ padding: '12px 16px' }}>
                <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#8B87AD', marginBottom: 8 }}>
                  Parallel Options ({block.options.length})
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {block.options.map((opt, i) => {
                    const optCC = getSubjectColor(opt.subject || ' ')
                    const cap = opt.capacity ?? 0
                    const allocated = opt.allocatedStrength ?? 0
                    const optOver = cap > 0 && allocated > cap
                    return (
                      <div key={i} className={optCC} style={{
                        borderRadius: 7, padding: '8px 10px',
                        display: 'flex', alignItems: 'center', gap: 10,
                      }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 12, fontWeight: 800, lineHeight: 1.2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {opt.subject || <span style={{ opacity: 0.4 }}>(unset)</span>}
                          </div>
                          <div style={{ fontSize: 9.5, opacity: 0.7, marginTop: 2, display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                            {opt.teacher && <span>👤 {opt.teacher}</span>}
                            {opt.room && <span style={{ fontFamily: "'DM Mono', monospace" }}>→ {opt.room}</span>}
                          </div>
                        </div>
                        {cap > 0 && (
                          <div style={{
                            fontSize: 10, fontWeight: 700, fontFamily: "'DM Mono', monospace",
                            padding: '3px 8px', borderRadius: 12,
                            background: optOver ? '#FEE2E2' : 'rgba(255,255,255,0.6)',
                            color: optOver ? '#991B1B' : 'inherit',
                            whiteSpace: 'nowrap' as const,
                          }}>
                            {allocated}/{cap}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>

              {/* Footer summary */}
              <div style={{
                padding: '10px 16px', borderTop: '1px solid #E8E4FF',
                background: '#FAFAFE',
                display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' as const,
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: '#4B5275' }}>
                  <MapPin size={11} />
                  <span>Capacity: <strong style={{ color: '#13111E', fontFamily: "'DM Mono', monospace" }}>{totalCap || '—'}</strong></span>
                </div>
                {demand > 0 && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: '#4B5275' }}>
                    <Users2 size={11} />
                    <span>Demand: <strong style={{ color: '#13111E', fontFamily: "'DM Mono', monospace" }}>{demand}</strong></span>
                  </div>
                )}
                {totalCap > 0 && (
                  <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6 }}>
                    {isOverflow ? (
                      <>
                        <AlertTriangle size={12} color="#DC2626" />
                        <span style={{ fontSize: 10, fontWeight: 700, color: '#991B1B' }}>
                          OVER CAPACITY ({utilization}%)
                        </span>
                      </>
                    ) : (
                      <>
                        <CheckCircle2 size={12} color="#16A34A" />
                        <span style={{ fontSize: 10, fontWeight: 700, color: '#15803D' }}>
                          {utilization}% utilized
                        </span>
                      </>
                    )}
                  </div>
                )}
              </div>

              {/* Utilization bar */}
              {totalCap > 0 && (
                <div style={{ height: 4, background: '#F5F2FF' }}>
                  <div style={{
                    height: '100%',
                    width: `${Math.min(100, utilization)}%`,
                    background: isOverflow ? 'linear-gradient(90deg, #DC2626, #991B1B)' : 'linear-gradient(90deg, #7C6FE0, #9B8EF5)',
                    transition: 'width 0.3s',
                  }} />
                </div>
              )}

              {/* What-If button */}
              {classTT && staff && workDays && (
                <div style={{ padding: '10px 14px', borderTop: '1px solid #E8E4FF', background: '#fff' }}>
                  <button
                    onClick={() => setWhatIfBlock(block)}
                    style={{
                      width: '100%', padding: '8px 12px', borderRadius: 8,
                      border: '1px solid #D8D2FF', background: 'linear-gradient(135deg, #EDE9FF 0%, #FAFAFE 100%)',
                      color: '#7C6FE0', fontSize: 11.5, fontWeight: 700, cursor: 'pointer',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7,
                      letterSpacing: '0.02em',
                    }}>
                    <Sparkles size={12} /> Run What-If Simulation
                  </button>
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* What-If modal */}
      {whatIfBlock && classTT && staff && workDays && (
        <WhatIfModal
          block={whatIfBlock}
          subjectCombinations={subjectCombinations}
          classTT={classTT}
          staff={staff}
          periods={periods}
          workDays={workDays}
          onClose={() => setWhatIfBlock(null)}
        />
      )}
    </div>
  )
}
