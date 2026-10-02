/**
 * The rows behind every Excel export of a timetable - pure, so export-verify
 * can read what a school would actually be handed.
 *
 * What the old exporter handed them:
 *  - a teacher's sheet said "Mathematics" in a cell, with no class: the one
 *    thing a teacher reads their timetable to find out;
 *  - a parallel (OR/AND) lesson listed its first teacher only, so the others'
 *    names never reached paper, and a room used by a lesson's second group
 *    was missing from that room's sheet;
 *  - no times anywhere, on a document printed and pinned to a staffroom wall.
 */
import { teachingPairsInCell, roomsInCell } from './cellTeachers'
import { schedulePeriodTimes } from './bellTimes'
import { classTeacherOf } from './classTeacher'

export type ExcelFormat =
  | 'class-day' | 'class-class' | 'teacher-day' | 'teacher-teacher' | 'room-day' | 'room-room'

export interface SheetSpec { name: string; rows: string[][] }

export interface ExportInput {
  config: any
  sections: Array<{ name: string; classTeacher?: string }>
  staff: Array<{ id?: string; name: string; isClassTeacher?: string }>
  periods: Array<{ id: string; name: string; type: string }>
  classTT: Record<string, any>
  sectionLabel?: string
  staffLabel?: string
}

const DAY_TITLE = (d: string) => d.charAt(0) + d.slice(1).toLowerCase()

function clock(min: number, h24: boolean) {
  const h = Math.floor(min / 60), m = min % 60
  if (h24) return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
  return `${h % 12 || 12}:${String(m).padStart(2, '0')}${h >= 12 ? 'pm' : 'am'}`
}

/** "Mathematics\nR. Rao\nRoom 4" - or, for a parallel lesson, every group. */
export function classCellText(cell: any): string {
  if (!cell?.subject) return ''
  const pairs = teachingPairsInCell(cell)
  if (pairs.length > 1) {
    return [cell.subject, ...pairs.map(p => `${p.subject}: ${p.teacher}${p.room ? ` (${p.room})` : ''}`)].join('\n')
  }
  return [cell.subject, pairs[0]?.teacher ?? cell.teacher ?? '', pairs[0]?.room || cell.room || ''].filter(Boolean).join('\n')
}

export function buildExportSheets(format: ExcelFormat, d: ExportInput): SheetSpec[] {
  const days: string[] = d.config?.workDays ?? []
  const classPeriods = d.periods.filter(p => p.type === 'class')
  const h24 = (d.config?.timeFormat ?? '12h') === '24h'
  const times = schedulePeriodTimes(d.config ?? {}, d.periods as any, d.sections)
  const head = (p: { id: string; name: string }) => {
    const t = times.get(p.id)
    return t ? `${p.name} (${clock(t.startMin, h24)}-${clock(t.endMin, h24)})` : p.name
  }
  const cellAt = (sec: string, day: string, pid: string) => d.classTT[sec]?.[day]?.[pid]

  /** What one teacher is doing in one slot: subject and class, from the
   *  timetable itself, every parallel group included. */
  const teacherText = (name: string, day: string, pid: string): string => {
    const hits: string[] = []
    for (const sec of d.sections) {
      const c = cellAt(sec.name, day, pid)
      for (const p of teachingPairsInCell(c)) {
        if (p.teacher === name) hits.push(`${p.subject} · ${sec.name}${p.room ? ` · ${p.room}` : ''}`)
      }
    }
    return hits.join(' + ') || 'Free'
  }

  const allRooms = [...new Set(d.sections.flatMap(sec => days.flatMap(day =>
    classPeriods.flatMap(p => roomsInCell(cellAt(sec.name, day, p.id))))))].filter(Boolean).sort()
  const roomText = (room: string, day: string, pid: string): string => {
    const hits: string[] = []
    for (const sec of d.sections) {
      const c = cellAt(sec.name, day, pid)
      if (!c?.subject) continue
      const pairs = teachingPairsInCell(c)
      const here = pairs.filter(p => p.room === room)
      if (here.length) for (const p of here) hits.push(`${p.subject} · ${sec.name}`)
      else if (roomsInCell(c).includes(room)) hits.push(`${c.subject} · ${sec.name}`)
    }
    return hits.join(' + ')
  }

  const sheets: SheetSpec[] = []
  if (format === 'class-day') {
    for (const day of days) {
      const rows = [[d.sectionLabel ?? 'Class', ...d.periods.map(head)]]
      for (const sec of d.sections) {
        rows.push([sec.name, ...d.periods.map(p => p.type !== 'class' ? p.name : classCellText(cellAt(sec.name, day, p.id)))])
      }
      sheets.push({ name: DAY_TITLE(day), rows })
    }
  } else if (format === 'class-class') {
    for (const sec of d.sections) {
      const ctName = sec.classTeacher
        ? (d.staff.find(st => st.id === sec.classTeacher || st.name === sec.classTeacher)?.name ?? sec.classTeacher)
        : ''
      const ct = ctName ? `Class teacher: ${ctName}` : ''
      const rows = [[`${sec.name}${ct ? ` | ${ct}` : ''}`], ['Day', ...d.periods.map(head)]]
      for (const day of days) {
        rows.push([DAY_TITLE(day), ...d.periods.map(p => p.type !== 'class' ? p.name : classCellText(cellAt(sec.name, day, p.id)))])
      }
      sheets.push({ name: sec.name, rows })
    }
  } else if (format === 'teacher-day') {
    for (const day of days) {
      const rows = [[d.staffLabel ?? 'Teacher', ...classPeriods.map(head)]]
      for (const st of d.staff) rows.push([st.name, ...classPeriods.map(p => teacherText(st.name, day, p.id))])
      sheets.push({ name: DAY_TITLE(day), rows })
    }
  } else if (format === 'teacher-teacher') {
    for (const st of d.staff) {
      const ct = classTeacherOf(st, d.sections)
      const rows = [[`${st.name}${ct ? ` | Class teacher of ${ct}` : ''}`], ['Day', ...classPeriods.map(head)]]
      for (const day of days) rows.push([DAY_TITLE(day), ...classPeriods.map(p => teacherText(st.name, day, p.id))])
      sheets.push({ name: st.name, rows })
    }
  } else if (format === 'room-day') {
    for (const day of days) {
      const rows = [['Room', ...classPeriods.map(head)]]
      for (const room of allRooms) rows.push([room, ...classPeriods.map(p => roomText(room, day, p.id))])
      sheets.push({ name: DAY_TITLE(day), rows })
    }
  } else if (format === 'room-room') {
    for (const room of allRooms) {
      const rows = [[room], ['Day', ...classPeriods.map(head)]]
      for (const day of days) rows.push([DAY_TITLE(day), ...classPeriods.map(p => roomText(room, day, p.id))])
      sheets.push({ name: room, rows })
    }
  }
  return sheets
}

/** "Cover Test School - teacher-wise - 2026.xlsx" */
export function exportFileName(timetableName: string | undefined, format: ExcelFormat, year = new Date().getFullYear()): string {
  const label = format.replace('-', '_')
  return `${(timetableName || 'schedU').trim()}_${label}_${year}.xlsx`
}
