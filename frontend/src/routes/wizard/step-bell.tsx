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
  Trash2, Coffee, X, Calendar, Clock, AlertTriangle, SlidersHorizontal, Layers,
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
  type:        RowType
  classes:     string[]  // which class-section keys have this break
  afterPeriod: number    // insert break after this period (0 = after Assembly, 1 = after Period 1, …)
  duration:    number    // minutes
  /** If set, this break starts right after the referenced break ends (staggered chaining). */
  afterBreakId?: string
  /** If set, user has specified a custom start time (HH:MM) overriding period calculation. */
  customStartTime?: string
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
  { key: 'ix',   label: 'Class IX',   short: 'IX',    group: 'Senior' },
  { key: 'x',    label: 'Class X',    short: 'X',     group: 'Senior' },
  { key: 'xi',   label: 'Class XI',   short: 'XI',    group: 'Senior Secondary' },
  { key: 'xii',  label: 'Class XII',  short: 'XII',   group: 'Senior Secondary' },
]

const CLASS_GROUPS = [
  { group: 'Pre-Primary',      desc: 'Nursery–UKG',   color: '#7C3AED', bg: '#F5F3FF' },
  { group: 'Primary',          desc: 'Class I–V',      color: '#1D4ED8', bg: '#EFF6FF' },
  { group: 'Middle',           desc: 'Class VI–VIII',  color: '#059669', bg: '#F0FDF4' },
  { group: 'Senior',           desc: 'Class IX–X',     color: '#D97706', bg: '#FFFBEB' },
  { group: 'Senior Secondary', desc: 'Class XI–XII',   color: '#DC2626', bg: '#FEF2F2' },
]

const ALL_CLASS_KEYS = CLASSES.map(c => c.key)

// ── Standard class progression for smart "Add class" ──────────
const STANDARD_CLASS_SEQ = [
  { label: 'Nursery',   short: 'Nur'  }, { label: 'LKG',       short: 'LKG'  },
  { label: 'UKG',       short: 'UKG'  }, { label: 'Class I',   short: 'I'    },
  { label: 'Class II',  short: 'II'   }, { label: 'Class III', short: 'III'  },
  { label: 'Class IV',  short: 'IV'   }, { label: 'Class V',   short: 'V'    },
  { label: 'Class VI',  short: 'VI'   }, { label: 'Class VII', short: 'VII'  },
  { label: 'Class VIII',short: 'VIII' }, { label: 'Class IX',  short: 'IX'   },
  { label: 'Class X',   short: 'X'    }, { label: 'Class XI',  short: 'XI'   },
  { label: 'Class XII', short: 'XII'  },
]

/** Derive a short name from a label when it matches a standard grade pattern. */
function deriveShort(label: string): string | null {
  const s = label.trim()
  // "Class XI" or "Grade XI" → "XI"
  const m = s.match(/^(?:Class|Grade)\s+(.+)$/i)
  if (m) return m[1].trim().slice(0, 6)
  const KNOWN: Record<string, string> = {
    nursery: 'Nur', lkg: 'LKG', ukg: 'UKG', 'pre-kg': 'PreKG', pp1: 'PP1', pp2: 'PP2',
  }
  return KNOWN[s.toLowerCase()] ?? null
}

/** Given the last class in the list, predict the next standard class. */
function predictNext(lastLabel: string, lastGroup: string) {
  const idx = STANDARD_CLASS_SEQ.findIndex(c => c.label.toLowerCase() === lastLabel.trim().toLowerCase())
  if (idx >= 0 && idx < STANDARD_CLASS_SEQ.length - 1) {
    return { ...STANDARD_CLASS_SEQ[idx + 1], group: lastGroup }
  }
  return { label: 'New Class', short: 'New', group: lastGroup }
}

// Colour palette for custom groups — [ink, paper]
const GROUP_PALETTE: Array<[string, string]> = [
  ['#7C3AED','#F5F3FF'], ['#1D4ED8','#EFF6FF'], ['#059669','#F0FDF4'],
  ['#D97706','#FFFBEB'], ['#DC2626','#FFF1F2'], ['#0891B2','#ECFEFF'],
  ['#7C3AED','#FDF4FF'], ['#65A30D','#F7FEE7'], ['#9333EA','#FAF5FF'],
  ['#374151','#F9FAFB'],
]

// Map a grade short-name to the bell-step group name
function gradeToGroup(g: string): string {
  const u = g.replace(/^class\s+/i, '').trim().toUpperCase()
  if (['NURSERY','LKG','UKG'].includes(u)) return 'Pre-Primary'
  const MAP: Record<string, string> = {
    I:'Primary',II:'Primary',III:'Primary',IV:'Primary',V:'Primary',
    VI:'Middle',VII:'Middle',VIII:'Middle',
    IX:'Senior',X:'Senior',
    XI:'Senior Secondary',XII:'Senior Secondary',
  }
  if (MAP[u]) return MAP[u]
  const n = parseInt(u)
  if (!isNaN(n)) return n <= 5 ? 'Primary' : n <= 8 ? 'Middle' : n <= 10 ? 'Senior' : 'Senior Secondary'
  return 'Senior Secondary'
}

// Convert grade range (from dashboard modal) to a filtered CLASSES subset
const GRADE_TO_KEY: Record<string, string> = {
  'Nursery':'nur','LKG':'lkg','UKG':'ukg',
  'Class I':'i','Class II':'ii','Class III':'iii','Class IV':'iv','Class V':'v',
  'Class VI':'vi','Class VII':'vii','Class VIII':'viii','Class IX':'ix','Class X':'x',
  'Class XI':'xi','Class XII':'xii',
}
const WIZARD_GRADES = ['Nursery','LKG','UKG','Class I','Class II','Class III','Class IV','Class V','Class VI','Class VII','Class VIII','Class IX','Class X','Class XI','Class XII']
function classesFromGradeRange(from: string, to: string): typeof CLASSES {
  const fi = WIZARD_GRADES.indexOf(from), ti = WIZARD_GRADES.indexOf(to)
  if (fi < 0 || ti < 0 || fi > ti) return CLASSES
  const keys = WIZARD_GRADES.slice(fi, ti + 1).map(g => GRADE_TO_KEY[g]).filter(Boolean)
  const subset = CLASSES.filter(c => keys.includes(c.key))
  return subset.length > 0 ? subset : CLASSES
}

/**
 * Normalise a class list loaded from saved state or built from sections:
 *  1. Replace any entry whose label matches a canonical CLASSES entry (case-insensitive)
 *     with the canonical entry — fixes legacy keys like 'nursery' → 'nur'.
 *  2. Sort by canonical CLASSES order (Nursery → LKG → UKG → Class I …).
 *     Unknown / custom classes appear at the end in their original relative order.
 */
function canonicalizeClasses(classes: typeof CLASSES): typeof CLASSES {
  const normalised = classes.map(c => {
    // Direct key match (already canonical)
    const byKey = CLASSES.find(cc => cc.key === c.key)
    if (byKey) return byKey
    // Label match — catches 'nursery' key that should map to canonical {key:'nur',…}
    const byLabel = CLASSES.find(cc => cc.label.toLowerCase() === c.label.toLowerCase())
    return byLabel ?? c
  })
  // Deduplicate (in case save had both 'nur' and 'nursery')
  const seen = new Set<string>()
  const deduped = normalised.filter(c => { if (seen.has(c.key)) return false; seen.add(c.key); return true })
  // Sort by canonical index; custom entries go last
  return deduped.sort((a, b) => {
    const ai = CLASSES.findIndex(cc => cc.key === a.key)
    const bi = CLASSES.findIndex(cc => cc.key === b.key)
    return (ai < 0 ? 999 : ai) - (bi < 0 ? 999 : bi)
  })
}

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

// ── Rotation day type ─────────────────────────────────────────
interface RotDay { full: string; short: string }

// ── Day-off rule (class-specific off days) ────────────────────
interface DayOffRule {
  id:      string
  day:     string    // e.g. 'Sat', 'Mon'
  classes: string[]  // class keys that are off on this day
}

// ── Age-appropriate day-off smart suggestions ─────────────────
// Each suggestion is shown contextually: only when the relevant
// class group is active AND the suggested day is a work day AND
// no rule already covers it.
interface DaySuggestion {
  id:        string
  emoji:     string
  title:     string
  detail:    string  // human, empathetic explanation
  day:       string  // 'Sat', 'Mon', …
  classKeys: string[]
  group:     string  // display name
  color:     string  // ink colour (matches CLASS_GROUPS)
  bg:        string  // card background
  border:    string  // card border
  urgent:    boolean // strong recommendation vs optional note
}

const AGE_DAYOFF_SUGGESTIONS: DaySuggestion[] = [
  {
    id:        'pre-primary-sat',
    emoji:     '🧸',
    title:     'Nursery · LKG · UKG need Saturday off',
    detail:    'Children aged 3–5 have very short attention spans, tire quickly, and require significantly more rest than older students. A 6-day school week is developmentally inappropriate for pre-primary ages — it leads to burnout, anxiety, and disrupted sleep patterns. Most state boards and the NEP 2020 explicitly recommend a 5-day week for the under-5 age group.',
    day:       'Sat',
    classKeys: ['nur', 'lkg', 'ukg'],
    group:     'Pre-Primary',
    color:     '#6D28D9',
    bg:        '#F5F3FF',
    border:    '#C4B5FD',
    urgent:    true,
  },
  {
    id:        'primary-sat',
    emoji:     '📖',
    title:     'Class I–V benefit from a lighter Saturday',
    detail:    'Children aged 6–11 still need substantial rest between learning days. After five consecutive school days their engagement, memory retention, and emotional regulation all drop measurably. If Saturday must be a school day, consider shorter hours or fewer periods for the primary wing.',
    day:       'Sat',
    classKeys: ['i', 'ii', 'iii', 'iv', 'v'],
    group:     'Primary',
    color:     '#1D4ED8',
    bg:        '#EFF6FF',
    border:    '#BFDBFE',
    urgent:    false,
  },
]

// ── Shift (Advanced mode — multiple shifts) ───────────────────
interface ShiftConfig {
  id:            string
  name:          string
  startTime:     string   // HH:MM
  periodDur:     number   // max period duration (minutes)
  periodDurMin?: number   // min period duration (minutes); AI won't go below this
  maxPeriods:    number
  use12h:        boolean
  classes:       string[] // class keys assigned to this shift
}
const DEFAULT_ROT_DAYS: RotDay[] = [
  { full: 'Day 1', short: 'D1' }, { full: 'Day 2', short: 'D2' },
  { full: 'Day 3', short: 'D3' }, { full: 'Day 4', short: 'D4' },
  { full: 'Day 5', short: 'D5' },
]

// ── Cycle start date hint ─────────────────────────────────────
function cycleStartHint(dateStr: string): string {
  if (!dateStr) return ''
  try {
    const d    = new Date(dateStr + 'T00:00:00')
    const days = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday']
    const jan1 = new Date(d.getFullYear(), 0, 1)
    const wk   = Math.ceil(((d.getTime() - jan1.getTime()) / 86400000 + jan1.getDay() + 1) / 7)
    return `${days[d.getDay()]}, ${d.toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })} · Week ${wk}`
  } catch { return '' }
}

// Keep ScheduleType/PeriodCfgStyle as derived aliases for the store
type ScheduleType    = 'weekly' | 'fortnightly' | 'custom-cycle' | 'day-rotation'
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
 * Handles composite stream keys (e.g. "xi::Science") transparently:
 *   • A simple row key ('xi') matches any composite query ('xi::Science') because
 *     the simple key implicitly covers all streams of that class.
 *   • A composite row key ('xi::Science') matches a simple query ('xi') for the same reason.
 *   • Two different composite keys ('xi::Science' vs 'xi::Commerce') do NOT match.
 */
function computeStartsFiltered(startTime: string, rows: BellRow[], classKey: string): string[] {
  const acc: string[] = []
  let cur = startTime
  const queryBase = isCompositeKey(classKey) ? baseClassKey(classKey) : classKey
  for (const r of rows) {
    acc.push(cur)
    const rowIncludes = r.classes.some(k => {
      if (k === classKey) return true                                   // exact match
      const kBase = isCompositeKey(k) ? baseClassKey(k) : k
      if (!isCompositeKey(k)) return k === queryBase                   // simple row key ↔ composite query
      if (!isCompositeKey(classKey)) return kBase === classKey         // composite row key ↔ simple query
      return false                                                      // composite ↔ different composite
    })
    if (rowIncludes) cur = addMins(cur, r.duration)
  }
  return acc
}

function makeId() { return Math.random().toString(36).slice(2, 8) }

// ── Stream-composite key helpers ──────────────────────────────
// Class keys for stream-expanded scheduling use the format "classKey::StreamName"
// (e.g. "xi::Science"). Simple class keys contain no "::".
const STREAM_SEP = '::'
const isCompositeKey = (k: string) => k.includes(STREAM_SEP)
const baseClassKey   = (k: string) => k.split(STREAM_SEP)[0]

/** Resolve a class key (simple or composite) to a human-readable short label. */
function resolveShort(k: string, entries: typeof CLASSES = CLASSES): string {
  if (isCompositeKey(k)) {
    const [base, stream] = k.split(STREAM_SEP)
    const cls = entries.find(c => c.key === base)
    return `${cls?.short ?? base}·${stream}`
  }
  return entries.find(c => c.key === k)?.short ?? k
}

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
const mkAssembly  = (): BellRow => ({ id: 'assembly',  name: 'Assembly',  type: 'assembly',  duration: 10, classes: [...ALL_CLASS_KEYS] })
const mkDispersal = (): BellRow => ({ id: makeId(),    name: 'Dispersal', type: 'dispersal', duration: 10, classes: [...ALL_CLASS_KEYS] })
const mkPeriod    = (n: number, dur: number): BellRow => ({
  id: `p${n}`, name: `Period ${n}`, type: 'teaching', duration: dur, classes: [...ALL_CLASS_KEYS],
})
function buildRows(count: number, dur: number): BellRow[] {
  return [mkAssembly(), ...Array.from({ length: count }, (_, i) => mkPeriod(i + 1, dur)), mkDispersal()]
}

// ── Automatic bell timing generator ──────────────────────────
/**
 * Given a school start/end time + desired period count & duration, produce
 * a sensible BellRow[] without manual configuration.
 *
 * Strategy:
 *   1. Assembly (10 min)
 *   2. Distribute periods with natural break slots:
 *      – Short Break (15 min) after the ~3rd period (mid-morning)
 *      – Lunch Break (30 min) after roughly half the periods (if school > 4 h)
 *   3. Any leftover time is absorbed into slightly longer periods.
 *   4. Dispersal (10 min)
 */
function autoGenerateBellRows(
  startTime:  string,
  endTime:    string,
  maxPeriods: number,
  periodDur:  number,
  allKeys:    string[],
): BellRow[] {
  const totalMins = toMins(endTime) - toMins(startTime)
  if (totalMins <= 0) return buildRows(maxPeriods, periodDur)

  const asmDur  = 10
  const dispDur = 10
  const schoolMins = totalMins - asmDur - dispDur   // time available for teaching + breaks

  // Decide breaks based on total school duration
  const hasLunch       = totalMins > 4 * 60
  const hasShortBreak  = totalMins > 2 * 60
  const lunchDur  = hasLunch      ? 30 : 0
  const sbDur     = hasShortBreak ? 15 : 0
  const breakMins = lunchDur + sbDur

  // Compute actual period duration so all periods fit within remaining time
  const teachMins   = Math.max(schoolMins - breakMins, maxPeriods * 10)
  const actualDur   = Math.max(10, Math.floor(teachMins / maxPeriods))

  // Break insertion points (after which period index, 1-based)
  const lunchAfter = hasLunch ? Math.ceil(maxPeriods / 2) : -1
  const sbAfter    = hasShortBreak ? Math.max(1, Math.ceil(maxPeriods * 0.3)) : -1

  const rows: BellRow[] = [mkAssembly()]
  for (let i = 1; i <= maxPeriods; i++) {
    rows.push(mkPeriod(i, actualDur))
    // Guard: if sbAfter === lunchAfter (e.g. maxPeriods=4), skip the short break —
    // inserting both at the same position would create two consecutive break rows
    // which confuses buildPeriodSequence and produces a double-lunch in the display.
    if (i === sbAfter  && hasShortBreak && i !== lunchAfter) rows.push({ id: makeId(), name: 'Short Break', type: 'short-break', duration: sbDur,   classes: [...allKeys] })
    if (i === lunchAfter && hasLunch)                         rows.push({ id: makeId(), name: 'Lunch Break',  type: 'lunch',       duration: lunchDur, classes: [...allKeys] })
  }
  rows.push(mkDispersal())
  return rows
}

// ── Approximate lunch-start time for a given group ───────────
function approxLunchTime(
  startTime: string,
  periodDur: number,
  afterPeriod: number,
  maxPeriods: number,
  use12h: boolean,
  replacesShortBreak = false,  // true when this group's lunch IS the short-break slot
  concurrentPeriodDur?: number, // duration of the "concurrent" period (while Pre-Primary eats)
  concurrentAtPeriod?: number,  // which period (1-indexed) runs concurrently with Pre-Primary lunch
): string {
  const sbAfter = Math.max(1, Math.ceil(maxPeriods * 0.3))
  let mins = toMins(startTime) + 10 // assembly 10 min
  mins += afterPeriod * periodDur
  // If one period before this lunch was shorter (concurrent with Pre-Primary), subtract the diff.
  if (
    concurrentPeriodDur !== undefined &&
    concurrentAtPeriod  !== undefined &&
    concurrentAtPeriod  <= afterPeriod &&
    concurrentPeriodDur < periodDur
  ) {
    mins -= (periodDur - concurrentPeriodDur)
  }
  // Only add short-break time if the lunch comes AFTER the short break.
  // When replacesShortBreak is true the group eats AT the short-break slot, not after it.
  if (!replacesShortBreak && sbAfter <= afterPeriod) mins += 15
  return fmt12(toHHMM(mins), use12h)
}

// ── Smart bell schedule generator ────────────────────────────
/**
 * Generates a full bell config in two modes:
 *
 * 'single'  — one shared lunch for all classes (wraps autoGenerateBellRows).
 *             Returns cwRows = [] so handleNext uses the simple break path.
 *
 * 'smart'   — staggered lunch: each class GROUP gets lunch at a different
 *             period slot so they don't hit the canteen simultaneously.
 *             Uses buildBellRowsFromCw → returns populated cwRows so the
 *             classwise timing path is taken in handleNext.
 */
function smartGenerateBellConfig(
  startTime:        string,
  endTime:          string,
  maxPeriods:       number,
  periodDur:        number,
  lunchMode:        'single' | 'smart',
  lunchAfterPeriod: Record<string, number>,   // groupName → afterPeriod
  activeGroups:     Array<{ group: string }>,
  activeClasses:    Array<{ key: string; group: string }>,
  morningBreak:        boolean = false,
  morningBreakPos:     number  = 1,
  morningBreakDur:     number  = 15,
  concurrentPeriodDur?: number,   // period dur for non-eating classes during staggered lunch
): { rows: BellRow[]; cwRows: CwBreakRow[] } {
  const allKeys  = activeClasses.map(c => c.key)
  const sbAfterP = Math.max(1, Math.ceil(maxPeriods * 0.3))
  const lunchDur = 45
  const sbDur    = 15

  // ── Simple path: single lunch + no morning break ─────────────
  if (lunchMode === 'single' && !morningBreak) {
    return {
      rows:   autoGenerateBellRows(startTime, endTime, maxPeriods, periodDur, allKeys),
      cwRows: [],
    }
  }

  // ── CwBreakRow path (smart lunch OR morning break active) ────
  const cwRows: CwBreakRow[] = []

  // Optional morning break — placed earliest (before the shared short break)
  if (morningBreak) {
    cwRows.push({
      id: makeId(), name: 'Morning Break', type: 'short-break',
      classes: [...allKeys],
      afterPeriod: morningBreakPos,
      duration: morningBreakDur,
    })
  }

  // Determine if Pre-Primary is eating at (or before) the short-break slot.
  // If so, they eat lunch while everyone else takes their short break — skip them from sb.
  const prePrimaryKeys = activeClasses.filter(c => c.group === 'Pre-Primary').map(c => c.key)
  const ppLunchAP      = lunchAfterPeriod['Pre-Primary'] ?? sbAfterP
  const ppEatsEarly    = lunchMode !== 'single' && prePrimaryKeys.length > 0 && ppLunchAP <= sbAfterP

  // Shared mid-morning short break — exclude Pre-Primary when they eat early
  const sbClasses = ppEatsEarly ? allKeys.filter(k => !prePrimaryKeys.includes(k)) : [...allKeys]
  if (sbClasses.length > 0) {
    cwRows.push({
      id: makeId(), name: 'Short Break', type: 'short-break',
      classes: sbClasses, afterPeriod: sbAfterP, duration: sbDur,
    })
  }

  if (lunchMode === 'single' || activeGroups.length === 0) {
    // Single lunch for every class (with morning break active, so we're in cwRows path)
    cwRows.push({
      id: makeId(), name: 'Lunch Break', type: 'lunch',
      classes: [...allKeys], afterPeriod: sbAfterP + 1, duration: lunchDur,
    })
  } else {
    // Smart staggered lunch — each age group eats at a different period.
    // Pre-Primary (when eating early): lunch is AT the short-break slot (no guard needed).
    // All other groups: lunch must come AFTER the shared short break.
    for (const g of activeGroups) {
      const grpKeys = activeClasses.filter(c => c.group === g.group).map(c => c.key)
      if (!grpKeys.length) continue
      const isPrePrimary = g.group === 'Pre-Primary'
      const desired      = lunchAfterPeriod[g.group] ?? (isPrePrimary ? sbAfterP : sbAfterP + 1)
      const effective    = isPrePrimary && ppEatsEarly
        ? Math.max(1, Math.min(desired, sbAfterP))       // can eat at or before sb slot
        : Math.max(sbAfterP + 1, Math.min(desired, maxPeriods))  // must be after sb
      cwRows.push({
        id: makeId(), name: 'Lunch Break', type: 'lunch',
        classes: grpKeys, afterPeriod: effective, duration: lunchDur,
      })
    }
  }

  return {
    rows:   buildBellRowsFromCw(startTime, periodDur, maxPeriods, cwRows, allKeys, 10, concurrentPeriodDur),
    cwRows,
  }
}

// ── Class-wise bell generation ────────────────────────────────
/**
 * Build a merged BellRow[] from class-wise break configs.
 *
 * For every configured class key:
 *   1. Pre-compute each of its breaks' absolute start time (handles afterPeriod,
 *      afterBreakId chains, and customStartTime).
 *   2. Walk periods sequentially; insert breaks when their absolute start time
 *      has been reached by the advancing clock for that class.
 *
 * Then merge per-class sequences:
 *   • Rows identical across classes → one merged row (all classes).
 *   • Rows that differ (e.g. Lunch at different clock times for XI vs XII) →
 *     separate rows with the correct class subset.
 *
 * @param activeClsKeys  Only generate rows for these class keys (not all 15).
 * @param asmDur         Actual assembly duration in minutes.
 */
