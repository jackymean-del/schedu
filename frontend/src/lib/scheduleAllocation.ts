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
import { localISO } from './days'
import { scheduledHoursBetween } from './syllabusPace'
import type { ScheduleBundle } from './activeSchedules'
import type { Holiday } from './holidays'
import { clampToTerm, type AcademicTerm } from './academicTerms'

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

/** The date range a bundle runs over, if it declares one. */
export function termOf(b: ScheduleBundle): { start: string; end: string } | null {
  const start = b.config?.timetableStartDate, end = b.config?.timetableEndDate
  return start && end ? { start, end } : null
}

/**
 * The window to count hours over: the schedule's own range, narrowed to the
 * chosen academic term.
 *
 * Null means count nothing — either the schedule declares no dates, or it never
 * ran during that term. The second case is the reason this returns null rather
 * than falling back to the full range: a schedule that started in September
 * must contribute zero to a term that ended in August, not a year's hours.
 */
function windowFor(b: ScheduleBundle, term?: AcademicTerm | null): { start: string; end: string } | null {
  const range = termOf(b)
  if (!range) return null
  return clampToTerm(range, term)
}

/**
 * The class-sections a schedule ACTUALLY has right now: present in its roster
 * AND present in its generated timetable.
 *
 * Both halves matter. classTT alone is not enough — a generated timetable keeps
 * whatever sections existed when it was generated, so a school that has since
 * dropped its Nursery classes still had "Nursery-A…D" appearing in every picker,
 * labelled with the schedule they were removed from. The roster alone is not
 * enough either — a section nobody scheduled has no hours and would only add an
 * empty row. The intersection is the honest answer to "what does this schedule
 * cover?", and it self-heals: regenerate, and stale keys drop out.
 *
 * A bundle with no roster at all (older snapshots didn't always store one) falls
 * back to the timetable's keys rather than showing nothing.
 */
export function liveSections(b: ScheduleBundle): string[] {
  const scheduled = Object.keys(b.classTT ?? {})
  const roster = (b.sections ?? []).map((s: any) => s?.name).filter(Boolean) as string[]
  if (roster.length === 0) return scheduled
  const inRoster = new Set(roster)
  return scheduled.filter(s => inRoster.has(s))
}

/**
 * planKey → hours the timetable allocates to that subject over the whole term.
 *
 * Deliberately NOT holiday-adjusted: this is what the school set aside, and
 * holidays/absences are then reported against it as lost time (see
 * lib/effectiveCoverage). Subtracting them here as well would count them twice
 * — once invisibly in the denominator, once in the "h lost" figure.
 */
export function allocatedHoursByPlan(bundles: ScheduleBundle[], term?: AcademicTerm | null): Record<string, number> {
  const out: Record<string, number> = {}
  for (const b of bundles) {
    const win = windowFor(b, term)
    if (!win) continue
    const periodMinutes = b.config?.periodMinutes ?? 40
    for (const section of liveSections(b)) {
      for (const subject of subjectsIn(b.classTT, section)) {
        const h = scheduledHoursBetween(b.classTT, subject, section, win.start, win.end, periodMinutes, [])
        if (h > 0) out[planKey(subject, section)] = Math.round(((out[planKey(subject, section)] ?? 0) + h) * 10) / 10
      }
    }
  }
  return out
}

/**
 * Hours of this subject that have ALREADY RUN — term start up to today.
 *
 * "Spent" is not something anyone should type either: the schedule is published,
 * so the app knows which periods have happened. Kept strictly separate from
 * coverage, which only ever moves when faculty record content. Conflating them
 * is the mistake Blueprint v6 exists to prevent — a teacher can spend ten hours
 * and cover one chapter.
 */
export function elapsedHoursByPlan(
  bundles: ScheduleBundle[],
  todayISO: string,
  holidaysFor?: (section: string) => Holiday[],
  term?: AcademicTerm | null,
): Record<string, number> {
  const out: Record<string, number> = {}
  for (const b of bundles) {
    const win = windowFor(b, term)
    if (!win) continue
    // Nothing has run before the term, and it stops accruing once it ends.
    if (todayISO < win.start) continue
    const upto = todayISO > win.end ? win.end : todayISO
    const periodMinutes = b.config?.periodMinutes ?? 40
    for (const section of liveSections(b)) {
      for (const subject of subjectsIn(b.classTT, section)) {
        const h = scheduledHoursBetween(
          b.classTT, subject, section, win.start, upto, periodMinutes, holidaysFor?.(section) ?? [],
        )
        const k = planKey(subject, section)
        if (h > 0) out[k] = Math.round(((out[k] ?? 0) + h) * 10) / 10
      }
    }
  }
  return out
}

/**
 * Hours of this subject STILL TO COME — tomorrow up to the end of term.
 *
 * Derived the same way as elapsed rather than as (allocated − spent), because
 * those two are measured differently on purpose: allocated is the full term as
 * planned, spent has holidays removed. Subtracting one from the other would
 * hand back every past holiday as though it were still available. Keeping this
 * separate means allocated = spent + left + time lost, and the "h lost" line
 * accounts for the difference.
 */
