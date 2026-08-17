/**
 * A cover is arranged for a DAY, not for every Monday.
 *
 * Substitutions used to be keyed `section|MONDAY|periodId`. The timetable
 * itself is keyed that way and should be — it is a weekly template. But a
 * substitution is not part of the template: it is what happened on one date
 * because somebody was away. Storing it against the weekday made a one-off
 * cover permanent, so the substitute appeared every Monday until a human
 * noticed and cleared it.
 *
 * The damage was not only cosmetic. Room-clash detection reads the substitute
 * as the teacher in the room, so a stale cover made two different teachers look
 * like one, and a genuine double-booking stopped being reported on every later
 * Monday. Measured before the change: two sections sharing a room reported 1
 * clash normally and 0 once last week's cover was in place.
 *
 * The dated key is what the rest of the flow already used — arranging a cover
 * writes a coverage record stamped with `date`, and leave records are dated
 * too. The overlay was the only part still keyed by weekday.
 *
 * `classTT` is deliberately NOT changed. The template stays weekly; only the
 * overlay is dated. A surface that shows the template without a date therefore
 * shows no substitutions, which is right: a template has no covers.
 */
import { DAY_NAMES, sameDay, localISO } from './days'

// The local-calendar date helper lives in lib/days with the other calendar
// facts; re-exported here because this module's callers reach for it.
export { localISO } from './days'

/** The key a substitution is stored under. */
export const subKey = (section: string, isoDate: string, periodId: string) =>
  `${section}|${isoDate}|${periodId}`

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

/** Does this key name a date, or is it a legacy weekday key? */
export const isDatedSubKey = (key: string): boolean =>
  ISO_DATE.test(key.split('|')[1] ?? '')

/**
 * Move legacy weekday-keyed substitutions onto real dates.
 *
 * There is no way to recover which date a weekday key was meant for — that
 * information was never stored. Every option here is a guess, so this picks the
 * least harmful one: the matching weekday in the week the migration runs in.
 * The cover happens once, on a day close to when it was arranged, and then
 * stops repeating.
 *
 * Nothing is deleted. Anything that cannot be placed — an unrecognised day
 * name — is carried through untouched rather than dropped, because losing a
 * school's cover silently is worse than leaving a key that no longer matches.
 */
export function migrateWeekdaySubs(
  subs: Record<string, string> | undefined,
  weekOf: Date,
): { next: Record<string, string>; migrated: number } {
  const source = subs ?? {}
  // Sunday of the week containing weekOf, so DAY_NAMES' index is the offset.
  const sunday = new Date(weekOf)
  sunday.setDate(sunday.getDate() - sunday.getDay())

  let migrated = 0
  const next: Record<string, string> = {}
  for (const [key, value] of Object.entries(source)) {
    if (isDatedSubKey(key)) { next[key] = value; continue }
    const parts = key.split('|')
    // sameDay, not equality: lib/days documents that day keys arrive as
    // 'MONDAY', 'Mon' or 'monday' depending on which generation of the wizard
    // or which pasted spreadsheet wrote them. An exact match migrated two of
    // those three and left the school's covers behind.
    const idx = parts.length === 3 ? DAY_NAMES.findIndex(d => sameDay(d, parts[1] ?? '')) : -1
    if (idx < 0) { next[key] = value; continue }
    const when = new Date(sunday)
    when.setDate(when.getDate() + idx)
    const moved = subKey(parts[0], localISO(when), parts[2])
    // An existing dated entry for the same slot was set deliberately; a
    // migrated guess must not overwrite it.
    if (moved in next || moved in source) { next[key] = value; continue }
    next[moved] = value
    migrated++
  }
  return { next, migrated }
}

/**
 * Move every stored schedule off weekday-keyed substitutions, once.
 *
 * Runs over the open schedule's persisted state and every per-schedule
 * snapshot, because a school's covers live in both. Idempotent: a dated key is
 * recognised and passed through, so a second run does nothing.
 *
 * Returns how many entries moved, for the console — silent data surgery is
 * worth being able to see afterwards.
 */
export function migrateLegacySubstitutions(storage: Storage = localStorage, today: Date = new Date()): number {
  let moved = 0
  const rewrite = (raw: string | null): { text: string; moved: number } | null => {
    if (!raw) return null
    let parsed: any
    try { parsed = JSON.parse(raw) } catch { return null }
    // A persisted store is { state, version }; a snapshot is the state itself.
    const holder = parsed?.state && typeof parsed.state === 'object' ? parsed.state : parsed
    if (!holder || typeof holder !== 'object' || !holder.substitutions) return null
    const { next, migrated } = migrateWeekdaySubs(holder.substitutions, today)
    if (!migrated) return null
    holder.substitutions = next
    return { text: JSON.stringify(parsed), moved: migrated }
  }

  for (let i = 0; i < storage.length; i++) {
    const key = storage.key(i)
    if (!key) continue
    if (key !== 'schedu-v3' && !key.startsWith('schedu-tt-snap-')) continue
    const out = rewrite(storage.getItem(key))
    if (!out) continue
    try { storage.setItem(key, out.text); moved += out.moved } catch { /* quota */ }
  }
  return moved
}
