/**
 * ACADEMIC TERMS — the year split into the periods a school actually reports on.
 *
 * (Not to be confused with lib/terms, which is the institution's naming words —
 * Class vs Batch vs Cohort. This is Term 1 / Term 2 / Term 3.)
 *
 * Until now a schedule ran over one date range and every hours figure covered
 * the whole of it. That is the wrong denominator for the question staff rooms
 * actually ask: not "will this syllabus finish by March?" but "are we where we
 * should be by the end of Term 1?". A subject can be comfortably on track for
 * the year and badly behind for the term whose exam is in three weeks.
 *
 * Terms sit alongside holidays (lib/holidays) — the same kind of fact, declared
 * once for the school by an administrator, applying to every schedule.
 *
 * TWO DELIBERATE CHOICES
 *
 * 1. A term NARROWS a schedule's own range; it never extends it. A schedule
 *    that starts in September contributes nothing to a term that ended in
 *    August, and a term running past the schedule's end stops where the
 *    schedule does. Otherwise a term would claim hours from weeks in which the
 *    timetable did not exist.
 *
 * 2. Declaring no terms keeps today's behaviour exactly, and "Whole schedule"
 *    remains the default even for schools that do declare them. A term is a
 *    lens you choose, not a mode you are forced into.
 */
import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export interface AcademicTerm {
  id: string
  name: string
  /** ISO YYYY-MM-DD, inclusive. */
  start: string
  /** ISO YYYY-MM-DD, inclusive. */
  end: string
}

export interface DateWindow { start: string; end: string }

interface AcademicTermState {
  terms: AcademicTerm[]
  addTerm: (t: Omit<AcademicTerm, 'id'>) => void
  updateTerm: (id: string, patch: Partial<Omit<AcademicTerm, 'id'>>) => void
  removeTerm: (id: string) => void
  reset: () => void
}

const byStart = (a: AcademicTerm, b: AcademicTerm) => a.start.localeCompare(b.start)
const day = (s: string | undefined) => (s ?? '').slice(0, 10)

export const useAcademicTerms = create<AcademicTermState>()(
  persist(
    (set) => ({
      terms: [],
      addTerm: (t) =>
        set(s => {
          const start = day(t.start), end = day(t.end)
          if (!start || !end || end < start) return s
          return {
            terms: [...s.terms, {
              ...t, start, end, id: Math.random().toString(36).slice(2, 9),
            }].sort(byStart),
          }
        }),
      updateTerm: (id, patch) =>
        set(s => ({
          terms: s.terms.map(t => {
            if (t.id !== id) return t
            const next = {
              ...t, ...patch,
              start: day(patch.start ?? t.start), end: day(patch.end ?? t.end),
            }
            // Refuse a range that runs backwards rather than storing one that
            // would silently report zero hours for everything inside it.
            return next.end < next.start ? t : next
          }).sort(byStart),
        })),
      removeTerm: (id) => set(s => ({ terms: s.terms.filter(t => t.id !== id) })),
      reset: () => set({ terms: [] }),
    }),
    { name: 'schedu-academic-terms' },
  ),
)

// ── Pure helpers ──────────────────────────────────────────────────────────

/**
 * The part of `scheduleRange` that falls inside `term`.
 *
 * Returns null when the two don't overlap — the caller should then count
 * nothing for that schedule rather than falling back to its full range, which
 * would report a whole year's hours under a term the schedule never ran in.
 *
 * A null term means "no lens": the schedule's own range, unchanged.
 */
export function clampToTerm(
  scheduleRange: DateWindow,
  term: AcademicTerm | null | undefined,
): DateWindow | null {
  if (!term) return scheduleRange
  const start = term.start > scheduleRange.start ? term.start : scheduleRange.start
  const end = term.end < scheduleRange.end ? term.end : scheduleRange.end
  return end < start ? null : { start, end }
}

/** The term containing `isoDate`, if any. Terms may legitimately have gaps
 *  between them (the break between terms), so this can find nothing. */
export function termOn(terms: AcademicTerm[], isoDate: string): AcademicTerm | undefined {
  const d = day(isoDate)
  return terms.find(t => d >= t.start && d <= t.end)
}

/**
 * Which term to offer first: the one we're in, else the next to start, else the
 * last that ran. A school opening the page mid-year should land on the term it
 * is living in without having to choose.
 */
export function defaultTerm(terms: AcademicTerm[], isoDate: string): AcademicTerm | undefined {
  if (terms.length === 0) return undefined
  const d = day(isoDate)
  const sorted = [...terms].sort(byStart)
  return termOn(sorted, d)
    ?? sorted.find(t => t.start > d)
    ?? sorted[sorted.length - 1]
}

/**
 * Terms that overlap each other, as adjacent pairs.
 *
 * Overlaps are not rejected outright — a school mid-edit will briefly have them
 * and refusing the keystroke is worse than saying so. But a date inside two
 * terms makes "hours this term" ambiguous, so the UI warns.
 */
export function overlappingTerms(terms: AcademicTerm[]): Array<[AcademicTerm, AcademicTerm]> {
  const sorted = [...terms].sort(byStart)
  const out: Array<[AcademicTerm, AcademicTerm]> = []
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i].start <= sorted[i - 1].end) out.push([sorted[i - 1], sorted[i]])
  }
  return out
}

/** Days between consecutive terms — usually the break, surfaced so a school can
 *  tell an intended holiday from a mistyped date. */
export function termGaps(
  terms: AcademicTerm[],
): Array<{ after: AcademicTerm; before: AcademicTerm; days: number }> {
  const sorted = [...terms].sort(byStart)
  const out: Array<{ after: AcademicTerm; before: AcademicTerm; days: number }> = []
  for (let i = 1; i < sorted.length; i++) {
    const prevEnd = new Date(`${sorted[i - 1].end}T00:00:00`)
    const nextStart = new Date(`${sorted[i].start}T00:00:00`)
    const days = Math.round((nextStart.getTime() - prevEnd.getTime()) / 86400000) - 1
    if (days > 0) out.push({ after: sorted[i - 1], before: sorted[i], days })
  }
  return out
}
