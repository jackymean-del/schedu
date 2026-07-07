/**
 * Cross-schedule maintenance for the shared staff/venue directory
 * (store/directoryStore.ts). Renaming or merging a directory entry from the
 * Directory management view needs to cascade into every active schedule's
 * own roster — otherwise the directory and what schedules actually display
 * would immediately drift apart again. Reuses the same read/write pattern as
 * `lib/activeSchedules.ts`'s `patchBundleSubstitutions`: the OPEN schedule
 * goes through the live Zustand store (so unsaved wizard/Master-Data edits
 * aren't clobbered), every other active schedule is patched directly in its
 * own snapshot.
 */
import { useAuthStore } from '@/store/authStore'
import { useTimetableStore } from '@/store/timetableStore'
import { getActiveTimetableId, saveActiveTimetableSnapshot } from './ttRegistry'
import { loadActiveBundles, snapKeyFor } from './activeSchedules'

export type DirectoryKind = 'staff' | 'venue'

function fieldFor(kind: DirectoryKind): 'staff' | 'rooms' {
  return kind === 'staff' ? 'staff' : 'rooms'
}

function patchOtherSnapshot(uid: string, id: string, field: 'staff' | 'rooms', mutate: (rows: any[]) => any[]) {
  const key = snapKeyFor(uid, id)
  let snap: Record<string, any> = {}
  try { const raw = localStorage.getItem(key); if (raw) snap = JSON.parse(raw) } catch { /* ignore */ }
  const rows: any[] = snap[field] ?? []
  const next = mutate(rows)
  if (next === rows) return // no matching row in this schedule — skip the write
  snap[field] = next
  try { localStorage.setItem(key, JSON.stringify(snap)) } catch { /* quota */ }
}

function cascade(field: 'staff' | 'rooms', mutate: (rows: any[]) => any[]): void {
  const uid = useAuthStore.getState().user?.id ?? ''
  const openId = getActiveTimetableId()
  const bundles = loadActiveBundles(uid)

  for (const b of bundles) {
    if (b.id === openId) {
      const store = useTimetableStore.getState() as any
      const rows: any[] = store[field] ?? []
      const next = mutate(rows)
      if (next === rows) continue
      const setter = field === 'staff' ? store.setStaff : store.setRooms
      setter?.(next)
      saveActiveTimetableSnapshot()
    } else {
      patchOtherSnapshot(uid, b.id, field, mutate)
    }
  }
}

/** Renames every schedule-local row linked to `directoryId` across every
 *  active schedule (not just the open one). Call alongside
 *  `useDirectoryStore.renameStaff/renameVenue` to update the entry itself. */
export function renameLinkedEntries(directoryId: string, newName: string, kind: DirectoryKind): void {
  const field = fieldFor(kind)
  cascade(field, (rows) => {
    if (!rows.some(r => r.directoryId === directoryId)) return rows
    return rows.map(r => r.directoryId === directoryId ? { ...r, name: newName } : r)
  })
}

/** Repoints every schedule-local row linked to `mergeId` onto `keepId` (and
 *  renames it to `keepName` for consistency). Caller removes the `mergeId`
 *  directory entry afterward via `useDirectoryStore.removeStaff/removeVenue`. */
export function mergeLinkedEntries(keepId: string, keepName: string, mergeId: string, kind: DirectoryKind): void {
  const field = fieldFor(kind)
  cascade(field, (rows) => {
    if (!rows.some(r => r.directoryId === mergeId)) return rows
    return rows.map(r => r.directoryId === mergeId ? { ...r, directoryId: keepId, name: keepName } : r)
  })
}

/** How many active schedules currently have a row linked to `directoryId`,
 *  with their names — for a small "used in: X, Y" hint in the directory UI. */
export function usageOf(directoryId: string, kind: DirectoryKind): string[] {
  const uid = useAuthStore.getState().user?.id ?? ''
  const field = fieldFor(kind)
  const bundles = loadActiveBundles(uid)
  return bundles
    .filter(b => ((b as any)[field] ?? []).some((r: any) => r.directoryId === directoryId))
    .map(b => b.name)
}
