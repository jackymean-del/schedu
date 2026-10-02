/**
 * Unavailability and the cover that follows it.
 * Run: npx tsx unavailability-verify.mts   (from frontend/)
 *
 * Who is away used to live only in the planner's browser, and cover was ranked
 * by two separate copies of the rules (Calendar and the timetable page) that
 * had drifted apart: one piled every cover on the least-busy teacher, both read
 * only a lesson's first teacher, and neither left out teachers who were away
 * themselves. Now there is one engine (lib/coverEngine) and one record synced
 * with the server (lib/unavailability). This holds both to their rules, and
 * checks the screens are wired to them rather than to private copies.
 */
import { readFileSync } from 'node:fs'
import { makeCoverEngine, absenceCovers, weekDatesOf } from './src/lib/coverEngine.ts'
import { mergeServerLeaves, rowToLeave, leaveToBody, SERVER_PREFIX } from './src/lib/unavailabilityRules.ts'
import { withSubstitutionDefaults } from './src/lib/substitutionSettings.ts'
import { computeReports } from './src/lib/reportsData.ts'

let fail = 0
const ok = (cond: boolean, label: string, extra = '') => {
  console.log(`${cond ? '✓' : '✗'} ${label}${extra ? ' - ' + extra : ''}`)
  if (!cond) fail++
}

// ── 1. Partial absences take out only the lessons they cover ─────────────
console.log('partial absences')
{
  const day = { start: 9 * 60, end: 15 * 60 }   // mid-day 12:00
  const L = (x: any) => ({ id: 'x', teacher: 'T1', date: '2026-10-05', type: 'Meeting', ...x })
  const at = (l: any, s: number) => absenceCovers(l, '2026-10-05', s, s + 40, day.start, day.end)
  ok(at(L({ duration: 'half', part: 'first' }), 9 * 60) && !at(L({ duration: 'half', part: 'first' }), 13 * 60),
    'first half: the 9:00 lesson, not the 13:00 one')
  ok(!at(L({ duration: 'half', part: 'second' }), 9 * 60) && at(L({ duration: 'half', part: 'second' }), 13 * 60),
    'second half: the 13:00 lesson, not the 9:00 one')
  ok(at(L({ duration: 'hours', fromMin: 600, toMin: 720 }), 11 * 60) && !at(L({ duration: 'hours', fromMin: 600, toMin: 720 }), 9 * 60),
    'specific hours 10:00-12:00: the 11:00 lesson, not the 9:00 one')
  ok(at(L({ duration: 'half' }), 13 * 60), 'an older half-day record that never said which half still counts all day')
  ok(absenceCovers(L({ duration: 'long', endDate: '2026-10-09' }), '2026-10-08', 600, 640, day.start, day.end)
    && !absenceCovers(L({ duration: 'long', endDate: '2026-10-09' }), '2026-10-12', 600, 640, day.start, day.end),
    'several days: inside the range yes, after it no')
}

// ── 2. The server record and this browser ────────────────────────────────
console.log('sync')
{
  const local = [
    { id: 'loc-1', teacher: 'T9', date: '2026-10-05', duration: 'full', type: 'Sick leave' },              // recorded offline
    { id: SERVER_PREFIX + 'a', teacher: 'T1', date: '2026-10-05', duration: 'full', type: 'Sick leave' },  // since withdrawn
    { id: SERVER_PREFIX + 'old', teacher: 'T2', date: '2026-09-01', duration: 'full', type: 'Training' },  // outside window
  ] as any[]
  const rows = [{ id: 'b', staffName: 'T3', date: '2026-10-06', duration: 'half', part: 'second', reason: 'Meeting', source: 'self' }] as any[]
  const next = mergeServerLeaves(local, rows, '2026-10-05', '2026-10-18')
  const ids = next.map(l => l.id)
  ok(ids.includes('loc-1'), 'a record kept only in this browser survives a pull')
  ok(!ids.includes(SERVER_PREFIX + 'a'), 'a server record withdrawn elsewhere disappears here too')
  ok(ids.includes(SERVER_PREFIX + 'old'), 'server records outside the pulled window are left alone')
  ok(next.some(l => l.id === SERVER_PREFIX + 'b' && l.part === 'second' && l.source === 'self'), "a teacher's own report arrives with its half and its source")
  const back = leaveToBody(rowToLeave(rows[0]))
  ok(back.staffName === 'T3' && back.duration === 'half' && back.part === 'second' && back.reason === 'Meeting',
    'a record round-trips to the request body unchanged')
}

