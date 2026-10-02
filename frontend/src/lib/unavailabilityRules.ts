/**
 * Pure rules for bringing the server's record of who is away into this
 * browser. No stores, no network - unavailability-verify runs these directly.
 */
import type { CalLeave } from './leaveUtils'
import type { UnavailabilityRow } from '@/api/client'

/** Records that came from the server carry this prefix on their id, so a
 *  refresh can replace them without touching anything recorded offline. */
export const SERVER_PREFIX = 'srv-'

export const isServerLeave = (l: CalLeave) => l.id.startsWith(SERVER_PREFIX)

export function rowToLeave(r: UnavailabilityRow): CalLeave {
  const part = r.part === 'first' || r.part === 'second' ? r.part : undefined
  return {
    id: SERVER_PREFIX + r.id,
    teacher: r.staffName,
    date: r.date,
    duration: r.duration,
    endDate: r.duration === 'long' ? r.endDate : undefined,
    type: r.reason,
    reason: r.note || undefined,
    part,
    fromMin: r.fromMin ?? undefined,
    toMin: r.toMin ?? undefined,
    reportedBy: r.reportedBy || undefined,
    source: r.source,
  }
}

/** Last day a record is in force. */
const lastDay = (l: CalLeave) => (l.duration === 'long' && l.endDate ? l.endDate : l.date)

/**
 * The local list after a pull of the window [from, to].
 *
 * Server records overlapping the window are replaced by what the server says
 * now - so a teacher withdrawing their report disappears here too. Server
 * records outside the window, and anything recorded only in this browser,
 * are left exactly as they were.
 */
export function mergeServerLeaves(local: CalLeave[], rows: UnavailabilityRow[], from: string, to: string): CalLeave[] {
  const overlaps = (l: CalLeave) => lastDay(l) >= from && l.date <= to
  const kept = local.filter(l => !(isServerLeave(l) && overlaps(l)))
  const fresh = rows.map(rowToLeave)
  const seen = new Set(kept.map(l => l.id))
  return [...kept, ...fresh.filter(l => !seen.has(l.id))]
    .sort((a, b) => a.date.localeCompare(b.date) || a.teacher.localeCompare(b.teacher))
}

/** The request body for a leave being reported. */
export function leaveToBody(l: CalLeave): Omit<UnavailabilityRow, 'id' | 'source' | 'reportedBy'> {
  return {
    staffName: l.teacher, date: l.date,
    endDate: l.duration === 'long' ? l.endDate : undefined,
    duration: l.duration, part: l.part, fromMin: l.fromMin ?? null, toMin: l.toMin ?? null,
    reason: l.type, note: l.reason,
  }
}

/** ISO dates from `from` for `days` days, in order. */
export function datesFrom(from: string, days: number): string[] {
  const out: string[] = []
  const d = new Date(`${from}T00:00:00`)
  const p = (n: number) => String(n).padStart(2, '0')
  for (let i = 0; i < days; i++) {
    out.push(`${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`)
    d.setDate(d.getDate() + 1)
  }
  return out
}
