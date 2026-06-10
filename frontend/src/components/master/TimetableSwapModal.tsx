/**
 * TimetableSwapModal — interactive post-solve timetable editor.
 *
 * Presents a periods × days grid for a selected section.
 * Two-click swap / move flow:
 *   1. Click a filled cell → "picks it up" (floating ghost label, cell shows lift).
 *   2. Click another cell →
 *        • Both filled  → swap their full cell data.
 *        • Target empty → move held cell there (source becomes empty).
 *        • Same cell    → deselect.
 *
 * While a cell is held, every target slot is annotated:
 *   ✓ green  — safe (no teacher clash in this section's modified grid)
 *   ⚠ amber  — teacher is already at that slot in another section
 *   ✕ red    — that slot is a break period (locked)
 *
 * A pending-changes log tracks every swap/move. "Apply" fires onApplyFixes with
 * the mutated classTT copy. "Undo last" reverts the most recent pending change.
 * "Reset" clears all pending changes back to original.
 *
 * Pure inline styles (consistent with master/ component family).
 * No drag-and-drop library — just two-click select+place.
 */

import { useState, useMemo, useCallback, useEffect } from 'react'
import type { ClassTimetable, Section, Staff, Period } from '@/types'
import { X, ArrowLeftRight, CornerUpLeft, RotateCcw, CheckCircle2, AlertTriangle } from 'lucide-react'

// ─── Pastel subject palette (mirrors timetableExport.ts) ─────────────────────

const SUBJECT_PALETTE = [
  { bg: '#EDE9FF', border: '#C4B5FD', text: '#4C1D95' },
  { bg: '#FEF3C7', border: '#FCD34D', text: '#92400E' },
  { bg: '#DCFCE7', border: '#86EFAC', text: '#14532D' },
  { bg: '#E0F2FE', border: '#7DD3FC', text: '#0C4A6E' },
  { bg: '#FCE7F3', border: '#F9A8D4', text: '#831843' },
  { bg: '#FFF7ED', border: '#FED7AA', text: '#7C2D12' },
  { bg: '#F0FDF4', border: '#BBF7D0', text: '#15532D' },
  { bg: '#F5F3FF', border: '#DDD6FE', text: '#3730A3' },
  { bg: '#FEF9C3', border: '#FEF08A', text: '#713F12' },
  { bg: '#E0F7FA', border: '#80DEEA', text: '#006064' },
]
const subjectStyle = (() => {
  const cache = new Map<string, typeof SUBJECT_PALETTE[number]>()
  return (name: string) => {
    if (!cache.has(name)) {
      let hash = 0
      for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) >>> 0
      cache.set(name, SUBJECT_PALETTE[hash % SUBJECT_PALETTE.length])
    }
    return cache.get(name)!
  }
})()

// ─── Types ────────────────────────────────────────────────

interface SlotKey { day: string; periodId: string }

type DropHint = 'safe' | 'teacher-clash' | 'break' | 'self'

interface PendingChange {
  id: number
  kind: 'swap' | 'move'
  from: SlotKey
  to: SlotKey
  fromSubject: string
  toSubject: string
}

interface Props {
  classTT: ClassTimetable
  sections: Section[]
  staff: Staff[]
  periods: Period[]
  workDays: string[]
  initialSection?: string
  onClose: () => void
  onApplyFixes: (updated: ClassTimetable) => void
}

// ─── Component ────────────────────────────────────────────

