/**
 * Global workload limits — a school-wide override for the max weekly hours the
 * planner will schedule for TEACHERS (all of them) and for CHILDREN (per grade
 * band). Persisted globally (not per-schedule), so it applies to every schedule
 * the user generates. When a value is unset, the national norm from the
 * education-norms brain is used instead.
 *
 * Stored in HOURS (what the user thinks in); the engine converts to periods with
 * the configured period length (e.g. 20 h ÷ 40-min periods = 30 periods/week).
 */
import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { GradeBand } from '@/lib/educationNorms'

interface WorkloadLimitsState {
  /**
   * The education system this school operates under (ISO-3166 alpha-2, or
   * 'OECD' for the average). Held at SCHOOL level rather than per-schedule —
   * per Blueprint v5, a school's country doesn't change between schedule
   * cycles, so capturing it once and reading it everywhere avoids re-asking.
   */
  country?: string
  /** Max TEACHING hours/week for every teacher (undefined ⇒ national norm). */
  teacherMaxHoursWeek?: number
  /** Max instructional hours/week per grade band (missing band ⇒ national norm). */
  studentMaxHoursWeek: Partial<Record<GradeBand, number>>

  setCountry: (code: string | undefined) => void
  setTeacherMaxHoursWeek: (h: number | undefined) => void
  setStudentMaxHoursWeek: (band: GradeBand, h: number | undefined) => void
  reset: () => void
}

export const useWorkloadLimits = create<WorkloadLimitsState>()(
  persist(
    (set) => ({
      country: undefined,
      teacherMaxHoursWeek: undefined,
      studentMaxHoursWeek: {},
      setCountry: (code) => set({ country: code ? code.toUpperCase() : undefined }),
      setTeacherMaxHoursWeek: (h) =>
        set({ teacherMaxHoursWeek: h && h > 0 ? h : undefined }),
      setStudentMaxHoursWeek: (band, h) =>
        set((s) => {
          const next = { ...s.studentMaxHoursWeek }
          if (h && h > 0) next[band] = h
          else delete next[band]
          return { studentMaxHoursWeek: next }
        }),
      reset: () => set({ teacherMaxHoursWeek: undefined, studentMaxHoursWeek: {} }),
    }),
    { name: 'schedu-workload-limits' },
  ),
)

/**
 * The school's education system, for any consumer that needs it: the explicitly
 * chosen country wins, then whatever the active schedule was configured with,
 * then India as the historical default.
 */
export function schoolCountry(configCountryCode?: string | null): string {
  return useWorkloadLimits.getState().country || configCountryCode || 'IN'
}
