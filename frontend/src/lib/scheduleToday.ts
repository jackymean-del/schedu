/**
 * "What does today look like?" — shared by the Dashboard stats row and the
 * Today panel so both surfaces agree on what counts as a period, a teacher
 * on leave, or a slot still needing cover. Computing this in one place also
 * keeps the (non-trivial) uncovered-slot logic from drifting between them.
 */
import { type CalLeave, teachersOnLeaveOn, isOnLeaveOn } from './leaveUtils'

export const DAY_KEY = ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY']

export function toISODate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

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
}): TodaySummary {
  const { periods, sections, classTT, config, substitutions, leaves, conflicts, date } = params
  const isoDate = toISODate(date)
  const dayKey = DAY_KEY[date.getDay()]
  const workDays: string[] = config?.workDays?.length
    ? config.workDays : ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY']
  const isWorkDay = workDays.includes(dayKey)

  const teachersOnLeave = teachersOnLeaveOn(leaves, isoDate)
  const onLeaveSet = new Set(teachersOnLeave)

  // Period → wall-clock minutes, computed first so affected slots carry a
  // real time (not just a period id) — needed to sort/display them usefully.
  const [sh = 9, sm = 0] = (config?.startTime ?? '09:00').split(':').map(Number)
  const periodTimes: Record<string, { startMin: number; endMin: number }> = {}
  let mins = sh * 60 + sm
  for (const p of periods) {
    const startMin = mins, endMin = mins + (p.duration ?? 45)
    periodTimes[p.id] = { startMin, endMin }
    mins = endMin
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
        const teacher = substitutions[`${s.name}|${dayKey}|${p.id}`] || c.teacher || ''
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
        const c = sd[p.id]
        if (!c?.subject || !c.teacher || !onLeaveSet.has(c.teacher)) continue
        const t = periodTimes[p.id] ?? { startMin: 0, endMin: 0 }
        const coveredBy = substitutions[`${s.name}|${dayKey}|${p.id}`]
        const slot: AffectedSlot = {
          teacher: c.teacher, section: s.name, subject: c.subject,
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
    uncoveredSlots.sort((a, b) => a.startMin - b.startMin)
    coveredSlots.sort((a, b) => a.startMin - b.startMin)
  }

  const periodRows: TodayPeriodRow[] = periods.map((p: any) => {
    const t = periodTimes[p.id] ?? { startMin: mins, endMin: mins }
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
