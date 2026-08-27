/**
 * Full-scale scheduling-engine verification + benchmark.
 *
 * Builds a realistic LKG–XII school (30 sections, 48 specialist teachers,
 * 8×6 grid, full allocation matrix + day-offs + blocked availability) and
 * machine-checks every hard invariant on the solver output:
 *
 *   INV1  teacher-clash   — no teacher in two sections at the same (day,period)
 *   INV2  frequency       — placed(sec,subject) === allocation target, 100%
 *   INV3  eligibility     — assigned teacher actually teaches that subject
 *   INV4  mirror          — teacherTT is consistent with classTT
 *   INV5  day-off         — no lessons on a section's off day
 *   INV6  availability    — 'blocked' teacher slots are never used
 *   INV7  spread          — no subject crammed >ceil(target/days)+1 on one day
 *   INV8  overload        — teacher weekly load ≤ maxPeriodsPerWeek (report)
 *   PERF  solve time for the 30-section school (and a 2× stress size)
 *
 * Run: npx tsx engine-full-verify.mts
 */
import { solveTimetable, detectConflicts } from './src/lib/schedulingEngine.ts'

type Any = any

// ── School builder ─────────────────────────────────────────────────────────
const WORK_DAYS = ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY']
const GRADES = ['Nursery', 'LKG', 'UKG', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII']

const PERIODS: Any[] = [
  { id: 'p1', name: 'P1', duration: 40, type: 'class', shiftable: true },
  { id: 'p2', name: 'P2', duration: 40, type: 'class', shiftable: true },
  { id: 'sbrk', name: 'Break', duration: 15, type: 'break', shiftable: false },
  { id: 'p3', name: 'P3', duration: 40, type: 'class', shiftable: true },
  { id: 'p4', name: 'P4', duration: 40, type: 'class', shiftable: true },
  { id: 'lnch', name: 'Lunch', duration: 30, type: 'lunch', shiftable: false },
  { id: 'p5', name: 'P5', duration: 40, type: 'class', shiftable: true },
  { id: 'p6', name: 'P6', duration: 40, type: 'class', shiftable: true },
  { id: 'p7', name: 'P7', duration: 40, type: 'class', shiftable: true },
  { id: 'p8', name: 'P8', duration: 40, type: 'class', shiftable: true },
]
const CLASS_PERIOD_IDS = PERIODS.filter(p => p.type === 'class').map(p => p.id)

// Allocation per section: sums to 42 of 48 weekly class slots (realistic load).
const ALLOC: Record<string, number> = {
  English: 6, Hindi: 5, Mathematics: 6, Science: 5, 'Social Studies': 5,
  Computer: 3, Art: 3, Music: 2, 'Physical Education': 4, GK: 3,
}
// Pre-primary (Nursery/LKG/UKG) has Saturday off → only 40 weekly slots, so
// its allocation must fit: lighter load summing to 36.
const ALLOC_PRE: Record<string, number> = {
  English: 6, Hindi: 5, Mathematics: 6, Science: 4, 'Social Studies': 4,
  Art: 3, Music: 2, 'Physical Education': 4, GK: 2,
}
const isPrePrimary = (name: string) => /^(Nursery|LKG|UKG)/.test(name)
const SUBJECT_NAMES = Object.keys(ALLOC)
const PER_SECTION_TOTAL = Object.values(ALLOC).reduce((a, b) => a + b, 0) // 42

// Teachers per subject sized to real demand (30 sections × target ÷ ~30/wk).
const TEACHERS_PER_SUBJECT: Record<string, number> = {
  English: 7, Hindi: 6, Mathematics: 7, Science: 6, 'Social Studies': 6,
  Computer: 4, Art: 3, Music: 2, 'Physical Education': 4, GK: 3,
}

function buildSchool(sectionsPerGrade: number) {
  const sections: Any[] = []
  for (const g of GRADES) {
    for (let i = 0; i < sectionsPerGrade; i++) {
      const letter = String.fromCharCode(65 + i)
      sections.push({ id: `${g}-${letter}`, name: `${g}-${letter}`, room: `R-${g}-${letter}`, grade: g, classTeacher: '' })
    }
  }
  const subjects: Any[] = SUBJECT_NAMES.map((n, i) => ({ id: `sub${i}`, name: n, periodsPerWeek: ALLOC[n] }))

  const staff: Any[] = []
  let t = 0
  const scale = Math.max(1, sectionsPerGrade / 2) // scale teacher count with school size
  for (const [sub, baseCount] of Object.entries(TEACHERS_PER_SUBJECT)) {
    const count = Math.ceil(baseCount * scale)
    for (let i = 0; i < count; i++) {
      t++
      staff.push({
        id: `t${t}`, name: `T${t}-${sub.slice(0, 4)}`, shortName: `T${t}`, role: 'teacher',
        subjects: [sub], classes: [], isClassTeacher: '', maxPeriodsPerWeek: 32,
      })
    }
  }

  const subjectAllocations: Record<string, Record<string, string>> = {}
  for (const sec of sections) {
    subjectAllocations[sec.name] = {}
    const alloc = isPrePrimary(sec.name) ? ALLOC_PRE : ALLOC
    for (const [sub, n] of Object.entries(alloc)) subjectAllocations[sec.name][sub] = String(n)
  }
  return { sections, subjects, staff, subjectAllocations }
}

// ── Invariant checks ───────────────────────────────────────────────────────
let failures = 0
const pass = (label: string, extra = '') => console.log(`✓ ${label}${extra ? ' — ' + extra : ''}`)
const fail = (label: string, extra = '') => { failures++; console.log(`✗ ${label}${extra ? ' — ' + extra : ''}`) }
const check = (ok: boolean, label: string, extra = '') => (ok ? pass(label, extra) : fail(label, extra))

function verify(out: Any, school: Any, opts: { offDaySections?: (name: string) => boolean; offDay?: string; blockedTeacher?: string; blockedDay?: string }) {
  const { sections, staff, subjectAllocations } = school
  const classTT = out.classTT as Record<string, Record<string, Record<string, Any>>>
  const teacherOf = new Map(staff.map((s: Any) => [s.name, s]))

  // INV1 — teacher clash
  let clashes = 0
  for (const day of WORK_DAYS) {
    for (const pid of CLASS_PERIOD_IDS) {
      const seen = new Map<string, string>()
      for (const sec of sections) {
        const cell = classTT[sec.name]?.[day]?.[pid]
        if (!cell) continue
        // A pooled optional block legitimately shares its teachers across its
        // member sections in the same slot — same blockId = same lesson.
        const teachers: string[] = cell.options?.length
          ? cell.options.map((o: Any) => o.teacher).filter(Boolean)
          : cell.teacher ? [cell.teacher] : []
        for (const tn of teachers) {
          const prev = seen.get(tn)
          const sig = cell.optionalBlockId ?? sec.name
          if (prev !== undefined && prev !== sig) clashes++
          else seen.set(tn, sig)
        }
      }
    }
  }
  check(clashes === 0, 'INV1 no teacher double-booking', clashes ? `${clashes} clashes` : 'clean')

  // INV2 — frequency: placed === target for every (section, subject)
  let exact = 0, short = 0, over = 0, totalPairs = 0, missing = 0
  for (const sec of sections) {
    for (const [sub, targetStr] of Object.entries(subjectAllocations[sec.name])) {
      const target = Number(targetStr)
      totalPairs++
      let placed = 0
      for (const day of WORK_DAYS) {
        for (const pid of CLASS_PERIOD_IDS) {
          const cell = classTT[sec.name]?.[day]?.[pid]
          if (cell?.subject === sub) placed++
        }
      }
      if (placed === target) exact++
      else if (placed < target) { short++; missing += target - placed }
      else over++
    }
  }
  const pct = ((exact / totalPairs) * 100).toFixed(1)
  check(exact === totalPairs, `INV2 frequency exact ${exact}/${totalPairs} (${pct}%)`,
    exact === totalPairs ? 'all targets met' : `${short} short (${missing} periods missing), ${over} over`)

  // INV3 — eligibility
  let wrongSubject = 0
  for (const sec of sections) {
    for (const day of WORK_DAYS) {
      for (const pid of CLASS_PERIOD_IDS) {
        const cell = classTT[sec.name]?.[day]?.[pid]
        if (!cell?.teacher) continue
        const st = teacherOf.get(cell.teacher) as Any
        if (st && !(st.subjects ?? []).includes(cell.subject)) wrongSubject++
      }
    }
  }
  check(wrongSubject === 0, 'INV3 teacher-subject eligibility', wrongSubject ? `${wrongSubject} mismatches` : 'every lesson taught by a specialist')

  // INV4 — teacherTT mirrors classTT (shape: teacherTT[t].schedule[day][pid].sectionName)
  let mirrorBad = 0
  for (const sec of sections) {
    for (const day of WORK_DAYS) {
      for (const pid of CLASS_PERIOD_IDS) {
        const cell = classTT[sec.name]?.[day]?.[pid]
        if (!cell?.teacher) continue
        const m = out.teacherTT?.[cell.teacher]?.schedule?.[day]?.[pid]
        if (!m || m.sectionName !== sec.name) mirrorBad++
      }
    }
  }
  check(mirrorBad === 0, 'INV4 teacherTT mirrors classTT', mirrorBad ? `${mirrorBad} missing/incorrect` : 'consistent')

  // INV5 — day-off honored
  if (opts.offDay && opts.offDaySections) {
    let offViol = 0
    for (const sec of sections) {
      if (!opts.offDaySections(sec.name)) continue
      const dayCells = Object.values(classTT[sec.name]?.[opts.offDay] ?? {})
      offViol += dayCells.filter(Boolean).length
    }
    check(offViol === 0, `INV5 day-off honored (${opts.offDay})`, offViol ? `${offViol} lessons on off day` : 'no lessons placed')
  }

  // INV6 — blocked availability honored
  if (opts.blockedTeacher && opts.blockedDay) {
    let availViol = 0
    for (const sec of sections) {
      for (const pid of CLASS_PERIOD_IDS) {
        const cell = classTT[sec.name]?.[opts.blockedDay]?.[pid]
        if (cell?.teacher === opts.blockedTeacher) availViol++
        if (cell?.options?.some((o: Any) => o.teacher === opts.blockedTeacher)) availViol++
      }
    }
    check(availViol === 0, `INV6 blocked availability honored (${opts.blockedTeacher} off ${opts.blockedDay})`,
      availViol ? `${availViol} placements on blocked day` : 'never scheduled')
  }

  // INV7 — daily spread: subject ≤ ceil(target/days)+1 per day
  let crammed = 0
  for (const sec of sections) {
    for (const [sub, targetStr] of Object.entries(subjectAllocations[sec.name])) {
      const cap = Math.ceil(Number(targetStr) / WORK_DAYS.length) + 1
      for (const day of WORK_DAYS) {
        const n = CLASS_PERIOD_IDS.filter(pid => classTT[sec.name]?.[day]?.[pid]?.subject === sub).length
        if (n > cap) crammed++
      }
    }
  }
  check(crammed === 0, 'INV7 daily spread (≤ceil(target/6)+1 per day)', crammed ? `${crammed} crammed days` : 'well spread')

  // INV8 — weekly overload (soft in engine; report)
  const load: Record<string, number> = {}
  for (const sec of sections) for (const day of WORK_DAYS) for (const pid of CLASS_PERIOD_IDS) {
    const cell = classTT[sec.name]?.[day]?.[pid]
    if (cell?.teacher) load[cell.teacher] = (load[cell.teacher] ?? 0) + 1
  }
  const overloaded = staff.filter((s: Any) => (load[s.name] ?? 0) > s.maxPeriodsPerWeek)
  check(overloaded.length === 0, 'INV8 weekly caps respected',
    overloaded.length ? `${overloaded.length} over cap (worst +${Math.max(...overloaded.map((s: Any) => (load[s.name] ?? 0) - s.maxPeriodsPerWeek))})` : 'no teacher over maxPeriodsPerWeek')

  return { load }
}

// ── Run 1: realistic school with day-offs + blocked teacher ────────────────
console.log('════ Run 1: LKG–XII, 2 sections/grade (30 sections, 8×6 grid) ════')
const school = buildSchool(2)
console.log(`sections=${school.sections.length} staff=${school.staff.length} demand=${school.sections.length * PER_SECTION_TOTAL}p/wk capacity=${school.staff.length * 32}p/wk`)

const blockedTeacher = school.staff[0].name // an English teacher
const availability: Any = { [blockedTeacher]: { TUESDAY: Object.fromEntries(CLASS_PERIOD_IDS.map(p => [p, 'blocked'])) } }

const t0 = performance.now()
const out1 = solveTimetable({
  sections: school.sections, staff: school.staff, subjects: school.subjects,
  periods: PERIODS, workDays: WORK_DAYS, requirements: [],
  subjectAllocations: school.subjectAllocations,
  teacherAvailability: availability,
  dayOffRules: [{ day: 'Sat', classes: ['nur', 'lkg', 'ukg'] }],
} as Any)
const ms1 = performance.now() - t0
console.log(`solve time: ${ms1.toFixed(0)} ms · conflicts=${out1.conflicts.length} penalties=${out1.penalties.length}`)

verify(out1, school, {
  offDay: 'SATURDAY',
  offDaySections: n => /^(Nursery|LKG|UKG)/.test(n),
  blockedTeacher, blockedDay: 'TUESDAY',
})

// Determinism: same input twice ⇒ identical output
const out1b = solveTimetable({
  sections: school.sections, staff: school.staff, subjects: school.subjects,
  periods: PERIODS, workDays: WORK_DAYS, requirements: [],
  subjectAllocations: school.subjectAllocations,
  teacherAvailability: availability,
  dayOffRules: [{ day: 'Sat', classes: ['nur', 'lkg', 'ukg'] }],
} as Any)
check(JSON.stringify(out1.classTT) === JSON.stringify(out1b.classTT), 'DET deterministic output', 'same input ⇒ same timetable')

// ── Run 2: stress 2× (60 sections) — perf scaling ──────────────────────────
console.log('\n════ Run 2: stress — 4 sections/grade (60 sections) ════')
const big = buildSchool(4)
console.log(`sections=${big.sections.length} staff=${big.staff.length}`)
const t2 = performance.now()
const out2 = solveTimetable({
  sections: big.sections, staff: big.staff, subjects: big.subjects,
  periods: PERIODS, workDays: WORK_DAYS, requirements: [],
  subjectAllocations: big.subjectAllocations,
} as Any)
const ms2 = performance.now() - t2
console.log(`solve time: ${ms2.toFixed(0)} ms`)
verify(out2, big, {})

// ── Run 3: double periods respect bell adjacency ───────────────────────────
console.log('\n════ Run 3: double periods + bell adjacency ════')
const mini = buildSchool(1)
const miniSections = mini.sections.slice(0, 4)
const miniAlloc: Record<string, Record<string, string>> = {}
for (const sec of miniSections) {
  miniAlloc[sec.name] = { ...Object.fromEntries(Object.entries(ALLOC).map(([k, v]) => [k, String(v)])) }
  miniAlloc[sec.name]['Science'] = '2s=2p' // two 2-period lab blocks weekly (4 periods)
}
// Bell-true adjacency: p1→p2, p3→p4, p5→p6, p6→p7, p7→p8 are contiguous
// (p2→p3 straddles Break, p4→p5 straddles Lunch — NOT contiguous).
const adjacency = Object.fromEntries(miniSections.map((s: Any) => [s.name, ['p1', 'p3', 'p5', 'p6', 'p7']]))
const out3 = solveTimetable({
  sections: miniSections, staff: mini.staff, subjects: mini.subjects,
  periods: PERIODS, workDays: WORK_DAYS, requirements: [],
  subjectAllocations: miniAlloc, sectionAdjacency: adjacency,
} as Any)
let doubleBad = 0, doubleSeen = 0
const idx = Object.fromEntries(CLASS_PERIOD_IDS.map((p, i) => [p, i]))
const allowedStart = new Set(['p1', 'p3', 'p5', 'p6', 'p7'])
for (const sec of miniSections) {
  for (const day of WORK_DAYS) {
    const cells = CLASS_PERIOD_IDS.map(pid => out3.classTT[sec.name]?.[day]?.[pid])
    for (let i = 0; i < cells.length; i++) {
      if (cells[i]?.subject === 'Science' && cells[i + 1]?.subject === 'Science') {
        doubleSeen++
        const startPid = CLASS_PERIOD_IDS[i]
        if (!allowedStart.has(startPid)) doubleBad++
        i++ // skip the pair
      }
    }
  }
}
check(doubleSeen > 0 && doubleBad === 0, 'INV9 double periods never straddle a break',
  `${doubleSeen} doubles seen, ${doubleBad} straddling${doubleSeen === 0 ? ' (VACUOUS — no doubles placed!)' : ''}`)

// ── INV10: two classes are never sent to the same room at once ─────────────
//
// The solver copies each section's HOME room onto its lessons and never asks
// whether that room is free, so a school with fewer rooms than classes — one
// lab, one computer suite — gets them booked together silently. Allocating
// rooms properly is still ahead of us; DETECTING the clash is not, and this
// pins both halves: that a normal school raises nothing, and that a shared
// room raises exactly what it should.
console.log(`\n════ Run 4: rooms ════`)
{
  const mk = (sc: Any) => ({
    sections: sc.sections, staff: sc.staff, subjects: sc.subjects,
    periods: PERIODS, workDays: WORK_DAYS, requirements: [],
    subjectAllocations: sc.subjectAllocations,
  })
  const roomSchool = buildSchool(2)
  const cleanOut: Any = solveTimetable(mk(roomSchool) as Any)
  const cleanClashes = detectConflicts(cleanOut.classTT, PERIODS)
    .filter((c: Any) => c.type === 'room-clash')
  check(cleanClashes.length === 0,
    'INV10a a school where every class has its own room raises no room clash',
    cleanClashes.length ? `${cleanClashes.length} false positives` : 'clean')

  // Now hand two sections the same room, as a shared lab would.
  const shared = buildSchool(2)
  shared.sections[0].room = 'LAB'
  shared.sections[1].room = 'LAB'
  const sharedOut: Any = solveTimetable(mk(shared) as Any)
  let real = 0
  for (const day of WORK_DAYS) {
    for (const pid of CLASS_PERIOD_IDS) {
      const a = sharedOut.classTT[shared.sections[0].name]?.[day]?.[pid]
      const b = sharedOut.classTT[shared.sections[1].name]?.[day]?.[pid]
      if (a?.subject && b?.subject && a.room === b.room && a.room) real++
    }
  }
  const found = detectConflicts(sharedOut.classTT, PERIODS)
    .filter((c: Any) => c.type === 'room-clash')
  check(found.length === real,
    'INV10b every room double-booking that remains is reported',
    `${real} in the timetable, ${found.length} reported`)

  // With spare rooms on hand the solver must RESOLVE the shared-room case,
  // not merely report it: two sections given the same home room, and four
  // free rooms to move into.
  const spare = buildSchool(2)
  spare.sections[0].room = 'LAB'
  spare.sections[1].room = 'LAB'
  const withRooms: Any = solveTimetable({
    ...mk(spare),
    rooms: [
      { name: 'LAB', capacity: 60 },
      { name: 'Spare A', capacity: 60 }, { name: 'Spare B', capacity: 60 },
      { name: 'Spare C', capacity: 60 }, { name: 'Spare D', capacity: 60 },
    ],
  } as Any)
  const leftover = detectConflicts(withRooms.classTT, PERIODS)
    .filter((c: Any) => c.type === 'room-clash')
  check(leftover.length === 0,
    'INV10c given a free room, the solver moves the class instead of clashing',
    leftover.length ? `${leftover.length} clashes left: ${leftover[0].message}` : 'all resolved')

  // And a school that never had a clash must never be moved out of its own
  // rooms. (Comparing whole timetables with and without a `rooms` list would
  // prove nothing here — that list also feeds the learning-group splitter, so
  // it changes other things for reasons that have nothing to do with venues.)
  const normal = buildSchool(2)
  const normalOut: Any = solveTimetable({
    ...mk(normal),
    rooms: [{ name: 'Spare A', capacity: 60 }, { name: 'Spare B', capacity: 60 }],
  } as Any)
  let moved = 0
  const why: string[] = []
  for (const sec of normal.sections) {
    for (const day of WORK_DAYS) {
      for (const pid of CLASS_PERIOD_IDS) {
        const cell: Any = normalOut.classTT[sec.name]?.[day]?.[pid]
        if (!cell?.subject || !cell.room || cell.room === sec.room) continue
        // Optional blocks pool several sections into one venue on purpose —
        // that is the block's room, not a section being displaced.
        if (cell.optionalBlockId) continue
        moved++
        if (why.length < 3) why.push(`${sec.name} ${day} ${pid} → ${cell.room} (block=${!!cell.optionalBlockId})`)
      }
    }
  }
  check(moved === 0,
    'INV10d a class with its own free room is never moved out of it',
    moved ? `${moved} reassigned: ${why.join('; ')}` : 'every lesson stayed home')
}

// ── INV13: a class too big for its room ────────────────────────────────────
//
// 'capacity-exceeded' was declared in the Conflict union, labelled in the
// resolution wizard, and never produced — the third type in that state. The
// numbers were always there: a section carries its strength, a room its
// capacity. Now that the solver picks rooms, the pairing is worth checking.
console.log(`
════ Run 6: room capacity ════`)
{
  const capSchool = buildSchool(2)
  capSchool.sections.forEach((sec: Any, i: number) => { sec.strength = i === 0 ? 45 : 20 })
  const rooms = capSchool.sections.map((sec: Any) => ({ name: sec.room, capacity: 30 }))
  const capOut: Any = solveTimetable({
    sections: capSchool.sections, staff: capSchool.staff, subjects: capSchool.subjects,
    periods: PERIODS, workDays: WORK_DAYS, requirements: [],
    subjectAllocations: capSchool.subjectAllocations, rooms,
  } as Any)

  const over = detectConflicts(capOut.classTT, PERIODS, { sections: capSchool.sections, rooms })
    .filter((c: Any) => c.type === 'capacity-exceeded')
  const big = capSchool.sections[0].name
  check(over.length > 0 && over.every((c: Any) => c.message.includes(big)),
    'INV13a the class of 45 in a room for 30 is reported',
    over.length ? over[0].message : 'nothing reported')

  // Once per pairing, not once per period — forty duplicates would bury every
  // other conflict in the list.
  check(over.length === new Set(over.map((c: Any) => c.message)).size && over.length <= 2,
    'INV13b reported once per class-and-room, not once per lesson',
    `${over.length} entries`)

  // The class of 20 in the same size room must raise nothing.
  check(!over.some((c: Any) => c.message.startsWith(capSchool.sections[1].name)),
    'INV13c a class that fits raises nothing')

  // And a caller with no roster gets exactly what it always got.
  check(detectConflicts(capOut.classTT, PERIODS)
    .filter((c: Any) => c.type === 'capacity-exceeded').length === 0,
    'INV13d without a roster the check stays silent rather than guessing')
}

// ── INV11/INV12: what the solver does when it CANNOT satisfy the request ───
//
// Both of these are about refusing to lie. Under-resourced schools are the
// normal case, not the edge case, and the failure that matters is not "some
// lessons are unplaced" — it is a timetable that looks complete because the
// solver quietly broke a promise to fill it.
console.log(`
════ Run 5: impossible inputs ════`)
{
  const DAYS5 = ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY']
  const P5: Any[] = ['q1', 'q2', 'q3', 'q4', 'q5', 'q6']
    .map((id, i) => ({ id, name: `P${i + 1}`, duration: 40, type: 'class' }))
  const tinySchool = (staffed: boolean) => {
    const sections = Array.from({ length: 6 }, (_, i) =>
      ({ id: `x${i}`, name: `X${i}`, room: `XR${i}`, grade: 'VI', classTeacher: '' }))
    const staff = !staffed ? [] : ['Maths', 'Science', 'English'].map((sub, i) => ({
      id: `w${i}`, name: `W${i}`, subjects: [sub], classes: [],
      isClassTeacher: '', maxPeriodsPerWeek: 25,
    }))
    const subjectAllocations: Record<string, Record<string, string>> = {}
    sections.forEach(sec => { subjectAllocations[sec.name] = { Maths: '10', Science: '10', English: '10' } })
    return {
      sections, staff,
      subjects: ['Maths', 'Science', 'English'].map((n, i) => ({ id: `ss${i}`, name: n, periodsPerWeek: 10 })),
      periods: P5, workDays: DAYS5, requirements: [], subjectAllocations,
    }
  }

  // 180 periods of demand against three teachers capped at 25 — 75 legal
  // periods in total. The cap must hold and the rest must go unplaced.
  const tight = tinySchool(true)
  const tightOut: Any = solveTimetable(tight as Any)
  const load: Record<string, number> = {}
  let placedTight = 0
  for (const sec of Object.keys(tightOut.classTT))
    for (const d of Object.keys(tightOut.classTT[sec]))
      for (const pid of Object.keys(tightOut.classTT[sec][d])) {
        const cell = tightOut.classTT[sec][d][pid]
        if (!cell?.subject) continue
        placedTight++
        if (cell.teacher) load[cell.teacher] = (load[cell.teacher] ?? 0) + 1
      }
  const broke = tight.staff.filter((st: Any) => (load[st.name] ?? 0) > st.maxPeriodsPerWeek)
  check(broke.length === 0,
    'INV11 the weekly cap holds even when demand is far past it',
    broke.length
      ? `over: ${broke.map((b: Any) => `${b.name} ${load[b.name]}/${b.maxPeriodsPerWeek}`).join(', ')}`
      : `${placedTight} of 180 placed, nobody past their cap`)
  check(placedTight > 0 && placedTight < 180,
    'and it neither gives up nor pretends it filled the week',
    `${placedTight} placed`)

  // No staff at all: every lesson it places would have to invent a teacher.
  const bare: Any = solveTimetable(tinySchool(false) as Any)
  let withTeacher = 0
  for (const sec of Object.keys(bare.classTT))
    for (const d of Object.keys(bare.classTT[sec]))
      for (const pid of Object.keys(bare.classTT[sec][d]))
        if (bare.classTT[sec][d][pid]?.teacher) withTeacher++
  check(withTeacher === 0,
    'INV12 a school with no staff gets no lesson with a teacher on it',
    withTeacher ? `${withTeacher} lessons carry an invented teacher` : 'none invented')
}

// ── Summary ────────────────────────────────────────────────────────────────
console.log('\n════ Summary ════')
console.log(`Run1 (30 sections): ${ms1.toFixed(0)} ms · Run2 (60 sections): ${ms2.toFixed(0)} ms`)
console.log(failures === 0 ? 'ALL CHECKS PASSED' : `${failures} CHECK(S) FAILED`)
process.exit(failures === 0 ? 0 : 1)
