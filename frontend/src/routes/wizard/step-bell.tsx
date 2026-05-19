/**
 * Step 1 — Shift & Bell Timing  (Page 6 redesign)
 *
 * Left column:
 *   SHIFT CONFIGURATION — Primary shift card (start/end, format, max periods, working days)
 *   BELL TIMING GRID    — Editable table with type badge + group applicability dots
 *
 * Right column (sticky):
 *   LIVE BELL TIMELINE  — Auto-computed from grid rows
 *   AI CAPACITY ENGINE  — Weekly periods estimate per level
 *
 * Footer: ← Back  |  Step 1 of 5  |  Next: Resources →
 */

import { useState, useMemo } from 'react'
import { useTimetableStore } from '@/store/timetableStore'
import { Plus, Sparkles, ChevronLeft, ChevronRight, Trash2 } from 'lucide-react'

// ── Types ─────────────────────────────────────────────────────
type BellType = 'teaching' | 'assembly' | 'lunch' | 'break'

interface BellRow {
  id:     string
  name:   string
  start:  string    // HH:MM (24 h)
  end:    string
  type:   BellType
  lower:  boolean   // I–V   (pre-primary + lower primary)
  middle: boolean   // VI–X  (middle school)
  upper:  boolean   // XI–XII (senior secondary)
}

// ── Type metadata ─────────────────────────────────────────────
const TYPE_META: Record<BellType, {
  label: string; bg: string; fg: string; border: string; line: string
}> = {
  teaching: { label: 'Teaching', bg: '#DBEAFE', fg: '#1D4ED8', border: '#BFDBFE', line: '#3B82F6' },
  assembly: { label: 'Assembly', bg: '#EDE9FF', fg: '#7C3AED', border: '#C4B5FD', line: '#7C3AED' },
  lunch:    { label: 'Lunch',    bg: '#FEF3C7', fg: '#D97706', border: '#FDE68A', line: '#F59E0B' },
  break:    { label: 'Break',    bg: '#FEF9C3', fg: '#A16207', border: '#FEF08A', line: '#EAB308' },
}
const BELL_TYPES: BellType[] = ['teaching', 'assembly', 'lunch', 'break']

// ── Default rows (matches Page 6 mockup) ──────────────────────
const DEFAULT_ROWS: BellRow[] = [
  { id: 'p1',  name: 'P1',       start: '09:00', end: '09:40', type: 'teaching', lower: true,  middle: true,  upper: true  },
  { id: 'p2',  name: 'P2',       start: '09:40', end: '10:20', type: 'teaching', lower: true,  middle: true,  upper: true  },
  { id: 'asm', name: 'Assembly', start: '10:20', end: '10:35', type: 'assembly', lower: true,  middle: true,  upper: false },
  { id: 'p3',  name: 'P3',       start: '10:35', end: '11:15', type: 'teaching', lower: true,  middle: true,  upper: true  },
  { id: 'l1',  name: 'Lunch',    start: '11:30', end: '12:00', type: 'lunch',    lower: true,  middle: false, upper: false },
  { id: 'l2',  name: 'Lunch',    start: '12:30', end: '13:00', type: 'lunch',    lower: false, middle: true,  upper: true  },
  { id: 'p7',  name: 'P7',       start: '14:00', end: '14:40', type: 'teaching', lower: true,  middle: true,  upper: true  },
  { id: 'brk', name: 'Break',    start: '14:40', end: '14:50', type: 'break',    lower: true,  middle: true,  upper: true  },
]

const ALL_DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const DAY_TO_FULL: Record<string, string> = {
  Mon: 'MONDAY', Tue: 'TUESDAY', Wed: 'WEDNESDAY',
  Thu: 'THURSDAY', Fri: 'FRIDAY', Sat: 'SATURDAY',
}

