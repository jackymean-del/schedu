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
  rankOrGroupBySessionNeed, suggestSlotDonor, coverageRows, summariseBy, classOfSection,
  type SyllabusPlan,
} from './src/lib/syllabusTracking'

const mkPlan = (subject: string, section: string, o: Partial<SyllabusPlan> = {}): SyllabusPlan =>
  ({ subject, section, chapters: [], loggedHours: 0, ...o })

// §1 required hours — the subject's own figure. Chapters say WHAT to cover,
// never how long it takes: nobody could estimate per-chapter hours honestly, so
// that box is gone and every chapter now counts equally.
ok(requiredHours(mkPlan('Phy', 'XI-A', { requiredHours: 40 })) === 40, 'required hours: direct figure')
const chaptered = mkPlan('Chem', 'XI-A', {
  requiredHours: 30,
  chapters: [
    { id: 'c1', name: 'Ch1' },
    { id: 'c2', name: 'Ch2' },
    { id: 'c3', name: 'Ch3' },
  ],
})
ok(requiredHours(chaptered) === 30, 'required hours: the subject figure stands, chapters do not override it')

// §6/§7 faculty marks chapters covered → live coverage. 1 of 3 chapters ticked
// is a third of the syllabus, whatever the chapters happen to be.
const partly: SyllabusPlan = { ...chaptered, chapters: chaptered.chapters.map((c, i) => i === 0 ? { ...c, coveredAt: 'now' } : c) }
ok(coveredHours(partly) === 10, 'covered hours: chapters weigh equally (1 of 3 → 10 of 30 h)')
ok(remainingHours(partly) === 20, 'remaining hours = required − covered')
ok(coveragePct(partly) === 33, 'coverage % (10/30)')
ok(!isCovered(partly), 'partly-taught syllabus is not "covered"')
// A part-taught chapter carries its own %, still equal-weight.
const halfChapter: SyllabusPlan = { ...chaptered, chapters: chaptered.chapters.map((c, i) => i === 0 ? { ...c, percentCovered: 50 } : c) }
ok(coveredHours(halfChapter) === 5, 'a chapter at 50% of three counts as one sixth (5 of 30 h)')
// Legacy data that still carries per-chapter hours keeps weighting by them.
const legacy = mkPlan('Bio', 'XI-A', {
  chapters: [
    { id: 'c1', name: 'Ch1', hours: 10, coveredAt: 'now' },
    { id: 'c2', name: 'Ch2', hours: 30 },
  ],
})
ok(requiredHours(legacy) === 40, 'legacy plan with no subject figure falls back to its chapter hours')
ok(coveredHours(legacy) === 10, 'legacy per-chapter hours still weight coverage (10 of 40 h)')

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

// §8 class-wise is its own dimension (sections VI-A + VI-B roll up into class VI)
ok(classOfSection('VI-A') === 'VI' && classOfSection('Grade 3-B') === 'Grade 3', 'class derived from section name')
ok(classOfSection('XI-Sci-A') === 'XI-Sci', 'stream sections keep their stream in the class label')
ok(classOfSection('Nursery') === 'Nursery' && classOfSection('') === '—', 'unsuffixed / empty section names handled')
const byClass = summariseBy(rows, 'class')
ok(byClass.length === 1 && byClass[0].label === 'VI', 'class-wise: VI-A and VI-B roll up into one class VI')
ok(byClass[0].required === 50 && byClass[0].remaining === 25, 'class-wise: VI totals 50 h required, 25 h remaining')

// ── Lost sessions (holiday / event / absence) change the verdict ──
import { lostHours, riskOf, lagging } from './src/lib/syllabusTracking'

const noLoss = mkPlan('Hist', 'IX-A', { requiredHours: 40, loggedHours: 30 })      // 75%, 10 left
ok(lostHours(noLoss) === 0, 'no lost sessions → 0 lost hours')
ok(riskOf(noLoss) === 'on-track', 'progressing with no lost time → on-track')

const withLoss = mkPlan('Hist', 'IX-B', {
  requiredHours: 40, loggedHours: 30,
  lostSessions: [
    { id: 'l1', date: '2026-08-15', hours: 2, reason: 'holiday' },
    { id: 'l2', date: '2026-09-05', hours: 3, reason: 'event' },
  ],
})
ok(lostHours(withLoss) === 5, 'lost hours sum across sessions (2 + 3)')
ok(riskOf(withLoss) === 'critical',
  'SAME 75% coverage becomes critical once sessions were lost — the hours must be found again')
ok(riskOf(mkPlan('Done', 'X-A', { requiredHours: 10, loggedHours: 10, lostSessions: [{ id: 'l', date: 'd', hours: 4, reason: 'holiday' }] })) === 'covered',
  'a finished syllabus is not "critical" even if time was lost along the way')
ok(riskOf(mkPlan('Slow', 'X-A', { requiredHours: 40, loggedHours: 5 })) === 'behind', 'under half taught → behind')
ok(riskOf(mkPlan('Empty', 'X-A')) === 'untracked', 'no requirement → untracked (no opinion)')

// The alert feed: worst first, and silent about things that are fine
const alertPlans: Record<string, SyllabusPlan> = {
  [planKey('Hist', 'IX-A')]: noLoss,                                                   // on-track → silent
  [planKey('Hist', 'IX-B')]: withLoss,                                                 // critical
  [planKey('Geo', 'IX-A')]:  mkPlan('Geo', 'IX-A', { requiredHours: 40, loggedHours: 4 }),   // behind
  [planKey('Art', 'IX-A')]:  mkPlan('Art', 'IX-A', { requiredHours: 10, loggedHours: 10 }),  // covered → silent
  [planKey('Mus', 'IX-A')]:  mkPlan('Mus', 'IX-A'),                                          // untracked → silent
}
const alerts = lagging(alertPlans)
ok(alerts.length === 2, 'alerts only include actionable rows (critical + behind), not covered/on-track/untracked')
ok(alerts[0].subject === 'Hist' && alerts[0].risk === 'critical', 'critical rows sort above behind ones')
ok(alerts[0].lost === 5, 'alert carries the lost-hours figure')
ok(alerts[1].subject === 'Geo' && alerts[1].risk === 'behind', 'behind row follows')
ok(lagging(alertPlans, 1).length === 1, 'alert feed can be capped for a compact dashboard widget')
ok(coverageRows(alertPlans).find(r => r.section === 'IX-B')?.lost === 5, 'coverage rows expose lost hours + risk')

// ── v5 Step 0: country-wise allocation automation ──
import {
  COUNTRY_HOURS, countryHours, isCovered as ctryCovered, countryOptions,
  studentHoursWeekFor, teacherHoursWeekFor, shouldPromptCustom, refLevelForBand, OECD_AVERAGE,
} from './src/lib/countryHours'

ok(COUNTRY_HOURS.length === 42, `reference dataset loaded (${COUNTRY_HOURS.length} rows: 41 systems + OECD average)`)

// The blueprint's worked example table
ok(OECD_AVERAGE.daysPerWeek === 5 && OECD_AVERAGE.studentHoursWeek.primary === 21.2 && OECD_AVERAGE.teacherHoursYear.primary === 780 && OECD_AVERAGE.confidence === 'verified',
  'worked example — OECD average: 5 days, 21.2 primary student hrs/wk, 780 teacher hrs/yr, Verified')
const ind = countryHours('IN')!
ok(ind.daysPerWeek === 6 && ind.studentHoursWeek.primary === 22.5 && ind.teacherHoursYear.primary === 1600 && ind.confidence === 'verified',
  'worked example — India (CBSE): 6 days, 22.5 primary student hrs/wk, ~1600 teacher hrs/yr, Verified')
const aus = countryHours('AU')!
ok(aus.daysPerWeek === 5 && aus.studentHoursWeek.primary === 25 && aus.teacherHoursYear.primary === 870 && aus.confidence === 'approximate',
  'worked example — Australia: 5 days, 25.0 primary student hrs/wk, 870 teacher hrs/yr, Approximate')

// A country sees ITS OWN figures, not a global default
ok(studentHoursWeekFor('IN', 'lowerPrimary')!.hours === 22.5, 'India primary student hours = 22.5 h/wk')
ok(studentHoursWeekFor('FI', 'lowerPrimary')!.hours === 18.2, 'Finland primary student hours = 18.2 h/wk (its own figure)')
ok(studentHoursWeekFor('US', 'lowerPrimary')!.hours === 27.2, 'United States primary = 27.2 h/wk')
ok(studentHoursWeekFor('JP', 'seniorSecondary')!.hours === 21.8, 'Japan upper-secondary = 21.8 h/wk')

// Term-time weekly = annual ÷ weeks IN SESSION (never ÷ 52)
const fi = countryHours('FI')!
ok(Math.abs(fi.studentHoursWeek.primary - fi.weeksPerYear * 0 - 693 / 38) < 0.1,
  'weekly hours derive from weeks in session (Finland 693 h ÷ 38 wks ≈ 18.2), not ÷ 52')

// Pre-primary is published annually — converted with that country's weeks
ok(studentHoursWeekFor('IN', 'prePrimary')!.hours === 12.5, 'India pre-primary 500 h/yr ÷ 40 wks = 12.5 h/wk')

// Band → reference level mapping
ok(refLevelForBand('lowerPrimary') === 'primary' && refLevelForBand('upperPrimary') === 'lowerSec'
  && refLevelForBand('secondary') === 'lowerSec' && refLevelForBand('seniorSecondary') === 'upperSec',
  'grade bands map onto the dataset levels')

// THE TRAP: India's teacher figure is total working hours incl. prep
const indT = teacherHoursWeekFor('IN', 'lowerPrimary')!
ok(indT.basis === 'total' && indT.usable === false,
  "India's teacher figure is flagged 'total' (incl. prep) and NOT usable as a teaching cap")
ok(Math.abs(indT.hours - 40) < 0.1, 'India 1600 h/yr ÷ 40 wks = 40 h/wk — which as a teaching cap would be ~60 periods, hence the guard')
const oecdT = teacherHoursWeekFor('OECD', 'lowerPrimary')!
ok(oecdT.basis === 'teaching' && oecdT.usable === true && Math.abs(oecdT.hours - 20.5) < 0.2,
  'OECD teacher figure is net teaching time and usable (780 ÷ 38 ≈ 20.5 h/wk)')

// Custom-entry nudge (v5: uncovered / approximate / wrong basis)
ok(shouldPromptCustom('ZZ').reason === 'uncovered', 'uncovered country → nudge custom entry')
ok(shouldPromptCustom('AU').reason === 'approximate', 'Approximate-tier country → nudge custom entry')
ok(shouldPromptCustom('IN').reason === 'basis', "India → nudge custom (published figure isn't a teaching measure)")
ok(shouldPromptCustom('FR').prompt === false, 'Verified teaching-basis country → no nudge needed')

// Coverage + options
ok(ctryCovered('IN') && ctryCovered('FI') && !ctryCovered('ZZ') && !ctryCovered('OECD'),
  'coverage check distinguishes real systems from the average fallback')
ok(studentHoursWeekFor('ZZ', 'lowerPrimary')!.covered === false && studentHoursWeekFor('ZZ', 'lowerPrimary')!.hours === 21.2,
  'uncovered country falls back to the OECD average row, flagged as not covered')
const opts = countryOptions()
ok(opts[0].code === 'OECD' && opts.length === 42 && opts[1].name.localeCompare(opts[2].name) <= 0,
  'country picker lists the OECD average first, then countries alphabetically')

// ── v5 "borrow & replace" — same teacher, same section, only from a covered subject ──
import { suggestBorrowSwaps } from './src/lib/syllabusTracking'

const swapPlans: Record<string, SyllabusPlan> = {
  // Anita teaches both in VI-A: Maths is behind, Art is finished → valid swap
  [planKey('Maths', 'VI-A')]: mkPlan('Maths', 'VI-A', { requiredHours: 40, loggedHours: 10, teacher: 'Anita' }),
  [planKey('Art',   'VI-A')]: mkPlan('Art',   'VI-A', { requiredHours: 20, loggedHours: 20, teacher: 'Anita' }),
  // Covered but a DIFFERENT teacher in the same section → must not be offered
  [planKey('Music', 'VI-A')]: mkPlan('Music', 'VI-A', { requiredHours: 20, loggedHours: 20, teacher: 'Bimal' }),
  // Same teacher, covered, but a DIFFERENT section → different students, not offered
  [planKey('Art',   'VI-B')]: mkPlan('Art',   'VI-B', { requiredHours: 20, loggedHours: 20, teacher: 'Anita' }),
  // Same teacher/section but itself behind → can't donate what it doesn't have
  [planKey('EVS',   'VI-A')]: mkPlan('EVS',   'VI-A', { requiredHours: 30, loggedHours: 5,  teacher: 'Anita' }),
}
const swaps = suggestBorrowSwaps(swapPlans)
// Art (Anita, VI-A, covered) can feed BOTH lagging subjects Anita teaches in
// that section — Maths and EVS. Anything else in the fixture is excluded.
ok(swaps.length === 2, `only the same-teacher/same-section pairs qualify (got ${swaps.length})`)
ok(swaps.every(s => s.donor === 'Art' && s.section === 'VI-A' && s.teacher === 'Anita'),
  'every suggestion borrows from Art, same teacher (Anita) and same section (VI-A)')
ok(swaps[0].lagging === 'Maths' && swaps[1].lagging === 'EVS',
  'worst-first ordering — Maths (30 h left) offered before EVS (25 h left)')
ok(!swaps.some(s => s.donor === 'Music'), 'never borrows from a different teacher, even in the same section')
ok(!swaps.some(s => s.section === 'VI-B'), 'never borrows across sections — different students in the room')
ok(!swaps.some(s => s.donor === 'EVS'), 'never borrows from a subject that is itself behind')
ok(swaps[0].hours <= swaps[0].laggingRemaining, 'never moves more hours than the lagging subject actually needs')
// Maths needs 30 h but Art only ever had 20 h of slots — it cannot lend 30.
ok(swaps[0].hours === 20, `never lends more than the donor was allocated (Art has 20 h, offered ${swaps[0].hours} h)`)
ok(suggestBorrowSwaps({}).length === 0, 'no plans → no suggestions')
// A school where nothing is ahead gets no false hope
const noDonor: Record<string, SyllabusPlan> = {
  [planKey('A', 'X')]: mkPlan('A', 'X', { requiredHours: 40, loggedHours: 5, teacher: 'T' }),
  [planKey('B', 'X')]: mkPlan('B', 'X', { requiredHours: 40, loggedHours: 6, teacher: 'T' }),
}
ok(suggestBorrowSwaps(noDonor).length === 0, 'nothing ahead → no swap offered (rather than a bad one)')

// ── v6 Content coverage — TWO entry methods, chosen per faculty/subject ──
import { effectiveMethod, contentFraction, chapterFraction, hasContentSignal } from './src/lib/syllabusTracking'

// (0) Simplest of all: faculty just STATES the figure — "75% covered".
const byPercent = mkPlan('Civics', 'IX-A', { requiredHours: 40, method: 'percent', overallPercentCovered: 75 })
ok(effectiveMethod(byPercent) === 'percent', 'stated-percentage method recognised')
ok(contentFraction(byPercent) === 0.75, 'a stated 75% is taken at face value — nothing to tick or list')
ok(coveredHours(byPercent) === 30 && coveragePct(byPercent) === 75, '75% of a 40 h syllabus = 30 h covered')
ok(hasContentSignal(byPercent), 'a stated percentage is a real content signal')
ok(contentFraction(mkPlan('X', 'Y', { requiredHours: 10, method: 'percent', overallPercentCovered: 140 })) === 1,
  'an out-of-range percentage is clamped, never trusted blindly')
ok(!hasContentSignal(mkPlan('X', 'Y', { requiredHours: 10, method: 'percent' })),
  'choosing the method without stating a figure is not yet a signal')

// (i) Chapter-count method: total chapters + how many are done. No names typed.
const byCount = mkPlan('Hist', 'IX-A', { requiredHours: 40, method: 'count', totalChapters: 10, chaptersCovered: 4 })
ok(effectiveMethod(byCount) === 'count', 'chapter-count method recognised')
ok(contentFraction(byCount) === 0.4, 'count method: 4 of 10 chapters = 40% of the syllabus')
ok(coveredHours(byCount) === 16 && coveragePct(byCount) === 40, 'count method drives covered hours (40% of 40 h = 16 h)')
ok(hasContentSignal(byCount), 'count method is a real content signal')

// (ii) Named checklist, WITH a partially-taught chapter (v6 addition)
const byNames = mkPlan('Geo', 'IX-A', {
  chapters: [
    { id: 'a', name: 'Ch1', hours: 10, coveredAt: 'x' },        // done
    { id: 'b', name: 'Ch2', hours: 10, percentCovered: 50 },     // half taught
    { id: 'c', name: 'Ch3', hours: 20 },                         // not started
  ],
})
ok(effectiveMethod(byNames) === 'named', 'named-checklist method recognised')
ok(chapterFraction(byNames.chapters[1]) === 0.5, 'a partly-taught chapter counts as its percentage')
ok(contentFraction(byNames) === 0.375, 'named method: (10 + 5) of 40 h = 37.5% covered')
ok(coveredHours(byNames) === 15, 'partial chapters contribute their share of hours, not all-or-nothing')
ok(chapterFraction({ id: 'z', name: 'z', hours: 1, coveredAt: 'x', percentCovered: 20 }) === 1,
  'a ticked chapter is 100% even if a stale percentage lingers')

// The two methods are per SUBJECT, not system-wide — both can coexist
const mixedPlans: Record<string, SyllabusPlan> = {
  [planKey('Hist', 'IX-A')]: byCount,
  [planKey('Geo', 'IX-A')]: byNames,
}
const mixedRows = coverageRows(mixedPlans)
ok(mixedRows.length === 2 && mixedRows.every(r => r.required > 0),
  'one school can run both entry methods at once — dashboards consume either transparently')

// ── v6's hard rule: a holiday must NEVER move content coverage ──
const contentBefore = coveragePct(byNames)
const holidayHit = withHolidayImpact(
  { [planKey('Geo', 'IX-A')]: byNames },
  { [planKey('Geo', 'IX-A')]: { hours: 6, dates: ['2026-08-17'] } },
)[planKey('Geo', 'IX-A')]
ok(coveragePct(holidayHit) === contentBefore,
  'a holiday leaves the CONTENT percentage untouched (v6: it only affects duration)')
ok(lostHours(holidayHit) === 6, 'the same holiday does show up as lost DURATION')
ok(riskOf(holidayHit) === 'critical', 'and it still raises the risk flag, via time — not by faking content')

// Logged hours must not inflate content either, once a content signal exists
const loggedButUntaught = mkPlan('Bio', 'IX-A', { chapters: [{ id: 'x', name: 'C1', hours: 20 }], loggedHours: 15 })
ok(coveredHours(loggedButUntaught) === 0,
  'logging 15 h against an untaught chapter covers NO syllabus — duration is not content')

// ── v5 Holiday handling — declared once, hours DERIVED from the timetable ──
import { holidayImpact, totalHolidayHours, weekdayOf, type Holiday } from './src/lib/holidays'
import { withHolidayImpact } from './src/lib/syllabusTracking'

ok(weekdayOf('2026-08-17') === 'MONDAY', 'weekday derived from an ISO date')
ok(weekdayOf('not-a-date') === '', 'unparseable date yields no weekday')

