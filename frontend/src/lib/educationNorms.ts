/**
 * Education norms knowledge base — national policy on instructional time
 * (students, grade-wise) and safe teaching load (faculty), per country and
 * board. This powers:
 *
 *   1. Bell-timing compliance: after the bell is set, each grade band's weekly
 *      instructional time is checked against the national norm.
 *   2. Auto-allocation: subject periods/week are suggested per grade band from
 *      curriculum weightings, filling the section's real weekly slot count.
 *   3. Teacher requirement: total demand vs safe per-teacher load → "you need
 *      ~N more teachers" recommendation before generation.
 *
 * Sources (verified July 2026 — figures are statutory where marked, typical
 * guidance otherwise):
 *   IN  RTE Act 2009: Classes 1–5 → 800 instructional h/yr over ≥200 days;
 *       Classes 6–8 → 1000 h/yr over ≥220 days; teachers minimum 45 h/wk
 *       including preparation. NCTE 2014: max 36 teaching periods/wk.
 *       CBSE/NCF guidance: ~40–48 period week, 35–45 min periods.
 *   GB  STPCD: 1265 directed hours over 195 days/yr; DfE expectation of a
 *       32.5-hour school week (Mon–Fri); PPA ≥10% of timetabled teaching.
 *   US  State-set: most states ≈180 days/yr; instructional hours typically
 *       ~900 h (elementary) to ~990–1080 h (secondary) — varies by state.
 *   AU  VIC: face-to-face teaching ≤22.5 h/wk (primary), ≤20 h/wk
 *       (secondary); NSW secondary ≈20 h/wk. ~200 school days/yr.
 *   Others (AE/SG/DE/NG…): see lib/standardsDB.ts (teacher-side norms with
 *       official links); the INTL default below applies student-side.
 */

// ── Grade banding ──────────────────────────────────────────────────────────
export type GradeBand = 'prePrimary' | 'lowerPrimary' | 'upperPrimary' | 'secondary' | 'seniorSecondary'

export const BAND_LABELS: Record<GradeBand, string> = {
  prePrimary: 'Pre-Primary (Nursery–UKG / K)',
  lowerPrimary: 'Primary (I–V / Grades 1–5)',
  upperPrimary: 'Middle (VI–VIII / Grades 6–8)',
  secondary: 'Secondary (IX–X / Grades 9–10)',
  seniorSecondary: 'Senior Secondary (XI–XII / Grades 11–12)',
}

const ROMAN: Record<string, number> = {
  i: 1, ii: 2, iii: 3, iv: 4, v: 5, vi: 6, vii: 7, viii: 8,
  ix: 9, x: 10, xi: 11, xii: 12,
}

/** Grade band from a section/grade name: "Nursery-A"→prePrimary, "VI-B"→upperPrimary, "Grade 9"→secondary. */
export function bandForSection(name: string): GradeBand {
  const n = (name || '').trim().toLowerCase()
  if (/^(nur|lkg|ukg|kg|pre|prep|kinder)/.test(n)) return 'prePrimary'
  // Strip "Grade"/"Class"/"Std" whether glued ("Grade3") or a separate word
  // ("Grade 3"), then read the first remaining token.
  const stripped = n.replace(/^(grade|class|std|standard)\.?[\s\-–]*/, '')
  const first = stripped.split(/[\s\-–]/)[0] || n
  const num = ROMAN[first] ?? parseInt(first, 10)
  if (!Number.isFinite(num)) return 'upperPrimary' // unknown → safe middle default
  if (num <= 0) return 'prePrimary'
  if (num <= 5) return 'lowerPrimary'
  if (num <= 8) return 'upperPrimary'
  if (num <= 10) return 'secondary'
  return 'seniorSecondary'
}

// ── Student-side norms ─────────────────────────────────────────────────────
export interface StudentNorm {
  /** Minimum instructional hours per academic year (statutory where noted). */
  instructionalHoursYear: number
  /** Minimum school days per year. */
  schoolDaysYear: number
  /** Typical teaching periods per day for this band. */
  periodsPerDayTypical: number
  /** Typical period length (minutes). */
  periodMinutesTypical: number
  /** Statutory (law/regulation) vs typical guidance. */
  statutory: boolean
  source: string
}

