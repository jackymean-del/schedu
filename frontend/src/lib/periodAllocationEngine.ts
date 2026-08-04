/**
 * Period Allocation Engine — the master document's "STEP 6".
 *
 *   "System automatically generates: Subject | Weekly Periods … based on
 *    CBSE norms, working days, period duration, academic hours."
 *
 * Inputs are the four things the school has already told us — board, working
 * days, period duration, and the student hours/week norm from Step 0 — plus the
 * subject→class assignment made in Resources. The OUTPUT is weekly periods per
 * subject per section. Nobody types those.
 *
 * Why this file exists
 * --------------------
 * The app had the derivation backwards. `suggestSlotsPerWeek` (the board
 * knowledge base) was used to PREFILL editable boxes on the Resources page, and
 * Mapping then read whatever was in those boxes and merely trimmed it to fit the
 * bell. So the numbers started plausible and then went stale: change the working
 * days or the period length and nothing re-derived, because the typed value had
 * become the source of truth.
 *
 * Here the norm is the source of truth and the admin's override is an explicit
 * exception on top — which is the order Blueprint v6 asks for (Step 0's figure
 * "becomes the seed input to the allocation engine used in Step 5", and Step 5
 * is where load is edited).
 */
import { suggestSlotsPerWeek, getGrade, getGradeGroup, normalizeBoardType, type CurriculumBoard } from '@/components/resources/curriculum'

export interface AllocationInput {
  /** Section names to allocate for. */
  sections: string[]
  /** Subjects, with the class assignment made in Resources. */
  subjects: Array<{
    name: string
    periodsPerWeek?: number
    requiresLab?: boolean
    sections?: string[]
    classConfigs?: Array<{ sectionName: string; periodsPerWeek?: number; requiresLab?: boolean }>
  }>
  board?: string
  /** Teaching periods available per week for a section, from the bell schedule. */
  capacityFor: (section: string) => number
  /**
   * Student instructional hours/week for a section (country norm or the admin's
   * custom override). Optional: without it the bell's capacity is the only cap.
   */
  studentHoursWeekFor?: (section: string) => number | undefined
  periodMinutes: number
}

export interface SubjectSlots {
  subject: string
  /** What the board norm asks for. */
  ideal: number
  /** What fits, after scaling to the available/target periods. */
  slots: number
  requiresLab: boolean
  /** True when an explicit override on the plan replaced the derived figure. */
  overridden: boolean
}

export interface SectionAllocation {
  section: string
  rows: SubjectSlots[]
  /** Periods the bell offers this section per week. */
  capacity: number
  /** Periods the student-hours norm implies (undefined when no norm applies). */
  normPeriods?: number
  /** The cap actually used — the lower of capacity and the norm. */
  target: number
  /** Sum of the board's ideal figures before scaling. */
  totalIdeal: number
  /** Sum after scaling — never above target. */
  totalSlots: number
  /** True when the curriculum asked for more than the timetable can hold. */
  scaled: boolean
}

/** Periods that fit into a weekly hours figure at this period length. */
export function periodsForHours(hoursPerWeek: number, periodMinutes: number): number {
  if (!(hoursPerWeek > 0) || !(periodMinutes > 0)) return 0
  return Math.floor((hoursPerWeek * 60) / periodMinutes)
}

/** Subjects Resources has assigned to a section. */
function subjectsForSection(input: AllocationInput, section: string) {
  return input.subjects.filter(s => {
    if (s.classConfigs?.length) return s.classConfigs.some(c => c.sectionName === section)
    return (s.sections ?? []).includes(section)
  })
}

/**
 * Scale a set of ideal figures down to `target`, keeping their relative weight
 * and giving every subject at least one period.
 *
 * Largest-remainder rather than naive rounding: rounding each share
 * independently loses or invents periods, and a timetable that claims 31 periods
 * in a 30-period week is worse than one that admits the squeeze.
 */
export function scaleToTarget(ideal: number[], target: number): number[] {
  const n = ideal.length
  if (n === 0) return []
  const total = ideal.reduce((a, b) => a + b, 0)
  if (total <= 0 || target <= 0) return ideal.map(() => 0)
  if (total <= target) return [...ideal]

  // Not even one period each. Serve the subjects the curriculum weights most
  // heavily and leave the rest at zero, rather than quietly rounding everything
  // to one and overflowing the week.
  if (target < n) {
    const order = ideal.map((v, i) => ({ i, v })).sort((a, b) => b.v - a.v || a.i - b.i)
    const out = ideal.map(() => 0)
    for (let k = 0; k < target; k++) out[order[k].i] = 1
    return out
  }

  // Everyone keeps one period; the remainder is shared in proportion to how much
  // more than one the norm asked for.
  const spare = target - n
  const weightTotal = total - n
  const shares = ideal.map(v => weightTotal > 0 ? ((v - 1) / weightTotal) * spare : spare / n)
  const out = shares.map(s => 1 + Math.floor(s))
  // Largest-remainder: hand the leftover to the worst-rounded subjects, so the
  // total lands exactly on target instead of near it.
  let left = target - out.reduce((a, b) => a + b, 0)
  const order = shares
    .map((s, i) => ({ i, frac: s - Math.floor(s) }))
    .sort((a, b) => b.frac - a.frac || a.i - b.i)
  for (const { i } of order) {
    if (left <= 0) break
    out[i] += 1
    left -= 1
  }
  return out
}