// VI-A has 2 Maths + 1 Science on Monday; VI-B has 1 Maths on Monday.
const holTT: any = {
  'VI-A': {
    MONDAY:  { p1: { subject: 'Maths', teacher: 'A' }, p2: { subject: 'Science', teacher: 'B' }, p3: { subject: 'Maths', teacher: 'A' } },
    TUESDAY: { p1: { subject: 'Maths', teacher: 'A' } },
  },
  'VI-B': { MONDAY: { p1: { subject: 'Maths', teacher: 'A' } } },
}
const mondayHoliday: Holiday[] = [{ id: 'h1', date: '2026-08-17', name: 'Independence Day' }]  // a Monday
const imp = holidayImpact(holTT, mondayHoliday, 60)   // 60-min periods → 1 h each
ok(imp[planKey('Maths', 'VI-A')]?.hours === 2, 'Maths VI-A loses its 2 Monday periods (2 h at 60-min periods)')
ok(imp[planKey('Science', 'VI-A')]?.hours === 1, 'Science VI-A loses its 1 Monday period')
ok(imp[planKey('Maths', 'VI-B')]?.hours === 1, 'the holiday hits every section, not just one')
ok(!imp[planKey('Maths', 'VI-A')]?.dates.includes('2026-08-18'), 'Tuesday lessons are untouched by a Monday holiday')
ok(totalHolidayHours(imp) === 4, 'school-wide total is 4 h lost for that one holiday')

// Period length feeds through
ok(holidayImpact(holTT, mondayHoliday, 40)[planKey('Maths', 'VI-A')]?.hours === 1.3,
  '40-min periods → 2 periods = 1.3 h, not 2 h')

// Scoped holiday (e.g. exam leave for one section only)
const scoped: Holiday[] = [{ id: 'h2', date: '2026-08-17', name: 'Section trip', sections: ['VI-B'] }]
const impScoped = holidayImpact(holTT, scoped, 60)
ok(!impScoped[planKey('Maths', 'VI-A')] && impScoped[planKey('Maths', 'VI-B')]?.hours === 1,
  'a section-scoped holiday only costs that section')
// …and a multi-section scope costs exactly those, no more.
const impBoth = holidayImpact(holTT, [{ id: 'h3', date: '2026-08-17', name: 'Class VI exam', sections: ['VI-A', 'VI-B'] }], 60)
ok(totalHolidayHours(impBoth) === 4 && impBoth[planKey('Science', 'VI-A')]?.hours === 1,
  'a holiday scoped to several sections costs each of them')

// ── "Applies to": whole school vs particular classes ──
import { groupSections, describeScope } from './src/components/ScopePicker'
const allSecs = ['VI-A', 'VI-B', 'VII-A', 'VIII-A']
const grouped = groupSections(allSecs)
ok(grouped.length === 3 && grouped[0].cls === 'VI' && grouped[0].sections.length === 2,
  'sections group under their class, so "all of VI" is one tap')
ok(describeScope([], allSecs) === 'Whole school', 'an empty scope IS the whole school — the default needs no thought')
ok(describeScope(undefined, allSecs) === 'Whole school', 'and so is an absent one (older records)')
ok(describeScope(['VI-A', 'VI-B'], allSecs) === 'VI',
  'every section of a class reads as the class, not a list of its sections')
ok(describeScope(['VI-A'], allSecs) === 'VI-A', 'one section of a two-section class still names the section')
ok(describeScope(['VI-A', 'VI-B', 'VII-A'], allSecs) === 'VI, VII-A',
  'a mixed scope names whole classes first, then the loose sections')

// Merging into plans makes every existing helper holiday-aware, unchanged
const holPlans: Record<string, SyllabusPlan> = {
  [planKey('Maths', 'VI-A')]: mkPlan('Maths', 'VI-A', { requiredHours: 40, loggedHours: 30, teacher: 'A' }),
}
ok(riskOf(holPlans[planKey('Maths', 'VI-A')]) === 'on-track', 'before holidays: on-track at 75%')
const merged = withHolidayImpact(holPlans, imp)
ok(lostHours(merged[planKey('Maths', 'VI-A')]) === 2, 'merged plan carries the 2 holiday hours')
ok(riskOf(merged[planKey('Maths', 'VI-A')]) === 'critical',
  'after holidays: the SAME 75% becomes critical — lost time must be found again')
ok(withHolidayImpact(holPlans, {})[planKey('Maths', 'VI-A')] === holPlans[planKey('Maths', 'VI-A')],
  'no holidays → plans returned untouched (no needless copying)')
ok(Object.keys(withHolidayImpact({}, imp)).length === 0,
  'holiday hours for a subject with no syllabus plan are ignored, not invented')

// ── PACE: content covered vs time spent ("taught long but covered little") ──
import { paceFor, scheduledHoursBetween, contentCoveredHours, willNotFinish } from './src/lib/syllabusPace'

// VI-A has Maths twice on Mondays, 60-min periods → 2 h per teaching week.
const paceTT: any = {
  'VI-A': { MONDAY: { p1: { subject: 'Maths', teacher: 'A' }, p2: { subject: 'Maths', teacher: 'A' } } },
}
const TERM = { termStart: '2026-01-05', termEnd: '2026-03-30', today: '2026-02-02', periodMinutes: 60 }
// Jan 5→Feb 2 inclusive = 5 Mondays = 10 h spent; Feb 3→Mar 30 = 8 Mondays = 16 h left.
ok(scheduledHoursBetween(paceTT, 'Maths', 'VI-A', '2026-01-05', '2026-02-02', 60) === 10,
  'time spent is DERIVED from the timetable (5 Mondays × 2 periods = 10 h) — nobody types it')
ok(scheduledHoursBetween(paceTT, 'Maths', 'VI-A', '2026-02-03', '2026-03-30', 60) === 16,
  'time remaining likewise derived (8 Mondays = 16 h)')
ok(scheduledHoursBetween(paceTT, 'Science', 'VI-A', '2026-01-05', '2026-02-02', 60) === 0,
  'only the subject actually on the timetable counts')

const ch = (id: string, hours: number, done?: boolean) => ({ id, name: id, hours, coveredAt: done ? 'x' : undefined })
/** Hour-less chapter — the shape all new data takes; chapters weigh equally. */
const ch2 = (id: string, done?: boolean) => ({ id, name: id, coveredAt: done ? 'x' : undefined })

// SAME 10 h taught. Different amounts of syllabus actually covered.
const slow = mkPlan('Maths', 'VI-A', { teacher: 'A', chapters: [ch('c1', 5, true), ch('c2', 15), ch('c3', 20)] })   // 5 of 40 h covered
const fast = mkPlan('Maths', 'VI-A', { teacher: 'A', chapters: [ch('c1', 20, true), ch('c2', 10), ch('c3', 10)] })  // 20 of 40 h covered

const slowR = paceFor(slow, paceTT, TERM)
const fastR = paceFor(fast, paceTT, TERM)
ok(slowR.timeSpent === 10 && fastR.timeSpent === 10, 'both teachers spent the SAME 10 h of class time')
ok(contentCoveredHours(slow) === 5 && contentCoveredHours(fast) === 20, 'but covered very different amounts of syllabus')
ok(slowR.pace === 0.5, 'taught long, covered little → pace 0.5 (half the planned rate)')
ok(fastR.pace === 2, 'taught little, covered much → pace 2.0 (double the planned rate)')
ok(slowR.projectedHoursNeeded === 70 && !slowR.willFinish && slowR.shortfallHours === 54,
  'slow pace projects 70 h needed vs 16 h left → will NOT finish, 54 h short')
ok(fastR.projectedHoursNeeded === 10 && fastR.willFinish && fastR.shortfallHours === 0,
  'fast pace projects 10 h needed vs 16 h left → finishes comfortably')

// The point of the whole exercise: hours alone would have called these identical.
ok(slowR.timeSpent === fastR.timeSpent && slowR.willFinish !== fastR.willFinish,
  'identical hours taught, opposite verdicts — which is exactly what hours-only tracking missed')

// Holidays: a lost day adds no content and no time spent, but permanently
// removes time that was remaining — so the projection gets worse by itself.
const holidayOnAMonday: Holiday[] = [{ id: 'h', date: '2026-02-09', name: 'Holiday' }]
const afterHoliday = paceFor(fast, paceTT, { ...TERM, holidays: holidayOnAMonday })
ok(afterHoliday.timeSpent === 10, 'a FUTURE holiday does not change time already spent')
ok(afterHoliday.timeRemaining === 14, 'the holiday permanently removes that Monday’s 2 h from the time left (16 → 14)')
ok(afterHoliday.contentCovered === fastR.contentCovered, 'a holiday covers no syllabus — content is unchanged')
// Even at a perfect pace of 1.0, a subject can simply not have enough slots left:
// 1 period/week → 5 h spent, 8 h remaining, but 12 h of syllabus still to cover.
const paceTTtight: any = { 'VI-A': { MONDAY: { p1: { subject: 'Maths', teacher: 'A' } } } }
const tight = paceFor(mkPlan('Maths', 'VI-A', { teacher: 'A', chapters: [ch('c1', 5, true), ch('c2', 12)] }), paceTTtight, TERM)
ok(tight.pace === 1 && !tight.willFinish && tight.shortfallHours === 4,
  'on-pace but under-scheduled: 12 h of syllabus vs 8 h of slots left → 4 h short, caught before the term ends')

// Past the term end, the term is over: spent stops at the last teaching day and
// nothing remains — it must not keep accruing for months afterwards.
const afterTerm = paceFor(fast, paceTT, { ...TERM, today: '2026-12-31' })
ok(afterTerm.timeSpent === 26 && afterTerm.timeRemaining === 0,
  'after the term ends, time spent stops at the final teaching day (26 h) and 0 h remain')
const beforeTerm = paceFor(fast, paceTT, { ...TERM, today: '2025-12-01' })
ok(beforeTerm.timeSpent === 0, 'before the term starts, no time has been spent')

// No chapters → no content signal; we say so rather than invent a pace.
const bulk = mkPlan('Maths', 'VI-A', { requiredHours: 40, loggedHours: 10, teacher: 'A' })
ok(paceFor(bulk, paceTT, TERM).hasContentSignal === false,
  'a school logging only bulk hours has no content signal — flagged, not faked')

// The at-risk feed
const pacePlans: Record<string, SyllabusPlan> = {
  [planKey('Maths', 'VI-A')]: slow,
}
ok(willNotFinish(pacePlans, paceTT, TERM).length === 1, 'projection feed lists the subject that will miss the term')
ok(willNotFinish({ [planKey('Maths', 'VI-A')]: fast }, paceTT, TERM).length === 0,
  'a subject on track to finish is not reported')

// ── SUBSTITUTION-AWARE COVERAGE (v6): a covered period ≠ a taught syllabus ──
import {
  coverageLoss, hoursNotSpent, bonusSessions, awaitingConfirmation, slotKey,
  type SubCoverageRecord,
} from './src/lib/substitutionCoverage'
import { withLostImpact, lostHours, riskOf } from './src/lib/syllabusTracking'

const sub = (o: Partial<SubCoverageRecord>): SubCoverageRecord => ({
  id: o.id ?? Math.random().toString(36).slice(2, 8),
  date: '2026-01-12', sid: 's1', section: 'VI-A', periodId: 'p1',
  subject: 'Maths', absent: 'A', substitute: 'B', intent: 'skip', hours: 1, ...o,
})

// 0. THE DEFAULT. Arranging cover asks nobody anything, so a fresh record is
//    'skip': logged, but with no effect on any figure whatsoever. The subject
//    teacher's chapter ticks remain the only measure of coverage.
const undecided = [sub({ intent: 'skip', hours: 2 })]
ok(Object.keys(coverageLoss(undecided)).length === 0,
  'an unanswered cover costs nothing — silence is not evidence the lesson was wasted')
ok(Object.keys(hoursNotSpent(undecided)).length === 0, 'nor is any time credited back')
ok(Object.keys(bonusSessions(undecided)).length === 0, 'nor gifted to another subject')
ok(awaitingConfirmation(undecided).length === 1,
  'it simply waits for the subject teacher, who may also ignore it entirely')

// 1. Continues the syllabus → nothing is lost, nothing is deducted.
const contd = [sub({ intent: 'continue' })]
ok(Object.keys(coverageLoss(contd)).length === 0, 'a substitute continuing the syllabus costs the subject nothing')
ok(Object.keys(hoursNotSpent(contd)).length === 0, 'continuing cover spends the hour as normal')
ok(awaitingConfirmation(contd).length === 1,
  'but the claim is unconfirmed until the absent teacher confirms it — never auto-counted')
ok(awaitingConfirmation([sub({ intent: 'continue', confirmedAt: 'now' })]).length === 0,
  'once confirmed it stops asking')

// 2. Just takes the class → the hour is SPENT, the syllabus does not move.
const occupied = [sub({ intent: 'occupy', hours: 2 })]
ok(coverageLoss(occupied)[planKey('Maths', 'VI-A')].hours === 2,
  'taking the class without the syllabus loses those 2 h of syllabus time')
ok(hoursNotSpent(occupied)[planKey('Maths', 'VI-A')] === undefined,
  'that time WAS spent on this subject — it just produced nothing, so pace is not credited back')
ok(awaitingConfirmation(occupied).length === 0, 'nothing to confirm — no coverage was claimed')

// 3. Teaches another subject → the owner loses the period; the other subject
//    gains content WITHOUT spending any of its own hours.
const swapped = [sub({ intent: 'other-subject', taughtSubject: 'Science', hours: 1.5 })]
ok(coverageLoss(swapped)[planKey('Maths', 'VI-A')].hours === 1.5, 'Maths loses the period it owned')
ok(hoursNotSpent(swapped)[planKey('Maths', 'VI-A')] === 1.5,
  'and is not charged for time it never received')
const bonusMap = bonusSessions(swapped)
ok(bonusMap[planKey('Science', 'VI-A')].hours === 1.5 && bonusMap[planKey('Science', 'VI-A')].from[0] === 'Maths',
  'Science gains 1.5 free hours, credited from Maths')
ok(bonusSessions(occupied)[planKey('Science', 'VI-A')] === undefined,
  'merely occupying a class gifts nobody anything')

// The gain is real: same content, no time spent → the pace IMPROVES.
const sciTT: any = { 'VI-A': { MONDAY: { p1: { subject: 'Science', teacher: 'B' } } } }
const sciPlan = mkPlan('Science', 'VI-A', { teacher: 'B', requiredHours: 40, chapters: [ch2('c1', true), ch2('c2'), ch2('c3'), ch2('c4')] })
const sciBase = paceFor(sciPlan, sciTT, TERM)
ok(sciBase.timeSpent === 5 && sciBase.contentCovered === 10, 'Science: 5 h spent, 10 h of syllabus covered')
ok(sciBase.pace === 2, 'so its pace is 2.0 — the free session cost it no time at all')

// Whereas the subject that LOST the period is not charged for it.
const mathsPlan = mkPlan('Maths', 'VI-A', { teacher: 'A', requiredHours: 40, chapters: [ch2('c1', true), ch2('c2'), ch2('c3'), ch2('c4')] })
const charged = paceFor(mathsPlan, paceTT, TERM)
const notCharged = paceFor(mathsPlan, paceTT, { ...TERM, hoursNotSpent: 2 })
ok(charged.timeSpent === 10 && notCharged.timeSpent === 8,
  'a period taken by another subject comes OFF this subject\'s time spent (10 h → 8 h)')
ok(notCharged.pace > charged.pace, 'so the teacher is not blamed for a lesson they never got to give')

// Folded into the plans, a non-continuing cover reads as lost syllabus time and
// escalates the subject exactly like a holiday does — same machinery.
const subPlans = { [planKey('Maths', 'VI-A')]: mkPlan('Maths', 'VI-A', { requiredHours: 40, loggedHours: 10, teacher: 'A' }) }
const afterSub = withLostImpact(subPlans, coverageLoss(occupied), {
  reason: 'absence', idPrefix: 'substitution', note: () => 'cover did not advance the syllabus',
})
ok(lostHours(afterSub[planKey('Maths', 'VI-A')]) === 2, 'the 2 lost hours land on the plan')
ok(riskOf(afterSub[planKey('Maths', 'VI-A')]) === 'critical',
  'and the subject is flagged for rescheduling — that time has to be found again')
ok(lostHours(subPlans[planKey('Maths', 'VI-A')]) === 0, 'the original plan is untouched — effects are derived, not written')

// ── THE ABSENCE NOBODY COVERED ──
// The case the old model missed: a teacher is out, no substitute is found, and
// the timetable goes on claiming the lesson ran.
import { uncoveredAbsenceLoss, absentOn } from './src/lib/substitutionCoverage'
import type { CalLeave } from './src/lib/leaveUtils'

// VI-A: Maths twice on Monday (teacher A) + Science once (teacher B).
const absTT: any = {
  'VI-A': {
    MONDAY: {
      p1: { subject: 'Maths', teacher: 'A' },
      p2: { subject: 'Maths', teacher: 'A' },
      p3: { subject: 'Science', teacher: 'B' },
    },
  },
}
const leaveA: CalLeave[] = [{ id: 'l1', teacher: 'A', date: '2026-01-12', duration: 'full', type: 'Sick Leave' }]
const absLoss = uncoveredAbsenceLoss(leaveA, absTT, [], 60)
ok(absLoss[planKey('Maths', 'VI-A')]?.hours === 2,
  'an uncovered absence loses every period that teacher was due to teach (2 h)')
ok(!absLoss[planKey('Science', 'VI-A')],
  'the colleague who turned up is untouched — absence is per teacher, not per day')

// Cover one of the two periods: only the uncovered one is still lost.
const oneCovered = [sub({ date: '2026-01-12', section: 'VI-A', periodId: 'p1', subject: 'Maths', absent: 'A' })]
ok(uncoveredAbsenceLoss(leaveA, absTT, oneCovered, 60)[planKey('Maths', 'VI-A')]?.hours === 1,
  'a period that got a substitute is not counted again here — its record already says what happened')
// …and it must be that DATE's cover, not the same weekday a week earlier.
const wrongWeek = [sub({ date: '2026-01-05', section: 'VI-A', periodId: 'p1', subject: 'Maths', absent: 'A' })]
ok(uncoveredAbsenceLoss(leaveA, absTT, wrongWeek, 60)[planKey('Maths', 'VI-A')]?.hours === 2,
  'cover arranged on a different date does not excuse this one')

// A long absence spans every date in the range — two Mondays here.
const longLeave: CalLeave[] = [{ id: 'l2', teacher: 'A', date: '2026-01-12', endDate: '2026-01-23', duration: 'long', type: 'Training' }]
const longLoss = uncoveredAbsenceLoss(longLeave, absTT, [], 60)
ok(longLoss[planKey('Maths', 'VI-A')]?.hours === 4 && longLoss[planKey('Maths', 'VI-A')].dates.length === 2,
  'a two-week absence costs both Mondays (4 h), dated individually')

// Half-day leave is NOT guessed at: we know half the day was missed, not which half.
const halfLeave: CalLeave[] = [{ id: 'l3', teacher: 'A', date: '2026-01-12', duration: 'half', type: 'Personal' }]
ok(Object.keys(uncoveredAbsenceLoss(halfLeave, absTT, [], 60)).length === 0,
  'half-day leave charges nothing automatically — inventing which periods were missed would be fabrication')

// A day the school was closed anyway must not be charged twice.
const onHoliday = uncoveredAbsenceLoss(leaveA, absTT, [], 60, (d) => d === '2026-01-12')
ok(Object.keys(onHoliday).length === 0,
  'an absence on a declared holiday costs nothing extra — the holiday already took that time')

// Period length feeds through the same way it does for holidays.
ok(uncoveredAbsenceLoss(leaveA, absTT, [], 40)[planKey('Maths', 'VI-A')]?.hours === 1.3,
  '40-min periods → 2 uncovered periods = 1.3 h, accumulated then converted once')