type BandNorms = Record<GradeBand, StudentNorm>

const IN_BANDS: BandNorms = {
  prePrimary: {
    instructionalHoursYear: 600, schoolDaysYear: 200, periodsPerDayTypical: 5,
    periodMinutesTypical: 35, statutory: false,
    source: 'NCF-FS 2022 guidance (~3h instruction/day for foundational stage)',
  },
  lowerPrimary: {
    instructionalHoursYear: 800, schoolDaysYear: 200, periodsPerDayTypical: 6,
    periodMinutesTypical: 40, statutory: true,
    source: 'RTE Act 2009 Schedule: 800 instructional h/yr, ≥200 days (Classes I–V)',
  },
  upperPrimary: {
    instructionalHoursYear: 1000, schoolDaysYear: 220, periodsPerDayTypical: 7,
    periodMinutesTypical: 40, statutory: true,
    source: 'RTE Act 2009 Schedule: 1000 instructional h/yr, ≥220 days (Classes VI–VIII)',
  },
  secondary: {
    instructionalHoursYear: 1000, schoolDaysYear: 220, periodsPerDayTypical: 8,
    periodMinutesTypical: 40, statutory: false,
    source: 'CBSE/NCF guidance (RTE covers I–VIII; boards mirror ~1000+ h/yr for IX–X)',
  },
  seniorSecondary: {
    instructionalHoursYear: 1000, schoolDaysYear: 220, periodsPerDayTypical: 8,
    periodMinutesTypical: 40, statutory: false,
    source: 'CBSE/NCF guidance for XI–XII (stream-dependent; labs add practical hours)',
  },
}

