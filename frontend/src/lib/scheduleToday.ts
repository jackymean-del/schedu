/**
 * "What does today look like?" — shared by the Dashboard stats row and the
 * Today panel so both surfaces agree on what counts as a period, a teacher
 * on leave, or a slot still needing cover. Computing this in one place also
 * keeps the (non-trivial) uncovered-slot logic from drifting between them.
 */
import { teachingPairsInCell } from './cellTeachers'
import { teachingPairsOnDate, type OrDecision } from './orChoice'
import { schedulePeriodTimes } from './bellTimes'
import { type CalLeave, teachersOnLeaveOn, isOnLeaveOn } from './leaveUtils'
import { subKey } from './substitutionKeys'

import { DAY_NAMES, localISO } from './days'
export { DAY_NAMES as DAY_KEY } from './days'
const DAY_KEY = DAY_NAMES

/** Local-calendar ISO date. Kept as a named export for existing callers; the
 *  single definition lives in lib/days. */
export const toISODate = localISO

export interface TodayPeriodRow {
  id: string; name: string; startMin: number; endMin: number; isBreak: boolean
  uncovered: number   // count of sections needing a sub in this period slot
}

/** A (teacher, section, period) slot affected by a leave — with enough detail
 *  (subject, class, time) to act on without opening the full editor. */
export interface AffectedSlot {
  teacher: string; section: string; subject: string
  periodId: string; periodName: string; startMin: number; endMin: number
  coveredBy?: string   // set once a substitute is arranged
}

/** A room used by two different classes (different teachers) in the same
 *  period today — a genuine double-booking, not a merged/combined block. */
export interface RoomClash {
  room: string; periodId: string; periodName: string
  startMin: number; endMin: number; sections: string[]
}

export interface TodaySummary {
  dayKey: string
  isWorkDay: boolean
  periodRows: TodayPeriodRow[]
  periodsToday: number          // non-break period slots today
  teachersOnLeave: string[]
  uncoveredSlots: AffectedSlot[]
  coveredSlots: AffectedSlot[]
  roomClashes: RoomClash[]
  conflicts: number
}