ok(absentOn(longLeave, '2026-01-15')[0] === 'A' && absentOn(longLeave, '2026-02-15').length === 0,
  'who was out on a date respects the whole leave range')

// One record per slot per date, so re-assigning cover can never double-count.
ok(slotKey(sub({})) === slotKey(sub({ substitute: 'C' })), 'the slot key ignores who covered it')
ok(slotKey(sub({})) !== slotKey(sub({ date: '2026-01-19' })), 'but the same weekly slot on another date is its own record')

// ── ALLOCATION: the timetable already knows the hours, so nobody types them ──
import {
  allocatedHoursByPlan, elapsedHoursByPlan, futureHoursByPlan, unionEntities, compareSection, classRank, liveSections,
  teachingMap, cascadeOptions, teacherFor, matchStaffName,
} from './src/lib/scheduleAllocation'
import { withAllocatedHours } from './src/lib/syllabusTracking'

// Two schedules running side by side, each with its OWN bell and term.
const bundleA: any = {
  id: 'a', name: 'I–V TT', staff: [{ name: 'Anita' }], sections: [], rooms: [], subjects: [], periods: [],
  config: { periodMinutes: 60, timetableStartDate: '2026-01-05', timetableEndDate: '2026-03-30' },
  classTT: { 'I-A': { MONDAY: { p1: { subject: 'English', teacher: 'Anita' } } } },
  substitutions: {},
}
const bundleB: any = {
  id: 'b', name: 'VI–X TT', staff: [{ name: 'Bhaskar' }], sections: [], rooms: [], subjects: [], periods: [],
  config: { periodMinutes: 30, timetableStartDate: '2026-01-05', timetableEndDate: '2026-03-30' },
  classTT: { 'X-A': { MONDAY: { p1: { subject: 'Physics', teacher: 'Bhaskar' } } } },
  substitutions: {},
}

// 13 Mondays in the term. A: 13 × 60 min = 13 h. B: 13 × 30 min = 6.5 h.
const alloc = allocatedHoursByPlan([bundleA, bundleB])
ok(alloc[planKey('English', 'I-A')] === 13, 'allocation is derived from the timetable — 13 Mondays × 60 min = 13 h')
ok(alloc[planKey('Physics', 'X-A')] === 6.5,
  "each schedule uses ITS OWN period length — 30-min periods give 6.5 h, not 13")

// The union is what a school with two active schedules must see.
const union = unionEntities([bundleA, bundleB])
ok(union.sections.length === 2 && union.sections.includes('I-A') && union.sections.includes('X-A'),
  'both schedules contribute their class-sections — not just whichever was opened last')
ok(union.subjects.join() === 'English,Physics' && union.staff.join() === 'Anita,Bhaskar',
  'subjects and staff are unioned too')
ok(union.scheduleOf['X-A'] === 'VI–X TT', 'each section remembers which schedule it came from')

// Class order is school order, not alphabetical.
ok(compareSection('Nursery-A', 'I-A') < 0, 'Nursery sorts before Class I')
ok(compareSection('II-A', 'X-A') < 0, 'II sorts before X — alphabetically it would not')
ok(classRank('Nursery') < classRank('I') && classRank('I') < classRank('II'), 'ranks ascend as a school lists them')

// A DROPPED class must not haunt the pickers. A generated timetable keeps
// whatever sections existed when it ran, so a school that has since removed its
// Nursery classes had them appearing in every dropdown — labelled with the
// schedule they were removed from. The roster is the authority on what exists.
const staleTT: any = {
  id: 'c', name: 'I–V TT', staff: [], rooms: [], subjects: [], periods: [],
  // Roster says I-A only. The generated timetable still carries Nursery-A.
  sections: [{ name: 'I-A' }],
  config: { periodMinutes: 60, timetableStartDate: '2026-01-05', timetableEndDate: '2026-03-30' },
  classTT: {
    'I-A':       { MONDAY: { p1: { subject: 'English', teacher: 'Anita' } } },
    'Nursery-A': { MONDAY: { p1: { subject: 'English', teacher: 'Anita' } } },
  },
  substitutions: {},
}
ok(liveSections(staleTT).join() === 'I-A',
  'a section left behind in a stale generated timetable is not a section the school has')
ok(unionEntities([staleTT]).sections.join() === 'I-A',
  'so it never reaches the class-section picker')
ok(allocatedHoursByPlan([staleTT])[planKey('English', 'Nursery-A')] === undefined,
  'and it gets no allocation, so no phantom plan is seeded for it')
ok(allocatedHoursByPlan([staleTT])[planKey('English', 'I-A')] === 13,
  'while the section that IS in the roster is allocated normally')

// The other half: a section in the roster that nobody scheduled adds no row.
const unscheduled: any = { ...staleTT, sections: [{ name: 'I-A' }, { name: 'V-C' }] }
ok(!unionEntities([unscheduled]).sections.includes('V-C'),
  'a rostered section with no periods stays out — there is nothing to report on it')

// Older snapshots that never stored a roster must still work.
const noRoster: any = { ...staleTT, sections: [] }
ok(liveSections(noRoster).length === 2,
  'a bundle with no roster falls back to its timetable rather than showing nothing')

// ── SPENT is derived, COVERAGE is recorded — never the same number ──
// The schedule is published, so the app knows which periods have already run.
// Jan 5 → Feb 2 inclusive is 5 Mondays; the term runs to Mar 30.
ok(elapsedHoursByPlan([bundleA], '2026-02-02')[planKey('English', 'I-A')] === 5,
  'hours already run come from the published schedule — 5 Mondays elapsed, nobody typed it')
ok(elapsedHoursByPlan([bundleA], '2026-01-04')[planKey('English', 'I-A')] === undefined,
  'nothing has run before the term starts')
ok(elapsedHoursByPlan([bundleA], '2026-12-31')[planKey('English', 'I-A')] === 13,
  'and it stops at the final teaching day instead of growing for ever')
ok(elapsedHoursByPlan([bundleA], '2026-02-02', () => [{ id: 'h', date: '2026-01-12', name: 'x' }])[planKey('English', 'I-A')] === 4,
  'a holiday means the period never ran, so it is not time spent either')
// The distinction that matters: spent moves on its own, covered does not.
const spentPlan = withAllocatedHours({}, allocatedHoursByPlan([bundleA]))[planKey('English', 'I-A')]
ok(requiredHours(spentPlan) === 13 && coveredHours(spentPlan) === 0,
  'five hours can have run with zero syllabus covered — the gap is the whole point')

// TIME LEFT is measured, not subtracted. Allocated is the term as planned;
// spent has holidays removed. So allocated − spent would hand back every past
// holiday as though it were still available.
const holidayOnJan12 = () => [{ id: 'h', date: '2026-01-12', name: 'x' }]
const allocA = allocatedHoursByPlan([bundleA])[planKey('English', 'I-A')]
const spentA = elapsedHoursByPlan([bundleA], '2026-02-02', holidayOnJan12)[planKey('English', 'I-A')]
const leftA  = futureHoursByPlan([bundleA], '2026-02-02', holidayOnJan12)[planKey('English', 'I-A')]
ok(allocA === 13 && spentA === 4 && leftA === 8,
  'allocated 13 h, 4 h run (one Monday lost to a holiday), 8 h still to come')
ok(allocA - spentA === 9 && leftA === 8,
  'and subtracting would have claimed 9 h left — the extra hour is the holiday, which is gone')
ok(spentA + leftA + 1 === allocA,
  'spent + left + time lost = allocated, so the figures reconcile instead of overlapping')
ok(futureHoursByPlan([bundleA], '2026-03-30')[planKey('English', 'I-A')] === undefined,
  'nothing is still to come once the term has ended')
ok(futureHoursByPlan([bundleA], '2025-12-01')[planKey('English', 'I-A')] === 13,
  'before the term starts, the whole term is still to come')
// Today counts as spent, never as both.
const onATeachingDay = {
  spent: elapsedHoursByPlan([bundleA], '2026-01-12')[planKey('English', 'I-A')],
  left: futureHoursByPlan([bundleA], '2026-01-12')[planKey('English', 'I-A')],
}
ok(onATeachingDay.spent + onATeachingDay.left === 13,
  "a lesson today is counted once — spent, not also still to come")

// The bug this replaced: with nothing covered, "remaining syllabus" equals
// "allocated", so showing both said the same thing twice.
const nothingCovered = withAllocatedHours({}, allocatedHoursByPlan([bundleA]))[planKey('English', 'I-A')]
ok(requiredHours(nothingCovered) === remainingHours(nothingCovered),
  'remaining-syllabus IS allocated until something is recorded — which is why the headline now shows time left instead')
ok(leftA !== allocA, 'time left is a different measurement, so it never mirrors allocated')

// ── CASCADING PICKERS: any of the three can be the entry point ──
const mapTT: any = {
  id: 'm', name: 'Main', staff: [], rooms: [], subjects: [], periods: [],
  sections: [{ name: 'I-A' }, { name: 'I-B' }, { name: 'II-A' }],
  config: { periodMinutes: 60, timetableStartDate: '2026-01-05', timetableEndDate: '2026-03-30' },
  classTT: {
    'I-A':  { MONDAY: { p1: { subject: 'English', teacher: 'Anita' }, p2: { subject: 'Maths', teacher: 'Bhaskar' } } },
    'I-B':  { MONDAY: { p1: { subject: 'English', teacher: 'Anita' } } },
    'II-A': { MONDAY: { p1: { subject: 'Maths', teacher: 'Chandra' } } },
  },
  substitutions: {},
}
const map = teachingMap(mapTT ? [mapTT] : [])
ok(map.length === 4, 'the teaching map lists every (section, subject, teacher) the timetable assigns')

// Start from a faculty member → only their classes and subjects remain.
const byAnita = cascadeOptions(map, { teacher: 'Anita' })
ok(byAnita.sections.join() === 'I-A,I-B' && byAnita.subjects.join() === 'English',
  'choosing a faculty member narrows to the classes and subjects they teach')

// Start from a class-section → only the subjects it is taught, and their staff.
const cascByClass = cascadeOptions(map, { section: 'I-A' })
ok(cascByClass.subjects.join() === 'English,Maths' && cascByClass.teachers.join() === 'Anita,Bhaskar',
  'choosing a class-section loads the subjects mapped to it, and who teaches them')

// Start from a subject → only the sections and staff attached to it.
const cascBySubject = cascadeOptions(map, { subject: 'Maths' })
ok(cascBySubject.sections.join() === 'I-A,II-A' && cascBySubject.teachers.join() === 'Bhaskar,Chandra',
  'choosing a subject loads its class-sections and mapped faculty')

// Combinations that don't exist are never offered.
ok(cascadeOptions(map, { teacher: 'Anita', section: 'II-A' }).subjects.length === 0,
  'a combination the timetable has no assignment for offers nothing, rather than a dead zero')
ok(teacherFor(map, 'Maths', 'II-A') === 'Chandra', 'and the teacher of a slot is read off the schedule')

// A faculty account is matched to their timetable name, loosely but not wildly.
ok(matchStaffName(map, { name: 'anita' }) === 'Anita', 'case-insensitive name match')
ok(matchStaffName(map, { name: '', email: 'bhaskar@school.edu' }) === 'Bhaskar', 'falls back to the email local part')
ok(matchStaffName(map, { name: 'chandra.k', email: 'x@y.z' }) === undefined,
  'a near-miss is NOT matched — showing someone else\'s classes would be worse than showing none')

// Folding allocation into the plans: seeds what has none, respects an override.
const seeded = withAllocatedHours({}, alloc)
ok(requiredHours(seeded[planKey('English', 'I-A')]) === 13,
  'a subject nobody has touched still shows its allocated hours — no empty box to fill in')
ok(riskOf(seeded[planKey('English', 'I-A')]) === 'untracked',
  'but with nothing recorded it stays UNTRACKED, so seeding cannot flood the alert')
const overridden = withAllocatedHours(
  { [planKey('English', 'I-A')]: mkPlan('English', 'I-A', { requiredHours: 20 }) }, alloc)
ok(requiredHours(overridden[planKey('English', 'I-A')]) === 20,
  'an explicit figure wins — a syllabus needing more than it was allocated must show the gap')
const filled = withAllocatedHours(
  { [planKey('English', 'I-A')]: mkPlan('English', 'I-A', { overallPercentCovered: 50 }) }, alloc)
ok(requiredHours(filled[planKey('English', 'I-A')]) === 13 && coveredHours(filled[planKey('English', 'I-A')]) === 6.5,
  'a plan with content but no hours takes the timetable figure, and coverage follows from it')
ok(riskOf(filled[planKey('English', 'I-A')]) === 'on-track',
  'once something IS recorded the subject is assessed normally again')

// ── PERIOD ALLOCATION ENGINE (master doc "STEP 6") ──
// "System automatically generates: Subject | Weekly Periods … based on CBSE
//  norms, working days, period duration, academic hours." The numbers are an
//  OUTPUT of the engine, not something anyone types on the Resources page.
import { scaleToTarget, periodsForHours, deriveWeeklySlots, toAllocationGrid } from './src/lib/periodAllocationEngine'

ok(periodsForHours(22.5, 45) === 30, '22.5 h/week at 45-min periods = 30 periods')
ok(periodsForHours(22.5, 60) === 22, 'the same norm at 60-min periods = 22 — period duration is a real input')
ok(periodsForHours(0, 45) === 0 && periodsForHours(22, 0) === 0, 'no norm or no duration → nothing derived')

// Scaling: the total must land EXACTLY on target, never near it.
ok(scaleToTarget([5, 5, 5], 30).join() === '5,5,5', 'a curriculum that already fits is left alone')
const squeezed = scaleToTarget([8, 6, 4, 2], 15)
ok(squeezed.reduce((a, b) => a + b, 0) === 15, 'a curriculum that overflows is scaled to fit the week exactly (sums to 15)')
ok(squeezed.every(v => v >= 1), 'and every subject keeps at least one period')
ok(squeezed[0] > squeezed[3], 'relative weight survives scaling — the heavier subject stays heavier')
const tightWeek = scaleToTarget([5, 4, 3, 2, 1], 3)
ok(tightWeek.reduce((a, b) => a + b, 0) === 3 && tightWeek.filter(v => v > 0).length === 3,
  'when there is not even one period each, the heaviest three are served and the rest are honestly zero')
ok(tightWeek[0] === 1 && tightWeek[4] === 0, 'served worst-first by curriculum weight, not by list order')
ok(scaleToTarget([], 10).length === 0 && scaleToTarget([3, 3], 0).join() === '0,0', 'degenerate inputs stay safe')
// Largest-remainder, not naive rounding: 3 equal subjects into 10 periods.
const remainder = scaleToTarget([4, 4, 4], 10)
ok(remainder.reduce((a, b) => a + b, 0) === 10,
  'ten periods across three equal subjects sums to 10 — naive rounding would have given 9 or 12')

// End to end: the same subjects, two different period lengths → different slots.
const engineInput = {
  sections: ['I-A'],
  subjects: [
    { name: 'English', sections: ['I-A'] },
    { name: 'Mathematics', sections: ['I-A'] },
    { name: 'Science', sections: ['I-A'] },
  ],
  board: 'CBSE',
  capacityFor: () => 30,
  periodMinutes: 45,
}
const derived = deriveWeeklySlots(engineInput)[0]
ok(derived.rows.length === 3 && derived.rows.every(r => r.ideal > 0),
  'the board knowledge base supplies the ideal weekly periods — nobody typed them')
ok(derived.totalSlots <= derived.target, 'the derivation never exceeds what the week can hold')

// The Step 0 norm caps the bell: 20 h/week at 45 min = 26 periods, below the
// bell's 30, so the norm wins.
const capped = deriveWeeklySlots({ ...engineInput, studentHoursWeekFor: () => 20 })[0]
ok(capped.normPeriods === 26 && capped.target === 26,
  "the student hours/week norm is the seed input, and caps the bell's capacity when it is lower")
ok(capped.totalSlots <= 26, 'so the allocation respects the national/custom norm, not just the grid')

// An override set on Mapping survives, and is not scaled away.
const withOverride = deriveWeeklySlots(engineInput, { 'I-A': { English: 9 } })[0]
const eng = withOverride.rows.find(r => r.subject === 'English')!
ok(eng.slots === 9 && eng.overridden, 'an explicit override replaces the derived figure')
ok(withOverride.rows.filter(r => !r.overridden).every(r => r.slots >= 1),
  'and the remaining subjects still get their share of what is left')

// A lab subject renders in the grid syntax the Mapping table already speaks.
const gridOut = toAllocationGrid(deriveWeeklySlots({
  ...engineInput,
  subjects: [{ name: 'Science', sections: ['I-A'], requiresLab: true }],
}))
ok(/\+1L$/.test(gridOut['I-A']['Science']), 'a lab subject is emitted as "n+1L" for the existing grid syntax')

// ── PER-DAY FACULTY WORKLOAD (Blueprint v6 Step 0) ──
// "entered as either: Per week, or Per day. Editing one field auto-updates the
//  other (per-day × working days = per-week, and vice versa)."
import {
  resolveCaps, effectiveCaps, atDailyLimit,
  perDayFromPerWeek, perWeekFromPerDay, periodsFromHours, hoursFromPeriods, displayCap,
} from './src/lib/facultyWorkload'

// The blueprint's linkage, both directions.
ok(perWeekFromPerDay(5, 5) === 25, 'per-day × working days = per-week (5/day × 5 = 25)')
ok(perDayFromPerWeek(25, 5) === 5, 'and back again (25/week ÷ 5 = 5/day)')
// Rounding is asymmetric ON PURPOSE — a derived daily figure must never make the
// admin's own weekly figure unreachable.
ok(perDayFromPerWeek(32, 5) === 7,
  '32/week over 5 days rounds UP to 7/day — rounding down to 6 would cap the week at 30 and contradict the stated 32')
ok(perWeekFromPerDay(perDayFromPerWeek(32, 5), 5) >= 32,
  'so the round-trip never shrinks the weekly budget')
// Hours → periods rounds DOWN, because a cap is a limit.
ok(periodsFromHours(20, 45) === 26, '20 h at 45-min periods = 26 periods (26.7 truncated, not rounded up past the stated hours)')
ok(periodsFromHours(20, 40) === 30, '20 h at 40-min periods = 30 periods exactly')
ok(hoursFromPeriods(30, 40) === 20, 'and back to 20 h')
ok(displayCap(30, 'hours', 40) === 20 && displayCap(30, 'periods', 40) === 30, 'the same cap shown in either unit')

// All four ways of stating the same constraint.
const asWeekPeriods = resolveCaps({ value: 25, span: 'week', unit: 'periods', workingDays: 5, periodMinutes: 40 })
const asDayPeriods  = resolveCaps({ value: 5,  span: 'day',  unit: 'periods', workingDays: 5, periodMinutes: 40 })
ok(asWeekPeriods.perWeek === 25 && asWeekPeriods.perDay === 5, '25 periods/week resolves to 5/day')
ok(asDayPeriods.perDay === 5 && asDayPeriods.perWeek === 25, '5 periods/day resolves to 25/week — the same constraint either way')
const asDayHours = resolveCaps({ value: 4, span: 'day', unit: 'hours', workingDays: 5, periodMinutes: 40 })
ok(asDayHours.perDay === 6 && asDayHours.perWeek === 30, '4 hours/day at 40 min = 6 periods/day = 30/week')
// The span the admin CHOSE stays authoritative — typing 5/day must not come
// back as 6/day via a weekly round-trip.
ok(resolveCaps({ value: 5, span: 'day', unit: 'periods', workingDays: 6, periodMinutes: 40 }).perDay === 5,
  'a stated per-day figure is never overwritten by re-deriving it from the week')
