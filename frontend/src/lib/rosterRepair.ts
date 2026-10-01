/**
 * The repair half of lib/rosterOrphans.
 *
 * That module finds lessons still booked to a teacher, venue, subject or class
 * the roster no longer has, and says so on every screen. It deliberately does
 * not fix them: who takes over a departed teacher's classes is the school's
 * decision. But it was the school's decision with no way to make it short of
 * regenerating the whole timetable or editing every period by hand, so the
 * warning stayed up for a term.
 *
 * These are the decisions, made explicit and one click each. Pure functions:
 * the page commits the result through its undo history.
 *
 * Reassigning never creates a clash. A lesson whose slot the replacement is
 * already teaching (or whose room is already in use) is left exactly as it
 * was and reported, so the warning stays up for just those periods and the
 * school can pick someone else for them.
 */
import { teachersInCell, roomsInCell } from './cellTeachers'
import { orOptionsInCell } from './orChoice'

export interface RepairResult {
  classTT: any
  /** Lessons changed. */
  changed: number
  /** Lessons left alone because the change would double-book someone. */
  blocked: Array<{ section: string; day: string; periodId: string }>
}

const key = (s: string | undefined) => (s ?? '').trim().toLowerCase()
const clone = (x: any) => JSON.parse(JSON.stringify(x ?? {}))

/** Every (section, day, periodId, cell) in the timetable. */
function* cellsOf(tt: any): Generator<[string, string, string, any]> {
  for (const [section, days] of Object.entries(tt ?? {})) {
    for (const [day, periods] of Object.entries((days ?? {}) as Record<string, any>)) {
      for (const [pid, cell] of Object.entries((periods ?? {}) as Record<string, any>)) {
        if (cell) yield [section, day, pid, cell]
      }
    }
  }
}

/** The parallel groups of a cell, in both shapes the app stores. */
const groupsOf = (cell: any): any[] => [...(cell?.groupAssignments ?? []), ...(cell?.options ?? [])]

/**
 * Give every lesson of a teacher who has left to someone on the roster.
 * `to` is the replacement's staff record, so the cell's id moves with the name.
 */
export function reassignTeacher(classTT: any, from: string, to: { name: string; id?: string }): RepairResult {
  const tt = clone(classTT)
  const blocked: RepairResult['blocked'] = []
  let changed = 0
  // Where the replacement already is, slot by slot - kept current as we go,
  // so two of the leaver's lessons at one moment cannot both land on them.
  const busy = new Set<string>()
  for (const [, day, pid, cell] of cellsOf(tt)) {
    if (teachersInCell(cell).some(t => key(t) === key(to.name))) busy.add(`${day}|${pid}`)
  }
  for (const [section, day, pid, cell] of cellsOf(tt)) {
    if (!teachersInCell(cell).some(t => key(t) === key(from))) continue
    if (busy.has(`${day}|${pid}`)) { blocked.push({ section, day, periodId: pid }); continue }
    if (key(cell.teacher) === key(from)) {
      cell.teacher = to.name
      if (to.id) cell.teacherId = to.id; else delete cell.teacherId
    }
    for (const g of groupsOf(cell)) if (key(g.teacher) === key(from)) g.teacher = to.name
    busy.add(`${day}|${pid}`)
    changed++
  }
  return { classTT: tt, changed, blocked }
}

/** Move every lesson booked into a venue that no longer exists. */
export function reassignRoom(classTT: any, from: string, to: string): RepairResult {
  const tt = clone(classTT)
  const blocked: RepairResult['blocked'] = []
  let changed = 0
  const used = new Set<string>()
  for (const [, day, pid, cell] of cellsOf(tt)) {
    if (roomsInCell(cell).some(r => key(r) === key(to))) used.add(`${day}|${pid}`)
  }
  for (const [section, day, pid, cell] of cellsOf(tt)) {
    if (!roomsInCell(cell).some(r => key(r) === key(from))) continue
    if (used.has(`${day}|${pid}`)) { blocked.push({ section, day, periodId: pid }); continue }
    if (key(cell.room) === key(from)) cell.room = to
    for (const g of groupsOf(cell)) if (key(g.room) === key(from)) g.room = to
    used.add(`${day}|${pid}`)
    changed++
  }
  return { classTT: tt, changed, blocked }
}

/**
 * Take a deleted subject off the timetable. A plain lesson of it is removed;
 * in a parallel lesson only its own group goes, and the others keep running.
 */
export function removeSubject(classTT: any, subject: string): RepairResult {
  const tt = clone(classTT)
  let changed = 0
  for (const [section, day, pid, cell] of cellsOf(tt)) {
    const groups = groupsOf(cell)
    if (!groups.length) {
      if (key(cell.subject) === key(subject)) { delete tt[section][day][pid]; changed++ }
      continue
    }
    if (!groups.some(g => key(g.subject) === key(subject))) continue
    // OR versus AND is lib/orChoice's call, asked before the groups change.
    const isOr = orOptionsInCell({ subject: cell.subject, groupAssignments: groups }) !== null
    const keep = (arr?: any[]) => arr?.filter(g => key(g.subject) !== key(subject))
    if (cell.groupAssignments) cell.groupAssignments = keep(cell.groupAssignments)
    if (cell.options) cell.options = keep(cell.options)
    const left = groupsOf(cell)
    if (!left.length) { delete tt[section][day][pid]; changed++; continue }
    // The cell's own label and first-group mirror must describe what is left.
    cell.subject = left.length === 1 ? left[0].subject : left.map(g => g.subject).join(isOr ? ' OR ' : ' AND ')
    cell.teacher = left[0].teacher ?? ''
    cell.room = left[0].room ?? cell.room
    delete cell.teacherId
    changed++
  }
  return { classTT: tt, changed, blocked: [] }
}

/** Drop the schedule of a class that is no longer on the roster. */
export function removeSection(classTT: any, section: string): RepairResult {
  const tt = clone(classTT)
  let changed = 0
  for (const name of Object.keys(tt)) {
    if (key(name) !== key(section)) continue
    for (const periods of Object.values(tt[name] ?? {}) as any[]) changed += Object.values(periods ?? {}).filter(Boolean).length
    delete tt[name]
  }
  return { classTT: tt, changed, blocked: [] }
}

/** "Reassigned 10 of 12 lessons to Asha. 2 clash with her own and still show Ravi." */
export function repairSummary(r: RepairResult, done: string, leftName: string): string {
  const total = r.changed + r.blocked.length
  if (!r.blocked.length) return `${done}: ${r.changed} lesson${r.changed === 1 ? '' : 's'}.`
  return `${done}: ${r.changed} of ${total} lessons. `
    + `${r.blocked.length} would double-book, so they still show ${leftName} - pick someone else for those.`
}
