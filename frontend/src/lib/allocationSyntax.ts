/**
 * Allocation Syntax Parser - schedU Doc Part 1.
 *
 * Compact, Excel-cell-friendly syntax for declaring per-class period
 * allocations. Examples:
 *
 *   "5"      -> 5 theory periods
 *   "5+1"    -> 5 theory + 1 lab/practical
 *   "3(2X)"  -> 3 double periods (each 2 consecutive units)
 *   "2L"     -> 2 lab periods (no theory split)
 *   "4+1L"   -> 4 theory + 1 explicit lab
 *   "6T"     -> 6 theory (explicit T marker)
 *
 * The parser is tolerant of whitespace and case. Returns a structured
 * Allocation object the engine consumes.
 */

export interface Allocation {
  theoryPeriods: number
  labPeriods: number
  doublePeriods: number          // count of double-period blocks
  doubleSpan: number             // units per double (default 2)
  raw: string
  valid: boolean
  error?: string
  /** Total period-equivalents this allocation consumes per week.
   *  Double periods count as `doubleSpan` units each. */
  weeklyTotal: number
}

const EMPTY: Omit<Allocation, 'raw'> = {
  theoryPeriods: 0, labPeriods: 0, doublePeriods: 0, doubleSpan: 2,
  valid: false, weeklyTotal: 0,
}

export function parseAllocation(input: string | undefined | null): Allocation {
  const raw = (input ?? '').trim()
  if (!raw) return { ...EMPTY, raw, error: 'empty' }

  // Normalize: strip spaces, uppercase, allow `x` or `X`
  const s = raw.replace(/\s+/g, '').toUpperCase()

  // Pattern 0: "<x>S=<y>P"  -> x sessions of y consecutive periods each
  //   e.g. "1s=2p"  = 1 double-period block (same as "1(2X)")
  //        "2s=3p"  = 2 triple-period blocks
  //        "3s=1p"  = 3 single-period sessions (plain theory, no consecutive)
  const sessionMatch = s.match(/^(\d+)S=(\d+)P$/)
  if (sessionMatch) {
    const sessions = parseInt(sessionMatch[1])
    const perSession = parseInt(sessionMatch[2])
    if (sessions <= 0 || perSession <= 0) return { ...EMPTY, raw, error: 'invalid session syntax' }
    if (perSession === 1) {
      // single-period sessions = ordinary theory
      return { theoryPeriods: sessions, labPeriods: 0, doublePeriods: 0, doubleSpan: 1, valid: true, weeklyTotal: sessions, raw }
    }
    return {
      theoryPeriods: 0, labPeriods: 0,
      doublePeriods: sessions, doubleSpan: perSession,
      valid: true, weeklyTotal: sessions * perSession, raw,
    }
  }

  // Pattern 1: "<n>(<m>X)"  -> n double-periods each spanning m units
  const dblMatch = s.match(/^(\d+)\((\d+)X\)$/)
  if (dblMatch) {
    const count = parseInt(dblMatch[1])
    const span  = parseInt(dblMatch[2])
    if (count <= 0 || span <= 1) return { ...EMPTY, raw, error: 'invalid double-period syntax' }
    return {
      theoryPeriods: 0, labPeriods: 0,
      doublePeriods: count, doubleSpan: span,
      valid: true, weeklyTotal: count * span, raw,
    }
  }

  // Pattern 2: "<n>L"  -> n lab periods only
  const labOnly = s.match(/^(\d+)L$/)
  if (labOnly) {
    const labs = parseInt(labOnly[1])
    return {
      theoryPeriods: 0, labPeriods: labs,
      doublePeriods: 0, doubleSpan: 2,
      valid: labs > 0, weeklyTotal: labs, raw,
      error: labs > 0 ? undefined : 'lab count must be > 0',
    }
  }

  // Pattern 3: "<n>T"  -> explicit theory count
  const thOnly = s.match(/^(\d+)T$/)
  if (thOnly) {
    const t = parseInt(thOnly[1])
    return {
      theoryPeriods: t, labPeriods: 0,
      doublePeriods: 0, doubleSpan: 2,
      valid: t > 0, weeklyTotal: t, raw,
      error: t > 0 ? undefined : 'theory count must be > 0',
    }
  }

  // Pattern 4: "<n>+<m>" or "<n>+<m>L"  -> theory + lab
  const tp = s.match(/^(\d+)\+(\d+)L?$/)
  if (tp) {
    const t = parseInt(tp[1])
    const l = parseInt(tp[2])
    return {
      theoryPeriods: t, labPeriods: l,
      doublePeriods: 0, doubleSpan: 2,
      valid: (t + l) > 0, weeklyTotal: t + l, raw,
      error: (t + l) > 0 ? undefined : 'total must be > 0',
    }
  }

  // Pattern 5: plain "<n>"  -> n theory periods
  const plain = s.match(/^(\d+)$/)
  if (plain) {
    const t = parseInt(plain[1])
    return {
      theoryPeriods: t, labPeriods: 0,
      doublePeriods: 0, doubleSpan: 2,
      valid: t > 0, weeklyTotal: t, raw,
      error: t > 0 ? undefined : 'must be > 0',
    }
  }

  return { ...EMPTY, raw, error: `unrecognised syntax: "${raw}"` }
}

/** Format an Allocation back to its canonical compact syntax. */
export function formatAllocation(a: Pick<Allocation, 'theoryPeriods' | 'labPeriods' | 'doublePeriods' | 'doubleSpan'>): string {
  if (a.doublePeriods > 0) return `${a.doublePeriods}s=${a.doubleSpan}p`
  if (a.theoryPeriods > 0 && a.labPeriods > 0) return `${a.theoryPeriods}+${a.labPeriods}`
  if (a.labPeriods > 0)     return `${a.labPeriods}L`
  if (a.theoryPeriods > 0)  return String(a.theoryPeriods)
  return ''
}

/** Validate an allocation against a class's weekly capacity.
 *  Hard constraint: total ≤ capacity. */
export function validateAllocationCapacity(
  alloc: Allocation,
  weeklyCapacity: number,
): { ok: boolean; reason?: string } {
  if (!alloc.valid) return { ok: false, reason: alloc.error ?? 'invalid' }
  if (alloc.weeklyTotal > weeklyCapacity) {
    return { ok: false, reason: `${alloc.weeklyTotal} periods exceeds weekly capacity (${weeklyCapacity})` }
  }
  return { ok: true }
}

/** Sum allocations across many subjects to compute a class's total commitment. */
export function sumAllocations(allocations: Allocation[]): number {
  return allocations.reduce((s, a) => s + (a.valid ? a.weeklyTotal : 0), 0)
}
