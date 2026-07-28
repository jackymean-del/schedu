/**
 * Country-wise hours reference — Blueprint v5, Step 0
 * ("Country-wise Allocation Automation").
 *
 * Generated from Country_Education_Hours_Reference.xlsx (OECD *Education at a
 * Glance* plus country-specific norms for India, China, Singapore, Indonesia).
 * ~40 systems where comparable, current, officially-sourced figures actually
 * exist — deliberately NOT all 190+ countries, because inventing numbers for
 * systems with no public data would be worse than admitting the gap.
 *
 * Two things to understand before using these numbers:
 *
 * 1. WEEKLY MEANS TERM-TIME. Student hrs/wk are annual hours ÷ that country's
 *    weeks actually in session (OECD average 38), NOT ÷ 52 — dividing by 52
 *    would understate the real weekly load by roughly a quarter.
 *
 * 2. TEACHER HOURS ARE NOT ALL THE SAME MEASURE. The OECD columns are net
 *    TEACHING (contact) hours. India's figure (~1,600 h/yr per RTE) is TOTAL
 *    working time including preparation. Mixing them would be a serious error —
 *    1,600 h/yr ÷ 40 weeks = 40 h/wk, which as a *teaching* cap would imply ~60
 *    periods/week. So each row carries `teacherBasis`, and callers must not use
 *    a 'total' figure as a teaching cap (see effectiveTeacherHoursWeek below).
 */

/** Which measure the teacher figure represents. */
export type TeacherBasis = 'teaching' | 'total'

/** How much the figure can be trusted (Blueprint v5: confidence tiers). */
export type Confidence = 'verified' | 'approximate'

/** School levels the reference dataset reports. */
export type RefLevel = 'primary' | 'lowerSec' | 'upperSec'

export interface CountryHours {
  /** ISO-3166 alpha-2 (or 'OECD' for the average row). */
  code: string
  iso3: string
  name: string
  daysPerWeek: number
  /** Weeks actually in session per year — the divisor behind hrs/wk. */
  weeksPerYear: number
  prePrimaryStudentHoursYear: number
  /** Student instructional hours per TERM-TIME week. */
  studentHoursWeek: Record<RefLevel, number>
  /** Teacher hours per year — see teacherBasis before using. */
  teacherHoursYear: Record<RefLevel, number>
  teacherBasis: TeacherBasis
  confidence: Confidence
  sourceNote: string
}

