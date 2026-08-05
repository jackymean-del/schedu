/**
 * Institution naming — the five display words every surface uses (class,
 * teacher, subject, venue, period), admin-customisable in Settings.
 *
 * A coaching centre says Batch/Faculty/Course, a UK school says Form/Staff,
 * a college says Section/Lecturer/Module, a training org says Cohort/Trainer.
 * Defaults seed from the org-type terminology map; the admin can pick any
 * suggestion or type their own word. Overrides are labels only — stored data
 * never changes — so renaming works even after a timetable is generated.
 *
 * SCOPE: the school. These used to live under `schedu-terms:<uid>`, so an
 * administrator who renamed Class to Batch renamed it for nobody but
 * themselves — the whole point being that the institution calls things what it
 * calls them. See lib/schoolScope.
 *
 * The old 'schedu-terms-changed' window event is kept and still fired, because
 * it is what non-store consumers listen on; store subscribers no longer need
 * it.
 */
import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { migrateLegacyObject } from './schoolScope'

export type TermKey = 'class' | 'teacher' | 'subject' | 'venue' | 'period'
export type Terms = Record<TermKey, string>

const KEY = 'schedu-terms'

export const TERM_DEFAULTS: Terms = {
  class: 'Class', teacher: 'Teacher', subject: 'Subject', venue: 'Venue', period: 'Period',
}

/** Researched common alternatives per term — offered as suggestions, with
 *  free-text always allowed on top. */
export const TERM_SUGGESTIONS: Record<TermKey, string[]> = {
  class:   ['Class', 'Grade', 'Section', 'Batch', 'Cohort', 'Standard', 'Form', 'Year Group', 'Group', 'Division'],
  teacher: ['Teacher', 'Faculty', 'Educator', 'Instructor', 'Lecturer', 'Tutor', 'Professor', 'Trainer', 'Coach', 'Mentor'],
  subject: ['Subject', 'Course', 'Module', 'Paper', 'Discipline', 'Unit', 'Topic'],
  venue:   ['Venue', 'Room', 'Classroom', 'Hall', 'Lab', 'Space', 'Location', 'Studio'],
  period:  ['Period', 'Session', 'Lecture', 'Slot', 'Block', 'Hour', 'Lesson'],
}

interface NamingState {
  terms: Terms
  /** True once a school has chosen its own words — migration must not stomp them. */
  customised: boolean
  setTerms: (t: Terms) => void
  reset: () => void
}

export const useNamingTerms = create<NamingState>()(
  persist(
    (set) => ({
      terms: { ...TERM_DEFAULTS },
      customised: false,
      setTerms: (t) => {
        set({ terms: t, customised: true })
        try { window.dispatchEvent(new Event('schedu-terms-changed')) } catch { /* SSR/tests */ }
      },
      reset: () => set({ terms: { ...TERM_DEFAULTS }, customised: false }),
    }),
    { name: KEY },
  ),
)

/** Read without subscribing — for the handful of non-React callers. */
export function loadTerms(): Terms {
  return { ...TERM_DEFAULTS, ...useNamingTerms.getState().terms }
}

export function saveTerms(terms: Terms): void {
  useNamingTerms.getState().setTerms(terms)
}

/**
 * Fold one account's naming words onto the school, once.
 *
 * Where two administrators disagree there is no honest merge, so the first
 * account's wins (keys are sorted, so it is stable) — and a school that has
 * already chosen its words keeps them untouched.
 */
export function migrateLegacyNaming(storage: Storage = localStorage): boolean {
  return migrateLegacyObject<Partial<Terms>>({
    baseKey: KEY,
    storage,
    alreadySet: useNamingTerms.getState().customised,
    commit: (value) => useNamingTerms.getState().setTerms({ ...TERM_DEFAULTS, ...value }),
  })
}

/** English pluraliser good enough for naming words; irregulars covered. */
export function plural(word: string): string {
  const w = word.trim()
  if (!w) return w
  const lower = w.toLowerCase()
  const INVARIANT = ['faculty', 'staff', 'personnel']
  if (INVARIANT.includes(lower)) return w
  if (/[sxz]$/i.test(w) || /[cs]h$/i.test(w)) return w + 'es'
  if (/[^aeiou]y$/i.test(w)) return w.slice(0, -1) + 'ies'
  return w + 's'
}
