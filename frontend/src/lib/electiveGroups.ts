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

// ── Who teaches each split group, and where ─────────────────────────────

/** A room's stated capacity is a comfortable number, not a fire limit: a
 *  classroom for 40 takes 50 with extra chairs. Groups are only split, and a
 *  room only counted as too small, beyond this. */
export const ROOM_STRETCH = 1.25
export const seatsWithStretch = (cap: number) => Math.floor(cap * ROOM_STRETCH)

export interface TeachingGroupLike {
  subjects: string[]
  bundleName?: string
  sectionSlices: Array<{ sectionName: string; studentCount: number }>
  totalStrength: number
  teacher?: string
  room?: string
  roomCapacity?: number
  capacityWarning?: boolean
}

/** Teaching groups that share a section run in the SAME period: the class
 *  splits, and every part of it is somewhere at once. Groups with no section
 *  in common can run at different times. */
export function simultaneousPools<T extends TeachingGroupLike>(tgs: T[]): T[][] {
  const parent = new Map<string, string>()
  const find = (x: string): string => {
    while (parent.get(x) !== x) { parent.set(x, parent.get(parent.get(x)!)!); x = parent.get(x)! }
    return x
  }
  for (const g of tgs) for (const s of g.sectionSlices) if (!parent.has(s.sectionName)) parent.set(s.sectionName, s.sectionName)
  for (const g of tgs) {
    const secs = g.sectionSlices.map(s => s.sectionName)
    for (let i = 1; i < secs.length; i++) parent.set(find(secs[i]), find(secs[0]))
  }
  const pools = new Map<string, T[]>()
  for (const g of tgs) {
    const root = g.sectionSlices.length ? find(g.sectionSlices[0].sectionName) : `__${pools.size}`
    pools.set(root, [...(pools.get(root) ?? []), g])
  }
  return [...pools.values()]
}

const roomName = (r: any): string => String(r?.actualName || r?.generatedName || r?.name || '').trim()
const teachesSubject = (t: any, sub: string): boolean =>
  (t?.subjects ?? []).includes(sub) || (t?.subjectMappings ?? []).some((m: any) => m?.subject === sub)
const mappedTo = (t: any, sub: string, secs: string[]): boolean =>
  (t?.subjectMappings ?? []).some((m: any) => m?.subject === sub && (m?.classes ?? []).some((c: string) => secs.includes(c))) ||
  (teachesSubject(t, sub) && (t?.classes ?? []).some((c: string) => secs.includes(c)))

/**
 * Give every split group a teacher and a venue.
 *
 * Found live: a VI-X language split gave all ten Sanskrit groups Teacher 14
 * and no room at all. Groups that run in the same period need different
 * people in different rooms, so within one pool (simultaneousPools) neither
 * repeats. Teachers come from those who teach the subject, preferring ones
 * mapped to these classes, least-used first. Venues: the home room of the
 * class with most students in the group, then the pool's other home rooms,
 * then rooms that are nobody's home (labs, library, spare). Never the home
 * room of a class outside the pool: that class is in a lesson there. A room
 * that is too small is still used when nothing fits, and flagged.
 *
 * `keep` returns a teacher/room the school set by hand, which wins.
 */
