/**
 * Step 2 — Resources  (premium compact redesign)
 *
 * Layout:
 *   ┌─ Sidebar (172px) ──────┬─ Content area ──────────────────────────────┐
 *   │  Classes          52   │  [Panel — inline editing, no drawers]        │
 *   │  Subjects         38   │                                              │
 *   │  Teachers         84   │                                              │
 *   │  Rooms            60   │                                              │
 *   │  [Readiness]           │                                              │
 *   │  [Regenerate]          │                                              │
 *   └────────────────────────┴─────────────────────────────────────────────┘
 *   [← Step 1]   Step 2 of 5                               [Next: Allocation →]
 *
 * Tab order: Classes → Subjects → Teachers → Rooms
 */

import { useState, useEffect, useRef, useMemo } from 'react'
import { useTimetableStore } from '@/store/timetableStore'
import { generateStaff, generateSubjects, generateBreaks } from '@/lib/orgData'
import type { Section, Subject, Staff } from '@/types'
import { ScopeMatrixModal } from '@/components/DataGrid/ScopeMatrixModal'
import { parseGradeLevel } from '@/lib/gradeParse'
import { makeId } from '@/components/master/EntityGrids'
import { TeachersPanel } from '@/components/resources/TeachersPanel'
import { ClassesPanel }  from '@/components/resources/ClassesPanel'
import { SubjectsPanel, generateShortName, inferCategory } from '@/components/resources/SubjectsPanel'
import { suggestSlotsPerWeek, normalizeBoardType, getGrade, getGradeGroup, standardSubjectsForSection, subjectAppliesToSections, type CurriculumBoard } from '@/components/resources/curriculum'
import { RoomsPanel, type RoomExt } from '@/components/resources/RoomsPanel'
import { runAIAssignment, type AISnapshot } from '@/components/resources/aiEngine'
import {
  Sparkles, Users, BookOpen, Building2, GraduationCap,
  ChevronLeft, ChevronRight, RefreshCw, CheckCircle2,
} from 'lucide-react'

// ─── Types ────────────────────────────────────────────────────────────────────
type TabKey = 'classes' | 'subjects' | 'teachers' | 'rooms'

const P   = '#7C6FE0'
const P_D = '#6358C4'
const P_L = '#EDE9FF'

const TAB_META: { key: TabKey; label: string; icon: React.ReactNode }[] = [
  { key: 'classes',  label: 'Classes',  icon: <GraduationCap size={14} /> },
  { key: 'subjects', label: 'Subjects', icon: <BookOpen size={14} /> },
  { key: 'teachers', label: 'Faculty', icon: <Users size={14} /> },
  { key: 'rooms',    label: 'Rooms',    icon: <Building2 size={14} /> },
]

const GRADE_GROUP: Record<string, string> = {
  Nursery: 'Pre-Primary', LKG: 'Pre-Primary', UKG: 'Pre-Primary',
  I: 'Primary', II: 'Primary', III: 'Primary', IV: 'Primary', V: 'Primary',
  VI: 'Upper Primary', VII: 'Upper Primary', VIII: 'Upper Primary',
  IX: 'Secondary', X: 'Secondary',
  XI: 'Sr. Secondary', XII: 'Sr. Secondary',
}
const DEFAULT_STRENGTH: Record<string, number> = {
  'Pre-Primary': 25, 'Primary': 35, 'Upper Primary': 40,
  'Secondary': 45, 'Sr. Secondary': 40,
}

// ─── Default data builders ────────────────────────────────────────────────────
function buildDefaultSections(): Section[] {
  const out: Section[] = []
  const push = (grade: string, sec: string) =>
    out.push({
      id: makeId(), name: `${grade}-${sec}`, grade,
      room: `Room ${100 + out.length + 1}`, classTeacher: '',
    } as Section)
  for (const g of ['Nursery', 'LKG', 'UKG'])   for (const s of ['A','B','C'])                  push(g, s)
  for (const g of ['I','II','III','IV','V'])     for (const s of ['A','B','C'])                  push(g, s)
  for (const g of ['VI','VII','VIII'])           for (const s of ['A','B','C','D'])              push(g, s)
  for (const g of ['IX','X'])                   for (const s of ['A','B','C','D'])              push(g, s)
  for (const g of ['XI','XII'])                 for (const s of ['Sci-A','Sci-B','Com-A','Arts']) push(g, s)
  return out
}

// ─── Range-aware section builder (respects the onboarding class range) ────────
const FULL_GRADE_ORDER = ['Nursery','LKG','UKG','I','II','III','IV','V','VI','VII','VIII','IX','X','XI','XII']
function normRangeGrade(g?: string): string { return (g ?? '').trim().replace(/^class\s+/i, '') }

/** Default section suffixes for a grade (matches buildDefaultSections). */
function sectionSuffixes(grade: string): string[] {
  if (['Nursery','LKG','UKG','I','II','III','IV','V'].includes(grade)) return ['A','B','C']
  if (['XI','XII'].includes(grade))                                    return ['Sci-A','Sci-B','Com-A','Arts']
  return ['A','B','C','D'] // VI–X
}

/** Grades belonging to a configured grade-group key (e.g. "primary" → I–V). */
function gradesForGroup(group: string): string[] {
  const k = group.toLowerCase().replace(/[^a-z]/g, '')
  if (k.startsWith('prek') || k.startsWith('prep') || k.startsWith('nursery') || k.startsWith('kinder')) return ['Nursery','LKG','UKG']
  if (k.startsWith('primary'))                       return ['I','II','III','IV','V']
  if (k.startsWith('middle') || k.startsWith('upper')) return ['VI','VII','VIII']
  if (k.startsWith('srsec') || k.startsWith('senior')) return ['XI','XII']
  if (k.startsWith('secondary'))                     return ['IX','X']
  return []
}

/** Grades in the configured range: explicit grades → from/to → grade groups. */
function rangeGradesFromConfig(cfg: any): string[] {
  const explicit = Array.isArray(cfg?.grades) ? cfg.grades.map(normRangeGrade).filter(Boolean) : []
  if (explicit.length) return explicit
  // Adaptive: parse the typed from/to to levels, then select the canonical
  // grade labels whose level falls in range (shared parser handles any naming).
  const f = parseGradeLevel(cfg?.fromGrade)
  const t = parseGradeLevel(cfg?.toGrade)
  if (f !== null && t !== null && f <= t) {
    const out = FULL_GRADE_ORDER.filter(g => { const l = parseGradeLevel(g); return l != null && l >= f && l <= t })
    if (out.length) return out
  }
  if (Array.isArray(cfg?.gradeGroups) && cfg.gradeGroups.length) {
    const grades = cfg.gradeGroups.flatMap((g: string) => gradesForGroup(g))
    if (grades.length) return grades
  }
  return []
}

function buildSectionsForGrades(grades: string[]): Section[] {
  const out: Section[] = []
  grades.forEach(g =>
    sectionSuffixes(g).forEach(s =>
      out.push({ id: makeId(), name: `${g}-${s}`, grade: g, room: `Room ${100 + out.length + 1}`, classTeacher: '' } as Section),
    ),
  )
  return out
}