ok(resolveCaps({ value: 0, span: 'week', unit: 'periods', workingDays: 5, periodMinutes: 40 }).perWeek === 0,
  'a zero or blank entry means no cap, not a cap of zero-ish')

// Effective caps: own override first, else the norm — and the two must agree.
const norm = { perWeek: 30, perDay: 6 }
ok(effectiveCaps(undefined, norm, 5).perWeek === 30, 'a teacher with no overrides takes the school norm')
const weekOnly = effectiveCaps({ maxPeriodsPerWeek: 20 }, norm, 5)
ok(weekOnly.perWeek === 20 && weekOnly.perDay === 4,
  "a weekly-only override derives its OWN daily figure (4), not the norm's 6 — otherwise the two would contradict")
ok(weekOnly.weekOverridden && !weekOnly.dayOverridden, 'and only the week reads as overridden')
const dayOnly = effectiveCaps({ maxPeriodsPerDay: 3 }, norm, 5)
ok(dayOnly.perDay === 3 && dayOnly.perWeek === 30, 'a daily-only override keeps the norm week but binds each day at 3')

// Enforcement — the reason this is a constraint and not a form field.
ok(atDailyLimit(5, 5) && atDailyLimit(6, 5), 'a teacher at or past their daily cap is unavailable')
ok(!atDailyLimit(4, 5), 'and available below it')
ok(!atDailyLimit(99, 0), 'no cap set means no limit — never accidentally zero')

// ── THREE GRAINS: national → stage → class, and per-subject on top ──
// Each level states only what differs from the one above, so a school sets a
// stage figure once and corrects the single class or subject that departs.
import { studentHoursFor, expandSubjectOverrides } from './src/lib/facultyWorkload'

const noLimits = {}
ok(studentHoursFor('V', 'lowerPrimary', noLimits, 22.5) === 22.5,
  'with nothing set, a class follows the national norm')
ok(studentHoursFor('V', 'lowerPrimary', { studentMaxHoursWeek: { lowerPrimary: 25 } }, 22.5) === 25,
  'a STAGE figure overrides the national one for every class in it')
ok(studentHoursFor('V', 'lowerPrimary', {
  studentMaxHoursWeek: { lowerPrimary: 25 },
  studentMaxHoursWeekByClass: { V: 28 },
}, 22.5) === 28, 'and a CLASS figure overrides the stage — narrowest wins')
ok(studentHoursFor('IV', 'lowerPrimary', {
  studentMaxHoursWeek: { lowerPrimary: 25 },
  studentMaxHoursWeekByClass: { V: 28 },
}, 22.5) === 25, 'while its siblings keep following the stage — an override is not contagious')
ok(studentHoursFor('V', 'lowerPrimary', { studentMaxHoursWeekByClass: { V: 0 } }, 22.5) === 22.5,
  'a cleared class figure falls back rather than capping the class at zero')

// A subject override is stated once per CLASS and expands to its sections.
const expanded = expandSubjectOverrides(
  { V: { Mathematics: 8 } },
  ['V-A', 'V-B', 'IV-A'],
  (s) => s.split('-')[0],
)
ok(expanded['V-A']?.Mathematics === 8 && expanded['V-B']?.Mathematics === 8,
  'a subject override on Class V reaches V-A and V-B without being retyped per section')
ok(expanded['IV-A'] === undefined, 'and does not leak into another class')

// It reaches the engine: 8 periods of Maths survives the scaling untouched.
const subjOverride = deriveWeeklySlots({
  sections: ['V-A'],
  subjects: [
    { name: 'Mathematics', sections: ['V-A'] },
    { name: 'English', sections: ['V-A'] },
    { name: 'Science', sections: ['V-A'] },
  ],
  board: 'CBSE',
  capacityFor: () => 30,
  periodMinutes: 45,
}, { 'V-A': { Mathematics: 8 } })[0]
const maths = subjOverride.rows.find(r => r.subject === 'Mathematics')!
ok(maths.slots === 8 && maths.overridden,
  'the per-subject figure reaches the allocation engine and is not scaled away')
ok(subjOverride.totalSlots <= subjOverride.target,
  'and the rest of the curriculum still fits the week around it')

// ── SUGGEST MUST NOT DISCARD HAND-TYPED CELLS ──
// Re-deriving used to REPLACE the whole grid, so hand-tuning one section and
// then pressing Suggest for an unrelated reason threw that work away silently.
import { mergePreservingManual } from './src/lib/periodAllocationEngine'

const derivedGrid = { 'I-A': { Maths: '6', English: '5' }, 'I-B': { Maths: '6', English: '5' } }
const editedGrid  = { 'I-A': { Maths: '9', English: '5' }, 'I-B': { Maths: '6', English: '5' } }

const untouched = mergePreservingManual(derivedGrid, editedGrid, {})
ok(untouched.grid['I-A'].Maths === '6' && untouched.kept === 0,
  'with nothing marked manual, the derivation applies in full — the default behaviour is unchanged')

const keptEdit = mergePreservingManual(derivedGrid, editedGrid, { 'I-A': { Maths: true } })
ok(keptEdit.grid['I-A'].Maths === '9', "a hand-typed cell survives re-derivation — Suggest no longer overwrites it")
ok(keptEdit.grid['I-A'].English === '5' && keptEdit.grid['I-B'].Maths === '6',
  'while every other cell still takes the freshly derived figure')
ok(keptEdit.kept === 1, 'and the count reports exactly what was rescued, for telling the user')

// Clearing a cell hands it back to the norm rather than pinning an empty value.
const cleared = mergePreservingManual(derivedGrid, { 'I-A': { English: '5' } }, { 'I-A': { Maths: true } })
ok(cleared.grid['I-A'].Maths === '6' && cleared.kept === 0,
  'clearing a manual cell releases it back to the derivation')

// A manual entry the derivation no longer produces must not be deleted.
const orphan = mergePreservingManual({ 'I-A': { English: '5' } }, { 'I-A': { Drama: '2' } }, { 'I-A': { Drama: true } })
ok(orphan.grid['I-A'].Drama === '2',
  'a deliberate entry survives even when the curriculum norm stops suggesting that subject')

// A cell marked manual whose value matches the derivation isn't counted as rescued.
const same = mergePreservingManual(derivedGrid, derivedGrid, { 'I-A': { Maths: true } })
ok(same.kept === 0, 'a manual cell that agrees with the norm is not reported as an override')

// END TO END: does the SOLVER honour it? A cap the engine ignores is a form
// field, not a constraint — today's load used to be a -3 scoring nudge only.
import { solveTimetable } from './src/lib/schedulingEngine'

const capDays = ['MONDAY']
const capPeriods = Array.from({ length: 6 }, (_, i) => ({
  id: `p${i + 1}`, name: `P${i + 1}`, type: 'class', startTime: '09:00', endTime: '09:40', duration: 40,
})) as any[]
// One section, six Monday periods, one subject. Two teachers can teach it, but
// the first is capped at 2 periods a day — so they must not take all six.
const capStaff: any[] = [
  { id: 't1', name: 'Capped', shortName: 'CP', subjects: ['Maths'], classes: ['I-A'], isClassTeacher: '', maxPeriodsPerWeek: 40, maxPeriodsPerDay: 2 },
  { id: 't2', name: 'Spare',  shortName: 'SP', subjects: ['Maths'], classes: ['I-A'], isClassTeacher: '', maxPeriodsPerWeek: 40 },
]
const capOut = solveTimetable({
  sections: [{ id: 's1', name: 'I-A', grade: 'I' }] as any,
  staff: capStaff,
  subjects: [{ id: 'j1', name: 'Maths', periodsPerWeek: 6, maxPeriodsPerDay: 6 }] as any,
  periods: capPeriods,
  workDays: capDays,
  requirements: [],
} as any)
const cappedLoad = Object.values(capOut.classTT?.['I-A']?.MONDAY ?? {})
  .filter((c: any) => c?.teacher === 'Capped').length
ok(cappedLoad <= 2,
  `the solver respects a 2-periods/day cap — "Capped" took ${cappedLoad} of Monday's periods, not more`)

// ── IS THE DEFAULT WORKLOAD ACTUALLY THE NORM? ──
// The teacher cap defaults were hardcoded literals (30 in Resources, 32 in the
// allocation passes, 40 in most consumers, 36 in orgData's own country table).
// India's safe load happens to be 30, which is why the figure looked right —
// but every other system was being overloaded by 20–100%.
import { teacherNorms, effectiveTeacherMaxPeriods as effMax } from './src/lib/educationNorms'
import { getCountry } from './src/lib/orgData'

for (const [code, safe] of [['IN', 30], ['US', 25], ['GB', 22], ['AU', 20]] as Array<[string, number]>) {
  ok(teacherNorms(code).safeMaxPeriodsWeek === safe,
    `${code}: the norms database says ${safe} teaching periods/week is the safe load`)
  ok(effMax(code, 40, undefined) === safe,
    `${code}: with no custom override the default cap IS that norm — not a literal`)
}
// The literals that were in the code, measured against the norm they replaced.
ok(effMax('GB', 40, undefined) === 22 && 32 - 22 === 10,
  'the old hardcoded 32 would have given a UK teacher 10 periods/week over the norm')
ok(effMax('AU', 40, undefined) === 20 && 40 / 20 === 2,
  'and the old ?? 40 fallback was double the Australian norm')
// A custom override still wins — that is the point of an override.
ok(effMax('GB', 40, 20) === 30, 'a custom 20 h/week at 40-min periods overrides the norm with 30p')
// orgData's figure is the SCHOOL DAY (6 periods/day × 6 days = 36), not a
// teacher's teaching cap (30). Both are correct for what they describe — the bug
// was reading one as the other, which no code does now. Pinned so the two stay
// distinguishable rather than being "reconciled" into a single wrong number.
ok(getCountry('IN').maxPeriodsWeek === 36 && teacherNorms('IN').safeMaxPeriodsWeek === 30,
  "orgData describes the school day (36); the norms database describes the teaching cap (30) — different questions, different answers")

// ── SCHOOL ROSTER: the thing that makes the permissions model reachable ──
// The Users page used to be a mock, so no role was ever assigned and every
// account behaved as an administrator — a faculty member could declare a
// school-wide holiday.
import { roleForEmail, canDemote, type Member } from './src/store/members'
import { can } from './src/lib/permissionPolicy'

const mkMember = (email: string, role: any, id = email): Member =>
  ({ id, email, role, status: 'active', addedAt: '2026-01-01' })

const roster: Member[] = [
  mkMember('head@school.edu', 'admin'),
  mkMember('anita@school.edu', 'teacher'),
  mkMember('parent@school.edu', 'viewer'),
]

ok(roleForEmail(roster, 'anita@school.edu') === 'teacher', 'the roster answers what a signed-in person may do')
ok(roleForEmail(roster, 'ANITA@School.edu ') === 'teacher',
  'matched case- and space-insensitively — an email typed with capitals is the same person')
ok(roleForEmail(roster, 'stranger@school.edu') === undefined,
  'someone not on the roster gets no answer, so the caller can fall back rather than guess')
ok(roleForEmail(roster, undefined) === undefined && roleForEmail(roster, '') === undefined,
  'no email, no role')

// The roles have to actually differ, or assigning them is theatre.
ok(can('admin', 'holiday.manage') && !can('teacher', 'holiday.manage'),
  'an administrator may declare holidays; a faculty member may not')
ok(can('teacher', 'period.markMissed') && can('teacher', 'coverage.confirm'),
  'but faculty keep the narrow rights the blueprint grants them')
ok(!can('viewer', 'syllabus.record') && !can('viewer', 'period.markMissed'),
  'a viewer changes nothing at all')

// Lock-out guard: this roster is client-side with no server to repair it.
ok(!canDemote(roster, 'head@school.edu'),
  'the only administrator cannot be demoted — the school would lose holidays and settings with no way back')
ok(canDemote(roster, 'anita@school.edu'), 'anyone who is not an admin can be changed freely')
const twoAdmins = [...roster, mkMember('deputy@school.edu', 'admin')]
ok(canDemote(twoAdmins, 'head@school.edu'),
  'with a second administrator in place, the first can safely be demoted')

// ── Teacher leave is the SCHOOL's record, not the recorder's ──
// It used to live under `schedu-cal-leave:<uid>`, so the vice principal saw a
// fully-staffed school after the principal marked somebody absent.
class MemStorage {
  private m = new Map<string, string>()
  get length() { return this.m.size }
  key(i: number) { return [...this.m.keys()][i] ?? null }
  getItem(k: string) { return this.m.has(k) ? this.m.get(k)! : null }
  setItem(k: string, v: string) { this.m.set(k, v) }
  removeItem(k: string) { this.m.delete(k) }
  clear() { this.m.clear() }
}
;(globalThis as any).localStorage = new MemStorage()
const {
  mergeLeaves, legacyLeaveKeys, migrateLegacyLeaves, useLeaves, isOnLeaveOn, leaveCoversDate,
} = await import('./src/lib/leaveUtils')

const lv = (id: string, teacher: string, date: string, duration: any = 'full', endDate?: string) =>
  ({ id, teacher, date, duration, type: 'casual', ...(endDate ? { endDate } : {}) })

// Two administrators recorded absences under their own accounts.
const legacyStore = new MemStorage() as unknown as Storage
legacyStore.setItem('schedu-cal-leave:admin-1', JSON.stringify([lv('a1', 'Anita', '2026-08-10')]))
legacyStore.setItem('schedu-cal-leave:admin-2', JSON.stringify([lv('b1', 'Anita', '2026-08-10'), lv('b2', 'Ravi', '2026-08-11')]))
legacyStore.setItem('schedu-timetables', '[]')   // unrelated key must not be touched

ok(legacyLeaveKeys(legacyStore).length === 2, 'finds every per-account leave key')
ok(!legacyLeaveKeys(legacyStore).includes('schedu-timetables'), 'and nothing else')

migrateLegacyLeaves(legacyStore)
const afterMove = useLeaves.getState().leaves
ok(afterMove.length === 2, "both administrators' records survive the move to school scope")
ok(afterMove.some(l => l.teacher === 'Ravi'), 'the absence only the second admin knew about is now visible to all')
ok(afterMove.filter(l => l.teacher === 'Anita').length === 1,
  'the same teacher marked absent twice on one day counts once, not twice')
ok(legacyLeaveKeys(legacyStore).length === 0,
  'the old keys are removed — otherwise deleting a leave would resurrect it on next load')

migrateLegacyLeaves(legacyStore)
ok(useLeaves.getState().leaves.length === 2, 'running the migration again changes nothing')

ok(mergeLeaves([lv('x', 'Sara', '2026-09-02')], [lv('x', 'Sara', '2026-09-02')]).length === 1,
  'the same record seen twice is kept once')
const orderedLeave = mergeLeaves([lv('l', 'A', '2026-09-05'), lv('m', 'B', '2026-09-01')])
ok(orderedLeave[0].date === '2026-09-01', 'merged leave comes back in date order')

// A long leave spans its range; a full/half day does not leak into tomorrow.
const extendedLeave = lv('g', 'Meera', '2026-08-03', 'long', '2026-08-07')
ok(leaveCoversDate(extendedLeave, '2026-08-05') && !leaveCoversDate(extendedLeave, '2026-08-08'),
  'long leave covers its range only')
ok(isOnLeaveOn([extendedLeave], 'Meera', '2026-08-04') && !isOnLeaveOn([extendedLeave], 'Ravi', '2026-08-04'),
  'being on leave is per teacher')

// ── Two pages editing one room list ──
// Master Data and the wizard's Resources step both edit rooms. They used to
// carry their own read/write mappings, which disagreed on casing and dropped
// every field one of them didn't show.
import { roomRowFrom, storedRoomFrom, storedRoomsFrom, normalizeRoomType } from './src/lib/roomShape'

ok(normalizeRoomType('computer-lab') === 'Computer Lab', 'kebab from the old write path reads back as a real option')
ok(normalizeRoomType('Computer Lab') === 'Computer Lab', 'the canonical casing is left alone')
ok(normalizeRoomType(undefined) === 'Classroom', 'a room with no type is a classroom')
ok(normalizeRoomType('Planetarium') === 'Planetarium', "a school's own venue type is not discarded")

// The bug that cost data: a lab's subject mappings are what tell the scheduler
// Chemistry belongs in it. Master Data never showed them, and rebuilt the room
// from its row on the way out.
const labStored = {
  id: 'r1', generatedName: 'Lab 1', actualName: 'Chem Lab', roomType: 'Computer Lab',
  capacity: 30, building: 'Science Block', floor: 'First',
  subjectMappings: [{ subject: 'Chemistry', classes: ['IX-A'] }], notes: 'fume hood',
}
const row = roomRowFrom(labStored)
ok(row.name === 'Chem Lab', 'the room shows the name a person gave it, not the generated one')

const renamed = storedRoomFrom({ ...row, name: 'Chemistry Lab' }, labStored)
ok(renamed.subjectMappings.length === 1, 'renaming a room on a page that never showed its subjects keeps them')
ok(renamed.notes === 'fume hood', 'and keeps its notes')
ok(renamed.building === 'Science Block' && renamed.floor === 'First', 'and its building and floor')
ok(renamed.generatedName === 'Lab 1', 'the generated name is not overwritten by the display name')
ok(renamed.actualName === 'Chemistry Lab', 'the rename itself lands')

// A round trip must be stable: read → write → read gives the same row back.
const twice = roomRowFrom(storedRoomFrom(row, labStored))
ok(twice.type === row.type && twice.name === row.name && twice.capacity === row.capacity,
  'reading a room, saving it untouched and reading it again changes nothing')
ok(storedRoomFrom(row, labStored).roomType === 'Computer Lab',
  'the type is written in the casing the dropdown offers, so it still matches an option')

// A room the other editor added while this page held an older list.
const mergedRooms = storedRoomsFrom(
  [roomRowFrom(labStored), { id: 'r2', name: 'Hall', type: 'Hall', capacity: 200 }],
  [labStored],
)
ok(mergedRooms.length === 2 && mergedRooms[1].actualName === 'Hall', 'a brand-new room needs no previous record')
ok((mergedRooms[1].subjectMappings ?? []).length === 0, 'and starts with no subject mappings rather than undefined')

// ── Academic terms as a measuring window ──
// A term never extends a schedule's range, only narrows it. Declaring none
// leaves every figure exactly as it was.
import {
  clampToTerm, termOn, defaultTerm, overlappingTerms, termGaps, type AcademicTerm,
} from './src/lib/academicTerms'

const mkTerm = (id: string, name: string, start: string, end: string): AcademicTerm =>
  ({ id, name, start, end })

const year = { start: '2026-04-01', end: '2027-03-31' }
const t1 = mkTerm('t1', 'Term 1', '2026-04-01', '2026-09-30')
const t2 = mkTerm('t2', 'Term 2', '2026-10-15', '2027-03-31')

ok(clampToTerm(year, null)!.start === year.start && clampToTerm(year, null)!.end === year.end,
  'no term chosen leaves the schedule range untouched')

const inT1 = clampToTerm(year, t1)!
ok(inT1.start === '2026-04-01' && inT1.end === '2026-09-30', 'a term inside the year is the window')

// A schedule that began mid-term must not claim the weeks before it existed.
const lateSchedule = { start: '2026-07-01', end: '2027-03-31' }
const lateInT1 = clampToTerm(lateSchedule, t1)!
ok(lateInT1.start === '2026-07-01',
  'a schedule starting mid-term counts from ITS start, not the term\'s')
