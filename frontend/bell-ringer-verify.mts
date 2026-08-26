/**
 * The board's bell: what rings, when, and — mostly — what must NOT ring.
 * Run: npx tsx bell-ringer-verify.mts
 */
import { ringsDue, parseClock, toClock, RING_GRACE_MIN, type BellAlarm } from './src/lib/bellRinger.ts'
import type { Ring } from './src/lib/bellSchedule.ts'
import { BUILT_IN_RINGS } from './src/lib/bellAudio.ts'

let fail = 0
const ok = (cond: boolean, label: string, extra = '') => {
  console.log(`${cond ? '✓' : '✗'} ${label}${extra ? ' — ' + extra : ''}`)
  if (!cond) fail++
}

// A plain morning: 8:00 assembly, 8:40 P2, 9:20 P3, 12:00 lunch, 15:30 out.
const rings: Ring[] = [
  { at: 480, starts: 'Assembly' },
  { at: 520, ends: 'Assembly', starts: 'Period 2' },
  { at: 560, ends: 'Period 2', starts: 'Period 3' },
  { at: 720, ends: 'Period 3', starts: 'Lunch' },
  { at: 930, ends: 'Period 8' },
]
const noAlarms: BellAlarm[] = []
const base = { rings, alarms: noAlarms, dayKey: 'TUESDAY' }

console.log('── the ordinary case ──')
ok(ringsDue({ ...base, prevMin: 519, nowMin: 520 }).length === 1,
  'crossing 8:40 rings once')
ok(ringsDue({ ...base, prevMin: 519, nowMin: 520 })[0].label === 'Period 2',
  'it rings with what the bell MEANS, not the time')
ok(ringsDue({ ...base, prevMin: 520, nowMin: 520 }).length === 0,
  'the same minute does not ring again')
ok(ringsDue({ ...base, prevMin: 520, nowMin: 521 }).length === 0,
  'the minute after does not ring again')
ok(ringsDue({ ...base, prevMin: 521, nowMin: 522 }).length === 0,
  'a minute with no bell is silent')
ok(ringsDue({ ...base, prevMin: 929, nowMin: 930 })[0].label === 'End of day',
  'the last bell of the day says so')

console.log('\n── what must never ring ──')
ok(ringsDue({ ...base, prevMin: undefined, nowMin: 900 }).length === 0,
  'opening the board at 3pm replays nothing')
ok(ringsDue({ ...base, prevMin: 400, nowMin: 900 }).length === 0,
  'a screen that slept through the day wakes up silent')
ok(ringsDue({ ...base, prevMin: 519, nowMin: 520, silent: true }).length === 0,
  'a holiday bell is not a bell')
ok(ringsDue({ ...base, prevMin: 1439, nowMin: 0 }).length === 0,
  'crossing midnight rings nothing')
ok(ringsDue({ ...base, rings: [], prevMin: 519, nowMin: 520 }).length === 0,
  'a day with no schedule has no bells to ring')

console.log('\n── the edge of the grace window ──')
// A late tick still rings; a gap wider than the window is the sleeping case.
ok(ringsDue({ ...base, prevMin: 520 - RING_GRACE_MIN, nowMin: 520 }).length === 1,
  `a tick ${RING_GRACE_MIN} min late still rings`)
ok(ringsDue({ ...base, prevMin: 520 - RING_GRACE_MIN - 1, nowMin: 520 }).length === 0,
  'one minute wider than that stays silent')

console.log('\n── alarms ──')
const alarms: BellAlarm[] = [
  { id: 'a1', at: 495, label: 'Staff briefing' },
  { id: 'a2', at: 600, label: 'Gate closes', days: ['MONDAY'] },
  { id: 'a3', at: 520, label: 'Fire drill' },
]
ok(ringsDue({ ...base, alarms, prevMin: 494, nowMin: 495 })[0].label === 'Staff briefing',
  'an alarm rings on its own')
ok(ringsDue({ ...base, alarms, prevMin: 494, nowMin: 495 })[0].kind === 'alarm',
  'and is reported as an alarm, not a bell')
ok(ringsDue({ ...base, alarms, prevMin: 599, nowMin: 600 }).length === 0,
  "a Monday alarm stays quiet on Tuesday")
ok(ringsDue({ ...base, alarms, dayKey: 'MONDAY', prevMin: 599, nowMin: 600 }).length === 1,
  'and rings on Monday')

const clash = ringsDue({ ...base, alarms, prevMin: 519, nowMin: 520 })
ok(clash.length === 1, 'an alarm on top of a bell is ONE sound, not two at once')
ok(clash[0].label === 'Period 2 · Fire drill', 'and both meanings survive', clash[0]?.label)

console.log('\n── several in one window ──')
const many = ringsDue({ ...base, rings: [{ at: 519, starts: 'A' }, { at: 520, starts: 'B' }], prevMin: 518, nowMin: 520 })
ok(many.length === 2 && many[0].at === 519 && many[1].at === 520,
  'two bells inside one window come back in time order')

console.log('\n── keys are per day, so tomorrow rings again ──')
const t1 = ringsDue({ ...base, prevMin: 519, nowMin: 520 })[0]
const t2 = ringsDue({ ...base, dayKey: 'WEDNESDAY', prevMin: 519, nowMin: 520 })[0]
ok(t1.key !== t2.key, 'the same bell on two days is two different rings')

console.log('\n── clock text ──')
ok(parseClock('15:30') === 930, "'15:30' is 930 minutes")
ok(parseClock('7:05') === 425, 'a single-digit hour is fine')
ok(parseClock('24:00') === undefined, '24:00 is not a time')
ok(parseClock('12:60') === undefined, 'nor is 12:60')
ok(parseClock('half past three') === undefined, 'nor is prose')
ok(toClock(930) === '15:30' && toClock(425) === '07:05', 'minutes turn back into HH:MM')

console.log('\n── the ring catalogue ──')
// The sounds themselves are Web Audio and cannot be rendered here; they are
// measured in the browser instead — rendered offline, with levels and strike
// counts checked. What CAN go wrong in a plain import is the bookkeeping: a
// ring added to the union and forgotten in the list, or two sharing an id.
const ids = BUILT_IN_RINGS.map(r => r.id)
ok(ids.length >= 8, 'at least eight rings to choose from', `${ids.length} rings`)
ok(new Set(ids).size === ids.length, 'no two rings share an id')
ok(BUILT_IN_RINGS.every(r => r.name.trim() && r.hint.trim()), 'every ring says what it is')
ok(new Set(BUILT_IN_RINGS.map(r => r.name)).size === ids.length, 'no two rings share a name')
const groups = [...new Set(BUILT_IN_RINGS.map(r => r.group))]
ok(groups.every(g => ['Bells', 'Chimes', 'Signals'].includes(g)), 'every ring lands in a known group', groups.join(', '))
ok(groups.length >= 2, 'the list is grouped, not one long column')

console.log(fail === 0 ? '\nALL BELL CHECKS PASSED' : `\n${fail} CHECK(S) FAILED`)
process.exit(fail === 0 ? 0 : 1)