/**
 * Build sections from the class list configured in Shift & Timing (Step 1).
 * Creates `sectionsPerClass` sections per class.
 * If a class has a stream assigned, section names include the stream code:
 *   XI + Science + 3 sections → XI-Sci-A, XI-Sci-B, XI-Sci-C
 * Otherwise: XI → XI-A, XI-B, XI-C
 */
function buildSectionsFromDefs(
  classDefs: Array<{ key: string; label: string; short: string; group: string }>,
  streamMap: Record<string, string | string[]> = {},
  sectionsPerClass = 3,
): Section[] {
  const out: Section[] = []
  const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
  for (const cls of classDefs) {
    // Derive a clean grade name: "Class XI" → "XI", "Nursery" → "Nursery"
    const grade   = cls.label.startsWith('Class ') ? cls.label.slice(6) : cls.label
    const raw     = streamMap[cls.key]
    // Normalise to array (handles both old string format and new string[] format)
    const streams = raw ? (Array.isArray(raw) ? raw : [raw]) : []
    if (streams.length > 0) {
      // Create sectionsPerClass sections PER stream
      for (const stream of streams) {
        const code = stream.replace(/\s+/g, '').slice(0, 3)
        for (let i = 0; i < sectionsPerClass; i++) {
          const sec  = LETTERS[i] ?? String(i + 1)
          out.push({ id: makeId(), name: `${grade}-${code}-${sec}`, grade, room: `Room ${100 + out.length + 1}`, classTeacher: '' } as Section)
        }
      }
    } else {
      for (let i = 0; i < sectionsPerClass; i++) {
        const sec = LETTERS[i] ?? String(i + 1)
        out.push({ id: makeId(), name: `${grade}-${sec}`, grade, room: `Room ${100 + out.length + 1}`, classTeacher: '' } as Section)
      }
    }
  }
  return out
}

// Subject definitions: curriculum-aware with AI-recommended slots (middle-school baseline)
// ppw = fallback; the actual value gets set when the user runs "AI Assign" from SubjectsPanel
const DEFAULT_SUBJECTS: Array<{ name: string; cat: string; ppw: number; short?: string }> = [
  // ── Subjects present in ALL grade levels ─────────────────────────────────────
  { name: 'Mathematics',              cat: 'Compulsory',   ppw: 6,  short: 'MATH' },
  { name: 'English',                  cat: 'Compulsory',   ppw: 5,  short: 'ENG'  },
  // ── Pre-primary / primary only ───────────────────────────────────────────────
  { name: 'Number Work',              cat: 'Compulsory',   ppw: 4 },
  { name: 'Nursery Rhymes & Stories', cat: 'Activity',     ppw: 3 },
  { name: 'Activity / Free Play',     cat: 'Activity',     ppw: 4 },
  { name: 'EVS',                      cat: 'Compulsory',   ppw: 4 },
  { name: 'Computer',                 cat: 'Compulsory',   ppw: 2,  short: 'COMP' },
  // ── Lower school (I–VIII) ────────────────────────────────────────────────────
  { name: 'Science',                  cat: 'Compulsory',   ppw: 5 },
  { name: 'Social Science',           cat: 'Compulsory',   ppw: 5,  short: 'SSC'  },
  { name: 'Hindi',                    cat: 'Language',     ppw: 4,  short: 'HIN'  },
  { name: 'Sanskrit / MIL',           cat: 'Language',     ppw: 3,  short: 'SANS' },
  { name: 'Odia / Regional Language', cat: 'Language',     ppw: 3,  short: 'ODI'  },
  { name: 'G.K.',                     cat: 'Activity',     ppw: 2 },
  { name: 'Moral Science',            cat: 'Activity',     ppw: 1 },
  { name: 'SUPW / Life Skills',       cat: 'Activity',     ppw: 2 },
  { name: 'Scout & Guide',            cat: 'CCA',          ppw: 1 },
  { name: 'Drawing',                  cat: 'CCA',          ppw: 2 },
  { name: 'Music',                    cat: 'CCA',          ppw: 1 },
  { name: 'Dance',                    cat: 'CCA',          ppw: 1 },
  { name: 'Art & Craft',              cat: 'CCA',          ppw: 2 },
  // ── Sciences — Secondary + Sr. Secondary ────────────────────────────────────
  // (stream: science/general — NOT Commerce or Humanities)
  { name: 'Physics',                  cat: 'Compulsory',   ppw: 5,  short: 'PHY'  },
  { name: 'Chemistry',                cat: 'Compulsory',   ppw: 5,  short: 'CHEM' },
  { name: 'Biology',                  cat: 'Compulsory',   ppw: 5,  short: 'BIO'  },
  { name: 'Botany',                   cat: 'Compulsory',   ppw: 4,  short: 'BOT'  },
  { name: 'Zoology',                  cat: 'Compulsory',   ppw: 4,  short: 'ZOO'  },
  // Technology (science/general + Commerce)
  { name: 'Computer Science',         cat: 'Compulsory',   ppw: 5,  short: 'CS'   },
  // ── Commerce stream ──────────────────────────────────────────────────────────
  { name: 'Accountancy',              cat: 'Compulsory',   ppw: 6,  short: 'ACC'  },
  { name: 'Business Studies',         cat: 'Compulsory',   ppw: 4,  short: 'BST'  },
  // ── Commerce + Humanities + optional in Science ──────────────────────────────
  { name: 'Economics',                cat: 'Compulsory',   ppw: 5,  short: 'ECO'  },
  // ── 5th subject — Commerce and Humanities only ───────────────────────────────
  { name: 'Entrepreneurship',         cat: 'Skill',        ppw: 4,  short: 'ENT'  },
  // ── Humanities stream ────────────────────────────────────────────────────────
  { name: 'History',                  cat: 'Compulsory',   ppw: 4,  short: 'HIS'  },
  { name: 'Geography',                cat: 'Compulsory',   ppw: 4,  short: 'GEO'  },
  { name: 'Political Science',        cat: 'Compulsory',   ppw: 6,  short: 'POL SC'},
  { name: 'Psychology',               cat: 'Optional',     ppw: 4,  short: 'PSY'  },
  { name: 'Sociology',                cat: 'Optional',     ppw: 4,  short: 'SOC'  },
  // ── All Sr. Secondary streams (CCA / activities) ─────────────────────────────
  // Note: "EST" in the school timetable = Extra Study Time — a period slot, NOT a subject.
  { name: 'Physical Education',       cat: 'CCA',          ppw: 1,  short: 'PE'   },
  { name: 'Painting',                 cat: 'CCA',          ppw: 1,  short: 'PAINT'},
  { name: 'Library',                  cat: 'CCA',          ppw: 1,  short: 'LIB'  },
  { name: 'Yoga & Health',            cat: 'Activity',     ppw: 1 },
]

