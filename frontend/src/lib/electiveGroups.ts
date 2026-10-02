/**
 * Which electives a student chooses BETWEEN, and which electives are still
 * outside any group. Shared by the Groups & Combos step, the Generate
 * briefing and combo-verify, so all three judge a class the same way.
 *
 * A class with Maths, Biology, Hindi, Odia and Sanskrit as electives makes two
 * choices, not one: Maths OR Biology, and one language of Hindi, Odia,
 * Sanskrit. Putting all five in one AND group asks every student to sit in one
 * of five rooms in a single period. Grouping used to key on the subject's
 * category, and all five are "Scholastic", so that is exactly what it built.
 *
 * The basis, in order:
 *   1. the school's own elective slot ("R1", "PCM") - subjects sharing a slot
 *      are one choice;
 *   2. otherwise the kind of choice: a language is chosen against languages,
 *      an activity against activities, any other academic subject against
 *      other academic subjects.
 */

export type ElectiveFamily = 'language' | 'academic' | 'activity'

const ACTIVITY_RE = /\b(p\.?\s?e\.?|phys(ical)?\s*(ed|education)?|sports?|games?|athletics|art|arts|paint(ing)?|drawing|music|dance|drama|theatre|theater|craft|yoga|gym|swim(ming)?|library|hobby|club|cca|scout|ncc|nss)\b/i

const LANGUAGE_RE = /\b(hindi|english|sanskrit|odia|oriya|bengali|bangla|tamil|telugu|kannada|malayalam|marathi|urdu|punjabi|gujarati|assamese|nepali|sindhi|konkani|manipuri|bodo|santhali|maithili|dogri|kashmiri|french|german|spanish|japanese|chinese|mandarin|arabic|persian|russian|italian|korean|latin|mil|regional language|mother tongue|second language|third language)\b/i

/** Academic or activity, from the category first and the name second. */
export function inferType(name: string, category?: string): 'academic' | 'activity' {
  const c = (category ?? '').toLowerCase()
  if (c.includes('co-scholastic') || c.includes('co scholastic') || c.includes('activity')) return 'activity'
  if (c.includes('scholastic')) return 'academic'
  return ACTIVITY_RE.test(name) ? 'activity' : 'academic'
}

export function electiveFamily(name: string, category?: string): ElectiveFamily {
  if (LANGUAGE_RE.test(name)) return 'language'
  return inferType(name, category) === 'activity' ? 'activity' : 'academic'
}

export const FAMILY_LABEL: Record<ElectiveFamily, string> = {
  language: 'Language choice', academic: 'Subject choice', activity: 'Activity choice',
}

/** The sections where a subject is an elective. Per-section flags define the
 *  scope when present; a bare subject-level flag means everywhere it is
 *  taught (legacy data). */
export function electiveSectionsOf(sub: any): string[] {
  const cfgs = (sub?.classConfigs ?? []) as any[]
  const flagged = cfgs.filter(c => c?.isOptional === true)
  if (flagged.length) return [...new Set(flagged.map(c => c.sectionName).filter(Boolean) as string[])]
  if (sub?.isOptional !== true) return []
  return [...new Set([...(cfgs.map(c => c?.sectionName).filter(Boolean) as string[]), ...(sub.sections ?? [])])]
}

/** The subject columns of an AND group. */
export function groupColumns(g: any): string[] {
  if (g?.subjects?.length) return g.subjects
  const cols: string[] = []
  for (const b of g?.bundles ?? []) for (const s of b?.subjects ?? []) if (!cols.includes(s)) cols.push(s)
  return cols
}

/**
 * Electives each section takes that no AND group covers. Without a group the
 * timetable gives such a subject to the WHOLE class, so this is what the
 * Groups step warns about before it is skipped.
 */
export function ungroupedElectives(subjects: any[], andGroups: any[]): Array<{ section: string; subjects: string[] }> {
  const covered = new Set<string>()
  for (const g of andGroups ?? []) {
    for (const sec of g?.applicableSections ?? []) {
      for (const col of groupColumns(g)) {
        if ((g?.strengthMatrix?.[sec]?.[col] ?? 0) < 0) continue   // marked not offered
        covered.add(`${sec}|${col}`)
      }
    }
  }
  const bySection = new Map<string, string[]>()
  for (const sub of subjects ?? []) {
    for (const sec of electiveSectionsOf(sub)) {
      if (covered.has(`${sec}|${sub.name}`)) continue
      const list = bySection.get(sec) ?? []
      list.push(sub.name)
      bySection.set(sec, list)
    }
  }
  return [...bySection.entries()]
    .map(([section, subs]) => ({ section, subjects: subs }))
    .sort((a, b) => a.section.localeCompare(b.section, undefined, { numeric: true }))
}

/** "X-A, X-B: Hindi, Odia" lines - classes with the same gap read as one. */
export function describeUngrouped(rows: Array<{ section: string; subjects: string[] }>): string[] {
  const byList = new Map<string, string[]>()
  for (const r of rows) {
    const key = [...r.subjects].sort().join(', ')
    byList.set(key, [...(byList.get(key) ?? []), r.section])
  }
  return [...byList.entries()].map(([subs, secs]) => `${secs.join(', ')}: ${subs}`)
}

/**
 * Fill the one headcount a teacher should not have to work out.
 *
 * A class of 35 split across Computer and Mathematics: typing 21 for Computer
 * means 14 for Mathematics, and making the teacher type it (or leaving 0 and a
 * red "-14") is busywork. Once every subject in a class's row but one has a
 * number, the last gets the rest of the class. That cell is remembered as
 * filled automatically, so changing another number re-fills it; typing into it
 * yourself makes it yours and it is left alone from then on.
 *
 * `row` is subject -> headcount for one class (-1 = not offered there, never
 * touched). Returns the new row and which column, if any, is automatic now.
 */
export function autoFillRow(
  row: Record<string, number>, cols: string[], total: number, edited: string, autoCol?: string,
): { row: Record<string, number>; autoCol?: string } {
  const next = { ...row }
  const open = cols.filter(c => (next[c] ?? 0) >= 0)
  let auto = autoCol === edited || !open.includes(autoCol ?? '') ? undefined : autoCol
  if (total <= 0 || open.length < 2) return { row: next, autoCol: auto }
  if (!auto) {
    const blanks = open.filter(c => c !== edited && !((next[c] ?? 0) > 0))
    if (blanks.length !== 1) return { row: next, autoCol: auto }
    auto = blanks[0]
  }
  const rest = total - open.filter(c => c !== auto).reduce((a, c) => a + Math.max(0, next[c] ?? 0), 0)
  next[auto] = Math.max(0, rest)
  return { row: next, autoCol: auto }
}

/**
 * Put a block's edited groups back WHERE THE BLOCK WAS.
 *
 * Every edit inside a block used to save it by filtering it out and appending
 * it at the end. With two blocks on the page, typing a headcount in the first
 * moved it below the second: the tables swapped places under the cursor on
 * every keystroke.
 */
export function replaceBlockInPlace<T>(groups: T[], blockId: string, next: T[], keyOf: (g: T) => string): T[] {
  const first = groups.findIndex(g => keyOf(g) === blockId)
  const rest = groups.filter(g => keyOf(g) !== blockId)
  if (first < 0) return [...rest, ...next]
  const pos = groups.slice(0, first).filter(g => keyOf(g) !== blockId).length
  return [...rest.slice(0, pos), ...next, ...rest.slice(pos)]
}
