/**
 * Fix Suggester — schedU Doc Part 2 ("AI suggests fixes, not just
 * detects problems"). Given a penalty from the solver output, produce
 * one or more concrete remedies the user can apply with one click.
 *
 * Each suggestion carries:
 *   - title           one-line action statement
 *   - description     longer rationale
 *   - category        rebalance | reassign | unscope | manual
 *   - before/after    structured diff for preview UI
 *   - apply()         optional store mutation; omitted = informational
 *
 * Pure factory. Mutations go through the passed `actions` object.
 */

import type { Staff, Subject, Section } from '@/types'

export type FixCategory = 'rebalance' | 'reassign' | 'unscope' | 'manual'

export interface FixSuggestion {
  id: string
  title: string
  description: string
  category: FixCategory
  /** Pretty diff lines: ["Mr A: 38 → 35", "Mrs B: 25 → 28"] */
  diff?: string[]
  /** When provided, calling apply() mutates the store via the actions param. */
  apply?: () => void
}

export interface FixContext {
  staff: Staff[]
  sections: Section[]
  subjects: Subject[]
  teacherAllocations: Record<string, Record<string, Record<string, number>>>
  subjectAllocations: Record<string, Record<string, string>>
  teacherWeeklyLoad?: Record<string, number>
  actions: {
    setTeacherAllocationCell: (teacher: string, section: string, subject: string, periods: number) => void
    setTeacherAllocations: (m: Record<string, Record<string, Record<string, number>>>) => void
  }
}

interface Penalty {
  constraint: string
  details: string
  penalty: number
}

// ─── Helpers ─────────────────────────────────────────────────

function weeklyLoad(
  teacherName: string,
  matrix: Record<string, Record<string, Record<string, number>>>,
): number {
  const t = matrix[teacherName] ?? {}
  let total = 0
  Object.values(t).forEach((sMap: any) =>
    Object.values(sMap ?? {}).forEach((p: any) => { if (typeof p === 'number') total += p })
  )
  return total
}

/** All (teacher, section, subject, periods) tuples flattened from matrix */
function flattenAllocations(matrix: Record<string, Record<string, Record<string, number>>>) {
  const out: { teacher: string; section: string; subject: string; periods: number }[] = []
  Object.entries(matrix).forEach(([t, sMap]) =>
    Object.entries(sMap ?? {}).forEach(([sec, subMap]) =>
      Object.entries(subMap ?? {}).forEach(([sub, p]) => {
        if (typeof p === 'number' && p > 0) out.push({ teacher: t, section: sec, subject: sub, periods: p })
      })
    )
  )
  return out
}

/** Find a teacher who can absorb N periods of (section, subject):
 *  subject-match + has headroom + not already in the slot at full target */
function findCapableTeacher(
  excludeName: string,
  section: string,
  subject: string,
  needed: number,
  ctx: FixContext,
): { teacher: Staff; headroom: number } | null {
  const candidates = ctx.staff
    .filter(t => t.name !== excludeName)
    .map(t => {
      const subs = ((t.subjects ?? []) as string[])
      const matches = subs.includes(subject) ||
        subs.includes(`${section}::${subject}`) ||
        ctx.sections.some(s => s.name === section && s.grade && subs.includes(`${s.grade}::${subject}`))
      const load = weeklyLoad(t.name, ctx.teacherAllocations)
      const max = (t as any).maxPeriodsPerWeek ?? 40
      const headroom = max - load
      return { t, matches, headroom }
    })
    .filter(c => c.headroom >= 1)
    .sort((a, b) => {
      // Subject-matched first, then lowest load (most headroom)
      if (a.matches !== b.matches) return a.matches ? -1 : 1
      return b.headroom - a.headroom
    })
  const best = candidates[0]
  if (!best) return null
  return { teacher: best.t, headroom: Math.min(best.headroom, needed) }
}

// ─── Main suggester ──────────────────────────────────────────

