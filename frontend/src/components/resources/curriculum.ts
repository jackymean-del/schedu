/**
 * curriculum.ts — SchedU AI Curriculum Intelligence Engine v2
 *
 * Comprehensive knowledge base covering:
 *   CBSE · ICSE/ISC · IB (PYP/MYP/DP) · Cambridge · Custom
 *
 * Public API:
 *   generateShortName(name)                              — AI shortform engine
 *   suggestClassesForSubject(name, sections, board)      — grade + stream mapping
 *   suggestSlotsPerWeek(name, gradeGroup, board)         — slot recommendation
 *   getSubjectHint(name, board)                         — confidence hint text
 *   normalizeBoardType(raw)                              — BoardType → CurriculumBoard
 *   getGrade(sectionName)                                — "IX-Sci-A" → "IX"
 *   getGradeGroup(grade)                                 — "IX" → "secondary"
 *   gradeKey(grade)                                      — sort key
 *   detectStream(sectionName)                            — stream classification
 */

// ─── Types ────────────────────────────────────────────────────────────────────
export type CurriculumBoard = 'CBSE' | 'ICSE' | 'IB' | 'Cambridge' | 'Custom'
export type GradeGroup      = 'preK' | 'primary' | 'middle' | 'secondary' | 'srSec'
export type Stream          = 'science' | 'commerce' | 'arts' | 'general' | 'pcb'

export const BOARD_LABELS: Record<CurriculumBoard, string> = {
  CBSE:      'CBSE',
  ICSE:      'ICSE / ISC',
  IB:        'IB (PYP/MYP/DP)',
  Cambridge: 'Cambridge',
  Custom:    'Custom',
}

/** Normalize the app's BoardType string into CurriculumBoard */
export function normalizeBoardType(raw: string | undefined): CurriculumBoard {
  if (!raw) return 'CBSE'
  const u = raw.toUpperCase()
  if (u === 'CBSE')              return 'CBSE'
  if (u === 'ICSE' || u === 'ISC') return 'ICSE'
  if (u === 'IB')                return 'IB'
  if (u === 'CAMBRIDGE')         return 'Cambridge'
  return 'CBSE'  // Default for STATE / OTHER / Custom
}

// ─── Grade utilities ──────────────────────────────────────────────────────────
export const GRADE_GROUP_MAP = new Map<string, GradeGroup>([
  // Pre-primary
  ['Nursery', 'preK'], ['LKG', 'preK'], ['UKG', 'preK'],
  ['KG',  'preK'], ['KG1', 'preK'], ['KG2', 'preK'],
  ['PP1', 'preK'], ['PP2', 'preK'], ['PreK', 'preK'],
  ['EY1', 'preK'], ['EY2', 'preK'],
  // Primary  (Roman numerals + Arabic)
  ['I', 'primary'], ['II', 'primary'], ['III', 'primary'], ['IV', 'primary'], ['V', 'primary'],
  ['1', 'primary'], ['2', 'primary'], ['3', 'primary'], ['4', 'primary'], ['5', 'primary'],
  // Middle
  ['VI', 'middle'], ['VII', 'middle'], ['VIII', 'middle'],
  ['6',  'middle'], ['7',  'middle'], ['8',   'middle'],
  // Secondary
  ['IX', 'secondary'], ['X', 'secondary'],
  ['9',  'secondary'], ['10','secondary'],
  // Sr. Secondary
  ['XI',  'srSec'], ['XII', 'srSec'],
  ['11',  'srSec'], ['12',  'srSec'],
])

export const GRADE_ORDER = [
  'Nursery','LKG','UKG','KG','KG1','KG2','PP1','PP2','PreK','EY1','EY2',
  'I','II','III','IV','V',
  'VI','VII','VIII',
  'IX','X',
  'XI','XII',
]

export function getGradeGroup(grade: string): GradeGroup {
  return GRADE_GROUP_MAP.get(grade) ?? 'middle'
}

export function gradeKey(g: string): number {
  const i = GRADE_ORDER.indexOf(g)
  return i >= 0 ? i : 100 + g.charCodeAt(0)
}

/** Grade tokens recognised at the START of a section name, longest-first so
 *  "VIII" matches before "V", "XII"/"XI" before "X", "12" before "1/2". */
const GRADE_TOKENS: string[] = [
  ...GRADE_ORDER,
  '1','2','3','4','5','6','7','8','9','10','11','12',
].sort((a, b) => b.length - a.length)

/**
 * Extract grade from a section name.
 * "IX-Sci-A" → "IX", "VI-D" → "VI", "Nursery-A" → "Nursery",
 * "XI-Spark-1" → "XI", "XII-Com-A" → "XII", "10-B" → "10"
 *
 * Matches a known grade token at the start (robust for multi-segment names
 * like "XI-Spark-1" where the old lastIndexOf('-') heuristic wrongly yielded
 * "XI-Spark" and mis-grouped the section as middle school).
 */
export function getGrade(sectionName: string): string {
  const t = sectionName.trim()
  for (const g of GRADE_TOKENS) {
    // token must be followed by a separator or end-of-string (so "I" never
    // matches inside "III", and "X" never matches inside "XII")
    if (new RegExp(`^${g}(?=$|[\\s\\-_/])`, 'i').test(t)) {
      // normalise case for Roman/word tokens to the canonical GRADE_ORDER spelling
      const canon = GRADE_ORDER.find(o => o.toLowerCase() === g.toLowerCase())
      return canon ?? g
    }
  }
  // Fallback: original suffix-stripping heuristic
  const idx = t.lastIndexOf('-')
  if (idx > 0 && t.slice(idx + 1).length <= 5)
    return t.slice(0, idx).replace(/-(sci|com|arts?|hum|gen|pcm|pcb|lit)$/i, '').trim()
  return t
}

