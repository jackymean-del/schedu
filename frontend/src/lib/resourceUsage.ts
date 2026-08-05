/**
 * WHAT A RESOURCE STILL HOLDS IN A GENERATED TIMETABLE.
 *
 * Deleting a row in Master Data removes it from the roster and nothing else.
 * The generated timetable is a separate structure, so a teacher deleted while
 * timetabled leaves her name in every cell she held — and the consequences are
 * worse than a cosmetic ghost:
 *
 *   · the timetable, the Live board and the corridor display all still name
 *     her, so a class looks staffed when nobody is coming;
 *   · she can no longer be marked absent, because the absence picker lists the
 *     roster — so those lessons can never be covered;
 *   · workload and coverage reports count periods against somebody the school
 *     no longer employs.
 *
 * Cascading the delete into the timetable would be worse still: it would
 * silently punch holes in a published schedule the school has already handed
 * out. So the answer is neither — say exactly what the deletion will orphan,
 * and let the person decide. This module computes that count; the grids show
 * it (see EntityGrids) and the user confirms.
 */

export type ResourceKind = 'teacher' | 'subject' | 'room' | 'section'

export interface Usage {
  /** Booked periods this resource holds across the whole week. */
  periods: number
  /** Class-sections affected, in first-seen order. */
  sections: string[]
}

const EMPTY: Usage = { periods: 0, sections: [] }

/** Subjects a cell carries — an OR/AND slot can hold several at once. */
function cellSubjects(cell: any): string[] {
  if (!cell) return []
  return cell.groupAssignments?.length
    ? cell.groupAssignments.map((g: any) => g.subject ?? cell.subject).filter(Boolean)
    : (cell.subject ? [cell.subject] : [])
}

/** Teachers a cell carries — likewise, one per parallel group. */
function cellTeachers(cell: any): string[] {
  if (!cell) return []
  const fromGroups = cell.groupAssignments?.length
    ? cell.groupAssignments.map((g: any) => g.teacher ?? cell.teacher).filter(Boolean)
    : []
  return fromGroups.length ? fromGroups : (cell.teacher ? [cell.teacher] : [])
}

/**
 * How much of the timetable depends on `name`.
 *
 * Matching is by NAME, because that is the only link a generated cell has back
 * to a roster row — cells store names, not ids. A rename is therefore its own
 * separate hazard, and not one this function can see.
 */
export function usageOf(classTT: any, kind: ResourceKind, name: string): Usage {
  const wanted = (name ?? '').trim()
  if (!wanted || !classTT) return EMPTY

  if (kind === 'section') {
    const days = classTT[wanted]
    if (!days) return EMPTY
    let periods = 0
    for (const d of Object.keys(days)) {
      for (const p of Object.keys(days[d] ?? {})) if (days[d][p]?.subject) periods++
    }
    return periods > 0 ? { periods, sections: [wanted] } : EMPTY
  }

  let periods = 0
  const sections: string[] = []
  for (const section of Object.keys(classTT)) {
    let hit = false
    const days = classTT[section] ?? {}
    for (const d of Object.keys(days)) {
      for (const pid of Object.keys(days[d] ?? {})) {
        const cell = days[d][pid]
        if (!cell) continue
        const match =
          kind === 'teacher' ? cellTeachers(cell).includes(wanted)
          : kind === 'subject' ? cellSubjects(cell).includes(wanted)
          : (cell.room ?? '').trim() === wanted
        if (match) { periods++; hit = true }
      }
    }
    if (hit) sections.push(section)
  }
  return periods > 0 ? { periods, sections } : EMPTY
}

/** Usage summed across every active schedule, so a resource shared by two
 *  timetables reports both. */
export function usageAcross(
  timetables: Array<{ classTT: any }>,
  kind: ResourceKind,
  name: string,
): Usage {
  let periods = 0
  const sections: string[] = []
  for (const t of timetables) {
    const u = usageOf(t?.classTT, kind, name)
    periods += u.periods
    for (const s of u.sections) if (!sections.includes(s)) sections.push(s)
  }
  return { periods, sections }
}

const VERB: Record<ResourceKind, string> = {
  teacher: 'teaches', subject: 'is scheduled for', room: 'hosts', section: 'holds',
}

const CONSEQUENCE: Record<ResourceKind, string> = {
  teacher: "Those lessons will still show this name, and nobody can be marked absent or given cover for them.",
  subject: 'Those lessons will still show this subject, and its syllabus coverage will keep counting against it.',
  room: 'Those lessons will still show this venue, so clashes against it stop being detected.',
  section: 'Its lessons stay in the timetable and keep consuming teacher time.',
}

const listSections = (s: string[]) =>
  s.length <= 3 ? s.join(', ') : `${s.slice(0, 3).join(', ')} and ${s.length - 3} more`

/**
 * The sentence shown before deleting, or null when nothing is affected.
 *
 * Deliberately states the count and the consequence rather than asking "are
 * you sure?" — the number is the whole reason to hesitate, and a bare
 * confirmation teaches people to click through.
 */
export function deleteWarning(kind: ResourceKind, name: string, usage: Usage): string | null {
  if (usage.periods === 0) return null
  const p = `${usage.periods} period${usage.periods === 1 ? '' : 's'}`
  // Naming the affected classes is the useful half — except for a class, where
  // it would read "I-A holds 3 periods … (I-A)".
  const where = kind === 'section' ? '' : ` (${listSections(usage.sections)})`
  return `${name || 'This row'} ${VERB[kind]} ${p} a week in the generated timetable${where}. `
    + `Deleting it here does not change that timetable. ${CONSEQUENCE[kind]} `
    + `Reassign or regenerate first if that isn't what you want.`
}
