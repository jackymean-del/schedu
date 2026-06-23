/**
 * Organization profile — the generic, type-neutral identity the user enters on
 * first sign-in (name, kind, academic period). Drives the dashboard header and
 * the onboarding guide. Kept deliberately generic: no "school"/"CBSE" defaults.
 * Specific values appear only after the user enters them.
 */
import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export interface OrgProfile {
  /** Display name, e.g. "Greenfield Academy" or "Acme Corp". */
  name: string
  /** Neutral kind: 'School' | 'College' | 'Company' | 'Hospital' | … (free-form). */
  kind: string
  /** Academic / planning period label, e.g. "2025–26". Free-form. */
  period: string
}

interface OrgProfileState extends OrgProfile {
  /** Clerk user id this profile belongs to (per-user isolation in a shared browser). */
  ownerId: string | null
  /** True once the user has explicitly dismissed the guide this session-set. */
  guideDismissed: boolean

  setProfile: (patch: Partial<OrgProfile>) => void
  setGuideDismissed: (v: boolean) => void
  /** Clear the profile and bind it to a new owner (called on account switch). */
  resetForOwner: (ownerId: string) => void
}

const EMPTY: OrgProfile = { name: '', kind: '', period: '' }

export const useOrgProfile = create<OrgProfileState>()(
  persist(
    (set) => ({
      ...EMPTY,
      ownerId: null,
      guideDismissed: false,
      setProfile: (patch) => set((s) => ({ ...s, ...patch })),
      setGuideDismissed: (v) => set({ guideDismissed: v }),
      resetForOwner: (ownerId) => set({ ...EMPTY, ownerId, guideDismissed: false }),
    }),
    { name: 'schedu-org-profile' }
  )
)

/** A profile is "set up" once it has at least a name. */
export function isOrgProfileComplete(p: Pick<OrgProfile, 'name'>): boolean {
  return p.name.trim().length > 0
}