/**
 * Detect stream from a section name. Robust to a trailing section NUMBER —
 * the marker may be followed by a digit ("XI-COM1", "XI-HUM2") because schools
 * number multiple sections of the same stream. (The old `\bcom\b` required a
 * word boundary right after "com", so "COM1" silently fell through to science.)
 *
 *   "XI-Sci-A" / "XI-A1" (Spark) → 'science'   "XII-Com" / "XI-COM1" → 'commerce'
 *   "XI-Hum" / "XI-HUM2"         → 'arts'      "XI-PCB-A" / "XI-Bot"  → 'pcb'
 *
 * Order matters: the most specific stream markers (commerce, humanities) are
 * tested first so they win over the science fall-through. "Spark" is a gifted
 * cohort that studies the science curriculum, so it maps to 'science' (the
 * caller's class list, or an explicit PCB/Bio/Bot/Zoo marker, distinguishes the
 * Botany–Zoology medical track).
 */
export function detectStream(sectionName: string): Stream {
  const n = sectionName.toLowerCase()
  // Commerce — "com", "com1", "commerce", "bst", "acc"; never "computer"/"comp".
  if (/commerce|\bcom(?!p)|\bbst\b|\bacc/.test(n))              return 'commerce'
  // Humanities / Arts — tolerant of a section-number suffix (hum1, arts2).
  if (/\bhum|humanities|\barts?\b|\blit\b/.test(n))            return 'arts'
  // Explicit medical / PCB biology track — Botany + Zoology split.
  if (/\bpcb\b|\bbot\b|\bzoo\b|\bbio\b/.test(n))               return 'pcb'
  // Science / PCM, and the "Spark" gifted cohort (science by curriculum).
  if (/\bsci\b|\bpcm\b|\bphysics\b|\bspark\b|\bspa\b/.test(n)) return 'science'
  return 'general'
}

/** A section as the curriculum engine sees it: a name plus the optional
 *  explicit stream the user picked on the Classes tab. */
export interface SectionLike { name: string; stream?: string }

/**
 * Resolve a section's stream for subject assignment.
 *
 * The EXPLICIT stream set on the section (Classes tab — "Science", "Spark",
 * "Commerce", "Humanities") is authoritative, so a section called anything at
 * all is assigned by its stream, NOT by guessing from its name. Name-based
 * `detectStream` is only the fallback when no stream is recorded.
 *
 * "Spark" is a gifted cohort following the science curriculum → 'science'
 * (an explicit Bio/PCB/Botany/Zoology stream routes to the medical track).
 */
export function resolveStream(section: SectionLike): Stream {
  const s = (section.stream ?? '').trim().toLowerCase()
  if (s && s !== 'general') {
    if (/spark|\bsci|pcm|physics|stem|non[\s-]?med/.test(s)) return 'science'
    if (/pcb|bio|botan|zoolog|medical|\bmed\b/.test(s))      return 'pcb'
    if (/com(?!p)|commerce/.test(s))                         return 'commerce'
    if (/hum|\barts?\b|\blit\b/.test(s))                     return 'arts'
    // an unrecognised explicit stream → fall through to name-based detection
  }
  return detectStream(section.name)
}

// ─── AI Shortform Engine ──────────────────────────────────────────────────────
/** Board-standard academic abbreviations — 70+ entries */
export const SHORT_MAP: Record<string, string> = {
  // Core academics
  'Mathematics':              'MATH',
  'Mathematics (Optional)':   'MATH OPT',
  'Applied Mathematics':      'APPL MATH',
  'English':                  'ENG',
  'English Language':         'ENG LANG',
  'English Literature':       'ENG LIT',
  'Science':                  'SCI',
  'Social Studies':           'SST',
  'Social Science':           'SOC SCI',
  // Sciences
  'Physics':                  'PHY',
  'Chemistry':                'CHEM',
  'Biology':                  'BIO',
  'Botany':                   'BOT',
  'Zoology':                  'ZOO',
  'Biotechnology':            'BIOTECH',
  'Environmental Studies':    'EVS',
  'Environmental Science':    'ENV SCI',
  'EVS':                      'EVS',
  // Indian languages
  'Hindi':                    'HIN',
  'Sanskrit':                 'SANS',
  'Sanskrit / MIL':           'SANS',
  'Odia':                     'ODI',
  'Odia / Regional Language': 'ODI',
  'Tamil':                    'TAM',
  'Telugu':                   'TEL',
  'Kannada':                  'KAN',
  'Malayalam':                'MAL',
  'Gujarati':                 'GUJ',
  'Punjabi':                  'PUN',
  'Marathi':                  'MAR',
  'Urdu':                     'URD',
  'Bengali':                  'BEN',
  // Foreign languages
  'French':                   'FRN',
  'German':                   'GER',
  'Spanish':                  'SPA',
  'Arabic':                   'ARB',
  'Japanese':                 'JPN',
  'Mandarin':                 'MAN',
  // Technology
  'Computer Science':         'CS',
  'Informatics Practices':    'IP',
  'Artificial Intelligence':  'AI',
  'Information Technology':   'IT',
  // Commerce & Economics
  'Accountancy':              'ACC',
  'Business Studies':         'BST',
  'Economics':                'ECO',
  'Entrepreneurship':         'ENT',
  'Legal Studies':            'LEGAL',
  'Statistics':               'STAT',
  // Humanities
  'History':                  'HIST',
  'Geography':                'GEO',
  'Political Science':        'POL SCI',
  'Civics':                   'CIVIC',
  'Psychology':               'PSY',
  'Sociology':                'SOC',
  'Philosophy':               'PHIL',
  // Activities / CCA
  'Physical Education':       'PE',
  'Art & Craft':              'ART',
  'Fine Arts':                'FINE ART',
  'Drawing':                  'DRW',
  'Music':                    'MUS',
  'Dance':                    'DANCE',
  'Library':                  'LIB',
  'Moral Science':            'MS',
  'SUPW / Life Skills':       'SUPW',
  'Life Skills':              'LIFE SKL',
  'Yoga & Health':            'YOGA',
  'Scout & Guide':            'SCOUT',
  'Activity / Free Play':     'ACT',
  'Nursery Rhymes & Stories': 'NRS',
  'Number Work':              'NUM',
  'G.K.':                     'GK',
  'General Knowledge':        'GK',
  'Home Science':             'HOME SCI',
  'Vocational Studies':       'VOC',
}