const STUDENT_NORMS: Record<string, { label: string; bands: BandNorms }> = {
  IN: { label: 'India (RTE/NCTE/NCF)', bands: IN_BANDS },
  // CBSE and ICSE follow the same statutory floor (RTE) with board-specific
  // curricula; period weights differ (see SUBJECT_WEIGHTS), hour norms align.
  'IN-CBSE': { label: 'India — CBSE', bands: IN_BANDS },
  'IN-ICSE': { label: 'India — CISCE (ICSE/ISC)', bands: IN_BANDS },
  'IN-STATE': { label: 'India — State Board', bands: IN_BANDS },
  GB: {
    label: 'England (DfE/STPCD)',
    bands: {
      prePrimary: { instructionalHoursYear: 594, schoolDaysYear: 190, periodsPerDayTypical: 5, periodMinutesTypical: 45, statutory: false, source: 'EYFS typical (~3.1h/day × 190 days)' },
      lowerPrimary: { instructionalHoursYear: 1235, schoolDaysYear: 190, periodsPerDayTypical: 6, periodMinutesTypical: 55, statutory: false, source: 'DfE 32.5-hour school week expectation × 38 weeks (includes breaks; teaching ≈ 23–25h)' },
      upperPrimary: { instructionalHoursYear: 1235, schoolDaysYear: 190, periodsPerDayTypical: 6, periodMinutesTypical: 55, statutory: false, source: 'DfE 32.5-hour school week expectation (KS2/KS3)' },
      secondary: { instructionalHoursYear: 1235, schoolDaysYear: 190, periodsPerDayTypical: 6, periodMinutesTypical: 60, statutory: false, source: 'DfE 32.5-hour school week (KS4); 190 pupil days' },
      seniorSecondary: { instructionalHoursYear: 1140, schoolDaysYear: 190, periodsPerDayTypical: 6, periodMinutesTypical: 60, statutory: false, source: 'Sixth form typical (study periods reduce contact)' },
    },
  },
  US: {
    label: 'United States (state-set)',
    bands: {
      prePrimary: { instructionalHoursYear: 540, schoolDaysYear: 180, periodsPerDayTypical: 5, periodMinutesTypical: 40, statutory: false, source: 'Half-day K typical; states vary widely' },
      lowerPrimary: { instructionalHoursYear: 900, schoolDaysYear: 180, periodsPerDayTypical: 6, periodMinutesTypical: 50, statutory: false, source: 'Typical state minimum ≈900 h/yr, 180 days (e.g. PA 900h elementary); varies by state' },
      upperPrimary: { instructionalHoursYear: 990, schoolDaysYear: 180, periodsPerDayTypical: 7, periodMinutesTypical: 50, statutory: false, source: 'Typical state minimum ≈990 h/yr (middle school); varies by state' },
      secondary: { instructionalHoursYear: 990, schoolDaysYear: 180, periodsPerDayTypical: 7, periodMinutesTypical: 50, statutory: false, source: 'Typical state minimum ≈990–1080 h/yr (e.g. PA 990h secondary); varies by state' },
      seniorSecondary: { instructionalHoursYear: 990, schoolDaysYear: 180, periodsPerDayTypical: 7, periodMinutesTypical: 50, statutory: false, source: 'High school; Carnegie-unit credit hours govern graduation' },
    },
  },
  AU: {
    label: 'Australia (state EAs)',
    bands: {
      prePrimary: { instructionalHoursYear: 600, schoolDaysYear: 200, periodsPerDayTypical: 5, periodMinutesTypical: 45, statutory: false, source: 'Foundation year typical' },
      lowerPrimary: { instructionalHoursYear: 1000, schoolDaysYear: 200, periodsPerDayTypical: 5, periodMinutesTypical: 60, statutory: false, source: '≈25 h instruction/wk × 40 wks (state curricula)' },
      upperPrimary: { instructionalHoursYear: 1000, schoolDaysYear: 200, periodsPerDayTypical: 5, periodMinutesTypical: 60, statutory: false, source: '≈25 h instruction/wk (Years 5–8)' },
      secondary: { instructionalHoursYear: 1000, schoolDaysYear: 200, periodsPerDayTypical: 5, periodMinutesTypical: 60, statutory: false, source: '≈25 h instruction/wk (Years 9–10)' },
      seniorSecondary: { instructionalHoursYear: 960, schoolDaysYear: 200, periodsPerDayTypical: 5, periodMinutesTypical: 60, statutory: false, source: 'Years 11–12 (VCE/HSC study periods reduce contact)' },
    },
  },
  INTL: {
    label: 'International default',
    bands: {
      prePrimary: { instructionalHoursYear: 600, schoolDaysYear: 190, periodsPerDayTypical: 5, periodMinutesTypical: 40, statutory: false, source: 'OECD typical range' },
      lowerPrimary: { instructionalHoursYear: 800, schoolDaysYear: 190, periodsPerDayTypical: 6, periodMinutesTypical: 45, statutory: false, source: 'OECD average ≈ 800 h/yr primary' },
      upperPrimary: { instructionalHoursYear: 900, schoolDaysYear: 190, periodsPerDayTypical: 7, periodMinutesTypical: 45, statutory: false, source: 'OECD average ≈ 900 h/yr lower-secondary' },
      secondary: { instructionalHoursYear: 950, schoolDaysYear: 190, periodsPerDayTypical: 7, periodMinutesTypical: 45, statutory: false, source: 'OECD typical upper-secondary' },
      seniorSecondary: { instructionalHoursYear: 950, schoolDaysYear: 190, periodsPerDayTypical: 7, periodMinutesTypical: 45, statutory: false, source: 'OECD typical upper-secondary' },
    },
  },
}

/** Resolve student norms for a country (+ optional board, e.g. 'CBSE'/'ICSE'). */
export function studentNorms(country: string, board?: string): { label: string; bands: BandNorms } {
  const c = (country || '').toUpperCase()
  const b = (board || '').toUpperCase().replace(/[^A-Z]/g, '')
  if (c === 'IN' && b && STUDENT_NORMS[`IN-${b}`]) return STUDENT_NORMS[`IN-${b}`]
  return STUDENT_NORMS[c] ?? STUDENT_NORMS.INTL
}

// ── Teacher-side norms (safe load) ─────────────────────────────────────────
export interface TeacherNorm {
  /** Safe maximum TEACHING periods per week the planner should assign. */
  safeMaxPeriodsWeek: number
  /** Absolute regulatory ceiling (never plan up to this). */
  hardMaxPeriodsWeek: number
  source: string
}

