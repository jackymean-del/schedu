/**
 * Shared teacher-leave data model — used by the Calendar page (marking leave,
 * arranging cover) and the Dashboard's Today panel (surfacing who's out and
 * what still needs coverage). Keeping this in one place avoids the two pages
 * drifting on what "on leave today" means.
 */
export interface CalLeave {
  id: string; teacher: string; date: string
  duration: 'full' | 'half' | 'long'; endDate?: string; type: string; reason?: string
}

export const LEAVE_KEY = 'schedu-cal-leave'

export function loadLeaves(uid: string): CalLeave[] {
  try { return JSON.parse(localStorage.getItem(`${LEAVE_KEY}:${uid}`) || '[]') } catch { return [] }
}

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
