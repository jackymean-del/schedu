/**
 * Step 3 — Allocation (Period + Teacher + Validation)
 *
 * Two-panel layout:
 *   Left  — tabs + grid (AllocationGrid or TeacherAllocationSummary)
 *   Right — contextual sidebar (syntax guide, capacity engine, AI notes, etc.)
 *
 * Tabs: Period allocation · Teacher allocation · Validation
 */

import { useState, useMemo, useEffect, useCallback, useRef, lazy, Suspense } from 'react'
import { teacherWeeklyCap } from '@/lib/teacherCap'
// xlsx is loaded on demand (export click) — keeps it out of the main bundle
import { useTimetableStore } from '@/store/timetableStore'
/**
 * AG Grid is ~21 MB unpacked and dominated the wizard's chunk — every person
 * who opened the wizard downloaded it, including the many who never open this
 * one sub-tab. Split out so it arrives when the tab does.
 */
const AllocationGridAG = lazy(() =>
  import('@/components/master/AllocationGridAG').then(m => ({ default: m.AllocationGridAG })))
import { TeacherAllocationSummary } from '@/components/master/TeacherAllocationSummary'
import { AllocationReportModal } from '@/components/master/AllocationReportModal'
import { buildPeriodSequence } from '@/lib/aiEngine'
import {
  computeCapacity, capacityForSection, inferBandFromSection, utilisationStatus,
  bellWeeklyCapacity,
} from '@/lib/capacityEngine'
import { parseAllocation } from '@/lib/allocationSyntax'
import { deriveWeeklySlots, toAllocationGrid, periodsForHours, mergePreservingManual } from '@/lib/periodAllocationEngine'
import { WorkloadNormModal } from '@/components/master/WorkloadNormModal'
import { bandForSection, BAND_LABELS, effectiveTeacherMaxPeriods, type GradeBand } from '@/lib/educationNorms'
import { studentHoursFor, expandSubjectOverrides } from '@/lib/facultyWorkload'
import { classOfSection } from '@/lib/syllabusTracking'
import { studentHoursWeekFor, teacherHoursWeekFor } from '@/lib/countryHours'
import { useWorkloadLimits, schoolCountry } from '@/store/workloadLimits'
import type { Section, Subject, Staff } from '@/types'
import {
  Grid3x3, Users, ChevronLeft, ChevronRight,
  Sparkles, AlertTriangle, CheckCircle2, Info, BookOpen,
  BarChart3, ShieldCheck, XCircle, FileText, FileSpreadsheet, } from 'lucide-react'

type Sub = 'periods' | 'teachers' | 'validation'

const DEFAULT_WORK_DAYS = ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY']

// Band display names + colors for Capacity Engine sidebar
const BANDS = [
  { key: 'pre',       label: 'Pre-primary',  color: '#685DBC' },
  { key: 'primary',   label: 'Primary',       color: '#0A8136' },
  { key: 'middle',    label: 'Middle',        color: '#2563EB' },
  { key: 'secondary', label: 'Secondary',     color: '#D97706' },
  { key: 'senior',    label: 'Sr. Secondary', color: '#DC2626' },
]

/** A shared empty fallback: `x ?? []` written inline is a new array every
 *  render, and every memo built on it recomputes for a change that never
 *  happened. */
const NO_ROWS: any[] = []

