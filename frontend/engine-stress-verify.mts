/**
 * RANDOMISED STRESS AUDIT of the scheduling engine.
 * Run: npx tsx engine-stress-verify.mts [runs] [seed]
 *
 * engine-full-verify proves the invariants hold on ONE carefully built school,
 * plus a dozen hand-made edge cases. That is the right way to pin a known bug,
 * and the wrong way to answer "is it correct in every situation" — a fixture
 * only ever exercises the shape somebody thought to write down.
 *
 * So this generates schools across the whole configuration space — from a
 * three-section primary to a saturated senior school with scarce staff, day-off
 * rules, blocked availability, room capacities, double periods, class teachers
 * and parallel groups — and machine-checks the output of each.
 *
 * TWO RULES make this worth running:
 *
 *  1. The verifier is INDEPENDENT. It never calls detectConflicts, or any
 *     engine helper, or cellTeachers. It walks the raw classTT and rebuilds
 *     every fact from scratch. This codebase has already produced one bug where
 *     the solver's own conflict list and detectConflicts had drifted into the
 *     SAME blind spot independently — a checker sharing their code would have
 *     agreed with both of them.
 *
 *  2. Every failure is REPRODUCIBLE. The generator is seeded, and a failing run
 *     prints the seed that produced it, so a stress failure becomes a fixture.
 *
 * A shortfall is NOT a failure here: a school can ask for more teaching than
 * its staff can deliver, and the honest answer is to place what fits and report
 * the rest. Scheduling a lesson that cannot happen IS a failure.
 */
import { solveTimetable } from './src/lib/schedulingEngine.ts'

type Any = any

const RUNS = Number(process.argv[2] ?? 60)
const BASE_SEED = Number(process.argv[3] ?? 1)

// ── A seeded PRNG, so every failure can be replayed ────────────────────────
function rng(seed: number) {
  let s = seed >>> 0
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0
    return s / 4294967296
  }
}

// ── School generator ───────────────────────────────────────────────────────
const SUBJECT_POOL = [
  'English', 'Mathematics', 'Science', 'Hindi', 'Social Studies', 'Computer',
  'Art', 'Music', 'Physical Education', 'GK', 'Sanskrit', 'Physics',
  'Chemistry', 'Biology', 'Economics', 'Accountancy',
]
const DAYS = ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY']

interface Gen {
  label: string
  sections: Any[]; staff: Any[]; subjects: Any[]; periods: Any[]
  workDays: string[]
  subjectAllocations: Record<string, Record<string, string>>
  teacherAvailability: Any
  dayOffRules: Any[]
  rooms: Any[]
  sectionAdjacency?: Record<string, string[]>
  defaultTeacherMaxPeriods?: number
  optionalBlocks: Any[]
}

