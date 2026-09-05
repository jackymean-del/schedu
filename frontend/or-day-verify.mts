/**
 * Does an OR decision actually reach the surfaces that act on it?
 * Run: npx tsx or-day-verify.mts
 *
 * or-choice-verify proves the RESOLVER is right. This proves the resolver is
 * CONNECTED — which for a long time it was not: resolveOrChoice, the store
 * field, the server table and the teacher's page all existed and nothing in
 * the app ever called them, so a decision changed nothing anybody could see.
 *
 * The consequence is concrete. An OR period runs one subject; the other
 * option's teacher is free. Counting them as teaching sends the cover flow
 * hunting a substitute for a lesson that will not happen, and hides that they
 * were available to cover one that will.
 */
import { computeTodaySummary } from './src/lib/scheduleToday.ts'
import { computeMultiToday } from './src/lib/activeSchedules.ts'
import { computeReports } from './src/lib/reportsData.ts'
import { teachersInCell, teachingPairsInCell, cellHasTeacher } from './src/lib/cellTeachers.ts'
import { orOptionsInCell } from './src/lib/orChoice.ts'
import { planKey } from './src/lib/syllabusTracking.ts'
import { parseSubjectExpression } from './src/types/index.ts'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

type Any = any
let fail = 0
const ok = (cond: boolean, label: string, extra = '') => {
  console.log(`${cond ? '✓' : '✗'} ${label}${extra ? ' — ' + extra : ''}`)
  if (!cond) fail++
}

// ── A Tuesday with one OR period, and the Chemistry teacher off sick ────────
const DATE = new Date('2026-09-08T09:00:00')   // a Tuesday
const ISO = '2026-09-08'
const SEC = 'XI-A'

