/**
 * Syllabus Tracking — Blueprint v3, Part C.
 *
 * Deliberately built as a SHARED SERVICE rather than a screen in the wizard:
 * the same data feeds three different places at once —
 *   • Resources (Part A, Step 2)  — required sessions per subject
 *   • the Step 4 OR-logic gap     — "which subject needs more sessions?"
 *   • Live Mode (Part B)          — live coverage vs plan
 * so it must not live inside any one of them.
 *
 * Model
 * -----
 * A *plan* is keyed per (subject, section) — a subject can need different hours
 * in different sections. Each plan holds the hours the subject needs, plus a
 * CONTENT signal saying how much of the syllabus is actually done: a stated %,
 * a chapter count, or a named chapter checklist. Chapters describe WHAT to
 * cover, never how long it takes, so they carry no hours and each counts
 * equally. Schools tracking neither can still log delivered hours directly.
 *
 * Everything below the store is a pure function so it can be unit-tested and
 * reused by the engine without pulling React in.
 */
import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export interface Chapter {
  id: string
  name: string
  /**
   * LEGACY. Chapters no longer carry hours — nobody could estimate them
   * honestly, and the subject's total is already known. Kept so existing data
   * keeps weighting correctly (see contentFraction / requiredHours); new
   * chapters are created without it and every chapter then counts equally.
   */
  hours?: number
  /** Set when a faculty member marks it fully taught. */
  coveredAt?: string
  /**
   * 0–100 for a chapter only PARTIALLY taught (Blueprint v6, method ii).
   * `coveredAt` wins when both are present — a ticked chapter is 100% done.
   */
  percentCovered?: number
}

/**
 * How a faculty member records content for THIS subject — Blueprint v6:
 * "Faculty can go with either method — the choice is per faculty/subject, not
 * fixed system-wide."
 *
 *  'percent' — simply state how much of the syllabus is covered ("75%").
 *              Nothing to break down, nothing to tick. The least work possible,
 *              and enough on its own to drive coverage, pace and every alert.
 *  'count'   — enter the TOTAL number of chapters, then how many are covered so
 *              far. Fast, no chapter names to type.
 *  'named'   — list the chapter names in sequence and tick each off, optionally
 *              recording a percentage for one that's only part-taught.
 */
export type CoverageMethod = 'percent' | 'named' | 'count'

export const METHOD_LABELS: Record<CoverageMethod, string> = {
  percent: 'Just say the %',
  count: 'Chapter count',
  named: 'Chapter checklist',
}
export const METHOD_HINTS: Record<CoverageMethod, string> = {
  percent: 'State how much of the syllabus is covered. Quickest — nothing to list.',
  count: 'Say how many chapters there are, and how many are done.',
  named: 'List chapters and tick them off; part-taught ones can carry a %.',
}

/**
 * A teaching session that did NOT happen — holiday, school event, faculty
 * absence, strike, whatever. These are hours the plan was counting on, so they
 * directly threaten whether the syllabus can still be finished.
 */
export interface LostSession {
  id: string
  /** ISO date of the lost session. */
  date: string
  /** Teaching hours lost. */
  hours: number
  reason: 'holiday' | 'event' | 'absence' | 'other'
  note?: string
}

export const LOST_REASON_LABELS: Record<LostSession['reason'], string> = {
  holiday: 'Holiday', event: 'School event', absence: 'Faculty absent', other: 'Other',
}

export interface SyllabusPlan {
  subject: string
  section: string
  /** Direct requirement in hours. Ignored when `chapters` is non-empty. */
  requiredHours?: number
  chapters: Chapter[]
  /** Hours logged as delivered without chapter tracking. */
  loggedHours: number
  /** Optional owner, so coverage can be reported teacher-wise. */
  teacher?: string
  /** Sessions lost to holidays / events / absences. Optional for older data. */
  lostSessions?: LostSession[]

