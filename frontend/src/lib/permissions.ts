/**
 * Resolving the CURRENT person's permissions.
 *
 * The policy table itself is pure and lives in lib/permissionPolicy — this file
 * is the store-bound half: it answers "what may the person at this keyboard
 * do?", which requires reading who is signed in and what the school's roster
 * says about them.
 *
 * Everything the policy exports is re-exported here so existing callers keep a
 * single import.
 */
import { useAuthStore } from '@/store/authStore'
import { useMembers, roleForEmail } from '@/store/members'
import { can, type Role, type Action } from './permissionPolicy'

export { can, ROLE_LABELS } from './permissionPolicy'
export type { Role, Action } from './permissionPolicy'

/**
 * The signed-in person's role.
 *
 * The school's own roster (store/members) is the authority — that is where an
 * administrator actually assigns roles. The role on the auth record is the
 * fallback for someone the roster hasn't heard of, and 'admin' the fallback
 * after that, so a school with no roster yet keeps working exactly as before.
 *
 * Deliberately resolved by EMAIL: people are added to the roster before they
 * ever sign in, so no account id exists at the point a role is assigned.
 */
export function currentRole(): Role {
  const user = useAuthStore.getState().user
  const fromRoster = roleForEmail(useMembers.getState().members, user?.email)
  return fromRoster ?? (user?.role as Role | undefined) ?? 'admin'
}

/** Hook form — re-renders when the signed-in user OR the roster changes. */
export function useCan(action: Action): boolean {
  const user = useAuthStore(s => s.user)
  const members = useMembers(s => s.members)
  const role = roleForEmail(members, user?.email) ?? (user?.role as Role | undefined)
  return can(role, action)
}
