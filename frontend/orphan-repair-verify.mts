/**
 * Repairing what a roster deletion left behind.
 * Run: npx tsx orphan-repair-verify.mts   (from frontend/)
 *
 * lib/rosterOrphans finds lessons still booked to a teacher, venue, subject or
 * class that is gone; lib/rosterRepair is how the school resolves them. The
 * one promise that matters is that a repair never makes things worse: it must
 * not double-book the person or room it hands lessons to, and it must reach
 * every shape a lesson can take, including both parallel-group shapes.
 */
import { findOrphans } from './src/lib/rosterOrphans.ts'
import { reassignTeacher, reassignRoom, removeSubject, removeSection } from './src/lib/rosterRepair.ts'
import { teachersInCell, roomsInCell } from './src/lib/cellTeachers.ts'

let fail = 0
const ok = (cond: boolean, label: string, extra = '') => {
  console.log(`${cond ? '✓' : '✗'} ${label}${extra ? ' - ' + extra : ''}`)
  if (!cond) fail++
}

const c = (subject: string, teacher: string, room = 'R1', extra: any = {}) => ({ subject, teacher, room, ...extra })
/** Most times any one teacher appears at a single (day, period). */
const worstDoubleBooking = (tt: any, name: string) => {
  const at: Record<string, number> = {}
  for (const days of Object.values<any>(tt)) for (const [d, ps] of Object.entries<any>(days)) for (const [p, cell] of Object.entries<any>(ps)) {
    if (teachersInCell(cell).includes(name)) at[`${d}|${p}`] = (at[`${d}|${p}`] ?? 0) + 1
  }
  return Math.max(0, ...Object.values(at))
}

// ── Detection reads both parallel shapes ─────────────────────────────────
{
  console.log('detection')
  const tt = { 'IX-A': { MONDAY: { p1: { subject: 'Hindi OR Odia', teacher: 'Asha', room: 'R1',
    options: [{ subject: 'Hindi', teacher: 'Asha', room: 'R1' }, { subject: 'Odia', teacher: 'Ravi', room: 'R2' }] } } } }
  const o = findOrphans(tt, 'teacher', ['Asha'])
  ok(o.length === 1 && o[0].name === 'Ravi',
    "a departed teacher in a block's options[] (not its first group) is reported", o.map(x => x.name).join(','))
  const r = findOrphans(tt, 'room', ['R1'])
  ok(r.length === 1 && r[0].name === 'R2', "and so is a deleted venue used only by a block's second group")
}

// ── Reassigning a teacher ────────────────────────────────────────────────
{
  console.log('reassign a teacher')
  const tt: any = {
    'VI-A': { MONDAY: { p1: c('Maths', 'Ravi', 'R1', { teacherId: 'old' }), p2: c('Maths', 'Ravi') } },
    'VI-B': {
      MONDAY: {
        p1: c('Science', 'Asha'),                      // Asha already busy at p1
        p3: { subject: 'Art AND Music', teacher: 'Neha', room: 'R3',
          groupAssignments: [{ subject: 'Art', teacher: 'Neha', room: 'R3' }, { subject: 'Music', teacher: 'Ravi', room: 'R4' }] },
      },
    },
    'VI-C': { MONDAY: { p2: c('Maths', 'Ravi') } },     // Ravi double-booked at p2 already
  }
  const before = JSON.stringify(tt)
  const r = reassignTeacher(tt, 'Ravi', { name: 'Asha', id: 'a1' })
  ok(JSON.stringify(tt) === before, 'the input timetable is not mutated')
  ok(r.classTT['VI-A'].MONDAY.p1.teacher === 'Ravi', 'a lesson at a slot Asha already teaches is left alone')
  ok(r.blocked.some(b => b.section === 'VI-A' && b.periodId === 'p1'), '...and reported as blocked')
  ok(worstDoubleBooking(r.classTT, 'Asha') <= 1, 'Asha is never in two places at once',
    `worst ${worstDoubleBooking(r.classTT, 'Asha')}`)
  const p2 = [r.classTT['VI-A'].MONDAY.p2.teacher, r.classTT['VI-C'].MONDAY.p2.teacher]
  ok(p2.filter(t => t === 'Asha').length === 1, "of Ravi's two lessons at one moment, only one goes to Asha", p2.join(','))
  ok(r.classTT['VI-B'].MONDAY.p3.groupAssignments[1].teacher === 'Asha', 'a parallel group of his is reassigned too')
  ok(r.classTT['VI-B'].MONDAY.p3.groupAssignments[0].teacher === 'Neha', '...without touching the other group')
  ok(r.changed === 2 && r.blocked.length === 2, 'the counts say so', `${r.changed} changed, ${r.blocked.length} blocked`)

  const moved = reassignTeacher({ 'X-A': { MONDAY: { p1: c('Maths', 'Ravi', 'R1', { teacherId: 'old' }) } } }, 'Ravi', { name: 'Asha', id: 'a1' })
  ok(moved.classTT['X-A'].MONDAY.p1.teacherId === 'a1', "the cell's id moves with the name, so identity matching follows")
}

