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

process.exit(fails ? 1 : 0)
