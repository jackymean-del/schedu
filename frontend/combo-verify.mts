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

// Groups are the school's choice. The groups step used to build AND groups
// from the electives the first time it was opened, so passing through it
// opted a school in, and its classes were split without anyone asking.
// Guard the pattern: no effect anywhere may create or replace groups. A
// suggestion is offered on a button; only a click writes it.
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
      if (writers.test(src.slice(i, j))) offenders.push(`${f.replace(/^src[\\/]/, '')}:${line}`)
      i = j
    }
  }
  const ok = offenders.length === 0
  console.log(`${ok ? 'PASS' : 'FAIL'} no effect creates groups on its own${ok ? '' : ` - ${offenders.join(', ')}`}`)
  if (!ok) fails++
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
