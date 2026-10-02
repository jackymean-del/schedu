/**
 * IS THE TIMETABLE ANY GOOD - not just legal?
 * Run: npx tsx engine-quality-verify.mts
 *
 * engine-full-verify proves the timetable is legal: no clashes, right number of
 * periods, nobody over their cap. Every one of those can pass on a schedule a
 * school would hand straight back. What timetablers actually complain about,
 * once the clashes are gone, is SHAPE:
 *
 *   stranded frees   a teacher's free period with lessons on both sides of it.
 *                    Not a break - twenty minutes too short to leave and too
 *                    long to fill, and the single most common complaint about
 *                    any generated timetable.
 *   load spread      one person carrying thirty periods while another carries
 *                    eighteen, on the same subject.
 *   monotony         a class taking the same subject in the same slot every
 *                    day of the week.
 *
 * These are RATIOS and ceilings, not exact numbers: the solver is greedy and
 * deterministic, so the figures are stable, but pinning them exactly would make
 * this a change-detector rather than a quality gate. The thresholds are set a
 * little above what the engine currently achieves, so an improvement is always
 * welcome and a real regression fails.
 */
import { solveTimetable } from './src/lib/schedulingEngine.ts'

type Any = any
let fail = 0
const ok = (cond: boolean, label: string, extra = '') => {
  console.log(`${cond ? '✓' : '✗'} ${label}${extra ? ' - ' + extra : ''}`)
  if (!cond) fail++
}

