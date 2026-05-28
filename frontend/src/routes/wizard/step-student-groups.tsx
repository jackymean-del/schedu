/**
 * Step 4 — Student Groups
 *
 * Student Preference Matrix — editable class × optional-subject count grid.
 *
 * NA detection priority (most-specific wins):
 *   1. Subject.classConfigs[].sectionName + Subject.sections[] (explicit constraint in Resources)
 *   2. subjectAllocations[section][subject] — if a subject has allocations in some sections
 *      but not this one → mark NA (covers the common case where subjects are only set up
 *      in the Allocation step without explicit classConfigs).
 *   3. No constraints anywhere → applicable everywhere.
 *
 * Re-seeding runs whenever subject assignments OR column set changes.
 * Stored "0" cells are also converted to NA when their subject becomes non-applicable.
 *
 * Row status — shown as soon as ≥ 1 applicable cell is filled:
 *   ✓ green  — all applicable filled & sum = totalStudents
 *   orange   — partial fill (N▸) or all filled but sum < total (−N)
 *   red      — sum > total (+N)
 *
 * Sort: columns and rows can be toggled A→Z independently.
 */

import {
  useMemo, useEffect, useState, useRef, useCallback,
} from 'react'
import { useTimetableStore } from '@/store/timetableStore'
import type { SectionStrength } from '@/types'
import { parseAllocation } from '@/lib/allocationSyntax'
import {
  Sparkles, Users2, ChevronRight, ChevronLeft, RefreshCw,
  BookOpen, Users, GraduationCap, Plus, Trash2, Pencil,
  CheckCircle2, XCircle, AlertCircle, Info, Zap, ArrowUpAZ,
} from 'lucide-react'

// ── types ─────────────────────────────────────────────────────

type GroupingBehavior = 'NO_GROUPING' | 'SAME_GRADE_ONLY' | 'CROSS_GRADE_ALLOWED' | 'FLEXIBLE_GROUPING'
type RowStatus = 'match' | 'under' | 'over' | 'partial' | 'empty'

interface RowStatusInfo {
  status: RowStatus
  sum: number
  filled: number
  applicable: number
}

const BEHAVIOR_META: Record<GroupingBehavior, {
  label: string; short: string; bg: string; fg: string; border: string; desc: string
}> = {
  NO_GROUPING:         { label: 'No grouping',     short: 'No group',    bg: '#F8F7FF', fg: '#8B87AD', border: '#E8E4FF', desc: 'Each class schedules independently' },
  SAME_GRADE_ONLY:     { label: 'Same grade only', short: 'Same grade',  bg: '#EFF6FF', fg: '#1D4ED8', border: '#DBEAFE', desc: 'Groups sections within the same grade' },
  CROSS_GRADE_ALLOWED: { label: 'Cross grade',      short: 'Cross grade', bg: '#EDE9FF', fg: '#7C3AED', border: '#C4B5FD', desc: 'Can mix students from different grades' },
  FLEXIBLE_GROUPING:   { label: 'Flexible',         short: 'Flexible',    bg: '#DCFCE7', fg: '#15803D', border: '#BBF7D0', desc: 'AI decides best grouping strategy' },
}
const BEHAVIORS: GroupingBehavior[] = ['NO_GROUPING', 'SAME_GRADE_ONLY', 'CROSS_GRADE_ALLOWED', 'FLEXIBLE_GROUPING']
const GROUP_COLORS = ['#7C6FE0', '#10B981', '#F59E0B', '#EF4444', '#3B82F6', '#EC4899', '#8B5CF6', '#06B6D4']
function groupColor(i: number) { return GROUP_COLORS[i % GROUP_COLORS.length] }

// ── helpers ──────────────────────────────────────────────────────────────────

function guessStream(secName: string): string {
  const u = secName.toUpperCase()
  if (u.includes('SCIENCE') || u.includes('SCI') || u.includes('PCM') || u.includes('PCB')) return 'Science'
  if (u.includes('COMMERCE') || u.includes('COM')) return 'Commerce'
  if (u.includes('HUM') || u.includes('ARTS')) return 'Humanities'
  return 'General'
}

function generateGroupId(subject: string, idx: number): string {
  const prefix = subject.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 4)
  return `${prefix}_G${idx + 1}`
}

/**
 * Whether a subject is applicable to a given section.
 *
 * Priority:
 *  1. classConfigs[].sectionName + sections[] (explicit whitelist in Resources)
 *  2. subjectAllocations — if subject has >0 periods in at least one section,
 *     only those sections are applicable (covers Allocation-step config).
 *  3. No data → true (applicable everywhere).
 */
function isApplicableToSection(
  sub: any,
  sectionName: string,
  subjectAllocations: Record<string, any>,
): boolean {
  if (!sub) return true

  // ── 1. Explicit classConfigs / sections constraints ──────────────────────
  const configs: any[] = sub.classConfigs ?? []
  const legacySecs: string[] = sub.sections ?? []
  const assignedFromConfigs = configs.map((c: any) => c.sectionName).filter(Boolean) as string[]
  const allExplicit = [...new Set([...assignedFromConfigs, ...legacySecs])]
  if (allExplicit.length > 0) return allExplicit.includes(sectionName)

  // ── 2. subjectAllocations fallback ───────────────────────────────────────
  const subjectName = sub.name as string
  const allocatedSections = Object.keys(subjectAllocations).filter(sec => {
    const raw = subjectAllocations[sec]?.[subjectName]
    return raw && parseAllocation(raw).weeklyTotal > 0
  })
  if (allocatedSections.length > 0) return allocatedSections.includes(sectionName)

  // ── 3. No constraints → applicable everywhere ───────────────────────────
  return true
}

/**
 * Row validation — shown once ≥ 1 applicable cell is filled.
 */
function getRowStatus(
  row: SectionStrength,
  totalStudents: number,
  cols: { key: string }[],
): RowStatusInfo {
  if (totalStudents <= 0 || cols.length === 0) return { status: 'empty', sum: 0, filled: 0, applicable: 0 }
  const applicableCols = cols.filter(c => (row.subjectStrengths?.[c.key] ?? 0) !== -1)
  if (applicableCols.length === 0) return { status: 'empty', sum: 0, filled: 0, applicable: 0 }
  const filledCols = applicableCols.filter(c => (row.subjectStrengths?.[c.key] ?? 0) > 0)
  if (filledCols.length === 0) return { status: 'empty', sum: 0, filled: 0, applicable: applicableCols.length }

  const sum = applicableCols.reduce((a, c) => a + (row.subjectStrengths?.[c.key] ?? 0), 0)
  const allFilled = filledCols.length === applicableCols.length

  if (sum > totalStudents) return { status: 'over',    sum, filled: filledCols.length, applicable: applicableCols.length }
  if (!allFilled)           return { status: 'partial', sum, filled: filledCols.length, applicable: applicableCols.length }
  if (sum === totalStudents) return { status: 'match',  sum, filled: filledCols.length, applicable: applicableCols.length }
  return                            { status: 'under',  sum, filled: filledCols.length, applicable: applicableCols.length }
}

// ── Editable column header ────────────────────────────────────────────────────

function EditableColHeader({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => { if (!editing) setDraft(value) }, [value, editing])
  useEffect(() => { if (editing) inputRef.current?.select() }, [editing])

  if (editing) {
    return (
      <input
        ref={inputRef}
        value={draft}
        onChange={e => setDraft(e.target.value)}
        onBlur={() => { onChange(draft.trim() || value); setEditing(false) }}
        onKeyDown={e => {
          if (e.key === 'Enter') { onChange(draft.trim() || value); setEditing(false) }
          if (e.key === 'Escape') { setDraft(value); setEditing(false) }
          e.stopPropagation()
        }}
        onClick={e => e.stopPropagation()}
        style={{
          width: 78, fontSize: 9, fontWeight: 800,
          background: '#fff', border: '1.5px solid #7C6FE0', borderRadius: 4,
          padding: '2px 5px', outline: 'none', fontFamily: 'inherit',
          textAlign: 'center', textTransform: 'uppercase' as const, letterSpacing: '0.04em',
        }}
      />
    )
  }
  return (
    <span onClick={() => setEditing(true)} title="Click to rename"
      style={{ cursor: 'text', display: 'inline-flex', alignItems: 'center', gap: 3 }}>
      {value}
      <Pencil size={7} style={{ opacity: 0.35, flexShrink: 0 }} />
    </span>
  )
}