export function generateShortName(name: string): string {
  const n = name.trim()
  if (!n) return ''
  // Exact match
  if (SHORT_MAP[n]) return SHORT_MAP[n]
  const lower = n.toLowerCase()
  // Case-insensitive exact
  for (const [k, v] of Object.entries(SHORT_MAP))
    if (k.toLowerCase() === lower) return v
  // Prefix match ("Hindi Language" → HIN)
  for (const [k, v] of Object.entries(SHORT_MAP)) {
    if (lower.startsWith(k.toLowerCase() + ' ')) {
      const suffix = lower.slice(k.length + 1).slice(0, 3).toUpperCase()
      return `${v} ${suffix}`.trim()
    }
  }
  // Build acronym from meaningful words
  const stop = new Set(['and','the','of','in','for','a','an','&','/','to','by','at','&'])
  const words = n.split(/[\s/&()+,\-]+/)
    .filter(w => w.length > 1 && !/^\d+$/.test(w) && !stop.has(w.toLowerCase()))
  if (words.length === 0) return n.slice(0, 5).toUpperCase()
  if (words.length === 1) {
    const w = words[0].toUpperCase()
    return w.length <= 5 ? w : w.slice(0, 4)
  }
  if (words.length === 2) {
    const [a, b] = words.map(w => w.toUpperCase())
    if (a.length + b.length <= 6) return `${a} ${b}`
    return `${a.slice(0, 3)} ${b.slice(0, 3)}`
  }
  return words.slice(0, 3).map(w => w[0].toUpperCase()).join('')
}

// ─── Subject Rule Definition ──────────────────────────────────────────────────
type SlotMap = Partial<Record<GradeGroup, number>>

export interface SubjectRule {
  grades:          GradeGroup[]      // grade groups where this subject applies
  streams?:        Stream[]          // srSec stream restriction (omit = all streams)
  slots:           SlotMap           // CBSE default slots/week
  icseSlots?:      SlotMap           // ICSE/ISC override
  ibSlots?:        SlotMap           // IB (PYP/MYP/DP) override
  cambridgeSlots?: SlotMap           // Cambridge override
  requiresLab?:    boolean
  isLanguage?:     boolean
  isActivity?:     boolean
  hint:            string            // human-readable curriculum rationale
}

// ─── Curriculum Knowledge Base ────────────────────────────────────────────────
/**
 * 50+ subjects with grade mappings, stream rules, and board-specific
 * slot recommendations derived from:
 *   CBSE Academic Calendar / NCERT Framework
 *   ICSE/ISC Council Syllabus
 *   IB PYP/MYP/DP Framework documents
 *   Cambridge Primary/Secondary/IGCSE/A-Level specifications
 */