function generate(seed: number): Gen {
  const r = rng(seed)
  const pick = <T,>(a: T[]): T => a[Math.floor(r() * a.length)]
  const int = (lo: number, hi: number) => lo + Math.floor(r() * (hi - lo + 1))

  // Shape of the school. The ranges deliberately include the degenerate ends:
  // one section, one work day, three periods — the sizes a real product meets
  // on day one and a fixture never covers.
  const nSections = int(1, 14)
  const nClassPeriods = int(3, 10)
  const nDays = int(1, 6)
  const workDays = DAYS.slice(0, nDays)
  const nSubjects = int(2, 9)
  const subjectNames = SUBJECT_POOL.slice(0, nSubjects)

  // Periods, with breaks scattered through so double periods have something to
  // straddle and the "never teach on a break" rule has something to break.
  const periods: Any[] = []
  let classCount = 0
  for (let i = 0; classCount < nClassPeriods; i++) {
    const wantBreak = i > 0 && classCount < nClassPeriods && r() < 0.22
    if (wantBreak) {
      periods.push({ id: `b${i}`, name: `Break${i}`, duration: 15, type: r() < 0.5 ? 'break' : 'lunch', shiftable: false })
    } else {
      classCount++
      periods.push({ id: `p${classCount}`, name: `P${classCount}`, duration: 40, type: 'class', shiftable: true })
    }
  }
  const classPeriodIds = periods.filter(p => p.type === 'class').map(p => p.id)
  const capacity = classPeriodIds.length * workDays.length

  // Grade-prefixed names, because that is the shape day-off rules address:
  // a rule names a CLASS ("VII"), not a section, and the engine matches it
  // against the first hyphen segment. Naming sections Sec-0..Sec-n made every
  // generated day-off rule match nothing, so the rule was never exercised —
  // the fixture quietly tested the absence of the feature.
  const GRADES = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII']
  const sections: Any[] = []
  for (let i = 0; i < nSections; i++) {
    const grade = GRADES[i % GRADES.length]
    const letter = String.fromCharCode(65 + Math.floor(i / GRADES.length))
    sections.push({
      id: `s${i}`, name: `${grade}-${letter}`, room: `R${i}`, grade,
      classTeacher: '', strength: int(18, 48),
    })
  }

  // Demand: from comfortably under capacity to slightly over it. The over case
  // matters — a school that asks for more than fits must still get a legal
  // timetable, just an incomplete one.
  const fillRatio = pick([0.35, 0.6, 0.8, 0.95, 1.0, 1.15])
  const target = Math.max(1, Math.round(capacity * fillRatio))
  const subjectAllocations: Record<string, Record<string, string>> = {}
  for (const sec of sections) {
    const row: Record<string, string> = {}
    let left = target
    subjectNames.forEach((name, i) => {
      const share = i === subjectNames.length - 1
        ? left
        : Math.min(left, Math.max(1, Math.round(target / subjectNames.length + (r() * 2 - 1))))
      if (share > 0) {
        // Sometimes ask for a double period, which must not straddle a break.
        row[name] = r() < 0.15 && share >= 2 ? `${share - 2}+2` : String(share)
        left -= share
      }
    })
    subjectAllocations[sec.name] = row
  }

  // Staffing: from generous to scarce. Scarcity is where a solver is most
  // tempted to cheat — double-booking somebody to hit a target.
  const supply = pick([0.5, 0.8, 1.0, 1.4, 2.2])
  const staff: Any[] = []
  let t = 0
  for (const sub of subjectNames) {
    const demand = nSections * Math.round(target / subjectNames.length)
    const cap = int(18, 36)
    const count = Math.max(1, Math.ceil((demand / cap) * supply))
    for (let i = 0; i < count; i++) {
      t++
      // Some teachers cover two subjects, which is where "is this teacher
      // eligible" stops being a one-to-one lookup.
      const extra = r() < 0.25 ? [pick(subjectNames)] : []
      staff.push({
        id: `t${t}`, name: `T${t}`, shortName: `T${t}`, role: 'teacher',
        subjects: [...new Set([sub, ...extra])], classes: [],
        isClassTeacher: '', maxPeriodsPerWeek: cap,
      })
    }
  }

  // Some schools name class teachers, which pins a teacher to a section.
  if (r() < 0.4) {
    for (const sec of sections) {
      if (r() < 0.6 && staff.length) {
        const who = pick(staff)
        sec.classTeacher = who.name
        who.isClassTeacher = sec.name
      }
    }
  }

  // Blocked availability — a teacher genuinely unable to teach at a time.
  const teacherAvailability: Any = {}
  if (r() < 0.6) {
    for (const s of staff) {
      if (r() > 0.3) continue
      const day = pick(workDays)
      teacherAvailability[s.name] ??= {}
      teacherAvailability[s.name][day] ??= {}
      for (const pid of classPeriodIds) {
        if (r() < 0.5) teacherAvailability[s.name][day][pid] = 'blocked'
      }
    }
  }

  // A grade that does not come in on the last working day.
  const dayOffRules: Any[] = []
  if (r() < 0.35 && workDays.length > 1) {
    const short = workDays[workDays.length - 1].slice(0, 3)
    const grade = sections[0].name.split('-')[0].toLowerCase()
    dayOffRules.push({ day: short[0] + short.slice(1).toLowerCase(), classes: [grade] })
  }

  // Rooms, sometimes too small for the class using them.
  const rooms: Any[] = sections.map((s, i) => ({
    id: `rm${i}`, name: s.room, generatedName: s.room,
    capacity: r() < 0.2 ? int(10, 25) : 60, roomType: 'classroom',
  }))

  // Bell-true adjacency: which class periods really are back to back.
  const sectionAdjacency: Record<string, string[]> = {}
  const adjacent: string[] = []
  for (let i = 0; i < periods.length - 1; i++) {
    if (periods[i].type === 'class' && periods[i + 1].type === 'class') adjacent.push(periods[i].id)
  }
  for (const s of sections) sectionAdjacency[s.name] = adjacent

  // Parallel groups — an OR choice ("Physics OR Chemistry") or an AND split
  // (two halves of a class taught at once). These pin a slot before any other
  // pass runs, so they are the one thing that can make every later pass work
  // around them, and they were the whole untested half of the engine.
  const optionalBlocks: Any[] = []
  if (r() < 0.45 && sections.length >= 1 && subjectNames.length >= 2 && staff.length >= 2) {
    const nBlocks = int(1, Math.min(3, classPeriodIds.length))
    const usedSlots = new Set<string>()
    for (let b = 0; b < nBlocks; b++) {
      const day = pick(workDays)
      const pid = pick(classPeriodIds)
      if (usedSlots.has(`${day}|${pid}`)) continue
      usedSlots.add(`${day}|${pid}`)
      const nOpts = int(2, Math.min(3, subjectNames.length))
      const subs = [...subjectNames].sort(() => r() - 0.5).slice(0, nOpts)
      // Each option gets a teacher who actually TEACHES that subject, and no
      // teacher appears twice in one block. Both are what the app's own block
      // editor would produce; handing the engine a block that says "T5 teaches
      // Physics" when T5 does not is testing the generator, not the solver.
      const taken = new Set<string>()
      const options = subs.map((sub, i) => {
        const who = staff.filter((st: Any) =>
          (st.subjects ?? []).includes(sub) && !taken.has(st.name))
        if (!who.length) return null
        const chosen = who[Math.floor(r() * who.length)]
        taken.add(chosen.name)
        return { subject: sub, teacher: chosen.name, room: `Blk${b}-${i}`, capacity: int(20, 40) }
      }).filter(Boolean) as Any[]
      if (options.length < 2) continue
      // Only sections that exist, and sometimes several — cross-section pooling.
      const count = int(1, Math.min(3, sections.length))
      optionalBlocks.push({
        id: `blk${b}`, name: `Block${b}`,
        sectionNames: sections.slice(0, count).map(x => x.name),
        day, periodId: pid, options,
        logic: r() < 0.5 ? 'OR' : 'AND',
      })
    }
  }

  return {
    optionalBlocks,
    label: `${nSections}sec ${classPeriodIds.length}p×${workDays.length}d fill=${fillRatio} supply=${supply}${optionalBlocks.length ? ` blocks=${optionalBlocks.length}` : ''}`,
    sections, staff, subjects: subjectNames.map((n, i) => ({ id: `sub${i}`, name: n, periodsPerWeek: 4 })),
    periods, workDays, subjectAllocations, teacherAvailability, dayOffRules, rooms,
    sectionAdjacency, defaultTeacherMaxPeriods: 30,
  }
}

