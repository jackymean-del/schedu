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
import { useSyllabus, withHolidayImpact, withLostImpact, withAllocatedHours, type SyllabusPlan } from './syllabusTracking'
import { useHolidays, holidayImpact, type Holiday } from './holidays'
import { useSubCoverage, coverageLoss, hoursNotSpent, uncoveredAbsenceLoss } from './substitutionCoverage'
import { useLeaves, type CalLeave } from './leaveUtils'
import type { AcademicTerm } from './academicTerms'
import { loadActiveBundles, type ScheduleBundle } from './activeSchedules'
import {
  allocatedHoursByPlan, elapsedHoursByPlan, futureHoursByPlan, unionEntities, contextForSection,
  teachingMap, teacherFor,
  type UnionEntities, type Assignment,
} from './scheduleAllocation'
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
  /** Every ACTIVE schedule — losses are derived per bundle, using its own bell. */
  bundles: ScheduleBundle[]
  holidays: Holiday[]
  subRecords: Parameters<typeof coverageLoss>[0]
  leaves: CalLeave[]
  /** Narrow every derived figure to one academic term. Omit for the whole run. */
  term?: AcademicTerm | null
}): Record<string, SyllabusPlan> {
  const { plans, bundles, holidays, subRecords, leaves, term } = input

  // Requirement first: everything below is expressed against it.
  let out = withAllocatedHours(plans, allocatedHoursByPlan(bundles, term))

  // The timetable also says who teaches each subject, so faculty-wise reports
  // need nobody to fill that in. An explicitly-set teacher still wins.
  const map = teachingMap(bundles)
  for (const key in out) {
    const p = out[key]
    if (p.teacher) continue
    const t = teacherFor(map, p.subject, p.section)
    if (t) out[key] = { ...p, teacher: t }
  }

  // Holidays and uncovered absences are counted PER SCHEDULE, because each one
  // has its own period length — merging the timetables and applying a single
  // figure would mis-price every schedule but one.
  for (const b of bundles) {
    const periodMinutes = b.config?.periodMinutes ?? 40
    out = withHolidayImpact(out, holidayImpact(b.classTT ?? {}, holidays, periodMinutes))
    out = withLostImpact(
      out,
      uncoveredAbsenceLoss(leaves, b.classTT ?? {}, subRecords, periodMinutes, holidayPredicate(holidays)),
      { reason: 'absence', idPrefix: `uncovered:${b.id}`, note: NOTE.absence },
    )
  }

  // Substitution records already carry their own hours, so they need no bundle.
  return withLostImpact(out, coverageLoss(subRecords), {
    reason: 'absence', idPrefix: 'substitution', note: NOTE.substitution,
  })
}

export interface EffectiveCoverage {
  plans: Record<string, SyllabusPlan>
  holidays: Holiday[]
  leaves: CalLeave[]
  /** Class-sections, subjects and staff across ALL active schedules. */
  entities: UnionEntities
  /** The owning schedule's bell/term for a section — pace needs the right one. */
  contextFor: (section: string) => ReturnType<typeof contextForSection>
  /** planKey → hours that ran but went to another subject (pace correction). */
  notSpent: Record<string, number>
  /**
   * planKey → hours of this subject that have already run, holidays removed.
   * Derived from the published schedule; NEVER a measure of coverage.
   */
  elapsed: Record<string, number>
  /** planKey → hours still scheduled before the term ends, holidays removed. */
  future: Record<string, number>
  /** Who teaches what, for cascading pickers and faculty-scoped views. */
  teaching: Assignment[]
  /** How many schedules are currently active. */
  activeCount: number
}

/**
 * The hook every coverage surface should use.
 *
 * `term` narrows every hours figure to that academic term (lib/academicTerms).
 * Undefined — the default — means the whole of each schedule, which is exactly
 * what every caller got before terms existed.
 */
export function useEffectiveCoverage(term?: AcademicTerm | null): EffectiveCoverage {
  const plans = useSyllabus(s => s.plans)
  const holidays = useHolidays(s => s.holidays)
  const subRecords = useSubCoverage(s => s.records)
  const uid = useAuthStore(s => s.user?.id) ?? ''
  // Re-read when the OPEN schedule changes: publishing or switching a schedule
  // is exactly when the active set moves.
  const openTT = useTimetableStore(s => (s as any).classTT)

  // Coverage spans every ACTIVE schedule, not whichever one happens to be open
  // — a school running "I–V TT" and "VI–X TT" side by side was seeing only the
  // last one it opened. Falls back to the open store when nothing is published
  // yet, so a draft still shows its own sections.
  const bundles = useMemo<ScheduleBundle[]>(() => {
    const active = loadActiveBundles(uid)
    if (active.length > 0) return active
    const st = useTimetableStore.getState() as any
    if (!Object.keys(st.classTT ?? {}).length) return []
    return [{
      id: 'open', name: st.config?.timetableName ?? 'Current schedule',
      sections: st.sections ?? [], staff: st.staff ?? [], rooms: st.rooms ?? [],
      subjects: st.subjects ?? [], periods: st.periods ?? [], config: st.config ?? {},
      classTT: st.classTT ?? {}, substitutions: st.substitutions ?? {},
    }]
  }, [uid, openTT])

  // Leave still lives in localStorage rather than a store; re-read when the
  // user or the timetable changes, which is when it can have moved.
  const leaves = useLeaves(s => s.leaves)

  const effective = useMemo(
    () => composeEffectivePlans({ plans, bundles, holidays, subRecords, leaves, term }),
    [plans, bundles, holidays, subRecords, leaves, term],
  )
  const entities = useMemo(() => unionEntities(bundles), [bundles])
  const notSpent = useMemo(() => hoursNotSpent(subRecords), [subRecords])
  const teaching = useMemo(() => teachingMap(bundles), [bundles])
  const todayISO = useMemo(() => {
    const d = new Date()
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  }, [])
  // A holiday means the period didn't run, so it is neither time spent nor time
  // still to come.
  const forSection = useMemo(
    () => (section: string) => holidays.filter(h => !h.sections?.length || h.sections.includes(section)),
    [holidays],
  )
  const elapsed = useMemo(() => elapsedHoursByPlan(bundles, todayISO, forSection, term), [bundles, todayISO, forSection, term])
  const future = useMemo(() => futureHoursByPlan(bundles, todayISO, forSection, term), [bundles, todayISO, forSection, term])

  return {
    plans: effective, holidays, leaves, entities, notSpent, elapsed, future, teaching,
    activeCount: bundles.length,
    contextFor: (section: string) => contextForSection(bundles, section, term),
  }
}