// ── 3. The cover engine ──────────────────────────────────────────────────
console.log('cover engine')
const DATE = '2026-10-05' // a Monday
const periods = [1, 2, 3, 4, 5, 6].map(n => ({ id: `p${n}`, name: `P${n}`, duration: 60, type: 'class' }))
const c = (subject: string, teacher: string, room = 'R') => ({ subject, teacher, room })
const staff = ['T1', 'T2', 'T3', 'T4', 'T5'].map(n => ({ id: n.toLowerCase(), name: n, subjects: [] as string[] }))
const bundle = {
  id: 'S', name: 'School', sections: [{ name: 'A' }, { name: 'B' }, { name: 'C' }], staff, rooms: [], subjects: [],
  periods, config: { startTime: '09:00', workDays: ['MONDAY'] },
  classTT: {
    // T1 is the one who will be away: four plain lessons...
    A: { MONDAY: { p1: c('Maths', 'T1'), p2: c('Maths', 'T1'), p4: c('Maths', 'T1'), p5: c('Maths', 'T1') } },
    // ...and the SECOND group of a parallel lesson, which a first-teacher
    // reader would never see.
    B: { MONDAY: { p3: { subject: 'Art AND Music', teacher: 'T3', room: 'R1', groupAssignments: [{ subject: 'Art', teacher: 'T3' }, { subject: 'Music', teacher: 'T1' }] },
                   p1: c('English', 'T2'), p2: c('English', 'T2') } },
    C: { MONDAY: { p1: c('Science', 'T4') } },
  },
  substitutions: {} as Record<string, string>, orDecisions: {},
} as any
const settings = withSubstitutionDefaults({ defaults: { maxSubstitutesPerDay: 2 } as any })
const engineWith = (leaves: any[], b = bundle, s = settings) => makeCoverEngine({
  bundles: [b], isoDate: DATE, dayKey: 'MONDAY', dateOfWeekday: weekDatesOf(DATE), settings: s, staffPool: staff, leaves,
})
const fullDay = { id: 'l1', teacher: 'T1', date: DATE, duration: 'full', type: 'Sick leave' } as any
{
  const e = engineWith([fullDay])
  const slots = e.slotsOf('T1', fullDay)
  ok(slots.length === 5, "every lesson of the absent teacher is found, including a parallel group's second teacher", `${slots.length}/5`)
  ok(slots.find(s => s.section === 'B')?.subject === 'Music', "the parallel lesson is listed under the absent teacher's own subject")

  const secondHalf = { ...fullDay, duration: 'half', part: 'second' }
  const half = engineWith([secondHalf]).slotsOf('T1', secondHalf)
  ok(half.length === 2 && half.every(s => ['p4', 'p5'].includes(s.periodId)),
    'a second-half absence asks cover only for the afternoon', half.map(s => s.periodId).join(','))

  const p1 = e.candidatesFor({ sid: 'S', section: 'A', periodId: 'p1', subject: 'Maths' }, 'T1').map(x => x.name)
  ok(!p1.includes('T2') && !p1.includes('T4'), 'nobody teaching at that moment is offered', p1.join(','))

  const awayToo = engineWith([fullDay, { ...fullDay, id: 'l2', teacher: 'T5' }])
    .candidatesFor({ sid: 'S', section: 'A', periodId: 'p2', subject: 'Maths' }, 'T1').map(x => x.name)
  ok(!awayToo.includes('T5'), 'a teacher who is away themselves is never offered as cover', awayToo.join(','))

  const p3 = e.candidatesFor({ sid: 'S', section: 'B', periodId: 'p3', subject: 'Music' }, 'T1').map(x => x.name)
  ok(!p3.includes('T3'), "the other group's teacher in the same parallel lesson is busy, not free", p3.join(','))
}
{
  const plan = engineWith([fullDay]).planAutoCover('T1', fullDay)
  const per: Record<string, number> = {}
  for (const a of plan.assigned) per[a.substitute] = (per[a.substitute] ?? 0) + 1
  ok(plan.assigned.length + plan.uncovered.length === 5, 'every missed lesson is either covered or reported uncovered')
  ok(Object.values(per).every(n => n <= 2), 'automatic cover keeps everyone within their daily cover limit (2)', JSON.stringify(per))
  ok(Object.keys(per).length >= 2, 'and spreads the work rather than piling it on one teacher', JSON.stringify(per))
  const clash = new Set<string>()
  let doubled = false
  for (const a of plan.assigned) { const k = `${a.substitute}|${a.periodId}`; if (clash.has(k)) doubled = true; clash.add(k) }
  ok(!doubled, 'nobody is put in two places at one time')

  const manualOnly = withSubstitutionDefaults({
    defaults: { maxSubstitutesPerDay: 2 } as any,
    facultyOverrides: Object.fromEntries(staff.map(s => [s.id, { canSub: true, autoAssign: s.name === 'T5' }])),
  })
  const p2 = engineWith([fullDay], bundle, manualOnly).planAutoCover('T1', fullDay)
  ok(p2.assigned.every(a => a.substitute === 'T5'), 'only faculty set to Auto are used by automatic cover',
    p2.assigned.map(a => a.substitute).join(','))
}

