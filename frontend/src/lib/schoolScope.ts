/**
 * MOVING SCHOOL FACTS OUT OF PERSONAL STORAGE.
 *
 * Several things were written to `<key>:<uid>` — keyed by whoever was signed in
 * when they were typed. That is right for a personal preference and wrong for
 * everything else, and almost everything stored this way turned out to be a
 * fact about the school:
 *
 *   teacher leave · calendar events · free-slot assignments (exam
 *   invigilation, club bookings) · urgent pull-outs · the institution's own
 *   naming words (Class vs Batch)
 *
 * The failure is quiet and identical every time. The principal records it, the
 * vice principal signs in and the school looks untouched; the corridor display
 * and the Live board show one administrator's view of the day. Nobody gets an
 * error — the data is simply somewhere else.
 *
 * This module holds the two things every one of those migrations needs, so the
 * fifth one isn't a fifth copy of the same twenty lines.
 */

/** Per-account keys still present in storage, for a given base key. */
export function legacyKeysFor(baseKey: string, storage: Storage): string[] {
  const keys: string[] = []
  for (let i = 0; i < storage.length; i++) {
    const k = storage.key(i)
    if (k && k.startsWith(`${baseKey}:`)) keys.push(k)
  }
  return keys.sort()
}

/**
 * Fold every per-account list into one, then delete the old keys.
 *
 * `identity` decides what counts as the same record. Two administrators who
 * each marked the same teacher absent on the same day produced two rows with
 * different random ids, and the school should see that day once — so identity
 * is usually the meaning of the record, not its id. Ids are also honoured, so
 * a record genuinely copied between accounts collapses too.
 *
 * The legacy keys are REMOVED on success. Left in place, anything the school
 * later deleted in the app would reappear the next time this ran.
 *
 * Returns how many records the school gained, for callers that want to say so.
 */
export function migrateLegacyLists<T extends { id?: string }>(opts: {
  baseKey: string
  storage: Storage
  current: T[]
  /** Stable description of what a record MEANS, for de-duplication. */
  identity: (item: T) => string
  /** Applied to every migrated record — e.g. defaulting a field that did not
   *  exist before, without changing what the school already sees. */
  adopt?: (item: T) => T
  /** Called with the merged list when there was anything to move. */
  commit: (merged: T[]) => void
  sort?: (a: T, b: T) => number
}): number {
  const { baseKey, storage, current, identity, adopt, commit, sort } = opts
  try {
    const keys = legacyKeysFor(baseKey, storage)
    if (!keys.length) return 0

    const lists: T[][] = []
    for (const k of keys) {
      try {
        const parsed = JSON.parse(storage.getItem(k) || '[]')
        if (Array.isArray(parsed)) lists.push(parsed)
      } catch { /* unreadable — skip rather than lose the rest */ }
    }

    const merged = mergeById(identity, adopt, current, ...lists)
    if (sort) merged.sort(sort)
    commit(merged)
    for (const k of keys) storage.removeItem(k)
    return merged.length - current.length
  } catch {
    // Private mode, quota, a locked-down browser: the app still works, it just
    // starts this school's history fresh rather than failing to load.
    return 0
  }
}

/** Deduplicate across lists, first occurrence winning. Exported for tests. */
export function mergeById<T extends { id?: string }>(
  identity: (item: T) => string,
  adopt: ((item: T) => T) | undefined,
  ...lists: T[][]
): T[] {
  const out: T[] = []
  const seenId = new Set<string>()
  const seenWhat = new Set<string>()
  for (const list of lists) {
    for (const item of list ?? []) {
      if (!item) continue
      const what = identity(item)
      if ((item.id && seenId.has(item.id)) || seenWhat.has(what)) continue
      if (item.id) seenId.add(item.id)
      seenWhat.add(what)
      out.push(adopt ? adopt(item) : item)
    }
  }
  return out
}

/**
 * The single-object variant — for settings rather than lists.
 *
 * Where two administrators disagree there is no honest merge, so the rule is
 * stated rather than guessed: the FIRST account's value wins (keys are sorted,
 * so this is stable across reloads rather than depending on storage order),
 * and anything already set on the school is left alone.
 */
export function migrateLegacyObject<T extends object>(opts: {
  baseKey: string
  storage: Storage
  /** True when the school already has its own value and nothing should move. */
  alreadySet: boolean
  commit: (value: T) => void
}): boolean {
  const { baseKey, storage, alreadySet, commit } = opts
  try {
    const keys = legacyKeysFor(baseKey, storage)
    if (!keys.length) return false
    if (!alreadySet) {
      for (const k of keys) {
        try {
          const parsed = JSON.parse(storage.getItem(k) || 'null')
          if (parsed && typeof parsed === 'object') { commit(parsed as T); break }
        } catch { /* try the next account */ }
      }
    }
    for (const k of keys) storage.removeItem(k)
    return true
  } catch { return false }
}
