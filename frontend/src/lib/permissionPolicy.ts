/**
 * WHO MAY DO WHAT — the policy table, with no dependencies.
 *
 * Deliberately separate from lib/permissions: that file resolves the *current*
 * person by reading the auth and roster stores, which drags in browser-only
 * globals. The policy itself is a pure lookup, so it lives here where the
 * roster store and the test suite can both use it without pulling a store
 * chain (and without members → permissions → members going in a circle).
 *
 * Blueprint v6's split:
 *   "Admin can: set and mark holidays from the beginning of the session, set an
 *    ad hoc missed day at any point, mark a faculty member as absent.
 *    Faculty can: only mark a period/day as missed … faculty does NOT have
 *    general holiday-setting authority. That stays an admin action."
 *
 * The distinction matters because these actions have very different blast
 * radii. Declaring a holiday removes teaching time from EVERY subject in the
 * school at once; logging one missed period affects one subject in one section.
 */

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
    // Accounts with no role predate the roster and are the school's own
    // operator, so they keep full access rather than silently losing the
    // buttons they have always had.
    case 'admin': return true
    case 'teacher': return TEACHER_ACTIONS.includes(action)
    case 'viewer': return false
    default: return false
  }
}

export const ROLE_LABELS: Record<Role, string> = {
  admin: 'Administrator', teacher: 'Faculty', viewer: 'View only',
}
