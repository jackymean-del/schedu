// Verify elective SCOPE: PE taught everywhere but elective ONLY in XI/XII
// must produce a combo card spanning XI/XII sections only - not LKG–X.
import { suggestAndComboGroups } from './src/routes/wizard/step-student-groups'

const allSections = ['LKG-A', 'I-A', 'V-A', 'IX-A', 'XI-A', 'XI-B', 'XII-A']
const cfg = (sectionName: string, elective: boolean) => ({
  sectionName, periodsPerWeek: 1, maxPeriodsPerDay: 1, sessionDuration: 40,
  ...(elective ? { isOptional: true, electiveSlotId: 'senior-activity' } : {}),
})
const subjects = [
  { id: 'pe', name: 'Physical Education', isOptional: true,   // global flag set as side effect
    classConfigs: allSections.map(s => cfg(s, s.startsWith('XI') || s.startsWith('XII'))) },
  { id: 'paint', name: 'Painting', isOptional: true,
    classConfigs: ['XI-A', 'XI-B', 'XII-A'].map(s => cfg(s, true)) },
]
const sections = allSections.map(name => ({ id: name, name, grade: name.split('-')[0] }))

let fails = 0
const cards = suggestAndComboGroups(subjects as any[], sections as any[])
console.log('cards:', cards.length)
if (!cards.length) { console.log('FAIL no card suggested'); fails++ }
for (const c of cards) {
  console.log(`card "${c.name}": subjects=[${c.subjects.join(', ')}] sections=[${c.applicableSections.join(', ')}]`)
  const juniors = c.applicableSections.filter((s: string) => !/^X(I|II)-/.test(s))
  console.log('  no junior sections dragged in:', juniors.length === 0 ? 'PASS' : `FAIL (${juniors.join(', ')})`)
  if (juniors.length) fails++
}

// A suggested group marks a subject a class does not offer as not-applicable.
// Left at 0, "Split evenly" sent half of class X to Odia, which X does not
// teach, and saving the group then switched Odia on for X.
{
  const langSecs = ['VI-A', 'IX-A', 'X-A']
  const lcfg = (sectionName: string) => ({ sectionName, periodsPerWeek: 2, maxPeriodsPerDay: 1, sessionDuration: 40, isOptional: true })
  const langs = [
    { id: 'san', name: 'Sanskrit', category: 'Scholastic', isOptional: true, classConfigs: langSecs.map(lcfg) },
    { id: 'odi', name: 'Odia', category: 'Scholastic', isOptional: true, classConfigs: ['VI-A', 'IX-A'].map(lcfg) },
  ]
  const lsections = langSecs.map(name => ({ id: name, name, grade: name.split('-')[0] }))
  const [card] = suggestAndComboGroups(langs as any[], lsections as any[])
  const m = card?.strengthMatrix ?? {}
  const ok = !!card && m['X-A']?.['Odia'] === -1 && m['X-A']?.['Sanskrit'] === undefined &&
    m['VI-A']?.['Odia'] === undefined
  console.log(`${ok ? 'PASS' : 'FAIL'} a suggested group marks Odia not-applicable in X, where it is not offered (${JSON.stringify(m)})`)
  if (!ok) fails++
}

