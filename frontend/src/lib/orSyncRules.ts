/**
 * THE RULES for merging server OR decisions into this browser's cache.
 *
 * Split from orSync.ts, which does the fetching, so these can be exercised
 * without a network, a store, or an app environment — the merge rule is the
 * part that is subtle, and it should not need Clerk booted to test.
 */
import type { OrDecision } from './orChoice'

/** A cached decision map, keyed section|date|period. */
export type OrMap = Record<string, OrDecision>

/** The date inside a `section|date|period` key, or '' if it is malformed. */
export function dateOfKey(key: string): string {
  const parts = key.split('|')
  return parts.length === 3 ? parts[1] : ''
}

/**
 * Merge a server window into the cache.
 *
 * The whole subtlety is what the server's SILENCE means, and it means two
 * different things depending on where you look:
 *
 *   inside [from, to]   the server was asked and answered in full, so a key it
 *                       did not mention has been CLEARED — somebody handed the
 *                       period back and the cache must forget it, or the app
 *                       goes on showing a decision that no longer exists
 *
 *   outside the window  the server was never asked, so its silence says
 *                       nothing at all and the cached entry stands
 *
 * Getting this backwards in either direction is quiet and lasting: replace the
 * whole map and every other date's decisions vanish on the first refresh; merge
 * without deleting and a released period stays claimed forever.
 */
export function mergeOrWindow(cached: OrMap, fresh: OrMap, from: string, to: string): OrMap {
  const out: OrMap = {}
  for (const [k, v] of Object.entries(cached ?? {})) {
    const d = dateOfKey(k)
    // A malformed key is outside every window; it is kept rather than silently
    // dropped, because deleting data on the strength of a parse failure is the
    // worse mistake.
    if (!d || d < from || d > to) out[k] = v
  }
  for (const [k, v] of Object.entries(fresh ?? {})) out[k] = v
  return out
}

/** Server rows → the store's map shape. */
export function rowsToMap(rows: Array<{
  key?: string; section?: string; date?: string; periodId?: string
  subject?: string; by?: string; at?: string
}> | undefined): OrMap {
  const out: OrMap = {}
  for (const r of rows ?? []) {
    const key = r.key || `${r.section ?? ''}|${r.date ?? ''}|${r.periodId ?? ''}`
    if (!r.subject || key.split('|').length !== 3) continue
    out[key] = { subject: r.subject, by: r.by || undefined, at: r.at || undefined }
  }
  return out
}