// ── The independent verifier ───────────────────────────────────────────────
//
// Everything below rebuilds its own view of the timetable from the raw
// classTT. It shares no helper with the engine on purpose.

interface Violation { rule: string; detail: string }

/** Every (teacher, subject, room) actually in a cell, in every shape a cell
 *  can carry them. Written out here rather than imported, so a bug in the
 *  shared reader cannot hide a bug in the solver. */
function occupantsOf(cell: Any): Array<{ teacher: string; subject: string; room: string }> {
  if (!cell) return []
  const out: Array<{ teacher: string; subject: string; room: string }> = []
  const push = (teacher: Any, subject: Any, room: Any) => {
    const t = String(teacher ?? '').trim()
    if (t) out.push({ teacher: t, subject: String(subject ?? '').trim(), room: String(room ?? '').trim() })
  }
  const groups = [...(cell.groupAssignments ?? []), ...(cell.options ?? [])]
  if (groups.length) {
    for (const g of groups) push(g.teacher, g.subject ?? cell.subject, g.room ?? cell.room)
    // A parallel cell mirrors its first group into the cell-level fields, so
    // adding cell.teacher again would report the cell as clashing with itself.
    return out
  }
  push(cell.teacher, cell.subject, cell.room)
  return out
}

function verify(g: Gen, out: Any): Violation[] {
  const v: Violation[] = []
  const add = (rule: string, detail: string) => { if (v.length < 40) v.push({ rule, detail }) }

  const classTT = out.classTT ?? {}
  const periodById = new Map(g.periods.map(p => [p.id, p]))
  const classIds = new Set(g.periods.filter(p => p.type === 'class').map(p => p.id))
  const staffByName = new Map(g.staff.map(s => [s.name, s]))
  const sectionNames = new Set(g.sections.map(s => s.name))
  const subjectNames = new Set(g.subjects.map(s => s.name))

  // Which sections are off on which day.
  //
  // This implements the rule as DOCUMENTED — "classes are class-key prefixes,
  // matched against the first hyphen/space segment of the section name" — and
  // deliberately not by calling the engine's own matcher. A verifier that
  // imports the code it is checking agrees with it by construction.
  const offOn = (section: string, day: string) => g.dayOffRules.some(rule => {
    const key = rule.day.toUpperCase()
    const dayKey = DAYS.find(d => d.startsWith(key)) ?? key
    if (dayKey !== day) return false
    const classes = rule.classes ?? []
    if (!classes.length) return true          // a rule with no classes is school-wide
    const firstSeg = section.split(/[\s-]/)[0].toLowerCase()
    const squashed = section.toLowerCase().replace(/[\s-]/g, '')
    return classes.some((c: string) => {
      const ck = c.toLowerCase()
      if (ck === 'nur' || ck === 'lkg' || ck === 'ukg') return squashed.startsWith(ck)
      return firstSeg === ck
    })
  })

  // A POOLED block is one lesson taught to several sections at once — the same
  // teacher, the same room, students from I-A and II-A in the room together.
  // Read from the INPUT blocks, not from the solver's output, so this stays a
  // statement about what was asked for rather than a copy of what was done.
  //
  // Without this the verifier reported every pooled block as a teacher clash
  // AND a room clash, which is the feature working exactly as designed.
  // A block is NOT limited to its pinned slot — the engine runs it as many
  // periods a week as the subject quota needs, which on a one-day week puts two
  // instances of the same block on the same day. So a pooled lesson is
  // recognised by its SHAPE wherever it lands, not by the slot it was pinned
  // to.
  //
  // The signature is the block's (subject, teacher) set. Two sections share a
  // lesson only when both cells carry that exact signature AND both sections
  // are listed on that block. A section the block does not name, or a cell that
  // does not match, is still a clash — which is what keeps this a check rather
  // than a blanket amnesty for anything parallel.
  const sigOf = (opts: Any[]) =>
    opts.map((o: Any) => `${(o.subject ?? '').trim()}~${(o.teacher ?? '').trim()}`).sort().join('|')
  const blockSections = new Map<string, Set<string>>()
  for (const blk of g.optionalBlocks ?? []) {
    const sig = sigOf(blk.options ?? [])
    const set = blockSections.get(sig) ?? new Set<string>()
    for (const sn of blk.sectionNames ?? []) set.add(sn)
    blockSections.set(sig, set)
  }
  /** slot → section → the block signature that section's cell carries. */
  const cellSig = new Map<string, Map<string, string>>()
  /** Are these sections one pooled lesson at this slot? */
  const isPooled = (slot: string, secs: string[]) => {
    const bySection = cellSig.get(slot)
    if (!bySection) return false
    const first = bySection.get(secs[0])
    if (!first) return false
    if (!secs.every(x => bySection.get(x) === first)) return false
    const allowed = blockSections.get(first)
    return !!allowed && secs.every(x => allowed.has(x))
  }

  // (day, period) → who is teaching, and where.
  const busy = new Map<string, Map<string, string[]>>()   // slot → teacher → [section]
  const roomUse = new Map<string, Map<string, Set<string>>>() // slot → room → sections
  const placed = new Map<string, number>()                 // section|subject → count

  for (const [section, days] of Object.entries(classTT)) {
    if (!sectionNames.has(section)) add('V9-ghost-section', `classTT has unknown section ${section}`)
    for (const [day, slots] of Object.entries(days as Any)) {
      if (!g.workDays.includes(day)) {
        add('V5-nonwork-day', `${section} has lessons on ${day}, not a work day`)
      }
      if (offOn(section, day)) {
        const n = Object.values(slots as Any).filter((c: Any) => c?.subject).length
        if (n) add('V5-day-off', `${section} has ${n} lessons on its day off ${day}`)
      }
      for (const [pid, cell] of Object.entries(slots as Any)) {
        const c = cell as Any
        if (!c?.subject) continue

        const p = periodById.get(pid)
        if (!p) { add('V9-ghost-period', `${section} ${day} references unknown period ${pid}`); continue }
        if (!classIds.has(pid)) {
          add('V4-teaching-on-break', `${section} ${day} ${pid} is a ${p.type}, not a class period`)
        }

        const slotKey = `${day}|${pid}`
        const occ = occupantsOf(c)

        // Record this cell's parallel-group signature, if it has one.
        //
        // Both shapes, because a cell carries its parallel options in EITHER
        // `groupAssignments` (OR/AND groups) or `options` (optional blocks) —
        // and Pass 0, which is what pins a pooled block, writes the second one.
        // Reading only the first made every pooled lesson look like a clash.
        const parallel = [...(c.groupAssignments ?? []), ...(c.options ?? [])]
        if (parallel.length) {
          const m = cellSig.get(slotKey) ?? new Map<string, string>()
          m.set(section, sigOf(parallel))
          cellSig.set(slotKey, m)
        }

        // The cell's own label must agree with what is inside it.
        const groups = c.groupAssignments ?? []
        if (groups.length) {
          const labelled = String(c.subject).split(/ (?:OR|AND) /).map((x: string) => x.trim())
          for (const gp of groups) {
            if (gp.subject && !labelled.includes(gp.subject)) {
              add('V10-label-mismatch',
                `${section} ${day} ${pid}: label "${c.subject}" omits group subject "${gp.subject}"`)
            }
          }
        }

        for (const o of occ) {
          // V3 — the teacher must exist and actually teach the subject.
          const st = staffByName.get(o.teacher)
          if (!st) { add('V9-ghost-teacher', `${section} ${day} ${pid}: unknown teacher ${o.teacher}`); continue }
          if (o.subject && !(st.subjects ?? []).includes(o.subject)) {
            add('V3-eligibility', `${o.teacher} assigned ${o.subject} in ${section} but teaches ${JSON.stringify(st.subjects)}`)
          }
          // V6 — a blocked slot is a slot the teacher cannot work.
          if (g.teacherAvailability?.[o.teacher]?.[day]?.[pid] === 'blocked') {
            add('V6-blocked', `${o.teacher} teaches ${section} ${day} ${pid} while blocked`)
          }
          // V1 — one teacher, one place.
          const perSlot = busy.get(slotKey) ?? new Map<string, string[]>()
          const where = perSlot.get(o.teacher) ?? []
          where.push(section)
          perSlot.set(o.teacher, where)
          busy.set(slotKey, perSlot)
        }

        // V8 — one room, one class.
        for (const o of occ) {
          if (!o.room) continue
          const perRoom = roomUse.get(slotKey) ?? new Map<string, Set<string>>()
          const set = perRoom.get(o.room) ?? new Set<string>()
          set.add(section)
          perRoom.set(o.room, set)
          roomUse.set(slotKey, perRoom)
        }

        // V11 — count placements per (section, subject) to catch OVER-supply.
        const subs = groups.length
          ? groups.map((x: Any) => x.subject).filter(Boolean)
          : [c.subject]
        for (const sname of subs) {
          if (!subjectNames.has(sname) && !String(sname).includes(' OR ') && !String(sname).includes(' AND ')) {
            add('V9-ghost-subject', `${section} ${day} ${pid}: unknown subject ${sname}`)
          }
          const k = `${section}|${sname}`
          placed.set(k, (placed.get(k) ?? 0) + 1)
        }
      }
    }
  }

  // V1 — report any teacher in two sections at one moment.
  for (const [slot, perSlot] of busy) {
    for (const [teacher, where] of perSlot) {
      const distinct = [...new Set(where)]
      if (distinct.length > 1 && !isPooled(slot, distinct)) {
        add('V1-teacher-clash', `${teacher} in ${distinct.join(' + ')} at ${slot}`)
      }
    }
  }

  // V8 — two different classes in one room at one moment.
  for (const [slot, perRoom] of roomUse) {
    for (const [room, secs] of perRoom) {
      if (secs.size > 1 && !isPooled(slot, [...secs])) {
        add('V8-room-clash', `${room} holds ${[...secs].join(' + ')} at ${slot}`)
      }
    }
  }

  // V11 — never schedule MORE of a subject than was asked for. Under is a
  // shortfall the engine reports honestly; over is the engine inventing work.
  for (const [sec, row] of Object.entries(g.subjectAllocations)) {
    for (const [sub, spec] of Object.entries(row)) {
      const want = String(spec).split('+').reduce((a, b) => a + (parseInt(b, 10) || 0), 0)
      const got = placed.get(`${sec}|${sub}`) ?? 0
      if (got > want) add('V11-over-scheduled', `${sec} ${sub}: asked ${want}, placed ${got}`)
    }
  }

  // V7 — teacherTT must agree with classTT, in both directions.
  const teacherTT = out.teacherTT ?? {}
  for (const [tname, rec] of Object.entries(teacherTT as Any)) {
    for (const [day, slots] of Object.entries((rec as Any).schedule ?? {})) {
      for (const [pid, entry] of Object.entries(slots as Any)) {
        const sec = (entry as Any)?.sectionName
        if (!sec) continue
        const cell = classTT[sec]?.[day]?.[pid]
        const here = occupantsOf(cell).some(o => o.teacher === tname)
        if (!here) add('V7-mirror', `teacherTT says ${tname} is in ${sec} ${day} ${pid}; classTT disagrees`)
      }
    }
  }

  // V12 — a multi-period block must not straddle a break.
  const adjacency = new Set(g.sectionAdjacency?.[g.sections[0]?.name] ?? [])
  const orderedClassIds = g.periods.filter(p => p.type === 'class').map(p => p.id)
  for (const [section, days] of Object.entries(classTT)) {
    for (const [day, slots] of Object.entries(days as Any)) {
      for (let i = 0; i < orderedClassIds.length - 1; i++) {
        const a = (slots as Any)[orderedClassIds[i]]
        const b = (slots as Any)[orderedClassIds[i + 1]]
        if (!a?.isDoubleStart) continue
        if (!b || b.subject !== a.subject) {
          add('V12-double-broken', `${section} ${day}: double period on ${a.subject} has no second half`)
        } else if (!adjacency.has(orderedClassIds[i])) {
          add('V12-double-straddles-break',
            `${section} ${day}: double period spans ${orderedClassIds[i]}→${orderedClassIds[i + 1]} across a break`)
        }
      }
    }
  }

  return v
}

