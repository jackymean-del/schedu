/**
 * NAMES THE TIMETABLE STILL USES THAT THE ROSTER NO LONGER HAS.
 *
 * Deleting a roster row deliberately does NOT rewrite the generated timetable
 * — cascading would punch holes in a schedule the school has already handed
 * out (see resourceUsage.ts for why that trade is made). The grid warns first,
 * naming exactly what the deletion will orphan, and the user decides.
 *
 * But that warning is shown once, at the moment of deletion, and then never
 * again. Say a teacher leaves in March and is removed from the roster. From
 * then on:
 *
 *   · her lessons still carry her name in the timetable, on the Live board and
 *     on the corridor display, so those classes look staffed;
 *   · she cannot be marked absent, because the absence picker lists the roster
 *     — so those lessons can never be covered;
 *   · workload and coverage reports count periods against somebody who left.
 *
 * Nothing errors, and nothing on any screen says the timetable and the roster
 * disagree. One sentence at delete time is not enough for a state the school
 * then lives in for a term. This finds those names whenever anyone looks, so
 * the disagreement stays visible until it is resolved.
 *
 * It reports; it does not repair. The fix is a human decision — reassign the
 * lessons, or regenerate — and both belong to the school, not to a background
 * routine that rewrites a published schedule.
 */

export type OrphanKind = 'teacher' | 'subject' | 'room' | 'section'

export interface Orphan {
  /** The name as the timetable spells it, for display. */
  name: string
  /** Booked periods across the whole week that still reference it. */
  periods: number
  /** Class-sections affected, in first-seen order. */
  sections: string[]
}

/** Matched the way every other name comparison in the app matches: trimmed and
 *  case-insensitively. Without this, re-typing "anita sharma" into the roster
 *  would leave "Anita Sharma" looking orphaned when the school has clearly
 *  fixed it — a false alarm is how a warning gets ignored. */
const key = (s: string | undefined) => (s ?? '').trim().toLowerCase()

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

function namesInCell(cell: any, kind: OrphanKind): string[] {
  switch (kind) {
    case 'teacher': return cellTeachers(cell)
    case 'subject': return cellSubjects(cell)
    case 'room': return cell?.room ? [cell.room] : []
    default: return []
  }
}

/**
 * Names used by the timetable that the roster no longer contains.
 *
 * `roster` is the list of names that currently exist for this kind. An empty
 * roster returns nothing rather than declaring everything orphaned: that is
 * what a not-yet-loaded store looks like, and crying wolf on every cell during
 * a page load would make the banner worthless.
 */
export function findOrphans(
  classTT: any,
  kind: OrphanKind,
  roster: (string | undefined)[],
): Orphan[] {
  if (!classTT || !roster?.length) return []

  const known = new Set(roster.map(key).filter(Boolean))
  if (!known.size) return []

  const found = new Map<string, Orphan>()
  const note = (raw: string, section: string) => {
    const name = (raw ?? '').trim()
    if (!name || known.has(key(name))) return
    let hit = found.get(key(name))
    if (!hit) { hit = { name, periods: 0, sections: [] }; found.set(key(name), hit) }
    hit.periods++
    if (section && !hit.sections.includes(section)) hit.sections.push(section)
  }

  for (const [section, days] of Object.entries(classTT as Record<string, any>)) {
    // A section is orphaned as a whole: the timetable holds a schedule for a
    // class the roster no longer lists, so it is counted once per booked period
    // like the rest, but the name that matters is the section's own.
    if (kind === 'section') {
      let periods = 0
      for (const periodsOfDay of Object.values(days ?? {}) as any[]) {
        for (const cell of Object.values(periodsOfDay ?? {}) as any[]) if (cell) periods++
      }
      if (periods && !known.has(key(section))) {
        found.set(key(section), { name: section, periods, sections: [] })
      }
      continue
    }
    for (const periodsOfDay of Object.values(days ?? {}) as any[]) {
      for (const cell of Object.values(periodsOfDay ?? {}) as any[]) {
        for (const n of namesInCell(cell, kind)) note(n, section)
      }
    }
  }
  return [...found.values()]
}

/** What each kind of orphan costs, in the school's own terms. */
const COST: Record<OrphanKind, string> = {
  teacher: 'the timetable still shows the name, and nobody can be marked absent or given cover',
  subject: 'syllabus tracking has no chapters or hours for it, so coverage cannot be recorded',
  room: 'clash detection cannot see it, so two classes can be sent to the same place',
  section: 'the class holds a schedule nothing else knows about — it is missing from reports and the board',
}

const NOUN: Record<OrphanKind, [string, string]> = {
  teacher: ['teacher', 'teachers'],
  subject: ['subject', 'subjects'],
  room: ['venue', 'venues'],
  section: ['class', 'classes'],
}

/** One sentence naming the orphans and the consequence, or null when clean. */
export function orphanWarning(kind: OrphanKind, orphans: Orphan[]): string | null {
  if (!orphans.length) return null
  const shown = orphans.slice(0, 3).map(o => `“${o.name}”`).join(', ')
  const more = orphans.length > 3 ? ` and ${orphans.length - 3} more` : ''
  const total = orphans.reduce((n, o) => n + o.periods, 0)
  const [one, many] = NOUN[kind]
  const noun = orphans.length === 1 ? one : many
  const verb = orphans.length === 1 ? 'is' : 'are'
  return `${shown}${more} ${verb} still booked in the timetable `
    + `(${total} period${total === 1 ? '' : 's'} a week) but ${orphans.length === 1 ? 'is' : 'are'} no longer in your ${noun} list. `
    + `Until you reassign those lessons or regenerate, ${COST[kind]}.`
}
