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

/**
 * Merge every `schedu-cal-leave:<uid>` record into one school-wide list.
 *
 * Deduped by id, then by (teacher, date, duration) — two administrators who
 * each marked the same teacher absent on the same day produced two records
 * with different random ids, and the school should see that day once.
 */
export function mergeLeaves(...lists: CalLeave[][]): CalLeave[] {
  const out: CalLeave[] = []
  const seenId = new Set<string>()
  const seenSlot = new Set<string>()
  for (const list of lists) {
    for (const l of list ?? []) {
      if (!l?.teacher || !l?.date) continue
      const slot = `${l.teacher}|${l.date}|${l.duration}|${l.endDate ?? ''}`
      if (seenId.has(l.id) || seenSlot.has(slot)) continue
      seenId.add(l.id); seenSlot.add(slot)
      out.push(l)
    }
  }
  return out.sort((a, b) => a.date.localeCompare(b.date))
}

/** Per-account leave keys still present in storage, oldest-written first. */
export function legacyLeaveKeys(storage: Storage): string[] {
  const keys: string[] = []
  for (let i = 0; i < storage.length; i++) {
    const k = storage.key(i)
    if (k && k.startsWith(`${LEAVE_KEY}:`)) keys.push(k)
  }
  return keys.sort()
}

/**
 * Fold the old per-account records into the school store, once.
 *
 * The legacy keys are removed afterwards — leaving them would mean a later
 * deletion in the app silently reappears the next time this ran. Called from
 * the app root before anything reads leave.
 */
export function migrateLegacyLeaves(storage: Storage = localStorage): number {
  let moved = 0
  try {
    const keys = legacyLeaveKeys(storage)
    if (!keys.length) return 0
    const lists: CalLeave[][] = []
    for (const k of keys) {
      try { lists.push(JSON.parse(storage.getItem(k) || '[]')) } catch { /* unreadable */ }
    }
    const merged = mergeLeaves(useLeaves.getState().leaves, ...lists)
    moved = merged.length - useLeaves.getState().leaves.length
    useLeaves.getState().setLeaves(merged)
    for (const k of keys) storage.removeItem(k)
  } catch { /* private mode / quota — the app still works, just without history */ }
  return moved
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
