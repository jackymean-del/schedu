/**
 * Explanation Engine — schedU Doc Part 2 (AI Explanation System).
 *
 * Mirrors the solver's scoring factors so the UI can show users the
 * exact reasoning behind any teacher assignment. Pure functions —
 * no state, no side effects.
 *
 * Used by:
 *   - TeacherAllocationGrid (per-cell info popover)
 *   - TeacherAllocationModal (per-row "why this teacher?")
 *   - Future: timetable cell tooltips, conflict explanations
 */

import type { Staff, Subject, Section, ScopeState } from '@/types'

export type FactorCategory =
  | 'expertise'      // teacher's subjects array matches
  | 'continuity'     // already teaches subject elsewhere
  | 'familiarity'    // already in this section
  | 'workload'       // load vs target
  | 'overload'       // exceeds personal max
  | 'ct'             // is class teacher for this section
  | 'scope-locked'   // scope = locked at this slot
  | 'scope-disabled' // scope = disabled (soft penalty)
  | 'fallback'       // no subject match — last resort pick

export interface ExplanationFactor {
  category: FactorCategory
  positive: boolean
  weight: number
  reason: string
}

export interface AssignmentExplanation {
  teacher: string
  section: string
  subject: string
  factors: ExplanationFactor[]
  summary: string
  score: number
  recommended: boolean
}

interface ExplainContext {
  teacher: Staff
  section: Section
  subject: Subject
  /** Other teachers' periods for this (section, subject) */
  otherTeachersPeriods?: number
  /** This teacher's total weekly load (across all subjects/sections) */
  weeklyLoad?: number
  /** Total target periods across the school / staff count (fairness target) */
  targetWeeklyLoad?: number
  /** Sections in which this teacher already teaches this subject */
  alsoTeachesIn?: string[]
  /** Day / period for scope checks (optional) */
  day?: string
  periodId?: string
}

