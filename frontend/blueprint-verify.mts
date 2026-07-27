/* Blueprint v3 compliance checks. Run: npx tsx blueprint-verify.mts */
import { distributeSections } from './src/lib/sectionDistribution'

let fail = 0
const ok = (c: boolean, m: string) => { console.log((c ? '✓' : '✗ FAIL') + ' ' + m); if (!c) fail++ }

// ── Step 1 auto-distribution — the 5 worked cases from the blueprint ──
// "Distribute 2 sections per class starting from the LOWEST class, moving
//  upward, until the section pool runs out. Remaining higher classes get 1 each."
const cases: Array<{ n: number; label: string; total: number; want: number[] }> = [
  { n: 6, label: '1–6', total: 10, want: [2, 2, 2, 2, 1, 1] },
  { n: 5, label: '1–5', total: 10, want: [2, 2, 2, 2, 2] },
  { n: 7, label: '1–7', total: 10, want: [2, 2, 2, 1, 1, 1, 1] },
  { n: 8, label: '1–8', total: 10, want: [2, 2, 1, 1, 1, 1, 1, 1] },
  { n: 8, label: '1–8', total: 12, want: [2, 2, 2, 2, 1, 1, 1, 1] },
]
for (const c of cases) {
  const got = distributeSections(c.n, c.total)
  ok(JSON.stringify(got) === JSON.stringify(c.want),
    `Classes ${c.label} · ${c.total} sections → [${got}] (expected [${c.want}])`)
}

// ── Generalisation beyond the worked cases ──
ok(distributeSections(3, 3).join() === '1,1,1', 'exactly 1 per class when total == classes')
ok(distributeSections(4, 10).join() === '3,3,2,2', 'total > 2×classes still favours lower classes')
ok(distributeSections(5, 3).join() === '1,1,1,0,0', 'fewer sections than classes → lowest classes filled first')
ok(distributeSections(0, 5).length === 0, 'no classes → empty')
ok(distributeSections(3, 0).join() === '0,0,0', 'no sections → all zero')

// Sum is always conserved
for (const c of [...cases, { n: 9, label: 'x', total: 23, want: [] }]) {
  const got = distributeSections(c.n, c.total)
  ok(got.reduce((a, b) => a + b, 0) === c.total, `sum conserved for ${c.n} classes × ${c.total} sections`)
}

// Monotonic: a lower class never has FEWER sections than a higher one
for (const c of cases) {
  const got = distributeSections(c.n, c.total)
  ok(got.every((v, i) => i === 0 || got[i - 1] >= v), `lower classes never get fewer than higher (${c.label}/${c.total})`)
}

// ── Step 2 Block/Building Distance Matrix — the blueprint's worked 4-block school ──
// A–B:1 A–C:2 A–D:3 B–C:1 B–D:2 C–D:1  (symmetric; lower = closer)
import { pairKey, distanceBetween, rankVenuesByProximity, allPairs, missingPairs } from './src/lib/blockDistance'

const D: Record<string, number> = {
  [pairKey('A', 'B')]: 1, [pairKey('A', 'C')]: 2, [pairKey('A', 'D')]: 3,
  [pairKey('B', 'C')]: 1, [pairKey('B', 'D')]: 2, [pairKey('C', 'D')]: 1,
}
ok(distanceBetween('A', 'B', D) === 1 && distanceBetween('B', 'A', D) === 1, 'matrix is symmetric (A–B == B–A)')
ok(distanceBetween('A', 'D', D) === 3, 'A–D = 3 (farthest from A)')
ok(distanceBetween('C', 'D', D) === 1, 'C–D = 1')
ok(distanceBetween('A', 'A', D) === 0, 'distance to self is 0')
ok(distanceBetween('A', 'Z', D) === undefined, 'unrecorded pair is undefined')
ok(allPairs(['A', 'B', 'C', 'D']).length === 6, '4 blocks → 6 unordered pairs to enter')
ok(missingPairs(['A', 'B', 'C', 'D'], D).length === 0, 'worked example has no missing pairs')
ok(missingPairs(['A', 'B', 'C', 'D', 'E'], D).length === 4, 'adding block E surfaces its 4 unfilled pairs')

// Nearer blocks rank first (the AND-logic purpose)
const venues = [
  { name: 'r-d', building: 'D' }, { name: 'r-c', building: 'C' },
  { name: 'r-a', building: 'A' }, { name: 'r-b', building: 'B' },
]
ok(rankVenuesByProximity('A', venues, D).map(v => v.name).join() === 'r-a,r-b,r-c,r-d',
  'venues rank nearest-first from block A (A,B,C,D)')
ok(rankVenuesByProximity('D', venues, D).map(v => v.name).join() === 'r-d,r-c,r-b,r-a',
  'venues rank nearest-first from block D (D,C,B,A)')
ok(rankVenuesByProximity(undefined, venues, D).map(v => v.name).join() === 'r-d,r-c,r-a,r-b',
  'no origin block → original order preserved')
const withUnknown = [...venues, { name: 'r-z', building: 'Z' }]
ok(rankVenuesByProximity('A', withUnknown, D).map(v => v.name).pop() === 'r-z',
  'blocks with no recorded distance sort last')

// ── Part C — Syllabus Tracking (shared service) ──
import {
  planKey, requiredHours, coveredHours, remainingHours, coveragePct, isCovered,
  rankOrGroupBySessionNeed, suggestSlotDonor, coverageRows, summariseBy,
  type SyllabusPlan,
} from './src/lib/syllabusTracking'

