/**
 * Section auto-distribution — Blueprint v3, Step 1.
 *
 * "If a number of sections is provided, the system auto-distributes sections
 *  across classes, allocating from the LOWEST class to the HIGHEST class first,
 *  filling sections roughly evenly until exhausted."
 *
 * Implemented as a general algorithm (validated against the blueprint's five
 * worked cases in blueprint-verify.mts): give every class the even base share,
 * then hand the remainder to the LOWEST classes first. That reproduces the
 * documented "2 per class from the bottom up, then 1 each" behaviour without
 * hardcoding it, and generalises to any class-count / section-count.
 *
 *   Classes 1–6, 10 sections → [2,2,2,2,1,1]
 *   Classes 1–8, 10 sections → [2,2,1,1,1,1,1,1]
 *   Classes 1–8, 12 sections → [2,2,2,2,1,1,1,1]
 *
 * NOTE: the earlier implementation put the remainder on the HIGHEST classes,
 * which inverted every one of those cases.
 */
export function distributeSections(count: number, total: number): number[] {
  if (count <= 0) return []
  if (total <= 0) return Array(count).fill(0)
  const base = Math.floor(total / count)
  const rem = total - base * count
  // Lowest `rem` classes get one extra — lowest-first, per the blueprint.
  return Array.from({ length: count }, (_, i) => base + (i < rem ? 1 : 0))
}
