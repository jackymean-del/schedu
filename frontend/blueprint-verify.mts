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

console.log(fail === 0 ? '\nALL BLUEPRINT CHECKS PASSED' : `\n${fail} CHECK(S) FAILED`)
process.exit(fail === 0 ? 0 : 1)
