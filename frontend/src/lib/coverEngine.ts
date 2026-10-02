/**
 * WHO COVERS WHOM - one engine for every place cover is arranged.
 *
 * This lived inside the Calendar page, as closures over its state, so nothing
 * else could use it: the timetable page grew its own simpler copy, and
 * automatic cover (a teacher reporting themselves unavailable from their phone,
 * covered without anybody opening the Calendar) had nothing to call. Two
 * copies of a rule drift, and these had: the page copy piled every cover onto
 * the least-busy teacher, and both read only a lesson's first teacher.
 *
 * Pure: give it the schedules, the date, the settings and who is away; it
 * returns rankings and plans. Writing the result is the caller's business.
 *
 * Rules, all enforced here so no caller can forget one:
 *  - a slot is the absent teacher's if they teach ANY group of it that day
 *    (an OR period runs one subject; a teacher whose option is not running
 *    is neither missing nor busy);
 *  - nobody who is themselves away is offered;
 *  - nobody already teaching or covering at that wall-clock time, in ANY
 *    active schedule;
 *  - per-teacher can-sub, daily/weekly cover caps, and the cover-day ceiling;
 *  - automatic cover spreads: covers handed out in the same run count.
 */
import type { ScheduleBundle } from './activeSchedules'
import { schedulePeriodTimes } from './bellTimes'
import { subKey } from './substitutionKeys'
import { cellHasTeacherOnDate, teachingPairsOnDate } from './orChoice'
import { teachingSuspendedOn, type SchoolEvent } from './schoolEvents'
import { leaveCoversDate, type CalLeave } from './leaveUtils'
import {
  overrideFor, effectiveMaxPerDay, effectiveMaxPerWeek, scoreCandidate,
  type SubstitutionSettings, type MatchTier,
} from './substitutionSettings'

export interface CoverContext {
  bundles: ScheduleBundle[]
  isoDate: string
  /** Weekday key the timetable uses for this date, e.g. 'MONDAY'. */
  dayKey: string
  /** The date each weekday falls on in this date's week - weekly loads read
   *  that week's covers, not every week's. */
  dateOfWeekday: (day: string) => string
  settings: SubstitutionSettings
  /** Everyone who could cover, deduped by name across schedules. */
  staffPool: Array<{ id?: string; name: string }>
  events?: SchoolEvent[]
  plans?: Record<string, any>
  leaves?: CalLeave[]
}

export interface CoverSlot {
  sid: string; sname: string; section: string; periodId: string; periodName: string
  subject: string; startMin: number; endMin: number
}

export interface SubCandidate {
  name: string; staffId: string; tier: MatchTier
  todayReg: number; todaySub: number; weekLoad: number; streak: number; score: number
}

const DAYS = ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY']
/** 'MONDAY' for an ISO date, matching the timetable's day keys. */
export const dayKeyOfISO = (iso: string): string => DAYS[new Date(`${iso}T00:00:00`).getDay()]

/** Each weekday's date in the week containing `iso` (Sunday-start, as the
 *  Calendar counts it). */
export function weekDatesOf(iso: string): (day: string) => string {
  const base = new Date(`${iso}T00:00:00`)
  return (day: string) => {
    const idx = DAYS.findIndex(d => d.startsWith((day ?? '').toUpperCase().slice(0, 3)))
    if (idx < 0) return iso
    const d = new Date(base)
    d.setDate(d.getDate() - d.getDay() + idx)
    const p = (n: number) => String(n).padStart(2, '0')
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
  }
}

const wallTimesCache = new WeakMap<ScheduleBundle, Record<string, { s: number; e: number }>>()
function wallTimes(b: ScheduleBundle): Record<string, { s: number; e: number }> {
  let m = wallTimesCache.get(b)
  if (m) return m
  m = {}
  const mm = m
  schedulePeriodTimes(b.config, b.periods, b.sections).forEach((t, pid) => { mm[pid] = { s: t.startMin, e: t.endMin } })
  wallTimesCache.set(b, m)
  return m
}

/** Is this absence in force for a lesson at [startMin, endMin) on `iso`?
 *  A half day takes the half of THIS schedule's day the lesson falls in; a
 *  time window takes the lessons it overlaps. Older half-day records that do
 *  not say which half are treated as the whole day, as they always were. */
export function absenceCovers(l: CalLeave, iso: string, startMin: number, endMin: number, dayStart: number, dayEnd: number): boolean {
  if (!leaveCoversDate(l, iso)) return false
  if (l.duration === 'half' && l.part) {
    const mid = (dayStart + dayEnd) / 2
    return l.part === 'first' ? startMin < mid : startMin >= mid
  }
  if (l.duration === 'hours' && l.fromMin != null && l.toMin != null) {
    return startMin < l.toMin && l.fromMin < endMin
  }
  return true
}