// ── Reassigning a venue ──────────────────────────────────────────────────
{
  console.log('reassign a venue')
  const tt: any = {
    'VII-A': { MONDAY: { p1: c('Maths', 'T1', 'Old Lab'), p2: c('Maths', 'T1', 'Old Lab') } },
    'VII-B': { MONDAY: { p1: c('Science', 'T2', 'New Lab'),
      p2: { subject: 'Phy AND Chem', teacher: 'T3', room: 'R9', groupAssignments: [{ subject: 'Phy', teacher: 'T3', room: 'R9' }, { subject: 'Chem', teacher: 'T4', room: 'Old Lab' }] } } },
  }
  const r = reassignRoom(tt, 'Old Lab', 'New Lab')
  const usedAt = (pid: string) => Object.values<any>(r.classTT).filter((s: any) => roomsInCell(s.MONDAY[pid]).includes('New Lab')).length
  ok(usedAt('p1') <= 1 && usedAt('p2') <= 1, 'the new venue is never booked twice at one moment')
  ok(r.classTT['VII-A'].MONDAY.p1.room === 'Old Lab' && r.blocked.length === 2,
    'lessons whose slot already uses the new venue stay put and are reported', `${r.blocked.length} blocked`)
}

// ── Removing a subject or a class ────────────────────────────────────────
{
  console.log('remove a deleted subject or class')
  const tt: any = {
    'VIII-A': { MONDAY: {
      p1: c('Latin', 'T1'),
      p2: { subject: 'Latin OR French', teacher: 'T1', room: 'R1', groupAssignments: [{ subject: 'Latin', teacher: 'T1', room: 'R1' }, { subject: 'French', teacher: 'T2', room: 'R2' }] },
      p3: { subject: 'Latin AND French AND German', teacher: 'T1', room: 'R1', groupAssignments: [{ subject: 'Latin', teacher: 'T1' }, { subject: 'French', teacher: 'T2' }, { subject: 'German', teacher: 'T3' }] },
      p4: c('Maths', 'T5'),
    } },
    'OLD-Z': { MONDAY: { p1: c('Maths', 'T9') } },
  }
  const r = removeSubject(tt, 'Latin')
  const m = r.classTT['VIII-A'].MONDAY
  ok(!m.p1, 'a plain lesson of the subject is removed')
  ok(m.p2?.subject === 'French' && m.p2.teacher === 'T2' && m.p2.groupAssignments.length === 1,
    'in a parallel lesson only its group goes, and the label and first-teacher mirror follow', JSON.stringify(m.p2))
  ok(m.p3?.subject === 'French AND German' && m.p3.teacher === 'T2', 'an AND lesson stays AND', m.p3?.subject)
  ok(m.p4?.subject === 'Maths', 'other lessons are untouched')
  const s = removeSection(tt, 'old-z')
  ok(!s.classTT['OLD-Z'] && s.changed === 1 && !!s.classTT['VIII-A'], 'a deleted class loses its timetable, nobody else does')
}

console.log(fail === 0 ? '\nALL ORPHAN-REPAIR CHECKS PASSED' : `\n${fail} CHECK(S) FAILED`)
process.exit(fail === 0 ? 0 : 1)