const TEACHER_NORMS: Record<string, TeacherNorm> = {
  IN: {
    safeMaxPeriodsWeek: 30, hardMaxPeriodsWeek: 36,
    source: 'NCTE 2014: ≤36 teaching periods/wk; RTE: 45 h/wk incl. preparation — planning to ~30 keeps prep time real',
  },
  GB: {
    safeMaxPeriodsWeek: 22, hardMaxPeriodsWeek: 25,
    source: 'STPCD 1265 directed h/195 days with ≥10% PPA — ≈22 hour-periods teaching/wk is a sustainable plan',
  },
  US: {
    safeMaxPeriodsWeek: 25, hardMaxPeriodsWeek: 30,
    source: 'Typical US secondary load: 5 teaching periods/day with 1 planning period',
  },
  AU: {
    safeMaxPeriodsWeek: 20, hardMaxPeriodsWeek: 22,
    source: 'VIC: ≤22.5 h face-to-face (primary), ≤20 h (secondary); NSW secondary ≈20 h/wk',
  },
  INTL: {
    safeMaxPeriodsWeek: 26, hardMaxPeriodsWeek: 30,
    source: 'OECD average teaching time band',
  },
}

export function teacherNorms(country: string): TeacherNorm {
  return TEACHER_NORMS[(country || '').toUpperCase()] ?? TEACHER_NORMS.INTL
}

// ── Curriculum subject weightings (auto-allocation) ────────────────────────
// Fraction of the weekly grid each subject family should get, per band.
// India weights follow CBSE/NCF guidance (languages-heavy early, streams late);
// the generic set serves other countries. Weights are normalised at use time,
// so they only need to be proportional.
type WeightRule = { match: RegExp; weight: number }

const IN_WEIGHTS: Record<GradeBand, WeightRule[]> = {
  prePrimary: [
    { match: /english|language|literacy/i, weight: 25 },
    { match: /hindi|regional|odia|second/i, weight: 15 },
    { match: /math|number/i, weight: 20 },
    { match: /evs|environment|science|gk|general/i, weight: 12 },
    { match: /art|craft|drawing|music|dance|rhyme/i, weight: 16 },
    { match: /physical|pe|games|sport|yoga/i, weight: 12 },
  ],
  lowerPrimary: [
    { match: /english/i, weight: 20 },
    { match: /hindi|regional|odia|sanskrit|second|third/i, weight: 18 },
    { match: /math/i, weight: 20 },
    { match: /evs|environment|science/i, weight: 14 },
    { match: /social|sst/i, weight: 8 },
    { match: /computer|ict/i, weight: 5 },
    { match: /art|craft|music|dance/i, weight: 7 },
    { match: /physical|pe|games|sport|yoga/i, weight: 8 },
  ],
  upperPrimary: [
    { match: /english/i, weight: 17 },
    { match: /hindi|regional|odia|sanskrit|second|third/i, weight: 17 },
    { match: /math/i, weight: 17 },
    { match: /science/i, weight: 15 },
    { match: /social|sst|history|geograph|civics/i, weight: 15 },
    { match: /computer|ict/i, weight: 6 },
    { match: /art|craft|music/i, weight: 6 },
    { match: /physical|pe|games|sport/i, weight: 7 },
  ],
  secondary: [
    { match: /english/i, weight: 17 },
    { match: /hindi|regional|odia|sanskrit|second/i, weight: 15 },
    { match: /math/i, weight: 18 },
    { match: /science|physics|chemistry|biology/i, weight: 18 },
    { match: /social|sst|history|geograph|civics|econom/i, weight: 17 },
    { match: /computer|ict/i, weight: 6 },
    { match: /physical|pe|games|sport|art|music/i, weight: 9 },
  ],
  seniorSecondary: [
    { match: /english|language/i, weight: 15 },
    { match: /physics|chemistry|math|biology|accountanc|business|econom|history|geograph|political|sociolog|psycholog/i, weight: 18 },
    { match: /computer|informatics/i, weight: 12 },
    { match: /physical|pe|games/i, weight: 6 },
  ],
}