  /** Entry method chosen for this subject. Inferred when absent (see effectiveMethod). */
  method?: CoverageMethod
  /** Chapter-count method: how many chapters the syllabus has in total. */
  totalChapters?: number
  /** Chapter-count method: how many are covered so far. */
  chaptersCovered?: number
  /** 'percent' method: the whole syllabus, 0–100, stated outright. */
  overallPercentCovered?: number
}

/** Which entry method a plan is really using — explicit choice, else inferred. */
export function effectiveMethod(p: SyllabusPlan | undefined): CoverageMethod {
  if (p?.method) return p.method
  if ((p?.chapters?.length ?? 0) > 0) return 'named'
  if ((p?.totalChapters ?? 0) > 0) return 'count'
  if (p?.overallPercentCovered != null) return 'percent'
  return 'named'
}

/** How much of one chapter is taught, 0–1. A tick beats a percentage. */
export function chapterFraction(c: Chapter): number {
  if (c.coveredAt) return 1
  if (c.percentCovered == null) return 0
  return Math.max(0, Math.min(100, c.percentCovered)) / 100
}

/**
 * Fraction of the syllabus CONTENT actually taught, 0–1 — the metric Blueprint
 * v6 insists must never be moved by a holiday. Both entry methods reduce to this
 * single number, so every dashboard consumes them transparently.
 */
export function contentFraction(p: SyllabusPlan | undefined): number {
  if (!p) return 0
  if (effectiveMethod(p) === 'percent') {
    return Math.max(0, Math.min(100, p.overallPercentCovered ?? 0)) / 100
  }
  if (effectiveMethod(p) === 'count') {
    const total = p.totalChapters ?? 0
    if (total <= 0) return 0
    return Math.max(0, Math.min(1, (p.chaptersCovered ?? 0) / total))
  }
  const chapters = p.chapters ?? []
  if (chapters.length === 0) return 0
  // Chapters are equal-weight unless EVERY one carries legacy hours. Mixing the
  // two would silently weight a new (hour-less) chapter at zero, so it's all or
  // nothing — and all new data takes the equal-weight path.
  if (chapters.every(c => (c.hours ?? 0) > 0)) {
    const totalH = chapters.reduce((a, c) => a + (c.hours || 0), 0)
    const doneH = chapters.reduce((a, c) => a + (c.hours || 0) * chapterFraction(c), 0)
    return Math.max(0, Math.min(1, doneH / totalH))
  }
  const done = chapters.reduce((a, c) => a + chapterFraction(c), 0)
  return Math.max(0, Math.min(1, done / chapters.length))
}

/** True when the plan carries a real CONTENT signal (either method). */
export function hasContentSignal(p: SyllabusPlan | undefined): boolean {
  if (!p) return false
  switch (effectiveMethod(p)) {
    case 'percent': return p.overallPercentCovered != null
    case 'count':   return (p.totalChapters ?? 0) > 0
    default:        return (p.chapters?.length ?? 0) > 0
  }
}

/** Stable key for a (subject, section) pair. */
export function planKey(subject: string, section: string): string {
  return `${(subject ?? '').trim()}||${(section ?? '').trim()}`
}

// ── Pure helpers ───────────────────────────────────────────────────────────

/**
 * Hours the syllabus needs. The subject's own figure is the source of truth —
 * chapters say WHAT to cover, not how long it takes. Legacy plans that only ever
 * had per-chapter hours still fall back to their sum, so no existing data reads
 * as zero.
 */
export function requiredHours(p: SyllabusPlan | undefined): number {
  if (!p) return 0
  if (p.requiredHours != null && p.requiredHours > 0) return round1(p.requiredHours)
  const chapterSum = (p.chapters ?? []).reduce((a, c) => a + (c.hours || 0), 0)
  return round1(chapterSum)
}