// ── Does the verifier actually catch anything? ─────────────────────────────
//
// A checker that silently passes everything is worse than no checker: it
// reports a clean bill of health on every run and nobody looks again. So
// before checking the engine, the verifier is checked — each rule is handed
// output it MUST reject, and the run aborts if any rule stays quiet.
//
// This is not hypothetical. Injecting a double-booking into one of the
// solver's placement paths produced no violations at all, and only this told
// me whether the fault or the checker was at fault.
function selfTest(): void {
  const g = generate(424242)
  const sec = g.sections[0].name
  const sec2 = g.sections[1]?.name
  const day = g.workDays[0]
  const pids = g.periods.filter(p => p.type === 'class').map(p => p.id)
  const breakId = g.periods.find(p => p.type !== 'class')?.id
  const t1 = g.staff[0].name
  const sub = Object.keys(g.subjectAllocations[sec])[0]

  const base = (): Any => ({ classTT: { [sec]: { [day]: {} } }, teacherTT: {} })
  const expect = (rule: string, out: Any, why: string) => {
    const hits = verify(g, out).filter(v => v.rule.startsWith(rule))
    if (!hits.length) {
      console.log(`✗ VERIFIER BROKEN: ${rule} did not fire — ${why}`)
      process.exit(2)
    }
  }

  if (sec2) {
    const out = base()
    out.classTT[sec2] = { [day]: {} }
    out.classTT[sec][day][pids[0]] = { subject: sub, teacher: t1, room: 'RA' }
    out.classTT[sec2][day][pids[0]] = { subject: sub, teacher: t1, room: 'RB' }
    expect('V1', out, 'one teacher in two sections at one slot')

    const rooms = base()
    rooms.classTT[sec2] = { [day]: {} }
    rooms.classTT[sec][day][pids[0]] = { subject: sub, teacher: t1, room: 'SHARED' }
    rooms.classTT[sec2][day][pids[0]] = { subject: sub, teacher: g.staff[1]?.name ?? t1, room: 'SHARED' }
    expect('V8', rooms, 'two classes in one room at one slot')
  }

  if (breakId) {
    const out = base()
    out.classTT[sec][day][breakId] = { subject: sub, teacher: t1, room: 'RA' }
    expect('V4', out, 'a lesson placed on a break period')
  }

  {
    const out = base()
    out.classTT[sec][day][pids[0]] = { subject: sub, teacher: 'Nobody At All', room: 'RA' }
    expect('V9-ghost-teacher', out, 'a teacher who does not exist')
  }

  {
    // A teacher who exists but does not teach this subject.
    const stranger = g.staff.find((x: Any) => !(x.subjects ?? []).includes(sub))
    if (stranger) {
      const out = base()
      out.classTT[sec][day][pids[0]] = { subject: sub, teacher: stranger.name, room: 'RA' }
      expect('V3', out, 'a teacher assigned a subject they do not teach')
    }
  }

  {
    const out = base()
    for (const pid of pids) out.classTT[sec][day][pid] = { subject: sub, teacher: t1, room: 'RA' }
    for (const d of g.workDays.slice(1)) {
      out.classTT[sec][d] = {}
      for (const pid of pids) out.classTT[sec][d][pid] = { subject: sub, teacher: t1, room: 'RA' }
    }
    expect('V11', out, 'far more of a subject than was asked for')
  }

  {
    const out = base()
    out.classTT[sec][day][pids[0]] = { subject: sub, teacher: t1, room: 'RA' }
    out.teacherTT = { [t1]: { schedule: { [day]: { [pids[1] ?? pids[0]]: { sectionName: sec2 ?? sec } } } } }
    expect('V7', out, 'teacherTT claiming a lesson classTT does not have')
  }

  {
    // Blocked availability, forced.
    const who = g.staff[0].name
    const g2: Gen = { ...g, teacherAvailability: { [who]: { [day]: { [pids[0]]: 'blocked' } } } }
    const out = base()
    out.classTT[sec][day][pids[0]] = { subject: sub, teacher: who, room: 'RA' }
    const hits = verify(g2, out).filter(v => v.rule.startsWith('V6'))
    if (!hits.length) {
      console.log('✗ VERIFIER BROKEN: V6 did not fire — a lesson in a blocked slot')
      process.exit(2)
    }
  }

  {
    // The pooled-block exemption must not become a blanket amnesty for
    // anything parallel. A block teacher who is ALSO in a section the block
    // does not name, at the same slot, is in two rooms at once.
    const gb = generate(15843)
    const blk = gb.optionalBlocks[0]
    if (blk && gb.sections.length > blk.sectionNames.length) {
      const outsider = gb.sections.find((x: Any) => !blk.sectionNames.includes(x.name))!.name
      const inside = blk.sectionNames[0]
      const slotDay = blk.day, slotPid = blk.periodId
      const out: Any = { classTT: { [inside]: { [slotDay]: {} }, [outsider]: { [slotDay]: {} } }, teacherTT: {} }
      out.classTT[inside][slotDay][slotPid] = {
        subject: blk.options.map((o: Any) => o.subject).join(' AND '),
        teacher: blk.options[0].teacher, room: blk.options[0].room,
        options: blk.options,
      }
      // The same teacher, at the same moment, in a section the block never listed.
      out.classTT[outsider][slotDay][slotPid] = {
        subject: blk.options[0].subject, teacher: blk.options[0].teacher, room: 'Elsewhere',
      }
      const hits = verify(gb, out).filter(v => v.rule.startsWith('V1'))
      if (!hits.length) {
        console.log('✗ VERIFIER BROKEN: V1 did not fire — a block teacher also teaching a section off the block')
        process.exit(2)
      }
    }

    // And two sections genuinely pooled on one block must NOT be reported.
    if (blk && blk.sectionNames.length > 1) {
      const cell = {
        subject: blk.options.map((o: Any) => o.subject).join(' AND '),
        teacher: blk.options[0].teacher, room: blk.options[0].room,
        options: blk.options,
      }
      const out: Any = { classTT: {}, teacherTT: {} }
      for (const sn of blk.sectionNames) out.classTT[sn] = { [blk.day]: { [blk.periodId]: cell } }
      const hits = verify(gb, out).filter(v => v.rule.startsWith('V1') || v.rule.startsWith('V8'))
      if (hits.length) {
        console.log('✗ VERIFIER TOO STRICT: a genuinely pooled block was reported — ' + hits[0].detail)
        process.exit(2)
      }
    }
  }

  console.log('verifier self-check: every rule fires on output it must reject')
}

