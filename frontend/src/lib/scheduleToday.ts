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

export interface UncoveredSlot {
  teacher: string; section: string; periodId: string; periodName: string
}

export interface TodaySummary {
  dayKey: string
  isWorkDay: boolean
  periodRows: TodayPeriodRow[]
  periodsToday: number          // non-break period slots today
  teachersOnLeave: string[]
  uncoveredSlots: UncoveredSlot[]
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

  const uncoveredSlots: UncoveredSlot[] = []
  const uncoveredByPeriod: Record<string, number> = {}

  if (isWorkDay) {
    for (const s of sections) {
      const sd = classTT[s.name]?.[dayKey] ?? {}
      for (const p of periods) {
        const c = sd[p.id]
        if (!c?.subject || !c.teacher || !onLeaveSet.has(c.teacher)) continue
        const covered = substitutions[`${s.name}|${dayKey}|${p.id}`]
        if (covered) continue
        uncoveredSlots.push({ teacher: c.teacher, section: s.name, periodId: p.id, periodName: p.name ?? p.id })
        uncoveredByPeriod[p.id] = (uncoveredByPeriod[p.id] ?? 0) + 1
      }
    }
  }

  const [sh = 9, sm = 0] = (config?.startTime ?? '09:00').split(':').map(Number)
  let mins = sh * 60 + sm
  const periodRows: TodayPeriodRow[] = periods.map((p: any) => {
    const startMin = mins, endMin = mins + (p.duration ?? 45)
    mins = endMin
    return {
      id: p.id, name: p.name ?? p.id, startMin, endMin,
      isBreak: p.type === 'break', uncovered: uncoveredByPeriod[p.id] ?? 0,
    }
  })

  return {
    dayKey, isWorkDay, periodRows,
    periodsToday: isWorkDay ? periodRows.filter(r => !r.isBreak).length : 0,
    teachersOnLeave, uncoveredSlots, conflicts,
  }
}

export { isOnLeaveOn }
