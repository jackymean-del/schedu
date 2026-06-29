/**
 * Page-independent helpers for the per-user timetable list the dashboard
 * renders. Lets pages outside the dashboard (the wizard's publish action)
 * mark the active timetable's status without the dashboard component being
 * mounted — every wizard↔dashboard transition is a full page navigation, so
 * there's no shared in-memory state, only localStorage (and the server).
 *
 * Uses the SAME keys dashboard.tsx uses ('schedu-tt-list[:userId]',
 * 'schedu-active-tt'), so both stay in sync purely through storage.
 */
import { useAuthStore } from '@/store/authStore'
import { timetableApi } from '@/api/client'
import { CLERK_ENABLED } from '@/lib/clerk'

const TTLIST_KEY = 'schedu-tt-list'
const ACTIVE_TT_KEY = 'schedu-active-tt'

export function getActiveTimetableId(): string | null {
  return localStorage.getItem(ACTIVE_TT_KEY)
}

function ttListKey(): string {
  if (!CLERK_ENABLED) return TTLIST_KEY
  const uid = useAuthStore.getState().user?.id ?? ''
  return `${TTLIST_KEY}:${uid}`
}

/**
 * Patch fields on the active timetable's list entry, in the local cache and
 * (best-effort) on the server. No-op if there's no active timetable or it
 * isn't in the local list yet.
 */
export function patchActiveTimetableEntry(patch: Record<string, unknown>): void {
  const id = getActiveTimetableId()
  if (!id) return
  let merged: Record<string, any> | null = null
  try {
    const key = ttListKey()
    const raw = localStorage.getItem(key)
    const list: Record<string, any>[] = raw ? JSON.parse(raw) : []
    const idx = list.findIndex(t => t.id === id)
    if (idx === -1) return
    merged = { ...list[idx], ...patch }
    list[idx] = merged
    localStorage.setItem(key, JSON.stringify(list))
  } catch { /* ignore storage errors */ }

  if (CLERK_ENABLED && merged) {
    // Mirror ttRepo.updateTimetableMeta's shape: full config, minus id.
    const { id: _id, ...config } = merged
    timetableApi.update(id, { name: merged.name, config }).catch(() => { /* best-effort */ })
  }
}

/** Mark the active timetable as published (dashboard shows it as "Active"). */
export function markActiveTimetablePublished(): void {
  patchActiveTimetableEntry({ status: 'active', wizardStep: 5 })
}