function buildDefaultSubjects(board: CurriculumBoard = 'CBSE', sections: Section[] = []): Subject[] {
  // Determine which grade groups are present in the configured sections
  const presentGroups = new Set(sections.map(s => getGradeGroup(getGrade(s.name))))
  const srSecOnly = presentGroups.size > 0 && [...presentGroups].every(g => g === 'srSec')

  // Subjects that only make sense below sr. secondary (exclude from XI-XII-only schools)
  const PRIMARY_ONLY_SUBJECTS = new Set([
    'Number Work','Nursery Rhymes & Stories','Activity / Free Play','EVS','Computer',
  ])
  // Pre-primary-only subjects — exclude when there are no pre-primary sections.
  const PREK_ONLY_SUBJECTS = new Set([
    'Number Work','Nursery Rhymes & Stories','Activity / Free Play',
  ])
  // Subjects that are lower-school focused (drop when school is XI-XII only)
  const PRESRSEC_SUBJECTS = new Set([
    'Science','Social Science','Hindi','Sanskrit / MIL',
    'G.K.','Moral Science','SUPW / Life Skills','Scout & Guide',
    'Drawing','Music','Dance','Art & Craft',
    'Odia / Regional Language',
  ])
  // Subjects that are sr. secondary only (drop when there are NO srSec sections)
  const SRSEC_ONLY_SUBJECTS = new Set([
    'Physics','Chemistry','Biology','Botany','Zoology',
    'Accountancy','Business Studies','Entrepreneurship',
    'Political Science','History','Geography','Psychology','Sociology',
    'Applied Mathematics','Mathematics (Optional)',
    'Biotechnology','Fine Arts','Legal Studies','Statistics',
  ])

  return DEFAULT_SUBJECTS
    .filter(d => {
      if (srSecOnly) {
        // For XI-XII only schools: drop pre-primary and lower-grade-only subjects
        if (PRIMARY_ONLY_SUBJECTS.has(d.name)) return false
        if (PRESRSEC_SUBJECTS.has(d.name)) return false
        return true
      }
      if (presentGroups.size > 0 && !presentGroups.has('srSec')) {
        // No sr-sec sections — drop sr-sec-only subjects
        if (SRSEC_ONLY_SUBJECTS.has(d.name)) return false
      }
      if (presentGroups.size > 0 && !presentGroups.has('preK')) {
        // No pre-primary sections — drop pre-primary-only subjects
        if (PREK_ONLY_SUBJECTS.has(d.name)) return false
      }
      // Precise check against the curriculum brain: only generate a subject if
      // at least one CONFIGURED section actually falls in its applicable grade
      // range (e.g. don't generate Sanskrit/Scout & Guide for an I–V-only
      // school, and split EVS (≤ II) vs Social Science (≥ III) within primary).
      if (sections.length > 0 && !subjectAppliesToSections(d.name, sections)) return false
      return true
    })
    .map(d => {
      // Use the dominant grade group for slot recommendation
      const dominant = srSecOnly ? 'srSec' : 'middle'
      const aiPpw = suggestSlotsPerWeek(d.name, dominant, board) ?? d.ppw
      return {
        id: makeId(), name: d.name,
        periodsPerWeek: aiPpw,
        category: d.cat as any, isOptional: false,
        shortName: d.short ?? generateShortName(d.name),
        sessionDuration: 45, maxPeriodsPerDay: 2,
        requiresLab: false, color: P, sections: [], classConfigs: [],
      } as unknown as Subject
    })
}

function buildDefaultRooms(): RoomExt[] {
  const out: RoomExt[] = []
  for (let i = 0; i < 52; i++)
    out.push({ id: makeId(), name: `Room ${101 + i}`, type: 'Classroom', capacity: 40, building: 'Main Block', floor: 'Ground', subjectMappings: [], notes: '' })
  const specials = [
    { name: 'Science Lab 1', type: 'Lab',          cap: 35, floor: '1st',    subjects: ['Physics', 'Chemistry', 'Biology'] },
    { name: 'Science Lab 2', type: 'Lab',          cap: 35, floor: '1st',    subjects: ['Chemistry', 'Biology'] },
    { name: 'Computer Lab',  type: 'Computer Lab', cap: 40, floor: '2nd',    subjects: ['Computer', 'Computer Science', 'Informatics Practices'] },
    { name: 'Library',       type: 'Library',      cap: 60, floor: 'Ground', subjects: ['Library'] },
    { name: 'Art Room',      type: 'Other',        cap: 35, floor: '1st',    subjects: ['Art & Craft', 'Drawing'] },
    { name: 'Music Room',    type: 'Other',        cap: 30, floor: '1st',    subjects: ['Music'] },
    { name: 'Dance Hall',    type: 'Hall',         cap: 50, floor: 'Ground', subjects: ['Dance'] },
    { name: 'Activity Hall', type: 'Hall',         cap: 80, floor: 'Ground', subjects: ['Physical Education', 'Scout & Guide'] },
  ]
  specials.forEach(s => out.push({
    id: makeId(), name: s.name, type: s.type, capacity: s.cap,
    building: 'Main Block', floor: s.floor, subjectMappings: s.subjects, notes: '',
  }))
  return out.slice(0, 60)
}

function buildDefaultStaff(count: number): Staff[] {
  return generateStaff('school', 'IN', count) as Staff[]
}