export function computeTodaySummary(params: {
  periods: any[]; sections: any[]; classTT: Record<string, any>; config: any
  substitutions: Record<string, string>; leaves: CalLeave[]; conflicts: number; date: Date
  /** Dated OR choices, keyed section|date|period. Absent means undecided. */
  orDecisions?: Record<string, OrDecision>
  /** Syllabus plans, so an undecided OR slot still resolves by coverage. */
  plans?: Record<string, any>
}): TodaySummary {
  const { periods, sections, classTT, config, substitutions, leaves, conflicts, date } = params
  const orDecisions = params.orDecisions ?? {}
  const plans = params.plans ?? {}
  const isoDate = toISODate(date)
  const dayKey = DAY_KEY[date.getDay()]
  const workDays: string[] = config?.workDays?.length
    ? config.workDays : ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY']
  const isWorkDay = workDays.includes(dayKey)

  const teachersOnLeave = teachersOnLeaveOn(leaves, isoDate)
  const onLeaveSet = new Set(teachersOnLeave)

  // Period → wall-clock minutes, computed first so affected slots carry a
  // real time (not just a period id) — needed to sort/display them usefully.
  // From the bell, not from adding durations up. These minutes go onto the
  // slots somebody reads while arranging a cover, and a day with an assembly
  // or a lunch row is longer than its teaching periods total — by an hour, by
  // the third period of an ordinary morning. Falls back to the same sum when
  // a schedule has no bell rows.
  const bell = schedulePeriodTimes(config, periods, sections ?? [])
  const periodTimes: Record<string, { startMin: number; endMin: number }> = {}
  for (const p of periods) {
    const t = bell.get(p.id)
    if (t) periodTimes[p.id] = { startMin: t.startMin, endMin: t.endMin }
  }

  const uncoveredSlots: AffectedSlot[] = []
  const coveredSlots: AffectedSlot[] = []
  const uncoveredByPeriod: Record<string, number> = {}
  const roomClashes: RoomClash[] = []

  if (isWorkDay) {
    // Per period, group booked cells by room. A room holding two different
    // classes (distinct sections AND distinct effective teachers) at the same
    // time is a genuine double-booking; two sections sharing a room with the
    // same teacher is a merged/combined block, not a clash.
    for (const p of periods) {
      if (p.type === 'break') continue
      const byRoom: Record<string, { section: string; teacher: string }[]> = {}
      for (const s of sections) {
        const c = classTT[s.name]?.[dayKey]?.[p.id]
        if (!c?.subject) continue
        const room = (c.room ?? '').trim()
        if (!room) continue
        // Dated, so last week's cover cannot make two teachers look like one
        // and hide a genuine double-booking today.
        const teacher = substitutions[subKey(s.name, isoDate, p.id)] || c.teacher || ''
        ;(byRoom[room] ??= []).push({ section: s.name, teacher })
      }
      const t = periodTimes[p.id] ?? { startMin: 0, endMin: 0 }
      for (const [room, users] of Object.entries(byRoom)) {
        const sects = [...new Set(users.map(u => u.section))]
        const teachers = [...new Set(users.map(u => u.teacher).filter(Boolean))]
        if (sects.length > 1 && teachers.length > 1) {
          roomClashes.push({ room, periodId: p.id, periodName: p.name ?? p.id, startMin: t.startMin, endMin: t.endMin, sections: sects })
        }
      }
    }
    roomClashes.sort((a, b) => a.startMin - b.startMin)

    for (const s of sections) {
      const sd = classTT[s.name]?.[dayKey] ?? {}
      for (const p of periods) {
        const c = sd[p.id] as any
        if (!c?.subject) continue

        // Everyone teaching in this cell, not just the cell-level teacher.
        //
        // An OR/AND cell runs parallel subjects in one slot and names a
        // teacher PER SUBJECT in groupAssignments, mirroring only the first
        // into `teacher`. Checking that copy meant an absent teacher taking a
        // LATER group was never listed as needing cover at all: the group sat
        // with nobody in front of it, and the console that exists to catch
        // exactly that said the day was fine.
        //
        // An OR cell is a subject CHOICE for the whole class, and only one of
        // its teachers actually stands up. Counting the others as teaching
        // sends the cover flow hunting a substitute for a lesson that will not
        // happen — and hides the fact that they were free to cover something
        // that will. An undecided slot still holds everyone, which is the safe
        // direction.
        const inCell = teachingPairsOnDate(c, s.name, isoDate, p.id, orDecisions, plans)

        const away = inCell.filter(x => onLeaveSet.has(x.teacher))
        if (!away.length) continue

        const t = periodTimes[p.id] ?? { startMin: 0, endMin: 0 }
        // The overlay is keyed section|date|period, with no room for WHICH
        // group a cover belongs to. So a recorded cover can only be trusted
        // when a single teacher in the cell is away; with two away it cannot
        // say which one was replaced, and calling both covered would hide a
        // class that still has nobody.
        const recorded = substitutions[subKey(s.name, isoDate, p.id)]
        const coveredBy = away.length === 1 ? recorded : undefined

        for (const who of away) {
          const slot: AffectedSlot = {
            teacher: who.teacher, section: s.name, subject: who.subject,
            periodId: p.id, periodName: p.name ?? p.id,
            startMin: t.startMin, endMin: t.endMin, coveredBy,
          }
          if (coveredBy) {
            coveredSlots.push(slot)
          } else {
            uncoveredSlots.push(slot)
            uncoveredByPeriod[p.id] = (uncoveredByPeriod[p.id] ?? 0) + 1
          }
        }
      }
    }
    uncoveredSlots.sort((a, b) => a.startMin - b.startMin)
    coveredSlots.sort((a, b) => a.startMin - b.startMin)
  }

  const periodRows: TodayPeriodRow[] = periods.map((p: any) => {
    // No bell row for this period: no clock to show, rather than a made-up one.
    const t = periodTimes[p.id] ?? { startMin: 0, endMin: 0 }
    return {
      id: p.id, name: p.name ?? p.id, startMin: t.startMin, endMin: t.endMin,
      isBreak: p.type === 'break', uncovered: uncoveredByPeriod[p.id] ?? 0,
    }
  })

  return {
    dayKey, isWorkDay, periodRows,
    periodsToday: isWorkDay ? periodRows.filter(r => !r.isBreak).length : 0,
    teachersOnLeave, uncoveredSlots, coveredSlots, roomClashes, conflicts,
  }
}

export { isOnLeaveOn }
