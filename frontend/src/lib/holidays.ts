/**
 * School holiday calendar — Blueprint v5, Part C "Holiday Handling".
 *
 * "Admin can set holidays either upfront, at the start of the session, or on the
 *  go… Holidays feed directly into the coverage tracking: a declared holiday
 *  removes those slots from the 'available time to cover syllabus' count."
 *
 * Declared ONCE for the school. The hours each subject loses are then DERIVED
 * from the actual timetable — whatever was scheduled that weekday, for the
 * sections the holiday applies to — rather than asking anyone to log a loss per
 * subject. That is the difference between this being usable and being theatre.
 *
 * Derivation is deliberately read-time, not materialised into each plan: delete
 * a holiday and its effect disappears, with nothing left to reconcile.
 */
import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { ClassTimetable } from '@/types'
import { planKey } from './syllabusTracking'
import { DAY_NAMES, sameDay, weekdayOf } from './days'

export { weekdayOf }

export interface Holiday {
  id: string
  /** ISO date (YYYY-MM-DD). */
  date: string
  name: string
  /** Sections it applies to; empty/undefined = the whole school. */
  sections?: string[]
}

interface HolidayState {
  holidays: Holiday[]
  addHoliday: (h: Omit<Holiday, 'id'>) => void
  removeHoliday: (id: string) => void
  /** Swap the whole list — used when a class-section is renamed and holidays
   *  scoped to it must follow (lib/renameCascade). */
  replaceHolidays: (holidays: Holiday[]) => void
  reset: () => void
}

export const useHolidays = create<HolidayState>()(
  persist(
    (set) => ({
      holidays: [],
      addHoliday: (h) =>
        set(s => {
          const date = (h.date ?? '').slice(0, 10)
          if (!date) return s
          return {
            holidays: [...s.holidays, { ...h, date, id: Math.random().toString(36).slice(2, 9) }]
              .sort((a, b) => a.date.localeCompare(b.date)),
          }
        }),
      removeHoliday: (id) => set(s => ({ holidays: s.holidays.filter(h => h.id !== id) })),
      replaceHolidays: (holidays) => set({ holidays }),
      reset: () => set({ holidays: [] }),
    }),
    { name: 'schedu-holidays' },
  ),
)

// ── Impact on syllabus coverage ───────────────────────────────────────────




export interface HolidayLoss { hours: number; dates: string[] }

/**
 * Hours each (subject, section) loses to the declared holidays, derived from
 * what the timetable actually schedules on those weekdays.
 *
 * Note the honest limitation: a holiday costs a subject the periods it holds on
 * that weekday in the CURRENT timetable. If the timetable changes later, the
 * figure changes with it — which is the right behaviour, but means this is a
 * live estimate rather than an immutable historical record.
 */
export function holidayImpact(
  classTT: ClassTimetable,
  holidays: Holiday[],
  periodMinutes: number,
): Record<string, HolidayLoss> {
  // Accumulate whole PERIODS and convert once at the end. Rounding each period
  // to 0.1 h and summing drifts: 2 × 40 min would read 1.4 h instead of 1.3 h.
  const periods: Record<string, { count: number; dates: string[] }> = {}
  const out: Record<string, HolidayLoss> = {}
  const hoursPerPeriod = Math.max(0, periodMinutes) / 60

  for (const h of holidays) {
    const wd = weekdayOf(h.date)
    if (!wd) continue
    const scoped = h.sections?.length ? new Set(h.sections) : null

    for (const secName of Object.keys(classTT ?? {})) {
      if (scoped && !scoped.has(secName)) continue
      const days = classTT[secName] ?? {}
      for (const dayKey of Object.keys(days)) {
        if (!sameDay(dayKey, wd)) continue
        const slots = days[dayKey] ?? {}
        for (const periodId of Object.keys(slots)) {
          const cell: any = (slots as any)[periodId]
          if (!cell) continue
          // OR/AND cells can carry several subjects in one slot.
          const subjects: string[] = cell.groupAssignments?.length
            ? cell.groupAssignments.map((g: any) => g.subject ?? cell.subject).filter(Boolean)
            : (cell.subject ? [cell.subject] : [])
          for (const subj of subjects) {
            const k = planKey(subj, secName)
            const cur = periods[k] ?? { count: 0, dates: [] }
            cur.count += 1
            if (!cur.dates.includes(h.date)) cur.dates.push(h.date)
            periods[k] = cur
          }
        }
      }
    }
  }

  for (const k in periods) {
    out[k] = {
      hours: Math.round(periods[k].count * hoursPerPeriod * 10) / 10,
      dates: periods[k].dates,
    }
  }
  return out
}

/** Total teaching hours the school loses across all holidays. */
export function totalHolidayHours(impact: Record<string, HolidayLoss>): number {
  return Math.round(Object.values(impact).reduce((a, v) => a + v.hours, 0) * 10) / 10
}