// ── NA cell ───────────────────────────────────────────────────────────────────

/**
 * NA = subject not offered to this class-section.
 * Read-only from Student Groups — to enable editing, go to Resources → Subject →
 * "Assign class" to add this section to the subject's applicable classes.
 */
function NACell() {
  return (
    <span
      title="Not applicable to this class. To enable, go to Resources → Subject → assign this class to the subject."
      style={{
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        width: 46, height: 26, borderRadius: 5,
        border: '1px dashed #E5E7EB', background: '#F9FAFB',
        color: '#D1D5DB', fontSize: 10, fontWeight: 700,
        cursor: 'default', userSelect: 'none',
      }}
    >NA</span>
  )
}

// ── Row status badge ──────────────────────────────────────────────────────────

function RowStatusBadge({ info, total }: { info: RowStatusInfo; total: number }) {
  const { status, sum, filled, applicable } = info
  if (status === 'empty') return null
  if (status === 'match') {
    return (
      <span title={`✓ All ${applicable} filled · Sum (${sum}) = Total (${total})`}
        style={{ display: 'inline-flex', alignItems: 'center', gap: 3, color: '#15803D', fontSize: 10, fontWeight: 700 }}>
        <CheckCircle2 size={13} />
      </span>
    )
  }
  if (status === 'partial') {
    const remaining = applicable - filled
    return (
      <span title={`${filled}/${applicable} fields filled · Fill ${remaining} more · Current sum: ${sum}`}
        style={{ display: 'inline-flex', alignItems: 'center', gap: 2, color: '#D97706', fontSize: 10, fontWeight: 700 }}>
        <AlertCircle size={13} /><span style={{ fontSize: 9 }}>{remaining}▸</span>
      </span>
    )
  }
  if (status === 'under') {
    return (
      <span title={`Sum (${sum}) < Total (${total}) — ${total - sum} students unaccounted`}
        style={{ display: 'inline-flex', alignItems: 'center', gap: 2, color: '#D97706', fontSize: 10, fontWeight: 700 }}>
        <AlertCircle size={13} /><span style={{ fontSize: 9 }}>−{total - sum}</span>
      </span>
    )
  }
  return (
    <span title={`Sum (${sum}) > Total (${total}) — over by ${sum - total}`}
      style={{ display: 'inline-flex', alignItems: 'center', gap: 2, color: '#DC2626', fontSize: 10, fontWeight: 700 }}>
      <XCircle size={13} /><span style={{ fontSize: 9 }}>+{sum - total}</span>
    </span>
  )
}

// ── component ─────────────────────────────────────────────────────────────────

