/* Verifies deriveTeacherAllocations — the backward-sync helper. Run: npx tsx derive-alloc-verify.mts */
import { deriveTeacherAllocations, deriveSubjectAllocations } from './src/lib/schedulingEngine'
import type { ClassTimetable } from './src/types'

let fail = 0
const ok = (c: boolean, m: string) => { console.log((c ? '✓' : '✗ FAIL') + ' ' + m); if (!c) fail++ }

const cell = (subject: string, teacher: string) => ({ subject, teacher, room: 'R1' } as any)

// A tiny timetable: section VI-A, 2 days, a few periods.
const tt: ClassTimetable = {
  'VI-A': {
    Mon: { p1: cell('Mathematics', 'J. Abraham'), p2: cell('Science', 'M. Esther'), p3: cell('Mathematics', 'J. Abraham') },
    Tue: { p1: cell('Mathematics', 'J. Abraham'), p2: cell('Science', 'M. Esther') },
  },
  'VI-B': {
    Mon: { p1: cell('Mathematics', 'J. Abraham'), p2: cell('English', 'D. Samuel') },
  },
}

const m = deriveTeacherAllocations(tt)
ok(m['J. Abraham']?.['VI-A']?.['Mathematics'] === 3, 'J. Abraham teaches Maths x3 in VI-A')
ok(m['M. Esther']?.['VI-A']?.['Science'] === 2, 'M. Esther teaches Science x2 in VI-A')
ok(m['J. Abraham']?.['VI-B']?.['Mathematics'] === 1, 'J. Abraham teaches Maths x1 in VI-B')
ok(m['D. Samuel']?.['VI-B']?.['English'] === 1, 'D. Samuel teaches English x1 in VI-B')
ok(m['J. Abraham'] && !m['J. Abraham']['VI-A']['Science'], 'no phantom Science for J. Abraham')

// Reassign one VI-A Maths lesson from J. Abraham → R. Naomi (a re-optimise move).
const tt2: ClassTimetable = JSON.parse(JSON.stringify(tt))
tt2['VI-A'].Mon.p1.teacher = 'R. Naomi'
const m2 = deriveTeacherAllocations(tt2)
ok(m2['J. Abraham']['VI-A']['Mathematics'] === 2, 'after reassign: J. Abraham Maths 3 → 2')
ok(m2['R. Naomi']?.['VI-A']?.['Mathematics'] === 1, 'after reassign: R. Naomi picks up 1 Maths lesson')

// Total periods conserved across the reassignment.
const total = (mm: any) => Object.values(mm).reduce((a: number, secs: any) =>
  a + Object.values(secs).reduce((b: number, subs: any) =>
    b + Object.values(subs).reduce((c: number, n: any) => c + n, 0), 0), 0)
ok(total(m) === total(m2), `total lesson count conserved (${total(m)} == ${total(m2)})`)

// OR/AND group cell: groupAssignments should credit each subject's teacher.
const ttG: ClassTimetable = {
  'XI-A': { Mon: { p1: { subject: 'Physics', teacher: 'A', room: 'R',
    groupAssignments: [ { subject: 'Physics', teacher: 'A' }, { subject: 'Biology', teacher: 'B' } ] } as any } },
}
const mG = deriveTeacherAllocations(ttG)
ok(mG['A']?.['XI-A']?.['Physics'] === 1 && mG['B']?.['XI-A']?.['Biology'] === 1, 'group cell credits each subject teacher')

// Class/subject allocation derive: per-section subject → periods.
const sa = deriveSubjectAllocations(tt)
ok(sa['VI-A']?.['Mathematics'] === '3', 'subjectAlloc: VI-A Mathematics = "3"')
ok(sa['VI-A']?.['Science'] === '2', 'subjectAlloc: VI-A Science = "2"')
ok(sa['VI-B']?.['English'] === '1' && sa['VI-B']?.['Mathematics'] === '1', 'subjectAlloc: VI-B English & Maths = "1"')
const saG = deriveSubjectAllocations(ttG)
ok(saG['XI-A']?.['Physics'] === '1' && saG['XI-A']?.['Biology'] === '1', 'subjectAlloc: group cell counts each subject')

console.log(fail === 0 ? '\nALL DERIVE-ALLOC CHECKS PASSED' : `\n${fail} CHECK(S) FAILED`)
process.exit(fail === 0 ? 0 : 1)
