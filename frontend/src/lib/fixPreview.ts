/**
 * fixPreview — simulate a FixSuggestion against the current state and
 * report the projected impact BEFORE the user commits.
 *
 * Pure function. Deep-clones the teacherAllocations matrix, applies the
 * fix's structured changes, recomputes the fairness + overload metrics
 * the engine uses, and returns a side-by-side comparison.
 *
 * Spec: Doc Part 2 — "AI suggests fixes, not just detects" + the
 * "if applied, will it cause another penalty?" conflict-aware extension.
 */

import type { Staff } from '@/types'
import { teacherWeeklyCap } from '@/lib/teacherCap'
import type { FixChange, FixSuggestion } from './fixSuggester'

export interface FixPreview {
  /** Stddev BEFORE applying the fix */
  beforeStddev: number
  /** Stddev AFTER applying the fix */
  afterStddev: number
  /** Teachers overloaded BEFORE (load > max) */
  beforeOverloads: string[]
  /** Teachers overloaded AFTER */
  afterOverloads: string[]
  /** Per-teacher load deltas (only the ones that changed) */
  loadDeltas: Array<{ teacher: string; before: number; after: number; max: number }>
  /** Score delta estimate (negative = improvement) */
  scoreDelta: number
  /** Human-readable summary lines */
  summary: {
    resolves: string[]
    introduces: string[]
    warnings: string[]
  }
}

interface PreviewContext {
  staff: Staff[]
  teacherAllocations: Record<string, Record<string, Record<string, number>>>
}

/** Total weekly load for one teacher across all (section, subject). */
function loadFor(name: string, matrix: PreviewContext['teacherAllocations']): number {
  const t = matrix[name] ?? {}
  let total = 0
  Object.values(t).forEach((sMap: any) =>
    Object.values(sMap ?? {}).forEach((p: any) => { if (typeof p === 'number') total += p })
  )
  return total
}

/** Standard deviation of teacher loads. Lower = better fairness. */
function stddev(loads: number[]): number {
  if (loads.length === 0) return 0
  const mean = loads.reduce((a, b) => a + b, 0) / loads.length
  const v = loads.reduce((a, l) => a + (l - mean) ** 2, 0) / loads.length
  return Math.sqrt(v)
}

/** Apply a single change to a cloned matrix in-place. Cleans empties. */
function applyChange(
  matrix: PreviewContext['teacherAllocations'],
  c: FixChange,
): void {
  if (!matrix[c.teacher]) matrix[c.teacher] = {}
  if (!matrix[c.teacher][c.section]) matrix[c.teacher][c.section] = {}
  if (c.after === 0) {
    delete matrix[c.teacher][c.section][c.subject]
    if (Object.keys(matrix[c.teacher][c.section]).length === 0) delete matrix[c.teacher][c.section]
    if (Object.keys(matrix[c.teacher]).length === 0) delete matrix[c.teacher]
  } else {
    matrix[c.teacher][c.section][c.subject] = c.after
  }
}

/** Build the preview for a given fix. */
export function previewFix(fix: FixSuggestion, ctx: PreviewContext): FixPreview | null {
  if (!fix.changes || fix.changes.length === 0) return null

  // Snapshot before
  const before = ctx.teacherAllocations
  const beforeLoads = new Map<string, number>()
  ctx.staff.forEach(t => beforeLoads.set(t.name, loadFor(t.name, before)))

  // Clone + apply
  const after = JSON.parse(JSON.stringify(before)) as PreviewContext['teacherAllocations']
  fix.changes.forEach(c => applyChange(after, c))

  const afterLoads = new Map<string, number>()
  ctx.staff.forEach(t => afterLoads.set(t.name, loadFor(t.name, after)))

  // Stddevs
  const beforeStddev = stddev(Array.from(beforeLoads.values()).filter(l => l > 0))
  const afterStddev  = stddev(Array.from(afterLoads.values()).filter(l => l > 0))

  // Overloads
  const beforeOverloads: string[] = []
  const afterOverloads: string[]  = []
  ctx.staff.forEach(t => {
    const max = teacherWeeklyCap(t as any)
    if ((beforeLoads.get(t.name) ?? 0) > max) beforeOverloads.push(t.name)
    if ((afterLoads.get(t.name) ?? 0)  > max) afterOverloads.push(t.name)
  })

  // Load deltas — only teachers whose load actually changed
  const loadDeltas: FixPreview['loadDeltas'] = []
  ctx.staff.forEach(t => {
    const b = beforeLoads.get(t.name) ?? 0
    const a = afterLoads.get(t.name) ?? 0
    if (b !== a) {
      const max = teacherWeeklyCap(t as any)
      loadDeltas.push({ teacher: t.name, before: b, after: a, max })
    }
  })

  // Score delta heuristic — matches engine penalty weights:
  //   workload-imbalance:    stddev * 4 (capped 50)
  //   teacher-overload:      (load - max) * 5  per overloaded teacher
  const before_imbalance = Math.min(50, Math.round(beforeStddev * 4))
  const after_imbalance  = Math.min(50, Math.round(afterStddev * 4))
  let before_overload_pts = 0, after_overload_pts = 0
  ctx.staff.forEach(t => {
    const max = teacherWeeklyCap(t as any)
    const bL = beforeLoads.get(t.name) ?? 0
    const aL = afterLoads.get(t.name)  ?? 0
    if (bL > max) before_overload_pts += (bL - max) * 5
    if (aL > max) after_overload_pts  += (aL - max) * 5
  })
  const before_total = before_imbalance + before_overload_pts
  const after_total  = after_imbalance  + after_overload_pts
  const scoreDelta = after_total - before_total

  // Summary
  const resolves: string[] = []
  const introduces: string[] = []
  const warnings: string[] = []

  if (afterStddev < beforeStddev - 0.1) {
    resolves.push(`Fairness improves (stddev ${beforeStddev.toFixed(2)} → ${afterStddev.toFixed(2)})`)
  } else if (afterStddev > beforeStddev + 0.1) {
    warnings.push(`Fairness gets slightly worse (stddev ${beforeStddev.toFixed(2)} → ${afterStddev.toFixed(2)})`)
  }
  const fixed = beforeOverloads.filter(n => !afterOverloads.includes(n))
  fixed.forEach(n => resolves.push(`${n} no longer overloaded`))
  const newOver = afterOverloads.filter(n => !beforeOverloads.includes(n))
  newOver.forEach(n => introduces.push(`${n} would now be overloaded`))

  return {
    beforeStddev, afterStddev,
    beforeOverloads, afterOverloads,
    loadDeltas, scoreDelta,
    summary: { resolves, introduces, warnings },
  }
}
