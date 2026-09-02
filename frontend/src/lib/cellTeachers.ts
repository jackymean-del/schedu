/**
 * WHO TEACHES THIS CELL.
 *
 * A timetable cell usually names one teacher. An OR/AND cell does not: it runs
 * parallel subjects in a single slot and names a teacher PER SUBJECT in
 * `groupAssignments`, mirroring only the first into the cell-level `teacher`
 * field. The type says as much — that field is kept "for backward
 * compatibility" — but the shape is quietly lossy, and reading it is the
 * obvious thing to do.
 *
 * Four subsystems read the copy and were wrong in four different ways:
 *
 *   conflict detection    a teacher in a later group could be double-booked
 *                         elsewhere and nothing said so (twice — the solver's
 *                         own list and detectConflicts had drifted into the
 *                         same blind spot independently)
 *   the cover flow        an absent teacher taking a later group left a class
 *                         with nobody, and the day summary reported it clear
 *   free/busy             a teacher mid-lesson in a later group looked FREE,
 *                         so the app offered them as a substitute and created
 *                         the double-booking itself
 *   leave reporting       periods lost to an absence were undercounted
 *
 * So it lives here once. Anything answering "who teaches this?" — as opposed to
 * "what should this cell say?" — should call these rather than reach for the
 * field.
 */

/** A cell as far as this module cares. */
interface TeachingCell {
  teacher?: string
  subject?: string
  groupAssignments?: Array<{ subject?: string; teacher?: string }>
}

/**
 * Every teacher in the cell, in group order.
 *
 * Deliberately NOT a union with `cell.teacher`: that field mirrors
 * groupAssignments[0], so including both would report a parallel cell as
 * clashing with itself.
 */
export function teachersInCell(cell: TeachingCell | undefined | null): string[] {
  if (!cell) return []
  if (cell.groupAssignments?.length) {
    return cell.groupAssignments
      .map(g => (g.teacher ?? '').trim())
      .filter(Boolean)
  }
  const solo = (cell.teacher ?? '').trim()
  return solo ? [solo] : []
}

/** Every (teacher, subject) pair in the cell — for surfaces that must say
 *  WHICH group a teacher is with, such as a cover list. */
export function teachingPairsInCell(
  cell: TeachingCell | undefined | null,
): Array<{ teacher: string; subject: string }> {
  if (!cell) return []
  if (cell.groupAssignments?.length) {
    return cell.groupAssignments
      .filter(g => (g.teacher ?? '').trim())
      .map(g => ({ teacher: g.teacher!.trim(), subject: (g.subject ?? cell.subject ?? '').trim() }))
  }
  const solo = (cell.teacher ?? '').trim()
  return solo ? [{ teacher: solo, subject: (cell.subject ?? '').trim() }] : []
}

/** Is this person teaching in this cell at all? */
export function cellHasTeacher(cell: TeachingCell | undefined | null, name: string): boolean {
  if (!name) return false
  return teachersInCell(cell).includes(name.trim())
}
