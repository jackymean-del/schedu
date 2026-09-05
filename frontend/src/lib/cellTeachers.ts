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
  /**
   * The OTHER parallel shape. An optional block ("PE / Art / Painting in one
   * slot") keeps its real teachers in `options[]` rather than
   * `groupAssignments`, and mirrors only the first into the cell-level fields
   * exactly as group cells do.
   *
   * Both shapes are read here because a private helper that knew about one and
   * not the other is precisely how this module's seven bugs happened: the
   * timetable page carried its own copy that matched `options` and missed
   * `groupAssignments`, so a teacher in a later GROUP vanished from their own
   * timetable and from every load count on the page.
   */
  options?: Array<{ subject?: string; teacher?: string }>
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
  const parallel = [...(cell.groupAssignments ?? []), ...(cell.options ?? [])]
  if (parallel.length) {
    const seen = new Set<string>()
    const out: string[] = []
    for (const g of parallel) {
      const t = (g.teacher ?? '').trim()
      // A cell can carry both shapes, and one teacher can appear in each; the
      // same person is not two people standing in one room.
      if (t && !seen.has(t)) { seen.add(t); out.push(t) }
    }
    return out
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
  const parallel = [...(cell.groupAssignments ?? []), ...(cell.options ?? [])]
  if (parallel.length) {
    const seen = new Set<string>()
    return parallel
      .filter(g => {
        const t = (g.teacher ?? '').trim()
        if (!t || seen.has(t)) return false
        seen.add(t); return true
      })
      .map(g => ({ teacher: g.teacher!.trim(), subject: (g.subject ?? cell.subject ?? '').trim() }))
  }
  const solo = (cell.teacher ?? '').trim()
  return solo ? [{ teacher: solo, subject: (cell.subject ?? '').trim() }] : []
}

/**
 * Who is ACTUALLY teaching an OR cell once the day's choice is known.
 *
 * An OR cell offers a choice of subject to the whole class, so the solver has
 * to reserve every option's teacher — it cannot know in advance which subject
 * will run. Once the day resolves, only one of them teaches, and the others are
 * free: free to cover an absence, free to be offered as a substitute, free to
 * be counted as free. Leaving them marked busy takes half a science department
 * out of the pool at precisely the moment somebody is hunting for cover.
 *
 * `chosenSubject` is what resolveOrChoice decided for that date. Without it
 * nothing is released, which is the safe direction: an unresolved OR slot still
 * holds everyone, exactly as before.
 */
export function teachersActuallyIn(
  cell: TeachingCell | undefined | null,
  chosenSubject?: string,
): string[] {
  const all = teachersInCell(cell)
  if (!chosenSubject || !cell?.groupAssignments?.length) return all
  const taking = cell.groupAssignments
    .filter(g => g.subject === chosenSubject)
    .map(g => (g.teacher ?? '').trim())
    .filter(Boolean)
  // A group whose subject is not among the assignments means a stale decision;
  // hold everyone rather than free the room on bad data.
  return taking.length ? taking : all
}

/** Is this person teaching in this cell at all? */
export function cellHasTeacher(cell: TeachingCell | undefined | null, name: string): boolean {
  if (!name) return false
  return teachersInCell(cell).includes(name.trim())
}
