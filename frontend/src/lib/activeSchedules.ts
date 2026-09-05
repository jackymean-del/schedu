/**
 * Multi-active schedules — the read-layer aggregation planned in memory:
 * several schedules can be `status: 'active'` at once (e.g. one for Classes
 * I–V, another for VI–X). Ops surfaces must see their UNION, while editing
 * surfaces keep working on the single open schedule.
 *
 * Every bundle keeps its OWN periods/startTime — different groups run
 * different bells — so cross-schedule comparison happens on wall-clock
 * minutes, never on period ids.
 */
import { sectionPeriodTimes } from './bellTimes'
import { computeTodaySummary, type TodaySummary, type RoomClash } from './scheduleToday'
import type { CalLeave } from './leaveUtils'

export interface ScheduleBundle {
  id: string; name: string
  sections: any[]; staff: any[]; rooms: any[]; subjects: any[]
  periods: any[]; config: any
  classTT: Record<string, any>
  substitutions: Record<string, string>
  /** Dated OR choices for THIS schedule, keyed section|date|period. Carried
   *  per bundle for the same reason substitutions are: a decision belongs to
   *  the schedule it was made on, and the open one's must not be applied to
   *  the others. */
  orDecisions: Record<string, any>
}

const TTLIST_KEY = 'schedu-tt-list'
const SNAP_PFX = 'schedu-tt-snap-'

/** The snapshot key an id currently lives under (namespaced preferred, else a
 *  legacy variant that already exists). Falls back to the namespaced key. */
export function snapKeyFor(uid: string, id: string): string {
  for (const k of [`${SNAP_PFX}${uid}:${id}`, `${SNAP_PFX}:${id}`, `${SNAP_PFX}${id}`]) {
    if (localStorage.getItem(k) != null) return k
  }
  return `${SNAP_PFX}${uid}:${id}`
}

/** Write one schedule's substitution map straight into its snapshot. Used to
 *  route a substitution to the schedule that OWNS the lesson when it isn't the
 *  open one (the open schedule persists through its store instead). */
export function patchBundleSubstitutions(uid: string, id: string, next: Record<string, string>): void {
  const key = snapKeyFor(uid, id)
  let snap: Record<string, any> = {}
  try { const raw = localStorage.getItem(key); if (raw) snap = JSON.parse(raw) } catch { /* ignore */ }
  snap.substitutions = next
  try { localStorage.setItem(key, JSON.stringify(snap)) } catch { /* quota */ }
}

/** Load a bundle for every schedule marked active in the tt-list. */
export function loadActiveBundles(uid: string): ScheduleBundle[] {
  let list: any[] = []
  try {
    const raw = localStorage.getItem(`${TTLIST_KEY}:${uid}`) ?? localStorage.getItem(TTLIST_KEY)
    list = raw ? JSON.parse(raw) : []
  } catch { return [] }

  const bundles: ScheduleBundle[] = []
  for (const t of list) {
    if (t.status !== 'active') continue
    let snap: Record<string, any> | null = null
    for (const k of [`${SNAP_PFX}${uid}:${t.id}`, `${SNAP_PFX}:${t.id}`, `${SNAP_PFX}${t.id}`]) {
      try {
        const raw = localStorage.getItem(k)
        if (raw) { snap = JSON.parse(raw); break }
      } catch { /* ignore */ }
    }
    if (!snap || !Object.keys(snap.classTT ?? {}).length) continue
    bundles.push({
      id: t.id, name: t.name ?? 'Untitled',
      sections: snap.sections ?? [], staff: snap.staff ?? [], rooms: snap.rooms ?? [],
      subjects: snap.subjects ?? [], periods: snap.periods ?? [], config: snap.config ?? {},
      classTT: snap.classTT ?? {}, substitutions: snap.substitutions ?? {},
      orDecisions: snap.orDecisions ?? {},
    })
  }
  return bundles
}

export interface MultiToday extends TodaySummary {
  scheduleCount: number
  classes: number; teachers: number; venues: number
}