selfTest()

// ── Run ────────────────────────────────────────────────────────────────────
console.log(`Stress: ${RUNS} generated schools from seed ${BASE_SEED}\n`)

const tally = new Map<string, number>()
// What each run actually EXERCISED. A generator that quietly stopped producing
// day-off rules, or class teachers, or scarcity, would go on passing forever
// while testing less and less — which is the failure mode this whole file
// exists to avoid, so it is measured rather than assumed.
const covered = new Map<string, number>()
const cover = (k: string) => covered.set(k, (covered.get(k) ?? 0) + 1)
let failedRuns = 0
let solved = 0
let totalMs = 0
let slowest = { ms: 0, label: '', seed: 0 }

for (let i = 0; i < RUNS; i++) {
  const seed = BASE_SEED + i * 7919
  let g: Gen
  try {
    g = generate(seed)
  } catch (e: Any) {
    console.log(`✗ seed ${seed}: generator threw — ${e?.message}`)
    failedRuns++
    continue
  }

  let out: Any
  const t0 = performance.now()
  try {
    out = solveTimetable({
      sections: g.sections, staff: g.staff, subjects: g.subjects,
      periods: g.periods, workDays: g.workDays, requirements: [],
      subjectAllocations: g.subjectAllocations,
      teacherAvailability: g.teacherAvailability,
      dayOffRules: g.dayOffRules,
      rooms: g.rooms,
      sectionAdjacency: g.sectionAdjacency,
      defaultTeacherMaxPeriods: g.defaultTeacherMaxPeriods,
      optionalBlocks: g.optionalBlocks,
    } as Any)
  } catch (e: Any) {
    console.log(`✗ seed ${seed} (${g.label}): SOLVER THREW — ${e?.message}`)
    console.log(`   replay: npx tsx engine-stress-verify.mts 1 ${seed}`)
    failedRuns++
    continue
  }
  const ms = performance.now() - t0
  totalMs += ms
  if (ms > slowest.ms) slowest = { ms, label: g.label, seed }
  solved++

  // Record what this school actually contained.
  if (g.dayOffRules.length) {
    const off = g.sections.filter(sec => g.dayOffRules.some((rule: Any) =>
      (rule.classes ?? []).some((c: string) => sec.name.split('-')[0].toLowerCase() === c.toLowerCase())))
    if (off.length) cover('day-off rule matches a real section')
  }
  if (g.sections.some(sec => sec.classTeacher)) cover('class teachers named')
  if (g.optionalBlocks.length) cover('parallel groups (OR/AND blocks)')
  if (g.optionalBlocks.some((b: Any) => b.sectionNames.length > 1)) cover('a block pooled across sections')
  if (g.optionalBlocks.some((b: Any) => b.logic === 'OR')) cover('an OR choice block')
  if (g.optionalBlocks.some((b: Any) => b.logic === 'AND')) cover('an AND split block')
  if (Object.keys(g.teacherAvailability).length) cover('blocked availability')
  if (g.periods.some(p => p.type !== 'class')) cover('breaks in the day')
  if (Object.values(g.subjectAllocations).some(row =>
    Object.values(row).some(v => v.includes('+')))) cover('double periods requested')
  if (g.rooms.some((rm: Any) => rm.capacity < 30)) cover('a room too small for its class')
  if (g.workDays.length === 1) cover('a one-day week')
  if (g.sections.length === 1) cover('a single-section school')
  {
    const cap = g.periods.filter(p => p.type === 'class').length * g.workDays.length
    const want = Object.values(g.subjectAllocations)[0]
    const askedFor = want ? Object.values(want).reduce((a, v) =>
      a + String(v).split('+').reduce((x, y) => x + (parseInt(y, 10) || 0), 0), 0) : 0
    if (askedFor > cap) cover('demand beyond capacity')
    if (askedFor === cap) cover('demand exactly at capacity')
  }
  const shortfall = Object.entries(g.subjectAllocations).some(([sec, row]) =>
    Object.entries(row).some(([sub, spec]) => {
      const want = String(spec).split('+').reduce((a, b) => a + (parseInt(b, 10) || 0), 0)
      let got = 0
      for (const day of Object.keys(out.classTT?.[sec] ?? {})) {
        for (const c of Object.values(out.classTT[sec][day] as Any)) {
          if ((c as Any)?.subject === sub) got++
        }
      }
      return got < want
    }))
  if (shortfall) cover('a school that could not be fully staffed')

  const violations = verify(g, out)
  if (violations.length) {
    failedRuns++
    console.log(`✗ seed ${seed} (${g.label}) — ${violations.length} violation(s)`)
    for (const x of violations.slice(0, 6)) console.log(`    ${x.rule}: ${x.detail}`)
    if (violations.length > 6) console.log(`    …and ${violations.length - 6} more`)
    console.log(`   replay: npx tsx engine-stress-verify.mts 1 ${seed}`)
    for (const x of violations) tally.set(x.rule, (tally.get(x.rule) ?? 0) + 1)
  }
}