/**
 * Derive weekly periods for every (section, subject) — the whole point of the
 * engine. `overrides` are explicit per-section figures the admin set on Mapping;
 * they replace the derived value and are excluded from scaling so an override
 * can't be silently trimmed away.
 */
export function deriveWeeklySlots(
  input: AllocationInput,
  overrides?: Record<string, Record<string, number>>,
): SectionAllocation[] {
  const board: CurriculumBoard = normalizeBoardType(input.board)
  return input.sections.map(section => {
    const group = getGradeGroup(getGrade(section))
    const assigned = subjectsForSection(input, section)

    const rows: SubjectSlots[] = assigned.map(s => {
      const cfg = s.classConfigs?.find(c => c.sectionName === section)
      const override = overrides?.[section]?.[s.name]
      // Board norm first; fall back to the subject's own figure only when the
      // knowledge base has no rule for it.
      const ideal = suggestSlotsPerWeek(s.name, group, board)
        ?? cfg?.periodsPerWeek ?? s.periodsPerWeek ?? 0
      return {
        subject: s.name,
        ideal,
        slots: override ?? ideal,
        requiresLab: cfg?.requiresLab ?? !!s.requiresLab,
        overridden: override != null,
      }
    }).filter(r => r.ideal > 0 || r.overridden)

    const capacity = Math.max(0, input.capacityFor(section))
    const normHours = input.studentHoursWeekFor?.(section)
    const normPeriods = normHours != null ? periodsForHours(normHours, input.periodMinutes) : undefined
    // The norm is a target, the bell is a hard ceiling — take the lower.
    const target = normPeriods != null && normPeriods > 0 ? Math.min(capacity || normPeriods, normPeriods) : capacity

    const fixed = rows.filter(r => r.overridden)
    const flexible = rows.filter(r => !r.overridden)
    const fixedTotal = fixed.reduce((a, r) => a + r.slots, 0)
    const scaledFlexible = scaleToTarget(flexible.map(r => r.ideal), Math.max(0, target - fixedTotal))
    flexible.forEach((r, i) => { r.slots = scaledFlexible[i] ?? 0 })

    const totalIdeal = rows.reduce((a, r) => a + r.ideal, 0)
    const totalSlots = rows.reduce((a, r) => a + r.slots, 0)
    return {
      section, rows, capacity, normPeriods, target, totalIdeal, totalSlots,
      scaled: totalSlots < totalIdeal,
    }
  })
}

/** section → subject → true, for cells a person typed rather than derived. */
export type ManualCells = Record<string, Record<string, true>>

/**
 * Re-derive without discarding what a human typed.
 *
 * "Suggest" used to REPLACE the whole grid, so hand-tuning one section and then
 * pressing Suggest for an unrelated reason silently threw that work away. The
 * derivation is a default, not an authority: where somebody has deliberately set
 * a cell, their figure stands until they clear it.
 *
 * Manual cells survive even when the derivation no longer produces that
 * (section, subject) at all — deleting someone's entry because the curriculum
 * norm stopped suggesting the subject would be the same silent loss in a
 * different disguise.
 */
export function mergePreservingManual(
  derived: Record<string, Record<string, string>>,
  current: Record<string, Record<string, string>>,
  manual: ManualCells,
): { grid: Record<string, Record<string, string>>; kept: number } {
  const grid: Record<string, Record<string, string>> = {}
  for (const section in derived) grid[section] = { ...derived[section] }

  let kept = 0
  for (const section in manual) {
    for (const subject in manual[section]) {
      const value = current?.[section]?.[subject]
      if (value == null || value === '') continue      // cleared — let the norm apply again
      if (!grid[section]) grid[section] = {}
      // Only counts as "kept" when it actually differs from what we'd derive;
      // reporting cells that happen to match would overstate the rescue.
      if (grid[section][subject] !== value) kept++
      grid[section][subject] = value
    }
  }
  return { grid, kept }
}

/**
 * Flatten to the shape the Mapping grid persists: section → subject → "5" (or
 * "4+1L" where the subject needs a lab period), matching the existing
 * allocation-syntax the grid already reads and writes.
 */
export function toAllocationGrid(allocs: SectionAllocation[]): Record<string, Record<string, string>> {
  const out: Record<string, Record<string, string>> = {}
  for (const a of allocs) {
    const row: Record<string, string> = {}
    for (const r of a.rows) {
      if (r.slots <= 0) continue
      row[r.subject] = r.requiresLab && r.slots > 1 ? `${r.slots - 1}+1L` : String(r.slots)
    }
    if (Object.keys(row).length) out[a.section] = row
  }
  return out
}