const GENERIC_WEIGHTS: Record<GradeBand, WeightRule[]> = {
  prePrimary: IN_WEIGHTS.prePrimary,
  lowerPrimary: [
    { match: /english|language|literacy/i, weight: 25 },
    { match: /math/i, weight: 22 },
    { match: /science/i, weight: 14 },
    { match: /social|history|geograph/i, weight: 12 },
    { match: /computer|ict|technolog/i, weight: 7 },
    { match: /art|music|drama/i, weight: 10 },
    { match: /physical|pe|sport|health/i, weight: 10 },
  ],
  upperPrimary: [
    { match: /english|language/i, weight: 20 },
    { match: /math/i, weight: 20 },
    { match: /science/i, weight: 17 },
    { match: /social|history|geograph|civics/i, weight: 15 },
    { match: /computer|ict|technolog/i, weight: 9 },
    { match: /art|music|drama/i, weight: 9 },
    { match: /physical|pe|sport|health/i, weight: 10 },
  ],
  secondary: [
    { match: /english|language/i, weight: 19 },
    { match: /math/i, weight: 19 },
    { match: /science|physics|chemistry|biology/i, weight: 20 },
    { match: /social|history|geograph|econom/i, weight: 16 },
    { match: /computer|ict|technolog/i, weight: 9 },
    { match: /art|music/i, weight: 7 },
    { match: /physical|pe|sport/i, weight: 10 },
  ],
  seniorSecondary: IN_WEIGHTS.seniorSecondary,
}

function weightFor(subjectName: string, band: GradeBand, country: string): number {
  const rules = ((country || '').toUpperCase() === 'IN' ? IN_WEIGHTS : GENERIC_WEIGHTS)[band]
  for (const r of rules) if (r.match.test(subjectName)) return r.weight
  return 5 // unrecognised subject — small but present
}

/**
 * Suggest periods/week per subject for one section, norms-weighted, summing to
 * EXACTLY `weeklySlots` (the section's real bell capacity). Largest-remainder
 * rounding; every subject gets ≥1 period.
 */
export function suggestAllocation(
  sectionName: string, subjectNames: string[], weeklySlots: number,
  country: string, _board?: string,
): Record<string, number> {
  const band = bandForSection(sectionName)
  const out: Record<string, number> = {}
  const names = subjectNames.filter(Boolean)
  if (!names.length || weeklySlots <= 0) return out
  if (weeklySlots <= names.length) {
    names.forEach((n, i) => { out[n] = i < weeklySlots ? 1 : 0 })
    return out
  }
  const weights = names.map(n => weightFor(n, band, country))
  const totalW = weights.reduce((a, b) => a + b, 0)
  const raw = names.map((_, i) => (weights[i] / totalW) * weeklySlots)
  const base = raw.map(x => Math.max(1, Math.floor(x)))
  let used = base.reduce((a, b) => a + b, 0)
  // distribute the remainder to the largest fractional parts (stable order)
  const order = raw.map((x, i) => ({ i, frac: x - Math.floor(x) })).sort((a, b) => b.frac - a.frac)
  let k = 0
  while (used < weeklySlots && k < order.length * 3) {
    base[order[k % order.length].i]++
    used++; k++
  }
  while (used > weeklySlots) { // over from the ≥1 floors — trim the largest
    const maxI = base.indexOf(Math.max(...base))
    if (base[maxI] <= 1) break
    base[maxI]--; used--
  }
  names.forEach((n, i) => { out[n] = base[i] })
  return out
}

// ── Bell-timing compliance ─────────────────────────────────────────────────
export interface BellCompliance {
  band: GradeBand
  bandLabel: string
  weeklyInstructionalMins: number
  yearlyHoursProjected: number
  normHoursYear: number
  status: 'ok' | 'short' | 'high'
  statutory: boolean
  message: string
  source: string
}

/**
 * Check one grade band's bell against the national instructional-hours norm.
 * `weeklyTeachingMins` = periods/day × period minutes × workdays for that band.
 */
