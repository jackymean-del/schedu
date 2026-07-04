/**
 * Section-accurate period → wall-clock minutes.
 *
 * The timetable views (routes/timetable.tsx) treat `config.bellSchedules` as
 * GROUND TRUTH: step-bell persists the exact generated rows per generation unit
 * (assembly, teaching, short-break/lunch, dispersal — each with a real
 * duration), and every clock time shown to the user is derived from them. The
 * calendar historically ignored this and just summed `periods[].duration` from
 * `config.startTime`, which silently drifts whenever the day contains assembly
 * time, a lunch, or per-section early dispersal that isn't a plain teaching
 * period — pushing afternoon lessons earlier than they really are.
 *
 * This module gives the calendar the same ground-truth clock so a lesson that
 * runs till 3:20 PM in the timetable also runs till 3:20 PM on the calendar.
 * Falls back to the naive cumulative sum when a schedule predates bell rows.
 */
import type { Period } from '@/types'

export type SlotMins = { startMin: number; endMin: number; type: string }
type BellRow = { id: string; name: string; type: string; duration: number; classes?: string[] }
type BellSchedule = { startTime: string; rows: BellRow[] }
type CwBreak = { id: string; type?: string; classes: string[]; afterPeriod: number; duration: number }

// e.g. "Nursery-A" → "nur", "LKG-B" → "lkg", "XI-Sci-A" → "xi" — mirrors
// routes/timetable.tsx so a section resolves to the same bell group.
export function getSectionClassKey(sectionName: string): string {
  const norm = sectionName.toLowerCase().replace(/[\s-]/g, '')
  if (norm.startsWith('nur')) return 'nur'
  if (norm.startsWith('lkg')) return 'lkg'
  if (norm.startsWith('ukg')) return 'ukg'
  return sectionName.split(/[\s-]/)[0].toLowerCase()
}

/** Ground-truth per-section times from the bell rows, keyed by period id
 *  (teaching rows → class period ids in order). Null when no bell schedule
 *  covers the section. */
function bellTimesForSection(
  sectionName: string,
  bellSchedules: BellSchedule[] | undefined,
  classwiseBreaks: CwBreak[] | undefined,
  periods: Period[],
): Map<string, SlotMins> | null {
  if (!bellSchedules?.length) return null
  const key = getSectionClassKey(sectionName)
  const sched = bellSchedules.find(bs =>
    bs.rows.some(r => r.type === 'teaching' && (r.classes ?? []).includes(key)))
  if (!sched) return null
  const myRows = sched.rows.filter(r => !(r.classes ?? []).length || r.classes!.includes(key))
  if (!myRows.some(r => r.type === 'teaching')) return null

  const [sh = 8, sm = 0] = (sched.startTime ?? '08:00').split(':').map(Number)
  let cur = sh * 60 + sm
  const map = new Map<string, SlotMins>()
  const classIds = periods.filter(p => p.type === 'class').map(p => p.id)
  const unmatched = (classwiseBreaks ?? [])
    .filter(b => b.classes.length === 0 || b.classes.includes(key))
    .sort((a, b) => a.afterPeriod - b.afterPeriod)

  let teachIdx = 0
  for (const r of myRows) {
    const slot: SlotMins = { startMin: cur, endMin: cur + r.duration, type: r.type === 'teaching' ? 'class' : r.type }
    if (r.type === 'teaching') {
      const pid = classIds[teachIdx]
      if (pid) map.set(pid, slot)
      teachIdx++
    } else if (r.type === 'assembly' || r.type === 'dispersal') {
      map.set(r.type, slot)
    } else {
      let mi = unmatched.findIndex(b => (b.type ?? '') === r.type)
      if (mi < 0) mi = unmatched.length ? 0 : -1
      if (mi >= 0) { const m = unmatched.splice(mi, 1)[0]; map.set(m.id, slot) }
      else map.set(r.id, slot)
    }
    cur += r.duration
  }
  return map
}

/** Naive cumulative fallback: every period back-to-back from config.startTime. */
function naiveTimes(config: any, periods: Period[]): Map<string, SlotMins> {
  const [sh = 9, sm = 0] = (config?.startTime ?? '09:00').split(':').map(Number)
  let mins = sh * 60 + sm
  const map = new Map<string, SlotMins>()
  for (const p of periods) {
    const dur = (p as any).duration ?? 45
    map.set(p.id, { startMin: mins, endMin: mins + dur, type: p.type })
    mins += dur
  }
  return map
}

/** Period → wall-clock minutes for one section: bell rows when available, else
 *  the naive cumulative sum. */
export function sectionPeriodTimes(sectionName: string, config: any, periods: Period[]): Map<string, SlotMins> {
  return bellTimesForSection(sectionName, config?.bellSchedules, config?.classwiseBreaks, periods)
    ?? naiveTimes(config, periods)
}

/** A representative period→time map for a whole schedule (first section with a
 *  bell, else naive) — for callers that need one global clock (ruler bounds,
 *  cross-schedule overlap checks) rather than per-section precision. */
export function schedulePeriodTimes(config: any, periods: Period[], sections: { name: string }[]): Map<string, SlotMins> {
  for (const s of sections) {
    const bell = bellTimesForSection(s.name, config?.bellSchedules, config?.classwiseBreaks, periods)
    if (bell) return bell
  }
  return naiveTimes(config, periods)
}