const WORK_DAYS = ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY']
const PIDS = ['p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'p7', 'p8']
const PERIODS: Any[] = PIDS.map((id, i) => ({ id, name: `P${i + 1}`, duration: 40, type: 'class' }))
const SUBJECTS = ['English', 'Hindi', 'Mathematics', 'Science', 'Social Studies', 'Computer', 'Art', 'PE']
const ALLOC: Record<string, number> = {
  English: 6, Hindi: 5, Mathematics: 6, Science: 5,
  'Social Studies': 5, Computer: 3, Art: 3, PE: 3,
}
const GRADES = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X']

function school(perGrade: number, staffScale = 1) {
  const sections: Any[] = []
  for (const g of GRADES) {
    for (let i = 0; i < perGrade; i++) {
      const letter = String.fromCharCode(65 + i)
      sections.push({ id: `${g}-${letter}`, name: `${g}-${letter}`, room: `R-${g}-${letter}`, grade: g, classTeacher: '' })
    }
  }
  const staff: Any[] = []
  let t = 0
  for (const sub of SUBJECTS) {
    for (let i = 0; i < Math.max(1, Math.ceil(perGrade * 1.4 * staffScale)); i++) {
      t++
      staff.push({
        id: `t${t}`, name: `T${t}-${sub.slice(0, 3)}`, subjects: [sub], classes: [],
        isClassTeacher: '', maxPeriodsPerWeek: 30,
      })
    }
  }
  const subjectAllocations: Record<string, Record<string, string>> = {}
  for (const sec of sections) {
    subjectAllocations[sec.name] = {}
    for (const s of SUBJECTS) subjectAllocations[sec.name][s] = String(ALLOC[s])
  }
  return {
    sections, staff,
    subjects: SUBJECTS.map((n, i) => ({ id: `s${i}`, name: n, periodsPerWeek: ALLOC[n] })),
    periods: PERIODS, workDays: WORK_DAYS, requirements: [], subjectAllocations,
  }
}

function measure(out: Any, s: Any) {
  // Where each teacher is busy, per day.
  const busy: Record<string, Record<string, Set<string>>> = {}
  const load: Record<string, number> = {}
  for (const sec of Object.keys(out.classTT)) {
    for (const d of Object.keys(out.classTT[sec] ?? {})) {
      for (const pid of Object.keys(out.classTT[sec][d] ?? {})) {
        const c = out.classTT[sec][d][pid]
        if (!c?.teacher) continue
        ;((busy[c.teacher] ??= {})[d] ??= new Set()).add(pid)
        load[c.teacher] = (load[c.teacher] ?? 0) + 1
      }
    }
  }

  let gaps = 0, taught = 0, worstDay = 0
  // A class's own day: an empty period between two lessons is a corridor
  // hour for thirty students. Counted over every class-day.
  let classHoles = 0
  for (const sec of s.sections) {
    for (const d of WORK_DAYS) {
      const at = PIDS.map(p => !!out.classTT[sec.name]?.[d]?.[p]?.subject)
      const first = at.indexOf(true), last = at.lastIndexOf(true)
      if (first >= 0) classHoles += at.slice(first, last + 1).filter(x => !x).length
    }
  }
  for (const t of Object.keys(busy)) {
    for (const d of WORK_DAYS) {
      const set = busy[t][d]
      if (!set?.size) continue
      const idx = PIDS.map((p, i) => (set.has(p) ? i : -1)).filter(i => i >= 0)
      const first = Math.min(...idx), last = Math.max(...idx)
      const dayGaps = (last - first + 1) - idx.length
      gaps += dayGaps
      taught += idx.length
      worstDay = Math.max(worstDay, dayGaps)
    }
  }

  const vals = Object.values(load).filter(v => v > 0)
  const mean = vals.reduce((a, b) => a + b, 0) / Math.max(1, vals.length)
  const sd = Math.sqrt(vals.reduce((a, v) => a + (v - mean) ** 2, 0) / Math.max(1, vals.length))

  // A class taking one subject in the same slot repeatedly. Counted at two
  // depths: 4+ in a six-day week is a rut, and 3 is worth watching so that
  // "zero at four" cannot hide a pile at three.
  let sameSlot = 0, sameSlot3 = 0
  const ruts: string[] = []
  for (const sec of s.sections) {
    const seen: Record<string, Record<string, number>> = {}
    for (const d of WORK_DAYS) {
      for (const pid of PIDS) {
        const c = out.classTT[sec.name]?.[d]?.[pid]
        if (!c?.subject) continue
        ;(seen[c.subject] ??= {})[pid] = (seen[c.subject][pid] ?? 0) + 1
      }
    }
    for (const sub in seen) for (const pid in seen[sub]) {
      if (seen[sub][pid] >= 4) { sameSlot++; ruts.push(`${sec.name} ${sub} ${pid} x${seen[sub][pid]}`) }
      if (seen[sub][pid] === 3) sameSlot3++
    }
  }

  let placed = 0
  for (const sec of Object.keys(out.classTT))
    for (const d of Object.keys(out.classTT[sec] ?? {}))
      for (const pid of Object.keys(out.classTT[sec][d] ?? {}))
        if (out.classTT[sec][d][pid]?.subject) placed++

  return {
    gaps, taught, worstDay, placed, classHoles,
    gapsPerTaught: +(gaps / Math.max(1, taught)).toFixed(3),
    sd: +sd.toFixed(2), mean: +mean.toFixed(1), sameSlot, sameSlot3, ruts,
  }
}

for (const perGrade of [2, 4]) {
  const s = school(perGrade)
  const t0 = performance.now()
  const out: Any = solveTimetable(s as Any)
  const ms = performance.now() - t0
  const m = measure(out, s)
  console.log(`\n── ${s.sections.length} sections, ${s.staff.length} staff · ${ms.toFixed(0)} ms ──`)
  console.log(`   placed ${m.placed} · load mean ${m.mean} sd ${m.sd}`)
  console.log(`   stranded frees ${m.gaps} (${m.gapsPerTaught} per lesson taught), worst day ${m.worstDay}`)
  console.log(`   same subject in same slot: ${m.sameSlot} at 4+/wk, ${m.sameSlot3} at exactly 3`)

  ok(m.placed > 0, 'the school actually gets a timetable', `${m.placed} lessons`)
  // Ceilings sit a little above what the engine achieves today, so a real
  // regression fails and any improvement passes.
  // Tightened after the compaction term landed: the engine measures 0.348 and
  // 0.325 on these two schools, against 0.367 and 0.362 before it. The ceiling
  // sits just above that, so the gain cannot quietly erode.
  ok(m.gapsPerTaught <= 0.38,
    'stranded free periods stay under 0.38 per lesson taught', `${m.gapsPerTaught}`)
  ok(m.worstDay <= 5, 'no teacher has more than 5 stranded frees in one day', `worst ${m.worstDay}`)
  // Measured 12 and 30 once the week-tidy step learned to trade with other
  // days (34 and 62 before any tidying). Ceilings sit just above, so the gain
  // cannot quietly erode.
  ok(m.classHoles <= (perGrade === 2 ? 14 : 32),
    "empty periods inside a class's day stay down", `${m.classHoles}`)
  ok(m.sd <= 6, 'teaching load stays reasonably even across staff', `sd ${m.sd}`)
  // A subject must not own one period of the day all week. Gated at zero
  // because the engine now achieves zero - it was 18 and 31 before the slot
  // variety term, so this is a real property to hold rather than an aspiration.
  ok(m.sameSlot === 0,
    'no class takes one subject in the same slot 4+ times a week', `${m.sameSlot}${m.ruts.length ? ': ' + m.ruts.slice(0, 3).join('; ') : ''}`)
  ok(ms < 5000, 'and it solves in seconds', `${ms.toFixed(0)} ms`)
}


// ── A SHORTAGE MUST BE SHARED ────────────────────────────────────────────
//
// Ten sections, eight teachers: the school has asked for more teaching than
// it employs people to deliver, and roughly a fifth of it cannot happen.
// Which fifth is the whole question.
//
// Filling section by section is optimal on the total and indefensible in the
// distribution: the first four classes got everything they asked for and
// Class X got five periods out of thirty. Every teacher-period was used, so
// no total looked wrong, and a board-exam year had an all but empty week.
// A human doing this by hand spreads a shortage; nobody loses a week so that
// somebody else can have a perfect one.
{
  const DAYS5 = ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY']
  const P6: Any[] = [1, 2, 3, 4, 5, 6].map(i =>
    ({ id: 'q' + i, name: 'P' + i, duration: 40, type: 'class', shiftable: true }))
  const secs: Any[] = []
  for (const g of ['VI', 'VII', 'VIII', 'IX', 'X']) {
    for (const l of ['A', 'B']) {
      secs.push({ id: g + '-' + l, name: g + '-' + l, room: 'RM' + secs.length,
        grade: g, classTeacher: '', strength: 34 })
    }
  }
  const SUBS: Record<string, number> = {
    English: 6, Mathematics: 6, Science: 5, 'Social Studies': 5, Hindi: 5, Computer: 3 }
  const st: Any[] = [
    ['A', ['English']], ['B', ['Mathematics']], ['C', ['Science']],
    ['D', ['Social Studies']], ['E', ['Hindi']], ['F', ['Computer']],
    ['G', ['English', 'Social Studies']], ['H', ['Mathematics', 'Science']],
  ].map(([n, subs]: Any) => ({ id: 't' + n, name: 'T' + n, shortName: 'T' + n,
    role: 'teacher', subjects: subs, classes: [], isClassTeacher: '', maxPeriodsPerWeek: 30 }))
  const alloc: Any = {}
  for (const s of secs) { alloc[s.name] = {}; for (const k in SUBS) alloc[s.name][k] = String(SUBS[k]) }

  const res: Any = solveTimetable({
    sections: secs, staff: st,
    subjects: Object.keys(SUBS).map((n, i) => ({ id: 'z' + i, name: n, periodsPerWeek: SUBS[n] })),
    periods: P6, workDays: DAYS5, requirements: [], subjectAllocations: alloc,
    rooms: secs.map((s: Any, i: number) => ({ id: 'r' + i, name: s.room, capacity: 40 })),
    defaultTeacherMaxPeriods: 30,
  } as Any)

  const fill = secs.map((s: Any) => {
    let n = 0
    for (const d of DAYS5) for (const p of P6) if (res.classTT?.[s.name]?.[d]?.[p.id]?.subject) n++
    return { name: s.name, n }
  })
  const total = fill.reduce((a: number, f: Any) => a + f.n, 0)
  const lo = Math.min(...fill.map((f: Any) => f.n))
  const hi = Math.max(...fill.map((f: Any) => f.n))

  // The total must still be at the ceiling: fairness is not an excuse to do
  // less work. 8 teachers x 30 = 240 teacher-periods, all of them usable.
  ok(total >= 235, 'an understaffed school still places every hour it can',
    total + ' of 240 possible')
  // And no class may be starved to pay for another's full week.
  ok(lo >= 18, 'no section is starved', 'worst section has ' + lo + ' of 30')
  ok(hi - lo <= 10, 'the shortage is shared, not dumped on the last sections',
    'best ' + hi + ', worst ' + lo + ', spread ' + (hi - lo))

  // ...and shared across the DAYS, not only across the week. Fixing the
  // weekly starvation by rotating which section goes first each day just
  // moved it: within a day sections still filled one after another, so
  // whoever went last that day met every teacher's daily cap and got almost
  // nothing. Every class ended up with one wrecked day - one came in on a
  // Friday with no lessons at all - and the weekly totals above still looked
  // perfectly fair. A child does not experience a weekly total.
  let worstDay = Infinity, worstWhere = ''
  for (const s of secs) {
    for (const d of DAYS5) {
      let n = 0
      for (const p of P6) if (res.classTT?.[s.name]?.[d]?.[p.id]?.subject) n++
      if (n < worstDay) { worstDay = n; worstWhere = s.name + ' ' + d }
    }
  }
  // 6 periods a day at roughly 80% coverage is about 5; 3 is a bad day, 1 is
  // a school day with nothing in it.
  ok(worstDay >= 3, 'no class gets a near-empty day',
    'worst day: ' + worstWhere + ' with ' + worstDay + ' of 6')
}

// ── SPARE PERIODS ARE SPREAD, NOT PILED ON ONE DAY ───────────────────────
//
// The other half of the daily story. With staff to spare and fewer lessons
// than periods, the fill used to take every slot while any subject was owed,
// so a class asking for 33 of 40 periods got 8, 8, 8, 8 and then ONE lesson on
// Friday. Nothing above caught it: every weekly total was exact, and nobody
// was short of teachers.
{
  console.log('spare periods spread across the week')
  const DAYS5 = WORK_DAYS.slice(0, 5)
  const SUBS: Record<string, number> = { English: 6, Hindi: 5, Mathematics: 6, Science: 5, 'Social Studies': 4, Computer: 3, Art: 2, PE: 2 }
  const want = Object.values(SUBS).reduce((a, b) => a + b, 0)   // 33 of 40
  const secs: Any[] = ['I', 'II', 'III', 'IV', 'V'].map(g => ({ id: g, name: `${g}-A`, room: `R${g}`, grade: g, classTeacher: '' }))
  const st: Any[] = []
  for (const sub of Object.keys(SUBS)) for (let i = 0; i < 2; i++) st.push({ id: `${sub}${i}`, name: `${sub} ${i}`, subjects: [sub], classes: [], isClassTeacher: '', maxPeriodsPerWeek: 30 })
  const alloc: Any = {}
  for (const sec of secs) { alloc[sec.name] = {}; for (const k in SUBS) alloc[sec.name][k] = String(SUBS[k]) }
  const res: Any = solveTimetable({
    sections: secs, staff: st,
    subjects: Object.keys(SUBS).map((n, i) => ({ id: 'q' + i, name: n, periodsPerWeek: SUBS[n] })),
    periods: PERIODS, workDays: DAYS5, requirements: [], subjectAllocations: alloc, defaultTeacherMaxPeriods: 30,
  } as Any)
  let worstSpread = 0, worstDay = Infinity, where = '', total = 0
  for (const sec of secs) {
    const perDay = DAYS5.map(d => PERIODS.filter(p => res.classTT?.[sec.name]?.[d]?.[p.id]?.subject).length)
    total += perDay.reduce((a, b) => a + b, 0)
    const spread = Math.max(...perDay) - Math.min(...perDay)
    if (spread > worstSpread) { worstSpread = spread; where = `${sec.name} ${perDay.join(',')}` }
    worstDay = Math.min(worstDay, ...perDay)
  }
  ok(total === want * secs.length, 'every lesson is still placed', `${total} of ${want * secs.length}`)
  ok(worstDay >= 5, 'no class has a near-empty day when it has spare periods', `fewest in a day: ${worstDay}`)
  ok(worstSpread <= 1, "each class's lessons are spread evenly over the week", where || 'all even')
}

// ── A split class spends ONE period on its AND block, not one per subject ──
// The day budget summed every subject's target, so Sanskrit 3 + Odia 3 run
// side by side read as six periods where the class spends three. Early days
// filled up and Friday took the leftovers: a class came out 6,6,6,6,4.
{
  console.log('spare periods spread evenly with an AND block')
  const DAYS5 = WORK_DAYS.slice(0, 5)
  const SUBS: Record<string, number> = { English: 6, Hindi: 5, Mathematics: 6, Science: 5, 'Social Studies': 4, Computer: 2, Sanskrit: 3, Odia: 3 }
  const periodsSpent = Object.values(SUBS).reduce((a, b) => a + b, 0) - 3   // 31 of 40
  const secs: Any[] = ['VI', 'VII', 'VIII'].map(g => ({ id: g, name: `${g}-A`, room: `R${g}`, grade: g, classTeacher: '' }))
  const st: Any[] = []
  for (const sub of Object.keys(SUBS)) for (let i = 0; i < 2; i++) st.push({ id: `${sub}${i}`, name: `${sub} ${i}`, subjects: [sub], classes: [], isClassTeacher: '', maxPeriodsPerWeek: 30 })
  const alloc: Any = {}
  for (const sec of secs) { alloc[sec.name] = {}; for (const k in SUBS) alloc[sec.name][k] = String(SUBS[k]) }
  const res: Any = solveTimetable({
    sections: secs, staff: st,
    subjects: Object.keys(SUBS).map((n, i) => ({ id: 'a' + i, name: n, periodsPerWeek: SUBS[n] })),
    periods: PERIODS, workDays: DAYS5, requirements: [], subjectAllocations: alloc, defaultTeacherMaxPeriods: 30,
    optionalBlocks: secs.map((sec, i) => ({
      id: `lang-${i}`, name: 'Third language', sectionNames: [sec.name], logic: 'AND', periodsPerWeek: 3,
      options: [
        { subject: 'Sanskrit', teacher: `Sanskrit ${i % 2}`, room: `L${i}a` },
        { subject: 'Odia', teacher: `Odia ${i % 2}`, room: `L${i}b` },
      ],
    })),
  } as Any)
  let worstSpread = 0, where = '', total = 0
  for (const sec of secs) {
    const perDay = DAYS5.map(d => PERIODS.filter(p => res.classTT?.[sec.name]?.[d]?.[p.id]?.subject).length)
    total += perDay.reduce((a, b) => a + b, 0)
    const spread = Math.max(...perDay) - Math.min(...perDay)
    if (spread > worstSpread || !where) { worstSpread = Math.max(worstSpread, spread); where = `${sec.name} ${perDay.join(',')}` }
  }
  ok(total === periodsSpent * secs.length, 'every period the class spends is placed', `${total} of ${periodsSpent * secs.length}`)
  ok(worstSpread <= 1, 'and spread within one lesson a day, block or not', where)
  // A split runs at a different hour each day. The block search walked the
  // week period-major, so a four-a-week Maths/Computer split sat in period 2
  // from Monday to Thursday.
  const blockRut = Math.max(...secs.map(sec => Math.max(0, ...PERIODS.map(p =>
    DAYS5.filter(d => res.classTT?.[sec.name]?.[d]?.[p.id]?.optionalBlockId).length))))
  ok(blockRut <= 1, 'the split does not hold one period all week', `most days in one period: ${blockRut}`)
}

console.log(fail === 0 ? '\nALL QUALITY CHECKS PASSED' : `\n${fail} CHECK(S) FAILED`)
process.exit(fail === 0 ? 0 : 1)
