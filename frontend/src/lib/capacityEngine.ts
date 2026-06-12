/**
 * Capacity Engine — schedU Doc Part 1, Step 1.
 *
 * Computes the maximum usable weekly teaching capacity for a class
 * group from the bell schedule. This is the hard ceiling that every
 * section's allocation total must respect:
 *
 *     ∑ subject_periods_per_week  ≤  weekly_capacity
 *
 * Formula:
 *   weeklyCapacity = workingDays × teachingPeriodsPerDay
 *
 * Where teaching periods = total periods minus breaks/lunch/assembly/
 * dispersal/fixed-end. Optional per-grade-group overrides are
 * supported via `groupCapacityOverrides` so primary vs senior can
 * have different effective ceilings.
 */

import type { Period } from '@/types'

export interface CapacitySummary {
  workingDays: number
  totalPeriodsPerDay: number
  breakPeriodsPerDay: number
  teachingPeriodsPerDay: number
  weeklyCapacity: number
  /** human-readable breakdown */
  breakdown: string
}

/** Determine which periods count as teaching slots. */
export function isTeachingPeriod(p: Period): boolean {
  if (!p.type) return true
  return p.type === 'class'
}

/** Compute weekly teaching capacity from work days + bell schedule. */
export function computeCapacity(
  workDays: string[],
  periods: Period[],
): CapacitySummary {
  const days = workDays?.length ?? 0
  const total = periods?.length ?? 0
  const teaching = (periods ?? []).filter(isTeachingPeriod).length
  const breaks = total - teaching
  const weekly = days * teaching

  return {
    workingDays: days,
    totalPeriodsPerDay: total,
    breakPeriodsPerDay: breaks,
    teachingPeriodsPerDay: teaching,
    weeklyCapacity: weekly,
    breakdown: `${days} days × ${teaching} teaching periods = ${weekly}/week (− ${breaks} break per day)`,
  }
}

/** Per-grade-group capacity overrides (Pre-primary may have different
 *  effective bell schedule than Senior Secondary). Defaults to
 *  computeCapacity result; pass overrides only when a band differs. */
export interface GroupCapacityOverride {
  groupKey: string                 // 'pre' | 'primary' | 'middle' | 'secondary' | 'senior'
  weeklyCapacity: number
}

export function capacityForSection(
  globalCapacity: CapacitySummary,
  bandKey: string | undefined,
  overrides?: GroupCapacityOverride[],
): number {
  if (bandKey && overrides) {
    const o = overrides.find(x => x.groupKey === bandKey)
    if (o) return o.weeklyCapacity
  }
  return globalCapacity.weeklyCapacity
}

/** Map a section name to its grade-group key using a basic heuristic.
 *  Used when the section doesn't carry an explicit `gradeGroup` field. */
export function inferBandFromSection(sectionName: string): string {
  const u = (sectionName ?? '').toUpperCase()
  if (/(NURSERY|LKG|UKG|PRE|KG)/.test(u)) return 'pre'
  if (/^(I|II|III|IV|V)[-\s]/.test(u))     return 'primary'
  if (/^(VI|VII|VIII)[-\s]/.test(u))       return 'middle'
  if (/^(IX|X)[-\s]/.test(u))              return 'secondary'
  if (/^(XI|XII)[-\s]/.test(u))            return 'senior'
  return 'primary'
}

// ── Bell-true per-section capacity ───────────────────────────────────────────
// config.bellSchedules (persisted by the Shift & Timing step) carries the
// EXACT generated rows per generation unit — including per-group early
// dispersal, so a Regular-mode Nursery with 3 periods/day caps at 15/week
// while Seniors cap at 40. Prefer this over the band heuristic whenever the
// bell data covers the section.

export type BellScheduleLite = {
  startTime?: string
  rows: Array<{ type: string; duration?: number; classes?: string[] }>
}

/** Class key from a section name — "Nursery-A" → 'nur', "XI-Sci-B" → 'xi'. */
function sectionClassKey(sectionName: string): string {
  const norm = sectionName.toLowerCase().replace(/[\s-]/g, '')
  if (norm.startsWith('nur')) return 'nur'
  if (norm.startsWith('lkg')) return 'lkg'
  if (norm.startsWith('ukg')) return 'ukg'
  return sectionName.split(/[\s-]/)[0].toLowerCase()
}

/** Teaching periods/day a section actually has per the bell (null = unknown). */
export function bellTeachingCount(
  sectionName: string,
  bellSchedules: BellScheduleLite[] | undefined,
): number | null {
  if (!bellSchedules?.length) return null
  const key = sectionClassKey(sectionName)
  for (const bs of bellSchedules) {
    if (!bs.rows?.some(r => r.type === 'teaching' && (r.classes ?? []).includes(key))) continue
    return bs.rows.filter(r =>
      r.type === 'teaching' && (!(r.classes ?? []).length || r.classes!.includes(key))).length
  }
  return null
}

/** Bell-true weekly capacity for a section (null when bell data is absent). */
export function bellWeeklyCapacity(
  sectionName: string,
  bellSchedules: BellScheduleLite[] | undefined,
  workDayCount: number,
): number | null {
  const c = bellTeachingCount(sectionName, bellSchedules)
  return c == null ? null : c * workDayCount
}

/** Capacity utilisation percentage (0-100). */
export function utilisationPct(allocated: number, capacity: number): number {
  if (capacity <= 0) return 0
  return Math.round((allocated / capacity) * 100)
}

/** Status colour band for a capacity utilisation value. */
export function utilisationStatus(allocated: number, capacity: number):
  'empty' | 'light' | 'ok' | 'tight' | 'over'
{
  if (allocated <= 0) return 'empty'
  const pct = utilisationPct(allocated, capacity)
  if (pct > 100) return 'over'
  if (pct >= 95) return 'tight'
  if (pct >= 60) return 'ok'
  return 'light'
}