/** Hours actually delivered: covered chapters + any directly-logged hours. */
export function coveredHours(p: SyllabusPlan | undefined): number {
  if (!p) return 0
  // With a content signal, credit is driven by CONTENT — chapters taught (either
  // method, partials included) — never by hours logged. Blueprint v6 is explicit
  // that duration and content are separate metrics; letting logged time inflate
  // coverage is exactly the conflation it warns against.
  if (hasContentSignal(p)) return round1(requiredHours(p) * contentFraction(p))
  // No content signal at all (bulk-hours school): time is the only thing we know.
  return round1(p.loggedHours || 0)
}

/** Hours still to teach (never negative). */
export function remainingHours(p: SyllabusPlan | undefined): number {
  return round1(Math.max(0, requiredHours(p) - coveredHours(p)))
}

/** 0–100 completion. A plan with no requirement counts as 0% (nothing planned). */
export function coveragePct(p: SyllabusPlan | undefined): number {
  const req = requiredHours(p)
  if (req <= 0) return 0
  return Math.min(100, Math.round((coveredHours(p) / req) * 100))
}

/** True when the syllabus is fully taught — the signal for "can give up a slot". */
export function isCovered(p: SyllabusPlan | undefined): boolean {
  return requiredHours(p) > 0 && remainingHours(p) <= 0
}

/** Teaching hours lost to holidays / events / absences. */
export function lostHours(p: SyllabusPlan | undefined): number {
  return round1((p?.lostSessions ?? []).reduce((a, s) => a + (s.hours || 0), 0))
}

/**
 * How worried should we be about this plan finishing?
 *
 * Coverage % alone hides the real danger: a subject can look fine while the
 * sessions it needed have been eaten by holidays and events. So lost time is
 * part of the verdict, not a footnote.
 *
 *   covered   — syllabus complete, nothing outstanding
 *   critical  — hours still to teach AND sessions were lost (that time has to be
 *               found again, so the plan will not land without rescheduling)
 *   behind    — under half taught with hours outstanding
 *   on-track  — outstanding hours but progressing, no lost time
 *   untracked — nothing planned yet, so no opinion
 */
export type Risk = 'covered' | 'on-track' | 'behind' | 'critical' | 'untracked'

export function riskOf(p: SyllabusPlan | undefined): Risk {
  if (requiredHours(p) <= 0) return 'untracked'
  if (remainingHours(p) <= 0) return 'covered'
  if (lostHours(p) > 0) return 'critical'
  // Nothing recorded at all yet. Now that the requirement is DERIVED from the
  // timetable, every scheduled subject has one from day one — and calling a
  // subject "behind" when nobody has said anything about it is a guess, not a
  // finding. Silence until there's something to go on.
  if (!hasContentSignal(p) && (p?.loggedHours ?? 0) <= 0) return 'untracked'
  if (coveragePct(p) < 50) return 'behind'
  return 'on-track'
}

export const RISK_LABELS: Record<Risk, string> = {
  covered: 'Covered', 'on-track': 'On track', behind: 'Behind',
  critical: 'Needs rescheduling', untracked: 'Not planned',
}
/** Sort weight — worst first. */
const RISK_ORDER: Record<Risk, number> = { critical: 0, behind: 1, 'on-track': 2, covered: 3, untracked: 4 }

/**
 * THE STEP 4 OR-LOGIC ANSWER.
 *
 * Given the subjects in an OR group (for one section), rank them by how badly
 * each still needs teaching time, so the slot goes to the one that "needs more
 * sessions to complete its syllabus" — the exact decision the blueprint flags as
 * unanswerable until Part C exists.
 *
 * Ranked by remaining hours (desc), then by lower coverage %, then by name for
 * determinism. Subjects with no syllabus plan sort last: with no data we must not
 * claim they need the slot.
 */
export function rankOrGroupBySessionNeed(
  subjects: string[], section: string, plans: Record<string, SyllabusPlan>,
): Array<{ subject: string; remaining: number; pct: number; hasPlan: boolean }> {
  return subjects
    .map(subject => {
      const p = plans[planKey(subject, section)]
      return {
        subject,
        remaining: remainingHours(p),
        pct: coveragePct(p),
        hasPlan: !!p && requiredHours(p) > 0,
      }
    })
    .sort((a, b) =>
      Number(b.hasPlan) - Number(a.hasPlan) ||
      b.remaining - a.remaining ||
      a.pct - b.pct ||
      a.subject.localeCompare(b.subject))
}

