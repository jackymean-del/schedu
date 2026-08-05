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
