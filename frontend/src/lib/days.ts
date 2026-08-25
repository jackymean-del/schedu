/**
 * Weekday names, in one place.
 *
 * This list was declared six times across lib/ and pages/ — identical every
 * time, which is exactly how it stays until it isn't. Every bug fixed in this
 * codebase lately has been the same shape: two derivations of one fact that
 * eventually disagree. A day-name list that drifts would silently mis-key the
 * timetable against the calendar, and the failure would look like missing
 * lessons rather than like a bug.
 *
 * SUNDAY-FIRST, because it is indexed by `Date.getDay()`. Reordering it to
 * start on Monday would shift every lookup by one day.
 */
export const DAY_NAMES = [
  'SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY',
] as const

export type DayName = typeof DAY_NAMES[number]

/**
 * The working week to assume when a schedule has not been told otherwise.
 * Six days, because that is the norm in the schools this is built for.
 *
 * A shared constant rather than a literal at each call site: written inline,
 * `config?.workDays ?? [...]` hands back a NEW array every render, and every
 * memo built on it recomputes for a change that never happened.
 *
 * Distinct from DAY_NAMES, which is Sunday-first because it is indexed by
 * Date.getDay(). This one is a work week, in order, starting Monday.
 */
export const DEFAULT_WORK_DAYS: string[] =
  ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY']

/**
 * Timetable day keys vary in the wild — 'MONDAY', 'Mon', 'monday' — because
 * they have been written by several generations of the wizard and by pasted
 * spreadsheets. Compare on the first three letters, case-insensitively.
 */
export const sameDay = (a: string, b: string) =>
  (a ?? '').slice(0, 3).toUpperCase() === (b ?? '').slice(0, 3).toUpperCase()

/** Weekday name for an ISO date, or '' when the date can't be parsed. */
export function weekdayOf(isoDate: string): string {
  const d = new Date(`${(isoDate ?? '').slice(0, 10)}T00:00:00`)
  return isNaN(d.getTime()) ? '' : DAY_NAMES[d.getDay()]
}

/** Weekday name for a Date. Local calendar, never UTC. */
export const dayNameOf = (d: Date) => DAY_NAMES[d.getDay()]

/**
 * A Date as YYYY-MM-DD on the LOCAL calendar.
 *
 * Never `toISOString().slice(0, 10)`: that converts to UTC first, so the date
 * is wrong for part of every day in every timezone that is not UTC. India is
 * UTC+5:30, so from midnight until 05:29 local it reports YESTERDAY — a
 * principal declaring an unexpected holiday at 6am would have filed it against
 * the previous day and left today's lessons running. West of Greenwich the
 * error runs the other way, late in the evening.
 */
export function localISO(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}
