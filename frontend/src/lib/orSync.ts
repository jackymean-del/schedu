/**
 * BRINGING TEACHERS' CHOICES BACK TO THE PLANNER'S BROWSER.
 *
 * Everything else in this app is local-first: a school's roster, its schedules
 * and its dated overlays live in the browser of whoever plans them. OR
 * decisions cannot, because the person making them is somebody else — a
 * teacher on their own phone tapping "I'll take this period". The server holds
 * those, and this is the read side.
 *
 * The direction is deliberately one-way. The server is the only writer of an
 * OR decision (through DecideOr, which is where the authorisation lives), so
 * this pulls and never pushes. A two-way sync would need a conflict rule, and
 * there is no conflict to resolve: the local copy is a cache, not a second
 * opinion.
 */
import { useEffect, useState } from 'react'
import { collabApi } from '@/api/client'
import { useTimetableStore } from '@/store/timetableStore'
import { patchBundleOrDecisions, snapKeyFor, loadActiveBundles } from './activeSchedules'
import { useAuthStore } from '@/store/authStore'
import { saveActiveTimetableSnapshot, getActiveTimetableId } from './ttRegistry'
import { mergeOrWindow, rowsToMap, type OrMap } from './orSyncRules'
export { mergeOrWindow, dateOfKey, rowsToMap, type OrMap } from './orSyncRules'

/**
 * Pull one schedule's decisions for a date window into local storage.
 *
 * Returns true when something actually changed, so callers can avoid a render
 * on the common case of nothing new. A failure is swallowed: a school with no
 * network, or a schedule that only ever existed locally and has no server row,
 * must still be able to read its own timetable.
 */
export async function pullOrDecisions(
  uid: string, scheduleId: string, isOpen: boolean, from: string, to: string,
): Promise<boolean> {
  if (!scheduleId || !from || !to) return false
  let fresh: OrMap
  try {
    const res = await collabApi.orDecisions(scheduleId, from, to)
    fresh = rowsToMap(res.data?.decisions)
  } catch {
    return false
  }

  if (isOpen) {
    const st = useTimetableStore.getState() as any
    const next = mergeOrWindow(st.orDecisions ?? {}, fresh, from, to)
    if (sameMap(st.orDecisions ?? {}, next)) return false
    st.setOrDecisions(next)
    // The open schedule lives in BOTH the persisted store and its snapshot;
    // writing only one is how per-schedule data goes missing on reload.
    saveActiveTimetableSnapshot()
    return true
  }

  const cached = readBundleOrDecisions(uid, scheduleId)
  const next = mergeOrWindow(cached, fresh, from, to)
  if (sameMap(cached, next)) return false
  patchBundleOrDecisions(uid, scheduleId, next)
  return true
}

/** Shallow equality on the decision maps — enough to skip a pointless render. */
function sameMap(a: OrMap, b: OrMap): boolean {
  const ak = Object.keys(a), bk = Object.keys(b)
  if (ak.length !== bk.length) return false
  for (const k of ak) {
    if (a[k]?.subject !== b[k]?.subject || a[k]?.by !== b[k]?.by) return false
  }
  return true
}

/** This schedule's cached decisions, straight out of its snapshot. */
export function readBundleOrDecisions(uid: string, id: string): OrMap {
  try {
    const raw = localStorage.getItem(snapKeyFor(uid, id))
    if (!raw) return {}
    return (JSON.parse(raw).orDecisions ?? {}) as OrMap
  } catch {
    return {}
  }
}

/**
 * Keep this browser's cached OR decisions fresh for a date window.
 *
 * Used by the dated surfaces — the day console, the calendar, the corridor
 * board — so a teacher's claim reaches the person planning the day. The board
 * polls, because nobody is standing at it to press refresh; the others pull on
 * mount and when the window moves.
 *
 * `bump` is bumped whenever something actually changed, so a caller can put it
 * in a dependency array and re-render only then.
 */
export function useOrDecisionSync(from: string, to: string, pollMs = 0): number {
  const uid = useAuthStore(s => s.user?.id ?? '')
  const [bump, setBump] = useState(0)

  useEffect(() => {
    if (!uid || !from || !to) return
    let alive = true

    const run = async () => {
      const openId = getActiveTimetableId()
      // Every ACTIVE schedule, not just the open one: a school runs several
      // side by side and a teacher's claim belongs to whichever owns the
      // period, which need not be the one currently on screen.
      const ids = new Set<string>(loadActiveBundles(uid).map(b => b.id))
      if (openId) ids.add(openId)
      let changed = false
      for (const id of ids) {
        // Sequential on purpose: a school runs two or three schedules, and a
        // burst of parallel requests on every date change is not worth it.
        if (await pullOrDecisions(uid, id, id === openId, from, to)) changed = true
      }
      if (alive && changed) setBump(n => n + 1)
    }

    run()
    if (!pollMs) return () => { alive = false }
    const t = setInterval(run, pollMs)
    return () => { alive = false; clearInterval(t) }
  }, [uid, from, to, pollMs])

  return bump
}
