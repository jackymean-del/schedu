/**
 * WHEN THE BOARD SHOULD MAKE A SOUND.
 *
 * The corridor screen already knows every bell of the day. Ringing them is a
 * different problem from displaying them, and it is almost entirely about the
 * awkward cases, so the decision lives here where it can be tested at 7am,
 * mid-lesson, and across midnight.
 *
 * Three rules, each of them learned the hard way by anything that makes noise
 * on a timer:
 *
 *  1. A ring is EDGE-triggered. It fires on the moment the clock crosses the
 *     bell time, never because "it is now past 9:40" — otherwise it repeats
 *     every tick for the rest of the minute.
 *
 *  2. The first look of a session fires NOTHING. Open the board at 3pm and the
 *     day's earlier bells have all "just been crossed" as far as a naive check
 *     is concerned; a corridor that plays eleven bells in a row when someone
 *     opens a laptop is worse than a silent one.
 *
 *  3. A gap fires nothing either. A display that slept, or a tab the browser
 *     throttled, comes back with a jump of minutes or hours. The bells it
 *     missed are missed — they were supposed to be heard at a particular
 *     moment, and ringing 12:20 at 12:47 tells the school a lie.
 *
 * Everything is passed in — the clock included — so none of this needs a real
 * afternoon to test.
 */
import type { Ring } from './bellSchedule'
import { describeRing } from './bellSchedule'

export interface BellAlarm {
  id: string
  /** Minutes from midnight. */
  at: number
  label: string
  /** Weekday keys (DAY_NAMES) it applies to. Empty/undefined = every day. */
  days?: string[]
}

export interface DueRing {
  /** Identity of the moment, unique per day — "MONDAY:580". */
  key: string
  /** Minutes from midnight. */
  at: number
  /** What to show while it rings. */
  label: string
  kind: 'bell' | 'alarm'
}

/**
 * How far behind the bell we may still ring, in minutes. One tick of slack
 * covers a busy render or a second-boundary landing awkwardly; more than that
 * is the sleeping-laptop case, which stays silent.
 */
export const RING_GRACE_MIN = 2

export function ringsDue(opts: {
  /** The day's bells, as the board already computes them. */
  rings: Ring[]
  /** Alarms the school set by hand. */
  alarms: BellAlarm[]
  /** Weekday key for today (DAY_NAMES), for alarms scoped to certain days. */
  dayKey: string
  /**
   * Where the clock was at the previous check. Undefined means this is the
   * first check of the session, which by rule 2 fires nothing.
   */
  prevMin: number | undefined
  nowMin: number
  /** True when the school is closed — a holiday bell is not a bell. */
  silent?: boolean
}): DueRing[] {
  const { rings, alarms, dayKey, prevMin, nowMin, silent } = opts

  if (silent) return []
  if (prevMin === undefined) return []          // rule 2
  if (nowMin === prevMin) return []             // same minute, already handled
  if (nowMin < prevMin) return []               // crossed midnight; no school bells there
  if (nowMin - prevMin > RING_GRACE_MIN) return []   // rule 3

  // Rule 1: strictly after the last observed minute, up to and including now.
  const crossed = (at: number) => at > prevMin && at <= nowMin

  const byMinute = new Map<number, DueRing>()

  for (const r of rings) {
    if (!crossed(r.at)) continue
    byMinute.set(r.at, {
      key: `${dayKey}:${r.at}`, at: r.at, label: describeRing(r), kind: 'bell',
    })
  }

  for (const a of alarms) {
    if (!crossed(a.at)) continue
    if (a.days?.length && !a.days.includes(dayKey)) continue
    const existing = byMinute.get(a.at)
    if (existing) {
      // A bell and an alarm at the same minute is one sound, not two on top of
      // each other. Both meanings survive in the label.
      existing.label = `${existing.label} · ${a.label}`
      continue
    }
    byMinute.set(a.at, {
      key: `${dayKey}:${a.at}`, at: a.at, label: a.label || 'Alarm', kind: 'alarm',
    })
  }

  return [...byMinute.values()].sort((x, y) => x.at - y.at)
}

/** '14:05' → 845. Returns undefined for anything that isn't a real time. */
export function parseClock(text: string): number | undefined {
  const m = /^(\d{1,2}):(\d{2})$/.exec(text.trim())
  if (!m) return undefined
  const h = Number(m[1]), min = Number(m[2])
  if (h > 23 || min > 59) return undefined
  return h * 60 + min
}

/** 845 → '14:05', the value an <input type="time"> wants. */
export function toClock(min: number): string {
  const h = Math.floor(min / 60) % 24, m = min % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}
