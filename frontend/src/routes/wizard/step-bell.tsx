/**
 * Step 1 — Shift & Bell Timing  (v6)
 *
 * v6 changes:
 *  1. CLASS-WISE BREAKS PANEL (new primary feature)
 *     — "Class-wise breaks" button above the Bell Timing Grid opens a
 *       dedicated panel where user sets each break's name, start time, and
 *       duration independently for Pre-Primary / Primary / Middle / Senior.
 *     — "Generate bell timing" rebuilds the full rows array:
 *         • Each group gets its own per-group event sequence
 *           (Assembly → periods ↔ breaks at specified times → Dispersal)
 *         • Identical events (same type+name+start+duration) across groups
 *           are merged into one row with combined class selections.
 *         • Events that differ (e.g. Period 4 for I–XII at 12:05 vs Nur–UKG
 *           at 12:35) become separate rows with the correct class subsets.
 *     — Live Bell Timeline automatically shows per-group tabs whenever
 *       partial-class rows exist (hasPartialBreaks), using filtered start
 *       times so each group sees its own correct schedule.
 *
 *  2. SPLIT-PERIODS BUG FIXES (inline gap row)
 *     — Period name now correctly uses the count of teaching rows BEFORE the
 *       break, not the total count.
 *     — Class assignment:
 *         Period A → classes NOT in break (they have class during break time)
 *         Period B → classes IN break  (they start class after break ends)
 *     — Ordering: Period A first, Period B second → filtered timelines then
 *       compute the correct concurrent/sequential start times automatically.
 *
 *  3. END TIME: formatted display (12H/24H) with inline ✎ edit (v5, kept)
 *  4. GAPROW: + Period / + Break (custom name) buttons (v5, kept)
 */

import {
  useState, useMemo, useEffect, useRef,
  type CSSProperties,
} from 'react'
import { useTimetableStore } from '@/store/timetableStore'
import {
  Plus, Sparkles, ChevronLeft, ChevronRight,
  Trash2, Coffee, X, Calendar, Clock, AlertTriangle, SlidersHorizontal,
} from 'lucide-react'

// ── Types ─────────────────────────────────────────────────────
type RowType = 'assembly' | 'teaching' | 'short-break' | 'lunch' | 'dispersal'

interface BellRow {
  id:       string
  name:     string
  type:     RowType
  duration: number
  classes:  string[]
}

// ── Class-wise breaks types ───────────────────────────────────
interface CwBreakRow {
  id:          string
  name:        string
  type:        'short-break' | 'lunch'
  classes:     string[]  // which class-section keys have this break
  afterPeriod: number    // insert break after this period (0 = after Assembly, 1 = after Period 1, …)
  duration:    number    // minutes
}

// ── Individual class-sections ─────────────────────────────────
const CLASSES = [
  { key: 'nur',  label: 'Nursery',    short: 'Nur',   group: 'Pre-Primary' },
  { key: 'lkg',  label: 'LKG',        short: 'LKG',   group: 'Pre-Primary' },
  { key: 'ukg',  label: 'UKG',        short: 'UKG',   group: 'Pre-Primary' },
  { key: 'i',    label: 'Class I',    short: 'I',     group: 'Primary' },
  { key: 'ii',   label: 'Class II',   short: 'II',    group: 'Primary' },
  { key: 'iii',  label: 'Class III',  short: 'III',   group: 'Primary' },
  { key: 'iv',   label: 'Class IV',   short: 'IV',    group: 'Primary' },
  { key: 'v',    label: 'Class V',    short: 'V',     group: 'Primary' },
  { key: 'vi',   label: 'Class VI',   short: 'VI',    group: 'Middle' },
  { key: 'vii',  label: 'Class VII',  short: 'VII',   group: 'Middle' },
  { key: 'viii', label: 'Class VIII', short: 'VIII',  group: 'Middle' },
  { key: 'ix',   label: 'Class IX',   short: 'IX',    group: 'Middle' },
  { key: 'x',    label: 'Class X',    short: 'X',     group: 'Middle' },
  { key: 'xi',   label: 'Class XI',   short: 'XI',    group: 'Senior' },
  { key: 'xii',  label: 'Class XII',  short: 'XII',   group: 'Senior' },
]

const CLASS_GROUPS = [
  { group: 'Pre-Primary', desc: 'Nursery–UKG',  color: '#7C3AED', bg: '#F5F3FF' },
  { group: 'Primary',     desc: 'Class I–V',     color: '#1D4ED8', bg: '#EFF6FF' },
  { group: 'Middle',      desc: 'Class VI–X',    color: '#059669', bg: '#F0FDF4' },
  { group: 'Senior',      desc: 'Class XI–XII',  color: '#D97706', bg: '#FFFBEB' },
]

const ALL_CLASS_KEYS = CLASSES.map(c => c.key)

// ── Type metadata ──────────────────────────────────────────────
const TYPE_META: Record<RowType, { label: string; bg: string; fg: string; border: string; line: string }> = {
  assembly:     { label: 'Assembly',    bg: '#EDE9FF', fg: '#7C3AED', border: '#C4B5FD', line: '#7C3AED' },
  teaching:     { label: 'Teaching',    bg: '#DBEAFE', fg: '#1D4ED8', border: '#BFDBFE', line: '#3B82F6' },
  'short-break':{ label: 'Short Break', bg: '#F0FDF4', fg: '#15803D', border: '#BBF7D0', line: '#22C55E' },
  lunch:        { label: 'Lunch',       bg: '#FEF3C7', fg: '#D97706', border: '#FDE68A', line: '#F59E0B' },
  dispersal:    { label: 'Dispersal',   bg: '#FEE2E2', fg: '#DC2626', border: '#FECACA', line: '#EF4444' },
}

const ROW_BG: Record<RowType, string> = {
  assembly:     '#F5F3FF',
  teaching:     '#ffffff',
  'short-break':'#F0FDF4',
  lunch:        '#FFFBEB',
  dispersal:    '#FFF1F2',
}

// ── Schedule type options ──────────────────────────────────────
const SCHEDULE_TYPES = [
  { key: 'weekly',       label: 'Weekly',       sub: 'Same schedule every week' },
  { key: 'fortnightly',  label: 'Fortnightly',  sub: '2-week alternating schedule' },
  { key: 'custom-cycle', label: 'Custom Cycle', sub: '3+ week schedule' },
  { key: 'day-rotation', label: 'Day Rotation', sub: 'Custom named days (A/B, 8-day…)' },
] as const
type ScheduleType    = typeof SCHEDULE_TYPES[number]['key']
type PeriodCfgStyle  = 'uniform' | 'custom-day'

const ALL_DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const DAY_TO_FULL: Record<string, string> = {
  Mon: 'MONDAY', Tue: 'TUESDAY', Wed: 'WEDNESDAY',
  Thu: 'THURSDAY', Fri: 'FRIDAY', Sat: 'SATURDAY', Sun: 'SUNDAY',
}

