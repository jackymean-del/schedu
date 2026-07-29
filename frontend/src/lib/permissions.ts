/**
 * Who may do what — Blueprint v6's permissions split, in one table.
 *
 * "Admin can: set and mark holidays from the beginning of the session, set an
 *  ad hoc missed day at any point, mark a faculty member as absent.
 *  Faculty can: only mark a period/day as missed … faculty does NOT have general
 *  holiday-setting authority. That stays an admin action."
 *
 * The distinction matters because these actions have very different blast
 * radii. Declaring a holiday removes teaching time from EVERY subject in the
 * school at once; logging one missed period affects one subject in one section.
 * The first is an administrative decision, the second is a teacher recording
 * what happened in their own classroom — and conflating them is how a coverage
 * report stops being trustworthy.
 *
 * Deliberately a lookup table rather than checks sprinkled through components:
 * when someone asks "what can a teacher actually do?", the answer should be
 * readable in one place instead of reconstructed from a dozen conditionals.
 */
import { useAuthStore } from '@/store/authStore'

export type Role = 'admin' | 'teacher' | 'viewer'

export type Action =
  /** Declare, import or remove school holidays. */
  | 'holiday.manage'
  /** Mark a faculty member absent for a day or a range. */
  | 'absence.mark'
  /** Assign a substitute and record what they actually taught. */
  | 'cover.arrange'
  /** Create or remove calendar events (meetings, exams, activities). */
  | 'event.manage'
  /** Log a single period that didn't happen, for one's own subject. */
  | 'period.markMissed'
  /** Confirm, on return, that a substitute really did move the syllabus. */
  | 'coverage.confirm'
  /** Record syllabus progress — chapters, percentages, hours. */
  | 'syllabus.record'

const TEACHER_ACTIONS: Action[] = [
  // The narrow right the blueprint grants faculty: report what happened in
  // their own classroom. Nothing school-wide.
  'period.markMissed',
  'coverage.confirm',
  'syllabus.record',
]

export function can(role: Role | undefined, action: Action): boolean {
  switch (role ?? 'admin') {
    // Legacy accounts carry no role; they predate this table and are the
    // school's own operator, so they keep full access rather than silently
    // losing the buttons they have always had.
    case 'admin': return true
    case 'teacher': return TEACHER_ACTIONS.includes(action)
    case 'viewer': return false
    default: return false
  }
}

/** The signed-in user's role, defaulting to admin for accounts without one. */
export function currentRole(): Role {
  return (useAuthStore.getState().user?.role as Role | undefined) ?? 'admin'
}

/** Hook form — re-renders if the signed-in user changes. */
export function useCan(action: Action): boolean {
  const role = useAuthStore(s => (s.user?.role as Role | undefined))
  return can(role, action)
}

export const ROLE_LABELS: Record<Role, string> = {
  admin: 'Administrator', teacher: 'Faculty', viewer: 'View only',
}
