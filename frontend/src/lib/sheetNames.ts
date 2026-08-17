/**
 * Worksheet naming, kept free of store imports so it can be tested.
 *
 * lib/exportData reaches the auth and timetable stores for print branding,
 * which drags in import.meta.env and cannot be imported outside Vite. The
 * same split as lib/permissionPolicy: the rule lives where a test can reach
 * it, the wiring stays where it belongs.
 */

/**
 * A worksheet name Excel will actually accept.
 *
 * Sheet names come from section names, which a school types. Three ordinary
 * cases made the whole export throw — and the caller never caught it, so the
 * menu closed and no file appeared, with nothing said:
 *
 *   · two sections sharing a name (this app deliberately allows that — see
 *     lib/nameConflicts — so the export must cope with it);
 *   · two long names that are identical in their first 31 characters, which is
 *     where Excel truncates;
 *   · a name containing : \ / ? * [ ], and "I-A/B" is a normal way to write a
 *     combined class.
 *
 * So: replace what Excel forbids, truncate, then make it unique. Uniqueness is
 * checked case-insensitively because Excel will not hold "I-A" and "i-a" either.
 */
export function safeSheetName(name: string, used: Set<string>): string {
  const cleaned = (name ?? '').replace(/[:\\/?*[\]]/g, '-').trim().slice(0, 31)
  let candidate = cleaned || 'Sheet'
  // Suffix until free, trimming the STEM rather than the suffix, so the
  // disambiguator is never itself cut off and made to collide again.
  for (let n = 2; used.has(candidate.toLowerCase()); n++) {
    const suffix = ` (${n})`
    candidate = (cleaned || 'Sheet').slice(0, 31 - suffix.length) + suffix
  }
  used.add(candidate.toLowerCase())
  return candidate
}