export function StepAllocation() {
  const store = useTimetableStore() as any
  const {
    setStep, subjectAllocations, teacherAllocations, staff,
    sections, subjects, config, breaks, periods: storePeriods,
  } = store
  const storeRooms: any[] = (store as any).rooms ?? NO_ROWS
  const [sub, setSub] = useState<Sub>('periods')
  const [displayMode, setDisplayMode] = useState<'periods' | 'hours'>('periods')
  const [showReport, setShowReport] = useState<'periods' | 'teachers' | null>(null)
  const [syncing, setSyncing]   = useState(false)
  const [syncDone, setSyncDone] = useState(false)
  const [sortRowsAZ, setSortRowsAZ] = useState(false)
  const [workloadOpen, setWorkloadOpen] = useState(false)
  const [keptEdits, setKeptEdits] = useState(0)
  const [sortColsAZ, setSortColsAZ] = useState(false)

  // Derive bell-schedule periods for TeacherAvailabilityEditor
  const derivedPeriods = useMemo(() => {
    try { return buildPeriodSequence(breaks ?? [], config?.periodsPerDay ?? 8) }
    catch { return [] }
  }, [breaks, config?.periodsPerDay])

  const workDays: string[] = config?.workDays?.length ? config.workDays : DEFAULT_WORK_DAYS
  // store.periods is empty until the first generation — `??` keeps an empty
  // array, so fall back on LENGTH to the bell-derived sequence.
  const periodsArr = storePeriods?.length ? storePeriods : derivedPeriods

  // Capacity engine
  const cap = useMemo(() => computeCapacity(workDays, periodsArr), [workDays, periodsArr])
  const periodMinutes = config?.periodMinutes ?? 40

  // Step 0's workload norms — the country reference plus any custom override.
  // Blueprint v6 requires these both to SEED the allocation engine and to be
  // shown here for faculty and students; previously they existed only in
  // Settings and reached nothing.
  const studentMaxHoursWeek = useWorkloadLimits(s => s.studentMaxHoursWeek)
  const studentMaxHoursWeekByClass = useWorkloadLimits(s => s.studentMaxHoursWeekByClass)
  const subjectPeriodsByClass = useWorkloadLimits(s => s.subjectPeriodsByClass)
  const teacherMaxHoursWeek = useWorkloadLimits(s => s.teacherMaxHoursWeek)
  const country = schoolCountry((config as any)?.countryCode)
  // The default teacher cap, from the norms database. Every allocation pass must
  // use this rather than a literal: a hardcoded 32 is only right for a country
  // whose safe teaching load happens to be 32.
  const normTeacherMax = effectiveTeacherMaxPeriods(country, periodMinutes, teacherMaxHoursWeek)

  // Capacity resolution: user override → bell-true (real periods/day × days,
  // covers per-group early dispersal) → band heuristic fallback.
  const capOverrides: Record<string, number> = (store as any).sectionCapacityOverrides ?? {}
  const capFor = useCallback((secName: string): number => {
    const o = capOverrides[secName]
    if (o !== undefined) return o
    const bell = bellWeeklyCapacity(secName, (config as any)?.bellSchedules, workDays.length)
    if (bell != null) return bell
    return capacityForSection(cap, inferBandFromSection(secName))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [capOverrides, (config as any)?.bellSchedules, workDays.length, cap])

  // Per-section totals (for capacity engine sidebar)
  const sectionTotals = useMemo(() => {
    const m: Record<string, number> = {}
    ;(sections as Section[]).forEach(sec => {
      const row = subjectAllocations[sec.name] ?? {}
      let t = 0
      ;(subjects as Subject[]).forEach(sub => {
        const raw = row[sub.name] ?? ''
        if (!raw) return
        const p = parseAllocation(raw)
        if (p.valid) t += p.weeklyTotal
      })
      m[sec.name] = t
    })
    return m
  }, [sections, subjects, subjectAllocations])

  // Per-band utilisation for sidebar
  const bandStats = useMemo(() => {
    const m: Record<string, { used: number; cap: number; count: number }> = {}
    BANDS.forEach(b => { m[b.key] = { used: 0, cap: 0, count: 0 } })
    ;(sections as Section[]).forEach(sec => {
      const band = inferBandFromSection(sec.name)
      const c = capFor(sec.name)
      const u = sectionTotals[sec.name] ?? 0
      if (!m[band]) m[band] = { used: 0, cap: 0, count: 0 }
      m[band].used += u
      m[band].cap  += c
      m[band].count++
    })
    return m
  }, [sections, sectionTotals, capFor])

  // Validation checks
  const { hardConflicts, softWarnings } = useMemo(() => {
    const hard: string[] = []
    const soft: string[] = []

    // Period allocation checks
    ;(sections as Section[]).forEach(sec => {
      const c = capFor(sec.name)
      const u = sectionTotals[sec.name] ?? 0
      const status = utilisationStatus(u, c)
      if (status === 'over')   hard.push(`${sec.name}: allocated ${u} > capacity ${c}`)
      if (status === 'light' && c > 0) soft.push(`${sec.name}: only ${u}/${c} periods used — under board minimum`)
    })

    // Teacher load checks
    ;(staff as Staff[]).forEach(t => {
      const max = teacherWeeklyCap(t as any)
      let total = 0
      const tMap = teacherAllocations[t.name] ?? {}
      Object.values(tMap).forEach((sMap: any) =>
        Object.values(sMap ?? {}).forEach((p: any) => { if (typeof p === 'number') total += p })
      )
      if (total > max) hard.push(`${t.name}: ${total} periods assigned > max ${max}`)
    })

    // Resource-level: subjects with no teacher assigned in period-allocated cells
    //
    // A teacher is considered "assigned" for a (section, subject) pair when
    // EITHER of these is true — checking both avoids false positives where the
    // user has designated a teacher in Resources but hasn't yet run HI allocate:
    //
    //   Signal A — teacherAllocations has an explicit period number > 0
    //              (set via Teacher Allocation tab or AI allocate)
    //   Signal B — a teacher's subjectMappings in Resources lists this section
    //              for this subject (designation without period count yet)
    const missingBySubject: Record<string, string[]> = {}
    ;(sections as Section[]).forEach(sec => {
      ;(subjects as Subject[]).forEach(s => {
        const raw = (subjectAllocations as any)?.[sec.name]?.[s.name]
        if (!raw) return
        const p = parseAllocation(raw)
        if (!p.valid || p.weeklyTotal <= 0) return

        const hasTeacher = (staff as Staff[]).some(t => {
          // Signal A: explicit period allocation
          const allocated = (teacherAllocations as any)?.[t.name]?.[sec.name]?.[s.name]
          if (typeof allocated === 'number' && allocated > 0) return true
          // Signal B: teacher is designated via subjectMappings in Resources
          const maps: Array<{ subject: string; classes: string[] }> = (t as any).subjectMappings ?? []
          return maps.some((m: any) => m.subject === s.name && (m.classes ?? []).includes(sec.name))
        })

        if (!hasTeacher) {
          if (!missingBySubject[s.name]) missingBySubject[s.name] = []
          missingBySubject[s.name].push(sec.name)
        }
      })
    })
    Object.entries(missingBySubject).forEach(([subName, classes]) => {
      const display = classes.length > 4
        ? `${classes.slice(0, 4).join(', ')} +${classes.length - 4} more`
        : classes.join(', ')
      soft.push(`"${subName}" has no teacher assigned in: ${display} — assign in Resources → Teachers`)
    })

    // Resource-level: lab subjects with no suitable lab room
    //
    // Detect "needs a lab" via TWO signals:
    //   1. subject.requiresLab === true  (set in Resources → Subjects)
    //   2. allocation uses +L or nL syntax (labPeriods > 0)
    //
    // Only count subjects that are ACTUALLY ALLOCATED to at least one section in this
    // timetable — this prevents false positives from subjects that have the requiresLab
    // flag set but are not in use (e.g. an elective added to Resources but never scheduled).
    //
    // Room-type match: case-insensitive, checks both .type (RoomRow / new RoomsPanel) and
    // .roomType (legacy Room type stored with lowercase 'lab').  Handles 'Lab', 'lab',
    // 'Computer Lab', 'Science Lab', etc.
    const labSubjects = (subjects as Subject[]).filter(s => {
      // Signal 1 — explicit flag
      const hasFlag = !!(s as any).requiresLab
      // Signal 2 — any section uses +L / nL allocation syntax for this subject
      const hasLabSyntax = !hasFlag && (sections as Section[]).some(sec => {
        const raw = (subjectAllocations as any)?.[sec.name]?.[s.name]
        return raw ? parseAllocation(raw).labPeriods > 0 : false
      })
      if (!hasFlag && !hasLabSyntax) return false
      // Guard: only include if subject is actually allocated (has periods > 0 somewhere)
      return (sections as Section[]).some(sec => {
        const raw = (subjectAllocations as any)?.[sec.name]?.[s.name]
        return raw ? parseAllocation(raw).weeklyTotal > 0 : false
      })
    })
    if (labSubjects.length > 0) {
      const hasLabRoom = storeRooms.some((r: any) => {
        // Support both RoomRow (.type) and legacy Room (.roomType), case-insensitive
        const t = ((r.type ?? r.roomType) ?? '').toLowerCase()
        return t.includes('lab')
      })
      if (!hasLabRoom) {
        const names = labSubjects.slice(0, 3).map(s => s.name).join(', ')
        soft.push(`${labSubjects.length} subject${labSubjects.length > 1 ? 's require' : ' requires'} a lab room (${names}${labSubjects.length > 3 ? ' +more' : ''}) — add a Lab room in Resources → Rooms`)
      }
    }

    // Resource-level: subjects configured in Resources for a section but with no period allocation.
    //
    // When a user sets up classConfigs in Resources → Subjects (assigning a subject to
    // specific sections) but then never fills in that cell in the Period Allocation grid,
    // the teacher warning above is silently skipped (no raw allocation → outer `if (!raw) return`).
    // This check catches those orphaned sections so the user knows to allocate or run Sync.
    //
    // Guard: only fire if the subject IS allocated somewhere else in the timetable — this
    // prevents false alarms for subjects that are in Resources but not yet scheduled at all.
    const allocationGaps: Record<string, string[]> = {}
    ;(subjects as Subject[]).forEach(s => {
      // Collect every section this subject is configured for — classConfigs takes
      // priority; fall back to the legacy sections[] array on the subject object.
      const configs = (s as any).classConfigs as any[] | undefined
      const appliedSections: string[] = configs && configs.length > 0
        ? configs.map((c: any) => c.sectionName).filter(Boolean)
        : ((s as any).sections as string[] | undefined ?? [])
      if (!appliedSections.length) return
      // Subject must be actively allocated somewhere to be "in use"
      const hasAnyAllocation = appliedSections.some(secName => {
        const raw = (subjectAllocations as any)?.[secName]?.[s.name]
        return raw ? parseAllocation(raw).weeklyTotal > 0 : false
      })
      if (!hasAnyAllocation) return
      // Find configured sections that have no period allocation
      appliedSections.forEach(secName => {
        const raw = (subjectAllocations as any)?.[secName]?.[s.name]
        if (!raw || parseAllocation(raw).weeklyTotal <= 0) {
          if (!allocationGaps[s.name]) allocationGaps[s.name] = []
          allocationGaps[s.name].push(secName)
        }
      })
    })
    Object.entries(allocationGaps).forEach(([subName, classes]) => {
      const display = classes.length > 4
        ? `${classes.slice(0, 4).join(', ')} +${classes.length - 4} more`
        : classes.join(', ')
      soft.push(`"${subName}" is in Resources for: ${display} — but has no period allocation. Run Sync or fill manually.`)
    })

    // Grade-level cross-section consistency check
    //
    // If subject X has period allocations in ≥2 sections of a grade AND in >50 % of that
    // grade's total sections, but is MISSING from some others, flag those missing sections.
    //
    // This catches "PE is in XI-Arts + XI-Com-A but accidentally skipped XI-Sci-A" even
    // when XI-Sci-A never appears in PE's sections[] / classConfigs at all.
    //
    // Why >50 % threshold?  Prevents false positives for stream-specific subjects:
    //   Biology: only in XI-Sci-A (1/3 = 33 %) → no warning
    //   PE: in XI-Arts + XI-Com-A (2/3 = 67 %) → warns about XI-Sci-A ✓
    const sectionsByGrade = new Map<string, string[]>()
    ;(sections as Section[]).forEach(sec => {
      const grade = sec.name.split('-')[0].trim()
      if (!sectionsByGrade.has(grade)) sectionsByGrade.set(grade, [])
      sectionsByGrade.get(grade)!.push(sec.name)
    })
    const gradeConsistencyGaps: Record<string, string[]> = {}
    ;(subjects as Subject[]).forEach(s => {
      sectionsByGrade.forEach(gradeSecs => {
        if (gradeSecs.length < 2) return  // nothing to compare in a single-section grade
        const allocated = gradeSecs.filter(sec => {
          const raw = (subjectAllocations as any)?.[sec]?.[s.name]
          return raw ? parseAllocation(raw).weeklyTotal > 0 : false
        })
        // Need ≥2 sections allocated AND ratio > 50 %
        if (allocated.length < 2 || allocated.length * 2 <= gradeSecs.length) return
        const missing = gradeSecs.filter(sec => {
          const raw = (subjectAllocations as any)?.[sec]?.[s.name]
          return !raw || parseAllocation(raw).weeklyTotal <= 0
        })
        if (!missing.length) return
        missing.forEach(sec => {
          // Skip if already covered by allocationGaps warning for this subject+section
          if ((allocationGaps[s.name] ?? []).includes(sec)) return
          if (!gradeConsistencyGaps[s.name]) gradeConsistencyGaps[s.name] = []
          gradeConsistencyGaps[s.name].push(sec)
        })
      })
    })
    Object.entries(gradeConsistencyGaps).forEach(([subName, classes]) => {
      const display = classes.length > 4
        ? `${classes.slice(0, 4).join(', ')} +${classes.length - 4} more`
        : classes.join(', ')
      soft.push(`"${subName}" has periods in other sections of the same grade but none in: ${display} — check Period Allocation or add to Resources → Subjects`)
    })

    // Resource-level: total period demand vs total teacher capacity
    let totalPeriodDemand = 0
    ;(sections as Section[]).forEach(sec => {
      ;(subjects as Subject[]).forEach(s => {
        const raw = (subjectAllocations as any)?.[sec.name]?.[s.name]
        if (!raw) return
        const p = parseAllocation(raw)
        if (p.valid) totalPeriodDemand += p.weeklyTotal
      })
    })
    const totalTeacherCapacity = (staff as Staff[]).reduce((sum, t) =>
      sum + (teacherWeeklyCap(t as any)), 0)
    if (totalTeacherCapacity > 0 && totalPeriodDemand > totalTeacherCapacity) {
      const deficit = totalPeriodDemand - totalTeacherCapacity
      const approx  = Math.ceil(deficit / 30)
      soft.push(`Period demand (${totalPeriodDemand}p/wk) exceeds total teacher capacity (${totalTeacherCapacity}p/wk) by ${deficit} — consider adding ~${approx} more teacher${approx > 1 ? 's' : ''}`)
    }

    return { hardConflicts: hard, softWarnings: soft }
  }, [sections, sectionTotals, capFor, staff, teacherAllocations, subjects, subjectAllocations, storeRooms])

  // Teacher allocation summary stats
  const teacherStats = useMemo(() => {
    const rows = (staff as Staff[]).map((t: Staff) => {
      const max = teacherWeeklyCap(t as any)
      let load = 0
      const tMap = teacherAllocations[t.name] ?? {}
      Object.values(tMap).forEach((sMap: any) =>
        Object.values(sMap ?? {}).forEach((p: any) => { if (typeof p === 'number') load += p })
      )
      return { load, max }
    })
    const total = rows.length
    const fullyAllocated = rows.filter(r => r.load >= r.max * 0.85 && r.load <= r.max * 1.05).length
    const overloaded = rows.filter(r => r.load > r.max * 1.05).length
    const light = rows.filter(r => r.load > 0 && r.load < r.max * 0.4).length
    const unassigned = rows.filter(r => r.load === 0).length
    return { total, fullyAllocated, overloaded, light, unassigned }
  }, [staff, teacherAllocations])

  const hasAllocations = Object.values(subjectAllocations ?? {}).some(
    (row: any) => Object.values(row ?? {}).some((v: any) => v && String(v).trim() !== '')
  )

  // ── THE PERIOD ALLOCATION ENGINE (master doc "STEP 6") ────────────────────────
  // Weekly periods are DERIVED here, from the board's curriculum norms, the
  // working days, the period duration and the Step 0 student hours/week — not
  // read back from numbers typed on the Resources page. That inversion is why
  // changing the bell or the working week used to leave the allocation stale.
  //
  // Resources still owns WHICH subjects a section takes; this owns HOW MANY
  // periods each one gets.
  const derivedAllocation = useMemo(() => deriveWeeklySlots({
    sections: (sections as Section[]).map(s => s.name),
    subjects: (subjects as Subject[]).map(s => ({
      name: s.name,
      periodsPerWeek: s.periodsPerWeek,
      requiresLab: !!(s as any).requiresLab,
      sections: (s as any).sections,
      classConfigs: (s as any).classConfigs,
    })),
    board: (config as any)?.boardType ?? (config as any)?.board,
    capacityFor: capFor,
    // Step 0's figure, per v6: "becomes the seed input to the allocation
    // engine" — resolved narrowest-first, class over stage over national.
    studentHoursWeekFor: (section: string) => studentHoursFor(
      classOfSection(section),
      bandForSection(section),
      { studentMaxHoursWeekByClass, studentMaxHoursWeek },
      studentHoursWeekFor(country, bandForSection(section))?.hours,
    ),
    periodMinutes,
    // Per-subject overrides, stated once per CLASS and expanded to its sections.
  }, expandSubjectOverrides(subjectPeriodsByClass, (sections as Section[]).map(s => s.name), classOfSection)),
  [sections, subjects, config, capFor, studentMaxHoursWeek, studentMaxHoursWeekByClass,
   subjectPeriodsByClass, country, periodMinutes])

  // Re-derive, but never at the cost of somebody's hand-tuned cells. The
  // derivation is a default; a figure a person typed stands until they clear it.
  const handleAIPeriodSuggest = useCallback(() => {
    const { grid, kept } = mergePreservingManual(
      toAllocationGrid(derivedAllocation),
      store.subjectAllocations ?? {},
      store.manualSubjectAllocations ?? {},
    )
    store.setSubjectAllocations?.(grid)
    setKeptEdits(kept)
    if (kept > 0) setTimeout(() => setKeptEdits(0), 6000)
  }, [derivedAllocation, store])

  // ── Derive teacher allocations ─────────────────────────────────────────────────
  // Pass 1a: explicit subjectMappings, strictly capped at teacher's weekly max.
  // Pass 1b: overflow from capped mappings re-assigned to any other qualified teacher.
  // Pass 2:  remaining pairs — load-balanced, grade-band aware.
  // Pass 3:  absolute fallback — any remaining pair gets the best-fit teacher even if
  //          slightly over-max (surfaces as a soft warning, never leaves a blank cell).
  const handleAITeacherAllocate = useCallback((periodAllocs?: Record<string, Record<string, string>>) => {
    // Grade-band restriction helpers (defined inside callback — no stable-ref issue)
    //
    // Grade rank: 0-2 = pre-primary (Nursery/LKG/UKG)
    //             3-4 = lower primary (I-II)
    //             5-7 = upper primary (III-V)
    //             8+  = secondary (VI and above)
    //
    // Rules: pre-primary/lower/upper teachers stay in their own band.
    // Secondary (VI+) teachers are flexible across all secondary grades.
    const GRADE_RANK_MAP: Record<string, number> = {
      NURSERY: 0, NUR: 0,
      LKG: 1, 'LOWER-KG': 1, LOWERKG: 1,
      UKG: 2, 'UPPER-KG': 2, UPPERKG: 2,
      I: 3, '1': 3, II: 4, '2': 4,
      III: 5, '3': 5, IV: 6, '4': 6, V: 7, '5': 7,
      VI: 8, '6': 8, VII: 9, '7': 9, VIII: 10, '8': 10,
      IX: 11, '9': 11, X: 12, '10': 12,
      XI: 13, '11': 13, XII: 14, '12': 14,
    }
    const gradeRankOf = (secName: string) => {
      const g = secName.split('-')[0].trim().toUpperCase()
      return GRADE_RANK_MAP[g] ?? 8
    }
    const bandOf = (rank: number) =>
      rank <= 2 ? 'pre' : rank <= 4 ? 'lower' : rank <= 7 ? 'upper' : 'secondary'
    const teacherAllowedForSection = (t: any, targetSec: string): boolean => {
      const maps: Array<{ subject: string; classes: string[] }> = t.subjectMappings ?? []
      const mapped: string[] = []
      maps.forEach(m => mapped.push(...(m.classes ?? [])))
      ;(t.classes ?? []).forEach((c: string) => mapped.push(c))
      if (!mapped.length) return true  // no prior assignments → no band restriction
      const minRank    = Math.min(...mapped.map(gradeRankOf))
      const tBand      = bandOf(minRank)
      const targetBand = bandOf(gradeRankOf(targetSec))
      if (tBand === 'secondary') return targetBand === 'secondary'
      return tBand === targetBand
    }
    const allocs   = periodAllocs ?? subjectAllocations ?? {}
    const next: Record<string, Record<string, Record<string, number>>> = {}
    const load:  Record<string, number> = {}
    const covered  = new Set<string>()  // "cls::subject" pairs definitively assigned
    const overflow: Array<{ cls: string; subject: string; target: number }> = []

    // Init load counters
    ;(staff as Staff[]).forEach((t: Staff) => { load[t.name] = 0 })

    // PASS 1a — explicit subjectMappings, capped at maxPeriodsPerWeek
    ;(staff as Staff[]).forEach((t: Staff) => {
      // Fall back to the WORKLOAD NORM, not a literal — a hardcoded 32 silently
      // overloaded every country whose safe teaching load is lower (GB 22, AU 20).
      const maxPeriods = (t as any).maxPeriodsPerWeek ?? normTeacherMax
      const maps: Array<{ subject: string; classes: string[] }> = ((t as any).subjectMappings ?? [])
        .filter((m: any) => (m.classes ?? []).length > 0)
      if (!maps.length) return
      maps.forEach((m: { subject: string; classes: string[] }) => {
        m.classes.forEach((cls: string) => {
          const raw = allocs[cls]?.[m.subject]
          if (!raw) return
          const target = parseAllocation(raw).weeklyTotal || 0
          if (target <= 0) return
          if ((load[t.name] ?? 0) + target > maxPeriods) {
            // Teacher is at capacity — queue this pair for re-assignment
            overflow.push({ cls, subject: m.subject, target })
            return
          }
          if (!next[t.name])      next[t.name]      = {}
          if (!next[t.name][cls]) next[t.name][cls] = {}
          next[t.name][cls][m.subject] = (next[t.name][cls][m.subject] ?? 0) + target
          load[t.name]  = (load[t.name]  ?? 0) + target
          covered.add(`${cls}::${m.subject}`)
        })
      })
    })

    // Shared helper: assign a cls+subject to the best available qualified teacher.
    // Priority order:
    //   1. Grade-band appropriate + has subject in subjects[] + has capacity
    //   2. Grade-band appropriate + has capacity (any subject knowledge)
    //   3. Any teacher with capacity (cross-band fallback for unmatched grades)
    // Returns false only when truly no teacher has any remaining capacity.
    const assignToAvailable = (cls: string, subject: string, target: number): boolean => {
      if (covered.has(`${cls}::${subject}`)) return true
      const maxFn = (t: Staff) => (t as any).maxPeriodsPerWeek ?? normTeacherMax
      const hasRoom  = (t: Staff) => (load[t.name] ?? 0) + target <= maxFn(t)
      const knowsSub = (t: Staff) => (t.subjects ?? []).some((x: string) => x === subject)
      const inBand   = (t: Staff) => teacherAllowedForSection(t as any, cls)

      // Build candidate pools in priority order, each requiring capacity
      const allWithRoom = (staff as Staff[]).filter(hasRoom)
      const band1 = allWithRoom.filter(t => inBand(t) && knowsSub(t))
      const band2 = allWithRoom.filter(t => inBand(t) && !knowsSub(t))
      const band3 = allWithRoom.filter(t => !inBand(t))  // cross-band last resort

      const pool = band1.length ? band1 : band2.length ? band2 : band3
      const chosen = [...pool].sort((a, b) => (load[a.name] ?? 0) - (load[b.name] ?? 0))[0]
      if (!chosen) return false  // truly no capacity anywhere
      if (!next[chosen.name])            next[chosen.name]            = {}
      if (!next[chosen.name][cls])       next[chosen.name][cls]       = {}
      next[chosen.name][cls][subject] = (next[chosen.name][cls][subject] ?? 0) + target
      load[chosen.name] = (load[chosen.name] ?? 0) + target
      covered.add(`${cls}::${subject}`)
      return true
    }

    // PASS 1b — re-assign overflowed explicit mappings to other available teachers
    overflow.forEach(({ cls, subject, target }) => assignToAvailable(cls, subject, target))

    // PASS 2 — grade-band-aware assignment for pairs not covered by any explicit mapping
    ;(sections as Section[]).forEach((sec: Section) => {
      ;(subjects as Subject[]).forEach((s: Subject) => {
        if (covered.has(`${sec.name}::${s.name}`)) return
        const raw = allocs[sec.name]?.[s.name]
        if (!raw) return
        const target = parseAllocation(raw).weeklyTotal || 0
        if (target <= 0) return
        // Only assign if subject is actually mapped to this section in Resources
        const sExt    = s as any
        const configs = sExt.classConfigs as any[] | undefined
        const isAssigned = configs?.length
          ? configs.some((c: any) => c.sectionName === sec.name)
          : (sExt.sections ?? []).includes(sec.name)
        if (!isAssigned) return
        assignToAvailable(sec.name, s.name, target)
      })
    })

    // PASS 3 — absolute coverage fallback: any still-uncovered pair gets the lightest-loaded
    // grade-band-appropriate teacher, even if it slightly exceeds their maxPeriodsPerWeek.
    // This ensures NO cell is left without a teacher name — the resulting overload surfaces
    // as a soft "over capacity" warning in Validation rather than silently going blank.
    ;(sections as Section[]).forEach((sec: Section) => {
      ;(subjects as Subject[]).forEach((s: Subject) => {
        if (covered.has(`${sec.name}::${s.name}`)) return
        const raw = allocs[sec.name]?.[s.name]
        if (!raw) return
        const target = parseAllocation(raw).weeklyTotal || 0
        if (target <= 0) return
        const sExt    = s as any
        const configs = sExt.classConfigs as any[] | undefined
        const isAssigned = configs?.length
          ? configs.some((c: any) => c.sectionName === sec.name)
          : (sExt.sections ?? []).includes(sec.name)
        if (!isAssigned) return
        // Sort: band-appropriate first, then by lightest load — ignore max cap this pass
        const sorted = [...(staff as Staff[])].sort((a, b) => {
          const aOk = teacherAllowedForSection(a as any, sec.name) ? 0 : 1
          const bOk = teacherAllowedForSection(b as any, sec.name) ? 0 : 1
          if (aOk !== bOk) return aOk - bOk
          const aKnows = (a.subjects ?? []).includes(s.name) ? 0 : 1
          const bKnows = (b.subjects ?? []).includes(s.name) ? 0 : 1
          if (aKnows !== bKnows) return aKnows - bKnows
          return (load[a.name] ?? 0) - (load[b.name] ?? 0)
        })
        const chosen = sorted[0]
        if (!chosen) return
        if (!next[chosen.name])                next[chosen.name]                = {}
        if (!next[chosen.name][sec.name])      next[chosen.name][sec.name]      = {}
        next[chosen.name][sec.name][s.name] = (next[chosen.name][sec.name][s.name] ?? 0) + target
        load[chosen.name] = (load[chosen.name] ?? 0) + target
        covered.add(`${sec.name}::${s.name}`)
      })
    })

    Object.keys(next).forEach(k => { if (!Object.keys(next[k]).length) delete next[k] })
    store.setTeacherAllocations?.(next)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [staff, sections, subjects, subjectAllocations, store])

  // ── One-click sync: periods + teachers from Resources in one pass ─────────────
  // Async so the browser can render the spinner before the synchronous work.
  const handleSyncFromResources = useCallback(async () => {
    if (syncing) return
    setSyncing(true)
    setSyncDone(false)
    // Yield to paint thread so the spinner renders before heavy computation
    await new Promise<void>(r => setTimeout(r, 60))
    // Same rule as Suggest: re-deriving must not throw away hand-typed cells.
    const { grid: nextPeriods, kept } = mergePreservingManual(
      toAllocationGrid(derivedAllocation),
      store.subjectAllocations ?? {},
      store.manualSubjectAllocations ?? {},
    )
    if (Object.keys(nextPeriods).length > 0) {
      store.setSubjectAllocations?.(nextPeriods)
      setKeptEdits(kept)
      if (kept > 0) setTimeout(() => setKeptEdits(0), 6000)
      handleAITeacherAllocate(nextPeriods)   // passes fresh periods — avoids stale-state race
    } else {
      // Resources carry no explicit class↔subject mappings — there is nothing
      // to sync. NEVER overwrite the existing matrix with an empty one (the
      // grid's own capacity-aware auto-fill may have just populated it).
      handleAITeacherAllocate()
    }
    setSyncing(false)
    setSyncDone(true)
    setTimeout(() => setSyncDone(false), 2500)
  }, [derivedAllocation, handleAITeacherAllocate, store, syncing])

  // ── Hard guarantee: AI never leaves an over-capacity section ──────────────────
  // Whatever produced the allocations (resource sync, stale data, raw subject
  // periods), scale any section whose total exceeds its capacity down to fit.
  // Idempotent: after a pass every section total ≤ capacity, so it won't loop.
  const clampToCapacity = useCallback(() => {
    const current = subjectAllocations ?? {}
    let changed = false
    const next: Record<string, Record<string, string>> = { ...current }
    ;(sections as Section[]).forEach(sec => {
      const row = current[sec.name] ?? {}
      const cap = capFor(sec.name)
      if (cap <= 0) return
      const entries = Object.entries(row)
        .map(([sub, raw]) => { const p = parseAllocation(String(raw)); return { sub, total: p.valid ? p.weeklyTotal : 0 } })
        .filter(e => e.total > 0)
      const total = entries.reduce((a, e) => a + e.total, 0)
      if (total <= cap) return
      // Scale down proportionally; give any leftover to the last subject.
      const scale = cap / total
      let allocated = 0
      const newRow: Record<string, string> = {}
      entries.forEach((e, i) => {
        const isLast = i === entries.length - 1
        const v = isLast ? Math.max(0, cap - allocated) : Math.max(1, Math.floor(e.total * scale))
        if (v > 0) newRow[e.sub] = String(v)
        allocated += v
      })
      next[sec.name] = newRow
      changed = true
    })
    if (changed) store.setSubjectAllocations?.(next)
    return changed
  }, [sections, subjectAllocations, capFor, store])

  // ── Auto-derive on first entry: run if allocations empty OR hard conflicts exist ──
  const autoRanRef = useRef(false)
  useEffect(() => {
    if (autoRanRef.current) return
    autoRanRef.current = true
    const hasSubs = (subjects as Subject[]).length > 0
    const hasSecs = (sections as Section[]).length > 0
    // Auto-sync if: (a) no allocations yet, OR (b) existing data has hard conflicts
    if ((!hasAllocations || hardConflicts.length > 0) && hasSubs && hasSecs) {
      handleSyncFromResources()
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []) // intentionally mount-only — autoRanRef prevents double-fire in StrictMode

  // Safety net: any time an over-capacity hard conflict exists, clamp it away.
  useEffect(() => {
    if (hardConflicts.some(c => c.includes('> capacity'))) clampToCapacity()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hardConflicts])

  // ── Export helpers ──────────────────────────────────────────────────────────
  const exportPeriodAllocation = useCallback(async (fmt: 'xlsx' | 'csv') => {
    const XLSX = await import('xlsx')
    const secs = sections as Section[]
    const subs = subjects as Subject[]
    const allocs = subjectAllocations ?? {}
    const header = ['Class', ...subs.map((s: Subject) => s.shortName ?? s.name), 'Total']
    const rows = secs.map((sec: Section) => {
      let total = 0
      const cells = subs.map((s: Subject) => {
        const raw = allocs[sec.name]?.[s.name]
        const p = raw ? (parseAllocation(raw).weeklyTotal || 0) : 0
        total += p
        return p > 0 ? (displayMode === 'hours' ? `${Math.floor(p * periodMinutes / 60)}h${p * periodMinutes % 60 ? `${p * periodMinutes % 60}m` : ''}` : String(p)) : ''
      })
      return [sec.name, ...cells, String(total)]
    })
    const data = [header, ...rows]
    const wb = XLSX.utils.book_new()
    const ws = XLSX.utils.aoa_to_sheet(data)
    ws['!cols'] = data[0].map((_, ci) => ({ wch: Math.min(20, Math.max(8, ...data.map(r => String(r[ci] ?? '').length))) }))
    XLSX.utils.book_append_sheet(wb, ws, 'Period Allocation')
    if (fmt === 'csv') {
      const csv = data.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n')
      const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' })
      const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'Period_Allocation.csv'; a.click()
    } else {
      XLSX.writeFile(wb, 'Period_Allocation.xlsx')
    }
  }, [sections, subjects, subjectAllocations, displayMode, periodMinutes])

  const exportTeacherAllocation = useCallback(async (fmt: 'xlsx' | 'csv') => {
    const XLSX = await import('xlsx')
    const allocs = teacherAllocations ?? {}
    const header = ['Teacher', 'Total Periods', 'Max Periods', 'Utilisation %', 'Subjects', 'Classes', 'Assignment Detail']
    const rows = (staff as Staff[]).map((t: Staff) => {
      const tMap = allocs[t.name] ?? {}
      let total = 0; const subSet = new Set<string>(); const secSet = new Set<string>()
      const details: string[] = []
      Object.entries(tMap).forEach(([sec, sMap]: [string, any]) => {
        Object.entries(sMap ?? {}).forEach(([sub, p]: [string, any]) => {
          if (typeof p === 'number' && p > 0) {
            total += p; subSet.add(sub); secSet.add(sec)
            details.push(`${sub}→${sec}(${p}p)`)
          }
        })
      })
      const max = teacherWeeklyCap(t as any)
      return [t.name, String(total), String(max), `${max > 0 ? Math.round(total / max * 100) : 0}%`, String(subSet.size), String(secSet.size), details.join('; ')]
    })
    const data = [header, ...rows]
    const wb = XLSX.utils.book_new()
    const ws = XLSX.utils.aoa_to_sheet(data)
    ws['!cols'] = header.map((h, i) => ({ wch: Math.min(40, Math.max(12, ...data.map(r => String(r[i] ?? '').length))) }))
    XLSX.utils.book_append_sheet(wb, ws, 'Teacher Allocation')
    if (fmt === 'csv') {
      const csv = data.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n')
      const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' })
      const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'Teacher_Allocation.csv'; a.click()
    } else {
      XLSX.writeFile(wb, 'Teacher_Allocation.xlsx')
    }
  }, [staff, teacherAllocations])

  // ── Toolbar extra for the periods tab — thin spreadsheet ribbon ──────────
  const periodsToolbarExtra = (
    <>
      {/* Sort toggles */}
      <button onClick={() => setSortRowsAZ(p => !p)} title={sortRowsAZ ? 'Rows sorted A→Z (click to reset)' : 'Sort rows (sections) A→Z'}
        style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 8px', borderRadius: 4, border: `1px solid ${sortRowsAZ ? '#685DBC' : '#EEECF8'}`, background: sortRowsAZ ? '#EDE9FF' : 'transparent', color: sortRowsAZ ? '#685DBC' : '#A8A4C0', fontSize: 10, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
        ↕ Rows
      </button>
      <button onClick={() => setSortColsAZ(p => !p)} title={sortColsAZ ? 'Columns sorted A→Z (click to reset)' : 'Sort columns (subjects) A→Z'}
        style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 8px', borderRadius: 4, border: `1px solid ${sortColsAZ ? '#685DBC' : '#EEECF8'}`, background: sortColsAZ ? '#EDE9FF' : 'transparent', color: sortColsAZ ? '#685DBC' : '#A8A4C0', fontSize: 10, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
        ↔ Cols
      </button>

      {/* Mode toggle: Periods | Hours — flat underline tabs */}
      <div style={{ display: 'flex', gap: 0, borderBottom: '1.5px solid #EEECF8' }}>
        {(['periods', 'hours'] as const).map(m => (
          <button key={m} onClick={() => setDisplayMode(m)} style={{
            padding: '2px 10px 3px', border: 'none', cursor: 'pointer',
            background: 'transparent',
            color: displayMode === m ? '#685DBC' : '#A8A4C0',
            borderBottom: displayMode === m ? '1.5px solid #685DBC' : '1.5px solid transparent',
            marginBottom: -1.5,
            fontSize: 10.5, fontWeight: 700, fontFamily: 'inherit',
            transition: 'color 0.12s',
          }}>{m === 'periods' ? 'Periods' : 'Hours'}</button>
        ))}
      </div>

      {/* 1p=Xm hint */}
      <span style={{ fontSize: 9.5, color: '#C4C0D8', whiteSpace: 'nowrap' as const, fontFamily: "'DM Mono', monospace" }}>
        1p={periodMinutes}m
      </span>

      {/* HI Suggest — invisible intelligence */}
      <button onClick={handleAIPeriodSuggest} style={{
        display: 'inline-flex', alignItems: 'center', gap: 3,
        padding: '2px 7px', borderRadius: 4,
        border: '1px solid #EAE8FF', background: 'transparent',
        color: '#A99FF5', fontSize: 10, fontWeight: 600,
        cursor: 'pointer', fontFamily: 'inherit',
      }}
        title="Re-derive every section from the curriculum norms. Cells you typed yourself are kept.">
        <Sparkles size={9} /> Suggest
      </button>

      {/* Say what was preserved. A merge that looks identical to a replace is
          no more trustworthy than the replace was. */}
      {keptEdits > 0 && (
        <span style={{
          display: 'inline-flex', alignItems: 'center', gap: 3,
          padding: '2px 7px', borderRadius: 4, background: '#F0FDF4',
          border: '1px solid #BBF7D0', color: '#067647', fontSize: 10, fontWeight: 700,
        }}>
          <CheckCircle2 size={9} /> kept {keptEdits} of your edit{keptEdits > 1 ? 's' : ''}
        </span>
      )}

      {/* Reports & Export group */}
      <div style={{ display: 'inline-flex', borderRadius: 5, overflow: 'hidden', border: '1px solid #EEECF2', gap: 0 }}>
        <button onClick={() => setShowReport('periods')} style={{
          display: 'inline-flex', alignItems: 'center', gap: 3,
          padding: '2px 7px', border: 'none', borderRight: '1px solid #EEECF2',
          background: 'transparent', color: '#A8A4C0',
          fontSize: 10, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
        }} title="View class-wise and subject-wise reports">
          <FileText size={9} /> Report
        </button>
        <button onClick={() => exportPeriodAllocation('xlsx')} style={{
          display: 'inline-flex', alignItems: 'center', gap: 3,
          padding: '2px 7px', border: 'none', borderRight: '1px solid #EEECF2',
          background: 'transparent', color: '#0A8136',
          fontSize: 10, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
        }} title="Export to Excel (.xlsx)">
          <FileSpreadsheet size={9} /> Excel
        </button>
        <button onClick={() => exportPeriodAllocation('csv')} style={{
          display: 'inline-flex', alignItems: 'center', gap: 3,
          padding: '2px 7px', border: 'none',
          background: 'transparent', color: '#0369A1',
          fontSize: 10, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
        }} title="Export to CSV">
          <FileText size={9} /> CSV
        </button>
      </div>
    </>
  )

  return (
    <div style={{ padding: '12px 20px 20px', maxWidth: 1400, margin: '0 auto' }}>

      {/* ── Two-panel body ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 276px', gap: 16, alignItems: 'start' }}>

        {/* ── Left: main content ── */}
        <div style={{ minWidth: 0 }}>

          {/* ── Sub-tabs + Sync button — right edge aligns exactly with the table ── */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: 0, marginBottom: 10,
            borderBottom: '1px solid #EEECF8',
          }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: '#13111E', padding: '0 14px 0 0', marginRight: 4, borderRight: '1px solid #EEECF8' }}>
              Allocation
            </span>
            <SubTab active={sub === 'periods'}    onClick={() => setSub('periods')}    icon={<Grid3x3 size={11} />}      label="Period allocation" />
            <SubTab active={sub === 'teachers'}   onClick={() => setSub('teachers')}   icon={<Users size={11} />}         label="Teacher allocation" />
            <SubTab active={sub === 'validation'} onClick={() => setSub('validation')} icon={<ShieldCheck size={11} />}   label="Validation" />
            <div style={{ marginLeft: 'auto', paddingBottom: 4, display: 'flex', alignItems: 'center', gap: 8 }}>
              <button
                onClick={handleSyncFromResources}
                disabled={syncing}
                title="Re-derive period slots + teacher assignments from Resources data"
                style={{
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 5,
                  padding: '5px 13px', borderRadius: 6,
                  border: syncDone ? '1px solid #BBF7D0' : syncing ? '1px solid #DDD8FF' : '1px solid #BBF7D0',
                  background: syncDone ? '#DCFCE7' : syncing ? '#F5F3FF' : '#F0FDF4',
                  color: syncDone ? '#15803D' : syncing ? '#685DBC' : '#15803D',
                  fontSize: 11.5, fontWeight: 700,
                  cursor: syncing ? 'default' : 'pointer',
                  fontFamily: 'inherit', whiteSpace: 'nowrap' as const,
                  minWidth: 175, transition: 'background 0.15s, color 0.15s',
                }}
              >
                {syncing ? (
                  <><span style={{ display: 'inline-block', animation: 'spin 0.8s linear infinite', fontSize: 13 }}>⟳</span> Syncing…</>
                ) : syncDone ? (
                  <><CheckCircle2 size={11} /> Synced!</>
                ) : (
                  <><Sparkles size={11} /> Sync from Resources</>
                )}
              </button>
            </div>
          </div>

          {/* ── Persistent conflict banner — real-time alert on all tabs ── */}
          {hardConflicts.length > 0 && (
            <div style={{
              display: 'flex', alignItems: 'flex-start', gap: 8, marginBottom: 10,
              padding: '8px 12px', borderRadius: 7,
              background: '#FEF2F2', border: '1px solid #FECACA',
            }}>
              <XCircle size={14} color="#DC2626" style={{ flexShrink: 0, marginTop: 1 }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <span style={{ fontSize: 11.5, fontWeight: 700, color: '#DC2626' }}>
                  {hardConflicts.length} hard conflict{hardConflicts.length > 1 ? 's' : ''}
                </span>
                <span style={{ fontSize: 11, color: '#B91C1C', marginLeft: 6 }}>
                  {hardConflicts.slice(0, 2).join(' · ')}{hardConflicts.length > 2 ? ` +${hardConflicts.length - 2} more` : ''}
                </span>
              </div>
              <button
                onClick={handleSyncFromResources}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 4, flexShrink: 0,
                  padding: '3px 10px', borderRadius: 5, border: '1px solid #FCA5A5',
                  background: '#DC2626', color: '#fff', fontSize: 10.5, fontWeight: 700,
                  cursor: 'pointer', fontFamily: 'inherit',
                }}
                onMouseEnter={e => { e.currentTarget.style.background = '#B91C1C' }}
                onMouseLeave={e => { e.currentTarget.style.background = '#DC2626' }}
              >
                <Sparkles size={9} /> Auto-fix
              </button>
            </div>
          )}

          {/* Action bar — only shown for teacher + validation tabs */}
          {sub !== 'periods' && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10, flexWrap: 'wrap' as const,
          }}>
            {sub === 'teachers' && (
              <>
                <AISuggestButton onClick={() => handleAITeacherAllocate()} label="HI allocate all" />
                <button
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: 5,
                    padding: '7px 13px', borderRadius: 8,
                    border: `1px solid ${hardConflicts.length > 0 ? '#FECACA' : '#E8E4FF'}`,
                    background: hardConflicts.length > 0 ? '#FEF2F2' : '#fff',
                    color: hardConflicts.length > 0 ? '#DC2626' : '#4B5275',
                    fontSize: 11, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
                  }}>
                  <AlertTriangle size={11} />
                  Conflicts only
                  {hardConflicts.length > 0 && (
                    <span style={{
                      background: '#DC2626', color: '#fff', borderRadius: 10,
                      padding: '1px 5px', fontSize: 9, fontWeight: 800, marginLeft: 2,
                    }}>{hardConflicts.length}</span>
                  )}
                </button>
              </>
            )}
            {sub === 'validation' && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{
                  display: 'inline-flex', alignItems: 'center', gap: 5,
                  fontSize: 11, fontWeight: 700,
                  color: hardConflicts.length > 0 ? '#DC2626' : '#0A8136',
                }}>
                  {hardConflicts.length > 0
                    ? <><XCircle size={14} /> {hardConflicts.length} hard conflict{hardConflicts.length !== 1 ? 's' : ''}</>
                    : <><CheckCircle2 size={14} /> No hard conflicts</>
                  }
                </span>
                {softWarnings.length > 0 && (
                  <span style={{
                    display: 'inline-flex', alignItems: 'center', gap: 5,
                    fontSize: 11, fontWeight: 700, color: '#D97706',
                  }}>
                    <AlertTriangle size={13} /> {softWarnings.length} warning{softWarnings.length !== 1 ? 's' : ''}
                  </span>
                )}
              </div>
            )}
          </div>
          )}

          {/* Tab content */}
          {sub === 'periods'    && (
            <Suspense fallback={<div style={{ padding: '48px 24px', textAlign: 'center', fontSize: 13, color: '#6D6A8A' }}>Loading the allocation grid…</div>}>
              <AllocationGridAG displayMode={displayMode} periodMinutes={periodMinutes} toolbarExtra={periodsToolbarExtra} sortRowsAZ={sortRowsAZ} sortColsAZ={sortColsAZ} />
            </Suspense>
          )}
          {sub === 'teachers'   && <TeacherAllocationSummary displayMode={displayMode} periodMinutes={periodMinutes}
            toolbarExtra={
              <div style={{ display: 'inline-flex', borderRadius: 7, overflow: 'hidden', border: '1px solid #D8D2FF' }}>
                <button onClick={() => setShowReport('teachers')} style={{
                  display: 'inline-flex', alignItems: 'center', gap: 5,
                  padding: '5px 11px', border: 'none', borderRight: '1px solid #D8D2FF',
                  background: '#F8F7FF', color: '#5B4EC0',
                  fontSize: 11, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
                }}>
                  <FileText size={11} /> Report
                </button>
                <button onClick={() => exportTeacherAllocation('xlsx')} style={{
                  display: 'inline-flex', alignItems: 'center', gap: 5,
                  padding: '5px 11px', border: 'none', borderRight: '1px solid #D8D2FF',
                  background: '#F8F7FF', color: '#0A8136',
                  fontSize: 11, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
                }} title="Export to Excel">
                  <FileSpreadsheet size={11} /> Excel
                </button>
                <button onClick={() => exportTeacherAllocation('csv')} style={{
                  display: 'inline-flex', alignItems: 'center', gap: 5,
                  padding: '5px 11px', border: 'none',
                  background: '#F8F7FF', color: '#0369A1',
                  fontSize: 11, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
                }} title="Export to CSV">
                  <FileText size={11} /> CSV
                </button>
              </div>
            }
          />}
          {sub === 'validation' && (
            <ValidationView
              hardConflicts={hardConflicts}
              softWarnings={softWarnings}
              teacherStats={teacherStats}
              hasAllocations={hasAllocations}
            />
          )}
        </div>

        {/* ── Right: sidebar ── */}
        <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 12 }}>
          {sub === 'periods' && (
            <>
              <WorkloadNormPanel
                country={country}
                periodMinutes={periodMinutes}
                studentCustom={studentMaxHoursWeek}
                teacherCustom={teacherMaxHoursWeek}
                sections={sections as Section[]}
                onEdit={() => setWorkloadOpen(true)}
              />
              <PeriodSyntaxGuide periodMinutes={periodMinutes} />
              <CapacityEnginePanel bandStats={bandStats} sections={sections as Section[]} />
              <AINotesPanel sections={sections as Section[]} sectionTotals={sectionTotals} capFor={capFor} />
            </>
          )}
          {sub === 'teachers' && (
            <>
              <AIAllocationNotesPanel
                teacherStats={teacherStats}
                staff={staff as Staff[]}
                teacherAllocations={teacherAllocations}
              />
              <ActiveConstraintsPanel />
              <AllocationSummaryPanel teacherStats={teacherStats} hardConflicts={hardConflicts} softWarnings={softWarnings} />
            </>
          )}
          {sub === 'validation' && (
            <>
              <ValidationSidebarPanel
                hardConflicts={hardConflicts}
                softWarnings={softWarnings}
                teacherStats={teacherStats}
              />
              <AllocationSummaryPanel teacherStats={teacherStats} hardConflicts={hardConflicts} softWarnings={softWarnings} />
            </>
          )}
        </div>
      </div>

      {/* ── Report modal ── */}
      {showReport && (
        <AllocationReportModal
          mode={showReport}
          displayMode={displayMode}
          periodMinutes={periodMinutes}
          onClose={() => setShowReport(null)}
        />
      )}

      {/* Custom workload, set on this page rather than in Settings. Saving
          re-seeds derivedAllocation, so the period counts on the left update
          without leaving the screen. */}
      {workloadOpen && (
        <WorkloadNormModal
          country={country}
          periodMinutes={periodMinutes}
          workDays={workDays.length}
          sections={sections as Section[]}
          subjects={(subjects as Subject[]).map(s => ({ name: s.name }))}
          board={(config as any)?.boardType ?? (config as any)?.board}
          onClose={() => setWorkloadOpen(false)}
        />
      )}

      {/* ── Navigation footer ── */}
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        marginTop: 20, paddingTop: 14, borderTop: '1px solid #F0EDFF',
      }}>
        <button onClick={() => setStep(3)} style={btnSecondary}>
          <ChevronLeft size={14} /> Groups & Combos
        </button>
        <span style={{ fontSize: 10, color: '#B8B4D4', textAlign: 'center' as const, lineHeight: 1.5 }}>
          Step 4 of 5 · Period allocation → Teacher allocation → Validation
          {hardConflicts.length > 0 && (
            <span style={{ display: 'block', color: '#DC2626', fontWeight: 700, marginTop: 2 }}>
              Fix {hardConflicts.length} conflict{hardConflicts.length !== 1 ? 's' : ''} before proceeding
            </span>
          )}
        </span>
        <button onClick={() => setStep(5)} disabled={hardConflicts.length > 0} style={btnPrimary(hardConflicts.length === 0)}>
          Save & Continue <ChevronRight size={14} />
        </button>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────
