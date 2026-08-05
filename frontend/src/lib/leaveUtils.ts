/**
 * Teacher leave — who is out, on which days, for how long.
 *
 * SCOPE: the school, not the person recording it. This used to be written to
 * `schedu-cal-leave:<uid>`, keyed by the signed-in account. That was invisible
 * until roles existed and is plainly wrong now: an absence is a fact about the
 * school. Under the old key the principal marked a teacher absent, the vice
 * principal signed in and the school looked fully staffed; the absent teacher
 * saw nothing on their own dashboard; and the Reports page counted absences
 * only for whoever happened to be looking. Holidays (lib/holidays) were already
 * school-scoped — leave was the odd one out.
 *
 * Anything written under the old per-account keys is folded in on first load,
 * so a school that has been marking absences for a term does not lose them.
 *
 * Used by the Calendar (marking leave, arranging cover), the Dashboard's Today
 * panel, Reports and the coverage engine — one definition of "on leave today"
 * so they cannot drift.
 */
import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { migrateLegacyLists, legacyKeysFor, mergeById } from './schoolScope'

export interface CalLeave {
  id: string; teacher: string; date: string
  duration: 'full' | 'half' | 'long'; endDate?: string; type: string; reason?: string
}

export const LEAVE_KEY = 'schedu-cal-leave'

interface LeaveState {
  leaves: CalLeave[]
  setLeaves: (next: CalLeave[]) => void
  addLeave: (l: CalLeave) => void
  removeLeave: (id: string) => void
  reset: () => void
}

export const useLeaves = create<LeaveState>()(
  persist(
    (set) => ({
      leaves: [],
      setLeaves: (next) => set({ leaves: next }),
      addLeave: (l) => set(s => ({ leaves: [...s.leaves, l] })),
      removeLeave: (id) => set(s => ({ leaves: s.leaves.filter(l => l.id !== id) })),
      reset: () => set({ leaves: [] }),
    }),
    { name: LEAVE_KEY },
  ),
)

// ── Migration off the per-account keys ────────────────────────────────────

/** What makes two leave records the same absence, whoever recorded it. */
export const leaveIdentity = (l: CalLeave) =>
  `${l.teacher}|${l.date}|${l.duration}|${l.endDate ?? ''}`

/** Fold the old per-account records into the school store, once. */
export function migrateLegacyLeaves(storage: Storage = localStorage): number {
  return migrateLegacyLists<CalLeave>({
    baseKey: LEAVE_KEY,
    storage,
    current: useLeaves.getState().leaves,
    identity: leaveIdentity,
    commit: (merged) => useLeaves.getState().setLeaves(merged),
    sort: (a, b) => a.date.localeCompare(b.date),
  })
}

// ── Pure helpers ──────────────────────────────────────────────────────────

/** True if `isoDate` falls within this leave record — a single day for
 *  full/half-day leave, or the [date, endDate] range for long-duration leave. */
export function leaveCoversDate(leave: CalLeave, isoDate: string): boolean {
  if (leave.duration === 'long' && leave.endDate) {
    return isoDate >= leave.date && isoDate <= leave.endDate
  }
  return leave.date === isoDate
}

export function isOnLeaveOn(leaves: CalLeave[], teacher: string, isoDate: string): boolean {
  return leaves.some(l => l.teacher === teacher && leaveCoversDate(l, isoDate))
}

/** Distinct teachers on leave on `isoDate`. */
export function teachersOnLeaveOn(leaves: CalLeave[], isoDate: string): string[] {
  return Array.from(new Set(leaves.filter(l => leaveCoversDate(l, isoDate)).map(l => l.teacher)))
}

/** Per-account leave keys still in storage. */
export const legacyLeaveKeys = (storage: Storage) => legacyKeysFor(LEAVE_KEY, storage)

/** Merge leave lists, collapsing the same absence recorded twice. */
export const mergeLeaves = (...lists: CalLeave[][]) =>
  mergeById(leaveIdentity, undefined, ...lists).sort((a, b) => a.date.localeCompare(b.date))
