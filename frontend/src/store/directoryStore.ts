/**
 * Shared staff & venue directory — the org-wide, cross-schedule roster of real
 * teachers and rooms. Each schedule's wizard still keeps its own local
 * Staff[]/Room[] arrays (unchanged), but adding an entry now consults this
 * directory first so "same name" becomes a deliberate, known choice instead
 * of an accident: picking an existing entry links this schedule's row to it
 * via `directoryId`; adding a genuinely new person/room with a name that
 * collides with an existing entry is blocked until the name is made unique.
 *
 * Modeled directly on `store/orgProfile.ts` — Zustand `persist`, single
 * localStorage key, `ownerId`-scoped so different signed-in users (or a
 * fresh mock-auth session) don't see each other's rosters.
 *
 * Deliberately NOT a rewrite of teacher/room identity elsewhere in the app:
 * `TimetableCell.teacher`/`.room`, `substitutions`, `FreeAssignment`, and all
 * the cross-schedule clash/availability logic in `pages/calendar.tsx` and
 * `lib/activeSchedules.ts` continue to key on the NAME string, same as
 * before. This store's only job is making those names trustworthy.
 */
import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export interface DirectoryStaff {
  id: string
  name: string
  shortName?: string
  role?: string
  subjects?: string[]
  maxPeriodsPerWeek?: number
  gender?: 'male' | 'female' | 'other'
}

export interface DirectoryVenue {
  id: string
  name: string
  roomType?: string
  capacity?: number
}

function makeDirId(): string {
  return Math.random().toString(36).slice(2, 9)
}

function norm(name: string): string {
  return name.trim().toLowerCase()
}

interface DirectoryState {
  /** Clerk user id (or mock uid) this directory belongs to. */
  ownerId: string | null
  staff: DirectoryStaff[]
  venues: DirectoryVenue[]
  /** One-time backfill guard — see bootstrapDirectoryFromSchedules in lib/directoryBootstrap.ts. */
  bootstrapped: boolean

  addStaff: (s: Omit<DirectoryStaff, 'id'>) => DirectoryStaff
  addVenue: (v: Omit<DirectoryVenue, 'id'>) => DirectoryVenue
  findStaffByName: (name: string) => DirectoryStaff | undefined
  findVenueByName: (name: string) => DirectoryVenue | undefined
  resetForOwner: (ownerId: string) => void
  markBootstrapped: () => void
}

const EMPTY = { staff: [] as DirectoryStaff[], venues: [] as DirectoryVenue[], bootstrapped: false }

export const useDirectoryStore = create<DirectoryState>()(
  persist(
    (set, get) => ({
      ownerId: null,
      ...EMPTY,

      addStaff: (s) => {
        const existing = get().findStaffByName(s.name)
        if (existing) return existing
        const entry: DirectoryStaff = { ...s, id: makeDirId() }
        set((st) => ({ staff: [...st.staff, entry] }))
        return entry
      },
      addVenue: (v) => {
        const existing = get().findVenueByName(v.name)
        if (existing) return existing
        const entry: DirectoryVenue = { ...v, id: makeDirId() }
        set((st) => ({ venues: [...st.venues, entry] }))
        return entry
      },
      findStaffByName: (name) => get().staff.find(s => norm(s.name) === norm(name)),
      findVenueByName: (name) => get().venues.find(v => norm(v.name) === norm(name)),

      resetForOwner: (ownerId) => set({ ownerId, ...EMPTY }),
      markBootstrapped: () => set({ bootstrapped: true }),
    }),
    { name: 'schedu-staff-venue-directory' }
  )
)

/**
 * Bulk paths (CSV import, "AI Generate All Resources", "Let me create
 * smartly") can produce a dozen+ rows at once — a per-row link-or-rename
 * dialog like the wizard's manual Add row would be unusable there. So bulk
 * generation silently links each row to a matching directory entry (or
 * registers it as new) with no prompt: the deterministic naming patterns
 * these generators use ("Mathematics Teacher 1", "Room 101"...) are exactly
 * as likely to coincidentally repeat across two schedules as they are to
 * genuinely mean "the same auto-slot" — the cross-schedule teacher-clash
 * banner (pages/calendar.tsx) remains the real safety net for a genuine
 * double-booking regardless of whether two rows share a directoryId.
 */
export function linkOrRegisterStaff<T extends { name: string; directoryId?: string }>(rows: T[]): T[] {
  const { findStaffByName, addStaff } = useDirectoryStore.getState()
  return rows.map(r => {
    if (r.directoryId || !r.name?.trim()) return r
    const entry = findStaffByName(r.name) ?? addStaff({ name: r.name.trim() })
    return { ...r, directoryId: entry.id }
  })
}

export function linkOrRegisterVenues<T extends { name: string; directoryId?: string }>(rows: T[]): T[] {
  const { findVenueByName, addVenue } = useDirectoryStore.getState()
  return rows.map(r => {
    if (r.directoryId || !r.name?.trim()) return r
    const entry = findVenueByName(r.name) ?? addVenue({ name: r.name.trim() })
    return { ...r, directoryId: entry.id }
  })
}