// Sub-tab button
// ─────────────────────────────────────────────────────────────────

function SubTab({ active, onClick, icon, label }: {
  active: boolean; onClick: () => void; icon: React.ReactNode; label: string
}) {
  return (
    <button onClick={onClick} style={{
      padding: '6px 14px', border: 'none', cursor: 'pointer', background: 'transparent',
      color: active ? '#685DBC' : '#69707E', fontFamily: 'inherit',
      fontSize: 11.5, fontWeight: active ? 700 : 500,
      borderBottom: active ? '2px solid #685DBC' : '2px solid transparent',
      display: 'inline-flex', alignItems: 'center', gap: 5,
      marginBottom: -1, transition: 'all 0.1s',
    }}>
      <span style={{ color: active ? '#685DBC' : '#A0A0B8' }}>{icon}</span>
      {label}
    </button>
  )
}

// ─────────────────────────────────────────────────────────────────
// Action buttons
// ─────────────────────────────────────────────────────────────────

function AISuggestButton({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <button onClick={onClick} style={{
      display: 'inline-flex', alignItems: 'center', gap: 5,
      padding: '4px 11px', borderRadius: 6, border: '1px solid #D8D2FF',
      background: '#F5F2FF', color: '#6D5FC4', fontSize: 11, fontWeight: 700,
      cursor: 'pointer', fontFamily: 'inherit',
    }}>
      <Sparkles size={10} /> {label}
    </button>
  )
}

