/**
 * The Allocation step decides who teaches. This checks the engine obeys it.
 * Run: npx tsx alloc-verify.mts   (from frontend/)
 *
 * The solver used to match teachers on their flat subject list alone and was
 * never given the allocation matrix. A five-class school allocated I-A's Music
 * to Teacher 1 got it taught by the Hindi teacher, and 55 of its 165 lessons
 * went to a teacher the plan had not given that class. The existing
 * "no wrong-teacher lessons" check passed throughout, because it measured
 * against the same flat list the solver used. So this harness measures against
 * the ALLOCATION, and starts with a negative control proving it can see the
 * failure at all.
 *
 * It also guards the plumbing. The engine's own comment promised "Priority 1:
 * teacher explicitly assigned to this section+subject via matrix" for months
 * while no caller passed the matrix in; a rule nobody wires up is not a rule.
 */
import { readFileSync } from 'node:fs'
import { solveTimetable, reoptimizeTeachers } from './src/lib/schedulingEngine.ts'

let fail = 0
const ok = (cond: boolean, label: string, extra = '') => {
  console.log(`${cond ? '✓' : '✗'} ${label}${extra ? ' - ' + extra : ''}`)
  if (!cond) fail++
}

const workDays = ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY']
const periods = Array.from({ length: 8 }, (_, i) => ({ id: `p${i + 1}`, name: `P${i + 1}`, duration: 40, type: 'class' })) as any[]

type Alloc = Record<string, Record<string, Record<string, number>>>

/** Every (section, teacher, subject) lesson in a timetable. */
function lessons(classTT: any) {
  const out: Array<{ sec: string; day: string; pid: string; teacher: string; subject: string; ct: boolean }> = []
  for (const [sec, days] of Object.entries<any>(classTT)) {
    for (const [day, ps] of Object.entries<any>(days ?? {})) {
      for (const [pid, c] of Object.entries<any>(ps ?? {})) {
        if (!c?.subject) continue
        out.push({ sec, day, pid, teacher: c.teacher ?? '', subject: c.subject, ct: !!c.isClassTeacher })
      }
    }
  }
  return out
}
const unallocated = (classTT: any, A: Alloc) =>
  lessons(classTT).filter(l => l.teacher && !((A[l.teacher]?.[l.sec]?.[l.subject] ?? 0) > 0))
const overQuota = (classTT: any, A: Alloc) => {
  const used: Record<string, number> = {}
  for (const l of lessons(classTT)) {
    const k = `${l.teacher}|${l.sec}|${l.subject}`
    used[k] = (used[k] ?? 0) + 1
  }
  return Object.entries(used).filter(([k, n]) => {
    const [t, s, sub] = k.split('|')
    const q = A[t]?.[s]?.[sub]
    return q !== undefined && n > q
  })
}
const clashes = (classTT: any) => {
  const seen = new Set<string>(); let n = 0
  for (const l of lessons(classTT)) {
    if (!l.teacher) continue
    const k = `${l.teacher}|${l.day}|${l.pid}`
    if (seen.has(k)) n++
    seen.add(k)
  }
  return n
}
const countOf = (classTT: any, sec: string, subject: string, teacher?: string) =>
  lessons(classTT).filter(l => l.sec === sec && l.subject === subject && (!teacher || l.teacher === teacher)).length

