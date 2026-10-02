/**
 * WHO IS AWAY, AND THE COVER THAT FOLLOWS.
 *
 * The server holds the record (handlers/unavailability.go decides who may
 * write what); this browser keeps a copy in the leave store, which is what the
 * Calendar, Dashboard, Insights and the corridor board already read. A
 * schedule that exists only in this browser - demo mode, or no network - still
 * works: the record is kept locally, exactly as it always was.
 *
 * Automatic cover runs here, in the school's own app, because cover is
 * written into the timetable and the timetable belongs to whoever plans it.
 * It runs when an administrator marks someone unavailable, and whenever a
 * teacher's own report arrives (the sync polls), so a teacher who reports
 * themselves ill at 6am is covered by the time anyone opens the school's app.
 */
import { useEffect, useState } from 'react'
import { collabApi } from '@/api/client'
import { useTimetableStore } from '@/store/timetableStore'
import { useAuthStore } from '@/store/authStore'
import { useLeaves, leaveCoversDate, type CalLeave } from './leaveUtils'
import { getActiveTimetableId, saveActiveTimetableSnapshot } from './ttRegistry'
import { loadActiveBundles, patchBundleSubstitutions, type ScheduleBundle } from './activeSchedules'
import { withSubstitutionDefaults } from './substitutionSettings'
import { makeCoverEngine, dayKeyOfISO, weekDatesOf } from './coverEngine'
import { useSubCoverage, slotKey } from './substitutionCoverage'
import { useSchoolEvents } from './schoolEvents'
import { useSyllabus } from './syllabusTracking'
import { subKey, localISO } from './substitutionKeys'
import { schedulePeriodTimes } from './bellTimes'
import {
  mergeServerLeaves, leaveToBody, datesFrom, isServerLeave, SERVER_PREFIX,
} from './unavailabilityRules'

/** How far ahead automatic cover plans. Cover booked for next week is what
 *  lets a school see a gap before the morning it happens. */
export const AUTO_COVER_DAYS = 14

const uidNow = () => useAuthStore.getState().user?.id ?? ''

/** The schedule id the server knows this school by. */
function scheduleIdForServer(preferred?: string): string | null {
  return preferred || getActiveTimetableId() || loadActiveBundles(uidNow())[0]?.id || null
}

/** Every schedule cover may involve: the open one live from the store, the
 *  other active ones from their snapshots. */
function coverBundles(): ScheduleBundle[] {
  const st = useTimetableStore.getState() as any
  const openId = getActiveTimetableId() ?? 'open'
  const open: ScheduleBundle = {
    id: openId, name: st.config?.timetableName ?? 'Schedule',
    sections: st.sections ?? [], staff: st.staff ?? [], rooms: st.rooms ?? [], subjects: st.subjects ?? [],
    periods: st.periods ?? [], config: st.config ?? {}, classTT: st.classTT ?? {},
    substitutions: { ...(st.substitutions ?? {}) }, orDecisions: st.orDecisions ?? {},
  }
  const active = loadActiveBundles(uidNow())
  if (active.length <= 1) return Object.keys(open.classTT).length ? [open] : []
  return active.map(b => (b.id === openId ? open : { ...b, substitutions: { ...b.substitutions } }))
}

function writeCover(bundles: ScheduleBundle[], touched: Set<string>) {
  const openId = getActiveTimetableId() ?? 'open'
  for (const b of bundles) {
    if (!touched.has(b.id)) continue
    if (b.id === openId) {
      ;(useTimetableStore.getState() as any).setSubstitutions(b.substitutions)
      saveActiveTimetableSnapshot()
    } else {
      patchBundleSubstitutions(uidNow(), b.id, b.substitutions)
    }
  }
}

function periodHours(b: ScheduleBundle, periodId: string): number {
  const t = schedulePeriodTimes(b.config, b.periods, b.sections).get(periodId)
  if (!t) return (b.config?.periodMinutes ?? 40) / 60
  return Math.round(((t.endMin - t.startMin) / 60) * 10) / 10
}

