// Verify after-dispersal categorization: locked slots tagged as dispersal
// must come back as 'after-dispersal' (day over), not 'section-scope-locked'.
import { solveTimetable } from './src/lib/schedulingEngine'

const workDays = ['MONDAY']
const periods = [
  { id: 'p1', name: 'P1', duration: 40, type: 'class' },
  { id: 'p2', name: 'P2', duration: 40, type: 'class' },
  { id: 'p3', name: 'P3', duration: 40, type: 'class' },
] as any[]
// LKG's day ends after P1: p2/p3 locked AND tagged as dispersal ids.
const sections = [{
  id: 's1', name: 'LKG-A', grade: 'LKG',
  scope: {
    dispersalIds: ['p2', 'p3'],
    cells: { MONDAY: { p2: 'locked', p3: 'locked' } },
  },
}] as any[]
const staff = [{ id: 't1', name: 'T1', subjects: ['Rhymes'], maxPeriodsPerWeek: 40 }] as any[]
const subjects = [{ id: 'su1', name: 'Rhymes', periodsPerWeek: 3 }] as any[]

const out = solveTimetable({ sections, staff, subjects, periods, workDays } as any)
const cats = (out.blockedSlots ?? []).map(b => `${b.periodId}:${b.reasons.map(r => r.category).join(',')}`)
console.log('blocked:', cats.join(' | ') || '(none)')
const dispersalOk = (out.blockedSlots ?? [])
  .filter(b => ['p2', 'p3'].includes(b.periodId))
  .every(b => b.reasons.some(r => r.category === 'after-dispersal'))
console.log('locked-tail categorized as after-dispersal:', dispersalOk ? 'PASS' : 'FAIL')
