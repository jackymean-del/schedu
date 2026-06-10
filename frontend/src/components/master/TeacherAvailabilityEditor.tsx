/**
 * TeacherAvailabilityEditor — pre-solve per-teacher slot availability matrix.
 *
 * Three-state toggle for each (day × period) cell:
 *   ○ available  — default, no entry stored (white)
 *   ★ preferred  — soft bonus: solver prefers scheduling here (green)
 *   ✕ blocked    — hard constraint: solver NEVER places a lesson here (red)
 *
 * Clicking cycles: available → preferred → blocked → available.
 * Shift+click on a day header  → toggle-block the entire column.
 * Shift+click on a period label → toggle-block the entire row.
 *
 * Left sidebar lists all teachers; status chips show how many slots
 * each has in each state.
 *
 * Changes are written directly to the Zustand store via
 * setTeacherAvailability / setTeacherSlotStatus / clearTeacherAvailability.
 * No explicit save step needed.
 */

import { useState, useMemo, useCallback } from 'react'
import type { Staff, Period, TeacherAvailability, SlotStatus } from '@/types'
import { useTimetableStore } from '@/store/timetableStore'
import {
  X, Star, Ban, Circle, RotateCcw, Users2,
  ChevronLeft, ChevronRight,
} from 'lucide-react'

// ─── Props ────────────────────────────────────────────────

interface Props {
  staff: Staff[]
  periods: Period[]
  workDays: string[]
  onClose: () => void
}

// ─── Colour system ────────────────────────────────────────

const STATUS_STYLE: Record<SlotStatus, { bg: string; border: string; text: string; icon: React.ReactNode }> = {
  available: {
    bg: '#FAFAFE',
    border: '#ECEAFB',
    text: '#8B87AD',
    icon: <Circle size={10} />,
  },
  preferred: {
    bg: '#F0FDF4',
    border: '#86EFAC',
    text: '#15803D',
    icon: <Star size={10} />,
  },
  blocked: {
    bg: '#FEF2F2',
    border: '#FECACA',
    text: '#991B1B',
    icon: <Ban size={10} />,
  },
}

const CYCLE: SlotStatus[] = ['available', 'preferred', 'blocked']
function nextStatus(s: SlotStatus): SlotStatus {
  return CYCLE[(CYCLE.indexOf(s) + 1) % CYCLE.length]
}

const DAY_ABBREV: Record<string, string> = {
  MONDAY: 'Mon', TUESDAY: 'Tue', WEDNESDAY: 'Wed',
  THURSDAY: 'Thu', FRIDAY: 'Fri', SATURDAY: 'Sat', SUNDAY: 'Sun',
}

// ─── Component ────────────────────────────────────────────