export const COUNTRY_HOURS: CountryHours[] = [
  { code: 'OECD', iso3: 'OCD', name: 'OECD average', daysPerWeek: 5, weeksPerYear: 38,
    prePrimaryStudentHoursYear: 500,
    studentHoursWeek: { primary: 21.2, lowerSec: 24.1, upperSec: 23.7 },
    teacherHoursYear: { primary: 780, lowerSec: 700, upperSec: 660 },
    teacherBasis: 'teaching', confidence: 'verified', sourceNote: 'Verified' },
  { code: 'AU', iso3: 'AUS', name: 'Australia', daysPerWeek: 5, weeksPerYear: 40,
    prePrimaryStudentHoursYear: 600,
    studentHoursWeek: { primary: 25, lowerSec: 25, upperSec: 25 },
    teacherHoursYear: { primary: 870, lowerSec: 870, upperSec: 800 },
    teacherBasis: 'teaching', confidence: 'approximate', sourceNote: 'Approximate' },
  { code: 'AT', iso3: 'AUT', name: 'Austria', daysPerWeek: 5, weeksPerYear: 38,
    prePrimaryStudentHoursYear: 600,
    studentHoursWeek: { primary: 18.7, lowerSec: 21.9, upperSec: 22.4 },
    teacherHoursYear: { primary: 779, lowerSec: 589, upperSec: 550 },
    teacherBasis: 'teaching', confidence: 'approximate', sourceNote: 'Approximate' },
  { code: 'BE', iso3: 'BEL', name: 'Belgium', daysPerWeek: 5, weeksPerYear: 37,
    prePrimaryStudentHoursYear: 700,
    studentHoursWeek: { primary: 23.8, lowerSec: 25.4, upperSec: 25.9 },
    teacherHoursYear: { primary: 742, lowerSec: 660, upperSec: 620 },
    teacherBasis: 'teaching', confidence: 'approximate', sourceNote: 'Approximate' },
  { code: 'CA', iso3: 'CAN', name: 'Canada', daysPerWeek: 5, weeksPerYear: 38,
    prePrimaryStudentHoursYear: 600,
    studentHoursWeek: { primary: 23.9, lowerSec: 25, upperSec: 25 },
    teacherHoursYear: { primary: 810, lowerSec: 810, upperSec: 810 },
    teacherBasis: 'teaching', confidence: 'approximate', sourceNote: 'Approximate' },
  { code: 'CL', iso3: 'CHL', name: 'Chile', daysPerWeek: 5, weeksPerYear: 40,
    prePrimaryStudentHoursYear: 700,
    studentHoursWeek: { primary: 27.5, lowerSec: 28.4, upperSec: 27.5 },
    teacherHoursYear: { primary: 1049, lowerSec: 900, upperSec: 850 },
    teacherBasis: 'teaching', confidence: 'verified', sourceNote: 'Verified (teacher primary)' },
  { code: 'CR', iso3: 'CRI', name: 'Costa Rica', daysPerWeek: 5, weeksPerYear: 41,
    prePrimaryStudentHoursYear: 650,
    studentHoursWeek: { primary: 19.5, lowerSec: 22, upperSec: 22 },
    teacherHoursYear: { primary: 1134, lowerSec: 1000, upperSec: 950 },
    teacherBasis: 'teaching', confidence: 'verified', sourceNote: 'Verified (teacher working hrs)' },
  { code: 'CZ', iso3: 'CZE', name: 'Czechia', daysPerWeek: 5, weeksPerYear: 38,
    prePrimaryStudentHoursYear: 650,
    studentHoursWeek: { primary: 18.6, lowerSec: 23.1, upperSec: 23.7 },
    teacherHoursYear: { primary: 858, lowerSec: 611, upperSec: 600 },
    teacherBasis: 'teaching', confidence: 'approximate', sourceNote: 'Approximate' },
  { code: 'DK', iso3: 'DNK', name: 'Denmark', daysPerWeek: 5, weeksPerYear: 40,
    prePrimaryStudentHoursYear: 700,
    studentHoursWeek: { primary: 25.5, lowerSec: 26.3, upperSec: 22.5 },
    teacherHoursYear: { primary: 745, lowerSec: 640, upperSec: 630 },
    teacherBasis: 'teaching', confidence: 'approximate', sourceNote: 'Approximate' },
  { code: 'EE', iso3: 'EST', name: 'Estonia', daysPerWeek: 5, weeksPerYear: 35,
    prePrimaryStudentHoursYear: 600,
    studentHoursWeek: { primary: 18, lowerSec: 25.4, upperSec: 25.7 },
    teacherHoursYear: { primary: 623, lowerSec: 586, upperSec: 570 },
    teacherBasis: 'teaching', confidence: 'approximate', sourceNote: 'Approximate' },
  { code: 'FI', iso3: 'FIN', name: 'Finland', daysPerWeek: 5, weeksPerYear: 38,
    prePrimaryStudentHoursYear: 500,
    studentHoursWeek: { primary: 18.2, lowerSec: 21.5, upperSec: 21.1 },
    teacherHoursYear: { primary: 677, lowerSec: 592, upperSec: 580 },
    teacherBasis: 'teaching', confidence: 'verified', sourceNote: 'Verified (student hours)' },
  { code: 'FR', iso3: 'FRA', name: 'France', daysPerWeek: 5, weeksPerYear: 36,
    prePrimaryStudentHoursYear: 900,
    studentHoursWeek: { primary: 24, lowerSec: 27, upperSec: 27.8 },
    teacherHoursYear: { primary: 918, lowerSec: 648, upperSec: 630 },
    teacherBasis: 'teaching', confidence: 'verified', sourceNote: 'Verified (student hours)' },
  { code: 'DE', iso3: 'DEU', name: 'Germany', daysPerWeek: 5, weeksPerYear: 38,
    prePrimaryStudentHoursYear: 600,
    studentHoursWeek: { primary: 19.9, lowerSec: 23.2, upperSec: 23.2 },
    teacherHoursYear: { primary: 805, lowerSec: 741, upperSec: 700 },
    teacherBasis: 'teaching', confidence: 'approximate', sourceNote: 'Approximate' },
  { code: 'GR', iso3: 'GRC', name: 'Greece', daysPerWeek: 5, weeksPerYear: 35,
    prePrimaryStudentHoursYear: 600,
    studentHoursWeek: { primary: 19.5, lowerSec: 24.1, upperSec: 24.6 },
    teacherHoursYear: { primary: 589, lowerSec: 604, upperSec: 590 },
    teacherBasis: 'teaching', confidence: 'approximate', sourceNote: 'Approximate' },
  { code: 'HU', iso3: 'HUN', name: 'Hungary', daysPerWeek: 5, weeksPerYear: 37,
    prePrimaryStudentHoursYear: 700,
    studentHoursWeek: { primary: 19.8, lowerSec: 24.4, upperSec: 24.3 },
    teacherHoursYear: { primary: 555, lowerSec: 620, upperSec: 600 },
    teacherBasis: 'teaching', confidence: 'approximate', sourceNote: 'Approximate' },
  { code: 'IS', iso3: 'ISL', name: 'Iceland', daysPerWeek: 5, weeksPerYear: 36,
    prePrimaryStudentHoursYear: 650,
    studentHoursWeek: { primary: 22.2, lowerSec: 24.7, upperSec: 25 },
    teacherHoursYear: { primary: 600, lowerSec: 580, upperSec: 570 },
    teacherBasis: 'teaching', confidence: 'approximate', sourceNote: 'Approximate' },
  { code: 'IE', iso3: 'IRL', name: 'Ireland', daysPerWeek: 5, weeksPerYear: 37,
    prePrimaryStudentHoursYear: 700,
    studentHoursWeek: { primary: 24.7, lowerSec: 24.8, upperSec: 24.3 },
    teacherHoursYear: { primary: 915, lowerSec: 735, upperSec: 700 },
    teacherBasis: 'teaching', confidence: 'approximate', sourceNote: 'Approximate' },
  { code: 'IL', iso3: 'ISR', name: 'Israel', daysPerWeek: 6, weeksPerYear: 41,
    prePrimaryStudentHoursYear: 800,
    studentHoursWeek: { primary: 21.7, lowerSec: 24.8, upperSec: 24.4 },
    teacherHoursYear: { primary: 742, lowerSec: 633, upperSec: 620 },
    teacherBasis: 'teaching', confidence: 'approximate', sourceNote: 'Approximate' },
  { code: 'IT', iso3: 'ITA', name: 'Italy', daysPerWeek: 6, weeksPerYear: 34,
    prePrimaryStudentHoursYear: 800,
    studentHoursWeek: { primary: 26.2, lowerSec: 30.1, upperSec: 29.1 },
    teacherHoursYear: { primary: 941, lowerSec: 700, upperSec: 650 },
    teacherBasis: 'teaching', confidence: 'verified', sourceNote: 'Verified (teacher overall)' },
  { code: 'JP', iso3: 'JPN', name: 'Japan', daysPerWeek: 5, weeksPerYear: 40,
    prePrimaryStudentHoursYear: 700,
    studentHoursWeek: { primary: 17.7, lowerSec: 21.7, upperSec: 21.8 },
    teacherHoursYear: { primary: 834, lowerSec: 610, upperSec: 580 },
    teacherBasis: 'teaching', confidence: 'verified', sourceNote: 'Verified (teacher primary)' },
  { code: 'KR', iso3: 'KOR', name: 'Korea', daysPerWeek: 5, weeksPerYear: 38,
    prePrimaryStudentHoursYear: 600,
    studentHoursWeek: { primary: 17.3, lowerSec: 22.8, upperSec: 23.7 },
    teacherHoursYear: { primary: 749, lowerSec: 570, upperSec: 560 },
    teacherBasis: 'teaching', confidence: 'verified', sourceNote: 'Verified (teacher primary)' },
  { code: 'LV', iso3: 'LVA', name: 'Latvia', daysPerWeek: 5, weeksPerYear: 35,
    prePrimaryStudentHoursYear: 600,
    studentHoursWeek: { primary: 18.9, lowerSec: 25.7, upperSec: 25.7 },
    teacherHoursYear: { primary: 702, lowerSec: 612, upperSec: 600 },
    teacherBasis: 'teaching', confidence: 'approximate', sourceNote: 'Approximate' },
  { code: 'LT', iso3: 'LTU', name: 'Lithuania', daysPerWeek: 5, weeksPerYear: 35,
    prePrimaryStudentHoursYear: 600,
    studentHoursWeek: { primary: 18, lowerSec: 25, upperSec: 25.7 },
    teacherHoursYear: { primary: 616, lowerSec: 570, upperSec: 560 },
    teacherBasis: 'teaching', confidence: 'approximate', sourceNote: 'Approximate' },
  { code: 'LU', iso3: 'LUX', name: 'Luxembourg', daysPerWeek: 5, weeksPerYear: 37,
    prePrimaryStudentHoursYear: 700,
    studentHoursWeek: { primary: 21.6, lowerSec: 24.3, upperSec: 24.3 },
    teacherHoursYear: { primary: 750, lowerSec: 700, upperSec: 680 },
    teacherBasis: 'teaching', confidence: 'approximate', sourceNote: 'Approximate' },
  { code: 'MX', iso3: 'MEX', name: 'Mexico', daysPerWeek: 5, weeksPerYear: 39,
    prePrimaryStudentHoursYear: 700,
    studentHoursWeek: { primary: 20.5, lowerSec: 29.9, upperSec: 29.5 },
    teacherHoursYear: { primary: 800, lowerSec: 1046, upperSec: 1000 },
    teacherBasis: 'teaching', confidence: 'verified', sourceNote: 'Verified (teacher lower sec.)' },
  { code: 'NL', iso3: 'NLD', name: 'Netherlands', daysPerWeek: 5, weeksPerYear: 40,
    prePrimaryStudentHoursYear: 700,
    studentHoursWeek: { primary: 23.5, lowerSec: 25, upperSec: 25 },
    teacherHoursYear: { primary: 930, lowerSec: 750, upperSec: 720 },
    teacherBasis: 'teaching', confidence: 'approximate', sourceNote: 'Approximate' },
  { code: 'NZ', iso3: 'NZL', name: 'New Zealand', daysPerWeek: 5, weeksPerYear: 39,
    prePrimaryStudentHoursYear: 600,
    studentHoursWeek: { primary: 24.4, lowerSec: 25.3, upperSec: 24.4 },
    teacherHoursYear: { primary: 985, lowerSec: 800, upperSec: 780 },
    teacherBasis: 'teaching', confidence: 'approximate', sourceNote: 'Approximate' },
  { code: 'NO', iso3: 'NOR', name: 'Norway', daysPerWeek: 5, weeksPerYear: 38,
    prePrimaryStudentHoursYear: 600,
    studentHoursWeek: { primary: 19.5, lowerSec: 22.9, upperSec: 22.9 },
    teacherHoursYear: { primary: 713, lowerSec: 577, upperSec: 560 },
    teacherBasis: 'teaching', confidence: 'approximate', sourceNote: 'Approximate' },
  { code: 'PL', iso3: 'POL', name: 'Poland', daysPerWeek: 5, weeksPerYear: 36,
    prePrimaryStudentHoursYear: 500,
    studentHoursWeek: { primary: 15.5, lowerSec: 19.4, upperSec: 19.4 },
    teacherHoursYear: { primary: 635, lowerSec: 600, upperSec: 580 },
    teacherBasis: 'teaching', confidence: 'verified', sourceNote: 'Verified (student primary)' },
  { code: 'PT', iso3: 'PRT', name: 'Portugal', daysPerWeek: 5, weeksPerYear: 36,
    prePrimaryStudentHoursYear: 700,
    studentHoursWeek: { primary: 25.4, lowerSec: 28.5, upperSec: 27.8 },
    teacherHoursYear: { primary: 850, lowerSec: 700, upperSec: 680 },
    teacherBasis: 'teaching', confidence: 'approximate', sourceNote: 'Approximate' },
  { code: 'SK', iso3: 'SVK', name: 'Slovak Republic', daysPerWeek: 5, weeksPerYear: 37,
    prePrimaryStudentHoursYear: 600,
    studentHoursWeek: { primary: 17.6, lowerSec: 23, upperSec: 23.8 },
    teacherHoursYear: { primary: 611, lowerSec: 590, upperSec: 570 },
    teacherBasis: 'teaching', confidence: 'approximate', sourceNote: 'Approximate' },
  { code: 'SI', iso3: 'SVN', name: 'Slovenia', daysPerWeek: 5, weeksPerYear: 37,
    prePrimaryStudentHoursYear: 600,
    studentHoursWeek: { primary: 17.3, lowerSec: 24.1, upperSec: 24.1 },
    teacherHoursYear: { primary: 608, lowerSec: 600, upperSec: 580 },
    teacherBasis: 'teaching', confidence: 'approximate', sourceNote: 'Approximate' },
  { code: 'ES', iso3: 'ESP', name: 'Spain', daysPerWeek: 5, weeksPerYear: 36,
    prePrimaryStudentHoursYear: 700,
    studentHoursWeek: { primary: 24.3, lowerSec: 29.2, upperSec: 29.2 },
    teacherHoursYear: { primary: 880, lowerSec: 693, upperSec: 660 },
    teacherBasis: 'teaching', confidence: 'approximate', sourceNote: 'Approximate' },
  { code: 'SE', iso3: 'SWE', name: 'Sweden', daysPerWeek: 5, weeksPerYear: 38,
    prePrimaryStudentHoursYear: 600,
    studentHoursWeek: { primary: 19.5, lowerSec: 23.7, upperSec: 23.7 },
    teacherHoursYear: { primary: 700, lowerSec: 600, upperSec: 600 },
    teacherBasis: 'teaching', confidence: 'approximate', sourceNote: 'Approximate' },
  { code: 'CH', iso3: 'CHE', name: 'Switzerland', daysPerWeek: 5, weeksPerYear: 38,
    prePrimaryStudentHoursYear: 700,
    studentHoursWeek: { primary: 21.1, lowerSec: 23.7, upperSec: 23.7 },
    teacherHoursYear: { primary: 810, lowerSec: 700, upperSec: 680 },
    teacherBasis: 'teaching', confidence: 'approximate', sourceNote: 'Approximate' },
  { code: 'TR', iso3: 'TUR', name: 'Türkiye', daysPerWeek: 5, weeksPerYear: 36,
    prePrimaryStudentHoursYear: 600,
    studentHoursWeek: { primary: 24.8, lowerSec: 28.3, upperSec: 27.8 },
    teacherHoursYear: { primary: 684, lowerSec: 684, upperSec: 660 },
    teacherBasis: 'teaching', confidence: 'approximate', sourceNote: 'Approximate' },
  { code: 'GB', iso3: 'GBR', name: 'United Kingdom', daysPerWeek: 5, weeksPerYear: 39,
    prePrimaryStudentHoursYear: 700,
    studentHoursWeek: { primary: 22.4, lowerSec: 24.4, upperSec: 24.4 },
    teacherHoursYear: { primary: 875, lowerSec: 700, upperSec: 700 },
    teacherBasis: 'teaching', confidence: 'approximate', sourceNote: 'Approximate' },
  { code: 'US', iso3: 'USA', name: 'United States', daysPerWeek: 5, weeksPerYear: 36,
    prePrimaryStudentHoursYear: 700,
    studentHoursWeek: { primary: 27.2, lowerSec: 26.4, upperSec: 26.4 },
    teacherHoursYear: { primary: 967, lowerSec: 900, upperSec: 880 },
    teacherBasis: 'teaching', confidence: 'verified', sourceNote: 'Verified (teacher primary + total compulsory)' },
  { code: 'IN', iso3: 'IND', name: 'India (CBSE norms)', daysPerWeek: 6, weeksPerYear: 40,
    prePrimaryStudentHoursYear: 500,
    studentHoursWeek: { primary: 22.5, lowerSec: 22.5, upperSec: 22.5 },
    teacherHoursYear: { primary: 1600, lowerSec: 1600, upperSec: 1600 },
    teacherBasis: 'total', confidence: 'verified', sourceNote: 'Verified (India-specific)' },
  { code: 'CN', iso3: 'CHN', name: 'China', daysPerWeek: 5, weeksPerYear: 39,
    prePrimaryStudentHoursYear: 750,
    studentHoursWeek: { primary: 24.4, lowerSec: 26.9, upperSec: 26.9 },
    teacherHoursYear: { primary: 900, lowerSec: 850, upperSec: 800 },
    teacherBasis: 'teaching', confidence: 'approximate', sourceNote: 'Approximate' },
  { code: 'SG', iso3: 'SGP', name: 'Singapore', daysPerWeek: 5, weeksPerYear: 40,
    prePrimaryStudentHoursYear: 750,
    studentHoursWeek: { primary: 23.8, lowerSec: 25, upperSec: 25 },
    teacherHoursYear: { primary: 1000, lowerSec: 950, upperSec: 900 },
    teacherBasis: 'teaching', confidence: 'approximate', sourceNote: 'Approximate' },
  { code: 'ID', iso3: 'IDN', name: 'Indonesia', daysPerWeek: 5, weeksPerYear: 38,
    prePrimaryStudentHoursYear: 600,
    studentHoursWeek: { primary: 21.1, lowerSec: 25, upperSec: 26.3 },
    teacherHoursYear: { primary: 900, lowerSec: 950, upperSec: 950 },
    teacherBasis: 'teaching', confidence: 'approximate', sourceNote: 'Approximate' },]

