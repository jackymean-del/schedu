/**
 * Two people with the same name are ONE person to this app.
 *
 * Generated timetable cells reference teachers, subjects and venues by NAME,
 * not by id — and so do substitutions, leave, cover pull-outs, duty
 * assignments and every syllabus plan key. That is the model, and it works,
 * but it has one hard requirement nothing was enforcing: names must be unique.
 *
 * Two teachers called "Anita Sharma" in a sixty-person school is not exotic,
 * and today the app would:
 *
 *   · mark BOTH absent when either takes leave;
 *   · count both their timetables when warning you before a delete;
 *   · offer either as cover for the other's lesson;
 *   · add both their loads together against one weekly cap.
 *
 * Nothing errors. The school just quietly has one teacher where it has two.
 *
 * WARN, DO NOT BLOCK. Two staff really can share a name, and the school —
 * not the software — has to decide how to tell them apart ("Anita Sharma
 * (Maths)"). Refusing the keystroke would also fire halfway through typing a
 * longer name that happens to pass through a duplicate. So this finds the
 * collisions and says exactly what they will cost; the grids show it.
 */

/** Names are compared the way the rest of the app matches them: trimmed, and
 *  case-insensitively, since "anita" and "Anita " collide in some code paths
 *  and not others — which is worse than colliding in all of them. */
const key = (s: string | undefined) => (s ?? '').trim().toLowerCase()

export interface NameConflict {
  /** The name as first entered, for display. */
  name: string
  /** How many rows carry it. */
  count: number
}

/**
 * Names used by more than one row, in first-seen order.
 *
 * Blank names are ignored — a half-typed new row is not a conflict, and
 * flagging every empty row would make the warning meaningless.
 */
export function findNameConflicts<T>(rows: T[], nameOf: (row: T) => string | undefined): NameConflict[] {
  const seen = new Map<string, NameConflict>()
  for (const row of rows ?? []) {
    const raw = (nameOf(row) ?? '').trim()
    if (!raw) continue
    const k = key(raw)
    const hit = seen.get(k)
    if (hit) hit.count++
    else seen.set(k, { name: raw, count: 1 })
  }
  return [...seen.values()].filter(c => c.count > 1)
}

/** Is this specific row's name shared with another row? */
export function isDuplicateName<T>(rows: T[], nameOf: (row: T) => string | undefined, name: string): boolean {
  const k = key(name)
  if (!k) return false
  let n = 0
  for (const row of rows ?? []) if (key(nameOf(row)) === k) { n++; if (n > 1) return true }
  return false
}

/** What each kind of collision actually costs, in the school's own terms. */
const COST: Record<string, string> = {
  teacher: 'leave, cover and workload are matched by name, so the two will be treated as one person — marking one absent marks both',
  subject: 'syllabus coverage is keyed by name, so both will share one set of chapters and hours',
  room: 'clash detection is by name, so two different venues will look like one double-booked room',
  section: 'a class name keys its whole timetable, so the two cannot hold separate schedules',
}

/** One sentence naming the clash and its consequence, or null when there is none. */
export function conflictWarning(kind: keyof typeof COST | string, conflicts: NameConflict[]): string | null {
  if (conflicts.length === 0) return null
  const names = conflicts.slice(0, 3).map(c => `“${c.name}”`).join(', ')
  const more = conflicts.length > 3 ? ` and ${conflicts.length - 3} more` : ''
  const plural = conflicts.length > 1 || conflicts[0].count > 2
  const cost = COST[kind] ?? 'records are matched by name, so the rows will be treated as one'
  return `${names}${more} ${plural ? 'are' : 'is'} used more than once. `
    + `${cost[0].toUpperCase()}${cost.slice(1)}. `
    + `Give them distinguishing names.`
}
