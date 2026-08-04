/**
 * SCHOOL EVENTS — exams, sports weeks, trips, assemblies, meetings.
 *
 * Events already existed on the Calendar, but they were decoration: a coloured
 * chip on a day, stored under the account that typed it, affecting nothing. A
 * school could block out a fortnight of board exams and every subject's
 * "remaining hours" would carry on as though those two weeks were teaching
 * time. That is the number people plan the syllabus against.
 *
 * Two things change here.
 *
 * 1. SCOPE. Events move from `schedu-cal-events:<uid>` to the school, like
 *    holidays and leave before them. An exam timetable is not personal to
 *    whoever entered it.
 *
 * 2. CONSEQUENCE. An event may declare that it SUSPENDS TEACHING, and one that
 *    does removes its periods from the time available to cover the syllabus —
 *    through exactly the same derivation holidays use (lib/holidays), rather
 *    than a second code path that could drift from it. The difference from a
 *    holiday is only what it means to a person: the school is open and staff
 *    are in, so nobody should be arranging cover for periods that aren't
 *    running.
 *
 * DELIBERATELY OFF BY DEFAULT for anything already recorded. An event entered
 * before this existed never removed hours; migrating it to suspend teaching
 * would silently rewrite a school's numbers. New events ask.
 */
import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { Holiday } from './holidays'

export interface SchoolEvent {
  id: string
  title: string
  description?: string
  /** One of EVENT_TYPES in the Calendar — 'exam', 'activity', 'meeting'… */
  type: string
  /** First day, ISO YYYY-MM-DD. */
  date: string
  /** Last day for a multi-day event. Absent = a single day. */
  endDate?: string
  /** Wall-clock times, when it occupies only part of a day. Display only. */
  start?: string
  end?: string
  /** Class-sections it applies to; empty/undefined = the whole school. */
  sections?: string[]
  /**
   * Does normal teaching stop for these classes on these days?
   *
   * True for an exam week or a sports day; false for a staff meeting after
   * hours or an assembly that doesn't displace a lesson. Only true removes
   * hours from the syllabus time available.
   */
  suspendsTeaching?: boolean
}

export const EVENTS_KEY = 'schedu-cal-events'

interface EventState {
  events: SchoolEvent[]
  setEvents: (next: SchoolEvent[]) => void
  addEvent: (e: SchoolEvent) => void
  removeEvent: (id: string) => void
  reset: () => void
}

export const useSchoolEvents = create<EventState>()(
  persist(
    (set) => ({
      events: [],
      setEvents: (next) => set({ events: next }),
      addEvent: (e) => set(s => ({ events: [...s.events, e] })),
      removeEvent: (id) => set(s => ({ events: s.events.filter(e => e.id !== id) })),
      reset: () => set({ events: [] }),
    }),
    { name: EVENTS_KEY },
  ),
)

// ── Dates ─────────────────────────────────────────────────────────────────

const day = (s: string | undefined) => (s ?? '').slice(0, 10)

/** Calendar arithmetic, never UTC — see the note in syllabusPace about IST. */
function nextDay(iso: string): string {
  const d = new Date(`${iso}T00:00:00`)
  d.setDate(d.getDate() + 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/**
 * Every date an event covers, inclusive of both ends.
 *
 * Capped at one year. A mistyped end date ('2206' for '2026') would otherwise
 * expand to sixty-five thousand entries and hang the page — better to return a
 * year and let the school see an obviously wrong range than to freeze.
 */
export function eventDates(e: SchoolEvent): string[] {
  const start = day(e.date)
  if (!start) return []
  const end = day(e.endDate) || start
  if (end < start) return [start]
  const out: string[] = []
  for (let d = start; d <= end && out.length < 366; d = nextDay(d)) out.push(d)
  return out
}

export function eventCoversDate(e: SchoolEvent, isoDate: string): boolean {
  const d = day(isoDate)
  const start = day(e.date)
  const end = day(e.endDate) || start
  return d >= start && d <= (end < start ? start : end)
}

/** Events on a given date, optionally narrowed to one class-section. */
export function eventsOn(events: SchoolEvent[], isoDate: string, section?: string): SchoolEvent[] {
  return events.filter(e =>
    eventCoversDate(e, isoDate) &&
    (!section || !e.sections?.length || e.sections.includes(section)))
}

/** Is normal teaching suspended for this section on this date? */
export function teachingSuspendedOn(events: SchoolEvent[], isoDate: string, section?: string): SchoolEvent | undefined {
  return eventsOn(events, isoDate, section).find(e => e.suspendsTeaching)
}

/**
 * Suspending events, expressed as the holiday records the coverage math
 * already understands — one per date, carrying the event's own section scope.
 *
 * Reusing lib/holidays rather than writing a second derivation is the whole
 * point: a lost period is a lost period, and two implementations of "which
 * periods did this remove" would eventually disagree about one of them.
 *
 * Ids are prefixed so a caller can still tell a real holiday from an event.
 */
export function eventsAsHolidays(events: SchoolEvent[]): Holiday[] {
  const out: Holiday[] = []
  for (const e of events) {
    if (!e.suspendsTeaching) continue
    for (const d of eventDates(e)) {
      out.push({
        id: `event:${e.id}:${d}`,
        date: d,
        name: e.title || 'School event',
        sections: e.sections?.length ? e.sections : undefined,
      })
    }
  }
  return out
}

// ── Migration off the per-account keys ────────────────────────────────────

/** Per-account event keys still present in storage. */
export function legacyEventKeys(storage: Storage): string[] {
  const keys: string[] = []
  for (let i = 0; i < storage.length; i++) {
    const k = storage.key(i)
    if (k && k.startsWith(`${EVENTS_KEY}:`)) keys.push(k)
  }
  return keys.sort()
}

/** Deduped by id, then by (title, first date) so two admins who entered the
 *  same sports day don't produce two chips on it. */
export function mergeEvents(...lists: SchoolEvent[][]): SchoolEvent[] {
  const out: SchoolEvent[] = []
  const seenId = new Set<string>()
  const seenSlot = new Set<string>()
  for (const list of lists) {
    for (const e of list ?? []) {
      if (!e?.date) continue
      const slot = `${(e.title ?? '').trim().toLowerCase()}|${day(e.date)}|${day(e.endDate)}`
      if (seenId.has(e.id) || seenSlot.has(slot)) continue
      seenId.add(e.id); seenSlot.add(slot)
      // Anything recorded before events had consequences kept none.
      out.push({ ...e, suspendsTeaching: e.suspendsTeaching ?? false })
    }
  }
  return out.sort((a, b) => day(a.date).localeCompare(day(b.date)))
}

/**
 * Fold the old per-account records into the school store, once, then remove
 * the legacy keys — left in place, an event deleted in the app would reappear
 * on the next load.
 */
export function migrateLegacyEvents(storage: Storage = localStorage): number {
  let moved = 0
  try {
    const keys = legacyEventKeys(storage)
    if (!keys.length) return 0
    const lists: SchoolEvent[][] = []
    for (const k of keys) {
      try { lists.push(JSON.parse(storage.getItem(k) || '[]')) } catch { /* unreadable */ }
    }
    const before = useSchoolEvents.getState().events.length
    const merged = mergeEvents(useSchoolEvents.getState().events, ...lists)
    moved = merged.length - before
    useSchoolEvents.getState().setEvents(merged)
    for (const k of keys) storage.removeItem(k)
  } catch { /* private mode / quota — the app still works, just without history */ }
  return moved
}