// ── Lookup ────────────────────────────────────────────────────────────────

const BY_CODE = new Map(COUNTRY_HOURS.map(c => [c.code.toUpperCase(), c]))

/** The OECD average row — the documented fallback for uncovered systems. */
export const OECD_AVERAGE = BY_CODE.get('OECD')!

/** Reference row for a country, or undefined when it isn't in the dataset. */
export function countryHours(code: string | null | undefined): CountryHours | undefined {
  if (!code) return undefined
  return BY_CODE.get(String(code).toUpperCase())
}

/** Is this country actually covered, rather than falling back to the average? */
export function isCovered(code: string | null | undefined): boolean {
  const c = countryHours(code)
  return !!c && c.code !== 'OECD'
}

/** Countries the admin can pick, alphabetically, with the OECD row first. */
export function countryOptions(): Array<{ code: string; name: string; confidence: Confidence }> {
  const rest = COUNTRY_HOURS.filter(c => c.code !== 'OECD')
    .sort((a, b) => a.name.localeCompare(b.name))
  return [OECD_AVERAGE, ...rest].map(c => ({ code: c.code, name: c.name, confidence: c.confidence }))
}

/** Map a schedU grade band onto the reference dataset's coarser levels. */
export type BandLike = 'prePrimary' | 'lowerPrimary' | 'upperPrimary' | 'secondary' | 'seniorSecondary'
export function refLevelForBand(band: BandLike): RefLevel {
  switch (band) {
    case 'lowerPrimary': return 'primary'
    case 'upperPrimary':
    case 'secondary':    return 'lowerSec'
    case 'seniorSecondary': return 'upperSec'
    case 'prePrimary':   return 'primary'   // pre-primary is reported yearly only
  }
}