// ── 1. The school that exposed it ─────────────────────────────────────────
// Five classes, six teachers. Subject lists are what a school types in a
// hurry: some subjects (EVS, Music, Library) appear on nobody's list, and
// Maths is on two lists with no hint of which classes. The allocation is the
// precise answer, and it disagrees with the lists on purpose.
{
  const sections = ['I-A', 'II-A', 'III-A', 'IV-A', 'V-A'].map((name, i) => ({ id: `s${i}`, name, grade: name.split('-')[0] })) as any[]
  const subjectDefs: Record<string, number> = { Mathematics: 5, English: 5, Hindi: 4, EVS: 3, Music: 2, Library: 1, 'Art & Craft': 2 }
  const subjects = Object.entries(subjectDefs).map(([name, ppw], i) => ({ id: `su${i}`, name, periodsPerWeek: ppw })) as any[]
  const staff = [
    { id: 't1', name: 'Teacher 1', subjects: ['Mathematics'], maxPeriodsPerWeek: 30 },
    { id: 't2', name: 'Teacher 2', subjects: ['Mathematics', 'English'], maxPeriodsPerWeek: 30 },
    { id: 't3', name: 'Teacher 3', subjects: ['English'], maxPeriodsPerWeek: 30 },
    { id: 't4', name: 'Teacher 4', subjects: ['English'], maxPeriodsPerWeek: 30 },
    { id: 't5', name: 'Teacher 5', subjects: ['Hindi'], maxPeriodsPerWeek: 30 },
    { id: 't6', name: 'Teacher 6', subjects: ['Hindi', 'Art & Craft'], maxPeriodsPerWeek: 30 },
  ] as any[]
  const A: Alloc = {}
  const give = (t: string, sec: string, sub: string, n: number) => {
    ((A[t] ??= {})[sec] ??= {})[sub] = n
  }
  // Maths: Teacher 1 for I-III, Teacher 2 for IV-V. English split three ways.
  for (const s of ['I-A', 'II-A', 'III-A']) give('Teacher 1', s, 'Mathematics', 5)
  for (const s of ['IV-A', 'V-A']) give('Teacher 2', s, 'Mathematics', 5)
  give('Teacher 3', 'I-A', 'English', 5); give('Teacher 3', 'II-A', 'English', 5)
  give('Teacher 4', 'III-A', 'English', 5); give('Teacher 4', 'IV-A', 'English', 5)
  give('Teacher 2', 'V-A', 'English', 5)
  for (const s of ['I-A', 'II-A', 'III-A']) give('Teacher 5', s, 'Hindi', 4)
  for (const s of ['IV-A', 'V-A']) give('Teacher 6', s, 'Hindi', 4)
  // Subjects nobody lists: the allocation is the only place they are answered.
  for (const s of ['I-A', 'II-A']) give('Teacher 1', s, 'Music', 2)
  for (const s of ['III-A', 'IV-A', 'V-A']) give('Teacher 3', s, 'Music', 2)
  for (const s of ['I-A', 'II-A', 'III-A', 'IV-A', 'V-A']) give('Teacher 4', s, 'EVS', 3)
  for (const s of ['I-A', 'II-A', 'III-A', 'IV-A', 'V-A']) give('Teacher 6', s, 'Art & Craft', 2)
  for (const s of ['I-A', 'II-A', 'III-A', 'IV-A', 'V-A']) give('Teacher 5', s, 'Library', 1)

  const subjectAllocations: Record<string, Record<string, string>> = {}
  for (const s of sections) subjectAllocations[s.name] = Object.fromEntries(Object.entries(subjectDefs).map(([k, v]) => [k, String(v)]))

  const base = { sections, staff, subjects, periods, workDays, requirements: [], subjectAllocations, defaultTeacherMaxPeriods: 30 }

  console.log('school with allocations that disagree with the subject lists')
  const without = solveTimetable({ ...base } as any)
  ok(unallocated(without.classTT, A).length > 0,
    'negative control: WITHOUT the matrix the engine does give lessons to unallocated teachers',
    `${unallocated(without.classTT, A).length} such lessons - if this ever reads 0 the checks below prove nothing`)

  const r = solveTimetable({ ...base, teacherAllocations: A } as any)
  const bad = unallocated(r.classTT, A)
  ok(bad.length === 0, 'every lesson is taught by a teacher allocated that subject in that class',
    bad.length ? bad.slice(0, 3).map(b => `${b.sec} ${b.subject}/${b.teacher}`).join(', ') : `${lessons(r.classTT).length} lessons`)
  ok(overQuota(r.classTT, A).length === 0, 'no teacher teaches a class more periods of a subject than allocated',
    overQuota(r.classTT, A).slice(0, 3).map(([k, n]) => `${k}=${n}`).join(', '))
  ok(clashes(r.classTT) === 0, 'no teacher is in two places at once')
  ok(countOf(r.classTT, 'I-A', 'Music', 'Teacher 1') === 2,
    'I-A Music goes to Teacher 1, as allocated', `${countOf(r.classTT, 'I-A', 'Music', 'Teacher 1')}/2`)
  ok(countOf(r.classTT, 'IV-A', 'Mathematics', 'Teacher 1') === 0,
    "Teacher 1 is kept out of IV-A Maths, which went to Teacher 2, though Maths is on Teacher 1's list")
  const total = lessons(r.classTT).length
  let allocatedTotal = 0
  for (const secs of Object.values(A)) for (const subs of Object.values(secs)) for (const n of Object.values(subs)) allocatedTotal += n
  ok(total === allocatedTotal, 'allocation-faithful does not mean sparse: every allocated lesson is placed',
    `${total}/${allocatedTotal}`)
}