export function StepStudentGroups() {
  const store = useTimetableStore() as any
  const {
    sections, subjects, sectionStrengths, setSectionStrengths,
    subjectGroupingRules, setSubjectGroupingRule,
    dynamicLearningGroups, setDynamicLearningGroups,
    setStep,
  } = store

  const subjectAllocations: Record<string, any> = useMemo(() => (store as any).subjectAllocations ?? {}, [store])
  const storeRooms: any[] = useMemo(() => (store as any).rooms ?? [], [store])

  const [regenerating, setRegenerating]   = useState(false)
  const [minGroupSize, setMinGroupSize]   = useState(5)
  const [sortCols,     setSortCols]       = useState(false)
  const [sortRows,     setSortRows]       = useState(false)

  // ── Column / row customization ─────────────────────────────────────────────
  const [customCols, setCustomCols]  = useState<{ key: string; label: string }[]>([])
  const [hiddenCols, setHiddenCols]  = useState<Set<string>>(new Set())
  const [colLabels,  setColLabels]   = useState<Record<string, string>>({})
  const [customRows, setCustomRows]  = useState<string[]>([])
  const [hiddenRows, setHiddenRows]  = useState<Set<string>>(new Set())

  // ── Subject picker ─────────────────────────────────────────────────────────
  const [showColPicker, setShowColPicker] = useState(false)
  const [pickerSearch, setPickerSearch]  = useState('')
  const pickerRef = useRef<HTMLDivElement>(null)
  const addBtnRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!showColPicker) return
    const handler = (e: MouseEvent) => {
      if (!pickerRef.current?.contains(e.target as Node) && !addBtnRef.current?.contains(e.target as Node))
        setShowColPicker(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [showColPicker])

  // ── Optional subjects ─────────────────────────────────────────────────────
  const optionalSubjects = useMemo(() =>
    (subjects as any[]).filter(s => s.isOptional === true || (s.category ?? '').toLowerCase().includes('optional'))
  , [subjects])

  const subjectList = useMemo(() => optionalSubjects.map(s => s.name as string), [optionalSubjects])

  // ── Relevant sections ──────────────────────────────────────────────────────
  const optionalSections = useMemo(() => {
    const sectionSet = new Set<string>()
    for (const sub of optionalSubjects) {
      const fromConfigs = (sub.classConfigs ?? []).map((c: any) => c.sectionName).filter(Boolean) as string[]
      const assigned = fromConfigs.length > 0 ? fromConfigs : (sub.sections ?? [])
      for (const cls of assigned) sectionSet.add(cls)
    }
    // Fallback: check subjectAllocations
    if (sectionSet.size === 0) {
      for (const sub of optionalSubjects) {
        Object.keys(subjectAllocations).forEach(secName => {
          const raw = subjectAllocations[secName]?.[sub.name]
          if (raw && parseAllocation(raw).weeklyTotal > 0) sectionSet.add(secName)
        })
      }
    }
    if (sectionSet.size > 0) return (sections as any[]).filter(s => sectionSet.has(s.name))
    return sections as any[]
  }, [sections, optionalSubjects, subjectAllocations])

  // ── Effective columns & rows ───────────────────────────────────────────────
  const allCols = useMemo(() => [
    ...subjectList.filter(s => !hiddenCols.has(s)).map(s => ({ key: s, label: colLabels[s] ?? s })),
    ...customCols,
  ], [subjectList, hiddenCols, colLabels, customCols])

  const allRowNames = useMemo(() => [
    ...optionalSections.filter((s: any) => !hiddenRows.has(s.name)).map((s: any) => s.name as string),
    ...customRows,
  ], [optionalSections, hiddenRows, customRows])

  // ── Sorted display versions (only for rendering, not logic) ───────────────
  const displayCols = useMemo(() =>
    sortCols ? [...allCols].sort((a, b) => a.label.localeCompare(b.label)) : allCols
  , [allCols, sortCols])

  // ── Materialized rows ──────────────────────────────────────────────────────
  const rows: SectionStrength[] = useMemo(() =>
    allRowNames.map(name =>
      (sectionStrengths as SectionStrength[]).find(r => r.sectionName === name) ?? {
        sectionName: name, stream: guessStream(name), subjectStrengths: {},
      }
    )
  , [allRowNames, sectionStrengths])

  const displayRows = useMemo(() =>
    sortRows ? [...rows].sort((a, b) => a.sectionName.localeCompare(b.sectionName)) : rows
  , [rows, sortRows])

  // ── Signatures for re-seed trigger ────────────────────────────────────────
  const colKeysSignature = useMemo(() => allCols.map(c => c.key).join(','), [allCols])

  /** Changes when subject→section assignments change (via Resources or Allocation) */
  const subjectSignature = useMemo(() => {
    const subjectPart = optionalSubjects.map((s: any) => {
      const fromConfigs = (s.classConfigs ?? []).map((c: any) => c.sectionName).filter(Boolean) as string[]
      const explicit = [...new Set([...fromConfigs, ...(s.sections ?? [])])].sort().join(',')
      return `${s.name}:${explicit}`
    }).join('|')
    const allocPart = Object.entries(subjectAllocations)
      .map(([sec, subs]) => `${sec}:${Object.keys(subs as object).join(',')}`)
      .join('|')
    return `${subjectPart}||${allocPart}`
  }, [optionalSubjects, subjectAllocations])

  /**
   * Seed NA for non-applicable pairs.
   * Runs when columns change OR when subject/allocation assignments change.
   * Also converts stored 0 → -1 if a cell became non-applicable after initial seeding.
   */
  useEffect(() => {
    if (allRowNames.length === 0 || allCols.length === 0) return
    const current = sectionStrengths as SectionStrength[]

    if (current.length === 0) {
      // Full initialisation
      const init: SectionStrength[] = allRowNames.map(name => {
        const sub_strengths: Record<string, number> = {}
        allCols.forEach(col => {
          const sub = (subjects as any[]).find(s => s.name === col.key)
          sub_strengths[col.key] = isApplicableToSection(sub, name, subjectAllocations) ? 0 : -1
        })
        const sec = (sections as any[]).find(s => s.name === name)
        const total = store.sectionCapacityOverrides?.[name] ?? sec?.strength ?? 0
        return { sectionName: name, stream: guessStream(name), subjectStrengths: sub_strengths, totalStudents: total || undefined }
      })
      setSectionStrengths(init)
      return
    }

    // Incremental re-seed:
    //  • Fill undefined entries (new columns)
    //  • Convert stored 0 → -1 for cells that became non-applicable
    let globalChanged = false
    const updated = current.map(row => {
      const newStrengths = { ...row.subjectStrengths }
      let rowChanged = false
      allCols.forEach(col => {
        const sub = (subjects as any[]).find(s => s.name === col.key)
        const applicable = isApplicableToSection(sub, row.sectionName, subjectAllocations)
        const val = newStrengths[col.key]
        if (val === undefined) {
          newStrengths[col.key] = applicable ? 0 : -1; rowChanged = true
        } else if (!applicable && val === 0) {
          // Unfilled cell became non-applicable → mark NA
          newStrengths[col.key] = -1; rowChanged = true
        } else if (applicable && val === -1) {
          // Was NA, but subject now applies to this section → make editable
          newStrengths[col.key] = 0; rowChanged = true
        }
      })
      if (rowChanged) { globalChanged = true; return { ...row, subjectStrengths: newStrengths } }
      return row
    })
    if (globalChanged) setSectionStrengths(updated)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allRowNames.length, colKeysSignature, subjectSignature])

  // ── Total students ─────────────────────────────────────────────────────────
  const getSectionTotal = useCallback((sectionName: string): number => {
    const ssRow = (sectionStrengths as SectionStrength[]).find(r => r.sectionName === sectionName)
    if ((ssRow?.totalStudents ?? 0) > 0) return ssRow!.totalStudents!
    const override = store.sectionCapacityOverrides?.[sectionName]
    if (override != null && override > 0) return override
    const sec = (sections as any[]).find(s => s.name === sectionName)
    return sec?.strength ?? 0
  }, [sectionStrengths, store, sections])

  const updateTotalStudents = useCallback((sectionName: string, total: number) => {
    const current = sectionStrengths as SectionStrength[]
    const idx = current.findIndex(r => r.sectionName === sectionName)
    const val = Math.max(0, total)
    if (idx >= 0) {
      const upd = [...current]; upd[idx] = { ...upd[idx], totalStudents: val }; setSectionStrengths(upd)
    } else {
      setSectionStrengths([...current, { sectionName, stream: guessStream(sectionName), subjectStrengths: {}, totalStudents: val }])
    }
  }, [sectionStrengths, setSectionStrengths])

  // ── Cell update ───────────────────────────────────────────────────────────
  const updateCell = useCallback((sectionName: string, colKey: string, value: number) => {
    const current = sectionStrengths as SectionStrength[]
    const idx = current.findIndex(r => r.sectionName === sectionName)
    const clamped = value < 0 ? -1 : Math.max(0, value)
    if (idx >= 0) {
      const upd = [...current]
      upd[idx] = { ...upd[idx], subjectStrengths: { ...upd[idx].subjectStrengths, [colKey]: clamped } }
      setSectionStrengths(upd)
    } else {
      setSectionStrengths([...current, { sectionName, stream: guessStream(sectionName), subjectStrengths: { [colKey]: clamped } }])
    }
  }, [sectionStrengths, setSectionStrengths])

  // ── Column actions ────────────────────────────────────────────────────────
  const addSubjectCol = useCallback((subjectName: string) => {
    if (allCols.some(c => c.key === subjectName)) return
    if (subjectList.includes(subjectName) && hiddenCols.has(subjectName)) {
      setHiddenCols(prev => { const next = new Set(prev); next.delete(subjectName); return next })
    } else {
      setCustomCols(prev => [...prev, { key: subjectName, label: subjectName }])
    }
    const sub = (subjects as any[]).find(s => s.name === subjectName)
    const current = sectionStrengths as SectionStrength[]
    const updated = allRowNames.map(name => {
      const existing = current.find(r => r.sectionName === name) ?? { sectionName: name, stream: guessStream(name), subjectStrengths: {} }
      if (existing.subjectStrengths[subjectName] !== undefined) return existing
      return { ...existing, subjectStrengths: { ...existing.subjectStrengths, [subjectName]: isApplicableToSection(sub, name, subjectAllocations) ? 0 : -1 } }
    })
    setSectionStrengths(updated)
    setShowColPicker(false); setPickerSearch('')
  }, [allCols, subjectList, hiddenCols, subjects, sectionStrengths, allRowNames, subjectAllocations, setSectionStrengths])

  const addCustomCol = useCallback((label: string) => {
    if (!label.trim()) return
    const key = `__custom_${Date.now()}`
    setCustomCols(prev => [...prev, { key, label: label.trim() }])
    setColLabels(prev => ({ ...prev, [key]: label.trim() }))
    setShowColPicker(false); setPickerSearch('')
  }, [])

  const removeCol = useCallback((key: string) => {
    if (subjectList.includes(key)) setHiddenCols(prev => new Set([...prev, key]))
    else setCustomCols(prev => prev.filter(c => c.key !== key))
  }, [subjectList])

  const renameCol = useCallback((key: string, newLabel: string) => {
    setColLabels(prev => ({ ...prev, [key]: newLabel }))
    setCustomCols(prev => prev.map(c => c.key === key ? { ...c, label: newLabel } : c))
  }, [])

  // ── Row actions ───────────────────────────────────────────────────────────
  const addRow = useCallback(() => {
    const newName = `New Class ${allRowNames.length + 1}`
    setCustomRows(prev => [...prev, newName])
    const sub_strengths: Record<string, number> = Object.fromEntries(allCols.map(c => [c.key, 0]))
    setSectionStrengths([...(sectionStrengths as SectionStrength[]), { sectionName: newName, stream: '', subjectStrengths: sub_strengths }])
  }, [allRowNames.length, allCols, sectionStrengths, setSectionStrengths])

  const removeRow = useCallback((name: string) => {
    if (optionalSections.some((s: any) => s.name === name)) setHiddenRows(prev => new Set([...prev, name]))
    else {
      setCustomRows(prev => prev.filter(r => r !== name))
      setSectionStrengths((sectionStrengths as SectionStrength[]).filter(r => r.sectionName !== name))
    }
  }, [optionalSections, sectionStrengths, setSectionStrengths])

  // ── Keyboard navigation ───────────────────────────────────────────────────
  const tableWrapRef = useRef<HTMLDivElement>(null)
  const handleCellKey = useCallback((e: React.KeyboardEvent<HTMLInputElement>, ri: number, ci: number) => {
    if (e.key === 'Escape') { e.currentTarget.blur(); return }
    let nextR = ri, nextC = ci
    if      (e.key === 'ArrowDown'  || (e.key === 'Enter' && !e.shiftKey)) { nextR = ri + 1; e.preventDefault() }
    else if (e.key === 'ArrowUp'   || (e.key === 'Enter' && e.shiftKey))  { nextR = ri - 1; e.preventDefault() }
    else if (e.key === 'ArrowRight') { nextC = ci + 1; e.preventDefault() }
    else if (e.key === 'ArrowLeft')  { nextC = ci - 1; e.preventDefault() }
    else return
    tableWrapRef.current?.querySelector<HTMLInputElement>(`input[data-row="${nextR}"][data-col="${nextC}"]`)?.focus()
  }, [])

  // ── AI Regenerate ─────────────────────────────────────────────────────────
  //
  // Grade extraction: "XI-Com-A" → "XI", "XII-Arts" → "XII", "IX-B" → "IX"
  // (first hyphen-separated segment of the section name)
  const extractGrade = (sectionName: string) => sectionName.split('-')[0].trim()

  const handleRegenerate = async () => {
    setRegenerating(true)
    await new Promise(r => setTimeout(r, 900))
    const generated: typeof dynamicLearningGroups = []
    const optionalDay = 'Monday', optionalPeriod = 'P6'
    const ts = Date.now()

    allCols.forEach((col, si) => {
      const behavior = (subjectGroupingRules[col.key] ?? 'SAME_GRADE_ONLY') as GroupingBehavior
      if (behavior === 'NO_GROUPING') return

      const participating = rows.filter(r => (r.subjectStrengths?.[col.key] ?? 0) > 0)
      if (participating.length === 0) return

      // Helper: build one group from a slice of sections
      const pushGroup = (groupSections: SectionStrength[], groupIdx: number) => {
        const totalStr = groupSections.reduce((a, r) => a + (r.subjectStrengths?.[col.key] ?? 0), 0)
        if (totalStr < minGroupSize) return
        const sorted = [...storeRooms].sort((a: any, b: any) => (a.capacity ?? 0) - (b.capacity ?? 0))
        const room = sorted.find((rm: any) => (rm.capacity ?? 0) >= totalStr)
          ?? (storeRooms.length > 0 ? storeRooms[(si + groupIdx) % storeRooms.length] : null)
        generated.push({
          id: `${generateGroupId(col.label, groupIdx)}_${ts + si * 100 + groupIdx}`,
          subject: col.label,
          sectionNames: groupSections.map(r => r.sectionName),
          totalStrength: totalStr,
          teacher: '',
          room: room?.name ?? `Room ${101 + si + groupIdx}`,
          roomCapacity: room?.capacity ?? 0,
          capacityWarning: (room?.capacity ?? 0) > 0 && totalStr > (room?.capacity ?? 0),
          behavior, day: optionalDay, periodId: optionalPeriod,
        })
      }

      if (behavior === 'SAME_GRADE_ONLY') {
        // Split by grade (first hyphen-segment: "XI-Com-A" → "XI")
        // Preserves insertion order so groups come out in grade-order
        const byGrade = new Map<string, SectionStrength[]>()
        participating.forEach(r => {
          const grade = extractGrade(r.sectionName)
          if (!byGrade.has(grade)) byGrade.set(grade, [])
          byGrade.get(grade)!.push(r)
        })
        let gIdx = 0
        byGrade.forEach(gradeSections => { pushGroup(gradeSections, gIdx++) })
      } else {
        // CROSS_GRADE_ALLOWED / FLEXIBLE_GROUPING — all sections in one group
        pushGroup(participating, 0)
      }
    })

    setDynamicLearningGroups(generated)
    setRegenerating(false)
  }

  // ── Subject picker list ───────────────────────────────────────────────────
  const alreadyInCols = useMemo(() => new Set(allCols.map(c => c.key)), [allCols])
  const subjectsToAdd = useMemo(() => {
    const q = pickerSearch.toLowerCase()
    return (subjects as any[])
      .filter(s => !alreadyInCols.has(s.name) && (!q || s.name.toLowerCase().includes(q) || (s.category ?? '').toLowerCase().includes(q)))
      .sort((a, b) => {
        const ao = (a.category ?? '').includes('Optional') ? 0 : 1
        const bo = (b.category ?? '').includes('Optional') ? 0 : 1
        return ao - bo || a.name.localeCompare(b.name)
      })
  }, [subjects, alreadyInCols, pickerSearch])

  // ── Live group preview ────────────────────────────────────────────────────
  // Mirrors handleRegenerate exactly: SAME_GRADE_ONLY expands one subject column
  // into one preview row per grade; other modes collapse all sections into one row.
  const previewGroups = useMemo(() => {
    const result: PreviewGroup[] = []
    const roomSorted = [...storeRooms].sort((a: any, b: any) => (a.capacity ?? 0) - (b.capacity ?? 0))
    const biggestRoom = storeRooms.reduce(
      (best: any, rm: any) => (rm.capacity ?? 0) > (best?.capacity ?? 0) ? rm : best, null as any,
    )

    // colKey  = the actual subject key for subjectStrengths lookups
    // groupKey = React key (may have "::grade" suffix for same-grade rows)
    const addGroup = (colKey: string, groupKey: string, label: string, sections: SectionStrength[]) => {
      if (sections.length === 0) return
      const total = sections.reduce((a, r) => a + (r.subjectStrengths?.[colKey] ?? 0), 0)
      const suitableRoom = roomSorted.find((rm: any) => (rm.capacity ?? 0) >= total)
      result.push({
        key: groupKey, colKey, label, sections, total, suitableRoom,
        noRoom: storeRooms.length > 0 && !suitableRoom && total > 0,
        biggestRoom, belowThreshold: total > 0 && total < minGroupSize,
      })
    }

    allCols.forEach(col => {
      const behavior = (subjectGroupingRules[col.key] ?? 'SAME_GRADE_ONLY') as GroupingBehavior
      const participating = rows.filter(r => (r.subjectStrengths?.[col.key] ?? 0) > 0)
      if (participating.length === 0) return

      if (behavior === 'SAME_GRADE_ONLY') {
        const byGrade = new Map<string, SectionStrength[]>()
        participating.forEach(r => {
          const grade = r.sectionName.split('-')[0].trim()
          if (!byGrade.has(grade)) byGrade.set(grade, [])
          byGrade.get(grade)!.push(r)
        })
        byGrade.forEach((gradeSections, grade) =>
          addGroup(col.key, `${col.key}::${grade}`, `${col.label} — Class ${grade}`, gradeSections),
        )
      } else {
        addGroup(col.key, col.key, col.label, participating)
      }
    })

    return result
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allCols, rows, storeRooms, minGroupSize, subjectGroupingRules])

  const colW = Math.max(70, Math.min(100, Math.floor((1100 - 140 - 100 - 36 - 80) / Math.max(1, allCols.length))))
  const showMatrix = allCols.length > 0 || allRowNames.length > 0

  return (
    <div style={{ padding: '20px 24px 40px', maxWidth: 1280, margin: '0 auto' }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
        <div style={{ width: 40, height: 40, borderRadius: 10, background: '#EDE9FF', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Users2 size={20} color="#7C6FE0" />
        </div>
        <div style={{ flex: 1 }}>
          <h2 style={{ fontFamily: "'DM Serif Display', serif", fontSize: 22, color: '#13111E', margin: 0, lineHeight: 1.1 }}>Student Groups</h2>
          <div style={{ fontSize: 12, color: '#4B5275', marginTop: 3 }}>
            <em style={{ color: '#7C6FE0' }}>AI</em> groups students who chose the same optional subject across classes, scheduling all groups in the same parallel period.
          </div>
        </div>
      </div>

      {/* ══ PANEL 1: Student Preference Matrix ══ */}
      <Section
        title="Student Preference Matrix"
        icon={<GraduationCap size={15} color="#7C6FE0" />}
        hint="Enter how many students in each class opted for each subject. NA = subject not offered to that class."
      >
        {!showMatrix && subjects.length === 0 ? (
          <EmptyState msg="Add subjects in Resources, mark them as Optional (4th/5th/6th Optional category) to appear here." />
        ) : !showMatrix ? (
          <EmptyState msg='Mark at least one subject as Optional (category = "4th Optional", "5th Optional", etc.) in the Subjects panel.' />
        ) : (
          <>
            {/* Sort controls */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <SortToggle active={sortCols} onToggle={() => setSortCols(p => !p)} label="Cols A→Z" />
              <SortToggle active={sortRows} onToggle={() => setSortRows(p => !p)} label="Rows A→Z" />
            </div>

            <div ref={tableWrapRef} style={{ overflowX: 'auto', position: 'relative' }}>
              <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 400 }}>
                <thead>
                  <tr>
                    <th style={thStyle(140, true)}>Class / Section</th>
                    <th style={thStyle(90)}><span title="Auto-filled from section data. Click to edit.">Total Students</span></th>
                    <th style={thStyle(36)} title="Validation status" />

                    {displayCols.map(col => (
                      <th key={col.key} style={{ ...thStyle(colW), position: 'relative' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 3 }}>
                          <EditableColHeader value={col.label} onChange={lbl => renameCol(col.key, lbl)} />
                          <button onClick={() => removeCol(col.key)} title={`Remove "${col.label}"`}
                            style={{ display: 'inline-flex', width: 13, height: 13, borderRadius: 3, border: 'none', background: 'transparent', color: '#C4B5FD', cursor: 'pointer', padding: 0, fontSize: 11, fontWeight: 800, alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}
                            onMouseEnter={e => { e.currentTarget.style.background = '#FEE2E2'; e.currentTarget.style.color = '#DC2626' }}
                            onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#C4B5FD' }}
                          >×</button>
                        </div>
                      </th>
                    ))}

                    {/* Add column button + picker */}
                    <th style={{ ...thStyle(42), textAlign: 'center', padding: '4px', position: 'relative' }}>
                      <button ref={addBtnRef} onClick={() => { setShowColPicker(p => !p); setPickerSearch('') }} title="Add subject column"
                        style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 2, width: 32, height: 24, borderRadius: 6, border: `1.5px ${showColPicker ? 'solid #7C6FE0' : 'dashed #C4B5FD'}`, background: showColPicker ? '#EDE9FF' : '#F5F2FF', color: '#7C6FE0', cursor: 'pointer', padding: 0 }}>
                        <Plus size={11} />
                      </button>
                      {showColPicker && (
                        <div ref={pickerRef} onClick={e => e.stopPropagation()}
                          style={{ position: 'fixed', zIndex: 200, top: (addBtnRef.current?.getBoundingClientRect().bottom ?? 0) + 4, left: Math.max(8, (addBtnRef.current?.getBoundingClientRect().right ?? 0) - 260), width: 260, background: '#fff', border: '1.5px solid #DDD8FF', borderRadius: 10, boxShadow: '0 8px 24px rgba(124,111,224,0.18)', overflow: 'hidden' }}>
                          <div style={{ padding: '8px 10px', borderBottom: '1px solid #F0EDFF' }}>
                            <input autoFocus placeholder="Search subjects…" value={pickerSearch} onChange={e => setPickerSearch(e.target.value)}
                              onKeyDown={e => { if (e.key === 'Escape') setShowColPicker(false); if (e.key === 'Enter' && subjectsToAdd.length === 0 && pickerSearch.trim()) addCustomCol(pickerSearch) }}
                              style={{ width: '100%', padding: '5px 8px', borderRadius: 6, border: '1px solid #E8E4FF', fontSize: 11, outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box' }} />
                          </div>
                          <div style={{ maxHeight: 220, overflowY: 'auto' }}>
                            {subjectsToAdd.length === 0 ? (
                              <div style={{ padding: '10px 12px', fontSize: 11, color: '#8B87AD', textAlign: 'center' }}>
                                {pickerSearch.trim() ? <span>No match. <button onClick={() => addCustomCol(pickerSearch)} style={{ color: '#7C6FE0', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 700, fontSize: 11, fontFamily: 'inherit' }}>Add "{pickerSearch}" as custom</button></span> : 'All subjects already added'}
                              </div>
                            ) : subjectsToAdd.map((s: any) => (
                              <button key={s.name} onClick={() => addSubjectCol(s.name)}
                                style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', padding: '7px 12px', border: 'none', background: 'transparent', cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left' }}
                                onMouseEnter={e => { e.currentTarget.style.background = '#F5F2FF' }}
                                onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}>
                                <span style={{ fontSize: 12, fontWeight: 600, color: '#13111E' }}>{s.name}</span>
                                {s.category && <span style={{ fontSize: 9, fontWeight: 700, padding: '1px 6px', borderRadius: 8, background: s.category.includes('Optional') ? '#EDE9FF' : '#F0F0F0', color: s.category.includes('Optional') ? '#7C3AED' : '#8B87AD' }}>{s.category}</span>}
                              </button>
                            ))}
                          </div>
                          {pickerSearch.trim() && subjectsToAdd.length > 0 && (
                            <div style={{ padding: '6px 10px', borderTop: '1px solid #F0EDFF' }}>
                              <button onClick={() => addCustomCol(pickerSearch)}
                                style={{ width: '100%', padding: '5px 8px', borderRadius: 6, border: '1px dashed #C4B5FD', background: '#F5F2FF', color: '#7C6FE0', fontSize: 11, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
                                <Plus size={10} style={{ display: 'inline', marginRight: 4, verticalAlign: 'middle' }} />Add "{pickerSearch}" as custom
                              </button>
                            </div>
                          )}
                        </div>
                      )}
                    </th>
                  </tr>
                </thead>

                <tbody>
                  {displayRows.map((row, ri) => {
                    const totalStudents = getSectionTotal(row.sectionName)
                    const statusInfo = getRowStatus(row, totalStudents, displayCols)

                    return (
                      <tr key={row.sectionName} style={{ background: ri % 2 === 0 ? '#fff' : '#FAFAFE' }}>
                        <td style={tdSticky()}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                            <span style={{ flex: 1 }}>{row.sectionName}</span>
                            <button onClick={() => removeRow(row.sectionName)} title="Remove row"
                              style={{ display: 'inline-flex', width: 15, height: 15, borderRadius: 3, border: 'none', background: 'transparent', color: '#D1D5DB', cursor: 'pointer', padding: 0, flexShrink: 0, alignItems: 'center', justifyContent: 'center' }}
                              onMouseEnter={e => { e.currentTarget.style.background = '#FEE2E2'; e.currentTarget.style.color = '#DC2626' }}
                              onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#D1D5DB' }}>
                              <Trash2 size={9} />
                            </button>
                          </div>
                        </td>

                        <td style={tdCenter()}>
                          <TotalStudentsCell value={totalStudents} onChange={v => updateTotalStudents(row.sectionName, v)} />
                        </td>

                        <td style={{ ...tdCenter(), width: 36 }}>
                          <RowStatusBadge info={statusInfo} total={totalStudents} />
                        </td>

                        {displayCols.map((col, ci) => {
                          const raw = row.subjectStrengths?.[col.key]
                          const sub = (subjects as any[]).find(s => s.name === col.key)
                          // Re-check applicability at render time so stale -1 values clear immediately
                          const isNA = raw === -1 && !isApplicableToSection(sub, row.sectionName, subjectAllocations)
                          const wouldBeNA = raw === undefined && !isApplicableToSection(sub, row.sectionName, subjectAllocations)

                          if (isNA || wouldBeNA) {
                            return (
                              <td key={col.key} style={tdCenter()}>
                                <NACell />
                              </td>
                            )
                          }
                          const val = raw ?? 0
                          return (
                            <td key={col.key} style={tdCenter()}>
                              <input type="number" min={0} max={9999}
                                value={val || ''} placeholder="0"
                                data-row={ri} data-col={ci}
                                onChange={e => updateCell(row.sectionName, col.key, parseInt(e.target.value) || 0)}
                                onKeyDown={e => { handleCellKey(e, ri, ci) }}
                                onFocus={e => e.currentTarget.select()}
                                style={{ width: '100%', maxWidth: 62, textAlign: 'center', padding: '4px 5px', borderRadius: 6, border: `1px solid ${val >= 5 ? '#7C6FE0' : '#E8E4FF'}`, background: val >= 5 ? '#F5F2FF' : '#fff', fontSize: 12, fontWeight: 700, fontFamily: "'DM Mono', monospace", color: val >= 5 ? '#7C3AED' : '#4B5275', outline: 'none' }}
                              />
                            </td>
                          )
                        })}
                        <td style={{ borderBottom: '1px solid #F0EDFF' }} />
                      </tr>
                    )
                  })}

                  {/* Add row */}
                  <tr>
                    <td colSpan={displayCols.length + 4} style={{ padding: '7px 10px', borderBottom: '1px solid #F0EDFF' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                        <button onClick={addRow}
                          style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '4px 12px', borderRadius: 6, border: '1.5px dashed #C4B5FD', background: '#F5F2FF', color: '#7C6FE0', fontSize: 11, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}
                          onMouseEnter={e => { e.currentTarget.style.background = '#EDE9FF' }}
                          onMouseLeave={e => { e.currentTarget.style.background = '#F5F2FF' }}>
                          <Plus size={11} /> Add class
                        </button>
                        {(hiddenCols.size > 0 || hiddenRows.size > 0) && (
                          <button onClick={() => { setHiddenCols(new Set()); setHiddenRows(new Set()) }}
                            style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '4px 10px', borderRadius: 6, border: '1px solid #E8E4FF', background: '#fff', color: '#8B87AD', fontSize: 10, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
                            <RefreshCw size={9} /> Restore hidden ({hiddenCols.size + hiddenRows.size})
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </>
        )}

        <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap', marginTop: 10, fontSize: 10, color: '#B8B4D4' }}>
          <span>✦ Purple = ≥ 5 students (AI groups these)</span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><CheckCircle2 size={10} color="#15803D" /> All filled & sum = total</span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><AlertCircle size={10} color="#D97706" /> Under / partial</span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><XCircle size={10} color="#DC2626" /> Over-subscribed</span>
          <span>NA = not offered to this class (configure in Resources → Subject)</span>
        </div>
        <TableKeyboardHint />
      </Section>

      {/* ══ PANEL 2: Group Formation Logic ══ */}
      <Section title="Group Formation Logic" icon={<Zap size={15} color="#7C6FE0" />}
        hint="How the AI schedules optional subjects across class-sections.">
        <GroupFormationLogicPanel minGroupSize={minGroupSize} setMinGroupSize={setMinGroupSize} previewGroups={previewGroups}
          hasData={rows.some(r => allCols.some(c => (r.subjectStrengths?.[c.key] ?? 0) > 0))} />
      </Section>

      {/* ══ PANEL 3: Subject Grouping Rules ══ */}
      <Section title="Subject Grouping Rules" icon={<BookOpen size={15} color="#7C6FE0" />}
        hint="Set how AI groups students for each subject.">
        {allCols.length === 0 ? (
          <EmptyState msg='Mark subjects as Optional to configure grouping rules.' />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {allCols.map(col => {
              const current = (subjectGroupingRules[col.key] ?? 'SAME_GRADE_ONLY') as GroupingBehavior
              const meta = BEHAVIOR_META[current]
              return (
                <div key={col.key} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', borderRadius: 10, background: '#fff', border: '1px solid #E8E4FF', flexWrap: 'wrap' }}>
                  <div style={{ minWidth: 140, fontSize: 13, fontWeight: 600, color: '#13111E' }}>{col.label}</div>
                  <div style={{ flex: 1, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    {BEHAVIORS.map(beh => {
                      const bm = BEHAVIOR_META[beh]; const active = beh === current
                      return (
                        <button key={beh} onClick={() => setSubjectGroupingRule(col.key, beh)} title={bm.desc}
                          style={{ padding: '4px 10px', borderRadius: 20, border: `1px solid ${active ? bm.border : '#E8E4FF'}`, background: active ? bm.bg : '#F8F7FF', color: active ? bm.fg : '#8B87AD', fontSize: 10, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
                          {bm.short}
                        </button>
                      )
                    })}
                  </div>
                  <span style={{ fontSize: 10, color: meta.fg, fontWeight: 600, padding: '2px 8px', borderRadius: 10, background: meta.bg, border: `1px solid ${meta.border}` }}>{meta.label}</span>
                </div>
              )
            })}
          </div>
        )}
      </Section>

      {/* ══ PANEL 4: AI-Generated Groups ══ */}
      <Section title="AI-Generated Groups" icon={<Sparkles size={15} color="#7C6FE0" />}
        hint={dynamicLearningGroups.length > 0 ? `${dynamicLearningGroups.length} group${dynamicLearningGroups.length !== 1 ? 's' : ''} — all scheduled in the same parallel period.` : 'Click "Generate groups" below.'}>
        {dynamicLearningGroups.length === 0 ? (
          <div style={{ padding: '32px 24px', textAlign: 'center', background: '#F8F7FF', borderRadius: 10, border: '1px dashed #D8D2FF' }}>
            <Sparkles size={28} color="#C4B5FD" style={{ marginBottom: 10 }} />
            <div style={{ fontSize: 13, color: '#8B87AD', marginBottom: 6 }}>No groups generated yet</div>
            <div style={{ fontSize: 11, color: '#B8B4D4' }}>Fill in the preference matrix and click ✦ Generate groups below</div>
          </div>
        ) : (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 14px', marginBottom: 12, borderRadius: 8, background: '#EDE9FF', border: '1px solid #C4B5FD', fontSize: 11, color: '#7C3AED', fontWeight: 600 }}>
              <Zap size={13} />
              All {dynamicLearningGroups.length} groups share the same period (Mon P6) — parallel teaching, no clashes.
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 12 }}>
              {dynamicLearningGroups.map((grp: any, gi: number) => (
                <GroupCard key={grp.id} grp={grp} colorDot={groupColor(gi)} />
              ))}
            </div>
          </>
        )}
      </Section>

      {/* Navigation */}
      <div style={{ display: 'flex', gap: 10, marginTop: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <button onClick={() => setStep(3)} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '9px 16px', borderRadius: 8, border: '1px solid #E8E4FF', background: '#fff', color: '#4B5275', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
          <ChevronLeft size={14} /> Period allocation
        </button>
        <button onClick={handleRegenerate} disabled={regenerating}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 7, padding: '9px 18px', borderRadius: 8, border: '1px solid #C4B5FD', background: regenerating ? '#EDE9FF' : '#F5F2FF', color: '#7C3AED', fontSize: 12, fontWeight: 700, cursor: regenerating ? 'wait' : 'pointer', fontFamily: 'inherit', transition: 'all 0.15s' }}>
          <RefreshCw size={13} style={{ animation: regenerating ? 'spin 0.7s linear infinite' : 'none' }} />
          {regenerating ? 'Generating…' : '✦ Generate groups'}
        </button>
        <div style={{ flex: 1 }} />
        <button onClick={() => setStep(5)}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 7, padding: '9px 20px', borderRadius: 8, border: 'none', background: 'linear-gradient(135deg, #7C6FE0, #9B8EF5)', color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', boxShadow: '0 2px 8px rgba(124,111,224,0.35)' }}>
          Next: Review & generate <ChevronRight size={14} />
        </button>
      </div>

      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}

// ── Sort toggle button ────────────────────────────────────────────────────────

function SortToggle({ active, onToggle, label }: { active: boolean; onToggle: () => void; label: string }) {
  return (
    <button onClick={onToggle} title={active ? `Sorted ${label} (click to reset)` : `Sort ${label}`}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 4, padding: '3px 9px', borderRadius: 6,
        border: `1px solid ${active ? '#7C6FE0' : '#E8E4FF'}`,
        background: active ? '#EDE9FF' : '#F8F7FF',
        color: active ? '#7C3AED' : '#8B87AD',
        fontSize: 10, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
      }}>
      <ArrowUpAZ size={11} />
      {label}
    </button>
  )
}

// ── Group Formation Logic panel ───────────────────────────────────────────────

interface PreviewGroup {
  /** Unique key for React (may include "::grade" suffix for same-grade sub-groups) */
  key: string
  /** The actual subject column key — used to look up subjectStrengths in each row */
  colKey: string
  label: string; sections: SectionStrength[]
  total: number; suitableRoom: any; noRoom: boolean; biggestRoom: any; belowThreshold: boolean
}

function GroupFormationLogicPanel({ minGroupSize, setMinGroupSize, previewGroups, hasData }: {
  minGroupSize: number; setMinGroupSize: (n: number) => void
  previewGroups: PreviewGroup[]; hasData: boolean
}) {
  const steps = [
    { num: '1', color: '#7C6FE0', bg: '#F5F2FF', title: 'Collect preferences', desc: 'Count how many students in each class-section chose each optional subject from the matrix.' },
    { num: '2', color: '#10B981', bg: '#ECFDF5', title: 'Group by rule', desc: 'Same Grade: one group per grade per subject (e.g. XI-group, XII-group). Cross Grade: all sections in one combined group.' },
    { num: '3', color: '#F59E0B', bg: '#FFFBEB', title: 'Same slot — parallel teaching', desc: 'Every subject group runs in the same "optional period". Students from the same class go to different rooms at the same time — zero schedule conflict.' },
    { num: '4', color: '#3B82F6', bg: '#EFF6FF', title: 'Room & capacity check', desc: 'Each group gets its own room. AI picks the smallest room that fits. A warning is shown if no room is large enough.' },
  ]
  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 10, marginBottom: 16 }}>
        {steps.map(s => (
          <div key={s.num} style={{ display: 'flex', gap: 10, padding: '10px 12px', borderRadius: 10, background: s.bg, border: `1px solid ${s.color}22` }}>
            <div style={{ flexShrink: 0, width: 24, height: 24, borderRadius: '50%', background: s.color, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 800 }}>{s.num}</div>
            <div>
              <div style={{ fontSize: 12, fontWeight: 700, color: '#13111E', marginBottom: 3 }}>{s.title}</div>
              <div style={{ fontSize: 11, color: '#4B5275', lineHeight: 1.5 }}>{s.desc}</div>
            </div>
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderRadius: 8, background: '#F8F7FF', border: '1px solid #E8E4FF', marginBottom: 14 }}>
        <Info size={13} color="#8B87AD" />
        <span style={{ fontSize: 12, color: '#4B5275', flex: 1 }}>Minimum students to form a group:</span>
        <input type="number" min={1} max={50} value={minGroupSize} onChange={e => setMinGroupSize(Math.max(1, parseInt(e.target.value) || 1))}
          style={{ width: 52, textAlign: 'center', padding: '4px 6px', borderRadius: 6, border: '1.5px solid #C4B5FD', background: '#fff', fontSize: 13, fontWeight: 700, fontFamily: "'DM Mono', monospace", color: '#7C3AED', outline: 'none' }} />
        <span style={{ fontSize: 11, color: '#8B87AD' }}>students</span>
      </div>
      {hasData ? (
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#8B87AD', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 8 }}>Expected groups from current data</div>
          {previewGroups.length === 0 ? (
            <div style={{ fontSize: 12, color: '#B8B4D4', padding: '8px 0' }}>No groups meet the minimum size threshold ({minGroupSize}).</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {previewGroups.map((g, i) => (
                <div key={g.key} style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', padding: '8px 12px', borderRadius: 8, background: '#fff', border: `1px solid ${g.noRoom ? '#FEE2E2' : g.belowThreshold ? '#FEF9C3' : '#E8E4FF'}` }}>
                  <div style={{ width: 8, height: 8, borderRadius: '50%', background: groupColor(i), flexShrink: 0 }} />
                  <span style={{ fontSize: 12, fontWeight: 700, color: '#13111E', minWidth: 120 }}>{g.label}</span>
                  <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', flex: 1 }}>
                    {g.sections.map(r => (
                      <span key={r.sectionName} style={{ padding: '1px 7px', borderRadius: 8, background: '#EDE9FF', color: '#7C3AED', fontSize: 10, fontWeight: 700, border: '1px solid #C4B5FD' }}>{r.sectionName} ({r.subjectStrengths?.[g.colKey] ?? 0})</span>
                    ))}
                  </div>
                  <span style={{ fontSize: 11, fontWeight: 700, color: '#13111E' }}>= {g.total} students</span>
                  {g.belowThreshold ? <span style={{ fontSize: 10, color: '#92400E', background: '#FEF9C3', padding: '2px 8px', borderRadius: 10, border: '1px solid #FDE68A' }}>⚠ Below min ({minGroupSize})</span>
                    : g.noRoom ? <span style={{ fontSize: 10, color: '#DC2626', background: '#FEF2F2', padding: '2px 8px', borderRadius: 10, border: '1px solid #FECACA' }}>⚠ No room fits {g.total} (largest: {g.biggestRoom?.capacity ?? 0})</span>
                    : g.suitableRoom ? <span style={{ fontSize: 10, color: '#15803D', background: '#DCFCE7', padding: '2px 8px', borderRadius: 10, border: '1px solid #BBF7D0' }}>→ {g.suitableRoom.name} (cap {g.suitableRoom.capacity})</span>
                    : <span style={{ fontSize: 10, color: '#8B87AD', background: '#F8F7FF', padding: '2px 8px', borderRadius: 10, border: '1px solid #E8E4FF' }}>Room TBD</span>}
                </div>
              ))}
              <div style={{ marginTop: 4, padding: '7px 12px', borderRadius: 8, background: '#EDE9FF', border: '1px solid #C4B5FD', fontSize: 11, color: '#7C3AED', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 7 }}>
                <Zap size={12} />All {previewGroups.filter(g => !g.belowThreshold).length} group{previewGroups.filter(g => !g.belowThreshold).length !== 1 ? 's' : ''} will run simultaneously — no student or teacher clash.
              </div>
            </div>
          )}
        </div>
      ) : (
        <div style={{ padding: '14px 16px', borderRadius: 8, background: '#F8F7FF', border: '1px dashed #D8D2FF', fontSize: 12, color: '#B8B4D4', textAlign: 'center' }}>Fill in student counts in the matrix above to see a group preview here.</div>
      )}
    </div>
  )
}

// ── Total-students cell ───────────────────────────────────────────────────────

function TotalStudentsCell({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(String(value || ''))
  useEffect(() => { if (!editing) setDraft(String(value || '')) }, [value, editing])
  if (editing) {
    return (
      <input autoFocus type="number" min={0} value={draft}
        onChange={e => setDraft(e.target.value)}
        onBlur={() => { onChange(parseInt(draft) || 0); setEditing(false) }}
        onKeyDown={e => { if (e.key === 'Enter') { onChange(parseInt(draft) || 0); setEditing(false) } if (e.key === 'Escape') setEditing(false) }}
        onFocus={e => e.currentTarget.select()}
        style={{ width: 60, textAlign: 'center', padding: '3px 5px', borderRadius: 5, border: '1.5px solid #7C6FE0', background: '#F5F2FF', fontSize: 12, fontWeight: 700, fontFamily: "'DM Mono', monospace", color: '#7C3AED', outline: 'none' }} />
    )
  }
  return (
    <span onClick={() => setEditing(true)} title="Click to edit"
      style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', minWidth: 42, padding: '3px 7px', borderRadius: 5, background: value > 0 ? '#F5F2FF' : '#F8F7FF', border: `1px solid ${value > 0 ? '#C4B5FD' : '#E8E4FF'}`, fontSize: 12, fontWeight: 700, fontFamily: "'DM Mono', monospace", color: value > 0 ? '#7C3AED' : '#C4C0DC', cursor: 'text' }}>
      {value > 0 ? value : '—'}
    </span>
  )
}

// ── Sub-components ────────────────────────────────────────────────────────────

function Section({ title, icon, hint, children }: { title: string; icon: React.ReactNode; hint?: string; children: React.ReactNode }) {
  return (
    <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #E8E4FF', marginBottom: 16, overflow: 'hidden' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '12px 16px', borderBottom: '1px solid #F0EDFF', background: '#FAFAFE' }}>
        {icon}
        <span style={{ fontSize: 13, fontWeight: 700, color: '#13111E' }}>{title}</span>
        {hint && <span style={{ fontSize: 11, color: '#8B87AD', marginLeft: 4 }}>— {hint}</span>}
      </div>
      <div style={{ padding: '14px 16px' }}>{children}</div>
    </div>
  )
}

function EmptyState({ msg }: { msg: string }) {
  return <div style={{ padding: '20px 0', textAlign: 'center', color: '#B8B4D4', fontSize: 12 }}>{msg}</div>
}

function GroupCard({ grp, colorDot }: { grp: any; colorDot: string }) {
  const behMeta = BEHAVIOR_META[grp.behavior as GroupingBehavior] ?? BEHAVIOR_META.SAME_GRADE_ONLY
  const overCapacity = grp.roomCapacity > 0 && grp.totalStrength > grp.roomCapacity
  const roomOk = grp.roomCapacity > 0 && grp.totalStrength <= grp.roomCapacity
  return (
    <div style={{ borderRadius: 10, border: `1px solid ${overCapacity ? '#FECACA' : '#E8E4FF'}`, background: '#fff', overflow: 'hidden', boxShadow: '0 1px 4px rgba(124,111,224,0.07)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px', background: 'linear-gradient(135deg, #F5F2FF, #FAFAFE)', borderBottom: '1px solid #F0EDFF' }}>
        <div style={{ width: 10, height: 10, borderRadius: '50%', background: colorDot, flexShrink: 0 }} />
        <span style={{ fontSize: 12, fontWeight: 800, color: '#13111E', fontFamily: "'DM Mono', monospace", flex: 1 }}>{grp.id.split('_')[0]}_{grp.id.split('_')[1]}</span>
        <span style={{ fontSize: 9, fontWeight: 700, padding: '2px 7px', borderRadius: 10, background: behMeta.bg, color: behMeta.fg, border: `1px solid ${behMeta.border}` }}>{behMeta.short}</span>
      </div>
      <div style={{ padding: '10px 12px' }}>
        <div style={{ fontSize: 11, color: '#4B5275', marginBottom: 6 }}><strong style={{ color: '#13111E' }}>Subject:</strong> {grp.subject}</div>
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 6 }}>
          {grp.sectionNames.map((sn: string) => <span key={sn} style={{ padding: '2px 7px', borderRadius: 8, background: '#EDE9FF', color: '#7C3AED', fontSize: 10, fontWeight: 700, border: '1px solid #C4B5FD' }}>{sn}</span>)}
        </div>
        <div style={{ display: 'flex', gap: 12, fontSize: 10, color: '#8B87AD', alignItems: 'center', flexWrap: 'wrap' }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}><Users size={9} /> {grp.totalStrength} students</span>
          {grp.room && <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}>🏫 {grp.room}{roomOk && <span style={{ color: '#15803D', fontWeight: 700 }}> (cap {grp.roomCapacity} ✓)</span>}{overCapacity && <span style={{ color: '#DC2626', fontWeight: 700 }}> (cap {grp.roomCapacity} — over by {grp.totalStrength - grp.roomCapacity}!)</span>}</span>}
        </div>
        {overCapacity && <div style={{ marginTop: 7, padding: '4px 8px', borderRadius: 6, background: '#FEF2F2', border: '1px solid #FECACA', fontSize: 10, color: '#DC2626', fontWeight: 600 }}>⚠ Room over capacity — assign a larger venue</div>}
        {(grp.day || grp.periodId) && <div style={{ marginTop: 8, padding: '5px 8px', borderRadius: 6, background: '#F5F2FF', border: '1px solid #E8E4FF', display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 10, color: '#7C3AED', fontWeight: 600 }}>📅 {grp.day?.slice(0, 3)} {grp.periodId}</div>}
      </div>
    </div>
  )
}

function thStyle(width: number, sticky = false): React.CSSProperties {
  return { width, minWidth: width, padding: '8px 10px', fontSize: 10, fontWeight: 800, color: '#8B87AD', textTransform: 'uppercase', letterSpacing: '0.08em', background: '#F8F7FF', borderBottom: '2px solid #E8E4FF', textAlign: sticky ? 'left' : 'center', whiteSpace: 'nowrap', position: sticky ? 'sticky' : 'static', left: sticky ? 0 : undefined, zIndex: sticky ? 1 : undefined } as React.CSSProperties
}
function tdSticky(): React.CSSProperties {
  return { padding: '6px 10px', fontSize: 12, fontWeight: 700, color: '#13111E', borderBottom: '1px solid #F0EDFF', position: 'sticky', left: 0, background: 'inherit', zIndex: 1, whiteSpace: 'nowrap' }
}
function tdCenter(): React.CSSProperties {
  return { padding: '4px 6px', textAlign: 'center', borderBottom: '1px solid #F0EDFF' }
}

const TABLE_SHORTCUTS = [
  { key: 'Tab', label: 'Next field' }, { key: 'Enter', label: 'Next row' },
  { key: '↑↓ ←→', label: 'Navigate' }, { key: 'Esc', label: 'Cancel' },
]
function TableKeyboardHint() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '4px 16px', padding: '7px 4px', marginTop: 4 }}>
      <span style={{ fontSize: 10, color: '#B8B4D4', fontWeight: 700, flexShrink: 0 }}>Shortcuts:</span>
      {TABLE_SHORTCUTS.map(s => (
        <span key={s.key + s.label} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, flexShrink: 0 }}>
          <kbd style={{ display: 'inline-flex', alignItems: 'center', padding: '1px 6px', borderRadius: 4, border: '1px solid #E8E4FF', background: '#fff', color: '#555', fontSize: 10, fontWeight: 700, fontFamily: 'inherit', boxShadow: '0 1px 0 rgba(0,0,0,0.06)', whiteSpace: 'nowrap' }}>{s.key}</kbd>
          <span style={{ fontSize: 10, color: '#B8B4D4' }}>{s.label}</span>
        </span>
      ))}
    </div>
  )
}
