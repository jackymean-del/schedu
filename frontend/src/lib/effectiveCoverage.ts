/**
 * The one place that answers "what do the syllabus numbers actually look like?"
 *
 * Four separate things eat into a subject's teaching time, and each is derived
 * from its own source rather than typed in anywhere:
 *
 *   1. declared holidays          (lib/holidays)
 *   2. cover that didn't carry the syllabus forward   (lib/substitutionCoverage)
 *   3. an absence nobody covered  (lib/substitutionCoverage)
 *   4. periods faculty logged as missed  (already on the plan)
 *
 * The Syllabus page and the always-on dashboard alert must agree on all four —
 * an alert that shows a rosier picture than the page it links to is worse than
 * no alert. So the composition lives here and both consume it, instead of each
 * assembling its own and drifting the first time a fifth source appears.
 */
import { useMemo } from 'react'
import { useSyllabus, withHolidayImpact, withLostImpact, type SyllabusPlan } from './syllabusTracking'
import { useHolidays, holidayImpact, type Holiday } from './holidays'
import { useSubCoverage, coverageLoss, hoursNotSpent, uncoveredAbsenceLoss } from './substitutionCoverage'
import { loadLeaves, type CalLeave } from './leaveUtils'
import { useTimetableStore } from '@/store/timetableStore'
import { useAuthStore } from '@/store/authStore'

/** Was this section out of school on this date anyway? */
export function holidayPredicate(holidays: Holiday[]) {
  return (date: string, section: string) =>
    holidays.some(h =>
      h.date === date && (!h.sections?.length || h.sections.includes(section)))
}

const NOTE = {
  substitution: (n: number) => n > 1
    ? `${n} covered periods that didn't advance the syllabus`
    : `A covered period that didn't advance the syllabus`,
  absence: (n: number) => n > 1
    ? `${n} days absent with no cover arranged`
    : `Absent with no cover arranged`,
}

/**
 * Fold every derived loss into the plans. Pure, so the same composition can be
 * unit-tested and reused outside React.
 */
export function composeEffectivePlans(input: {
  plans: Record<string, SyllabusPlan>
  classTT: any
  holidays: Holiday[]
  subRecords: Parameters<typeof coverageLoss>[0]
  leaves: CalLeave[]
  periodMinutes: number
}): Record<string, SyllabusPlan> {
  const { plans, classTT, holidays, subRecords, leaves, periodMinutes } = input
  const withHolidays = withHolidayImpact(plans, holidayImpact(classTT ?? {}, holidays, periodMinutes))
  const withSubs = withLostImpact(withHolidays, coverageLoss(subRecords), {
    reason: 'absence', idPrefix: 'substitution', note: NOTE.substitution,
  })
  return withLostImpact(
    withSubs,
    uncoveredAbsenceLoss(leaves, classTT ?? {}, subRecords, periodMinutes, holidayPredicate(holidays)),
    { reason: 'absence', idPrefix: 'uncovered', note: NOTE.absence },
  )
}

export interface EffectiveCoverage {
  plans: Record<string, SyllabusPlan>
  holidays: Holiday[]
  leaves: CalLeave[]
  periodMinutes: number
  /** planKey → hours that ran but went to another subject (pace correction). */
  notSpent: Record<string, number>
}

/** The hook every coverage surface should use. */
export function useEffectiveCoverage(): EffectiveCoverage {
  const plans = useSyllabus(s => s.plans)
  const holidays = useHolidays(s => s.holidays)
  const subRecords = useSubCoverage(s => s.records)
  const classTT = useTimetableStore(s => (s as any).classTT)
  const periodMinutes = useTimetableStore(s => (s as any).config?.periodMinutes) ?? 40
  const uid = useAuthStore(s => s.user?.id) ?? ''
  // Leave still lives in localStorage rather than a store; re-read when the
  // user or the timetable changes, which is when it can have moved.
  const leaves = useMemo(() => loadLeaves(uid), [uid])

  const effective = useMemo(
    () => composeEffectivePlans({ plans, classTT, holidays, subRecords, leaves, periodMinutes }),
    [plans, classTT, holidays, subRecords, leaves, periodMinutes],
  )
  const notSpent = useMemo(() => hoursNotSpent(subRecords), [subRecords])

  return { plans: effective, holidays, leaves, periodMinutes, notSpent }
}