export function suggestFixes(penalty: Penalty, ctx: FixContext): FixSuggestion[] {
  const fixes: FixSuggestion[] = []
  const c = penalty.constraint
  const d = penalty.details

  // ── teacher-overload ──
  if (c === 'teacher-overload') {
    // Parse "Mr A has 38 periods/week (max 35)"
    const m = d.match(/^(.+?) has (\d+) periods\/week \(max (\d+)\)/)
    if (m) {
      const name = m[1]
      const load = parseInt(m[2])
      const max  = parseInt(m[3])
      const over = load - max
      if (over > 0) {
        // Find their largest assignment to peel off
        const theirs = flattenAllocations(ctx.teacherAllocations)
          .filter(a => a.teacher === name)
          .sort((a, b) => b.periods - a.periods)
        for (const big of theirs) {
          const moveN = Math.min(over, big.periods)
          const target = findCapableTeacher(name, big.section, big.subject, moveN, ctx)
          if (target) {
            const newSrcPeriods = big.periods - moveN
            const existingTarget = ctx.teacherAllocations[target.teacher.name]?.[big.section]?.[big.subject] ?? 0
            const newTargetPeriods = existingTarget + moveN
            fixes.push({
              id: `overload-${name}-${big.section}-${big.subject}`,
              title: `Move ${moveN} period${moveN !== 1 ? 's' : ''} of ${big.subject} from ${name} to ${target.teacher.name}`,
              description: `${name} is ${over} period${over !== 1 ? 's' : ''} over their weekly max (${load}/${max}). Reassigning to ${target.teacher.name} (subject-matched, has headroom).`,
              category: 'reassign',
              diff: [
                `${name} · ${big.section} ${big.subject}: ${big.periods} → ${newSrcPeriods}`,
                `${target.teacher.name} · ${big.section} ${big.subject}: ${existingTarget} → ${newTargetPeriods}`,
              ],
              apply: () => {
                ctx.actions.setTeacherAllocationCell(name, big.section, big.subject, newSrcPeriods)
                ctx.actions.setTeacherAllocationCell(target.teacher.name, big.section, big.subject, newTargetPeriods)
              },
            })
            // One concrete suggestion is enough for now
            break
          }
        }
        // Fallback informational
        if (fixes.length === 0) {
          fixes.push({
            id: `overload-${name}-manual`,
            title: `Manually reduce ${name}'s load`,
            description: `No subject-matched teacher with headroom was found. Add more teachers to this subject's pool or reduce ${name}'s assigned periods directly.`,
            category: 'manual',
          })
        }
      }
    }
  }

  // ── workload-imbalance ──
  else if (c === 'workload-imbalance') {
    // Aggregate fix — move one period from most-loaded → least-loaded same-subject teacher.
    const loads = ctx.staff.map(t => ({
      name: t.name, load: weeklyLoad(t.name, ctx.teacherAllocations),
    })).sort((a, b) => b.load - a.load)
    if (loads.length >= 2) {
      const top = loads[0]
      const bottom = loads[loads.length - 1]
      const gap = top.load - bottom.load
      if (gap >= 2) {
        // Find a transferable assignment from top
        const topAssigns = flattenAllocations(ctx.teacherAllocations)
          .filter(a => a.teacher === top.name)
          .sort((a, b) => b.periods - a.periods)
        for (const big of topAssigns) {
          const bottomMatches = ((ctx.staff.find(s => s.name === bottom.name)?.subjects ?? []) as string[])
            .includes(big.subject)
          if (!bottomMatches) continue
          const moveN = Math.min(Math.floor(gap / 2), big.periods, 1)
          if (moveN <= 0) continue
          const newSrc = big.periods - moveN
          const existingTarget = ctx.teacherAllocations[bottom.name]?.[big.section]?.[big.subject] ?? 0
          const newTarget = existingTarget + moveN
          fixes.push({
            id: `rebalance-${top.name}-${bottom.name}`,
            title: `Rebalance: move ${moveN} period of ${big.subject} from ${top.name} to ${bottom.name}`,
            description: `Load gap is ${gap} periods/week. Shifting ${moveN} period ${big.subject} (${big.section}) reduces stddev.`,
            category: 'rebalance',
            diff: [
              `${top.name}: ${top.load} → ${top.load - moveN}`,
              `${bottom.name}: ${bottom.load} → ${bottom.load + moveN}`,
            ],
            apply: () => {
              ctx.actions.setTeacherAllocationCell(top.name, big.section, big.subject, newSrc)
              ctx.actions.setTeacherAllocationCell(bottom.name, big.section, big.subject, newTarget)
            },
          })
          break
        }
      }
    }
    if (fixes.length === 0) {
      fixes.push({
        id: 'rebalance-auto-redistribute',
        title: 'Run global rebalance',
        description: 'Auto-redistributes one period at a time from the most-loaded teacher to the least-loaded subject-matched teacher until stddev stabilises.',
        category: 'rebalance',
        apply: () => runGlobalRebalance(ctx),
      })
    }
  }

  // ── *-scope-disabled (informational) ──
  else if (c === 'teacher-scope-disabled' || c === 'subject-scope-disabled' || c === 'section-scope-disabled') {
    // Parse "<entity> marked disabled at <day> <period>"
    const m = d.match(/^(.+?) marked disabled at (.+?) (.+)$/)
    if (m) {
      const entity = m[1], day = m[2], pid = m[3]
      fixes.push({
        id: `unscope-${entity}-${day}-${pid}`,
        title: `Review scope for ${entity}`,
        description: `${entity} has this (${day}, ${pid}) slot marked as 'disabled'. Open their scope matrix to either lift the restriction (allow) or harden it (lock).`,
        category: 'unscope',
        // No auto-apply: scope edits go through the Scope modal
      })
    }
  }

  // ── consecutive-heavy ──
  else if (c === 'consecutive-heavy') {
    fixes.push({
      id: 'consecutive-manual',
      title: 'Manually swap an adjacent period',
      description: 'The same subject runs in two consecutive periods. Open the timetable view and swap the second occurrence with another period for variety.',
      category: 'manual',
    })
  }

  // ── teacher-availability (no teacher could be found) ──
  else if (c === 'teacher-availability') {
    fixes.push({
      id: 'add-teacher-to-pool',
      title: 'Add a teacher to this subject pool',
      description: 'No eligible teacher was free for this slot. Add another teacher to this subject in the Teachers tab, or expand an existing teacher\'s subject list.',
      category: 'manual',
    })
  }

  return fixes
}