/** Occupied wall-clock intervals per venue for one bundle on one weekday. */
function venueIntervals(b: ScheduleBundle, dayKey: string) {
  // Times come from the section's own BELL, not from adding up durations.
  //
  // Summing period durations from config.startTime silently drifts on any day
  // that holds an assembly, a lunch or a dispersal — those rows take real
  // minutes off the clock and are not plain teaching periods, so everything
  // after them lands early. This function decides whether two classes are in
  // one room AT THE SAME TIME, so a drifting clock does not merely mislabel a
  // row: it invents overlaps that do not exist and misses ones that do.
  //
  // sectionPeriodTimes falls back to exactly this cumulative sum when a
  // schedule has no bell rows, so nothing changes for schedules that never
  // had them. Per SECTION rather than per schedule, because classwise breaks
  // mean two classes can run to different clocks on the same day.
  const out: { room: string; startMin: number; endMin: number; section: string; periodName: string }[] = []
  for (const s of b.sections) {
    const times = sectionPeriodTimes(s.name, b.config, b.periods)
    const sd = b.classTT[s.name]?.[dayKey] ?? {}
    for (const p of b.periods) {
      const c = sd[p.id]
      if (!c?.subject || !(c.room ?? '').trim()) continue
      const t = times.get(p.id)
      if (t) out.push({ room: c.room.trim(), startMin: t.startMin, endMin: t.endMin, section: s.name, periodName: p.name ?? p.id })
    }
  }
  return out
}

/**
 * Aggregate "today" across every active schedule: sums/unions of the
 * per-schedule summaries, PLUS venue clashes BETWEEN schedules — the same
 * venue occupied by two schedules at overlapping wall-clock times, which no
 * single-schedule check can see.
 */
export function computeMultiToday(
  bundles: ScheduleBundle[], leaves: CalLeave[], conflicts: number, date: Date,
  plans: Record<string, any> = {},
): MultiToday {
  const parts = bundles.map(b => computeTodaySummary({
    periods: b.periods, sections: b.sections, classTT: b.classTT, config: b.config,
    substitutions: b.substitutions, leaves, conflicts: 0, date,
    orDecisions: b.orDecisions, plans,
  }))

  const merged: MultiToday = {
    dayKey: parts[0]?.dayKey ?? '', isWorkDay: parts.some(p => p.isWorkDay),
    periodRows: parts[0]?.periodRows ?? [],
    periodsToday: parts.reduce((a, p) => a + p.periodsToday, 0),
    teachersOnLeave: [...new Set(parts.flatMap(p => p.teachersOnLeave))],
    uncoveredSlots: parts.flatMap(p => p.uncoveredSlots).sort((a, b) => a.startMin - b.startMin),
    coveredSlots: parts.flatMap(p => p.coveredSlots).sort((a, b) => a.startMin - b.startMin),
    roomClashes: parts.flatMap(p => p.roomClashes),
    conflicts,
    scheduleCount: bundles.length,
    classes: new Set(bundles.flatMap(b => b.sections.map((s: any) => s.name))).size,
    teachers: new Set(bundles.flatMap(b => b.staff.map((s: any) => s.name))).size,
    venues: new Set([
      ...bundles.flatMap(b => b.rooms.map((r: any) => r.actualName || r.generatedName || r.name).filter(Boolean)),
      ...bundles.flatMap(b => venueIntervals(b, parts[0]?.dayKey ?? '').map(v => v.room)),
    ]).size,
  }

  // Cross-schedule venue clashes on the wall-clock axis.
  if (merged.isWorkDay && bundles.length > 1) {
    const dayKey = merged.dayKey
    const seen = new Set(merged.roomClashes.map(c => `${c.room}|${c.periodId}`))
    for (let i = 0; i < bundles.length; i++) {
      for (let j = i + 1; j < bundles.length; j++) {
        const A = venueIntervals(bundles[i], dayKey)
        const B = venueIntervals(bundles[j], dayKey)
        for (const a of A) for (const bIv of B) {
          if (a.room !== bIv.room) continue
          if (a.startMin < bIv.endMin && bIv.startMin < a.endMin) {
            const key = `${a.room}|x|${a.startMin}|${bIv.startMin}`
            if (seen.has(key)) continue
            seen.add(key)
            const clash: RoomClash = {
              room: a.room, periodId: `x-${a.startMin}`,
              periodName: `${a.periodName} / ${bIv.periodName}`,
              startMin: Math.max(a.startMin, bIv.startMin),
              endMin: Math.min(a.endMin, bIv.endMin),
              sections: [`${a.section} (${bundles[i].name})`, `${bIv.section} (${bundles[j].name})`],
            }
            merged.roomClashes.push(clash)
          }
        }
      }
    }
    merged.roomClashes.sort((a, b) => a.startMin - b.startMin)
  }

  return merged
}
