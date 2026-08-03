/**
 * Faculty workload in the four units a school actually speaks — Blueprint v6.
 *
 *   "Set workload / working hours per faculty, entered as either: Per week, or
 *    Per day. Editing one field auto-updates the other (i.e., per-day × working
 *    days = per-week, and vice versa)."
 *
 * Schools state this differently depending on who you ask. A principal says
 * "nobody teaches more than 5 periods a day"; a policy document says "20 hours
 * a week". Both are the same constraint, and the app should accept either
 * rather than making someone do the arithmetic — which is also how they get it
 * wrong.
 *
 * So there are two axes:
 *   • PERIOD vs DAY   — the span the cap covers
 *   • PERIODS vs HOURS — the unit it is counted in
 *
 * All four combinations reduce to periods internally, because the timetable is
 * built from periods; hours are a presentation of that.
 *
 * Rounding is deliberately asymmetric, and the reason matters:
 *   • per-week → per-day rounds UP. A weekly cap of 32 over 5 days is 6.4;
 *     rounding down to 6 would cap the week at 30 and quietly make the admin's
 *     own 32 unreachable. The daily figure is a shape constraint, the weekly one
 *     is the budget — the derived value must never contradict the stated one.
 *   • hours → periods rounds DOWN. A cap is a limit; granting a whole extra
 *     period because 20 h ÷ 45 min came to 26.7 would exceed the stated hours.
 */

export type WorkloadSpan = 'week' | 'day'
export type WorkloadUnit = 'periods' | 'hours'

export const SPAN_LABELS: Record<WorkloadSpan, string> = {
  week: 'Per week', day: 'Per day',
}
export const UNIT_LABELS: Record<WorkloadUnit, string> = {
  periods: 'Periods', hours: 'Hours',
}

/** Periods that fit in an hours figure. Rounds DOWN — see the note above. */
export function periodsFromHours(hours: number, periodMinutes: number): number {
  if (!(hours > 0) || !(periodMinutes > 0)) return 0
  return Math.floor((hours * 60) / periodMinutes)
}

/** Hours a period count represents, to one decimal. */
export function hoursFromPeriods(periods: number, periodMinutes: number): number {
  if (!(periods > 0) || !(periodMinutes > 0)) return 0
  return Math.round((periods * periodMinutes / 60) * 10) / 10
}

/** Per-day cap implied by a weekly one. Rounds UP — see the note above. */
export function perDayFromPerWeek(perWeek: number, workingDays: number): number {
  if (!(perWeek > 0) || !(workingDays > 0)) return 0
  return Math.ceil(perWeek / workingDays)
}

/** Weekly cap implied by a per-day one — the blueprint's "× working days". */
export function perWeekFromPerDay(perDay: number, workingDays: number): number {
  if (!(perDay > 0) || !(workingDays > 0)) return 0
  return perDay * workingDays
}

export interface WorkloadInput {
  /** What the admin typed. */
  value: number
  span: WorkloadSpan
  unit: WorkloadUnit
  workingDays: number
  periodMinutes: number
}

export interface WorkloadCaps {
  perWeek: number
  perDay: number
}

/**
 * Turn any of the four ways of stating a cap into both period figures.
 *
 * The span the admin CHOSE is authoritative and the other is derived, never the
 * reverse — otherwise typing "5 per day" and watching it become 6 (because 25
 * per week rounded back up) would look like the app arguing with them.
 */
export function resolveCaps(input: WorkloadInput): WorkloadCaps {
  const { value, span, unit, workingDays, periodMinutes } = input
  const periods = unit === 'hours' ? periodsFromHours(value, periodMinutes) : Math.max(0, Math.round(value))
  if (periods <= 0) return { perWeek: 0, perDay: 0 }
  return span === 'day'
    ? { perDay: periods, perWeek: perWeekFromPerDay(periods, workingDays) }
    : { perWeek: periods, perDay: perDayFromPerWeek(periods, workingDays) }
}

/** Show a cap in the unit the admin is currently working in. */
export function displayCap(periods: number, unit: WorkloadUnit, periodMinutes: number): number {
  return unit === 'hours' ? hoursFromPeriods(periods, periodMinutes) : periods
}

export interface StaffLike {
  maxPeriodsPerWeek?: number
  maxPeriodsPerDay?: number
}

/**
 * The caps actually in force for one teacher: their own overrides where set,
 * otherwise the school norm. A teacher who has only a weekly override still
 * gets a sensible daily shape derived from it, rather than falling back to the
 * norm's daily figure — which could contradict their own weekly number.
 */
export function effectiveCaps(
  staff: StaffLike | undefined,
  norm: WorkloadCaps,
  workingDays: number,
): WorkloadCaps & { weekOverridden: boolean; dayOverridden: boolean } {
  const wk = staff?.maxPeriodsPerWeek
  const dy = staff?.maxPeriodsPerDay
  const weekOverridden = !!(wk && wk > 0)
  const dayOverridden = !!(dy && dy > 0)
  const perWeek = weekOverridden ? wk! : norm.perWeek
  const perDay = dayOverridden
    ? dy!
    // No daily override: derive from whichever weekly figure applies, so the two
    // always agree with each other.
    : perDayFromPerWeek(perWeek, workingDays)
  return { perWeek, perDay, weekOverridden, dayOverridden }
}

/**
 * Is this teacher already at their daily limit? The engine asks this before
 * placing another period, which is what makes the per-day cap a real constraint
 * rather than a number on a form.
 */
export function atDailyLimit(loadToday: number, perDay: number): boolean {
  return perDay > 0 && loadToday >= perDay
}
