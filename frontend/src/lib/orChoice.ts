/**
 * WHICH SUBJECT AN "OR" PERIOD ACTUALLY RUNS.
 *
 * An OR group is a subject CHOICE for a whole class — "Physics OR Chemistry" —
 * not a student split. Every student in the room takes whichever one runs, so
 * an OR group may only contain subjects the entire class takes; optional and
 * elective subjects belong in AND groups, which is where student groups live.
 *
 * The choice is decided by SYLLABUS COVERAGE: the subject further behind gets
 * the period. That makes an OR slot a self-correcting catch-up mechanism —
 * whichever subject has fallen behind quietly claims the next one, without
 * anybody having to notice and intervene.
 *
 * The solver cannot make this call. It runs before term, and coverage is a
 * fact about what has actually been taught since. So the slot is reserved at
 * generation time — both teachers held, the period kept free — and the subject
 * is resolved here, from live coverage, whenever the day is displayed.
 *
 * WHAT THIS REFUSES TO GUESS. A subject with no coverage signal at all is not
 * "0% covered": it is untracked. Treating the two the same would hand every OR
 * period to whichever subject nobody is recording, forever, and call it
 * catch-up. So a comparison only decides the choice when both sides are
 * tracked; otherwise the choice falls back to a stable order and says so. A
 * school that sees "not enough coverage data to choose" can go and record some;
 * a school shown a confident wrong answer cannot.
 */
import { contentFraction, hasContentSignal, planKey, type SyllabusPlan } from './syllabusTracking'
import { teachingPairsInCell } from './cellTeachers'

export interface OrOption {
  subject: string
  teacher?: string
  room?: string
}

/**
 * A decision recorded by a person, for one date.
 *
 * Dated, not permanent — exactly like a substitution, and for the same reason.
 * "We are doing Physics this Tuesday because I have the lab" is a fact about
 * Tuesday; writing it into the timetable would make it true every Tuesday until
 * somebody noticed. The base timetable keeps holding the CHOICE; only the
 * overlay says which way one particular day went.
 */
export interface OrDecision {
  /** The subject the class will actually take. */
  subject: string
  /** Who decided, when there is a name to record. */
  by?: string
  /** ISO timestamp, for showing "decided this morning" rather than a mystery. */
  at?: string
}

/** The key an OR decision is stored under — same shape as a substitution. */
export const orDecisionKey = (section: string, isoDate: string, periodId: string) =>
  `${section}|${isoDate}|${periodId}`

export type OrReason =
  /** A person chose, for this date. Beats coverage — they know something it does not. */
  | 'manual'
  /** Both tracked, and one is genuinely further behind. */
  | 'behind'
  /** Both tracked and level — settled by a stable order, not a coin toss. */
  | 'tied'
  /** One or both untracked, so coverage cannot decide it. */
  | 'untracked'
  /** Nothing to choose between. */
  | 'only-option'

export interface OrChoice {
  /** The subject to teach. */
  subject: string
  option: OrOption
  reason: OrReason
  /** Coverage per option, 0–1, for showing the working. Undefined = untracked. */
  coverage: Array<{ subject: string; fraction?: number }>
  /** One line a human can read, for the cell and the day view. */
  explain: string
}

const pct = (f: number) => `${Math.round(f * 100)}%`

/**
 * Resolve an OR period for one section.
 *
 * `plans` is the syllabus store's map, keyed by planKey(subject, section) —
 * the same map every other coverage surface reads.
 */