// ── 4. Insights counts what an absence actually cost ─────────────────────
console.log('insights')
{
  // T1 away for the second half only: their two afternoon lessons (p4, p5)
  // were missed; the morning ones were taught as normal.
  const secondHalf = { ...fullDay, duration: 'half', part: 'second' }
  const r = computeReports({
    leaves: [secondHalf], range: { start: DATE, end: DATE },
    sources: [{ sections: bundle.sections, periods, classTT: bundle.classTT, substitutions: {}, config: bundle.config }],
  })
  ok(r.totals.cancelled === 2, 'a second-half absence costs only the afternoon lessons', `${r.totals.cancelled} cancelled`)
  ok(r.totals.leaveDays === 0.5, 'and counts as half a day away', `${r.totals.leaveDays}`)
}

// ── 5. The screens use it ────────────────────────────────────────────────
console.log('wiring')
{
  const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1')
  const read = (p: string) => strip(readFileSync(p, 'utf8'))
  const cal = read('src/pages/calendar.tsx')
  ok(cal.includes('makeCoverEngine(') && !/const busyIn = /.test(cal) && !/const matchTierIn = /.test(cal),
    'the Calendar ranks cover through the shared engine, with no private copy')
  ok(/canArrangeCover && onLeave\(ent\.id\)/.test(cal), 'the Calendar offers Cover only for someone who is away')
  ok(cal.includes('<UnavailableModal') && !cal.includes('MarkLeaveModal'), 'the Calendar marks absences with the Unavailable form')
  const tt = read('src/routes/timetable.tsx')
  ok(!/subPanelOpen|applySubstitutions|autoFillBest/.test(tt), 'the timetable page has no substitution panel of its own')
  const dash = read('src/components/DashboardTodayPanel.tsx')
  ok(dash.includes('<UnavailableModal') && dash.includes('recordUnavailable('), 'the Dashboard can mark someone unavailable')
  ok(/\/calendar\?cover=/.test(dash), "the Dashboard's cover links open that person's cover directly")
  ok(read('src/components/layout/AppShell.tsx').includes('useUnavailabilitySync('), "the app keeps absences in sync, and covers teachers' own reports")
  ok(read('src/pages/my-teaching.tsx').includes('reportUnavailability('), 'a teacher can report themselves from My Teaching')
}

console.log(fail === 0 ? '\nALL UNAVAILABILITY CHECKS PASSED' : `\n${fail} CHECK(S) FAILED`)
process.exit(fail === 0 ? 0 : 1)