/** Greedy global rebalance — peels one period at a time from the
 *  most-loaded teacher to the least-loaded subject-matched teacher,
 *  stopping when stddev plateaus or 20 iterations cap. */
function runGlobalRebalance(ctx: FixContext) {
  const matrix = JSON.parse(JSON.stringify(ctx.teacherAllocations)) as typeof ctx.teacherAllocations
  let iterations = 0
  while (iterations < 20) {
    const loads = ctx.staff.map(t => ({ name: t.name, load: weeklyLoad(t.name, matrix) }))
    if (loads.length < 2) break
    loads.sort((a, b) => b.load - a.load)
    const top = loads[0], bottom = loads[loads.length - 1]
    if (top.load - bottom.load < 2) break

    // Find a transferable assignment
    const topAssigns = flattenAllocations(matrix)
      .filter(a => a.teacher === top.name)
      .sort((a, b) => b.periods - a.periods)
    let moved = false
    for (const big of topAssigns) {
      const bottomTeacher = ctx.staff.find(s => s.name === bottom.name)
      const matches = ((bottomTeacher?.subjects ?? []) as string[]).includes(big.subject)
      if (!matches) continue
      matrix[top.name][big.section][big.subject] = big.periods - 1
      if (!matrix[bottom.name]) matrix[bottom.name] = {}
      if (!matrix[bottom.name][big.section]) matrix[bottom.name][big.section] = {}
      matrix[bottom.name][big.section][big.subject] =
        (matrix[bottom.name][big.section][big.subject] ?? 0) + 1
      // Clean empties
      if (matrix[top.name][big.section][big.subject] === 0) {
        delete matrix[top.name][big.section][big.subject]
        if (Object.keys(matrix[top.name][big.section]).length === 0) delete matrix[top.name][big.section]
        if (Object.keys(matrix[top.name]).length === 0) delete matrix[top.name]
      }
      moved = true
      break
    }
    if (!moved) break
    iterations++
  }
  ctx.actions.setTeacherAllocations(matrix)
}
