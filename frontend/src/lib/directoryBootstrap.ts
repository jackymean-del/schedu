/**
 * One-time backfill so the shared staff/venue directory (store/directoryStore.ts)
 * isn't empty for schools that already had one or more schedules before this
 * feature shipped. Walks every currently-active schedule's snapshot (via the
 * same `loadActiveBundles` used everywhere else for cross-schedule reads) and
 * seeds the directory from whatever staff/rooms already exist, deduping by
 * trimmed/lowercased name.
 *
 * Deliberately does NOT try to merge or flag pre-existing coincidental name
 * collisions here — the existing cross-schedule teacher-clash banner
 * (pages/calendar.tsx, teacherClashes) already surfaces those for the user to
 * resolve. This just makes sure going-forward wizard entry has something to
 * match against from day one.
 */
import { loadActiveBundles } from './activeSchedules'
import { useDirectoryStore } from '@/store/directoryStore'

export function bootstrapDirectoryFromSchedules(uid: string): void {
  // Mock auth has no ClerkAuthSync equivalent to rebind the directory on
  // account switch, so treat a changed uid as the reset signal here too —
  // this is the one guaranteed call site for every auth mode.
  if (useDirectoryStore.getState().ownerId !== uid) {
    useDirectoryStore.getState().resetForOwner(uid)
  }
  const dir = useDirectoryStore.getState()
  if (dir.bootstrapped) return

  const bundles = loadActiveBundles(uid)
  for (const b of bundles) {
    for (const s of b.staff ?? []) {
      const name = (s?.name ?? '').trim()
      if (!name) continue
      dir.addStaff({
        name,
        shortName: s.shortName || undefined,
        role: s.role || undefined,
        subjects: Array.isArray(s.subjects) ? s.subjects : undefined,
        maxPeriodsPerWeek: s.maxPeriodsPerWeek,
        gender: s.gender,
      })
    }
    for (const r of b.rooms ?? []) {
      const name = (r?.actualName || r?.generatedName || r?.name || '').trim()
      if (!name) continue
      dir.addVenue({
        name,
        roomType: r.roomType || undefined,
        capacity: r.capacity,
      })
    }
  }
  dir.markBootstrapped()
}