export function makeCoverEngine(ctx: CoverContext) {
  const { bundles, isoDate, dayKey, settings } = ctx
  const multi = bundles.length > 1
  const plans = ctx.plans ?? {}
  const bundleById = (sid: string) => bundles.find(b => b.id === sid) ?? bundles[0]

  const dayBounds = (b: ScheduleBundle) => {
    const t = Object.values(wallTimes(b))
    if (!t.length) return { start: 0, end: 24 * 60 }
    return { start: Math.min(...t.map(x => x.s)), end: Math.max(...t.map(x => x.e)) }
  }

  /** Away at this lesson's time, by any absence on record. */
  const awayAt = (name: string, b: ScheduleBundle, startMin: number, endMin: number) => {
    const { start, end } = dayBounds(b)
    return (ctx.leaves ?? []).some(l => l.teacher === name && absenceCovers(l, isoDate, startMin, endMin, start, end))
  }

  /** The absent teacher's lessons on the date, across every schedule. With an
   *  absence passed, only the lessons it actually takes them out of. */
  const slotsOf = (teacher: string, absence?: CalLeave): CoverSlot[] => {
    const out: CoverSlot[] = []
    for (const b of bundles) {
      const times = wallTimes(b)
      const { start, end } = dayBounds(b)
      for (const s of b.sections) {
        // A class away on a trip or sitting exams has no lesson to cover.
        if (teachingSuspendedOn(ctx.events ?? [], isoDate, s.name)) continue
        const sd = b.classTT[s.name]?.[dayKey] ?? {}
        for (const p of b.periods) {
          const c = sd[p.id]
          if (!c?.subject) continue
          if (!cellHasTeacherOnDate(c, teacher, s.name, isoDate, p.id, b.orDecisions, plans)) continue
          const t = times[p.id] ?? { s: 0, e: 0 }
          if (absence && !absenceCovers(absence, isoDate, t.s, t.e, start, end)) continue
          // Their own subject in a parallel lesson, not the cell's label.
          const own = teachingPairsOnDate(c, s.name, isoDate, p.id, b.orDecisions, plans).find(x => x.teacher === teacher)
          out.push({
            sid: b.id, sname: b.name, section: s.name, periodId: p.id, periodName: p.name ?? p.id,
            subject: own?.subject || c.subject, startMin: t.s, endMin: t.e,
          })
        }
      }
    }
    return out.sort((a, b) => a.startMin - b.startMin)
  }

  /** Regular and cover periods a teacher has on a weekday of this week. */
  const loadOn = (teacher: string, day: string) => {
    let reg = 0, sub = 0
    const date = ctx.dateOfWeekday(day)
    for (const b of bundles) {
      for (const s of b.sections) {
        const sd = b.classTT[s.name]?.[day] ?? {}
        for (const p of b.periods) {
          const c = sd[p.id]
          if (!c?.subject) continue
          const covered = b.substitutions[subKey(s.name, date, p.id)]
          if (covered) { if (covered === teacher) sub++ }
          else if (cellHasTeacherOnDate(c, teacher, s.name, date, p.id, b.orDecisions, plans)) reg++
        }
      }
    }
    return { reg, sub }
  }

  /** Teaching or covering at this wall-clock time in a schedule other than
   *  `exceptId`. Bells differ between schedules; the clock does not. */
  const busyElsewhere = (name: string, startMin: number, endMin: number, exceptId: string) => {
    if (!multi) return false
    for (const b of bundles) {
      if (b.id === exceptId) continue
      const times = wallTimes(b)
      for (const s of b.sections) {
        const sd = b.classTT[s.name]?.[dayKey] ?? {}
        for (const pid of Object.keys(sd)) {
          const c = sd[pid]
          if (!c?.subject) continue
          const cover = b.substitutions[subKey(s.name, isoDate, pid)]
          const here = cover ? cover === name
            : cellHasTeacherOnDate(c, name, s.name, isoDate, pid, b.orDecisions, plans)
          if (!here) continue
          const t = times[pid]
          if (t && t.s < endMin && startMin < t.e) return true
        }
      }
    }
    return false
  }

  const workDaysOf = (b: ScheduleBundle): string[] =>
    b.config?.workDays?.length ? b.config.workDays : ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY']
  const allWorkDays = Array.from(new Set(bundles.flatMap(workDaysOf)))

  const matchTier = (b: ScheduleBundle, name: string, section: string, subject: string): MatchTier => {
    const wd = workDaysOf(b)
    const teaches = (c: any, subj?: string) => {
      const pairs = [...(c?.groupAssignments ?? []), ...(c?.options ?? [])]
      if (pairs.length) return pairs.some((g: any) => g.teacher === name && (!subj || g.subject === subj))
      return c?.teacher === name && (!subj || c?.subject === subj)
    }
    const inSection = (subj?: string) => wd.some(d => Object.values(b.classTT[section]?.[d] ?? {}).some(c => teaches(c, subj)))
    if (inSection(subject)) return 'exact'
    if (inSection()) return 'class'
    if (b.sections.some((s: any) => wd.some(d => Object.values(b.classTT[s.name]?.[d] ?? {}).some(c => teaches(c, subject))))) return 'subject'
    return 'none'
  }

  /** Ranked cover for one slot, best first. `extraToday` adds covers given
   *  earlier in the same run, which the saved state does not show yet. */
  const candidatesFor = (slot: Pick<CoverSlot, 'sid' | 'section' | 'periodId' | 'subject'>, absent: string, extraToday: Record<string, number> = {}): SubCandidate[] => {
    const b = bundleById(slot.sid)
    const times = wallTimes(b)
    const t = times[slot.periodId]
    const busy = new Set<string>()
    for (const s of b.sections) {
      const c = b.classTT[s.name]?.[dayKey]?.[slot.periodId]
      for (const p of teachingPairsOnDate(c, s.name, isoDate, slot.periodId, b.orDecisions, plans)) {
        if (p.teacher !== absent) busy.add(p.teacher)
      }
    }
    for (const [k, v] of Object.entries(b.substitutions)) {
      const [, d, pid] = k.split('|')
      if (d === isoDate && pid === slot.periodId) busy.add(v)
    }
    const order = b.periods.filter((p: any) => p.type !== 'break' && p.type !== 'lunch')
    const pIdx = order.findIndex((p: any) => p.id === slot.periodId)
    const teachesAt = (name: string, pid?: string) => !!pid && b.sections.some((s: any) => {
      const cov = b.substitutions[subKey(s.name, isoDate, pid)]
      return cov ? cov === name : cellHasTeacherOnDate(b.classTT[s.name]?.[dayKey]?.[pid], name, s.name, isoDate, pid, b.orDecisions, plans)
    })

    return ctx.staffPool
      .filter(st => st.name !== absent && !busy.has(st.name))
      .filter(st => !t || !awayAt(st.name, b, t.s, t.e))
      .filter(st => !t || !busyElsewhere(st.name, t.s, t.e, slot.sid))
      .filter(st => {
        const id = st.id ?? st.name
        if (!overrideFor(settings, id).canSub) return false
        const today = loadOn(st.name, dayKey)
        const extra = extraToday[st.name] ?? 0
        if (today.reg + today.sub + extra >= settings.defaults.maxPeriodsPerDay) return false
        if (today.sub + extra >= effectiveMaxPerDay(settings, id)) return false
        const weekSubs = allWorkDays.reduce((a, d) => a + loadOn(st.name, d).sub, 0) + extra
        if (weekSubs >= effectiveMaxPerWeek(settings, id)) return false
        return true
      })
      .map(st => {
        const id = st.id ?? st.name
        const tier = matchTier(b, st.name, slot.section, slot.subject)
        const today = loadOn(st.name, dayKey)
        const extra = extraToday[st.name] ?? 0
        const weekLoad = allWorkDays.reduce((a, d) => { const l = loadOn(st.name, d); return a + l.reg + l.sub }, 0) + extra
        const weekSubs = allWorkDays.reduce((a, d) => a + loadOn(st.name, d).sub, 0) + extra
        let streak = 1
        for (let i = pIdx - 1; i >= 0; i--) { if (teachesAt(st.name, order[i]?.id)) streak++; else break }
        for (let i = pIdx + 1; i < order.length; i++) { if (teachesAt(st.name, order[i]?.id)) streak++; else break }
        const score = scoreCandidate(settings.weights, {
          tier, todayLoad: today.reg + today.sub + extra, weekLoad, todaySubs: today.sub + extra, weekSubs,
        })
        return { name: st.name, staffId: id, tier, todayReg: today.reg, todaySub: today.sub + extra, weekLoad, streak, score }
      })
      .sort((a, b2) => settings.defaults.autoSuggestionsEnabled ? b2.score - a.score : a.name.localeCompare(b2.name))
  }

  /**
   * Cover for every uncovered lesson an absence takes the teacher out of.
   * Only faculty marked for automatic assignment are used, covers given in
   * this run count against everyone's limits, and nobody is put in two
   * places at one clock time. What cannot be covered is returned, not hidden.
   */
  const planAutoCover = (teacher: string, absence?: CalLeave) => {
    const bySid: Record<string, Record<string, string>> = {}
    const assigned: Array<CoverSlot & { substitute: string }> = []
    const uncovered: CoverSlot[] = []
    const given: Record<string, number> = {}
    const usedAt: Record<string, Set<string>> = {}
    for (const slot of slotsOf(teacher, absence)) {
      const map = (bySid[slot.sid] ??= { ...bundleById(slot.sid).substitutions })
      const key = subKey(slot.section, isoDate, slot.periodId)
      if (map[key]) continue
      const clock = `${slot.startMin}`
      const best = candidatesFor(slot, teacher, given)
        .filter(c => overrideFor(settings, c.staffId).autoAssign)
        .filter(c => !usedAt[clock]?.has(c.name))
        // Fewest covers this run first; the ranking decides within that.
        .sort((a, b2) => (given[a.name] ?? 0) - (given[b2.name] ?? 0))[0]
      if (!best) { uncovered.push(slot); continue }
      map[key] = best.name
      given[best.name] = (given[best.name] ?? 0) + 1
      ;(usedAt[clock] ??= new Set()).add(best.name)
      assigned.push({ ...slot, substitute: best.name })
    }
    return { bySid, assigned, uncovered }
  }

  return { slotsOf, candidatesFor, planAutoCover, loadOn, busyElsewhere, matchTier }
}