export function checkBellCompliance(
  country: string, board: string | undefined, band: GradeBand,
  weeklyTeachingMins: number, schoolDaysYear?: number,
): BellCompliance {
  const norms = studentNorms(country, board)
  const n = norms.bands[band]
  const days = schoolDaysYear ?? n.schoolDaysYear
  const weeks = days / 5.5 // between 5- and 6-day weeks; conservative
  const yearlyHours = (weeklyTeachingMins / 60) * weeks
  const ratio = yearlyHours / n.instructionalHoursYear
  const status: BellCompliance['status'] = ratio < 0.92 ? 'short' : ratio > 1.35 ? 'high' : 'ok'
  const message =
    status === 'short'
      ? `${BAND_LABELS[band]} is projected at ~${Math.round(yearlyHours)} h/yr — below the ${n.instructionalHoursYear} h/yr ${n.statutory ? 'statutory minimum' : 'guideline'} (${norms.label}). Add periods or minutes.`
      : status === 'high'
        ? `${BAND_LABELS[band]} is projected at ~${Math.round(yearlyHours)} h/yr — well above the ${n.instructionalHoursYear} h/yr norm; check the day isn't overloaded for this age group.`
        : `${BAND_LABELS[band]} meets the ${n.instructionalHoursYear} h/yr ${n.statutory ? 'statutory minimum' : 'guideline'} (~${Math.round(yearlyHours)} h/yr projected).`
  return {
    band, bandLabel: BAND_LABELS[band],
    weeklyInstructionalMins: weeklyTeachingMins,
    yearlyHoursProjected: Math.round(yearlyHours),
    normHoursYear: n.instructionalHoursYear,
    status, statutory: n.statutory, message, source: n.source,
  }
}

// ── Teacher requirement (staffing alert) ───────────────────────────────────
export interface TeacherRequirement {
  demandPeriodsWeek: number
  teacherCount: number
  safeMaxPerTeacher: number
  hardMaxPerTeacher: number
  safeCapacity: number
  teachersNeeded: number       // at safe load
  additionalTeachers: number   // max(0, needed - have)
  utilization: number          // demand / safeCapacity
  status: 'ok' | 'tight' | 'over'
  message: string
  source: string
}

/**
 * Compare total weekly period demand against the staff's SAFE capacity per
 * national workload norms. `over` means the plan forces teachers beyond the
 * safe load — recommend hiring; `tight` means >90% utilisation.
 */
export function computeTeacherRequirement(
  demandPeriodsWeek: number, teacherCount: number, country: string,
): TeacherRequirement {
  const n = teacherNorms(country)
  const safeCapacity = teacherCount * n.safeMaxPeriodsWeek
  const teachersNeeded = Math.ceil(demandPeriodsWeek / Math.max(1, n.safeMaxPeriodsWeek))
  const additionalTeachers = Math.max(0, teachersNeeded - teacherCount)
  const utilization = safeCapacity > 0 ? demandPeriodsWeek / safeCapacity : Infinity
  const status: TeacherRequirement['status'] = utilization > 1 ? 'over' : utilization > 0.9 ? 'tight' : 'ok'
  const message =
    status === 'over'
      ? `Your plan needs ${demandPeriodsWeek} periods/week but ${teacherCount} teacher${teacherCount === 1 ? '' : 's'} can safely cover ${safeCapacity} (at ${n.safeMaxPeriodsWeek}/week each). Recommend adding ~${additionalTeachers} teacher${additionalTeachers === 1 ? '' : 's'} to stay within the safe workload.`
      : status === 'tight'
        ? `Staffing is tight: ${demandPeriodsWeek} of ${safeCapacity} safe periods/week used (${Math.round(utilization * 100)}%). One absence will strain coverage — consider one more teacher.`
        : `Staffing is healthy: ${demandPeriodsWeek} of ${safeCapacity} safe periods/week used (${Math.round(utilization * 100)}%).`
  return {
    demandPeriodsWeek, teacherCount,
    safeMaxPerTeacher: n.safeMaxPeriodsWeek, hardMaxPerTeacher: n.hardMaxPeriodsWeek,
    safeCapacity, teachersNeeded, additionalTeachers, utilization, status, message,
    source: n.source,
  }
}