/**
 * Student instructional hours per term-time week for a band. Pre-primary is only
 * published annually, so it is converted with that country's weeks in session.
 */
export function studentHoursWeekFor(
  code: string | null | undefined, band: BandLike,
): { hours: number; confidence: Confidence; country: CountryHours; covered: boolean } | undefined {
  const c = countryHours(code) ?? OECD_AVERAGE
  if (!c) return undefined
  const hours = band === 'prePrimary'
    ? round1(c.prePrimaryStudentHoursYear / Math.max(1, c.weeksPerYear))
    : c.studentHoursWeek[refLevelForBand(band)]
  return { hours: round1(hours), confidence: c.confidence, country: c, covered: isCovered(code) }
}

/**
 * Teacher hours per term-time week — but ONLY when the country's figure is net
 * teaching time. Where the published figure is total working hours including
 * preparation (India), returning it as a teaching cap would roughly double the
 * real load, so `usable` is false and callers must keep their own teaching norm
 * (and, per the blueprint, nudge the admin to enter a custom value).
 */
export function teacherHoursWeekFor(
  code: string | null | undefined, band: BandLike,
): { hours: number; usable: boolean; basis: TeacherBasis; confidence: Confidence; country: CountryHours; covered: boolean } | undefined {
  const c = countryHours(code) ?? OECD_AVERAGE
  if (!c) return undefined
  const perYear = c.teacherHoursYear[refLevelForBand(band)]
  return {
    hours: round1(perYear / Math.max(1, c.weeksPerYear)),
    usable: c.teacherBasis === 'teaching',
    basis: c.teacherBasis,
    confidence: c.confidence,
    country: c,
    covered: isCovered(code),
  }
}