// ─────────────────────────────────────────────────────────────────
// Sidebar: Period Syntax Guide
// ─────────────────────────────────────────────────────────────────

function PeriodSyntaxGuide({ periodMinutes }: { periodMinutes: number }) {
  const items = [
    { syntax: '5', desc: '5 theory periods' },
    { syntax: '5+1', desc: 'Theory + 1 lab period' },
    { syntax: '3(2X)', desc: '3 double periods' },
    { syntax: '2L', desc: 'Lab only periods' },
    { syntax: '—', desc: 'Not applicable' },
  ]
  return (
    <SideCard title="Period Syntax Guide" icon={<BookOpen size={13} />}>
      <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 6 }}>
        {items.map(it => (
          <div key={it.syntax} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{
              minWidth: 52, padding: '3px 8px', borderRadius: 6, textAlign: 'center' as const,
              fontFamily: "'DM Mono', monospace", fontSize: 11, fontWeight: 800,
              background: '#F0EDFF', color: '#685DBC', border: '1px solid #E0DBFF',
            }}>{it.syntax}</span>
            <span style={{ fontSize: 10.5, color: '#4B5275' }}>{it.desc}</span>
          </div>
        ))}
      </div>
      <div style={{
        marginTop: 10, padding: '6px 10px', borderRadius: 6,
        background: '#F8F7FF', border: '1px solid #ECEAFB',
        fontSize: 9.5, color: '#6D6A8A',
      }}>
        1 period = {periodMinutes} min
      </div>
    </SideCard>
  )
}