export function TimetableSwapModal({
  classTT, sections, staff, periods, workDays,
  initialSection, onClose, onApplyFixes,
}: Props) {
  const [selectedSection, setSelectedSection] = useState(
    initialSection ?? sections[0]?.name ?? '',
  )
  // Working copy of classTT — mutated as user applies swaps
  const [workingTT, setWorkingTT] = useState<ClassTimetable>(() => deepCloneTT(classTT))
  // Held slot = the "picked up" cell
  const [held, setHeld] = useState<SlotKey | null>(null)
  // Pending change log
  const [changes, setChanges] = useState<PendingChange[]>([])
  const [nextId, setNextId] = useState(1)

  // Reset working copy whenever modal receives fresh classTT
  useEffect(() => {
    setWorkingTT(deepCloneTT(classTT))
    setHeld(null)
    setChanges([])
  }, [classTT])

  const classPeriods = useMemo(
    () => periods.filter(p => p.type !== 'break'),
    [periods],
  )

  // For each (day, periodId) slot, decide the drop hint while something is held
  const dropHints = useMemo((): Map<string, DropHint> => {
    const map = new Map<string, DropHint>()
    if (!held) return map
    const heldCell: any = workingTT[selectedSection]?.[held.day]?.[held.periodId]

    workDays.forEach(day => {
      periods.forEach(period => {
        const key = slotKey(day, period.id)

        // Break row — locked
        if (period.type === 'break') { map.set(key, 'break'); return }

        // Self
        if (day === held.day && period.id === held.periodId) { map.set(key, 'self'); return }

        // Teacher clash: held cell's teacher is busy at (day, period) in some other section
        if (heldCell?.teacher) {
          const clashes = Object.entries(workingTT).some(([sec, secData]) => {
            if (sec === selectedSection) return false
            const c: any = secData[day]?.[period.id]
            return c?.teacher === heldCell.teacher
          })
          if (clashes) { map.set(key, 'teacher-clash'); return }
        }

        map.set(key, 'safe')
      })
    })
    return map
  }, [held, workingTT, selectedSection, workDays, periods])

  const handleCellClick = useCallback((day: string, period: Period) => {
    if (period.type === 'break') return

    if (!held) {
      // Only pick up cells that have content
      const cell: any = workingTT[selectedSection]?.[day]?.[period.id]
      if (cell?.subject) setHeld({ day, periodId: period.id })
      return
    }

    // Already holding something — place it
    if (held.day === day && held.periodId === period.id) {
      // Click same cell → deselect
      setHeld(null)
      return
    }

    const hint = dropHints.get(slotKey(day, period.id))
    if (hint === 'break') return

    // Perform swap / move on working copy
    const next = deepCloneTT(workingTT)
    const src: any  = next[selectedSection]?.[held.day]?.[held.periodId]
    const dest: any = next[selectedSection]?.[day]?.[period.id]

    if (!next[selectedSection]) next[selectedSection] = {}
    if (!next[selectedSection][held.day]) next[selectedSection][held.day] = {}
    if (!next[selectedSection][day]) next[selectedSection][day] = {}

    const kind: 'swap' | 'move' = dest?.subject ? 'swap' : 'move'
    const fromSubject = src?.subject ?? ''
    const toSubject   = dest?.subject ?? ''

    // Swap or move
    next[selectedSection][day][period.id]   = src   ?? null
    next[selectedSection][held.day][held.periodId] = dest ?? null

    setWorkingTT(next)
    setChanges(c => [...c, {
      id: nextId, kind, from: held, to: { day, periodId: period.id },
      fromSubject, toSubject,
    }])
    setNextId(n => n + 1)
    setHeld(null)
  }, [held, workingTT, selectedSection, dropHints, nextId])

  const handleUndoLast = useCallback(() => {
    if (changes.length === 0) return
    // Replay all changes except the last
    const prev = changes.slice(0, -1)
    let tt = deepCloneTT(classTT)
    for (const ch of prev) applyChange(tt, selectedSection, ch)
    setWorkingTT(tt)
    setChanges(prev)
    setHeld(null)
  }, [changes, classTT, selectedSection])

  const handleReset = useCallback(() => {
    setWorkingTT(deepCloneTT(classTT))
    setChanges([])
    setHeld(null)
  }, [classTT])

  const handleApply = useCallback(() => {
    onApplyFixes(workingTT)
    onClose()
  }, [workingTT, onApplyFixes, onClose])

  const hasChanges = changes.length > 0

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={() => { if (!held) onClose() }}
        style={{
          position: 'fixed', inset: 0, zIndex: 9100,
          background: 'rgba(19,17,30,0.5)',
          backdropFilter: 'blur(3px)',
        }}
      />

      {/* Panel */}
      <div style={{
        position: 'fixed',
        top: '50%', left: '50%',
        transform: 'translate(-50%, -50%)',
        zIndex: 9101,
        width: 'min(96vw, 900px)',
        maxHeight: '92vh',
        background: '#fff',
        borderRadius: 20,
        boxShadow: '0 32px 80px rgba(19,17,30,0.3), 0 4px 16px rgba(124,111,224,0.14)',
        display: 'flex', flexDirection: 'column',
        fontFamily: "'Hanken Grotesk', sans-serif",
        overflow: 'hidden',
      }}>

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
            <ArrowLeftRight size={16} />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 14, fontWeight: 800, color: '#13111E', letterSpacing: '-0.2px' }}>
              Edit Timetable
            </div>
            <div style={{ fontSize: 10.5, color: '#8B87AD', marginTop: 1 }}>
              Click a cell to pick it up, then click a target to swap or move
            </div>
          </div>

          {/* Section picker */}
          <select
            value={selectedSection}
            onChange={e => { setSelectedSection(e.target.value); setHeld(null) }}
            style={{
              padding: '6px 10px', borderRadius: 8,
              border: '1.5px solid #D8D2FF', background: '#F8F7FF',
              color: '#13111E', fontSize: 11.5, fontWeight: 600,
              fontFamily: 'inherit', cursor: 'pointer', outline: 'none',
            }}
          >
            {sections.map(s => (
              <option key={s.name} value={s.name}>{s.name}</option>
            ))}
          </select>

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

        {/* ─── Legend / instructions strip ─── */}
        {held && (
          <div style={{
            padding: '8px 20px',
            background: 'linear-gradient(90deg, #EDE9FF 0%, #F8F7FF 100%)',
            borderBottom: '1px solid #D8D2FF',
            display: 'flex', alignItems: 'center', gap: 16,
            fontSize: 10.5, flexShrink: 0,
          }}>
            <span style={{ fontWeight: 800, color: '#7C6FE0' }}>
              ✦ Holding: {(workingTT[selectedSection]?.[held.day]?.[held.periodId] as any)?.subject}
            </span>
            <LegendDot color="#DCFCE7" border="#86EFAC" label="Safe to place" />
            <LegendDot color="#FEF3C7" border="#FCD34D" label="Teacher clash" />
            <span style={{ color: '#8B87AD' }}>Click same cell to deselect</span>
            <button
              onClick={() => setHeld(null)}
              style={{
                marginLeft: 'auto', padding: '3px 10px', borderRadius: 6,
                border: '1px solid #D8D2FF', background: '#fff',
                color: '#7C6FE0', fontSize: 10, fontWeight: 700,
                cursor: 'pointer', fontFamily: 'inherit',
              }}
            >
              Cancel
            </button>
          </div>
        )}

        {/* ─── Grid ─── */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px' }}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{
              width: '100%', borderCollapse: 'collapse',
              tableLayout: 'fixed', minWidth: 480,
            }}>
              <colgroup>
                <col style={{ width: 110 }} />
                {workDays.map(d => <col key={d} />)}
              </colgroup>
              <thead>
                <tr>
                  <th style={thStyle}>Period</th>
                  {workDays.map(day => (
                    <th key={day} style={{ ...thStyle, textAlign: 'center' }}>
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
                          background: '#F8FAFC', borderTop: '1px solid #E2E8F0',
                          borderBottom: '1px solid #E2E8F0',
                        }}>
                          {period.name}
                        </td>
                      </tr>
                    )
                  }

                  return (
                    <tr key={period.id}>
                      <td style={{
                        padding: '6px 10px',
                        fontSize: 10.5, fontWeight: 700, color: '#4B5275',
                        background: '#F8F7FF',
                        border: '1px solid #ECEAFB',
                        whiteSpace: 'nowrap',
                      }}>
                        {period.name}
                      </td>
                      {workDays.map(day => {
                        const cell: any = workingTT[selectedSection]?.[day]?.[period.id]
                        const isHeld = held?.day === day && held?.periodId === period.id
                        const hint = dropHints.get(slotKey(day, period.id))
                        return (
                          <GridCell
                            key={day}
                            cell={cell}
                            isHeld={isHeld}
                            hint={held ? hint : undefined}
                            canPickUp={!held && !!cell?.subject}
                            onClick={() => handleCellClick(day, period)}
                          />
                        )
                      })}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* ─── Change log ─── */}
        {hasChanges && (
          <div style={{
            padding: '10px 20px',
            borderTop: '1px solid #ECEAFB',
            background: '#FAFAFE',
            flexShrink: 0, maxHeight: 140, overflowY: 'auto',
          }}>
            <div style={{
              fontSize: 9, fontWeight: 800, letterSpacing: '0.14em',
              textTransform: 'uppercase', color: '#8B87AD', marginBottom: 6,
            }}>
              Pending changes ({changes.length})
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
              {changes.map((ch, i) => (
                <ChangeRow key={ch.id} change={ch} index={i + 1} />
              ))}
            </div>
          </div>
        )}

        {/* ─── Footer ─── */}
        <div style={{
          padding: '11px 20px',
          borderTop: '1px solid #ECEAFB',
          display: 'flex', alignItems: 'center', gap: 8,
          flexShrink: 0, background: '#fff',
        }}>
          <span style={{ flex: 1, fontSize: 10.5, color: '#8B87AD' }}>
            {hasChanges
              ? `${changes.length} pending change${changes.length !== 1 ? 's' : ''}`
              : 'No changes yet — click a cell to begin'}
          </span>
          {hasChanges && (
            <>
              <button
                onClick={handleUndoLast}
                title="Undo last change"
                style={secondaryBtn}
              >
                <CornerUpLeft size={11} /> Undo
              </button>
              <button
                onClick={handleReset}
                title="Reset all changes"
                style={secondaryBtn}
              >
                <RotateCcw size={11} /> Reset
              </button>
            </>
          )}
          <button onClick={onClose} style={closeBtn}>Cancel</button>
          <button
            onClick={handleApply}
            disabled={!hasChanges}
            style={{
              ...primaryBtn,
              opacity: hasChanges ? 1 : 0.45,
              cursor: hasChanges ? 'pointer' : 'default',
            }}
          >
            <CheckCircle2 size={12} />
            Apply {hasChanges ? `${changes.length} change${changes.length !== 1 ? 's' : ''}` : 'changes'}
          </button>
        </div>
      </div>
    </>
  )
}