/**
 * Should the UI push the admin to enter their own number? Per Blueprint v5:
 * when the country isn't covered, when the figure is only Approximate-tier, or
 * when the published teacher figure isn't a teaching measure at all.
 */
export function shouldPromptCustom(code: string | null | undefined): {
  prompt: boolean; reason: 'uncovered' | 'approximate' | 'basis' | null
} {
  const c = countryHours(code)
  if (!c || c.code === 'OECD') return { prompt: true, reason: 'uncovered' }
  if (c.teacherBasis !== 'teaching') return { prompt: true, reason: 'basis' }
  if (c.confidence === 'approximate') return { prompt: true, reason: 'approximate' }
  return { prompt: false, reason: null }
}

function round1(n: number): number { return Math.round(n * 10) / 10 }

// ── Country resolution & detection ────────────────────────────────────────

/** Common aliases people actually type, mapped to the dataset's codes. */
const ALIASES: Record<string, string> = {
  'USA': 'US', 'U.S.A.': 'US', 'U.S.': 'US', 'AMERICA': 'US', 'UNITED STATES OF AMERICA': 'US',
  'UK': 'GB', 'U.K.': 'GB', 'GREAT BRITAIN': 'GB', 'ENGLAND': 'GB', 'SCOTLAND': 'GB',
  'WALES': 'GB', 'NORTHERN IRELAND': 'GB', 'BRITAIN': 'GB',
  'BHARAT': 'IN', 'REPUBLIC OF INDIA': 'IN',
  'SOUTH KOREA': 'KR', 'REPUBLIC OF KOREA': 'KR',
  'TURKEY': 'TR', 'TURKIYE': 'TR',
  'CZECH REPUBLIC': 'CZ', 'CZECHIA': 'CZ',
  'SLOVAKIA': 'SK', 'HOLLAND': 'NL', 'THE NETHERLANDS': 'NL',
  'PRC': 'CN', "PEOPLE'S REPUBLIC OF CHINA": 'CN',
  'NZ': 'NZ', 'AOTEAROA': 'NZ',
}

