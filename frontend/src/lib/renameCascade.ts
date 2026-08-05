/**
 * Applying a rename everywhere the old name is written down.
 *
 * The transforms are pure and live in lib/resourceRename; this is the part
 * that knows WHERE the names are. It follows the same read/write pattern as
 * lib/directoryManagement: the OPEN schedule goes through the live Zustand
 * store, so unsaved Master-Data edits aren't clobbered, and every other active
 * schedule is patched directly in its own snapshot.
 *
 * The list of places a name appears is the whole difficulty, and it is longer
 * than it looks: the timetable cells, the substitution map (keyed by section,
 * valued by teacher), syllabus plan keys, leave, cover pull-outs, duty
 * assignments, and the section scopes on holidays and events.
 */
import { useAuthStore } from '@/store/authStore'
import { useTimetableStore } from '@/store/timetableStore'
import { getActiveTimetableId, saveActiveTimetableSnapshot } from './ttRegistry'
import { loadActiveBundles, snapKeyFor } from './activeSchedules'
import { useLeaves } from './leaveUtils'
import { useSchoolEvents } from './schoolEvents'
import { useHolidays } from './holidays'
import { useFreeAssignments } from './freeAssignments'
import { useUrgentPullouts } from './urgentReassignments'
import { useSyllabus } from './syllabusTracking'
import {
  renameInClassTT, renameInSubstitutions, renameInPlans,
  renameInRecords, renameInStringLists, renameIsValid, type RenameKind,
} from './resourceRename'

/** What the cascade touched, so the UI can say so honestly. */
export interface RenameReport {
  schedules: number
  timetableChanged: boolean
  plansChanged: boolean
  recordsChanged: boolean
}

function patchSnapshot(uid: string, id: string, kind: RenameKind, from: string, to: string): boolean {
  const key = snapKeyFor(uid, id)
  let snap: Record<string, any> = {}
  try { const raw = localStorage.getItem(key); if (raw) snap = JSON.parse(raw) } catch { return false }
  const tt = renameInClassTT(snap.classTT, kind, from, to)
  const subs = renameInSubstitutions(snap.substitutions, kind, from, to)
  if (tt === snap.classTT && subs === snap.substitutions) return false
  snap.classTT = tt
  snap.substitutions = subs
  try { localStorage.setItem(key, JSON.stringify(snap)) } catch { return false }
  return true
}

/**
 * Move every reference from `from` to `to`.
 *
 * Safe to call on every commit of a name cell: an unchanged or blank name is a
 * no-op, and each transform returns its input untouched when nothing matched,
 * so a rename that concerns one schedule never rewrites the others.
 */
export function applyRename(kind: RenameKind, from: string, to: string): RenameReport {
  const report: RenameReport = { schedules: 0, timetableChanged: false, plansChanged: false, recordsChanged: false }
  if (!renameIsValid(from, to)) return report

  // ── Every active schedule's timetable ──
  const uid = useAuthStore.getState().user?.id ?? ''
  const openId = getActiveTimetableId()
  let bundles: Array<{ id: string }> = []
  try { bundles = loadActiveBundles(uid) } catch { bundles = [] }

  const store = useTimetableStore.getState() as any
  const openTT = renameInClassTT(store.classTT, kind, from, to)
  const openSubs = renameInSubstitutions(store.substitutions, kind, from, to)
  if (openTT !== store.classTT) { store.setClassTT?.(openTT); report.timetableChanged = true }
  if (openSubs !== store.substitutions) { store.setSubstitutions?.(openSubs); report.timetableChanged = true }
  if (report.timetableChanged) {
    report.schedules++
    try { saveActiveTimetableSnapshot() } catch { /* nothing open yet */ }
  }

  for (const b of bundles) {
    if (b.id === openId) continue
    if (patchSnapshot(uid, b.id, kind, from, to)) { report.schedules++; report.timetableChanged = true }
  }

  // ── Syllabus plans, keyed by subject||section ──
  const syl = useSyllabus.getState() as any
  const nextPlans = renameInPlans(syl.plans, kind, from, to)
  if (nextPlans !== syl.plans && syl.replacePlans) {
    syl.replacePlans(nextPlans)
    report.plansChanged = true
  }

  // ── The dated records that name people, classes and venues ──
  const leaveState = useLeaves.getState()
  if (kind === 'teacher') {
    const next = renameInRecords(leaveState.leaves, ['teacher'], from, to)
    if (next !== leaveState.leaves) { leaveState.setLeaves(next!); report.recordsChanged = true }
  }

  const dutyState = useFreeAssignments.getState()
  if (kind !== 'subject') {
    const next = renameInRecords(dutyState.assignments, ['entity'], from, to)
    if (next !== dutyState.assignments) { dutyState.setAssignments(next!); report.recordsChanged = true }
  }

  const pullState = useUrgentPullouts.getState()
  {
    const fields = kind === 'section' ? ['section'] : ['original', 'replacement']
    const next = renameInRecords(pullState.pullouts, fields as any, from, to)
    if (next !== pullState.pullouts) { pullState.setPullouts(next!); report.recordsChanged = true }
  }

  // Holidays and events scope themselves to class-sections by name.
  if (kind === 'section') {
    const hol = useHolidays.getState() as any
    const nextHol = renameInStringLists(hol.holidays, 'sections', from, to)
    if (nextHol !== hol.holidays) { hol.replaceHolidays?.(nextHol); report.recordsChanged = true }

    const ev = useSchoolEvents.getState()
    const nextEv = renameInStringLists(ev.events, 'sections', from, to)
    if (nextEv !== ev.events) { ev.setEvents(nextEv!); report.recordsChanged = true }
  }

  return report
}
