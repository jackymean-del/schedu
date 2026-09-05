/**
 * Which subject an OR period runs, and — mostly — when it refuses to say.
 * Run: npx tsx or-choice-verify.mts
 *
 * An OR group is a subject CHOICE for a whole class ("Physics OR Chemistry"),
 * decided by syllabus coverage: whichever is further behind takes the period.
 * The interesting cases are all about not pretending to know.
 */
import { resolveOrChoice, invalidOrSubjects, freedTeachers, orDecisionKey } from './src/lib/orChoice.ts'
import { teachersActuallyIn } from './src/lib/cellTeachers.ts'
import { planKey } from './src/lib/syllabusTracking.ts'

type Any = any
let fail = 0
const ok = (cond: boolean, label: string, extra = '') => {
  console.log(`${cond ? '✓' : '✗'} ${label}${extra ? ' — ' + extra : ''}`)
  if (!cond) fail++
}

const SEC = 'XI-A'
const opts = [{ subject: 'Physics', teacher: 'Rao' }, { subject: 'Chemistry', teacher: 'Devi' }]

/** A plan carrying a real percent signal. */
const plan = (percent: number): Any => ({
  method: 'percent', overallPercentCovered: percent, chapters: [],
})
const plansFor = (phy?: number, chem?: number): Any => {
  const p: Any = {}
  if (phy !== undefined) p[planKey('Physics', SEC)] = plan(phy)
  if (chem !== undefined) p[planKey('Chemistry', SEC)] = plan(chem)
  return p
}

console.log('── the subject that is behind takes the period ──')
{
  const c = resolveOrChoice(opts, SEC, plansFor(40, 70))!
  ok(c.subject === 'Physics' && c.reason === 'behind',
    'Physics at 40% beats Chemistry at 70%', c.explain)

  const flipped = resolveOrChoice(opts, SEC, plansFor(85, 20))!
  ok(flipped.subject === 'Chemistry' && flipped.reason === 'behind',
    'and the other way round when Chemistry is the one behind', flipped.explain)

  ok(c.coverage.length === 2 && c.coverage.every(x => typeof x.fraction === 'number'),
    'the working is shown for both subjects, not just the winner')
}

console.log('\n── what it refuses to guess ──')
{
  // The important one. An untracked subject is not a subject at 0%: handing it
  // every OR period forever and calling that catch-up would be worse than
  // saying plainly that there is nothing to compare.
  const none = resolveOrChoice(opts, SEC, plansFor())!
  ok(none.reason === 'untracked', 'with no coverage recorded at all, it does not claim a reason')
  ok(/no syllabus coverage recorded/i.test(none.explain),
    'and says so in words a teacher can act on', none.explain)

  const half = resolveOrChoice(opts, SEC, plansFor(10, undefined))!
  ok(half.reason === 'untracked',
    'one tracked subject and one untracked is still not a comparison')
  ok(half.subject === 'Physics', 'it falls back to a stable order rather than a coin toss')
  ok(/cannot be compared/i.test(half.explain), 'and names the untracked side', half.explain)

  // Untracked must NOT be treated as 0% — that is the trap this guards.
  ok(half.subject !== 'Chemistry',
    'the untracked subject does not win by being counted as zero')
}

console.log('\n── ties and degenerate input ──')
{
  const tied = resolveOrChoice(opts, SEC, plansFor(50, 50))!
  ok(tied.reason === 'tied' && tied.subject === 'Chemistry',
    'a tie is broken by name, deterministically', tied.explain)

  const solo = resolveOrChoice([opts[0]], SEC, plansFor(50))!
  ok(solo.reason === 'only-option', 'a group of one is not a choice')

  ok(resolveOrChoice([], SEC, {}) === null, 'an empty group resolves to nothing at all')
  ok(resolveOrChoice([{ subject: '  ' } as Any], SEC, {}) === null, 'and so does a blank subject')

  // Same inputs, same answer — this drives what a school sees on the day.
  const a = resolveOrChoice(opts, SEC, plansFor(40, 70))!
  const b = resolveOrChoice(opts, SEC, plansFor(40, 70))!
  ok(a.subject === b.subject && a.explain === b.explain, 'the same day resolves the same way twice')
}

