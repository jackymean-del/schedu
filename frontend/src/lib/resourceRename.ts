/**
 * RENAMING A RESOURCE THAT A TIMETABLE ALREADY NAMES.
 *
 * Generated cells store NAMES, not ids — `{ subject, teacher, room }` — and so
 * do substitutions, leave, cover, duties and every syllabus plan key. Renaming
 * a teacher in Master Data changed her roster row and nothing else, so she
 * quietly became two people: the roster said "Anita Rao" and the timetable
 * still said "Anita".
 *
 * That is the same phantom as deleting somebody who is timetabled, arrived at
 * by a far more ordinary action — fixing a typo, adding a surname, correcting
 * a venue's label. And it is worse in one way, because nothing looks wrong:
 * the roster is right, the timetable is populated, and only the links between
 * them are broken. Leave recorded against the new name never matches the old
 * name in the cells, so she cannot be shown absent for her own lessons, and
 * her workload splits across two people who are the same person.
 *
 * Unlike a delete, a rename has an unambiguous correct answer: it is still her
 * lesson, so every reference should follow. That is what this does — with the
 * transforms kept pure so each one can be tested, and a thin applier that
 * walks every active schedule and every school-scoped store.
 */

export type RenameKind = 'teacher' | 'subject' | 'room' | 'section'

const clean = (s: string | undefined) => (s ?? '').trim()

/** Nothing to do for a no-op or a blank name — renaming TO empty would erase
 *  the link rather than move it. */
export function renameIsValid(from: string, to: string): boolean {
  const a = clean(from), b = clean(to)
  return !!a && !!b && a !== b
}

// ── Timetable cells ───────────────────────────────────────────────────────

function renameCell(cell: any, kind: RenameKind, from: string, to: string): any {
  if (!cell) return cell
  let next = cell
  const set = (patch: any) => { next = { ...next, ...patch } }

  if (kind === 'teacher' && clean(cell.teacher) === from) set({ teacher: to })
  if (kind === 'subject' && clean(cell.subject) === from) set({ subject: to })
  if (kind === 'room' && clean(cell.room) === from) set({ room: to })

  // An OR/AND slot carries a subject and teacher per parallel group; missing
  // these would leave half a rename behind in exactly the schedules that are
  // hardest to check by eye.
  if (cell.groupAssignments?.length && (kind === 'teacher' || kind === 'subject')) {
    let touched = false
    const groups = cell.groupAssignments.map((g: any) => {
      if (kind === 'teacher' && clean(g?.teacher) === from) { touched = true; return { ...g, teacher: to } }
      if (kind === 'subject' && clean(g?.subject) === from) { touched = true; return { ...g, subject: to } }
      return g
    })
    if (touched) set({ groupAssignments: groups })
  }
  return next
}

/**
 * Rename through a whole timetable.
 *
 * A SECTION rename also moves the top-level key, because `classTT` is keyed by
 * section name. Returns the original object untouched when nothing matched, so
 * callers can skip writing a schedule the rename doesn't concern.
 */
export function renameInClassTT(classTT: any, kind: RenameKind, fromRaw: string, toRaw: string): any {
  const from = clean(fromRaw), to = clean(toRaw)
  if (!classTT || !renameIsValid(from, to)) return classTT

  // Renaming a class onto one that already exists would merge two timetables
  // into one and destroy the incumbent's. Refuse the key move and leave the
  // class where it is, so the collision is visible rather than silent.
  const collides = kind === 'section' && to in classTT && to !== from

  let changed = false
  const out: any = {}
  for (const section of Object.keys(classTT)) {
    const key = (kind === 'section' && section === from && !collides) ? to : section
    if (key !== section) changed = true
    const days = classTT[section] ?? {}
    const outDays: any = {}
    for (const d of Object.keys(days)) {
      const slots = days[d] ?? {}
      const outSlots: any = {}
      for (const pid of Object.keys(slots)) {
        const next = kind === 'section' ? slots[pid] : renameCell(slots[pid], kind, from, to)
        if (next !== slots[pid]) changed = true
        outSlots[pid] = next
      }
      outDays[d] = outSlots
    }
    out[key] = outDays
  }
  return changed ? out : classTT
}

// ── Substitutions ─────────────────────────────────────────────────────────

/**
 * Substitutions are keyed `section|day|periodId` and valued by teacher name,
 * so a section rename moves the key and a teacher rename moves the value.
 */
export function renameInSubstitutions(
  subs: Record<string, string> | undefined, kind: RenameKind, fromRaw: string, toRaw: string,
): Record<string, string> | undefined {
  const from = clean(fromRaw), to = clean(toRaw)
  if (!subs || !renameIsValid(from, to)) return subs
  if (kind === 'subject' || kind === 'room') return subs

  let changed = false
  const out: Record<string, string> = {}
  for (const key of Object.keys(subs)) {
    let k = key
    if (kind === 'section') {
      const parts = key.split('|')
      if (parts[0] === from) { parts[0] = to; k = parts.join('|'); changed = true }
    }
    let v = subs[key]
    if (kind === 'teacher' && clean(v) === from) { v = to; changed = true }
    out[k] = v
  }
  return changed ? out : subs
}

// ── Syllabus plans ────────────────────────────────────────────────────────

/**
 * Syllabus plans are keyed `subject||section` AND carry those names as fields,
 * so a subject or section rename orphans every plan for it — a term's recorded
 * chapter coverage would simply stop being found.
 *
 * A rename onto a key that already exists keeps the EXISTING plan: it has its
 * own recorded coverage, and overwriting real progress is worse than leaving a
 * duplicate the school can see and merge.
 */