function buildBellRowsFromCw(
  startTimeStr:        string,
  periodDur:           number,
  maxPeriods:          number,
  cwBrks:              CwBreakRow[],
  activeClsKeys:       string[] = ALL_CLASS_KEYS,
  asmDur:              number   = 10,
  concurrentPeriodDur?: number,  // if set: classes not eating use this dur during another group's lunch
): BellRow[] {
  type Ev = { type: RowType; name: string; startMins: number; duration: number }
  const startMins = toMins(startTimeStr)

  // ── Pre-compute absolute start time for every break ───────────────────────
  // Handles: afterPeriod, afterBreakId chains, customStartTime
  const breakAbsStart = (brk: CwBreakRow, visited = new Set<string>()): number => {
    if (brk.customStartTime) return toMins(brk.customStartTime)
    if (brk.afterBreakId && !visited.has(brk.id)) {
      const ref = cwBrks.find(b => b.id === brk.afterBreakId)
      if (ref) {
        const v2 = new Set(visited); v2.add(brk.id)
        return breakAbsStart(ref, v2) + ref.duration
      }
    }
    // afterPeriod: startMins + assembly + (breaks shared with this class before it) + afterPeriod * periodDur
    const precedingMins = cwBrks
      .filter(b =>
        b.id !== brk.id &&
        b.afterPeriod < brk.afterPeriod &&
        b.classes.some(c => brk.classes.includes(c))
      )
      .reduce((sum, b) => sum + b.duration, 0)
    return startMins + asmDur + precedingMins + brk.afterPeriod * periodDur
  }

  const breakAbsMap = new Map<string, number>(cwBrks.map(b => [b.id, breakAbsStart(b)]))

  // Collect ALL lunch start times across every class (used for concurrent period detection)
  const allLunchStartTimes = new Set<number>(
    cwBrks.filter(b => b.type === 'lunch').map(b => breakAbsMap.get(b.id)!)
  )

  // ── Build per-class event sequences ──────────────────────────────────────
  const classEvs: Array<{ key: string; evs: Ev[] }> = []

  for (const clsKey of activeClsKeys) {
    const evs: Ev[] = []
    let cur = startMins

    evs.push({ type: 'assembly', name: 'Assembly', startMins: cur, duration: asmDur })
    cur += asmDur

    // Breaks for this class, sorted by their absolute start time
    const myBreaks = cwBrks
      .filter(b => b.classes.includes(clsKey))
      .map(b => ({ type: b.type as RowType, name: b.name, duration: b.duration, absStart: breakAbsMap.get(b.id)! }))
      .sort((a, b) => a.absStart - b.absStart)

    // This class's own lunch start times (so we don't apply concurrentPeriodDur when eating)
    const myLunchTimes = new Set(myBreaks.filter(b => b.type === 'lunch').map(b => b.absStart))

    let bi = 0

    // Flush pre-period breaks (absStart already reached before P1)
    while (bi < myBreaks.length && myBreaks[bi].absStart <= cur) {
      evs.push({ type: myBreaks[bi].type, name: myBreaks[bi].name, startMins: cur, duration: myBreaks[bi].duration })
      cur += myBreaks[bi].duration; bi++
    }

    for (let pNum = 1; pNum <= maxPeriods; pNum++) {
      // Use concurrentPeriodDur when another class's lunch starts exactly at this period's
      // start time — so bell boundaries align cleanly across all groups.
      const effDur = (
        concurrentPeriodDur !== undefined &&
        allLunchStartTimes.has(cur) &&
        !myLunchTimes.has(cur)
      ) ? concurrentPeriodDur : periodDur
      let remaining = effDur

      // Split the period at any break whose absStart falls WITHIN this period's window.
      // Without this, a break with customStartTime = 12:00 that lands during Period 3
      // would be incorrectly deferred to after the full period ends.
      while (bi < myBreaks.length && myBreaks[bi].absStart < cur + remaining) {
        const breakStart  = Math.max(myBreaks[bi].absStart, cur)
        const prePortion  = breakStart - cur
        if (prePortion > 0) {
          evs.push({ type: 'teaching', name: `Period ${pNum}`, startMins: cur, duration: prePortion })
          cur       += prePortion
          remaining -= prePortion
        }
        evs.push({ type: myBreaks[bi].type, name: myBreaks[bi].name, startMins: cur, duration: myBreaks[bi].duration })
        cur += myBreaks[bi].duration; bi++
      }

      // Remaining teaching time for this period
      if (remaining > 0) {
        evs.push({ type: 'teaching', name: `Period ${pNum}`, startMins: cur, duration: remaining })
        cur += remaining
      }

      // Flush breaks that land exactly at the period boundary
      while (bi < myBreaks.length && myBreaks[bi].absStart <= cur) {
        evs.push({ type: myBreaks[bi].type, name: myBreaks[bi].name, startMins: cur, duration: myBreaks[bi].duration })
        cur += myBreaks[bi].duration; bi++
      }
    }

    evs.push({ type: 'dispersal', name: 'Dispersal', startMins: cur, duration: asmDur })
    classEvs.push({ key: clsKey, evs })
  }

  // ── Merge identical events across classes ─────────────────────────────────
  const merged = new Map<string, { type: RowType; name: string; startMins: number; duration: number; classes: string[] }>()
  for (const { key, evs } of classEvs) {
    for (const ev of evs) {
      const k = `${ev.type}|${ev.name}|${ev.startMins}|${ev.duration}`
      if (!merged.has(k)) merged.set(k, { ...ev, classes: [] })
      merged.get(k)!.classes.push(key)
    }
  }

  const typeOrd: Record<RowType, number> = { assembly: 0, 'short-break': 1, lunch: 1, teaching: 2, dispersal: 3 }
  return [...merged.values()]
    .sort((a, b) => a.startMins !== b.startMins ? a.startMins - b.startMins : typeOrd[a.type] - typeOrd[b.type])
    .map(r => ({
      id: makeId(), name: r.name, type: r.type,
      duration: r.duration,
      // Strip composite stream keys (xi::Science → xi) so the main bell grid
      // always works with simple class keys. Duplicates are deduplicated.
      classes: [...new Set(r.classes.map(k => isCompositeKey(k) ? baseClassKey(k) : k))],
    }))
}

// ── Persistence ───────────────────────────────────────────────
const BELL_KEY_BASE   = 'schedu-bell-v2'
const ACTIVE_TT_LS    = 'schedu-active-tt'  // same key used in dashboard.tsx

/** Returns a per-timetable localStorage key so each timetable has its own bell state. */
function getBellKey(): string {
  try {
    const id = localStorage.getItem(ACTIVE_TT_LS)
    return id ? `${BELL_KEY_BASE}-${id}` : BELL_KEY_BASE
  } catch { return BELL_KEY_BASE }
}