export function explainAssignment(ctx: ExplainContext): AssignmentExplanation {
  const factors: ExplanationFactor[] = []
  let score = 0

  // ── Subject expertise match ──
  const subs = ((ctx.teacher.subjects ?? []) as string[])
  const exactMatch = subs.includes(ctx.subject.name) ||
    subs.includes(`${ctx.section.name}::${ctx.subject.name}`) ||
    (ctx.section.grade ? subs.includes(`${ctx.section.grade}::${ctx.subject.name}`) : false)

  if (exactMatch) {
    factors.push({
      category: 'expertise', positive: true, weight: 50,
      reason: `Specializes in ${ctx.subject.name}`,
    })
    score += 50
  } else {
    factors.push({
      category: 'fallback', positive: false, weight: 0,
      reason: `Not listed as a ${ctx.subject.name} teacher — fallback assignment`,
    })
  }

  // ── Vertical continuity ──
  if (ctx.alsoTeachesIn && ctx.alsoTeachesIn.length > 0) {
    const others = ctx.alsoTeachesIn.filter(s => s !== ctx.section.name)
    if (others.length > 0) {
      factors.push({
        category: 'continuity', positive: true, weight: 25,
        reason: `Already teaches ${ctx.subject.name} in ${others.length} other section${others.length !== 1 ? 's' : ''} (${others.slice(0, 3).join(', ')}${others.length > 3 ? '…' : ''})`,
      })
      score += 25
    }
  }

  // ── Class teacher priority ──
  const isCT = ctx.teacher.isClassTeacher === ctx.section.name ||
    (ctx.teacher as any).isClassTeacher === ctx.section.name
  if (isCT) {
    factors.push({
      category: 'ct', positive: true, weight: 15,
      reason: `Class teacher for ${ctx.section.name} — owns this section`,
    })
    score += 15
  }

  // ── Workload balance ──
  if (ctx.weeklyLoad != null && ctx.targetWeeklyLoad != null) {
    const load = ctx.weeklyLoad
    const target = ctx.targetWeeklyLoad
    const max = (ctx.teacher as any).maxPeriodsPerWeek ?? 40

    if (load > max) {
      const over = load - max
      factors.push({
        category: 'overload', positive: false, weight: -over * 5,
        reason: `Overloaded: ${load} periods/week (max ${max})`,
      })
      score -= over * 5
    } else if (max > 0 && load >= max * 0.9) {
      factors.push({
        category: 'overload', positive: false, weight: -30,
        reason: `Near personal max (${load}/${max} this week)`,
      })
      score -= 30
    } else if (load < target) {
      const deficit = target - load
      const bonus = Math.min(30, deficit * 2)
      factors.push({
        category: 'workload', positive: true, weight: bonus,
        reason: `Below target weekly load (${load}/${target} — fair distribution)`,
      })
      score += bonus
    } else if (load > target) {
      const over = load - target
      const penalty = Math.min(40, over * 3)
      factors.push({
        category: 'workload', positive: false, weight: -penalty,
        reason: `Above fairness target (${load}/${target})`,
      })
      score -= penalty
    } else {
      factors.push({
        category: 'workload', positive: true, weight: 5,
        reason: `Exactly at target load (${load} periods/week)`,
      })
      score += 5
    }
  }

  // ── Section familiarity (other subjects in same section) ──
  // Inferred from teacher.classes if available
  const classes = ((ctx.teacher as any).classes ?? []) as string[]
  if (classes.length > 0 && (classes.includes(ctx.section.name) || classes.includes(ctx.section.grade ?? ''))) {
    factors.push({
      category: 'familiarity', positive: true, weight: 8,
      reason: `Already teaches in ${ctx.section.name}`,
    })
    score += 8
  }

  // ── Scope checks ──
  if (ctx.day && ctx.periodId) {
    const tScope: any = (ctx.teacher as any).scope
    const sScope: any = (ctx.subject as any).scope
    const secScope: any = (ctx.section as any).scope
    const checkScope = (matrix: any, label: string): ScopeState => {
      const state: ScopeState = matrix?.cells?.[ctx.day!]?.[ctx.periodId!] ?? 'allowed'
      if (state === 'locked') {
        factors.push({
          category: 'scope-locked', positive: false, weight: -999,
          reason: `${label} scope LOCKED at ${ctx.day} ${ctx.periodId} — hard constraint`,
        })
      } else if (state === 'disabled') {
        factors.push({
          category: 'scope-disabled', positive: false, weight: -10,
          reason: `${label} scope disabled at this slot (soft avoid)`,
        })
      }
      return state
    }
    if (tScope)   checkScope(tScope,   'Teacher')
    if (sScope)   checkScope(sScope,   'Subject')
    if (secScope) checkScope(secScope, 'Section')
  }

  // ── Pick top reason for summary line ──
  const topPositive = factors
    .filter(f => f.positive)
    .sort((a, b) => b.weight - a.weight)[0]
  const topNegative = factors
    .filter(f => !f.positive)
    .sort((a, b) => a.weight - b.weight)[0]

  let summary = ''
  if (topPositive) summary = topPositive.reason
  else if (topNegative) summary = topNegative.reason
  else summary = `${ctx.teacher.name} assigned — no specific factors detected`

  // ── Recommendation verdict ──
  const recommended = score >= 50 &&
    !factors.some(f => f.category === 'scope-locked') &&
    !factors.some(f => f.category === 'overload' && f.weight < -20)

  return {
    teacher: ctx.teacher.name,
    section: ctx.section.name,
    subject: ctx.subject.name,
    factors,
    summary, score, recommended,
  }
}

/** Pretty-print a category as a short label. */
export function categoryLabel(c: FactorCategory): string {
  switch (c) {
    case 'expertise':      return 'Expertise'
    case 'continuity':     return 'Continuity'
    case 'familiarity':    return 'Familiarity'
    case 'workload':       return 'Workload'
    case 'overload':       return 'Overload'
    case 'ct':             return 'Class Teacher'
    case 'scope-locked':   return 'Scope Lock'
    case 'scope-disabled': return 'Scope Avoid'
    case 'fallback':       return 'Fallback'
  }
}

/** Category → colour for UI badges */
export function categoryColor(c: FactorCategory): { bg: string; fg: string } {
  switch (c) {
    case 'expertise':      return { bg: '#EDE9FF', fg: '#7C6FE0' }
    case 'continuity':     return { bg: '#DBEAFE', fg: '#1D4ED8' }
    case 'familiarity':    return { bg: '#DCFCE7', fg: '#15803D' }
    case 'workload':       return { bg: '#F0FDF4', fg: '#16A34A' }
    case 'overload':       return { bg: '#FEE2E2', fg: '#991B1B' }
    case 'ct':             return { bg: '#FEF3C7', fg: '#92400E' }
    case 'scope-locked':   return { bg: '#FEE2E2', fg: '#991B1B' }
    case 'scope-disabled': return { bg: '#FFFBEB', fg: '#92400E' }
    case 'fallback':       return { bg: '#F1F5F9', fg: '#475569' }
  }
}
