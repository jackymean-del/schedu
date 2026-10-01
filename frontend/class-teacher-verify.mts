/**
 * A class's class teacher is stated once, and every screen agrees.
 * Run: npx tsx class-teacher-verify.mts   (from frontend/)
 *
 * The fact lived on the class AND on the teacher, unsynchronised: the Classes
 * grid said "II-A - Teacher 1" while the Faculty grid said "Teacher 1 - class
 * teacher of: none", and the engine (which lets the class win) could ignore
 * what the Faculty grid showed. lib/classTeacher makes the class the source.
 */
import { readFileSync } from 'node:fs'
import { classTeacherOf, assignClassTeacher } from './src/lib/classTeacher.ts'

let fail = 0
const ok = (cond: boolean, label: string, extra = '') => {
  console.log(`${cond ? '✓' : '✗'} ${label}${extra ? ' - ' + extra : ''}`)
  if (!cond) fail++
}

const sections = [{ name: 'I-A', classTeacher: 'Teacher 3' }, { name: 'II-A', classTeacher: 'Teacher 1' }, { name: 'III-A', classTeacher: '' }]
const staff = [
  { id: 't1', name: 'Teacher 1', isClassTeacher: '' },
  { id: 't2', name: 'Teacher 2', isClassTeacher: 'I-A' },     // stale: I-A names Teacher 3
  { id: 't3', name: 'Teacher 3', isClassTeacher: '' },
  { id: 't4', name: 'Teacher 4', isClassTeacher: 'III-A' },   // legacy, class names nobody
]

console.log('reading')
ok(classTeacherOf(staff[0], sections) === 'II-A', 'a teacher the class names is shown as its class teacher, whatever the teacher row says')
ok(classTeacherOf(staff[1], sections) === '', 'a stale teacher-side claim to a class that names someone else is not shown')
ok(classTeacherOf(staff[3], sections) === 'III-A', 'a legacy teacher-side claim is honoured where the class names nobody')
ok(classTeacherOf({ id: 'x', name: 'Teacher 9' }, [{ name: 'X-A', classTeacher: 'x' }]) === 'X-A', 'a class may name its teacher by id')

console.log('writing')
{
  const r = assignClassTeacher(sections, staff, staff[0], 'III-A')
  const sec = (n: string) => r.sections.find(s => s.name === n)!
  ok(sec('III-A').classTeacher === 'Teacher 1', 'the class takes the new class teacher')
  ok(sec('II-A').classTeacher === '', "the teacher's previous class is released")
  ok(r.staff.find(s => s.id === 't1')!.isClassTeacher === 'III-A', 'the teacher row follows')
  ok(r.staff.find(s => s.id === 't4')!.isClassTeacher === '', "the class's previous (legacy) claimant is released")
  ok(classTeacherOf(r.staff.find(s => s.id === 't1')!, r.sections) === 'III-A', 'and reading it back agrees')
  ok(sections[1].classTeacher === 'Teacher 1', 'the input is not mutated')
}
{
  const r = assignClassTeacher(sections, staff, staff[0], '')
  ok(r.sections.every(s => s.classTeacher !== 'Teacher 1'), 'clearing it releases the class')
}

console.log('wiring')
{
  const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1')
  const panel = strip(readFileSync('src/components/resources/TeachersPanel.tsx', 'utf8'))
  const grid = strip(readFileSync('src/components/master/EntityGrids.tsx', 'utf8'))
  ok(panel.includes('classTeacherOf(') && panel.includes('assignClassTeacher('), 'the Faculty grid reads and writes through lib/classTeacher')
  ok(grid.includes('classTeacherOf(') && grid.includes('assignClassTeacher('), 'the Master Data teacher grid does too')
  ok(!/selected=\{[^}]*t\.isClassTeacher/.test(panel), 'nothing shows the teacher-side field directly')
}

console.log(fail === 0 ? '\nALL CLASS-TEACHER CHECKS PASSED' : `\n${fail} CHECK(S) FAILED`)
process.exit(fail === 0 ? 0 : 1)