ok(lateInT1.end === '2026-09-30', 'and still stops at the end of the term')

// A term running past the schedule stops where the schedule does.
const shortSchedule = { start: '2026-04-01', end: '2026-06-30' }
ok(clampToTerm(shortSchedule, t1)!.end === '2026-06-30',
  'a term outlasting the schedule is cut to the schedule')

// No overlap at all must count NOTHING, not fall back to the whole range —
// otherwise a term the schedule never ran in would report a full year of hours.
const nextYearSchedule = { start: '2027-04-01', end: '2028-03-31' }
ok(clampToTerm(nextYearSchedule, t1) === null,
  'a schedule that never ran during the term contributes nothing')
ok(clampToTerm({ start: '2026-10-01', end: '2026-10-14' }, t2) === null,
  'a schedule falling entirely in the between-term break contributes nothing')

// Touching at exactly one day still counts — the boundaries are inclusive.
ok(clampToTerm({ start: '2026-09-30', end: '2027-03-31' }, t1)!.start === '2026-09-30',
  'a single shared day is an overlap, not a miss')

// Which term are we in?
ok(termOn([t1, t2], '2026-05-10')?.id === 't1', 'a date inside a term finds it')
ok(termOn([t1, t2], '2026-10-05') === undefined,
  'a date in the break between terms belongs to neither')

ok(defaultTerm([t1, t2], '2026-05-10')?.id === 't1', 'mid-term, the default is the term we are in')
ok(defaultTerm([t1, t2], '2026-10-05')?.id === 't2',
  'in the break, the default is the term about to start')
ok(defaultTerm([t1, t2], '2027-06-01')?.id === 't2',
  'after the last term ends, the default is the one that just finished')
ok(defaultTerm([], '2026-05-10') === undefined, 'a school with no terms has no default')

// Overlaps are reported, not rejected — a school mid-edit will briefly have them.
const clashing = mkTerm('t3', 'Term 2 (draft)', '2026-09-01', '2027-03-31')
ok(overlappingTerms([t1, clashing]).length === 1, 'overlapping terms are reported')
ok(overlappingTerms([t1, t2]).length === 0, 'terms with a gap between them are not')

const gapList = termGaps([t1, t2])
ok(gapList.length === 1 && gapList[0].days === 14,
  'the break between terms is counted in days, excluding both end dates')
ok(termGaps([t1, mkTerm('x', 'Next', '2026-10-01', '2027-03-31')]).length === 0,
  'terms that meet the next day have no gap to report')

// ── Hours measured PER TERM ──
// bundleA runs 5 Jan – 30 Mar 2026, one 60-min English period every Monday:
// 13 Mondays over the whole run.
const springTerm: AcademicTerm = { id: 's', name: 'Spring', start: '2026-01-05', end: '2026-02-02' }
const summerTerm: AcademicTerm = { id: 'u', name: 'Summer', start: '2026-02-09', end: '2026-03-30' }
const otherYear: AcademicTerm = { id: 'o', name: 'Last year', start: '2025-01-01', end: '2025-12-31' }

ok(allocatedHoursByPlan([bundleA])[planKey('English', 'I-A')] === 13,
  'no term chosen still reports the whole run — declaring terms changes nothing by itself')

// 5 Jan, 12, 19, 26, 2 Feb = 5 Mondays.
ok(allocatedHoursByPlan([bundleA], springTerm)[planKey('English', 'I-A')] === 5,
  'a term reports only the hours inside it')
// 9, 16, 23 Feb, 2, 9, 16, 23, 30 Mar = 8 Mondays.
ok(allocatedHoursByPlan([bundleA], summerTerm)[planKey('English', 'I-A')] === 8,
  'the rest of the run belongs to the next term')
ok(
  allocatedHoursByPlan([bundleA], springTerm)[planKey('English', 'I-A')] +
  allocatedHoursByPlan([bundleA], summerTerm)[planKey('English', 'I-A')] === 13,
  'the terms add back up to the whole run — no hour is counted twice or lost',
)
ok(allocatedHoursByPlan([bundleA], otherYear)[planKey('English', 'I-A')] === undefined,
  'a term the schedule never ran in reports nothing, not a full year')

// Spent and still-to-come are measured over the same window.
ok(elapsedHoursByPlan([bundleA], '2026-01-19', undefined, springTerm)[planKey('English', 'I-A')] === 3,
  'hours already run are counted from the TERM start, not the schedule start')
ok(elapsedHoursByPlan([bundleA], '2026-03-30', undefined, springTerm)[planKey('English', 'I-A')] === 5,
  'once the term is over its spent figure stops growing, even mid-schedule')
ok(elapsedHoursByPlan([bundleA], '2026-01-19', undefined, summerTerm)[planKey('English', 'I-A')] === undefined,
  'a term that has not started yet has nothing spent')
ok(futureHoursByPlan([bundleA], '2026-01-19', undefined, springTerm)[planKey('English', 'I-A')] === 2,
  'time still to come stops at the end of the TERM, not the end of the schedule')
ok(futureHoursByPlan([bundleA], '2026-03-01', undefined, springTerm)[planKey('English', 'I-A')] === undefined,
  'a finished term has no time left')

// The property the Syllabus page relies on: spent + left = the term's total,
// once holidays are out of the picture.
const midTerm = '2026-01-19'
const spentT = elapsedHoursByPlan([bundleA], midTerm, undefined, springTerm)[planKey('English', 'I-A')]
const leftT  = futureHoursByPlan([bundleA], midTerm, undefined, springTerm)[planKey('English', 'I-A')]
ok(spentT + leftT === allocatedHoursByPlan([bundleA], springTerm)[planKey('English', 'I-A')],
  'within a term, hours spent plus hours left equal the hours allocated')

// ── School events that actually cost teaching time ──
// Events used to be a coloured chip that changed no hours: a fortnight of board
// exams left every subject's "remaining hours" untouched.
const {
  eventDates, eventCoversDate, eventsOn, teachingSuspendedOn, eventsAsHolidays,
  mergeEvents, legacyEventKeys, migrateLegacyEvents, useSchoolEvents,
} = await import('./src/lib/schoolEvents')

const ev = (over: any = {}) => ({
  id: 'e1', title: 'Term 1 exams', type: 'exam',
  date: '2026-02-09', suspendsTeaching: true, ...over,
})

ok(eventDates(ev()).length === 1, 'an event with no end date is one day')
ok(eventDates(ev({ endDate: '2026-02-13' })).length === 5, 'a range covers both ends inclusively')
ok(eventDates(ev({ endDate: '2026-02-08' })).length === 1,
  'an end date before the start is treated as a single day, not an empty event')
// A mistyped year ('2206') must not expand to sixty-five thousand days.
ok(eventDates(ev({ endDate: '2206-02-13' })).length === 366,
  'an absurd range is capped at a year rather than hanging the page')

ok(eventCoversDate(ev({ endDate: '2026-02-13' }), '2026-02-11'), 'a middle day is covered')
ok(!eventCoversDate(ev({ endDate: '2026-02-13' }), '2026-02-14'), 'the day after is not')

// Scope: Class X board exams don't stop Class VI's lessons.
const scopedEvent = ev({ id: 'e2', sections: ['X-A'] })
ok(eventsOn([scopedEvent], '2026-02-09', 'X-A').length === 1, 'a scoped event reaches its own class')
ok(eventsOn([scopedEvent], '2026-02-09', 'VI-A').length === 0, 'and not the others')
ok(eventsOn([ev()], '2026-02-09', 'VI-A').length === 1, 'an unscoped event is the whole school')

ok(teachingSuspendedOn([ev()], '2026-02-09')?.id === 'e1', 'a suspending event stops teaching')
ok(teachingSuspendedOn([ev({ suspendsTeaching: false })], '2026-02-09') === undefined,
  'a staff meeting that displaces no lesson does not')

// The whole design: suspending events become the holiday records the coverage
// math already understands, so there is only ever one derivation of "which
// periods did this remove".
const asHols = eventsAsHolidays([ev({ endDate: '2026-02-13', sections: ['X-A'] })])
ok(asHols.length === 5, 'each suspended day becomes one holiday record')
ok(asHols.every(h => h.sections?.join() === 'X-A'), 'carrying the event\'s own class scope')
ok(asHols[0].id.startsWith('event:'), 'ids stay distinguishable from a real declared holiday')
ok(eventsAsHolidays([ev({ suspendsTeaching: false })]).length === 0,
  'an event that suspends nothing removes no hours')

// Migration off the per-account keys, same as leave before it.
const evStore = new MemStorage() as unknown as Storage
evStore.setItem('schedu-cal-events:admin-1', JSON.stringify([{ id: 'a', title: 'Sports Day', type: 'activity', date: '2026-03-02' }]))
evStore.setItem('schedu-cal-events:admin-2', JSON.stringify([
  { id: 'b', title: 'Sports Day', type: 'activity', date: '2026-03-02' },
  { id: 'c', title: 'Parents evening', type: 'meeting', date: '2026-03-05' },
]))
ok(legacyEventKeys(evStore).length === 2, 'finds every per-account event key')

migrateLegacyEvents(evStore)
const movedEvents = useSchoolEvents.getState().events
ok(movedEvents.length === 2, 'the same day entered by two admins collapses to one chip')
ok(movedEvents.some(e => e.title === 'Parents evening'),
  'and an event only one of them knew about is now visible to all')
ok(movedEvents.every(e => e.suspendsTeaching === false),
  'anything recorded before events had consequences keeps none — migrating must not rewrite a school\'s hours')
ok(legacyEventKeys(evStore).length === 0, 'the old keys are removed')

ok(mergeEvents([ev()], [ev()]).length === 1, 'the same event seen twice is kept once')

// ── The bell schedule: the moments somebody presses the bell ──
import {
  ringsForSection, bellGroups, describeRing, fmtRingTime, nextRing, minutesToNextRing,
} from './src/lib/bellSchedule'

const bellPeriods: any[] = [
  { id: 'p1', name: 'Period 1', duration: 40, type: 'class', shiftable: false },
  { id: 'p2', name: 'Period 2', duration: 40, type: 'class', shiftable: false },
  { id: 'p3', name: 'Period 3', duration: 40, type: 'class', shiftable: false },
]
// One clock for everyone: assembly 8:00, three 40-min lessons with a 20-min
// break after the second, dispersal at the end.
const bellConfig: any = {
  bellSchedules: [{
    startTime: '08:00',
    rows: [
      { id: 'a', name: 'Assembly', type: 'assembly', duration: 15, classes: ['i', 'nur'] },
      { id: 'r1', name: 'P1', type: 'teaching', duration: 40, classes: ['i', 'nur'] },
      { id: 'r2', name: 'P2', type: 'teaching', duration: 40, classes: ['i', 'nur'] },
      { id: 'b1', name: 'Break', type: 'break', duration: 20, classes: ['i', 'nur'] },
      { id: 'r3', name: 'P3', type: 'teaching', duration: 40, classes: ['i'] },
      { id: 'd', name: 'Home', type: 'dispersal', duration: 5, classes: ['i'] },
    ],
  }],
}

const ringsIA = ringsForSection('I-A', bellConfig, bellPeriods)

// 08:00 assembly starts, 08:15 assembly ends + P1 starts, 08:55 P1 ends + P2
// starts, 09:35 P2 ends + break starts, 09:55 break ends + P3 starts,
// 10:35 P3 ends + dispersal starts, 10:40 dispersal ends.
ok(ringsIA[0].at === 8 * 60, 'the first bell is the start of the day')
ok(ringsIA[ringsIA.length - 1].at === 10 * 60 + 40,
  'the last bell is home time — built from slot ENDS, so it is never dropped')

// The point of the whole module: one moment is ONE bell, described both ways.
const changeover = ringsIA.find(r => r.at === 8 * 60 + 55)!
ok(!!changeover, 'the moment P1 ends and P2 starts exists')
ok(changeover.ends === 'Period 1' && changeover.starts === 'Period 2',
  'and is a single bell that means both, not two bells a minute apart')
ok(describeRing(changeover) === 'Period 2',
  'a bell is named for what STARTS — one moment described twice reads as two events')
ok(describeRing({ at: 0, ends: 'Period 3' }) === 'End of day',
  'the last bell of the day starts nothing, and says so rather than naming a period that just finished')
ok(ringsIA.filter(r => r.at === 8 * 60 + 55).length === 1, 'never listed twice')

// Every moment is distinct and ordered.
ok(ringsIA.every((r, i) => i === 0 || r.at > ringsIA[i - 1].at), 'bells come back in time order, deduped')

// Sections that do NOT share a clock must not be flattened into one sheet.
// Nursery has no P3 and no dispersal row, so it rings differently.
const nurseryRings = ringsForSection('Nursery-A', bellConfig, bellPeriods)
ok(nurseryRings[0].at === 8 * 60,
  'Nursery shares the assembly bell — it is the SAME schedule, not a fallback clock')
ok(nurseryRings[nurseryRings.length - 1].at === 9 * 60 + 55 &&
   ringsIA[ringsIA.length - 1].at === 10 * 60 + 40,
  'but goes home 45 minutes earlier, which is exactly the case one flat list would get wrong')

const groups = bellGroups(['I-A', 'I-B', 'Nursery-A'], bellConfig, bellPeriods)
ok(groups.length === 2, 'sections with different clocks get their own bell schedule')
ok(groups.some(g => g.sections.join() === 'I-A,I-B'),
  'sections that ring identically are grouped, not repeated')
ok(groups[0].rings[0].at <= groups[1].rings[0].at, 'groups come back earliest-first')

const oneClock = bellGroups(['I-A', 'I-B'], bellConfig, bellPeriods)
ok(oneClock.length === 1, 'a school where everyone shares a clock gets exactly one sheet')

// Live board.
ok(nextRing(ringsIA, 8 * 60 + 30)?.at === 8 * 60 + 55, 'the next bell is the next one due')
ok(nextRing(ringsIA, 8 * 60 + 55)?.at === 8 * 60 + 55, 'a bell due this very minute is still next')
ok(minutesToNextRing(ringsIA, 8 * 60 + 45) === 10, 'the countdown is in whole minutes')
ok(nextRing(ringsIA, 23 * 60) === undefined,
  "after the last bell there is no next one — a board reading 'next bell in 14 hours' is noise")

ok(fmtRingTime(8 * 60 + 5) === '8:05 AM' && fmtRingTime(13 * 60 + 5) === '1:05 PM', '12-hour clock')
ok(fmtRingTime(13 * 60 + 5, true) === '13:05', '24-hour clock when the school prefers it')

// A schedule with no bell rows at all still produces a usable sheet from the
// naive cumulative fallback, rather than an empty one.
const naiveRings = ringsForSection('I-A', { startTime: '09:00' }, bellPeriods)
ok(naiveRings.length > 0 && naiveRings[0].at === 9 * 60,
  'a schedule predating bell rows still gets bells, from its plain period durations')

// ── The corridor display ──
// A board that shows a cheerful grid on a holiday, or counts down to a bell
// that will not ring, is worse than a blank screen — people trust it.
import { boardNow, boardRows, uncoveredRows, soonestRings } from './src/lib/smartboard'

const boardRings = ringsForSection('I-A', bellConfig, bellPeriods)   // 8:00 → 10:40

// The ordinary case.
const during = boardNow(boardRings, 9 * 60, { isWorkDay: true })
ok(during.state === 'during', 'mid-morning on a school day, lessons are running')
ok(during.nextBellIn === 35 && during.nextBellAt === 9 * 60 + 35,
  'and the countdown is to the next bell that will actually ring')
ok(during.nextBellMeans === 'Break', 'saying what is coming, not what is ending')

// Before and after the day — the two states a naive board gets wrong by
// counting down to a bell fourteen hours away.
const before = boardNow(boardRings, 7 * 60, { isWorkDay: true })
ok(before.state === 'before' && before.nextBellIn === 60,
  'before the first bell the board says so, and counts down to it')
const after = boardNow(boardRings, 22 * 60, { isWorkDay: true })
ok(after.state === 'after', 'after the last bell the day is over')
ok(after.nextBellIn === undefined,
  'with NO countdown — a board reading "next bell in 10 hours" at 10pm is noise')
ok(after.lastBellAt === 10 * 60 + 40, 'but it still says when the day ended')

// Closed, for each of the three different reasons.
ok(boardNow(boardRings, 9 * 60, { isWorkDay: false }).state === 'closed',
  'a weekend is closed even though bells exist')
const boardOnHoliday = boardNow(boardRings, 9 * 60, { isWorkDay: true, closedReason: 'Diwali — school holiday' })
ok(boardOnHoliday.state === 'closed' && boardOnHoliday.reason === 'Diwali — school holiday',
  'a holiday names itself rather than showing a timetable nobody is following')
ok(boardNow([], 9 * 60, { isWorkDay: true }).state === 'closed',
  'a working day with no bells at all is a schedule that was never generated, not a day to count down')

// Rows: what each class is doing right now.
const boardBundle: any = {
  id: 'b1', name: 'Main',
  sections: [{ name: 'I-A' }, { name: 'I-B' }],
  periods: bellPeriods,
  config: bellConfig,
  classTT: {
    'I-A': { MONDAY: { p1: { subject: 'English', teacher: 'Anita', room: 'R1' } } },
    'I-B': { MONDAY: { p1: { subject: 'Maths', teacher: 'Ravi', room: 'R2' } } },
  },
  substitutions: {},
}
// 08:30 is inside P1 (08:15–08:55).
const at830 = boardRows([boardBundle], 'MONDAY', 8 * 60 + 30, new Set<string>())
ok(at830.length === 2, 'every class gets a row')
ok(at830.find(r => r.section === 'I-A')?.subject === 'English', 'showing what is on right now')
ok(at830.find(r => r.section === 'I-A')?.endMin === 8 * 60 + 55, 'and when it finishes')

// A free class keeps its row rather than vanishing — a list that changes
// length through the day reads as a fault.
const at940 = boardRows([boardBundle], 'MONDAY', 9 * 60 + 40, new Set<string>())
ok(at940.length === 2 && at940.every(r => !r.subject),
  'during the break every class still has a row, with nothing on it')

// The one thing a board exists to shout about.
const teacherOut = boardRows([boardBundle], 'MONDAY', 8 * 60 + 30, new Set(['Anita']))
ok(teacherOut.find(r => r.section === 'I-A')?.uncovered === true,
  'a class whose teacher is absent with no cover is flagged')
ok(teacherOut.find(r => r.section === 'I-B')?.uncovered === false, 'and the others are not')
ok(uncoveredRows(teacherOut).length === 1, 'only that one is worth flashing')

const covered: any = { ...boardBundle, substitutions: { 'I-A|MONDAY|p1': 'Meera' } }
const withSub = boardRows([covered], 'MONDAY', 8 * 60 + 30, new Set(['Anita']))
const iaSub = withSub.find(r => r.section === 'I-A')!
ok(iaSub.uncovered === false, 'once a substitute is assigned the class is no longer uncovered')
ok(iaSub.teacher === 'Meera' && iaSub.isSub,
  'and the board names who is ACTUALLY in the room, marked as cover')
ok(uncoveredRows(withSub).length === 0, 'so nothing flashes')

// Sections on different clocks must not be merged into one countdown wrongly.
const mergedRings = soonestRings([{ sections: ['I-A', 'Nursery-A'], config: bellConfig, periods: bellPeriods }])
ok(mergedRings.some(r => r.at === 10 * 60 + 40),
  "the board's next-bell list spans every group — it is the next moment ANYTHING changes")
ok(mergedRings.filter(r => r.at === 9 * 60 + 55).length === 1,
  'a minute where two groups both ring is one entry, not two')
