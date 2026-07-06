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
import { useTimetableStore } from '@/store/timetableStore'
import { timetableApi } from '@/api/client'
import { saveTimetableSnapshot } from '@/api/timetables'
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

/** Revert the active timetable to a draft (dashboard shows it as "Draft").
 *  Keeps wizardStep at 5 so the generated work is preserved and re-publishable. */
export function markActiveTimetableUnpublished(): void {
  patchActiveTimetableEntry({ status: 'draft', wizardStep: 5 })
}

const TT_SNAPSHOT_PFX = 'schedu-tt-snap-'
// Must mirror dashboard.tsx's TT_SNAPSHOT_FIELDS so load/save here round-trip
// the SAME data the dashboard persists — including resources (sections, staff,
// subjects, rooms, strengths) and the elective-grouping data. Missing any field
// here means it silently won't survive a per-timetable save/restore.
const TT_SNAPSHOT_FIELDS = [
  'step','config','sections','staff','subjects','breaks','periods',
  'classTT','teacherTT','substitutions','substitutionSettings','conflicts','suggestions',
  'optionalConfigs','subjectPools','participantPools','rooms',
  'facilities','teacherPools',
  'subjectGroups','subjectCombinations','dynamicLearningGroups',
  'sectionStrengths','subjectGroupingRules','subjectAllocations',
]

/**
 * Load the active timetable's snapshot into the store.
 * Called by pages (Calendar, Reports, etc.) that read store data but aren't
 * the wizard — so after a page refresh the timetable data is available even
 * if the user didn't come via the dashboard's "Continue" button.
 * No-op when the store already has data (classTT non-empty).
 */
export function loadActiveTimetableIntoStore(): void {
  const id = getActiveTimetableId()
  if (!id) return

  const state = useTimetableStore.getState()

  // Already populated — nothing to do.
  if (Object.keys(state.classTT ?? {}).length > 0) return

  // Try the per-user namespaced snapshot key first, then the un-namespaced one.
  const uid = useAuthStore.getState().user?.id ?? ''
  const keys = [`${TT_SNAPSHOT_PFX}${uid}:${id}`, `${TT_SNAPSHOT_PFX}:${id}`, `${TT_SNAPSHOT_PFX}${id}`]
  let snap: Record<string, unknown> | null = null
  for (const k of keys) {
    try {
      const raw = localStorage.getItem(k)
      if (raw) { snap = JSON.parse(raw); break }
    } catch { /* ignore */ }
  }
  if (!snap) return

  TT_SNAPSHOT_FIELDS.forEach(field => {
    const setter = `set${field.charAt(0).toUpperCase()}${field.slice(1)}`
    if (typeof (state as any)[setter] === 'function' && snap![field] !== undefined) {
      ;(state as any)[setter](snap![field])
    }
  })
}

/** Schedules available to switch between: id + name + status, newest first,
 *  read from the same list the dashboard maintains. */
export function listTimetables(): { id: string; name: string; status?: string }[] {
  try {
    const raw = localStorage.getItem(ttListKey()) ?? localStorage.getItem(TTLIST_KEY)
    const list: any[] = raw ? JSON.parse(raw) : []
    return list.map(t => ({ id: t.id, name: t.name ?? 'Untitled', status: t.status }))
  } catch { return [] }
}

/**
 * Switch the active timetable in place (no reload): snapshot the outgoing
 * schedule, force-load the target's snapshot into the store (reset first so
 * nothing bleeds between schedules), THEN point the active id at the new one.
 * Returns false when the target has no snapshot yet — the caller should send
 * the user to the dashboard/wizard for that one instead.
 *
 * CRITICAL ordering: the active-id pointer must only move once the target's
 * snapshot has actually been loaded. Flipping it first (as this used to) and
 * bailing out on a missing snapshot leaves `schedu-active-tt` pointing at a
 * schedule whose data was never loaded into the store — the store still holds
 * the OUTGOING schedule's data, so any later save (anything that persists via
 * saveActiveTimetableSnapshot) silently overwrites the new schedule's snapshot
 * with the old schedule's data. This is how a schedule's own data can end up
 * looking like an exact copy of a different, unrelated schedule.
 */
export function switchActiveTimetable(id: string): boolean {
  const current = getActiveTimetableId()
  if (current === id) return true

  const uid = useAuthStore.getState().user?.id ?? ''
  const keys = [`${TT_SNAPSHOT_PFX}${uid}:${id}`, `${TT_SNAPSHOT_PFX}:${id}`, `${TT_SNAPSHOT_PFX}${id}`]
  let snap: Record<string, unknown> | null = null
  for (const k of keys) {
    try {
      const raw = localStorage.getItem(k)
      if (raw) { snap = JSON.parse(raw); break }
    } catch { /* ignore */ }
  }
  if (!snap) return false

  if (current) saveActiveTimetableSnapshot()
  localStorage.setItem(ACTIVE_TT_KEY, id)
  const store = useTimetableStore.getState() as any
  store.resetWizard?.()
  useTimetableStore.setState(snap as any)
  return true
}

/**
 * Persist the CURRENT store state as the active timetable's snapshot, scoped to
 * that timetable (and this user). Lets pages outside the dashboard — notably
 * Master Data — save resource edits PER TIMETABLE instead of leaking them into
 * the single global persisted store. No-op when there's no active timetable.
 *
 * Writes the same per-user namespaced key loadActiveTimetableIntoStore() reads
 * first, and best-effort mirrors to the server when Clerk auth is on.
 */
export function saveActiveTimetableSnapshot(): void {
  const id = getActiveTimetableId()
  if (!id) return

  const state = useTimetableStore.getState() as unknown as Record<string, unknown>
  const snap: Record<string, unknown> = {}
  TT_SNAPSHOT_FIELDS.forEach(f => { snap[f] = state[f] })

  const uid = useAuthStore.getState().user?.id ?? ''
  try {
    localStorage.setItem(`${TT_SNAPSHOT_PFX}${uid}:${id}`, JSON.stringify(snap))
  } catch { /* quota full — silently ignore */ }

  if (CLERK_ENABLED) {
    saveTimetableSnapshot(id, snap).catch(() => { /* offline / transient */ })
  }
}
