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
import { resolveCountryInput, detectCountry } from '@/lib/countryHours'

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
  /**
   * Instructional hours/week for one CLASS — "Class V runs 25 h while the rest
   * of Primary runs 22.5". Blueprint v6 Step 5: "User can edit load class-wise."
   * Missing class ⇒ fall back to its band.
   */
  studentMaxHoursWeekByClass: Record<string, number>
  /**
   * Weekly periods for one SUBJECT within one class — the finest grain, and the
   * one that overrides the curriculum knowledge base. class → subject → periods.
   * Missing entry ⇒ fall back to the board norm for that subject.
   */
  subjectPeriodsByClass: Record<string, Record<string, number>>

  setCountry: (code: string | undefined) => void
  setTeacherMaxHoursWeek: (h: number | undefined) => void
  setStudentMaxHoursWeek: (band: GradeBand, h: number | undefined) => void
  setStudentMaxHoursWeekForClass: (cls: string, h: number | undefined) => void
  setSubjectPeriods: (cls: string, subject: string, periods: number | undefined) => void
  reset: () => void
}

export const useWorkloadLimits = create<WorkloadLimitsState>()(
  persist(
    (set) => ({
      country: undefined,
      teacherMaxHoursWeek: undefined,
      studentMaxHoursWeek: {},
      studentMaxHoursWeekByClass: {},
      subjectPeriodsByClass: {},
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
      setStudentMaxHoursWeekForClass: (cls, h) =>
        set((s) => {
          const next = { ...s.studentMaxHoursWeekByClass }
          // Deleting rather than storing 0 keeps "follows the band" and
          // "explicitly zero" from ever looking the same.
          if (h && h > 0) next[cls] = h
          else delete next[cls]
          return { studentMaxHoursWeekByClass: next }
        }),
      setSubjectPeriods: (cls, subject, periods) =>
        set((s) => {
          const byClass = { ...s.subjectPeriodsByClass }
          const row = { ...(byClass[cls] ?? {}) }
          if (periods && periods > 0) row[subject] = Math.round(periods)
          else delete row[subject]
          if (Object.keys(row).length) byClass[cls] = row
          else delete byClass[cls]
          return { subjectPeriodsByClass: byClass }
        }),
      reset: () => set({
        teacherMaxHoursWeek: undefined, studentMaxHoursWeek: {},
        studentMaxHoursWeekByClass: {}, subjectPeriodsByClass: {},
      }),
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

/**
 * Record the country typed at sign-up as the school's education system, so the
 * national norms are correct from the very first login instead of defaulting to
 * India and quietly being wrong. Free text is resolved to a reference code;
 * anything unrecognised is left unset rather than guessed at.
 */
export function rememberSignupCountry(input: string | null | undefined): void {
  const code = resolveCountryInput(input)
  if (code) useWorkloadLimits.getState().setCountry(code)
}

/**
 * Seed the school country from the browser when nothing has been chosen yet —
 * timezone first, then locale. Never overwrites an explicit choice, and returns
 * the code it settled on (or undefined if it couldn't tell).
 */
export function ensureSchoolCountry(): string | undefined {
  const s = useWorkloadLimits.getState()
  if (s.country) return s.country
  const guess = detectCountry()
  if (guess) s.setCountry(guess)
  return guess
}