/**
 * Resolve free-typed country text (as captured at sign-up) to a dataset code.
 * Accepts the country name, ISO2, ISO3 or a common alias; returns undefined
 * when it isn't a system we hold figures for, so callers can fall back rather
 * than silently mis-assigning norms.
 */
export function resolveCountryInput(input: string | null | undefined): string | undefined {
  const raw = String(input ?? '').trim()
  if (!raw) return undefined
  const up = raw.toUpperCase()
  if (ALIASES[up]) return ALIASES[up]
  if (BY_CODE.has(up)) return up                                    // ISO2 / 'OECD'
  const byIso3 = COUNTRY_HOURS.find(c => c.iso3.toUpperCase() === up)
  if (byIso3) return byIso3.code
  // Name match — exact first, then a contained match ("India (CBSE norms)").
  const norm = (s: string) => s.toUpperCase().replace(/[^A-Z ]/g, ' ').replace(/\s+/g, ' ').trim()
  const target = norm(raw)
  const exact = COUNTRY_HOURS.find(c => norm(c.name) === target)
  if (exact) return exact.code
  const partial = COUNTRY_HOURS.find(c => norm(c.name).startsWith(target) || target.startsWith(norm(c.name)))
  return partial?.code
}

/**
 * Timezone → country, for the systems the dataset covers. Timezone is used
 * BEFORE browser language because it is the stronger geographic signal: a
 * browser set to en-US sitting in Asia/Kolkata is an Indian school, not a US one.
 */
