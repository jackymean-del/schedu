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
 * Components re-render on change via the 'schedu-terms-changed' window event
 * (see useTerms in the consuming pages).
 */

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

export function loadTerms(uid: string): Terms {
  try {
    const raw = localStorage.getItem(`${KEY}:${uid}`)
    if (raw) return { ...TERM_DEFAULTS, ...JSON.parse(raw) }
  } catch { /* corrupted → defaults */ }
  return { ...TERM_DEFAULTS }
}

export function saveTerms(uid: string, terms: Terms): void {
  try { localStorage.setItem(`${KEY}:${uid}`, JSON.stringify(terms)) } catch { /* quota */ }
  window.dispatchEvent(new Event('schedu-terms-changed'))
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