/**
 * Blueprint Part C §4: "add more hours to a subject, replacing slots from
 * another subject that is already sufficiently covered". Returns the subject
 * best placed to GIVE UP a slot for `needySubject` in this section, or null when
 * nothing can safely donate.
 */
export function suggestSlotDonor(
  needySubject: string, section: string, candidates: string[], plans: Record<string, SyllabusPlan>,
): { donor: string; donorRemaining: number } | null {
  const needy = plans[planKey(needySubject, section)]
  if (remainingHours(needy) <= 0) return null   // needy subject doesn't need more
  const ranked = candidates
    .filter(s => s !== needySubject)
    .map(s => ({ s, p: plans[planKey(s, section)] }))
    .filter(x => requiredHours(x.p) > 0)                       // only planned subjects
    .sort((a, b) => remainingHours(a.p) - remainingHours(b.p) || coveragePct(b.p) - coveragePct(a.p))
  const best = ranked[0]
  // Only donate from a subject that is fully covered, or clearly less behind.
  if (!best) return null
  if (!isCovered(best.p) && remainingHours(best.p) >= remainingHours(needy)) return null
  return { donor: best.s, donorRemaining: remainingHours(best.p) }
}

/**
 * Fold declared-holiday losses into the plans as synthetic lost sessions.
 *
 * Deliberately a merge rather than a change to every helper: riskOf,
 * coverageRows, lagging and suggestBorrowSwaps then all account for holidays
 * with no modification, and a deleted holiday simply stops appearing — there is
 * no materialised copy to reconcile.
 *
 * Takes a plain {planKey → hours} map so this module stays free of any holiday
 * dependency (holidays.ts imports planKey from here).
 */
export function withHolidayImpact(
  plans: Record<string, SyllabusPlan>,
  impact: Record<string, { hours: number; dates: string[] }>,
): Record<string, SyllabusPlan> {
  return withLostImpact(plans, impact, {
    reason: 'holiday',
    idPrefix: 'holiday',
    note: n => n > 1 ? `${n} school holidays` : 'School holiday',
  })
}

/**
 * Fill in each plan's requirement from what the TIMETABLE actually allocates,
 * and surface every scheduled (subject, section) even before anyone has touched
 * it — so the coverage dashboard is complete from the moment a timetable exists
 * and nobody has to type an hours figure that could disagree with the schedule.
 *
 * An explicit `requiredHours` on the plan always wins: a school that knows its
 * syllabus needs 50 h in a 40 h allocation must be able to say so, and see the
 * gap rather than have it quietly rounded away.
 */
export function withAllocatedHours(
  plans: Record<string, SyllabusPlan>,
  allocated: Record<string, number>,
): Record<string, SyllabusPlan> {
  if (!allocated || Object.keys(allocated).length === 0) return plans
  const out: Record<string, SyllabusPlan> = { ...plans }
  for (const key in allocated) {
    const hours = allocated[key]
    if (!(hours > 0)) continue
    const base = out[key]
    if (!base) {
      // Seeded, not invented: these carry no content signal, so riskOf reports
      // them as 'untracked' and they stay silent in every alert.
      const [subject, section] = key.split('||')
      out[key] = { subject, section, chapters: [], loggedHours: 0, requiredHours: hours }
      continue
    }
    if (base.requiredHours != null && base.requiredHours > 0) continue   // explicit override wins
    out[key] = { ...base, requiredHours: hours }
  }
  return out
}

/**
 * The general form: fold any derived {planKey → hours lost} map into the plans
 * as synthetic lost sessions. Holidays use it, and so do substitutions where the
 * cover did not carry the syllabus forward (lib/substitutionCoverage).
 */