// ── 2. Split allocation: 2 + 2 means 2 + 2 ────────────────────────────────
{
  const sections = [{ id: 's1', name: 'IX-A', grade: 'IX' }] as any[]
  const subjects = [{ id: 'm', name: 'Maths', periodsPerWeek: 4 }, { id: 'e', name: 'English', periodsPerWeek: 4 }] as any[]
  const staff = [
    { id: 'a', name: 'Asha', subjects: ['Maths'], maxPeriodsPerWeek: 30 },
    { id: 'b', name: 'Bala', subjects: ['Maths', 'English'], maxPeriodsPerWeek: 30 },
  ] as any[]
  const A: Alloc = { Asha: { 'IX-A': { Maths: 2 } }, Bala: { 'IX-A': { Maths: 2, English: 4 } } }
  const r = solveTimetable({ sections, staff, subjects, periods, workDays, requirements: [],
    subjectAllocations: { 'IX-A': { Maths: '4', English: '4' } }, teacherAllocations: A } as any)
  console.log('split allocation')
  ok(countOf(r.classTT, 'IX-A', 'Maths', 'Asha') === 2 && countOf(r.classTT, 'IX-A', 'Maths', 'Bala') === 2,
    'a subject split 2 + 2 between two teachers is taught 2 + 2',
    `Asha ${countOf(r.classTT, 'IX-A', 'Maths', 'Asha')}, Bala ${countOf(r.classTT, 'IX-A', 'Maths', 'Bala')}`)
}

// ── 3. Under-allocated: the gap stays a gap ───────────────────────────────
{
  const sections = [{ id: 's1', name: 'X-A', grade: 'X' }] as any[]
  const subjects = [{ id: 'm', name: 'Maths', periodsPerWeek: 5 }] as any[]
  const staff = [
    { id: 'a', name: 'Asha', subjects: ['Maths'], maxPeriodsPerWeek: 30 },
    { id: 'b', name: 'Bala', subjects: ['Maths'], maxPeriodsPerWeek: 30 },
  ] as any[]
  const A: Alloc = { Asha: { 'X-A': { Maths: 3 } } }
  const r = solveTimetable({ sections, staff, subjects, periods, workDays, requirements: [],
    subjectAllocations: { 'X-A': { Maths: '5' } }, teacherAllocations: A } as any)
  console.log('under-allocated subject')
  ok(countOf(r.classTT, 'X-A', 'Maths', 'Asha') === 3, 'the allocated teacher teaches exactly their 3', `${countOf(r.classTT, 'X-A', 'Maths', 'Asha')}`)
  ok(countOf(r.classTT, 'X-A', 'Maths', 'Bala') === 0,
    'the 2 nobody was allocated are left unplaced, not handed to another Maths teacher')
}

// ── 4. A row for someone who has left does not fence the subject off ──────
{
  const sections = [{ id: 's1', name: 'VI-A', grade: 'VI' }] as any[]
  const subjects = [{ id: 'sc', name: 'Science', periodsPerWeek: 4 }] as any[]
  const staff = [{ id: 'c', name: 'Chitra', subjects: ['Science'], maxPeriodsPerWeek: 30 }] as any[]
  const A: Alloc = { Ghost: { 'VI-A': { Science: 4 } } }
  const r = solveTimetable({ sections, staff, subjects, periods, workDays, requirements: [],
    subjectAllocations: { 'VI-A': { Science: '4' } }, teacherAllocations: A } as any)
  console.log('allocation naming a teacher no longer on staff')
  ok(countOf(r.classTT, 'VI-A', 'Science', 'Chitra') === 4,
    'the subject falls back to the teachers who list it rather than going untaught', `${countOf(r.classTT, 'VI-A', 'Science', 'Chitra')}/4`)
}

// ── 5. The class teacher's Period 1 respects the allocation too ───────────
{
  const sections = [{ id: 's1', name: 'VII-A', grade: 'VII', classTeacher: 'ct' }] as any[]
  const subjects = [{ id: 'm', name: 'Maths', periodsPerWeek: 5 }, { id: 'e', name: 'English', periodsPerWeek: 5 }] as any[]
  const staff = [
    { id: 'ct', name: 'Dev', subjects: ['Maths', 'English'], maxPeriodsPerWeek: 30 },
    { id: 'o', name: 'Esha', subjects: ['Maths'], maxPeriodsPerWeek: 30 },
  ] as any[]
  const A: Alloc = { Dev: { 'VII-A': { English: 5 } }, Esha: { 'VII-A': { Maths: 5 } } }
  const r = solveTimetable({ sections, staff, subjects, periods, workDays, requirements: [],
    subjectAllocations: { 'VII-A': { Maths: '5', English: '5' } }, teacherAllocations: A } as any)
  const ctLessons = lessons(r.classTT).filter(l => l.ct)
  console.log('class teacher')
  ok(ctLessons.length > 0 && ctLessons.every(l => l.subject === 'English'),
    "the class teacher's Period 1 is a subject they were allocated here, not the first on their list",
    ctLessons.map(l => l.subject).join(',') || 'none placed')
  ok(unallocated(r.classTT, A).length === 0, 'and nothing else in the class breaks the allocation')
}

