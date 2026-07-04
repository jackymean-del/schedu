/**
 * Calendar — scheduling operations console.
 *
 * Day view: a clean time-axis grid (entity rows × wall-clock columns) with
 * colored session cells, a live current-time cursor, and Faculty / Classes /
 * Rooms perspectives. Month view: a planning grid with the events you add.
 *
 * Phase 1 of the premium calendar: foundation + Add Event. Leave/Substitution
 * and Auto-Assign layer on top of this in later phases.
 */
import { useState, useMemo, useEffect, useRef } from 'react'
import { useTimetableStore } from '@/store/timetableStore'
import { useAuthStore } from '@/store/authStore'
import {
  loadActiveTimetableIntoStore, saveActiveTimetableSnapshot,
  listTimetables, getActiveTimetableId, switchActiveTimetable,
} from '@/lib/ttRegistry'
import { type CalLeave, LEAVE_KEY, loadLeaves, isOnLeaveOn } from '@/lib/leaveUtils'
import {
  type SubstitutionSettings, type MatchTier, DEFAULT_SUBSTITUTION_SETTINGS,
  overrideFor, effectiveMaxPerDay, effectiveMaxPerWeek, scoreCandidate,
} from '@/lib/substitutionSettings'
import { SubstitutionSettingsModal } from '@/components/calendar/SubstitutionSettingsModal'
import {
  ChevronLeft, ChevronRight, ChevronRight as Caret,
  Plus, Settings, Share2, Search, GraduationCap, Users, Building2,
  X, CalendarDays, Clock, UserMinus, Repeat, Zap, Check, ArrowLeft, Sun, Sunrise, BookOpen,
} from 'lucide-react'
import { subjectColor, type SubjectColor } from '@/lib/subjectColors'
import { loadTerms, plural, type Terms } from '@/lib/terms'
import {
  loadAssignments, saveAssignments, assignmentAt, TASK_PRESETS,
  type FreeAssignment, type AssignKind,
} from '@/lib/freeAssignments'
import { loadActiveBundles, patchBundleSubstitutions, type ScheduleBundle } from '@/lib/activeSchedules'
import { sectionPeriodTimes, schedulePeriodTimes } from '@/lib/bellTimes'

// ── constants ──────────────────────────────────────────────────
const DOW    = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const DOW_FULL = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December']
const DAY_KEY = ['SUNDAY','MONDAY','TUESDAY','WEDNESDAY','THURSDAY','FRIDAY','SATURDAY']

// Colour encodes SUBJECT only (see lib/subjectColors): one deterministic
// colour per subject everywhere; teachers/venues are identified by text.

const EVENT_TYPES = [
  { key: 'meeting',  label: 'Meeting',  color: '#2563EB' },
  { key: 'exam',     label: 'Exam',     color: '#DC2626' },
  { key: 'activity', label: 'Activity', color: '#059669' },
  { key: 'holiday',  label: 'Holiday',  color: '#D97706' },
  { key: 'lesson',   label: 'Lesson',   color: '#7C3AED' },
  { key: 'other',    label: 'Other',    color: '#475569' },
] as const

// ── timeline geometry ──────────────────────────────────────────
// Generous scale + gap keep cells readable at a glance — a period's subject
// name should never need truncation, just a two-line wrap at worst.
const ENTITY_W   = 196   // left entity column width (px)
const PX_PER_MIN = 3.05  // horizontal scale
const ROW_H      = 122   // entity row height — fits title + teacher + venue + time lines
const RULER_H    = 54    // time-ruler header height
const CELL_GAP   = 9

type Mode = 'class' | 'teacher' | 'room' | 'subject'
type View = 'live' | 'day' | 'month'

interface CalEvent {
  id: string; title: string; description?: string; type: string
  date: string; start?: string; end?: string
}
interface SubCandidate {
  name: string; staffId: string; tier: MatchTier
  todayReg: number; todaySub: number; weekLoad: number; streak: number; score: number
}
const LEAVE_TYPES = ['Sick Leave', 'Casual Leave', 'Official Duty', 'Training', 'Personal', 'Other']
const DURATIONS = [
  { key: 'full' as const, label: 'Full Day', icon: Sun },
  { key: 'half' as const, label: 'Half Day', icon: Sunrise },
  { key: 'long' as const, label: 'Long Duration', icon: CalendarDays },
]
interface Block {
  key: string
  title: string          // primary line — the CLASS in faculty/venue lenses, the subject in class lens
  chip?: string          // subject shown as a coloured chip when it isn't the title
  line2: string; room: string
  startMin: number; endMin: number
  color: SubjectColor    // always derived from the subject
  sub?: string           // substitute teacher name when this period is covered
  task?: boolean         // a free-slot assignment, not a timetable lesson
}

// Amber identity for task blocks — visually distinct from any subject colour.
const TASK_COLOR: SubjectColor = { accent: '#B45309', bg: '#B453091A' }

/** Overlap layout: assign each block a lane so simultaneous blocks (common in
 *  the Subject lens, where many classes run the same subject at once) stack
 *  vertically instead of painting over each other. Greedy interval colouring. */
function assignLanes(blocks: Block[]): { placed: { b: Block; lane: number }[]; laneCount: number } {
  const laneEnds: number[] = []
  const placed = [...blocks]
    .sort((a, b) => a.startMin - b.startMin || a.endMin - b.endMin)
    .map(b => {
      let lane = laneEnds.findIndex(end => end <= b.startMin)
      if (lane === -1) { lane = laneEnds.length; laneEnds.push(b.endMin) }
      else laneEnds[lane] = b.endMin
      return { b, lane }
    })
  return { placed, laneCount: Math.max(1, laneEnds.length) }
}
const LANE_H = 66   // per-lane height when a row has stacked lanes

const EVENTS_KEY = 'schedu-cal-events'

