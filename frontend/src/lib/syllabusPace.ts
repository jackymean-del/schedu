/**
 * Syllabus PACE — separating "how long we taught" from "how much we covered".
 *
 * The problem this solves
 * ----------------------
 * Hours taught is not syllabus covered. A teacher can spend 10 hours and get
 * through one chapter, or 5 hours and get through three. Tracking hours alone
 * therefore says nothing about whether the syllabus will actually finish — which
 * is the only question that matters.
 *
 * The solution, without asking anyone to do more work
 * --------------------------------------------------
 * We already hold two INDEPENDENT signals and were collapsing them into one:
 *
 *   1. CONTENT covered — the chapters faculty already tick off. Each chapter
 *      carries the hours it was *planned* to need, so ticked chapters give us
 *      progress measured in syllabus terms, not clock terms.
 *   2. TIME spent — derived, not entered: the periods this subject actually had
 *      in the timetable between the term start and today, minus holidays.
 *
 * Their ratio is the teacher's real pace:
 *      pace = content covered ÷ time spent
 *   pace < 1  → slower than planned (more clock time than content delivered)
 *   pace ≈ 1  → on plan
 *   pace > 1  → faster than planned
 *
 * Projecting that pace across the time still scheduled answers the actual
 * question: *will this syllabus finish?* — and it does so from data already
 * being captured. No new field, no new faculty task.
 *
 * Holidays fall out of the model correctly: a lost day adds no content and no
 * time spent (nothing happened), but permanently removes time that was
 * remaining. So the projection worsens automatically — which is precisely what
 * "that day's coverage goes waste" means.
 *
 * Honest limitation: pace needs CHAPTERS. A school logging only bulk hours has
 * no content signal — for those plans time is all we have, and `hasContentSignal`
 * is false so the UI can say so rather than invent a number.
 */
import type { ClassTimetable } from '@/types'
import type { SyllabusPlan } from './syllabusTracking'
import { requiredHours, planKey } from './syllabusTracking'
import type { Holiday } from './holidays'

const DAY_NAMES = ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY']
const sameDay = (a: string, b: string) =>
  (a ?? '').slice(0, 3).toUpperCase() === (b ?? '').slice(0, 3).toUpperCase()

const toDate = (s: string) => new Date(`${(s ?? '').slice(0, 10)}T00:00:00`)

/**
 * Local-calendar YYYY-MM-DD. Deliberately NOT toISOString(): these Dates are
 * local midnight, and converting to UTC rolls them back a day everywhere east of
 * Greenwich (in IST, local midnight is 18:30 UTC the previous day). That bug
 * silently mis-dated holidays and double-counted "today".
 */
const iso = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

/** Neighbouring days via calendar arithmetic, so DST shifts can't skew them. */
const shiftDay = (s: string, by: number) => {
  const d = toDate(s)
  d.setDate(d.getDate() + by)
  return iso(d)
}
const dayAfter = (s: string) => shiftDay(s, 1)
const dayBefore = (s: string) => shiftDay(s, -1)

/**
 * Hours of a given subject actually scheduled for a section between two dates,
 * excluding declared holidays. This is the "time" side of the ratio, and it is
 * DERIVED — nobody types it.
 */
export function scheduledHoursBetween(
  classTT: ClassTimetable,
  subject: string,
  section: string,
  fromISO: string,
  toISO: string,
  periodMinutes: number,
  holidays: Holiday[] = [],
): number {
  const from = toDate(fromISO), to = toDate(toISO)
  if (isNaN(from.getTime()) || isNaN(to.getTime()) || from > to) return 0

  // Periods this subject holds on each weekday, counted once from the timetable.
  const perWeekday = new Map<string, number>()
  const days = (classTT?.[section] ?? {}) as any
  for (const dayKey of Object.keys(days)) {
    let n = 0
    const slots = days[dayKey] ?? {}
    for (const pid of Object.keys(slots)) {
      const cell: any = slots[pid]
      if (!cell) continue
      const subjects: string[] = cell.groupAssignments?.length
        ? cell.groupAssignments.map((g: any) => g.subject ?? cell.subject).filter(Boolean)
        : (cell.subject ? [cell.subject] : [])
      if (subjects.includes(subject)) n += 1
    }
    if (n > 0) perWeekday.set(dayKey, n)
  }
  if (perWeekday.size === 0) return 0

  // Dates this section doesn't attend.
  const holidayDates = new Set(
    holidays
      .filter(h => !h.sections?.length || h.sections.includes(section))
      .map(h => (h.date ?? '').slice(0, 10)),
  )

  let periods = 0
  for (const d = new Date(from); d <= to; d.setDate(d.getDate() + 1)) {
    if (holidayDates.has(iso(d))) continue
    const wd = DAY_NAMES[d.getDay()]
    for (const [dayKey, n] of perWeekday) if (sameDay(dayKey, wd)) periods += n
  }
  return Math.round(periods * (Math.max(0, periodMinutes) / 60) * 10) / 10
}