export function resolveOrChoice(
  options: OrOption[],
  section: string,
  plans: Record<string, SyllabusPlan> | undefined,
  /**
   * What a person decided for THIS date, if they did. It wins outright:
   * coverage is a good default, not an instruction, and the teacher standing
   * in front of the class knows things the syllabus percentages do not — a lab
   * free this morning, an exam next week, a topic half-finished.
   */
  manual?: OrDecision | string,
): OrChoice | null {
  const live = options.filter(o => o?.subject?.trim())
  if (!live.length) return null

  const decided = typeof manual === 'string' ? { subject: manual } : manual
  if (decided?.subject) {
    const chosen = live.find(o => o.subject === decided.subject)
    if (chosen) {
      const who = decided.by ? ` by ${decided.by}` : ''
      return {
        subject: chosen.subject, option: chosen, reason: 'manual',
        coverage: live.map(o => ({
          subject: o.subject,
          fraction: hasContentSignal(plans?.[planKey(o.subject, section)])
            ? contentFraction(plans?.[planKey(o.subject, section)]) : undefined,
        })),
        explain: `${chosen.subject} — chosen${who} for this day.`,
      }
    }
    // A decision naming a subject that is not in the group is stale (the group
    // was edited since). Fall through to coverage rather than honour it.
  }

  const measured = live.map(o => {
    const plan = plans?.[planKey(o.subject, section)]
    const tracked = hasContentSignal(plan)
    return { option: o, tracked, fraction: tracked ? contentFraction(plan) : undefined }
  })

  const coverage = measured.map(m => ({ subject: m.option.subject, fraction: m.fraction }))

  if (live.length === 1) {
    return {
      subject: live[0].subject, option: live[0], reason: 'only-option', coverage,
      explain: `${live[0].subject} — the only subject in this group.`,
    }
  }

  const tracked = measured.filter(m => m.tracked)
  if (tracked.length < 2) {
    // Not enough signal to compare. Stable order, and say why plainly.
    const pick = measured[0]
    return {
      subject: pick.option.subject, option: pick.option, reason: 'untracked', coverage,
      explain: tracked.length === 0
        ? `${pick.option.subject} by default — no syllabus coverage recorded for either subject yet.`
        : `${pick.option.subject} by default — ${measured.find(m => !m.tracked)!.option.subject} has no coverage recorded, so the two cannot be compared.`,
    }
  }

  // Both tracked: the one further behind takes the period.
  const sorted = [...tracked].sort((a, b) =>
    (a.fraction! - b.fraction!) || a.option.subject.localeCompare(b.option.subject))
  const first = sorted[0], second = sorted[1]

  if (Math.abs(first.fraction! - second.fraction!) < 0.005) {
    return {
      subject: first.option.subject, option: first.option, reason: 'tied', coverage,
      explain: `${first.option.subject} — level with ${second.option.subject} at ${pct(first.fraction!)}, so the first by name takes it.`,
    }
  }

  return {
    subject: first.option.subject, option: first.option, reason: 'behind', coverage,
    explain: `${first.option.subject} — ${pct(first.fraction!)} covered against ${second.option.subject}'s ${pct(second.fraction!)}, so it is further behind.`,
  }
}

/**
 * The OR teachers who are NOT taking this period, and are therefore free.
 *
 * The solver reserves every option's teacher when it places an OR slot — it
 * has to, since it cannot know in advance which subject will run. But only one
 * of them ends up teaching, and the rest are then free: free to cover an
 * absence, free to be offered as a substitute, free to be counted as free.
 * Leaving them marked busy quietly removes half a science department from the
 * pool at exactly the moment somebody is hunting for cover.
 */
export function freedTeachers(options: OrOption[], chosenSubject: string): string[] {
  const chosen = new Set<string>()
  const others = new Set<string>()
  for (const o of options) {
    const t = (o.teacher ?? '').trim()
    if (!t) continue
    if (o.subject === chosenSubject) chosen.add(t)
    else others.add(t)
  }
  // Somebody teaching BOTH options is still busy — releasing them would be
  // wrong in the one case it matters.
  return [...others].filter(t => !chosen.has(t))
}

/**
 * An OR group may only hold subjects the WHOLE class takes.
 *
 * Optional and elective subjects split a class into groups, which is what AND
 * groups are for. Putting one in an OR group would schedule a period that only
 * some of the room can attend, and the rest would have nowhere to be — a
 * validation the editor should run before anyone generates.
 */
