/**
 * One answer to "how many periods a week may this teacher carry?"
 *
 * The codebase had five different answers: `?? 40` in about twenty consumers,
 * `?? 32` in the allocation passes, `?? 30` in Resources, `36` in orgData's own
 * country table, and `MAX_SLOTS - 2` in the seeder. India's safe load happens to
 * be 30, so the figures looked plausible there and were 20–100% over everywhere
 * else - a UK teacher capped at 40 against a 22-period norm.
 *
 * A literal is only ever right for the one country whose norm happens to match
 * it. So the fallback is the NORM, resolved from the school's country and its
 * own custom override.
 *
 * Two flavours deliberately:
 *   • schoolTeacherCap() reads the stores - for UI and report code.
 *   • the scheduling engine takes the number as an INPUT instead, so it stays a
 *     pure function that can be tested deterministically and moved to a worker
 *     without dragging localStorage-backed stores in behind it.
 */
import { lessonMinutes } from './lessonLength'
import { effectiveTeacherMaxPeriods } from './educationNorms'
import { useWorkloadLimits, schoolCountry } from '@/store/workloadLimits'
import { useTimetableStore } from '@/store/timetableStore'

/** Last-resort figure when even the stores can't be read (SSR, tests, worker). */
export const HARD_FALLBACK_CAP = 30

/**
 * The school-wide default cap in periods/week: the admin's custom teaching hours
 * if set, otherwise the country's safe teaching norm.
 */
export function schoolTeacherCap(): number {
  try {
    const cfg = (useTimetableStore.getState() as any)?.config
    const limits = useWorkloadLimits.getState()
    const country = schoolCountry(cfg?.countryCode)
    const periodMinutes = lessonMinutes(cfg)
    return effectiveTeacherMaxPeriods(country, periodMinutes, limits?.teacherMaxHoursWeek)
  } catch {
    return HARD_FALLBACK_CAP
  }
}

/**
 * The cap in force for one teacher - their own figure when set, else the school
 * default. Every consumer that used to write `?? 40` should call this.
 */
export function teacherWeeklyCap(staff: { maxPeriodsPerWeek?: number } | undefined | null): number {
  const own = staff?.maxPeriodsPerWeek
  if (own && own > 0) return own
  return schoolTeacherCap()
}

/**
 * Move the teachers who were FOLLOWING the school norm onto a new one.
 *
 * Generating resources stamps the norm in force at that moment onto every
 * teacher as their own maxPeriodsPerWeek, and a teacher's own figure always
 * outranks the school's (teacherWeeklyCap above). So changing the school-wide
 * workload afterwards reached nobody: the stamped figure sat on every teacher
 * and the new setting was written and never read.
 *
 * A teacher whose cap equals the OLD norm was following it, and moves. Any
 * other figure was given on purpose - a part-timer, a head of department -
 * and is left exactly as it is. Returns null when nothing changes, so the
 * caller can skip a write.
 */
export function carryStaffToNorm<T extends { maxPeriodsPerWeek?: number }>(
  staff: T[], before: number, after: number,
): T[] | null {
  if (!staff.length || before === after) return null
  let moved = 0
  const next = staff.map(t => {
    if (t?.maxPeriodsPerWeek === before) { moved++; return { ...t, maxPeriodsPerWeek: after } }
    return t
  })
  return moved ? next : null
}