export function renameInPlans<T extends { subject?: string; section?: string }>(
  plans: Record<string, T> | undefined, kind: RenameKind, fromRaw: string, toRaw: string,
): Record<string, T> | undefined {
  const from = clean(fromRaw), to = clean(toRaw)
  if (!plans || !renameIsValid(from, to)) return plans
  if (kind !== 'subject' && kind !== 'section') return plans

  const moves = (plan: T | undefined) =>
    kind === 'subject' ? clean(plan?.subject) === from : clean(plan?.section) === from

  // Keys that will still be occupied after the rename, because their plan is
  // not moving. Computed up front from the ORIGINAL map so the outcome does
  // not depend on key order — the incumbent must win whichever is seen first.
  const staying = new Set(Object.keys(plans).filter(k => !moves(plans[k])))

  let changed = false
  const out: Record<string, T> = {}
  for (const key of Object.keys(plans)) {
    const plan = plans[key]
    if (!moves(plan)) { out[key] = plan; continue }
    changed = true
    const nextSubject = kind === 'subject' ? to : clean(plan?.subject)
    const nextSection = kind === 'section' ? to : clean(plan?.section)
    const nextKey = `${nextSubject}||${nextSection}`
    // Renaming onto a plan that already exists would overwrite real recorded
    // coverage. Leave the incoming plan where it is instead; a visible
    // duplicate the school can merge beats silently losing a term's work.
    if (staying.has(nextKey)) { out[key] = plan; continue }
    out[nextKey] = { ...plan, subject: nextSubject, section: nextSection }
  }
  return changed ? out : plans
}

// ── The school-scoped records that name things ────────────────────────────

/** Rename inside a list, on whichever fields that kind occupies. */
export function renameInRecords<T extends Record<string, any>>(
  list: T[] | undefined,
  fields: Array<keyof T>,
  fromRaw: string, toRaw: string,
): T[] | undefined {
  const from = clean(fromRaw), to = clean(toRaw)
  if (!list || !renameIsValid(from, to)) return list
  let changed = false
  const out = list.map(item => {
    let next = item
    for (const f of fields) {
      if (clean(next?.[f] as any) === from) { next = { ...next, [f]: to }; changed = true }
    }
    return next
  })
  return changed ? out : list
}

/** Rename inside a string-array field — e.g. a holiday's or event's `sections`. */
export function renameInStringLists<T extends Record<string, any>>(
  list: T[] | undefined, field: keyof T, fromRaw: string, toRaw: string,
): T[] | undefined {
  const from = clean(fromRaw), to = clean(toRaw)
  if (!list || !renameIsValid(from, to)) return list
  let changed = false
  const out = list.map(item => {
    const arr = item?.[field] as unknown as string[] | undefined
    if (!Array.isArray(arr) || !arr.some(x => clean(x) === from)) return item
    changed = true
    // Deduplicate: renaming onto a name already in the list must not list it twice.
    const next = Array.from(new Set(arr.map(x => (clean(x) === from ? to : x))))
    return { ...item, [field]: next }
  })
  return changed ? out : list
}

/**
 * Rename the KEYS of a nested map whose levels are named entities.
 *
 * The allocation structures are keyed by name at every level — teacher →
 * section → subject for teacherAllocations, section → subject for
 * subjectAllocations — so a rename that moved the timetable and not these left
 * the school's allocation grid pointing at names nothing else uses. They are
 * the input to generation, so the next solve reads the stale numbers.
 *
 * `levels` says what each nesting level is keyed by, e.g.
 * ['teacher','section','subject'].
 *
 * Collisions follow renameInPlans: the incumbent wins and the moving entry
 * stays where it is. Overwriting would silently discard hand-tuned periods,
 * and a visible duplicate is something the school can see and merge.
 */
function renameKeysAtLevel(node: Record<string, any>, from: string, to: string): Record<string, any> {
  const keys = Object.keys(node)
  if (!keys.some(k => clean(k) === from)) return node
  // Computed from the ORIGINAL keys so the result cannot depend on key order.
  const occupied = new Set(keys.filter(k => clean(k) !== from).map(clean))
  let claimed = false
  const out: Record<string, any> = {}
  for (const k of keys) {
    if (clean(k) !== from) { out[k] = node[k]; continue }
    // Already taken by a row that is not moving, or by an earlier source key
    // that also cleaned to `from` — leave this one where it is rather than
    // overwrite somebody's real numbers.
    if (occupied.has(to) || claimed) { out[k] = node[k]; continue }
    out[to] = node[k]
    claimed = true
  }
  return out
}

export function renameInNestedKeys(
  map: Record<string, any> | undefined,
  levels: RenameKind[],
  kind: RenameKind,
  fromRaw: string,
  toRaw: string,
): Record<string, any> | undefined {
  const from = clean(fromRaw), to = clean(toRaw)
  if (!map || !renameIsValid(from, to) || !levels.includes(kind)) return map

  const walk = (node: any, depth: number): any => {
    if (depth >= levels.length || node == null || typeof node !== 'object' || Array.isArray(node)) return node
    let next = node
    // Deeper levels first, so an outer rename never re-walks rebuilt children.
    if (levels.slice(depth + 1).includes(kind)) {
      let changed = false
      const out: Record<string, any> = {}
      for (const k of Object.keys(node)) {
        const child = walk(node[k], depth + 1)
        if (child !== node[k]) changed = true
        out[k] = child
      }
      if (changed) next = out
    }
    if (levels[depth] === kind) next = renameKeysAtLevel(next, from, to)
    return next
  }
  return walk(map, 0)
}