const mkPlan = (subject: string, section: string, o: Partial<SyllabusPlan> = {}): SyllabusPlan =>
  ({ subject, section, chapters: [], loggedHours: 0, ...o })

// §1 required hours — direct, or summed from chapters (chapters win)
ok(requiredHours(mkPlan('Phy', 'XI-A', { requiredHours: 40 })) === 40, 'required hours: direct figure')
const chaptered = mkPlan('Chem', 'XI-A', {
  requiredHours: 999,  // must be ignored once chapters exist
  chapters: [
    { id: 'c1', name: 'Ch1', hours: 10 },
    { id: 'c2', name: 'Ch2', hours: 12 },
    { id: 'c3', name: 'Ch3', hours: 8 },
  ],
})
ok(requiredHours(chaptered) === 30, 'required hours: chapter sum overrides the direct figure')

// §6/§7 faculty marks chapters covered → live coverage
const partly: SyllabusPlan = { ...chaptered, chapters: chaptered.chapters.map((c, i) => i === 0 ? { ...c, coveredAt: 'now' } : c) }
ok(coveredHours(partly) === 10, 'covered hours: only ticked chapters count')
ok(remainingHours(partly) === 20, 'remaining hours = required − covered')
ok(coveragePct(partly) === 33, 'coverage % (10/30)')
ok(!isCovered(partly), 'partly-taught syllabus is not "covered"')

// §2 direct hour logging (schools not tracking chapters)
ok(coveredHours(mkPlan('Bio', 'XI-A', { requiredHours: 20, loggedHours: 5 })) === 5, 'directly-logged hours count as covered')
ok(remainingHours(mkPlan('Bio', 'XI-A', { requiredHours: 20, loggedHours: 25 })) === 0, 'remaining never goes negative')
ok(isCovered(mkPlan('Bio', 'XI-A', { requiredHours: 20, loggedHours: 20 })), 'fully-taught syllabus is "covered"')
ok(coveragePct(mkPlan('X', 'S')) === 0, 'no requirement → 0% (nothing planned)')

// ── THE STEP 4 OR-LOGIC GAP: "which subject needs more sessions?" ──
const plans: Record<string, SyllabusPlan> = {
  [planKey('Physics', 'XI-A')]:   mkPlan('Physics', 'XI-A', { requiredHours: 40, loggedHours: 10 }), // 30 left
  [planKey('Chemistry', 'XI-A')]: mkPlan('Chemistry', 'XI-A', { requiredHours: 40, loggedHours: 35 }), // 5 left
  [planKey('Biology', 'XI-A')]:   mkPlan('Biology', 'XI-A', { requiredHours: 40, loggedHours: 40 }), // 0 left (covered)
}
const ranked = rankOrGroupBySessionNeed(['Chemistry', 'Physics', 'Biology'], 'XI-A', plans)
ok(ranked[0].subject === 'Physics' && ranked[0].remaining === 30,
  'OR group: the subject needing MOST sessions ranks first (Physics, 30 h left)')
ok(ranked[2].subject === 'Biology' && ranked[2].remaining === 0, 'OR group: fully-covered subject ranks last')
const withUnplanned = rankOrGroupBySessionNeed(['Physics', 'Unplanned'], 'XI-A', plans)
ok(withUnplanned[0].subject === 'Physics' && withUnplanned[1].hasPlan === false,
  'OR group: subjects with no syllabus data sort last (never claim they need the slot)')

// §4 donate a slot from a sufficiently-covered subject to a needy one
const donor = suggestSlotDonor('Physics', 'XI-A', ['Chemistry', 'Biology'], plans)
ok(donor?.donor === 'Biology', 'slot donor: the fully-covered subject gives up the slot')
ok(suggestSlotDonor('Biology', 'XI-A', ['Physics'], plans) === null,
  'slot donor: a covered subject never asks for more time')
ok(suggestSlotDonor('Physics', 'XI-A', ['Unplanned'], plans) === null,
  'slot donor: never donate from a subject with no syllabus plan')

// §8 admin coverage reporting, subject- / section- / teacher-wise
const reportPlans: Record<string, SyllabusPlan> = {
  [planKey('Maths', 'VI-A')]: mkPlan('Maths', 'VI-A', { requiredHours: 20, loggedHours: 5,  teacher: 'T1' }),
  [planKey('Maths', 'VI-B')]: mkPlan('Maths', 'VI-B', { requiredHours: 20, loggedHours: 20, teacher: 'T1' }),
  [planKey('Sci',   'VI-A')]: mkPlan('Sci',   'VI-A', { requiredHours: 10, loggedHours: 0,  teacher: 'T2' }),
}
const rows = coverageRows(reportPlans)
ok(rows.length === 3 && rows[0].remaining >= rows[1].remaining, 'coverage rows sorted by most-remaining first')
const bySubject = summariseBy(rows, 'subject')
ok(bySubject.find(r => r.label === 'Maths')?.required === 40, 'subject-wise: Maths totals 40 h across sections')
ok(bySubject.find(r => r.label === 'Maths')?.remaining === 15, 'subject-wise: Maths has 15 h remaining')
const byTeacher = summariseBy(rows, 'teacher')
ok(byTeacher.find(r => r.label === 'T1')?.pct === 63, 'teacher-wise: T1 is 63% covered (25/40 = 62.5, rounded)')
ok(summariseBy(rows, 'section').find(r => r.label === 'VI-A')?.remaining === 25, 'section-wise: VI-A has 25 h remaining')

console.log(fail === 0 ? '\nALL BLUEPRINT CHECKS PASSED' : `\n${fail} CHECK(S) FAILED`)
process.exit(fail === 0 ? 0 : 1)