// ─── GridCell ─────────────────────────────────────────────

function GridCell({
  cell, isHeld, hint, canPickUp, onClick,
}: {
  cell: any
  isHeld: boolean
  hint?: DropHint
  canPickUp: boolean
  onClick: () => void
}) {
  const isEmpty = !cell?.subject

  // Background tint based on drop hint
  let overlayBg  = 'transparent'
  let overlayBorder = '1px solid #ECEAFB'
  if (hint === 'safe')          { overlayBg = '#F0FDF4'; overlayBorder = '1.5px solid #86EFAC' }
  if (hint === 'teacher-clash') { overlayBg = '#FFFBEB'; overlayBorder = '1.5px solid #FCD34D' }
  if (hint === 'self')          { overlayBorder = '2px dashed #A78BFA' }

  const sStyle = cell?.subject ? subjectStyle(cell.subject) : null

  return (
    <td
      onClick={onClick}
      style={{
        padding: 4,
        border: isHeld ? '2px solid #7C6FE0' : overlayBorder,
        background: isHeld ? '#F5F3FF' : overlayBg,
        cursor: isHeld ? 'default' : canPickUp ? 'grab' : hint === 'break' ? 'not-allowed' : hint ? 'pointer' : 'default',
        transition: 'background 0.1s, border-color 0.1s',
        position: 'relative',
        minWidth: 80,
      }}
    >
      {/* Drop zone indicators */}
      {hint === 'safe' && !isHeld && (
        <div style={{
          position: 'absolute', inset: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          pointerEvents: 'none',
          opacity: isEmpty ? 0.6 : 0,
        }}>
          <div style={{
            width: 18, height: 18, borderRadius: '50%',
            background: '#DCFCE7', border: '2px solid #86EFAC',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 9, color: '#15803D', fontWeight: 800,
          }}>+</div>
        </div>
      )}
      {hint === 'teacher-clash' && (
        <div style={{
          position: 'absolute', top: 2, right: 3, zIndex: 1,
          fontSize: 8, color: '#92400E', fontWeight: 800,
        }}>⚠</div>
      )}

      {/* Cell content */}
      {isEmpty ? (
        <div style={{
          height: 44,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }} />
      ) : (
        <div style={{
          padding: '5px 7px', borderRadius: 6, minHeight: 44,
          background: sStyle?.bg,
          borderLeft: `3px solid ${sStyle?.border}`,
          opacity: isHeld ? 0.45 : 1,
          transform: isHeld ? 'scale(0.93)' : 'scale(1)',
          transition: 'opacity 0.12s, transform 0.12s',
          display: 'flex', flexDirection: 'column', gap: 2,
        }}>
          <span style={{
            fontSize: 10.5, fontWeight: 800,
            color: sStyle?.text, lineHeight: 1.2,
          }}>
            {cell.subject}
          </span>
          {cell.teacher && (
            <span style={{
              fontSize: 9, color: sStyle?.text, opacity: 0.7,
              fontFamily: "'DM Mono', monospace",
            }}>
              {cell.teacher}
            </span>
          )}
          {cell.room && (
            <span style={{ fontSize: 8.5, color: sStyle?.text, opacity: 0.5 }}>
              {cell.room}
            </span>
          )}
        </div>
      )}
    </td>
  )
}