console.log(`\nsolved ${solved}/${RUNS} · mean ${(totalMs / Math.max(1, solved)).toFixed(0)}ms · slowest ${slowest.ms.toFixed(0)}ms (${slowest.label}, seed ${slowest.seed})`)
if (tally.size) {
  console.log('\nviolations by rule:')
  for (const [rule, n] of [...tally].sort((a, b) => b[1] - a[1])) console.log(`  ${rule.padEnd(28)} ${n}`)
}
// A green run proves nothing unless it actually met the situations it claims
// to cover, so the coverage is asserted rather than merely printed.
const WANTED = [
  'day-off rule matches a real section', 'class teachers named', 'blocked availability',
  'breaks in the day', 'double periods requested', 'a room too small for its class',
  'a one-day week', 'a single-section school', 'demand beyond capacity',
  'a school that could not be fully staffed', 'parallel groups (OR/AND blocks)',
  'a block pooled across sections', 'an OR choice block', 'an AND split block',
]
console.log('')
console.log('situations exercised:')
const missed: string[] = []
for (const w of WANTED) {
  const n = covered.get(w) ?? 0
  console.log('  ' + (n ? 'PASS' : 'MISS') + ' ' + w.padEnd(40) + n)
  if (!n) missed.push(w)
}
if (missed.length) {
  console.log('')
  console.log(missed.length + ' situation(s) never generated — raise the run count or fix the generator')
}

const bad = failedRuns > 0 || missed.length > 0
console.log('')
console.log(bad
  ? failedRuns + ' OF ' + RUNS + ' SCHOOLS FAILED' + (missed.length ? ' · ' + missed.length + ' situation(s) untested' : '')
  : 'ALL ' + RUNS + ' GENERATED SCHOOLS PASSED')
process.exit(bad ? 1 : 0)