// ── 6. Re-optimise: never strips a teacher, never breaks the allocation ───
{
  const sections = [{ id: 's1', name: 'I-A', grade: 'I' }, { id: 's2', name: 'II-A', grade: 'II' }] as any[]
  const subjects = [{ id: 'evs', name: 'EVS', periodsPerWeek: 2 }, { id: 'm', name: 'Maths', periodsPerWeek: 2 }] as any[]
  // Nobody lists EVS. The grid has it with Teacher 1 - the shape the live
  // school had. Re-optimise used to clear it, find nobody qualified, and leave
  // the lesson with no teacher; the chart looked more even, so it was kept.
  const staff = [
    { id: 't1', name: 'Teacher 1', subjects: ['Maths'], maxPeriodsPerWeek: 30 },
    { id: 't2', name: 'Teacher 2', subjects: ['Maths'], maxPeriodsPerWeek: 30 },
  ] as any[]
  const c = (subject: string, teacher: string) => ({ subject, teacher })
  const classTT: any = {
    'I-A': { MONDAY: { p1: c('EVS', 'Teacher 1'), p2: c('Maths', 'Teacher 1'), p3: c('EVS', 'Teacher 1') } },
    'II-A': { MONDAY: { p1: c('Maths', 'Teacher 2'), p2: c('Maths', 'Teacher 1'), p3: c('Maths', 'Teacher 1') } },
  }
  const r = reoptimizeTeachers({ classTT, sections, staff, subjects, periods: periods.slice(0, 3), workDays: ['MONDAY'] } as any)
  console.log('re-optimise')
  const blank = lessons(r.classTT).filter(l => !l.teacher)
  ok(blank.length === 0, 'no lesson comes back without a teacher', blank.map(b => `${b.sec} ${b.pid} ${b.subject}`).join(', '))

  const A: Alloc = { 'Teacher 1': { 'I-A': { Maths: 1 } }, 'Teacher 2': { 'II-A': { Maths: 3 } } }
  const fair: any = {
    'I-A': { MONDAY: { p1: c('Maths', 'Teacher 1') } },
    'II-A': { MONDAY: { p1: c('Maths', 'Teacher 2'), p2: c('Maths', 'Teacher 2'), p3: c('Maths', 'Teacher 2') } },
  }
  const r2 = reoptimizeTeachers({ classTT: fair, sections, staff, subjects, periods: periods.slice(0, 3), workDays: ['MONDAY'], teacherAllocations: A } as any)
  ok(unallocated(r2.classTT, A).length === 0,
    'balancing the load does not move an allocated lesson to an unallocated teacher',
    `${r2.reassignedCount} reassigned`)
}

// ── 7. The plumbing ───────────────────────────────────────────────────────
{
  const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1')
  const read = (p: string) => strip(readFileSync(p, 'utf8'))
  console.log('wiring')
  const wizard = read('src/routes/wizard/step6-generate.tsx')
  ok(/const payload: GenerationPayload = \{[\s\S]*?teacherAllocations:[\s\S]*?\n {4}\}/.test(wizard),
    'the wizard puts the allocation matrix in the generation payload')
  const pipe = read('src/lib/generationPipeline.ts')
  const solves = pipe.split('solveTimetable({').slice(1).map(chunk => chunk.slice(0, chunk.indexOf('})')))
  ok(solves.length >= 2 && solves.every(s => s.includes('teacherAllocations')),
    'every solve in the pipeline is given the matrix', `${solves.filter(s => s.includes('teacherAllocations')).length}/${solves.length}`)
  const review = read('src/components/master/ReviewDashboard.tsx')
  const reopt = review.split('reoptimizeTeachers({').slice(1).map(chunk => chunk.slice(0, chunk.indexOf('})')))
  ok(reopt.length >= 1 && reopt.every(s => s.includes('teacherAllocations')),
    're-optimise is given the matrix wherever it is called')
}

console.log(fail === 0 ? '\nALL ALLOCATION CHECKS PASSED' : `\n${fail} CHECK(S) FAILED`)
process.exit(fail === 0 ? 0 : 1)