// ─── ChangeRow ────────────────────────────────────────────

function ChangeRow({ change, index }: { change: PendingChange; index: number }) {
  const fromLabel = `${DAY_ABBREV[change.from.day.toUpperCase()] ?? change.from.day} P${change.from.periodId}`
  const toLabel   = `${DAY_ABBREV[change.to.day.toUpperCase()] ?? change.to.day} P${change.to.periodId}`

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 8,
      padding: '3px 8px', borderRadius: 6,
      background: '#fff', border: '1px solid #ECEAFB',
      fontSize: 10.5,
    }}>
      <span style={{
        fontSize: 8, fontWeight: 800, letterSpacing: '0.06em',
        padding: '1px 5px', borderRadius: 4,
        background: change.kind === 'swap' ? '#EDE9FF' : '#DCFCE7',
        color: change.kind === 'swap' ? '#7C6FE0' : '#15803D',
        flexShrink: 0,
      }}>
        {change.kind.toUpperCase()}
      </span>
      <span style={{ fontWeight: 700, color: '#13111E' }}>{change.fromSubject}</span>
      {change.kind === 'swap' && (
        <>
          <ArrowLeftRight size={10} color="#8B87AD" />
          <span style={{ fontWeight: 700, color: '#13111E' }}>{change.toSubject}</span>
        </>
      )}
      {change.kind === 'move' && (
        <span style={{ color: '#8B87AD' }}>→</span>
      )}
      <span style={{ color: '#8B87AD', marginLeft: 'auto', fontFamily: "'DM Mono', monospace", fontSize: 10 }}>
        {fromLabel} ⟷ {toLabel}
      </span>
    </div>
  )
}

