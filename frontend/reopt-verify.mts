// Exercise reoptimizeTeachers: (1) never returns a worse result,
// (2) respects weekly caps, (3) reassignedCount counts only real changes.
import { reoptimizeTeachers } from './src/lib/schedulingEngine.ts'

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
const t1Load = r1.teacherWeeklyLoad['T1'] ?? 0
console.log('T1 load respects cap (<=4):', t1Load <= 4 ? 'PASS' : `FAIL (${t1Load})`)
console.log('input classTT not mutated:', JSON.stringify(classTT) === before ? 'PASS' : 'FAIL')

// Run 2: feed the improved result back in — should be "already optimal" (0 reassigned, unchanged stats)
const r2 = reoptimizeTeachers({ classTT: r1.classTT, sections, staff, subjects, periods, workDays })
console.log('--- run 2 (idempotency / never-worse) ---')
console.log('reassigned:', r2.reassignedCount, 'stddev:', r2.teacherLoadStddev.toFixed(2))
console.log('never worse:', r2.teacherLoadStddev <= r1.teacherLoadStddev + 1e-9 ? 'PASS' : 'FAIL')
console.log('kept incumbent object:', r2.classTT === r1.classTT ? 'PASS (same ref)' : 'note: new obj (ok if identical)')
const capViol = (loads: Record<string, number>) => staff.reduce((a: number, t: any) => a + Math.max(0, (loads[t.name] ?? 0) - t.maxPeriodsPerWeek), 0)
console.log('cap violations run1:', capViol(r1.teacherWeeklyLoad), 'run2:', capViol(r2.teacherWeeklyLoad))

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
console.log('overload fixed:', capViol(r3.teacherWeeklyLoad) === 0 ? 'PASS' : `FAIL (${capViol(r3.teacherWeeklyLoad)})`)
console.log('reassigned == changed cells:', r3.reassignedCount === (r3.teacherWeeklyLoad['T2'] ?? 0) ? 'PASS' : 'FAIL')