/** Content actually covered, in syllabus hours — ticked chapters only. */
export function contentCoveredHours(p: SyllabusPlan | undefined): number {
  if (!p) return 0
  return Math.round(
    (p.chapters ?? []).filter(c => c.coveredAt).reduce((a, c) => a + (c.hours || 0), 0) * 10,
  ) / 10
}

export interface PaceReport {
  /** True only when chapters exist — otherwise there is no content signal. */
  hasContentSignal: boolean
  /** Syllabus hours' worth of chapters ticked. */
  contentCovered: number
  /** Clock hours of this subject that have actually happened (holidays removed). */
  timeSpent: number
  /** contentCovered ÷ timeSpent. 1 = on plan, <1 = slower, >1 = faster. */
  pace: number
  /** Syllabus hours still to cover. */
  contentRemaining: number
  /** Clock hours still scheduled before the term ends (holidays removed). */
  timeRemaining: number
  /** Clock hours the remaining content needs AT THE CURRENT PACE. */
  projectedHoursNeeded: number
  /** Will the syllabus finish in the time left, at this pace? */
  willFinish: boolean
  /** Shortfall in clock hours when it won't (0 otherwise). */
  shortfallHours: number
}

/**
 * Compare content covered against time consumed, then project the rest.
 * `today` is injectable so this is testable and deterministic.
 */
export function paceFor(
  plan: SyllabusPlan | undefined,
  classTT: ClassTimetable,
  opts: {
    termStart: string; termEnd: string; today?: string
    periodMinutes: number; holidays?: Holiday[]
  },
): PaceReport {
  // Clamp "now" into the term. Past the end date the term is simply over: time
  // spent stops at the final teaching day and nothing remains — without this the
  // spent figure keeps growing for years and the pace collapses towards zero.
  const rawToday = opts.today ?? iso(new Date())
  // Before the term, the "spent" window is deliberately empty (the day BEFORE
  // the start), so nothing counts as taught and the whole term still remains.
  const today = rawToday > opts.termEnd ? opts.termEnd
    : rawToday < opts.termStart ? dayBefore(opts.termStart)
    : rawToday
  const chapters = plan?.chapters ?? []
  const hasContentSignal = chapters.length > 0

  const contentCovered = contentCoveredHours(plan)
  const required = requiredHours(plan)
  const contentRemaining = Math.round(Math.max(0, required - contentCovered) * 10) / 10

  const timeSpent = plan
    ? scheduledHoursBetween(classTT, plan.subject, plan.section, opts.termStart, today, opts.periodMinutes, opts.holidays ?? [])
    : 0
  // From tomorrow, so today isn't counted as both spent and remaining.
  const tomorrow = dayAfter(today)
  const timeRemaining = plan
    ? scheduledHoursBetween(classTT, plan.subject, plan.section, tomorrow, opts.termEnd, opts.periodMinutes, opts.holidays ?? [])
    : 0

  // Pace is only meaningful once some time has actually been spent AND we have a
  // content signal; before that, assume the plan (1.0) rather than inventing one.
  const pace = hasContentSignal && timeSpent > 0
    ? Math.round((contentCovered / timeSpent) * 100) / 100
    : 1

  const effectivePace = pace > 0 ? pace : 0.01   // a stalled subject needs "a lot"
  const projectedHoursNeeded = Math.round((contentRemaining / effectivePace) * 10) / 10
  const willFinish = projectedHoursNeeded <= timeRemaining + 0.01
  const shortfallHours = willFinish ? 0 : Math.round((projectedHoursNeeded - timeRemaining) * 10) / 10

  return {
    hasContentSignal, contentCovered, timeSpent, pace,
    contentRemaining, timeRemaining, projectedHoursNeeded, willFinish, shortfallHours,
  }
}

/** Plans projected to miss the term, worst shortfall first. */
export function willNotFinish(
  plans: Record<string, SyllabusPlan>,
  classTT: ClassTimetable,
  opts: { termStart: string; termEnd: string; today?: string; periodMinutes: number; holidays?: Holiday[] },
): Array<{ key: string; plan: SyllabusPlan; report: PaceReport }> {
  return Object.entries(plans)
    .map(([key, plan]) => ({ key, plan, report: paceFor(plan, classTT, opts) }))
    .filter(x => x.report.hasContentSignal && x.report.contentRemaining > 0 && !x.report.willFinish)
    .sort((a, b) => b.report.shortfallHours - a.report.shortfallHours)
}

export { planKey }