export function TeacherAvailabilityEditor({ staff, periods, workDays, onClose }: Props) {
  const {
    teacherAvailability,
    setTeacherSlotStatus,
    clearTeacherAvailability,
  } = useTimetableStore()

  const [selectedTeacherIdx, setSelectedTeacherIdx] = useState(0)
  const selectedTeacher = staff[selectedTeacherIdx]

  const classPeriods = useMemo(
    () => periods.filter(p => p.type !== 'break'),
    [periods],
  )

  // Get slot status for selected teacher
  const getStatus = useCallback((day: string, periodId: string): SlotStatus => {
    return teacherAvailability[selectedTeacher?.name]?.[day]?.[periodId] ?? 'available'
  }, [teacherAvailability, selectedTeacher])

  const handleSlotClick = useCallback((day: string, periodId: string, shiftKey: boolean) => {
    if (!selectedTeacher) return
    if (shiftKey) {
      // Shift+click slot → toggle-block entire day column
      const allBlocked = classPeriods.every(p => getStatus(day, p.id) === 'blocked')
      classPeriods.forEach(p => {
        setTeacherSlotStatus(selectedTeacher.name, day, p.id, allBlocked ? 'available' : 'blocked')
      })
      return
    }
    const current = getStatus(day, periodId)
    setTeacherSlotStatus(selectedTeacher.name, day, periodId, nextStatus(current))
  }, [selectedTeacher, classPeriods, getStatus, setTeacherSlotStatus])

  const handlePeriodRowClick = useCallback((periodId: string, shiftKey: boolean) => {
    if (!selectedTeacher || !shiftKey) return
    // Shift+click period label → toggle-block entire row
    const allBlocked = workDays.every(day => getStatus(day, periodId) === 'blocked')
    workDays.forEach(day => {
      setTeacherSlotStatus(selectedTeacher.name, day, periodId, allBlocked ? 'available' : 'blocked')
    })
  }, [selectedTeacher, workDays, getStatus, setTeacherSlotStatus])

  const handleDayHeaderClick = useCallback((day: string, shiftKey: boolean) => {
    if (!selectedTeacher || !shiftKey) return
    const allBlocked = classPeriods.every(p => getStatus(day, p.id) === 'blocked')
    classPeriods.forEach(p => {
      setTeacherSlotStatus(selectedTeacher.name, day, p.id, allBlocked ? 'available' : 'blocked')
    })
  }, [selectedTeacher, classPeriods, getStatus, setTeacherSlotStatus])

  // Per-teacher summary counts for sidebar chips
  const teacherSummary = useMemo(() => {
    return staff.map(t => {
      const tData = teacherAvailability[t.name] ?? {}
      let preferred = 0, blocked = 0
      Object.values(tData).forEach((dayMap) =>
        Object.values(dayMap).forEach((s) => {
          if (s === 'preferred') preferred++
          if (s === 'blocked') blocked++
        })
      )
      return { name: t.name, preferred, blocked }
    })
  }, [staff, teacherAvailability])

  // Available slots count for the selected teacher
  const availableCount = useMemo(() => {
    if (!selectedTeacher) return 0
    const totalClassSlots = classPeriods.length * workDays.length
    const tData = teacherAvailability[selectedTeacher.name] ?? {}
    const blockedCount = Object.values(tData).reduce(
      (a, dayMap) => a + Object.values(dayMap).filter(s => s === 'blocked').length, 0
    )
    return totalClassSlots - blockedCount
  }, [selectedTeacher, teacherAvailability, classPeriods, workDays])

  const maxWeeklyLoad = (selectedTeacher as any)?.maxPeriodsPerWeek ?? 40
  const loadOk = availableCount >= maxWeeklyLoad

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: 'fixed', inset: 0, zIndex: 9200,
          background: 'rgba(19,17,30,0.45)',
          backdropFilter: 'blur(2px)',
        }}
      />

      {/* Modal */}
      <div
        onClick={e => e.stopPropagation()}
        style={{
          position: 'fixed',
          top: '50%', left: '50%',
          transform: 'translate(-50%, -50%)',
          zIndex: 9201,
          width: 'min(97vw, 920px)',
          maxHeight: '92vh',
          background: '#fff',
          borderRadius: 20,
          boxShadow: '0 32px 80px rgba(19,17,30,0.3), 0 4px 16px rgba(124,111,224,0.12)',
          display: 'flex', flexDirection: 'column',
          fontFamily: "'Hanken Grotesk', sans-serif",
          overflow: 'hidden',
        }}
      >
        {/* ─── Header ─── */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 12,
          padding: '14px 20px 12px',
          borderBottom: '1px solid #ECEAFB',
          flexShrink: 0,
        }}>
          <div style={{
            width: 34, height: 34, borderRadius: 10,
            background: '#EDE9FF', color: '#7C6FE0',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <Users2 size={16} />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 14, fontWeight: 800, color: '#13111E', letterSpacing: '-0.2px' }}>
              Teacher Availability
            </div>
            <div style={{ fontSize: 10.5, color: '#8B87AD', marginTop: 1 }}>
              Click to cycle: available → preferred → blocked  ·  Shift+click header/label to toggle entire column or row
            </div>
          </div>
          {/* Legend */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginRight: 8 }}>
            {(Object.entries(STATUS_STYLE) as [SlotStatus, typeof STATUS_STYLE[SlotStatus]][]).map(([s, st]) => (
              <span key={s} style={{
                display: 'inline-flex', alignItems: 'center', gap: 5,
                padding: '3px 9px', borderRadius: 12,
                background: st.bg, border: `1px solid ${st.border}`,
                fontSize: 10, fontWeight: 700, color: st.text,
              }}>
                {st.icon} {s.charAt(0).toUpperCase() + s.slice(1)}
              </span>
            ))}
          </div>
          <button
            onClick={onClose}
            style={{
              width: 30, height: 30, borderRadius: 8,
              border: '1px solid #ECEAFB', background: '#FAFAFE',
              color: '#8B87AD', cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >
            <X size={14} />
          </button>
        </div>

        {/* ─── Body ─── */}
        <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>

          {/* Teacher sidebar */}
          <div style={{
            width: 200, flexShrink: 0,
            borderRight: '1px solid #ECEAFB',
            overflowY: 'auto',
            padding: '10px 8px',
            background: '#FAFAFE',
          }}>
            <div style={{
              fontSize: 9, fontWeight: 800, letterSpacing: '0.14em',
              textTransform: 'uppercase', color: '#8B87AD',
              padding: '0 4px 8px',
            }}>
              Teachers ({staff.length})
            </div>
            {staff.map((t, idx) => {
              const sum = teacherSummary[idx]
              const isActive = idx === selectedTeacherIdx
              return (
                <button
                  key={t.name}
                  onClick={() => setSelectedTeacherIdx(idx)}
                  style={{
                    display: 'flex', flexDirection: 'column', gap: 4,
                    width: '100%', padding: '8px 10px', borderRadius: 9,
                    border: `1.5px solid ${isActive ? '#D8D2FF' : 'transparent'}`,
                    background: isActive ? '#EDE9FF' : 'transparent',
                    cursor: 'pointer', textAlign: 'left',
                    marginBottom: 2, fontFamily: 'inherit',
                    transition: 'background 0.1s',
                  }}
                >
                  <span style={{
                    fontSize: 11.5, fontWeight: isActive ? 800 : 600,
                    color: isActive ? '#4C1D95' : '#13111E',
                    lineHeight: 1.2,
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  }}>
                    {t.name}
                  </span>
                  <div style={{ display: 'flex', gap: 4 }}>
                    {sum.preferred > 0 && (
                      <span style={{
                        fontSize: 9, fontWeight: 700, padding: '1px 5px', borderRadius: 8,
                        background: '#DCFCE7', color: '#15803D',
                      }}>
                        ★{sum.preferred}
                      </span>
                    )}
                    {sum.blocked > 0 && (
                      <span style={{
                        fontSize: 9, fontWeight: 700, padding: '1px 5px', borderRadius: 8,
                        background: '#FEE2E2', color: '#991B1B',
                      }}>
                        ✕{sum.blocked}
                      </span>
                    )}
                    {sum.preferred === 0 && sum.blocked === 0 && (
                      <span style={{ fontSize: 9, color: '#C4C0F0' }}>no overrides</span>
                    )}
                  </div>
                </button>
              )
            })}
          </div>

          {/* Grid area */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px', overflowX: 'auto' }}>

            {/* Teacher name + nav + meta strip */}
            <div style={{
              display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14,
              flexWrap: 'wrap',
            }}>
              <button
                onClick={() => setSelectedTeacherIdx(i => Math.max(0, i - 1))}
                disabled={selectedTeacherIdx === 0}
                style={{
                  width: 26, height: 26, borderRadius: 6,
                  border: '1px solid #ECEAFB', background: '#fff',
                  color: '#8B87AD', cursor: selectedTeacherIdx === 0 ? 'default' : 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  opacity: selectedTeacherIdx === 0 ? 0.4 : 1,
                }}
              >
                <ChevronLeft size={12} />
              </button>

              <span style={{ fontSize: 15, fontWeight: 800, color: '#13111E', flex: 1 }}>
                {selectedTeacher?.name ?? '—'}
              </span>

              <button
                onClick={() => setSelectedTeacherIdx(i => Math.min(staff.length - 1, i + 1))}
                disabled={selectedTeacherIdx === staff.length - 1}
                style={{
                  width: 26, height: 26, borderRadius: 6,
                  border: '1px solid #ECEAFB', background: '#fff',
                  color: '#8B87AD', cursor: selectedTeacherIdx === staff.length - 1 ? 'default' : 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  opacity: selectedTeacherIdx === staff.length - 1 ? 0.4 : 1,
                }}
              >
                <ChevronRight size={12} />
              </button>

              {/* Available-slot budget bar */}
              <div style={{
                display: 'flex', alignItems: 'center', gap: 8,
                padding: '5px 11px', borderRadius: 8,
                background: loadOk ? '#DCFCE7' : '#FEF2F2',
                border: `1px solid ${loadOk ? '#BBF7D0' : '#FECACA'}`,
                fontSize: 10.5, fontWeight: 700,
                color: loadOk ? '#15803D' : '#991B1B',
              }}>
                {availableCount} available slots
                <span style={{ opacity: 0.6, fontWeight: 400 }}>/ {maxWeeklyLoad} max/wk</span>
                {!loadOk && <span>⚠ fewer slots than max load</span>}
              </div>

              {/* Clear teacher button */}
              {selectedTeacher && Object.keys(teacherAvailability[selectedTeacher.name] ?? {}).length > 0 && (
                <button
                  onClick={() => clearTeacherAvailability(selectedTeacher.name)}
                  title="Reset all slots to 'available' for this teacher"
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: 5,
                    padding: '5px 10px', borderRadius: 7,
                    border: '1px solid #ECEAFB', background: '#FAFAFE',
                    color: '#8B87AD', fontSize: 10.5, fontWeight: 700,
                    cursor: 'pointer', fontFamily: 'inherit',
                  }}
                >
                  <RotateCcw size={10} /> Reset
                </button>
              )}
            </div>

            {/* Grid table */}
            <table style={{
              borderCollapse: 'collapse', width: '100%',
              tableLayout: 'fixed', minWidth: 400,
            }}>
              <colgroup>
                <col style={{ width: 110 }} />
                {workDays.map(d => <col key={d} />)}
              </colgroup>
              <thead>
                <tr>
                  <th style={thStyle}>Period</th>
                  {workDays.map(day => (
                    <th
                      key={day}
                      onClick={e => handleDayHeaderClick(day, e.shiftKey)}
                      title="Shift+click to toggle-block entire day"
                      style={{
                        ...thStyle,
                        textAlign: 'center', cursor: 'pointer',
                        userSelect: 'none',
                      }}
                    >
                      {DAY_ABBREV[day.toUpperCase()] ?? day.slice(0, 3)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {periods.map(period => {
                  if (period.type === 'break') {
                    return (
                      <tr key={period.id}>
                        <td colSpan={workDays.length + 1} style={{
                          padding: '4px 8px', textAlign: 'center',
                          fontSize: 9, fontWeight: 700, letterSpacing: '0.12em',
                          textTransform: 'uppercase', color: '#94A3B8',
                          background: '#F8FAFC',
                          border: '1px solid #E2E8F0',
                        }}>
                          {period.name}
                        </td>
                      </tr>
                    )
                  }

                  return (
                    <tr key={period.id}>
                      {/* Period label — shift+click blocks/unblocks entire row */}
                      <td
                        onClick={e => handlePeriodRowClick(period.id, e.shiftKey)}
                        title="Shift+click to toggle-block entire period row"
                        style={{
                          padding: '5px 10px',
                          fontSize: 10.5, fontWeight: 700, color: '#4B5275',
                          background: '#F8F7FF',
                          border: '1px solid #ECEAFB',
                          whiteSpace: 'nowrap',
                          cursor: 'pointer', userSelect: 'none',
                        }}
                      >
                        {period.name}
                      </td>
                      {workDays.map(day => {
                        const status = getStatus(day, period.id)
                        const st = STATUS_STYLE[status]
                        return (
                          <td
                            key={day}
                            onClick={e => handleSlotClick(day, period.id, e.shiftKey)}
                            title={`${selectedTeacher?.name} · ${day} · ${period.name} — click to change`}
                            style={{
                              padding: 4,
                              border: `1px solid ${st.border}`,
                              background: st.bg,
                              cursor: 'pointer',
                              textAlign: 'center',
                              transition: 'background 0.1s',
                              userSelect: 'none',
                            }}
                          >
                            <div style={{
                              height: 32, borderRadius: 6,
                              background: st.bg,
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                              color: st.text,
                            }}>
                              {status !== 'available' && st.icon}
                            </div>
                          </td>
                        )
                      })}
                    </tr>
                  )
                })}
              </tbody>
            </table>

            {/* Bulk-action strip */}
            <div style={{
              display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 14,
            }}>
              <span style={{ fontSize: 9.5, color: '#8B87AD', alignSelf: 'center', marginRight: 4 }}>
                Quick actions:
              </span>
              <BulkBtn label="Prefer all" onClick={() => {
                if (!selectedTeacher) return
                classPeriods.forEach(p => workDays.forEach(day =>
                  setTeacherSlotStatus(selectedTeacher.name, day, p.id, 'preferred')
                ))
              }} color="#15803D" bg="#DCFCE7" border="#BBF7D0" />
              <BulkBtn label="Block first period" onClick={() => {
                if (!selectedTeacher || classPeriods.length === 0) return
                const first = classPeriods[0]
                workDays.forEach(day =>
                  setTeacherSlotStatus(selectedTeacher.name, day, first.id, 'blocked')
                )
              }} color="#991B1B" bg="#FEE2E2" border="#FECACA" />
              <BulkBtn label="Block last period" onClick={() => {
                if (!selectedTeacher || classPeriods.length === 0) return
                const last = classPeriods[classPeriods.length - 1]
                workDays.forEach(day =>
                  setTeacherSlotStatus(selectedTeacher.name, day, last.id, 'blocked')
                )
              }} color="#991B1B" bg="#FEE2E2" border="#FECACA" />
              {workDays.length > 5 && (
                <BulkBtn label="Block Saturday" onClick={() => {
                  if (!selectedTeacher) return
                  classPeriods.forEach(p =>
                    setTeacherSlotStatus(selectedTeacher.name, 'SATURDAY', p.id, 'blocked')
                  )
                }} color="#991B1B" bg="#FEE2E2" border="#FECACA" />
              )}
              <BulkBtn label="Clear teacher" onClick={() => {
                if (selectedTeacher) clearTeacherAvailability(selectedTeacher.name)
              }} color="#4B5275" bg="#F8F7FF" border="#D8D2FF" />
            </div>
          </div>
        </div>

        {/* ─── Footer ─── */}
        <div style={{
          padding: '11px 20px',
          borderTop: '1px solid #ECEAFB',
          display: 'flex', alignItems: 'center', gap: 10,
          flexShrink: 0, background: '#FAFAFE',
        }}>
          <span style={{ flex: 1, fontSize: 10.5, color: '#8B87AD' }}>
            Changes are saved automatically. Blocked slots are enforced by the solver on the next solve.
          </span>
          <button
            onClick={onClose}
            style={{
              padding: '8px 22px', borderRadius: 9, border: 'none',
              background: '#7C6FE0', color: '#fff',
              fontSize: 12, fontWeight: 800, cursor: 'pointer',
              fontFamily: 'inherit',
            }}
          >
            Done
          </button>
        </div>
      </div>
    </>
  )
}

// ─── BulkBtn ──────────────────────────────────────────────

function BulkBtn({
  label, onClick, color, bg, border,
}: { label: string; onClick: () => void; color: string; bg: string; border: string }) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: '4px 11px', borderRadius: 7,
        border: `1px solid ${border}`, background: bg,
        color, fontSize: 10, fontWeight: 700,
        cursor: 'pointer', fontFamily: 'inherit',
      }}
    >
      {label}
    </button>
  )
}

// ─── Table header style ───────────────────────────────────

const thStyle: React.CSSProperties = {
  padding: '7px 10px',
  fontSize: 9.5, fontWeight: 800, letterSpacing: '0.1em',
  textTransform: 'uppercase', color: '#7C6FE0',
  background: '#F8F7FF', border: '1px solid #ECEAFB',
  textAlign: 'left',
}
