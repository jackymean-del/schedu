/**
 * Substitution-aware syllabus coverage — Blueprint v6.
 *
 * A covered period is NOT automatically a taught syllabus. Three different
 * things can happen when a substitute walks into someone else's slot, and they
 * have three different effects on the syllabus:
 *
 *   'continue'      the substitute carries on the absent teacher's syllabus.
 *                   → content advances, and the hour counts as spent.
 *                     (v6: the original teacher confirms this on return, so a
 *                      claimed cover can't quietly inflate coverage.)
 *
 *   'occupy'        the substitute simply takes the class — supervision, revision,
 *                   whatever. The clock ran; the syllabus did not move.
 *                   → hours spent, no content. The hour still has to be found
 *                     again, so it is recorded as lost syllabus time.
 *
 *   'other-subject' the substitute taught a DIFFERENT subject — usually their own.
 *                   → the subject they taught gains content WITHOUT spending any
 *                     of its own scheduled hours (a free session: its pace
 *                     improves). The subject that owned the slot lost the period
 *                     outright, and must not be charged for time it never got.
 *
 * Like holidays, effects are DERIVED at read time from these records rather than
 * written into any plan: delete a record and its effect simply disappears, with
 * nothing to reconcile. The two feed the same machinery — see
 * syllabusTracking.withLostImpact.
 */
import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { planKey } from './syllabusTracking'

export type SubIntent = 'continue' | 'occupy' | 'other-subject'

export const INTENT_LABELS: Record<SubIntent, string> = {
  continue: 'Continues the syllabus',
  occupy: 'Takes the class only',
  'other-subject': 'Teaches another subject',
}
export const INTENT_HINTS: Record<SubIntent, string> = {
  continue: 'Carries on where the absent teacher left off — content advances, hour counts as taught.',
  occupy: 'Supervision, revision, anything. The hour is spent but the syllabus does not move.',
  'other-subject': 'Their own subject instead. That subject gains a free session; this one loses the period.',
}

export interface SubCoverageRecord {
  id: string
  /** ISO date of the period that was covered. */
  date: string
  /** Owning schedule, so multi-active timetables stay distinguishable. */
  sid: string
  section: string
  periodId: string
  /** Subject the slot belongs to — the absent teacher's subject. */
  subject: string
  absent: string
  substitute: string
  intent: SubIntent
  /** 'other-subject' only: what was actually taught in the slot. */
  taughtSubject?: string
  /** Length of the period, in hours. */
  hours: number
  /** 'continue' only: set when the original teacher confirms on their return. */
  confirmedAt?: string
}

/** One record per covered slot per date — re-assigning updates, never duplicates. */
export const slotKey = (r: Pick<SubCoverageRecord, 'date' | 'sid' | 'section' | 'periodId'>) =>
  `${r.date}|${r.sid}|${r.section}|${r.periodId}`

interface SubCoverageState {
  records: SubCoverageRecord[]
  /** Record (or update) what a substitute did with a slot. */
  record: (r: Omit<SubCoverageRecord, 'id'>) => void
  /** Change only the intent of an existing slot record. */
  setIntent: (id: string, intent: SubIntent, taughtSubject?: string) => void
  /** The absent teacher confirms, on return, that the syllabus really moved. */
  confirm: (id: string, confirmed: boolean) => void
  /** Cover cleared — the record goes with it. */
  clearSlot: (k: string) => void
  remove: (id: string) => void
  reset: () => void
}

export const useSubCoverage = create<SubCoverageState>()(
  persist(
    (set) => ({
      records: [],
      record: (r) =>
        set(s => {
          const k = slotKey(r)
          const existing = s.records.find(x => slotKey(x) === k)
          if (existing) {
            return {
              records: s.records.map(x => slotKey(x) === k
                // A different substitute means a different claim — drop any
                // confirmation the previous one had earned.
                ? { ...x, ...r, id: x.id, confirmedAt: x.substitute === r.substitute ? x.confirmedAt : undefined }
                : x),
            }
          }
          return { records: [...s.records, { ...r, id: Math.random().toString(36).slice(2, 9) }] }
        }),
      setIntent: (id, intent, taughtSubject) =>
        set(s => ({
          records: s.records.map(r => r.id === id
            ? {
                ...r, intent,
                taughtSubject: intent === 'other-subject' ? (taughtSubject ?? r.taughtSubject) : undefined,
                // Only a 'continue' can be confirmed; switching away drops it.
                confirmedAt: intent === 'continue' ? r.confirmedAt : undefined,
              }
            : r),
        })),
      confirm: (id, confirmed) =>
        set(s => ({
          records: s.records.map(r => r.id === id
            ? { ...r, confirmedAt: confirmed ? new Date().toISOString() : undefined } : r),
        })),
      clearSlot: (k) => set(s => ({ records: s.records.filter(r => slotKey(r) !== k) })),
      remove: (id) => set(s => ({ records: s.records.filter(r => r.id !== id) })),
      reset: () => set({ records: [] }),
    }),
    { name: 'schedu-sub-coverage' },
  ),
)

