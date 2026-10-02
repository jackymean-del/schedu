/**
 * The generate briefing and the Bench must measure what the engine measures.
 * Run: npx tsx preflight-verify.mts   (from frontend/)
 *
 * Two screens told a school things that were not so:
 *
 *  - The briefing counted each class's periods with a helper that only answers
 *    "does this class leave early?", and skipped every class it said no to. In
 *    a school where everybody stays all day it counted nothing, checked
 *    nothing, and announced "Every class fits its weekly capacity".
 *  - The Bench measured "missing" lessons against each subject's default
 *    periods/week instead of the Mapping step the engine schedules from. A
 *    five-class school saw 51 missing lessons; one was.
 *
 * Both were checks that could not fail. This file holds them to numbers.
 */
import { readFileSync } from 'node:fs'
import { buildPreflight } from './src/lib/preflight.ts'
import { teachCountFromRows, teachingPeriodsFor } from './src/lib/generationPipeline.ts'
import { weeklyTargets } from './src/lib/schedulingEngine.ts'

let fail = 0
const ok = (cond: boolean, label: string, extra = '') => {
  console.log(`${cond ? '✓' : '✗'} ${label}${extra ? ' - ' + extra : ''}`)
  if (!cond) fail++
}

const workDays = ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY']
const all = ['i', 'ii', 'iii']
const row = (name: string, type: string, classes: string[] = all, duration = 40) => ({ name, type, duration, classes })
// A school where every class stays all day: six teaching periods each.
const fullDay = [
  row('Assembly', 'assembly', all, 10),
  row('P1', 'teaching'), row('P2', 'teaching'), row('P3', 'teaching'),
  row('Lunch', 'lunch', all, 30),
  row('P4', 'teaching'), row('P5', 'teaching'), row('P6', 'teaching'),
]
const sections = [{ name: 'I-A' }, { name: 'II-A' }, { name: 'III-A' }]
const subjects = [{ name: 'Maths', periodsPerWeek: 6 }, { name: 'English', periodsPerWeek: 6 }, { name: 'Drawing', periodsPerWeek: 2 }]
const staff = [{ name: 'Asha' }, { name: 'Bala' }]
const config = { bellSchedules: [{ startTime: '09:00', rows: fullDay }], workDays, countryCode: 'IN' }

// ── 1. Full-day classes are counted ──────────────────────────────────────
console.log('full-day school')
ok(sections.every(s => teachCountFromRows(s.name, fullDay) === null),
  'negative control: the early-leaver helper says "unknown" for every full-day class',
  'if this changes, check the briefing still has something to prove')
ok(sections.every(s => teachingPeriodsFor(s.name, fullDay) === 6), 'every class is counted at its six periods')
{
  const subjectAllocations = {
    'I-A': { Maths: '5', English: '5' },
    'II-A': { Maths: '5', English: '5' },
    // 32 a week into a 30-period week:
    'III-A': { Maths: '16', English: '16' },
  }
  const pf = buildPreflight({ config, sections, subjects, subjectAllocations, staff }, { parallelGroups: 0 })!
  ok(pf.totalWeekly === 52, 'lessons a week is the Mapping total, not 0', `${pf.totalWeekly}`)
  ok(pf.overCap.length === 1 && pf.overCap[0] === 'III-A', 'a class allocated past its bell is flagged', pf.overCap.join(','))
  ok(pf.shapes.length === 1 && pf.shapes[0].count === 6 && pf.shapes[0].nSecs === 3, 'the day shape covers all three classes')
  ok(pf.staffing !== null, 'the staffing check runs')
}

// ── 2. An early leaver is still counted, at its own length ───────────────
{
  const rows = [...fullDay.slice(0, 5), row('P4', 'teaching', ['ii', 'iii']), row('P5', 'teaching', ['ii', 'iii']), row('P6', 'teaching', ['ii', 'iii'])]
  console.log('a class that leaves early')
  ok(teachingPeriodsFor('I-A', rows) === 3 && teachingPeriodsFor('II-A', rows) === 6,
    'I-A has three periods, II-A six', `${teachingPeriodsFor('I-A', rows)} / ${teachingPeriodsFor('II-A', rows)}`)
}

