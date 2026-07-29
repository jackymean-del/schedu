/**
 * What the TIMETABLE says each subject gets — across every ACTIVE schedule.
 *
 * Two things were wrong without this.
 *
 * 1. The Syllabus page asked people to type "hours needed to cover the
 *    syllabus". Nobody should have to: once a timetable exists it already says
 *    exactly how many hours English · Nursery-A gets between the term dates.
 *    Typing a second, unrelated number invites it to disagree with reality.
 *
 * 2. It read the single OPEN schedule, so a school running "I–V TT" and
 *    "VI–X TT" side by side saw only whichever was last opened — three
 *    class-sections instead of forty-five. Ops surfaces must see the UNION of
 *    active schedules (see lib/activeSchedules); the Syllabus page is one.
 *
 * Every bundle keeps its own bell and its own term dates, so allocation is
 * computed PER BUNDLE with that bundle's own period length and calendar, then
 * summed by (subject, section). Merging the timetables first and applying one
 * period length would quietly mis-price every schedule but one.
 */
import { planKey } from './syllabusTracking'
import { scheduledHoursBetween } from './syllabusPace'
import type { ScheduleBundle } from './activeSchedules'

/** Subjects that actually appear in one section of one bundle's timetable. */
function subjectsIn(classTT: any, section: string): Set<string> {
  const out = new Set<string>()
  const days = classTT?.[section] ?? {}
  for (const dayKey of Object.keys(days)) {
    const slots = days[dayKey] ?? {}
    for (const periodId of Object.keys(slots)) {
      const cell: any = slots[periodId]
      if (!cell) continue
      // OR/AND cells can carry several subjects in one slot.
      if (cell.groupAssignments?.length) {
        for (const g of cell.groupAssignments) { const s = g?.subject ?? cell.subject; if (s) out.add(s) }
      } else if (cell.subject) out.add(cell.subject)
    }
  }
  return out
}

/** The term a bundle runs over, if it declares one. */
export function termOf(b: ScheduleBundle): { start: string; end: string } | null {
  const start = b.config?.timetableStartDate, end = b.config?.timetableEndDate
  return start && end ? { start, end } : null
}

/**
 * planKey → hours the timetable allocates to that subject over the whole term.
 *
 * Deliberately NOT holiday-adjusted: this is what the school set aside, and
 * holidays/absences are then reported against it as lost time (see
 * lib/effectiveCoverage). Subtracting them here as well would count them twice
 * — once invisibly in the denominator, once in the "h lost" figure.
 */
export function allocatedHoursByPlan(bundles: ScheduleBundle[]): Record<string, number> {
  const out: Record<string, number> = {}
  for (const b of bundles) {
    const term = termOf(b)
    if (!term) continue
    const periodMinutes = b.config?.periodMinutes ?? 40
    for (const section of Object.keys(b.classTT ?? {})) {
      for (const subject of subjectsIn(b.classTT, section)) {
        const h = scheduledHoursBetween(b.classTT, subject, section, term.start, term.end, periodMinutes, [])
        if (h > 0) out[planKey(subject, section)] = Math.round(((out[planKey(subject, section)] ?? 0) + h) * 10) / 10
      }
    }
  }
  return out
}

export interface ScheduleContext {
  classTT: any
  periodMinutes: number
  termStart?: string
  termEnd?: string
  scheduleName?: string
}

/**
 * The bundle that owns a section — pace and allocation for that section must be
 * computed against ITS bell and ITS term, not a merged approximation.
 */
export function contextForSection(bundles: ScheduleBundle[], section: string): ScheduleContext | null {
  const b = bundles.find(x => Object.keys(x.classTT ?? {}).includes(section))
  if (!b) return null
  const term = termOf(b)
  return {
    classTT: b.classTT,
    periodMinutes: b.config?.periodMinutes ?? 40,
    termStart: term?.start, termEnd: term?.end,
    scheduleName: b.name,
  }
}

export interface UnionEntities {
  sections: string[]
  subjects: string[]
  staff: string[]
  /** section → the schedule it belongs to, for labelling in a mixed list. */
  scheduleOf: Record<string, string>
  /**
   * section → the subjects actually taught to it. Offering every subject in the
   * school for every section invites combinations that don't exist ("English in
   * X-A"), which can only ever read zero.
   */
  subjectsBySection: Record<string, string[]>
}

/** Everything the active schedules collectively contain, de-duplicated. */
export function unionEntities(bundles: ScheduleBundle[]): UnionEntities {
  const sections: string[] = [], subjects = new Set<string>(), staff = new Set<string>()
  const scheduleOf: Record<string, string> = {}
  const subjectsBySection: Record<string, string[]> = {}
  for (const b of bundles) {
    // Sections come from the timetable itself, so a section that exists in the
    // master list but was never scheduled doesn't create an empty row.
    for (const s of Object.keys(b.classTT ?? {})) {
      if (!sections.includes(s)) { sections.push(s); scheduleOf[s] = b.name }
      const mine = subjectsBySection[s] ?? (subjectsBySection[s] = [])
      for (const subj of subjectsIn(b.classTT, s)) {
        subjects.add(subj)
        if (!mine.includes(subj)) mine.push(subj)
      }
    }
    for (const t of b.staff ?? []) if (t?.name) staff.add(t.name)
  }
  for (const s in subjectsBySection) subjectsBySection[s].sort((a, b) => a.localeCompare(b))
  return {
    sections: sections.sort(compareSection),
    subjects: [...subjects].sort((a, b) => a.localeCompare(b)),
    staff: [...staff].sort((a, b) => a.localeCompare(b)),
    scheduleOf, subjectsBySection,
  }
}

/**
 * Order class-sections the way a school lists them — Nursery before I, I before
 * II, X-A before X-B — rather than alphabetically, where "X-A" lands before
 * "II-A" and nobody can find their class.
 */
const ORDER_HINTS = ['PRE', 'NUR', 'LKG', 'UKG', 'KG', 'PREP']
const ROMAN: Record<string, number> = { I: 1, V: 5, X: 10, L: 50, C: 100, D: 500, M: 1000 }

/** Numeric rank of a class label: Nursery-type names first, then roman, then arabic. */
export function classRank(label: string): number {
  const s = (label ?? '').trim().toUpperCase()
  const hint = ORDER_HINTS.findIndex(h => s.startsWith(h))
  if (hint >= 0) return -100 + hint
  const arabic = s.match(/^(\d+)/)
  if (arabic) return Number(arabic[1])
  const roman = s.match(/^([IVXLCDM]+)/)
  if (roman) return romanToInt(roman[1])
  return 1000
}

function romanToInt(r: string): number {
  let total = 0
  for (let i = 0; i < r.length; i++) {
    const cur = ROMAN[r[i]] ?? 0, next = ROMAN[r[i + 1]] ?? 0
    total += cur < next ? -cur : cur
  }
  return total
}

export function compareSection(a: string, b: string): number {
  const ra = classRank(a), rb = classRank(b)
  return ra - rb || a.localeCompare(b, undefined, { numeric: true })
}
