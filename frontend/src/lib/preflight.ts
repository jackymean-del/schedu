/**
 * The generate step's briefing: what WILL be generated, judged before the
 * click. Pure, so preflight-verify.mts can hold it to account.
 *
 * It used to live inside the page, counting each class's periods with a
 * helper that only knows about classes leaving early. For a full-day class
 * that helper says "unknown", and the briefing skipped unknown classes, so in
 * the commonest school there is (everyone stays all day) it counted nothing:
 * 0 lessons a week, no capacity check, no staffing alert, no hours check, and
 * a green "Every class fits its weekly capacity - ready to generate".
 */
import { parseAllocation } from './allocationSyntax'
import { sectionKey, teachingPeriodsFor } from './generationPipeline'
import { weeklyTargets } from './schedulingEngine'
import { ungroupedElectives, describeUngrouped } from './electiveGroups'
import {
  bandForSection, checkBellCompliance, computeTeacherRequirement, type GradeBand,
} from './educationNorms'

export interface PreflightInput {
  config: any
  sections: Array<{ name: string }>
  subjects: Array<{ name: string; periodsPerWeek?: number }>
  subjectAllocations?: Record<string, Record<string, string>>
  teacherAllocations?: Record<string, Record<string, Record<string, number | string>>>
  staff: Array<{ name: string }>
  /** AND groups from Groups & Combos, to find electives outside every group. */
  andComboGroups?: any[]
}

export interface TeacherGap { periods: number; classes: string[] }

export interface Preflight {
  /** `end` is when lessons end; `home` is when the day ends, after any
   *  dispersal row. Only set when the two differ. */
  shapes: Array<{ label: string; count: number; end: string; home?: string; nSecs: number }>
  totalWeekly: number
  doubleSubjects: number
  parallelGroups: number
  dayOffRules: number
  overCap: string[]
  /** Classes with no Mapping row. `noRowEmpty` says whether they come out
   *  empty (no subject has a default) or fall back to subject defaults. */
  unallocated: string[]
  noRowEmpty: boolean
  /** Periods the Mapping step asks for that the teacher allocation covers
   *  only partly: the rest cannot be placed and goes to the Bench. */
  shortOfTeachers: TeacherGap
  /** Periods with no teacher allocated at all, in a school that does use the
   *  teacher allocation: the engine picks a teacher from subject lists. */
  noTeacherChosen: TeacherGap
  /** Subjects asked for more lessons a week than the class has days, so
   *  some day must carry two. Everything else is taught once a day; this is
   *  the briefing saying where that rule has to bend, before the click. */
  twiceADay: Array<{ subject: string; classes: string[] }>
  /** "X-A, X-B: Hindi, Odia" - electives no AND group covers, which the
   *  timetable will give to the whole class. */
  ungroupedElectives: string[]
  staffing: ReturnType<typeof computeTeacherRequirement> | null
  bellChecks: Array<ReturnType<typeof checkBellCompliance>>
}

