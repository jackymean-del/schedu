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

export interface OrOption {
  subject: string
  teacher?: string
  room?: string
}

export type OrReason =
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
): OrChoice | null {
  const live = options.filter(o => o?.subject?.trim())
  if (!live.length) return null

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
