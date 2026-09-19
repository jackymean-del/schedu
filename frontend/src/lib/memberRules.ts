/**
 * THE RULES for reconciling a school's roster with the server's copy.
 *
 * Separate from memberSync.ts, which does the fetching, so these can be run
 * without a network or a booted app. The mapping is small but it decides who
 * the app thinks somebody is, and getting it wrong locks a real teacher out of
 * their own timetable.
 */
import type { Member } from '@/store/members'
import type { Role } from '@/lib/permissionPolicy'

/** A row as the server sends it. */
export interface ServerMember {
  id: string
  email: string
  staffName?: string
  role?: string
  status?: string
}

const ROLES: Role[] = ['admin', 'teacher', 'viewer']

/** A role we recognise, or the safest one. An unknown role must not become an
 *  admin; 'viewer' offers the least and is the honest default. */
export function safeRole(role: string | undefined): Role {
  const r = (role ?? '').trim().toLowerCase()
  return (ROLES as string[]).includes(r) ? (r as Role) : 'viewer'
}

export const normEmail = (e: string) => (e ?? '').trim().toLowerCase()

/** Server rows → the store's shape. */
export function toMembers(rows: ServerMember[] | undefined): Member[] {
  const out: Member[] = []
  const seen = new Set<string>()
  for (const r of rows ?? []) {
    const email = normEmail(r.email)
    // A row with no email cannot be matched to anybody, and one email cannot
    // belong to two rows — the server's UNIQUE(owner_id, email) says so, and
    // trusting it here would mean a duplicate silently shadowing the first.
    if (!email || seen.has(email)) continue
    seen.add(email)
    out.push({
      id: r.id,
      email,
      role: safeRole(r.role),
      status: r.status === 'active' ? 'active' : 'invited',
      addedAt: new Date().toISOString(),
      staffName: (r.staffName ?? '').trim() || undefined,
    })
  }
  return out
}

/**
 * Is this roster usable for the thing it exists to do?
 *
 * A member with no staff name is an account the server cannot match to any
 * lesson: they sign in, see the school listed, and every period reads "not
 * yours to change" — with nothing on screen explaining why. That is worth
 * saying on the page that creates them rather than leaving them to discover it.
 */
export function unmappedMembers(members: Member[]): Member[] {
  // Teachers only. An administrator is the account that OWNS the timetable and
  // is authorised as its owner however they are named; nagging them to map a
  // staff name they may not have — plenty of heads do not teach — is the kind
  // of warning people learn to scroll past, which costs the real one its force.
  return members.filter(m => m.role === 'teacher' && !(m.staffName ?? '').trim())
}

/**
 * Staff names that do not appear on the timetable's roster.
 *
 * A typo here fails the same way an empty name does — silently — because the
 * server compares the member's staff name against the names in the timetable
 * and simply finds nothing.
 */
export function unknownStaffNames(members: Member[], staffNames: string[]): Member[] {
  const known = new Set(staffNames.map(n => n.trim().toLowerCase()).filter(Boolean))
  if (!known.size) return []
  return members.filter(m => {
    if (m.role !== 'teacher') return false
    const sn = (m.staffName ?? '').trim().toLowerCase()
    return !!sn && !known.has(sn)
  })
}
