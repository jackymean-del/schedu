/**
 * Adaptive grade / class-name parser — the SINGLE source of truth for turning
 * whatever a user types into a comparable numeric level, so class ranges work
 * regardless of naming convention. (Previously three separate copies diverged,
 * which caused "entered I–V but generated up to X".)
 *
 * Level scheme (kept compatible with the app's canonical grade lists):
 *   Pre-primary years →  -2 (Nursery), -1 (Lower-KG year), 0 (Upper-KG/Kindergarten year)
 *   Class / Grade / Standard / Year / Form N (roman or arabic) →  N
 *
 * Coverage (researched across IN / US / UK / intl systems):
 *   Earliest    : Nursery, Playgroup, Pre-Nursery, Toddler, Creche, Day-care, Balvatika
 *   Lower-KG yr : LKG, Lower KG, Jr KG, Junior KG, Pre-K, Pre-KG, Pre-Kindergarten,
 *                 KG1 / KG-1 / K1 / PP1 / PP-1 / Pre-Primary 1 / FS1 / Foundation 1 / Montessori 1
 *   Upper-KG yr : UKG, Upper KG, Sr KG, Senior KG, Kindergarten, KG, Reception, Year R, Prep,
 *                 KG2 / KG-2 / K2 / PP2 / PP-2 / Pre-Primary 2 / FS2 / Foundation 2 / Montessori 2
 *   Grades      : Class / Grade / Std / Standard / Year / Form / Level + roman or arabic;
 *                 US Freshman/Sophomore/Junior/Senior → 9/10/11/12
 */

const ROMAN: Record<string, number> = { i: 1, v: 5, x: 10, l: 50, c: 100, d: 500, m: 1000 }

export function romanToInt(s: string): number {
  const str = (s ?? '').toLowerCase()
  let t = 0
  for (let i = 0; i < str.length; i++) {
    const c = ROMAN[str[i]]; const n = ROMAN[str[i + 1]]
    if (!c) return 0
    t += n && c < n ? -c : c
  }
  return t
}

export function toRoman(n: number): string {
  if (n <= 0) return ''
  const table: [number, string][] = [[1000,'M'],[900,'CM'],[500,'D'],[400,'CD'],[100,'C'],[90,'XC'],[50,'L'],[40,'XL'],[10,'X'],[9,'IX'],[5,'V'],[4,'IV'],[1,'I']]
  let r = ''
  for (const [v, sym] of table) while (n >= v) { r += sym; n -= v }
  return r
}

/**
 * Tidy a typed grade label into a clean canonical form, fixing odd spacing /
 * hyphenation ("std-  i" / "Std - I" → "Std-I", "grade 1" → "Grade-1",
 * "class i" → "Class-I"). Pre-primary names become standard short forms.
 * Unrecognized input is just whitespace-collapsed (never destroyed).
 */
export function tidyGradeLabel(raw?: string): string {
  const s = (raw ?? '').trim().replace(/\s+/g, ' ')
  if (!s) return ''
  const low = s.toLowerCase()

  // Pre-primary canonical forms
  if (/\bplay\s*group\b/.test(low)) return 'Playgroup'
  if (/\bpre[\s-]*nursery\b/.test(low)) return 'Pre-Nursery'
  if (/\bnursery\b/.test(low)) return 'Nursery'
  if (/\b(lkg|lower\s*kg|jr\.?\s*kg|junior\s*kg)\b/.test(low)) return 'LKG'
  if (/\b(ukg|upper\s*kg|sr\.?\s*kg|senior\s*kg)\b/.test(low)) return 'UKG'
  if (/\bpre[\s-]*k(?!g)\b/.test(low)) return 'Pre-K'
  if (/\breception\b/.test(low)) return 'Reception'
  if (/\bkindergarten\b/.test(low)) return 'Kindergarten'
  const ppn = low.match(/\b(kg|k|pp|pre[\s-]*primary|preprimary)\s*[-\s]?([12])\b/)
  if (ppn) {
    const fam = /^p/.test(ppn[1]) ? 'PP' : ppn[1] === 'k' ? 'K' : 'KG'
    return `${fam}${ppn[2]}`
  }

  // Prefixed grade: Class/Grade/Std/Standard/Year/Form/Level + roman|arabic
  const m = low.match(/^(class|grade|standard|std|year|form|level|grd|cls|cl)\s*[-\s]*([ivxlcdm]+|\d+)$/)
  if (m) {
    const pref: Record<string, string> = {
      class: 'Class', cls: 'Class', cl: 'Class', grade: 'Grade', grd: 'Grade',
      standard: 'Standard', std: 'Std', year: 'Year', form: 'Form', level: 'Level',
    }
    const num = /^\d+$/.test(m[2]) ? m[2] : m[2].toUpperCase()
    return `${pref[m[1]] ?? m[1]}-${num}`
  }
  return s
}

/** Parse a grade/class label into a numeric level; null if unrecognizable. */
export function parseGradeLevel(raw?: string): number | null {
  let s = (raw ?? '').trim().toLowerCase()
  if (!s) return null
  s = s.replace(/[._]+/g, ' ').replace(/\s+/g, ' ')

  // Numbered kindergarten / pre-primary FIRST (KG1, KG-2, K2, PP1, PP-2,
  // Pre-Primary 2, FS1, Foundation 2, Balvatika 1/2, Montessori 1/2).
  const num = s.match(/\b(?:pre[\s-]*kg|prekg|u?kg|kg|k|pp|pre[\s-]*primary|preprimary|fs|foundation|balvatika|bal|montessori|m)\s*[-\s]?([12])\b/)
  if (num) return -2 + parseInt(num[1], 10)   // 1 → -1 (lower-KG), 2 → 0 (upper-KG)

  // Earliest years → Nursery level (-2)
  if (/\b(nursery|play\s*group|playgroup|pre[\s-]*nursery|toddler|cr[eè]che|creche|day\s*care|balvatika)\b/.test(s)) return -2
  // Lower-KG year (-1)
  if (/\b(lkg|l k g|lower\s*kg|lower\s*kindergarten|jr\.?\s*kg|junior\s*kg|junior\s*kindergarten|pre[\s-]*k|pre[\s-]*kg|pre[\s-]*kindergarten)\b/.test(s)) return -1
  // Upper-KG / kindergarten year (0)
  if (/\b(ukg|u k g|upper\s*kg|upper\s*kindergarten|sr\.?\s*kg|senior\s*kg|senior\s*kindergarten|kindergarten|kg|reception|year\s*r|prep|foundation\s*stage)\b/.test(s)) return 0

  // US named high-school years
  if (/\bfreshman\b/.test(s))  return 9
  if (/\bsophomore\b/.test(s)) return 10
  if (/\bjunior\b/.test(s))    return 11
  if (/\bsenior\b/.test(s))    return 12

  // Class / Grade / Standard / Std / Year / Form / Level N (arabic, then roman)
  const ar = s.match(/(\d+)/)
  if (ar) return parseInt(ar[1], 10)
  const rom = s.match(/\b([ivxlcdm]+)\b/)
  if (rom) { const r = romanToInt(rom[1]); if (r > 0) return r }
  return null
}
