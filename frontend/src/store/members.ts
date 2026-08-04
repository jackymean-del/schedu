/**
 * Who belongs to this school, and what each of them may do.
 *
 * Until now the Users page could only pretend: "invite" validated an email,
 * pushed it into component state and rendered a chip. Nothing persisted and no
 * role was ever assigned — so the permissions model (lib/permissions) had
 * nothing to read, and every account behaved as an administrator. A faculty
 * member could declare a school-wide holiday.
 *
 * HONEST LIMIT: this is a client-side roster. The backend exposes /me (which
 * returns a role) but no endpoint for setting anyone else's, so nothing here is
 * enforced on the server. Treat it as "what the app offers this person", not as
 * a security boundary — someone determined can edit their own browser storage.
 * When the API gains member management, this store becomes its cache and the
 * server's answer wins.
 */
import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { Role } from '@/lib/permissionPolicy'

export interface Member {
  id: string
  /** The identity we match a signed-in user against. Lower-cased on write. */
  email: string
  name?: string
  role: Role
  /** 'active' once they've signed in at least once; 'invited' before that. */
  status: 'active' | 'invited'
  addedAt: string
}

export const ROLE_ORDER: Role[] = ['admin', 'teacher', 'viewer']
export const ROLE_HINTS: Record<Role, string> = {
  admin: 'Everything: holidays, absences, cover, events and all settings.',
  teacher: 'Their own syllabus — record coverage, log a missed period, confirm a substitute.',
  viewer: 'Read-only. Can see schedules but change nothing.',
}

const norm = (e: string) => (e ?? '').trim().toLowerCase()

interface MembersState {
  members: Member[]
  addMember: (email: string, role: Role, name?: string) => void
  setRole: (id: string, role: Role) => void
  removeMember: (id: string) => void
  /** Called on sign-in: records the person and marks them active. */
  ensureMember: (email: string, name?: string, fallbackRole?: Role) => void
  reset: () => void
}

export const useMembers = create<MembersState>()(
  persist(
    (set) => ({
      members: [],

      addMember: (email, role, name) =>
        set(s => {
          const e = norm(email)
          if (!e) return s
          // Re-inviting someone who already exists updates their role rather
          // than creating a second row that silently shadows the first.
          if (s.members.some(m => m.email === e)) {
            return { members: s.members.map(m => m.email === e ? { ...m, role, name: name ?? m.name } : m) }
          }
          return {
            members: [...s.members, {
              id: Math.random().toString(36).slice(2, 9),
              email: e, name, role, status: 'invited', addedAt: new Date().toISOString(),
            }],
          }
        }),

      setRole: (id, role) => set(s => ({ members: s.members.map(m => m.id === id ? { ...m, role } : m) })),

      removeMember: (id) => set(s => ({ members: s.members.filter(m => m.id !== id) })),

      ensureMember: (email, name, fallbackRole = 'admin') =>
        set(s => {
          const e = norm(email)
          if (!e) return s
          const existing = s.members.find(m => m.email === e)
          if (existing) {
            return { members: s.members.map(m => m.email === e ? { ...m, status: 'active', name: name ?? m.name } : m) }
          }
          // First person through the door owns the school. Any later unknown
          // sign-in is recorded too, so an admin can see them and set a role
          // rather than wondering why someone has no access.
          const role: Role = s.members.length === 0 ? 'admin' : fallbackRole
          return {
            members: [...s.members, {
              id: Math.random().toString(36).slice(2, 9),
              email: e, name, role, status: 'active', addedAt: new Date().toISOString(),
            }],
          }
        }),

      reset: () => set({ members: [] }),
    }),
    { name: 'schedu-members' },
  ),
)

// ── Pure helpers (testable without React) ─────────────────────────────────

/** The role the roster assigns to an email, or undefined when unknown. */
export function roleForEmail(members: Member[], email: string | undefined): Role | undefined {
  const e = norm(email ?? '')
  if (!e) return undefined
  return members.find(m => m.email === e)?.role
}

/**
 * May this member's role be changed, or may they be removed?
 *
 * No, when they are the LAST admin. This roster is client-side with no server
 * to repair it, so a school that demotes its only administrator loses holidays,
 * settings and cover management permanently, with no way back through the UI.
 * Refusing the change is the only safe answer.
 */
export function canDemote(members: Member[], id: string): boolean {
  const target = members.find(m => m.id === id)
  if (!target || target.role !== 'admin') return true
  return members.filter(m => m.role === 'admin').length > 1
}