export function futureHoursByPlan(
  bundles: ScheduleBundle[],
  todayISO: string,
  holidaysFor?: (section: string) => Holiday[],
  term?: AcademicTerm | null,
): Record<string, number> {
  const out: Record<string, number> = {}
  for (const b of bundles) {
    const win = windowFor(b, term)
    if (!win) continue
    if (todayISO >= win.end) continue                       // the term is over
    // From TOMORROW, so today is never counted as both spent and still to come.
    const from = todayISO < win.start ? win.start : nextDay(todayISO)
    const periodMinutes = b.config?.periodMinutes ?? 40
    for (const section of liveSections(b)) {
      for (const subject of subjectsIn(b.classTT, section)) {
        const h = scheduledHoursBetween(
          b.classTT, subject, section, from, win.end, periodMinutes, holidaysFor?.(section) ?? [],
        )
        const k = planKey(subject, section)
        if (h > 0) out[k] = Math.round(((out[k] ?? 0) + h) * 10) / 10
      }
    }
  }
  return out
}

/** Calendar arithmetic, never UTC — see the note in syllabusPace about IST. */
function nextDay(iso: string): string {
  const d = new Date(`${iso.slice(0, 10)}T00:00:00`)
  d.setDate(d.getDate() + 1)
  return localISO(d)
}

/** One (section, subject, teacher) the timetable actually assigns. */
export interface Assignment {
  section: string
  subject: string
  /** '' when the slot carries no teacher. */
  teacher: string
  scheduleName: string
}

/**
 * Who teaches what, to whom — read straight off the active timetables.
 *
 * This is what lets the three pickers cascade from ANY starting point: choose a
 * faculty member and only their classes and subjects remain; choose a section and
 * only the subjects it is taught appear; choose a subject and only the sections
 * and staff attached to it. It also means nobody has to tell the syllabus page
 * who teaches a subject — the schedule already said.
 */
export function teachingMap(bundles: ScheduleBundle[]): Assignment[] {
  const seen = new Set<string>()
  const out: Assignment[] = []
  for (const b of bundles) {
    for (const section of liveSections(b)) {
      const days = (b.classTT as any)?.[section] ?? {}
      for (const dayKey of Object.keys(days)) {
        const slots = days[dayKey] ?? {}
        for (const periodId of Object.keys(slots)) {
          const cell: any = slots[periodId]
          if (!cell) continue
          const pairs: Array<{ subject: string; teacher: string }> = cell.groupAssignments?.length
            ? cell.groupAssignments.map((g: any) => ({ subject: g?.subject ?? cell.subject, teacher: g?.teacher ?? cell.teacher ?? '' }))
            : [{ subject: cell.subject, teacher: cell.teacher ?? '' }]
          for (const p of pairs) {
            if (!p.subject) continue
            const k = `${section}||${p.subject}||${p.teacher}`
            if (seen.has(k)) continue
            seen.add(k)
            out.push({ section, subject: p.subject, teacher: p.teacher ?? '', scheduleName: b.name })
          }
        }
      }
    }
  }
  return out
}

export interface Selection { teacher?: string; section?: string; subject?: string }

/** The assignments still possible given a partial selection. */
export function matching(map: Assignment[], sel: Selection): Assignment[] {
  return map.filter(a =>
    (!sel.teacher || a.teacher === sel.teacher) &&
    (!sel.section || a.section === sel.section) &&
    (!sel.subject || a.subject === sel.subject))
}

/**
 * Options for each picker, each computed from the OTHER two selections — so
 * every dropdown only ever offers combinations that exist.
 */
export function cascadeOptions(map: Assignment[], sel: Selection) {
  const uniq = (xs: string[]) => [...new Set(xs.filter(Boolean))]
  return {
    sections: uniq(matching(map, { teacher: sel.teacher, subject: sel.subject }).map(a => a.section)).sort(compareSection),
    subjects: uniq(matching(map, { teacher: sel.teacher, section: sel.section }).map(a => a.subject)).sort((a, b) => a.localeCompare(b)),
    teachers: uniq(matching(map, { section: sel.section, subject: sel.subject }).map(a => a.teacher)).sort((a, b) => a.localeCompare(b)),
  }
}

/** The teacher the timetable assigns to a (subject, section), if any. */
export function teacherFor(map: Assignment[], subject: string, section: string): string {
  return matching(map, { subject, section }).map(a => a.teacher).filter(Boolean)[0] ?? ''
}

/**
 * Match a signed-in person to a name in the timetable. Staff are identified by
 * name here, so compare case- and space-insensitively and fall back to the local
 * part of their email — enough to recognise "anita.sharma@school.edu" as "Anita
 * Sharma" without pretending to be an identity system.
 */
export function matchStaffName(map: Assignment[], user?: { name?: string; email?: string }): string | undefined {
  const names = [...new Set(map.map(a => a.teacher).filter(Boolean))]
  const norm = (s: string) => s.trim().toLowerCase().replace(/[._-]+/g, ' ').replace(/\s+/g, ' ')
  const candidates = [user?.name, user?.email?.split('@')[0]].filter(Boolean) as string[]
  for (const c of candidates) {
    const hit = names.find(n => norm(n) === norm(c))
    if (hit) return hit
  }
  return undefined
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
export function contextForSection(
  bundles: ScheduleBundle[],
  section: string,
  term?: AcademicTerm | null,
): ScheduleContext | null {
  const b = bundles.find(x => liveSections(x).includes(section))
  if (!b) return null
  // Pace must be measured over the same window as the hours beside it — a
  // "behind by 6 h" that was computed over the year while the hours on screen
  // were the term's would be two different questions sharing one row.
  const win = windowFor(b, term)
  return {
    classTT: b.classTT,
    periodMinutes: b.config?.periodMinutes ?? 40,
    termStart: win?.start, termEnd: win?.end,
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
    // Only sections the schedule currently has — see liveSections for why the
    // timetable's keys alone were showing classes the school had dropped.
    for (const s of liveSections(b)) {
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
