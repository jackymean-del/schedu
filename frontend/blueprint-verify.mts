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