export const CURRICULUM: Record<string, SubjectRule> = {

  // ── Universal — all levels, all boards ───────────────────────────────────────
  'English': {
    grades: ['preK','primary','middle','secondary','srSec'],
    isLanguage: true,
    slots:           { preK: 4, primary: 6, middle: 6, secondary: 5, srSec: 3 },
    icseSlots:       { preK: 5, primary: 7, middle: 7, secondary: 6, srSec: 4 },
    ibSlots:         { preK: 5, primary: 7, middle: 6, secondary: 6, srSec: 5 },
    cambridgeSlots:  { preK: 5, primary: 7, middle: 7, secondary: 6, srSec: 5 },
    hint: 'Core language — mandatory at every grade level across all boards',
  },
  'Physical Education': {
    grades: ['preK','primary','middle','secondary','srSec'],
    isActivity: true,
    slots:    { preK: 3, primary: 2, middle: 2, secondary: 2, srSec: 1 },
    ibSlots:  { preK: 4, primary: 3, middle: 3, secondary: 3, srSec: 2 },
    hint: 'Mandatory co-curricular — all grade levels, all boards',
  },
  'Painting': {
    grades: ['preK','primary','middle','secondary','srSec'],
    isActivity: true,
    slots: { preK: 2, primary: 2, middle: 1, secondary: 1, srSec: 1 },
    hint: 'Fine arts / painting — co-curricular rotation at XI–XII alongside PE and Library',
  },
  'Art & Craft': {
    grades: ['preK','primary','middle','secondary'],
    isActivity: true,
    slots: { preK: 3, primary: 2, middle: 2, secondary: 1 },
    hint: 'Creative arts — CBSE/ICSE through Class X; typically discontinued at XI–XII',
  },
  'Music': {
    grades: ['preK','primary','middle'],
    isActivity: true,
    slots: { preK: 2, primary: 1, middle: 1 },
    hint: 'CCA subject — pre-primary through middle school (VI–VIII)',
  },
  'Dance': {
    grades: ['preK','primary','middle'],
    isActivity: true,
    slots: { preK: 2, primary: 1, middle: 1 },
    hint: 'CCA subject — pre-primary through middle school',
  },
  'Library': {
    grades: ['preK','primary','middle','secondary','srSec'],
    isActivity: true,
    slots: { preK: 1, primary: 1, middle: 1, secondary: 1, srSec: 1 },
    hint: 'Library period — common across all grades, including the XI–XII PE/Painting/Library rotation',
  },
  'Moral Science': {
    grades: ['preK','primary','middle','secondary'],
    isActivity: true,
    slots: { preK: 1, primary: 1, middle: 1, secondary: 1 },
    hint: 'Value education — CBSE/ICSE through Class X; omitted in IB/Cambridge',
  },
  'Yoga & Health': {
    grades: ['primary','middle','secondary'],
    isActivity: true,
    slots: { primary: 1, middle: 1, secondary: 1 },
    hint: 'Health & wellness — Indian school operational practice',
  },
  'G.K.': {
    grades: ['preK','primary','middle'],
    isActivity: true,
    slots: { preK: 1, primary: 2, middle: 1 },
    hint: 'General Knowledge — phased out by upper-middle school in CBSE/ICSE',
  },
  'General Knowledge': {
    grades: ['preK','primary','middle'],
    isActivity: true,
    slots: { preK: 1, primary: 2, middle: 1 },
    hint: 'Same as G.K. — general awareness for pre-primary through middle',
  },
  'Scout & Guide': {
    grades: ['primary','middle','secondary'],
    isActivity: true,
    slots: { primary: 1, middle: 1, secondary: 1 },
    hint: 'Co-curricular — Indian school operational practice',
  },
  'Drawing': {
    grades: ['primary','middle','secondary'],
    isActivity: true,
    slots: { primary: 2, middle: 1, secondary: 1 },
    hint: 'Technical / fine arts drawing — primary through Class X',
  },
  'SUPW / Life Skills': {
    grades: ['middle','secondary'],
    isActivity: true,
    slots: { middle: 2, secondary: 1 },
    hint: 'Socially Useful Productive Work — CBSE middle and secondary levels',
  },
  'Life Skills': {
    grades: ['middle','secondary'],
    isActivity: true,
    slots: { middle: 2, secondary: 1 },
    hint: 'Life skills development — various boards, middle and secondary',
  },

  // ── Pre-K only ────────────────────────────────────────────────────────────────
  'Nursery Rhymes & Stories': {
    grades: ['preK'],
    isActivity: true,
    slots: { preK: 3 },
    hint: 'Pre-primary only — language development through rhymes and storytelling',
  },
  'Activity / Free Play': {
    grades: ['preK'],
    isActivity: true,
    slots: { preK: 4 },
    hint: 'Pre-primary developmental activity — Nursery, LKG, UKG only',
  },
  'Number Work': {
    grades: ['preK'],
    slots: { preK: 4 },
    hint: 'Pre-primary numeracy — replaces Mathematics at Nursery–UKG level',
  },
  'EVS': {
    grades: ['preK','primary'],
    slots:     { preK: 3, primary: 4 },
    icseSlots: { preK: 3, primary: 5 },
    hint: 'Environmental Studies — CBSE: pre-primary + primary (Nursery–V); ICSE: greater emphasis through V',
  },
  // 'Environmental Studies' intentionally omitted.
  // "EST" in Indian school timetables = Extra Study Time (a free/self-study period),
  // NOT a curriculum subject. Use the 'EVS' entry above for Nursery–Class V.

  // ── Primary (I–V) ─────────────────────────────────────────────────────────────
  'Mathematics': {
    grades: ['primary','middle','secondary','srSec'],
    slots:           { primary: 6, middle: 6, secondary: 6, srSec: 6 },
    icseSlots:       { primary: 6, middle: 6, secondary: 7, srSec: 6 },
    ibSlots:         { primary: 7, middle: 5, secondary: 5, srSec: 6 },
    cambridgeSlots:  { primary: 7, middle: 6, secondary: 6, srSec: 5 },
    hint: 'Core academic — introduced in primary, continues through Sr. Secondary across all streams',
  },
  'Hindi': {
    grades: ['primary','middle','secondary'],
    isLanguage: true,
    slots: { primary: 4, middle: 4, secondary: 3 },
    hint: 'Second language (CBSE/ICSE India) — primary through Class X; not continued at XI–XII',
  },
  'Sanskrit': {
    grades: ['middle','secondary'],
    isLanguage: true,
    slots: { middle: 3, secondary: 2 },
    hint: 'Classical language elective — CBSE Class VI–X; not in IB/Cambridge',
  },
  'Sanskrit / MIL': {
    grades: ['middle','secondary'],
    isLanguage: true,
    slots: { middle: 3, secondary: 2 },
    hint: 'Third language / Modern Indian Language — CBSE/ICSE Class VI–X',
  },
  'Odia / Regional Language': {
    grades: ['primary','middle','secondary'],
    isLanguage: true,
    slots: { primary: 3, middle: 3, secondary: 2 },
    hint: 'Mother-tongue / regional language — primary through Class X in Indian boards',
  },
  'Tamil':     { grades: ['primary','middle','secondary'], isLanguage: true, slots: { primary: 4, middle: 4, secondary: 3 }, hint: 'Regional language — Tamil Nadu schools, primary through secondary' },
  'Telugu':    { grades: ['primary','middle','secondary'], isLanguage: true, slots: { primary: 4, middle: 4, secondary: 3 }, hint: 'Regional language — AP/Telangana schools, primary through secondary' },
  'Kannada':   { grades: ['primary','middle','secondary'], isLanguage: true, slots: { primary: 4, middle: 4, secondary: 3 }, hint: 'Regional language — Karnataka schools, primary through secondary' },
  'Malayalam': { grades: ['primary','middle','secondary'], isLanguage: true, slots: { primary: 4, middle: 4, secondary: 3 }, hint: 'Regional language — Kerala schools, primary through secondary' },
  'Gujarati':  { grades: ['primary','middle','secondary'], isLanguage: true, slots: { primary: 4, middle: 4, secondary: 3 }, hint: 'Regional language — Gujarat schools' },
  'Punjabi':   { grades: ['primary','middle','secondary'], isLanguage: true, slots: { primary: 4, middle: 4, secondary: 3 }, hint: 'Regional language — Punjab schools' },
  'Marathi':   { grades: ['primary','middle','secondary'], isLanguage: true, slots: { primary: 4, middle: 4, secondary: 3 }, hint: 'Regional language — Maharashtra schools' },
  'Bengali':   { grades: ['primary','middle','secondary'], isLanguage: true, slots: { primary: 4, middle: 4, secondary: 3 }, hint: 'Regional language — West Bengal / Bengali-medium schools' },
  'Urdu':      { grades: ['primary','middle','secondary'], isLanguage: true, slots: { primary: 4, middle: 4, secondary: 3 }, hint: 'Language subject — CBSE/ICSE schools' },
  'French': {
    grades: ['middle','secondary','srSec'],
    isLanguage: true,
    slots:           { middle: 3, secondary: 4, srSec: 5 },
    cambridgeSlots:  { middle: 4, secondary: 5, srSec: 6 },
    hint: 'Foreign language — introduced middle school (VI); full elective at XI–XII',
  },
  'German': {
    grades: ['middle','secondary','srSec'],
    isLanguage: true,
    slots: { middle: 3, secondary: 4, srSec: 5 },
    hint: 'Foreign language — middle school onwards; popular in CBSE international schools',
  },
  'Spanish': {
    grades: ['middle','secondary','srSec'],
    isLanguage: true,
    slots: { middle: 3, secondary: 4, srSec: 5 },
    hint: 'Foreign language elective — middle school onwards',
  },
  'Arabic': {
    grades: ['primary','middle','secondary','srSec'],
    isLanguage: true,
    slots: { primary: 3, middle: 4, secondary: 4, srSec: 5 },
    hint: 'Language subject — Islamic schools, international schools, Middle East campuses',
  },
  'Computer Science': {
    grades: ['primary','middle','secondary','srSec'],
    streams: ['science','general','commerce'],  // Science + untagged + Commerce; NOT Spark (pcb) or Humanities
    slots:    { primary: 2, middle: 3, secondary: 3, srSec: 5 },
    ibSlots:  { primary: 2, middle: 3, secondary: 4, srSec: 6 },
    hint: 'CBSE: Class III+ basics, full CS from VI; standalone subject at XI–XII for Science and Commerce. NOT assigned to Spark (PCB) or Humanities.',
  },

  // ── Middle school (VI–VIII) ────────────────────────────────────────────────────
  //
  // Science scope note:
  //   Standard CBSE — Science is a unified subject from I through X (Physics/Chemistry/
  //   Biology are introduced as separate subjects only at XI–XII).
  //   Many Indian schools however split earlier: "Science" for Classes I–V (primary),
  //   then separate Physics, Chemistry, Biology from Class VI onwards.
  //   This template uses grades: ['primary','middle'] (I–VIII) so the AI engine does NOT
  //   auto-assign Science to secondary sections (IX–X) where schools often prefer the
  //   separate-subject approach.  Adjust classConfigs in Resources → Subjects if your
  //   school keeps unified Science through X.
  'Science': {
    grades: ['primary', 'middle'],
    slots:           { primary: 4, middle: 5 },
    icseSlots:       { primary: 4, middle: 5 },
    ibSlots:         { primary: 4, middle: 5 },
    cambridgeSlots:  { primary: 4, middle: 5 },
    hint: 'Unified Science — typically I–V (primary) or I–VIII (middle); Physics/Chemistry/Biology take over from IX or VI depending on school. Adjust per your board.',
  },
  'Social Studies': {
    grades: ['middle','secondary'],
    slots:     { middle: 5, secondary: 5 },
    icseSlots: { middle: 4, secondary: 4 },
    hint: 'SST (History + Geography + Civics/Pol.Sci combined) — CBSE VI–X; ICSE splits these separately',
  },

  // ── Secondary (IX–X) — science disciplines ────────────────────────────────────
  'Physics': {
    grades: ['secondary','srSec'],
    streams: ['science','general','pcb'],  // science + untagged + Spark (PCB); NOT commerce/arts
    requiresLab: true,
    slots:           { secondary: 4, srSec: 5 },
    icseSlots:       { secondary: 4, srSec: 6 },
    ibSlots:         { secondary: 5, srSec: 5 },
    cambridgeSlots:  { secondary: 5, srSec: 6 },
    hint: 'Physics — Science stream XI–XII only; 4 theory + 1 practical per week; requires lab',
  },
  'Chemistry': {
    grades: ['secondary','srSec'],
    streams: ['science','general','pcb'],  // science + untagged + Spark; NOT commerce/arts
    requiresLab: true,
    slots:           { secondary: 4, srSec: 5 },
    icseSlots:       { secondary: 4, srSec: 6 },
    ibSlots:         { secondary: 5, srSec: 5 },
    cambridgeSlots:  { secondary: 5, srSec: 6 },
    hint: 'Chemistry — Science stream XI–XII only; 4 theory + 1 practical per week; requires lab',
  },
  'Biology': {
    grades: ['secondary','srSec'],
    streams: ['science','general','pcb'],  // PCB science sections including Spark
    requiresLab: true,
    slots:           { secondary: 4, srSec: 5 },
    icseSlots:       { secondary: 4, srSec: 6 },
    ibSlots:         { secondary: 4, srSec: 5 },
    cambridgeSlots:  { secondary: 4, srSec: 5 },
    hint: 'Biology — PCB science stream at XI–XII; 4 theory + 1 practical per week; requires lab',
  },
  'Botany': {
    grades: ['srSec'],
    streams: ['pcb'],    // Spark (PCB) sections ONLY
    requiresLab: true,
    slots: { srSec: 4 },
    hint: 'Botany — Spark (PCB) sections only at XI–XII; requires lab',
  },
  'Zoology': {
    grades: ['srSec'],
    streams: ['pcb'],    // Spark (PCB) sections ONLY
    requiresLab: true,
    slots: { srSec: 4 },
    hint: 'Zoology — Spark (PCB) sections only at XI–XII; requires lab',
  },
  'Biotechnology': {
    grades: ['srSec'],
    streams: ['science'],
    requiresLab: true,
    slots: { srSec: 5 },
    hint: 'Biotechnology — Sr. Secondary Science-stream elective; lab required',
  },

  // ── Secondary — social sciences ───────────────────────────────────────────────
  'History': {
    grades: ['secondary','srSec'],
    streams: ['arts'],                // Humanities sections only (XI-HUM, XII-HUM)
    slots:     { secondary: 3, srSec: 4 },
    icseSlots: { secondary: 4, srSec: 4 },
    hint: 'History — Humanities stream only at XI–XII (4 p/w)',
  },
  'Geography': {
    grades: ['secondary','srSec'],
    streams: ['arts'],                // Humanities sections only
    slots:     { secondary: 3, srSec: 4 },
    icseSlots: { secondary: 4, srSec: 4 },
    hint: 'Geography — Humanities stream only at XI–XII (4 p/w)',
  },
  'Political Science': {
    grades: ['secondary','srSec'],
    streams: ['arts'],                // Humanities sections only
    slots:     { secondary: 2, srSec: 6 },
    icseSlots: { secondary: 3, srSec: 6 },
    hint: 'Political Science — Humanities core at XI–XII; 5–6 periods per week',
  },
  'Economics': {
    grades: ['secondary','srSec'],
    streams: ['commerce','arts'],   // Commerce + Humanities ONLY
    // Science sections that use ECO as a 5th-subject option (e.g. XI-D) should
    // add it manually — auto-assign must not push ECO onto any science/Spark section.
    slots: { secondary: 3, srSec: 5 },
    hint: 'Economics — auto-assigned to Commerce and Humanities only. Add manually to individual science sections where it is used as a 5th subject.',
  },
  'Artificial Intelligence': {
    grades: ['secondary','srSec'],
    slots: { secondary: 2, srSec: 3 },
    hint: 'AI — CBSE vocational/skill subject for Class IX–XII',
  },
  'Information Technology': {
    grades: ['secondary','srSec'],
    slots: { secondary: 3, srSec: 4 },
    hint: 'IT — vocational subject, Class IX–XII across CBSE/State boards',
  },
  'Home Science': {
    grades: ['secondary','srSec'],
    streams: ['arts','general'],
    slots: { secondary: 4, srSec: 5 },
    hint: 'Home Science — available secondary and Sr. Secondary, Arts/general stream',
  },
  'Vocational Studies': {
    grades: ['secondary','srSec'],
    streams: ['general'],
    slots: { secondary: 4, srSec: 4 },
    hint: 'Vocational Education — skill-based subject, Class IX–XII',
  },

  // ── Sr. Secondary — Science stream (XI–XII) ───────────────────────────────────
  'Mathematics (Optional)': {
    grades: ['srSec'],
    streams: ['science','commerce','general'],
    slots: { srSec: 6 },
    hint: 'Optional/PCM Mathematics — CBSE XI–XII for Science (PCM) and Commerce streams',
  },
  'Applied Mathematics': {
    grades: ['srSec'],
    streams: ['commerce','arts','general'],
    slots: { srSec: 5 },
    hint: 'Applied Mathematics — CBSE XI–XII alternative to pure Math for non-PCM streams',
  },
  'Informatics Practices': {
    grades: ['srSec'],
    streams: ['science','commerce','general'],
    slots: { srSec: 4 },
    hint: 'IP — CBSE XI–XII alternative to CS; Science and Commerce streams',
  },

  // ── Sr. Secondary — Commerce stream (XI–XII) ─────────────────────────────────
  'Accountancy': {
    grades: ['srSec'],
    streams: ['commerce'],
    slots: { srSec: 6 },
    hint: 'Accountancy — Commerce stream core subject at XI–XII; 5 theory + 1 practical per week',
  },
  'Business Studies': {
    grades: ['srSec'],
    streams: ['commerce'],
    slots: { srSec: 4 },
    hint: 'Business Studies — Commerce stream core subject at XI–XII (4 p/w)',
  },
  'Entrepreneurship': {
    grades: ['srSec'],
    streams: ['commerce','arts'],     // Commerce + Humanities only; NOT science sections
    slots: { srSec: 4 },
    hint: 'Entrepreneurship — Commerce and Humanities 5th-subject elective at XI–XII',
  },
  'Legal Studies': {
    grades: ['srSec'],
    streams: ['commerce','arts','general'],
    slots: { srSec: 4 },
    hint: 'Legal Studies — Sr. Secondary elective for Commerce and Humanities streams',
  },
  'Statistics': {
    grades: ['srSec'],
    streams: ['commerce','science','general'],
    slots: { srSec: 4 },
    hint: 'Statistics — elective for Commerce and Science streams at XI–XII',
  },

  // ── Sr. Secondary — Arts/Humanities stream (XI–XII) ──────────────────────────
  'Psychology': {
    grades: ['srSec'],
    streams: ['arts'],                // Humanities sections only
    slots: { srSec: 4 },
    hint: 'Psychology — Humanities 5th subject elective at XI–XII (4 p/w)',
  },
  'Sociology': {
    grades: ['srSec'],
    streams: ['arts'],                // Humanities sections only
    slots: { srSec: 4 },
    hint: 'Sociology — Humanities 5th subject elective at XI–XII (4 p/w)',
  },
  'Philosophy': {
    grades: ['srSec'],
    streams: ['arts','general'],
    slots: { srSec: 4 },
    cambridgeSlots: { srSec: 5 },
    hint: 'Philosophy — Humanities elective; Cambridge A-Level and IB DP Group 3',
  },
  'Fine Arts': {
    grades: ['srSec'],
    streams: ['arts','general'],
    slots: { srSec: 5 },
    hint: 'Fine Arts — Arts-stream elective; also available as 5th optional across streams',
  },

  // ── ICSE/ISC-specific subjects ────────────────────────────────────────────────
  'English Literature': {
    grades: ['secondary','srSec'],
    isLanguage: true,
    slots:     { secondary: 3, srSec: 5 },
    icseSlots: { secondary: 4, srSec: 6 },
    hint: 'English Literature — separate paper in ICSE (Class IX–X); core ISC subject at XI–XII',
  },
  'English Language': {
    grades: ['secondary','srSec'],
    isLanguage: true,
    slots:     { secondary: 3, srSec: 4 },
    icseSlots: { secondary: 4, srSec: 5 },
    hint: 'English Language — separate paper in ICSE; ISC Paper 1',
  },
}