const shared = mergedRings.find(r => r.at === 9 * 60 + 55)!
ok(shared.ends === 'Break' && shared.starts === 'Period 3',
  'and it keeps both meanings rather than letting one group overwrite the other')

// MULTI-ACTIVE: two schedules on DIFFERENT bells. Using the first schedule's
// clock for the second's classes would print ring times that never happen.
const lateConfig: any = {
  bellSchedules: [{
    startTime: '13:00',
    rows: [
      { id: 'r1', name: 'P1', type: 'teaching', duration: 40, classes: ['x'] },
      { id: 'r2', name: 'P2', type: 'teaching', duration: 40, classes: ['x'] },
    ],
  }],
}
const twoBells = soonestRings([
  { sections: ['I-A'], config: bellConfig, periods: bellPeriods },
  { sections: ['X-A'], config: lateConfig, periods: bellPeriods },
])
ok(twoBells.some(r => r.at === 8 * 60), "the morning schedule's first bell is there")
ok(twoBells.some(r => r.at === 13 * 60),
  "and so is the afternoon schedule's — each resolved against ITS OWN bell, not the first one's")
ok(twoBells.every((r, i) => i === 0 || r.at > twoBells[i - 1].at),
  'the combined list is still one ordered sequence of moments')

// ── School facts must not live in one account's storage ──
// The failure is quiet and identical every time: the principal records it, the
// vice principal signs in and the school looks untouched.
const { useFreeAssignments, migrateLegacyAssignments, assignmentIdentity } =
  await import('./src/lib/freeAssignments')
const { useUrgentPullouts, migrateLegacyPullouts } = await import('./src/lib/urgentReassignments')
const { useNamingTerms, migrateLegacyNaming, loadTerms, TERM_DEFAULTS } = await import('./src/lib/terms')

// Free-slot assignments — invigilation rotas, club bookings. These feed the
// Live board and the corridor display, which exist to tell a passer-by who is
// where, so one admin's private copy is the worst possible place for them.
const fa = new MemStorage() as unknown as Storage
fa.setItem('schedu-free-tasks:admin-1', JSON.stringify([
  { id: 'a1', date: '2026-03-02', periodId: 'p1', kind: 'teacher', entity: 'Anita', title: 'Exam invigilation' },
]))
fa.setItem('schedu-free-tasks:admin-2', JSON.stringify([
  // The same duty, entered independently — one job, not two.
  { id: 'b1', date: '2026-03-02', periodId: 'p1', kind: 'teacher', entity: 'Anita', title: 'Invigilation' },
  { id: 'b2', date: '2026-03-03', periodId: 'p2', kind: 'room', entity: 'Hall', title: 'Club activity' },
]))
migrateLegacyAssignments(fa)
const duties = useFreeAssignments.getState().assignments
ok(duties.length === 2, 'the same duty entered by two admins becomes one')
ok(duties.some(d => d.entity === 'Hall'),
  "and the booking only one of them knew about is now on the school's board")
ok(fa.length === 0, 'the per-account keys are gone, so a later deletion cannot resurrect them')
ok(assignmentIdentity(duties[0]).includes('2026-03-02'),
  'identity is the slot and the resource, not the random id each admin generated')

migrateLegacyAssignments(fa)
ok(useFreeAssignments.getState().assignments.length === 2, 'running it again changes nothing')

// Urgent pull-outs — the most time-critical record in the app: a teacher has
// left a lesson and somebody else is covering it right now.
const up = new MemStorage() as unknown as Storage
up.setItem('schedu-urgent-pullout:admin-1', JSON.stringify([
  { id: 'u1', date: '2026-03-02', sid: 's1', periodId: 'p1', section: 'I-A',
    kind: 'teacher', original: 'Anita', replacement: 'Meera', task: 'Called to office' },
]))
migrateLegacyPullouts(up)
ok(useUrgentPullouts.getState().pullouts.length === 1,
  'a pull-out recorded by one admin is visible to the whole school')
ok(up.length === 0, 'and its old key is removed')

// Institution naming — the words the school calls things. Renaming Class to
// Batch for yourself alone is the exact opposite of the feature's purpose.
const nm = new MemStorage() as unknown as Storage
nm.setItem('schedu-terms:admin-1', JSON.stringify({ class: 'Batch', teacher: 'Faculty' }))
ok(useNamingTerms.getState().customised === false, 'a fresh school has chosen no words yet')
migrateLegacyNaming(nm)
ok(loadTerms().class === 'Batch', "one admin's renaming becomes the school's")
ok(loadTerms().subject === TERM_DEFAULTS.subject,
  'words that account never set fall back to the defaults, not to blank')
ok(nm.length === 0, 'the per-account key is removed')

// Where two admins disagree there is no honest merge, so the rule is stated:
// a school that has already chosen keeps what it chose.
const nm2 = new MemStorage() as unknown as Storage
nm2.setItem('schedu-terms:admin-9', JSON.stringify({ class: 'Cohort' }))
migrateLegacyNaming(nm2)
ok(loadTerms().class === 'Batch',
  'a school that has already chosen its words is never overwritten by a stray account')
ok(nm2.length === 0, 'but the stray key is still cleaned up')

// ── Deleting a resource a timetable still depends on ──
// Deleting a row in Master Data removes it from the roster and nothing else.
// A teacher deleted while timetabled leaves her name in every cell she held —
// and those lessons can then never be covered, because the absence picker
// lists the roster.
import { usageOf, usageAcross, deleteWarning } from './src/lib/resourceUsage'

const usedTT: any = {
  'I-A': {
    MONDAY:  { p1: { subject: 'English', teacher: 'Anita', room: 'R1' },
               p2: { subject: 'Maths',   teacher: 'Ravi',  room: 'R1' } },
    TUESDAY: { p1: { subject: 'English', teacher: 'Anita', room: 'R1' } },
  },
  'I-B': {
    MONDAY:  { p1: { subject: 'English', teacher: 'Anita', room: 'R2' } },
  },
}

const anita = usageOf(usedTT, 'teacher', 'Anita')
ok(anita.periods === 3, 'a teacher\'s periods are counted across every day and section')
ok(anita.sections.join() === 'I-A,I-B', 'and the classes affected are named')
ok(usageOf(usedTT, 'teacher', 'Ravi').periods === 1, 'each teacher is counted separately')
ok(usageOf(usedTT, 'teacher', 'Nobody').periods === 0, 'somebody who teaches nothing is free to delete')
ok(usageOf(usedTT, 'teacher', '').periods === 0, 'a blank name matches nothing rather than everything')

ok(usageOf(usedTT, 'subject', 'English').periods === 3, 'subjects are counted the same way')
ok(usageOf(usedTT, 'room', 'R1').periods === 3, 'so are venues')
ok(usageOf(usedTT, 'section', 'I-A').periods === 3, 'a class counts its own booked periods')
ok(usageOf(usedTT, 'section', 'I-Z').periods === 0, 'a class with no timetable is free to delete')

// Parallel (OR/AND) slots carry several subjects and teachers in one cell —
// counting only cell.subject would under-report and wave a delete through.
const parallelTT: any = {
  'IX-A': {
    MONDAY: { p1: {
      subject: 'Elective',
      groupAssignments: [
        { subject: 'French', teacher: 'Meera' },
        { subject: 'German', teacher: 'Anita' },
      ],
    } },
  },
}
ok(usageOf(parallelTT, 'teacher', 'Anita').periods === 1,
  'a teacher inside a parallel group is still in use')
ok(usageOf(parallelTT, 'subject', 'German').periods === 1,
  'and so is a subject that only exists inside one')

// Two active schedules can share a teacher; the warning must see both.
const secondTT: any = { 'X-A': { FRIDAY: { p1: { subject: 'Physics', teacher: 'Anita' } } } }
const both = usageAcross([{ classTT: usedTT }, { classTT: secondTT }], 'teacher', 'Anita')
ok(both.periods === 4, 'usage spans every schedule given, not just the open one')
ok(both.sections.join() === 'I-A,I-B,X-A', 'listing each affected class once')

// The message is the point: a count and a consequence, not "are you sure?".
const warn = deleteWarning('teacher', 'Anita', anita)!
ok(warn.includes('3 periods'), 'the warning states how much is at stake')
ok(warn.includes('I-A') && warn.includes('I-B'), 'and which classes')
ok(/nobody can be marked absent/i.test(warn),
  'and the specific consequence — those lessons can never be covered')
ok(!deleteWarning('section', 'I-A', usageOf(usedTT, 'section', 'I-A'))!.includes('(I-A)'),
  'a class does not list itself as the class it affects')

ok(deleteWarning('teacher', 'Nobody', usageOf(usedTT, 'teacher', 'Nobody')) === null,
  'an unused resource deletes with no interruption at all')

// Singular reads correctly; nobody should see "1 periods".
ok(deleteWarning('teacher', 'Ravi', usageOf(usedTT, 'teacher', 'Ravi'))!.includes('1 period a week'),
  'one period is not "1 periods"')

// More than three affected classes summarises rather than running on.
const wide: any = {}
for (const s of ['A', 'B', 'C', 'D', 'E']) wide[s] = { MONDAY: { p1: { subject: 'X', teacher: 'Anita' } } }
ok(deleteWarning('teacher', 'Anita', usageOf(wide, 'teacher', 'Anita'))!.includes('and 2 more'),
  'a long list of classes is summarised')

// ── Renaming a resource a timetable already names ──
// Cells store NAMES, not ids. Renaming a teacher in Master Data changed her
// roster row and nothing else, so she quietly became two people: the roster
// said "Anita Rao" and the timetable still said "Anita".
import {
  renameInClassTT, renameInSubstitutions, renameInPlans,
  renameInRecords, renameInStringLists, renameIsValid,
} from './src/lib/resourceRename'

const baseTT: any = {
  'I-A': {
    MONDAY: { p1: { subject: 'English', teacher: 'Anita', room: 'R1' },
              p2: { subject: 'Maths',   teacher: 'Ravi',  room: 'R1' } },
  },
  'I-B': { MONDAY: { p1: { subject: 'English', teacher: 'Anita', room: 'R2' } } },
}

ok(!renameIsValid('Anita', 'Anita'), 'renaming to the same name is a no-op')
ok(!renameIsValid('Anita', '  '), 'renaming to blank is refused — that erases the link, not moves it')
ok(!renameIsValid('', 'Anita'), 'and there is nothing to rename from')

const teacherRenamed = renameInClassTT(baseTT, 'teacher', 'Anita', 'Anita Rao')
ok(teacherRenamed['I-A'].MONDAY.p1.teacher === 'Anita Rao', 'the lesson follows the teacher')
ok(teacherRenamed['I-B'].MONDAY.p1.teacher === 'Anita Rao', 'in every class she takes')
ok(teacherRenamed['I-A'].MONDAY.p2.teacher === 'Ravi', 'and nobody else moves')
ok(renameInClassTT(baseTT, 'teacher', 'Nobody', 'Someone') === baseTT,
  'a rename that matches nothing returns the SAME object, so untouched schedules are never rewritten')

ok(renameInClassTT(baseTT, 'subject', 'English', 'English Lit')['I-A'].MONDAY.p1.subject === 'English Lit',
  'subjects rename too')
ok(renameInClassTT(baseTT, 'room', 'R1', 'Room 101')['I-A'].MONDAY.p1.room === 'Room 101', 'so do venues')

// classTT is KEYED by section name, so a section rename moves the key itself.
const sectionRenamed = renameInClassTT(baseTT, 'section', 'I-A', 'I-Alpha')
ok(!!sectionRenamed['I-Alpha'] && !sectionRenamed['I-A'], 'a class rename moves its whole timetable')
ok(sectionRenamed['I-Alpha'].MONDAY.p1.subject === 'English', 'carrying its lessons with it')
ok(!!sectionRenamed['I-B'], 'other classes are untouched')

// Renaming onto a class that already exists would silently merge two
// timetables — keep the incumbent instead of destroying it.
const collide = renameInClassTT(baseTT, 'section', 'I-A', 'I-B')
ok(collide['I-B'].MONDAY.p1.room === 'R2',
  "renaming a class onto an existing one does not overwrite the existing class's timetable")
ok(!!collide['I-A'], 'and the class being renamed keeps its own timetable rather than losing it')

// Parallel OR/AND slots carry a teacher and subject per group.
const parallel: any = { 'IX-A': { MONDAY: { p1: {
  subject: 'Elective',
  groupAssignments: [{ subject: 'French', teacher: 'Meera' }, { subject: 'German', teacher: 'Anita' }],
} } } }
const pRenamed = renameInClassTT(parallel, 'teacher', 'Anita', 'Anita Rao')
ok(pRenamed['IX-A'].MONDAY.p1.groupAssignments[1].teacher === 'Anita Rao',
  'a teacher inside a parallel group is renamed too')
ok(pRenamed['IX-A'].MONDAY.p1.groupAssignments[0].teacher === 'Meera', 'and her co-teacher is left alone')

// Substitutions are keyed section|day|period and VALUED by teacher name.
const subs = { 'I-A|MONDAY|p1': 'Anita', 'I-B|MONDAY|p1': 'Ravi' }
ok(renameInSubstitutions(subs, 'teacher', 'Anita', 'Anita Rao')!['I-A|MONDAY|p1'] === 'Anita Rao',
  'a covering teacher is renamed in the substitution map')
const subsSec = renameInSubstitutions(subs, 'section', 'I-A', 'I-Alpha')!
ok(!!subsSec['I-Alpha|MONDAY|p1'] && !subsSec['I-A|MONDAY|p1'],
  'a class rename moves the substitution KEY, or its cover would be lost')
ok(renameInSubstitutions(subs, 'room', 'R1', 'R9') === subs, 'venues never appear in substitutions')

// Syllabus plans are keyed subject||section AND carry the names as fields.
const renamePlans: any = {
  'English||I-A': { subject: 'English', section: 'I-A', chapters: [{ id: 'c1' }] },
  'Maths||I-A':   { subject: 'Maths',   section: 'I-A', chapters: [] },
}
const planRenamed = renameInPlans(renamePlans, 'subject', 'English', 'English Lit')!
ok(!!planRenamed['English Lit||I-A'] && !planRenamed['English||I-A'],
  'a subject rename moves its syllabus plan key, or a term of recorded coverage stops being found')
ok(planRenamed['English Lit||I-A'].subject === 'English Lit', 'and the plan says the new name')
ok(planRenamed['English Lit||I-A'].chapters.length === 1, 'with its chapters intact')
const secPlans = renameInPlans(renamePlans, 'section', 'I-A', 'I-Alpha')!
ok(!!secPlans['English||I-Alpha'] && !!secPlans['Maths||I-Alpha'], 'a class rename moves every plan for it')

// A rename onto an existing plan must not overwrite real recorded progress.
const dupPlans: any = {
  'English||I-A': { subject: 'English', section: 'I-A', loggedHours: 0 },
  'Eng||I-A':     { subject: 'Eng',     section: 'I-A', loggedHours: 12 },
}
ok(renameInPlans(dupPlans, 'subject', 'Eng', 'English')!['English||I-A'].loggedHours === 0,
  'renaming a subject onto one that already has a plan keeps the existing plan, not the incoming one')
// Declared in the OTHER order: the outcome must come from the rule, not from
// which key JavaScript happens to iterate first.
const dupSwapped: any = {
  'Eng||I-A':     { subject: 'Eng',     section: 'I-A', loggedHours: 12 },
  'English||I-A': { subject: 'English', section: 'I-A', loggedHours: 0 },
}
const dupOut = renameInPlans(dupSwapped, 'subject', 'Eng', 'English')!
ok(dupOut['English||I-A'].loggedHours === 0, 'the incumbent wins whichever plan is seen first')
ok(dupOut['Eng||I-A']?.loggedHours === 12,
  "and the plan that could not move keeps its own recorded hours rather than vanishing")

// Dated records that name people and classes.
const leaves: any[] = [{ id: 'l1', teacher: 'Anita', date: '2026-03-02' }, { id: 'l2', teacher: 'Ravi', date: '2026-03-02' }]
ok(renameInRecords(leaves, ['teacher'], 'Anita', 'Anita Rao')![0].teacher === 'Anita Rao',
  'leave follows the teacher, or she cannot be shown absent for her own lessons')
const pulls: any[] = [{ id: 'u1', original: 'Anita', replacement: 'Meera' }]
const pullsRenamed = renameInRecords(pulls, ['original', 'replacement'], 'Meera', 'Meera S')!
ok(pullsRenamed[0].replacement === 'Meera S' && pullsRenamed[0].original === 'Anita',
  'a pull-out renames whichever side matches')
ok(renameInRecords(leaves, ['teacher'], 'Nobody', 'Someone') === leaves, 'and untouched lists keep their identity')

// Section scopes on holidays and events are arrays of names.
const scopedHols: any[] = [{ id: 'h1', sections: ['I-A', 'I-B'] }, { id: 'h2' }]
ok(renameInStringLists(scopedHols, 'sections', 'I-A', 'I-Alpha')![0].sections.join() === 'I-Alpha,I-B',
  'a holiday scoped to a class follows the rename')
ok(renameInStringLists(scopedHols, 'sections', 'I-A', 'I-B')![0].sections.join() === 'I-B',
  'renaming onto a class already in the list does not list it twice')

// ── The pinned-up bell chart: classes across, time down ──
import { slotsForSection, bellColumns, bellGrid } from './src/lib/bellSchedule'

const iaSlots = slotsForSection('I-A', bellConfig, bellPeriods)
ok(iaSlots[0].label === 'Assembly' && iaSlots[0].startMin === 8 * 60,
  'the day is a list of named blocks, starting with assembly')
ok(iaSlots.some(s => s.label === 'Break'), 'breaks are blocks too, not gaps between them')
ok(iaSlots.every((s, i) => i === 0 || s.startMin >= iaSlots[i - 1].startMin), 'in time order')

// Columns: one per distinct daily pattern, sections that match share one.
const cols = bellColumns([{ sections: ['I-A', 'I-B', 'Nursery-A'], config: bellConfig, periods: bellPeriods }])
ok(cols.length === 2, 'classes on different clocks get their own column')
ok(cols.some(c => c.sections.join() === 'I-A,I-B'), 'and classes that match share one')

const grid = bellGrid(cols)
ok(grid.length > 0, 'the chart has rows')
ok(grid.every(r => r.endMin > r.startMin), 'every row is a real band of time')
ok(grid.every((r, i) => i === 0 || r.startMin >= grid[i - 1].endMin),
  'rows tile the day in order without overlapping')

// The alignment that makes two columns comparable: a row boundary wherever
// ANY column changes.
const firstRow = grid[0]
ok(firstRow.cells.length === cols.length, 'one cell per column, every row')
ok(firstRow.cells.every(c => c.label === 'Assembly'),
  'both groups are in assembly at 8:00, so both cells name it')

// Nursery goes home at 9:55; Class I keeps going to 10:40. After Nursery
// finishes its column must be EMPTY, not borrowing Class I's block.
const lateRow = grid.find(r => r.startMin >= 9 * 60 + 55)!
ok(!!lateRow, 'there are rows after Nursery has gone home')
const nurseryCol = cols.findIndex(c => c.sections.includes('Nursery-A'))
ok(!lateRow.cells[nurseryCol].label,
  "a column with nothing running is blank rather than showing a neighbour's block")
ok(!!lateRow.cells[1 - nurseryCol].label, 'while the column still in session names its block')

