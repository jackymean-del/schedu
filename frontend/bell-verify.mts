// Verify the consecutive-breaks fix: Pre-Primary with early lunch + morning
// break must NOT get Morning Break and Lunch stacked back-to-back.
import { smartGenerateBellConfig } from './src/routes/wizard/step-bell'

const classes = [
  { key: 'LKG', group: 'Pre-Primary' }, { key: 'UKG', group: 'Pre-Primary' },
  { key: 'I', group: 'Primary' }, { key: 'VI', group: 'Middle' },
]
const groups = [{ group: 'Pre-Primary' }, { group: 'Primary' }, { group: 'Middle' }]

// Mirror the failing setup: 08/09:00 start, morning break after P1, smart
// lunch with Pre-Primary eating early (afterPeriod 1 → at/below the MB slot).
const { rows } = smartGenerateBellConfig(
  '09:00', '15:20', 8, 40,
  'smart', { 'Pre-Primary': 1, 'Primary': 3, 'Middle': 4 },
  groups, classes,
  true, 1, 15,          // morningBreak ON, after P1, 15 min
  undefined, 30, 15, false,
)

// Walk LKG's own row sequence and flag any two adjacent break-type rows.
const forClass = (key: string) => rows.filter(r =>
  !(r as any).classes?.length || (r as any).classes.includes(key))
let fails = 0
for (const key of ['LKG', 'I', 'VI']) {
  const seq = forClass(key)
  const names = seq.map(r => `${r.type}:${r.name}`)
  let adjacent = false
  for (let i = 1; i < seq.length; i++) {
    const a = seq[i - 1], b = seq[i]
    const isBreak = (r: any) => r.type !== 'teaching' && r.type !== 'assembly' && r.type !== 'dispersal'
    if (isBreak(a) && isBreak(b)) adjacent = true
  }
  console.log(`${key}: ${adjacent ? 'FAIL — consecutive breaks' : 'PASS'}`)
  if (adjacent) { fails++; console.log('  rows:', names.join(' → ')) }
}
// Also show LKG's sequence for eyeballing
console.log('LKG sequence:', forClass('LKG').map(r => r.name).join(' → '))
process.exit(fails ? 1 : 0)