// ── Helpers ───────────────────────────────────────────────────
function fmt12(hhmm: string): string {
  if (!hhmm) return ''
  const [h, m] = hhmm.split(':').map(Number)
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`
}

function minutesDiff(a: string, b: string): number {
  const [ah, am] = a.split(':').map(Number)
  const [bh, bm] = b.split(':').map(Number)
  return Math.max(0, bh * 60 + bm - ah * 60 - am)
}

function groupLabel(lower: boolean, middle: boolean, upper: boolean): string {
  if (lower && middle && upper)    return 'All'
  if (lower && middle && !upper)   return 'I–X'
  if (!lower && middle && upper)   return 'VI–XII'
  if (lower && !middle && !upper)  return 'I–V'
  if (!lower && !middle && upper)  return 'XI–XII'
  if (!lower && middle && !upper)  return 'VI–X'
  if (lower && !middle && upper)   return 'I–V & XI–XII'
  return '—'
}

function makeId() { return Math.random().toString(36).slice(2, 8) }

// ── Component ─────────────────────────────────────────────────
export function StepBell() {
  const { config, setConfig, setStep, setBreaks } = useTimetableStore()

  const [startTime,  setStartTime]  = useState(config.startTime ?? '09:00')
  const [fmt,        setFmt]        = useState<'12H' | '24H'>('12H')
  const [maxPeriods, setMaxPeriods] = useState(config.periodsPerDay ?? 9)
  const [workDays,   setWorkDays]   = useState<string[]>(
    config.workDays?.length
      ? config.workDays.map(d => d.charAt(0) + d.slice(1, 3).toLowerCase())
      : ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'],
  )
  const [rows, setRows] = useState<BellRow[]>(DEFAULT_ROWS)

  // Last row's end time = computed school end time
  const endTime = rows.at(-1)?.end ?? startTime

  const toggleDay = (d: string) =>
    setWorkDays(w => w.includes(d) ? w.filter(x => x !== d) : [...w, d])

  const updateRow = (id: string, patch: Partial<BellRow>) =>
    setRows(rs => rs.map(r => r.id === id ? { ...r, ...patch } : r))

  const deleteRow = (id: string) =>
    setRows(rs => rs.filter(r => r.id !== id))

  const addRow = () =>
    setRows(rs => [...rs, {
      id: makeId(),
      name: `P${rs.filter(r => r.type === 'teaching').length + 1}`,
      start: rs.at(-1)?.end ?? '15:00',
      end: '15:40',
      type: 'teaching',
      lower: true, middle: true, upper: true,
    }])

  // Capacity summary
  const capacity = useMemo(() => {
    const days = workDays.length
    const tRows = rows.filter(r => r.type === 'teaching')
    return {
      prePrimary: maxPeriods * Math.min(days, 5),
      primary:    tRows.filter(r => r.lower).length * days + Math.max(0, maxPeriods - tRows.length),
      secondary:  tRows.filter(r => r.middle || r.upper).length * days + Math.max(0, maxPeriods - tRows.length),
    }
  }, [rows, workDays.length, maxPeriods])

  const handleNext = () => {
    setConfig({
      workDays: workDays.map(d => DAY_TO_FULL[d] ?? d.toUpperCase()),
      startTime,
      endTime,
      periodsPerDay: maxPeriods,
      defaultSessionDuration: 40,
    } as any)
    setBreaks(
      rows
        .filter(r => r.type !== 'teaching')
        .map(r => ({
          id: r.id,
          name: r.name,
          duration: minutesDiff(r.start, r.end),
          type: r.type as any,
          shiftable: r.type === 'break',
        })),
    )
    setStep(2)
  }

  return (
    <div style={{
      padding: '20px 28px 32px',
      maxWidth: 1140,
      margin: '0 auto',
      fontFamily: "'Inter', -apple-system, sans-serif",
    }}>
      <style>{`
        .bt-input {
          padding: 7px 10px;
          border: 1px solid #E5E7EB; border-radius: 6px;
          font-size: 13px; font-family: inherit; color: #13111E;
          background: #fff; outline: none;
          transition: border-color 0.15s, box-shadow 0.15s;
        }
        .bt-input:focus { border-color: #7C6FE0; box-shadow: 0 0 0 2px rgba(124,111,224,0.10); }
        .bt-cell { padding: 4px 7px; border: 1px solid transparent; border-radius: 5px; font-size: 13px; font-family: inherit; color: #13111E; background: transparent; outline: none; width: 100%; }
        .bt-cell:hover  { border-color: #E5E7EB; background: #F9FAFB; }
        .bt-cell:focus  { border-color: #7C6FE0; background: #fff; box-shadow: 0 0 0 2px rgba(124,111,224,0.08); }
        .bt-row:hover .bt-del { opacity: 1 !important; }
        .bt-day { transition: background 0.12s, border-color 0.12s, color 0.12s; }
        .bt-day:hover { opacity: 0.85; }
        .bt-dot { width: 10px; height: 10px; border-radius: 50%; border: none; cursor: pointer; display: block; margin: 0 auto; transition: background 0.12s, transform 0.12s; }
        .bt-dot:hover { transform: scale(1.35); }
        .bt-add { transition: background 0.13s, border-color 0.13s; }
        .bt-add:hover { background: #F9FAFB !important; }
        .bt-ai { transition: background 0.13s; }
        .bt-ai:hover { background: #EDE9FF !important; }
        .bt-nav-sec { transition: background 0.13s; }
        .bt-nav-sec:hover { background: #F9FAFB !important; }
        .bt-nav-pri { transition: background 0.13s; }
        .bt-nav-pri:hover { background: #1a1730 !important; }
      `}</style>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 292px', gap: 20, alignItems: 'start' }}>

        {/* ══════════════════════════════════════
            LEFT COLUMN
        ══════════════════════════════════════ */}
        <div>

          {/* ─── SHIFT CONFIGURATION ─────────────────────── */}
          <div style={{ marginBottom: 20 }}>
            <SHeading>SHIFT CONFIGURATION</SHeading>

            <div style={{
              background: '#fff', borderRadius: 10,
              border: '1px solid #E5E7EB', padding: '16px 18px',
            }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: '#13111E', marginBottom: 14 }}>
                Primary shift
              </div>

              {/* 4-field row */}
              <div style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr 90px 130px',
                gap: 14,
                marginBottom: 14,
              }}>
                {/* Start time */}
                <div>
                  <div style={FL}>Start time</div>
                  <input className="bt-input" type="time" value={startTime}
                    onChange={e => setStartTime(e.target.value)}
                    style={{ width: '100%' }} />
                  <div style={FHint}>{fmt === '12H' ? fmt12(startTime) : startTime}</div>
                </div>

                {/* End time — auto-computed, read-only */}
                <div>
                  <div style={FL}>End time</div>
                  <input className="bt-input" type="text" value={fmt === '12H' ? fmt12(endTime) : endTime}
                    readOnly style={{ width: '100%', background: '#F9FAFB', color: '#6B7280' }} />
                  <div style={FHint}>auto-computed</div>
                </div>

                {/* Format */}
                <div>
                  <div style={FL}>Format</div>
                  <select className="bt-input" value={fmt}
                    onChange={e => setFmt(e.target.value as '12H' | '24H')}
                    style={{ width: '100%' }}>
                    <option value="12H">12H</option>
                    <option value="24H">24H</option>
                  </select>
                </div>

                {/* Max periods/day */}
                <div>
                  <div style={FL}>Max periods/day</div>
                  <input className="bt-input" type="number" min={1} max={16} value={maxPeriods}
                    onChange={e => setMaxPeriods(Math.max(1, +e.target.value))}
                    style={{
                      width: '100%', textAlign: 'center',
                      fontFamily: "'DM Mono', monospace",
                      fontWeight: 800, fontSize: 18,
                    }} />
                </div>
              </div>

              {/* Working days */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 12, color: '#6B7280', flexShrink: 0 }}>Working days:</span>
                {ALL_DAYS.map(d => {
                  const on = workDays.includes(d)
                  return (
                    <button key={d} className="bt-day" onClick={() => toggleDay(d)} style={{
                      padding: '3px 12px', borderRadius: 20,
                      border: on ? '1px solid #10B981' : '1px solid #E5E7EB',
                      background: on ? '#10B981' : '#fff',
                      color: on ? '#fff' : '#9CA3AF',
                      fontSize: 12, fontWeight: 600,
                      cursor: 'pointer', fontFamily: 'inherit',
                    }}>{d}</button>
                  )
                })}
              </div>
            </div>
          </div>

          {/* ─── BELL TIMING GRID ────────────────────────── */}
          <div>
            <SHeading>BELL TIMING GRID</SHeading>

            <div style={{
              background: '#fff', borderRadius: 10,
              border: '1px solid #E5E7EB', overflow: 'hidden',
            }}>
              {/* Header row */}
              <div style={{
                display: 'grid',
                gridTemplateColumns: '76px 78px 78px 1fr 42px 44px 52px 28px',
                padding: '8px 14px',
                background: '#F9FAFB',
                borderBottom: '1px solid #E5E7EB',
              }}>
                {['Bell', 'Start', 'End', 'Type', 'I–V', 'VI–X', 'XI–XII', ''].map((h, i) => (
                  <div key={i} style={{
                    fontSize: 11, fontWeight: 600, color: '#6B7280',
                    textAlign: i >= 4 && i <= 6 ? 'center' : 'left',
                  }}>{h}</div>
                ))}
              </div>

              {/* Data rows */}
              {rows.map(row => {
                const tm = TYPE_META[row.type]
                return (
                  <div key={row.id} className="bt-row" style={{
                    display: 'grid',
                    gridTemplateColumns: '76px 78px 78px 1fr 42px 44px 52px 28px',
                    padding: '5px 14px',
                    borderBottom: '1px solid #F3F4F6',
                    alignItems: 'center',
                  }}>
                    {/* Bell name */}
                    <input className="bt-cell" value={row.name}
                      onChange={e => updateRow(row.id, { name: e.target.value })} />

                    {/* Start */}
                    <input className="bt-cell" type="time" value={row.start}
                      onChange={e => updateRow(row.id, { start: e.target.value })}
                      style={{ fontFamily: "'DM Mono',monospace", fontSize: 12 }} />

                    {/* End */}
                    <input className="bt-cell" type="time" value={row.end}
                      onChange={e => updateRow(row.id, { end: e.target.value })}
                      style={{ fontFamily: "'DM Mono',monospace", fontSize: 12 }} />

                    {/* Type select */}
                    <select
                      value={row.type}
                      onChange={e => updateRow(row.id, { type: e.target.value as BellType })}
                      style={{
                        padding: '3px 10px', borderRadius: 20,
                        fontSize: 11, fontWeight: 600,
                        background: tm.bg, color: tm.fg,
                        border: `1px solid ${tm.border}`,
                        outline: 'none', cursor: 'pointer',
                        fontFamily: 'inherit', appearance: 'none',
                        textAlign: 'center', width: 90,
                      }}
                    >
                      {BELL_TYPES.map(t => (
                        <option key={t} value={t}>{TYPE_META[t].label}</option>
                      ))}
                    </select>

                    {/* Applicability dots: lower / middle / upper */}
                    {(['lower', 'middle', 'upper'] as const).map(g => (
                      <div key={g} style={{ display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
                        <button className="bt-dot"
                          onClick={() => updateRow(row.id, { [g]: !row[g] })}
                          title={`Toggle ${g}`}
                          style={{ background: row[g] ? '#374151' : '#E5E7EB' }}
                        />
                      </div>
                    ))}

                    {/* Delete */}
                    <button className="bt-del" onClick={() => deleteRow(row.id)} style={{
                      background: 'none', border: 'none', cursor: 'pointer',
                      color: '#FCA5A5', display: 'flex',
                      alignItems: 'center', justifyContent: 'center',
                      padding: 3, opacity: 0, transition: 'opacity 0.13s',
                    }}>
                      <Trash2 size={13} />
                    </button>
                  </div>
                )
              })}

              {/* Table footer buttons */}
              <div style={{
                padding: '10px 14px',
                display: 'flex', gap: 8,
                borderTop: '1px solid #F3F4F6',
              }}>
                <button className="bt-add" onClick={addRow} style={{
                  display: 'inline-flex', alignItems: 'center', gap: 5,
                  padding: '6px 14px', borderRadius: 7,
                  border: '1px solid #E5E7EB', background: '#fff',
                  fontSize: 12, fontWeight: 600, color: '#374151',
                  cursor: 'pointer', fontFamily: 'inherit',
                }}>
                  <Plus size={12} /> Add row
                </button>

                <button className="bt-ai" onClick={() => setRows(DEFAULT_ROWS)} style={{
                  display: 'inline-flex', alignItems: 'center', gap: 5,
                  padding: '6px 14px', borderRadius: 7,
                  border: '1px solid #C4B5FD', background: '#F5F3FF',
                  fontSize: 12, fontWeight: 600, color: '#7C3AED',
                  cursor: 'pointer', fontFamily: 'inherit',
                }}>
                  <Sparkles size={12} /> AI suggest timings
                </button>
              </div>
            </div>
          </div>

        </div>

        {/* ══════════════════════════════════════
            RIGHT COLUMN (sticky)
        ══════════════════════════════════════ */}
        <div style={{ position: 'sticky', top: 16 }}>

          {/* ─── LIVE BELL TIMELINE ──────────────────────── */}
          <SHeading>LIVE BELL TIMELINE</SHeading>

          <div style={{
            background: '#fff', borderRadius: 10,
            border: '1px solid #E5E7EB', overflow: 'hidden',
            marginBottom: 14,
          }}>
            {rows.map((row, i) => {
              const tm = TYPE_META[row.type]
              const dur = minutesDiff(row.start, row.end)
              const grp = groupLabel(row.lower, row.middle, row.upper)
              // Show gap between rows
              const prevEnd = i > 0 ? rows[i - 1].end : null
              const gap = prevEnd ? minutesDiff(prevEnd, row.start) : 0
              return (
                <div key={row.id}>
                  {gap > 1 && (
                    <div style={{
                      padding: '4px 12px',
                      fontSize: 10, color: '#9CA3AF', fontStyle: 'italic',
                      background: '#FAFAFA',
                      borderBottom: '1px dashed #F3F4F6',
                    }}>
                      {gap} min break
                    </div>
                  )}
                  <div style={{
                    display: 'flex', alignItems: 'center', gap: 10,
                    padding: '9px 12px',
                    borderLeft: `3px solid ${tm.line}`,
                    borderBottom: i < rows.length - 1 ? '1px solid #F9FAFB' : 'none',
                  }}>
                    <div style={{
                      fontSize: 12, fontWeight: 700, color: '#374151',
                      fontFamily: "'DM Mono', monospace",
                      minWidth: 38, flexShrink: 0,
                    }}>
                      {fmt12(row.start).replace(/:00 (AM|PM)/, ' $1').replace(/ (AM|PM)$/, '')}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: '#13111E' }}>
                        {row.name}
                      </div>
                      <div style={{ fontSize: 11, color: '#9CA3AF' }}>
                        {dur} min · {grp}
                      </div>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>

          {/* ─── AI CAPACITY ENGINE ──────────────────────── */}
          <div style={{
            background: '#FAF7F0', borderRadius: 10,
            border: '1px solid #E8E0CC', padding: '14px 16px',
          }}>
            <div style={{
              display: 'flex', alignItems: 'center', gap: 6,
              fontSize: 12, fontWeight: 700, color: '#92400E',
              marginBottom: 12,
            }}>
              <Sparkles size={13} color="#D97706" />
              AI capacity engine
            </div>

            {[
              { level: 'Pre-primary', value: capacity.prePrimary },
              { level: 'Primary',     value: capacity.primary    },
              { level: 'Secondary',   value: capacity.secondary  },
            ].map(r => (
              <div key={r.level} style={{
                display: 'flex', justifyContent: 'space-between',
                alignItems: 'center', marginBottom: 8,
              }}>
                <span style={{ fontSize: 13, color: '#6B7280' }}>{r.level}</span>
                <span style={{ fontSize: 13, fontWeight: 700, color: '#13111E' }}>
                  {r.value}
                  <span style={{ fontSize: 11, fontWeight: 400, color: '#9CA3AF' }}> periods/wk</span>
                </span>
              </div>
            ))}
          </div>
        </div>

      </div>

      {/* ══════════════════════════════════════
          FOOTER NAVIGATION
      ══════════════════════════════════════ */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        marginTop: 24, paddingTop: 16,
        borderTop: '1px solid #E5E7EB',
      }}>
        <button
          className="bt-nav-sec"
          onClick={() => window.location.href = '/dashboard'}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 7,
            padding: '9px 18px', borderRadius: 8,
            border: '1px solid #E5E7EB', background: '#fff',
            fontSize: 13, fontWeight: 600, color: '#374151',
            cursor: 'pointer', fontFamily: 'inherit',
          }}
        >
          <ChevronLeft size={14} /> Back
        </button>

        <span style={{ fontSize: 13, color: '#9CA3AF' }}>Step 1 of 5</span>

        <button
          className="bt-nav-pri"
          onClick={handleNext}
          disabled={workDays.length === 0}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 7,
            padding: '9px 20px', borderRadius: 8, border: 'none',
            background: workDays.length > 0 ? '#13111E' : '#E5E7EB',
            color: workDays.length > 0 ? '#fff' : '#9CA3AF',
            fontSize: 13, fontWeight: 700,
            cursor: workDays.length > 0 ? 'pointer' : 'not-allowed',
            fontFamily: 'inherit',
          }}
        >
          Next: Resources <ChevronRight size={14} />
        </button>
      </div>

    </div>
  )
}

// ── Sub-components ────────────────────────────────────────────
function SHeading({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      fontSize: 10, fontWeight: 700, letterSpacing: '0.09em',
      color: '#9CA3AF', textTransform: 'uppercase',
      marginBottom: 8,
    }}>
      {children}
    </div>
  )
}

// ── Shared styles ─────────────────────────────────────────────
const FL: React.CSSProperties = {
  fontSize: 12, color: '#6B7280', marginBottom: 5,
}
const FHint: React.CSSProperties = {
  fontSize: 11, color: '#9CA3AF', marginTop: 3,
}