// ── Derived effects ────────────────────────────────────────────────────────

export interface HoursByPlan { hours: number; dates: string[] }

const add = (m: Record<string, HoursByPlan>, key: string, hours: number, date: string) => {
  const cur = m[key] ?? { hours: 0, dates: [] }
  cur.hours += hours
  if (date && !cur.dates.includes(date)) cur.dates.push(date)
  m[key] = cur
}
const round1 = (n: number) => Math.round(n * 10) / 10

/**
 * Syllabus hours lost because a covered period did not advance the syllabus that
 * owned it — keyed by the ORIGINAL subject's plan. Both 'occupy' and
 * 'other-subject' qualify; only 'continue' leaves the plan whole.
 */
export function coverageLoss(records: SubCoverageRecord[]): Record<string, HoursByPlan> {
  const out: Record<string, HoursByPlan> = {}
  for (const r of records) {
    if (r.intent === 'continue') continue
    if (!(r.hours > 0)) continue
    add(out, planKey(r.subject, r.section), r.hours, r.date)
  }
  for (const k in out) out[k].hours = round1(out[k].hours)
  return out
}

/**
 * Hours that RAN but not for this subject — 'other-subject' only. Pace derives
 * time spent from the timetable, which cannot know the slot was repurposed; this
 * is subtracted so a subject is never charged for a period it never received.
 * ('occupy' is deliberately absent: that time WAS spent on this subject's class,
 * it just produced nothing — the honest reading is a poor pace, not lost time.)
 */
export function hoursNotSpent(records: SubCoverageRecord[]): Record<string, number> {
  const out: Record<string, number> = {}
  for (const r of records) {
    if (r.intent !== 'other-subject' || !(r.hours > 0)) continue
    const k = planKey(r.subject, r.section)
    out[k] = round1((out[k] ?? 0) + r.hours)
  }
  return out
}

export interface BonusSession { hours: number; dates: string[]; from: string[] }

/**
 * Free sessions a subject GAINED — a substitute taught it in someone else's
 * slot, so its syllabus advances without spending any of its own hours. Keyed by
 * the taught subject's own plan.
 */
export function bonusSessions(records: SubCoverageRecord[]): Record<string, BonusSession> {
  const out: Record<string, BonusSession> = {}
  for (const r of records) {
    if (r.intent !== 'other-subject' || !r.taughtSubject || !(r.hours > 0)) continue
    const k = planKey(r.taughtSubject, r.section)
    const cur = out[k] ?? { hours: 0, dates: [], from: [] }
    cur.hours += r.hours
    if (!cur.dates.includes(r.date)) cur.dates.push(r.date)
    if (!cur.from.includes(r.subject)) cur.from.push(r.subject)
    out[k] = cur
  }
  for (const k in out) out[k].hours = round1(out[k].hours)
  return out
}

/**
 * Claimed-but-unconfirmed covers, for the teacher who was away — v6's guard
 * against a substitute's claim silently counting as syllabus progress.
 */
export function awaitingConfirmation(
  records: SubCoverageRecord[],
  opts?: { subject?: string; section?: string; teacher?: string },
): SubCoverageRecord[] {
  return records
    .filter(r => r.intent === 'continue' && !r.confirmedAt)
    .filter(r => !opts?.subject || r.subject === opts.subject)
    .filter(r => !opts?.section || r.section === opts.section)
    .filter(r => !opts?.teacher || r.absent === opts.teacher)
    .sort((a, b) => a.date.localeCompare(b.date))
}

/** Every record touching one (subject, section), newest first. */
export function recordsFor(
  records: SubCoverageRecord[], subject: string, section: string,
): SubCoverageRecord[] {
  return records
    .filter(r => r.section === section && (r.subject === subject || r.taughtSubject === subject))
    .sort((a, b) => b.date.localeCompare(a.date))
}