const periods = [{ id: 'p1', name: 'Period 1', start: '09:00', end: '09:45' }]
const sections = [{ name: SEC }]
const config = { workDays: ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY'] }
const leaves = [{ id: 'l1', teacher: 'Devi', date: ISO, duration: 'full', type: 'sick' }] as Any

const orCell = {
  subject: 'Physics OR Chemistry', teacher: 'Rao', room: 'Lab 1',
  groupAssignments: [
    { subject: 'Physics', teacher: 'Rao', room: 'Lab 1' },
    { subject: 'Chemistry', teacher: 'Devi', room: 'Lab 2' },
  ],
}
const andCell = { ...orCell, subject: 'Physics AND Chemistry' }

const plan = (pct: number): Any => ({ method: 'percent', overallPercentCovered: pct, chapters: [] })
const summary = (cell: Any, orDecisions: Any = {}, plans: Any = {}) => computeTodaySummary({
  periods, sections, classTT: { [SEC]: { TUESDAY: { p1: cell } } }, config,
  substitutions: {}, leaves, conflicts: 0, date: DATE, orDecisions, plans,
})
const key = `${SEC}|${ISO}|p1`
const needsCover = (s: Any) => s.uncoveredSlots.map((x: Any) => `${x.teacher}/${x.subject}`)

console.log('── a decided OR period frees the teacher who is not taking it ──')
{
  const taken = summary(orCell, { [key]: { subject: 'Physics', by: 'Rao' } })
  ok(needsCover(taken).length === 0,
    'Physics was chosen, so absent Devi needs no cover', JSON.stringify(needsCover(taken)))

  const hers = summary(orCell, { [key]: { subject: 'Chemistry', by: 'Devi' } })
  ok(needsCover(hers).join() === 'Devi/Chemistry',
    'Chemistry was chosen, so her absence DOES leave a class uncovered')
}

console.log('\n── undecided, and what it refuses to assume ──')
{
  const byCoverage = summary(orCell, {}, {
    [planKey('Physics', SEC)]: plan(30), [planKey('Chemistry', SEC)]: plan(80),
  })
  ok(needsCover(byCoverage).length === 0,
    'with no manual choice, coverage picks Physics and Devi is free')

  const behindIsHers = summary(orCell, {}, {
    [planKey('Physics', SEC)]: plan(90), [planKey('Chemistry', SEC)]: plan(20),
  })
  ok(needsCover(behindIsHers).join() === 'Devi/Chemistry',
    'and when Chemistry is the subject behind, her period is real')

  // The safe direction. Nothing tracked means nothing known, and releasing a
  // teacher on a guess is how a class ends up with nobody in front of it.
  const unknown = summary(orCell, {}, {})
  ok(needsCover(unknown).join() === 'Devi/Chemistry',
    'untracked syllabus releases nobody — the slot still holds everyone')
}

console.log('\n── AND is not a choice, and must never be treated as one ──')
{
  // Both teachers are genuinely standing in front of half the class each.
  // Releasing one because a decision names the other would be worse than the
  // bug this fixes: a real lesson quietly loses its teacher.
  const anded = summary(andCell, { [key]: { subject: 'Physics', by: 'Rao' } })
  ok(needsCover(anded).join() === 'Devi/Chemistry',
    'an AND cell keeps its teacher even when a decision names the other subject')
  ok(orOptionsInCell(andCell) === null, 'and orOptionsInCell refuses to read it as a choice')
  ok(orOptionsInCell(orCell)?.length === 2, 'while a real OR cell yields both options')
  ok(orOptionsInCell({ subject: 'Physics', teacher: 'Rao' }) === null,
    'an ordinary single-subject cell is not a choice either')
  ok(orOptionsInCell({ subject: 'Physics OR Chemistry' }) === null,
    'nor is an OR label with no group assignments behind it')
}

console.log('\n── both parallel shapes count as teaching ──')
{
  // The timetable page carried its own copy of this that read `options` and
  // missed `groupAssignments`, so a teacher in a later GROUP disappeared from
  // their own timetable and from every load count on that page.
  const optBlock = {
    subject: 'PE', teacher: 'Rao', room: 'Field',
    options: [{ subject: 'PE', teacher: 'Rao' }, { subject: 'Art', teacher: 'Iyer' }],
  }
  ok(teachersInCell(optBlock).join() === 'Rao,Iyer', 'an optional block names every option teacher')
  ok(cellHasTeacher(optBlock, 'Iyer'), 'and the later option teacher is teaching')
  ok(teachersInCell(orCell).join() === 'Rao,Devi', 'a group cell names every group teacher')
  ok(cellHasTeacher(orCell, 'Devi'), 'and the later group teacher is teaching')

  // One person appearing in both shapes is still one person.
  const both = {
    subject: 'PE', teacher: 'Rao',
    groupAssignments: [{ subject: 'PE', teacher: 'Rao' }],
    options: [{ subject: 'PE', teacher: 'Rao' }],
  }
  ok(teachersInCell(both).join() === 'Rao', 'a teacher in both shapes is not counted twice')
  ok(teachingPairsInCell(both).length === 1, 'and the pair list agrees')
  ok(teachersInCell(null).length === 0 && teachersInCell({}).length === 0,
    'an empty cell holds nobody')
}

console.log('\n── a period the choice went against was never lost ──')
{
  // Reports price an absence in periods lost. An OR period that ran the OTHER
  // subject was never this teacher's to lose, so counting it inflates what the
  // absence cost — the figure a school takes to a staffing conversation.
  const src = (orDecisions: Any): Any => ({
    sections, periods, classTT: { [SEC]: { TUESDAY: { p1: orCell } } },
    substitutions: {}, config, orDecisions,
  })
  const range = { start: ISO, end: ISO }
  const plans = { [planKey('Physics', SEC)]: plan(50), [planKey('Chemistry', SEC)]: plan(50) }

  const lostAnyway = computeReports({
    leaves, holidays: [], range, sources: [src({})], plans,
  })
  ok(lostAnyway.events.length === 1, 'an undecided OR period still counts as lost')

  const notHers = computeReports({
    leaves, holidays: [], range,
    sources: [src({ [key]: { subject: 'Physics', by: 'Rao' } })], plans,
  })
  ok(notHers.events.length === 0,
    'but once Physics took the period, Devi lost nothing', JSON.stringify(notHers.events))

  const hers = computeReports({
    leaves, holidays: [], range,
    sources: [src({ [key]: { subject: 'Chemistry', by: 'Devi' } })], plans,
  })
  ok(hers.events.length === 1, 'and when the period was hers, it is counted')
}

console.log('\n── a decision belongs to the schedule it was made on ──')
{
  // Several schedules run at once (a I-V timetable beside a VI-X one), each
  // with its own dated overlays. Applying the OPEN schedule's decisions to all
  // of them would free a teacher in one wing of a school because somebody
  // chose a subject in another.
  const bundle = (id: string, cell: Any, orDecisions: Any): Any => ({
    id, name: id, sections, staff: [], rooms: [], subjects: [],
    periods, config, classTT: { [SEC]: { TUESDAY: { p1: cell } } },
    substitutions: {}, orDecisions,
  })
  const plans = { [planKey('Physics', SEC)]: plan(50), [planKey('Chemistry', SEC)]: plan(50) }
  const decided = { [key]: { subject: 'Physics', by: 'Rao' } }

  // Only the FIRST bundle carries the decision that frees Devi.
  const multi = computeMultiToday(
    [bundle('a', orCell, decided), bundle('b', orCell, {})], leaves, 0, DATE, plans,
  )
  const covers = multi.uncoveredSlots.map((x: Any) => x.teacher + '/' + x.subject)
  ok(covers.length === 1,
    'the undecided schedule still needs cover, the decided one does not', JSON.stringify(covers))

  const both = computeMultiToday(
    [bundle('a', orCell, decided), bundle('b', orCell, decided)], leaves, 0, DATE, plans,
  )
  ok(both.uncoveredSlots.length === 0, 'and with both decided, neither does')
}

console.log('\n── nobody keeps a private copy of "who teaches this" ──')
{
  // The guard that matters. Every check above passes forever while the same
  // bug is reintroduced one file away as a local helper — which is exactly how
  // it happened. This fails on the NEXT private copy, not the last one.
  const files: string[] = []
  const walk = (dir: string) => {
    for (const e of readdirSync(dir)) {
      const full = join(dir, e)
      if (statSync(full).isDirectory()) walk(full)
      else if (/\.tsx?$/.test(e)) files.push(full)
    }
  }
  walk('src')

  const SHARED = [join('src', 'lib', 'cellTeachers.ts'), join('src', 'lib', 'orChoice.ts')]
  const offenders: string[] = []
  for (const f of files) {
    if (SHARED.includes(f)) continue
    const src = readFileSync(f, 'utf8')
    // A local definition of any of these names, rather than an import of it.
    if (/(?:^|\n)\s*(?:export\s+)?(?:function|const)\s+(cellHasTeacher|teachersInCell|teachingPairsInCell|teachersActuallyIn|teachingPairsOnDate|cellHasTeacherOnDate)\b/.test(src)) {
      offenders.push(f)
    }
  }
  ok(offenders.length === 0,
    'no file redefines a cellTeachers helper locally', offenders.join(', ') || 'none')

  // And the OR/AND distinction is decided in one place, for the same reason:
  // reading it backwards releases a teacher who is genuinely mid-lesson.
  const ALLOWED = [
    join('src', 'lib', 'orChoice.ts'),
    // Parses a chip colour out of the cell label. Decides nothing about who is
    // teaching, which is the only thing that must not be re-derived.
    join('src', 'components', 'timetable', 'TimetableCell.tsx'),
    // The AUTHORING side: parseSubjectExpression reads what a school typed
    // into the Academic Matrix, before any cell exists. It is where the joiner
    // originates, so the two are checked against each other below instead.
    join('src', 'types', 'index.ts'),
  ]
  const orParsers = files.filter(f =>
    !ALLOWED.includes(f) &&
    /includes\(['"] OR ['"]\)|split\(['"] OR ['"]\)/.test(readFileSync(f, 'utf8')))
  ok(orParsers.length === 0,
    'no file outside lib/orChoice re-derives OR-vs-AND', orParsers.join(', ') || 'none')

  // The two allowed parsers must agree. A school types "PE OR Painting" into
  // the matrix; that string becomes a cell label; orOptionsInCell has to read
  // it back as a choice. If either side ever changes its joiner, an OR period
  // silently stops resolving and every teacher in it stays busy forever.
  const authored = parseSubjectExpression('PE OR Painting')
  ok(authored.type === 'OR', 'the matrix reads "PE OR Painting" as a choice')
  const built = {
    subject: authored.subjects.join(' OR '),
    groupAssignments: authored.subjects.map((sub, i) => ({ subject: sub, teacher: `T${i}` })),
  }
  ok(orOptionsInCell(built)?.map(o => o.subject).join() === 'PE,Painting',
    'and a cell built from it still reads back as the same choice')
  const authoredAnd = parseSubjectExpression('Eng+Phy')
  ok(authoredAnd.type === 'AND', 'while "Eng+Phy" is a parallel split, not a choice')
}

console.log(fail === 0 ? '\nALL OR-DAY CHECKS PASSED' : `\n${fail} CHECK(S) FAILED`)
process.exit(fail === 0 ? 0 : 1)