// ── 3. Who teaches it ────────────────────────────────────────────────────
{
  const subjectAllocations = { 'I-A': { Maths: '5', English: '5' }, 'II-A': { Maths: '5', English: '5' }, 'III-A': { Maths: '5', English: '5' } }
  console.log('teacher coverage')
  const none = buildPreflight({ config, sections, subjects, subjectAllocations, staff, teacherAllocations: {} }, { parallelGroups: 0 })!
  ok(none.shortOfTeachers.periods === 0 && none.noTeacherChosen.periods === 0,
    'a school that never allocated teachers is not nagged about it')
  const teacherAllocations = {
    Asha: { 'I-A': { Maths: 5 }, 'II-A': { Maths: 3 } },     // II-A Maths 3 of 5
    Bala: { 'I-A': { English: 5 }, 'II-A': { English: 5 } },
    Gone: { 'III-A': { Maths: 5 } },                          // left the school
  }
  const pf = buildPreflight({ config, sections, subjects, subjectAllocations, staff, teacherAllocations }, { parallelGroups: 0 })!
  ok(pf.shortOfTeachers.periods === 2 && pf.shortOfTeachers.classes.join() === 'II-A',
    'II-A Maths allocated 3 of 5: 2 periods short, and they will wait on the Bench',
    `${pf.shortOfTeachers.periods} in ${pf.shortOfTeachers.classes.join(',')}`)
  ok(pf.noTeacherChosen.periods === 10 && pf.noTeacherChosen.classes.join() === 'III-A',
    "III-A has nobody allocated (the only row names someone who left): 10 periods the engine will choose for",
    `${pf.noTeacherChosen.periods} in ${pf.noTeacherChosen.classes.join(',')}`)
}

// ── 4. The Bench measures against the engine's targets ───────────────────
{
  console.log('Bench')
  const subjectAllocations = { 'I-A': { Maths: '4', English: '4' } }
  const t = weeklyTargets(sections, subjects, subjectAllocations)
  ok(t['I-A'].Drawing === 0, 'a subject missing from a class\'s Mapping row is not owed to it', `Drawing ${t['I-A'].Drawing}`)
  ok(t['I-A'].Maths === 4, 'a Mapping cell wins over the default', `Maths ${t['I-A'].Maths}`)
  ok(t['II-A'].Maths === 6, 'a class with no row at all falls back to defaults, as the engine does')

  const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1')
  const src = strip(readFileSync('src/routes/timetable.tsx', 'utf8'))
  const pool = src.slice(src.indexOf('const poolData = useMemo'), src.indexOf('const poolData = useMemo') + 2500)
  ok(pool.includes('weeklyTargets('), "the Bench's demand comes from weeklyTargets")
  ok(!/periodsPerWeek/.test(pool.slice(0, pool.indexOf('const deficit'))),
    "the Bench does not read a subject's default periods directly")
}

// ── 5. Once a day, and where the week cannot allow it ────────────────────
{
  console.log('twice a day')
  const days = (config.workDays ?? []).length || 5
  const subjectAllocations = {
    'I-A': { Maths: String(days + 1), English: String(days) },
    'II-A': { Maths: `${days}s=2p`, English: '3' },
    'III-A': { Maths: '2', English: '2' },
  }
  const pf = buildPreflight({ config, sections, subjects, subjectAllocations, staff, teacherAllocations: {} }, { parallelGroups: 0 })!
  const maths = pf.twiceADay.find(t => t.subject === 'Maths')
  ok(maths?.classes.join() === 'I-A',
    `${days + 1} Maths lessons in ${days} days must double up somewhere, and the briefing says so`, maths?.classes.join() ?? 'none')
  ok(!pf.twiceADay.some(t => t.subject === 'English'),
    'a subject with a lesson a day or fewer is never flagged')
  ok(!maths?.classes.includes('II-A'),
    'a double period is one lesson: a double every day is still once a day')
}

console.log(fail === 0 ? '\nALL PREFLIGHT CHECKS PASSED' : `\n${fail} CHECK(S) FAILED`)
process.exit(fail === 0 ? 0 : 1)