export function buildPreflight(i: PreflightInput, extra: { parallelGroups: number }): Preflight | null {
  const { config, sections } = i
  const bellSchedules = config?.bellSchedules as Array<{ startTime: string; rows: any[] }> | undefined
  if (!bellSchedules?.length || !sections.length) return null
  const subjectAllocations = i.subjectAllocations ?? {}
  const targets = weeklyTargets(sections, i.subjects, subjectAllocations)
  const workDayCount = config.workDays?.length || 5
  const toMin = (s: string) => { const [h, m] = (s || '08:00').split(':').map(Number); return h * 60 + m }
  const fmt = (m: number) => `${(Math.floor(m / 60) % 12) || 12}:${String(m % 60).padStart(2, '0')} ${Math.floor(m / 60) >= 12 ? 'PM' : 'AM'}`

  type Bucket = { count: number; endMin: number; homeMin: number; secs: string[] }
  const buckets = new Map<string, Bucket>()
  const overCap: string[] = []
  const unallocated: string[] = []
  const twiceADay: Preflight['twiceADay'] = []
  let noRowEmpty = true
  let totalWeekly = 0, doubleSubjects = 0
  const bandWeeklyMins = new Map<GradeBand, number>()

  for (const sec of sections) {
    let count: number | null = null, endMin = 0, homeMin = 0, teachMins = 0
    for (const bs of bellSchedules) {
      const c = teachingPeriodsFor(sec.name, bs.rows)
      if (c == null) continue
      count = c
      const key = sectionKey(sec.name)
      endMin = toMin(bs.startTime) + bs.rows
        .filter((r: any) => r.type !== 'dispersal' && (!(r.classes ?? []).length || r.classes.includes(key)))
        .reduce((s: number, r: any) => s + r.duration, 0)
      homeMin = toMin(bs.startTime) + bs.rows
        .filter((r: any) => !(r.classes ?? []).length || r.classes.includes(key))
        .reduce((s: number, r: any) => s + r.duration, 0)
      teachMins = bs.rows
        .filter((r: any) => r.type === 'teaching' && (!(r.classes ?? []).length || r.classes.includes(key)))
        .reduce((s: number, r: any) => s + r.duration, 0)
      break
    }
    if (count == null) continue
    const band = bandForSection(sec.name)
    const weekly = teachMins * workDayCount
    if (weekly > 0 && (!bandWeeklyMins.has(band) || weekly < bandWeeklyMins.get(band)!)) {
      bandWeeklyMins.set(band, weekly)
    }
    const bk = `${count}@${endMin}@${homeMin}`
    if (!buckets.has(bk)) buckets.set(bk, { count, endMin, homeMin, secs: [] })
    buckets.get(bk)!.secs.push(sec.name)

    // What the engine will actually try to place here - its own targets.
    const used = Object.values(targets[sec.name] ?? {}).reduce((a, n) => a + n, 0)
    const row = subjectAllocations[sec.name] ?? {}
    for (const raw of Object.values(row)) {
      const p = parseAllocation(raw)
      if (p.valid && p.doublePeriods > 0) doubleSubjects++
    }
    totalWeekly += used
    if (Object.keys(row).length === 0) {
      unallocated.push(sec.name)
      if (used > 0) noRowEmpty = false
    }
    if (used > count * workDayCount) overCap.push(sec.name)
    for (const [sub, target] of Object.entries(targets[sec.name] ?? {})) {
      // A double period is one lesson, so count lessons, not periods.
      const p = parseAllocation(row[sub] ?? '')
      const lessons = p.valid && p.doublePeriods > 0 ? Math.ceil(target / Math.max(1, p.doubleSpan)) : target
      if (lessons <= workDayCount) continue
      const hit = twiceADay.find(t => t.subject === sub) ?? (twiceADay.push({ subject: sub, classes: [] }), twiceADay[twiceADay.length - 1])
      hit.classes.push(sec.name)
    }
  }

  // ── Who teaches it ──
  const onStaff = new Set(i.staff.map(s => s.name))
  const allocated = (secName: string, subName: string) => {
    let n = 0
    for (const [t, secs] of Object.entries(i.teacherAllocations ?? {})) {
      if (!onStaff.has(t)) continue
      const v = Math.floor(Number(secs?.[secName]?.[subName] ?? 0))
      if (v > 0) n += v
    }
    return n
  }
  const usesTeacherMatrix = Object.entries(i.teacherAllocations ?? {}).some(([t, secs]) =>
    onStaff.has(t) && Object.values(secs ?? {}).some(subs =>
      Object.values(subs ?? {}).some(v => Number(v) > 0)))
  const shortOfTeachers: TeacherGap = { periods: 0, classes: [] }
  const noTeacherChosen: TeacherGap = { periods: 0, classes: [] }
  if (usesTeacherMatrix) {
    for (const sec of sections) {
      for (const [sub, target] of Object.entries(targets[sec.name] ?? {})) {
        if (target <= 0) continue
        const have = allocated(sec.name, sub)
        if (have === 0) {
          noTeacherChosen.periods += target
          if (!noTeacherChosen.classes.includes(sec.name)) noTeacherChosen.classes.push(sec.name)
        } else if (have < target) {
          shortOfTeachers.periods += target - have
          if (!shortOfTeachers.classes.includes(sec.name)) shortOfTeachers.classes.push(sec.name)
        }
      }
    }
  }

  const gradeLabel = (secs: string[]) => {
    const grades = [...new Set(secs.map(s => {
      const parts = s.split(/[-\s]+/)
      const last = parts[parts.length - 1]
      return (parts.length > 1 && (/^[A-Za-z]$/.test(last) || /^\d{1,2}$/.test(last))) ? parts.slice(0, -1).join('-') : s
    }))]
    return grades.length <= 4 ? grades.join(', ') : `${grades.slice(0, 3).join(', ')} +${grades.length - 3}`
  }
  const shapes = [...buckets.values()]
    .sort((a, b) => a.endMin - b.endMin)
    .map(b => ({
      label: gradeLabel(b.secs), count: b.count, end: fmt(b.endMin),
      home: b.homeMin > b.endMin ? fmt(b.homeMin) : undefined, nSecs: b.secs.length,
    }))

  // ── National-norms brain: staffing requirement + bell compliance ──
  const country = config.countryCode || 'IN'
  const board = config.board || config.boardName
  const staffing = totalWeekly > 0 ? computeTeacherRequirement(totalWeekly, i.staff.length, country) : null
  const bellChecks = [...bandWeeklyMins.entries()]
    .map(([band, mins]) => checkBellCompliance(country, board, band, mins))
    .filter(c => c.status !== 'ok')

  return {
    shapes, totalWeekly, doubleSubjects,
    parallelGroups: extra.parallelGroups,
    dayOffRules: (config.dayOffRules ?? []).length,
    overCap, unallocated, noRowEmpty: unallocated.length > 0 && noRowEmpty,
    shortOfTeachers, noTeacherChosen, twiceADay, staffing, bellChecks,
    ungroupedElectives: describeUngrouped(ungroupedElectives(i.subjects as any[], i.andComboGroups ?? [])),
  }
}
