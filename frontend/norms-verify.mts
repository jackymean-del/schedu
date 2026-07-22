/**
 * Education-norms verification — banding, allocation math, bell compliance,
 * and the teacher-requirement alert. Run: npx tsx norms-verify.mts
 */
import {
  bandForSection, studentNorms, teacherNorms, suggestAllocation,
  checkBellCompliance, computeTeacherRequirement, regionForCountry,
} from './src/lib/educationNorms.ts'
import { ALL_COUNTRIES } from './src/lib/allCountries.ts'

let failures = 0
const check = (ok: boolean, label: string, extra = '') => {
  console.log(`${ok ? '✓' : '✗'} ${label}${extra ? ' — ' + extra : ''}`)
  if (!ok) failures++
}

// ── Banding ────────────────────────────────────────────────────────────────
const bandCases: [string, string][] = [
  ['Nursery-A', 'prePrimary'], ['LKG-B', 'prePrimary'], ['UKG', 'prePrimary'], ['KG-1', 'prePrimary'],
  ['I-A', 'lowerPrimary'], ['V-B', 'lowerPrimary'], ['Grade 3', 'lowerPrimary'], ['Class 5', 'lowerPrimary'],
  ['VI-A', 'upperPrimary'], ['VIII-C', 'upperPrimary'], ['Grade 7', 'upperPrimary'],
  ['IX-A', 'secondary'], ['X-B', 'secondary'], ['Grade 10', 'secondary'],
  ['XI-Sci-A', 'seniorSecondary'], ['XII-Com', 'seniorSecondary'], ['Grade 12', 'seniorSecondary'],
]
let bandBad = 0
for (const [name, want] of bandCases) if (bandForSection(name) !== want) { bandBad++; console.log(`  ✗ ${name} → ${bandForSection(name)} (want ${want})`) }
check(bandBad === 0, `banding: ${bandCases.length - bandBad}/${bandCases.length} section names classified`)

// ── Norms lookups ──────────────────────────────────────────────────────────
const inLower = studentNorms('IN', 'CBSE').bands.lowerPrimary
check(inLower.instructionalHoursYear === 800 && inLower.schoolDaysYear === 200 && inLower.statutory,
  'India I–V norm = RTE 800 h/yr · 200 days · statutory')
const inUpper = studentNorms('IN').bands.upperPrimary
check(inUpper.instructionalHoursYear === 1000 && inUpper.schoolDaysYear === 220,
  'India VI–VIII norm = RTE 1000 h/yr · 220 days')
check(teacherNorms('IN').hardMaxPeriodsWeek === 36, 'India teacher hard max = NCTE 36 periods/wk')
check(teacherNorms('AU').safeMaxPeriodsWeek === 20, 'Australia safe load = 20 (VIC/NSW secondary face-to-face)')
check(studentNorms('ZZ').label.includes('International'), 'unknown country falls back to international default')
check(studentNorms('IN', 'ICSE').label.includes('CISCE'), 'ICSE board resolves to CISCE entry')

// ── Allocation suggestion ──────────────────────────────────────────────────
const subjects = ['English', 'Hindi', 'Mathematics', 'Science', 'Social Studies', 'Computer', 'Art', 'Physical Education']
for (const [sec, slots] of [['III-A', 42], ['VII-B', 45], ['X-A', 48]] as const) {
  const alloc = suggestAllocation(sec, subjects, slots, 'IN', 'CBSE')
  const total = Object.values(alloc).reduce((a, b) => a + b, 0)
  const allPositive = Object.values(alloc).every(v => v >= 1)
  const mathsHeavy = alloc['Mathematics'] >= alloc['Art']
  check(total === slots, `allocation(${sec}) sums to exactly ${slots}`, JSON.stringify(alloc))
  check(allPositive, `allocation(${sec}) gives every subject ≥1 period`)
  check(mathsHeavy, `allocation(${sec}) weights Mathematics ≥ Art (norms-weighted)`)
}
// degenerate: fewer slots than subjects
const tiny = suggestAllocation('II-A', subjects, 5, 'IN')
check(Object.values(tiny).reduce((a, b) => a + b, 0) === 5, 'allocation degenerate (5 slots, 8 subjects) sums to 5')

