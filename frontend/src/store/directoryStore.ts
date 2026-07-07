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
