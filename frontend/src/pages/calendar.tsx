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
import { loadActiveTimetableIntoStore, saveActiveTimetableSnapshot } from '@/lib/ttRegistry'
import { type CalLeave, LEAVE_KEY, loadLeaves, isOnLeaveOn } from '@/lib/leaveUtils'
import {
  ChevronLeft, ChevronRight, ChevronRight as Caret,
  Plus, Settings, Share2, Search, GraduationCap, Users, Building2,
  X, CalendarDays, Clock, UserMinus, Repeat, Zap, Check, ArrowLeft, Sun, Sunrise, BookOpen,
} from 'lucide-react'

// ── constants ──────────────────────────────────────────────────
const DOW    = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const DOW_FULL = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December']
const DAY_KEY = ['SUNDAY','MONDAY','TUESDAY','WEDNESDAY','THURSDAY','FRIDAY','SATURDAY']

// Soft cell palette (bg / accent text) — vivid but low-contrast for calm density.
const PALETTE = [
  '#E9FBEF','#FFEFE6','#EAF1FF','#F3ECFF','#FCE9F3',
  '#E6F7FF','#FEF6E0','#EAF7EE','#FFF0EA','#EEF2FF',
  '#E8FBF1','#FFF4E0','#EAF3FF','#FCEEF6',
]
const ACCENT = [
  '#16A34A','#EA580C','#2563EB','#7C3AED','#DB2777',
  '#0891B2','#CA8A04','#15803D','#C2410C','#4F46E5',
  '#059669','#D97706','#1D4ED8','#BE185D',
]
function hashIndex(name: string): number {
  let h = 0
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0
  return h % PALETTE.length
}

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
const ROW_H      = 108   // entity row height
const RULER_H    = 54    // time-ruler header height
const CELL_GAP   = 9

type Mode = 'class' | 'teacher' | 'room' | 'subject'
type View = 'day' | 'month'