// ─── Core AI Functions ─────────────────────────────────────────────────────────

/**
 * Internal: fuzzy rule lookup with 4-level fallback
 * (exact → case-insensitive → prefix → keyword)
 */
function getRule(subjectName: string): SubjectRule | undefined {
  const n = subjectName.trim()
  if (!n) return undefined
  if (CURRICULUM[n]) return CURRICULUM[n]
  const lower = n.toLowerCase()
  // Case-insensitive exact
  for (const [k, v] of Object.entries(CURRICULUM))
    if (k.toLowerCase() === lower) return v
  // Prefix: "Hindi Language" → use Hindi rule
  for (const [k, v] of Object.entries(CURRICULUM))
    if (lower.startsWith(k.toLowerCase() + ' ') || k.toLowerCase().startsWith(lower + ' ')) return v
  // Keyword: longest key-word overlap
  let bestRule: SubjectRule | undefined
  let bestScore = 0
  for (const [k, v] of Object.entries(CURRICULUM)) {
    const keyWords = k.toLowerCase().split(/[\s/&()+,]+/).filter(w => w.length > 4)
    const score = keyWords.filter(w => lower.includes(w)).length
    if (score > bestScore) { bestScore = score; bestRule = v }
  }
  if (bestScore > 0) return bestRule
  return undefined
}

