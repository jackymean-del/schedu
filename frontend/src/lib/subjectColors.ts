/**
 * Subject colour engine — one colour per subject, identical everywhere it
 * appears (Live, Day grid, Month, the schedule view). Colour encodes SUBJECT
 * only; teachers and venues are identified by their name/text, not colour, to
 * avoid rainbow noise.
 *
 * Grayscale / black-and-white: the accents spread across the hue wheel, but do
 * NOT reliably survive printing in mono — measured, the closest pair differs by
 * 0.0003 in relative luminance, which is invisible. A solid-fill palette cannot
 * give 20 separable greys, so the subject name (or short code) is always shown
 * as text: that is the guaranteed B&W-legible identifier, and colour is only
 * the fast on-screen scan aid.
 */

// Accents ordered to spread hue and luminance (dark reds → mid → light-ish →
// deep violets), so a hash distributes subjects across visibly different tones.
const ACCENTS = [
  '#B91C1C', '#EA580C', '#B45309', '#CA8A04', '#4D7C0F',
  '#15803D', '#0F766E', '#0891B2', '#0369A1', '#1D4ED8',
  '#4338CA', '#6D28D9', '#7E22CE', '#A21CAF', '#BE185D',
  '#9F1239', '#57534E', '#065F46', '#1E40AF', '#831843',
]

function hash(s: string): number {
  let h = 0
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0
  return h
}

export interface SubjectColor { accent: string; bg: string }

/** Deterministic colour for a subject name. `bg` is a ~10% tint of the accent,
 *  so dark accent text stays readable on it and it prints near-white in mono. */
export function subjectColor(name: string): SubjectColor {
  // Normalised, so one subject is one colour however it was typed. Without
  // this "English" and "english " were different colours — in an app that
  // deliberately allows names to vary in exactly that way.
  const accent = ACCENTS[hash((name ?? '').trim().toLowerCase() || 'x') % ACCENTS.length]
  return { accent, bg: accent + '1A' }
}