// ─────────────────────────────────────────────────────────────────
// Sidebar: Workload norms — Blueprint v6, Step 5
//
// "The globally-set workload/hours-per-week (from Step 0 — either the
//  country-wise auto-populated default, or the admin's custom override) is shown
//  for both faculty and students."
//
// It is also the SEED for the allocation above, so showing it here is not
// decoration: it explains where the derived period counts came from.
// ─────────────────────────────────────────────────────────────────

function WorkloadNormPanel({
  country, periodMinutes, studentCustom, teacherCustom, sections, onEdit,
}: {
  country: string
  periodMinutes: number
  studentCustom: Partial<Record<string, number>>
  teacherCustom?: number
  sections: Section[]
  onEdit: () => void
}) {
  // Only the bands this school actually has — a primary school shouldn't be
  // shown senior-secondary norms it will never use.
  const bands = useMemo(() => {
    const seen = new Set<string>()
    for (const s of sections) seen.add(bandForSection(s.name))
    return [...seen]
  }, [sections])
  if (bands.length === 0) return null

  const teacher = teacherHoursWeekFor(country, 'lowerPrimary' as any)
  const label = teacher?.country?.name ?? country

  return (
    <div style={{ background: '#fff', border: '1px solid #E8E4FF', borderRadius: 12, padding: 13 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 8 }}>
        <ShieldCheck size={14} color="#685DBC" />
        <span style={{ fontSize: 12.5, fontWeight: 800, color: '#13111E' }}>Workload norm</span>
      </div>
      <div style={{ fontSize: 10.5, color: '#9896B5', marginBottom: 9 }}>
        {label} · seeds the period counts on the left
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {bands.map(band => {
          const custom = studentCustom?.[band]
          const norm = studentHoursWeekFor(country, band as any)
          const hours = custom && custom > 0 ? custom : norm?.hours
          if (hours == null) return null
          const periods = periodsForHours(hours, periodMinutes)
          return (
            <div key={band} style={{ display: 'flex', alignItems: 'baseline', gap: 6, fontSize: 11.5 }}>
              <span style={{ flex: 1, color: '#4B5275' }}>{BAND_LABELS[band as GradeBand] ?? band}</span>
              <strong style={{ fontFamily: "'DM Mono', monospace", color: '#13111E' }}>{hours} h</strong>
              <span style={{ color: '#9896B5' }}>≈ {periods}p</span>
              {custom && custom > 0 && (
                <span style={{ fontSize: 9.5, fontWeight: 700, color: '#4B41C4', background: '#EFEBFF', borderRadius: 4, padding: '1px 5px' }}>custom</span>
              )}
            </div>
          )
        })}
      </div>

      <div style={{ marginTop: 9, paddingTop: 9, borderTop: '1px solid #F1EFFA', fontSize: 11.5, display: 'flex', alignItems: 'baseline', gap: 6 }}>
        <span style={{ flex: 1, color: '#4B5275' }}>Faculty</span>
        {teacherCustom && teacherCustom > 0 ? (
          <>
            <strong style={{ fontFamily: "'DM Mono', monospace", color: '#13111E' }}>{teacherCustom} h</strong>
            <span style={{ fontSize: 9.5, fontWeight: 700, color: '#4B41C4', background: '#EFEBFF', borderRadius: 4, padding: '1px 5px' }}>custom</span>
          </>
        ) : teacher?.usable ? (
          <strong style={{ fontFamily: "'DM Mono', monospace", color: '#13111E' }}>{teacher.hours} h</strong>
        ) : (
          <span style={{ fontSize: 10.5, color: '#B45309' }}>
            {teacher ? 'includes prep — set a custom cap' : 'not in the reference set'}
          </span>
        )}
      </div>
      {/* Edited here, not in Settings. This figure seeds the allocation on this
          same screen, so sending someone away to change it — and back again to
          see what it did — was the wrong shape for the task. */}
      <button
        onClick={onEdit}
        style={{
          display: 'inline-block', marginTop: 9, padding: '5px 11px', borderRadius: 7,
          border: '1px solid #E4E0FF', background: '#F8F7FF',
          fontSize: 10.5, fontWeight: 700, color: '#685DBC',
          cursor: 'pointer', fontFamily: 'inherit',
        }}>
        Set custom loads
      </button>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────
// Sidebar: Capacity Engine (per-band bars)
// ─────────────────────────────────────────────────────────────────

function CapacityEnginePanel({
  bandStats, sections,
}: {
  bandStats: Record<string, { used: number; cap: number; count: number }>
  sections: Section[]
}) {
  const activeBands = BANDS.filter(b => (bandStats[b.key]?.count ?? 0) > 0)
  if (activeBands.length === 0) return null

  return (
    <SideCard title="Capacity engine" icon={<BarChart3 size={13} />}>
      <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 8 }}>
        {activeBands.map(band => {
          const { used, cap, count } = bandStats[band.key] ?? { used: 0, cap: 0, count: 0 }
          const avgUsed = count > 0 ? Math.round(used / count) : 0
          const avgCap  = count > 0 ? Math.round(cap  / count) : 0
          const pct = avgCap > 0 ? Math.min(100, Math.round((avgUsed / avgCap) * 100)) : 0
          const status = utilisationStatus(avgUsed, avgCap)
          const barColor = status === 'over' ? '#DC2626'
            : status === 'tight' ? '#D97706'
            : status === 'ok'    ? '#0A8136'
            : status === 'light' ? '#2563EB'
            : '#C4BAF5'

          return (
            <div key={band.key}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3, alignItems: 'baseline' }}>
                <span style={{ fontSize: 10.5, color: '#4B5275', fontWeight: 600 }}>{band.label}</span>
                <span style={{
                  fontSize: 10, fontFamily: "'DM Mono', monospace", fontWeight: 700,
                  color: status === 'over' ? '#DC2626' : '#13111E',
                }}>
                  {avgUsed}/{avgCap}
                </span>
              </div>
              <div style={{ height: 5, background: '#F0EDFF', borderRadius: 3, overflow: 'hidden' }}>
                <div style={{
                  height: '100%', width: `${pct}%`, background: barColor,
                  borderRadius: 3, transition: 'width 0.25s',
                }} />
              </div>
            </div>
          )
        })}
      </div>
      <div style={{
        marginTop: 10, fontSize: 9.5, color: '#6D6A8A',
        borderTop: '1px solid #F0EDFF', paddingTop: 8,
      }}>
        Avg periods/wk · Max shown in periods
      </div>
    </SideCard>
  )
}