// ─── Main component ───────────────────────────────────────────────────────────
export function StepResourcesV2() {
  const store       = useTimetableStore() as any
  const { config, sections, staff, subjects, setSections, setStaff, setBreaks, setStep } = store
  const setSubjects = store.setSubjects ?? store.setLegacySubjects

  const [activeTab, setActiveTab] = useState<TabKey>('classes')
  const [generating, setGenerating] = useState(false)

  // ── Global AI assign state ────────────────────────────────────────────────
  const [aiLoading,          setAiLoading]          = useState(false)
  const [aiStatus,           setAiStatus]           = useState('')
  const [aiSnapshot,         setAiSnapshot]         = useState<AISnapshot | null>(null)
  const [facultyAiApplied,   setFacultyAiApplied]   = useState(false)
  const [roomsAiApplied,     setRoomsAiApplied]     = useState(false)
  const [subjectsAiApplied,  setSubjectsAiApplied]  = useState(false)
  const aiAbortRef = useRef(false)

  function sleep(ms: number) { return new Promise<void>(r => setTimeout(r, ms)) }

  // ── Auto-extend subjects when a NEW class is added ──────────────────────────
  // When the user adds a section, any EXISTING subject the curriculum says that
  // grade/stream takes is auto-mapped onto the new section (grade-aware slots).
  // Only genuinely-new section names trigger this — manual removals on existing
  // sections are never re-added, and no new subjects are created (the empty-state
  // "create smartly" handles bootstrapping). Skips the very first render so it
  // never fights a freshly-loaded store.
  const seenSectionsRef = useRef<Set<string> | null>(null)
  useEffect(() => {
    const current = new Set<string>((sections as Section[]).map(s => s.name))
    // First run: record baseline, don't extend.
    if (seenSectionsRef.current === null) { seenSectionsRef.current = current; return }
    const prev = seenSectionsRef.current
    const added = [...current].filter(n => !prev.has(n))
    seenSectionsRef.current = current
    if (added.length === 0 || subjects.length === 0) return

    const board = normalizeBoardType(config.board ?? 'CBSE') as CurriculumBoard
    const byName = new Map((sections as Section[]).map(s => [s.name, s]))
    // subjectName → new sections that should carry it (stream read from the
    // section object, so assignment follows the chosen stream, not the name)
    const wants = new Map<string, string[]>()
    for (const secName of added) {
      const secObj = byName.get(secName) ?? { name: secName }
      for (const subName of standardSubjectsForSection(secObj, board)) {
        if (!wants.has(subName)) wants.set(subName, [])
        wants.get(subName)!.push(secName)
      }
    }
    let changed = false
    const nextSubjects = (subjects as Subject[]).map(sub => {
      const newSecs = (wants.get(sub.name) ?? []).filter(sn =>
        !(sub.sections ?? []).includes(sn) &&
        !(sub.classConfigs ?? []).some(c => c.sectionName === sn))
      if (newSecs.length === 0) return sub
      changed = true
      const addedConfigs = newSecs.map(sn => {
        const group = getGradeGroup(getGrade(sn))
        const slots = suggestSlotsPerWeek(sub.name, group, board) ?? (sub.periodsPerWeek || 5)
        return {
          sectionName:      sn,
          periodsPerWeek:   slots,
          maxPeriodsPerDay: sub.maxPeriodsPerDay ?? 2,
          sessionDuration:  sub.sessionDuration ?? 45,
        }
      })
      return {
        ...sub,
        sections:     [...new Set([...(sub.sections ?? []), ...newSecs])],
        classConfigs: [...(sub.classConfigs ?? []), ...addedConfigs],
      }
    })
    if (changed) setSubjects(nextSubjects)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sections])

  // ── Full AI assign (all resources) — used by empty-state & Regenerate All ──
  async function handleGlobalAIAssign(board: CurriculumBoard) {
    if (aiLoading) return
    aiAbortRef.current = false
    setAiLoading(true)
    setAiSnapshot({ subjects, sections, staff, rooms })
    const steps = [
      `Applying ${board} curriculum standards...`,
      `Mapping subjects → grade levels...`,
      `Calculating ${board} slot allocations...`,
      `Distributing teacher workloads...`,
      `Assigning class teachers...`,
      `Finalizing room mappings...`,
    ]
    for (const msg of steps) {
      if (aiAbortRef.current) break
      setAiStatus(msg)
      await sleep(320)
    }
    if (aiAbortRef.current) { setAiLoading(false); return }
    const result = runAIAssignment(subjects, sections, staff, rooms, board)
    setSections(result.sections)
    setSubjects(result.subjects)
    setStaff(result.staff)
    setRooms(result.rooms)
    setAiStatus(`✓ ${board} curriculum assigned`)
    setAiLoading(false)
    setTimeout(() => setAiStatus(''), 3500)
  }

  // ── Per-tab AI assign — only touches the relevant resource ───────────────
  async function handleSubjectsAIAssign(board: CurriculumBoard) {
    if (aiLoading) return
    setAiLoading(true)
    setSubjectsAiApplied(false)
    setAiSnapshot({ subjects, sections, staff, rooms })
    setAiStatus(`Calculating ${board} subject allocations…`)
    await sleep(480)
    const result = runAIAssignment(subjects, sections, staff, rooms, board)
    setSubjects(result.subjects)
    setAiStatus('✓ Subject slots assigned')
    setAiLoading(false)
    setSubjectsAiApplied(true)
    setTimeout(() => { setAiStatus(''); setSubjectsAiApplied(false) }, 3500)
  }

  async function handleFacultyAIAssign() {
    if (aiLoading) return
    setAiLoading(true)
    setFacultyAiApplied(false)
    setAiSnapshot({ subjects, sections, staff, rooms })
    const board = normalizeBoardType(config.board ?? 'CBSE') as CurriculumBoard
    const boardPeriods: Record<string, number> = { CBSE: 32, ICSE: 32, IB: 24, Cambridge: 24, Custom: 28 }
    const maxPeriods = boardPeriods[board] ?? 28
    setAiStatus('Assigning teacher workloads & subjects…')
    await sleep(480)
    const result = runAIAssignment(subjects, sections, staff, rooms, board)
    // Apply AI staff but preserve max periods from board standard
    const newStaff = result.staff.map((t: any) => ({ ...t, maxPeriodsPerWeek: maxPeriods }))
    setStaff(newStaff)
    setAiStatus('✓ Faculty assignments updated')
    setAiLoading(false)
    setFacultyAiApplied(true)
    setTimeout(() => { setAiStatus(''); setFacultyAiApplied(false) }, 3500)
  }

  async function handleRoomsAIAssign() {
    if (aiLoading) return
    setAiLoading(true)
    setRoomsAiApplied(false)
    setAiSnapshot({ subjects, sections, staff, rooms })
    setAiStatus('Inferring room types & subject mappings from room names…')
    await sleep(480)
    handleRoomAIFix()   // name-pattern logic: Computer Lab, Sci Lab, Library, Gym…
    setAiStatus('✓ Room assignments updated')
    setAiLoading(false)
    setRoomsAiApplied(true)
    setTimeout(() => { setAiStatus(''); setRoomsAiApplied(false) }, 3500)
  }

  function handleGlobalAIUndo() {
    if (!aiSnapshot) return
    setSections(aiSnapshot.sections)
    setSubjects(aiSnapshot.subjects)
    setStaff(aiSnapshot.staff)
    setRooms(aiSnapshot.rooms)
    setAiSnapshot(null)
    setAiStatus('')
  }

  // ── Faculty AI Fix — set maxPeriodsPerWeek per board/country standard ────────
  function handleTeacherAIFix() {
    const board = normalizeBoardType(config.board ?? 'CBSE')
    // Standard max teaching periods/week per board:
    //   CBSE / ICSE (India) : 32  (35-period day, teachers cover ~32)
    //   IB / Cambridge       : 24  (lighter contact hours, more prep time)
    //   Custom / default     : 28
    const boardPeriods: Record<string, number> = {
      CBSE: 32, ICSE: 32, IB: 24, Cambridge: 24, Custom: 28,
    }
    const maxPeriods = boardPeriods[board] ?? 28
    setStaff(staff.map((t: Staff) => ({ ...t, maxPeriodsPerWeek: maxPeriods })))
  }

  // ── Rooms AI Fix — infer room type and subject mappings from room names ───────
  function handleRoomAIFix() {
    const subjectNames: string[] = subjects.map((s: Subject) => s.name)

    const updatedRooms = rooms.map((room: RoomExt) => {
      const n = room.name
      let type = room.type
      let subs: string[] = room.subjectMappings ?? []

      if (/computer|comp\.?\s*lab|informatics|i\.t\.?\s*lab/i.test(n)) {
        type = 'Computer Lab'
        subs = subjectNames.filter(s => /computer|informatics/i.test(s))
      } else if (/science\s*lab|sci\s*lab|chem(istry)?\s*lab|bio(logy)?\s*lab|physics\s*lab|lab\s*\d/i.test(n)) {
        type = 'Lab'
        subs = subjectNames.filter(s => /physics|chemistry|biology|science/i.test(s))
      } else if (/library|lib\b/i.test(n)) {
        type = 'Library'
        subs = subjectNames.filter(s => /library/i.test(s))
      } else if (/gym|gymnasium|sports\s*hall/i.test(n)) {
        type = 'Gym'
        subs = subjectNames.filter(s => /physical\s*education|p\.e\.|sports/i.test(s))
      } else if (/art\s*room|craft\s*room|drawing\s*room/i.test(n)) {
        type = 'Other'
        subs = subjectNames.filter(s => /art|craft|draw/i.test(s))
      } else if (/music\s*room/i.test(n)) {
        type = 'Other'
        subs = subjectNames.filter(s => /music/i.test(s))
      } else if (/dance|activity\s*hall/i.test(n)) {
        type = 'Hall'
        subs = subjectNames.filter(s => /dance|physical/i.test(s))
      } else if (/\bhall\b|auditorium|assembly/i.test(n)) {
        type = 'Hall'
        subs = []
      } else if (/staff\s*room|teacher.*room|faculty/i.test(n)) {
        type = 'Staff Room'
        subs = []
      }

      return { ...room, type, subjectMappings: subs }
    })

    setRooms(updatedRooms)
  }

  // ── Rooms ─────────────────────────────────────────────────────────────────
  // Convert any legacy kebab-case roomType values that were saved by older code
  // e.g. 'computer-lab' → 'Computer Lab', 'staff-room' → 'Staff Room'
  const KEBAB_TO_ROOM_TYPE: Record<string, string> = {
    'classroom': 'Classroom', 'lab': 'Lab', 'computer-lab': 'Computer Lab',
    'library': 'Library', 'hall': 'Hall', 'gym': 'Gym',
    'staff-room': 'Staff Room', 'staff room': 'Staff Room', 'other': 'Other',
  }
  function normalizeRoomType(raw: string | undefined): string {
    if (!raw) return 'Classroom'
    return KEBAB_TO_ROOM_TYPE[raw.toLowerCase()] ?? raw
  }

  const [rooms, setRoomsLocal] = useState<RoomExt[]>(() => {
    const stored = store.rooms ?? []
    if (Array.isArray(stored) && stored.length > 0) {
      return stored.map((r: any) => ({
        id:              r.id ?? makeId(),
        name:            r.actualName ?? r.name ?? r.generatedName ?? 'Room',
        type:            normalizeRoomType(r.roomType ?? r.type),
        capacity:        r.capacity ?? 40,
        building:        r.building ?? 'Main Block',
        floor:           r.floor ?? 'Ground',
        subjectMappings: r.subjectMappings ?? [],
        notes:           r.notes ?? '',
        scope:           r.scope,
      }))
    }
    return []
  })

  const setRooms = (next: RoomExt[]) => {
    setRoomsLocal(next)
    store.setRooms?.(next.map(r => ({
      id: r.id, generatedName: r.name, actualName: r.name,
      roomType: r.type,   // store as Title Case — no kebab conversion
      capacity: r.capacity, building: r.building, floor: r.floor,
      subjectMappings: r.subjectMappings,
      notes: r.notes, scope: r.scope,
    })))
  }

  useEffect(() => {
    store.setRooms?.(rooms.map(r => ({
      id: r.id, generatedName: r.name, actualName: r.name,
      roomType: r.type,   // store as Title Case — no kebab conversion
      capacity: r.capacity, building: r.building, floor: r.floor,
      subjectMappings: r.subjectMappings,
      notes: r.notes, scope: r.scope,
    })))
  }, [rooms]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if ((store.breaks ?? []).length === 0)
      setBreaks(generateBreaks(config.orgType ?? 'school', config.numBreaks ?? 3))
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Scope modal ───────────────────────────────────────────────────────────
  const [scopeTarget, setScopeTarget] = useState<{ kind: string; entity: any; rect?: DOMRect } | null>(null)
  const workDays: string[] = config?.workDays ?? ['MONDAY','TUESDAY','WEDNESDAY','THURSDAY','FRIDAY','SATURDAY']
  const periods = store.periods ?? []
  const cycleWeeks = (() => {
    try { const p = JSON.parse(localStorage.getItem('schedu-bell-v2') ?? '{}'); return typeof p?.cycleWeeks === 'number' ? p.cycleWeeks : 1 } catch { return 1 }
  })()

  // ── Counts + readiness ────────────────────────────────────────────────────
  const counts = useMemo<Record<TabKey, number>>(() => ({
    classes:  sections.length,
    subjects: subjects.length,
    teachers: staff.length,
    rooms:    rooms.length,
  }), [sections, subjects, staff, rooms])

  const allReady = counts.classes > 0 && counts.subjects > 0 && counts.teachers > 0 && counts.rooms > 0
  const hasAnyData = counts.classes > 0 || counts.subjects > 0 || counts.teachers > 0 || counts.rooms > 0

  // ── Helpers to get configured class defs from Step 1 ─────────────────────
  const configuredClassDefs = (config as any).configuredClassDefs as
    Array<{ key: string; label: string; short: string; group: string }> | undefined
  const configuredStreamMap = (config as any).configuredClassStreamMap as
    Record<string, string | string[]> | undefined

  /** Build sections: prefer Step-2 class defs, else the onboarding class range,
   *  else (no range configured) the full default set. */
  const buildSections = (perClass = 3) => {
    if (configuredClassDefs?.length)
      return buildSectionsFromDefs(configuredClassDefs, configuredStreamMap ?? {}, perClass)
    const rangeGrades = rangeGradesFromConfig(config as any)
    return rangeGrades.length ? buildSectionsForGrades(rangeGrades) : buildDefaultSections()
  }

  // Auto-seed sections on first mount when the store is still empty
  // (happens right after Save & Continue from Shift & Timing)
  useEffect(() => {
    if (sections.length === 0 && configuredClassDefs?.length) {
      const auto = buildSections(3)
      setSections(auto.map((sec: any) => ({
        ...sec,
        strength: DEFAULT_STRENGTH[GRADE_GROUP[(sec as any).grade] ?? 'Primary'] ?? 35,
      })))
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── Generate all ──────────────────────────────────────────────────────────
  /**
   * Fills in blank resources (subjects · staff · rooms).
   * NEVER rebuilds sections if the user already has classes set up —
   * existing sections are preserved and drive subject/staff assignment.
   */
  const handleGenerateAll = async () => {
    setGenerating(true)
    await new Promise(r => setTimeout(r, 700))

    const targetStaff    = (config as any).numStaff    ?? 47
    const targetSubjects = (config as any).numSubjects ?? undefined
    const targetRooms    = (config as any).numRooms    ?? 30
    const board          = normalizeBoardType(config.board)

    // ── 1. Sections: KEEP existing if present; only seed if truly empty ──────
    let workingSections: any[]
    if (sections.length > 0) {
      // Preserve every class the user configured
      workingSections = sections as any[]
    } else {
      const targetSections = (config as any).numSections ?? undefined
      const built = buildSections(3)
      const raw   = targetSections && built.length > targetSections
        ? built.slice(0, targetSections) : built
      workingSections = raw.map((sec: any) => ({
        ...sec,
        strength: DEFAULT_STRENGTH[GRADE_GROUP[(sec as any).grade] ?? 'Primary'] ?? 35,
      }))
      setSections(workingSections)
    }

    // ── 2. Staff: always regenerate to the target count ──────────────────────
    const newStaff = buildDefaultStaff(targetStaff)

    // Assign class-teachers only to sections that don't already have one
    const updatedSections = workingSections.map((sec: any, i: number) => ({
      ...sec,
      classTeacher: sec.classTeacher || newStaff[i % newStaff.length]?.name || '',
    }))
    if (updatedSections.some((s: any, i: number) => s.classTeacher !== workingSections[i]?.classTeacher)) {
      setSections(updatedSections)
    }

    // ── 3. Subjects: build from the actual sections present, then auto-assign
    //       categories (Scholastic / Co-scholastic) so they're correct on the
    //       first generate — no separate "categorize" step needed. ───────────
    const allSubjects = buildDefaultSubjects(board, updatedSections)
      .map((s: any) => ({ ...s, category: inferCategory(s) }))
    const newSubjects = targetSubjects ? allSubjects.slice(0, targetSubjects) : allSubjects

    // ── 4. Rooms ─────────────────────────────────────────────────────────────
    const newRooms = buildDefaultRooms().slice(0, targetRooms)

    // ── 5. Assign subjects → classes and balance teacher load for EVERY grade
    //       range (previously only senior-secondary). Without this, generated
    //       teachers have empty subject lists, so the solver can't match a
    //       teacher to a subject and leaves "no eligible teacher" gaps. ────────
    const assigned = runAIAssignment(newSubjects, updatedSections, newStaff, newRooms, board)
    setStaff(assigned.staff)
    setSubjects(assigned.subjects)
    setRooms(assigned.rooms)
    if (sections.length > 0) setSections(assigned.sections)
    store.setConfig?.({
      ...config,
      numStaff: assigned.staff.length,
      numSubjects: assigned.subjects.length,
      numRooms: assigned.rooms.length,
    })

    setGenerating(false)
  }

  const BANNER_TEXT: Record<TabKey, string> = {
    classes:  `${counts.classes} classes · edit inline, bulk-create full grades`,
    subjects: `${counts.subjects} subjects · set p/w and assign to classes`,
    teachers: `${counts.teachers} faculty/educators · assign subjects with class mappings inline`,
    rooms:    `${counts.rooms} rooms · assign home classes and special subjects`,
  }

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div style={{
      display: 'flex', minHeight: 'calc(100vh - 165px)',
      fontFamily: "'Plus Jakarta Sans', -apple-system, sans-serif",
      background: '#FAFAFE',
    }}>

      {/* ══ Sidebar ══════════════════════════════════════════════════════════ */}
      <div style={{
        width: 168, flexShrink: 0,
        background: '#fff', borderRight: '1px solid #EAE6FF',
        padding: '10px 0 14px',
        position: 'sticky', top: 0,
        height: 'calc(100vh - 165px)', overflowY: 'auto',
        display: 'flex', flexDirection: 'column',
      }}>
        {/* Nav tabs — readiness dot embedded directly on each item */}
        {TAB_META.map(tab => {
          const active = activeTab === tab.key
          const count  = counts[tab.key]
          const ready  = count > 0
          return (
            <button key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              style={{
                width: '100%', textAlign: 'left', border: 'none',
                cursor: 'pointer', padding: '7px 12px',
                background: active ? '#EDE9FF' : 'transparent',
                borderRight: `3px solid ${active ? P : 'transparent'}`,
                display: 'flex', alignItems: 'center', gap: 8,
                fontFamily: 'inherit', transition: 'background 0.1s',
              }}
              onMouseEnter={e => { if (!active) (e.currentTarget.style.background = '#F5F3FF') }}
              onMouseLeave={e => { if (!active) (e.currentTarget.style.background = 'transparent') }}
            >
              {/* Readiness dot */}
              <div style={{
                width: 7, height: 7, borderRadius: '50%', flexShrink: 0,
                background: ready ? '#22C55E' : '#D1CFF0',
                boxShadow: ready ? '0 0 0 2px #D1FAE5' : 'none',
                transition: 'background 0.2s',
              }} />
              <span style={{ color: active ? P : ready ? '#8B87AD' : '#D1CFF0', display: 'flex', flexShrink: 0 }}>
                {tab.icon}
              </span>
              <span style={{ flex: 1, fontSize: 12.5, fontWeight: active ? 700 : 500, color: active ? P_D : '#374151' }}>
                {tab.label}
              </span>
              {ready ? (
                <span style={{
                  fontSize: 10, fontWeight: 700, padding: '1px 6px 2px', borderRadius: 10,
                  background: active ? P : '#F0ECFE',
                  color: active ? '#fff' : '#8B87AD',
                  minWidth: 22, textAlign: 'center',
                }}>{count}</span>
              ) : (
                <span style={{ fontSize: 11, color: '#E0D4FF', fontWeight: 700 }}>—</span>
              )}
            </button>
          )
        })}

        {/* Fill / Regenerate button — visible whenever classes exist */}
        {counts.classes > 0 && (
          <div style={{ margin: '8px 10px 0' }}>
            <button
              onClick={handleGenerateAll}
              disabled={generating}
              style={{
                width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                padding: '8px 10px', borderRadius: 6, border: 'none',
                background: generating ? '#E8E4FF' : P,
                color: generating ? '#B4ADDD' : '#fff',
                fontSize: 11.5, fontWeight: 700, cursor: generating ? 'default' : 'pointer',
                fontFamily: 'inherit', transition: 'background 0.15s',
                boxShadow: generating ? 'none' : '0 2px 8px rgba(124,111,224,0.28)',
              }}
              onMouseEnter={e => { if (!generating) (e.currentTarget.style.background = P_D) }}
              onMouseLeave={e => { if (!generating) (e.currentTarget.style.background = P) }}
              title="Fills Subjects, Faculty and Rooms based on your classes. Does not change Classes."
            >
              <RefreshCw size={12} style={generating ? { animation: 'spin 1s linear infinite' } : {}} />
              {generating
                ? 'Generating…'
                : (counts.subjects === 0 && counts.teachers === 0 && counts.rooms === 0)
                  ? 'Fill Subjects & Staff'
                  : 'Regenerate All'}
            </button>
          </div>
        )}

        <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
      </div>

      {/* ══ Content area ═════════════════════════════════════════════════════ */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, overflow: 'hidden' }}>
        <div style={{ flex: 1, padding: '12px 18px 6px', overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>

          {/* ── Empty state ───────────────────────────────────────────────── */}
          {!hasAnyData && (
            <div style={{ maxWidth: 520, margin: '32px auto 0', textAlign: 'center' }}>
              <div style={{
                width: 56, height: 56, borderRadius: 14, background: P_L,
                display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 14px',
              }}>
                <Sparkles size={24} color={P} />
              </div>
              <h2 style={{ fontSize: 18, fontWeight: 800, color: '#0F0E1A', margin: '0 0 7px', letterSpacing: '-0.3px' }}>
                Add your resources
              </h2>
              <p style={{ fontSize: 12.5, color: '#6B7280', margin: '0 0 24px', lineHeight: 1.6 }}>
                {configuredClassDefs?.length
                  ? `Generate ${configuredClassDefs.length * 3} sections (3 per class, ${configuredClassDefs.length} classes from your setup), plus teachers, subjects and rooms — with class-teacher assignments pre-filled.`
                  : 'Generate your classes, teachers, subjects and rooms in one click based on your setup — or switch to a tab and use + Add to enter them manually.'
                }
              </p>
              <button
                onClick={handleGenerateAll}
                disabled={generating}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 7,
                  padding: '11px 24px', borderRadius: 8, border: 'none',
                  background: generating ? '#D8D2FF' : P,
                  color: '#fff', fontSize: 13, fontWeight: 700,
                  cursor: generating ? 'default' : 'pointer', fontFamily: 'inherit',
                  boxShadow: generating ? 'none' : '0 4px 14px rgba(124,111,224,0.38)',
                  transition: 'all 0.15s',
                }}
                onMouseEnter={e => { if (!generating) { (e.currentTarget.style.background = P_D); (e.currentTarget.style.boxShadow = '0 4px 18px rgba(99,88,196,0.45)') } }}
                onMouseLeave={e => { if (!generating) { (e.currentTarget.style.background = P); (e.currentTarget.style.boxShadow = '0 4px 14px rgba(124,111,224,0.38)') } }}
              >
                {generating
                  ? <><RefreshCw size={13} style={{ animation: 'spin 1s linear infinite' }} /> Generating…</>
                  : <><Sparkles size={13} /> AI Generate All Resources</>
                }
              </button>
              <p style={{ fontSize: 11, color: '#9CA3AF', marginTop: 10 }}>
                Or switch to a tab and use <strong>+ Add</strong> to enter data manually.
              </p>
            </div>
          )}

          {/* ── Panel view ─────────────────────────────────────────────────── */}
          {hasAnyData && (
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
              {/* Slim context banner */}
              <div style={{
                display: 'flex', alignItems: 'center',
                padding: '4px 10px', marginBottom: 7, flexShrink: 0,
                background: '#EDE9FF', borderRadius: 5, border: '1px solid #DDD8FF',
              }}>
                <span style={{ fontSize: 11, color: '#5B52C4', fontWeight: 600, letterSpacing: '-0.01em' }}>
                  {BANNER_TEXT[activeTab]}
                </span>
              </div>

              {/* Panels — all mounted, toggled via display */}
              <div style={{ flex: 1, minHeight: 0, display: activeTab === 'classes' ? 'flex' : 'none', flexDirection: 'column' }}>
                  {periods.length === 0 && (
                  <div style={{
                    padding: '7px 14px', background: '#FFF7ED',
                    border: '1px solid #FED7AA', borderRadius: 8, marginBottom: 8,
                    fontSize: 12, color: '#9A3412', fontWeight: 500,
                    display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0,
                  }}>
                    <span>⏱</span>
                    <span>
                      <strong>Scope</strong> lets you set day &amp; period availability per resource.
                      The full period matrix will be available once you configure <strong>Shift &amp; Timing</strong> in Step 2.
                      You can still set day-level availability now.
                    </span>
                  </div>
                )}
                <ClassesPanel
                  sections={sections} setSections={setSections}
                  onScopeClick={(sec, rect) =>
                    setScopeTarget((sec as any).id === '__bulk__'
                      ? { kind: 'BulkSection', entity: sec, rect }
                      : { kind: 'Section', entity: sec, rect })
                  }
                />
              </div>
              <div style={{ flex: 1, minHeight: 0, display: activeTab === 'subjects' ? 'flex' : 'none', flexDirection: 'column' }}>
                <SubjectsPanel
                  subjects={subjects} setSubjects={setSubjects}
                  sections={sections} board={config.board}
                  onGlobalAIAssign={handleSubjectsAIAssign}
                  globalAILoading={aiLoading && activeTab === 'subjects'}
                  globalAIStatus={aiStatus}
                  globalAIHasSnapshot={!!aiSnapshot}
                  globalAIApplied={subjectsAiApplied}
                  onGlobalAIUndo={handleGlobalAIUndo}
                  onScopeClick={(sub, rect) =>
                    setScopeTarget((sub as any).id === '__bulk__'
                      ? { kind: 'BulkSubject', entity: sub, rect }
                      : { kind: 'Subject', entity: sub, rect })
                  }
                />
              </div>
              <div style={{ flex: 1, minHeight: 0, display: activeTab === 'teachers' ? 'flex' : 'none', flexDirection: 'column' }}>
                <TeachersPanel
                  staff={staff} setStaff={setStaff}
                  sections={sections} subjects={subjects}
                  onScopeClick={(t, rect) =>
                    setScopeTarget((t as any).id === '__bulk__'
                      ? { kind: 'BulkTeacher', entity: t, rect }
                      : { kind: 'Teacher', entity: t, rect })
                  }
                  onAIFix={handleFacultyAIAssign}
                  aiLoading={aiLoading && activeTab === 'teachers'}
                  aiApplied={facultyAiApplied}
                />
              </div>
              <div style={{ flex: 1, minHeight: 0, display: activeTab === 'rooms' ? 'flex' : 'none', flexDirection: 'column' }}>
                <RoomsPanel
                  rooms={rooms} setRooms={setRooms}
                  sections={sections} setSections={setSections} subjects={subjects}
                  onScopeClick={(r, rect) =>
                    setScopeTarget((r as any).id === '__bulk__'
                      ? { kind: 'BulkRoom', entity: r, rect }
                      : { kind: 'Room', entity: r, rect })
                  }
                  onAIFix={handleRoomsAIAssign}
                  aiLoading={aiLoading && activeTab === 'rooms'}
                  aiApplied={roomsAiApplied}
                />
              </div>
            </div>
          )}
        </div>

        {/* ── Inter-tab Save & Continue footer ────────────────────────────── */}
        {hasAnyData && (() => {
          const TABS: TabKey[] = ['classes','subjects','teachers','rooms']
          const idx  = TABS.indexOf(activeTab)
          const prev = idx > 0 ? TABS[idx - 1] : null
          const next = idx < TABS.length - 1 ? TABS[idx + 1] : null
          const TAB_LABELS: Record<TabKey,string> = { classes:'Classes', subjects:'Subjects', teachers:'Faculty', rooms:'Rooms' }
          return (
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '8px 18px', borderTop: '1px solid #EAE6FF',
              background: '#fff', flexShrink: 0,
            }}>
              {/* Back */}
              {prev ? (
                <button onClick={() => setActiveTab(prev)} style={{
                  display: 'inline-flex', alignItems: 'center', gap: 5,
                  padding: '7px 16px', borderRadius: 7,
                  border: '1.5px solid #DDD8FF', background: '#fff',
                  color: '#5B52C4', fontSize: 12, fontWeight: 600,
                  cursor: 'pointer', fontFamily: 'inherit',
                }}>
                  ← {TAB_LABELS[prev]}
                </button>
              ) : <div />}

              {/* Readiness summary pills */}
              <div style={{ display: 'flex', gap: 6 }}>
                {TABS.map(t => {
                  const ok = counts[t] > 0
                  return (
                    <button key={t} onClick={() => setActiveTab(t)} style={{
                      display: 'inline-flex', alignItems: 'center', gap: 4,
                      padding: '3px 8px', borderRadius: 12,
                      background: t === activeTab ? P_L : ok ? '#F0FDF4' : '#F9FAFB',
                      border: `1px solid ${t === activeTab ? '#DDD8FF' : ok ? '#BBF7D0' : '#E5E7EB'}`,
                      color: t === activeTab ? P : ok ? '#15803D' : '#9CA3AF',
                      fontSize: 10, fontWeight: 700, cursor: 'pointer',
                      fontFamily: 'inherit',
                    }}>
                      <span style={{
                        width: 6, height: 6, borderRadius: '50%',
                        background: ok ? '#22C55E' : '#D1D5DB', flexShrink: 0,
                      }} />
                      {TAB_LABELS[t]}
                    </button>
                  )
                })}
              </div>

              {/* Next / Proceed */}
              {next ? (
                <button onClick={() => setActiveTab(next)} style={{
                  display: 'inline-flex', alignItems: 'center', gap: 5,
                  padding: '7px 16px', borderRadius: 7, border: 'none',
                  background: P, color: '#fff', fontSize: 12, fontWeight: 700,
                  cursor: 'pointer', fontFamily: 'inherit',
                  boxShadow: '0 2px 8px rgba(124,111,224,0.28)',
                }}>
                  {TAB_LABELS[next]} →
                </button>
              ) : (
                <button
                  onClick={() => { if (allReady) setStep(2) }}
                  disabled={!allReady}
                  title={allReady ? 'All resources ready — proceed to Shift & Timing' : 'Complete all four resource tabs first'}
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: 5,
                    padding: '7px 16px', borderRadius: 7, border: 'none',
                    background: allReady ? '#16A34A' : '#E5E7EB',
                    color: allReady ? '#fff' : '#9CA3AF',
                    fontSize: 12, fontWeight: 700,
                    cursor: allReady ? 'pointer' : 'default', fontFamily: 'inherit',
                    boxShadow: allReady ? '0 2px 8px rgba(22,163,74,0.28)' : 'none',
                    transition: 'all 0.15s',
                  }}
                >
                  {allReady ? '✓ Save & Proceed to Step 2' : 'Complete all tabs to proceed'}
                </button>
              )}
            </div>
          )
        })()}

        {/* Scope modal */}
        {scopeTarget && (
          <ScopeMatrixModal
            entityName={scopeTarget.entity.name ?? scopeTarget.entity.actualName ?? '—'}
            entityKind={scopeTarget.kind.replace('Bulk', '')}
            scope={scopeTarget.entity.scope}
            workDays={workDays}
            periods={periods}
            cycleWeeks={cycleWeeks}
            anchorRect={scopeTarget.rect}
            entities={
              // Grade/group-level scope passes memberIds — limit and order by them
              scopeTarget.kind === 'BulkSection'  ? sections
                  .filter((s: Section) => !(scopeTarget.entity as any).memberIds || (scopeTarget.entity as any).memberIds.includes(s.id))
                  .sort((a: Section, b: Section) => {
                    const mIds = (scopeTarget.entity as any).memberIds as string[] | undefined
                    if (!mIds) return 0
                    return mIds.indexOf(a.id) - mIds.indexOf(b.id)
                  })
                  .map((s: Section) => ({ id: s.id, name: s.name }))
              : scopeTarget.kind === 'BulkSubject' ? subjects.map((s: Subject) => ({ id: s.id, name: s.name }))
              : scopeTarget.kind === 'BulkTeacher' ? staff.map((t: Staff) => ({ id: t.id, name: t.name }))
              : scopeTarget.kind === 'BulkRoom'    ? rooms.map(r => ({ id: r.id, name: r.name }))
              : undefined
            }
            onSave={(nextScope, selectedIds) => {
              const k = scopeTarget.kind
              // Grade/group bulk: never touch sections outside the level's members
              const memberIds: string[] | undefined = (scopeTarget.entity as any).memberIds
              const inBulk = (id: string) =>
                (!selectedIds || selectedIds.includes(id)) && (!memberIds || memberIds.includes(id))
              if (k === 'Section')       setSections(sections.map((s: Section) => s.id === scopeTarget.entity.id ? { ...s, scope: nextScope } : s))
              else if (k === 'Subject')  setSubjects(subjects.map((s: Subject) => s.id === scopeTarget.entity.id ? { ...s, scope: nextScope } : s))
              else if (k === 'Teacher')  setStaff(staff.map((t: Staff) => t.id === scopeTarget.entity.id ? { ...t, scope: nextScope } : t))
              else if (k === 'Room')     setRooms(rooms.map(r => r.id === scopeTarget.entity.id ? { ...r, scope: nextScope } : r))
              else if (k === 'BulkSection')  setSections(sections.map((s: Section) => inBulk(s.id) ? { ...s, scope: nextScope } : s))
              else if (k === 'BulkSubject')  setSubjects(subjects.map((s: Subject) => inBulk(s.id) ? { ...s, scope: nextScope } : s))
              else if (k === 'BulkTeacher')  setStaff(staff.map((t: Staff) => inBulk(t.id) ? { ...t, scope: nextScope } : t))
              else if (k === 'BulkRoom')     setRooms(rooms.map(r => inBulk(r.id) ? { ...r, scope: nextScope } : r))
            }}
            onClose={() => setScopeTarget(null)}
          />
        )}

        {/* ══ Bottom nav ═══════════════════════════════════════════════════ */}
        <div style={{
          position: 'sticky', bottom: 0,
          background: '#fff', borderTop: '1px solid #EAE6FF',
          padding: '9px 20px',
          display: 'flex', alignItems: 'center', gap: 12,
          zIndex: 10,
        }}>
          <button
            onClick={() => window.location.href = '/dashboard'}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              padding: '6px 14px', borderRadius: 7,
              border: '1px solid #E4E0FF', background: '#fff',
              color: '#5B52C4', fontSize: 12, fontWeight: 600,
              cursor: 'pointer', fontFamily: 'inherit',
              transition: 'background 0.1s',
            }}
            onMouseEnter={e => (e.currentTarget.style.background = P_L)}
            onMouseLeave={e => (e.currentTarget.style.background = '#fff')}
          >
            <ChevronLeft size={13} /> Dashboard
          </button>

          <div style={{ flex: 1, textAlign: 'center' }}>
            <span style={{ fontSize: 11.5, color: '#9CA3AF', fontWeight: 500 }}>Step 1 of 5</span>
            {!allReady && (
              <span style={{ fontSize: 11.5, color: '#EA580C', marginLeft: 10, fontWeight: 600 }}>
                · All 4 resource types required before proceeding
              </span>
            )}
            {allReady && (
              <span style={{ fontSize: 11.5, color: '#16A34A', marginLeft: 10, fontWeight: 600 }}>
                · All resources ready ✓
              </span>
            )}
          </div>

          <button
            onClick={() => setStep(2)}
            disabled={!allReady}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              padding: '8px 18px', borderRadius: 7, border: 'none',
              background: allReady ? P : '#E8E4FF',
              color: allReady ? '#fff' : '#B8B4D4',
              fontSize: 12.5, fontWeight: 700,
              cursor: allReady ? 'pointer' : 'not-allowed',
              fontFamily: 'inherit',
              boxShadow: allReady ? '0 3px 12px rgba(124,111,224,0.36)' : 'none',
              transition: 'all 0.15s',
            }}
            onMouseEnter={e => { if (allReady) { (e.currentTarget.style.background = P_D); (e.currentTarget.style.boxShadow = '0 4px 16px rgba(99,88,196,0.42)') } }}
            onMouseLeave={e => { if (allReady) { (e.currentTarget.style.background = P); (e.currentTarget.style.boxShadow = '0 3px 12px rgba(124,111,224,0.36)') } }}
          >
            Save & Continue <ChevronRight size={14} />
          </button>
        </div>
      </div>
    </div>
  )
}