function loadSaved(): SavedBell | null {
  try {
    const key  = getBellKey()
    const data = localStorage.getItem(key)
    if (data) return JSON.parse(data) as SavedBell
    // Migration: fall back to the old shared key so existing data isn't lost
    const legacy = localStorage.getItem(BELL_KEY_BASE)
    return legacy ? JSON.parse(legacy) as SavedBell : null
  } catch { return null }
}
interface SavedBell {
  shiftName: string; startTime: string; use12h: boolean
  periodDur: number; maxPeriods: number; workDays: string[]; rows: BellRow[]
  // Mode
  scheduleMode?: 'standard' | 'advanced'
  // Rhythm
  cycleWeeks?: number; useDayNames?: boolean; cycleStartDate?: string
  fixedDuration?: boolean; rotationDays?: RotDay[]
  weekWorkDays?:  Record<number, string[]>   // per-week custom working days (multi-week cycles)
  dayStartTimes?:  Record<string, string>   // per-day start time overrides (dayKey → HH:MM)
  dayPeriodDurs?:  Record<string, number>   // per-day period duration overrides (dayKey → mins)
  dayOffRules?:    DayOffRule[]             // class-specific off-day rules
  cwRows?:         CwBreakRow[]            // class-wise break configuration
  // Per-day bell config
  varyByDay?: boolean; dayRows?: Record<string, BellRow[]>
  // Multi-shift (Advanced mode)
  shifts?:        ShiftConfig[]
  activeShiftId?: string
  shiftRows?:     Record<string, BellRow[]>  // shiftId → rows
  // Custom class list (user can edit/add/delete)
  customClasses?: Array<{ key: string; label: string; short: string; group: string }>
  // Custom group definitions (name + colours)
  customGroups?: Array<{ group: string; color: string; bg: string }>
  // Streams (Science / Commerce / Arts …)
  customStreams?: Array<{ stream: string; color: string; bg: string; group: string }>
  // Maps class key → stream names (multi-stream supported)
  classStreamMap?: Record<string, string[]>
  // Automatic / Smart bell timing mode
  autoBellMode?: boolean
  schoolEndTime?: string   // HH:MM end-of-school time used for auto-generation
  smartLunchMode?: 'single' | 'smart'
  smartLunchAfterPeriod?: Record<string, number>   // group → afterPeriod override
  // Period duration for classes NOT eating during a staggered lunch slot
  concurrentPeriodMode?: 'regular' | 'match-lunch' | 'custom'
  concurrentPeriodDur?:  number   // minutes (used when mode is 'match-lunch' or 'custom')
  // Morning break (optional breakfast / snack break for day-boarding schools)
  morningBreak?:    boolean  // enabled?
  morningBreakPos?: number   // 0 = after assembly, 1 = after P1, 2 = after P2 …
  morningBreakDur?: number   // minutes
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
  onGenerate, onClose, assemblyDur = 10,
  classEntries = CLASSES, allClassKeys = ALL_CLASS_KEYS, classGroups = CLASS_GROUPS,
  streamDefs, classStreamMap,
}: {
  cwRows:      CwBreakRow[]
  setCwRows:   React.Dispatch<React.SetStateAction<CwBreakRow[]>>
  use12h:      boolean
  startTime:   string
  periodDur:   number
  maxPeriods:  number
  onGenerate:  () => void
  onClose:     () => void
  assemblyDur?: number
  classEntries?: typeof CLASSES
  allClassKeys?: string[]
  classGroups?:  typeof CLASS_GROUPS
  streamDefs?:   Array<{ stream: string; color: string; bg: string; group: string }>
  classStreamMap?: Record<string, string[]>
}) {
  const [openPicker, setOpenPicker] = useState<string | null>(null)

  /**
   * Calculate the clock time a break starts.
   * Three modes (in priority order):
   *   1. customStartTime set → use it directly
   *   2. afterBreakId set → chain from referenced break's END time
   *   3. afterPeriod → original period-count calculation
   */
  const breakStartTime = (row: CwBreakRow, _visited = new Set<string>()): string => {
    if (row.customStartTime) return row.customStartTime
    if (row.afterBreakId && !_visited.has(row.id)) {
      const ref = cwRows.find(b => b.id === row.afterBreakId)
      if (ref) {
        const v2 = new Set(_visited); v2.add(row.id)
        return addMins(breakStartTime(ref, v2), ref.duration)
      }
    }
    const precedingBreakMins = cwRows
      .filter(b =>
        b.id !== row.id &&
        b.afterPeriod < row.afterPeriod &&
        b.classes.some(c => row.classes.includes(c))
      )
      .reduce((sum, b) => sum + b.duration, 0)
    return addMins(startTime, assemblyDur + precedingBreakMins + row.afterPeriod * periodDur)
  }

  /** Encode the current timing selection for the dropdown. */
  const timingValue = (row: CwBreakRow): string => {
    if (row.customStartTime) return 'custom'
    if (row.afterBreakId)    return `b:${row.afterBreakId}`
    return `p:${row.afterPeriod}`
  }

  /** Short label for a set of class keys (handles composite stream keys). */
  const clsLabel = (keys: string[]) => {
    if (!keys.length) return '—'
    const shorts = keys.map(k => resolveShort(k, classEntries))
    return shorts.length <= 3 ? shorts.join(', ') : `${shorts.length} classes`
  }

  const updateBreak = (id: string, patch: Partial<CwBreakRow>) =>
    setCwRows(prev => prev.map(r => r.id === id ? { ...r, ...patch } : r))

  const updateName = (id: string, name: string) => {
    const type: RowType =
      /lunch/i.test(name)               ? 'lunch'
      : /assembl/i.test(name)           ? 'assembly'
      : /dispersal|dismiss/i.test(name) ? 'dispersal'
      : 'short-break'
    setCwRows(prev => prev.map(r => r.id === id ? { ...r, name, type } : r))
  }
  const updateType = (id: string, type: RowType) =>
    setCwRows(prev => prev.map(r => r.id === id ? { ...r, type } : r))

  const deleteRow = (id: string) => setCwRows(prev => prev.filter(r => r.id !== id))

  const addRow = () => {
    const defaultAfter = Math.max(1, Math.floor(maxPeriods / 2))
    setCwRows(prev => [...prev, {
      id:          makeId(),
      name:        'Break',
      type:        'short-break',
      classes:     [],   // start empty — user picks which classes this break applies to
      afterPeriod: defaultAfter,
      duration:    10,
    }])
  }

  // Base period options (string-keyed for unified select)
  const basePeriodOptions: Array<{ value: string; label: string }> = [
    { value: 'p:0', label: 'After Assembly' },
    ...Array.from({ length: maxPeriods }, (_, i) => ({
      value: `p:${i + 1}`,
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
            Choose <strong>which classes</strong> have a break and set its <strong>break timing</strong> —
            pick a period, chain it after another break, or enter a custom time.
            Click <strong>Generate bell timing</strong> when ready.
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
          {['Break name', 'Applies to', 'Break timing', 'Duration', ''].map((h, i) => (
            <div key={i} style={{ fontSize: 10, fontWeight: 600, color: '#9CA3AF', letterSpacing: '0.05em' }}>{h}</div>
          ))}
        </div>
      )}

      {/* Break rows */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 14 }}>
        {cwRows.map(row => {
          const bStart = breakStartTime(row)
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
                <select
                  value={row.type}
                  onChange={e => updateType(row.id, e.target.value as RowType)}
                  style={{
                    padding: '1px 8px', borderRadius: 10,
                    background: TYPE_META[row.type].bg,
                    color: TYPE_META[row.type].fg,
                    border: `1px solid ${TYPE_META[row.type].border}`,
                    fontSize: 10, fontWeight: 600,
                    cursor: 'pointer', fontFamily: 'inherit', outline: 'none',
                    appearance: 'none', WebkitAppearance: 'none',
                  }}
                >
                  {(Object.keys(TYPE_META) as RowType[]).map(t => (
                    <option key={t} value={t}>{TYPE_META[t].label}</option>
                  ))}
                </select>
              </div>

              {/* Class-section picker */}
              <div>
                <ClassPicker
                  classes={row.classes}
                  onChange={cls => updateBreak(row.id, { classes: cls })}
                  rowId={row.id}
                  openId={openPicker}
                  setOpenId={setOpenPicker}
                  classEntries={classEntries}
                  allClassKeys={allClassKeys}
                  classGroups={classGroups}
                  streamDefs={streamDefs}
                  classStreamMap={classStreamMap}
                />
                {row.classes.length > 0 && row.classes.length < allClassKeys.length && (
                  <div style={{ fontSize: 10, color: '#9CA3AF', marginTop: 4 }}>
                    {row.classes.length} of {allClassKeys.length} classes
                  </div>
                )}
              </div>

              {/* Break timing selector + time hint */}
              <div>
                {/* Unified dropdown: period | after-break | custom */}
                <select
                  value={timingValue(row)}
                  onChange={e => {
                    const v = e.target.value
                    if (v === 'custom') {
                      updateBreak(row.id, { customStartTime: bStart, afterBreakId: undefined })
                    } else if (v.startsWith('b:')) {
                      updateBreak(row.id, { afterBreakId: v.slice(2), customStartTime: undefined })
                    } else {
                      const n = parseInt(v.slice(2), 10)
                      updateBreak(row.id, { afterPeriod: n, afterBreakId: undefined, customStartTime: undefined })
                    }
                  }}
                  style={{
                    width: '100%', padding: '5px 7px',
                    border: '1px solid #C4B5FD', borderRadius: 6,
                    fontSize: 12, fontFamily: 'inherit', outline: 'none',
                    background: '#F8F7FF', color: '#7C3AED', fontWeight: 600,
                    cursor: 'pointer', marginBottom: 5,
                  }}
                >
                  {basePeriodOptions.map(o => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                  {/* Chain options: "After previous break" shortcut + all other breaks */}
                  {(() => {
                    const rowIdx   = cwRows.findIndex(r => r.id === row.id)
                    const prevBrk  = cwRows.slice(0, rowIdx).reverse().find(b => b.classes.length > 0)
                    const otherBrks = cwRows.filter(b => b.id !== row.id && b.classes.length > 0 && b.id !== prevBrk?.id)
                    return (
                      <>
                        {prevBrk && (
                          <>
                            <option disabled value="">── Chain to break ──</option>
                            <option value={`b:${prevBrk.id}`}>
                              After previous break ({prevBrk.name})
                            </option>
                          </>
                        )}
                        {otherBrks.length > 0 && (
                          <>
                            <option disabled value="">── After another break ──</option>
                            {otherBrks.map(b => (
                              <option key={`b:${b.id}`} value={`b:${b.id}`}>
                                After {b.name} ({clsLabel(b.classes)})
                              </option>
                            ))}
                          </>
                        )}
                      </>
                    )
                  })()}
                  <option disabled value="">────────────────</option>
                  <option value="custom">Custom time…</option>
                </select>

                {/* Custom time inputs */}
                {row.customStartTime && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 4 }}>
                    <input
                      type="time"
                      value={row.customStartTime}
                      onChange={e => updateBreak(row.id, { customStartTime: e.target.value })}
                      style={{ flex: 1, padding: '3px 5px', border: '1px solid #C4B5FD', borderRadius: 5, fontSize: 11, fontFamily: 'inherit', outline: 'none', background: '#F8F7FF', color: '#7C3AED' }}
                    />
                    <span style={{ fontSize: 10, color: '#9CA3AF' }}>start</span>
                  </div>
                )}

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
  classEntries = CLASSES, allClassKeys = ALL_CLASS_KEYS, classGroups = CLASS_GROUPS,
  streamDefs, classStreamMap,
}: {
  classes: string[]; onChange: (c: string[]) => void
  rowId: string; openId: string | null; setOpenId: (id: string | null) => void
  classEntries?: typeof CLASSES
  allClassKeys?: string[]
  classGroups?: typeof CLASS_GROUPS
  /** Optional stream sub-grouping inside each class group */
  streamDefs?: Array<{ stream: string; color: string; bg: string; group: string }>
  classStreamMap?: Record<string, string[]>
}) {
  const isOpen = openId === rowId
  const ref    = useRef<HTMLDivElement>(null)
  const btnRef = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    if (!isOpen) return
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpenId(null) }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [isOpen, setOpenId])
  // allClassKeys may contain composite stream keys ("xi::Science").
  // Existing rows may hold simple keys ('xi'). keySelected treats a simple key
  // as covering all composite variants of that class (for visual checked-state only).
  const hasComposites = allClassKeys.some(isCompositeKey)
  const keySelected   = (k: string) =>
    classes.includes(k) || (hasComposites && isCompositeKey(k) && classes.includes(baseClassKey(k)))

  // Before any mutation: expand plain base keys to composite variants so that
  // stream-level operations work on a consistent, fully-expanded key list.
  const normalizeClasses = (cls: string[]): string[] => {
    if (!hasComposites) return cls
    return cls.flatMap(k => {
      if (isCompositeKey(k)) return [k]
      const variants = allClassKeys.filter(v => v.startsWith(`${k}${STREAM_SEP}`))
      return variants.length > 0 ? variants : allClassKeys.includes(k) ? [k] : []
    })
  }

  const activeSelected = allClassKeys.filter(keySelected)
  const isAll  = allClassKeys.length > 0 && allClassKeys.every(keySelected)
  const isNone = activeSelected.length === 0
  const label  = isAll ? 'All' : isNone ? '—'
    : activeSelected.length <= 3
      ? activeSelected.map(k => resolveShort(k, classEntries)).join(', ')
      : `${activeSelected.length} classes`

  // Toggle a single key. Always normalises first so plain base keys are
  // expanded to their composite variants before the specific stream is toggled.
  const toggleOne = (key: string, chk: boolean) => {
    const cur = normalizeClasses(classes)
    onChange(chk ? [...new Set([...cur, key])] : cur.filter(c => c !== key))
  }

  return (
    <div ref={ref} style={{ position: 'relative', display: 'inline-block' }}>
      <button ref={btnRef} onClick={() => setOpenId(isOpen ? null : rowId)} style={{
        padding: '3px 9px', borderRadius: 6, border: '1px solid #E5E7EB',
        background: isAll ? '#F0EDFF' : isNone ? '#FFF' : '#F9FAFB',
        fontSize: 11, fontWeight: 600, color: isAll ? '#7C3AED' : '#374151',
        cursor: 'pointer', whiteSpace: 'nowrap', fontFamily: 'inherit',
        display: 'flex', alignItems: 'center', gap: 4, maxWidth: 120, overflow: 'hidden',
      }}>
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{label}</span>
        <svg width="8" height="8" viewBox="0 0 8 8" fill="none" style={{ flexShrink: 0 }}>
          <path d="M1 2.5l3 3 3-3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </button>
      {isOpen && (() => {
        const DROPDOWN_W = 220
        const GAP = 4
        const rect = btnRef.current?.getBoundingClientRect()
        const vw = window.innerWidth, vh = window.innerHeight
        const spaceBelow = vh - ((rect?.bottom ?? 0) + GAP)
        const spaceAbove = (rect?.top  ?? 0) - GAP
        const openUpward = spaceBelow < 260 && spaceAbove > spaceBelow
        const listMaxH   = Math.min(360, openUpward ? spaceAbove - 8 : spaceBelow - 8)
        const rawLeft    = (rect?.right ?? 0) - DROPDOWN_W
        const left       = Math.min(Math.max(8, rawLeft), vw - DROPDOWN_W - 8)
        const posStyle   = openUpward
          ? { bottom: vh - (rect?.top  ?? 0) + GAP }
          : { top:    (rect?.bottom ?? 0) + GAP }
        return (
        <div style={{
          position: 'fixed', left, width: DROPDOWN_W, ...posStyle,
          maxHeight: listMaxH, overflowY: 'auto',
          background: '#fff', border: '1px solid #E5E7EB',
          borderRadius: 10, boxShadow: '0 8px 24px rgba(0,0,0,0.13)',
          zIndex: 9999, padding: '6px 0',
        }}>
          {/* All classes */}
          <label style={PICK_ROW}>
            <input type="checkbox" checked={isAll}
              ref={el => { if (el) el.indeterminate = !isAll && !isNone }}
              onChange={() => onChange(isAll ? [] : [...allClassKeys])}
              style={{ accentColor: '#7C6FE0', flexShrink: 0 }} />
            <span style={{ fontSize: 12, fontWeight: 700, color: '#13111E' }}>All classes</span>
          </label>

          {classGroups.map(gm => {
            const gc = classEntries.filter(c => c.group === gm.group)
            if (gc.length === 0) return null
            const groupStreams = streamDefs?.filter(s => s.group === gm.group) ?? []

            // Effective group keys — composite stream keys take precedence over simple keys
            const gk = allClassKeys.filter(k =>
              gc.some(c => k === c.key || k.startsWith(`${c.key}${STREAM_SEP}`))
            )
            if (gk.length === 0) return null

            const allIn = gk.every(keySelected)
            const anyIn = gk.some(keySelected)

            return (
              <div key={gm.group}>
                {/* Group header */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 12px 3px', marginTop: 4, borderTop: '1px solid #F3F4F6', background: gm.bg }}>
                  <input type="checkbox" checked={allIn}
                    ref={el => { if (el) el.indeterminate = !allIn && anyIn }}
                    onChange={() => {
                      const norm = normalizeClasses(classes)
                      onChange(allIn
                        ? norm.filter(k => !gk.includes(k))
                        : [...new Set([...norm, ...gk])]
                      )
                    }}
                    style={{ accentColor: gm.color, flexShrink: 0 }} />
                  <span style={{ fontSize: 11, fontWeight: 700, color: gm.color, letterSpacing: '0.04em' }}>{gm.group.toUpperCase()}</span>
                  <span style={{ fontSize: 10, color: '#9CA3AF', marginLeft: 'auto' }}>{gm.desc}</span>
                </div>

                {/* Per-class rows — expanded into per-stream sub-checkboxes when composite keys exist */}
                {gc.map(cls => {
                  const compositeKeys = allClassKeys.filter(k => k.startsWith(`${cls.key}${STREAM_SEP}`))

                  if (compositeKeys.length > 0) {
                    // Stream-expanded: each stream is independently selectable.
                    // keySelected also covers simple base keys (e.g. 'xi' counts as all xi streams selected).
                    const allStreamsIn = compositeKeys.every(keySelected)
                    const anyStreamIn  = compositeKeys.some(keySelected)
                    return (
                      <div key={cls.key}>
                        <div style={{ ...PICK_ROW, paddingLeft: 28 }}>
                          <input type="checkbox" checked={allStreamsIn}
                            ref={el => { if (el) el.indeterminate = !allStreamsIn && anyStreamIn }}
                            onChange={() => {
                              const norm = normalizeClasses(classes)
                              onChange(allStreamsIn
                                ? norm.filter(k => !compositeKeys.includes(k))
                                : [...new Set([...norm, ...compositeKeys])]
                              )
                            }}
                            style={{ accentColor: gm.color, flexShrink: 0, cursor: 'pointer' }} />
                          <span style={{ fontSize: 12, fontWeight: 600, color: '#374151' }}>{cls.label}</span>
                        </div>
                        {compositeKeys.map(ck => {
                          const stream  = ck.split(STREAM_SEP)[1]
                          const sd      = groupStreams.find(x => x.stream === stream)
                          const checked = keySelected(ck)
                          return (
                            <label key={ck} style={{ ...PICK_ROW, paddingLeft: 44 }}>
                              <input type="checkbox" checked={checked}
                                onChange={e => toggleOne(ck, e.target.checked)}
                                style={{ accentColor: sd?.color ?? gm.color, flexShrink: 0 }} />
                              <span style={{
                                padding: '1px 9px', borderRadius: 8, fontSize: 10, fontWeight: 700,
                                border: checked ? `1.5px solid ${sd?.color ?? gm.color}` : '1px solid #E5E7EB',
                                background: checked ? (sd?.bg ?? gm.bg) : '#F9FAFB',
                                color: checked ? (sd?.color ?? gm.color) : '#9CA3AF',
                              }}>{stream}</span>
                            </label>
                          )
                        })}
                      </div>
                    )
                  }

                  // Simple class row (no stream expansion)
                  if (!allClassKeys.includes(cls.key)) return null
                  return (
                    <label key={cls.key} style={{ ...PICK_ROW, paddingLeft: 28 }}>
                      <input type="checkbox" checked={classes.includes(cls.key)}
                        onChange={e => toggleOne(cls.key, e.target.checked)}
                        style={{ accentColor: gm.color, flexShrink: 0 }} />
                      <span style={{ fontSize: 12, color: '#374151' }}>{cls.label}</span>
                    </label>
                  )
                })}
              </div>
            )
          })}
        </div>
        )
      })()}
    </div>
  )
}
const PICK_ROW: CSSProperties = { display: 'flex', alignItems: 'center', gap: 8, padding: '5px 12px', cursor: 'pointer' }

// ══════════════════════════════════════════════════════════════
//  GapRow — always-visible strip between bell rows
// ══════════════════════════════════════════════════════════════
function GapRow({
  afterIndex, rows, onInsertBreak, onInsertPeriod, onInsertSplit, onInsertStaggered,
  allClassKeys = ALL_CLASS_KEYS,
}: {
  afterIndex: number; rows: BellRow[]
  onInsertBreak: (afterIndex: number, name: string) => void
  onInsertPeriod: (afterIndex: number) => void
  onInsertSplit: (afterIndex: number) => void
  onInsertStaggered?: (afterIndex: number) => void
  allClassKeys?: string[]
}) {
  const [mode,      setMode]      = useState<'idle' | 'break'>('idle')
  const [breakName, setBreakName] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const aboveRow = rows[afterIndex]
  const isPartialBreak = aboveRow
    && (aboveRow.type === 'short-break' || aboveRow.type === 'lunch')
    && aboveRow.classes.length > 0 && aboveRow.classes.length < allClassKeys.length
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
              title={`One split: classes outside "${aboveRow.name}" teach concurrently; classes inside get a period right after`}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 3,
                padding: '2px 9px', borderRadius: 12,
                border: '1px solid #C4B5FD', background: '#F5F3FF',
                color: '#7C3AED', fontSize: 10, fontWeight: 600,
                cursor: 'pointer', fontFamily: 'inherit',
              }}>
              <Sparkles size={8} /> Split
            </button>
            {onInsertStaggered && (
              <>
                <span style={{ width: 1, height: 10, background: '#D1D5DB', flexShrink: 0 }} />
                <button className="gap-btn" onClick={() => onInsertStaggered(afterIndex)}
                  title={`Staggered break: each group gets the same break but at different times (e.g. XI lunch 12–12:30, XII lunch 11:30–12)`}
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: 3,
                    padding: '2px 9px', borderRadius: 12,
                    border: '1px solid #FDE68A', background: '#FFFBEB',
                    color: '#D97706', fontSize: 10, fontWeight: 600,
                    cursor: 'pointer', fontFamily: 'inherit',
                  }}>
                  <Coffee size={8} /> Staggered
                </button>
              </>
            )}
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
        const grp = row.classes.length === 0 ? '—'
          : row.classes.length <= 4 ? row.classes.map(k => resolveShort(k)).join(', ')
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
  const { config, setConfig, setStep, setBreaks, sections: storeSections } = useTimetableStore()
  // Scoped to this timetable — computed once on mount so saves never bleed into another TT
  const bellKey = useRef(getBellKey()).current
  const [_saved] = useState<SavedBell | null>(loadSaved)

  // Custom class list — initialized from saved state OR from the grade range set in the modal.
  // Always run through canonicalizeClasses so stale keys ('nursery' → 'nur') are migrated
  // and Nursery is always sorted first within the Pre-Primary group.
  const [customClasses, setCustomClasses] = useState<typeof CLASSES>(() => {
    const from = (config as any).fromGrade as string | undefined
    const to   = (config as any).toGrade   as string | undefined
    const raw  = _saved?.customClasses?.length
      ? (_saved.customClasses as typeof CLASSES)
      : (from && to) ? classesFromGradeRange(from, to) : CLASSES
    return canonicalizeClasses(raw)
  })
  const [showManageClasses, setShowManageClasses] = useState(false)
  const [manageTab, setManageTab] = useState<'groups' | 'streams' | 'classes'>('classes')

  // Custom group definitions — initialized from saved state or defaults.
  // Any canonical groups missing from saved data (e.g. newly-added 'Senior Secondary')
  // are merged in so the UI always reflects the current CLASS_GROUPS definition.
  const [customGroups, setCustomGroups] = useState<typeof CLASS_GROUPS>(() => {
    if (!_saved?.customGroups?.length) return CLASS_GROUPS
    const saved = _saved.customGroups as typeof CLASS_GROUPS
    const savedNames = new Set(saved.map(g => g.group))
    const merged = [...saved, ...CLASS_GROUPS.filter(g => !savedNames.has(g.group))]
    return merged as typeof CLASS_GROUPS
  })

  // Stream definitions (e.g. Science, Commerce, Arts) + class→stream assignments
  type StreamDef = { stream: string; color: string; bg: string; group: string }
  const [customStreams, setCustomStreams] = useState<StreamDef[]>(() =>
    (_saved?.customStreams ?? []) as StreamDef[]
  )
  const [classStreamMap, setClassStreamMap] = useState<Record<string, string[]>>(() => {
    const raw = _saved?.classStreamMap ?? {}
    // Migrate old single-string format (Record<string,string>) to array format
    const migrated: Record<string, string[]> = {}
    for (const [k, v] of Object.entries(raw)) {
      migrated[k] = Array.isArray(v) ? v : v ? [v as unknown as string] : []
    }
    return migrated
  })

  // ── Sync from Resources step ──────────────────────────────────────────────
  // Whenever Step-1 sections change, rebuild customClasses / classStreamMap /
  // customStreams so the bell step always reflects the actual classes & streams.
  useEffect(() => {
    if (!storeSections?.length) return

    // Collect unique grades + their streams
    const gradeStreams = new Map<string, Set<string>>()
    ;(storeSections as any[]).forEach(s => {
      const raw: string = s.grade || (s.name ?? '').split('-')[0] || 'Unknown'
      const g = raw.replace(/^class\s+/i, '').trim()
      const stream: string = s.stream ?? ''
      if (!gradeStreams.has(g)) gradeStreams.set(g, new Set())
      if (stream) gradeStreams.get(g)!.add(stream)
    })

    // Match grades to the CLASSES constant by short name (XI → key 'xi') OR label
    // ('Nursery' short = 'Nur' so label-match is essential for pre-primary grades).
    const gradeKeys = [...gradeStreams.keys()]
    const matched = CLASSES.filter(c =>
      gradeStreams.has(c.short) ||
      gradeKeys.some(k => k.toLowerCase() === c.label.toLowerCase())
    )
    const matchedKeys = new Set(matched.flatMap(c => [c.short, c.label.toLowerCase()]))

    // Synthesise entries for any grade that still didn't match a canonical class
    const extra: typeof CLASSES = gradeKeys
      .filter(g => !matchedKeys.has(g) && !matchedKeys.has(g.toLowerCase()))
      .map(g => ({
        key:   g.toLowerCase().replace(/\s+/g, '-'),
        label: /^(nursery|lkg|ukg)$/i.test(g) ? g : `Class ${g}`,
        short: g,
        group: gradeToGroup(g),
      }))

    // Canonicalise so Nursery gets key 'nur' and is sorted first in Pre-Primary
    const newClasses = canonicalizeClasses([...matched, ...extra])
    if (!newClasses.length) return

    // classStreamMap: class key → [stream names]
    const newStreamMap: Record<string, string[]> = {}
    gradeStreams.forEach((streams, g) => {
      const cls = newClasses.find(c => c.short === g)
      if (cls && streams.size > 0) newStreamMap[cls.key] = [...streams]
    })

    // Unique streams with distinct colours
    const allStreams = [...new Set([...gradeStreams.values()].flatMap(s => [...s]))]
    const STREAM_COLORS = [
      { color: '#7C6FE0', bg: '#F0EDFF' }, { color: '#059669', bg: '#D1FAE5' },
      { color: '#D97706', bg: '#FEF3C7' }, { color: '#DC2626', bg: '#FEE2E2' },
      { color: '#2563EB', bg: '#DBEAFE' }, { color: '#9333EA', bg: '#F5F3FF' },
    ]
    const newStreamDefs = allStreams.map((stream, i) => {
      let group = 'Senior'
      for (const [g, ss] of gradeStreams) {
        if (ss.has(stream)) { group = gradeToGroup(g); break }
      }
      const col = STREAM_COLORS[i % STREAM_COLORS.length]
      return { stream, color: col.color, bg: col.bg, group }
    })

    // Only include groups that are actually used
    const usedGroups = new Set(newClasses.map(c => c.group))
    const newGroups = CLASS_GROUPS.filter(g => usedGroups.has(g.group))

    setCustomClasses(newClasses as typeof CLASSES)
    setCustomGroups((newGroups.length ? newGroups : CLASS_GROUPS) as typeof CLASS_GROUPS)
    setClassStreamMap(newStreamMap)
    setCustomStreams(newStreamDefs)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storeSections])

  const activeClasses    = customClasses
  const activeClassKeys  = useMemo(() => customClasses.map(c => c.key), [customClasses])

  // Composite class keys for the class-wise breaks panel.
  // Classes that have streams are expanded to "classKey::StreamName" so each
  // stream can be selected independently as a scheduling unit.
  const cwClassKeys = useMemo(() => {
    if (!customStreams.length) return activeClassKeys
    return customClasses.flatMap(cls => {
      const grpStreams = customStreams.filter(s => s.group === cls.group)
      const streams    = (classStreamMap[cls.key] ?? []).filter(s => grpStreams.some(x => x.stream === s))
      return streams.length > 0 ? streams.map(s => `${cls.key}${STREAM_SEP}${s}`) : [cls.key]
    })
  }, [customClasses, activeClassKeys, customStreams, classStreamMap])

  // Grades derived from the Resources step sections (Step 1 data)
  const GRADE_SORT = ['Nursery','LKG','UKG','I','II','III','IV','V','VI','VII','VIII','IX','X','XI','XII']
  const { uniqueGrades, sectionsPerGrade } = useMemo(() => {
    const map = new Map<string, number>()
    ;(storeSections ?? []).forEach((s: any) => {
      const g: string = s.grade || s.name?.split('-')[0] || 'Unknown'
      map.set(g, (map.get(g) ?? 0) + 1)
    })
    const sorted = [...map.keys()].sort((a, b) => {
      const ai = GRADE_SORT.indexOf(a.replace(/^class\s+/i, '').trim())
      const bi = GRADE_SORT.indexOf(b.replace(/^class\s+/i, '').trim())
      return (ai < 0 ? 100 : ai) - (bi < 0 ? 100 : bi)
    })
    return { uniqueGrades: sorted, sectionsPerGrade: Object.fromEntries(map) }
  }, [storeSections])

  // Groups that have at least one class assigned — used in pickers, timelines, capacity
  const activeClassGroups = useMemo(() =>
    customGroups
      .map(g => ({
        ...g,
        desc: customClasses.filter(c => c.group === g.group).map(c => c.short).join(', ') || g.group,
      }))
      .filter(g => customClasses.some(c => c.group === g.group)),
  [customClasses, customGroups])

  const [autoBellMode,     setAutoBellMode]     = useState<boolean>(() => _saved?.autoBellMode ?? false)
  const [schoolEndTime,    setSchoolEndTime]    = useState<string>( () => _saved?.schoolEndTime ?? '15:30')
  // 'single' = one shared lunch for all | 'smart' = staggered by age group
  const [smartLunchMode,   setSmartLunchMode]   = useState<'single' | 'smart'>(() => _saved?.smartLunchMode ?? 'single')
  // Per-group overrides of the computed lunch afterPeriod default
  const [smartLunchAP,     setSmartLunchAP]     = useState<Record<string, number>>(() => _saved?.smartLunchAfterPeriod ?? {})
  // Set to true after first successful generation so the "generated" banner shows
  const [smartGenDone,     setSmartGenDone]     = useState(false)
  // Concurrent period: duration of a period for classes NOT eating during a staggered lunch
  const [concurrentMode, setConcurrentMode] = useState<'regular' | 'match-lunch' | 'custom'>(() => _saved?.concurrentPeriodMode ?? 'regular')
  const [concurrentDur,  setConcurrentDur]  = useState<number>(                               () => _saved?.concurrentPeriodDur  ?? 45)
  // Optional morning break (breakfast / snack break for day-boarding schools)
  const [morningBreak,    setMorningBreak]    = useState<boolean>(() => _saved?.morningBreak    ?? false)
  const [morningBreakPos, setMorningBreakPos] = useState<number>( () => _saved?.morningBreakPos ?? 1)   // 0 = assembly, 1 = P1, 2 = P2 …
  const [morningBreakDur, setMorningBreakDur] = useState<number>( () => _saved?.morningBreakDur ?? 15)
  const [shiftName,  setShiftName]  = useState<string>(  () => _saved?.shiftName ?? 'Main Shift')

  const [startTime,  setStartTime]  = useState<string>(  () => _saved?.startTime ?? (config.startTime ?? '09:00'))
  const [use12h,     setUse12h]     = useState<boolean>( () => _saved?.use12h ?? true)
  const [periodDur,    setPeriodDur]    = useState<number>(() => _saved?.periodDur    ?? (config.defaultSessionDuration ?? 40))
  const [periodDurMin, setPeriodDurMin] = useState<number>(() => (_saved as any)?.periodDurMin ?? Math.max(10, Math.round((_saved?.periodDur ?? (config.defaultSessionDuration ?? 40)) * 0.5)))
  const [maxPeriods,   setMaxPeriods]   = useState<number>(() => _saved?.maxPeriods   ?? (config.periodsPerDay ?? 8))
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

  // ── Schedule mode ────────────────────────────────────────────
  const [scheduleMode, setScheduleMode] = useState<'standard' | 'advanced'>(() => _saved?.scheduleMode ?? 'standard')
  const isAdvanced = scheduleMode === 'advanced'

  // ── Schedule rhythm ──────────────────────────────────────────
  const [cycleWeeks,     setCycleWeeks]     = useState<number>(  () => _saved?.cycleWeeks     ?? 1)
  const [useDayNames,    setUseDayNames]    = useState<boolean>( () => _saved?.useDayNames    ?? false)
  const [cycleStartDate, setCycleStartDate] = useState<string>(  () => _saved?.cycleStartDate ?? '')
  const [fixedDuration,  setFixedDuration]  = useState<boolean>( () => _saved?.fixedDuration  ?? false)
  const [rotationDays,   setRotationDays]   = useState<RotDay[]>(() => _saved?.rotationDays   ?? DEFAULT_ROT_DAYS)
  const [weekWorkDays,   setWeekWorkDays]   = useState<Record<number, string[]>>(() => _saved?.weekWorkDays ?? {})
  const [dayStartTimes,  setDayStartTimes]  = useState<Record<string, string>>( () => _saved?.dayStartTimes  ?? {})
  const [dayPeriodDurs,  setDayPeriodDurs]  = useState<Record<string, number>>( () => _saved?.dayPeriodDurs  ?? {})
  const [dayOffRules,    setDayOffRules]    = useState<DayOffRule[]>(() => {
    // If previously saved (even as []), respect the user's choice exactly.
    if (_saved !== null && _saved.dayOffRules !== undefined) return _saved.dayOffRules
    // Fresh load — auto-apply Saturday off for all Pre-Primary classes present in this school.
    // Pre-Primary children (under 5) should never have a 6-day week; this mirrors NEP 2020.
    const from = (config as any).fromGrade as string | undefined
    const to   = (config as any).toGrade   as string | undefined
    const initClasses = canonicalizeClasses(
      _saved?.customClasses?.length
        ? (_saved.customClasses as typeof CLASSES)
        : (from && to) ? classesFromGradeRange(from, to) : CLASSES
    )
    const initWorkDays: string[] = _saved?.workDays?.length
      ? _saved.workDays
      : config.workDays?.length
        ? config.workDays.map((d: string) => d.charAt(0) + d.slice(1, 3).toLowerCase())
        : ['Mon', 'Tue', 'Wed', 'Thu', 'Fri']
    // Only create the rule when Saturday is actually a school day (otherwise no rule needed)
    const prePrimaryKeys = ['nur', 'lkg', 'ukg'].filter(k => initClasses.some(c => c.key === k))
    if (prePrimaryKeys.length > 0 && initWorkDays.includes('Sat')) {
      return [{ id: makeId(), day: 'Sat', classes: prePrimaryKeys }]
    }
    return []
  })
  // Not persisted — suggestions re-appear on fresh load so the user always sees
  // the recommendation until they either apply or dismiss it manually.
  const [dismissedDaySugs, setDismissedDaySugs] = useState<string[]>([])

  // ── Age-appropriate day-off smart suggestions ─────────────────
  // A suggestion is shown when:
  //  1. Its day is currently a work day (user could add a rule for it)
  //  2. At least one of its class keys is active in this school
  //  3. No existing dayOffRule already covers that day for those classes
  //  4. The user hasn't dismissed it this session
  const daySuggestions = useMemo(() =>
    AGE_DAYOFF_SUGGESTIONS.filter(sug => {
      if (!workDays.includes(sug.day)) return false
      // Suggestion is only relevant if at least one of its classes is active in this school
      const relevantKeys = sug.classKeys.filter(k => activeClassKeys.includes(k))
      if (!relevantKeys.length) return false
      // Hide only when EVERY active class in the suggestion already has a day-off rule for that day.
      // Partial coverage (e.g. LKG+UKG covered but Nursery missing) keeps the suggestion visible.
      const coveredKeys = new Set(
        dayOffRules.filter(r => r.day === sug.day).flatMap(r => r.classes)
      )
      const allCovered = relevantKeys.every(k => coveredKeys.has(k))
      if (allCovered) return false
      if (dismissedDaySugs.includes(sug.id)) return false
      return true
    }),
  // eslint-disable-next-line react-hooks/exhaustive-deps
  [workDays, activeClassKeys, dayOffRules, dismissedDaySugs])

  const applyDaySuggestion = (sug: DaySuggestion) => {
    // Only add classes not already covered by an existing rule for that day
    const coveredKeys = new Set(
      dayOffRules.filter(r => r.day === sug.day).flatMap(r => r.classes)
    )
    const keys = sug.classKeys.filter(k => activeClassKeys.includes(k) && !coveredKeys.has(k))
    if (!keys.length) return
    setDayOffRules(prev => [...prev, { id: makeId(), day: sug.day, classes: keys }])
    setDismissedDaySugs(prev => [...prev, sug.id])
  }

  // ── UI-only (not persisted) ───────────────────────────────────
  const [confirmDialog, setConfirmDialog] = useState<{ msg: string; onConfirm: () => void } | null>(null)
  const [copyFrom,      setCopyFrom]      = useState('')
  const [copyTo,        setCopyTo]        = useState('')
  // ── Per-day bell variation ────────────────────────────────────
  const [varyByDay,    setVaryByDay]    = useState<boolean>(                  () => _saved?.varyByDay ?? false)
  const [activeDayTab, setActiveDayTab] = useState<string>('')
  const [dayRows,      setDayRows]      = useState<Record<string, BellRow[]>>(() => _saved?.dayRows   ?? {})

  // ── Multi-shift (Advanced mode) ──────────────────────────────
  const [shifts, setShifts] = useState<ShiftConfig[]>(() => {
    if (_saved?.shifts?.length) return _saved.shifts
    const initKeys = _saved?.customClasses?.length
      ? (_saved.customClasses as Array<{key: string}>).map(c => c.key)
      : (() => {
          const from = (config as any).fromGrade as string | undefined
          const to   = (config as any).toGrade   as string | undefined
          if (from && to) return classesFromGradeRange(from, to).map(c => c.key)
          return [...ALL_CLASS_KEYS]
        })()
    return [{
      id:         'shift-main',
      name:       _saved?.shiftName  ?? 'Main Shift',
      startTime:  _saved?.startTime  ?? (config.startTime ?? '09:00'),
      periodDur:  _saved?.periodDur  ?? (config.defaultSessionDuration ?? 40),
      maxPeriods: _saved?.maxPeriods ?? (config.periodsPerDay ?? 8),
      use12h:     _saved?.use12h     ?? true,
      classes:    initKeys,
    }]
  })
  const [activeShiftId, setActiveShiftId] = useState<string>(() => _saved?.activeShiftId ?? 'shift-main')
  const [shiftRows,     setShiftRows]     = useState<Record<string, BellRow[]>>(() => _saved?.shiftRows ?? {})

  const [openPicker,    setOpenPicker]    = useState<string | null>(null)
  const [editingEnd,    setEditingEnd]    = useState(false)
  const [showCwPanel,   setShowCwPanel]   = useState(false)
  const [cwRows, setCwRows] = useState<CwBreakRow[]>(() => {
    // Restore saved rows but strip any class keys that no longer belong to the
    // active class list (e.g. user changed the class range since last save).
    const initKeys = _saved?.customClasses?.length
      ? (_saved.customClasses as Array<{key: string}>).map(c => c.key)
      : (() => {
          const from = (config as any).fromGrade as string | undefined
          const to   = (config as any).toGrade   as string | undefined
          if (from && to) return classesFromGradeRange(from, to).map(c => c.key)
          return [...ALL_CLASS_KEYS]
        })()
    return (_saved?.cwRows ?? []).map(r => ({
      ...r,
      // Preserve composite stream keys (xi::Science) if their base class is still active
      classes: r.classes.filter(k => initKeys.includes(k) || initKeys.includes(baseClassKey(k))),
    }))
  })

  // ── Persistence ───────────────────────────────────────────────
  useEffect(() => {
    localStorage.setItem(bellKey, JSON.stringify({
      shiftName, startTime, use12h, periodDur, periodDurMin, maxPeriods, workDays, rows,
      cycleWeeks, useDayNames, cycleStartDate, fixedDuration, rotationDays,
      weekWorkDays, dayStartTimes, dayPeriodDurs, dayOffRules, cwRows, varyByDay, dayRows,
      scheduleMode, shifts, activeShiftId, shiftRows, customClasses, customGroups,
      customStreams, classStreamMap, autoBellMode, schoolEndTime,
      smartLunchMode, smartLunchAfterPeriod: smartLunchAP,
      morningBreak, morningBreakPos, morningBreakDur,
      concurrentPeriodMode: concurrentMode, concurrentPeriodDur: concurrentDur,
    } as SavedBell))
  }, [shiftName, startTime, use12h, periodDur, periodDurMin, maxPeriods, workDays, rows,
      cycleWeeks, useDayNames, cycleStartDate, fixedDuration, rotationDays,
      weekWorkDays, dayStartTimes, dayPeriodDurs, dayOffRules, cwRows, varyByDay, dayRows,
      scheduleMode, shifts, activeShiftId, shiftRows, customClasses, customGroups,
      customStreams, classStreamMap, autoBellMode, schoolEndTime,
      smartLunchMode, smartLunchAP, morningBreak, morningBreakPos, morningBreakDur,
      concurrentMode, concurrentDur])

  // ── Smart lunch: effective afterPeriod per group ─────────────
  // Time-aware defaults: distribute all 5 groups within a 12:00–2:00 PM lunch window.
  // With short periods (40 min) this allows 5 distinct slots; with long periods (70 min)
  // only 2–3 slots fit before 2 PM so groups are shared across slots.
  // User overrides in smartLunchAP always take precedence.
  const effectiveLunchAP = useMemo(() => {
    const asmDur   = 10
    const sbAfterP = Math.max(1, Math.ceil(maxPeriods * 0.3))
    const asmEnd   = toMins(startTime) + asmDur
    const sbEnd    = asmEnd + sbAfterP * periodDur + 15  // minutes when short break ends

    // Pre-Primary (under 5 yrs) eats early — at the same slot as the short break for others.
    // This means their lunch starts at ~11:15 AM instead of waiting until 12:40+ PM.
    const prePrimaryP = sbAfterP  // e.g., after P2 → 11:15 AM

    // Remaining 4 groups distribute across slots AFTER the short break (before 2 PM cap).
    const LATEST_LUNCH = 14 * 60  // 2 PM hard cap
    const minsAfterSb  = LATEST_LUNCH - sbEnd
    const maxLunchP    = Math.min(maxPeriods, sbAfterP + Math.max(1, Math.floor(minsAfterSb / periodDur)))
    const minLunchP    = sbAfterP + 1
    const availSlots   = Math.max(1, maxLunchP - minLunchP + 1)

    const LATER_GROUPS = ['Primary', 'Middle', 'Senior', 'Senior Secondary'] as const
    const defaults: Record<string, number> = { 'Pre-Primary': prePrimaryP }
    LATER_GROUPS.forEach((g, i) => {
      const slotIdx = LATER_GROUPS.length <= 1 ? 0
        : Math.round(i * (availSlots - 1) / (LATER_GROUPS.length - 1))
      defaults[g] = Math.max(minLunchP, Math.min(maxLunchP, minLunchP + slotIdx))
    })
    return { ...defaults, ...smartLunchAP }
  }, [maxPeriods, periodDur, startTime, smartLunchAP])

  // ── Group metadata for Smart Timing UI ───────────────────────
  const SMART_GROUP_META: Record<string, { emoji: string; color: string; bg: string; border: string }> = {
    'Pre-Primary':      { emoji: '🧸', color: '#6D28D9', bg: '#F5F3FF', border: '#C4B5FD' },
    'Primary':          { emoji: '📚', color: '#1D4ED8', bg: '#EFF6FF', border: '#BFDBFE' },
    'Middle':           { emoji: '📖', color: '#059669', bg: '#F0FDF4', border: '#6EE7B7' },
    'Senior':           { emoji: '📐', color: '#D97706', bg: '#FFFBEB', border: '#FDE68A' },
    'Senior Secondary': { emoji: '🎓', color: '#DC2626', bg: '#FEF2F2', border: '#FECACA' },
  }

  // ── Day keys ─────────────────────────────────────────────────
  // • day-names mode  → rotation day shorts (D1, D2, …)
  // • single week     → working days (Mon, Tue, …)
  // • multi-week      → "w1-Mon", "w1-Tue", …, "w2-Mon", … (per-week working days)
  const dayKeys = useMemo(() => {
    if (useDayNames) return rotationDays.map(d => d.short)
    if (cycleWeeks <= 1) return workDays
    const keys: string[] = []
    for (let w = 1; w <= cycleWeeks; w++) {
      const wdays = weekWorkDays[w] ?? workDays
      // Preserve calendar order
      ALL_DAYS.filter(d => wdays.includes(d)).forEach(d => keys.push(`w${w}-${d}`))
    }
    return keys
  }, [useDayNames, rotationDays, workDays, cycleWeeks, weekWorkDays])

  // Stable string to use as effect dependency for dayKeys identity
  const dayKeysStr = useMemo(() => dayKeys.join(','), [dayKeys])

  /** The shift currently being edited/viewed in Advanced mode. */
  const activeShift = useMemo(() =>
    isAdvanced ? (shifts.find(s => s.id === activeShiftId) ?? shifts[0] ?? null) : null,
    [isAdvanced, shifts, activeShiftId],
  )

  /**
   * Map from classKey → name of the OTHER shift that already owns it.
   * Used to grey-out / tooltip classes in the assignment picker.
   */
  const classOwnedBy = useMemo<Record<string, string>>(() => {
    if (!isAdvanced) return {}
    const map: Record<string, string> = {}
    shifts.filter(s => s.id !== activeShiftId).forEach(s =>
      s.classes.forEach(k => { map[k] = s.name })
    )
    return map
  }, [isAdvanced, shifts, activeShiftId])

  /**
   * Effective start time for the currently displayed bell grid.
   * In Advanced mode uses the active shift's startTime; per-day override
   * takes precedence when Vary-by-day is on.
   */
  const activeStartTime = useMemo(() => {
    const base = activeShift ? activeShift.startTime : startTime
    return varyByDay && activeDayTab && dayStartTimes[activeDayTab]
      ? dayStartTimes[activeDayTab]
      : base
  }, [activeShift, startTime, varyByDay, activeDayTab, dayStartTimes])

  /** Effective period duration — active shift (advanced) or global, with per-day override. */
  const activePeriodDur = useMemo(() => {
    const base = activeShift ? activeShift.periodDur : periodDur
    return varyByDay && activeDayTab && dayPeriodDurs[activeDayTab]
      ? dayPeriodDurs[activeDayTab]
      : base
  }, [activeShift, periodDur, varyByDay, activeDayTab, dayPeriodDurs])

  /** Effective max periods — active shift (advanced) or global. */
  const activeMaxPeriods = useMemo(() =>
    activeShift ? activeShift.maxPeriods : maxPeriods,
    [activeShift, maxPeriods],
  )

  // ── Copy days/weeks helper ────────────────────────────────────
  const handleCopyDays = (from: string, to: string) => {
    if (!from || !to || from === to) return
    if (cycleWeeks > 1 && !useDayNames) {
      // from/to are week numbers ("1", "2", …)
      const fw = parseInt(from), tw = parseInt(to)
      const fdays = weekWorkDays[fw] ?? workDays
      const tdays = weekWorkDays[tw] ?? workDays
      setDayRows(prev => {
        const next = { ...prev }
        fdays.forEach(d => {
          const fk = `w${fw}-${d}`, tk = `w${tw}-${d}`
          if (tdays.includes(d)) next[tk] = (prev[fk] ?? rows).map(r => ({ ...r, id: makeId() }))
        })
        return next
      })
      setDayStartTimes(prev => {
        const next = { ...prev }
        fdays.forEach(d => { const fk = `w${fw}-${d}`, tk = `w${tw}-${d}`; if (prev[fk] && tdays.includes(d)) next[tk] = prev[fk] })
        return next
      })
      setDayPeriodDurs(prev => {
        const next = { ...prev }
        fdays.forEach(d => { const fk = `w${fw}-${d}`, tk = `w${tw}-${d}`; if (prev[fk] && tdays.includes(d)) next[tk] = prev[fk] })
        return next
      })
    } else {
      // from/to are day keys directly
      setDayRows(prev => ({ ...prev, [to]: (prev[from] ?? rows).map(r => ({ ...r, id: makeId() })) }))
      setDayStartTimes(prev => dayStartTimes[from] ? { ...prev, [to]: dayStartTimes[from] } : prev)
      setDayPeriodDurs(prev => dayPeriodDurs[from]  ? { ...prev, [to]: dayPeriodDurs[from]  } : prev)
    }
  }

  /** Base rows for the active shift (multi-shift advanced) or global rows (standard). */
  const activeShiftBaseRows = useMemo(() =>
    isAdvanced ? (shiftRows[activeShiftId] ?? rows) : rows,
    [isAdvanced, shiftRows, activeShiftId, rows],
  )

  /** Rows currently active in the bell grid (uniform or per-day tab). */
  const displayRows: BellRow[] = useMemo(() =>
    varyByDay && activeDayTab
      ? (dayRows[activeDayTab] ?? activeShiftBaseRows)
      : activeShiftBaseRows,
    [varyByDay, activeDayTab, dayRows, activeShiftBaseRows],
  )

  /** Route row edits to the right bucket: uniform or the active day tab or active shift. */
  const setDisplayRows = (updater: BellRow[] | ((p: BellRow[]) => BellRow[])) => {
    if (varyByDay && activeDayTab) {
      setDayRows(prev => {
        const cur  = prev[activeDayTab] ?? activeShiftBaseRows
        const next = typeof updater === 'function' ? updater(cur) : updater
        return { ...prev, [activeDayTab]: next }
      })
    } else if (isAdvanced) {
      setShiftRows(prev => {
        const cur  = prev[activeShiftId] ?? rows
        const next = typeof updater === 'function' ? updater(cur) : updater
        return { ...prev, [activeShiftId]: next }
      })
    } else {
      if (typeof updater === 'function') setRows(updater)
      else setRows(updater)
    }
  }

  // ── Sync dayRows when dayKeys changes (e.g. cycleWeeks or weekWorkDays updated) ──
  useEffect(() => {
    if (!varyByDay || dayKeys.length === 0) return
    setDayRows(prev => {
      const next: Record<string, BellRow[]> = {}
      let changed = false
      for (const k of dayKeys) {
        if (prev[k]) { next[k] = prev[k] }
        else { next[k] = activeShiftBaseRows.map(r => ({ ...r, id: makeId() })); changed = true }
      }
      // Prune keys no longer in dayKeys
      const pruned = Object.keys(prev).some(k => !dayKeys.includes(k))
      return (changed || pruned) ? next : prev
    })
    setActiveDayTab(t => dayKeys.includes(t) ? t : (dayKeys[0] ?? ''))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dayKeysStr, varyByDay])

  // ── "Attending today" — which class groups are present on this day ──
  const todayAttendance = useMemo(() => {
    if (!varyByDay || !activeDayTab) return null
    return CLASS_GROUPS.map(gm => {
      const gkeys = CLASSES.filter(c => c.group === gm.group).map(c => c.key)
      const attending = displayRows.some(r => r.classes.some(k => gkeys.includes(k)))
      return { ...gm, attending, gkeys }
    })
  }, [varyByDay, activeDayTab, displayRows])

  /** Toggle a whole class group on/off for the currently active day. */
  const toggleDayGroup = (gkeys: string[], on: boolean) => {
    setDisplayRows(prev => prev.map(r => ({
      ...r,
      classes: on
        ? [...new Set([...r.classes, ...gkeys])]          // restore group
        : r.classes.filter(k => !gkeys.includes(k)),      // remove group
    })))
  }

  // ── Derived: start-time cascades ──────────────────────────────
  const startTimes = useMemo(() => computeStarts(activeStartTime, displayRows), [activeStartTime, displayRows])

  // ── Partial-break detection ───────────────────────────────────
  const hasPartialBreaks = useMemo(() =>
    displayRows.some(r =>
      (r.type === 'short-break' || r.type === 'lunch') &&
      r.classes.length > 0 && r.classes.length < activeClassKeys.length,
    ), [displayRows, activeClassKeys])

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
    // Rule: if a non-teaching row (break / dispersal) is PARTIAL — at least one
    // active stream class is absent from it — then the row immediately after it
    // starts at the SAME time (concurrent scheduling).  Classes not attending the
    // break continue straight into the next row without waiting for the break to end.
    //
    // IMPORTANT: the non-concurrent fallback MUST cascade from result[i-1] (the
    // already-modified start), NOT from startTimes[i] (the unmodified sequential
    // clock).  Without this, a concurrent row's earlier start doesn't propagate:
    //   e.g. Period 3 moved to 11:30 AM (concurrent with Lunch 1) → Second Lunch
    //   should be 11:30 + 30 = 12:00 PM, but startTimes would say 12:30 PM.
    const result: string[] = []
    for (let i = 0; i < displayRows.length; i++) {
      if (i === 0) { result.push(activeStartTime); continue }

      const prev      = displayRows[i - 1]
      const prevStart = result[i - 1]
      const cur       = displayRows[i]

      // Only apply the concurrent rule for non-teaching preceding rows
      if (prev.type !== 'teaching') {
        // prevIsPartial: at least one cwClassKey is NOT covered by prev.classes
        const prevIsPartial = cwClassKeys.some(k =>
          !prev.classes.includes(k) && !prev.classes.includes(baseClassKey(k))
        )

        if (prevIsPartial) {
          // currentHasOutsider: at least one cwClassKey is in cur but NOT in prev
          const currentHasOutsider = cwClassKeys.some(k => {
            const inCur  = cur.classes.includes(k) || cur.classes.includes(baseClassKey(k))
            const inPrev = prev.classes.includes(k) || prev.classes.includes(baseClassKey(k))
            return inCur && !inPrev
          })

          if (currentHasOutsider) {
            result.push(prevStart)   // concurrent — same start as the partial break
            continue
          }
        }
      }

      // Sequential: cascade from the modified prev start (not the raw startTimes clock)
      result.push(addMins(prevStart, prev.duration))
    }
    return result
  }, [hasPartialBreaks, displayRows, activeStartTime, startTimes, cwClassKeys])

  /**
   * School end time = start of the last row (using filtered clock) + its duration.
   * Using rowStartTimes instead of startTimes prevents the master-clock inflation
   * from concurrent split rows (e.g. two Period 4s at the same clock time) from
   * doubling up in the end-time calculation.
   */
  const endTime = useMemo(() => {
    if (displayRows.length === 0) return activeStartTime
    return addMins(rowStartTimes[displayRows.length - 1], displayRows[displayRows.length - 1].duration)
  }, [displayRows, rowStartTimes, activeStartTime])

  // ── Timeline data: per-group filtered if partial breaks exist ─
  const groupTimelineData = useMemo(() => {
    return activeClassGroups.map(gm => {
      const groupKeys = activeClasses.filter(c => c.group === gm.group).map(c => c.key)
      const repKey    = groupKeys[0]
      const fStarts   = hasPartialBreaks
        ? computeStartsFiltered(activeStartTime, displayRows, repKey)
        : startTimes

      const data = displayRows
        .map((row, i) => ({ row, start: fStarts[i] }))
        .filter(({ row }) => row.classes.some(k => {
          const kBase = isCompositeKey(k) ? baseClassKey(k) : k
          return groupKeys.includes(k) || groupKeys.includes(kBase)
        }))

      return { gm, data }
    })
  }, [hasPartialBreaks, activeStartTime, displayRows, startTimes])

  // Master timeline (all rows, no filter)
  const masterTimelineData = useMemo(() =>
    displayRows.map((row, i) => ({ row, start: startTimes[i] })),
    [displayRows, startTimes],
  )

  // ── Class-wise breaks panel ───────────────────────────────────
  const handleOpenCwPanel = () => {
    if (cwRows.length === 0) {
      const existingBreaks = displayRows.filter(r => r.type === 'short-break' || r.type === 'lunch')
      if (existingBreaks.length > 0) {
        setCwRows(existingBreaks.map(r => {
          const idx = displayRows.indexOf(r)
          const afterPeriod = displayRows.slice(0, idx).filter(rr => rr.type === 'teaching').length
          // Strip class keys that are no longer in the active class list
          const validClasses = r.classes.filter(k => activeClassKeys.includes(k))
          return {
            id:          r.id,
            name:        r.name,
            type:        r.type as 'short-break' | 'lunch',
            classes:     validClasses.length > 0 ? validClasses : [...activeClassKeys],
            afterPeriod,
            duration:    r.duration,
          }
        }))
      } else {
        // Default: lunch after the midpoint period, all active classes
        setCwRows([{
          id:          makeId(),
          name:        'Lunch Break',
          type:        'lunch',
          classes:     [...activeClassKeys],
          afterPeriod: Math.max(1, Math.floor(maxPeriods / 2)),
          duration:    30,
        }])
      }
    } else {
      // Panel already has rows — sanitise stale class keys every time it opens
      setCwRows(prev => prev.map(r => ({
        ...r,
        classes: r.classes.filter(k => cwClassKeys.includes(k) || activeClassKeys.includes(k)),
      })))
    }
    setShowCwPanel(true)
  }

  const handleGenerateFromCw = () => {
    const asmDur  = rows.find(r => r.type === 'assembly')?.duration ?? 10
    const newRows = buildBellRowsFromCw(activeStartTime, activePeriodDur, activeMaxPeriods, cwRows, cwClassKeys, asmDur)
    setDisplayRows(newRows)
    setShowCwPanel(false)
  }

  // ── Other handlers ────────────────────────────────────────────
  const handleEndTimeEdit = (val: string) => {
    if (!val || !/^\d{2}:\d{2}$/.test(val)) return
    const target = toMins(val) - toMins(activeStartTime)
    if (target <= 0) return
    const current = displayRows.reduce((s, r) => s + r.duration, 0)
    const diff    = target - current
    if (diff === 0) return
    setDisplayRows(prev => {
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
    // Only update the DEFAULT — rows that still match the old default are also nudged,
    // but rows the user individually edited (≠ old default) are preserved.
    const oldDur = activePeriodDur
    if (varyByDay && activeDayTab) {
      setDayPeriodDurs(prev => ({ ...prev, [activeDayTab]: v }))
      setDisplayRows(prev => prev.map(r => r.type === 'teaching' && r.duration === oldDur ? { ...r, duration: v } : r))
    } else if (isAdvanced) {
      updateActiveShift({ periodDur: v })
      setDisplayRows(prev => prev.map(r => r.type === 'teaching' && r.duration === oldDur ? { ...r, duration: v } : r))
    } else {
      setPeriodDur(v)
      setDisplayRows(prev => prev.map(r => r.type === 'teaching' && r.duration === oldDur ? { ...r, duration: v } : r))
    }
  }

  /** Explicitly force every teaching row to the current default duration. */
  const applyDurToAll = () => {
    setDisplayRows(prev => prev.map(r => r.type === 'teaching' ? { ...r, duration: activePeriodDur } : r))
  }

  const handleMaxPeriodsChange = (n: number) => {
    const v = Math.max(1, Math.min(16, n))
    if (isAdvanced) {
      updateActiveShift({ maxPeriods: v })
    } else {
      setMaxPeriods(v)
    }
    setDisplayRows(prev => {
      const asm  = prev.find(r => r.type === 'assembly')  ?? mkAssembly()
      const dis  = prev.find(r => r.type === 'dispersal') ?? mkDispersal()
      const brks = prev.filter(r => r.type === 'short-break' || r.type === 'lunch')
      const prs  = Array.from({ length: v }, (_, i) => {
        const ex = prev.find(r => r.id === `p${i + 1}`)
        return ex ? { ...ex, duration: activePeriodDur } : mkPeriod(i + 1, activePeriodDur)
      })
      return [asm, ...prs, ...brks, dis]
    })
  }

  // ── Multi-shift helpers ───────────────────────────────────────
  /** Patch any field of the currently active shift. */
  const updateActiveShift = (patch: Partial<ShiftConfig>) =>
    setShifts(prev => prev.map(s => s.id === activeShiftId ? { ...s, ...patch } : s))

  const addShift = () => {
    const id = makeId()
    const newShift: ShiftConfig = {
      id,
      name:       `Shift ${shifts.length + 1}`,
      startTime:  '07:00',
      periodDur:  40,
      maxPeriods: 8,
      use12h:     use12h,
      classes:    [],  // user will assign classes
    }
    setShifts(prev => [...prev, newShift])
    setActiveShiftId(id)
    // Bootstrap rows for the new shift from default
    setShiftRows(prev => ({
      ...prev,
      [id]: buildRows(newShift.maxPeriods, newShift.periodDur),
    }))
  }

  const deleteShift = (id: string) => {
    if (shifts.length <= 1) return
    setShifts(prev => prev.filter(s => s.id !== id))
    setShiftRows(prev => { const n = { ...prev }; delete n[id]; return n })
    if (activeShiftId === id) setActiveShiftId(shifts.find(s => s.id !== id)?.id ?? '')
  }

  // ── Mode switch ───────────────────────────────────────────────
  const handleSetMode = (mode: 'standard' | 'advanced') => {
    if (mode === scheduleMode) return
    if (mode === 'standard') {
      // Only warn if multi-shift or per-day variations would be lost.
      // Cycle weeks, day-names, and working-day settings are shared between modes.
      const willLose = shifts.length > 1 || varyByDay
      if (willLose) {
        setConfirmDialog({
          msg: 'Switching to Standard mode will consolidate to a single bell schedule. Multiple shifts and per-day bell variations will be removed — your first shift\'s settings and all cycle/rhythm settings are kept. Continue?',
          onConfirm: () => {
            const main = shifts[0]
            if (main) {
              setShiftName(main.name)
              setStartTime(main.startTime)
              setPeriodDur(main.periodDur)
              setMaxPeriods(main.maxPeriods)
              setUse12h(main.use12h)
              const mainRows = shiftRows[main.id] ?? rows
              setRows(mainRows)
            }
            setShifts([{
              id: 'shift-main',
              name: shifts[0]?.name ?? shiftName,
              startTime: shifts[0]?.startTime ?? startTime,
              periodDur: shifts[0]?.periodDur ?? periodDur,
              maxPeriods: shifts[0]?.maxPeriods ?? maxPeriods,
              use12h: shifts[0]?.use12h ?? use12h,
              classes: [...activeClassKeys],
            }])
            setActiveShiftId('shift-main')
            setShiftRows({})
            doTurnOffVaryByDay()
            setScheduleMode('standard')
          },
        })
        return
      }
      setScheduleMode('standard')
      return
    } else {
      // Switching to Advanced: ensure shifts array is bootstrapped from current single-shift state
      if (shifts.length === 0 || (shifts.length === 1 && shifts[0].id === 'shift-main')) {
        const bootstrapped: ShiftConfig = {
          id:         'shift-main',
          name:       shiftName,
          startTime,
          periodDur,
          maxPeriods,
          use12h,
          classes:    [...activeClassKeys],
        }
        setShifts([bootstrapped])
        setActiveShiftId('shift-main')
        // Seed shiftRows with current rows if not already set
        setShiftRows(prev => prev['shift-main'] ? prev : { ...prev, 'shift-main': rows })
      }
    }
    setScheduleMode(mode)
  }

  // ── Vary-by-day toggle ────────────────────────────────────────
  const doTurnOffVaryByDay = () => {
    setActiveDayTab(''); setDayRows({}); setDayStartTimes({}); setDayPeriodDurs({}); setVaryByDay(false)
  }

  const handleToggleVaryByDay = (on: boolean) => {
    if (!on && Object.keys(dayRows).length > 0) {
      setConfirmDialog({
        msg: 'Turning off "Vary by day" will discard all per-day custom schedules (timings, period durations, bell rows). This cannot be undone.',
        onConfirm: doTurnOffVaryByDay,
      })
      return
    }
    if (on) {
      const init: Record<string, BellRow[]> = {}
      dayKeys.forEach(k => { init[k] = activeShiftBaseRows.map(r => ({ ...r, id: makeId() })) })
      setDayRows(init)
      setActiveDayTab(dayKeys[0] ?? '')
    } else {
      doTurnOffVaryByDay()
    }
    setVaryByDay(on)
  }

  const toggleDay = (d: string) =>
    setWorkDays(w => w.includes(d) ? w.filter(x => x !== d) : [...w, d])

  const updateRow = (id: string, patch: Partial<BellRow>) =>
    setDisplayRows(prev => prev.map(r => r.id === id ? { ...r, ...patch } : r))

  const deleteRow = (id: string) => setDisplayRows(prev => prev.filter(x => x.id !== id))

  // Inline time editing state — tracks which row + field is being edited
  const [editingTime, setEditingTime] = useState<{ rowId: string; field: 'start' | 'end' } | null>(null)

  // Per-type minimum durations enforced during inline time edits
  const ROW_TYPE_MIN_DUR: Record<RowType, number> = {
    assembly: 10, dispersal: 10, 'short-break': 5, lunch: 15, teaching: 5,
  }

  /**
   * Commit a new start time for row[i].
   *
   * Strategy:
   *  • newMins ≤ prevStart  → user wants concurrent scheduling (same start as
   *    the previous row).  Don't touch the previous row's duration — concurrent
   *    display is driven by the class-assignment partial-break rule.
   *  • prevStart < newMins  → shrink/stretch the previous row's duration so that
   *    prev.end == newMins.  Respects a per-type minimum (Dispersal/Assembly ≥ 10 min).
   *  • First row             → shift the global shift start time.
   */
  const commitStartTime = (rowId: string, newVal: string, starts: string[]) => {
    if (!newVal) { setEditingTime(null); return }
    const rows    = displayRows
    const i       = rows.findIndex(r => r.id === rowId)
    if (i < 0) { setEditingTime(null); return }
    const newMins = toMins(newVal)

    if (i === 0) {
      setStartTime(newVal)
    } else {
      const prev      = rows[i - 1]
      const prevStart = toMins(starts[i - 1])   // prev row's displayed start

      if (newMins <= prevStart) {
        // ≤ prev start → concurrent request — leave prev duration unchanged.
        // Set Dispersal/break classes to partial to activate the concurrent rule.
        setEditingTime(null)
        return
      }

      const newPrevDur = newMins - prevStart
      const minDur     = ROW_TYPE_MIN_DUR[prev.type] ?? 5
      if (Math.max(minDur, newPrevDur) !== prev.duration) {
        updateRow(prev.id, { duration: Math.max(minDur, newPrevDur) })
      }
    }
    setEditingTime(null)
  }

  /**
   * Commit a new end time for a row — adjusts that row's duration.
   * Respects the per-type minimum duration.
   */
  const commitEndTime = (rowId: string, newVal: string, start: string, rowType: RowType) => {
    if (!newVal) { setEditingTime(null); return }
    const minDur = ROW_TYPE_MIN_DUR[rowType] ?? 5
    const newDur = Math.max(minDur, toMins(newVal) - toMins(start))
    updateRow(rowId, { duration: newDur })
    setEditingTime(null)
  }

  const insertBreak = (afterIndex: number, name: string) => {
    const type: RowType =
      /lunch/i.test(name)             ? 'lunch'
      : /assembl/i.test(name)         ? 'assembly'
      : /dispersal|dismiss/i.test(name) ? 'dispersal'
      : 'short-break'
    const defaultDur: Record<RowType, number> = { assembly: 10, teaching: 40, 'short-break': 10, lunch: 30, dispersal: 10 }
    const newRow: BellRow = { id: makeId(), name, type, duration: defaultDur[type], classes: [...activeClassKeys] }
    setDisplayRows(prev => { const n = [...prev]; n.splice(afterIndex + 1, 0, newRow); return n })
  }

  /**
   * Staggered break: given an existing partial break at `afterIndex` (e.g. Lunch for XII),
   * inserts three more rows to complete the full staggered pattern:
   *   [existing] Lunch XII  (30 min)
   *   [new +1]   Period N   (XI only)   — XI teaches while XII is on lunch
   *   [new +2]   Lunch XI   (30 min)    — XI's lunch, XII continues
   *   [new +3]   Period N   (XII only)  — XII teaches while XI is on lunch
   * After row +3 both groups are back in sync.
   */
  const insertStaggeredBreak = (afterIndex: number) => {
    const breakRow = displayRows[afterIndex]
    if (!breakRow) return
    const classesOnBreakA    = breakRow.classes                                       // e.g. ['xii']
    const classesOnBreakB    = activeClassKeys.filter(k => !classesOnBreakA.includes(k)) // e.g. ['xi']
    if (classesOnBreakA.length === 0 || classesOnBreakB.length === 0) return

    const perCount  = displayRows.slice(0, afterIndex).filter(r => r.type === 'teaching').length
    const pName     = `Period ${perCount + 1}`
    const breakDur  = breakRow.duration   // reuse same duration for reverse break

    const periodForB: BellRow  = { id: makeId(), name: pName,          type: 'teaching',  duration: breakDur,  classes: classesOnBreakB }
    const reverseBreak: BellRow = { id: makeId(), name: breakRow.name, type: breakRow.type, duration: breakDur, classes: classesOnBreakB }
    const periodForA: BellRow  = { id: makeId(), name: pName,          type: 'teaching',  duration: breakDur,  classes: classesOnBreakA }

    setDisplayRows(prev => {
      const next = [...prev]
      next.splice(afterIndex + 1, 0, periodForB, reverseBreak, periodForA)
      return next
    })
  }

  const insertPeriodAt = (afterIndex: number) => {
    const count  = displayRows.slice(0, afterIndex + 1).filter(r => r.type === 'teaching').length
    const newRow = { ...mkPeriod(count + 1, activePeriodDur), id: makeId(), classes: [...activeClassKeys] }
    setDisplayRows(prev => { const n = [...prev]; n.splice(afterIndex + 1, 0, newRow); return n })
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
    const breakRow = displayRows[afterIndex]
    if (!breakRow) return
    const classesInBreak    = breakRow.classes
    const classesNotInBreak = activeClassKeys.filter(k => !classesInBreak.includes(k))
    if (classesNotInBreak.length === 0 || classesInBreak.length === 0) return

    const periodsBeforeBreak = displayRows.slice(0, afterIndex).filter(r => r.type === 'teaching').length
    const name               = `Period ${periodsBeforeBreak + 1}`

    const periodA: BellRow = { id: makeId(), name, type: 'teaching', duration: periodDur, classes: classesNotInBreak }
    const periodB: BellRow = { id: makeId(), name, type: 'teaching', duration: periodDur, classes: classesInBreak    }

    setDisplayRows(prev => {
      const next = [...prev]
      next.splice(afterIndex + 1, 0, periodA, periodB)
      return next
    })
  }

  const handleAISuggest = () => {
    let curMins = toMins(activeStartTime)
    const result: BellRow[] = []
    const asmDur = displayRows.find(r => r.type === 'assembly')?.duration ?? 10
    result.push({ id: makeId(), name: 'Assembly', type: 'assembly', duration: asmDur, classes: [...activeClassKeys] })
    curMins += asmDur
    result.push({ id: makeId(), name: 'Morning Break', type: 'short-break', duration: 10, classes: [...activeClassKeys] })
    curMins += 10
    let lunchAdded = false
    for (let i = 0; i < maxPeriods; i++) {
      result.push({ ...mkPeriod(i + 1, periodDur), classes: [...activeClassKeys] })
      curMins += periodDur
      if (!lunchAdded && curMins >= 720) {
        result.push({ id: makeId(), name: 'Lunch Break', type: 'lunch', duration: 30, classes: [...activeClassKeys] })
        curMins += 30; lunchAdded = true
      }
    }
    if (!lunchAdded && maxPeriods > 0)
      result.splice(2 + Math.ceil(maxPeriods / 2), 0, { id: makeId(), name: 'Lunch Break', type: 'lunch', duration: 30, classes: [...activeClassKeys] })
    result.push({ id: makeId(), name: 'Afternoon Break', type: 'short-break', duration: 10, classes: [...activeClassKeys] })
    result.push({ id: makeId(), name: 'Dispersal', type: 'dispersal', duration: 5, classes: [...activeClassKeys] })
    setDisplayRows(result)
  }

  const capacity = useMemo(() => {
    const tRows = displayRows.filter(r => r.type === 'teaching')
    return activeClassGroups.map(gm => {
      const gk = activeClasses.filter(c => c.group === gm.group).map(c => c.key)
      return { label: gm.group, desc: gm.desc, color: gm.color, count: tRows.filter(r => gk.some(k => r.classes.includes(k))).length * workDays.length }
    })
  }, [displayRows, workDays.length, activeClasses, activeClassGroups])

  const handleNext = () => {
    // Flush bell state to localStorage synchronously before unmounting.
    // The persistence useEffect is async (fires after paint) so there is a
    // race condition: if the user clicks Save & Continue immediately after an
    // edit, the most-recent state might not yet be in localStorage.
    // Writing it here guarantees re-mount reads the correct values.
    try {
      localStorage.setItem(bellKey, JSON.stringify({
        shiftName, startTime, use12h, periodDur, maxPeriods, workDays, rows,
        cycleWeeks, useDayNames, cycleStartDate, fixedDuration, rotationDays,
        weekWorkDays, dayStartTimes, dayPeriodDurs, dayOffRules, cwRows, varyByDay, dayRows,
        scheduleMode, shifts, activeShiftId, shiftRows, customClasses, customGroups,
        customStreams, classStreamMap, autoBellMode, schoolEndTime,
        smartLunchMode, smartLunchAfterPeriod: smartLunchAP,
        morningBreak, morningBreakPos, morningBreakDur,
        concurrentPeriodMode: concurrentMode, concurrentPeriodDur: concurrentDur,
      } satisfies SavedBell))
    } catch { /* localStorage might be full */ }
    setConfig({
      workDays: workDays.map(d => DAY_TO_FULL[d] ?? d.toUpperCase()),
      startTime, endTime, periodsPerDay: maxPeriods, defaultSessionDuration: periodDur,
      // Persist class-specific day-off rules so the scheduling engine can honour them
      dayOffRules: dayOffRules.length > 0 ? dayOffRules : undefined,
      // Persist class-wise break config so the timetable display shows correct per-class times
      classwiseBreaks: cwRows.length > 0 ? cwRows : undefined,
      // Resources page reads these to seed sections for the right classes only
      configuredClassDefs: activeClasses,
      configuredClassStreamMap: Object.keys(classStreamMap).length > 0 ? classStreamMap : undefined,
    } as any)
    // When class-wise breaks are configured, store CANONICAL breaks (one per afterPeriod
    // position) so that buildPeriodSequenceFromCw can later reconstruct the correct period
    // layout.  Storing the raw merged displayRows would produce duplicate Lunch Break
    // entries in store.breaks which causes wrong column counts in the timetable.
    if (cwRows.length > 0) {
      const byPos = new Map<number, CwBreakRow>()
      for (const row of cwRows) {
        const ex = byPos.get(row.afterPeriod)
        if (!ex) { byPos.set(row.afterPeriod, row); continue }
        // prefer lunch over short-break; then longer duration
        if (row.type === 'lunch' && ex.type !== 'lunch') { byPos.set(row.afterPeriod, row); continue }
        if (row.duration > ex.duration && row.type === ex.type) byPos.set(row.afterPeriod, row)
      }
      const canonical: Array<{ id: string; name: string; duration: number; type: any; shiftable: boolean }> = [
        { id: 'assembly', name: 'Assembly', duration: 15, type: 'fixed-start', shiftable: false },
      ]
      byPos.forEach(row => canonical.push({
        id: row.id, name: row.name, duration: row.duration,
        type: row.type === 'lunch' ? 'lunch' : 'break',
        shiftable: row.type === 'short-break',
      }))
      setBreaks(canonical as any)
    } else {
      // Normalise BellRow types to Period types so buildPeriodSequence works correctly:
      //   'assembly'    → 'fixed-start'  (prepended before all periods)
      //   'short-break' → 'break'        (recognised as a midBreak by buildPeriodSequence)
      //   'dispersal'   → 'fixed-end'    (appended after all periods)
      //   'lunch'       → 'lunch'        (unchanged)
      const normaliseType = (t: RowType): string => {
        if (t === 'assembly')    return 'fixed-start'
        if (t === 'short-break') return 'break'
        if (t === 'dispersal')   return 'fixed-end'
        return t
      }
      setBreaks(displayRows.filter(r => r.type !== 'teaching').map(r => ({
        id: r.id, name: r.name, duration: r.duration,
        type: normaliseType(r.type) as any,
        shiftable: r.type === 'short-break',
      })))
    }
    setStep(3)
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

          {/* ─── SCHEDULE MODE ─── */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 20 }}>
            <div style={{ display: 'inline-flex', background: '#EFEFEF', borderRadius: 10, padding: 3, flexShrink: 0 }}>
              {(['standard', 'advanced'] as const).map(mode => {
                const active = scheduleMode === mode
                return (
                  <button key={mode} onClick={() => handleSetMode(mode)} style={{
                    padding: '7px 22px', borderRadius: 8, border: 'none',
                    background: active ? '#fff' : 'transparent',
                    boxShadow: active ? '0 1px 4px rgba(0,0,0,.10)' : 'none',
                    color: active ? '#13111E' : '#9CA3AF',
                    fontSize: 13, fontWeight: active ? 700 : 500,
                    cursor: 'pointer', fontFamily: 'inherit', transition: 'all .15s',
                    display: 'inline-flex', alignItems: 'center', gap: 7, whiteSpace: 'nowrap',
                  }}>
                    {mode === 'standard' ? 'Standard' : 'Advanced'}
                    {mode === 'advanced' && (
                      <span style={{ fontSize: 9, fontWeight: 800, letterSpacing: '0.04em', color: '#7C3AED', background: '#EDE9FF', padding: '2px 6px', borderRadius: 6 }}>HYBRID</span>
                    )}
                  </button>
                )
              })}
            </div>
            <span style={{ fontSize: 11, color: '#B0B0B0' }}>
              {scheduleMode === 'standard'
                ? 'One bell for all grades · supports multi-week cycles & day-name rotations'
                : 'Independent bell timings per class group · each shift has its own schedule'}
            </span>
          </div>

          {/* ─── ASSIGN CLASSES TO SHIFTS ─── */}
          <div style={{ marginBottom: 16 }}>
            <div style={{ background: '#fff', borderRadius: 10, border: '1px solid #E5E7EB', overflow: 'hidden' }}>
              {/* Header */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 16px', background: '#FAFAFA', borderBottom: '1px solid #F3F4F6' }}>
                <svg width='13' height='13' viewBox='0 0 14 14' fill='none'><rect x='1' y='1' width='4' height='4' rx='1' fill='#7C6FE0'/><rect x='1' y='9' width='4' height='4' rx='1' fill='#7C6FE0'/><rect x='9' y='1' width='4' height='4' rx='1' fill='#7C6FE0'/><rect x='9' y='9' width='4' height='4' rx='1' fill='#E5E7EB'/></svg>
                <span style={{ fontSize: 12, fontWeight: 700, color: '#374151' }}>Class Shift Assignment</span>
                {isAdvanced && <span style={{ fontSize: 11, color: '#9CA3AF', marginLeft: 4 }}>· Assign each grade to a shift</span>}
              </div>

              {!isAdvanced ? (
                <div style={{ padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 16 }}>✓</span>
                  <span style={{ fontSize: 12, color: '#6B7280' }}>
                    All grades follow a single bell schedule in Standard mode.
                    Switch to <strong>Advanced</strong> to assign different shifts per grade.
                  </span>
                </div>
              ) : uniqueGrades.length === 0 ? (
                <div style={{ padding: '12px 16px' }}>
                  <span style={{ fontSize: 12, color: '#9CA3AF' }}>
                    No classes defined yet — complete Step 1 (Resources) first.
                  </span>
                </div>
              ) : (
                <div style={{ padding: '10px 16px 14px' }}>
                  <div style={{ fontSize: 11, color: '#9CA3AF', marginBottom: 10 }}>
                    Select which shift each grade belongs to. Grades not assigned default to the first shift.
                  </div>
                  {uniqueGrades.map(grade => {
                    const gradeKey = grade.toLowerCase().replace(/^classs+/i, '').trim()
                    const assignedShiftId = shifts.find(s => s.classes?.includes(gradeKey))?.id ?? shifts[0]?.id ?? ''
                    const sectionCount = sectionsPerGrade[grade] ?? 0
                    const gradeLabel = /^(Nursery|LKG|UKG)$/i.test(grade) ? grade : ('Grade ' + grade.replace(/^classs+/i, ''))
                    return (
                      <div key={grade} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8, padding: '7px 10px', borderRadius: 8, background: '#FAFAFA', border: '1px solid #F3F4F6' }}>
                        <span style={{ fontSize: 13, fontWeight: 700, color: '#111028', minWidth: 100 }}>
                          {gradeLabel}
                        </span>
                        <span style={{ fontSize: 11, color: '#9CA3AF', flex: 1 }}>
                          {sectionCount} section{sectionCount !== 1 ? 's' : ''}
                        </span>
                        <select
                          value={assignedShiftId}
                          onChange={e => {
                            const newId = e.target.value
                            setShifts(prev => prev.map(s => {
                              if (s.id === newId) return s.classes?.includes(gradeKey) ? s : { ...s, classes: [...(s.classes ?? []), gradeKey] }
                              return { ...s, classes: (s.classes ?? []).filter(k => k !== gradeKey) }
                            }))
                          }}
                          style={{ padding: '5px 10px', border: '1px solid #E5E7EB', borderRadius: 7, fontSize: 12, fontFamily: 'inherit', color: '#374151', background: '#fff', outline: 'none', cursor: 'pointer' }}
                        >
                          {shifts.map(s => <option key={s.id} value={s.id}>{s.name || 'Shift ' + s.id}</option>)}
                        </select>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </div>

          {/* ─── SCHEDULE RHYTHM ─── */}
          <div style={{ marginBottom: 16 }}>
            <div style={{ background: '#fff', borderRadius: 10, border: '1px solid #E5E7EB', overflow: 'hidden' }}>
              {/* Card header */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '10px 16px', background: '#FAFAFA', borderBottom: '1px solid #F3F4F6' }}>
                <Calendar size={13} color="#7C6FE0" />
                <span style={{ fontSize: 12, fontWeight: 700, color: '#374151' }}>Schedule Rhythm</span>
                <span style={{
                  marginLeft: 'auto', fontSize: 10, fontWeight: 800, padding: '2px 9px',
                  borderRadius: 10, background: '#EDE9FF', color: '#7C3AED', letterSpacing: '0.03em',
                }}>
                  {useDayNames ? `${rotationDays.length}-day rotation`
                    : cycleWeeks === 1 ? 'Weekly'
                    : cycleWeeks === 2 ? 'Fortnightly'
                    : `${cycleWeeks}-week cycle`}
                </span>
              </div>
              <div style={{ padding: '14px 16px' }}>

              {/* ── Schedule rhythm controls (shared: Standard & Advanced) ── */}
              <>
              <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
                {!useDayNames && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{ fontSize: 12, color: '#6B7280' }}>Repeats every</span>
                    {/* Stepper */}
                    <div style={{ display: 'inline-flex', alignItems: 'center', border: '1.5px solid #E5E7EB', borderRadius: 8, overflow: 'hidden' }}>
                      <button onClick={() => {
                        const next = Math.max(1, cycleWeeks - 1)
                        if (next < cycleWeeks && varyByDay && Object.keys(dayRows).some(k => k.startsWith(`w${cycleWeeks}-`))) {
                          setConfirmDialog({ msg: `Reducing to ${next} week${next > 1 ? 's' : ''} will remove all custom schedules for Week ${cycleWeeks}. Continue?`, onConfirm: () => setCycleWeeks(next) })
                        } else { setCycleWeeks(next) }
                      }} style={{ padding: '5px 11px', background: 'none', border: 'none', fontSize: 15, fontWeight: 700, color: cycleWeeks <= 1 ? '#D1D5DB' : '#7C6FE0', cursor: cycleWeeks <= 1 ? 'default' : 'pointer', fontFamily: 'inherit' }}>−</button>
                      <span style={{ padding: '5px 12px', fontSize: 14, fontWeight: 800, color: '#13111E', fontFamily: "'DM Mono',monospace", borderLeft: '1px solid #E5E7EB', borderRight: '1px solid #E5E7EB', minWidth: 40, textAlign: 'center' }}>{cycleWeeks}</span>
                      <button onClick={() => setCycleWeeks(w => Math.min(12, w + 1))}
                        style={{ padding: '5px 11px', background: 'none', border: 'none', fontSize: 15, fontWeight: 700, color: '#7C6FE0', cursor: 'pointer', fontFamily: 'inherit' }}>+</button>
                    </div>
                    <span style={{ fontSize: 12, color: '#6B7280' }}>{cycleWeeks === 1 ? 'week' : 'weeks'}</span>
                  </div>
                )}

                {/* Day-names toggle */}
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', marginLeft: useDayNames ? 0 : 'auto', userSelect: 'none' }}>
                  <div style={{ position: 'relative', width: 34, height: 18, flexShrink: 0 }}>
                    <input type="checkbox" checked={useDayNames} onChange={e => {
                      const on = e.target.checked
                      const hasCustom = varyByDay && Object.keys(dayRows).length > 0
                      const apply = () => { setUseDayNames(on); if (on && varyByDay) doTurnOffVaryByDay() }
                      if (hasCustom) {
                        setConfirmDialog({ msg: 'Switching between "Use day names" and calendar-days mode will reset all per-day custom schedules. Continue?', onConfirm: apply })
                      } else { apply() }
                    }} style={{ opacity: 0, width: 0, height: 0, position: 'absolute' }} />
                    <div style={{ position: 'absolute', inset: 0, borderRadius: 9, background: useDayNames ? '#7C6FE0' : '#E5E7EB', transition: 'background .2s' }} />
                    <div style={{ position: 'absolute', top: 2, left: useDayNames ? 18 : 2, width: 14, height: 14, borderRadius: '50%', background: '#fff', transition: 'left .2s', boxShadow: '0 1px 3px rgba(0,0,0,.2)' }} />
                  </div>
                  <span style={{ fontSize: 12, color: '#374151' }}>Use day names <span style={{ color: '#9CA3AF' }}>(A/B, 8-day…)</span></span>
                </label>
              </div>

              {/* Cycle start date (when cycle > 1 week or day names on) */}
              {(cycleWeeks > 1 || useDayNames) && (
                <div style={{ marginTop: 14 }}>
                  <div style={{ fontSize: 12, color: '#6B7280', marginBottom: 6 }}>
                    {useDayNames ? 'Rotation starts on' : 'Week 1 starts on'}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                    <input type="date" value={cycleStartDate} onChange={e => setCycleStartDate(e.target.value)}
                      style={{ padding: '7px 10px', borderRadius: 7, border: '1px solid #E5E7EB', fontSize: 13, fontFamily: 'inherit', color: '#13111E', outline: 'none' }} />
                    {cycleStartDate && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px', borderRadius: 7, background: '#F0FDF4', border: '1px solid #BBF7D0' }}>
                        <span style={{ fontSize: 11, color: '#22C55E' }}>✓</span>
                        <span style={{ fontSize: 11, color: '#16A34A', fontWeight: 600 }}>
                          {useDayNames ? 'Rotation' : 'Week 1'} starts on {cycleStartHint(cycleStartDate)}
                        </span>
                        <button onClick={() => setCycleStartDate('')}
                          style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9CA3AF', fontSize: 11, padding: 0, fontFamily: 'inherit' }}>Clear</button>
                      </div>
                    )}
                  </div>
                  {/* Fixed duration — only for custom cycles ≥ 3 weeks */}
                  {!useDayNames && cycleWeeks >= 3 && (
                    <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10, cursor: 'pointer', userSelect: 'none' }}>
                      <input type="checkbox" checked={fixedDuration} onChange={e => setFixedDuration(e.target.checked)}
                        style={{ accentColor: '#7C6FE0', width: 14, height: 14 }} />
                      <span style={{ fontSize: 12, fontWeight: 600, color: '#374151' }}>Fixed duration (non-repeating)</span>
                      <span style={{ fontSize: 11, color: '#9CA3AF' }}>— runs once with a set start and end date</span>
                    </label>
                  )}
                  {fixedDuration && !useDayNames && cycleWeeks >= 3 && (
                    <div style={{ marginTop: 8, padding: '7px 12px', borderRadius: 7, background: '#FFFBEB', border: '1px solid #FDE68A', fontSize: 11, color: '#92400E' }}>
                      This {cycleWeeks}-week program will run once without repeating.
                    </div>
                  )}

                  {/* Per-week working days — each week can differ */}
                  {!useDayNames && cycleWeeks > 1 && (
                    <div style={{ marginTop: 16 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                        <span style={{ fontSize: 12, fontWeight: 700, color: '#374151' }}>Days per week</span>
                        <span style={{ fontSize: 11, color: '#9CA3AF' }}>— each week can have different working days</span>
                      </div>
                      {Array.from({ length: cycleWeeks }, (_, i) => {
                        const w = i + 1
                        const wdays = weekWorkDays[w] ?? workDays
                        const isCustom = !!weekWorkDays[w]
                        return (
                          <div key={w} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
                            <span style={{
                              fontSize: 11, fontWeight: 800, color: isCustom ? '#7C3AED' : '#9CA3AF',
                              fontFamily: "'DM Mono',monospace", width: 24, flexShrink: 0,
                            }}>W{w}</span>
                            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                              {ALL_DAYS.map(d => {
                                const on = wdays.includes(d)
                                return (
                                  <button key={d} onClick={() => {
                                    const newDays = on
                                      ? wdays.filter(x => x !== d)
                                      : [...wdays, d]
                                    // Store in calendar order
                                    const ordered = ALL_DAYS.filter(x => newDays.includes(x))
                                    setWeekWorkDays(prev => ({ ...prev, [w]: ordered }))
                                  }} style={{
                                    padding: '3px 9px', borderRadius: 14, fontSize: 11, fontWeight: 600,
                                    border: on ? '1px solid #7C6FE0' : '1px solid #E5E7EB',
                                    background: on ? '#EDE9FF' : '#fff',
                                    color: on ? '#7C3AED' : '#D1D5DB',
                                    cursor: 'pointer', fontFamily: 'inherit', transition: 'all .12s',
                                  }}>{d}</button>
                                )
                              })}
                            </div>
                            {isCustom && (
                              <button onClick={() => setWeekWorkDays(prev => {
                                const next = { ...prev }; delete next[w]; return next
                              })} style={{
                                fontSize: 10, color: '#9CA3AF', background: 'none', border: 'none',
                                cursor: 'pointer', padding: 0, fontFamily: 'inherit',
                              }}>Reset</button>
                            )}
                          </div>
                        )
                      })}
                      <div style={{ marginTop: 4, padding: '7px 11px', borderRadius: 7, background: '#F0F9FF', border: '1px solid #BAE6FD', fontSize: 11, color: '#0369A1', display: 'flex', alignItems: 'flex-start', gap: 6 }}>
                        <span style={{ flexShrink: 0 }}>💡</span>
                        <span>To mark specific <em>classes</em> as off on certain days (e.g. Pre-Primary off on Saturdays), use the <strong>Resource Availability</strong> panel in Step 2, or enable <strong>Vary by day</strong> in the bell grid and toggle their attendance per day.</span>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Day rotation name editor */}
              {useDayNames && (
                <div style={{ marginTop: 14 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                    <span style={{ fontSize: 12, fontWeight: 600, color: '#374151' }}>Rotation Days</span>
                    <span style={{ fontSize: 11, fontWeight: 700, color: '#7C6FE0' }}>{rotationDays.length} days in rotation</span>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '14px 1fr 56px 20px', gap: '6px 10px', alignItems: 'center', marginBottom: 4 }}>
                    <span />
                    <span style={{ fontSize: 10, fontWeight: 700, color: '#9CA3AF', letterSpacing: '0.06em' }}>FULL NAME</span>
                    <span style={{ fontSize: 10, fontWeight: 700, color: '#9CA3AF', letterSpacing: '0.06em' }}>SHORT</span>
                    <span />
                  </div>
                  {rotationDays.map((day, i) => (
                    <div key={i} style={{ display: 'grid', gridTemplateColumns: '14px 1fr 56px 20px', gap: '6px 10px', alignItems: 'center', marginBottom: 6 }}>
                      <span style={{ fontSize: 11, color: '#9CA3AF', textAlign: 'right' }}>{i + 1}.</span>
                      <input value={day.full} onChange={e => setRotationDays(d => d.map((x, j) => j === i ? { ...x, full: e.target.value } : x))}
                        style={{ padding: '5px 9px', borderRadius: 6, border: '1px solid #E5E7EB', fontSize: 12, fontFamily: 'inherit', outline: 'none' }} />
                      <input value={day.short} maxLength={4} onChange={e => setRotationDays(d => d.map((x, j) => j === i ? { ...x, short: e.target.value.toUpperCase() } : x))}
                        style={{ padding: '5px 7px', borderRadius: 6, border: '1px solid #E5E7EB', fontSize: 12, fontFamily: "'DM Mono',monospace", textAlign: 'center', fontWeight: 700, outline: 'none' }} />
                      {rotationDays.length > 2
                        ? <button onClick={() => setRotationDays(d => d.filter((_, j) => j !== i))}
                            style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#FCA5A5', fontSize: 14, padding: 0, lineHeight: 1 }}>×</button>
                        : <span />}
                    </div>
                  ))}
                  {rotationDays.length < 20 && (
                    <button onClick={() => {
                      const n = rotationDays.length + 1
                      setRotationDays(d => [...d, { full: `Day ${n}`, short: `D${n}` }])
                    }} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, marginTop: 2, background: 'none', border: 'none', cursor: 'pointer', color: '#7C6FE0', fontSize: 12, fontWeight: 600, fontFamily: 'inherit', padding: 0 }}>
                      <Plus size={11} /> Add day
                    </button>
                  )}
                </div>
              )}
              </>
              </div>
            </div>
          </div>

          {/* ─── SHIFT CONFIGURATION ─── */}
          {/* Standard mode: single shift card */}
          {!isAdvanced && (
          <div style={{ marginBottom: 16 }}>
            <div style={{ background: '#fff', borderRadius: 10, border: '1px solid #E5E7EB', overflow: 'hidden' }}>
              {/* Card header */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '10px 16px', background: '#FAFAFA', borderBottom: '1px solid #F3F4F6' }}>
                <Layers size={13} color="#7C6FE0" />
                <input className="b-input" value={shiftName} onChange={e => setShiftName(e.target.value)}
                  placeholder="e.g. Main Shift"
                  style={{ fontWeight: 700, fontSize: 13, border: 'none', padding: '0', outline: 'none', background: 'transparent', flex: 1 }} />
              </div>
              <div style={{ padding: '14px 16px' }}>

              <div style={{ display: 'flex', flexWrap: 'nowrap' as const, alignItems: 'flex-start', gap: 10, marginBottom: 14 }}>
                {/* Start */}
                <div style={{ flex: '0 0 108px' }}>
                  <div style={FL}>Start time</div>
                  <input className="b-input" type="time" value={startTime}
                    onChange={e => setStartTime(e.target.value)} style={{ width: '100%' }} />
                  <div style={FH}>{fmt12(startTime, use12h)}</div>
                </div>
                {/* End — formatted display with inline edit */}
                <div style={{ flex: '0 0 116px' }}>
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
                {/* Period Min */}
                <div style={{ flex: '0 0 80px' }}>
                  <div style={FL}>P. Min (min)</div>
                  <NumInput className="b-input" value={periodDurMin} min={10} max={periodDur - 5}
                    onChange={v => setPeriodDurMin(Math.min(v, periodDur - 5))}
                    style={{ width: '100%', textAlign: 'center', fontFamily: "'DM Mono',monospace", fontWeight: 800, fontSize: 16 }} />
                </div>
                {/* Period Max */}
                <div style={{ flex: '0 0 80px' }}>
                  <div style={FL}>P. Max (min)</div>
                  <NumInput className="b-input" value={periodDur} min={periodDurMin + 5} max={240} onChange={handlePeriodDurChange}
                    style={{ width: '100%', textAlign: 'center', fontFamily: "'DM Mono',monospace", fontWeight: 800, fontSize: 16 }} />
                </div>
                {/* Max periods */}
                <div style={{ flex: '0 0 78px' }}>
                  <div style={FL}>Max / day</div>
                  <NumInput className="b-input" value={maxPeriods} min={1} max={16} onChange={handleMaxPeriodsChange}
                    style={{ width: '100%', textAlign: 'center', fontFamily: "'DM Mono',monospace", fontWeight: 800, fontSize: 16 }} />
                </div>
                {/* Format */}
                <div style={{ flex: '0 0 72px' }}>
                  <div style={FL}>Format</div>
                  <select className="b-input" value={use12h ? '12H' : '24H'}
                    onChange={e => setUse12h(e.target.value === '12H')} style={{ width: '100%' }}>
                    <option value="12H">12H</option>
                    <option value="24H">24H</option>
                  </select>
                </div>
              </div>

              {/* ── Working days — only shown in single-week cycle ── */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                {cycleWeeks === 1 && !useDayNames && (
                  <>
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
                  </>
                )}
                {/* Day Off Rules header */}
                <div style={{ marginLeft: cycleWeeks === 1 && !useDayNames ? 'auto' : 0, display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: '#374151' }}>Day off rules</span>
                  {dayOffRules.length > 0 && (
                    <span style={{ fontSize: 10, fontWeight: 700, background: '#FEF3C7', color: '#D97706', border: '1px solid #FDE68A', borderRadius: 10, padding: '1px 7px' }}>
                      {dayOffRules.length}
                    </span>
                  )}
                  <button
                    onClick={() => setDayOffRules(prev => [...prev, {
                      id: makeId(),
                      day: ALL_DAYS.find(d => !workDays.includes(d)) ?? workDays[workDays.length - 1] ?? 'Sat',
                      classes: [],
                    }])}
                    style={{
                      display: 'inline-flex', alignItems: 'center', gap: 5,
                      fontSize: 11, fontWeight: 600, color: '#D97706',
                      background: '#FFFBEB', border: '1px solid #FDE68A',
                      borderRadius: 6, padding: '4px 11px', cursor: 'pointer', fontFamily: 'inherit',
                    }}>
                    <Plus size={10} /> Add rule
                  </button>
                </div>
              </div>

              {/* ── Age-appropriate smart suggestions ── */}
              {daySuggestions.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 10 }}>
                  {daySuggestions.map(sug => (
                    <div key={sug.id} style={{
                      background: sug.bg,
                      border: `1.5px solid ${sug.border}`,
                      borderRadius: 10, padding: '11px 13px',
                      display: 'flex', gap: 10, alignItems: 'flex-start',
                    }}>
                      <span style={{ fontSize: 20, lineHeight: 1, flexShrink: 0, marginTop: 1 }}>{sug.emoji}</span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginBottom: 4 }}>
                          <span style={{ fontSize: 12, fontWeight: 700, color: sug.color }}>{sug.title}</span>
                          {sug.urgent && (
                            <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: 0.4,
                              background: '#FEE2E2', color: '#DC2626', border: '1px solid #FECACA',
                              borderRadius: 8, padding: '1px 6px' }}>RECOMMENDED</span>
                          )}
                        </div>
                        <p style={{ fontSize: 11, color: '#6B7280', margin: '0 0 9px', lineHeight: 1.6 }}>
                          {sug.detail}
                        </p>
                        <button
                          onClick={() => applyDaySuggestion(sug)}
                          style={{
                            fontSize: 11, fontWeight: 700,
                            color: '#fff',
                            background: sug.color,
                            border: 'none',
                            borderRadius: 6, padding: '5px 12px', cursor: 'pointer', fontFamily: 'inherit',
                            display: 'inline-flex', alignItems: 'center', gap: 5,
                          }}>
                          Add {sug.day} off for {sug.group} →
                        </button>
                      </div>
                      <button
                        title="Dismiss suggestion"
                        onClick={() => setDismissedDaySugs(prev => [...prev, sug.id])}
                        style={{ background: 'none', border: 'none', cursor: 'pointer',
                          color: '#D1D5DB', padding: 2, flexShrink: 0, fontSize: 16,
                          lineHeight: 1, marginTop: -1 }}>
                        ×
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {/* ── Day Off Rules list ── */}
              <div style={{ marginTop: (dayOffRules.length > 0 || daySuggestions.length > 0) ? 10 : 0 }}>

                {dayOffRules.length === 0 && daySuggestions.length === 0 ? (
                  <div style={{ fontSize: 11, color: '#D1D5DB', fontStyle: 'italic' }}>
                    e.g. Saturday off for Nursery, LKG &amp; UKG
                  </div>
                ) : dayOffRules.length > 0 ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {dayOffRules.map(rule => (
                      <div key={rule.id} style={{
                        display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap',
                        background: '#FFFBEB', border: '1px solid #FDE68A',
                        borderRadius: 8, padding: '8px 10px',
                      }}>
                        {/* Day selector */}
                        <select
                          value={rule.day}
                          onChange={e => setDayOffRules(prev => prev.map(r => r.id === rule.id ? { ...r, day: e.target.value } : r))}
                          style={{
                            padding: '4px 8px', borderRadius: 6, border: '1px solid #FDE68A',
                            fontSize: 12, fontFamily: 'inherit', outline: 'none',
                            fontWeight: 700, color: '#B45309', background: '#FEF9EE', flexShrink: 0,
                          }}>
                          {ALL_DAYS.map(d => <option key={d} value={d}>{d}</option>)}
                        </select>

                        <span style={{ fontSize: 11, color: '#9CA3AF', flexShrink: 0 }}>off for</span>

                        {/* Class picker — reuse existing component */}
                        <ClassPicker
                          classes={rule.classes}
                          onChange={cls => setDayOffRules(prev => prev.map(r => r.id === rule.id ? { ...r, classes: cls } : r))}
                          rowId={`dor-${rule.id}`}
                          openId={openPicker}
                          setOpenId={setOpenPicker}
                          classEntries={activeClasses}
                          allClassKeys={activeClassKeys}
                          classGroups={activeClassGroups}
                          streamDefs={customStreams}
                          classStreamMap={classStreamMap}
                        />

                        {/* Inline class chips for quick glance */}
                        {rule.classes.length > 0 && rule.classes.length < activeClassKeys.length && (
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3 }}>
                            {rule.classes.slice(0, 6).map(k => {
                              const cls = activeClasses.find(c => c.key === k)
                              return (
                                <span key={k} style={{
                                  padding: '1px 7px', borderRadius: 10, fontSize: 10, fontWeight: 700,
                                  background: '#fff', border: '1px solid #FDE68A', color: '#B45309',
                                }}>
                                  {cls?.short ?? k}
                                </span>
                              )
                            })}
                            {rule.classes.length > 6 && (
                              <span style={{ fontSize: 10, color: '#9CA3AF', alignSelf: 'center' }}>
                                +{rule.classes.length - 6} more
                              </span>
                            )}
                          </div>
                        )}

                        {/* Delete */}
                        <button
                          onClick={() => setDayOffRules(prev => prev.filter(r => r.id !== rule.id))}
                          style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', color: '#FCA5A5', padding: 3, display: 'flex', flexShrink: 0 }}>
                          <Trash2 size={13} />
                        </button>
                      </div>
                    ))}
                  </div>
                ) : null /* suggestions shown above already, no empty hint needed */}
              </div>
              </div>{/* end card body */}
            </div>{/* end card */}
          </div>
          )}

          {/* ─── ADVANCED: MULTI-SHIFT CONFIGURATION ─── */}
          {isAdvanced && (
          <div style={{ marginBottom: 16 }}>
            {/* Card: header = shift tabs, body = active shift config */}
            {activeShift && (
            <div style={{ background: '#fff', borderRadius: 10, border: '1px solid #E5E7EB', overflow: 'hidden' }}>

              {/* Card header — shift tabs */}
              <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', alignItems: 'center', padding: '8px 14px', background: '#FAFAFA', borderBottom: '1px solid #F3F4F6' }}>
                {shifts.map(s => {
                  const active = s.id === activeShiftId
                  return (
                    <button key={s.id} onClick={() => setActiveShiftId(s.id)} style={{
                      display: 'inline-flex', alignItems: 'center', gap: 5,
                      padding: '4px 14px', borderRadius: 16, fontSize: 12, fontWeight: 700,
                      border: active ? '1.5px solid #7C6FE0' : '1px solid #E5E7EB',
                      background: active ? '#EDE9FF' : '#fff',
                      color: active ? '#7C3AED' : '#9CA3AF',
                      cursor: 'pointer', fontFamily: 'inherit', transition: 'all .12s',
                    }}>
                      {s.name}
                      {shifts.length > 1 && (
                        <span onClick={e => { e.stopPropagation()
                          if (Object.keys(shiftRows[s.id] ?? {}).length > 0 || (shiftRows[s.id]?.length ?? 0) > 0) {
                            setConfirmDialog({ msg: `Delete shift "${s.name}"? Its bell rows will be removed.`, onConfirm: () => deleteShift(s.id) })
                          } else { deleteShift(s.id) }
                        }} style={{
                          marginLeft: 1, width: 13, height: 13, borderRadius: '50%',
                          background: active ? '#C4B5FD' : '#E5E7EB',
                          color: active ? '#7C3AED' : '#9CA3AF',
                          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                          fontSize: 9, fontWeight: 900, lineHeight: 1, cursor: 'pointer',
                        }}>×</span>
                      )}
                    </button>
                  )
                })}
                {/* Add shift */}
                <button onClick={addShift} title="Add Shift" style={{
                  width: 26, height: 26, borderRadius: '50%', flexShrink: 0,
                  border: '1.5px dashed #C4B5FD', background: '#F5F3FF',
                  color: '#7C3AED', fontSize: 16, fontWeight: 700, lineHeight: 1,
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                  cursor: 'pointer', fontFamily: 'inherit', transition: 'all .15s',
                }}>+</button>
                {/* Active shift name — inline editable in header */}
                <input value={activeShift.name}
                  onChange={e => updateActiveShift({ name: e.target.value })}
                  placeholder="Shift name"
                  style={{
                    marginLeft: 'auto', border: 'none', outline: 'none', background: 'transparent',
                    fontSize: 12, fontWeight: 700, color: '#374151', fontFamily: 'inherit',
                    textAlign: 'right', minWidth: 80, maxWidth: 160,
                  }} />
              </div>

              {/* Card body — active shift config */}
              <div style={{ padding: '14px 16px' }}>

              {/* Timing row — all 6 fields on one line */}
              <div style={{ display: 'flex', flexWrap: 'nowrap' as const, alignItems: 'flex-start', gap: 10, marginBottom: 16 }}>
                {/* Start */}
                <div style={{ flex: '0 0 108px' }}>
                  <div style={FL}>Start time</div>
                  <input className="b-input" type="time" value={activeShift.startTime}
                    onChange={e => updateActiveShift({ startTime: e.target.value })} style={{ width: '100%' }} />
                  <div style={FH}>{fmt12(activeShift.startTime, activeShift.use12h)}</div>
                </div>
                {/* End (derived) */}
                <div style={{ flex: '0 0 116px' }}>
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
                      <span style={{ fontFamily: "'DM Mono',monospace", fontWeight: 700 }}>{fmt12(endTime, activeShift.use12h)}</span>
                      <span style={{ fontSize: 10, color: '#C4B5FD', fontWeight: 400 }}>✎</span>
                    </div>
                  )}
                  <div style={FH}>adjusts last period</div>
                </div>
                {/* Period Min */}
                <div style={{ flex: '0 0 80px' }}>
                  <div style={FL}>P. Min (min)</div>
                  <NumInput className="b-input"
                    value={activeShift.periodDurMin ?? Math.max(10, Math.round(activeShift.periodDur * 0.5))}
                    min={10} max={activeShift.periodDur - 5}
                    onChange={v => updateActiveShift({ periodDurMin: Math.min(v, activeShift.periodDur - 5) })}
                    style={{ width: '100%', textAlign: 'center', fontFamily: "'DM Mono',monospace", fontWeight: 800, fontSize: 16 }} />
                </div>
                {/* Period Max */}
                <div style={{ flex: '0 0 80px' }}>
                  <div style={FL}>P. Max (min)</div>
                  <NumInput className="b-input" value={activeShift.periodDur}
                    min={(activeShift.periodDurMin ?? 10) + 5} max={240}
                    onChange={handlePeriodDurChange}
                    style={{ width: '100%', textAlign: 'center', fontFamily: "'DM Mono',monospace", fontWeight: 800, fontSize: 16 }} />
                </div>
                {/* Max periods */}
                <div style={{ flex: '0 0 78px' }}>
                  <div style={FL}>Max / day</div>
                  <NumInput className="b-input" value={activeShift.maxPeriods} min={1} max={16}
                    onChange={handleMaxPeriodsChange}
                    style={{ width: '100%', textAlign: 'center', fontFamily: "'DM Mono',monospace", fontWeight: 800, fontSize: 16 }} />
                </div>
                {/* Format */}
                <div style={{ flex: '0 0 72px' }}>
                  <div style={FL}>Format</div>
                  <select className="b-input" value={activeShift.use12h ? '12H' : '24H'}
                    onChange={e => updateActiveShift({ use12h: e.target.value === '12H' })} style={{ width: '100%' }}>
                    <option value="12H">12H</option>
                    <option value="24H">24H</option>
                  </select>
                </div>
              </div>

              {/* Class assignment */}
              <div style={{ borderTop: '1px solid #F3F4F6', paddingTop: 14 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 12, color: '#6B7280', flexShrink: 0 }}>Assigned to:</span>
                  {/* All toggle */}
                  <button onClick={() => {
                    const allOn = activeClassKeys.every(k => activeShift.classes.includes(k))
                    updateActiveShift({ classes: allOn ? [] : [...activeClassKeys] })
                  }} style={{
                    padding: '3px 12px', borderRadius: 20, fontSize: 11, fontWeight: 700,
                    border: activeClassKeys.every(k => activeShift.classes.includes(k)) ? '1.5px solid #374151' : '1px solid #E5E7EB',
                    background: activeClassKeys.every(k => activeShift.classes.includes(k)) ? '#374151' : '#fff',
                    color: activeClassKeys.every(k => activeShift.classes.includes(k)) ? '#fff' : '#9CA3AF',
                    cursor: 'pointer', fontFamily: 'inherit', transition: 'all .12s',
                  }}>All</button>
                  {/* Group toggles */}
                  {activeClassGroups.map(gm => {
                    const gkeys   = activeClasses.filter(c => c.group === gm.group).map(c => c.key)
                    const on      = gkeys.every(k => activeShift.classes.includes(k))
                    const partial = !on && gkeys.some(k => activeShift.classes.includes(k))
                    const takenOwners = [...new Set(gkeys.map(k => classOwnedBy[k]).filter((v): v is string => !!v))]
                    const allTaken  = takenOwners.length > 0 && gkeys.every(k => classOwnedBy[k])
                    const someTaken = takenOwners.length > 0 && !allTaken
                    const ownerLabel = takenOwners.join(' & ')
                    if (allTaken) {
                      return (
                        <button key={gm.group} disabled
                          title={`Already following ${ownerLabel}`}
                          style={{
                            padding: '3px 12px', borderRadius: 20, fontSize: 11, fontWeight: 700,
                            border: '1px dashed #D1D5DB', background: '#F9FAFB', color: '#D1D5DB',
                            cursor: 'not-allowed', fontFamily: 'inherit',
                            textDecoration: 'line-through', opacity: 0.65,
                          }}>
                          {gm.group}
                        </button>
                      )
                    }
                    return (
                      <button key={gm.group} onClick={() => {
                        const newCls = on
                          ? activeShift.classes.filter(k => !gkeys.includes(k))
                          : [...new Set([...activeShift.classes, ...gkeys])]
                        updateActiveShift({ classes: newCls })
                      }}
                      title={someTaken ? `Some classes already following ${ownerLabel}` : undefined}
                      style={{
                        padding: '3px 12px', borderRadius: 20, fontSize: 11, fontWeight: 700,
                        border: on ? `1.5px solid ${gm.color}` : (someTaken || partial) ? `1px dashed ${gm.color}` : '1px solid #E5E7EB',
                        background: on ? gm.bg : '#fff',
                        color: on ? gm.color : (partial || someTaken) ? gm.color : '#9CA3AF',
                        cursor: 'pointer', fontFamily: 'inherit', transition: 'all .12s',
                      }}>
                        {gm.group}
                        {(partial || someTaken) && !on && (
                          <span style={{ marginLeft: 4, fontSize: 9, opacity: 0.65 }}>partial</span>
                        )}
                      </button>
                    )
                  })}
                  {activeShift.classes.length === 0 && (
                    <span style={{ fontSize: 11, color: '#FCA5A5', fontStyle: 'italic' }}>
                      No classes assigned — add at least one group
                    </span>
                  )}
                </div>
                {/* Fine-grained class pills when group is partially selected */}
                {CLASS_GROUPS.map(gm => {
                  const gkeys = CLASSES.filter(c => c.group === gm.group).map(c => c.key)
                  const allOn = gkeys.every(k => activeShift.classes.includes(k))
                  const anyOn = gkeys.some(k => activeShift.classes.includes(k))
                  if (!anyOn || allOn) return null
                  return (
                    <div key={gm.group} style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 8, paddingLeft: 80 }}>
                      {CLASSES.filter(c => c.group === gm.group).map(cls => {
                        const on         = activeShift.classes.includes(cls.key)
                        const takenShift = classOwnedBy[cls.key]
                        const disabled   = !!takenShift && !on
                        return (
                          <button key={cls.key} disabled={disabled}
                            title={disabled ? `Already following ${takenShift}` : undefined}
                            onClick={() => {
                              if (disabled) return
                              const newCls = on
                                ? activeShift.classes.filter(k => k !== cls.key)
                                : [...activeShift.classes, cls.key]
                              updateActiveShift({ classes: newCls })
                            }} style={{
                              padding: '2px 9px', borderRadius: 12, fontSize: 10, fontWeight: 700,
                              border: on ? `1px solid ${gm.color}` : disabled ? '1px dashed #D1D5DB' : '1px solid #E5E7EB',
                              background: on ? gm.bg : '#fff',
                              color: on ? gm.color : disabled ? '#D1D5DB' : '#9CA3AF',
                              cursor: disabled ? 'not-allowed' : 'pointer',
                              fontFamily: 'inherit',
                              textDecoration: disabled ? 'line-through' : 'none',
                              opacity: disabled ? 0.5 : 1,
                            }}>{cls.short}</button>
                        )
                      })}
                    </div>
                  )
                })}
              </div>

              {/* Working days + Day Off Rules */}
              <div style={{ borderTop: '1px solid #F3F4F6', paddingTop: 14, marginTop: 14 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  {cycleWeeks === 1 && !useDayNames && (
                    <>
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
                    </>
                  )}
                  <div style={{ marginLeft: cycleWeeks === 1 && !useDayNames ? 'auto' : 0, display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                    <span style={{ fontSize: 12, fontWeight: 700, color: '#374151' }}>Day off rules</span>
                    {dayOffRules.length > 0 && (
                      <span style={{ fontSize: 10, fontWeight: 700, background: '#FEF3C7', color: '#D97706', border: '1px solid #FDE68A', borderRadius: 10, padding: '1px 7px' }}>
                        {dayOffRules.length}
                      </span>
                    )}
                    <button onClick={() => setDayOffRules(prev => [...prev, {
                      id: makeId(),
                      day: ALL_DAYS.find(d => !workDays.includes(d)) ?? workDays[workDays.length - 1] ?? 'Sat',
                      classes: [],
                    }])} style={{
                      display: 'inline-flex', alignItems: 'center', gap: 5,
                      fontSize: 11, fontWeight: 600, color: '#D97706',
                      background: '#FFFBEB', border: '1px solid #FDE68A',
                      borderRadius: 6, padding: '4px 11px', cursor: 'pointer', fontFamily: 'inherit',
                    }}>
                      <Plus size={10} /> Add rule
                    </button>
                  </div>
                </div>
                {/* Age-appropriate smart suggestions (advanced mode) */}
                {daySuggestions.length > 0 && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 10 }}>
                    {daySuggestions.map(sug => (
                      <div key={sug.id} style={{
                        background: sug.bg, border: `1.5px solid ${sug.border}`,
                        borderRadius: 10, padding: '11px 13px',
                        display: 'flex', gap: 10, alignItems: 'flex-start',
                      }}>
                        <span style={{ fontSize: 20, lineHeight: 1, flexShrink: 0, marginTop: 1 }}>{sug.emoji}</span>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginBottom: 4 }}>
                            <span style={{ fontSize: 12, fontWeight: 700, color: sug.color }}>{sug.title}</span>
                            {sug.urgent && (
                              <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: 0.4,
                                background: '#FEE2E2', color: '#DC2626', border: '1px solid #FECACA',
                                borderRadius: 8, padding: '1px 6px' }}>RECOMMENDED</span>
                            )}
                          </div>
                          <p style={{ fontSize: 11, color: '#6B7280', margin: '0 0 9px', lineHeight: 1.6 }}>{sug.detail}</p>
                          <button onClick={() => applyDaySuggestion(sug)} style={{
                            fontSize: 11, fontWeight: 700, color: '#fff', background: sug.color,
                            border: 'none', borderRadius: 6, padding: '5px 12px', cursor: 'pointer',
                            fontFamily: 'inherit', display: 'inline-flex', alignItems: 'center', gap: 5,
                          }}>Add {sug.day} off for {sug.group} →</button>
                        </div>
                        <button title="Dismiss" onClick={() => setDismissedDaySugs(prev => [...prev, sug.id])}
                          style={{ background: 'none', border: 'none', cursor: 'pointer',
                            color: '#D1D5DB', padding: 2, flexShrink: 0, fontSize: 16, lineHeight: 1, marginTop: -1 }}>×</button>
                      </div>
                    ))}
                  </div>
                )}
                {dayOffRules.length > 0 && (
                  <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {dayOffRules.map(rule => (
                      <div key={rule.id} style={{
                        display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap',
                        background: '#FFFBEB', border: '1px solid #FDE68A',
                        borderRadius: 8, padding: '8px 10px',
                      }}>
                        <select value={rule.day}
                          onChange={e => setDayOffRules(prev => prev.map(r => r.id === rule.id ? { ...r, day: e.target.value } : r))}
                          style={{ padding: '4px 8px', borderRadius: 6, border: '1px solid #FDE68A', fontSize: 12, fontFamily: 'inherit', outline: 'none', fontWeight: 700, color: '#B45309', background: '#FEF9EE', flexShrink: 0 }}>
                          {ALL_DAYS.map(d => <option key={d} value={d}>{d}</option>)}
                        </select>
                        <span style={{ fontSize: 11, color: '#9CA3AF', flexShrink: 0 }}>off for</span>
                        <ClassPicker classes={rule.classes}
                          onChange={cls => setDayOffRules(prev => prev.map(r => r.id === rule.id ? { ...r, classes: cls } : r))}
                          rowId={`dor2-${rule.id}`} openId={openPicker} setOpenId={setOpenPicker}
                          classEntries={activeClasses} allClassKeys={activeClassKeys} classGroups={activeClassGroups} streamDefs={customStreams} classStreamMap={classStreamMap} />
                        <button onClick={() => setDayOffRules(prev => prev.filter(r => r.id !== rule.id))}
                          style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', color: '#FCA5A5', padding: 3, display: 'flex', flexShrink: 0 }}>
                          <Trash2 size={13} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              </div>
            </div>
            )}
          </div>
          )}

          {/* ─── SMART TIMING CARD ─── */}
          <div style={{ marginBottom: 16 }}>
            <div style={{
              background: autoBellMode ? '#F8F7FF' : '#FAFAFA',
              border: `1.5px solid ${autoBellMode ? '#C4B5FD' : '#E5E7EB'}`,
              borderRadius: 12, overflow: 'hidden',
            }}>
              {/* ── Header row ── */}
              <div style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '12px 16px',
                background: autoBellMode ? '#EDE9FF' : '#F3F4F6',
                borderBottom: autoBellMode ? '1px solid #C4B5FD' : '1px solid #E5E7EB',
              }}>
                <Sparkles size={14} color={autoBellMode ? '#7C3AED' : '#9CA3AF'} />
                <span style={{ fontSize: 13, fontWeight: 700, color: autoBellMode ? '#5B21B6' : '#6B7280', flex: 1 }}>
                  Smart Timing
                </span>
                {smartGenDone && autoBellMode && (
                  <span style={{ fontSize: 10, fontWeight: 700, background: '#DCFCE7', color: '#16A34A', border: '1px solid #86EFAC', borderRadius: 8, padding: '1px 8px' }}>
                    ✓ Generated
                  </span>
                )}
                {/* Toggle */}
                <button
                  onClick={() => setAutoBellMode(v => !v)}
                  style={{
                    width: 40, height: 22, borderRadius: 11, flexShrink: 0,
                    background: autoBellMode ? '#7C3AED' : '#D1D5DB',
                    border: 'none', cursor: 'pointer', position: 'relative',
                    transition: 'background .15s',
                  }}
                >
                  <span style={{
                    position: 'absolute', top: 3,
                    left: autoBellMode ? 21 : 3,
                    width: 16, height: 16, borderRadius: '50%',
                    background: '#fff', transition: 'left .15s',
                    boxShadow: '0 1px 3px rgba(0,0,0,.25)',
                  }} />
                </button>
              </div>

              {/* ── Body — only when enabled ── */}
              {autoBellMode && (
                <div style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 14 }}>

                  {/* School end time */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{ fontSize: 12, fontWeight: 600, color: '#374151' }}>School ends at</span>
                    <input type="time" value={schoolEndTime}
                      onChange={e => setSchoolEndTime(e.target.value)}
                      style={{
                        padding: '5px 9px', borderRadius: 7,
                        border: '1.5px solid #C4B5FD', fontSize: 12, fontFamily: 'inherit',
                        outline: 'none', background: '#fff', color: '#5B21B6', fontWeight: 700,
                      }}
                    />
                    <span style={{ fontSize: 11, color: '#9CA3AF' }}>
                      ({maxPeriods} periods · {periodDur} min each)
                    </span>
                  </div>

                  {/* ── Morning break ─────────────────────────────────── */}
                  <div style={{
                    background: morningBreak ? '#FFFBEB' : '#F9FAFB',
                    border: `1.5px solid ${morningBreak ? '#FDE68A' : '#E5E7EB'}`,
                    borderRadius: 9, padding: '11px 13px',
                    transition: 'all .15s',
                  }}>
                    {/* Header row */}
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 9 }}>
                      <span style={{ fontSize: 18, flexShrink: 0, marginTop: 1 }}>🍎</span>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 12, fontWeight: 700, color: '#374151', marginBottom: 2 }}>
                          Morning break
                          {morningBreak && (
                            <span style={{
                              marginLeft: 8, fontSize: 10, fontWeight: 700,
                              color: '#92400E', background: '#FEF3C7',
                              border: '1px solid #FDE68A', borderRadius: 10,
                              padding: '1px 7px',
                            }}>
                              {morningBreakDur} min · after {morningBreakPos === 0 ? 'Assembly' : `Period ${morningBreakPos}`}
                            </span>
                          )}
                        </div>
                        <div style={{ fontSize: 10, color: '#9CA3AF', lineHeight: 1.6 }}>
                          A short pause for breakfast or a snack — common in day-boarding schools. Helps young children settle in before the first block of lessons.
                        </div>
                      </div>
                    </div>

                    {/* Two primary buttons: No break / After... */}
                    <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                      {/* No break */}
                      <button
                        onClick={() => setMorningBreak(false)}
                        style={{
                          flex: 1, padding: '9px 12px', borderRadius: 8,
                          border: !morningBreak ? '2px solid #9CA3AF' : '1.5px solid #E5E7EB',
                          background: !morningBreak ? '#F3F4F6' : '#fff',
                          cursor: 'pointer', fontFamily: 'inherit',
                          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7,
                          transition: 'all .12s', outline: 'none',
                        }}>
                        <span style={{ fontSize: 13 }}>✗</span>
                        <span style={{ fontSize: 11, fontWeight: 700, color: !morningBreak ? '#374151' : '#9CA3AF' }}>No break</span>
                        {!morningBreak && <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#6B7280', marginLeft: 2 }} />}
                      </button>

                      {/* After... */}
                      <button
                        onClick={() => setMorningBreak(true)}
                        style={{
                          flex: 1, padding: '9px 12px', borderRadius: 8,
                          border: morningBreak ? '2px solid #FDE68A' : '1.5px solid #E5E7EB',
                          background: morningBreak ? '#FFFBEB' : '#fff',
                          cursor: 'pointer', fontFamily: 'inherit',
                          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7,
                          transition: 'all .12s', outline: 'none',
                        }}>
                        <span style={{ fontSize: 13 }}>☕</span>
                        <span style={{ fontSize: 11, fontWeight: 700, color: morningBreak ? '#92400E' : '#9CA3AF' }}>
                          {morningBreak ? `After ${morningBreakPos === 0 ? 'Assembly' : `Period ${morningBreakPos}`}` : 'After…'}
                        </span>
                        {morningBreak && <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#D97706', marginLeft: 2 }} />}
                      </button>
                    </div>

                    {/* Sub-picker: exactly after which point? — shown when break is enabled */}
                    {morningBreak && (() => {
                      // Show Assembly + up to 4 periods (sensible max for a morning break)
                      const maxPos = Math.min(maxPeriods - 1, 4)
                      const positions = [
                        { pos: 0, label: 'Assembly', sub: 'Before P1' },
                        ...Array.from({ length: maxPos }, (_, i) => ({
                          pos: i + 1,
                          label: `Period ${i + 1}`,
                          sub: i === 0 ? 'Most common' : i === 1 ? 'A bit later' : '',
                        })),
                      ]
                      return (
                        <div style={{ marginTop: 10 }}>
                          <div style={{ fontSize: 10, fontWeight: 700, color: '#B45309', letterSpacing: 0.3, textTransform: 'uppercase' as const, marginBottom: 6 }}>
                            Place break after…
                          </div>
                          <div style={{ display: 'flex', flexWrap: 'wrap' as const, gap: 5 }}>
                            {positions.map(({ pos, label, sub }) => {
                              const active = morningBreakPos === pos
                              return (
                                <button key={pos}
                                  onClick={() => setMorningBreakPos(pos)}
                                  style={{
                                    padding: '5px 12px', borderRadius: 20,
                                    border: active ? '2px solid #F59E0B' : '1.5px solid #E5E7EB',
                                    background: active ? '#FEF3C7' : '#fff',
                                    cursor: 'pointer', fontFamily: 'inherit',
                                    display: 'flex', flexDirection: 'column' as const, alignItems: 'center',
                                    transition: 'all .1s', outline: 'none', minWidth: 68,
                                  }}>
                                  <span style={{ fontSize: 11, fontWeight: 700, color: active ? '#92400E' : '#6B7280' }}>{label}</span>
                                  {sub && <span style={{ fontSize: 9, color: active ? '#B45309' : '#9CA3AF', marginTop: 1 }}>{sub}</span>}
                                </button>
                              )
                            })}
                          </div>
                        </div>
                      )
                    })()}

                    {/* Duration stepper — only when break is enabled */}
                    {morningBreak && (
                      <div style={{ marginTop: 10, display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ fontSize: 11, color: '#92400E', fontWeight: 600 }}>Duration</span>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                          <button
                            onClick={() => setMorningBreakDur(d => Math.max(5, d - 5))}
                            disabled={morningBreakDur <= 5}
                            style={{
                              width: 24, height: 24, borderRadius: 6,
                              border: '1px solid #FDE68A', background: '#fff',
                              cursor: morningBreakDur <= 5 ? 'not-allowed' : 'pointer',
                              color: morningBreakDur <= 5 ? '#D1D5DB' : '#92400E',
                              fontWeight: 700, fontSize: 14, display: 'flex',
                              alignItems: 'center', justifyContent: 'center',
                              fontFamily: 'inherit',
                            }}>−</button>
                          <span style={{
                            minWidth: 42, textAlign: 'center' as const,
                            fontSize: 13, fontWeight: 700, color: '#92400E',
                            fontFamily: "'DM Mono', monospace",
                          }}>{morningBreakDur} min</span>
                          <button
                            onClick={() => setMorningBreakDur(d => Math.min(30, d + 5))}
                            disabled={morningBreakDur >= 30}
                            style={{
                              width: 24, height: 24, borderRadius: 6,
                              border: '1px solid #FDE68A', background: '#fff',
                              cursor: morningBreakDur >= 30 ? 'not-allowed' : 'pointer',
                              color: morningBreakDur >= 30 ? '#D1D5DB' : '#92400E',
                              fontWeight: 700, fontSize: 14, display: 'flex',
                              alignItems: 'center', justifyContent: 'center',
                              fontFamily: 'inherit',
                            }}>+</button>
                        </div>
                        <span style={{ fontSize: 10, color: '#B45309' }}>Typically 10–20 min</span>
                      </div>
                    )}
                  </div>

                  {/* Lunch break mode chooser */}
                  <div>
                    <div style={{ fontSize: 11, fontWeight: 700, color: '#374151', marginBottom: 8, letterSpacing: 0.3, textTransform: 'uppercase' as const }}>
                      Lunch break mode
                    </div>
                    <div style={{ display: 'flex', gap: 8 }}>
                      {/* Single lunch option */}
                      {(['single', 'smart'] as const).map(mode => {
                        const active = smartLunchMode === mode
                        const isSmart = mode === 'smart'
                        return (
                          <button key={mode}
                            onClick={() => setSmartLunchMode(mode)}
                            style={{
                              flex: 1, textAlign: 'left' as const,
                              padding: '11px 13px', borderRadius: 9, cursor: 'pointer',
                              border: active ? `2px solid ${isSmart ? '#7C3AED' : '#6B7280'}` : '1.5px solid #E5E7EB',
                              background: active ? (isSmart ? '#F5F3FF' : '#F9FAFB') : '#fff',
                              fontFamily: 'inherit', transition: 'all .12s',
                            }}>
                            <div style={{ fontSize: 15, marginBottom: 4 }}>
                              {isSmart ? '🧠' : '🕐'}
                            </div>
                            <div style={{ fontSize: 12, fontWeight: 700, color: active ? (isSmart ? '#5B21B6' : '#111827') : '#6B7280', marginBottom: 3 }}>
                              {isSmart ? 'Smart Lunch' : 'Single Lunch'}
                            </div>
                            <div style={{ fontSize: 10, color: '#9CA3AF', lineHeight: 1.5 }}>
                              {isSmart
                                ? 'Each age group eats at a different time. Avoids canteen rush.'
                                : 'All classes share one common lunch break slot.'}
                            </div>
                            {active && (
                              <div style={{ width: 8, height: 8, borderRadius: '50%', background: isSmart ? '#7C3AED' : '#374151', marginTop: 6 }} />
                            )}
                          </button>
                        )
                      })}
                    </div>
                  </div>

                  {/* Smart lunch per-group controls */}
                  {smartLunchMode === 'smart' && (
                    <div style={{
                      background: '#FAFAFE', border: '1px solid #EDE9FF',
                      borderRadius: 9, padding: '12px 14px',
                    }}>
                      <div style={{ fontSize: 11, color: '#6B7280', marginBottom: 10, lineHeight: 1.5 }}>
                        <strong style={{ color: '#5B21B6' }}>How it works:</strong> Each age group gets lunch at a different period. Younger children eat earlier (they get hungry sooner), older classes eat later — the canteen serves one group at a time, no rush.
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                        {(() => {
                          // Compute concurrent-period info once, shared across all group rows.
                          const sbAPShared  = Math.max(1, Math.ceil(maxPeriods * 0.3))
                          const ppLunchAP   = effectiveLunchAP['Pre-Primary'] ?? sbAPShared
                          const ppKeys      = activeClasses.filter(c => c.group === 'Pre-Primary').map(c => c.key)
                          const ppEatsEarly = ppKeys.length > 0 && ppLunchAP <= sbAPShared
                          // Effective duration of the period that OTHER classes have while Pre-Primary eats lunch.
                          // This period starts right after the short break (sbAP + 1).
                          const lunchDurConst = 45
                          const effConcurrentDur = ppEatsEarly
                            ? (concurrentMode === 'regular'     ? periodDur
                             : concurrentMode === 'match-lunch' ? lunchDurConst
                             :                                    concurrentDur)
                            : periodDur
                          return activeClassGroups.map(gm => {
                          const meta = SMART_GROUP_META[gm.group] ?? { emoji: '🏫', color: '#374151', bg: '#F9FAFB', border: '#E5E7EB' }
                          const ap    = effectiveLunchAP[gm.group] ?? 4
                          const sbAP  = sbAPShared
                          const minAP = gm.group === 'Pre-Primary' ? sbAP : sbAP + 1
                          const maxAP = maxPeriods
                          const isPrePrimary      = gm.group === 'Pre-Primary'
                          const replacesShortBreak = isPrePrimary && ap <= sbAP
                          // For non-Pre-Primary groups: if Pre-Primary eats early AND concurrent mode changes
                          // period duration, the period at (sbAP + 1) is shorter → lunch comes earlier.
                          const concPeriodDur = (!isPrePrimary && ppEatsEarly && concurrentMode !== 'regular')
                            ? effConcurrentDur : undefined
                          const concPeriodAt  = (!isPrePrimary && ppEatsEarly && concurrentMode !== 'regular')
                            ? sbAP + 1 : undefined
                          const approx = approxLunchTime(startTime, periodDur, ap, maxPeriods, use12h,
                            replacesShortBreak, concPeriodDur, concPeriodAt)
                          return (
                            <div key={gm.group} style={{
                              display: 'flex', alignItems: 'center', gap: 10,
                              background: meta.bg, border: `1px solid ${meta.border}`,
                              borderRadius: 7, padding: '7px 11px',
                            }}>
                              <span style={{ fontSize: 16, flexShrink: 0 }}>{meta.emoji}</span>
                              <span style={{ fontSize: 12, fontWeight: 700, color: meta.color, minWidth: 100 }}>{gm.group}</span>
                              <span style={{ fontSize: 10, color: '#9CA3AF', flex: 1 }}>{gm.desc}</span>
                              <span style={{ fontSize: 10, color: '#9CA3AF', minWidth: 80 }}>≈ {approx}</span>
                              <span style={{ fontSize: 11, color: '#6B7280' }}>After P</span>
                              {/* − / value / + stepper */}
                              <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                                <button
                                  onClick={() => setSmartLunchAP(prev => ({ ...prev, [gm.group]: Math.max(minAP, ap - 1) }))}
                                  disabled={ap <= minAP}
                                  style={{
                                    width: 22, height: 22, borderRadius: 5, border: `1px solid ${meta.border}`,
                                    background: '#fff', cursor: ap <= minAP ? 'not-allowed' : 'pointer',
                                    color: ap <= minAP ? '#D1D5DB' : meta.color, fontWeight: 700, fontSize: 13,
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    fontFamily: 'inherit',
                                  }}>−</button>
                                <span style={{
                                  minWidth: 28, textAlign: 'center' as const, fontSize: 13,
                                  fontWeight: 700, color: meta.color, fontFamily: "'DM Mono', monospace",
                                }}>{ap}</span>
                                <button
                                  onClick={() => setSmartLunchAP(prev => ({ ...prev, [gm.group]: Math.min(maxAP, ap + 1) }))}
                                  disabled={ap >= maxAP}
                                  style={{
                                    width: 22, height: 22, borderRadius: 5, border: `1px solid ${meta.border}`,
                                    background: '#fff', cursor: ap >= maxAP ? 'not-allowed' : 'pointer',
                                    color: ap >= maxAP ? '#D1D5DB' : meta.color, fontWeight: 700, fontSize: 13,
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    fontFamily: 'inherit',
                                  }}>+</button>
                              </div>
                            </div>
                          )
                        })
                        })()}
                      </div>
                      {/* Canteen tip */}
                      <div style={{ marginTop: 10, fontSize: 10, color: '#9CA3AF', display: 'flex', gap: 5, alignItems: 'flex-start' }}>
                        <span style={{ flexShrink: 0 }}>💡</span>
                        <span>A 30–45 min gap between groups is ideal for canteen throughput. The short break remains shared at the same time for all classes.</span>
                      </div>
                    </div>
                  )}

                  {/* ── Concurrent period (shown only in Smart lunch mode) ── */}
                  {smartLunchMode === 'smart' && (
                    <div style={{
                      background: concurrentMode !== 'regular' ? '#F0FDF4' : '#F9FAFB',
                      border: `1.5px solid ${concurrentMode !== 'regular' ? '#6EE7B7' : '#E5E7EB'}`,
                      borderRadius: 9, padding: '11px 13px', transition: 'all .15s',
                    }}>
                      <div style={{ fontSize: 11, fontWeight: 700, color: '#374151', marginBottom: 6, letterSpacing: 0.3, textTransform: 'uppercase' as const }}>
                        While one group eats, others are in class
                      </div>
                      <div style={{ fontSize: 10, color: '#6B7280', marginBottom: 10, lineHeight: 1.6 }}>
                        When Pre-Primary is at lunch, Primary/Middle/Senior are still in a period. How long should that period be?
                      </div>
                      <div style={{ display: 'flex', gap: 7 }}>
                        {([
                          { val: 'regular',    label: 'Regular',       sub: `${periodDur} min`, desc: 'Normal period, unaffected' },
                          { val: 'match-lunch',label: 'Match lunch',   sub: '45 min',           desc: 'Period equals lunch duration — bells align cleanly' },
                          { val: 'custom',     label: 'Custom',        sub: '',                 desc: 'Set your own duration' },
                        ] as const).map(opt => {
                          const active = concurrentMode === opt.val
                          return (
                            <button key={opt.val}
                              onClick={() => setConcurrentMode(opt.val)}
                              title={opt.desc}
                              style={{
                                flex: 1, padding: '8px 7px', borderRadius: 8,
                                border: active ? '2px solid #059669' : '1.5px solid #E5E7EB',
                                background: active ? '#F0FDF4' : '#fff',
                                cursor: 'pointer', fontFamily: 'inherit',
                                textAlign: 'center' as const, transition: 'all .12s', outline: 'none',
                              }}>
                              <div style={{ fontSize: 11, fontWeight: 700, color: active ? '#065F46' : '#6B7280' }}>{opt.label}</div>
                              {opt.sub && <div style={{ fontSize: 9, color: active ? '#059669' : '#9CA3AF', marginTop: 2 }}>{opt.sub}</div>}
                              {active && <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#059669', margin: '4px auto 0' }} />}
                            </button>
                          )
                        })}
                      </div>

                      {/* Custom duration stepper */}
                      {concurrentMode === 'custom' && (
                        <div style={{ marginTop: 10, display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span style={{ fontSize: 11, color: '#065F46', fontWeight: 600 }}>Duration</span>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                            <button onClick={() => setConcurrentDur(d => Math.max(10, d - 5))} disabled={concurrentDur <= 10}
                              style={{ width: 24, height: 24, borderRadius: 6, border: '1px solid #6EE7B7', background: '#fff',
                                cursor: concurrentDur <= 10 ? 'not-allowed' : 'pointer',
                                color: concurrentDur <= 10 ? '#D1D5DB' : '#059669',
                                fontWeight: 700, fontSize: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'inherit' }}>−</button>
                            <span style={{ minWidth: 42, textAlign: 'center' as const, fontSize: 13, fontWeight: 700, color: '#059669', fontFamily: "'DM Mono', monospace" }}>{concurrentDur} min</span>
                            <button onClick={() => setConcurrentDur(d => Math.min(periodDur, d + 5))} disabled={concurrentDur >= periodDur}
                              style={{ width: 24, height: 24, borderRadius: 6, border: '1px solid #6EE7B7', background: '#fff',
                                cursor: concurrentDur >= periodDur ? 'not-allowed' : 'pointer',
                                color: concurrentDur >= periodDur ? '#D1D5DB' : '#059669',
                                fontWeight: 700, fontSize: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'inherit' }}>+</button>
                          </div>
                          <span style={{ fontSize: 10, color: '#059669' }}>max {periodDur} min (regular)</span>
                        </div>
                      )}

                      {/* Benefit note for match-lunch */}
                      {concurrentMode === 'match-lunch' && (
                        <div style={{ marginTop: 8, fontSize: 10, color: '#065F46', display: 'flex', gap: 5, alignItems: 'flex-start', lineHeight: 1.5 }}>
                          <span style={{ flexShrink: 0 }}>✓</span>
                          <span>Bell boundaries align perfectly — when Pre-Primary's lunch ends, it rings for the next group to start lunch. Simpler to manage.</span>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Generate button */}
                  <button
                    onClick={() => {
                      const { rows: generated, cwRows: generated_cwRows } = smartGenerateBellConfig(
                        startTime, schoolEndTime, maxPeriods, periodDur,
                        smartLunchMode, effectiveLunchAP,
                        activeClassGroups, activeClasses,
                        morningBreak, morningBreakPos, morningBreakDur,
                        concurrentMode === 'regular' ? undefined
                          : concurrentMode === 'match-lunch' ? 45
                          : concurrentDur,
                      )
                      setRows(generated)
                      setCwRows(generated_cwRows)
                      setSmartGenDone(true)
                    }}
                    style={{
                      display: 'inline-flex', alignItems: 'center', gap: 7,
                      padding: '9px 20px', borderRadius: 8,
                      background: 'linear-gradient(135deg, #7C3AED, #6D28D9)',
                      border: 'none', color: '#fff',
                      fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
                      boxShadow: '0 2px 8px rgba(124,58,237,.35)',
                      alignSelf: 'flex-start',
                    }}>
                    <Sparkles size={13} color="#fff" />
                    Generate Bell Schedule
                  </button>

                  {/* Post-generation hint */}
                  {smartGenDone && (
                    <div style={{ fontSize: 11, color: '#6B7280', display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ color: '#16A34A', fontWeight: 700 }}>✓</span>
                      Bell schedule generated below — review and edit freely before proceeding.
                    </div>
                  )}
                </div>
              )}

              {/* Collapsed state hint */}
              {!autoBellMode && (
                <div style={{ padding: '10px 16px', fontSize: 11, color: '#9CA3AF' }}>
                  Enable to auto-generate an optimised bell schedule based on your school hours — with optional smart staggered lunches per age group.
                </div>
              )}
            </div>
          </div>

          {/* ─── BELL TIMING GRID ─── */}
          {/* Grid is always editable — Smart Timing populates it but never locks it. */}
          <div>
            {/* In Advanced mode: shift selector mini-tabs above the grid */}
            {isAdvanced && shifts.length > 1 && (
              <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginBottom: 10 }}>
                {shifts.map(s => {
                  const active = s.id === activeShiftId
                  return (
                    <button key={s.id} onClick={() => setActiveShiftId(s.id)} style={{
                      padding: '3px 14px', borderRadius: 16, fontSize: 11, fontWeight: 700,
                      border: active ? '1.5px solid #7C6FE0' : '1px solid #E5E7EB',
                      background: active ? '#EDE9FF' : '#fff',
                      color: active ? '#7C3AED' : '#9CA3AF',
                      cursor: 'pointer', fontFamily: 'inherit', transition: 'all .12s',
                    }}>{s.name}</button>
                  )
                })}
              </div>
            )}

            {/* Section header + Vary-by-day toggle + Class-wise breaks button */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                <Clock size={13} color="#7C6FE0" />
                <span style={{ fontSize: 12, fontWeight: 700, color: '#374151' }}>
                  Bell Timing{isAdvanced && activeShift ? ` — ${activeShift.name}` : ''}
                </span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>

                {/* Vary by day toggle */}
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', userSelect: 'none' }}>
                  <div style={{ position: 'relative', width: 30, height: 16, flexShrink: 0 }}>
                    <input type="checkbox" checked={varyByDay}
                      onChange={e => handleToggleVaryByDay(e.target.checked)}
                      style={{ opacity: 0, width: 0, height: 0, position: 'absolute' }} />
                    <div style={{ position: 'absolute', inset: 0, borderRadius: 8, background: varyByDay ? '#7C6FE0' : '#E5E7EB', transition: 'background .2s' }} />
                    <div style={{ position: 'absolute', top: 2, left: varyByDay ? 16 : 2, width: 12, height: 12, borderRadius: '50%', background: '#fff', transition: 'left .2s', boxShadow: '0 1px 3px rgba(0,0,0,.2)' }} />
                  </div>
                  <span style={{ fontSize: 11, fontWeight: 600, color: varyByDay ? '#7C6FE0' : '#9CA3AF', transition: 'color .15s' }}>
                    Vary by {useDayNames ? 'day' : 'weekday'}
                  </span>
                </label>

                <div style={{ width: 1, height: 14, background: '#E5E7EB', flexShrink: 0 }} />

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
                assemblyDur={rows.find(r => r.type === 'assembly')?.duration ?? 10}
                classEntries={activeClasses}
                allClassKeys={cwClassKeys}
                classGroups={activeClassGroups}
                streamDefs={customStreams}
                classStreamMap={classStreamMap}
              />
            )}

            {/* ─── Day selector ─── */}
            {varyByDay && dayKeys.length > 0 && (
              <div style={{ marginBottom: 8 }}>
                {cycleWeeks > 1 && !useDayNames ? (
                  /* ── Week × Day matrix (multi-week cycle) ── */
                  <div>
                    <div style={{
                      display: 'inline-grid',
                      gridTemplateColumns: `28px repeat(7, 40px)`,
                      gap: '4px 3px', padding: '8px 10px',
                      background: '#F9FAFB', borderRadius: 10,
                      border: '1px solid #E5E7EB',
                    }}>
                      {/* Column headers */}
                      <div />
                      {ALL_DAYS.map(d => (
                        <div key={d} style={{ fontSize: 10, fontWeight: 700, color: '#9CA3AF', textAlign: 'center' }}>{d}</div>
                      ))}
                      {/* Week rows */}
                      {Array.from({ length: cycleWeeks }, (_, i) => {
                        const w = i + 1
                        const wdays = weekWorkDays[w] ?? workDays
                        return ALL_DAYS.reduce<React.ReactNode[]>((nodes, d, di) => {
                          if (di === 0) {
                            nodes.push(
                              <div key={`lbl-w${w}`} style={{
                                fontSize: 10, fontWeight: 800, color: '#7C6FE0',
                                fontFamily: "'DM Mono',monospace",
                                display: 'flex', alignItems: 'center', justifyContent: 'flex-end', paddingRight: 2,
                              }}>W{w}</div>
                            )
                          }
                          const k = `w${w}-${d}`
                          const isWorking = wdays.includes(d)
                          const isActive  = activeDayTab === k
                          const isCustom  = !!dayRows[k]
                          nodes.push(
                            <button key={k} onClick={() => isWorking && setActiveDayTab(k)}
                              title={isWorking ? `Week ${w} · ${d}${isCustom ? ' — custom schedule' : ''}` : 'Not a working day this week'}
                              style={{
                                padding: '5px 0', borderRadius: 7, fontSize: 11, fontWeight: isActive ? 700 : 500,
                                background: isActive ? '#7C6FE0' : isWorking ? (isCustom ? '#EDE9FF' : '#fff') : 'transparent',
                                color: isActive ? '#fff' : isWorking ? (isCustom ? '#7C3AED' : '#374151') : '#D1D5DB',
                                border: isActive ? '1.5px solid #7C6FE0' : isWorking ? (isCustom ? '1px solid #C4B5FD' : '1px solid #E5E7EB') : '1px solid transparent',
                                cursor: isWorking ? 'pointer' : 'default',
                                fontFamily: 'inherit', transition: 'all .12s', textAlign: 'center',
                                position: 'relative', lineHeight: 1,
                              }}>
                              {isWorking ? d.slice(0, 2) : '—'}
                              {isCustom && isWorking && !isActive && (
                                <div style={{ position: 'absolute', bottom: 3, left: '50%', transform: 'translateX(-50%)', width: 4, height: 4, borderRadius: '50%', background: '#7C3AED' }} />
                              )}
                            </button>
                          )
                          return nodes
                        }, [])}
                      )}
                    </div>
                    {activeDayTab && (
                      <div style={{ marginTop: 6, fontSize: 11, color: '#7C6FE0', fontWeight: 600 }}>
                        ✎ Editing: <span style={{ fontFamily: "'DM Mono',monospace" }}>
                          {activeDayTab.replace(/^w(\d+)-(.+)$/, 'Week $1 · $2')}
                        </span>
                        <span style={{ fontWeight: 400, color: '#9CA3AF', marginLeft: 6 }}>
                          {dayRows[activeDayTab] ? '(custom)' : '(using default — edit to customise)'}
                        </span>
                      </div>
                    )}
                  </div>
                ) : (
                  /* ── Flat pill tabs (single week or day-names mode) ── */
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <div style={{
                      display: 'inline-flex', alignItems: 'center', gap: 2,
                      background: '#F3F4F6', borderRadius: 9, padding: '3px 4px',
                      border: '1px solid #E5E7EB',
                    }}>
                      {dayKeys.map(k => {
                        const isCustom = !!dayRows[k]
                        return (
                          <button key={k} onClick={() => setActiveDayTab(k)} style={{
                            padding: '4px 14px', borderRadius: 6,
                            fontSize: 12, fontWeight: activeDayTab === k ? 700 : 500,
                            background: activeDayTab === k ? '#fff' : 'transparent',
                            color: activeDayTab === k ? '#7C6FE0' : isCustom ? '#7C3AED' : '#6B7280',
                            border: activeDayTab === k ? '1px solid #DDD6FE' : '1px solid transparent',
                            boxShadow: activeDayTab === k ? '0 1px 4px rgba(124,111,224,.13)' : 'none',
                            cursor: 'pointer', fontFamily: 'inherit', transition: 'all .12s',
                            position: 'relative',
                          }}>
                            {k}
                            {isCustom && activeDayTab !== k && (
                              <span style={{ position: 'absolute', top: 3, right: 3, width: 5, height: 5, borderRadius: '50%', background: '#7C3AED' }} />
                            )}
                          </button>
                        )
                      })}
                    </div>
                    <span style={{ fontSize: 11, color: '#9CA3AF' }}>
                      {Object.keys(dayRows).filter(k => dayKeys.includes(k)).length} of {dayKeys.length} customised
                    </span>
                  </div>
                )}
              </div>
            )}

            {/* ── Copy row ── */}
            {varyByDay && dayKeys.length > 1 && (
              <div style={{
                display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap',
                marginBottom: 6, padding: '7px 12px',
                background: '#F9FAFB', borderRadius: 8, border: '1px solid #E5E7EB',
              }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: '#9CA3AF', letterSpacing: '0.05em' }}>COPY</span>
                <select
                  value={copyFrom || (cycleWeeks > 1 && !useDayNames ? '1' : dayKeys[0])}
                  onChange={e => setCopyFrom(e.target.value)}
                  style={{ padding: '3px 8px', borderRadius: 6, border: '1px solid #E5E7EB', fontSize: 12, fontFamily: 'inherit', outline: 'none', color: '#374151' }}>
                  {cycleWeeks > 1 && !useDayNames
                    ? Array.from({ length: cycleWeeks }, (_, i) => (
                        <option key={i + 1} value={String(i + 1)}>Week {i + 1}</option>
                      ))
                    : dayKeys.map(k => <option key={k} value={k}>{k}</option>)
                  }
                </select>
                <span style={{ fontSize: 11, color: '#C4B5FD' }}>→</span>
                <select
                  value={copyTo || (cycleWeeks > 1 && !useDayNames ? '2' : dayKeys[1])}
                  onChange={e => setCopyTo(e.target.value)}
                  style={{ padding: '3px 8px', borderRadius: 6, border: '1px solid #E5E7EB', fontSize: 12, fontFamily: 'inherit', outline: 'none', color: '#374151' }}>
                  {cycleWeeks > 1 && !useDayNames
                    ? Array.from({ length: cycleWeeks }, (_, i) => (
                        <option key={i + 1} value={String(i + 1)}>Week {i + 1}</option>
                      ))
                    : dayKeys.map(k => <option key={k} value={k}>{k}</option>)
                  }
                </select>
                <button
                  onClick={() => {
                    const from = copyFrom || (cycleWeeks > 1 && !useDayNames ? '1' : dayKeys[0])
                    const to   = copyTo   || (cycleWeeks > 1 && !useDayNames ? '2' : dayKeys[1])
                    if (from === to) return
                    const label = cycleWeeks > 1 && !useDayNames ? `Week ${from} → Week ${to}` : `${from} → ${to}`
                    setConfirmDialog({
                      msg: `Copy schedule from ${label}? This will overwrite the destination's bell rows, start time, and period duration.`,
                      onConfirm: () => handleCopyDays(from, to),
                    })
                  }}
                  style={{
                    padding: '4px 13px', borderRadius: 6, border: '1px solid #7C6FE0',
                    background: '#F5F3FF', color: '#7C3AED', fontSize: 11, fontWeight: 700,
                    cursor: 'pointer', fontFamily: 'inherit',
                  }}>
                  Copy schedule →
                </button>
              </div>
            )}

            {/* ── Per-day settings bar (start time · end time · period duration) ── */}
            {varyByDay && activeDayTab && (
              <div style={{
                display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
                background: '#F5F3FF', border: '1px solid #DDD6FE', borderRadius: 9,
                padding: '9px 14px', marginBottom: 8,
              }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: '#7C3AED', flexShrink: 0, minWidth: 60 }}>
                  {activeDayTab.replace(/^w(\d+)-(.+)$/, 'Week $1 · $2')}
                </span>

                <div style={{ width: 1, height: 20, background: '#DDD6FE', flexShrink: 0 }} />

                {/* Start time */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                  <span style={{ fontSize: 11, color: '#9CA3AF' }}>Starts</span>
                  <input type="time"
                    value={dayStartTimes[activeDayTab] ?? startTime}
                    onChange={e => setDayStartTimes(prev => ({ ...prev, [activeDayTab]: e.target.value }))}
                    style={{
                      padding: '4px 8px', borderRadius: 6, fontSize: 12, fontFamily: 'inherit', outline: 'none',
                      border: dayStartTimes[activeDayTab] ? '1.5px solid #7C6FE0' : '1px solid #DDD6FE',
                      color: dayStartTimes[activeDayTab] ? '#7C3AED' : '#374151',
                      background: '#fff', fontWeight: dayStartTimes[activeDayTab] ? 700 : 400,
                    }} />
                  {dayStartTimes[activeDayTab] && (
                    <button onClick={() => setDayStartTimes(prev => { const n = { ...prev }; delete n[activeDayTab]; return n })}
                      style={{ fontSize: 10, color: '#9CA3AF', background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontFamily: 'inherit' }}>reset</button>
                  )}
                </div>

                <span style={{ fontSize: 11, color: '#C4B5FD' }}>→</span>

                {/* End time (derived) */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                  <span style={{ fontSize: 11, color: '#9CA3AF' }}>Ends</span>
                  <span style={{ padding: '4px 8px', borderRadius: 6, background: '#fff', border: '1px solid #DDD6FE', fontSize: 12, fontFamily: "'DM Mono',monospace", fontWeight: 700, color: '#374151' }}>
                    {fmt12(endTime, use12h)}
                  </span>
                </div>

                <div style={{ width: 1, height: 20, background: '#DDD6FE', flexShrink: 0 }} />

                {/* Period duration — default for new rows; individual rows keep their own durations */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                  <span style={{ fontSize: 11, color: '#9CA3AF' }}>Default period</span>
                  <NumInput className="b-dur" value={activePeriodDur} min={10} max={240}
                    onChange={handlePeriodDurChange}
                    style={{
                      border: dayPeriodDurs[activeDayTab] ? '1.5px solid #7C6FE0' : '1px solid #DDD6FE',
                      color: dayPeriodDurs[activeDayTab] ? '#7C3AED' : '#13111E',
                      fontWeight: dayPeriodDurs[activeDayTab] ? 700 : 400,
                    }} />
                  <span style={{ fontSize: 11, color: '#9CA3AF' }}>min</span>
                  <button onClick={applyDurToAll}
                    title="Set every period row to this duration"
                    style={{ fontSize: 10, color: '#7C6FE0', background: 'none', border: '1px solid #DDD6FE', borderRadius: 4, cursor: 'pointer', padding: '1px 6px', fontFamily: 'inherit', fontWeight: 600 }}>
                    Apply all
                  </button>
                  {dayPeriodDurs[activeDayTab] && (
                    <button onClick={() => setDayPeriodDurs(prev => { const n = { ...prev }; delete n[activeDayTab]; return n })}
                      style={{ fontSize: 10, color: '#9CA3AF', background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontFamily: 'inherit' }}>reset</button>
                  )}
                </div>

                {!dayStartTimes[activeDayTab] && !dayPeriodDurs[activeDayTab] && (
                  <span style={{ marginLeft: 'auto', fontSize: 10, color: '#C4B5FD', flexShrink: 0 }}>
                    using defaults · {fmt12(startTime, use12h)} · {periodDur} min
                  </span>
                )}
              </div>
            )}

            <div style={{ background: '#fff', borderRadius: 10, border: varyByDay ? '1.5px solid #DDD6FE' : '1px solid #E5E7EB' }}>
              {/* Table header */}
              <div style={{
                display: 'grid',
                gridTemplateColumns: '88px 88px 88px 56px 100px 1fr 28px',
                padding: '8px 14px', background: '#F9FAFB',
                borderBottom: '1px solid #E5E7EB', borderRadius: '10px 10px 0 0',
              }}>
                {['Bell', 'Start', 'End', 'Min ✎', 'Type', 'Classes', ''].map((h, i) => (
                  <div key={i} title={i === 3 ? 'Each row\'s duration is independently editable — click the value to change it' : undefined}
                    style={{ fontSize: 11, fontWeight: 600, color: i === 3 ? '#7C6FE0' : '#6B7280', cursor: i === 3 ? 'help' : undefined }}>
                    {h}
                  </div>
                ))}
              </div>

              {/* ── Attending today bar — shown when Vary by day is active ── */}
              {todayAttendance && (
                <div style={{
                  padding: '8px 14px', borderBottom: '1px solid #F0EDFF',
                  background: '#FDFCFF', display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap',
                }}>
                  <span style={{ fontSize: 11, fontWeight: 700, color: '#9CA3AF', letterSpacing: '0.05em', flexShrink: 0 }}>
                    ATTENDING TODAY
                  </span>
                  {todayAttendance.map(({ group, color, bg, attending, gkeys }) => (
                    <button key={group} onClick={() => toggleDayGroup(gkeys, !attending)}
                      title={attending ? `Click to mark ${group} as off today` : `Click to restore ${group} for today`}
                      style={{
                        display: 'inline-flex', alignItems: 'center', gap: 5,
                        padding: '3px 10px', borderRadius: 14, fontSize: 11, fontWeight: 600,
                        background: attending ? bg : '#F9FAFB',
                        color: attending ? color : '#D1D5DB',
                        border: attending ? `1px solid ${color}40` : '1px solid #E5E7EB',
                        cursor: 'pointer', fontFamily: 'inherit', transition: 'all .15s',
                        textDecoration: attending ? 'none' : 'line-through',
                      }}>
                      <span style={{ width: 6, height: 6, borderRadius: '50%', background: attending ? color : '#D1D5DB', flexShrink: 0 }} />
                      {group}
                    </button>
                  ))}
                  <span style={{ marginLeft: 'auto', fontSize: 10, color: '#C4B5FD', whiteSpace: 'nowrap', flexShrink: 0 }}>
                    tap to toggle off/on
                  </span>
                </div>
              )}

              {/* Rows */}
              <div>
                {displayRows.map((row, i) => {
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
                        {/* ── Start time — click to edit ── */}
                        {editingTime?.rowId === row.id && editingTime.field === 'start' ? (
                          <input type="time" defaultValue={start} autoFocus
                            onBlur={e  => commitStartTime(row.id, e.target.value, rowStartTimes)}
                            onKeyDown={e => {
                              if (e.key === 'Enter')  e.currentTarget.blur()
                              if (e.key === 'Escape') setEditingTime(null)
                            }}
                            style={{
                              width: 90, padding: '2px 5px', borderRadius: 5,
                              border: `1.5px solid ${tm.border}`, outline: 'none',
                              fontFamily: "'DM Mono',monospace", fontSize: 12, fontWeight: 700,
                              color: tm.fg, background: tm.bg,
                            }}
                          />
                        ) : (
                          <div
                            onClick={() => setEditingTime({ rowId: row.id, field: 'start' })}
                            style={{
                              fontSize: isBreak ? 13 : 12, fontFamily: "'DM Mono',monospace",
                              color: isBreak ? tm.fg : '#374151', fontWeight: 700,
                              padding: '4px 7px', cursor: 'text', borderRadius: 5,
                              display: 'flex', alignItems: 'center', gap: 3,
                            }}
                            title="Click to edit start time"
                          >
                            {fmt12(start, use12h)}
                            <span style={{ fontSize: 8, color: '#C4B5FD', opacity: 0.7 }}>✎</span>
                          </div>
                        )}

                        {/* ── End time — click to edit ── */}
                        {editingTime?.rowId === row.id && editingTime.field === 'end' ? (
                          <input type="time" defaultValue={end} autoFocus
                            onBlur={e  => commitEndTime(row.id, e.target.value, start, row.type)}
                            onKeyDown={e => {
                              if (e.key === 'Enter')  e.currentTarget.blur()
                              if (e.key === 'Escape') setEditingTime(null)
                            }}
                            style={{
                              width: 90, padding: '2px 5px', borderRadius: 5,
                              border: `1.5px solid ${tm.border}`, outline: 'none',
                              fontFamily: "'DM Mono',monospace", fontSize: 12, fontWeight: 700,
                              color: tm.fg, background: tm.bg,
                            }}
                          />
                        ) : (
                          <div
                            onClick={() => setEditingTime({ rowId: row.id, field: 'end' })}
                            style={{
                              fontSize: isBreak ? 13 : 12, fontFamily: "'DM Mono',monospace",
                              color: isBreak ? tm.fg : '#374151', fontWeight: 700,
                              padding: '4px 7px', cursor: 'text', borderRadius: 5,
                              display: 'flex', alignItems: 'center', gap: 3,
                            }}
                            title="Click to edit end time"
                          >
                            {fmt12(end, use12h)}
                            <span style={{ fontSize: 8, color: '#C4B5FD', opacity: 0.7 }}>✎</span>
                          </div>
                        )}
                        <NumInput className="b-dur" value={row.duration} min={5} max={240}
                          onChange={d => updateRow(row.id, { duration: d })}
                          style={row.type === 'teaching' && row.duration !== activePeriodDur
                            ? { border: '1.5px solid #7C6FE0', color: '#7C3AED', fontWeight: 700 }
                            : undefined}
                        />
                        <select
                          value={row.type}
                          onChange={e => updateRow(row.id, { type: e.target.value as RowType })}
                          style={{
                            padding: isBreak ? '4px 10px' : '3px 10px',
                            borderRadius: 20,
                            background: tm.bg, color: tm.fg,
                            border: `1.5px solid ${tm.border}`,
                            fontSize: isBreak ? 12 : 11,
                            fontWeight: 700, whiteSpace: 'nowrap',
                            boxShadow: isBreak ? `0 0 0 2px ${tm.bg}` : 'none',
                            cursor: 'pointer', fontFamily: 'inherit', outline: 'none',
                            appearance: 'none', WebkitAppearance: 'none',
                          }}
                        >
                          {(Object.keys(TYPE_META) as RowType[]).map(t => (
                            <option key={t} value={t}>{TYPE_META[t].label}</option>
                          ))}
                        </select>
                        <ClassPicker classes={row.classes} onChange={cls => updateRow(row.id, { classes: cls })}
                          rowId={row.id} openId={openPicker} setOpenId={setOpenPicker}
                          classEntries={activeClasses} allClassKeys={cwClassKeys} classGroups={activeClassGroups} streamDefs={customStreams} classStreamMap={classStreamMap} />
                        <button className="b-del" onClick={() => deleteRow(row.id)} style={{
                          background: 'none', border: 'none', cursor: 'pointer', color: '#FCA5A5',
                          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 3, opacity: 0,
                        }}>
                          <Trash2 size={13} />
                        </button>
                      </div>
                      {i < displayRows.length - 1 && (
                        <GapRow afterIndex={i} rows={displayRows}
                          onInsertBreak={insertBreak}
                          onInsertPeriod={insertPeriodAt}
                          onInsertSplit={insertSplitPeriods}
                          onInsertStaggered={insertStaggeredBreak}
                          allClassKeys={activeClassKeys}
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
                  const count = displayRows.filter(r => r.type === 'teaching').length
                  const nr    = { ...mkPeriod(count + 1, periodDur), id: makeId(), classes: [...activeClassKeys] }
                  setDisplayRows(prev => { const n = [...prev]; const di = n.findIndex(r => r.type === 'dispersal'); n.splice(di >= 0 ? di : n.length, 0, nr); return n })
                }} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '6px 14px', borderRadius: 7, border: '1px solid #E5E7EB', background: '#fff', fontSize: 12, fontWeight: 600, color: '#374151', cursor: 'pointer', fontFamily: 'inherit' }}>
                  <Plus size={12} /> Add period
                </button>
                <button
                  title="Wipes custom row durations and rebuilds with the default period duration"
                  onClick={() => setDisplayRows(buildRows(maxPeriods, periodDur).map(r => ({ ...r, classes: [...activeClassKeys] })))}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '6px 14px', borderRadius: 7, border: '1px solid #E5E7EB', background: '#fff', fontSize: 12, fontWeight: 600, color: '#6B7280', cursor: 'pointer', fontFamily: 'inherit' }}>
                  Reset to default
                </button>
              </div>
            </div>
          </div>
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
                const grp = activeClassKeys.every(k => row.classes.includes(k)) ? 'All'
                  : row.classes.length === 0 ? '—'
                  : row.classes.length <= 4 ? row.classes.map(k => activeClasses.find(c => c.key === k)?.short ?? k).join(', ')
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

      {/* ── Confirmation dialog ── */}
      {confirmDialog && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(19,17,30,0.45)',
          zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center',
          padding: 24,
        }} onClick={e => { if (e.target === e.currentTarget) setConfirmDialog(null) }}>
          <div style={{
            background: '#fff', borderRadius: 14, padding: '26px 28px',
            maxWidth: 420, width: '100%',
            boxShadow: '0 24px 64px rgba(0,0,0,0.22)',
            fontFamily: "'Inter', -apple-system, sans-serif",
          }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: 16 }}>
              <div style={{ width: 36, height: 36, borderRadius: 10, background: '#FEF3C7', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <AlertTriangle size={18} color="#D97706" />
              </div>
              <div>
                <div style={{ fontSize: 14, fontWeight: 700, color: '#13111E', marginBottom: 6 }}>
                  Are you sure?
                </div>
                <div style={{ fontSize: 13, color: '#6B7280', lineHeight: 1.55 }}>
                  {confirmDialog.msg}
                </div>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button onClick={() => setConfirmDialog(null)}
                style={{ padding: '8px 18px', borderRadius: 8, border: '1px solid #E5E7EB', background: '#fff', fontSize: 13, fontWeight: 600, color: '#374151', cursor: 'pointer', fontFamily: 'inherit' }}>
                Cancel
              </button>
              <button onClick={() => { confirmDialog.onConfirm(); setConfirmDialog(null) }}
                style={{ padding: '8px 18px', borderRadius: 8, border: 'none', background: '#EF4444', color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
                Yes, proceed
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Footer nav */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 24, paddingTop: 16, borderTop: '1px solid #E5E7EB' }}>
        <button className="b-nav-sec" onClick={() => setStep(1)} style={{ display: 'inline-flex', alignItems: 'center', gap: 7, padding: '9px 18px', borderRadius: 8, border: '1px solid #E5E7EB', background: '#fff', fontSize: 13, fontWeight: 600, color: '#374151', cursor: 'pointer', fontFamily: 'inherit' }}>
          <ChevronLeft size={14} /> Resources
        </button>
        <span style={{ fontSize: 13, color: '#9CA3AF' }}>Step 2 of 5</span>
        <button className="b-nav-pri" onClick={handleNext} disabled={workDays.length === 0} style={{ display: 'inline-flex', alignItems: 'center', gap: 7, padding: '9px 20px', borderRadius: 8, border: 'none', background: workDays.length > 0 ? '#13111E' : '#E5E7EB', color: workDays.length > 0 ? '#fff' : '#9CA3AF', fontSize: 13, fontWeight: 700, cursor: workDays.length > 0 ? 'pointer' : 'not-allowed', fontFamily: 'inherit' }}>
          Save & Continue <ChevronRight size={14} />
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