/**
 * AI Subject ↔ Class Mapping
 *
 * Returns the section names that this subject should be assigned to,
 * respecting board conventions and stream-specific rules.
 */
export function suggestClassesForSubject(
  subjectName: string,
  sections: ReadonlyArray<SectionLike>,
  board: CurriculumBoard = 'CBSE',
): string[] {
  const rule = getRule(subjectName)

  // Unknown subject → fall back to middle + secondary (safe default)
  if (!rule) {
    return sections
      .filter(sec => ['middle','secondary'].includes(getGradeGroup(getGrade(sec.name))))
      .map(s => s.name)
  }

  return sections
    .filter(sec => {
      const grade = getGrade(sec.name)
      const group = getGradeGroup(grade)
      if (!rule.grades.includes(group)) return false
      // Stream check applies only to srSec sections. The section's explicit
      // stream (Classes tab) is authoritative; resolveStream falls back to the
      // name only when no stream is set. Each subject must declare 'general' in
      // its streams list to appear in sections with no stream code.
      if (group === 'srSec' && rule.streams && rule.streams.length > 0) {
        const stream = resolveStream(sec)
        return rule.streams.includes(stream)
      }
      return true
    })
    .map(s => s.name)
}

/**
 * AI Slots / Week Engine
 *
 * Returns the board-recommended periods per week for a subject at a given
 * grade level. Returns undefined when no specific recommendation exists.
 */