// ─── LegendDot ────────────────────────────────────────────

function LegendDot({ color, border, label }: { color: string; border: string; label: string }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, color: '#4B5275' }}>
      <span style={{
        width: 11, height: 11, borderRadius: 3,
        background: color, border: `1.5px solid ${border}`,
        display: 'inline-block', flexShrink: 0,
      }} />
      {label}
    </span>
  )
}

// ─── Helpers ─────────────────────────────────────────────

const DAY_ABBREV: Record<string, string> = {
  MONDAY: 'Mon', TUESDAY: 'Tue', WEDNESDAY: 'Wed',
  THURSDAY: 'Thu', FRIDAY: 'Fri', SATURDAY: 'Sat', SUNDAY: 'Sun',
}

function slotKey(day: string, periodId: string): string {
  return `${day}::${periodId}`
}

function deepCloneTT(tt: ClassTimetable): ClassTimetable {
  return JSON.parse(JSON.stringify(tt))
}

/** Replay a single pending change onto a mutable ClassTimetable copy. */
function applyChange(tt: ClassTimetable, section: string, ch: PendingChange) {
  if (!tt[section]) tt[section] = {}
  if (!tt[section][ch.from.day]) tt[section][ch.from.day] = {}
  if (!tt[section][ch.to.day])   tt[section][ch.to.day]   = {}

  const src  = tt[section][ch.from.day][ch.from.periodId]
  const dest = tt[section][ch.to.day][ch.to.periodId]

  tt[section][ch.to.day][ch.to.periodId]     = src  ?? null
  tt[section][ch.from.day][ch.from.periodId] = dest ?? null
}

// ─── Shared button styles ─────────────────────────────────

const secondaryBtn: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 5,
  padding: '7px 13px', borderRadius: 8,
  border: '1px solid #ECEAFB', background: '#FAFAFE',
  color: '#4B5275', fontSize: 11, fontWeight: 700,
  cursor: 'pointer', fontFamily: 'inherit',
}

const closeBtn: React.CSSProperties = {
  padding: '7px 14px', borderRadius: 8,
  border: '1px solid #ECEAFB', background: '#fff',
  color: '#4B5275', fontSize: 11.5, fontWeight: 600,
  cursor: 'pointer', fontFamily: 'inherit',
}

const primaryBtn: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 6,
  padding: '7px 18px', borderRadius: 8, border: 'none',
  background: '#7C6FE0', color: '#fff',
  fontSize: 12, fontWeight: 800,
  fontFamily: 'inherit', letterSpacing: '0.02em',
  transition: 'opacity 0.12s',
}

const thStyle: React.CSSProperties = {
  padding: '7px 10px',
  fontSize: 9.5, fontWeight: 800, letterSpacing: '0.1em',
  textTransform: 'uppercase', color: '#7C6FE0',
  background: '#F8F7FF', border: '1px solid #ECEAFB',
  textAlign: 'left',
}