/**
 * Cover every uncovered lesson that the recorded absences take people out of,
 * from today for AUTO_COVER_DAYS - when the school has turned automatic cover
 * on. Returns what it did, so a caller can say so.
 */
export function runAutoCover(opts: { teacher?: string; force?: boolean } = {}): { assigned: number; uncovered: number } {
  const st = useTimetableStore.getState() as any
  const settings = withSubstitutionDefaults(st.substitutionSettings)
  if (!opts.force && !settings.defaults.autoCoverOnUnavailable) return { assigned: 0, uncovered: 0 }
  const bundles = coverBundles()
  if (!bundles.length) return { assigned: 0, uncovered: 0 }

  const leaves = useLeaves.getState().leaves
  const events = useSchoolEvents.getState().events
  const plans = (useSyllabus.getState() as any).plans ?? {}
  const seen = new Set<string>()
  const staffPool = bundles.flatMap(b => b.staff).filter((s: any) => s?.name && !seen.has(s.name) && seen.add(s.name))
  const touched = new Set<string>()
  const record = useSubCoverage.getState().record
  let assigned = 0, uncovered = 0

  for (const iso of datesFrom(localISO(new Date()), AUTO_COVER_DAYS)) {
    const away = leaves.filter(l => leaveCoversDate(l, iso) && (!opts.teacher || l.teacher === opts.teacher))
    if (!away.length) continue
    const engine = makeCoverEngine({
      bundles, isoDate: iso, dayKey: dayKeyOfISO(iso), dateOfWeekday: weekDatesOf(iso),
      settings, staffPool, events, plans, leaves,
    })
    for (const absence of away) {
      const plan = engine.planAutoCover(absence.teacher, absence)
      for (const [sid, map] of Object.entries(plan.bySid)) {
        const b = bundles.find(x => x.id === sid)
        if (!b) continue
        // Changed in place, so the next absence on this date sees these covers
        // as taken and counts them against everyone's limits.
        if (JSON.stringify(b.substitutions) !== JSON.stringify(map)) { b.substitutions = map; touched.add(sid) }
      }
      for (const a of plan.assigned) {
        const b = bundles.find(x => x.id === a.sid)!
        record({
          date: iso, sid: a.sid, section: a.section, periodId: a.periodId,
          subject: a.subject, absent: absence.teacher, substitute: a.substitute,
          intent: 'skip', hours: periodHours(b, a.periodId),
        })
      }
      assigned += plan.assigned.length
      uncovered += plan.uncovered.length
    }
  }
  writeCover(bundles, touched)
  return { assigned, uncovered }
}

/**
 * Take back cover that only existed because of an absence now withdrawn.
 * Only the absent teacher's own lessons on those dates are cleared - a cover
 * arranged for somebody else is untouched.
 */
export function clearCoverFor(absence: CalLeave) {
  const bundles = coverBundles()
  if (!bundles.length) return
  const st = useTimetableStore.getState() as any
  const settings = withSubstitutionDefaults(st.substitutionSettings)
  const days = absence.duration === 'long' && absence.endDate
    ? datesFrom(absence.date, Math.min(400, Math.round((Date.parse(absence.endDate) - Date.parse(absence.date)) / 86400000) + 1))
    : [absence.date]
  const touched = new Set<string>()
  const clear = useSubCoverage.getState().clearSlot
  for (const iso of days) {
    const engine = makeCoverEngine({
      bundles, isoDate: iso, dayKey: dayKeyOfISO(iso), dateOfWeekday: weekDatesOf(iso),
      settings, staffPool: [], leaves: [],
    })
    for (const slot of engine.slotsOf(absence.teacher, absence)) {
      const b = bundles.find(x => x.id === slot.sid)!
      const k = subKey(slot.section, iso, slot.periodId)
      if (b.substitutions[k]) {
        delete b.substitutions[k]
        touched.add(b.id)
        clear(slotKey({ date: iso, sid: slot.sid, section: slot.section, periodId: slot.periodId }))
      }
    }
  }
  writeCover(bundles, touched)
}

/**
 * Record somebody as unavailable: on the server when this schedule has one,
 * otherwise here. Then cover, if the school has asked for that.
 */