export function suggestSlotsPerWeek(
  subjectName: string,
  gradeGroup:  GradeGroup,
  board:       CurriculumBoard = 'CBSE',
): number | undefined {
  const rule = getRule(subjectName)
  if (!rule) return undefined

  // Merge board-specific overrides on top of CBSE defaults
  let slots: SlotMap = { ...rule.slots }
  if (board === 'ICSE'      && rule.icseSlots)      slots = { ...slots, ...rule.icseSlots }
  if (board === 'IB'        && rule.ibSlots)        slots = { ...slots, ...rule.ibSlots }
  if (board === 'Cambridge' && rule.cambridgeSlots) slots = { ...slots, ...rule.cambridgeSlots }

  return slots[gradeGroup]
}

/**
 * Determine the "dominant" grade group for a set of section names.
 * Used for slot recommendation when a subject spans multiple levels.
 * Priority: srSec > secondary > middle > primary > preK
 */
export function dominantGradeGroup(sectionNames: string[]): GradeGroup {
  const priority: GradeGroup[] = ['srSec','secondary','middle','primary','preK']
  const groups = new Set(sectionNames.map(n => getGradeGroup(getGrade(n))))
  return priority.find(g => groups.has(g)) ?? 'middle'
}

/**
 * AI Confidence Hint
 *
 * Returns a human-readable explanation of why a subject is assigned
 * to certain classes, suitable for a tooltip.
 */
export function getSubjectHint(
  subjectName: string,
  board: CurriculumBoard = 'CBSE',
): string {
  const rule = getRule(subjectName)
  const boardLabel = BOARD_LABELS[board]
  if (!rule) return `No specific curriculum rule found — assigned based on general K-8 pattern · ${boardLabel}`
  const gradeLabels: Record<GradeGroup, string> = {
    preK:      'Pre-Primary (Nursery–UKG)',
    primary:   'Primary (I–V)',
    middle:    'Middle (VI–VIII)',
    secondary: 'Secondary (IX–X)',
    srSec:     'Sr. Secondary (XI–XII)',
  }
  const levelText = rule.grades.map(g => gradeLabels[g]).join(', ')
  const streamText = rule.streams ? ` · Streams: ${rule.streams.join(', ')}` : ''
  return `${rule.hint}\nLevels: ${levelText}${streamText}\nSource: ${boardLabel} curriculum`
}

/**
 * Returns a short one-line confidence label for display in the UI.
 * e.g. "CBSE middle-school · 5 p/w"
 */
export function getShortHint(
  subjectName: string,
  gradeGroup:  GradeGroup | undefined,
  board:       CurriculumBoard = 'CBSE',
): string {
  const rule = getRule(subjectName)
  if (!rule) return `${BOARD_LABELS[board]} — general assignment`
  const groupLabels: Record<GradeGroup, string> = {
    preK: 'pre-primary', primary: 'primary', middle: 'middle school',
    secondary: 'secondary', srSec: 'sr. secondary',
  }
  const level = gradeGroup ? groupLabels[gradeGroup] : rule.grades.map(g => groupLabels[g]).join('+')
  return `${BOARD_LABELS[board]} ${level} curriculum`
}

// ════════════════════════════════════════════════════════════════════════════
//  STANDARD SUBJECT SETS — the "what subjects does a class take" brain
//
//  suggestClassesForSubject answers "which classes take THIS subject"; it can
//  only map subjects the user already typed. To make "add a class → its subjects
//  appear" work, we need the inverse: given a section, the curated standard
//  subject list for that grade + stream. These sets are derived from the CBSE/
//  NCERT scheme of studies and validated against real 2025-26 school timetables
//  (Nursery–XII). Activities (PE/Art/Music) and the dominant electives are
//  included; rarely-shared options (2nd foreign language, vocational tracks) are
//  left out so the seeded list is a sensible default a user lightly edits — not
//  an exhaustive catalogue.
// ════════════════════════════════════════════════════════════════════════════

/** Pre-primary (Nursery, LKG, UKG) — developmental, activity-led. */
const STD_PREK = [
  'English', 'Number Work', 'EVS', 'Nursery Rhymes & Stories',
  'Art & Craft', 'Music', 'Physical Education', 'G.K.',
]

/** Primary (I–V) — CBSE keeps EVS through V; Science/SST begin at VI. */
const STD_PRIMARY = [
  'English', 'Mathematics', 'EVS', 'Hindi',
  'Computer Science', 'G.K.', 'Art & Craft', 'Music',
  'Physical Education', 'Library',
]

/** Middle (VI–VIII) — unified Science + Social Studies, three languages. */
const STD_MIDDLE = [
  'English', 'Mathematics', 'Science', 'Social Studies',
  'Hindi', 'Sanskrit', 'Computer Science', 'Art & Craft',
  'Physical Education', 'Library',
]

