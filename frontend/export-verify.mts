/**
 * What a school is handed when it exports its timetable to Excel.
 * Run: npx tsx export-verify.mts   (from frontend/)
 *
 * The exporter wrote teacher sheets with a subject and no class, dropped every
 * teacher but the first from parallel lessons, left out rooms used by a
 * lesson's second group, printed no times, and named the file after an old
 * product. These are the things a printed timetable is for.
 */
import { readFileSync } from 'node:fs'
import { buildExportSheets, exportFileName, classCellText } from './src/lib/exportSheets.ts'

let fail = 0
const ok = (cond: boolean, label: string, extra = '') => {
  console.log(`${cond ? '✓' : '✗'} ${label}${extra ? ' - ' + extra : ''}`)
  if (!cond) fail++
}

const periods = [
  { id: 'p1', name: 'Period 1', duration: 40, type: 'class' },
  { id: 'b1', name: 'Break', duration: 15, type: 'break' },
  { id: 'p2', name: 'Period 2', duration: 40, type: 'class' },
]
const input = {
  config: { workDays: ['MONDAY'], startTime: '09:00', timeFormat: '12h' },
  sections: [{ name: 'VI-A', classTeacher: 't1' }, { name: 'VI-B' }],
  staff: [{ id: 't1', name: 'R. Rao' }, { id: 't2', name: 'S. Devi' }, { id: 't3', name: 'K. Iyer' }],
  periods,
  classTT: {
    'VI-A': { MONDAY: {
      p1: { subject: 'Mathematics', teacher: 'R. Rao', room: 'Room 6A' },
      p2: { subject: 'Art AND Music', teacher: 'S. Devi', room: 'Art Room',
            groupAssignments: [{ subject: 'Art', teacher: 'S. Devi', room: 'Art Room' }, { subject: 'Music', teacher: 'K. Iyer', room: 'Music Room' }] },
    } },
    'VI-B': { MONDAY: { p1: { subject: 'English', teacher: 'S. Devi', room: 'Room 6B' } } },
  },
}

console.log('class sheets')
{
  const [sheet] = buildExportSheets('class-class', input)
  ok(sheet.rows[0][0].includes('Class teacher: R. Rao'), 'a class sheet names its class teacher, resolved from the id', sheet.rows[0][0])
  ok(/Period 1 \(9:00am-9:40am\)/.test(sheet.rows[1].join('|')), 'period headers carry their times', sheet.rows[1][1])
  const p2 = sheet.rows[2][3]
  ok(p2.includes('Art: S. Devi') && p2.includes('Music: K. Iyer'), "a parallel lesson lists EVERY group's teacher", JSON.stringify(p2))
  ok(sheet.rows[2][2] === 'Break', 'breaks stay in their place in the row')
  ok(classCellText({ subject: 'Mathematics', teacher: 'R. Rao', room: 'Room 6A' }) === 'Mathematics\nR. Rao\nRoom 6A', 'a plain lesson reads subject, teacher, room')
}

console.log('teacher sheets')
{
  const sheets = buildExportSheets('teacher-teacher', input)
  const iyer = sheets.find(s => s.name === 'K. Iyer')!
  ok(iyer.rows[2][2] === 'Music · VI-A · Music Room', "a teacher's sheet says which class (and room), not just the subject", JSON.stringify(iyer.rows[2][2]))
  ok(iyer.rows[2][1] === 'Free', 'a free period says Free')
  const devi = buildExportSheets('teacher-day', input)[0].rows.find(r => r[0] === 'S. Devi')!
  ok(devi[1] === 'English · VI-B · Room 6B' && devi[2] === 'Art · VI-A · Art Room', 'the by-day sheet reads the same way', devi.slice(1).join(' | '))
  ok(sheets.find(s => s.name === 'R. Rao')!.rows[0][0].includes('Class teacher of VI-A'), 'a teacher sheet names the class they lead')
}

console.log('room sheets')
{
  const sheets = buildExportSheets('room-room', input)
  const music = sheets.find(s => s.name === 'Music Room')
  ok(!!music && music.rows[2][2] === 'Music · VI-A', "a room used only by a lesson's second group has its own sheet, with that group in it", JSON.stringify(music?.rows[2]))
}

console.log('file')
{
  ok(exportFileName(undefined, 'class-class', 2026) === 'schedU_class_class_2026.xlsx', 'an unnamed schedule exports as schedU, not an old product name')
  const hook = readFileSync('src/hooks/useExport.ts', 'utf8')
  ok(hook.includes('buildExportSheets(') && !/SmartSched/.test(hook), 'the export button writes what this file checks')
}

console.log(fail === 0 ? '\nALL EXPORT CHECKS PASSED' : `\n${fail} CHECK(S) FAILED`)
process.exit(fail === 0 ? 0 : 1)
