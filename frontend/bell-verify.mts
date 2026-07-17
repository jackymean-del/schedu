// Bell generator regression tests — run with `npx tsx bell-verify.mts`.
// 1) No consecutive breaks (morning break + early PP lunch must not stack).
// 2) Default Pre-Primary lunch has a clock floor (no 9:50 AM "lunch").
import { smartGenerateBellConfig } from './src/routes/wizard/step-bell'

const classes = [
  { key: 'LKG', group: 'Pre-Primary' }, { key: 'UKG', group: 'Pre-Primary' },
  { key: 'I', group: 'Primary' }, { key: 'VI', group: 'Middle' },
]
const groups = [{ group: 'Pre-Primary' }, { group: 'Primary' }, { group: 'Middle' }]
let fails = 0

const isBreak = (r: any) => r.type !== 'teaching' && r.type !== 'assembly' && r.type !== 'dispersal'
const forClass = (rows: any[], key: string) => rows.filter(r =>
  !(r as any).classes?.length || (r as any).classes.includes(key))
const noAdjacentBreaks = (rows: any[], key: string): boolean => {
  const seq = forClass(rows, key)
  for (let i = 1; i < seq.length; i++) if (isBreak(seq[i - 1]) && isBreak(seq[i])) return false
  return true
}
const fmt = (m: number) => `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`

// ── Case 1: explicit early PP lunch (user's choice respected, but never
// stacked back-to-back with the morning break) ──
{
  const { rows } = smartGenerateBellConfig(
    '09:00', '15:20', 8, 40,
    'smart', { 'Pre-Primary': 1, 'Primary': 3, 'Middle': 4 },
    groups, classes, true, 1, 15, undefined, 30, 15, false,
  )
  for (const key of ['LKG', 'I', 'VI']) {
    const ok = noAdjacentBreaks(rows, key)
    console.log(`case1 ${key}: ${ok ? 'PASS' : 'FAIL — consecutive breaks'}`)
    if (!ok) fails++
  }
  console.log('case1 LKG:', forClass(rows, 'LKG').map(r => r.name).join(' → '))
}

// ── Case 2: NO explicit PP slot → default must respect the clock floor ──
{
  const { rows } = smartGenerateBellConfig(
    '09:00', '15:20', 8, 40,
    'smart', { 'Primary': 3, 'Middle': 4 },
    groups, classes, true, 1, 15, undefined, 30, 15, false,
  )
  const lkg = forClass(rows, 'LKG')
  let t = 9 * 60, lunchStart = -1
  for (const r of lkg) {
    if (r.type === 'lunch' || /lunch/i.test(r.name)) { lunchStart = t; break }
    t += r.duration
  }
  const floorOk = lunchStart >= 9 * 60 + 10 + 80
  console.log(`case2 default PP lunch starts ${fmt(lunchStart)}:`, floorOk ? 'PASS (>= 10:30)' : 'FAIL (too early)')
  if (!floorOk) fails++
  const ok = noAdjacentBreaks(rows, 'LKG')
  console.log('case2 LKG no consecutive breaks:', ok ? 'PASS' : 'FAIL')
  if (!ok) fails++
  console.log('case2 LKG:', lkg.map(r => r.name).join(' → '))
}

process.exit(fails ? 1 : 0)
