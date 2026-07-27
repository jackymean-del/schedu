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
 * in different sections. Each plan holds either a direct required-hours figure,
 * or a chapter list (name + hours each), in which case the requirement is the
 * sum of the chapters. Faculty tick chapters off as they're taught; coverage can
 * also be logged directly in hours for schools that don't track chapters.
 *
 * Everything below the store is a pure function so it can be unit-tested and
 * reused by the engine without pulling React in.
 */
import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export interface Chapter {
  id: string
  name: string
  /** Teaching hours this chapter is expected to need. */
  hours: number
  /** Set when a faculty member marks it taught. */
  coveredAt?: string
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
}

/** Stable key for a (subject, section) pair. */
export function planKey(subject: string, section: string): string {
  return `${(subject ?? '').trim()}||${(section ?? '').trim()}`
}

// ── Pure helpers ───────────────────────────────────────────────────────────

/** Hours the syllabus needs: chapter sum when chapters exist, else the direct figure. */
export function requiredHours(p: SyllabusPlan | undefined): number {
  if (!p) return 0
  if (p.chapters.length) return round1(p.chapters.reduce((a, c) => a + (c.hours || 0), 0))
  return round1(p.requiredHours ?? 0)
}

/** Hours actually delivered: covered chapters + any directly-logged hours. */
export function coveredHours(p: SyllabusPlan | undefined): number {
  if (!p) return 0
  const fromChapters = p.chapters.filter(c => c.coveredAt).reduce((a, c) => a + (c.hours || 0), 0)
  return round1(fromChapters + (p.loggedHours || 0))
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

export interface CoverageRow {
  key: string; subject: string; section: string; teacher?: string
  required: number; covered: number; remaining: number; pct: number
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
  })).sort((a, b) => b.remaining - a.remaining || a.subject.localeCompare(b.subject))
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
  addChapter: (subject: string, section: string, name: string, hours: number) => void
  updateChapter: (subject: string, section: string, chapterId: string, patch: Partial<Chapter>) => void
  removeChapter: (subject: string, section: string, chapterId: string) => void
  /** Faculty action — tick a chapter as taught (or untick it). */
  markChapterCovered: (subject: string, section: string, chapterId: string, covered: boolean) => void
  /** Log delivered hours directly, for schools not tracking chapters. */
  logHours: (subject: string, section: string, hours: number) => void
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
        addChapter: (subject, section, name, hours) =>
          edit(subject, section, p => ({
            ...p,
            chapters: [...p.chapters, { id: Math.random().toString(36).slice(2, 9), name: name.trim() || `Chapter ${p.chapters.length + 1}`, hours: Math.max(0, hours) }],
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
        removePlan: (subject, section) =>
          set(s => { const n = { ...s.plans }; delete n[planKey(subject, section)]; return { plans: n } }),
        reset: () => set({ plans: {} }),
      }
    },
    { name: 'schedu-syllabus' },
  ),
)