console.log('\n── an OR group may not contain optional subjects ──')
{
  // OR is a choice for the WHOLE class, so every student takes whichever runs.
  // An optional subject would schedule a period only part of the room can
  // attend — that is what AND groups are for.
  const subjects = [
    { name: 'Physics' }, { name: 'Chemistry' },
    { name: 'Painting', isOptional: true },
    { name: 'Hindi', electiveSlotId: 'R1' },
  ]
  ok(invalidOrSubjects(opts, subjects).length === 0,
    'two whole-class subjects are a valid OR group')
  ok(invalidOrSubjects([...opts, { subject: 'Painting' }], subjects).join() === 'Painting',
    'an optional subject is rejected, by name')
  ok(invalidOrSubjects([{ subject: 'Hindi' }], subjects).join() === 'Hindi',
    'so is one sitting in an elective slot')
  ok(invalidOrSubjects([{ subject: 'Unknown' }], subjects).length === 0,
    'a subject not on the roster is left for the roster to complain about')
}

console.log('')
console.log('── a person can decide, and their choice wins ──')
{
  // Coverage is a good default, not an instruction. The teacher in front of
  // the class knows things the percentages do not — a lab free this morning,
  // an exam next week, a topic half-finished.
  const byHand = resolveOrChoice(opts, SEC, plansFor(40, 70), { subject: 'Chemistry', by: 'Devi' })!
  ok(byHand.subject === 'Chemistry' && byHand.reason === 'manual',
    'a manual choice beats coverage even when coverage disagrees', byHand.explain)
  ok(/by Devi/.test(byHand.explain), 'and records who made it')
  ok(resolveOrChoice(opts, SEC, plansFor(40, 70), 'Chemistry')!.subject === 'Chemistry',
    'a bare subject string works too, for the simple call site')

  // A decision naming a subject no longer in the group is stale, not binding.
  const stale = resolveOrChoice(opts, SEC, plansFor(40, 70), { subject: 'Biology' })!
  ok(stale.subject === 'Physics' && stale.reason === 'behind',
    'a decision naming a subject that has left the group falls back to coverage')
  ok(resolveOrChoice(opts, SEC, plansFor(40, 70), undefined)!.reason === 'behind',
    'with the decision cleared, coverage decides again')
  ok(orDecisionKey('XI-A', '2026-08-25', 'p3') === 'XI-A|2026-08-25|p3',
    'decisions are keyed per DATE, like substitutions')
}

console.log('')
console.log('── the teachers who did not take it are free ──')
{
  ok(freedTeachers(opts, 'Physics').join() === 'Devi',
    'the Chemistry teacher is released when Physics takes the period')
  ok(freedTeachers(opts, 'Chemistry').join() === 'Rao', 'and the other way round')
  ok(freedTeachers(opts, 'Biology').length === 2,
    'a choice outside the group releases nobody rather than guessing')

  // Somebody teaching BOTH options is still busy — the one case where
  // releasing would be actively wrong.
  const both = [{ subject: 'Physics', teacher: 'Rao' }, { subject: 'Chemistry', teacher: 'Rao' }]
  ok(freedTeachers(both, 'Physics').length === 0, 'a teacher who covers both options stays busy')

  const cell: any = {
    subject: 'Physics', teacher: 'Rao',
    groupAssignments: [{ subject: 'Physics', teacher: 'Rao' }, { subject: 'Chemistry', teacher: 'Devi' }],
  }
  ok(teachersActuallyIn(cell, 'Physics').join() === 'Rao',
    'only the teacher taking the slot counts as teaching it')
  ok(teachersActuallyIn(cell).length === 2, 'with no decision yet, everybody is still held')
  ok(teachersActuallyIn(cell, 'Biology').length === 2,
    'a stale decision holds everybody rather than emptying the room')
}

console.log(fail === 0 ? '\nALL OR-CHOICE CHECKS PASSED' : `\n${fail} CHECK(S) FAILED`)
process.exit(fail === 0 ? 0 : 1)