export function assignStaffAndVenues<T extends TeachingGroupLike>(
  tgs: T[], staff: any[], rooms: any[], sections: any[],
  keep?: (g: T) => { teacher?: string; room?: string } | undefined,
  opts: { homeOnly?: boolean } = {},
): T[] {
  const homeOf = new Map<string, string>()
  for (const s of sections ?? []) if (s?.name && s?.room) homeOf.set(s.name, String(s.room).trim())
  const allHomes = new Set(homeOf.values())
  const capOf = new Map<string, number>()
  const typeOf = new Map<string, string>()
  for (const r of rooms ?? []) {
    const n = roomName(r)
    if (!n) continue
    capOf.set(n, Number(r?.capacity ?? r?.seats ?? 0) || 0)
    typeOf.set(n, `${r?.roomType ?? r?.type ?? ''} ${n}`.toLowerCase())
  }
  // Which spare room suits a subject: one made for it (Computer Lab for
  // Computer Science), then ordinary spaces, and other specialist rooms last.
  // Found live: every Odia group went to the Computer Lab, which Computer
  // Science needed and nobody teaches a language in.
  const SPECIAL = /lab|workshop|studio|gym|pool|ground|court|auditorium|music|art room/
  const suits = (room: string, sub: string): number => {
    const t = typeOf.get(room) ?? ''
    const s = sub.toLowerCase()
    if ((LANGUAGE_RE.test(s) && /language/.test(t)) ||
        (/computer|informatics|\bit\b|coding/.test(s) && /computer/.test(t)) ||
        (/physics|chemistry|biology|science/.test(s) && /lab/.test(t) && !/computer/.test(t)) ||
        (/music/.test(s) && /music/.test(t)) || (/art|drawing|painting|craft/.test(s) && /art|studio/.test(t)) ||
        (/physical|sport|games|yoga|p\.?e\b/.test(s) && /gym|ground|court|hall/.test(t))) return 0
    return SPECIAL.test(t) ? 2 : 1
  }
  const use = new Map<string, number>()
  const out = new Map<T, T>()

  for (const pool of simultaneousPools(tgs)) {
    const poolSecs = new Set(pool.flatMap(g => g.sectionSlices.map(s => s.sectionName)))
    const poolHomes = [...poolSecs].map(s => homeOf.get(s)).filter(Boolean) as string[]
    // Home venue only: the pooled classes' own rooms and nothing else.
    const spare = opts.homeOnly ? [] : [...capOf.keys()].filter(n => !allHomes.has(n))
    // Another class's home room is a venue too when that class is not in it;
    // only the timetable knows when that is, so it is planned last here and
    // the engine confirms it is free at the hour it is used.
    const otherHomes = opts.homeOnly ? [] : [...allHomes].filter(n => !poolHomes.includes(n) && capOf.has(n))
    const usedT = new Set<string>(), usedR = new Set<string>()
    // Hand-set choices are taken first so automatic ones work around them.
    for (const g of pool) { const k = keep?.(g); if (k?.teacher) usedT.add(k.teacher); if (k?.room) usedR.add(k.room) }

    for (const g of [...pool].sort((a, b) => b.totalStrength - a.totalStrength)) {
      const sub = g.subjects[0] ?? g.bundleName ?? ''
      const secs = g.sectionSlices.map(s => s.sectionName)
      const k = keep?.(g)

      let teacher = k?.teacher ?? ''
      if (!teacher) {
        const pick = staff
          .filter(t => teachesSubject(t, sub) && !usedT.has(t.name))
          .sort((a, b) => (mappedTo(b, sub, secs) ? 1 : 0) - (mappedTo(a, sub, secs) ? 1 : 0) || (use.get(a.name) ?? 0) - (use.get(b.name) ?? 0))[0]
        teacher = pick?.name ?? ''
      }
      if (teacher) { usedT.add(teacher); use.set(teacher, (use.get(teacher) ?? 0) + 1) }

      let room = k?.room ?? ''
      if (!room) {
        const own = [...g.sectionSlices].sort((a, b) => b.studentCount - a.studentCount).map(s => homeOf.get(s.sectionName)).filter(Boolean) as string[]
        // A home room of one of the pooled classes first. Failing that, the
        // most fitting other room: suited to the subject, then the smallest
        // that holds the group, so a group of 30 is not sent to the hall.
        const fits = (n: string) => (capOf.get(n) ?? 0) === 0 || seatsWithStretch(capOf.get(n) ?? 0) >= g.totalStrength
        const spareForSub = [...spare].sort((a, b) =>
          suits(a, sub) - suits(b, sub) ||
          (fits(a) === fits(b) ? 0 : fits(a) ? -1 : 1) ||
          (capOf.get(a) ?? 0) - (capOf.get(b) ?? 0))
        const bySize = (list: string[]) => [...list].sort((a, b) =>
          (fits(a) === fits(b) ? 0 : fits(a) ? -1 : 1) || (capOf.get(a) ?? 0) - (capOf.get(b) ?? 0))
        const order = [...new Set([...own, ...poolHomes, ...spareForSub, ...bySize(otherHomes)])].filter(n => !usedR.has(n))
        room = order.find(fits) ?? [...order].sort((a, b) => (capOf.get(b) ?? 0) - (capOf.get(a) ?? 0))[0] ?? ''
      }
      if (room) usedR.add(room)
      const cap = capOf.get(room) ?? 0
      out.set(g, { ...g, teacher, room, roomCapacity: cap || undefined, capacityWarning: !!cap && seatsWithStretch(cap) < g.totalStrength })
    }
  }
  return tgs.map(g => out.get(g) ?? g)
}

/**
 * Make the Subjects list agree with the AND groups after an edit.
 *
 * A class in a group takes the subject as an elective there; a class marked
 * not-applicable (-1) does not take it at all. Every OTHER class keeps
 * exactly what it had. This used to mark the subject elective in every class
 * that teaches it: grouping Maths/Computer Science for class X made them
 * electives in VI-IX too, and the skip warning then listed eight classes that
 * had never had an elective.
 *
 * Returns the new subjects, and whether anything changed.
 */
export function reconcileElectiveScope(subjects: any[], groups: any[]): { subjects: any[]; changed: boolean } {
  const inGroup = new Map<string, Set<string>>()
  const notOffered = new Map<string, Set<string>>()
  for (const g of groups ?? []) {
    for (const sub of groupColumns(g)) {
      if (!inGroup.has(sub)) { inGroup.set(sub, new Set()); notOffered.set(sub, new Set()) }
      for (const sec of g?.applicableSections ?? []) {
        if ((g?.strengthMatrix?.[sec]?.[sub] ?? 0) < 0) notOffered.get(sub)!.add(sec)
        else inGroup.get(sub)!.add(sec)
      }
    }
  }
  let changed = false
  const next = (subjects ?? []).map((s: any) => {
    const grouped = inGroup.get(s.name)
    if (!grouped) return s
    const drop = notOffered.get(s.name)!
    const cfgs = (s.classConfigs ?? []) as any[]
    const have = new Set(cfgs.map(c => c?.sectionName).filter(Boolean))
    const kept = cfgs
      .filter(c => !drop.has(c?.sectionName))
      .map(c => grouped.has(c?.sectionName) ? { ...c, isOptional: true } : c)
    const added = [...grouped].filter(sec => !have.has(sec) && !drop.has(sec)).map(sec => ({
      sectionName: sec, periodsPerWeek: s.periodsPerWeek ?? 5, maxPeriodsPerDay: 1,
      sessionDuration: s.sessionDuration ?? 45, isOptional: true,
    }))
    const classConfigs = [...kept, ...added]
    const sections = [...new Set(classConfigs.map(c => c.sectionName).filter(Boolean))]
    const out = { ...s, isOptional: true, sections, classConfigs }
    if (JSON.stringify(out) !== JSON.stringify(s)) changed = true
    return out
  })
  return { subjects: next, changed }
}