export function withLostImpact(
  plans: Record<string, SyllabusPlan>,
  impact: Record<string, { hours: number; dates: string[] }>,
  opts: { reason: LostSession['reason']; idPrefix: string; note: (dateCount: number) => string },
): Record<string, SyllabusPlan> {
  if (!impact || Object.keys(impact).length === 0) return plans
  const out: Record<string, SyllabusPlan> = { ...plans }
  for (const key in impact) {
    const loss = impact[key]
    if (!loss || loss.hours <= 0) continue
    const base = out[key]
    if (!base) continue   // no syllabus plan for that subject/section — nothing to adjust
    out[key] = {
      ...base,
      lostSessions: [
        ...(base.lostSessions ?? []),
        {
          id: `${opts.idPrefix}:${key}`,
          date: loss.dates[0] ?? '',
          hours: loss.hours,
          reason: opts.reason,
          note: opts.note(loss.dates.length),
        },
      ],
    }
  }
  return out
}

/**
 * A "borrow & replace" opportunity — Blueprint v5, Syllabus Cover Dashboard.
 *
 * Take a slot from a subject that is already ahead/covered and give it to one
 * that is lagging. The blueprint constrains this hard: it is only offered when
 * THE SAME TEACHER teaches both, in the SAME class-section. That keeps the swap
 * logistically free — no teacher to re-map, no room to move, the same students
 * in the room — at the cost of not always finding a match. Anything looser would
 * be a timetable re-plan pretending to be a one-click fix.
 */
export interface BorrowSwap {
  section: string
  teacher: string
  /** Subject that needs the time. */
  lagging: string
  laggingRemaining: number
  laggingPct: number
  /** Subject that can spare it. */
  donor: string
  donorRemaining: number
  donorPct: number
  /** Hours that can safely move (never more than the lagging subject needs). */
  hours: number
}

/**
 * Find every same-teacher, same-section swap that would help. Sorted worst-first
 * so the most urgent gap is offered before marginal ones.
 */
export function suggestBorrowSwaps(plans: Record<string, SyllabusPlan>): BorrowSwap[] {
  const all = Object.values(plans)
  const out: BorrowSwap[] = []
  for (const lag of all) {
    const risk = riskOf(lag)
    if (risk !== 'behind' && risk !== 'critical') continue
    const need = remainingHours(lag)
    if (need <= 0 || !lag.teacher) continue
    for (const don of all) {
      if (don === lag) continue
      // The blueprint's constraint: same teacher, same section.
      if (don.teacher !== lag.teacher || don.section !== lag.section) continue
      // Only borrow from a subject that has genuinely finished its syllabus.
      if (!isCovered(don)) continue
      // How much may move: never more than the lagging subject needs, and never
      // more than the donor was ever allocated — a 20 h subject cannot lend 30 h.
      // (We can't see how many of the donor's slots remain in the timetable, so
      // its total requirement is the honest upper bound.)
      const hours = round1(Math.min(need, requiredHours(don)))
      if (hours <= 0) continue
      out.push({
        section: lag.section, teacher: lag.teacher,
        lagging: lag.subject, laggingRemaining: need, laggingPct: coveragePct(lag),
        donor: don.subject, donorRemaining: remainingHours(don), donorPct: coveragePct(don),
        hours,
      })
    }
  }
  return out.sort((a, b) =>
    b.laggingRemaining - a.laggingRemaining ||
    a.lagging.localeCompare(b.lagging) ||
    a.donor.localeCompare(b.donor))
}

export interface CoverageRow {
  key: string; subject: string; section: string; teacher?: string
  required: number; covered: number; remaining: number; pct: number
  /** Hours lost to holidays / events / absences. */
  lost: number
  risk: Risk
}

/**
 * The CLASS a section belongs to — "VI-A" → "VI", "Grade 3-B" → "Grade 3".
 * Part C §8 reports coverage "subject-wise, per section, per class", so class is
 * its own reporting dimension: the section name minus its trailing section
 * suffix (a short A–Z / numeric tail, optionally after a stream code).
 */