/** Secondary (IX–X) — board-exam core + IT skill + health/PE. */
const STD_SECONDARY = [
  'English', 'Mathematics', 'Science', 'Social Studies',
  'Hindi', 'Information Technology', 'Physical Education',
]

/** Sr. Secondary (XI–XII) — keyed by stream. 'science' defaults to PCM;
 *  'pcb' is the medical/Spark biology track; unmarked sections fall back to
 *  PCM science (the most common Indian Sr.Sec default). */
// Sr.Secondary stream → subject set. Calibrated against real CBSE school
// timetables (MPS Khandagiri 2025-26, XI–XII): the subjects below are the ones
// the majority of sections in each stream actually run. PE / Painting / Library
// are the shared co-curricular rotation present across every stream.
//   science  — PCMB core (Maths + Biology, since most science sections offer both)
//   pcb      — medical track with the Botany + Zoology split
//   commerce — Accountancy/BST/Eco + Maths, Computer Science & Entrepreneurship
//   arts     — the five humanities + Maths & Entrepreneurship electives
const STD_SRSEC: Record<Stream, string[]> = {
  science:  ['Physics', 'Chemistry', 'Mathematics', 'Biology', 'English', 'Physical Education', 'Painting', 'Library'],
  pcb:      ['Physics', 'Chemistry', 'Botany', 'Zoology', 'Biology', 'English', 'Physical Education', 'Painting', 'Library'],
  commerce: ['Accountancy', 'Business Studies', 'Economics', 'Mathematics', 'Computer Science', 'Entrepreneurship', 'English', 'Physical Education', 'Painting', 'Library'],
  arts:     ['History', 'Geography', 'Political Science', 'Economics', 'Psychology', 'Sociology', 'Mathematics', 'Entrepreneurship', 'English', 'Physical Education', 'Painting', 'Library'],
  general:  ['Physics', 'Chemistry', 'Mathematics', 'Biology', 'English', 'Physical Education', 'Painting', 'Library'],
}

/**
 * The curated standard subject names a section should take, by grade + stream.
 * Grade comes from the name; the XI–XII stream comes from the section's explicit
 * `stream` field (falling back to the name only when unset) — see resolveStream.
 *
 * Accepts a section object; a bare string is still allowed for callers that only
 * have a name (then stream is inferred from the name).
 */
export function standardSubjectsForSection(
  section: SectionLike | string,
  _board: CurriculumBoard = 'CBSE',
): string[] {
  const sec: SectionLike = typeof section === 'string' ? { name: section } : section
  const group = getGradeGroup(getGrade(sec.name))
  switch (group) {
    case 'preK':      return STD_PREK
    case 'primary':   return STD_PRIMARY
    case 'middle':    return STD_MIDDLE
    case 'secondary': return STD_SECONDARY
    case 'srSec':     return STD_SRSEC[resolveStream(sec)] ?? STD_SRSEC.general
  }
}

/** Slot fallback when the curriculum KB has no board-specific number for a
 *  (subject, grade) pair (e.g. unified Science at secondary). */
function fallbackSlot(name: string, group: GradeGroup): number {
  const rule = getRule(name)
  if (rule?.isActivity) return 1
  if (rule?.isLanguage) return group === 'srSec' ? 4 : 4
  // core academic default
  return group === 'preK' ? 4 : group === 'srSec' ? 6 : 5
}

/** Category label for a seeded subject — drives the Subjects-tab grouping. */
function seedCategory(name: string): string {
  const rule = getRule(name)
  if (rule?.isActivity) return 'Co-scholastic'
  return 'Scholastic'
}

export interface SeededSubject {
  name:           string
  shortName:      string
  category:       string
  periodsPerWeek: number
  sessionDuration: number
  maxPeriodsPerDay: number
  requiresLab:    boolean
  isOptional:     boolean
  sections:       string[]
  classConfigs:   Array<{ sectionName: string; periodsPerWeek: number; maxPeriodsPerDay: number; sessionDuration: number }>
}

/**
 * Seed the curated standard subjects for a set of sections.
 *
 * Returns one entry per distinct subject, each carrying the exact sections it
 * applies to plus per-section slot configs (board-recommended, grade-aware).
 * The caller adds ids / colors. Idempotent in spirit — call it on a fresh,
 * subject-less resource set ("Let me create smartly") to bootstrap the whole
 * Subjects tab from just the class list.
 */
export function seedStandardSubjects(
  sections: ReadonlyArray<SectionLike>,
  board: CurriculumBoard = 'CBSE',
): SeededSubject[] {
  // subject name → set of section names that take it
  const map = new Map<string, Set<string>>()
  for (const sec of sections) {
    for (const subName of standardSubjectsForSection(sec, board)) {
      if (!map.has(subName)) map.set(subName, new Set())
      map.get(subName)!.add(sec.name)
    }
  }

  const out: SeededSubject[] = []
  for (const [name, secSet] of map) {
    const secList = [...secSet]
    const classConfigs = secList.map(sn => {
      const group = getGradeGroup(getGrade(sn))
      const slots = suggestSlotsPerWeek(name, group, board) ?? fallbackSlot(name, group)
      const rule  = getRule(name)
      return {
        sectionName:      sn,
        periodsPerWeek:   slots,
        maxPeriodsPerDay: rule?.isActivity ? 1 : 2,
        sessionDuration:  45,
      }
    })
    // dominant slot = the most common per-section value (for the subject default)
    const slotCounts = new Map<number, number>()
    classConfigs.forEach(c => slotCounts.set(c.periodsPerWeek, (slotCounts.get(c.periodsPerWeek) ?? 0) + 1))
    const periodsPerWeek = [...slotCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 5
    const rule = getRule(name)
    out.push({
      name,
      shortName:        generateShortName(name),
      category:         seedCategory(name),
      periodsPerWeek,
      sessionDuration:  45,
      maxPeriodsPerDay: rule?.isActivity ? 1 : 2,
      requiresLab:      rule?.requiresLab ?? false,
      isOptional:       false,
      sections:         secList,
      classConfigs,
    })
  }

  // Stable, human order: core academics first, activities/languages later,
  // alphabetical within. Mirrors how a scheme of studies is usually printed.
  const rank = (s: SeededSubject) => s.category === 'Co-scholastic' ? 1 : 0
  return out.sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name))
}