export async function recordUnavailable(leave: CalLeave, opts: { scheduleId?: string; autoCover?: boolean } = {}):
  Promise<{ stored: 'server' | 'local'; leave: CalLeave; cover: { assigned: number; uncovered: number } }> {
  let stored: 'server' | 'local' = 'local'
  let saved = leave
  const sid = scheduleIdForServer(opts.scheduleId)
  if (sid) {
    try {
      const res = await collabApi.reportUnavailability(sid, leaveToBody(leave))
      if (res.data?.id) {
        saved = { ...leave, id: SERVER_PREFIX + res.data.id, source: res.data.source }
        stored = 'server'
      }
    } catch (e: any) {
      // A refusal is an answer, not an outage: say it rather than quietly
      // keeping a record the school will never see.
      const status = e?.response?.status
      if (status === 403 || status === 400) throw new Error(e?.response?.data?.error || e?.response?.data?.message || 'Not allowed')
    }
  }
  const { leaves, setLeaves } = useLeaves.getState()
  setLeaves([...leaves.filter(l => l.id !== saved.id), saved])
  const cover = opts.autoCover === false ? { assigned: 0, uncovered: 0 } : runAutoCover({ teacher: saved.teacher })
  return { stored, leave: saved, cover }
}

/** Withdraw a recorded absence, and the cover it caused. */
export async function withdrawUnavailable(leave: CalLeave, opts: { scheduleId?: string; clearCover?: boolean } = {}): Promise<void> {
  if (isServerLeave(leave)) {
    const sid = scheduleIdForServer(opts.scheduleId)
    if (!sid) throw new Error('Not connected to the school')
    await collabApi.withdrawUnavailability(sid, leave.id.slice(SERVER_PREFIX.length))
  }
  const { leaves, setLeaves } = useLeaves.getState()
  setLeaves(leaves.filter(l => l.id !== leave.id))
  if (opts.clearCover !== false) clearCoverFor(leave)
}

/** Pull the server's record for a window into the leave store. Returns the
 *  absences that were withdrawn elsewhere, so their cover can be released. */
export async function pullUnavailability(from: string, to: string, scheduleId?: string):
  Promise<{ changed: boolean; withdrawn: CalLeave[] }> {
  const sid = scheduleIdForServer(scheduleId)
  if (!sid) return { changed: false, withdrawn: [] }
  let rows
  try {
    rows = (await collabApi.unavailability(sid, from, to)).data?.unavailability ?? []
  } catch {
    return { changed: false, withdrawn: [] }
  }
  const { leaves, setLeaves } = useLeaves.getState()
  const next = mergeServerLeaves(leaves, rows, from, to)
  const nextIds = new Set(next.map(l => l.id))
  const withdrawn = leaves.filter(l => isServerLeave(l) && !nextIds.has(l.id))
  const changed = JSON.stringify(next) !== JSON.stringify(leaves)
  if (changed) setLeaves(next)
  return { changed, withdrawn }
}

/**
 * Keep this browser's record of who is away fresh, and - in the school's own
 * app - cover what arrives. Mounted once, in the app shell, for anybody who
 * may arrange cover; pages read the leave store as they always have.
 */
export function useUnavailabilitySync(enabled: boolean, pollMs = 60_000): number {
  const uid = useAuthStore(s => s.user?.id ?? '')
  const [bump, setBump] = useState(0)
  useEffect(() => {
    if (!enabled || !uid) return
    let alive = true
    const run = async () => {
      const from = localISO(new Date())
      const to = datesFrom(from, AUTO_COVER_DAYS).slice(-1)[0]
      const { changed, withdrawn } = await pullUnavailability(from, to)
      if (!alive) return
      for (const w of withdrawn) clearCoverFor(w)
      const cover = runAutoCover()
      if (changed || withdrawn.length || cover.assigned) setBump(n => n + 1)
    }
    run()
    const t = setInterval(run, pollMs)
    return () => { alive = false; clearInterval(t) }
  }, [enabled, uid, pollMs])
  return bump
}