// ── Time helpers ──────────────────────────────────────────────
function toMins(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number)
  return h * 60 + m
}
function toHHMM(mins: number): string {
  return `${String(Math.floor(mins / 60) % 24).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}`
}
function addMins(hhmm: string, mins: number): string {
  return toHHMM(toMins(hhmm) + mins)
}
function fmt12(hhmm: string, use12: boolean): string {
  if (!hhmm) return ''
  if (!use12) return hhmm
  const [h, m] = hhmm.split(':').map(Number)
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`
}

/** Master start-time cascade (each row advances the clock for everyone). */
function computeStarts(startTime: string, rows: BellRow[]): string[] {
  const acc: string[] = []
  let cur = startTime
  for (const r of rows) { acc.push(cur); cur = addMins(cur, r.duration) }
  return acc
}

/**
 * Filtered start-time cascade for a single class key.
 * The clock only advances for rows that include this class.
 * Rows the class is NOT part of contribute zero duration to its timeline.
 *
 * This produces accurate "concurrent" start times for class groups that
 * have different breaks (e.g. I–XII have Period 4 at 12:05 while Nur–UKG
 * are still having lunch; in I–XII's filtered view the lunch is skipped
 * so Period 4 correctly shows 12:05).
 */
function computeStartsFiltered(startTime: string, rows: BellRow[], classKey: string): string[] {
  const acc: string[] = []
  let cur = startTime
  for (const r of rows) {
    acc.push(cur)
    if (r.classes.includes(classKey)) cur = addMins(cur, r.duration)
  }
  return acc
}

function makeId() { return Math.random().toString(36).slice(2, 8) }

// ── NumInput ──────────────────────────────────────────────────
interface NumInputProps {
  value: number; onChange: (n: number) => void
  min?: number; max?: number; className?: string; style?: CSSProperties
}
function NumInput({ value, onChange, min, max, className, style }: NumInputProps) {
  const [local, setLocal] = useState(String(value))
  const focused            = useRef(false)
  useEffect(() => { if (!focused.current) setLocal(String(value)) }, [value])
  const commit = () => {
    focused.current = false
    const n = parseInt(local, 10)
    if (isNaN(n)) { setLocal(String(value)); return }
    const clamped = Math.min(max ?? 99999, Math.max(min ?? 0, n))
    setLocal(String(clamped)); onChange(clamped)
  }
  return (
    <input className={className} style={style} type="text" inputMode="numeric" value={local}
      onChange={e => setLocal(e.target.value.replace(/[^0-9]/g, ''))}
      onFocus={e => { focused.current = true; e.currentTarget.select() }}
      onBlur={commit}
      onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur() }}
    />
  )
}

// ── Row factories ─────────────────────────────────────────────
const mkAssembly  = (): BellRow => ({ id: 'assembly',  name: 'Assembly',  type: 'assembly',  duration: 15, classes: [...ALL_CLASS_KEYS] })
const mkDispersal = (): BellRow => ({ id: makeId(),    name: 'Dispersal', type: 'dispersal', duration: 5,  classes: [...ALL_CLASS_KEYS] })
const mkPeriod    = (n: number, dur: number): BellRow => ({
  id: `p${n}`, name: `Period ${n}`, type: 'teaching', duration: dur, classes: [...ALL_CLASS_KEYS],
})
function buildRows(count: number, dur: number): BellRow[] {
  return [mkAssembly(), ...Array.from({ length: count }, (_, i) => mkPeriod(i + 1, dur)), mkDispersal()]
}

// ── Class-wise bell generation ────────────────────────────────
/**
 * Build a merged BellRow[] from class-wise break configs.
 *
 * Each CwBreakRow specifies "after which period" — no absolute clock times.
 * For every individual class key:
 *   1. Collect its breaks sorted by afterPeriod.
 *   2. Walk periods 1…maxPeriods in order; after each period, flush any breaks
 *      whose afterPeriod equals the period just emitted.
 *
 * Because time is built up sequentially, the absolute startMins of every event
 * is computed exactly — no user input of clock times needed.
 *
 * Then merge all 15 per-class sequences:
 *   • Events identical across classes (same type + name + startMins + duration)
 *     become ONE merged row.
 *   • Events that differ (e.g. Period 4 at 11:15 for I-XII vs Period 4 at 11:45
 *     for Nur-UKG who had a break first) become SEPARATE rows with the correct
 *     subset of classes.
 */
function buildBellRowsFromCw(
  startTimeStr: string,
  periodDur:    number,
  maxPeriods:   number,
  cwBrks:       CwBreakRow[],
): BellRow[] {
  type Ev = { type: RowType; name: string; startMins: number; duration: number }
  const classEvs: Array<{ key: string; evs: Ev[] }> = []

  for (const cls of CLASSES) {
    const evs: Ev[] = []
    let cur = toMins(startTimeStr)

    evs.push({ type: 'assembly', name: 'Assembly', startMins: cur, duration: 15 })
    cur += 15

    // This class's breaks sorted by afterPeriod
    const myBreaks = cwBrks
      .filter(b => b.classes.includes(cls.key))
      .map(b => ({ type: b.type as RowType, name: b.name, afterPeriod: b.afterPeriod, duration: b.duration }))
      .sort((a, b) => a.afterPeriod - b.afterPeriod)

    // Flush breaks that come BEFORE any teaching period (afterPeriod === 0)
    let bi = 0
    while (bi < myBreaks.length && myBreaks[bi].afterPeriod === 0) {
      evs.push({ type: myBreaks[bi].type, name: myBreaks[bi].name, startMins: cur, duration: myBreaks[bi].duration })
      cur += myBreaks[bi].duration
      bi++
    }

    for (let pNum = 1; pNum <= maxPeriods; pNum++) {
      evs.push({ type: 'teaching', name: `Period ${pNum}`, startMins: cur, duration: periodDur })
      cur += periodDur

      // Flush any breaks whose afterPeriod === pNum
      while (bi < myBreaks.length && myBreaks[bi].afterPeriod === pNum) {
        evs.push({ type: myBreaks[bi].type, name: myBreaks[bi].name, startMins: cur, duration: myBreaks[bi].duration })
        cur += myBreaks[bi].duration
        bi++
      }
    }

    evs.push({ type: 'dispersal', name: 'Dispersal', startMins: cur, duration: 5 })
    classEvs.push({ key: cls.key, evs })
  }

  // Merge: events with same type|name|startMins|duration share one row
  const merged = new Map<string, { type: RowType; name: string; startMins: number; duration: number; classes: string[] }>()
  for (const { key, evs } of classEvs) {
    for (const ev of evs) {
      const k = `${ev.type}|${ev.name}|${ev.startMins}|${ev.duration}`
      if (!merged.has(k)) merged.set(k, { ...ev, classes: [] })
      merged.get(k)!.classes.push(key)
    }
  }

  const typeOrd: Record<RowType, number> = { assembly: 0, 'short-break': 1, lunch: 1, teaching: 2, dispersal: 3 }
  const sorted = [...merged.values()].sort((a, b) =>
    a.startMins !== b.startMins ? a.startMins - b.startMins : typeOrd[a.type] - typeOrd[b.type],
  )

  return sorted.map(r => ({
    id:       makeId(),
    name:     r.name,
    type:     r.type,
    duration: r.duration,
    classes:  [...new Set(r.classes)],
  }))
}

// ── Persistence ───────────────────────────────────────────────
const BELL_KEY = 'schedu-bell-v2'
interface SavedBell {
  shiftName: string; startTime: string; use12h: boolean
  periodDur: number; maxPeriods: number; workDays: string[]; rows: BellRow[]
  scheduleType?: ScheduleType; periodCfgStyle?: PeriodCfgStyle
}
function loadSaved(): SavedBell | null {
  try { const s = localStorage.getItem(BELL_KEY); return s ? JSON.parse(s) as SavedBell : null }
  catch { return null }
}

// ══════════════════════════════════════════════════════════════
//  ClasswiseBreaksPanel
// ══════════════════════════════════════════════════════════════
/**
 * Simplified UX: instead of typing a clock time, the user picks
 * "After which period does this break happen?" from a dropdown.
 * The panel derives and shows the calculated clock time as a hint.
 * Users think in periods, not minutes — no arithmetic needed.
 */
function ClasswiseBreaksPanel({
  cwRows, setCwRows, use12h, startTime, periodDur, maxPeriods,
  onGenerate, onClose,
}: {
  cwRows:      CwBreakRow[]
  setCwRows:   React.Dispatch<React.SetStateAction<CwBreakRow[]>>
  use12h:      boolean
  startTime:   string
  periodDur:   number
  maxPeriods:  number
  onGenerate:  () => void
  onClose:     () => void
}) {
  const [openPicker, setOpenPicker] = useState<string | null>(null)

  /** Calculate the clock time a break starts, given it falls after `afterPeriod` periods. */
  const breakStartTime = (afterPeriod: number) =>
    addMins(startTime, 15 /* assembly */ + afterPeriod * periodDur)

  const updateBreak = (id: string, patch: Partial<CwBreakRow>) =>
    setCwRows(prev => prev.map(r => r.id === id ? { ...r, ...patch } : r))

  const updateName = (id: string, name: string) => {
    const type: 'short-break' | 'lunch' = /lunch/i.test(name) ? 'lunch' : 'short-break'
    setCwRows(prev => prev.map(r => r.id === id ? { ...r, name, type } : r))
  }

  const deleteRow = (id: string) => setCwRows(prev => prev.filter(r => r.id !== id))

  const addRow = () => {
    const defaultAfter = Math.max(1, Math.floor(maxPeriods / 2))
    setCwRows(prev => [...prev, {
      id:          makeId(),
      name:        'Break',
      type:        'short-break',
      classes:     [...ALL_CLASS_KEYS],
      afterPeriod: defaultAfter,
      duration:    10,
    }])
  }

  // Period slot options for the dropdown
  const periodOptions: Array<{ value: number; label: string }> = [
    { value: 0, label: 'After Assembly' },
    ...Array.from({ length: maxPeriods }, (_, i) => ({
      value: i + 1,
      label: `After Period ${i + 1}`,
    })),
  ]

  return (
    <div style={{
      background: '#F8F7FF', border: '1.5px solid #C4B5FD', borderRadius: 10,
      padding: '16px 18px', marginBottom: 16,
    }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 6 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 700, color: '#7C3AED', marginBottom: 4 }}>
            <Sparkles size={13} color="#7C3AED" /> Class-wise Breaks
          </div>
          <p style={{ fontSize: 12, color: '#6B7280', margin: 0, lineHeight: 1.5 }}>
            Choose <strong>which classes</strong> have a break and <strong>after which period</strong> it falls.
            Timing is calculated automatically — click <strong>Generate bell timing</strong> when ready.
          </p>
        </div>
        <button onClick={onClose} style={{
          background: 'none', border: 'none', cursor: 'pointer',
          color: '#9CA3AF', padding: 4, display: 'flex', flexShrink: 0, marginLeft: 10,
        }}>
          <X size={14} />
        </button>
      </div>

      {/* Example hint */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 6,
        background: '#EDE9FF', borderRadius: 7, padding: '6px 10px',
        marginBottom: 14, fontSize: 11, color: '#6B7280',
      }}>
        <span style={{ fontSize: 13 }}>💡</span>
        <span>
          e.g. <em>Nursery–UKG</em> have Lunch after Period 3, while <em>Class I–XII</em> have Lunch after Period 5.
          The system automatically creates split periods with correct start times for each group.
        </span>
      </div>

      {/* Column headers */}
      {cwRows.length > 0 && (
        <div style={{
          display: 'grid',
          gridTemplateColumns: '1.4fr 1.3fr 1.6fr 84px 28px',
          gap: 10, padding: '0 12px 6px',
        }}>
          {['Break name', 'Applies to', 'After which period', 'Duration', ''].map((h, i) => (
            <div key={i} style={{ fontSize: 10, fontWeight: 600, color: '#9CA3AF', letterSpacing: '0.05em' }}>{h}</div>
          ))}
        </div>
      )}

      {/* Break rows */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 14 }}>
        {cwRows.map(row => {
          const bStart = breakStartTime(row.afterPeriod)
          const bEnd   = addMins(bStart, row.duration)
          return (
            <div key={row.id} style={{
              display: 'grid',
              gridTemplateColumns: '1.4fr 1.3fr 1.6fr 84px 28px',
              gap: 10, alignItems: 'center',
              padding: '10px 12px',
              background: '#fff', borderRadius: 8,
              border: '1px solid #EDE9FF',
            }}>

              {/* Name + type badge */}
              <div>
                <input
                  value={row.name}
                  onChange={e => updateName(row.id, e.target.value)}
                  placeholder="Break name…"
                  style={{
                    width: '100%', padding: '5px 8px',
                    border: '1px solid #E5E7EB', borderRadius: 6,
                    fontSize: 12, fontFamily: 'inherit', outline: 'none', background: '#fff',
                    marginBottom: 5,
                  }}
                />
                <span style={{
                  display: 'inline-block',
                  padding: '1px 8px', borderRadius: 10,
                  background: TYPE_META[row.type].bg,
                  color: TYPE_META[row.type].fg,
                  border: `1px solid ${TYPE_META[row.type].border}`,
                  fontSize: 10, fontWeight: 600,
                }}>
                  {TYPE_META[row.type].label}
                </span>
              </div>

              {/* Class-section picker */}
              <div>
                <ClassPicker
                  classes={row.classes}
                  onChange={cls => updateBreak(row.id, { classes: cls })}
                  rowId={row.id}
                  openId={openPicker}
                  setOpenId={setOpenPicker}
                />
                {row.classes.length > 0 && row.classes.length < ALL_CLASS_KEYS.length && (
                  <div style={{ fontSize: 10, color: '#9CA3AF', marginTop: 4 }}>
                    {row.classes.length} of {ALL_CLASS_KEYS.length} classes
                  </div>
                )}
              </div>

              {/* "After Period N" selector + time hint */}
              <div>
                <select
                  value={row.afterPeriod}
                  onChange={e => updateBreak(row.id, { afterPeriod: Number(e.target.value) })}
                  style={{
                    width: '100%', padding: '5px 7px',
                    border: '1px solid #C4B5FD', borderRadius: 6,
                    fontSize: 12, fontFamily: 'inherit', outline: 'none',
                    background: '#F8F7FF', color: '#7C3AED', fontWeight: 600,
                    cursor: 'pointer', marginBottom: 5,
                  }}
                >
                  {periodOptions.map(o => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
                {/* Calculated time hint */}
                <div style={{ fontSize: 10, color: '#7C3AED', fontFamily: "'DM Mono',monospace" }}>
                  {fmt12(bStart, use12h)} → {fmt12(bEnd, use12h)}
                </div>
              </div>

              {/* Duration */}
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                  <NumInput
                    value={row.duration} min={5} max={180}
                    onChange={d => updateBreak(row.id, { duration: d })}
                    style={{
                      width: 44, padding: '5px 5px', textAlign: 'center',
                      border: '1px solid #E5E7EB', borderRadius: 6,
                      fontSize: 13, fontFamily: "'DM Mono',monospace",
                      fontWeight: 700, outline: 'none', background: '#fff',
                    }}
                  />
                  <span style={{ fontSize: 10, color: '#9CA3AF', whiteSpace: 'nowrap' }}>min</span>
                </div>
              </div>

              {/* Delete */}
              <button onClick={() => deleteRow(row.id)} style={{
                background: 'none', border: 'none', cursor: 'pointer',
                color: '#FCA5A5', padding: 3, display: 'flex', alignSelf: 'center',
              }}>
                <Trash2 size={13} />
              </button>
            </div>
          )
        })}

        {/* Empty state */}
        {cwRows.length === 0 && (
          <div style={{
            textAlign: 'center', padding: '20px 0', color: '#9CA3AF', fontSize: 12,
          }}>
            No breaks added yet. Click <strong>+ Add break</strong> to get started.
          </div>
        )}
      </div>

      {/* Add break */}
      <button onClick={addRow} style={{
        display: 'inline-flex', alignItems: 'center', gap: 5,
        padding: '5px 12px', borderRadius: 7,
        border: '1px solid #C4B5FD', background: 'transparent',
        color: '#7C3AED', fontSize: 11, fontWeight: 600,
        cursor: 'pointer', fontFamily: 'inherit', marginBottom: 14,
      }}>
        <Plus size={10} /> Add break
      </button>

      {/* Footer */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'flex-end',
        gap: 10, paddingTop: 12, borderTop: '1px solid #EDE9FF',
      }}>
        <button onClick={onClose} style={{
          padding: '7px 16px', borderRadius: 7,
          border: '1px solid #D1D5DB', background: '#fff',
          fontSize: 12, fontWeight: 600, color: '#374151',
          cursor: 'pointer', fontFamily: 'inherit',
        }}>
          Cancel
        </button>
        <button onClick={onGenerate} disabled={cwRows.length === 0} style={{
          display: 'inline-flex', alignItems: 'center', gap: 6,
          padding: '7px 18px', borderRadius: 7, border: 'none',
          background: cwRows.length > 0 ? '#7C3AED' : '#E5E7EB',
          color: cwRows.length > 0 ? '#fff' : '#9CA3AF',
          fontSize: 12, fontWeight: 700,
          cursor: cwRows.length > 0 ? 'pointer' : 'default', fontFamily: 'inherit',
        }}>
          <Sparkles size={11} /> Generate bell timing
        </button>
      </div>
    </div>
  )
}

// ── ClassPicker ───────────────────────────────────────────────
function ClassPicker({
  classes, onChange, rowId, openId, setOpenId,
}: {
  classes: string[]; onChange: (c: string[]) => void
  rowId: string; openId: string | null; setOpenId: (id: string | null) => void
}) {
  const isOpen = openId === rowId
  const ref    = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!isOpen) return
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpenId(null) }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [isOpen, setOpenId])
  const isAll  = ALL_CLASS_KEYS.every(k => classes.includes(k))
  const isNone = classes.length === 0
  const label  = isAll ? 'All' : isNone ? '—'
    : classes.length <= 3 ? classes.map(k => CLASSES.find(c => c.key === k)?.short ?? k).join(', ')
    : `${classes.length} classes`
  const toggleOne = (key: string, chk: boolean) =>
    onChange(chk ? [...classes, key] : classes.filter(c => c !== key))
  const toggleGroup = (group: string, chk: boolean) => {
    const gk = CLASSES.filter(c => c.group === group).map(c => c.key)
    onChange(chk ? [...new Set([...classes, ...gk])] : classes.filter(k => !gk.includes(k)))
  }
  return (
    <div ref={ref} style={{ position: 'relative', display: 'inline-block' }}>
      <button onClick={() => setOpenId(isOpen ? null : rowId)} style={{
        padding: '3px 9px', borderRadius: 6, border: '1px solid #E5E7EB',
        background: isAll ? '#F0EDFF' : isNone ? '#FFF' : '#F9FAFB',
        fontSize: 11, fontWeight: 600, color: isAll ? '#7C3AED' : '#374151',
        cursor: 'pointer', whiteSpace: 'nowrap', fontFamily: 'inherit',
        display: 'flex', alignItems: 'center', gap: 4, maxWidth: 110, overflow: 'hidden',
      }}>
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{label}</span>
        <svg width="8" height="8" viewBox="0 0 8 8" fill="none" style={{ flexShrink: 0 }}>
          <path d="M1 2.5l3 3 3-3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </button>
      {isOpen && (
        <div style={{
          position: 'absolute', right: 0, top: 'calc(100% + 4px)',
          background: '#fff', border: '1px solid #E5E7EB',
          borderRadius: 10, boxShadow: '0 8px 24px rgba(0,0,0,0.13)',
          zIndex: 400, width: 200, maxHeight: 340, overflowY: 'auto', padding: '6px 0',
        }}>
          <label style={PICK_ROW}>
            <input type="checkbox" checked={isAll}
              ref={el => { if (el) el.indeterminate = !isAll && !isNone }}
              onChange={e => onChange(e.target.checked ? [...ALL_CLASS_KEYS] : [])}
              style={{ accentColor: '#7C6FE0', flexShrink: 0 }} />
            <span style={{ fontSize: 12, fontWeight: 700, color: '#13111E' }}>All classes</span>
          </label>
          {CLASS_GROUPS.map(gm => {
            const gc    = CLASSES.filter(c => c.group === gm.group)
            const gk    = gc.map(c => c.key)
            const allIn = gk.every(k => classes.includes(k))
            const anyIn = gk.some(k => classes.includes(k))
            return (
              <div key={gm.group}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 12px 3px', marginTop: 4, borderTop: '1px solid #F3F4F6', background: gm.bg }}>
                  <input type="checkbox" checked={allIn}
                    ref={el => { if (el) el.indeterminate = !allIn && anyIn }}
                    onChange={e => toggleGroup(gm.group, e.target.checked)}
                    style={{ accentColor: gm.color, flexShrink: 0 }} />
                  <span style={{ fontSize: 11, fontWeight: 700, color: gm.color, letterSpacing: '0.04em' }}>{gm.group.toUpperCase()}</span>
                  <span style={{ fontSize: 10, color: '#9CA3AF', marginLeft: 'auto' }}>{gm.desc}</span>
                </div>
                {gc.map(cls => (
                  <label key={cls.key} style={{ ...PICK_ROW, paddingLeft: 28 }}>
                    <input type="checkbox" checked={classes.includes(cls.key)}
                      onChange={e => toggleOne(cls.key, e.target.checked)}
                      style={{ accentColor: gm.color, flexShrink: 0 }} />
                    <span style={{ fontSize: 12, color: '#374151' }}>{cls.label}</span>
                  </label>
                ))}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
const PICK_ROW: CSSProperties = { display: 'flex', alignItems: 'center', gap: 8, padding: '5px 12px', cursor: 'pointer' }

// ══════════════════════════════════════════════════════════════
//  GapRow — always-visible strip between bell rows
// ══════════════════════════════════════════════════════════════
function GapRow({
  afterIndex, rows, onInsertBreak, onInsertPeriod, onInsertSplit,
}: {
  afterIndex: number; rows: BellRow[]
  onInsertBreak: (afterIndex: number, name: string) => void
  onInsertPeriod: (afterIndex: number) => void
  onInsertSplit: (afterIndex: number) => void
}) {
  const [mode,      setMode]      = useState<'idle' | 'break'>('idle')
  const [breakName, setBreakName] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const aboveRow = rows[afterIndex]
  const isPartialBreak = aboveRow
    && (aboveRow.type === 'short-break' || aboveRow.type === 'lunch')
    && aboveRow.classes.length > 0 && aboveRow.classes.length < ALL_CLASS_KEYS.length
  useEffect(() => { if (mode === 'break') inputRef.current?.focus() }, [mode])
  const confirmBreak = () => {
    onInsertBreak(afterIndex, breakName.trim() || 'Break')
    setMode('idle'); setBreakName('')
  }
  if (mode === 'break') {
    return (
      <div style={{
        position: 'relative', height: 34,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        {/* hairline */}
        <div style={{ position: 'absolute', left: 0, right: 0, height: 1, background: '#FDE68A' }} />
        <div style={{
          position: 'relative', zIndex: 1,
          display: 'inline-flex', alignItems: 'center', gap: 6,
          background: '#FFFBEB', padding: '4px 10px', borderRadius: 8,
          border: '1px solid #FDE68A', boxShadow: '0 1px 4px rgba(217,119,6,0.10)',
        }}>
          <Coffee size={10} color="#D97706" style={{ flexShrink: 0 }} />
          <span style={{ fontSize: 10, color: '#D97706', fontWeight: 600, flexShrink: 0 }}>Name:</span>
          <input ref={inputRef} value={breakName} onChange={e => setBreakName(e.target.value)}
            placeholder="e.g. Morning Break, Lunch…"
            onKeyDown={e => { if (e.key === 'Enter') confirmBreak(); if (e.key === 'Escape') { setMode('idle'); setBreakName('') } }}
            style={{ width: 160, padding: '2px 7px', borderRadius: 5, border: '1px solid #FDE68A', fontSize: 11, fontFamily: 'inherit', outline: 'none', background: '#fff' }}
          />
          <button onClick={confirmBreak} style={{ padding: '2px 10px', borderRadius: 5, border: 'none', background: '#D97706', color: '#fff', fontSize: 10, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', flexShrink: 0 }}>Add</button>
          <button onClick={() => { setMode('idle'); setBreakName('') }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9CA3AF', padding: 2, display: 'flex' }}><X size={10} /></button>
        </div>
      </div>
    )
  }
  return (
    <div style={{
      position: 'relative', height: 26,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      {/* hairline divider behind the buttons */}
      <div style={{ position: 'absolute', left: 14, right: 14, height: 1, background: '#E9E9E9' }} />
      {/* centered pill cluster */}
      <div style={{
        position: 'relative', zIndex: 1,
        display: 'inline-flex', alignItems: 'center', gap: 4,
        background: '#F5F4F0', padding: '0 6px',
      }}>
        <button className="gap-btn" onClick={() => onInsertPeriod(afterIndex)} style={{
          display: 'inline-flex', alignItems: 'center', gap: 3,
          padding: '2px 9px', borderRadius: 12,
          border: '1px solid #BFDBFE', background: 'transparent',
          color: '#1D4ED8', fontSize: 10, fontWeight: 600,
          cursor: 'pointer', fontFamily: 'inherit',
        }}>
          <Plus size={8} /> Period
        </button>
        <span style={{ width: 1, height: 10, background: '#D1D5DB', flexShrink: 0 }} />
        <button className="gap-btn" onClick={() => setMode('break')} style={{
          display: 'inline-flex', alignItems: 'center', gap: 3,
          padding: '2px 9px', borderRadius: 12,
          border: '1px solid #FDE68A', background: 'transparent',
          color: '#D97706', fontSize: 10, fontWeight: 600,
          cursor: 'pointer', fontFamily: 'inherit',
        }}>
          <Coffee size={8} /> Break
        </button>
        {isPartialBreak && (
          <>
            <span style={{ width: 1, height: 10, background: '#D1D5DB', flexShrink: 0 }} />
            <button className="gap-btn" onClick={() => onInsertSplit(afterIndex)}
              title={`Auto-create two periods: one for classes NOT in "${aboveRow.name}", one for classes IN it`}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 3,
                padding: '2px 9px', borderRadius: 12,
                border: '1px solid #C4B5FD', background: '#F5F3FF',
                color: '#7C3AED', fontSize: 10, fontWeight: 600,
                cursor: 'pointer', fontFamily: 'inherit',
              }}>
              <Sparkles size={8} /> Split periods
            </button>
          </>
        )}
      </div>
    </div>
  )
}

// ══════════════════════════════════════════════════════════════
//  LiveBellTimeline — single timeline panel for one class group
// ══════════════════════════════════════════════════════════════
function LiveBellTimeline({
  title, color, data, use12h,
}: {
  title:   string
  color:   string
  data:    Array<{ row: BellRow; start: string }>
  use12h:  boolean
}) {
  if (data.length === 0) return null
  return (
    <div style={{ background: '#fff', borderRadius: 10, border: '1px solid #E5E7EB', overflow: 'hidden', flex: 1, minWidth: 0 }}>
      {/* Group header */}
      <div style={{ padding: '6px 10px', borderBottom: '1px solid #F3F4F6', background: '#FAFAFA', display: 'flex', alignItems: 'center', gap: 5 }}>
        <span style={{ width: 6, height: 6, borderRadius: '50%', background: color, flexShrink: 0, display: 'inline-block' }} />
        <span style={{ fontSize: 11, fontWeight: 700, color, letterSpacing: '0.03em' }}>{title}</span>
      </div>
      {data.map(({ row, start }, idx) => {
        const tm  = TYPE_META[row.type]
        const grp = row.classes.length === ALL_CLASS_KEYS.length ? 'All'
          : row.classes.length === 0 ? '—'
          : row.classes.length <= 4 ? row.classes.map(k => CLASSES.find(c => c.key === k)?.short ?? k).join(', ')
          : `${row.classes.length} classes`
        return (
          <div key={row.id + idx} style={{
            display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px',
            borderLeft: `3px solid ${tm.line}`,
            borderBottom: idx < data.length - 1 ? '1px solid #F9FAFB' : 'none',
          }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: '#374151', fontFamily: "'DM Mono',monospace", minWidth: 56, flexShrink: 0 }}>
              {fmt12(start, use12h)}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: '#13111E', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{row.name}</div>
              <div style={{ fontSize: 9, color: '#9CA3AF' }}>{row.duration} min · {grp}</div>
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ══════════════════════════════════════════════════════════════
//  Main component
// ══════════════════════════════════════════════════════════════
export function StepBell() {
  const { config, setConfig, setStep, setBreaks } = useTimetableStore()
  const [_saved] = useState<SavedBell | null>(loadSaved)

  const [shiftName,  setShiftName]  = useState<string>(  () => _saved?.shiftName ?? 'Main Shift')
  const [startTime,  setStartTime]  = useState<string>(  () => _saved?.startTime ?? (config.startTime ?? '09:00'))
  const [use12h,     setUse12h]     = useState<boolean>( () => _saved?.use12h ?? true)
  const [periodDur,  setPeriodDur]  = useState<number>(  () => _saved?.periodDur ?? (config.defaultSessionDuration ?? 40))
  const [maxPeriods, setMaxPeriods] = useState<number>(  () => _saved?.maxPeriods ?? (config.periodsPerDay ?? 8))
  const [workDays,   setWorkDays]   = useState<string[]>(() => {
    if (_saved?.workDays?.length) return _saved.workDays
    return config.workDays?.length ? config.workDays.map(d => d.charAt(0) + d.slice(1, 3).toLowerCase()) : ['Mon', 'Tue', 'Wed', 'Thu', 'Fri']
  })
  const [rows, setRows] = useState<BellRow[]>(() => {
    if (_saved?.rows?.length) return _saved.rows
    const dur = _saved?.periodDur ?? (config.defaultSessionDuration ?? 40)
    const cnt = _saved?.maxPeriods ?? (config.periodsPerDay ?? 8)
    return buildRows(cnt, dur)
  })

  const [scheduleType,    setScheduleType]    = useState<ScheduleType>(   () => _saved?.scheduleType   ?? 'weekly')
  const [pendingSchedType, setPendingSchedType] = useState<ScheduleType | null>(null)
  const [periodCfgStyle,  setPeriodCfgStyle]  = useState<PeriodCfgStyle>(() => _saved?.periodCfgStyle ?? 'uniform')

  const [openPicker,    setOpenPicker]    = useState<string | null>(null)
  const [editingEnd,    setEditingEnd]    = useState(false)
  const [showCwPanel,   setShowCwPanel]   = useState(false)
  const [cwRows,        setCwRows]        = useState<CwBreakRow[]>([])

  // ── Persistence ───────────────────────────────────────────────
  useEffect(() => {
    localStorage.setItem(BELL_KEY, JSON.stringify({
      shiftName, startTime, use12h, periodDur, maxPeriods, workDays, rows,
      scheduleType, periodCfgStyle,
    } satisfies SavedBell))
  }, [shiftName, startTime, use12h, periodDur, maxPeriods, workDays, rows, scheduleType, periodCfgStyle])

  // ── Derived: start-time cascades ──────────────────────────────
  const startTimes = useMemo(() => computeStarts(startTime, rows), [startTime, rows])

  // ── Partial-break detection ───────────────────────────────────
  const hasPartialBreaks = useMemo(() =>
    rows.some(r =>
      (r.type === 'short-break' || r.type === 'lunch') &&
      r.classes.length > 0 && r.classes.length < ALL_CLASS_KEYS.length,
    ), [rows])

  /**
   * Per-row display start times for the bell grid.
   *
   * Problem with the naive master-clock (computeStarts): when a break applies
   * to only some classes (e.g. Lunch for Nur-UKG), the master clock still
   * advances by the break duration for ALL subsequent rows — so Period 4 for
   * I-XII would wrongly show 11:45 instead of 11:15, and the end time
   * accumulates every split row's duration even for concurrent events.
   *
   * Fix: for each row use computeStartsFiltered with that row's own first class
   * as the representative key.  The filtered clock only advances for rows that
   * include that class, so concurrent split-periods each show their own correct
   * start time independent of breaks they're not part of.
   *
   * endTime is derived from rowStartTimes so it too reflects the correct wall
   * clock time rather than the inflated master-clock sum.
   */
  const rowStartTimes = useMemo((): string[] => {
    if (!hasPartialBreaks) return startTimes
    // Cache filtered timelines by class key to avoid redundant passes
    const cache = new Map<string, string[]>()
    const getFiltered = (key: string) => {
      if (!cache.has(key)) cache.set(key, computeStartsFiltered(startTime, rows, key))
      return cache.get(key)!
    }
    return rows.map((row, i) => {
      const repKey = row.classes[0] ?? ALL_CLASS_KEYS[0]
      return getFiltered(repKey)[i]
    })
  }, [hasPartialBreaks, rows, startTime, startTimes])

  /**
   * School end time = start of the last row (using filtered clock) + its duration.
   * Using rowStartTimes instead of startTimes prevents the master-clock inflation
   * from concurrent split rows (e.g. two Period 4s at the same clock time) from
   * doubling up in the end-time calculation.
   */
  const endTime = useMemo(() => {
    if (rows.length === 0) return startTime
    return addMins(rowStartTimes[rows.length - 1], rows[rows.length - 1].duration)
  }, [rows, rowStartTimes, startTime])

  // ── Timeline data: per-group filtered if partial breaks exist ─
  const groupTimelineData = useMemo(() => {
    return CLASS_GROUPS.map(gm => {
      const groupKeys = CLASSES.filter(c => c.group === gm.group).map(c => c.key)
      const repKey    = groupKeys[0]
      const fStarts   = hasPartialBreaks
        ? computeStartsFiltered(startTime, rows, repKey)
        : startTimes

      const data = rows
        .map((row, i) => ({ row, start: fStarts[i] }))
        .filter(({ row }) => row.classes.some(k => groupKeys.includes(k)))

      return { gm, data }
    })
  }, [hasPartialBreaks, startTime, rows, startTimes])

  // Master timeline (all rows, no filter)
  const masterTimelineData = useMemo(() =>
    rows.map((row, i) => ({ row, start: startTimes[i] })),
    [rows, startTimes],
  )

  // ── Class-wise breaks panel ───────────────────────────────────
  const handleOpenCwPanel = () => {
    // Pre-populate from existing break rows if not yet configured
    if (cwRows.length === 0) {
      const existingBreaks = rows.filter(r => r.type === 'short-break' || r.type === 'lunch')
      if (existingBreaks.length > 0) {
        setCwRows(existingBreaks.map(r => {
          const idx = rows.indexOf(r)
          // afterPeriod = number of teaching rows that appear before this break
          const afterPeriod = rows.slice(0, idx).filter(rr => rr.type === 'teaching').length
          return {
            id:          r.id,
            name:        r.name,
            type:        r.type as 'short-break' | 'lunch',
            classes:     r.classes.length > 0 ? r.classes : [...ALL_CLASS_KEYS],
            afterPeriod,
            duration:    r.duration,
          }
        }))
      } else {
        // Default: lunch after the midpoint period, all classes
        setCwRows([{
          id:          makeId(),
          name:        'Lunch Break',
          type:        'lunch',
          classes:     [...ALL_CLASS_KEYS],
          afterPeriod: Math.max(1, Math.floor(maxPeriods / 2)),
          duration:    30,
        }])
      }
    }
    setShowCwPanel(true)
  }

  const handleGenerateFromCw = () => {
    const newRows = buildBellRowsFromCw(startTime, periodDur, maxPeriods, cwRows)
    setRows(newRows)
    setShowCwPanel(false)
  }

  // ── Other handlers ────────────────────────────────────────────
  const handleEndTimeEdit = (val: string) => {
    if (!val || !/^\d{2}:\d{2}$/.test(val)) return
    const target = toMins(val) - toMins(startTime)
    if (target <= 0) return
    const current = rows.reduce((s, r) => s + r.duration, 0)
    const diff    = target - current
    if (diff === 0) return
    setRows(prev => {
      const next = [...prev]
      for (let i = next.length - 1; i >= 0; i--) {
        if (next[i].type === 'teaching') {
          next[i] = { ...next[i], duration: Math.max(5, next[i].duration + diff) }
          return next
        }
      }
      if (next.length > 0) next[next.length - 1] = { ...next[next.length - 1], duration: Math.max(5, next[next.length - 1].duration + diff) }
      return next
    })
  }

  const handlePeriodDurChange = (d: number) => {
    const v = Math.max(10, d)
    setPeriodDur(v)
    setRows(prev => prev.map(r => r.type === 'teaching' ? { ...r, duration: v } : r))
  }

  const handleMaxPeriodsChange = (n: number) => {
    const v = Math.max(1, Math.min(16, n))
    setMaxPeriods(v)
    setRows(prev => {
      const asm  = prev.find(r => r.type === 'assembly')  ?? mkAssembly()
      const dis  = prev.find(r => r.type === 'dispersal') ?? mkDispersal()
      const brks = prev.filter(r => r.type === 'short-break' || r.type === 'lunch')
      const prs  = Array.from({ length: v }, (_, i) => {
        const ex = prev.find(r => r.id === `p${i + 1}`)
        return ex ? { ...ex, duration: periodDur } : mkPeriod(i + 1, periodDur)
      })
      return [asm, ...prs, ...brks, dis]
    })
  }

  const toggleDay = (d: string) =>
    setWorkDays(w => w.includes(d) ? w.filter(x => x !== d) : [...w, d])

  const updateRow = (id: string, patch: Partial<BellRow>) =>
    setRows(prev => prev.map(r => r.id === id ? { ...r, ...patch } : r))

  const deleteRow = (id: string) => setRows(prev => prev.filter(x => x.id !== id))

  const insertBreak = (afterIndex: number, name: string) => {
    const type: RowType = /lunch/i.test(name) ? 'lunch' : 'short-break'
    const newRow: BellRow = { id: makeId(), name, type, duration: type === 'lunch' ? 30 : 10, classes: [...ALL_CLASS_KEYS] }
    setRows(prev => { const n = [...prev]; n.splice(afterIndex + 1, 0, newRow); return n })
  }

  const insertPeriodAt = (afterIndex: number) => {
    // Period number = count of teaching rows before this position + 1
    const count  = rows.slice(0, afterIndex + 1).filter(r => r.type === 'teaching').length
    const newRow = mkPeriod(count + 1, periodDur)
    newRow.id    = makeId()
    setRows(prev => { const n = [...prev]; n.splice(afterIndex + 1, 0, newRow); return n })
  }

  /**
   * Insert two split teaching rows after a partial-class break.
   *
   * breakRow at `afterIndex` has partial classes (e.g. only Nur-UKG).
   *
   *   Period A (classesNOT in break): conceptually starts at break's start time.
   *     In filtered I–XII timeline: break is skipped → Period A's filtered
   *     start = break start. ✓
   *
   *   Period B (classes IN break): starts after break ends.
   *     In filtered Nur-UKG timeline: Period A is skipped → Period B's
   *     filtered start = break end time. ✓
   *
   * Period name = next sequential period AFTER the last teaching row
   * that appears BEFORE the break (not the total count of all teaching rows).
   */
  const insertSplitPeriods = (afterIndex: number) => {
    const breakRow = rows[afterIndex]
    if (!breakRow) return
    const classesInBreak    = breakRow.classes
    const classesNotInBreak = ALL_CLASS_KEYS.filter(k => !classesInBreak.includes(k))
    if (classesNotInBreak.length === 0 || classesInBreak.length === 0) return

    // Period name: count only teaching rows BEFORE the break
    const periodsBeforeBreak = rows.slice(0, afterIndex).filter(r => r.type === 'teaching').length
    const name               = `Period ${periodsBeforeBreak + 1}`

    const periodA: BellRow = { id: makeId(), name, type: 'teaching', duration: periodDur, classes: classesNotInBreak }
    const periodB: BellRow = { id: makeId(), name, type: 'teaching', duration: periodDur, classes: classesInBreak    }

    setRows(prev => {
      const next = [...prev]
      next.splice(afterIndex + 1, 0, periodA, periodB)
      return next
    })
  }

  const handleAISuggest = () => {
    let curMins = toMins(startTime)
    const result: BellRow[] = []
    result.push({ id: makeId(), name: 'Assembly', type: 'assembly', duration: 15, classes: [...ALL_CLASS_KEYS] })
    curMins += 15
    result.push({ id: makeId(), name: 'Morning Break', type: 'short-break', duration: 10, classes: [...ALL_CLASS_KEYS] })
    curMins += 10
    let lunchAdded = false
    for (let i = 0; i < maxPeriods; i++) {
      result.push(mkPeriod(i + 1, periodDur))
      curMins += periodDur
      if (!lunchAdded && curMins >= 720) {
        result.push({ id: makeId(), name: 'Lunch Break', type: 'lunch', duration: 30, classes: [...ALL_CLASS_KEYS] })
        curMins += 30; lunchAdded = true
      }
    }
    if (!lunchAdded && maxPeriods > 0)
      result.splice(2 + Math.ceil(maxPeriods / 2), 0, { id: makeId(), name: 'Lunch Break', type: 'lunch', duration: 30, classes: [...ALL_CLASS_KEYS] })
    result.push({ id: makeId(), name: 'Afternoon Break', type: 'short-break', duration: 10, classes: [...ALL_CLASS_KEYS] })
    result.push({ id: makeId(), name: 'Dispersal', type: 'dispersal', duration: 5, classes: [...ALL_CLASS_KEYS] })
    setRows(result)
  }

  const capacity = useMemo(() => {
    const tRows = rows.filter(r => r.type === 'teaching')
    return CLASS_GROUPS.map(gm => {
      const gk = CLASSES.filter(c => c.group === gm.group).map(c => c.key)
      return { label: gm.group, desc: gm.desc, color: gm.color, count: tRows.filter(r => gk.some(k => r.classes.includes(k))).length * workDays.length }
    })
  }, [rows, workDays.length])

  // ── Schedule type ─────────────────────────────────────────────
  const handleScheduleTypeClick = (key: ScheduleType) => {
    if (key === scheduleType) return
    setPendingSchedType(key)
  }
  const handleConfirmScheduleType = () => {
    if (!pendingSchedType) return
    setScheduleType(pendingSchedType)
    setPendingSchedType(null)
    // Reset bell rows and class-wise breaks
    setRows(buildRows(maxPeriods, periodDur))
    setCwRows([])
    setShowCwPanel(false)
  }

  const handleNext = () => {
    setConfig({
      workDays: workDays.map(d => DAY_TO_FULL[d] ?? d.toUpperCase()),
      startTime, endTime, periodsPerDay: maxPeriods, defaultSessionDuration: periodDur,
    } as any)
    setBreaks(rows.filter(r => r.type !== 'teaching').map(r => ({
      id: r.id, name: r.name, duration: r.duration, type: r.type as any, shiftable: r.type === 'short-break',
    })))
    setStep(2)
  }

  // ── Render ────────────────────────────────────────────────────
  return (
    <div style={{ padding: '20px 28px 32px', maxWidth: 1280, margin: '0 auto', fontFamily: "'Inter', -apple-system, sans-serif" }}>
      <style>{`
        .b-input { padding:8px 10px;border:1px solid #E5E7EB;border-radius:7px;font-size:13px;font-family:inherit;color:#13111E;background:#fff;outline:none;transition:border-color .15s,box-shadow .15s; }
        .b-input:focus { border-color:#7C6FE0;box-shadow:0 0 0 3px rgba(124,111,224,.10); }
        .b-end-display:hover { border-color:#C4B5FD !important;cursor:pointer; }
        .b-cell { padding:4px 7px;border:1px solid transparent;border-radius:5px;font-size:13px;font-family:inherit;color:#13111E;background:transparent;outline:none;width:100%;transition:border-color .12s,background .12s; }
        .b-cell:hover  { border-color:#E5E7EB;background:#F9FAFB; }
        .b-cell:focus  { border-color:#7C6FE0;background:#fff;box-shadow:0 0 0 2px rgba(124,111,224,.08); }
        .b-dur { padding:4px 6px;border:1px solid #E5E7EB;border-radius:5px;font-size:12px;font-family:'DM Mono',monospace;color:#13111E;background:#F9FAFB;outline:none;width:52px;text-align:center;transition:border-color .12s; }
        .b-dur:focus { border-color:#7C6FE0;background:#fff; }
        .b-row { border-bottom:1px solid #F3F4F6; }
        .b-row:last-child { border-bottom:none; }
        .b-row:hover .b-del { opacity:1 !important; }
        .b-del { transition:opacity .13s; }
        .b-day { transition:background .12s,border-color .12s,color .12s;cursor:pointer; }
        .b-day:hover { opacity:.85; }
        .b-nav-sec { transition:background .13s; }
        .b-nav-sec:hover { background:#F3F4F6 !important; }
        .b-nav-pri { transition:background .13s; }
        .b-nav-pri:hover { background:#1a1730 !important; }
        .gap-btn { transition:background .12s,border-color .12s; }
        .gap-btn:hover { background:rgba(0,0,0,0.03) !important; }
      `}</style>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: 20, alignItems: 'start' }}>

        {/* ══════════ LEFT ══════════ */}
        <div>

          {/* ─── SCHEDULE TYPE ─── */}
          <div style={{ marginBottom: 20 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 12 }}>
              <Calendar size={15} color="#7C6FE0" />
              <span style={{ fontSize: 14, fontWeight: 700, color: '#13111E', letterSpacing: '-0.2px' }}>Schedule Type</span>
            </div>

            {/* 4-option grid */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 }}>
              {SCHEDULE_TYPES.map(st => {
                const active = scheduleType === st.key
                return (
                  <button key={st.key} onClick={() => handleScheduleTypeClick(st.key)} style={{
                    padding: '14px 10px', borderRadius: 10, textAlign: 'center',
                    border: active ? '2px solid #7C6FE0' : '1.5px solid #E5E7EB',
                    background: active ? '#F5F2FF' : '#fff',
                    cursor: 'pointer', fontFamily: 'inherit',
                    transition: 'border-color .15s, background .15s',
                  }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: active ? '#7C6FE0' : '#13111E', marginBottom: 4 }}>
                      {st.label}
                    </div>
                    <div style={{ fontSize: 11, color: '#9CA3AF', lineHeight: 1.4 }}>{st.sub}</div>
                  </button>
                )
              })}
            </div>

            {/* Warning banner (shown when user clicks a different type) */}
            {pendingSchedType && (
              <div style={{
                marginTop: 12, padding: '12px 14px',
                background: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: 8,
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 10 }}>
                  <AlertTriangle size={13} color="#D97706" style={{ flexShrink: 0 }} />
                  <span style={{ fontSize: 13, color: '#92400E' }}>
                    Changing schedule type will clear all existing configurations.
                  </span>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button onClick={handleConfirmScheduleType} style={{
                    padding: '5px 16px', borderRadius: 6, border: 'none',
                    background: '#D97706', color: '#fff',
                    fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
                  }}>Confirm</button>
                  <button onClick={() => setPendingSchedType(null)} style={{
                    padding: '5px 14px', borderRadius: 6,
                    border: '1px solid #E5E7EB', background: '#fff', color: '#374151',
                    fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
                  }}>Cancel</button>
                </div>
              </div>
            )}
          </div>

          {/* ─── DEFAULT SCHEDULE ─── */}
          <div style={{ marginBottom: 20 }}>
            {/* Section header */}
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 7, marginBottom: 12 }}>
              <Clock size={15} color="#7C6FE0" style={{ marginTop: 1 }} />
              <div>
                <div style={{ fontSize: 14, fontWeight: 700, color: '#13111E', letterSpacing: '-0.2px' }}>Default Schedule</div>
                <div style={{ fontSize: 12, color: '#9CA3AF', marginTop: 1 }}>Configure periods and breaks for your timetable</div>
              </div>
            </div>

            {/* Period Configuration Style */}
            <div style={{ marginBottom: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 8 }}>
                <SlidersHorizontal size={12} color="#7C6FE0" />
                <span style={{ fontSize: 11, fontWeight: 700, color: '#7C6FE0', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
                  Period Configuration Style
                </span>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                {([
                  { key: 'uniform',    label: 'Uniform Schedule',    desc: 'Same periods every working day. Simple and straightforward.' },
                  { key: 'custom-day', label: 'Custom Day Schedule', desc: 'Different periods for different days. E.g., shorter Fridays.' },
                ] as const).map(opt => {
                  const active = periodCfgStyle === opt.key
                  return (
                    <button key={opt.key} onClick={() => setPeriodCfgStyle(opt.key)} style={{
                      padding: '12px 14px', borderRadius: 10, textAlign: 'left',
                      border: active ? '2px solid #7C6FE0' : '1.5px solid #E5E7EB',
                      background: active ? '#F5F2FF' : '#fff',
                      cursor: 'pointer', fontFamily: 'inherit',
                      display: 'flex', alignItems: 'flex-start', gap: 10,
                      transition: 'border-color .15s, background .15s',
                    }}>
                      {/* Radio dot */}
                      <div style={{
                        width: 16, height: 16, borderRadius: '50%', flexShrink: 0, marginTop: 1,
                        border: active ? '5px solid #7C6FE0' : '2px solid #D1D5DB',
                        transition: 'border .15s',
                      }} />
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 600, color: active ? '#7C6FE0' : '#374151', marginBottom: 3 }}>
                          {opt.label}
                        </div>
                        <div style={{ fontSize: 11, color: '#6B7280', lineHeight: 1.45 }}>{opt.desc}</div>
                      </div>
                    </button>
                  )
                })}
              </div>
            </div>

          {/* ─── SHIFT CONFIGURATION ─── */}
          <div style={{ marginBottom: 20 }}>
            <SH>SHIFT CONFIGURATION</SH>
            <div style={{ background: '#fff', borderRadius: 10, border: '1px solid #E5E7EB', padding: '16px 18px' }}>
              <input className="b-input" value={shiftName} onChange={e => setShiftName(e.target.value)}
                placeholder="e.g. Main Shift"
                style={{ fontWeight: 700, fontSize: 14, width: '100%', marginBottom: 16 }} />

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 100px 110px 90px', gap: 12, marginBottom: 14 }}>
                {/* Start */}
                <div>
                  <div style={FL}>Start time</div>
                  <input className="b-input" type="time" value={startTime}
                    onChange={e => setStartTime(e.target.value)} style={{ width: '100%' }} />
                  <div style={FH}>{fmt12(startTime, use12h)}</div>
                </div>
                {/* End — formatted display with inline edit */}
                <div>
                  <div style={FL}>End time</div>
                  {editingEnd ? (
                    <input className="b-input" type="time" defaultValue={endTime} autoFocus
                      onChange={e => handleEndTimeEdit(e.target.value)}
                      onBlur={() => setEditingEnd(false)}
                      onKeyDown={e => { if (e.key === 'Enter' || e.key === 'Escape') e.currentTarget.blur() }}
                      style={{ width: '100%' }} />
                  ) : (
                    <div className="b-input b-end-display" onClick={() => setEditingEnd(true)}
                      style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', userSelect: 'none' }}>
                      <span style={{ fontFamily: "'DM Mono',monospace", fontWeight: 700 }}>{fmt12(endTime, use12h)}</span>
                      <span style={{ fontSize: 10, color: '#C4B5FD', fontWeight: 400 }}>✎</span>
                    </div>
                  )}
                  <div style={FH}>adjusts last period</div>
                </div>
                {/* Period */}
                <div>
                  <div style={FL}>Period (min)</div>
                  <NumInput className="b-input" value={periodDur} min={10} max={120} onChange={handlePeriodDurChange}
                    style={{ width: '100%', textAlign: 'center', fontFamily: "'DM Mono',monospace", fontWeight: 800, fontSize: 16 }} />
                </div>
                {/* Max periods */}
                <div>
                  <div style={FL}>Max periods/day</div>
                  <NumInput className="b-input" value={maxPeriods} min={1} max={16} onChange={handleMaxPeriodsChange}
                    style={{ width: '100%', textAlign: 'center', fontFamily: "'DM Mono',monospace", fontWeight: 800, fontSize: 16 }} />
                </div>
                {/* Format */}
                <div>
                  <div style={FL}>Format</div>
                  <select className="b-input" value={use12h ? '12H' : '24H'}
                    onChange={e => setUse12h(e.target.value === '12H')} style={{ width: '100%' }}>
                    <option value="12H">12H</option>
                    <option value="24H">24H</option>
                  </select>
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 12, color: '#6B7280', flexShrink: 0 }}>Working days:</span>
                {ALL_DAYS.map(d => {
                  const on = workDays.includes(d)
                  return (
                    <button key={d} className="b-day" onClick={() => toggleDay(d)} style={{
                      padding: '3px 11px', borderRadius: 20,
                      border: on ? '1px solid #10B981' : '1px solid #E5E7EB',
                      background: on ? '#10B981' : '#fff',
                      color: on ? '#fff' : '#9CA3AF',
                      fontSize: 12, fontWeight: 600, fontFamily: 'inherit',
                    }}>{d}</button>
                  )
                })}
              </div>
            </div>
          </div>

          {/* ─── BELL TIMING GRID ─── */}
          <div>
            {/* Section header + Class-wise breaks button */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
              <SH>BELL TIMING GRID</SH>
              <button
                onClick={handleOpenCwPanel}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 5,
                  padding: '5px 13px', borderRadius: 7,
                  border: showCwPanel ? '1.5px solid #7C3AED' : '1.5px solid #C4B5FD',
                  background: showCwPanel ? '#7C3AED' : '#F8F7FF',
                  color: showCwPanel ? '#fff' : '#7C3AED',
                  fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
                  transition: 'all .15s',
                }}
              >
                <Sparkles size={11} /> Class-wise breaks
              </button>
            </div>

            {/* Class-wise breaks panel */}
            {showCwPanel && (
              <ClasswiseBreaksPanel
                cwRows={cwRows}
                setCwRows={setCwRows}
                use12h={use12h}
                startTime={startTime}
                periodDur={periodDur}
                maxPeriods={maxPeriods}
                onGenerate={handleGenerateFromCw}
                onClose={() => setShowCwPanel(false)}
              />
            )}

            <div style={{ background: '#fff', borderRadius: 10, border: '1px solid #E5E7EB' }}>
              {/* Table header */}
              <div style={{
                display: 'grid',
                gridTemplateColumns: '88px 88px 88px 56px 100px 1fr 28px',
                padding: '8px 14px', background: '#F9FAFB',
                borderBottom: '1px solid #E5E7EB', borderRadius: '10px 10px 0 0',
              }}>
                {['Bell', 'Start', 'End', 'Min', 'Type', 'Classes', ''].map((h, i) => (
                  <div key={i} style={{ fontSize: 11, fontWeight: 600, color: '#6B7280' }}>{h}</div>
                ))}
              </div>

              {/* Rows */}
              <div>
                {rows.map((row, i) => {
                  const tm      = TYPE_META[row.type]
                  const start   = rowStartTimes[i] ?? '—'
                  const end     = addMins(start, row.duration)
                  const isBreak = row.type === 'short-break' || row.type === 'lunch'
                  const isEdge  = row.type === 'assembly' || row.type === 'dispersal'
                  return (
                    <div key={row.id}>
                      <div className="b-row" style={{
                        display: 'grid',
                        gridTemplateColumns: '88px 88px 88px 56px 100px 1fr 28px',
                        alignItems: 'center',
                        background: ROW_BG[row.type],
                        // Break rows: strong left accent bar + extra vertical breathing room
                        boxShadow: isBreak ? `inset 4px 0 0 ${tm.line}` : 'none',
                        padding: isBreak ? '10px 14px 10px 10px' : isEdge ? '5px 14px' : '6px 14px',
                        borderBottom: isBreak ? `1px solid ${tm.border}` : undefined,
                        borderTop:    isBreak ? `1px solid ${tm.border}` : undefined,
                      }}>
                        <input className="b-cell" value={row.name}
                          onChange={e => updateRow(row.id, { name: e.target.value })}
                          style={{ fontWeight: isBreak ? 700 : undefined }}
                        />
                        <div style={{
                          fontSize: isBreak ? 13 : 12,
                          fontFamily: "'DM Mono',monospace",
                          color: isBreak ? tm.fg : '#374151',
                          fontWeight: 700, padding: '4px 7px',
                        }}>
                          {fmt12(start, use12h)}
                        </div>
                        <div style={{
                          fontSize: isBreak ? 13 : 12,
                          fontFamily: "'DM Mono',monospace",
                          color: isBreak ? tm.fg : '#374151',
                          fontWeight: 700, padding: '4px 7px',
                        }}>
                          {fmt12(end, use12h)}
                        </div>
                        <NumInput className="b-dur" value={row.duration} min={5} max={240}
                          onChange={d => updateRow(row.id, { duration: d })} />
                        <div style={{
                          padding: isBreak ? '4px 10px' : '3px 10px',
                          borderRadius: 20, display: 'inline-block',
                          background: tm.bg, color: tm.fg,
                          border: `1.5px solid ${tm.border}`,
                          fontSize: isBreak ? 12 : 11,
                          fontWeight: 700, whiteSpace: 'nowrap',
                          boxShadow: isBreak ? `0 0 0 2px ${tm.bg}` : 'none',
                        }}>
                          {tm.label}
                        </div>
                        <ClassPicker classes={row.classes} onChange={cls => updateRow(row.id, { classes: cls })}
                          rowId={row.id} openId={openPicker} setOpenId={setOpenPicker} />
                        <button className="b-del" onClick={() => deleteRow(row.id)} style={{
                          background: 'none', border: 'none', cursor: 'pointer', color: '#FCA5A5',
                          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 3, opacity: 0,
                        }}>
                          <Trash2 size={13} />
                        </button>
                      </div>
                      {i < rows.length - 1 && (
                        <GapRow afterIndex={i} rows={rows}
                          onInsertBreak={insertBreak}
                          onInsertPeriod={insertPeriodAt}
                          onInsertSplit={insertSplitPeriods}
                        />
                      )}
                    </div>
                  )
                })}
              </div>

              {/* Footer */}
              <div style={{ padding: '10px 14px', display: 'flex', gap: 8, flexWrap: 'wrap', borderTop: '1px solid #F3F4F6', borderRadius: '0 0 10px 10px' }}>
                <button onClick={handleAISuggest} style={{
                  display: 'inline-flex', alignItems: 'center', gap: 5, padding: '6px 14px', borderRadius: 7,
                  border: '1px solid #C4B5FD', background: '#F5F3FF', fontSize: 12, fontWeight: 600, color: '#7C3AED', cursor: 'pointer', fontFamily: 'inherit',
                }}>
                  <Sparkles size={12} /> AI suggest timings
                </button>
                <button onClick={() => {
                  const count = rows.filter(r => r.type === 'teaching').length
                  const nr    = mkPeriod(count + 1, periodDur); nr.id = makeId()
                  setRows(prev => { const n = [...prev]; const di = n.findIndex(r => r.type === 'dispersal'); n.splice(di >= 0 ? di : n.length, 0, nr); return n })
                }} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '6px 14px', borderRadius: 7, border: '1px solid #E5E7EB', background: '#fff', fontSize: 12, fontWeight: 600, color: '#374151', cursor: 'pointer', fontFamily: 'inherit' }}>
                  <Plus size={12} /> Add period
                </button>
                <button onClick={() => setRows(buildRows(maxPeriods, periodDur))} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '6px 14px', borderRadius: 7, border: '1px solid #E5E7EB', background: '#fff', fontSize: 12, fontWeight: 600, color: '#6B7280', cursor: 'pointer', fontFamily: 'inherit' }}>
                  Reset to default
                </button>
              </div>
            </div>
          </div>
          </div>{/* end Default Schedule outer div */}
        </div>

        {/* ══════════ RIGHT (sticky) ══════════ */}
        {/*
          Sticky right column: constrained to viewport so it never overflows
          past the bottom. 52px top-bar + 38px sub-bar + 86px step-bar + 20px
          page padding-top + 16px top offset = ~212px removed from 100vh.
          overflowY: auto lets the panel scroll independently of the left side.
        */}
        <div style={{
          position: 'sticky', top: 16,
          maxHeight: 'calc(100vh - 212px)',
          overflowY: 'auto',
          scrollbarWidth: 'thin',
        }}>
          <SH>LIVE BELL TIMELINE</SH>

          {hasPartialBreaks ? (
            /* Per-group timelines (stacked) */
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 14 }}>
              {groupTimelineData.map(({ gm, data }) => (
                <LiveBellTimeline
                  key={gm.group}
                  title={gm.desc}
                  color={gm.color}
                  data={data}
                  use12h={use12h}
                />
              ))}
            </div>
          ) : (
            /* Single master timeline */
            <div style={{ background: '#fff', borderRadius: 10, border: '1px solid #E5E7EB', overflow: 'hidden', marginBottom: 14 }}>
              {masterTimelineData.map(({ row, start }, idx) => {
                const tm  = TYPE_META[row.type]
                const grp = row.classes.length === ALL_CLASS_KEYS.length ? 'All'
                  : row.classes.length === 0 ? '—'
                  : row.classes.length <= 4 ? row.classes.map(k => CLASSES.find(c => c.key === k)?.short ?? k).join(', ')
                  : `${row.classes.length} classes`
                return (
                  <div key={row.id + idx} style={{
                    display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px',
                    borderLeft: `3px solid ${tm.line}`,
                    borderBottom: idx < masterTimelineData.length - 1 ? '1px solid #F9FAFB' : 'none',
                  }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: '#374151', fontFamily: "'DM Mono',monospace", minWidth: 58, flexShrink: 0 }}>
                      {fmt12(start, use12h)}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 12, fontWeight: 600, color: '#13111E' }}>{row.name}</div>
                      <div style={{ fontSize: 10, color: '#9CA3AF' }}>{row.duration} min · {grp}</div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          {/* AI Capacity */}
          <div style={{ background: '#FAF7F0', borderRadius: 10, border: '1px solid #E8E0CC', padding: '14px 16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 700, color: '#92400E', marginBottom: 12 }}>
              <Sparkles size={13} color="#D97706" /> AI capacity engine
            </div>
            {capacity.map(c => (
              <div key={c.label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 7 }}>
                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: c.color, display: 'inline-block', flexShrink: 0, marginTop: 3 }} />
                  <div>
                    <div style={{ fontSize: 12, color: '#374151' }}>{c.label}</div>
                    <div style={{ fontSize: 10, color: '#9CA3AF' }}>{c.desc}</div>
                  </div>
                </div>
                <span style={{ fontSize: 13, fontWeight: 700, color: '#13111E' }}>
                  {c.count}<span style={{ fontSize: 11, fontWeight: 400, color: '#9CA3AF' }}> /wk</span>
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Footer nav */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 24, paddingTop: 16, borderTop: '1px solid #E5E7EB' }}>
        <button className="b-nav-sec" onClick={() => window.location.href = '/dashboard'} style={{ display: 'inline-flex', alignItems: 'center', gap: 7, padding: '9px 18px', borderRadius: 8, border: '1px solid #E5E7EB', background: '#fff', fontSize: 13, fontWeight: 600, color: '#374151', cursor: 'pointer', fontFamily: 'inherit' }}>
          <ChevronLeft size={14} /> Back
        </button>
        <span style={{ fontSize: 13, color: '#9CA3AF' }}>Step 1 of 5</span>
        <button className="b-nav-pri" onClick={handleNext} disabled={workDays.length === 0} style={{ display: 'inline-flex', alignItems: 'center', gap: 7, padding: '9px 20px', borderRadius: 8, border: 'none', background: workDays.length > 0 ? '#13111E' : '#E5E7EB', color: workDays.length > 0 ? '#fff' : '#9CA3AF', fontSize: 13, fontWeight: 700, cursor: workDays.length > 0 ? 'pointer' : 'not-allowed', fontFamily: 'inherit' }}>
          Next: Resources <ChevronRight size={14} />
        </button>
      </div>
    </div>
  )
}

function SH({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.09em', textTransform: 'uppercase', color: '#9CA3AF', marginBottom: 8 }}>
      {children}
    </div>
  )
}
const FL: CSSProperties = { fontSize: 12, color: '#6B7280', marginBottom: 5 }
const FH: CSSProperties = { fontSize: 11, color: '#9CA3AF', marginTop: 3 }
