/**
 * Reports & Analytics — derived entirely from data we already keep, no new
 * logging layer. Every leave record is dated, so from a leave we can look up
 * the absent teacher's periods that day and check the substitution map to
 * learn, per date: which periods were covered (a substitute) and which were
 * not (a cancelled lesson). Trends, leave-type splits, and faculty/class
 * summaries all fall out of that same expansion.
 */
import { type CalLeave, leaveCoversDate } from './leaveUtils'
import { DAY_KEY, toISODate } from './scheduleToday'

export interface DateRange { start: string; end: string }   // inclusive ISO dates

export interface AffectedEvent {
  date: string; day: string; periodId: string; periodName: string
  startMin: number; endMin: number
  subject: string; section: string; faculty: string
  substitute?: string; reason?: string   // substitute set → covered; else cancelled
}

export interface FacultyStat { name: string; leaveDays: number; periodsMissed: number; periodsCovered: number; periodsAsSub: number }
export interface ClassStat { name: string; affected: number; covered: number; cancelled: number }
export interface TrendPoint { date: string; leaves: number; substitutes: number }

export interface ReportsData {
  range: DateRange
  totals: { leaves: number; substitutes: number; cancelled: number; leaveDays: number; facultyOnLeave: number }
  events: AffectedEvent[]           // every affected period in range
  covered: AffectedEvent[]
  cancelled: AffectedEvent[]
  trends: TrendPoint[]
  leaveTypes: { type: string; count: number }[]
  facultyStats: FacultyStat[]
  classStats: ClassStat[]
  mostAffectedFaculty?: { name: string; count: number }
  mostAffectedClass?: { name: string; count: number }
  topReason?: { reason: string; count: number }
}

// ── date helpers ───────────────────────────────────────────────
export function addDays(iso: string, n: number): string {
  const d = new Date(iso + 'T00:00:00'); d.setDate(d.getDate() + n); return toISODate(d)
}
function eachDate(range: DateRange): string[] {
  const out: string[] = []
  let cur = range.start
  let guard = 0
  while (cur <= range.end && guard++ < 800) { out.push(cur); cur = addDays(cur, 1) }
  return out
}
export function rangeFor(preset: string, today = new Date()): DateRange {
  const iso = toISODate(today)
  const dow = today.getDay()                    // 0=Sun
  const monOffset = (dow + 6) % 7               // days since Monday
  switch (preset) {
    case 'today':      return { start: iso, end: iso }
    case 'week':       return { start: addDays(iso, -monOffset), end: iso }
    case 'month':      return { start: `${iso.slice(0, 7)}-01`, end: iso }
    case 'lastMonth': {
      const first = new Date(today.getFullYear(), today.getMonth() - 1, 1)
      const last = new Date(today.getFullYear(), today.getMonth(), 0)
      return { start: toISODate(first), end: toISODate(last) }
    }
    case '3months':    return { start: addDays(iso, -90), end: iso }
    default:           return { start: `${iso.slice(0, 7)}-01`, end: iso }
  }
}

/** One schedule's data — Reports expands leaves against every source, so
 *  multiple active schedules aggregate while leaves are counted once. */
export interface ReportSource {
  sections: any[]; periods: any[]; classTT: Record<string, any>
  substitutions: Record<string, string>; config: any
}