export function classOfSection(section: string): string {
  const s = (section ?? '').trim()
  if (!s) return '—'
  const idx = s.lastIndexOf('-')
  if (idx > 0 && s.length - idx - 1 <= 3) return s.slice(0, idx).trim()
  return s
}

/** Flatten plans into report rows — the basis for every coverage dashboard. */
export function coverageRows(plans: Record<string, SyllabusPlan>): CoverageRow[] {
  return Object.entries(plans).map(([key, p]) => ({
    key, subject: p.subject, section: p.section, teacher: p.teacher,
    required: requiredHours(p), covered: coveredHours(p),
    remaining: remainingHours(p), pct: coveragePct(p),
    lost: lostHours(p), risk: riskOf(p),
  })).sort((a, b) => b.remaining - a.remaining || a.subject.localeCompare(b.subject))
}

/**
 * The rows a human should be told about, worst first — what powers the dashboard
 * alert so nobody has to go hunting for which subject/class/teacher is slipping.
 * Only genuinely actionable states qualify (critical / behind); covered,
 * on-track and unplanned rows are deliberately silent.
 */
export function lagging(plans: Record<string, SyllabusPlan>, limit?: number): CoverageRow[] {
  const out = coverageRows(plans)
    .filter(r => r.risk === 'critical' || r.risk === 'behind')
    .sort((a, b) =>
      RISK_ORDER[a.risk] - RISK_ORDER[b.risk] ||
      b.lost - a.lost ||
      b.remaining - a.remaining ||
      a.subject.localeCompare(b.subject))
  return limit ? out.slice(0, limit) : out
}

/** Group coverage rows by any dimension — subject-, class-, section- or teacher-wise. */
export function summariseBy(
  rows: CoverageRow[], dim: 'subject' | 'class' | 'section' | 'teacher',
): Array<{ label: string; required: number; covered: number; remaining: number; pct: number }> {
  const m = new Map<string, { required: number; covered: number }>()
  rows.forEach(r => {
    const label = (dim === 'teacher' ? r.teacher
      : dim === 'class' ? classOfSection(r.section)
      : r[dim]) || '—'
    const cur = m.get(label) ?? { required: 0, covered: 0 }
    cur.required += r.required; cur.covered += r.covered
    m.set(label, cur)
  })
  return [...m.entries()].map(([label, v]) => ({
    label,
    required: round1(v.required),
    covered: round1(v.covered),
    remaining: round1(Math.max(0, v.required - v.covered)),
    pct: v.required > 0 ? Math.min(100, Math.round((v.covered / v.required) * 100)) : 0,
  })).sort((a, b) => b.remaining - a.remaining || a.label.localeCompare(b.label))
}

function round1(n: number): number { return Math.round(n * 10) / 10 }

// ── Store ──────────────────────────────────────────────────────────────────

interface SyllabusState {
  /** planKey → plan. */
  plans: Record<string, SyllabusPlan>

  setRequiredHours: (subject: string, section: string, hours: number | undefined) => void
  setTeacher: (subject: string, section: string, teacher: string) => void
  addChapter: (subject: string, section: string, name: string) => void
  updateChapter: (subject: string, section: string, chapterId: string, patch: Partial<Chapter>) => void
  removeChapter: (subject: string, section: string, chapterId: string) => void
  /** Faculty action — tick a chapter as taught (or untick it). */
  markChapterCovered: (subject: string, section: string, chapterId: string, covered: boolean) => void
  /** Log delivered hours directly, for schools not tracking chapters. */
  logHours: (subject: string, section: string, hours: number) => void
  /** Choose the entry method for this subject (Blueprint v6 — per subject). */
  setMethod: (subject: string, section: string, m: CoverageMethod) => void
  /** Chapter-count method: total chapters, and how many are done. */
  setChapterCounts: (subject: string, section: string, total?: number, covered?: number) => void
  /** 'percent' method: state overall syllabus covered, 0–100. */
  setOverallPercent: (subject: string, section: string, pct: number | undefined) => void
  /** Record a session lost to a holiday / event / absence. */
  logLostSession: (subject: string, section: string, s: Omit<LostSession, 'id'>) => void
  removeLostSession: (subject: string, section: string, id: string) => void
  removePlan: (subject: string, section: string) => void
  reset: () => void
}