// A block spanning several bands is named ONCE, on the row it starts —
// otherwise a long lesson repeats its name down the column like an error.
const p1Rows = grid.filter(r => r.cells.some(c => c.label === 'Period 1'))
ok(p1Rows.filter(r => r.cells.some(c => c.label === 'Period 1' && c.isStart)).length === 1,
  'a block that spans rows is named once, where it begins')

// No row where every column is empty — that is a gap in nobody's day.
ok(grid.every(r => r.cells.some(c => c.label)), 'no empty bands are printed')

// ── Column headings compressed to a from–to range ──
// A school with thirty sections on one bell would otherwise print all thirty
// names across the top of the sheet.
import { rangeLabel } from './src/lib/bellSchedule'

ok(rangeLabel(['I-A']) === 'I-A', 'a single class is its own heading, not a range to itself')
ok(rangeLabel([]) === '', 'no classes, no heading')
ok(rangeLabel(['I-A', 'I-B', 'I-C']) === 'I-A – I-C', 'a run of sections becomes first – last')

// School order, not alphabetical — the whole point of the range ends.
ok(rangeLabel(['X-A', 'II-A', 'I-A']) === 'I-A – X-A',
  'sorted in SCHOOL order: I before II before X, which alphabetical sorting gets wrong')
ok(rangeLabel(['I-A', 'Nursery-A']) === 'Nursery-A – I-A',
  'Nursery comes before Class I, as a school lists them')
ok(rangeLabel(['V-B', 'V-A']) === 'V-A – V-B', 'and sections within a class order too')

// ── THE ENGINE, ON A REAL-SIZED SCHOOL ──
// 2,000 lines of solver had exactly one end-to-end assertion (the daily cap).
// These are the invariants a timetable must satisfy to be usable at all — if
// any breaks, the product ships a schedule that cannot be taught.
const engDays = ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY']
const engPeriods = Array.from({ length: 8 }, (_, i) => ({
  id: `ep${i + 1}`, name: `P${i + 1}`, type: 'class',
  startTime: '09:00', endTime: '09:40', duration: 40, shiftable: false,
})) as any[]
const ENG_SUBS = [
  { name: 'English', ppw: 6 }, { name: 'Maths', ppw: 6 }, { name: 'Science', ppw: 6 },
  { name: 'History', ppw: 4 }, { name: 'Geography', ppw: 4 }, { name: 'Hindi', ppw: 5 },
  { name: 'Computer', ppw: 4 }, { name: 'PE', ppw: 3 },
]
const engSections = ['VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII', 'V', 'IV', 'III']
  .flatMap(c => ['A', 'B', 'C', 'D'].map(x => ({ id: `${c}${x}`, name: `${c}-${x}`, grade: c }))) as any[]
const engSubjects = ENG_SUBS.map((s, i) => ({ id: `es${i}`, name: s.name, periodsPerWeek: s.ppw, maxPeriodsPerDay: 2 })) as any[]
const engStaff = Array.from({ length: 60 }, (_, i) => ({
  id: `et${i}`, name: `Teacher ${i + 1}`, shortName: `T${i + 1}`,
  subjects: [ENG_SUBS[i % ENG_SUBS.length].name, ENG_SUBS[(i + 3) % ENG_SUBS.length].name],
  classes: [], isClassTeacher: '', maxPeriodsPerWeek: 30,
})) as any[]

const engInput: any = {
  sections: engSections, staff: engStaff, subjects: engSubjects,
  periods: engPeriods, workDays: engDays, requirements: [],
}
const engStart = Date.now()
const engOut = solveTimetable(engInput)
const engMs = Date.now() - engStart

const engCanTeach = new Map(engStaff.map((s: any) => [s.name, new Set<string>(s.subjects)]))
let engPlaced = 0, engClashes = 0, engIneligible = 0
const engSeen = new Set<string>()
const engWeek = new Map<string, number>()
const engPerSubject = new Map<string, number>()
for (const sec of Object.keys(engOut.classTT ?? {})) {
  for (const d of Object.keys(engOut.classTT[sec] ?? {})) {
    for (const p of Object.keys(engOut.classTT[sec][d] ?? {})) {
      const c: any = engOut.classTT[sec][d][p]
      if (!c?.subject) continue
      engPlaced++
      engPerSubject.set(`${sec}|${c.subject}`, (engPerSubject.get(`${sec}|${c.subject}`) ?? 0) + 1)
      if (!c.teacher) continue
      const k = `${d}|${p}|${c.teacher}`
      if (engSeen.has(k)) engClashes++
      engSeen.add(k)
      engWeek.set(c.teacher, (engWeek.get(c.teacher) ?? 0) + 1)
      if (!engCanTeach.get(c.teacher)?.has(c.subject)) engIneligible++
    }
  }
}
const engDemand = engSections.length * ENG_SUBS.reduce((a, s) => a + s.ppw, 0)
const engShort = engSections.flatMap((sec: any) =>
  ENG_SUBS.filter(s => (engPerSubject.get(`${sec.name}|${s.name}`) ?? 0) !== s.ppw))

ok(engClashes === 0,
  `no teacher is in two rooms at once across ${engSections.length} sections (${engPlaced} lessons placed)`)
ok(engIneligible === 0, 'nobody is assigned a subject they cannot teach')
ok([...engWeek.values()].every(v => v <= 30), 'no teacher exceeds their weekly cap')
ok(engShort.length === 0, 'every subject gets exactly the periods per week it asked for')
ok(engPlaced === engDemand, `the whole curriculum is placed when it fits — ${engPlaced}/${engDemand}`)
ok(engMs < 5000, `a 40-section school solves in well under 5s (took ${engMs}ms)`)

// Regenerating must not reshuffle a published week.
ok(JSON.stringify(solveTimetable(engInput).classTT) === JSON.stringify(engOut.classTT),
  'the solver is deterministic — same input, same timetable, so "regenerate" is safe')

// ── IMPOSSIBLE SCHOOLS MUST STILL PRODUCE A LEGAL TIMETABLE ──
// Far too few teachers: 4 staff capped at 30 cannot cover 160 periods.
const shortSections = Array.from({ length: 8 }, (_, i) => ({ id: `ss${i}`, name: `Z-${String.fromCharCode(65 + i)}`, grade: 'Z' })) as any[]
const shortSubs = Array.from({ length: 5 }, (_, i) => ({ id: `zs${i}`, name: `Sub${i + 1}`, periodsPerWeek: 4, maxPeriodsPerDay: 3 })) as any[]
const shortStaff = Array.from({ length: 4 }, (_, i) => ({
  id: `zt${i}`, name: `Z${i + 1}`, shortName: `Z${i + 1}`,
  subjects: shortSubs.map((s: any) => s.name), classes: [], isClassTeacher: '', maxPeriodsPerWeek: 30,
})) as any[]
const shortOut = solveTimetable({
  sections: shortSections, staff: shortStaff, subjects: shortSubs,
  periods: engPeriods, workDays: engDays, requirements: [],
} as any)

let shortClashes = 0, shortPlaced = 0
const shortSeen = new Set<string>()
const shortLoad = new Map<string, number>()
for (const sec of Object.keys(shortOut.classTT ?? {}))
  for (const d of Object.keys(shortOut.classTT[sec] ?? {}))
    for (const p of Object.keys(shortOut.classTT[sec][d] ?? {})) {
      const c: any = shortOut.classTT[sec][d][p]
      if (!c?.subject) continue
      shortPlaced++
      if (!c.teacher) continue
      const k = `${d}|${p}|${c.teacher}`
      if (shortSeen.has(k)) shortClashes++
      shortSeen.add(k)
      shortLoad.set(c.teacher, (shortLoad.get(c.teacher) ?? 0) + 1)
    }

ok(shortClashes === 0,
  'an understaffed school still gets a LEGAL timetable — the engine leaves slots empty rather than double-booking')
ok([...shortLoad.values()].every(v => v <= 30),
  'and never solves the shortage by pushing a teacher past their cap')

// The empty slots must say WHY, and name the real cause.
const shortTally = new Map<string, number>()
for (const b of ((shortOut as any).blockedSlots ?? [])) for (const r of b.reasons) shortTally.set(r.category, (shortTally.get(r.category) ?? 0) + 1)
ok((shortTally.get('no-eligible-teachers') ?? 0) > 0,
  'empty slots blame the teacher shortage that actually caused them')
ok((shortTally.get('no-eligible-teachers') ?? 0) > (shortTally.get('subject-quota-met') ?? 0),
  'and that is the DOMINANT reason, not an afterthought behind "quota met"')

// ── Two people with the same name are one person to this app ──
// Cells reference teachers, subjects and venues by NAME. That model works, but
// it has one requirement nothing was enforcing: names must be unique.
import { findNameConflicts, isDuplicateName, conflictWarning } from './src/lib/nameConflicts'

const staffRows = [
  { name: 'Anita Sharma' }, { name: 'Ravi Kumar' }, { name: 'Anita Sharma' },
]
const conflicts = findNameConflicts(staffRows, r => r.name)
ok(conflicts.length === 1, 'a name used twice is one conflict, not two')
ok(conflicts[0].name === 'Anita Sharma' && conflicts[0].count === 2, 'reported with its count')
ok(findNameConflicts([{ name: 'A' }, { name: 'B' }], r => r.name).length === 0, 'distinct names are fine')

// Matched the way the rest of the app matches: trimmed and case-insensitive.
// Colliding in SOME code paths and not others is worse than colliding in all.
ok(findNameConflicts([{ name: 'Anita' }, { name: 'anita ' }], r => r.name).length === 1,
  'case and trailing space do not make two people')

// A half-typed new row is not a conflict; flagging every blank would make the
// warning meaningless.
ok(findNameConflicts([{ name: '' }, { name: '' }, { name: 'X' }], r => r.name).length === 0,
  'blank names are ignored')

ok(isDuplicateName(staffRows, r => r.name, 'Anita Sharma'), 'a specific row can ask if it clashes')
ok(!isDuplicateName(staffRows, r => r.name, 'Ravi Kumar'), 'and be told when it does not')
ok(!isDuplicateName(staffRows, r => r.name, ''), 'a blank name never clashes')

// The message has to name the cost, not just say "duplicate".
const nameWarn = conflictWarning('teacher', conflicts)!
ok(nameWarn.includes('Anita Sharma'), 'the warning names the clash')
ok(/marking one absent marks both/.test(nameWarn) && /\. [A-Z]/.test(nameWarn),
  'and states what it actually costs, as a sentence — leave, cover and workload are name-matched')
ok(/syllabus coverage/i.test(conflictWarning('subject', conflicts)!),
  'each kind gets its own consequence, in the school\'s terms')
ok(/double-booked/.test(conflictWarning('room', conflicts)!), 'venues clash-detect by name')
ok(conflictWarning('teacher', []) === null, 'no conflicts, no warning')

// Many conflicts summarise rather than listing forever.
const many = ['A', 'A', 'B', 'B', 'C', 'C', 'D', 'D'].map(n => ({ name: n }))
ok(/and 1 more/.test(conflictWarning('teacher', findNameConflicts(many, r => r.name))!),
  'a long list of clashes is summarised')

// ── Text has to be readable, and the palette is where that is decided ──
// These colours were each measured against the backgrounds they actually sit
// on in the app, then solved over integer hex values so the shipped colour is
// the one that was tested. An earlier pass scaled a float and rounded after
// testing, which shipped a green at 4.49 against a 4.5 requirement.
const srgb = (v: number) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4) }
const hexRgb = (h: string) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)]
const relLum = (h: string) => { const [r, g, b] = hexRgb(h); return 0.2126 * srgb(r) + 0.7152 * srgb(g) + 0.0722 * srgb(b) }
export function contrast(a: string, b: string): number {
  const [x, y] = [relLum(a), relLum(b)]
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05)
}

const AA = 4.5
// The tints these sit on: card white, page greys, and the lavender washes.
const LIGHT = ['#FFFFFF', '#FAFAFA', '#F5F4F0', '#F3F4F6', '#F5F2FF', '#F6F4FD', '#FBFAFF', '#F1EEFB']

for (const bg of LIGHT) {
  ok(contrast('#6D6A8A', bg) >= AA, `muted text #6D6A8A meets AA on ${bg}`)
}
for (const bg of ['#FFFFFF', '#F5F4F0', '#F3F4F6']) {
  ok(contrast('#69707E', bg) >= AA, `grey #69707E meets AA on ${bg}`)
  ok(contrast('#0A8136', bg) >= AA, `success green #0A8136 meets AA on ${bg}`)
}
ok(contrast('#6B7079', '#F5F4F0') >= AA, 'secondary grey meets AA on the warm page background')

// The predecessors, kept as the reason these values are what they are. If
// someone "tidies" the palette back toward the lighter purples, this fails.
ok(contrast('#767393', '#F5F2FF') < AA, 'the old muted purple did NOT meet AA on a lavender tint')
ok(contrast('#16A34A', '#FFFFFF') < AA, 'the old success green did NOT meet AA on white')
ok(contrast('#9B97B8', '#FFFFFF') < AA, 'the old grid dim text did NOT meet AA on white')

// #8B87AD stays: on the dark Pro card and the corridor board it is correct,
// and darkening it there would make it worse, not better.
ok(contrast('#8B87AD', '#13111E') >= AA, 'the dim purple is fine where it belongs — on dark')
// ── The timetable outliving the roster ──
// A teacher who leaves in March is deleted from the roster; the timetable
// deliberately keeps her lessons. The warning at delete time is shown once,
// and the school then lives in that state for a term — so it has to stay
// visible afterwards.
import { findOrphans, orphanWarning } from './src/lib/rosterOrphans'

const tt = {
  'I-A': {
    MONDAY:  { p1: { subject: 'English', teacher: 'Anita Sharma', room: 'R1' },
               p2: { subject: 'Maths',   teacher: 'Ravi Kumar',   room: 'R1' } },
    TUESDAY: { p1: { subject: 'English', teacher: 'Anita Sharma', room: 'R2' } },
  },
  'I-B': { MONDAY: { p1: { subject: 'Maths', teacher: 'Ravi Kumar', room: 'R1' } } },
}

const orphanGone = findOrphans(tt, 'teacher', ['Ravi Kumar'])
ok(orphanGone.length === 1 && orphanGone[0].name === 'Anita Sharma', 'a deleted teacher still in the timetable is found')
ok(orphanGone[0].periods === 2, 'counted by booked periods, not by cells mentioning her once')
ok(orphanGone[0].sections.join() === 'I-A', 'and says which class is affected')
ok(findOrphans(tt, 'teacher', ['Ravi Kumar', 'Anita Sharma']).length === 0, 'a full roster is clean')

// Re-typing a name with different case is the school FIXING it. Flagging that
// would train people to ignore the banner.
ok(findOrphans(tt, 'teacher', ['ravi kumar', ' anita sharma ']).length === 0,
  'case and stray spaces do not resurrect an orphan')

// An empty roster is what a not-yet-loaded store looks like. Declaring every
// cell orphaned on page load would make the warning worthless.
ok(findOrphans(tt, 'teacher', []).length === 0, 'an empty roster reports nothing rather than everything')
ok(findOrphans(null, 'teacher', ['Ravi Kumar']).length === 0, 'no timetable, no orphans')

// Every kind the timetable references by name.
ok(findOrphans(tt, 'room', ['R1'])[0].name === 'R2', 'a deleted venue is found')
ok(findOrphans(tt, 'subject', ['English'])[0].name === 'Maths', 'a deleted subject is found')
const orphanSect = findOrphans(tt, 'section', ['I-A'])
ok(orphanSect.length === 1 && orphanSect[0].name === 'I-B' && orphanSect[0].periods === 1,
  'a class removed from the roster still holding a schedule is found')

// Parallel/elective slots carry one teacher per group; those count too.
const orphanGrouped = { 'XI-A': { MONDAY: { p1: {
  groupAssignments: [{ subject: 'Physics', teacher: 'Meera Iyer' }, { subject: 'Biology', teacher: 'Anita Sharma' }],
} } } }
const g = findOrphans(orphanGrouped, 'teacher', ['Meera Iyer'])
ok(g.length === 1 && g[0].name === 'Anita Sharma', 'a teacher inside a parallel group is not missed')

// The message has to name the cost, not just report a mismatch.
const orphanWarn = orphanWarning('teacher', orphanGone)!
ok(orphanWarn.includes('Anita Sharma'), 'the warning names who')
ok(/2 periods a week/.test(orphanWarn), 'and how much is riding on it')
ok(/marked absent or given cover/.test(orphanWarn), 'and what it actually costs')
ok(orphanWarning('teacher', []) === null, 'clean roster, no warning')
ok(/two classes can be sent to the same place/.test(orphanWarning('room', findOrphans(tt, 'room', ['R1']))!),
  'each kind gets its own consequence')

const orphanMany = ['A', 'B', 'C', 'D'].map(n => ({ name: n, periods: 1, sections: [] }))
ok(/and 1 more/.test(orphanWarning('teacher', orphanMany)!), 'a long list is summarised')
// ── A rename has to move the roster, not just the timetable ──
// The cascade rewrote every active schedule's CELLS and none of their ROSTERS,
// which is worse than not cascading: the other schedule ended up with a lesson
// taught by the new name and a roster listing the old one, so one person
// became two — an orphaned lesson beside a roster row teaching nothing.
import { renameInRecords as rrec, renameInStringLists as rlist } from './src/lib/resourceRename'

const rosterStaff = [
  { id: 't1', name: 'Anita Sharma', subjects: ['English', 'Maths'] },
  { id: 't2', name: 'Ravi Kumar', subjects: ['Maths'] },
]

const renamedStaff = rrec(rosterStaff, ['name'], 'Anita Sharma', 'Anita S. Sharma')!
ok(renamedStaff[0].name === 'Anita S. Sharma', "another schedule's rosterStaff row follows the rename")
ok(renamedStaff[1].name === 'Ravi Kumar', 'and nobody else moves')

// The one that silently broke generation: teachers list the subject NAMES they
// can teach, so a renamed subject left every teacher unqualified for it and the
// engine — which matches teacher to subject by name — reported it unstaffable.
const requalified = rlist(rosterStaff, 'subjects', 'English', 'English Language')!
ok(requalified[0].subjects.join() === 'English Language,Maths',
  "a subject rename follows into each teacher's can-teach list")
ok(requalified[1].subjects.join() === 'Maths', 'teachers who never taught it are untouched')

// Renaming onto a subject a teacher already has must not list it twice, or the
// teacher looks doubly qualified and load maths counts it twice.
const subjMerged = rlist(rosterStaff, 'subjects', 'English', 'Maths')!
ok(subjMerged[0].subjects.join() === 'Maths', 'renaming onto an existing entry merges rather than duplicates')

// Rooms carry their display name in one of three fields depending on age of
// the record; offering all three must rewrite only the ones that match.
const rosterRooms = [
  { id: 'r1', actualName: 'Lab 1', generatedName: 'R1' },
  { id: 'r2', name: 'Lab 1' },
  { id: 'r3', actualName: 'Hall' },
]
const renamedRooms = rrec(rosterRooms, ['actualName', 'name', 'generatedName'], 'Lab 1', 'Physics Lab')!
ok(renamedRooms[0].actualName === 'Physics Lab' && renamedRooms[0].generatedName === 'R1',
  'the display field moves and the generated id does not')
ok((renamedRooms[1] as any).name === 'Physics Lab', 'an older record keyed on name also moves')
ok(renamedRooms[2].actualName === 'Hall', 'a room that never had the name is untouched')