export function computeReports(params: {
  leaves: CalLeave[]
  range: DateRange
  /** Preferred: aggregate across all active schedules. */
  sources?: ReportSource[]
  /** Legacy single-schedule shape (kept for existing callers). */
  classTT?: Record<string, any>
  substitutions?: Record<string, string>
  periods?: any[]
  sections?: any[]
  config?: any
}): ReportsData {
  const { leaves, range } = params
  const sources: ReportSource[] = params.sources ?? [{
    sections: params.sections ?? [], periods: params.periods ?? [],
    classTT: params.classTT ?? {}, substitutions: params.substitutions ?? {},
    config: params.config ?? {},
  }]

  // Per-source period → wall-clock minutes (each schedule has its own bell).
  const srcTimes = sources.map(src => {
    const [sh = 9, sm = 0] = (src.config?.startTime ?? '09:00').split(':').map(Number)
    const map: Record<string, { startMin: number; endMin: number; name: string }> = {}
    let mins = sh * 60 + sm
    for (const p of src.periods) {
      map[p.id] = { startMin: mins, endMin: mins + (p.duration ?? 45), name: p.name ?? p.id }
      mins += p.duration ?? 45
    }
    return map
  })

  const dates = eachDate(range)

  // Leave records touching the range — counted ONCE (schedule-independent).
  const rangedLeaves = leaves.filter(l => dates.some(d => leaveCoversDate(l, d)))
  const leaveTypeMap = new Map<string, number>()
  const facultyOnLeave = new Set<string>()
  let leaveDays = 0
  for (const l of rangedLeaves) {
    facultyOnLeave.add(l.teacher)
    leaveTypeMap.set(l.type, (leaveTypeMap.get(l.type) ?? 0) + 1)
    const days = dates.filter(d => leaveCoversDate(l, d)).length
    leaveDays += l.duration === 'half' ? days * 0.5 : days
  }

  // Expand every leave into the periods it affects, per date, ACROSS all
  // sources — a leave hits whichever schedule the teacher actually teaches in.
  const events: AffectedEvent[] = []
  for (const l of rangedLeaves) {
    for (const date of dates) {
      if (!leaveCoversDate(l, date)) continue
      const dayKey = DAY_KEY[new Date(date + 'T00:00:00').getDay()]
      sources.forEach((src, si) => {
        const times = srcTimes[si]
        for (const s of src.sections) {
          const sd = src.classTT[s.name]?.[dayKey] ?? {}
          for (const p of src.periods) {
            const c = sd[p.id]
            if (!c?.subject || c.teacher !== l.teacher) continue
            const sub = src.substitutions[`${s.name}|${dayKey}|${p.id}`]
            const t = times[p.id] ?? { startMin: 0, endMin: 0, name: p.id }
            events.push({
              date, day: dayKey, periodId: p.id, periodName: t.name,
              startMin: t.startMin, endMin: t.endMin,
              subject: c.subject, section: s.name, faculty: l.teacher,
              substitute: sub || undefined, reason: sub ? undefined : (l.reason || 'no subs available'),
            })
          }
        }
      })
    }
  }
  const covered = events.filter(e => e.substitute)
  const cancelled = events.filter(e => !e.substitute)

  // Trends — leaves + substitutes per date across the range.
  const trends: TrendPoint[] = dates.map(date => ({
    date,
    leaves: rangedLeaves.filter(l => leaveCoversDate(l, date)).length,
    substitutes: covered.filter(e => e.date === date).length,
  }))

  // Faculty stats — leave days + coverage taken on for others.
  const facMap = new Map<string, FacultyStat>()
  const fac = (name: string) => {
    if (!facMap.has(name)) facMap.set(name, { name, leaveDays: 0, periodsMissed: 0, periodsCovered: 0, periodsAsSub: 0 })
    return facMap.get(name)!
  }
  for (const l of rangedLeaves) {
    const days = dates.filter(d => leaveCoversDate(l, d)).length
    fac(l.teacher).leaveDays += l.duration === 'half' ? days * 0.5 : days
  }
  for (const e of events) {
    const f = fac(e.faculty)
    f.periodsMissed++
    if (e.substitute) { f.periodsCovered++; fac(e.substitute).periodsAsSub++ }
  }

  // Class stats.
  const clsMap = new Map<string, ClassStat>()
  for (const e of events) {
    if (!clsMap.has(e.section)) clsMap.set(e.section, { name: e.section, affected: 0, covered: 0, cancelled: 0 })
    const c = clsMap.get(e.section)!
    c.affected++; if (e.substitute) c.covered++; else c.cancelled++
  }

  const topBy = <T,>(list: T[], key: (t: T) => string): { name: string; count: number } | undefined => {
    const m = new Map<string, number>()
    for (const t of list) m.set(key(t), (m.get(key(t)) ?? 0) + 1)
    let best: { name: string; count: number } | undefined
    for (const [name, count] of m) if (!best || count > best.count) best = { name, count }
    return best
  }

  const reasonTop = topBy(cancelled, e => e.reason ?? 'unknown')

  return {
    range,
    totals: {
      leaves: rangedLeaves.length, substitutes: covered.length, cancelled: cancelled.length,
      leaveDays, facultyOnLeave: facultyOnLeave.size,
    },
    events, covered, cancelled, trends,
    leaveTypes: [...leaveTypeMap.entries()].map(([type, count]) => ({ type, count })).sort((a, b) => b.count - a.count),
    facultyStats: [...facMap.values()].sort((a, b) => b.periodsMissed - a.periodsMissed || b.periodsAsSub - a.periodsAsSub),
    classStats: [...clsMap.values()].sort((a, b) => b.affected - a.affected),
    mostAffectedFaculty: topBy(events, e => e.faculty),
    mostAffectedClass: topBy(events, e => e.section),
    topReason: reasonTop ? { reason: reasonTop.name, count: reasonTop.count } : undefined,
  }
}
