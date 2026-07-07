/**
 * One-time backfill so the shared staff/venue directory (store/directoryStore.ts)
 * isn't empty for schools that already had one or more schedules before this
 * feature shipped. Walks every currently-active schedule's snapshot (via the
 * same `loadActiveBundles` used everywhere else for cross-schedule reads),
 * seeds the directory from whatever staff/rooms already exist (deduping by
 * trimmed/lowercased name), AND writes the resulting directoryId back onto
 * each schedule's own row — otherwise pre-existing data would only ever have
 * *contributed* a name to the directory without ever being linked to it, so a
 * later rename/merge in the Directory view couldn't find it to cascade into.
 *
 * Deliberately does NOT try to merge or flag pre-existing coincidental name
 * collisions here — the existing cross-schedule teacher-clash banner
 * (pages/calendar.tsx, teacherClashes) already surfaces those for the user to
 * resolve. This just makes sure going-forward wizard entry (and the Directory
 * view's rename/merge cascade) has something real to match against.
 */
import { loadActiveBundles, snapKeyFor } from './activeSchedules'
import { useDirectoryStore } from '@/store/directoryStore'
import { useTimetableStore } from '@/store/timetableStore'
import { getActiveTimetableId, saveActiveTimetableSnapshot } from './ttRegistry'

export function bootstrapDirectoryFromSchedules(uid: string): void {
  // Mock auth has no ClerkAuthSync equivalent to rebind the directory on
  // account switch, so treat a changed uid as the reset signal here too —
  // this is the one guaranteed call site for every auth mode.
  if (useDirectoryStore.getState().ownerId !== uid) {
    useDirectoryStore.getState().resetForOwner(uid)
  }
  const dir = useDirectoryStore.getState()
  if (dir.bootstrapped) return

  const openId = getActiveTimetableId()
  const bundles = loadActiveBundles(uid)

  for (const b of bundles) {
    const staffIds: Record<string, string> = {} // local staff id -> directoryId
    for (const s of b.staff ?? []) {
      const name = (s?.name ?? '').trim()
      if (!name || s.directoryId) continue
      const entry = dir.addStaff({
        name,
        shortName: s.shortName || undefined,
        role: s.role || undefined,
        subjects: Array.isArray(s.subjects) ? s.subjects : undefined,
        maxPeriodsPerWeek: s.maxPeriodsPerWeek,
        gender: s.gender,
      })
      staffIds[s.id] = entry.id
    }
    const roomIds: Record<string, string> = {}
    for (const r of b.rooms ?? []) {
      const name = (r?.actualName || r?.generatedName || r?.name || '').trim()
      if (!name || r.directoryId) continue
      const entry = dir.addVenue({
        name,
        roomType: r.roomType || undefined,
        capacity: r.capacity,
      })
      roomIds[r.id] = entry.id
    }
    if (Object.keys(staffIds).length === 0 && Object.keys(roomIds).length === 0) continue

    const patchStaff = (rows: any[]) => rows.map(s => staffIds[s.id] ? { ...s, directoryId: staffIds[s.id] } : s)
    const patchRooms = (rows: any[]) => rows.map(r => roomIds[r.id] ? { ...r, directoryId: roomIds[r.id] } : r)

    if (b.id === openId) {
      const store = useTimetableStore.getState() as any
      if (Object.keys(staffIds).length) store.setStaff?.(patchStaff(store.staff ?? []))
      if (Object.keys(roomIds).length) store.setRooms?.(patchRooms(store.rooms ?? []))
      saveActiveTimetableSnapshot()
    } else {
      const key = snapKeyFor(uid, b.id)
      let snap: Record<string, any> = {}
      try { const raw = localStorage.getItem(key); if (raw) snap = JSON.parse(raw) } catch { /* ignore */ }
      if (Object.keys(staffIds).length) snap.staff = patchStaff(snap.staff ?? b.staff ?? [])
      if (Object.keys(roomIds).length) snap.rooms = patchRooms(snap.rooms ?? b.rooms ?? [])
      try { localStorage.setItem(key, JSON.stringify(snap)) } catch { /* quota */ }
    }
  }
  dir.markBootstrapped()
}
