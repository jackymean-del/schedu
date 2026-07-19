/**
 * Urgent pull-outs — take a resource that IS in a session (a teacher, or a
 * venue) and reassign it to an urgent one-off task for a single period on a
 * single date, auto-covering the lesson it vacates with a replacement for that
 * occurrence ONLY.
 *
 * Unlike substitutions (day-of-week keyed, recurring) this is DATE-scoped: it
 * never touches the master weekly timetable, only the dated calendar. It layers
 * on top of the generated schedule the same way free-slot assignments do, so
 * the permanent plan stays clean.
 *
 * A single record captures both halves of the move:
 *   - the ORIGINAL resource is shown "on urgent task" for that slot, and
 *   - the vacated lesson is COVERED by `replacement` (a free teacher, or an
 *     alternate free room) — reflected across every lens (class/faculty/
 *     venue/subject) because the read layer resolves the effective teacher/room
 *     through `coverFor` below.
 */

export type PullKind = 'teacher' | 'room'

export interface UrgentPullout {
  id: string
  date: string          // ISO yyyy-mm-dd — one-off
  sid: string           // owning schedule id (period ids resolve against its bell)
  periodId: string
  section: string       // the vacated lesson's section (the slot being covered)
  kind: PullKind        // what was pulled out of session
  original: string      // original teacher / venue name
  replacement: string   // cover teacher / alternate venue ('' = left uncovered)
  task: string          // the urgent task title
  note?: string
}

const KEY = 'schedu-urgent-pullout'

export function loadPullouts(uid: string): UrgentPullout[] {
  try { return JSON.parse(localStorage.getItem(`${KEY}:${uid}`) || '[]') } catch { return [] }
}

export function savePullouts(uid: string, list: UrgentPullout[]): void {
  try { localStorage.setItem(`${KEY}:${uid}`, JSON.stringify(list)) } catch { /* quota */ }
}

/**
 * The effective cover for one lesson slot on one date, if an urgent pull-out
 * applies. Returns the replacement teacher and/or room to substitute in. A
 * teacher pull-out overrides the teacher; a room pull-out overrides the room.
 * `original` is returned so callers can also drop the vacated resource from its
 * old lens position.
 */
export function coverFor(
  list: UrgentPullout[], date: string, sid: string, section: string, periodId: string,
): { teacher?: string; room?: string; original?: string; kind?: PullKind } | undefined {
  const p = list.find(x =>
    x.date === date && x.section === section && x.periodId === periodId &&
    (x.sid === sid || !x.sid))
  if (!p) return undefined
  if (p.kind === 'teacher') return { teacher: p.replacement || undefined, original: p.original, kind: 'teacher' }
  return { room: p.replacement || undefined, original: p.original, kind: 'room' }
}

/** All pull-outs putting `entity` (a teacher/venue) on an urgent task that date. */
export function pulloutsForEntity(
  list: UrgentPullout[], date: string, kind: PullKind, entity: string,
): UrgentPullout[] {
  return list.filter(p => p.date === date && p.kind === kind && p.original === entity)
}