const TZ_COUNTRY: Record<string, string> = {
  'Asia/Kolkata': 'IN', 'Asia/Calcutta': 'IN',
  'Asia/Tokyo': 'JP', 'Asia/Seoul': 'KR', 'Asia/Shanghai': 'CN', 'Asia/Hong_Kong': 'CN',
  'Asia/Singapore': 'SG', 'Asia/Jakarta': 'ID', 'Asia/Makassar': 'ID', 'Asia/Jayapura': 'ID',
  'Asia/Jerusalem': 'IL', 'Europe/Istanbul': 'TR', 'Asia/Istanbul': 'TR',
  'Europe/London': 'GB', 'Europe/Dublin': 'IE', 'Europe/Paris': 'FR', 'Europe/Berlin': 'DE',
  'Europe/Madrid': 'ES', 'Europe/Rome': 'IT', 'Europe/Amsterdam': 'NL', 'Europe/Brussels': 'BE',
  'Europe/Vienna': 'AT', 'Europe/Zurich': 'CH', 'Europe/Stockholm': 'SE', 'Europe/Oslo': 'NO',
  'Europe/Copenhagen': 'DK', 'Europe/Helsinki': 'FI', 'Europe/Lisbon': 'PT', 'Europe/Prague': 'CZ',
  'Europe/Warsaw': 'PL', 'Europe/Budapest': 'HU', 'Europe/Athens': 'GR', 'Europe/Bratislava': 'SK',
  'Europe/Ljubljana': 'SI', 'Europe/Riga': 'LV', 'Europe/Vilnius': 'LT', 'Europe/Tallinn': 'EE',
  'Europe/Luxembourg': 'LU', 'Atlantic/Reykjavik': 'IS',
  'America/New_York': 'US', 'America/Chicago': 'US', 'America/Denver': 'US', 'America/Phoenix': 'US',
  'America/Los_Angeles': 'US', 'America/Anchorage': 'US', 'Pacific/Honolulu': 'US',
  'America/Toronto': 'CA', 'America/Vancouver': 'CA', 'America/Edmonton': 'CA', 'America/Winnipeg': 'CA',
  'America/Mexico_City': 'MX', 'America/Santiago': 'CL', 'America/Costa_Rica': 'CR',
  'Pacific/Auckland': 'NZ',
}

/**
 * Best-effort country for a new school, WITHOUT any network call or IP lookup:
 * the browser's timezone first, then its locale region. Returns undefined when
 * the result isn't a system we hold figures for.
 *
 * Deliberately local-only — this needs no third-party geo service, sends no
 * address anywhere, and works offline. It is a *suggestion*: the admin always
 * confirms it in Settings.
 */
export function detectCountry(): string | undefined {
  if (typeof window === 'undefined') return undefined
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || ''
    const byTz = TZ_COUNTRY[tz]
    if (byTz && BY_CODE.has(byTz)) return byTz
    if (tz.startsWith('Australia/')) return 'AU'
  } catch { /* fall through to locale */ }
  try {
    const loc = new Intl.Locale(navigator.language)
    const region = ((loc as any).maximize?.() ?? loc).region
    if (region && BY_CODE.has(String(region).toUpperCase())) return String(region).toUpperCase()
  } catch { /* give up */ }
  return undefined
}