// ─────────────────────────────────────────────────────────────────
// Sidebar: AI Notes (Period tab)
// ─────────────────────────────────────────────────────────────────

function AINotesPanel({
  sections, sectionTotals, capFor,
}: {
  sections: Section[]
  sectionTotals: Record<string, number>
  capFor: (secName: string) => number
}) {
  const notes = useMemo(() => {
    const out: Array<{ kind: 'ok' | 'warn' | 'info'; text: string }> = []
    const over = sections.filter(s => (sectionTotals[s.name] ?? 0) > capFor(s.name))
    const under = sections.filter(s => {
      const c = capFor(s.name)
      const u = sectionTotals[s.name] ?? 0
      return c > 0 && u > 0 && u < c * 0.7
    })
    const empty = sections.filter(s => (sectionTotals[s.name] ?? 0) === 0)

    if (over.length > 0)
      out.push({ kind: 'warn', text: `${over.map(s => s.name).join(', ')} over board minimum. the engine can auto-fill elective and enrichment slots.` })
    if (under.length > 0 && under.length <= 3)
      out.push({ kind: 'warn', text: `${under.map(s => s.name).join(', ')} under capacity. Add elective or lab periods.` })
    if (empty.length > 0 && empty.length <= 5)
      out.push({ kind: 'info', text: `${empty.length} section${empty.length > 1 ? 's' : ''} not yet allocated. Use "HI suggest all" to fill defaults.` })
    if (out.length === 0 && sections.length > 0)
      out.push({ kind: 'ok', text: 'All sections within board capacity range.' })

    return out
  }, [sections, sectionTotals, capFor])

  if (sections.length === 0) return null

  return (
    <SideCard title="HI notes" icon={<Sparkles size={13} color="#685DBC" />}>
      <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 7 }}>
        {notes.map((n, i) => (
          <NoteItem key={i} kind={n.kind} text={n.text} />
        ))}
      </div>
    </SideCard>
  )
}