export function invalidOrSubjects(
  options: OrOption[],
  subjects: Array<{ name: string; isOptional?: boolean; electiveSlotId?: string }>,
): string[] {
  const bad: string[] = []
  for (const o of options) {
    const s = subjects.find(x => x.name === o.subject)
    if (!s) continue
    if (s.isOptional || s.electiveSlotId) bad.push(o.subject)
  }
  return bad
}

/**
 * The OR options in a cell, or null if it is not an OR choice.
 *
 * OR and AND look identical in the data — both are parallel `groupAssignments`
 * — and are told apart only by the joiner in the cell's subject string,
 * "Physics OR Chemistry" against "Physics AND Chemistry". That parsing already
 * existed inline in the cell renderer, where it decides a chip colour. It must
 * not be re-derived anywhere that decides who is TEACHING, because getting it
 * backwards is not a cosmetic error: treating an AND cell as a choice would
 * release a teacher who is genuinely standing in front of half the class.
 *
 * So the distinction lives here once, next to the resolver that consumes it.
 */
export function orOptionsInCell(cell: {
  subject?: string
  groupAssignments?: Array<{ subject?: string; teacher?: string }>
} | undefined | null): OrOption[] | null {
  if (!cell?.groupAssignments?.length) return null
  const raw = cell.subject ?? ''
  // AND is checked first: a cell can only carry one joiner, and a subject named
  // with a stray "or" inside it must not turn a parallel split into a choice.
  if (raw.includes(' AND ')) return null
  if (!raw.includes(' OR ')) return null
  const options = cell.groupAssignments
    .map(g => ({ subject: (g.subject ?? '').trim(), teacher: (g.teacher ?? '').trim() }))
    .filter(o => o.subject)
  return options.length ? options : null
}

/**
 * Who is teaching a cell on ONE DATE, with the day's OR choice applied.
 *
 * The dated counterpart to teachingPairsInCell, and the only place that should
 * answer this. Identical to it for ordinary cells and for AND groups, where
 * every parallel teacher is genuinely in the room. It differs only for an OR
 * choice, where the day resolves to a single subject and the other options'
 * teachers are free — free to cover an absence, free to be OFFERED as a
 * substitute, free to be counted as free.
 *
 * Only a decisive choice releases anybody. resolveOrChoice still names a
 * subject when it has nothing to compare, falling back to a stable order so
 * callers get a deterministic answer, and says so with reason 'untracked'.
 * Treating that as a decision would free a teacher on a coin toss and leave a
 * class with nobody — worse than the double-booking this path prevents.
 */
export function teachingPairsOnDate(
  cell: any, section: string, isoDate: string, periodId: string,
  orDecisions: Record<string, OrDecision> = {}, plans: Record<string, SyllabusPlan> = {},
): Array<{ teacher: string; subject: string }> {
  const all = teachingPairsInCell(cell)
  const options = orOptionsInCell(cell)
  if (!options) return all
  const choice = resolveOrChoice(
    options, section, plans, orDecisions[orDecisionKey(section, isoDate, periodId)],
  )
  if (!choice || choice.reason === 'untracked') return all
  const taking = all.filter(x => x.subject === choice.subject)
  // A choice naming a subject no longer in the cell is stale; hold everyone
  // rather than empty the room on the strength of bad data.
  return taking.length ? taking : all
}

/** Is this person teaching this cell on this date, once the choice is applied? */
export function cellHasTeacherOnDate(
  cell: any, name: string, section: string, isoDate: string, periodId: string,
  orDecisions: Record<string, OrDecision> = {}, plans: Record<string, SyllabusPlan> = {},
): boolean {
  const who = (name ?? '').trim()
  if (!who) return false
  return teachingPairsOnDate(cell, section, isoDate, periodId, orDecisions, plans)
    .some(x => x.teacher === who)
}
