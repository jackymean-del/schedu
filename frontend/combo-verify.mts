// Verify elective SCOPE: PE taught everywhere but elective ONLY in XI/XII
// must produce a combo card spanning XI/XII sections only — not LKG–X.
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

const cards = suggestAndComboGroups(subjects as any[], sections as any[])
console.log('cards:', cards.length)
for (const c of cards) {
  console.log(`card "${c.name}": subjects=[${c.subjects.join(', ')}] sections=[${c.applicableSections.join(', ')}]`)
  const juniors = c.applicableSections.filter((s: string) => !/^X(I|II)-/.test(s))
  console.log('  no junior sections dragged in:', juniors.length === 0 ? 'PASS' : `FAIL (${juniors.join(', ')})`)
}