// ─────────────────────────────────────────────────────────────────
// Sidebar: AI Allocation Notes (Teacher tab)
// ─────────────────────────────────────────────────────────────────

function AIAllocationNotesPanel({
  staff, teacherAllocations,
}: {
  teacherStats: { total: number; fullyAllocated: number; overloaded: number; light: number; unassigned: number }
  staff: Staff[]
  teacherAllocations: Record<string, any>
}) {
  const notes = useMemo(() => {
    const out: Array<{ kind: 'ok' | 'warn' | 'info'; text: string }> = []

    // Overloaded teachers
    const overloaded = staff.filter(t => {
      const max = teacherWeeklyCap(t as any)
      let load = 0
      const tMap = teacherAllocations[t.name] ?? {}
      Object.values(tMap).forEach((sMap: any) =>
        Object.values(sMap ?? {}).forEach((p: any) => { if (typeof p === 'number') load += p })
      )
      return load > max * 1.05
    })
    overloaded.forEach(t => {
      const max = teacherWeeklyCap(t as any)
      let load = 0
      const tMap = teacherAllocations[t.name] ?? {}
      Object.values(tMap).forEach((sMap: any) =>
        Object.values(sMap ?? {}).forEach((p: any) => { if (typeof p === 'number') load += p })
      )
      const over = load - max
      out.push({ kind: 'warn', text: `${t.name} is ${over} period${over !== 1 ? 's' : ''} (${Math.round(over * ((t as any).minutesPerPeriod ?? 40) / 60 * 10) / 10} hrs) over max. Suggest splitting with an available colleague.` })
    })

    // Light teachers
    const light = staff.filter(t => {
      const max = teacherWeeklyCap(t as any)
      let load = 0
      const tMap = teacherAllocations[t.name] ?? {}
      Object.values(tMap).forEach((sMap: any) =>
        Object.values(sMap ?? {}).forEach((p: any) => { if (typeof p === 'number') load += p })
      )
      return load > 0 && load < max * 0.4
    })
    if (light.length > 0 && light.length <= 3)
      out.push({ kind: 'info', text: `${light.map(t => t.name).join(' & ')} are light — available for extras or substitution pool.` })

    // Unassigned
    const unassigned = staff.filter(t => {
      let load = 0
      const tMap = teacherAllocations[t.name] ?? {}
      Object.values(tMap).forEach((sMap: any) =>
        Object.values(sMap ?? {}).forEach((p: any) => { if (typeof p === 'number') load += p })
      )
      return load === 0
    })
    if (unassigned.length > 0)
      out.push({ kind: 'warn', text: `${unassigned.length} teacher${unassigned.length > 1 ? 's' : ''} unassigned — pending subject mapping.` })

    if (out.length === 0 && staff.length > 0)
      out.push({ kind: 'ok', text: 'All teachers balanced. No allocation conflicts detected.' })

    return out
  }, [staff, teacherAllocations])

  return (
    <SideCard title="HI allocation notes" icon={<Sparkles size={13} color="#685DBC" />}>
      <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 7 }}>
        {notes.map((n, i) => <NoteItem key={i} kind={n.kind} text={n.text} />)}
      </div>
    </SideCard>
  )
}

// ─────────────────────────────────────────────────────────────────
// Sidebar: Active Constraints
// ─────────────────────────────────────────────────────────────────

function ActiveConstraintsPanel() {
  const constraints = [
    'Max load enforced per type — specialist 35p, class teacher 35p, activity 30p / 20h',
    'Vertical continuity — same teacher follows class across years',
    'HRT first — class teacher assigned to own class before others',
    'No double booking — teacher can\'t appear in two classes at the same period',
  ]
  return (
    <SideCard title="Active constraints" icon={<ShieldCheck size={13} color="#0A8136" />}>
      <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 6 }}>
        {constraints.map((c, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 6 }}>
            <CheckCircle2 size={11} color="#0A8136" style={{ flexShrink: 0, marginTop: 1 }} />
            <span style={{ fontSize: 10.5, color: '#4B5275', lineHeight: 1.45 }}>{c}</span>
          </div>
        ))}
      </div>
    </SideCard>
  )
}

// ─────────────────────────────────────────────────────────────────
// Sidebar: Allocation Summary
// ─────────────────────────────────────────────────────────────────