function fmtClock(min: number, h24: boolean): string {
  const h = Math.floor(min / 60), m = min % 60
  if (h24) return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`
  const ap = h >= 12 ? 'PM' : 'AM', h12 = h % 12 || 12
  return `${h12}:${String(m).padStart(2,'0')} ${ap}`
}
function toISODate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
}

export function CalendarPage() {
  const store = useTimetableStore() as any
  const uid = useAuthStore.getState().user?.id ?? ''

  useEffect(() => { loadActiveTimetableIntoStore() }, [])

  // ── selection state ──
  const [date, setDate] = useState(() => new Date())
  const [view, setView] = useState<View>('live')
  // Scrubbed moment for the Live view (minutes since midnight); null = follow now.
  const [scrub, setScrub] = useState<number | null>(null)
  const [mode, setMode] = useState<Mode>('class')
  const [query, setQuery] = useState('')

  // ── live clock (drives the current-time cursor) ──
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 30_000)
    return () => clearInterval(t)
  }, [])

  // ── events ──
  const [events, setEvents] = useState<CalEvent[]>(() => {
    try { return JSON.parse(localStorage.getItem(`${EVENTS_KEY}:${uid}`) || '[]') } catch { return [] }
  })
  const saveEvents = (next: CalEvent[]) => {
    setEvents(next)
    try { localStorage.setItem(`${EVENTS_KEY}:${uid}`, JSON.stringify(next)) } catch { /* quota */ }
  }
  const [addOpen, setAddOpen] = useState(false)

  // ── institution naming (admin-set in Settings; live-updates on save) ──
  const [terms, setTerms] = useState<Terms>(() => loadTerms(uid))
  useEffect(() => {
    const h = () => setTerms(loadTerms(uid))
    window.addEventListener('schedu-terms-changed', h)
    return () => window.removeEventListener('schedu-terms-changed', h)
  }, [uid])

  // ── free-slot assignments (tasks for idle teachers / venues / classes) ──
  const [assignments, setAssignments] = useState<FreeAssignment[]>(() => loadAssignments(uid))
  const updateAssignments = (next: FreeAssignment[]) => { setAssignments(next); saveAssignments(uid, next) }
  const [taskFor, setTaskFor] = useState<{ kind: AssignKind; entity: string; periodId: string; periodName: string } | null>(null)

  // ── schedule switcher ──
  const schedules = listTimetables()
  const activeScheduleId = getActiveTimetableId()

  // ── store-derived schedule data ──
  const sections: any[] = store.sections ?? []
  const staff: any[]    = store.staff ?? []
  const rooms: any[]    = store.rooms ?? []
  const subjects: any[] = store.subjects ?? store.legacySubjects ?? []
  const periods: any[]  = store.periods ?? []
  const classTT         = store.classTT ?? {}
  const config          = store.config ?? {}
  const h24             = (config.timeFormat ?? '12h') === '24h'

  const hasTimetable = sections.length > 0 && Object.keys(classTT).length > 0
  const dayKey = DAY_KEY[date.getDay()]
  const workDays: string[] = config.workDays?.length
    ? config.workDays : ['MONDAY','TUESDAY','WEDNESDAY','THURSDAY','FRIDAY']
  const isWorkDay = workDays.includes(dayKey)

  // Period → wall-clock minutes. Ground truth is config.bellSchedules (assembly,
  // lunch and dispersal included) so the calendar clock matches the timetable
  // views; falls back to a cumulative sum for schedules without bell rows.
  const periodTimes = useMemo(() => {
    const map: Record<string, { startMin: number; endMin: number; type: string }> = {}
    schedulePeriodTimes(config, periods, sections).forEach((t, pid) => { map[pid] = t })
    return map
  }, [periods, sections, config])

  const dayStart = periods.length ? periodTimes[periods[0].id]?.startMin ?? 540 : 540
  const dayEnd   = periods.length ? periodTimes[periods[periods.length-1].id]?.endMin ?? 900 : 900
  const span     = Math.max(60, dayEnd - dayStart)
  const trackW   = span * PX_PER_MIN

  // Hour ticks across the ruler.
  const ticks = useMemo(() => {
    const out: number[] = []
    const first = Math.ceil(dayStart / 60) * 60
    for (let t = first; t <= dayEnd; t += 60) out.push(t)
    return out
  }, [dayStart, dayEnd])

  // ── rows for the active perspective ──
  const substitutions: Record<string, string> = store.substitutions ?? {}

  // ── Multi-active aggregation for the Day grid & Month ──────────────
  // When several schedules are active, the grid shows their UNION. Each
  // schedule keeps its own bell, so cells resolve to wall-clock minutes per
  // their own grid and merge on the time axis. The OPEN schedule always uses
  // the live store (unsaved edits included); other actives read their snapshot.
  // Live/scrubber stay on the open schedule (a later slice), with a banner.
  // Source of truth for "how many schedules are active" is the bundles we can
  // actually load (robust across mock/Clerk key namespacing), not the switcher
  // list. Re-reads when the open schedule changes.
  // Bumped after we write a substitution into another schedule's snapshot, so
  // the aggregated bundles (and every derived view) re-read that fresh map.
  const [subNonce, setSubNonce] = useState(0)
  const rawBundles = useMemo(() => loadActiveBundles(uid), [uid, activeScheduleId, subNonce])
  const activeCount = rawBundles.length
  const multiActive = activeCount > 1
  const openId = activeScheduleId ?? 'open'
  const sources = useMemo<ScheduleBundle[]>(() => {
    const open: ScheduleBundle = {
      id: activeScheduleId ?? 'open', name: config.timetableName ?? 'Schedule',
      sections, staff, rooms, subjects, periods, config, classTT, substitutions,
    }
    if (!multiActive) return [open]
    // The open schedule uses the live store; other actives use their snapshot.
    return rawBundles.map(b => b.id === activeScheduleId ? open : b)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [multiActive, rawBundles, activeScheduleId, sections, staff, rooms, subjects, periods, classTT, substitutions, config.startTime])

  const bundleById = (sid: string): ScheduleBundle => sources.find(b => b.id === sid) ?? sources[0]
  // Substitute pool spans every active schedule's staff (deduped by name) — a
  // free teacher in any active timetable can cover, subject to their caps.
  const staffPool = useMemo(() => {
    if (!multiActive) return staff
    const seen = new Set<string>(); const out: any[] = []
    for (const b of sources) for (const st of b.staff) if (!seen.has(st.name)) { seen.add(st.name); out.push(st) }
    return out
  }, [multiActive, sources, staff])

  // Flat list of every scheduled cell for the selected weekday, across sources,
  // each carrying its own wall-clock start/end and any substitution.
  interface DayCell { sid: string; sname: string; section: string; periodId: string; subject: string; teacher: string; room: string; startMin: number; endMin: number; sub?: string }
  const gridData = useMemo(() => {
    const cells: DayCell[] = []
    const timeById: Record<string, { startMin: number; endMin: number }> = {}
    let lo = Infinity, hi = -Infinity
    const workUnion = new Set<string>()
    for (const b of sources) {
      const wd: string[] = b.config?.workDays?.length ? b.config.workDays : ['MONDAY','TUESDAY','WEDNESDAY','THURSDAY','FRIDAY']
      wd.forEach(d => workUnion.add(d))
      // Each section resolves to its own bell (early dispersal / class-wise
      // breaks give different groups different clocks), so times are per section.
      for (const s of b.sections) {
        const times = sectionPeriodTimes(s.name, b.config, b.periods)
        for (const p of b.periods) {
          const t = times.get(p.id)
          if (!t) continue
          timeById[p.id] = t; lo = Math.min(lo, t.startMin); hi = Math.max(hi, t.endMin)
          const c = b.classTT[s.name]?.[dayKey]?.[p.id]
          if (!c?.subject) continue
          const sub = b.substitutions[`${s.name}|${dayKey}|${p.id}`]
          cells.push({ sid: b.id, sname: b.name, section: s.name, periodId: p.id, subject: c.subject, teacher: c.teacher ?? '', room: (c.room ?? '').trim(), startMin: t.startMin, endMin: t.endMin, sub: sub || undefined })
        }
      }
    }
    if (!isFinite(lo)) { lo = 540; hi = 900 }
    return { cells, timeById, gridStart: lo, gridEnd: hi, isWorkDay: workUnion.has(dayKey) }
  }, [sources, dayKey])

  const gridStart = gridData.gridStart
  const gridEnd   = gridData.gridEnd
  const gridSpan  = Math.max(60, gridEnd - gridStart)
  const gridTrackW = gridSpan * PX_PER_MIN
  const gridTicks = useMemo(() => {
    const out: number[] = []; for (let t = Math.ceil(gridStart / 60) * 60; t <= gridEnd; t += 60) out.push(t); return out
  }, [gridStart, gridEnd])
  const gridWorkDay = gridData.isWorkDay

  // ── Leave & substitution ──
  const [leaves, setLeaves] = useState<CalLeave[]>(() => loadLeaves(uid))
  const saveLeaves = (next: CalLeave[]) => {
    setLeaves(next)
    try { localStorage.setItem(`${LEAVE_KEY}:${uid}`, JSON.stringify(next)) } catch { /* quota */ }
  }
  const [leaveFor, setLeaveFor] = useState<string | null>(null)   // teacher → Mark Leave modal
  const [subFor, setSubFor]     = useState<string | null>(null)   // teacher → Substitute panel
  const [settingsOpen, setSettingsOpen] = useState(false)

  const substitutionSettings: SubstitutionSettings = store.substitutionSettings ?? DEFAULT_SUBSTITUTION_SETTINGS
  const updateSettings = (next: SubstitutionSettings) => {
    store.setSubstitutionSettings(next)
    saveActiveTimetableSnapshot()
  }
  const isoDate = toISODate(date)
  const onLeave = (teacher: string) => isOnLeaveOn(leaves, teacher, isoDate)

  // Periods the given teacher covers on the selected day — across EVERY active
  // schedule, each slot tagged with the schedule (sid) that owns it so cover is
  // written back to the right timetable. Single-active spans only the open one.
  const slotsOf = (teacher: string) => {
    const slots: { sid: string; sname: string; section: string; periodId: string; periodName: string; subject: string; startMin: number }[] = []
    for (const b of sources) {
      const times = bundleWallTimes(b)
      for (const s of b.sections) {
        const sd = b.classTT[s.name]?.[dayKey] ?? {}
        for (const p of b.periods) {
          const c = sd[p.id]
          if (c?.subject && c.teacher === teacher) {
            slots.push({ sid: b.id, sname: b.name, section: s.name, periodId: p.id, periodName: p.name ?? p.id, subject: c.subject, startMin: times[p.id]?.s ?? 0 })
          }
        }
      }
    }
    return slots.sort((a, b) => a.startMin - b.startMin)
  }

  // Teaching load for a teacher on a given day (regular vs. covering as sub).
  // A teacher's true load counts EVERY active schedule they appear in, so
  // fairness (and the caps below) reflect their whole day, not one schedule.
  const loadOn = (teacher: string, day: string) => {
    let reg = 0, sub = 0
    for (const b of sources) {
      for (const s of b.sections) {
        const sd = b.classTT[s.name]?.[day] ?? {}
        for (const p of b.periods) {
          const c = sd[p.id]
          if (!c?.subject) continue
          const covered = b.substitutions[`${s.name}|${day}|${p.id}`]
          if (covered) { if (covered === teacher) sub++ }
          else if (c.teacher === teacher) reg++
        }
      }
    }
    return { reg, sub }
  }

  // Wall-clock busy check ACROSS other active schedules — a candidate free in
  // the open schedule may be teaching in another at the same clock time (their
  // bells differ), which would be a real double-booking.
  const bundleWallTimes = (b: ScheduleBundle) => {
    const m: Record<string, { s: number; e: number }> = {}
    schedulePeriodTimes(b.config, b.periods, b.sections).forEach((t, pid) => { m[pid] = { s: t.startMin, e: t.endMin } })
    return m
  }
  // Is `name` already teaching (or subbing) at this wall-clock interval in any
  // active schedule OTHER than `exceptId` (the schedule owning the slot being
  // covered)? Single-active has no other schedules, so always false.
  const busyIn = (name: string, startMin: number, endMin: number, exceptId: string): boolean => {
    if (!multiActive) return false
    for (const b of sources) {
      if (b.id === exceptId) continue
      const times = bundleWallTimes(b)
      for (const s of b.sections) {
        const sd = b.classTT[s.name]?.[dayKey] ?? {}
        for (const pid of Object.keys(sd)) {
          const c = sd[pid]
          if (!c?.subject) continue
          const eff = b.substitutions[`${s.name}|${dayKey}|${pid}`] || c.teacher
          if (eff !== name) continue
          const t = times[pid]
          if (t && t.s < endMin && startMin < t.e) return true
        }
      }
    }
    return false
  }

  // Familiarity from the WEEK's schedule, evaluated against the bundle that owns
  // the lesson (so covering a Class VI–X lesson scores on that timetable, not
  // the open one). Week days come from that bundle's own config.
  const bundleWorkDays = (b: ScheduleBundle): string[] =>
    b.config?.workDays?.length ? b.config.workDays : ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY']
  const matchTierIn = (b: ScheduleBundle, name: string, section: string, subject: string): MatchTier => {
    const wd = bundleWorkDays(b)
    const inSection = (pred: (c: any) => boolean) =>
      wd.some(d => Object.values(b.classTT[section]?.[d] ?? {}).some(pred))
    if (inSection((c: any) => c?.subject === subject && c?.teacher === name)) return 'exact'
    if (inSection((c: any) => c?.teacher === name)) return 'class'
    if (b.sections.some((s: any) => wd.some(d =>
      Object.values(b.classTT[s.name]?.[d] ?? {}).some((c: any) => c?.subject === subject && c?.teacher === name)))) return 'subject'
    return 'none'
  }

  // Ranked substitute candidates for one slot: eligible (can-sub, under daily/
  // weekly sub caps and daily period cap), scored by the configured priorities.
  const candidatesFor = (sid: string, section: string, periodId: string, subject: string, absent: string): SubCandidate[] => {
    const tb = bundleById(sid)
    const tbClassPeriods = tb.periods.filter((p: any) => p.type !== 'break')
    // Who is already occupied in THIS slot within the owning schedule.
    const busy = new Set<string>()
    for (const s of tb.sections) {
      const c = tb.classTT[s.name]?.[dayKey]?.[periodId]
      if (c?.teacher && c.teacher !== absent) busy.add(c.teacher)
    }
    Object.entries(tb.substitutions).forEach(([k, v]) => {
      const [, d, pid] = k.split('|'); if (d === dayKey && pid === periodId) busy.add(v)
    })
    const pIdx = tbClassPeriods.findIndex((p: any) => p.id === periodId)
    // Wall-clock interval of the slot being covered (owning schedule's bell).
    const wt = bundleWallTimes(tb)[periodId]

    return staffPool
      .filter((st: any) => st.name !== absent && !busy.has(st.name))
      // Not teaching in any OTHER active schedule at this wall-clock time.
      .filter((st: any) => !wt || !busyIn(st.name, wt.s, wt.e, sid))
      .filter((st: any) => {
        const ov = overrideFor(substitutionSettings, st.id)
        if (!ov.canSub) return false
        const today = loadOn(st.name, dayKey)
        if (today.reg + today.sub >= substitutionSettings.defaults.maxPeriodsPerDay) return false
        if (today.sub >= effectiveMaxPerDay(substitutionSettings, st.id)) return false
        const weekSubs = workDays.reduce((a, d) => a + loadOn(st.name, d).sub, 0)
        if (weekSubs >= effectiveMaxPerWeek(substitutionSettings, st.id)) return false
        return true
      })
      .map((st: any): SubCandidate => {
        const tier = matchTierIn(tb, st.name, section, subject)
        const today = loadOn(st.name, dayKey)
        const weekLoad = workDays.reduce((a, d) => { const l = loadOn(st.name, d); return a + l.reg + l.sub }, 0)
        const weekSubs = workDays.reduce((a, d) => a + loadOn(st.name, d).sub, 0)
        // consecutive run this assignment would create (neighbours already taught)
        let streak = 1
        for (let i = pIdx - 1; i >= 0; i--) { if (teachesAt(st.name, tbClassPeriods[i]?.id)) streak++; else break }
        for (let i = pIdx + 1; i < tbClassPeriods.length; i++) { if (teachesAt(st.name, tbClassPeriods[i]?.id)) streak++; else break }
        const score = scoreCandidate(substitutionSettings.weights, {
          tier, todayLoad: today.reg + today.sub, weekLoad, todaySubs: today.sub, weekSubs,
        })
        return { name: st.name, staffId: st.id, tier, todayReg: today.reg, todaySub: today.sub, weekLoad, streak, score }
      })
      .sort((a, b) => substitutionSettings.defaults.autoSuggestionsEnabled ? b.score - a.score : a.name.localeCompare(b.name))
    // Streak is measured within the owning schedule's own consecutive periods.
    function teachesAt(name: string, pid?: string): boolean {
      if (!pid) return false
      return tb.sections.some((s: any) => {
        const c = tb.classTT[s.name]?.[dayKey]?.[pid]
        const cov = tb.substitutions[`${s.name}|${dayKey}|${pid}`]
        return cov ? cov === name : c?.teacher === name
      })
    }
  }

  // Persist a schedule's substitution map to wherever it lives: the open one
  // through the store (+ snapshot), any other active schedule straight into its
  // snapshot (then re-read so the aggregated views update).
  const writeSubs = (sid: string, next: Record<string, string>) => {
    if (sid === openId) { store.setSubstitutions(next); saveActiveTimetableSnapshot() }
    else { patchBundleSubstitutions(uid, sid, next); setSubNonce(n => n + 1) }
  }
  const assignSub = (sid: string, section: string, periodId: string, subName: string) => {
    writeSubs(sid, { ...bundleById(sid).substitutions, [`${section}|${dayKey}|${periodId}`]: subName })
  }
  const clearSub = (sid: string, section: string, periodId: string) => {
    const next = { ...bundleById(sid).substitutions }; delete next[`${section}|${dayKey}|${periodId}`]
    writeSubs(sid, next)
  }
  // Auto-assign the best candidate to every uncovered slot of the absent
  // teacher — only among faculty flagged Auto (not Manual) in Faculty Settings.
  // Slots can span several schedules, so writes are batched per owning schedule.
  const autoAssign = (teacher: string) => {
    const bySid: Record<string, Record<string, string>> = {}
    const usedAtClock: Record<string, Set<string>> = {}   // startMin → names taken, blocks overlap double-book
    for (const slot of slotsOf(teacher)) {
      const map = (bySid[slot.sid] ??= { ...bundleById(slot.sid).substitutions })
      const key = `${slot.section}|${dayKey}|${slot.periodId}`
      if (map[key]) continue
      const clock = String(slot.startMin)
      const cands = candidatesFor(slot.sid, slot.section, slot.periodId, slot.subject, teacher)
        .filter(c => overrideFor(substitutionSettings, c.staffId).autoAssign)
        .filter(c => !usedAtClock[clock]?.has(c.name))
      const best = cands[0]
      if (best) { map[key] = best.name; (usedAtClock[clock] ??= new Set()).add(best.name) }
    }
    for (const [sid, map] of Object.entries(bySid)) writeSubs(sid, map)
  }

  const blocksFor = (entity: string): Block[] => {
    const out: Block[] = []
    // Filter the union cell list by the active lens. Each cell already carries
    // its own wall-clock time (resolved per its schedule's bell).
    for (const c of gridData.cells) {
      const key = `${c.sid}|${c.section}|${c.periodId}`
      if (mode === 'class') {
        if (c.section !== entity) continue
        out.push(mk(key, c, c.subject, undefined, c.sub || c.teacher || '', c.room, c.subject, c.sub))
      } else if (mode === 'teacher') {
        const effective = c.sub || c.teacher
        if (effective !== entity) continue
        out.push(mk(key, c, c.section, c.subject, '', c.room, c.subject, c.sub && c.sub === entity ? c.sub : undefined))
      } else if (mode === 'room') {
        if (c.room !== entity) continue
        out.push(mk(key, c, c.section, c.subject, c.sub || c.teacher || '', '', c.subject, c.sub))
      } else {
        if (c.subject !== entity) continue
        out.push(mk(key, c, c.section, undefined, c.sub || c.teacher || '', c.room, entity, c.sub))
      }
    }
    // Free-slot assignments for this entity today render as dashed TASK blocks.
    if (mode !== 'subject') {
      const kind: AssignKind = mode === 'class' ? 'class' : mode === 'teacher' ? 'teacher' : 'room'
      for (const a of assignments) {
        if (a.date !== isoDate || a.kind !== kind || a.entity !== entity) continue
        const t = gridData.timeById[a.periodId]
        if (!t) continue
        out.push({ key: `task|${a.id}`, title: a.title, line2: a.note ?? '', room: '', startMin: t.startMin, endMin: t.endMin, color: TASK_COLOR, task: true })
      }
    }
    return out
    function mk(key: string, c: DayCell, title: string, chip: string | undefined, line2: string, room: string, subjectName: string, sub?: string): Block {
      return { key, title, chip, line2, room, startMin: c.startMin, endMin: c.endMin, color: subjectColor(subjectName), sub: sub || undefined }
    }
  }

  const entityList: { id: string; name: string }[] = useMemo(() => {
    let list: { id: string; name: string }[]
    if (mode === 'class')   list = sections.map(s => ({ id: s.name, name: s.name }))
    else if (mode === 'teacher') list = staff.map(s => ({ id: s.name, name: s.name }))
    else if (mode === 'room') {
      // Union of defined venues and any venue referenced inline in the
      // schedule, so a playground assigned on a cell still gets a row — and
      // shows as "Empty now" in Live when unoccupied.
      const names = new Set<string>()
      for (const r of rooms) {
        const n = r.actualName || r.generatedName || r.name
        if (n) names.add(n)
      }
      for (const s of sections) {
        const sd = classTT[s.name]?.[dayKey] ?? {}
        Object.values(sd).forEach((c: any) => { if (c?.room) names.add(c.room) })
      }
      list = Array.from(names).sort().map(n => ({ id: n, name: n }))
    }
    else {
      // Union of the configured subject list and whatever subject names
      // actually appear in today's schedule, so the tab is never empty even
      // if a class cell references a subject that isn't in the master list.
      const names = new Set<string>(subjects.map((s: any) => s.name).filter(Boolean))
      for (const s of sections) {
        const sd = classTT[s.name]?.[dayKey] ?? {}
        Object.values(sd).forEach((c: any) => { if (c?.subject) names.add(c.subject) })
      }
      list = Array.from(names).sort().map(n => ({ id: n, name: n }))
    }
    const q = query.trim().toLowerCase()
    return q ? list.filter(e => e.name.toLowerCase().includes(q)) : list
  }, [mode, sections, staff, rooms, subjects, classTT, dayKey, query])

  // Day-grid entity rows — the UNION across active schedules (single-active
  // reduces to the same set as entityList). Live keeps entityList (open only).
  const gridEntities = useMemo(() => {
    if (!multiActive) return entityList
    const names = new Set<string>()
    if (mode === 'class')        sources.forEach(b => b.sections.forEach((s: any) => names.add(s.name)))
    else if (mode === 'teacher') sources.forEach(b => b.staff.forEach((s: any) => names.add(s.name)))
    else if (mode === 'room') {
      sources.forEach(b => b.rooms.forEach((r: any) => { const n = r.actualName || r.generatedName || r.name; if (n) names.add(n) }))
      gridData.cells.forEach(c => { if (c.room) names.add(c.room) })
    } else {
      sources.forEach(b => b.subjects.forEach((s: any) => { if (s.name) names.add(s.name) }))
      gridData.cells.forEach(c => names.add(c.subject))
    }
    const q = query.trim().toLowerCase()
    const list = Array.from(names).sort().map(n => ({ id: n, name: n }))
    return q ? list.filter(e => e.name.toLowerCase().includes(q)) : list
  }, [multiActive, mode, sources, gridData, entityList, query])

  const colLabel = mode === 'class' ? terms.class : mode === 'teacher' ? terms.teacher : mode === 'room' ? terms.venue : terms.subject

  // Current-time cursor position (only when viewing today and within the span).
  const todayISO = toISODate(now)
  const viewingToday = toISODate(date) === todayISO
  const nowMin = now.getHours() * 60 + now.getMinutes()
  const showCursor = view === 'day' && viewingToday && nowMin >= dayStart && nowMin <= dayEnd
  const cursorLeft = (nowMin - dayStart) * PX_PER_MIN
  // Day-grid cursor is relative to the grid's own (possibly wider) span.
  const gridShowCursor = view === 'day' && viewingToday && nowMin >= gridStart && nowMin <= gridEnd
  const gridCursorLeft = (nowMin - gridStart) * PX_PER_MIN

  // Live view: the moment being inspected. null follows the clock (clamped to
  // the school day); dragging the timeline pins it to a specific minute.
  // Live scrubber spans the open schedule's day, or the union of all bells when
  // several schedules are live.
  const liveStart = multiActive ? gridStart : dayStart
  const liveEnd = multiActive ? gridEnd : dayEnd
  const clampDay = (m: number) => Math.max(liveStart, Math.min(liveEnd, m))
  const activeScrub = scrub ?? clampDay(nowMin)

  const dayEvents = events
    .filter(e => e.date === toISODate(date))
    .sort((a, b) => (a.start ?? '').localeCompare(b.start ?? ''))

  // Month view: what each weekday actually holds — session count plus the
  // distinct classes / teachers / venues / subjects in play that day.
  const statsByDay = useMemo(() => {
    const out: Record<string, { sessions: number; classes: number; teachers: number; venues: number; subjects: number }> = {}
    for (const dk of DAY_KEY) {
      let sessions = 0, anyWork = false
      const cls = new Set<string>(), tch = new Set<string>(), ven = new Set<string>(), sub = new Set<string>()
      for (const b of sources) {
        const wd: string[] = b.config?.workDays?.length ? b.config.workDays : ['MONDAY','TUESDAY','WEDNESDAY','THURSDAY','FRIDAY']
        if (!wd.includes(dk)) continue
        anyWork = true
        for (const s of b.sections) {
          const sd = b.classTT[s.name]?.[dk] ?? {}
          for (const c of Object.values(sd) as any[]) {
            if (!c?.subject) continue
            sessions++; cls.add(s.name); sub.add(c.subject)
            if (c.teacher) tch.add(c.teacher)
            if (c.room) ven.add(c.room)
          }
        }
      }
      if (anyWork) out[dk] = { sessions, classes: cls.size, teachers: tch.size, venues: ven.size, subjects: sub.size }
    }
    return out
  }, [sources])

  const shift = (d: number) => setDate(prev => { const n = new Date(prev); n.setDate(n.getDate() + d); return n })

  return (
    <div style={{ minHeight: '100vh', background: '#F6F4FD' }}>
      <style>{`
        .cal-scroll::-webkit-scrollbar { height: 9px; }
        .cal-scroll::-webkit-scrollbar-thumb { background: #D9D3F0; border-radius: 8px; }
        .cal-tab { transition: all .12s; }
        .cal-primary { transition: filter .12s, transform .05s; }
        .cal-primary:active { transform: translateY(1px); }
        .cal-entity-row:hover { background: #FAF9FE; }
        .cal-free-chip { transition: border-color .12s, color .12s, box-shadow .12s; }
        .cal-free-chip:hover { border-color: #B45309 !important; color: #B45309 !important; box-shadow: 0 2px 8px rgba(180,83,9,0.12); }
      `}</style>

      <div style={{ maxWidth: 1280, margin: '0 auto', padding: '22px 26px 60px' }}>

        {/* ── Header ─────────────────────────────────────────── */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, marginBottom: 18 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ width: 40, height: 40, borderRadius: 11, background: '#EDE9FF', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <CalendarDays size={20} color="#7C6FE0" />
            </div>
            <div>
              <h1 style={{ fontSize: 24, fontWeight: 800, color: '#13111E', margin: 0, letterSpacing: '-0.4px' }}>Calendar</h1>
              <div style={{ fontSize: 13, color: '#8B87AD', marginTop: 2 }}>
                {DOW[date.getDay()]}, {MONTHS[date.getMonth()].slice(0,3)} {date.getDate()}, {date.getFullYear()}
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
            <button
              className="cal-primary"
              onClick={() => setAddOpen(true)}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 8,
                padding: '11px 20px', borderRadius: 11, border: 'none',
                background: 'linear-gradient(135deg,#7C6FE0,#5D4FCF)', color: '#fff',
                fontSize: 14.5, fontWeight: 700, cursor: 'pointer',
                boxShadow: '0 6px 16px rgba(124,111,224,0.32)',
              }}
            >
              <Plus size={18} strokeWidth={2.6} /> Add Event
            </button>
            <button title="Substitution Settings" onClick={() => setSettingsOpen(true)} style={iconBtn}><Settings size={17} /></button>
            <button title="Share" style={iconBtn}><Share2 size={17} /></button>
          </div>
        </div>

        {/* ── Control bar ────────────────────────────────────── */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          gap: 14, flexWrap: 'wrap', marginBottom: 16,
          background: '#fff', border: '1px solid #ECE9FB', borderRadius: 14, padding: '12px 14px',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <button onClick={() => shift(-1)} style={navBtn}><ChevronLeft size={18} /></button>
            <input
              type="date"
              value={toISODate(date)}
              onChange={e => { if (e.target.value) setDate(new Date(e.target.value + 'T00:00:00')) }}
              style={{
                padding: '9px 12px', borderRadius: 10, border: '1px solid #E3DEF7',
                fontSize: 13.5, fontWeight: 600, color: '#13111E', background: '#FAF9FF',
                fontFamily: 'inherit', cursor: 'pointer',
              }}
            />
            <button onClick={() => shift(1)} style={navBtn}><ChevronRight size={18} /></button>
            <button onClick={() => setDate(new Date())} style={{ ...navBtn, width: 'auto', padding: '0 14px', fontSize: 12.5, fontWeight: 700 }}>Today</button>
            {/* Schedule switcher — schools run several schedules (drafts, terms,
                next year); switching here swaps the whole calendar in place. */}
            {schedules.length > 1 && (
              <select
                value={activeScheduleId ?? ''}
                onChange={e => {
                  const ok = switchActiveTimetable(e.target.value)
                  if (!ok) window.location.href = '/dashboard'   // no snapshot yet — pick up there
                }}
                title="Switch schedule"
                style={{
                  padding: '9px 10px', borderRadius: 10, border: '1px solid #E3DEF7',
                  fontSize: 12.5, fontWeight: 700, color: '#7C6FE0', background: '#FAF9FF',
                  fontFamily: 'inherit', cursor: 'pointer', maxWidth: 190,
                }}>
                {schedules.map(s => (
                  <option key={s.id} value={s.id}>{s.name}{s.status === 'active' ? '' : s.status === 'draft' ? ' (draft)' : ''}</option>
                ))}
              </select>
            )}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            {/* Live / Day / Month */}
            <div style={pillGroup}>
              {(['live','day','month'] as View[]).map(v => (
                <button key={v} className="cal-tab" onClick={() => { setView(v); setScrub(null) }}
                  style={pillBtn(view === v)}>
                  {v === 'live' ? '● Live' : v === 'day' ? 'Day' : 'Month'}
                </button>
              ))}
            </div>
            {/* Faculty / Classes / Subjects / Rooms */}
            <div style={pillGroup}>
              {([
                { m: 'teacher' as Mode, label: plural(terms.teacher), icon: <Users size={14} /> },
                { m: 'class'   as Mode, label: plural(terms.class),   icon: <GraduationCap size={14} /> },
                { m: 'subject' as Mode, label: plural(terms.subject), icon: <BookOpen size={14} /> },
                { m: 'room'    as Mode, label: plural(terms.venue),   icon: <Building2 size={14} /> },
              ]).map(t => (
                <button key={t.m} className="cal-tab" onClick={() => setMode(t.m)}
                  style={{ ...pillBtn(mode === t.m), display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  {t.icon}{t.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* ── Day events strip ───────────────────────────────── */}
        {view !== 'month' && dayEvents.length > 0 && (
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
            {dayEvents.map(ev => {
              const meta = EVENT_TYPES.find(t => t.key === ev.type) ?? EVENT_TYPES[5]
              return (
                <div key={ev.id} style={{
                  display: 'inline-flex', alignItems: 'center', gap: 8,
                  padding: '7px 12px', borderRadius: 10, background: '#fff',
                  border: `1px solid ${meta.color}33`, fontSize: 12.5,
                }}>
                  <span style={{ width: 8, height: 8, borderRadius: 4, background: meta.color }} />
                  <strong style={{ color: '#13111E' }}>{ev.title}</strong>
                  {ev.start && <span style={{ color: '#8B87AD' }}>{ev.start}{ev.end ? `–${ev.end}` : ''}</span>}
                  <button onClick={() => saveEvents(events.filter(e => e.id !== ev.id))}
                    title="Remove event"
                    style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#C0BBDD', display: 'inline-flex' }}>
                    <X size={13} />
                  </button>
                </div>
              )
            })}
          </div>
        )}

        {/* Multi-active banner — the grid unions every active schedule. */}
        {multiActive && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 12, padding: '8px 12px', borderRadius: 10, background: '#EEF4FF', border: '1px solid #C7D7FF', fontSize: 12.5, color: '#1E40AF' }}>
            <span style={{ fontWeight: 800 }}>🔀 {activeCount} schedules active</span>
            <span style={{ color: '#3B6FD4' }}>
              {view === 'live'
                ? '· Live follows the wall clock across every active schedule and their bells'
                : `· ${view === 'month' ? 'Month' : 'Day'} shows the combined view across all of them`}
            </span>
          </div>
        )}

        {/* ── Main ───────────────────────────────────────────── */}
        {view === 'month'
          ? <MonthGrid date={date} setDate={setDate} events={events} onAdd={() => setAddOpen(true)} statsByDay={statsByDay} />
          : !hasTimetable
          ? <EmptyState />
          : (view === 'live' ? (multiActive ? !gridWorkDay : !isWorkDay) : !gridWorkDay)
          ? <RestDay day={DOW_FULL[date.getDay()]} />
          : view === 'live'
          ? (
            <LiveBoard
              scrub={activeScrub} onScrub={setScrub} onNow={() => setScrub(null)}
              following={scrub === null} nowMin={nowMin} viewingToday={viewingToday}
              dayStart={multiActive ? gridStart : dayStart} dayEnd={multiActive ? gridEnd : dayEnd}
              periods={periods} periodTimes={periodTimes}
              classTT={classTT} dayKey={dayKey} mode={mode} colLabel={colLabel}
              entities={multiActive ? gridEntities : entityList} sections={sections} substitutions={substitutions} h24={h24}
              isoDate={isoDate} assignments={assignments}
              multiActive={multiActive} cells={gridData.cells}
              onAssignTask={(kind, entity, periodId, periodName) => setTaskFor({ kind, entity, periodId, periodName })}
              onClearTask={id => updateAssignments(assignments.filter(a => a.id !== id))}
            />
          )
          : (
            <div style={{ background: '#fff', border: '1px solid #ECE9FB', borderRadius: 16, overflow: 'hidden' }}>
              <div className="cal-scroll" style={{ overflowX: 'auto' }}>
                <div style={{ minWidth: ENTITY_W + gridTrackW }}>
                  {/* Ruler */}
                  <div style={{ display: 'flex', position: 'sticky', top: 0, zIndex: 3, background: 'linear-gradient(#FBFAFF,#F4F2FE)', borderBottom: '1px solid #ECE9FB' }}>
                    <div style={{
                      width: ENTITY_W, flexShrink: 0, height: RULER_H,
                      display: 'flex', flexDirection: 'column', justifyContent: 'center',
                      padding: '0 14px', borderRight: '1px solid #ECE9FB',
                    }}>
                      <div style={{ fontSize: 12.5, fontWeight: 800, color: '#13111E' }}>{colLabel}</div>
                      <div style={{ position: 'relative', marginTop: 3 }}>
                        <Search size={12} color="#B5B2D2" style={{ position: 'absolute', left: 4, top: '50%', transform: 'translateY(-50%)' }} />
                        <input
                          value={query} onChange={e => setQuery(e.target.value)} placeholder="Search…"
                          style={{ width: '100%', padding: '2px 4px 2px 20px', border: 'none', borderBottom: '1px solid #ECE9FB', background: 'transparent', fontSize: 11.5, outline: 'none', fontFamily: 'inherit' }}
                        />
                      </div>
                    </div>
                    <div style={{ position: 'relative', width: gridTrackW, height: RULER_H }}>
                      {gridTicks.map(t => (
                        <div key={t} style={{ position: 'absolute', left: (t - gridStart) * PX_PER_MIN, top: 0, height: '100%', borderLeft: '1px solid #ECE9FB', paddingLeft: 8, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                          <span style={{ fontSize: 12, fontWeight: 700, color: '#4B5275' }}>{fmtClock(t, h24).split(' ')[0]}</span>
                          {!h24 && <span style={{ fontSize: 9.5, fontWeight: 700, color: '#A9A4C8' }}>{fmtClock(t, h24).split(' ')[1]}</span>}
                        </div>
                      ))}
                      {gridShowCursor && <CursorHead left={gridCursorLeft} label={fmtClock(nowMin, h24)} />}
                    </div>
                  </div>

                  {/* Rows */}
                  {gridEntities.length === 0 && (
                    <div style={{ padding: '40px', textAlign: 'center', color: '#8B87AD', fontSize: 13 }}>No {colLabel.toLowerCase()} matches “{query}”.</div>
                  )}
                  {gridEntities.map(ent => {
                    const blocks = blocksFor(ent.id)
                    // Simultaneous blocks (Subject lens especially) stack into
                    // lanes; the row grows so nothing overlaps or clips.
                    const { placed, laneCount } = assignLanes(blocks)
                    const rowH = laneCount === 1 ? ROW_H : laneCount * LANE_H + 12
                    const lessons = blocks.filter(b => !b.task).length
                    return (
                      <div key={ent.id} className="cal-entity-row" style={{ display: 'flex', borderBottom: '1px solid #F2F0FB', minHeight: rowH }}>
                        <div style={{ width: ENTITY_W, flexShrink: 0, padding: '0 12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, borderRight: '1px solid #F2F0FB' }}>
                          <div style={{ minWidth: 0 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
                              <span style={{ fontSize: 13.5, fontWeight: 700, color: onLeave(ent.id) && mode === 'teacher' ? '#DC2626' : '#13111E', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{ent.name}</span>
                              {mode === 'teacher' && onLeave(ent.id) && (
                                <span style={{ fontSize: 9, fontWeight: 800, color: '#DC2626', background: '#FEE2E2', padding: '1px 5px', borderRadius: 5, flexShrink: 0 }}>LEAVE</span>
                              )}
                            </div>
                            <div style={{ fontSize: 11.5, color: '#9A95BC', marginTop: 2 }}>{lessons} {(lessons === 1 ? terms.period : plural(terms.period)).toLowerCase()}</div>
                          </div>
                          {mode === 'teacher' ? (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, flexShrink: 0 }}>
                              <button onClick={() => setLeaveFor(ent.id)} title="Mark leave"
                                style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '3px 8px', borderRadius: 6, border: 'none', cursor: 'pointer', fontSize: 10.5, fontWeight: 700, background: '#FFF1E6', color: '#EA580C' }}>
                                <UserMinus size={11} /> Leave
                              </button>
                              <button onClick={() => setSubFor(ent.id)} title="Find substitute"
                                style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '3px 8px', borderRadius: 6, border: 'none', cursor: 'pointer', fontSize: 10.5, fontWeight: 700, background: '#E8F0FF', color: '#2563EB' }}>
                                <Repeat size={11} /> Sub
                              </button>
                            </div>
                          ) : (
                            <Caret size={15} color="#CFC9EC" />
                          )}
                        </div>
                        <div style={{ position: 'relative', width: gridTrackW, height: rowH }}>
                          {/* hour gridlines */}
                          {gridTicks.map(t => (
                            <div key={t} style={{ position: 'absolute', left: (t - gridStart) * PX_PER_MIN, top: 0, height: '100%', borderLeft: '1px solid #F6F4FD' }} />
                          ))}
                          {placed.map(({ b, lane }) => (
                            <SessionCell key={b.key} b={b} dayStart={gridStart} h24={h24}
                              top={laneCount === 1 ? 6 : 6 + lane * LANE_H}
                              height={laneCount === 1 ? ROW_H - 12 : LANE_H - 6} />
                          ))}
                          {gridShowCursor && <div style={{ position: 'absolute', left: gridCursorLeft, top: 0, height: '100%', width: 1.5, background: '#EF4444', opacity: 0.55, zIndex: 2, pointerEvents: 'none' }} />}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>
          )
        }
      </div>

      {addOpen && (
        <AddEventModal
          date={toISODate(date)}
          onClose={() => setAddOpen(false)}
          onCreate={ev => { saveEvents([...events, ev]); setAddOpen(false) }}
        />
      )}

      {leaveFor && (
        <MarkLeaveModal
          teacher={leaveFor}
          date={isoDate}
          onClose={() => setLeaveFor(null)}
          onMark={(leave) => {
            saveLeaves([...leaves.filter(l => !(l.teacher === leave.teacher && l.date === leave.date)), leave])
            setLeaveFor(null)
            setSubFor(leave.teacher)   // jump straight to arranging cover
          }}
        />
      )}

      {subFor && (
        <SubstitutePanel
          teacher={subFor}
          dayLabel={DOW_FULL[date.getDay()]}
          slots={slotsOf(subFor)}
          multiActive={multiActive}
          subAt={(sid, section, periodId) => bundleById(sid).substitutions[`${section}|${dayKey}|${periodId}`]}
          candidatesFor={candidatesFor}
          onAssign={assignSub}
          onClear={clearSub}
          onAutoAssign={() => autoAssign(subFor)}
          onClose={() => setSubFor(null)}
          settings={substitutionSettings}
        />
      )}

      {settingsOpen && (
        <SubstitutionSettingsModal
          settings={substitutionSettings}
          staff={staff.map((s: any) => ({ id: s.id, name: s.name }))}
          onChange={updateSettings}
          onClose={() => setSettingsOpen(false)}
        />
      )}

      {taskFor && (() => {
        // Work history for this resource — powers the fairness note and the
        // "recent extra work" list inside the dialog.
        const history = assignments
          .filter(a => a.kind === taskFor.kind && a.entity === taskFor.entity && a.date <= isoDate)
          .sort((a, b) => b.date.localeCompare(a.date))
        const weekAgo = (() => { const d = new Date(date); d.setDate(d.getDate() - 6); return toISODate(d) })()
        const weekCount = history.filter(a => a.date >= weekAgo && a.date <= isoDate).length
        return (
          <AssignTaskModal
            target={taskFor}
            date={isoDate}
            terms={terms}
            history={history.slice(0, 5)}
            weekCount={weekCount}
            onClose={() => setTaskFor(null)}
            onAssign={a => {
              updateAssignments([
                ...assignments.filter(x => !(x.date === a.date && x.periodId === a.periodId && x.kind === a.kind && x.entity === a.entity)),
                a,
              ])
              setTaskFor(null)
            }}
          />
        )
      })()}
    </div>
  )
}

// ══════════════════════════════════════════════════════════════
//  Live view — the schedule as a scrubbable moment in time.
//  Drag the timeline to travel through the day; the board shows what
//  every class / teacher / venue is doing at that exact minute, with a
//  progress ring per session. In the Faculty and Venue lenses it also
//  surfaces who's free / what's empty right now — an original take, not a grid.
// ══════════════════════════════════════════════════════════════
interface LiveActivity {
  id: string
  title: string          // primary: class in faculty/venue lens, subject otherwise
  chip?: string          // subject chip when the primary is a class
  sub: string
  color: SubjectColor
  elapsed: number; total: number
}

function LiveBoard(props: {
  scrub: number; onScrub: (m: number) => void; onNow: () => void; following: boolean
  nowMin: number; viewingToday: boolean
  dayStart: number; dayEnd: number; periods: any[]
  periodTimes: Record<string, { startMin: number; endMin: number; type: string }>
  classTT: Record<string, any>; dayKey: string; mode: Mode; colLabel: string
  entities: { id: string; name: string }[]; sections: any[]
  substitutions: Record<string, string>; h24: boolean
  isoDate: string; assignments: FreeAssignment[]
  multiActive: boolean; cells: any[]
  onAssignTask: (kind: AssignKind, entity: string, periodId: string, periodName: string) => void
  onClearTask: (id: string) => void
}) {
  const { scrub, onScrub, onNow, following, nowMin, viewingToday, dayStart, dayEnd,
    periods, periodTimes, classTT, dayKey, mode, colLabel, entities, sections, substitutions, h24,
    isoDate, assignments, multiActive, cells, onAssignTask, onClearTask } = props

  // Free resources can be given a task; lens → assignment kind (subjects can't).
  const assignKind: AssignKind | null = mode === 'teacher' ? 'teacher' : mode === 'room' ? 'room' : mode === 'class' ? 'class' : null

  const effTeacher = (section: string, pid: string, cell: any) =>
    substitutions[`${section}|${dayKey}|${pid}`] || cell?.teacher || ''
  const effTeacherCell = (c: any) => c.sub || c.teacher || ''

  // With several schedules live, "the active period" dissolves — each bell runs
  // its own periods, so at a given wall-clock minute one group can be mid-lesson
  // while another is on break. We drive the whole board off the flat cross-
  // schedule cell list (each cell already carries its own wall-clock interval)
  // rather than a single periods array. Single-active keeps the period path.
  let active: { id: string; name?: string; type: string } | null = null
  let at: { startMin: number; endMin: number } | null = null
  let isBreak = false
  const busy: LiveActivity[] = []
  const idle: string[] = []

  if (multiActive) {
    const running = cells.filter((c: any) => scrub >= c.startMin && scrub < c.endMin)
    const beforeAfter = scrub < dayStart || scrub >= dayEnd
    if (running.length) {
      // Next transition across any live group = when this "moment" ends.
      at = { startMin: scrub, endMin: Math.min(...running.map((c: any) => c.endMin)) }
      active = { id: 'live', name: 'In session', type: 'class' }
    } else if (!beforeAfter) {
      active = { id: 'gap', name: 'Between periods', type: 'break' }; isBreak = true
    }
    if (running.length) {
      for (const ent of entities) {
        let a: { title: string; chip?: string; sub: string; seed: string } | null = null
        let cell: any = null
        if (mode === 'class') {
          cell = running.find((c: any) => c.section === ent.id)
          if (cell) a = { title: cell.subject, sub: [effTeacherCell(cell), cell.room].filter(Boolean).join(' · '), seed: cell.subject }
        } else if (mode === 'teacher') {
          cell = running.find((c: any) => effTeacherCell(c) === ent.id)
          if (cell) a = { title: cell.section, chip: cell.subject, sub: cell.room ?? '', seed: cell.subject }
        } else if (mode === 'room') {
          cell = running.find((c: any) => c.room === ent.id)
          if (cell) a = { title: cell.section, chip: cell.subject, sub: effTeacherCell(cell), seed: cell.subject }
        } else {
          const classes = running.filter((c: any) => c.subject === ent.id).map((c: any) => c.section)
          if (classes.length) { cell = running.find((c: any) => c.subject === ent.id); a = { title: ent.name, sub: `${classes.length} class${classes.length !== 1 ? 'es' : ''} · ${classes.slice(0, 3).join(', ')}${classes.length > 3 ? '…' : ''}`, seed: ent.name } }
        }
        if (a && cell) busy.push({ id: ent.id, title: a.title, chip: a.chip, sub: a.sub, color: subjectColor(a.seed), elapsed: scrub - cell.startMin, total: cell.endMin - cell.startMin })
        else idle.push(ent.name)
      }
    }
  } else {
    // The period slot containing the scrubbed minute.
    active = periods.find(p => {
      const t = periodTimes[p.id]; return t && scrub >= t.startMin && scrub < t.endMin
    }) ?? null
    at = active ? periodTimes[active.id] : null
    isBreak = active?.type === 'break'

    // Compute each entity's activity at this moment. Faculty/Venue lenses lead
    // with the CLASS (the "who/where am I with?" answer); subject rides as a chip.
    if (active && !isBreak) {
      for (const ent of entities) {
        let a: { title: string; chip?: string; sub: string; seed: string } | null = null
        if (mode === 'class') {
          const c = classTT[ent.id]?.[dayKey]?.[active.id]
          if (c?.subject) a = { title: c.subject, sub: [effTeacher(ent.id, active.id, c), c.room].filter(Boolean).join(' · '), seed: c.subject }
        } else if (mode === 'teacher') {
          for (const s of sections) {
            const c = classTT[s.name]?.[dayKey]?.[active.id]
            if (c?.subject && effTeacher(s.name, active.id, c) === ent.id) { a = { title: s.name, chip: c.subject, sub: c.room ?? '', seed: c.subject }; break }
          }
        } else if (mode === 'room') {
          for (const s of sections) {
            const c = classTT[s.name]?.[dayKey]?.[active.id]
            if (c?.subject && (c.room ?? '') === ent.id) { a = { title: s.name, chip: c.subject, sub: effTeacher(s.name, active.id, c), seed: c.subject }; break }
          }
        } else {
          const classes: string[] = []
          for (const s of sections) {
            const c = classTT[s.name]?.[dayKey]?.[active.id]
            if (c?.subject === ent.id) classes.push(s.name)
          }
          if (classes.length) a = { title: ent.name, sub: `${classes.length} class${classes.length !== 1 ? 'es' : ''} · ${classes.slice(0, 3).join(', ')}${classes.length > 3 ? '…' : ''}`, seed: ent.name }
        }
        if (a) busy.push({ id: ent.id, title: a.title, chip: a.chip, sub: a.sub, color: subjectColor(a.seed), elapsed: scrub - at!.startMin, total: at!.endMin - at!.startMin })
        else idle.push(ent.name)
      }
    }
  }

  // Free-slot task assignment keys to a single period, which has no meaning when
  // schedules overlap on different bells — so in multi-active Live the free list
  // is read-only (fairness sort still works). Schedule-tagged tasks are a later
  // slice. Single-active keeps full assignment.
  const canAssign = !!assignKind && !multiActive

  // Split idle into "on assignment" (given a task for this slot) vs truly free.
  const onTask: { entity: string; a: FreeAssignment }[] = []
  const free: string[] = []
  for (const name of idle) {
    const a = canAssign && active ? assignmentAt(assignments, isoDate, active.id, assignKind!, name) : undefined
    if (a) onTask.push({ entity: name, a })
    else free.push(name)
  }

  // Fair-pick ordering: today's total load (lessons + extra duties) per free
  // resource, lightest first by default so the fairest choice is always the
  // first chip — with a toggle to flip the order.
  const [freeSort, setFreeSort] = useState<'light' | 'heavy'>('light')
  const loadOf = (name: string): number => {
    // Multi-active load spans every schedule the resource appears in (the cell
    // list is already the union across all active schedules for the day).
    if (multiActive) {
      if (mode === 'teacher') return cells.filter((c: any) => effTeacherCell(c) === name).length
      if (mode === 'room') return cells.filter((c: any) => c.room === name).length
      if (mode === 'class') return cells.filter((c: any) => c.section === name).length
      return 0
    }
    let n = 0
    if (mode === 'teacher') {
      for (const s of sections) {
        const sd = classTT[s.name]?.[dayKey] ?? {}
        for (const pid of Object.keys(sd)) {
          const c = sd[pid]
          if (c?.subject && (substitutions[`${s.name}|${dayKey}|${pid}`] || c.teacher) === name) n++
        }
      }
    } else if (mode === 'room') {
      for (const s of sections) {
        const sd = classTT[s.name]?.[dayKey] ?? {}
        for (const pid of Object.keys(sd)) {
          const c = sd[pid]
          if (c?.subject && (c.room ?? '') === name) n++
        }
      }
    } else if (mode === 'class') {
      n = Object.values(classTT[name]?.[dayKey] ?? {}).filter((c: any) => c?.subject).length
    }
    if (assignKind) n += assignments.filter(a => a.date === isoDate && a.kind === assignKind && a.entity === name).length
    return n
  }
  const freeSorted = free
    .map(name => ({ name, load: loadOf(name) }))
    .sort((a, b) => (freeSort === 'light' ? a.load - b.load : b.load - a.load) || a.name.localeCompare(b.name))

  const idleLabel = mode === 'teacher' ? 'Free now' : mode === 'room' ? 'Empty now' : mode === 'subject' ? 'Not running' : 'No class'

  // Timeline segments: the share of sessions actually running over time. Single-
  // active reads its periods; multi-active splits the day at every schedule's
  // period boundary so overlapping bells still read as one honest density strip.
  const segments: ScrubSegment[] = multiActive
    ? (() => {
        const bounds = new Set<number>([dayStart, dayEnd])
        cells.forEach((c: any) => { bounds.add(c.startMin); bounds.add(c.endMin) })
        const pts = [...bounds].filter(m => m >= dayStart && m <= dayEnd).sort((a, b) => a - b)
        const denom = new Set(cells.map((c: any) => `${c.sid}|${c.section}`)).size || 1
        const segs: ScrubSegment[] = []
        for (let i = 0; i < pts.length - 1; i++) {
          const a = pts[i], b = pts[i + 1], mid = (a + b) / 2
          const running = cells.filter((c: any) => mid >= c.startMin && mid < c.endMin)
          const distinct = new Set(running.map((c: any) => `${c.sid}|${c.section}`)).size
          segs.push({ id: `m${a}`, name: '', startMin: a, endMin: b, isBreak: distinct === 0, teachFrac: distinct / denom })
        }
        return segs
      })()
    : periods.map((p: any) => {
        const t = periodTimes[p.id] ?? { startMin: dayStart, endMin: dayStart, type: p.type }
        const isBrk = p.type === 'break'
        let teachFrac = 0
        if (!isBrk && sections.length) {
          const teaching = sections.filter((s: any) => classTT[s.name]?.[dayKey]?.[p.id]?.subject).length
          teachFrac = teaching / sections.length
        }
        return { id: p.id, name: p.name, startMin: t.startMin, endMin: t.endMin, isBreak: isBrk, teachFrac }
      })

  return (
    <div style={{ background: '#fff', border: '1px solid #ECE9FB', borderRadius: 16, overflow: 'hidden' }}>
      {/* Moment header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 14, flexWrap: 'wrap', padding: '16px 18px 12px' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 12 }}>
          <div style={{ fontSize: 30, fontWeight: 800, color: '#13111E', letterSpacing: '-0.5px', fontVariantNumeric: 'tabular-nums' }}>{fmtClock(scrub, h24)}</div>
          <div style={{ fontSize: 13.5, color: '#6B7280' }}>
            {!active ? (scrub < dayStart ? 'Before school' : 'After school')
              : isBreak ? (active.name ?? 'Break')
              : <>{active.name ?? 'Period'} · <span style={{ color: '#16A34A', fontWeight: 700 }}>{Math.max(0, at!.endMin - scrub)} min left</span></>}
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {viewingToday && (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 700, color: following ? '#16A34A' : '#9A95BC' }}>
              <span style={{ width: 8, height: 8, borderRadius: 4, background: following ? '#16A34A' : '#CBC9DA' }} />
              {following ? 'Live' : 'Paused'}
            </span>
          )}
          <button onClick={onNow} style={{ padding: '7px 14px', borderRadius: 9, border: '1px solid #E3DEF7', background: '#fff', fontSize: 12.5, fontWeight: 700, color: '#7C6FE0', cursor: 'pointer', fontFamily: 'inherit' }}>Now</button>
        </div>
      </div>

      {/* Scrubber */}
      <div style={{ padding: '0 18px 14px' }}>
        <MomentScrubber dayStart={dayStart} dayEnd={dayEnd} value={scrub} onChange={onScrub}
          nowMin={viewingToday ? nowMin : null} segments={segments} h24={h24} />
        <div style={{ display: 'flex', gap: 14, marginTop: 6 }}>
          <ScrubLegend swatch={TEACH_BAND} label="Teaching" />
          <ScrubLegend swatch={BREAK_BAND} label="Break / free" />
        </div>
      </div>

      {/* Board */}
      <div style={{ borderTop: '1px solid #F2F0FB', padding: 18, background: '#FBFAFF' }}>
        {!active ? (
          <Idle icon="🌙" text={scrub < dayStart ? 'The school day hasn’t started yet.' : 'The school day has ended.'} />
        ) : isBreak ? (
          <Idle icon="☕" text={`${active.name ?? 'Break'} — no classes in session right now.`} />
        ) : (
          <>
            {busy.length > 0 && (
              <div style={{ marginBottom: idle.length ? 18 : 0 }}>
                <SectionLabel text={`In session · ${busy.length}`} tone="#16A34A" />
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(230px, 1fr))', gap: 10 }}>
                  {busy.map(b => <LiveCard key={b.id} entity={entities.find(e => e.id === b.id)?.name ?? b.id} a={b} />)}
                </div>
              </div>
            )}
            {onTask.length > 0 && (
              <div style={{ marginBottom: free.length ? 18 : 0 }}>
                <SectionLabel text={`On assignment · ${onTask.length}`} tone="#B45309" />
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(230px, 1fr))', gap: 10 }}>
                  {onTask.map(({ entity, a }) => (
                    <div key={entity} style={{ background: '#FFFBF3', border: '1.5px dashed #E5C078', borderRadius: 13, padding: '12px 13px', display: 'flex', gap: 10, alignItems: 'center' }}>
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div style={{ fontSize: 12, fontWeight: 700, color: '#9A95BC', marginBottom: 2 }}>{entity}</div>
                        <div style={{ fontSize: 13.5, fontWeight: 800, color: '#B45309', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>📌 {a.title}</div>
                        {a.note && <div style={{ fontSize: 11.5, color: '#6B7280', marginTop: 3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.note}</div>}
                      </div>
                      <button onClick={() => onClearTask(a.id)} title="Remove assignment"
                        style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#C9A45C', display: 'inline-flex', flexShrink: 0 }}>
                        <X size={15} />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {free.length > 0 && (
              <div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                  <SectionLabel text={`${idleLabel} · ${free.length}`} tone="#9A95BC" />
                  {/* Segmented sort — you click the order you want and the
                      selected option stays highlighted, so there's no
                      "does the label mean current state or the action?" doubt. */}
                  {assignKind && free.length > 1 && (
                    <div style={{ display: 'flex', gap: 2, padding: 2, background: '#F1EEFB', borderRadius: 8, marginBottom: 10 }}>
                      {([['light', 'Lightest first'], ['heavy', 'Heaviest first']] as const).map(([key, label]) => (
                        <button key={key} onClick={() => setFreeSort(key)}
                          style={{
                            padding: '4px 10px', borderRadius: 6, border: 'none', cursor: 'pointer',
                            fontSize: 11, fontWeight: 700, fontFamily: 'inherit',
                            background: freeSort === key ? '#fff' : 'transparent',
                            color: freeSort === key ? '#7C6FE0' : '#8B87AD',
                            boxShadow: freeSort === key ? '0 1px 4px rgba(124,111,224,0.18)' : 'none',
                          }}>
                          {label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7 }}>
                  {freeSorted.map(({ name, load }) => (
                    canAssign && active ? (
                      <button key={name}
                        onClick={() => onAssignTask(assignKind, name, active.id, active.name ?? active.id)}
                        title={`${load} on the plate today — assign a task for this slot`}
                        className="cal-free-chip"
                        style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '5px 11px', borderRadius: 8, background: '#fff', border: '1px solid #ECE9FB', fontSize: 12.5, fontWeight: 600, color: '#6B7280', cursor: 'pointer', fontFamily: 'inherit' }}>
                        {name}
                        <span style={{ fontSize: 10.5, fontWeight: 800, color: load <= 2 ? '#16A34A' : load <= 4 ? '#B45309' : '#DC2626', background: '#F6F4FD', padding: '1px 6px', borderRadius: 6 }}>{load} today</span>
                        <Plus size={12} style={{ color: '#B5B0CF' }} />
                      </button>
                    ) : (
                      <span key={name} style={{ padding: '5px 11px', borderRadius: 8, background: '#fff', border: '1px solid #ECE9FB', fontSize: 12.5, fontWeight: 600, color: '#6B7280' }}>{name}</span>
                    )
                  ))}
                </div>
              </div>
            )}
            {busy.length === 0 && idle.length === 0 && <Idle icon="📋" text={`No ${colLabel.toLowerCase()} data for this moment.`} />}
          </>
        )}
      </div>
    </div>
  )
}

function LiveCard({ entity, a }: { entity: string; a: LiveActivity }) {
  const { accent, bg } = a.color
  const pct = a.total > 0 ? Math.max(0, Math.min(1, a.elapsed / a.total)) : 0
  return (
    <div style={{ background: '#fff', border: '1px solid #ECE9FB', borderRadius: 13, padding: '12px 13px', display: 'flex', gap: 12, alignItems: 'center' }}>
      {/* progress ring */}
      <div style={{ position: 'relative', width: 40, height: 40, flexShrink: 0 }}>
        <svg width="40" height="40" viewBox="0 0 40 40" style={{ transform: 'rotate(-90deg)' }}>
          <circle cx="20" cy="20" r="16" fill="none" stroke="#F0EEFA" strokeWidth="4" />
          <circle cx="20" cy="20" r="16" fill="none" stroke={accent} strokeWidth="4" strokeLinecap="round"
            strokeDasharray={`${2 * Math.PI * 16}`} strokeDashoffset={`${2 * Math.PI * 16 * (1 - pct)}`} />
        </svg>
        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 800, color: accent }}>{Math.round(pct * 100)}%</div>
      </div>
      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: '#9A95BC', marginBottom: 2 }}>{entity}</div>
        {a.chip ? (
          <>
            <div style={{ fontSize: 14, fontWeight: 800, color: '#25213B', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.title}</div>
            <span style={{ display: 'inline-block', marginTop: 3, maxWidth: '100%', fontSize: 10.5, fontWeight: 800, color: '#fff', background: accent, padding: '1.5px 8px', borderRadius: 6, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', boxSizing: 'border-box' }}>{a.chip}</span>
          </>
        ) : (
          <div style={{ fontSize: 13.5, fontWeight: 800, color: accent, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', background: bg, display: 'inline-block', padding: '1px 8px', borderRadius: 6, maxWidth: '100%', boxSizing: 'border-box' }}>{a.title}</div>
        )}
        {a.sub && <div style={{ fontSize: 11.5, color: '#6B7280', marginTop: 3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.sub}</div>}
      </div>
    </div>
  )
}

function ScrubLegend({ swatch, label }: { swatch: string; label: string }) {
  return <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 10.5, fontWeight: 700, color: '#8B87AD' }}>
    <span style={{ width: 10, height: 10, borderRadius: 3, background: swatch, border: '1px solid rgba(19,17,30,0.08)' }} />{label}
  </span>
}

function SectionLabel({ text, tone }: { text: string; tone: string }) {
  return <div style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 11, fontWeight: 800, color: tone, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 10 }}>
    <span style={{ width: 7, height: 7, borderRadius: 4, background: tone }} />{text}
  </div>
}
function Idle({ icon, text }: { icon: string; text: string }) {
  return <div style={{ textAlign: 'center', padding: '34px 20px' }}>
    <div style={{ fontSize: 30, marginBottom: 8 }}>{icon}</div>
    <div style={{ fontSize: 13.5, color: '#6B7280', fontWeight: 600 }}>{text}</div>
  </div>
}

// One band per period on the scrubber, coloured by what the school is doing:
// violet = teaching, amber = break. A mixed moment (some classes in class,
// others on break / without a period) renders as horizontal strips whose
// heights are proportional to each share — so the timeline itself tells the
// day's story at a glance.
interface ScrubSegment { id: string; name?: string; startMin: number; endMin: number; isBreak: boolean; teachFrac: number }

const TEACH_BAND = '#B9AFF0'   // violet — darker in grayscale
const BREAK_BAND = '#F7D9A0'   // amber — clearly lighter in grayscale

// Draggable day timeline: click or drag anywhere to seek; shows activity
// bands, break shares, and a live "now" tick.
function MomentScrubber({ dayStart, dayEnd, value, onChange, nowMin, segments, h24 }: {
  dayStart: number; dayEnd: number; value: number; onChange: (m: number) => void
  nowMin: number | null; segments: ScrubSegment[]; h24: boolean
}) {
  const ref = useRef<HTMLDivElement>(null)
  const span = Math.max(1, dayEnd - dayStart)
  const pct = (m: number) => ((m - dayStart) / span) * 100
  const seek = (clientX: number) => {
    const r = ref.current?.getBoundingClientRect(); if (!r) return
    const m = dayStart + ((clientX - r.left) / r.width) * span
    onChange(Math.max(dayStart, Math.min(dayEnd, Math.round(m))))
  }
  const onDown = (e: React.PointerEvent) => {
    seek(e.clientX)
    const move = (ev: PointerEvent) => seek(ev.clientX)
    const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up) }
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', up)
  }
  const hours: number[] = []
  for (let t = Math.ceil(dayStart / 60) * 60; t <= dayEnd; t += 60) hours.push(t)

  return (
    <div>
      <div ref={ref} onPointerDown={onDown} style={{ position: 'relative', height: 46, borderRadius: 12, background: '#F4F2FE', border: '1px solid #ECE9FB', cursor: 'pointer', touchAction: 'none', userSelect: 'none' }}>
        {/* activity bands */}
        {segments.map(seg => {
          const left = pct(seg.startMin), w = pct(seg.endMin) - pct(seg.startMin)
          const teachPct = seg.isBreak ? 0 : Math.round(seg.teachFrac * 100)
          const title = seg.isBreak ? (seg.name ?? 'Break')
            : teachPct >= 100 ? (seg.name ?? 'Period')
            : `${seg.name ?? 'Period'} — ${teachPct}% of classes in session`
          return (
            <div key={seg.id} title={title} style={{
              position: 'absolute', left: `${left}%`, width: `${w}%`, top: 6, bottom: 6,
              borderRadius: 6, overflow: 'hidden', display: 'flex', flexDirection: 'column',
              border: '1px solid rgba(19,17,30,0.07)', pointerEvents: 'none',
            }}>
              {seg.isBreak
                ? <div style={{ flex: 1, background: BREAK_BAND }} />
                : (
                  <>
                    {seg.teachFrac > 0.02 && <div style={{ flex: seg.teachFrac, background: TEACH_BAND }} />}
                    {seg.teachFrac < 0.98 && <div style={{ flex: 1 - seg.teachFrac, background: BREAK_BAND }} />}
                  </>
                )}
            </div>
          )
        })}
        {/* hour gridlines */}
        {hours.map(t => (
          <div key={`hr-${t}`} style={{ position: 'absolute', left: `${pct(t)}%`, top: 0, bottom: 0, width: 1, background: 'rgba(19,17,30,0.14)', pointerEvents: 'none' }} />
        ))}
        {/* now tick */}
        {nowMin !== null && nowMin >= dayStart && nowMin <= dayEnd && (
          <div style={{ position: 'absolute', left: `${pct(nowMin)}%`, top: 0, bottom: 0, width: 2, background: '#EF4444', opacity: 0.5, pointerEvents: 'none' }} />
        )}
        {/* handle */}
        <div style={{ position: 'absolute', left: `${pct(value)}%`, top: -3, bottom: -3, width: 3, background: '#7C6FE0', borderRadius: 3, transform: 'translateX(-50%)', pointerEvents: 'none', boxShadow: '0 0 0 3px rgba(124,111,224,0.18)' }} />
        <div style={{ position: 'absolute', left: `${pct(value)}%`, top: '50%', width: 15, height: 15, background: '#7C6FE0', borderRadius: '50%', transform: 'translate(-50%,-50%)', pointerEvents: 'none', border: '2.5px solid #fff', boxShadow: '0 2px 6px rgba(124,111,224,0.4)' }} />
      </div>
      <div style={{ position: 'relative', height: 14, marginTop: 3 }}>
        {hours.map(t => (
          <span key={t} style={{ position: 'absolute', left: `${pct(t)}%`, transform: 'translateX(-50%)', fontSize: 9.5, fontWeight: 700, color: '#A9A4C8', whiteSpace: 'nowrap' }}>{fmtClock(t, h24).replace(':00', '')}</span>
        ))}
      </div>
    </div>
  )
}

// ── Session cell ───────────────────────────────────────────────
// Calm lines, never more than three: primary (class or subject, wraps to
// 2 lines), subject chip when the primary is a class, one meta line, time.
// The subject NAME is always visible as text, so grayscale prints stay legible.
// Compact lanes (stacked overlaps) drop the time line and tighten padding.
function SessionCell({ b, dayStart, h24, top, height }: {
  b: Block; dayStart: number; h24: boolean; top: number; height: number
}) {
  const left = (b.startMin - dayStart) * PX_PER_MIN + CELL_GAP / 2
  const width = Math.max(76, (b.endMin - b.startMin) * PX_PER_MIN - CELL_GAP)
  const { accent, bg } = b.color
  const compact = height < 84
  const metaLine: React.CSSProperties = { fontSize: 11, fontWeight: 600, color: '#3F3A55', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }
  return (
    <div style={{
      position: 'absolute', left, width, top, height,
      background: bg, borderRadius: compact ? 9 : 12,
      borderLeft: `3px solid ${accent}`,
      border: b.task ? `1.5px dashed ${accent}` : undefined,
      padding: compact ? '5px 9px' : '8px 11px', overflow: 'hidden', boxSizing: 'border-box',
      display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: compact ? 1 : 2,
    }}>
      {b.sub && (
        <span style={{ position: 'absolute', top: 7, right: 8, fontSize: 8.5, fontWeight: 800, letterSpacing: '0.04em', color: '#fff', background: '#2563EB', padding: '1.5px 6px', borderRadius: 5 }}>SUB</span>
      )}
      {b.task && (
        <span style={{ position: 'absolute', top: 5, right: 7, fontSize: 8.5, fontWeight: 800, letterSpacing: '0.04em', color: '#fff', background: accent, padding: '1.5px 6px', borderRadius: 5 }}>TASK</span>
      )}
      <div style={{
        fontSize: 12.5, fontWeight: 800, color: b.chip || b.task ? '#25213B' : accent, lineHeight: 1.28,
        display: '-webkit-box', WebkitLineClamp: compact ? 1 : 2, WebkitBoxOrient: 'vertical',
        overflow: 'hidden', paddingRight: b.sub || b.task ? 34 : 0,
      }}>{b.title}</div>
      {b.chip && (
        <span style={{ alignSelf: 'flex-start', maxWidth: '100%', fontSize: 10.5, fontWeight: 800, color: '#fff', background: accent, padding: '1.5px 8px', borderRadius: 6, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', boxSizing: 'border-box' }}>{b.chip}</span>
      )}
      {/* Who / where / when — one calm line each, nothing hidden behind “…”. */}
      {compact ? (
        <>{(b.line2 || b.room) && <div style={metaLine}>{[b.line2, b.room].filter(Boolean).join(' · ')}</div>}</>
      ) : (
        <>
          {b.line2 && <div style={metaLine}>{b.line2}</div>}
          {b.room && <div style={{ ...metaLine, color: '#6B6890' }}>{b.room}</div>}
          <div style={{ fontSize: 10, color: '#9A95BC' }}>{fmtClock(b.startMin, h24)} – {fmtClock(b.endMin, h24)}</div>
        </>
      )}
    </div>
  )
}

function CursorHead({ left, label }: { left: number; label: string }) {
  return (
    <div style={{ position: 'absolute', left, top: 0, height: '100%', zIndex: 4 }}>
      <div style={{ position: 'absolute', left: -1, top: 6, width: 9, height: 9, borderRadius: 5, background: '#EF4444', boxShadow: '0 0 0 3px rgba(239,68,68,0.18)' }} />
      <div style={{ position: 'absolute', left: 10, top: 1, fontSize: 10, fontWeight: 800, color: '#EF4444', whiteSpace: 'nowrap' }}>{label}</div>
    </div>
  )
}

// ── Empty / rest states ────────────────────────────────────────
function EmptyState() {
  return (
    <div style={{ background: '#fff', border: '1px solid #ECE9FB', borderRadius: 16, padding: '60px 24px', textAlign: 'center' }}>
      <div style={{ fontSize: 38, marginBottom: 12 }}>🗓️</div>
      <h3 style={{ fontSize: 17, fontWeight: 800, color: '#13111E', margin: '0 0 6px' }}>No schedule generated yet</h3>
      <p style={{ fontSize: 13.5, color: '#8B87AD', margin: '0 0 18px' }}>Complete the wizard to generate a schedule — it will appear here automatically.</p>
      <a href="/dashboard" style={{ display: 'inline-block', padding: '10px 22px', background: '#7C6FE0', color: '#fff', borderRadius: 10, fontSize: 13.5, fontWeight: 700, textDecoration: 'none' }}>Go to Dashboard</a>
    </div>
  )
}
function RestDay({ day }: { day: string }) {
  return (
    <div style={{ background: '#fff', border: '1px solid #ECE9FB', borderRadius: 16, padding: '54px 24px', textAlign: 'center' }}>
      <Clock size={30} color="#C9C3EC" />
      <h3 style={{ fontSize: 16, fontWeight: 800, color: '#13111E', margin: '12px 0 6px' }}>No classes on {day}</h3>
      <p style={{ fontSize: 13, color: '#8B87AD', margin: 0 }}>This isn’t a working day in your schedule. Add an event, or pick another date.</p>
    </div>
  )
}

// ── Month grid (planning view) ─────────────────────────────────
/** What a day-of-week actually holds in the schedule — shown on month cells. */
interface DayStats { sessions: number; classes: number; teachers: number; venues: number; subjects: number }

function MonthGrid({ date, setDate, events, onAdd, statsByDay }: {
  date: Date; setDate: (d: Date) => void; events: CalEvent[]; onAdd: () => void
  statsByDay: Record<string, DayStats>
}) {
  const y = date.getFullYear(), m = date.getMonth()
  const first = new Date(y, m, 1).getDay()
  const days = new Date(y, m + 1, 0).getDate()
  const today = new Date()
  const cells: (number | null)[] = [...Array(first).fill(null), ...Array.from({ length: days }, (_, i) => i + 1)]
  while (cells.length % 7 !== 0) cells.push(null)
  const evByDay: Record<number, CalEvent[]> = {}
  events.forEach(e => {
    const d = new Date(e.date + 'T00:00:00')
    if (d.getFullYear() === y && d.getMonth() === m) (evByDay[d.getDate()] ??= []).push(e)
  })
  return (
    <div style={{ background: '#fff', border: '1px solid #ECE9FB', borderRadius: 16, padding: 18 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 6 }}>
        {DOW.map(d => <div key={d} style={{ textAlign: 'center', fontSize: 11.5, fontWeight: 800, color: '#8B87AD', padding: '4px 0' }}>{d}</div>)}
        {cells.map((c, i) => {
          const isToday = c === today.getDate() && m === today.getMonth() && y === today.getFullYear()
          const evs = c ? (evByDay[c] ?? []) : []
          const st = c ? statsByDay[DAY_KEY[new Date(y, m, c).getDay()]] : undefined
          return (
            <div key={i}
              onClick={() => c && setDate(new Date(y, m, c))}
              onDoubleClick={() => c && onAdd()}
              style={{
                minHeight: 96, borderRadius: 10, padding: 8, cursor: c ? 'pointer' : 'default',
                background: isToday ? '#F1ECFF' : c ? '#FBFAFF' : 'transparent',
                border: isToday ? '1.5px solid #7C6FE0' : c ? '1px solid #F2F0FB' : 'none',
              }}>
              {c && (
                <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 4 }}>
                  <span style={{ fontSize: 12.5, fontWeight: isToday ? 800 : 600, color: isToday ? '#7C6FE0' : '#13111E' }}>{c}</span>
                  {st && st.sessions > 0 && (
                    <span style={{ fontSize: 10, fontWeight: 800, color: '#7C6FE0', background: '#EFEBFF', padding: '1px 7px', borderRadius: 9 }}>{st.sessions}</span>
                  )}
                </div>
              )}
              {/* Day workload — sessions badge above; classes/teachers/venues/subjects below */}
              {st && st.sessions > 0 && (
                <div style={{ fontSize: 9.5, fontWeight: 600, color: '#9A95BC', lineHeight: 1.5, marginBottom: evs.length ? 4 : 0 }}>
                  {st.classes} cls · {st.teachers} tch<br />{st.venues} ven · {st.subjects} sub
                </div>
              )}
              {evs.slice(0, 2).map(ev => {
                const meta = EVENT_TYPES.find(t => t.key === ev.type) ?? EVENT_TYPES[5]
                return <div key={ev.id} style={{ fontSize: 10.5, fontWeight: 600, color: '#fff', background: meta.color, borderRadius: 5, padding: '2px 6px', marginBottom: 3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{ev.title}</div>
              })}
              {evs.length > 2 && <div style={{ fontSize: 10, color: '#8B87AD' }}>+{evs.length - 2} more</div>}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── Add Event modal ────────────────────────────────────────────
function AddEventModal({ date, onClose, onCreate }: {
  date: string; onClose: () => void; onCreate: (e: CalEvent) => void
}) {
  const [title, setTitle] = useState('')
  const [desc, setDesc] = useState('')
  const [type, setType] = useState('other')
  const [when, setWhen] = useState(date)
  const [start, setStart] = useState('')
  const [end, setEnd] = useState('')
  const valid = title.trim().length > 0

  const create = () => {
    if (!valid) return
    onCreate({
      id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      title: title.trim(), description: desc.trim() || undefined, type,
      date: when, start: start || undefined, end: end || undefined,
    })
  }

  return (
    <div onClick={e => { if (e.target === e.currentTarget) onClose() }}
      style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(19,17,30,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div style={{ width: '100%', maxWidth: 560, background: '#fff', borderRadius: 16, overflow: 'hidden', boxShadow: '0 24px 70px rgba(0,0,0,0.28)' }}>
        {/* header */}
        <div style={{ background: 'linear-gradient(135deg,#7C6FE0,#5D4FCF)', padding: '18px 22px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: '#fff' }}>
            <CalendarDays size={20} />
            <span style={{ fontSize: 18, fontWeight: 800 }}>Add Event</span>
          </div>
          <button onClick={onClose} style={{ border: 'none', background: 'rgba(255,255,255,0.18)', color: '#fff', width: 30, height: 30, borderRadius: 8, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><X size={16} /></button>
        </div>

        <div style={{ padding: 22, maxHeight: '70vh', overflowY: 'auto' }}>
          <Field label="Event Title" required>
            <input value={title} onChange={e => setTitle(e.target.value)} placeholder="Enter event title" autoFocus style={inp} />
          </Field>
          <Field label="Description">
            <textarea value={desc} onChange={e => setDesc(e.target.value)} placeholder="Enter event description" rows={3} style={{ ...inp, resize: 'vertical' }} />
          </Field>
          <Field label="Event Type" required>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {EVENT_TYPES.map(t => (
                <button key={t.key} onClick={() => setType(t.key)}
                  style={{
                    padding: '9px 16px', borderRadius: 9, fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
                    border: type === t.key ? `1.5px solid ${t.color}` : '1.5px solid #E5E1F4',
                    background: type === t.key ? t.color : '#fff',
                    color: type === t.key ? '#fff' : '#4B5275',
                  }}>{t.label}</button>
              ))}
            </div>
          </Field>
          <Field label="Date">
            <input type="date" value={when} onChange={e => setWhen(e.target.value)} style={inp} />
          </Field>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Field label="Start time"><input type="time" value={start} onChange={e => setStart(e.target.value)} style={inp} /></Field>
            <Field label="End time"><input type="time" value={end} onChange={e => setEnd(e.target.value)} style={inp} /></Field>
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, padding: '14px 22px', borderTop: '1px solid #F1EFFA' }}>
          <button onClick={onClose} style={{ padding: '11px 22px', borderRadius: 10, border: '1.5px solid #E0DBF2', background: '#fff', fontSize: 14, fontWeight: 700, color: '#4B5275', cursor: 'pointer' }}>Cancel</button>
          <button onClick={create} disabled={!valid}
            style={{ padding: '11px 26px', borderRadius: 10, border: 'none', fontSize: 14, fontWeight: 800, cursor: valid ? 'pointer' : 'not-allowed',
              background: valid ? 'linear-gradient(135deg,#7C6FE0,#5D4FCF)' : '#D8D3EC', color: '#fff',
              boxShadow: valid ? '0 6px 16px rgba(124,111,224,0.32)' : 'none' }}>Create</button>
        </div>
      </div>
    </div>
  )
}

// ── Mark Leave modal ───────────────────────────────────────────
function MarkLeaveModal({ teacher, date, onClose, onMark }: {
  teacher: string; date: string; onClose: () => void
  onMark: (l: CalLeave) => void
}) {
  const [duration, setDuration] = useState<'full' | 'half' | 'long'>('full')
  const [when, setWhen] = useState(date)
  const [endDate, setEndDate] = useState(date)
  const [type, setType] = useState(LEAVE_TYPES[0])
  const [reason, setReason] = useState('')

  const mark = () => onMark({
    id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    teacher, date: when, duration,
    endDate: duration === 'long' ? endDate : undefined,
    type, reason: reason.trim() || undefined,
  })

  return (
    <div onClick={e => { if (e.target === e.currentTarget) onClose() }}
      style={{ position: 'fixed', inset: 0, zIndex: 1100, background: 'rgba(19,17,30,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div style={{ width: '100%', maxWidth: 560, background: '#fff', borderRadius: 16, overflow: 'hidden', boxShadow: '0 24px 70px rgba(0,0,0,0.28)' }}>
        <div style={{ padding: '18px 22px', display: 'flex', alignItems: 'center', gap: 12, borderBottom: '1px solid #F1EFFA' }}>
          <button onClick={onClose} style={{ border: 'none', background: '#F4F2FC', width: 32, height: 32, borderRadius: 9, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#6B6890' }}><ArrowLeft size={16} /></button>
          <div>
            <div style={{ fontSize: 18, fontWeight: 800, color: '#13111E' }}>Mark Leave</div>
            <div style={{ fontSize: 12.5, color: '#8B87AD' }}>{teacher}</div>
          </div>
        </div>

        <div style={{ padding: 22, maxHeight: '68vh', overflowY: 'auto' }}>
          {/* Duration */}
          <div style={{ background: '#F4F8FF', border: '1px solid #E2ECFF', borderRadius: 12, padding: 14, marginBottom: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
              <span style={{ width: 28, height: 28, borderRadius: 8, background: '#3B82F6', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}><CalendarDays size={15} color="#fff" /></span>
              <span style={{ fontSize: 14, fontWeight: 800, color: '#13111E' }}>Duration Type</span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 10 }}>
              {DURATIONS.map(d => {
                const Icon = d.icon, active = duration === d.key
                return (
                  <button key={d.key} onClick={() => setDuration(d.key)}
                    style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 7, padding: '14px 8px', borderRadius: 11, cursor: 'pointer', fontFamily: 'inherit',
                      border: active ? '1.5px solid #F0B429' : '1.5px solid #E6E2F2',
                      background: active ? '#FEF6E0' : '#fff' }}>
                    <Icon size={18} color={active ? '#D4920E' : '#9A95BC'} />
                    <span style={{ fontSize: 12.5, fontWeight: 700, color: active ? '#92610E' : '#4B5275' }}>{d.label}</span>
                  </button>
                )
              })}
            </div>
          </div>

          {/* Date */}
          <div style={{ display: 'grid', gridTemplateColumns: duration === 'long' ? '1fr 1fr' : '1fr', gap: 12, marginBottom: 16 }}>
            <Field label={duration === 'long' ? 'From date' : 'Date'}>
              <input type="date" value={when} onChange={e => setWhen(e.target.value)} style={inp} />
            </Field>
            {duration === 'long' && (
              <Field label="To date"><input type="date" value={endDate} min={when} onChange={e => setEndDate(e.target.value)} style={inp} /></Field>
            )}
          </div>

          {/* Leave type */}
          <div style={{ marginBottom: 4 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
              <label style={{ fontSize: 13, fontWeight: 700, color: '#374151' }}>Leave Type <span style={{ color: '#EF4444' }}>*</span></label>
            </div>
            <select value={type} onChange={e => setType(e.target.value)} style={{ ...inp, cursor: 'pointer' }}>
              {LEAVE_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <Field label="Reason (optional)">
            <input value={reason} onChange={e => setReason(e.target.value)} placeholder="Add a note…" style={inp} />
          </Field>
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, padding: '14px 22px', borderTop: '1px solid #F1EFFA' }}>
          <button onClick={onClose} style={{ padding: '11px 22px', borderRadius: 10, border: '1.5px solid #E0DBF2', background: '#fff', fontSize: 14, fontWeight: 700, color: '#4B5275', cursor: 'pointer' }}>Cancel</button>
          <button onClick={mark}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '11px 24px', borderRadius: 10, border: 'none', fontSize: 14, fontWeight: 800, cursor: 'pointer',
              background: 'linear-gradient(135deg,#F59E0B,#EA580C)', color: '#fff', boxShadow: '0 6px 16px rgba(234,88,12,0.3)' }}>
            <Check size={16} /> Mark Leave
          </button>
        </div>
      </div>
    </div>
  )
}

const TIER_BADGE: Record<Exclude<MatchTier, 'none'>, { label: string; color: string; bg: string }> = {
  exact:   { label: 'Exact Match',    color: '#16A34A', bg: '#DCFCE7' },
  class:   { label: 'Knows Class',    color: '#2563EB', bg: '#E8F0FF' },
  subject: { label: 'Knows Subject',  color: '#7C6FE0', bg: '#EDE9FF' },
}

// ── Substitute panel ───────────────────────────────────────────
function SubstitutePanel({ teacher, dayLabel, slots, multiActive, subAt, candidatesFor, onAssign, onClear, onAutoAssign, onClose, settings }: {
  teacher: string; dayLabel: string
  slots: { sid: string; sname: string; section: string; periodId: string; periodName: string; subject: string; startMin: number }[]
  multiActive: boolean
  subAt: (sid: string, section: string, periodId: string) => string | undefined
  candidatesFor: (sid: string, section: string, periodId: string, subject: string, absent: string) => SubCandidate[]
  onAssign: (sid: string, section: string, periodId: string, name: string) => void
  onClear: (sid: string, section: string, periodId: string) => void
  onAutoAssign: () => void
  onClose: () => void
  settings: SubstitutionSettings
}) {
  const showRanking = settings.defaults.autoSuggestionsEnabled
  const maxShow = settings.defaults.maxSuggestionsToShow ?? Infinity
  const covered = slots.filter(s => subAt(s.sid, s.section, s.periodId)).length
  return (
    <div onClick={e => { if (e.target === e.currentTarget) onClose() }}
      style={{ position: 'fixed', inset: 0, zIndex: 1100, background: 'rgba(19,17,30,0.5)', display: 'flex', alignItems: 'stretch', justifyContent: 'flex-end' }}>
      <div style={{ width: 'min(960px, 96vw)', background: '#F7F6FC', display: 'flex', flexDirection: 'column', boxShadow: '-20px 0 60px rgba(0,0,0,0.25)' }}>
        {/* header */}
        <div style={{ background: '#fff', borderBottom: '1px solid #ECE9FB', padding: '16px 22px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ width: 38, height: 38, borderRadius: 10, background: '#E8F0FF', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}><Repeat size={18} color="#2563EB" /></span>
            <div>
              <div style={{ fontSize: 17, fontWeight: 800, color: '#13111E' }}>Arrange cover — {teacher}</div>
              <div style={{ fontSize: 12.5, color: '#8B87AD' }}>{dayLabel} · {covered}/{slots.length} period{slots.length !== 1 ? 's' : ''} covered</div>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
            {slots.length > 0 && showRanking && (
              <button onClick={onAutoAssign}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 7, padding: '10px 18px', borderRadius: 10, border: 'none', cursor: 'pointer', fontSize: 13.5, fontWeight: 800,
                  background: 'linear-gradient(135deg,#7C6FE0,#5D4FCF)', color: '#fff', boxShadow: '0 6px 16px rgba(124,111,224,0.3)' }}>
                <Zap size={16} /> Auto-Assign
              </button>
            )}
            <button onClick={onClose} style={{ ...iconBtn, width: 38, height: 38 }}><X size={17} /></button>
          </div>
        </div>

        {/* body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: 18 }}>
          {slots.length === 0 ? (
            <div style={{ background: '#fff', border: '1px solid #ECE9FB', borderRadius: 14, padding: '50px 24px', textAlign: 'center' }}>
              <Check size={28} color="#16A34A" />
              <h3 style={{ fontSize: 16, fontWeight: 800, color: '#13111E', margin: '10px 0 4px' }}>No cover needed</h3>
              <p style={{ fontSize: 13, color: '#8B87AD', margin: 0 }}>{teacher} has no classes on {dayLabel}.</p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {slots.map(slot => {
                const current = subAt(slot.sid, slot.section, slot.periodId)
                const cands = candidatesFor(slot.sid, slot.section, slot.periodId, slot.subject, teacher)
                return (
                  <div key={`${slot.sid}|${slot.section}|${slot.periodId}`} style={{ display: 'flex', gap: 14, background: '#fff', border: '1px solid #ECE9FB', borderRadius: 14, padding: 16 }}>
                    {/* slot info */}
                    <div style={{ width: 168, flexShrink: 0, borderRight: '1px solid #F2F0FB', paddingRight: 14 }}>
                      <div style={{ fontSize: 15, fontWeight: 800, color: '#13111E' }}>{slot.periodName}</div>
                      {multiActive && (
                        <div style={{ marginTop: 6, display: 'inline-block', fontSize: 10.5, fontWeight: 800, color: '#5D4FCF', background: '#EEF0FF', padding: '2px 7px', borderRadius: 6, maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>🔀 {slot.sname}</div>
                      )}
                      <div style={{ fontSize: 12, color: '#8B87AD', marginTop: 6 }}>📘 {slot.subject}</div>
                      <div style={{ fontSize: 12, color: '#8B87AD', marginTop: 4 }}>🏫 {slot.section}</div>
                      {current && (
                        <div style={{ marginTop: 10, display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 9px', borderRadius: 7, background: '#E8F0FF', color: '#2563EB', fontSize: 11.5, fontWeight: 700 }}>
                          <Check size={12} /> {current}
                          <button onClick={() => onClear(slot.sid, slot.section, slot.periodId)} title="Clear" style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#2563EB', display: 'inline-flex' }}><X size={12} /></button>
                        </div>
                      )}
                    </div>
                    {/* candidates */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                        <span style={{ fontSize: 13, fontWeight: 800, color: '#13111E' }}>Select Substitute</span>
                        <span style={{ fontSize: 11.5, color: '#9A95BC' }}>{cands.length} available</span>
                      </div>
                      {cands.length === 0 ? (
                        <div style={{ fontSize: 12.5, color: '#9A95BC', padding: '10px 0' }}>No free teacher this period.</div>
                      ) : (
                        <div className="cal-scroll" style={{ display: 'flex', gap: 10, overflowX: 'auto', paddingBottom: 4 }}>
                          {cands.slice(0, maxShow).map(c => {
                            const active = current === c.name
                            const badge = showRanking && c.tier !== 'none' ? TIER_BADGE[c.tier] : null
                            return (
                              <button key={c.name} onClick={() => onAssign(slot.sid, slot.section, slot.periodId, c.name)}
                                style={{ width: 178, flexShrink: 0, textAlign: 'left', cursor: 'pointer', fontFamily: 'inherit',
                                  border: active ? '1.5px solid #2563EB' : '1.5px solid #ECE9FB', background: active ? '#F5F9FF' : '#fff',
                                  borderRadius: 12, padding: 12 }}>
                                <div style={{ fontSize: 13.5, fontWeight: 800, color: '#13111E', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.name}</div>
                                {badge && (
                                  <span style={{ display: 'inline-block', marginTop: 5, fontSize: 10, fontWeight: 700, color: badge.color, background: badge.bg, padding: '2px 8px', borderRadius: 12 }}>{badge.label}</span>
                                )}
                                <div style={{ display: 'flex', gap: 12, marginTop: 9 }}>
                                  <div>
                                    <div style={{ fontSize: 9.5, fontWeight: 700, color: '#B5B0CF', letterSpacing: '0.04em' }}>TODAY</div>
                                    <div style={{ fontSize: 15, fontWeight: 800, color: '#13111E' }}>{c.todayReg + c.todaySub}P</div>
                                    <div style={{ fontSize: 9.5, color: '#9A95BC' }}>Reg {c.todayReg} · Sub {c.todaySub}</div>
                                  </div>
                                  <div>
                                    <div style={{ fontSize: 9.5, fontWeight: 700, color: '#B5B0CF', letterSpacing: '0.04em' }}>WEEK</div>
                                    <div style={{ fontSize: 15, fontWeight: 800, color: '#13111E' }}>{c.weekLoad}P</div>
                                  </div>
                                </div>
                                {c.streak >= 3 && (
                                  <div style={{ marginTop: 8, fontSize: 10.5, fontWeight: 700, color: c.streak >= 4 ? '#DC2626' : '#D97706' }}>{c.streak} in a row</div>
                                )}
                              </button>
                            )
                          })}
                        </div>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Assign-task modal ──────────────────────────────────────────
// Give a free resource a job for this slot: quick presets per resource kind,
// free-text title, optional note. Date + period are fixed by where you clicked.
function AssignTaskModal({ target, date, terms, history, weekCount, onClose, onAssign }: {
  target: { kind: AssignKind; entity: string; periodId: string; periodName: string }
  date: string; terms: Terms
  history: FreeAssignment[]; weekCount: number
  onClose: () => void; onAssign: (a: FreeAssignment) => void
}) {
  const [title, setTitle] = useState('')
  const [note, setNote] = useState('')
  const presets = TASK_PRESETS[target.kind]
  const kindLabel = target.kind === 'teacher' ? terms.teacher : target.kind === 'room' ? terms.venue : terms.class
  const valid = title.trim().length > 0

  // A human note, not a metric dump: is this a fair ask right now?
  const name = target.entity
  const advisory =
    target.kind === 'teacher'
      ? weekCount === 0 ? { text: `This would be ${name}’s first extra duty this week — a fair pick. 👍`, tone: '#16A34A' }
      : weekCount <= 2 ? { text: `${name} has taken ${weekCount} extra dut${weekCount === 1 ? 'y' : 'ies'} this week — still a reasonable ask.`, tone: '#B45309' }
      : { text: `Heads up — ${name} already has ${weekCount} extra duties this week. Someone lighter might be fairer.`, tone: '#DC2626' }
    : target.kind === 'room'
      ? weekCount === 0 ? { text: `${name} hasn’t been booked for anything extra this week.`, tone: '#16A34A' }
      : { text: `${name} has ${weekCount} extra booking${weekCount === 1 ? '' : 's'} this week.`, tone: '#B45309' }
      : weekCount === 0 ? { text: `No extra activities for ${name} this week yet.`, tone: '#16A34A' }
      : { text: `${name} has had ${weekCount} extra activit${weekCount === 1 ? 'y' : 'ies'} this week — keep the balance in mind.`, tone: '#B45309' }

  const fmtHist = (iso: string) => { const d = new Date(iso + 'T00:00:00'); return `${['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][d.getDay()]} ${d.getDate()}/${d.getMonth() + 1}` }

  const submit = () => {
    if (!valid) return
    onAssign({
      id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      date, periodId: target.periodId, kind: target.kind, entity: target.entity,
      title: title.trim(), note: note.trim() || undefined,
    })
  }

  return (
    <div onClick={e => { if (e.target === e.currentTarget) onClose() }}
      style={{ position: 'fixed', inset: 0, zIndex: 1100, background: 'rgba(19,17,30,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div style={{ width: '100%', maxWidth: 520, background: '#fff', borderRadius: 16, overflow: 'hidden', boxShadow: '0 24px 70px rgba(0,0,0,0.28)' }}>
        <div style={{ background: 'linear-gradient(135deg,#D97706,#B45309)', padding: '18px 22px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ color: '#fff' }}>
            <div style={{ fontSize: 17, fontWeight: 800 }}>📌 Assign a task</div>
            <div style={{ fontSize: 12.5, opacity: 0.92, marginTop: 2 }}>
              {kindLabel}: <strong>{target.entity}</strong> · {target.periodName} · {date}
            </div>
          </div>
          <button onClick={onClose} style={{ border: 'none', background: 'rgba(255,255,255,0.18)', color: '#fff', width: 30, height: 30, borderRadius: 8, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><X size={16} /></button>
        </div>

        <div style={{ padding: 22 }}>
          {/* Fairness note — schedU talking like a colleague, not a dashboard */}
          <div style={{ display: 'flex', gap: 9, alignItems: 'flex-start', background: `${advisory.tone}10`, border: `1px solid ${advisory.tone}33`, borderRadius: 10, padding: '10px 13px', marginBottom: 16 }}>
            <span style={{ width: 8, height: 8, borderRadius: 4, background: advisory.tone, marginTop: 5, flexShrink: 0 }} />
            <span style={{ fontSize: 13, fontWeight: 600, color: '#3F3A55', lineHeight: 1.45 }}>{advisory.text}</span>
          </div>

          <Field label="What should this slot be used for?" required>
            <input value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. Exam invigilation" autoFocus style={inp}
              onKeyDown={e => { if (e.key === 'Enter') submit() }} />
          </Field>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7, marginTop: -6, marginBottom: 16 }}>
            {presets.map(p => (
              <button key={p} onClick={() => setTitle(p)}
                style={{
                  padding: '6px 12px', borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
                  border: title === p ? '1.5px solid #B45309' : '1.5px solid #EFE4CF',
                  background: title === p ? '#FFF7E8' : '#fff', color: '#92610E',
                }}>{p}</button>
            ))}
          </div>
          <Field label="Note (optional)">
            <input value={note} onChange={e => setNote(e.target.value)} placeholder="Any detail worth remembering…" style={inp} />
          </Field>

          {/* Recent extra work — so the decision is informed, right here */}
          {history.length > 0 && (
            <div style={{ marginTop: 2 }}>
              <div style={{ fontSize: 11, fontWeight: 800, color: '#9A95BC', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 7 }}>Recent extra work</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                {history.map(h => (
                  <div key={h.id} style={{ display: 'flex', alignItems: 'center', gap: 9, fontSize: 12.5 }}>
                    <span style={{ width: 62, flexShrink: 0, fontWeight: 700, color: '#9A95BC' }}>{fmtHist(h.date)}</span>
                    <span style={{ fontWeight: 700, color: '#3F3A55', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{h.title}</span>
                    {h.note && <span style={{ color: '#B5B0CF', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>— {h.note}</span>}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, padding: '14px 22px', borderTop: '1px solid #F1EFFA' }}>
          <button onClick={onClose} style={{ padding: '10px 20px', borderRadius: 10, border: '1.5px solid #E0DBF2', background: '#fff', fontSize: 13.5, fontWeight: 700, color: '#4B5275', cursor: 'pointer', fontFamily: 'inherit' }}>Cancel</button>
          <button onClick={submit} disabled={!valid}
            style={{ padding: '10px 24px', borderRadius: 10, border: 'none', fontSize: 13.5, fontWeight: 800, cursor: valid ? 'pointer' : 'not-allowed', fontFamily: 'inherit',
              background: valid ? 'linear-gradient(135deg,#D97706,#B45309)' : '#E8DCC8', color: '#fff',
              boxShadow: valid ? '0 6px 16px rgba(180,83,9,0.3)' : 'none' }}>Assign</button>
        </div>
      </div>
    </div>
  )
}

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <label style={{ display: 'block', fontSize: 13, fontWeight: 700, color: '#374151', marginBottom: 6 }}>
        {label}{required && <span style={{ color: '#EF4444' }}> *</span>}
      </label>
      {children}
    </div>
  )
}

// ── shared styles ──────────────────────────────────────────────
const iconBtn: React.CSSProperties = {
  width: 40, height: 40, borderRadius: 11, border: '1px solid #E7E3F6', background: '#fff',
  color: '#6B6890', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
}
const navBtn: React.CSSProperties = {
  height: 38, minWidth: 38, borderRadius: 10, border: '1px solid #E3DEF7', background: '#fff',
  color: '#5B5777', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
}
const pillGroup: React.CSSProperties = {
  display: 'flex', gap: 3, padding: 3, background: '#F1EEFB', borderRadius: 11,
}
const pillBtn = (active: boolean): React.CSSProperties => ({
  padding: '8px 16px', borderRadius: 9, border: 'none', cursor: 'pointer',
  fontSize: 13, fontWeight: 700, fontFamily: 'inherit',
  background: active ? '#fff' : 'transparent',
  color: active ? '#7C6FE0' : '#7E7AA0',
  boxShadow: active ? '0 2px 6px rgba(124,111,224,0.18)' : 'none',
})
const inp: React.CSSProperties = {
  width: '100%', padding: '11px 13px', border: '1.5px solid #E5E1F4', borderRadius: 10,
  fontSize: 14, fontFamily: 'inherit', color: '#13111E', background: '#fff', outline: 'none', boxSizing: 'border-box',
}
