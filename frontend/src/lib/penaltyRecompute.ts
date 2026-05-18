/**
 * penaltyRecompute — derive the workload-related penalties straight
 * from the current store state, no solver re-run required.
 *
 * The solver's output captures every penalty at the moment of solve.
 * After the user applies fixes through the dashboard, the static
 * penalties become stale for the workload dimension (which is purely
 * a function of teacherAllocations + staff caps).
 *
 * This module recomputes ONLY those penalties so the dashboard can
 * show live state. Scope/placement penalties stay as solver-emitted
 * since they require a full re-solve to update.
 *
 * Pure function. No React, no zustand.
 */

import type { Staff } from '@/types'
import { parseAllocation } from './allocationSyntax'

export interface RecomputedPenalty {
  constraint: string
  penalty: number
  details: string
}

interface RecomputeInput {
  staff: Staff[]
  teacherAllocations: Record<string, Record<string, Record<string, number>>>
  subjectAllocations?: Record<string, Record<string, string>>
}

export function recomputeWorkloadPenalties(input: RecomputeInput): RecomputedPenalty[] {
  const { staff, teacherAllocations, subjectAllocations } = input
  const out: RecomputedPenalty[] = []

  // Per-teacher weekly loads
  const loads: Record<string, number> = {}
  staff.forEach(t => {
    const tMap = teacherAllocations[t.name] ?? {}
    let total = 0
    Object.values(tMap).forEach((sMap: any) =>
      Object.values(sMap ?? {}).forEach((p: any) => {
        if (typeof p === 'number') total += p
      })
    )
    loads[t.name] = total
  })

  // Fairness target — same formula the solver uses
  let totalRequired = 0
  Object.values(subjectAllocations ?? {}).forEach(secMap => {
    Object.values(secMap ?? {}).forEach(cellStr => {
      const parsed = parseAllocation(cellStr)
      if (parsed.valid) totalRequired += parsed.weeklyTotal
    })
  })
  // If subjectAllocations is empty, infer target from current loads
  if (totalRequired === 0) {
    totalRequired = Object.values(loads).reduce((a, b) => a + b, 0)
  }
  const target = Math.ceil(totalRequired / Math.max(1, staff.length))

  // Workload-imbalance penalty
  const active = Object.values(loads).filter(l => l > 0)
  if (active.length > 0) {
    const mean = active.reduce((a, b) => a + b, 0) / active.length
    const variance = active.reduce((a, l) => a + (l - mean) ** 2, 0) / active.length
    const stddev = Math.sqrt(variance)
    const penalty = Math.min(50, Math.round(stddev * 4))
    if (penalty > 0) {
      out.push({
        constraint: 'workload-imbalance',
        penalty,
        details: `Teacher loads stddev=${stddev.toFixed(2)} around target=${target}`,
      })
    }
  }

  // Per-teacher overload penalties
  staff.forEach(t => {
    const load = loads[t.name] ?? 0
    const max = (t as any).maxPeriodsPerWeek ?? 40
    if (load > max) {
      out.push({
        constraint: 'teacher-overload',
        penalty: (load - max) * 5,
        details: `${t.name} has ${load} periods/week (max ${max})`,
      })
    }
  })

  return out
}

/** Merge solver-emitted penalties with live workload recomputation.
 *  Replaces stale workload-imbalance + teacher-overload entries with
 *  the up-to-date versions; everything else (scope, placement, etc.)
 *  remains from the original solve. */
export function mergeLivePenalties(
  solverPenalties: RecomputedPenalty[],
  liveWorkload: RecomputedPenalty[],
): RecomputedPenalty[] {
  const fresh = solverPenalties.filter(p =>
    p.constraint !== 'workload-imbalance' &&
    p.constraint !== 'teacher-overload'
  )
  return [...fresh, ...liveWorkload]
}