function AllocationSummaryPanel({
  teacherStats,
  hardConflicts,
  softWarnings,
}: {
  teacherStats: { total: number; fullyAllocated: number; overloaded: number; light: number; unassigned: number }
  hardConflicts: string[]
  softWarnings: string[]
}) {
  return (
    <SideCard title="Allocation summary" icon={<BarChart3 size={13} />}>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <tbody>
          <SumRow label="Total teachers"    value={teacherStats.total}         />
          <SumRow label="Fully allocated"   value={teacherStats.fullyAllocated} color="#0A8136" />
          <SumRow label="Overloaded"         value={teacherStats.overloaded}     color={teacherStats.overloaded > 0 ? '#DC2626' : undefined} />
          <SumRow label="Light load"         value={teacherStats.light}          color={teacherStats.light > 0 ? '#D97706' : undefined} />
          <SumRow label="Unassigned"         value={teacherStats.unassigned}     color={teacherStats.unassigned > 0 ? '#B8B4D4' : undefined} />
        </tbody>
      </table>
      {/* SumRow renders a <tr>, so it needs a table around it — these two used
          to sit in a bare <div>, which is invalid DOM and what React was
          warning about on every render of this panel. */}
      <div style={{ marginTop: 8, borderTop: '1px solid #F0EDFF', paddingTop: 8 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <tbody>
            <SumRow label="Hard conflicts"  value={hardConflicts.length}  color={hardConflicts.length > 0 ? '#DC2626' : '#0A8136'} />
            <SumRow label="Soft warnings"   value={softWarnings.length}   color={softWarnings.length > 0 ? '#D97706' : '#0A8136'} />
          </tbody>
        </table>
      </div>
    </SideCard>
  )
}

function SumRow({ label, value, color }: { label: string; value: number; color?: string }) {
  return (
    <tr>
      <td style={{ padding: '3px 0', fontSize: 10.5, color: '#4B5275' }}>{label}</td>
      <td style={{ padding: '3px 0', fontSize: 11, fontWeight: 700, color: color ?? '#13111E', textAlign: 'right' as const, fontFamily: "'DM Mono', monospace" }}>
        {value}
      </td>
    </tr>
  )
}

// ─────────────────────────────────────────────────────────────────
// Sidebar: Validation Panel
// ─────────────────────────────────────────────────────────────────

function ValidationSidebarPanel({
  hardConflicts, softWarnings, teacherStats,
}: {
  hardConflicts: string[]
  softWarnings: string[]
  teacherStats: { total: number; fullyAllocated: number; overloaded: number; light: number; unassigned: number }
}) {
  return (
    <SideCard
      title={hardConflicts.length > 0 ? 'Issues found' : 'Validation passed'}
      icon={hardConflicts.length > 0
        ? <XCircle size={13} color="#DC2626" />
        : <CheckCircle2 size={13} color="#0A8136" />
      }
    >
      {hardConflicts.length === 0 && softWarnings.length === 0 ? (
        <p style={{ fontSize: 11, color: '#0A8136', margin: 0 }}>
          All allocation rules satisfied. Ready to proceed to Student Groups.
        </p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 6 }}>
          {hardConflicts.length > 0 && (
            <div style={{ fontSize: 10, fontWeight: 800, color: '#DC2626', letterSpacing: '0.06em', textTransform: 'uppercase' as const, marginBottom: 2 }}>
              Hard conflicts
            </div>
          )}
          {hardConflicts.map((c, i) => (
            <NoteItem key={`h${i}`} kind="warn" text={c} />
          ))}
          {softWarnings.length > 0 && (
            <div style={{ fontSize: 10, fontWeight: 800, color: '#D97706', letterSpacing: '0.06em', textTransform: 'uppercase' as const, marginTop: 4, marginBottom: 2 }}>
              Soft warnings
            </div>
          )}
          {softWarnings.map((w, i) => (
            <NoteItem key={`s${i}`} kind="info" text={w} />
          ))}
        </div>
      )}
    </SideCard>
  )
}

// ─────────────────────────────────────────────────────────────────
// Validation main view
// ─────────────────────────────────────────────────────────────────

function ValidationView({
  hardConflicts, softWarnings, teacherStats, hasAllocations,
}: {
  hardConflicts: string[]
  softWarnings: string[]
  teacherStats: { total: number; fullyAllocated: number; overloaded: number; light: number; unassigned: number }
  hasAllocations: boolean
}) {
  if (!hasAllocations && teacherStats.total === 0) {
    return (
      <div style={{
        padding: 32, textAlign: 'center' as const,
        background: '#F8F7FF', borderRadius: 12, border: '1px dashed #D8D2FF',
        color: '#6D6A8A', fontSize: 13,
      }}>
        Complete Period Allocation and Teacher Allocation first, then run validation.
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 12 }}>

      {/* Summary cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
        <StatCard
          label="Hard conflicts"
          value={hardConflicts.length}
          color={hardConflicts.length > 0 ? '#DC2626' : '#0A8136'}
          bg={hardConflicts.length > 0 ? '#FEF2F2' : '#DCFCE7'}
          icon={hardConflicts.length > 0 ? <XCircle size={16} /> : <CheckCircle2 size={16} />}
        />
        <StatCard
          label="Soft warnings"
          value={softWarnings.length}
          color={softWarnings.length > 0 ? '#D97706' : '#0A8136'}
          bg={softWarnings.length > 0 ? '#FFFBEB' : '#DCFCE7'}
          icon={softWarnings.length > 0 ? <AlertTriangle size={16} /> : <CheckCircle2 size={16} />}
        />
        <StatCard
          label="Teachers balanced"
          value={teacherStats.fullyAllocated}
          color="#0A8136"
          bg="#DCFCE7"
          icon={<Users size={16} />}
          suffix={`/ ${teacherStats.total}`}
        />
      </div>

      {/* Hard conflicts list */}
      {hardConflicts.length > 0 && (
        <IssueList
          title="Hard Conflicts"
          items={hardConflicts}
          color="#DC2626"
          bg="#FEF2F2"
          border="#FECACA"
          icon={<XCircle size={13} color="#DC2626" />}
        />
      )}

      {/* Soft warnings list */}
      {softWarnings.length > 0 && (
        <IssueList
          title="Soft Warnings"
          items={softWarnings}
          color="#D97706"
          bg="#FFFBEB"
          border="#FDE68A"
          icon={<AlertTriangle size={13} color="#D97706" />}
        />
      )}

      {hardConflicts.length === 0 && softWarnings.length === 0 && (
        <div style={{
          padding: 24, textAlign: 'center' as const,
          background: '#DCFCE7', borderRadius: 12,
          border: '1px solid #BBF7D0', color: '#15803D', fontSize: 13, fontWeight: 600,
        }}>
          <CheckCircle2 size={20} style={{ marginBottom: 8, display: 'block', margin: '0 auto 8px' }} />
          All checks passed. Ready to proceed to Student Groups.
        </div>
      )}
    </div>
  )
}

function StatCard({
  label, value, color, bg, icon, suffix,
}: {
  label: string; value: number; color: string; bg: string; icon: React.ReactNode; suffix?: string
}) {
  return (
    <div style={{
      padding: '12px 14px', borderRadius: 10, background: bg,
      display: 'flex', alignItems: 'center', gap: 10,
    }}>
      <span style={{ color }}>{icon}</span>
      <div>
        <div style={{ fontSize: 18, fontWeight: 900, color, fontFamily: "'DM Mono', monospace" }}>
          {value}{suffix && <span style={{ fontSize: 11, fontWeight: 600, marginLeft: 4 }}>{suffix}</span>}
        </div>
        <div style={{ fontSize: 10, color: '#4B5275', marginTop: 1 }}>{label}</div>
      </div>
    </div>
  )
}

function IssueList({
  title, items, color, bg, border, icon,
}: {
  title: string; items: string[]; color: string; bg: string; border: string; icon: React.ReactNode
}) {
  return (
    <div style={{
      background: bg, border: `1px solid ${border}`,
      borderLeft: `4px solid ${color}`, borderRadius: 8,
      overflow: 'hidden',
    }}>
      <div style={{
        padding: '8px 14px', fontSize: 10, fontWeight: 800,
        letterSpacing: '0.1em', textTransform: 'uppercase' as const,
        color, background: `${bg}cc`,
        borderBottom: `1px solid ${border}`,
      }}>
        {title}
      </div>
      <div style={{ padding: '8px 14px', display: 'flex', flexDirection: 'column' as const, gap: 6 }}>
        {items.map((item, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 7 }}>
            <span style={{ flexShrink: 0, marginTop: 1 }}>{icon}</span>
            <span style={{ fontSize: 11, color: '#4B5275', lineHeight: 1.5 }}>{item}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────
// Shared: SideCard container
// ─────────────────────────────────────────────────────────────────

function SideCard({ title, icon, children }: {
  title: string; icon?: React.ReactNode; children: React.ReactNode
}) {
  return (
    <div style={{
      background: '#fff', border: '1px solid #ECEAFB', borderRadius: 12,
      padding: '12px 14px',
      boxShadow: '0 1px 4px rgba(124,111,224,0.06)',
    }}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 6,
        fontSize: 10, fontWeight: 800, letterSpacing: '0.12em',
        textTransform: 'uppercase' as const, color: '#4B5275',
        marginBottom: 10,
      }}>
        {icon && <span style={{ color: '#685DBC' }}>{icon}</span>}
        {title}
      </div>
      {children}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────
// Shared: NoteItem (ok / warn / info)
// ─────────────────────────────────────────────────────────────────

function NoteItem({ kind, text }: { kind: 'ok' | 'warn' | 'info'; text: string }) {
  const cfg = {
    ok:   { icon: <CheckCircle2 size={11} color="#0A8136" />, color: '#166534' },
    warn: { icon: <AlertTriangle size={11} color="#D97706" />, color: '#78350F' },
    info: { icon: <Info size={11} color="#2563EB" />,         color: '#1E3A5F' },
  }[kind]
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 6 }}>
      <span style={{ flexShrink: 0, marginTop: 1 }}>{cfg.icon}</span>
      <span style={{ fontSize: 10.5, color: cfg.color, lineHeight: 1.5 }}>{text}</span>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────
// Button styles
// ─────────────────────────────────────────────────────────────────

const btnSecondary: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 6,
  padding: '9px 16px', borderRadius: 8, border: '1px solid #E8E4FF',
  background: '#fff', color: '#4B5275', fontSize: 12, fontWeight: 600,
  cursor: 'pointer', fontFamily: 'inherit',
}

function btnPrimary(enabled: boolean): React.CSSProperties {
  return {
    display: 'inline-flex', alignItems: 'center', gap: 7,
    padding: '9px 20px', borderRadius: 8, border: 'none',
    background: enabled ? 'linear-gradient(135deg, #685DBC, #9B8EF5)' : '#E8E4FF',
    color: enabled ? '#fff' : '#B8B4D4',
    fontSize: 12, fontWeight: 700, cursor: enabled ? 'pointer' : 'not-allowed',
    fontFamily: 'inherit',
    boxShadow: enabled ? '0 2px 8px rgba(124,111,224,0.35)' : 'none',
  }
}
