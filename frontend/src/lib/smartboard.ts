/**
 * WHAT A CORRIDOR SCREEN NEEDS TO SAY.
 *
 * A staffroom or corridor display is read from four metres away by someone
 * walking past. It answers three questions and nothing else: what is on right
 * now, when does the bell go, and is anything broken (a class with nobody in
 * front of it).
 *
 * The derivation lives here rather than in the page so the awkward states can
 * be tested — and they are the whole difficulty. A board that shows a cheerful
 * timetable grid on a holiday, or counts down to a bell that will not ring, is
 * worse than a blank screen, because people trust it.
 *
 * Every "now" is passed in rather than read from the clock, so the same code
 * can be tested at 7am, mid-lesson, and at midnight.
 */
import type { Period } from '@/types'
import { sectionPeriodTimes } from './bellTimes'
import { ringsForSection, nextRing, describeRing, type Ring } from './bellSchedule'

export type BoardState =
  /** Term-time, working day, but the first bell hasn't gone. */
  | 'before'
  /** Lessons are running. */
  | 'during'
  /** The last bell has gone. */
  | 'after'
  /** No lessons at all today — weekend, holiday, or teaching suspended. */
  | 'closed'

export interface BoardNow {
  state: BoardState
  /** Why there are no lessons. Only set when state is 'closed'. */
  reason?: string
  /** Minutes until the next bell, when there is one left today. */
  nextBellIn?: number
  nextBellAt?: number
  /** What that bell will mean — "Period 2 ends · Break begins". */
  nextBellMeans?: string
  /** First and last bell of the day, for the before/after messages. */
  firstBellAt?: number
  lastBellAt?: number
}

/**
 * The board's headline state.
 *
 * `closedReason` is supplied by the caller (a holiday, a non-teaching weekday,
 * an exam that suspends lessons) because those come from three different
 * sources; this decides only what the screen should therefore say.
 */
export function boardNow(rings: Ring[], nowMin: number, opts: {
  isWorkDay: boolean
  closedReason?: string
}): BoardNow {
  if (!opts.isWorkDay || opts.closedReason) {
    return { state: 'closed', reason: opts.closedReason ?? 'No lessons scheduled today' }
  }
  if (rings.length === 0) {
    // A working day with no bells is a schedule that hasn't been generated —
    // not a school day to count down to.
    return { state: 'closed', reason: 'No schedule for today' }
  }

  const firstBellAt = rings[0].at
  const lastBellAt = rings[rings.length - 1].at
  const upcoming = nextRing(rings, nowMin)

  if (nowMin < firstBellAt) {
    return {
      state: 'before', firstBellAt, lastBellAt,
      nextBellAt: firstBellAt, nextBellIn: firstBellAt - nowMin,
      nextBellMeans: describeRing(rings[0]),
    }
  }
  if (!upcoming) return { state: 'after', firstBellAt, lastBellAt }

  return {
    state: 'during', firstBellAt, lastBellAt,
    nextBellAt: upcoming.at, nextBellIn: upcoming.at - nowMin,
    nextBellMeans: describeRing(upcoming),
  }
}

export interface BoardRow {
  section: string
  /** The schedule this section belongs to — shown only when several are active. */
  schedule: string
  subject?: string
  /** Who is actually taking it: the substitute when there is one. */
  teacher?: string
  room?: string
  /** True when `teacher` is a substitute rather than the timetabled one. */
  isSub: boolean
  /** The timetabled teacher is absent and nobody is covering. */
  uncovered: boolean
  /** Period name, for the row's secondary line. */
  periodName?: string
  endMin?: number
}

interface BoardBundle {
  id: string
  name: string
  sections: { name: string }[]
  periods: Period[]
  config: any
  classTT: Record<string, any>
  substitutions: Record<string, string>
}

/**
 * One row per class-section: what that class is doing at `nowMin`.
 *
 * Sections are resolved against THEIR OWN bell (lib/bellTimes), because a
 * school with early dispersal or class-wise breaks has several clocks running
 * — using one would show Nursery in a lesson it left twenty minutes ago.
 *
 * A section with nothing scheduled right now still gets a row, with no
 * subject. Dropping it would make the board's list silently change length
 * through the day, which reads as a fault rather than as a free period.
 */
export function boardRows(
  bundles: BoardBundle[],
  dayKey: string,
  nowMin: number,
  absentTeachers: Set<string>,
): BoardRow[] {
  const rows: BoardRow[] = []
  for (const b of bundles) {
    for (const s of b.sections ?? []) {
      const times = sectionPeriodTimes(s.name, b.config, b.periods ?? [])
      const row: BoardRow = { section: s.name, schedule: b.name, isSub: false, uncovered: false }

      for (const p of b.periods ?? []) {
        const t = times.get(p.id)
        if (!t || nowMin < t.startMin || nowMin >= t.endMin) continue
        row.periodName = p.name
        row.endMin = t.endMin
        const cell = b.classTT?.[s.name]?.[dayKey]?.[p.id]
        if (cell?.subject) {
          const sub = b.substitutions?.[`${s.name}|${dayKey}|${p.id}`]
          const timetabled = cell.teacher ?? ''
          row.subject = cell.subject
          row.room = (cell.room ?? '').trim() || undefined
          row.teacher = sub || timetabled || undefined
          row.isSub = !!sub
          // The one thing a board exists to shout about: a class whose teacher
          // is out and for whom nobody has been assigned.
          row.uncovered = !sub && !!timetabled && absentTeachers.has(timetabled)
        }
        break
      }
      rows.push(row)
    }
  }
  return rows
}

/** Rows worth flashing: a class with nobody in front of it, most urgent first. */
export function uncoveredRows(rows: BoardRow[]): BoardRow[] {
  return rows.filter(r => r.uncovered).sort((a, b) => (a.endMin ?? 0) - (b.endMin ?? 0))
}

/**
 * The bells to count down to when several groups run different clocks.
 *
 * A single board cannot honestly show two countdowns at once, so it uses the
 * EARLIEST next bell across the groups — the next moment anything changes
 * anywhere in the building, which is what someone in the corridor is waiting
 * for. The group it belongs to is named alongside.
 */
export function soonestRings(
  /** Each ACTIVE schedule with its OWN bell — never one schedule's clock
   *  applied to another's classes. A school running "I–V TT" and "VI–X TT"
   *  side by side has two bells, and using the first for both would put every
   *  ring time on the second schedule's classes minutes or hours out. */
  schedules: Array<{ sections: string[]; config: any; periods: Period[] }>,
): Ring[] {
  const all = new Map<number, Ring>()
  for (const { sections, config, periods } of schedules) {
    for (const s of sections) {
      for (const r of ringsForSection(s, config, periods)) {
        const existing = all.get(r.at)
        if (!existing) all.set(r.at, { ...r })
        else {
          // Two groups ringing at the same minute for different reasons: keep
          // both meanings rather than letting one overwrite the other.
          if (r.ends && !existing.ends) existing.ends = r.ends
          if (r.starts && !existing.starts) existing.starts = r.starts
        }
      }
    }
  }
  return [...all.values()].sort((a, b) => a.at - b.at)
}