// ── Bell compliance ────────────────────────────────────────────────────────
// India I–V: 6×40min×6days = 1440 min/wk → ~873 h/yr over 200 days → OK vs 800
const ok = checkBellCompliance('IN', 'CBSE', 'lowerPrimary', 6 * 40 * 6, 200)
check(ok.status === 'ok', 'bell OK: I–V @ 6×40×6d meets RTE 800h', `${ok.yearlyHoursProjected}h projected`)
// Short: 4 periods × 35 min × 5 days = 700 min/wk → ~424h vs 800 → short
const short = checkBellCompliance('IN', undefined, 'lowerPrimary', 4 * 35 * 5, 200)
check(short.status === 'short' && short.statutory, 'bell SHORT flagged vs statutory RTE floor', short.message.slice(0, 60) + '…')
// England secondary 6×60×5 = 1800min/wk → ~1036h vs 1235 guideline → below but non-statutory still 'short'
const gb = checkBellCompliance('GB', undefined, 'secondary', 6 * 60 * 5, 190)
check(gb.statutory === false, 'England norm marked as guidance (not statutory)')

// ── Teacher requirement ────────────────────────────────────────────────────
// India: 30 sections × 42 periods = 1260 demand. 48 teachers × 30 safe = 1440 → ok
const r1 = computeTeacherRequirement(1260, 48, 'IN')
check(r1.status === 'ok' && r1.additionalTeachers === 0, 'staffing OK: 1260 demand vs 1440 safe capacity', `${Math.round(r1.utilization * 100)}%`)
// Over: 1260 demand with 35 teachers → capacity 1050 → need 42 → +7
const r2 = computeTeacherRequirement(1260, 35, 'IN')
check(r2.status === 'over' && r2.teachersNeeded === 42 && r2.additionalTeachers === 7,
  'staffing OVER: recommends +7 teachers', r2.message.slice(0, 80) + '…')
// Tight: 95% utilisation
const r3 = computeTeacherRequirement(1260, 45, 'IN') // capacity 1350 → 93%
check(r3.status === 'tight', 'staffing TIGHT flagged above 90% utilisation', `${Math.round(r3.utilization * 100)}%`)
// Australia stricter: same demand needs more teachers (safe 20)
const r4 = computeTeacherRequirement(1260, 48, 'AU')
check(r4.teachersNeeded === 63 && r4.status === 'over', 'Australia norms need 63 teachers for same demand (safe load 20)')

// ── Global coverage: EVERY supported country resolves to a real norm ───────
const explicit = new Set(['IN', 'GB', 'US', 'AU'])
let uncovered = 0
const badBands: string[] = []
for (const { code } of ALL_COUNTRIES) {
  const sn = studentNorms(code)
  const tn = teacherNorms(code)
  // Every band must have positive hours + days, teacher caps must be sane
  const bandsOk = (['prePrimary', 'lowerPrimary', 'upperPrimary', 'secondary', 'seniorSecondary'] as const)
    .every(bd => sn.bands[bd].instructionalHoursYear > 0 && sn.bands[bd].schoolDaysYear > 0)
  const teacherOk = tn.safeMaxPeriodsWeek > 0 && tn.hardMaxPeriodsWeek >= tn.safeMaxPeriodsWeek
  if (!bandsOk || !teacherOk) badBands.push(code)
  // Non-explicit countries should hit a region, not the flat international default
  if (!explicit.has(code) && !regionForCountry(code)) uncovered++
}
check(badBands.length === 0, `every country returns valid student+teacher norms (${ALL_COUNTRIES.length} countries)`, badBands.length ? `bad: ${badBands.join(',')}` : 'all valid')
check(uncovered === 0, `every non-explicit country maps to a REGION (not flat default)`, uncovered ? `${uncovered} fell through to INTL` : `${ALL_COUNTRIES.length - explicit.size} region-mapped`)
// Spot-check a few regions resolve sensibly
check(studentNorms('JP').label.includes('East Asia'), 'Japan → East Asia region norm')
check(studentNorms('BD').label.includes('South Asia'), 'Bangladesh → South Asia region norm')
check(studentNorms('SA').label.includes('Gulf'), 'Saudi Arabia → Gulf region norm')
check(studentNorms('SE').label.includes('Nordic'), 'Sweden → Nordic region norm')
check(studentNorms('NG').label.includes('Sub-Saharan'), 'Nigeria → Sub-Saharan region norm')
check(studentNorms('BR').label.includes('Latin'), 'Brazil → Latin America region norm')
check(teacherNorms('SA').safeMaxPeriodsWeek === 24, 'Saudi Arabia safe load = Gulf 24/wk')

console.log(failures === 0 ? '\nALL NORMS CHECKS PASSED' : `\n${failures} FAILURES`)
process.exit(failures === 0 ? 0 : 1)
