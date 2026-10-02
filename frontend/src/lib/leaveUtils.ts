/**
 * Teacher leave - who is out, on which days, for how long.
 *
 * SCOPE: the school, not the person recording it. This used to be written to
 * `schedu-cal-leave:<uid>`, keyed by the signed-in account. That was invisible
 * until roles existed and is plainly wrong now: an absence is a fact about the
 * school. Under the old key the principal marked a teacher absent, the vice
 * principal signed in and the school looked fully staffed; the absent teacher
 * saw nothing on their own dashboard; and the Reports page counted absences
 * only for whoever happened to be looking. Holidays (lib/holidays) were already
 * school-scoped - leave was the odd one out.
 *
 * Anything written under the old per-account keys is folded in on first load,
 * so a school that has been marking absences for a term does not lose them.
 *
 * Used by the Calendar (marking leave, arranging cover), the Dashboard's Today
 * panel, Reports and the coverage engine - one definition of "on leave today"
 * so they cannot drift.
 */
import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { migrateLegacyLists, legacyKeysFor, mergeById } from './schoolScope'

/**
 * One period of a person being unavailable. Called "leave" in the code for
 * history; the school sees "Unavailable", because being away on exam duty or
 * at a training is not leave, and cover is needed all the same.
 */
export interface CalLeave {
  id: string; teacher: string; date: string
  /** full day | half day (`part` says which) | several days (to `endDate`) |
   *  specific hours (`fromMin`..`toMin`, minutes after midnight). */
  duration: 'full' | 'half' | 'long' | 'hours'; endDate?: string
  /** Why - one of UNAVAILABLE_REASONS, or free text for "Other". */
  type: string; reason?: string
  part?: 'first' | 'second'
  fromMin?: number; toMin?: number
  /** Who recorded it: the person themselves, or an administrator. */
  reportedBy?: string
  source?: 'self' | 'admin'
}

/**
 * Reasons someone can be unavailable. Leave is only some of them: a teacher
 * on exam or event duty, at a training or out on school business is just as
 * absent from their class, and a school planning cover wants to see why -
 * Insights counts them apart, because on-duty absence is not a staffing
 * problem and sick leave can be.
 */
export const UNAVAILABLE_REASONS: Array<{ key: string; label: string; kind: 'leave' | 'duty' | 'other' }> = [
  { key: 'Sick leave', label: 'Sick leave', kind: 'leave' },
  { key: 'Casual leave', label: 'Casual / personal leave', kind: 'leave' },
  { key: 'Emergency', label: 'Family emergency', kind: 'leave' },
  { key: 'On duty', label: 'On official duty (outside school)', kind: 'duty' },
  { key: 'Exam duty', label: 'Exam / invigilation duty', kind: 'duty' },
  { key: 'Event duty', label: 'School event or activity duty', kind: 'duty' },
  { key: 'Training', label: 'Training / workshop', kind: 'duty' },
  { key: 'Meeting', label: 'Meeting', kind: 'duty' },
  { key: 'Other', label: 'Other (say why)', kind: 'other' },
]

/** Readable label for a stored reason, including ones recorded before the
 *  list existed ("Sick Leave", "Official Duty"). */
export function reasonLabel(type: string): string {
  const t = (type ?? '').trim().toLowerCase()
  const hit = UNAVAILABLE_REASONS.find(r => r.key.toLowerCase() === t)
  if (hit) return hit.label
  if (t === 'official duty') return 'On official duty (outside school)'
  return type || 'Unavailable'
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

/** True if `isoDate` falls within this leave record - a single day for
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

/** Is this absence in force for a lesson at [startMin, endMin) on `iso`?
 *  A half day takes the half of THIS schedule's day the lesson falls in; a
 *  time window takes the lessons it overlaps. Older half-day records that do
 *  not say which half are treated as the whole day, as they always were. */
export function absenceCovers(l: CalLeave, iso: string, startMin: number, endMin: number, dayStart: number, dayEnd: number): boolean {
  if (!leaveCoversDate(l, iso)) return false
  if (l.duration === 'half' && l.part) {
    const mid = (dayStart + dayEnd) / 2
    return l.part === 'first' ? startMin < mid : startMin >= mid
  }
  if (l.duration === 'hours' && l.fromMin != null && l.toMin != null) {
    return startMin < l.toMin && l.fromMin < endMin
  }
  return true
}