// Groups are built automatically when classes have electives, but never
// behind the school's back. The first version of the automatic build ran on
// every visit to an empty step, so a school that removed its groups had them
// back the next time it passed through. Guard the pattern: an effect that
// writes groups must honour the school's "no groups" decision
// (config.andGroupsDismissed).
{
  const { readdirSync, readFileSync, statSync } = await import('node:fs')
  const { join } = await import('node:path')
  const walk = (d: string, out: string[] = []): string[] => {
    for (const e of readdirSync(d)) {
      const p = join(d, e)
      if (statSync(p).isDirectory()) walk(p, out)
      else if (/\.(ts|tsx)$/.test(e)) out.push(p)
    }
    return out
  }
  const writers = /\b(setAndComboGroups|setSubjectGroups|commitGroups|setOptionalBlocks)\s*\(/
  const offenders: string[] = []
  for (const f of walk('src')) {
    const src = readFileSync(f, 'utf8')
    let i = 0
    while ((i = src.indexOf('useEffect(', i)) >= 0) {
      // The effect's whole argument list, by bracket count.
      let depth = 0, j = i + 'useEffect'.length
      for (; j < src.length; j++) {
        if (src[j] === '(') depth++
        else if (src[j] === ')' && --depth === 0) break
      }
      const line = src.slice(0, i).split(String.fromCharCode(10)).length
      const body = src.slice(i, j)
      if (writers.test(body) && !body.includes('andGroupsDismissed')) offenders.push(`${f.replace(/^src[\\/]/, '')}:${line}`)
      i = j
    }
  }
  const ok = offenders.length === 0
  console.log(`${ok ? 'PASS' : 'FAIL'} no effect creates groups against the school's "no groups" decision${ok ? '' : ` - ${offenders.join(', ')}`}`)
  if (!ok) fails++
}

// ── What goes in one AND group ──────────────────────────────────────────
// Class X takes Maths, Biology, Hindi, Odia and Sanskrit as electives. A
// student picks Maths OR Biology, and one language: two groups, not one
// five-room period. Grouping used to key on the category, and all five are
// "Scholastic".
{
  const { electiveFamily, ungroupedElectives, describeUngrouped, autoFillRow } = await import('./src/lib/electiveGroups.ts')
  const xs = ['X-A', 'X-B']
  const el = (name: string, secs = xs, extra: any = {}) => ({
    id: name, name, category: 'Scholastic', isOptional: true,
    classConfigs: secs.map(sectionName => ({ sectionName, periodsPerWeek: 3, maxPeriodsPerDay: 1, sessionDuration: 40, isOptional: true, ...extra })),
  })
  const subs = [el('Mathematics'), el('Biology'), el('Hindi'), el('Odia'), el('Sanskrit')]
  const secsX = xs.map(name => ({ id: name, name, grade: 'X' }))
  const cards = suggestAndComboGroups(subs as any[], secsX as any[])
  const sets = cards.map((c: any) => [...c.subjects].sort().join('+')).sort()
  const ok1 = sets.length === 2 && sets.includes('Biology+Mathematics') && sets.includes('Hindi+Odia+Sanskrit')
  console.log(`${ok1 ? 'PASS' : 'FAIL'} Maths/Biology and Hindi/Odia/Sanskrit are two groups, not one (${sets.join(' | ')})`)
  if (!ok1) fails++
  const ok1b = cards.every((c: any) => c.applicableSections.join() === 'X-A,X-B')
  console.log(`${ok1b ? 'PASS' : 'FAIL'} both cover the classes that take them`)
  if (!ok1b) fails++

  const fam = [electiveFamily('French'), electiveFamily('Painting', 'Co-Scholastic'), electiveFamily('Economics'), electiveFamily('Sanskrit / MIL')]
  const ok2 = fam.join() === 'language,activity,academic,language'
  console.log(`${ok2 ? 'PASS' : 'FAIL'} languages, activities and other subjects are told apart (${fam.join()})`)
  if (!ok2) fails++

  // The school's own slot wins over the family.
  const slotted = [el('Mathematics', xs, { electiveSlotId: 'R1' }), el('Hindi', xs, { electiveSlotId: 'R1' }), el('Biology'), el('Odia')]
  const sc = suggestAndComboGroups(slotted as any[], secsX as any[]).map((c: any) => [...c.subjects].sort().join('+')).sort()
  const ok3 = sc.includes('Hindi+Mathematics')
  console.log(`${ok3 ? 'PASS' : 'FAIL'} an elective slot the school set groups its subjects whatever their kind (${sc.join(' | ')})`)
  if (!ok3) fails++

  // What the skip warning lists.
  const none = ungroupedElectives(subs as any[], [])
  const ok4 = none.length === 2 && none[0].subjects.length === 5
  console.log(`${ok4 ? 'PASS' : 'FAIL'} with no groups, every elective of every class is listed (${describeUngrouped(none).join(' / ')})`)
  if (!ok4) fails++
  const some = ungroupedElectives(subs as any[], cards.filter((c: any) => c.subjects.includes('Hindi')))
  const ok5 = some.every(r => r.subjects.sort().join() === 'Biology,Mathematics')
  console.log(`${ok5 ? 'PASS' : 'FAIL'} with only the language group, Maths and Biology are still listed (${describeUngrouped(some).join(' / ')})`)
  if (!ok5) fails++
  const all = ungroupedElectives(subs as any[], cards)
  const ok6 = all.length === 0
  console.log(`${ok6 ? 'PASS' : 'FAIL'} with both groups, nothing is listed`)
  if (!ok6) fails++
  const naGroup = [{ ...cards[0], strengthMatrix: { 'X-B': { [cards[0].subjects[0]]: -1 } } }, cards[1]]
  const ok7 = ungroupedElectives(subs as any[], naGroup).some(r => r.section === 'X-B' && r.subjects.includes(cards[0].subjects[0]))
  console.log(`${ok7 ? 'PASS' : 'FAIL'} a subject marked not offered in a class does not count as grouped there`)
  if (!ok7) fails++

  // Typing one headcount fills the last one left.
  const two = autoFillRow({ Computer: 21 }, ['Computer', 'Mathematics'], 35, 'Computer')
  const ok8 = two.row.Mathematics === 14 && two.autoCol === 'Mathematics'
  console.log(`${ok8 ? 'PASS' : 'FAIL'} two subjects: 21 typed in a class of 35 fills 14 (${JSON.stringify(two.row)})`)
  if (!ok8) fails++
  const re = autoFillRow({ Computer: 20, Mathematics: 14 }, ['Computer', 'Mathematics'], 35, 'Computer', 'Mathematics')
  const ok9 = re.row.Mathematics === 15
  console.log(`${ok9 ? 'PASS' : 'FAIL'} changing the typed one re-fills the automatic one (${JSON.stringify(re.row)})`)
  if (!ok9) fails++
  const mine = autoFillRow({ Computer: 20, Mathematics: 10 }, ['Computer', 'Mathematics'], 35, 'Mathematics', 'Mathematics')
  const ok10 = mine.row.Computer === 20 && mine.row.Mathematics === 10 && mine.autoCol === undefined
  console.log(`${ok10 ? 'PASS' : 'FAIL'} typing into the automatic one makes it yours; nothing else moves (${JSON.stringify(mine.row)})`)
  if (!ok10) fails++
  const three1 = autoFillRow({ Hindi: 10 }, ['Hindi', 'Odia', 'Sanskrit'], 40, 'Hindi')
  const ok11 = !three1.row.Odia && !three1.row.Sanskrit && three1.autoCol === undefined
  console.log(`${ok11 ? 'PASS' : 'FAIL'} three subjects: one typed, two blank, nothing is guessed`)
  if (!ok11) fails++
  const three2 = autoFillRow({ Hindi: 10, Odia: 18 }, ['Hindi', 'Odia', 'Sanskrit'], 40, 'Odia')
  const ok12 = three2.row.Sanskrit === 12
  console.log(`${ok12 ? 'PASS' : 'FAIL'} three subjects: two typed fills the third with the rest (${JSON.stringify(three2.row)})`)
  if (!ok12) fails++
  const na = autoFillRow({ Hindi: 25, Odia: -1 }, ['Hindi', 'Odia', 'Sanskrit'], 40, 'Hindi')
  const ok13 = na.row.Odia === -1 && na.row.Sanskrit === 15
  console.log(`${ok13 ? 'PASS' : 'FAIL'} a subject not offered in the class is skipped, never filled (${JSON.stringify(na.row)})`)
  if (!ok13) fails++
  const over = autoFillRow({ Computer: 50 }, ['Computer', 'Mathematics'], 35, 'Computer')
  const ok14 = over.row.Mathematics === 0
  console.log(`${ok14 ? 'PASS' : 'FAIL'} more typed than the class holds fills 0, never a negative`)
  if (!ok14) fails++
}

// ── Editing a block keeps it where it is ──────────────────────────────────
// Each edit used to save the block by filtering it out and appending it, so
// with two blocks on the page the one being typed in jumped below the other
// on every keystroke.
{
  const { replaceBlockInPlace } = await import('./src/lib/electiveGroups.ts')
  const key = (g: any) => g.blockId
  const groups = [
    { id: 'lang', blockId: 'VI-X', n: 0 }, { id: 'subj', blockId: 'X', n: 0 }, { id: 'act', blockId: 'XI', n: 0 },
  ]
  const edited = replaceBlockInPlace(groups, 'VI-X', [{ id: 'lang', blockId: 'VI-X', n: 1 }], key)
  const order = edited.map(g => g.id).join()
  const ok1 = order === 'lang,subj,act' && edited[0].n === 1
  console.log(`${ok1 ? 'PASS' : 'FAIL'} editing the first block keeps it first (${order})`)
  if (!ok1) fails++
  const mid = replaceBlockInPlace(groups, 'X', [{ id: 'subj', blockId: 'X', n: 1 }, { id: 'subj2', blockId: 'X', n: 0 }], key)
  const ok2 = mid.map(g => g.id).join() === 'lang,subj,subj2,act'
  console.log(`${ok2 ? 'PASS' : 'FAIL'} a block that gains a group stays in its place (${mid.map(g => g.id).join()})`)
  if (!ok2) fails++
}

// ── Every split group gets its own teacher and venue ─────────────────────
// Found live: a VI-X language choice gave all ten Sanskrit groups Teacher 14
// and no room, and the timetable ran all ten classes in one period with one
// teacher. Groups that run together need different people in different
// rooms; classes that never mix are separate blocks at separate times.
{
  const { assignStaffAndVenues, simultaneousPools } = await import('./src/lib/electiveGroups.ts')
  const { andGroupsToOptionalBlocks } = await import('./src/lib/generationPipeline.ts')
  const secs = ['VI-A', 'VI-B', 'VII-A'].map(n => ({ name: n, room: `Room ${n}`, strength: 40 }))
  const rooms = [...secs.map(s => ({ actualName: s.room, capacity: 40 })), { actualName: 'Library', capacity: 40 }, { actualName: 'Lab', capacity: 30 }]
  const staff = [
    { name: 'T14', subjects: ['Sanskrit'], subjectMappings: [{ subject: 'Sanskrit', classes: ['VI-A', 'VI-B'] }] },
    { name: 'T15', subjects: ['Sanskrit'], subjectMappings: [{ subject: 'Sanskrit', classes: ['VII-A'] }] },
    { name: 'T16', subjects: ['Odia'] }, { name: 'T17', subjects: ['Odia'] },
  ]
  const tg = (sub: string, slices: Array<[string, number]>, extra: any = {}) => ({
    subjects: [sub], bundleName: sub, totalStrength: slices.reduce((a, [, n]) => a + n, 0),
    sectionSlices: slices.map(([sectionName, studentCount]) => ({ sectionName, studentCount })), ...extra,
  })

  // One class splitting: both groups at once.
  const one = assignStaffAndVenues([tg('Sanskrit', [['VI-A', 22]]), tg('Odia', [['VI-A', 18]])], staff, rooms, secs)
  const ok1 = one[0].teacher !== one[1].teacher && one[0].room !== one[1].room && !!one[0].room && !!one[1].room
  console.log(`${ok1 ? 'PASS' : 'FAIL'} one class splitting: two teachers, two rooms (${one.map(g => `${g.subjects[0]}=${g.teacher}@${g.room}`).join(', ')})`)
  if (!ok1) fails++
  const ok2 = one.every(g => g.room !== 'Room VI-B' && g.room !== 'Room VII-A')
  console.log(`${ok2 ? 'PASS' : 'FAIL'} prefers its own and spare rooms to another class's home room`)
  if (!ok2) fails++
  const ok3 = one.find(g => g.subjects[0] === 'Sanskrit')!.room === 'Room VI-A'
  console.log(`${ok3 ? 'PASS' : 'FAIL'} the bigger group stays in the class's own room`)
  if (!ok3) fails++

  // Two classes pooled (Cross): one period for both, rooms and teachers unique.
  const pooled = assignStaffAndVenues([tg('Sanskrit', [['VI-A', 20], ['VI-B', 20]]), tg('Odia', [['VI-A', 20], ['VI-B', 20]])], staff, rooms, secs)
  const ok4 = simultaneousPools(pooled).length === 1 && new Set(pooled.map(g => g.room)).size === 2 && new Set(pooled.map(g => g.teacher)).size === 2
  console.log(`${ok4 ? 'PASS' : 'FAIL'} pooled classes share one period, and still no shared teacher or room (${pooled.map(g => `${g.teacher}@${g.room}`).join(', ')})`)
  if (!ok4) fails++

  // The spare room suits the subject: a language never takes the Computer
  // Lab while an ordinary room is free; Computer Science goes to the lab.
  const labRooms = [{ actualName: 'Room VI-A', capacity: 40 }, { actualName: 'Computer Lab', roomType: 'Computer Lab', capacity: 40 }, { actualName: 'Library', roomType: 'Library', capacity: 40 }]
  const lang = assignStaffAndVenues([tg('Sanskrit', [['VI-A', 22]]), tg('Odia', [['VI-A', 18]])], staff, labRooms, secs)
  const cs = assignStaffAndVenues([tg('Mathematics', [['VI-A', 22]]), tg('Computer Science', [['VI-A', 18]])], [...staff, { name: 'T3', subjects: ['Mathematics'] }, { name: 'T11', subjects: ['Computer Science'] }], labRooms, secs)
  const ok9 = lang.find(g => g.subjects[0] === 'Odia')!.room === 'Library' && cs.find(g => g.subjects[0] === 'Computer Science')!.room === 'Computer Lab'
  console.log(`${ok9 ? 'PASS' : 'FAIL'} languages get an ordinary spare room, Computer Science the Computer Lab (${lang[1].room}, ${cs[1].room})`)
  if (!ok9) fails++

  // Too small a room is used only when nothing fits, and flagged.
  const big = assignStaffAndVenues([tg('Sanskrit', [['VI-A', 55]]), tg('Odia', [['VI-A', 55]])], staff, [{ actualName: 'Room VI-A', capacity: 40 }, { actualName: 'Lab', capacity: 30 }], secs)
  const ok5 = big.every(g => g.capacityWarning === true)
  console.log(`${ok5 ? 'PASS' : 'FAIL'} a group bigger than every free room is placed and flagged, not dropped`)
  if (!ok5) fails++

  // The timetable side: classes that never mix are separate blocks.
  const langGroup: any = {
    id: 'lang', name: 'Language choice', applicableSections: ['VI-A', 'VI-B', 'VII-A'], subjects: ['Sanskrit', 'Odia'],
    bundles: [{ id: 'Sanskrit', name: 'Sanskrit', subjects: ['Sanskrit'] }, { id: 'Odia', name: 'Odia', subjects: ['Odia'] }],
    strengthMatrix: {}, groupingScope: { section: 'same', grade: 'same', stream: 'same', block: 'same' },
    // Saved before this fix: one teacher for every Sanskrit group, no rooms.
    generatedGroups: ['VI-A', 'VI-B', 'VII-A'].flatMap(sec => [
      tg('Sanskrit', [[sec, 20]], { id: `s-${sec}`, bundleId: 'Sanskrit', teacher: 'T14', room: '' }),
      tg('Odia', [[sec, 20]], { id: `o-${sec}`, bundleId: 'Odia', teacher: 'T16', room: '' }),
    ]),
  }
  const blocks = andGroupsToOptionalBlocks([langGroup], [], staff, secs, rooms)
  const ok6 = blocks.length === 3 && blocks.every((b: any) => b.sectionNames.length === 1 && b.options.length === 2)
  console.log(`${ok6 ? 'PASS' : 'FAIL'} three classes that never mix are three blocks, not one ten-class period (${blocks.map((b: any) => b.sectionNames.join('+')).join(' | ')})`)
  if (!ok6) fails++
  const ok7 = blocks.every((b: any) => new Set(b.options.map((o: any) => o.teacher)).size === b.options.length
    && new Set(b.options.map((o: any) => o.room)).size === b.options.length && b.options.every((o: any) => o.teacher && o.room))
  console.log(`${ok7 ? 'PASS' : 'FAIL'} every block's groups have their own teacher and room (${blocks.map((b: any) => b.options.map((o: any) => `${o.subject}=${o.teacher}@${o.room}`).join(' ')).join(' | ')})`)
  if (!ok7) fails++

  // A teacher set by hand is kept, even over the automatic preference.
  const handSet = { ...langGroup, generatedGroups: langGroup.generatedGroups.map((g: any) => g.id === 's-VII-A' ? { ...g, teacher: 'T14', teacherByHand: true } : { ...g, teacher: '' }) }
  const hb = andGroupsToOptionalBlocks([handSet], [], staff, secs, rooms).find((b: any) => b.sectionNames[0] === 'VII-A')
  const ok8 = hb?.options.find((o: any) => o.subject === 'Sanskrit')?.teacher === 'T14'
  console.log(`${ok8 ? 'PASS' : 'FAIL'} a teacher chosen by hand survives (VII-A Sanskrit stays with T14, not the mapped T15)`)
  if (!ok8) fails++
}

// ── Saving a group changes only the classes it covers ───────────────────
// Grouping Maths/Computer Science for class X marked them elective in every
// class that teaches them, so VI-IX suddenly "had electives" and the skip
// warning listed eight classes that never chose anything.
{
  const { reconcileElectiveScope } = await import('./src/lib/electiveGroups.ts')
  const all = ['VI-A', 'IX-A', 'X-A', 'X-B']
  const cfg = (sectionName: string, isOptional = false) => ({ sectionName, periodsPerWeek: 5, maxPeriodsPerDay: 1, sessionDuration: 40, ...(isOptional ? { isOptional: true } : {}) })
  const subs = [
    { name: 'Mathematics', classConfigs: all.map(s => cfg(s, s.startsWith('X'))) },
    { name: 'Computer Science', classConfigs: all.map(s => cfg(s, s.startsWith('X'))) },
    { name: 'English', classConfigs: all.map(s => cfg(s)) },
  ]
  const grp = [{ applicableSections: ['X-A', 'X-B'], subjects: ['Mathematics', 'Computer Science'], strengthMatrix: { 'X-B': { 'Computer Science': -1 } } }]
  const { subjects: out, changed } = reconcileElectiveScope(subs, grp)
  const maths = out.find((x: any) => x.name === 'Mathematics')
  const cs = out.find((x: any) => x.name === 'Computer Science')
  const electiveIn = (x: any) => x.classConfigs.filter((c: any) => c.isOptional).map((c: any) => c.sectionName).join(',')
  const ok1 = electiveIn(maths) === 'X-A,X-B'
  console.log(`${ok1 ? 'PASS' : 'FAIL'} Maths stays compulsory in VI-A and IX-A; elective only in X (${electiveIn(maths)})`)
  if (!ok1) fails++
  const ok2 = !cs.classConfigs.some((c: any) => c.sectionName === 'X-B') && cs.classConfigs.some((c: any) => c.sectionName === 'VI-A' && !c.isOptional)
  console.log(`${ok2 ? 'PASS' : 'FAIL'} not-applicable in X-B drops Computer Science there, and only there`)
  if (!ok2) fails++
  const ok3 = out.find((x: any) => x.name === 'English') === subs[2] && changed
  console.log(`${ok3 ? 'PASS' : 'FAIL'} a subject in no group is left exactly as it was`)
  if (!ok3) fails++
  const again = reconcileElectiveScope(out, grp)
  console.log(`${!again.changed ? 'PASS' : 'FAIL'} saving the same groups again changes nothing`)
  if (again.changed) fails++
}

// ── The owner's rules for AND groups (2026-10-03) ──────────────────────
// 1. at least cross-section; 2. one group per subject holding every pooled
// section (VI-A 20 + VI-B 25 Hindi = one group of 45, one teacher, one room);
// 3. a pooled class's home room first, 125% of stated seats is fine, then the
// most fitting free room, which may be another class's home when that class
// is not in it; 4. activities pool across classes; 5. "home venue only".
{
  const { assignStaffAndVenues, ROOM_STRETCH } = await import('./src/lib/electiveGroups.ts')
  const { andGroupsToOptionalBlocks } = await import('./src/lib/generationPipeline.ts')
  const { solveTimetable } = await import('./src/lib/schedulingEngine.ts')
  const S = ['VI-A', 'VI-B', 'VII-A', 'VII-B']
  const secs = S.map(n => ({ name: n, room: `Room ${n}`, strength: 40 }))
  const homes = secs.map(x => ({ actualName: x.room, capacity: 40 }))
  const staff = ['Hindi', 'Odia', 'Sanskrit', 'Physical Education'].flatMap(sub => [1, 2].map(i => ({ name: `${sub} ${i}`, subjects: [sub] })))

  // Suggestions default to cross-section; activities to cross-class.
  const el = (name: string, cat = 'Scholastic') => ({ name, category: cat, isOptional: true,
    classConfigs: S.map(sectionName => ({ sectionName, periodsPerWeek: 2, maxPeriodsPerDay: 1, sessionDuration: 40, isOptional: true })) })
  const sug = suggestAndComboGroups([el('Hindi'), el('Odia'), el('Physical Education', 'Co-Scholastic'), el('Painting', 'Co-Scholastic')] as any[],
    S.map(n => ({ id: n, name: n, grade: n.split('-')[0] })) as any[])
  const lang = sug.find((c: any) => c.subjects.includes('Hindi')) as any
  const act = sug.find((c: any) => c.subjects.includes('Physical Education')) as any
  const ok1 = lang?.groupingScope?.section === 'cross' && lang?.groupingScope?.grade === 'same' && act?.groupingScope?.grade === 'cross'
  console.log(`${ok1 ? 'PASS' : 'FAIL'} languages pool across sections, activities across classes too (${JSON.stringify(lang?.groupingScope)} / ${JSON.stringify(act?.groupingScope)})`)
  if (!ok1) fails++

  // The owner's example, through the timetable side.
  const g: any = {
    id: 'lang', name: 'Language choice', applicableSections: ['VI-A', 'VI-B'], subjects: ['Hindi', 'Odia'],
    bundles: [{ id: 'Hindi', name: 'Hindi', subjects: ['Hindi'] }, { id: 'Odia', name: 'Odia', subjects: ['Odia'] }],
    groupingScope: { section: 'cross', grade: 'same', stream: 'same', block: 'same' },
    strengthMatrix: { 'VI-A': { Hindi: 20, Odia: 20 }, 'VI-B': { Hindi: 25, Odia: 15 } },
  }
  const [b] = andGroupsToOptionalBlocks([g], [], staff, secs, [...homes, { actualName: 'Library', capacity: 60 }]) as any[]
  const hindi = b?.options.find((o: any) => o.subject === 'Hindi')
  const odia = b?.options.find((o: any) => o.subject === 'Odia')
  const ok2 = b?.sectionNames.join() === 'VI-A,VI-B' && b.options.length === 2 && hindi?.allocatedStrength === 45 && odia?.allocatedStrength === 35
  console.log(`${ok2 ? 'PASS' : 'FAIL'} VI-A 20 + VI-B 25 Hindi is ONE group of 45, Odia one of 35, in one block (${b?.options.map((o: any) => `${o.subject} ${o.allocatedStrength}`).join(', ')})`)
  if (!ok2) fails++
  const ok3 = ['Room VI-A', 'Room VI-B'].includes(hindi?.room) && ['Room VI-A', 'Room VI-B'].includes(odia?.room) && hindi?.room !== odia?.room && hindi?.teacher && odia?.teacher
  console.log(`${ok3 ? 'PASS' : 'FAIL'} each group has one teacher and a home room of VI-A or VI-B, 45 in a room for 40 included (${hindi?.teacher}@${hindi?.room}, ${odia?.teacher}@${odia?.room})`)
  if (!ok3) fails++
  const ok4 = ROOM_STRETCH === 1.25
  console.log(`${ok4 ? 'PASS' : 'FAIL'} a room for 40 is counted as holding 50`)
  if (!ok4) fails++

  // A third subject: no home room left, so the most fitting free room.
  const three = assignStaffAndVenues([
    { subjects: ['Hindi'], sectionSlices: [{ sectionName: 'VI-A', studentCount: 15 }, { sectionName: 'VI-B', studentCount: 15 }], totalStrength: 30 },
    { subjects: ['Odia'], sectionSlices: [{ sectionName: 'VI-A', studentCount: 15 }, { sectionName: 'VI-B', studentCount: 15 }], totalStrength: 30 },
    { subjects: ['Sanskrit'], sectionSlices: [{ sectionName: 'VI-A', studentCount: 10 }, { sectionName: 'VI-B', studentCount: 10 }], totalStrength: 20 },
  ] as any[], staff, [...homes, { actualName: 'Hall', capacity: 200 }, { actualName: 'Language Room', roomType: 'Language Room', capacity: 25 }], secs)
  const ok5 = three[2].room === 'Language Room'
  console.log(`${ok5 ? 'PASS' : 'FAIL'} the third group goes to the most fitting free room, not the hall (${three[2].room})`)
  if (!ok5) fails++
  const onlyHomes = assignStaffAndVenues(three.map((x: any) => ({ ...x, room: undefined })), staff, homes, secs)
  const ok6 = onlyHomes[2].room === 'Room VII-A' || onlyHomes[2].room === 'Room VII-B'
  console.log(`${ok6 ? 'PASS' : 'FAIL'} with no other room, another class's home room is planned (the timetable checks it is free) (${onlyHomes[2].room})`)
  if (!ok6) fails++
  const homeOnly = assignStaffAndVenues(three.map((x: any) => ({ ...x, room: undefined })), staff, [...homes, { actualName: 'Library', capacity: 60 }], secs, undefined, { homeOnly: true })
  const ok7 = homeOnly.every((x: any) => ['Room VI-A', 'Room VI-B', ''].includes(x.room ?? '')) && !homeOnly.some((x: any) => x.room === 'Library')
  console.log(`${ok7 ? 'PASS' : 'FAIL'} "home venue only" never leaves the pooled classes' rooms (${homeOnly.map((x: any) => x.room || '(none)').join(', ')})`)
  if (!ok7) fails++

  // The timetable: a group planned into another class's home room only sits
  // there when that class is not using it, and no room is ever double-booked.
  const block = { id: 'b1', name: 'VI split', sectionNames: ['VI-A', 'VI-B'], logic: 'AND', periodsPerWeek: 2,
    options: [
      { subject: 'Hindi', teacher: 'Hindi 1', room: 'Room VI-A', allocatedStrength: 30 },
      { subject: 'Odia', teacher: 'Odia 1', room: 'Room VI-B', allocatedStrength: 30 },
      { subject: 'Sanskrit', teacher: 'Sanskrit 1', room: 'Room VII-A', allocatedStrength: 20 },
    ] }
  const subs = ['English', 'Mathematics', 'Hindi', 'Odia', 'Sanskrit']
  const alloc: any = {}
  for (const sn of S) alloc[sn] = { English: '6', Mathematics: '6', Hindi: '2', Odia: '2', Sanskrit: '2' }
  const out: any = solveTimetable({
    sections: secs.map(x => ({ ...x, id: x.name, grade: x.name.split('-')[0], classTeacher: '' })) as any,
    staff: [...staff, ...['English', 'Mathematics'].flatMap(sub => [1, 2].map(i => ({ name: `${sub} ${i}`, subjects: [sub] })))].map((x: any, i) => ({ id: 's' + i, classes: [], isClassTeacher: '', maxPeriodsPerWeek: 30, ...x })) as any,
    subjects: subs.map((n, i) => ({ id: 'q' + i, name: n, periodsPerWeek: 2 })) as any,
    periods: [1, 2, 3, 4, 5, 6].map(i => ({ id: `p${i}`, name: `P${i}`, duration: 40, type: 'class' })) as any,
    workDays: ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY'], requirements: [], subjectAllocations: alloc,
    rooms: [...homes, { actualName: 'Library', capacity: 60 }] as any, optionalBlocks: [block] as any,
  } as any)
  const tt = out.classTT ?? {}
  let blockCells = 0, badHome = 0, clashes = 0
  for (const d of ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY']) for (const p of ['p1', 'p2', 'p3', 'p4', 'p5', 'p6']) {
    const used = new Map<string, string>()
    for (const sn of S) {
      const c = tt[sn]?.[d]?.[p]
      if (!c?.subject) continue
      const rooms: string[] = c.optionalBlockId ? (c.options ?? []).map((o: any) => o.room) : [c.room]
      if (c.optionalBlockId && sn === 'VI-A') {
        blockCells++
        for (const r of rooms) {
          const owner = S.find(x => `Room ${x}` === r)
          // Its class may have no lesson at all then: a lesson moved elsewhere
          // to make room counts as taking the room it was using.
          if (owner && !['VI-A', 'VI-B'].includes(owner) && tt[owner]?.[d]?.[p]?.subject) badHome++
        }
      }
      if (c.optionalBlockId && sn !== 'VI-A') continue
      for (const r of rooms) { if (!r) continue; if (used.has(r) && used.get(r) !== sn) clashes++; used.set(r, sn) }
    }
  }
  const ok8 = blockCells >= 2 && badHome === 0 && clashes === 0
  console.log(`${ok8 ? 'PASS' : 'FAIL'} the split runs, never in a room its class is using, and no room is double-booked (${blockCells} split periods, ${badHome} in an occupied home, ${clashes} clashes)`)
  if (!ok8) fails++
}

// ── Sections of a class pool; streams stay apart ─────────────────────────
// "VI-A" was read as class VI, stream "A", so under "Stream: Same" VI-A and
// VI-B never pooled, and every section got its own Hindi group.
{
  const { generateAndGroups } = await import('./src/routes/wizard/step-student-groups.tsx')
  const scope = { section: 'cross', grade: 'same', stream: 'same', block: 'same' }
  const mk = (secs: string[], sm: any) => ({ id: 'g', name: 'g', applicableSections: secs, subjects: ['Hindi', 'Odia'],
    bundles: [{ id: 'Hindi', name: 'Hindi', subjects: ['Hindi'] }, { id: 'Odia', name: 'Odia', subjects: ['Odia'] }],
    groupingScope: scope, strengthMatrix: sm, roomCapacitySensitive: true })
  const rooms = [{ name: 'Room VI-A', capacity: 40 }, { name: 'Room VI-B', capacity: 40 }]
  const vi = generateAndGroups(mk(['VI-A', 'VI-B'], { 'VI-A': { Hindi: 20, Odia: 20 }, 'VI-B': { Hindi: 25, Odia: 15 } }) as any, rooms, [],
    [{ name: 'VI-A', room: 'Room VI-A' }, { name: 'VI-B', room: 'Room VI-B' }])
  const h = vi.find((x: any) => x.subjects[0] === 'Hindi')
  const ok1 = vi.length === 2 && h?.sectionSlices.map((x: any) => `${x.sectionName} ${x.studentCount}`).join(', ') === 'VI-A 20, VI-B 25' && h?.totalStrength === 45
  console.log(`${ok1 ? 'PASS' : 'FAIL'} VI-A and VI-B pool: one Hindi group of 45 (VI-A 20, VI-B 25) (${vi.map((x: any) => x.subjects[0] + ' ' + x.totalStrength).join(', ')})`)
  if (!ok1) fails++
  const xi = generateAndGroups(mk(['XI-Sci-A', 'XI-Com-A'], { 'XI-Sci-A': { Hindi: 20, Odia: 20 }, 'XI-Com-A': { Hindi: 20, Odia: 20 } }) as any, [{ name: 'R', capacity: 60 }], [], [])
  const ok2 = xi.length === 4
  console.log(`${ok2 ? 'PASS' : 'FAIL'} different streams stay apart under "Stream: Same" (${xi.length} groups)`)
  if (!ok2) fails++
}

// A removed group stays removed. The pipeline used to turn the LAST run's
// output (dynamicLearningGroups, saved for display) back into blocks, so a
// school that deleted its Sanskrit/Odia split and regenerated got all 20
// split periods back. Run the real pipeline twice: with the group, then
// without it but with the first run's output still in the store.
{
  const { runGenerationPipeline } = await import('./src/lib/generationPipeline.ts')
  const secs = ['VI-A', 'VI-B'].map(n => ({ id: n, name: n, grade: 'VI', strength: 40 }))
  const subs: Record<string, number> = { English: 6, Mathematics: 6, Science: 5, Hindi: 5, Sanskrit: 3, Odia: 3 }
  const staff = Object.keys(subs).flatMap(s => [0, 1].map(i => ({ id: `${s}${i}`, name: `${s} ${i}`, subjects: [s], classes: [], maxPeriodsPerWeek: 30 })))
  const alloc: Record<string, Record<string, string>> = {}
  for (const s of secs) { alloc[s.name] = {}; for (const k in subs) alloc[s.name][k] = String(subs[k]) }
  const base: any = {
    config: { workDays: ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY'], periodsPerDay: 8 },
    sections: secs, staff, breaks: [], andComboGroups: [], dynamicLearningGroups: [],
    subjects: Object.keys(subs).map((n, i) => ({ id: 's' + i, name: n, periodsPerWeek: subs[n] })),
    subjectCombinations: [], sectionStrengths: [], subjectAllocations: alloc, rooms: [], teacherAvailability: {}, subjectGroups: [],
  }
  const block = {
    id: 'lang', name: 'Third language', sectionNames: ['VI-A', 'VI-B'], logic: 'AND', periodsPerWeek: 3,
    options: [{ subject: 'Sanskrit', teacher: 'Sanskrit 0', room: 'L1' }, { subject: 'Odia', teacher: 'Odia 0', room: 'L2' }],
  }
  const blockCells = (classTT: any) => {
    let n = 0
    for (const days of Object.values(classTT ?? {})) for (const slots of Object.values(days as any)) for (const c of Object.values(slots as any)) if ((c as any)?.optionalBlockId) n++
    return n
  }
  const first = runGenerationPipeline({ ...base, optionalBlocks: [block] })
  const leftover = first.output?.dynamicLearningGroups ?? []
  const second = runGenerationPipeline({ ...base, optionalBlocks: [], dynamicLearningGroups: leftover })
  const ran = blockCells(first.classTT) > 0 && leftover.length > 0
  console.log(`${ran ? 'PASS' : 'FAIL'} with the group, the split runs and is reported (${blockCells(first.classTT)} cells, ${leftover.length} learning groups)`)
  if (!ran) fails++
  const gone = blockCells(second.classTT) === 0
  console.log(`${gone ? 'PASS' : 'FAIL'} after removing it, regenerating does not bring it back (${blockCells(second.classTT)} split cells)`)
  if (!gone) fails++
}

process.exit(fails ? 1 : 0)
