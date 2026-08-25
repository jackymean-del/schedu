// Exercise reoptimizeTeachers: (1) never returns a worse result,
// (2) respects weekly caps, (3) reassignedCount counts only real changes.
import { reoptimizeTeachers } from './src/lib/schedulingEngine.ts'

let fail = 0
const ok = (cond: boolean, label: string, extra = '') => {
  console.log(`${cond ? '✓' : '✗'} ${label}${extra ? ' — ' + extra : ''}`)
  if (!cond) fail++
}

const workDays = ['MONDAY', 'TUESDAY']
const periods = [
  { id: 'p1', name: 'P1', duration: 40, type: 'class' },
  { id: 'p2', name: 'P2', duration: 40, type: 'class' },
  { id: 'p3', name: 'P3', duration: 40, type: 'class' },
] as any[]
const sections = [
  { id: 's1', name: 'IX-A', grade: 'IX' },
  { id: 's2', name: 'IX-B', grade: 'IX' },
] as any[]
// T1 can teach both subjects, cap 4/wk. T2 can teach both, cap 40.
const staff = [
  { id: 't1', name: 'T1', subjects: ['Maths', 'Science'], maxPeriodsPerWeek: 4 },
  { id: 't2', name: 'T2', subjects: ['Maths', 'Science'], maxPeriodsPerWeek: 40 },
] as any[]
const subjects = [
  { id: 'su1', name: 'Maths', periodsPerWeek: 3 },
  { id: 'su2', name: 'Science', periodsPerWeek: 3 },
] as any[]

// teacherWeeklyLoad is keyed by staff ID (tKey), not by the display name the
// cells carry — that is exactly what keeps two teachers who share a name
// apart. Every check below used to look loads up by NAME, so each one read
// undefined, compared 0 against the cap, and passed without testing anything.
const loadOf = (r: any, id: string): number => r.teacherWeeklyLoad[id] ?? 0
const capViol = (loads: Record<string, number>) =>
  staff.reduce((a: number, t: any) => a + Math.max(0, (loads[t.id] ?? 0) - t.maxPeriodsPerWeek), 0)

/** Cells whose teacher differs between two timetables. */
const changedCells = (a: any, b: any): number => {
  let n = 0
  for (const sec of Object.keys(a)) {
    for (const day of Object.keys(a[sec] ?? {})) {
      for (const pid of Object.keys(a[sec][day] ?? {})) {
        if (a[sec][day][pid]?.teacher !== b?.[sec]?.[day]?.[pid]?.teacher) n++
      }
    }
  }
  return n
}

// Build a classTT where T1 is at 6 (over their cap of 4) and T2 at 6.
const cell = (subject: string, teacher: string) => ({ subject, teacher })
const classTT: any = {
  'IX-A': {
    MONDAY:  { p1: cell('Maths', 'T1'), p2: cell('Science', 'T1'), p3: cell('Maths', 'T2') },
    TUESDAY: { p1: cell('Science', 'T2'), p2: cell('Maths', 'T1'), p3: cell('Science', 'T2') },
  },
  'IX-B': {
    MONDAY:  { p1: cell('Maths', 'T2'), p2: cell('Science', 'T2'), p3: cell('Maths', 'T1') },
    TUESDAY: { p1: cell('Science', 'T1'), p2: cell('Maths', 'T2'), p3: cell('Science', 'T1') },
  },
}

const before = JSON.stringify(classTT)
const r1 = reoptimizeTeachers({ classTT, sections, staff, subjects, periods, workDays })
console.log('--- run 1 (overloaded incumbent) ---')
console.log('reassigned:', r1.reassignedCount, 'stddev:', r1.teacherLoadStddev.toFixed(2), 'loads:', r1.teacherWeeklyLoad)
ok(loadOf(r1, 't1') <= 4, 'T1 load respects cap (<=4)', `load ${loadOf(r1, 't1')}`)
ok(capViol(r1.teacherWeeklyLoad) === 0, 'no weekly-cap violations after run 1')
ok(JSON.stringify(classTT) === before, 'input classTT not mutated')

// Run 2: feed the improved result back in — should be "already optimal" (0 reassigned, unchanged stats)
const r2 = reoptimizeTeachers({ classTT: r1.classTT, sections, staff, subjects, periods, workDays })
console.log('--- run 2 (idempotency / never-worse) ---')
console.log('reassigned:', r2.reassignedCount, 'stddev:', r2.teacherLoadStddev.toFixed(2))
ok(r2.teacherLoadStddev <= r1.teacherLoadStddev + 1e-9, 'never worse than the previous pass')
console.log('kept incumbent object:', r2.classTT === r1.classTT ? 'same ref' : 'new obj (ok if identical)')
ok(capViol(r2.teacherWeeklyLoad) === 0, 'no weekly-cap violations after run 2')

// ── Run 3: improvement IS possible — one section, T1 hogging all 6 slots
// (over cap 4) while T2 sits idle. Expect: T1 trimmed to <=4, overCap -> 0,
// accepted, and reassignedCount = only the cells that actually changed.
const classTT3: any = {
  'IX-A': {
    MONDAY:  { p1: cell('Maths', 'T1'), p2: cell('Science', 'T1'), p3: cell('Maths', 'T1') },
    TUESDAY: { p1: cell('Science', 'T1'), p2: cell('Maths', 'T1'), p3: cell('Science', 'T1') },
  },
}
const r3 = reoptimizeTeachers({ classTT: classTT3, sections: [sections[0]], staff, subjects, periods, workDays })
console.log('--- run 3 (fixable overload) ---')
console.log('reassigned:', r3.reassignedCount, 'loads:', r3.teacherWeeklyLoad)
ok(capViol(r3.teacherWeeklyLoad) === 0, 'overload fixed', `${capViol(r3.teacherWeeklyLoad)} violations left`)
ok(loadOf(r3, 't1') <= 4, 'T1 trimmed to their cap', `load ${loadOf(r3, 't1')}`)
ok(r3.reassignedCount === changedCells(classTT3, r3.classTT),
  'reassignedCount == cells whose teacher actually changed',
  `reported ${r3.reassignedCount}, changed ${changedCells(classTT3, r3.classTT)}`)

console.log(fail === 0 ? '\nALL REOPT CHECKS PASSED' : `\n${fail} CHECK(S) FAILED`)
process.exit(fail === 0 ? 0 : 1)