// Nothing matched means the caller gets its own array back, so the cascade can
// tell "changed" from "unchanged" by identity and skip a needless write.
ok(rrec(rosterStaff, ['name'], 'Nobody At All', 'X') === rosterStaff, 'no match returns the same reference')
ok(rlist(rosterStaff, 'subjects', 'Nobody At All', 'X') === rosterStaff, 'and likewise for string lists')
// ── The allocation grids are keyed by name too ──
// teacherAllocations is { teacher: { section: { subject: periods } } } and
// subjectAllocations is { section: { subject } }. They are the INPUT to
// generation, so a rename that moved the timetable and not these left the next
// solve reading numbers filed under a name nothing else uses.
import { renameInNestedKeys as rkeys } from './src/lib/resourceRename'

const TA = { 'Anita Sharma': { 'I-A': { English: 5, Maths: 2 } }, 'Ravi Kumar': { 'I-A': { Maths: 3 } } }

const t = rkeys(TA, ['teacher', 'section', 'subject'], 'teacher', 'Anita Sharma', 'Anita S. Sharma')!
ok(!!t['Anita S. Sharma'] && !t['Anita Sharma'], 'a teacher rename moves the top-level key')
ok(t['Anita S. Sharma']['I-A'].English === 5, 'and carries the periods with it')
ok(!!t['Ravi Kumar'], 'other teachers are untouched')

const allocSec = rkeys(TA, ['teacher', 'section', 'subject'], 'section', 'I-A', 'I-Alpha')!
ok(!!allocSec['Anita Sharma']['I-Alpha'] && !allocSec['Anita Sharma']['I-A'], 'a section rename moves the MIDDLE key')
ok(!!allocSec['Ravi Kumar']['I-Alpha'], 'in every teacher, not just the first')

const allocSub = rkeys(TA, ['teacher', 'section', 'subject'], 'subject', 'English', 'English Language')!
ok(allocSub['Anita Sharma']['I-A']['English Language'] === 5, 'a subject rename moves the DEEPEST key')
ok(allocSub['Anita Sharma']['I-A'].Maths === 2, 'siblings at that level stay put')

const SA = { 'I-A': { English: '5' }, 'I-B': { English: '4' } }
const sa = rkeys(SA, ['section', 'subject'], 'section', 'I-A', 'I-Alpha')!
ok(!!sa['I-Alpha'] && !sa['I-A'] && !!sa['I-B'], 'the two-level map renames on its own shape')
ok(rkeys(SA, ['section', 'subject'], 'teacher', 'I-A', 'X') === SA,
  'a kind the map has no level for is left completely alone')

// Same collision rule as renameInPlans: the incumbent wins and the mover stays
// put, because overwriting silently discards hand-tuned periods.
const allocClash = rkeys({ 'I-A': { English: '5' }, 'I-B': { English: '9' } }, ['section', 'subject'],
  'section', 'I-A', 'I-B')!
ok(allocClash['I-B'].English === '9', 'renaming onto an occupied key does not overwrite it')
ok(!!allocClash['I-A'], 'the entry that could not move stays visible rather than vanishing')

// Order independence: the same inputs must give the same answer whichever way
// the keys happen to be enumerated.
const a = rkeys({ 'I-A': { X: 1 }, 'I-B': { X: 2 } }, ['section', 'subject'], 'section', 'I-A', 'I-B')!
const b = rkeys({ 'I-B': { X: 2 }, 'I-A': { X: 1 } }, ['section', 'subject'], 'section', 'I-A', 'I-B')!
ok(a['I-B'].X === 2 && b['I-B'].X === 2, 'key order cannot change who wins a collision')

// Identity when nothing matched, so the cascade can skip a needless write.
ok(rkeys(TA, ['teacher', 'section', 'subject'], 'teacher', 'Nobody', 'X') === TA, 'no match returns the same reference')
ok(rkeys(undefined, ['section'], 'section', 'a', 'b') === undefined, 'an absent map is not invented')

// One level, the shape sectionCapacityOverrides uses.
const allocCaps = rkeys({ 'I-A': 40 }, ['section'], 'section', 'I-A', 'I-Alpha')!
ok(allocCaps['I-Alpha'] === 40, 'a flat section-keyed map renames too')
// ── Student counts are name-keyed on both axes ──
// One row per class-section, each holding per-SUBJECT numbers. These decide how
// many students take each subject, which drives room capacity and grouping — so
// a stale key is not cosmetic, it is a class sent to a room that cannot hold it.
import { renameInRecords as srec, renameInRecordMaps as smaps } from './src/lib/resourceRename'

const strengthRows = [
  { id: 'a', sectionName: 'I-A', subjectStrengths: { English: 40, PE: 20 } },
  { id: 'b', sectionName: 'I-B', subjectStrengths: { English: 35 } },
]

const strengthBySection = srec(strengthRows, ['sectionName'], 'I-A', 'I-Alpha')!
ok(strengthBySection[0].sectionName === 'I-Alpha', 'a section rename moves the row it belongs to')
ok(strengthBySection[1].sectionName === 'I-B', 'and leaves the others alone')

const strengthBySubject = smaps(strengthRows, 'subjectStrengths', ['subject'], 'subject', 'English', 'English Language')!
ok(strengthBySubject[0].subjectStrengths['English Language'] === 40, 'a subject rename moves the count')
ok(strengthBySubject[0].subjectStrengths.PE === 20, 'other subjects in the same row keep their counts')
ok(strengthBySubject[1].subjectStrengths['English Language'] === 35, 'in every section, not just the first')

// A rename of a kind these rows do not key on must not rebuild them.
ok(smaps(strengthRows, 'subjectStrengths', ['subject'], 'teacher', 'Anita', 'Anita S.') === strengthRows,
  'a teacher rename leaves student counts untouched')
ok(smaps(strengthRows, 'subjectStrengths', ['subject'], 'subject', 'Nothing', 'X') === strengthRows,
  'no match returns the same reference')

// Renaming onto a subject the section already counts must not overwrite it —
// same incumbent-wins rule as everywhere else, since these are typed-in numbers.
const strengthCollide = smaps([{ id: 'c', subjectStrengths: { English: 40, Maths: 30 } }],
  'subjectStrengths', ['subject'], 'subject', 'English', 'Maths')!
ok(strengthCollide[0].subjectStrengths.Maths === 30, 'the existing count survives')
ok(strengthCollide[0].subjectStrengths.English === 40, 'and the one that could not move stays visible')
// ── The two snapshot field lists have to stay identical ──
// ttRegistry saves and restores a schedule from TT_SNAPSHOT_FIELDS; dashboard
// keeps its own copy and its comment says "Must mirror dashboard.tsx". Nothing
// enforced it, and a field present in one and not the other is exactly the
// silent per-schedule data loss this list exists to prevent.
import { readFileSync } from 'node:fs'

function snapshotFields(path: string): string[] {
  const src = readFileSync(path, 'utf8')
  const i = src.indexOf('const TT_SNAPSHOT_FIELDS = [')
  const j = src.indexOf(']', i)
  return [...src.slice(i, j).matchAll(/'([A-Za-z]+)'/g)].map(m => m[1])
}

const registryFields = snapshotFields('./src/lib/ttRegistry.ts')
const dashboardFields = snapshotFields('./src/pages/dashboard.tsx')

ok(registryFields.length > 20, 'the registry list was actually found and parsed')
ok(registryFields.join() === dashboardFields.join(),
  'ttRegistry and dashboard save exactly the same fields')

// A snapshot is rebuilt from this list and overwrites the whole key, so a
// name-keyed structure missing here is not merely unsaved — it is destroyed on
// the next save, and the globally-persisted copy then bleeds across schedules.
for (const field of [
  'sectionStrengths', 'subjectAllocations', 'manualSubjectAllocations',
  'teacherAllocations', 'sectionCapacityOverrides',
]) {
  ok(registryFields.includes(field), `${field} survives a per-schedule save/restore`)
}

// The loader derives a setter name from each field, so a field whose setter is
// spelled differently would be restored silently into nothing.
const storeSrc = readFileSync('./src/store/timetableStore.ts', 'utf8')
for (const field of ['teacherAllocations', 'sectionCapacityOverrides', 'sectionStrengths']) {
  const setter = `set${field[0].toUpperCase()}${field.slice(1)}`
  ok(storeSrc.includes(`${setter}:`), `${field} has the ${setter} the loader looks for`)
}
// ── Backward sync: the two allocation matrices must agree with the timetable ──
// The store documents the invariant — the sum of teacherAllocations[*][sec][sub]
// equals the parsed total of subjectAllocations[sec][sub] — and nothing checked
// it. These are the structures the rename cascade now moves, so they are worth
// pinning against real solver output rather than a hand-built fixture.
import { deriveTeacherAllocations, deriveSubjectAllocations } from './src/lib/schedulingEngine'

const dTeach = deriveTeacherAllocations(engOut.classTT as any)
const dSubj = deriveSubjectAllocations(engOut.classTT as any)

// Fold the faculty matrix down to section|subject totals and compare.
const folded = new Map<string, number>()
for (const teacher of Object.keys(dTeach)) {
  for (const sec of Object.keys(dTeach[teacher])) {
    for (const sub of Object.keys(dTeach[teacher][sec])) {
      const k = `${sec}|${sub}`
      folded.set(k, (folded.get(k) ?? 0) + dTeach[teacher][sec][sub])
    }
  }
}
let mismatches = 0, cells = 0
for (const sec of Object.keys(dSubj)) {
  for (const sub of Object.keys(dSubj[sec])) {
    cells++
    if ((folded.get(`${sec}|${sub}`) ?? 0) !== parseInt(dSubj[sec][sub], 10)) mismatches++
  }
}
ok(cells > 100, `the invariant is checked over a real school (${cells} section/subject pairs)`)
ok(mismatches === 0, 'every teacher-side total equals the class-side total for the same section and subject')

// Each side must also agree with the periods-per-week the curriculum asked for.
const dWanted = new Map(ENG_SUBS.map(s => [s.name, s.ppw]))
let wrongPpw = 0
for (const sec of Object.keys(dSubj)) {
  for (const sub of Object.keys(dSubj[sec])) {
    if (parseInt(dSubj[sec][sub], 10) !== dWanted.get(sub)) wrongPpw++
  }
}
ok(wrongPpw === 0, 'the derived class plan matches the periods per week each subject asked for')

// A parallel/elective cell carries one teacher per group; both sides count each
// group, not the cell, or an elective slot reads as a single lesson.
const dGrouped: any = { 'XI-A': { MONDAY: { p1: {
  subject: 'Physics', teacher: 'Meera Iyer',
  groupAssignments: [{ subject: 'Physics', teacher: 'Meera Iyer' }, { subject: 'Biology', teacher: 'Anita Sharma' }],
} } } }
const gT = deriveTeacherAllocations(dGrouped), gS = deriveSubjectAllocations(dGrouped)
ok(gT['Meera Iyer']['XI-A'].Physics === 1 && gT['Anita Sharma']['XI-A'].Biology === 1,
  'both halves of an elective slot land on their own teacher')
ok(gS['XI-A'].Physics === '1' && gS['XI-A'].Biology === '1', 'and on their own subject')

// KNOWN, DELIBERATE ASYMMETRY: an unstaffed lesson is a real class-period, so
// the class side counts it; there is no teacher to file it under, so the
// faculty side cannot. The invariant above therefore holds for a fully staffed
// timetable only — which is what the solver produces when the school fits.
const dUnstaffed: any = { 'I-A': { MONDAY: { p1: { subject: 'English' } } } }
ok(deriveSubjectAllocations(dUnstaffed)['I-A'].English === '1', 'an unstaffed lesson still counts as a class period')
ok(Object.keys(deriveTeacherAllocations(dUnstaffed)).length === 0, 'but is filed against no teacher')

// Empty in, empty out — a not-yet-generated schedule must not invent rows.
ok(Object.keys(deriveTeacherAllocations({} as any)).length === 0, 'no timetable derives no faculty matrix')
ok(Object.keys(deriveSubjectAllocations({} as any)).length === 0, 'and no class plan')
// ── Renaming and deriving have to commute ──
// The cascade rewrites the allocation matrices in place; backward sync rebuilds
// them from the timetable. If those two disagree, a rename followed by a sync
// silently changes the school's numbers. Renaming the timetable and then
// deriving must give exactly what deriving and then renaming gives.
const cmSubjTT = renameInClassTT(engOut.classTT as any, 'subject', 'English', 'English Language')
ok(cmSubjTT !== engOut.classTT, 'the fixture actually contains the subject being renamed')

ok(JSON.stringify(deriveSubjectAllocations(cmSubjTT)) ===
   JSON.stringify(rkeys(deriveSubjectAllocations(engOut.classTT as any), ['section', 'subject'], 'subject', 'English', 'English Language')),
  'subject rename: derive-then-rename equals rename-then-derive')

ok(JSON.stringify(deriveTeacherAllocations(cmSubjTT)) ===
   JSON.stringify(rkeys(deriveTeacherAllocations(engOut.classTT as any), ['teacher', 'section', 'subject'], 'subject', 'English', 'English Language')),
  'the same holds for the faculty matrix, where the subject is the DEEPEST key')

const cmTeachTT = renameInClassTT(engOut.classTT as any, 'teacher', 'Teacher 1', 'Teacher One')
ok(cmTeachTT !== engOut.classTT, 'the fixture actually contains the teacher being renamed')
ok(JSON.stringify(deriveTeacherAllocations(cmTeachTT)) !== JSON.stringify(deriveTeacherAllocations(engOut.classTT as any)),
  'and the rename genuinely changes the matrix, so the comparison below is not vacuous')
ok(JSON.stringify(deriveTeacherAllocations(cmTeachTT)) ===
   JSON.stringify(rkeys(deriveTeacherAllocations(engOut.classTT as any), ['teacher', 'section', 'subject'], 'teacher', 'Teacher 1', 'Teacher One')),
  'teacher rename commutes too, on the top-level key')

// And the invariant still holds after a rename, which is the point of all of it.
const cmT = deriveTeacherAllocations(cmSubjTT), cmS = deriveSubjectAllocations(cmSubjTT)
const cmFolded = new Map<string, number>()
for (const t of Object.keys(cmT)) for (const sec of Object.keys(cmT[t])) for (const sub of Object.keys(cmT[t][sec])) {
  cmFolded.set(`${sec}|${sub}`, (cmFolded.get(`${sec}|${sub}`) ?? 0) + cmT[t][sec][sub])
}
let cmBad = 0
for (const sec of Object.keys(cmS)) for (const sub of Object.keys(cmS[sec])) {
  if ((cmFolded.get(`${sec}|${sub}`) ?? 0) !== parseInt(cmS[sec][sub], 10)) cmBad++
}
ok(cmBad === 0, 'the two matrices still agree with each other after a rename')
// ── Free-typed country (as captured at sign-up) → dataset code ──
import { resolveCountryInput } from './src/lib/countryHours'
ok(resolveCountryInput('India') === 'IN', 'resolves a plain country name')
ok(resolveCountryInput('  united states  ') === 'US', 'case- and whitespace-insensitive')
ok(resolveCountryInput('USA') === 'US' && resolveCountryInput('U.S.A.') === 'US', 'resolves USA aliases')
ok(resolveCountryInput('UK') === 'GB' && resolveCountryInput('England') === 'GB', 'UK / England → GB')
ok(resolveCountryInput('IN') === 'IN' && resolveCountryInput('IND') === 'IN', 'accepts ISO2 and ISO3')
ok(resolveCountryInput('Czech Republic') === 'CZ', 'alias for a renamed country')
ok(resolveCountryInput('South Korea') === 'KR' && resolveCountryInput('Turkey') === 'TR', 'common English names')
ok(resolveCountryInput('India (CBSE norms)') === 'IN', 'matches the dataset label a user might paste back')
ok(resolveCountryInput('Freedonia') === undefined, 'unknown country → undefined, never a wrong guess')
ok(resolveCountryInput('') === undefined && resolveCountryInput(null) === undefined, 'empty input → undefined')

// ── A cover belongs to a date, not to every Monday ──
// Substitutions used to be keyed section|MONDAY|period, so cover arranged for
// one absence reappeared every week — and, worse, made two teachers look like
// one to room-clash detection, hiding genuine double-bookings on later weeks.
import { localISO, subKey, isDatedSubKey, migrateWeekdaySubs } from './src/lib/substitutionKeys'

// Local calendar, never UTC. toISOString() on a local-midnight Date reports the
// previous or next day depending on the timezone, which would file an evening
// cover against the wrong date.
const eve = new Date(2026, 7, 17, 23, 30)   // 17 Aug 2026, 23:30 local
ok(localISO(eve) === '2026-08-17', 'a late-evening date keeps its own day')
ok(localISO(new Date(2026, 0, 5)) === '2026-01-05', 'months and days are zero-padded')

ok(subKey('I-A', '2026-08-17', 'p1') === 'I-A|2026-08-17|p1', 'the key names the date')
ok(isDatedSubKey('I-A|2026-08-17|p1'), 'a dated key is recognised')
ok(!isDatedSubKey('I-A|MONDAY|p1'), 'and a legacy weekday key is not')

// Migration: a weekday key becomes the matching weekday of the week it is run
// in. The date it was originally meant for was never stored, so this is the
// least-harmful guess — the cover happens once, near when it was arranged,
// and stops repeating.
const wed = new Date(2026, 7, 19)           // Wednesday 19 Aug 2026
const m1 = migrateWeekdaySubs({ 'I-A|MONDAY|p1': 'Ravi Kumar' }, wed)
ok(m1.migrated === 1, 'a legacy key is migrated')
ok(m1.next['I-A|2026-08-17|p1'] === 'Ravi Kumar', 'onto the Monday of that same week')
ok(!('I-A|MONDAY|p1' in m1.next), 'and the weekday key is gone')

// Idempotent — running it again must not move an already-dated cover.
const m2 = migrateWeekdaySubs(m1.next, wed)
ok(m2.migrated === 0 && m2.next['I-A|2026-08-17|p1'] === 'Ravi Kumar', 'a second run changes nothing')

// A deliberate dated entry outranks a migrated guess for the same slot.
const clash = migrateWeekdaySubs(
  { 'I-A|MONDAY|p1': 'Guessed', 'I-A|2026-08-17|p1': 'Deliberate' }, wed)
ok(clash.next['I-A|2026-08-17|p1'] === 'Deliberate', 'an existing dated cover is not overwritten')
ok(clash.next['I-A|MONDAY|p1'] === 'Guessed', 'and the one that could not move is kept, not dropped')

// Nothing is ever silently lost: an unrecognised key passes through.
const odd = migrateWeekdaySubs({ 'weird-key': 'X', 'I-A|NOTADAY|p1': 'Y' }, wed)
ok(odd.next['weird-key'] === 'X' && odd.next['I-A|NOTADAY|p1'] === 'Y', 'unparseable keys are carried through untouched')
ok(odd.migrated === 0, 'and not counted as migrated')

ok(migrateWeekdaySubs(undefined, wed).migrated === 0, 'no substitutions, nothing to do')

// Every weekday maps to its own date within the run week.
const all = migrateWeekdaySubs(
  { 'A|SUNDAY|p': '1', 'A|MONDAY|p': '2', 'A|SATURDAY|p': '3' }, wed)
ok(all.next['A|2026-08-16|p'] === '1', 'Sunday is the start of that week')
ok(all.next['A|2026-08-17|p'] === '2', 'Monday follows it')
ok(all.next['A|2026-08-22|p'] === '3', 'and Saturday ends it')
// ──────────────────
// ADD NEW CHECKS ABOVE THIS LINE.
// process.exit() ends the run here, so anything appended below never
// executes — and a check that never executes still reports as passing.
// ──────────────────
console.log(fail === 0 ? '\nALL BLUEPRINT CHECKS PASSED' : `\n${fail} CHECK(S) FAILED`)
process.exit(fail === 0 ? 0 : 1)