const blankPlan = (subject: string, section: string): SyllabusPlan =>
  ({ subject, section, chapters: [], loggedHours: 0 })

export const useSyllabus = create<SyllabusState>()(
  persist(
    (set) => {
      /** Read-modify-write one plan, creating it if absent. */
      const edit = (subject: string, section: string, fn: (p: SyllabusPlan) => SyllabusPlan) =>
        set(s => {
          const k = planKey(subject, section)
          const cur = s.plans[k] ?? blankPlan(subject, section)
          return { plans: { ...s.plans, [k]: fn({ ...cur, chapters: [...cur.chapters] }) } }
        })
      return {
        plans: {},
        setRequiredHours: (subject, section, hours) =>
          edit(subject, section, p => ({ ...p, requiredHours: hours && hours > 0 ? hours : undefined })),
        setTeacher: (subject, section, teacher) =>
          edit(subject, section, p => ({ ...p, teacher: teacher || undefined })),
        addChapter: (subject, section, name) =>
          edit(subject, section, p => ({
            ...p,
            chapters: [...p.chapters, { id: Math.random().toString(36).slice(2, 9), name: name.trim() || `Chapter ${p.chapters.length + 1}` }],
          })),
        updateChapter: (subject, section, chapterId, patch) =>
          edit(subject, section, p => ({
            ...p, chapters: p.chapters.map(c => c.id === chapterId ? { ...c, ...patch } : c),
          })),
        removeChapter: (subject, section, chapterId) =>
          edit(subject, section, p => ({ ...p, chapters: p.chapters.filter(c => c.id !== chapterId) })),
        markChapterCovered: (subject, section, chapterId, covered) =>
          edit(subject, section, p => ({
            ...p,
            chapters: p.chapters.map(c => c.id === chapterId
              ? { ...c, coveredAt: covered ? new Date().toISOString() : undefined } : c),
          })),
        logHours: (subject, section, hours) =>
          edit(subject, section, p => ({ ...p, loggedHours: Math.max(0, (p.loggedHours || 0) + hours) })),
        setMethod: (subject, section, m) => edit(subject, section, p => ({ ...p, method: m })),
        setOverallPercent: (subject, section, pct) =>
          edit(subject, section, p => ({
            ...p,
            overallPercentCovered: pct == null || isNaN(pct) ? undefined : Math.max(0, Math.min(100, pct)),
          })),
        setChapterCounts: (subject, section, total, covered) =>
          edit(subject, section, p => {
            const t = total != null && total > 0 ? Math.round(total) : undefined
            const cRaw = covered != null && covered >= 0 ? Math.round(covered) : p.chaptersCovered
            // Covered can never exceed the total the faculty just declared.
            const c = t != null && cRaw != null ? Math.min(cRaw, t) : cRaw
            return { ...p, totalChapters: t, chaptersCovered: c }
          }),
        logLostSession: (subject, section, s) =>
          edit(subject, section, p => ({
            ...p,
            lostSessions: [...(p.lostSessions ?? []), { ...s, hours: Math.max(0, s.hours), id: Math.random().toString(36).slice(2, 9) }],
          })),
        removeLostSession: (subject, section, id) =>
          edit(subject, section, p => ({ ...p, lostSessions: (p.lostSessions ?? []).filter(s => s.id !== id) })),
        removePlan: (subject, section) =>
          set(s => { const n = { ...s.plans }; delete n[planKey(subject, section)]; return { plans: n } }),
        reset: () => set({ plans: {} }),
      }
    },
    { name: 'schedu-syllabus' },
  ),
)
