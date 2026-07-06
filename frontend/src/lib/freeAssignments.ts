/**
 * Free-slot assignments — give an idle resource a job for a specific period
 * on a specific date: a free teacher gets exam invigilation, an empty hall
 * hosts a club, a class with no lesson gets supervised self-study.
 *
 * Assignments are date-scoped (unlike substitutions, which are day-of-week
 * keyed) and label-only: they never touch the generated timetable. They show
 * up on the Live board (an "On assignment" group between In-session and Free)
 * and as dashed TASK blocks on the Day grid for that entity's row.
 *
 * `sid` tags which active schedule's period grid `periodId` resolves against
 * — with multiple active schedules, the same periodId (e.g. "p1") can mean a
 * different time on a different bell, so periodId alone is ambiguous.
 * Records created before this field existed have no `sid`; `assignmentAt`
 * treats a missing `sid` on either side as a wildcard so old single-schedule
 * assignments keep matching exactly as before.
 */

export type AssignKind = 'teacher' | 'room' | 'class'

export interface FreeAssignment {
  id: string
  date: string          // ISO yyyy-mm-dd
  periodId: string
  sid?: string          // owning schedule id; absent = legacy pre-multi-active record
  kind: AssignKind
  entity: string        // teacher / venue / class name
  title: string
  note?: string
}

const KEY = 'schedu-free-tasks'

export function loadAssignments(uid: string): FreeAssignment[] {
  try { return JSON.parse(localStorage.getItem(`${KEY}:${uid}`) || '[]') } catch { return [] }
}

export function saveAssignments(uid: string, list: FreeAssignment[]): void {
  try { localStorage.setItem(`${KEY}:${uid}`, JSON.stringify(list)) } catch { /* quota */ }
}

export function assignmentAt(
  list: FreeAssignment[], date: string, periodId: string, kind: AssignKind, entity: string, sid?: string,
): FreeAssignment | undefined {
  return list.find(a => a.date === date && a.periodId === periodId && a.kind === kind && a.entity === entity
    && (sid === undefined || a.sid === undefined || a.sid === sid))
}

/** Quick-pick task titles per resource kind — free text always allowed. */
export const TASK_PRESETS: Record<AssignKind, string[]> = {
  teacher: ['Substitution cover', 'Exam invigilation', 'Library duty', 'Admin support', 'Lesson planning', 'Student counselling'],
  room:    ['Extra class', 'Club activity', 'Exam hall', 'Event setup', 'Maintenance', 'Parent meeting'],
  class:   ['Self-study', 'Library visit', 'Sports practice', 'Assembly rehearsal', 'Quiet reading', 'Project work'],
}
