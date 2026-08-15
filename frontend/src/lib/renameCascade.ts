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
  renameInRecords, renameInStringLists, renameInNestedKeys, renameIsValid, type RenameKind,
} from './resourceRename'

/** What the cascade touched, so the UI can say so honestly. */
export interface RenameReport {
  schedules: number
  timetableChanged: boolean
  plansChanged: boolean
  recordsChanged: boolean
  /** Roster rows moved too — teachers' subject lists, and the other schedules'
   *  own staff/subject/room/section lists. */
  rostersChanged: boolean
}

/** Which entity keys each level of an allocation map holds. */
const ALLOCATION_SHAPES: Array<[string, RenameKind[]]> = [
  ['teacherAllocations', ['teacher', 'section', 'subject']],
  ['subjectAllocations', ['section', 'subject']],
  ['manualSubjectAllocations', ['section', 'subject']],
  ['sectionCapacityOverrides', ['section']],
]

/**
 * A schedule other than the open one holds its OWN roster as well as its own
 * timetable, and both have to move together.
 *
 * Renaming only the timetable was worse than not cascading at all: the other
 * schedule ended up with a lesson taught by "Anita S. Sharma" and a roster
 * listing "Anita Sharma", so one person became two — an orphaned lesson nobody
 * can be marked absent for, beside a roster row that teaches nothing. That is
 * the exact failure this cascade exists to prevent, reproduced one schedule
 * over.
 */
function renameRosters(snap: Record<string, any>, kind: RenameKind, from: string, to: string): boolean {
  let changed = false
  const swap = (field: string, next: any) => {
    if (next !== snap[field]) { snap[field] = next; changed = true }
  }
  if (kind === 'teacher') swap('staff', renameInRecords(snap.staff, ['name'], from, to))
  if (kind === 'section') swap('sections', renameInRecords(snap.sections, ['name'], from, to))
  // A room's display name is actualName, falling back to name or generatedName
  // (see lib/roomShape). Offer all three: only the ones that actually hold the
  // old name are rewritten.
  if (kind === 'room') swap('rooms', renameInRecords(snap.rooms, ['actualName', 'name', 'generatedName'], from, to))
  if (kind === 'subject') {
    swap('subjects', renameInRecords(snap.subjects, ['name'], from, to))
    // Teachers carry the subject NAMES they can teach. Miss these and the
    // renamed subject has no qualified teacher in this schedule at all.
    swap('staff', renameInStringLists(snap.staff, 'subjects', from, to))
  }
  // The allocation grids are keyed by name at every level, and they are the
  // INPUT to generation — stale keys mean the next solve reads numbers filed
  // under a name nothing else uses.
  for (const [field, levels] of ALLOCATION_SHAPES) {
    swap(field, renameInNestedKeys(snap[field], levels, kind, from, to))
  }
  return changed
}

interface SnapshotPatch { timetable: boolean; rosters: boolean }
const NO_PATCH: SnapshotPatch = { timetable: false, rosters: false }

function patchSnapshot(uid: string, id: string, kind: RenameKind, from: string, to: string): SnapshotPatch {
  const key = snapKeyFor(uid, id)
  let snap: Record<string, any> = {}
  try { const raw = localStorage.getItem(key); if (raw) snap = JSON.parse(raw) } catch { return NO_PATCH }
  const tt = renameInClassTT(snap.classTT, kind, from, to)
  const subs = renameInSubstitutions(snap.substitutions, kind, from, to)
  const rosters = renameRosters(snap, kind, from, to)
  const timetable = tt !== snap.classTT || subs !== snap.substitutions
  if (!timetable && !rosters) return NO_PATCH
  snap.classTT = tt
  snap.substitutions = subs
  try { localStorage.setItem(key, JSON.stringify(snap)) } catch { return NO_PATCH }
  return { timetable, rosters }
}

/**
 * Move every reference from `from` to `to`.
 *
 * Safe to call on every commit of a name cell: an unchanged or blank name is a
 * no-op, and each transform returns its input untouched when nothing matched,
 * so a rename that concerns one schedule never rewrites the others.
 */
export function applyRename(kind: RenameKind, from: string, to: string): RenameReport {
  const report: RenameReport = { schedules: 0, timetableChanged: false, plansChanged: false, recordsChanged: false, rostersChanged: false }
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
  // The open schedule's own roster ROW is rewritten by the grid cell that
  // committed the rename. Its teachers' subject lists are not — nothing owns
  // them, so a renamed subject silently lost every teacher qualified to teach
  // it, and the engine (which matches teacher to subject by name) would report
  // the subject as unstaffable on the next generation.
  if (kind === 'subject') {
    const nextStaff = renameInStringLists(store.staff, 'subjects', from, to)
    if (nextStaff !== store.staff) { store.setStaff?.(nextStaff); report.rostersChanged = true }
  }

  // Same for the open schedule's allocation grids. Two of these are persisted
  // per-schedule and two live only in memory, but a rename mid-session corrupts
  // the grid the user is about to open either way.
  for (const [field, levels] of ALLOCATION_SHAPES) {
    const nextAlloc = renameInNestedKeys(store[field], levels, kind, from, to)
    if (nextAlloc !== store[field]) {
      useTimetableStore.setState({ [field]: nextAlloc } as any)
      report.rostersChanged = true
    }
  }

  if (report.timetableChanged || report.rostersChanged) {
    report.schedules++
    try { saveActiveTimetableSnapshot() } catch { /* nothing open yet */ }
  }

  for (const b of bundles) {
    if (b.id === openId) continue
    const patch = patchSnapshot(uid, b.id, kind, from, to)
    if (patch.timetable || patch.rosters) {
      report.schedules++
      if (patch.timetable) report.timetableChanged = true
      if (patch.rosters) report.rostersChanged = true
    }
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