interface CalEvent {
  id: string; title: string; description?: string; type: string
  date: string; start?: string; end?: string
}
interface SubCandidate {
  name: string; match: boolean; todayReg: number; todaySub: number; weekLoad: number; streak: number
}
const LEAVE_TYPES = ['Sick Leave', 'Casual Leave', 'Official Duty', 'Training', 'Personal', 'Other']
const DURATIONS = [
  { key: 'full' as const, label: 'Full Day', icon: Sun },
  { key: 'half' as const, label: 'Half Day', icon: Sunrise },
  { key: 'long' as const, label: 'Long Duration', icon: CalendarDays },
]
interface Block {
  key: string; title: string; line2: string; room: string
  startMin: number; endMin: number; idx: number
  sub?: string   // substitute teacher name when this period is covered
}

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
  const [view, setView] = useState<View>('day')
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

  // Period → wall-clock minutes (cumulative from config.startTime).
  const periodTimes = useMemo(() => {
    const map: Record<string, { startMin: number; endMin: number; type: string }> = {}
    const [sh = 9, sm = 0] = (config.startTime ?? '09:00').split(':').map(Number)
    let mins = sh * 60 + sm
    for (const p of periods) {
      const dur = p.duration ?? 45
      map[p.id] = { startMin: mins, endMin: mins + dur, type: p.type }
      mins += dur
    }
    return map
  }, [periods, config.startTime])

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
  const subAt = (section: string, periodId: string) => substitutions[`${section}|${dayKey}|${periodId}`]

  // ── Leave & substitution ──
  const [leaves, setLeaves] = useState<CalLeave[]>(() => loadLeaves(uid))
  const saveLeaves = (next: CalLeave[]) => {
    setLeaves(next)
    try { localStorage.setItem(`${LEAVE_KEY}:${uid}`, JSON.stringify(next)) } catch { /* quota */ }
  }
  const [leaveFor, setLeaveFor] = useState<string | null>(null)   // teacher → Mark Leave modal
  const [subFor, setSubFor]     = useState<string | null>(null)   // teacher → Substitute panel

  const isoDate = toISODate(date)
  const onLeave = (teacher: string) => isOnLeaveOn(leaves, teacher, isoDate)

  const classPeriods = periods.filter((p: any) => p.type !== 'break')

  // Periods the given teacher covers on the selected day (their cells to cover).
  const slotsOf = (teacher: string) => {
    const slots: { section: string; periodId: string; periodName: string; subject: string; startMin: number }[] = []
    for (const s of sections) {
      const sd = classTT[s.name]?.[dayKey] ?? {}
      for (const p of periods) {
        const c = sd[p.id]
        if (c?.subject && c.teacher === teacher) {
          slots.push({ section: s.name, periodId: p.id, periodName: p.name ?? p.id, subject: c.subject, startMin: periodTimes[p.id]?.startMin ?? 0 })
        }
      }
    }
    return slots.sort((a, b) => a.startMin - b.startMin)
  }

  // Teaching load for a teacher on a given day (regular vs. covering as sub).
  const loadOn = (teacher: string, day: string) => {
    let reg = 0, sub = 0
    for (const s of sections) {
      const sd = classTT[s.name]?.[day] ?? {}
      for (const p of periods) {
        const c = sd[p.id]
        if (!c?.subject) continue
        const covered = substitutions[`${s.name}|${day}|${p.id}`]
        if (covered) { if (covered === teacher) sub++ }
        else if (c.teacher === teacher) reg++
      }
    }
    return { reg, sub }
  }

  // Ranked substitute candidates for one slot: free that period, same-subject first,
  // then lightest load. Includes today/week load + consecutive-run ("in a row").
  const candidatesFor = (periodId: string, subject: string, absent: string): SubCandidate[] => {
    const busy = new Set<string>()
    for (const s of sections) {
      const c = classTT[s.name]?.[dayKey]?.[periodId]
      if (c?.teacher && c.teacher !== absent) busy.add(c.teacher)
    }
    Object.entries(substitutions).forEach(([k, v]) => {
      const [, d, pid] = k.split('|'); if (d === dayKey && pid === periodId) busy.add(v)
    })
    const pIdx = classPeriods.findIndex((p: any) => p.id === periodId)
    return staff
      .filter((st: any) => st.name !== absent && !busy.has(st.name))
      .map((st: any): SubCandidate => {
        const match = (st.subjects ?? []).some((s: string) => s === subject || s.endsWith(`::${subject}`))
        const today = loadOn(st.name, dayKey)
        const weekLoad = workDays.reduce((a, d) => { const l = loadOn(st.name, d); return a + l.reg + l.sub }, 0)
        // consecutive run this assignment would create (neighbours already taught)
        let streak = 1
        for (let i = pIdx - 1; i >= 0; i--) { if (teachesAt(st.name, classPeriods[i]?.id)) streak++; else break }
        for (let i = pIdx + 1; i < classPeriods.length; i++) { if (teachesAt(st.name, classPeriods[i]?.id)) streak++; else break }
        return { name: st.name, match, todayReg: today.reg, todaySub: today.sub, weekLoad, streak }
      })
      .sort((a, b) => (b.match ? 1 : 0) - (a.match ? 1 : 0) || (a.todayReg + a.todaySub) - (b.todayReg + b.todaySub) || a.weekLoad - b.weekLoad)
    function teachesAt(name: string, pid?: string): boolean {
      if (!pid) return false
      return sections.some((s: any) => {
        const c = classTT[s.name]?.[dayKey]?.[pid]
        const cov = substitutions[`${s.name}|${dayKey}|${pid}`]
        return cov ? cov === name : c?.teacher === name
      })
    }
  }

  const assignSub = (section: string, periodId: string, subName: string) => {
    const next = { ...substitutions, [`${section}|${dayKey}|${periodId}`]: subName }
    store.setSubstitutions(next)
    saveActiveTimetableSnapshot()
  }
  const clearSub = (section: string, periodId: string) => {
    const next = { ...substitutions }; delete next[`${section}|${dayKey}|${periodId}`]
    store.setSubstitutions(next)
    saveActiveTimetableSnapshot()
  }
  // Auto-assign the best candidate to every uncovered slot of the absent teacher.
  const autoAssign = (teacher: string) => {
    const next = { ...substitutions }
    const usedThisPeriod: Record<string, Set<string>> = {}
    for (const slot of slotsOf(teacher)) {
      const key = `${slot.section}|${dayKey}|${slot.periodId}`
      if (next[key]) continue
      const cands = candidatesFor(slot.periodId, slot.subject, teacher)
        .filter(c => !usedThisPeriod[slot.periodId]?.has(c.name))
      const best = cands[0]
      if (best) {
        next[key] = best.name
        ;(usedThisPeriod[slot.periodId] ??= new Set()).add(best.name)
      }
    }
    store.setSubstitutions(next)
    saveActiveTimetableSnapshot()
  }

  const blocksFor = (entity: string): Block[] => {
    const out: Block[] = []
    if (mode === 'class') {
      const sd = classTT[entity]?.[dayKey] ?? {}
      for (const p of periods) {
        const c = sd[p.id]
        if (!c?.subject) continue
        const s = subAt(entity, p.id)
        out.push(mkBlock(p.id, p.id, c.subject, s || c.teacher || '', c.room ?? '', c.subject, s))
      }
    } else if (mode === 'teacher') {
      for (const s of sections) {
        const sd = classTT[s.name]?.[dayKey] ?? {}
        for (const p of periods) {
          const c = sd[p.id]
          if (!c?.subject) continue
          const sub = subAt(s.name, p.id)
          const effective = sub || c.teacher
          if (effective === entity) out.push(mkBlock(`${s.name}|${p.id}`, p.id, c.subject, s.name, c.room ?? '', c.subject, sub && sub === entity ? sub : undefined))
        }
      }
    } else if (mode === 'room') {
      for (const s of sections) {
        const sd = classTT[s.name]?.[dayKey] ?? {}
        for (const p of periods) {
          const c = sd[p.id]
          if (!c?.subject || (c.room ?? '') !== entity) continue
          const sub = subAt(s.name, p.id)
          out.push(mkBlock(`${s.name}|${p.id}`, p.id, c.subject, s.name, sub || c.teacher || '', c.subject, sub))
        }
      }
    } else {
      // subject mode: this subject's periods across every class — block shows
      // the class name (bold) and the covering teacher underneath.
      for (const s of sections) {
        const sd = classTT[s.name]?.[dayKey] ?? {}
        for (const p of periods) {
          const c = sd[p.id]
          if (!c?.subject || c.subject !== entity) continue
          const sub = subAt(s.name, p.id)
          out.push(mkBlock(`${s.name}|${p.id}`, p.id, s.name, sub || c.teacher || '', c.room ?? '', s.name, sub))
        }
      }
    }
    return out
    function mkBlock(key: string, periodId: string, title: string, line2: string, room: string, colorSeed: string, sub?: string): Block {
      const t = periodTimes[periodId] ?? { startMin: dayStart, endMin: dayStart + 45, type: 'teaching' }
      return { key, title, line2, room, startMin: t.startMin, endMin: t.endMin, idx: hashIndex(colorSeed), sub: sub || undefined }
    }
  }

  const entityList: { id: string; name: string }[] = useMemo(() => {
    let list: { id: string; name: string }[]
    if (mode === 'class')   list = sections.map(s => ({ id: s.name, name: s.name }))
    else if (mode === 'teacher') list = staff.map(s => ({ id: s.name, name: s.name }))
    else if (mode === 'room') list = rooms.map(r => {
      const n = r.actualName || r.generatedName || r.name || 'Room'
      return { id: n, name: n }
    })
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

  const colLabel = mode === 'class' ? 'Class' : mode === 'teacher' ? 'Teacher' : mode === 'room' ? 'Room' : 'Subject'

  // Current-time cursor position (only when viewing today and within the span).
  const todayISO = toISODate(now)
  const viewingToday = toISODate(date) === todayISO
  const nowMin = now.getHours() * 60 + now.getMinutes()
  const showCursor = view === 'day' && viewingToday && nowMin >= dayStart && nowMin <= dayEnd
  const cursorLeft = (nowMin - dayStart) * PX_PER_MIN

  const dayEvents = events
    .filter(e => e.date === toISODate(date))
    .sort((a, b) => (a.start ?? '').localeCompare(b.start ?? ''))

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
            <button title="Settings" style={iconBtn}><Settings size={17} /></button>
            <button title="Share" style={iconBtn}><Share2 size={17} /></button>
          </div>
        </div>

        {/* ── Control bar ────────────────────────────────────── */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          gap: 14, flexWrap: 'wrap', marginBottom: 16,
          background: '#fff', border: '1px solid #ECE9FB', borderRadius: 14, padding: '12px 14px',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
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
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            {/* Month / Day */}
            <div style={pillGroup}>
              {(['month','day'] as View[]).map(v => (
                <button key={v} className="cal-tab" onClick={() => setView(v)}
                  style={pillBtn(view === v)}>
                  {v === 'month' ? 'Month' : 'Day'}
                </button>
              ))}
            </div>
            {/* Faculty / Classes / Subjects / Rooms */}
            <div style={pillGroup}>
              {([
                { m: 'teacher' as Mode, label: 'Faculty',  icon: <Users size={14} /> },
                { m: 'class'   as Mode, label: 'Classes',  icon: <GraduationCap size={14} /> },
                { m: 'subject' as Mode, label: 'Subjects', icon: <BookOpen size={14} /> },
                { m: 'room'    as Mode, label: 'Rooms',    icon: <Building2 size={14} /> },
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
        {view === 'day' && dayEvents.length > 0 && (
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

        {/* ── Main ───────────────────────────────────────────── */}
        {view === 'month'
          ? <MonthGrid date={date} setDate={setDate} events={events} onAdd={() => setAddOpen(true)} />
          : !hasTimetable
          ? <EmptyState />
          : !isWorkDay
          ? <RestDay day={DOW_FULL[date.getDay()]} />
          : (
            <div style={{ background: '#fff', border: '1px solid #ECE9FB', borderRadius: 16, overflow: 'hidden' }}>
              <div className="cal-scroll" style={{ overflowX: 'auto' }}>
                <div style={{ minWidth: ENTITY_W + trackW }}>
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
                    <div style={{ position: 'relative', width: trackW, height: RULER_H }}>
                      {ticks.map(t => (
                        <div key={t} style={{ position: 'absolute', left: (t - dayStart) * PX_PER_MIN, top: 0, height: '100%', borderLeft: '1px solid #ECE9FB', paddingLeft: 8, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                          <span style={{ fontSize: 12, fontWeight: 700, color: '#4B5275' }}>{fmtClock(t, h24).split(' ')[0]}</span>
                          {!h24 && <span style={{ fontSize: 9.5, fontWeight: 700, color: '#A9A4C8' }}>{fmtClock(t, h24).split(' ')[1]}</span>}
                        </div>
                      ))}
                      {showCursor && <CursorHead left={cursorLeft} label={fmtClock(nowMin, h24)} />}
                    </div>
                  </div>

                  {/* Rows */}
                  {entityList.length === 0 && (
                    <div style={{ padding: '40px', textAlign: 'center', color: '#8B87AD', fontSize: 13 }}>No {colLabel.toLowerCase()} matches “{query}”.</div>
                  )}
                  {entityList.map(ent => {
                    const blocks = blocksFor(ent.id)
                    return (
                      <div key={ent.id} className="cal-entity-row" style={{ display: 'flex', borderBottom: '1px solid #F2F0FB', minHeight: ROW_H }}>
                        <div style={{ width: ENTITY_W, flexShrink: 0, padding: '0 12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, borderRight: '1px solid #F2F0FB' }}>
                          <div style={{ minWidth: 0 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
                              <span style={{ fontSize: 13.5, fontWeight: 700, color: onLeave(ent.id) && mode === 'teacher' ? '#DC2626' : '#13111E', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{ent.name}</span>
                              {mode === 'teacher' && onLeave(ent.id) && (
                                <span style={{ fontSize: 9, fontWeight: 800, color: '#DC2626', background: '#FEE2E2', padding: '1px 5px', borderRadius: 5, flexShrink: 0 }}>LEAVE</span>
                              )}
                            </div>
                            <div style={{ fontSize: 11.5, color: '#9A95BC', marginTop: 2 }}>{blocks.length} period{blocks.length !== 1 ? 's' : ''}</div>
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
                        <div style={{ position: 'relative', width: trackW, height: ROW_H }}>
                          {/* hour gridlines */}
                          {ticks.map(t => (
                            <div key={t} style={{ position: 'absolute', left: (t - dayStart) * PX_PER_MIN, top: 0, height: '100%', borderLeft: '1px solid #F6F4FD' }} />
                          ))}
                          {blocks.map(b => (
                            <SessionCell key={b.key} b={b} dayStart={dayStart} h24={h24} />
                          ))}
                          {showCursor && <div style={{ position: 'absolute', left: cursorLeft, top: 0, height: '100%', width: 1.5, background: '#EF4444', opacity: 0.55, zIndex: 2, pointerEvents: 'none' }} />}
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
          subAt={(section, periodId) => substitutions[`${section}|${dayKey}|${periodId}`]}
          candidatesFor={candidatesFor}
          onAssign={assignSub}
          onClear={clearSub}
          onAutoAssign={() => autoAssign(subFor)}
          onClose={() => setSubFor(null)}
        />
      )}
    </div>
  )
}

// ── Session cell ───────────────────────────────────────────────
// Three calm lines, never more: title (wraps to 2 lines instead of
// truncating), one combined meta line (who/where), then the time range.
function SessionCell({ b, dayStart, h24 }: { b: Block; dayStart: number; h24: boolean }) {
  const left = (b.startMin - dayStart) * PX_PER_MIN + CELL_GAP / 2
  const width = Math.max(76, (b.endMin - b.startMin) * PX_PER_MIN - CELL_GAP)
  const bg = PALETTE[b.idx], accent = ACCENT[b.idx]
  const meta = [b.line2, b.room].filter(Boolean).join(' · ')
  return (
    <div style={{
      position: 'absolute', left, width, top: 6, height: ROW_H - 12,
      background: bg, borderRadius: 12, borderLeft: `3px solid ${accent}`,
      padding: '9px 11px', overflow: 'hidden', boxSizing: 'border-box',
      display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 3,
    }}>
      {b.sub && (
        <span style={{ position: 'absolute', top: 7, right: 8, fontSize: 8.5, fontWeight: 800, letterSpacing: '0.04em', color: '#fff', background: '#2563EB', padding: '1.5px 6px', borderRadius: 5 }}>SUB</span>
      )}
      <div style={{
        fontSize: 12.5, fontWeight: 800, color: accent, lineHeight: 1.28,
        display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
        overflow: 'hidden', paddingRight: b.sub ? 30 : 0,
      }}>{b.title}</div>
      {meta && <div style={{ fontSize: 11, fontWeight: 600, color: '#3F3A55', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{meta}</div>}
      <div style={{ fontSize: 10, color: '#9A95BC' }}>{fmtClock(b.startMin, h24)} – {fmtClock(b.endMin, h24)}</div>
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
function MonthGrid({ date, setDate, events, onAdd }: {
  date: Date; setDate: (d: Date) => void; events: CalEvent[]; onAdd: () => void
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
          return (
            <div key={i}
              onClick={() => c && setDate(new Date(y, m, c))}
              onDoubleClick={() => c && onAdd()}
              style={{
                minHeight: 92, borderRadius: 10, padding: 8, cursor: c ? 'pointer' : 'default',
                background: isToday ? '#F1ECFF' : c ? '#FBFAFF' : 'transparent',
                border: isToday ? '1.5px solid #7C6FE0' : c ? '1px solid #F2F0FB' : 'none',
              }}>
              {c && <div style={{ fontSize: 12.5, fontWeight: isToday ? 800 : 600, color: isToday ? '#7C6FE0' : '#13111E', marginBottom: 4 }}>{c}</div>}
              {evs.slice(0, 3).map(ev => {
                const meta = EVENT_TYPES.find(t => t.key === ev.type) ?? EVENT_TYPES[5]
                return <div key={ev.id} style={{ fontSize: 10.5, fontWeight: 600, color: '#fff', background: meta.color, borderRadius: 5, padding: '2px 6px', marginBottom: 3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{ev.title}</div>
              })}
              {evs.length > 3 && <div style={{ fontSize: 10, color: '#8B87AD' }}>+{evs.length - 3} more</div>}
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

// ── Substitute panel ───────────────────────────────────────────
function SubstitutePanel({ teacher, dayLabel, slots, subAt, candidatesFor, onAssign, onClear, onAutoAssign, onClose }: {
  teacher: string; dayLabel: string
  slots: { section: string; periodId: string; periodName: string; subject: string; startMin: number }[]
  subAt: (section: string, periodId: string) => string | undefined
  candidatesFor: (periodId: string, subject: string, absent: string) => SubCandidate[]
  onAssign: (section: string, periodId: string, name: string) => void
  onClear: (section: string, periodId: string) => void
  onAutoAssign: () => void
  onClose: () => void
}) {
  const covered = slots.filter(s => subAt(s.section, s.periodId)).length
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
            {slots.length > 0 && (
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
                const current = subAt(slot.section, slot.periodId)
                const cands = candidatesFor(slot.periodId, slot.subject, teacher)
                return (
                  <div key={`${slot.section}|${slot.periodId}`} style={{ display: 'flex', gap: 14, background: '#fff', border: '1px solid #ECE9FB', borderRadius: 14, padding: 16 }}>
                    {/* slot info */}
                    <div style={{ width: 168, flexShrink: 0, borderRight: '1px solid #F2F0FB', paddingRight: 14 }}>
                      <div style={{ fontSize: 15, fontWeight: 800, color: '#13111E' }}>{slot.periodName}</div>
                      <div style={{ fontSize: 12, color: '#8B87AD', marginTop: 6 }}>📘 {slot.subject}</div>
                      <div style={{ fontSize: 12, color: '#8B87AD', marginTop: 4 }}>🏫 {slot.section}</div>
                      {current && (
                        <div style={{ marginTop: 10, display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 9px', borderRadius: 7, background: '#E8F0FF', color: '#2563EB', fontSize: 11.5, fontWeight: 700 }}>
                          <Check size={12} /> {current}
                          <button onClick={() => onClear(slot.section, slot.periodId)} title="Clear" style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#2563EB', display: 'inline-flex' }}><X size={12} /></button>
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
                          {cands.slice(0, 12).map(c => {
                            const active = current === c.name
                            return (
                              <button key={c.name} onClick={() => onAssign(slot.section, slot.periodId, c.name)}
                                style={{ width: 178, flexShrink: 0, textAlign: 'left', cursor: 'pointer', fontFamily: 'inherit',
                                  border: active ? '1.5px solid #2563EB' : '1.5px solid #ECE9FB', background: active ? '#F5F9FF' : '#fff',
                                  borderRadius: 12, padding: 12 }}>
                                <div style={{ fontSize: 13.5, fontWeight: 800, color: '#13111E', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.name}</div>
                                {c.match && (
                                  <span style={{ display: 'inline-block', marginTop: 5, fontSize: 10, fontWeight: 700, color: '#2563EB', background: '#E8F0FF', padding: '2px 8px', borderRadius: 12 }}>Same Subject</span>
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
