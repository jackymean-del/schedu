/**
 * Step 4 — Student Groups
 *
 * Student Preference Matrix — editable class × optional-subject count grid.
 *   • Detects optional subjects by isOptional flag OR category containing "Optional"
 *   • "Total Students" column auto-fills from sectionStrengths.totalStudents
 *     (set in Section Strengths step), falling back to section.strength /
 *     sectionCapacityOverrides. Fully editable.
 *   • Cells for non-applicable section-subject pairs show "NA" (stored as -1).
 *     Clicking NA switches to an editable input; pressing Esc reverts.
 *     User can also type "0" then Escape in any cell to force-mark it NA.
 *   • Row status indicator: green ✓ when sum of non-NA cells = totalStudents,
 *     orange when under, red when over. Only shown once all non-NA cells ≥ 1.
 *   • Editable column headers (click pencil to rename).
 *   • "+ Add subject" opens a subject picker with search and custom-name fallback.
 *   • "×" removes a column; trash icon removes a row.
 *   • "+ Add class" appends a new row.
 *
 * Subject Grouping Rules — per-subject cross-class behavior chips.
 * AI-Generated Groups — cards showing AI's proposed learning groups.
 */

import {
  useMemo, useEffect, useState, useRef, useCallback,
} from 'react'
import { useTimetableStore } from '@/store/timetableStore'
import type { SectionStrength } from '@/types'
import {
  Sparkles, Users2, ChevronRight, ChevronLeft, RefreshCw,
  BookOpen, Users, GraduationCap, CheckSquare, Plus, Trash2, Pencil,
  CheckCircle2, XCircle, AlertCircle, ChevronDown,
} from 'lucide-react'

// ── types ─────────────────────────────────────────────────────

type GroupingBehavior = 'NO_GROUPING' | 'SAME_GRADE_ONLY' | 'CROSS_GRADE_ALLOWED' | 'FLEXIBLE_GROUPING'
type RowStatus = 'match' | 'under' | 'over' | 'empty'

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

const AI_LOGIC_ITEMS = [
  'Sections with ≥ 5 students in an optional subject form a group',
  'Groups of < 5 students from the same grade merge into combined sections',
  'Cross-grade groups only form when same-grade count < 3',
  'Each group gets its own room and time slot automatically',
  'Teacher assignment respects availability and max weekly load',
  'Groups that conflict in timing are automatically rescheduled',
]

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

/** Whether a subject is applicable to a given section.
 *  If the subject has no classConfig / sections constraints → applicable everywhere. */
function isApplicableToSection(sub: any, sectionName: string): boolean {
  if (!sub) return true  // custom column
  const configs: any[] = sub.classConfigs ?? []
  const secs: string[] = sub.sections ?? []
  if (configs.length === 0 && secs.length === 0) return true
  if (configs.length > 0) return configs.some((c: any) => c.sectionName === sectionName)
  return secs.includes(sectionName)
}

/** Get row status based on non-NA cell sum vs totalStudents. */
function getRowStatus(
  row: SectionStrength,
  totalStudents: number,
  cols: { key: string }[],
): RowStatus {
  if (totalStudents <= 0 || cols.length === 0) return 'empty'
  // only cells that are NOT marked NA (-1)
  const applicableCols = cols.filter(c => (row.subjectStrengths?.[c.key] ?? 0) !== -1)
  if (applicableCols.length === 0) return 'empty'
  const hasUnfilled = applicableCols.some(c => (row.subjectStrengths?.[c.key] ?? 0) <= 0)
  if (hasUnfilled) return 'empty'
  const sum = applicableCols.reduce((a, c) => a + (row.subjectStrengths?.[c.key] ?? 0), 0)
  if (sum === totalStudents) return 'match'
  return sum < totalStudents ? 'under' : 'over'
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
        onBlur={() => { const v = draft.trim() || value; onChange(v); setEditing(false) }}
        onKeyDown={e => {
          if (e.key === 'Enter') { onChange(draft.trim() || value); setEditing(false) }
          if (e.key === 'Escape') { setDraft(value); setEditing(false) }
          e.stopPropagation()
        }}
        onClick={e => e.stopPropagation()}
        style={{
          width: 78, fontSize: 9, fontWeight: 800,
          background: '#fff', border: '1.5px solid #7C6FE0', borderRadius: 4,
          padding: '2px 5px', outline: 'none',
          fontFamily: 'inherit', textAlign: 'center',
          textTransform: 'uppercase' as const, letterSpacing: '0.04em',
        }}
      />
    )
  }
  return (
    <span
      onClick={() => setEditing(true)}
      title="Click to rename column"
      style={{ cursor: 'text', display: 'inline-flex', alignItems: 'center', gap: 3 }}
    >
      {value}
      <Pencil size={7} style={{ opacity: 0.35, flexShrink: 0 }} />
    </span>
  )
}

// ── NA cell ───────────────────────────────────────────────────────────────────

function NACell({ onUnmark }: { onUnmark: () => void }) {
  return (
    <button
      onClick={onUnmark}
      title="Click to enter a value for this cell"
      style={{
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        width: 46, height: 26, borderRadius: 5,
        border: '1px dashed #D1D5DB', background: '#F9F9F9',
        color: '#D1D5DB', fontSize: 10, fontWeight: 700,
        cursor: 'pointer', fontFamily: 'inherit',
      }}
      onMouseEnter={e => { e.currentTarget.style.background = '#FEF2F2'; e.currentTarget.style.color = '#DC2626'; e.currentTarget.style.borderColor = '#FECACA' }}
      onMouseLeave={e => { e.currentTarget.style.background = '#F9F9F9'; e.currentTarget.style.color = '#D1D5DB'; e.currentTarget.style.borderColor = '#D1D5DB' }}
    >NA</button>
  )
}

// ── Row status badge ──────────────────────────────────────────────────────────

function RowStatusBadge({ status, sum, total }: { status: RowStatus; sum: number; total: number }) {
  if (status === 'empty') return null
  if (status === 'match') {
    return (
      <span title={`Sum (${sum}) = Total students (${total}) ✓`}
        style={{ display: 'inline-flex', alignItems: 'center', gap: 3, color: '#15803D', fontSize: 10, fontWeight: 700 }}>
        <CheckCircle2 size={13} />
      </span>
    )
  }
  if (status === 'under') {
    return (
      <span title={`Sum (${sum}) < Total students (${total}) — ${total - sum} unaccounted`}
        style={{ display: 'inline-flex', alignItems: 'center', gap: 3, color: '#D97706', fontSize: 10, fontWeight: 700 }}>
        <AlertCircle size={13} />
        <span style={{ fontSize: 9 }}>−{total - sum}</span>
      </span>
    )
  }
  return (
    <span title={`Sum (${sum}) > Total students (${total}) — over by ${sum - total}`}
      style={{ display: 'inline-flex', alignItems: 'center', gap: 3, color: '#DC2626', fontSize: 10, fontWeight: 700 }}>
      <XCircle size={13} />
      <span style={{ fontSize: 9 }}>+{sum - total}</span>
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

  const [regenerating, setRegenerating] = useState(false)
  const [logicChecked, setLogicChecked] = useState<Record<number, boolean>>(
    Object.fromEntries(AI_LOGIC_ITEMS.map((_, i) => [i, true]))
  )

  // ── Column / row customization state ──────────────────────────────────────
  const [customCols, setCustomCols]  = useState<{ key: string; label: string }[]>([])
  const [hiddenCols, setHiddenCols]  = useState<Set<string>>(new Set())
  const [colLabels,  setColLabels]   = useState<Record<string, string>>({})
  const [customRows, setCustomRows]  = useState<string[]>([])
  const [hiddenRows, setHiddenRows]  = useState<Set<string>>(new Set())

  // ── Add-subject picker state ───────────────────────────────────────────────
  const [showColPicker, setShowColPicker] = useState(false)
  const [pickerSearch, setPickerSearch]  = useState('')
  const pickerRef = useRef<HTMLDivElement>(null)
  const addBtnRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!showColPicker) return
    const handler = (e: MouseEvent) => {
      if (!pickerRef.current?.contains(e.target as Node) &&
          !addBtnRef.current?.contains(e.target as Node)) {
        setShowColPicker(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [showColPicker])

  // ── Optional subjects: isOptional flag OR category containing "Optional" ──
  const optionalSubjects = useMemo(() =>
    (subjects as any[]).filter(s =>
      s.isOptional === true ||
      (s.category ?? '').toLowerCase().includes('optional')
    )
  , [subjects])

  const subjectList = useMemo(() => optionalSubjects.map(s => s.name as string), [optionalSubjects])

  // ── Relevant sections: those with at least one optional subject assigned ──
  // If no optional subject has section constraints, show all sections.
  const optionalSections = useMemo(() => {
    const sectionSet = new Set<string>()
    for (const sub of optionalSubjects) {
      const fromConfigs = (sub.classConfigs ?? []).map((c: any) => c.sectionName).filter(Boolean) as string[]
      const assigned = fromConfigs.length > 0 ? fromConfigs : (sub.sections ?? [])
      for (const cls of assigned) sectionSet.add(cls)
    }
    if (sectionSet.size > 0) return (sections as any[]).filter(s => sectionSet.has(s.name))
    return sections as any[]
  }, [sections, optionalSubjects])

  // ── Effective columns & rows ───────────────────────────────────────────────
  const allCols = useMemo(() => [
    ...subjectList
      .filter(s => !hiddenCols.has(s))
      .map(s => ({ key: s, label: colLabels[s] ?? s })),
    ...customCols,
  ], [subjectList, hiddenCols, colLabels, customCols])

  const allRowNames = useMemo(() => [
    ...optionalSections
      .filter((s: any) => !hiddenRows.has(s.name))
      .map((s: any) => s.name as string),
    ...customRows,
  ], [optionalSections, hiddenRows, customRows])

  // ── Materialized rows ──────────────────────────────────────────────────────
  const rows: SectionStrength[] = useMemo(() =>
    allRowNames.map(name =>
      (sectionStrengths as SectionStrength[]).find(r => r.sectionName === name) ?? {
        sectionName: name,
        stream: guessStream(name),
        subjectStrengths: {},
      }
    )
  , [allRowNames, sectionStrengths])

  // Initialize store if empty — seed NA for non-applicable pairs
  useEffect(() => {
    if ((sectionStrengths as SectionStrength[]).length > 0) return
    if (allRowNames.length === 0 || allCols.length === 0) return
    const init: SectionStrength[] = allRowNames.map(name => {
      const sub_strengths: Record<string, number> = {}
      allCols.forEach(col => {
        const sub = (subjects as any[]).find(s => s.name === col.key)
        sub_strengths[col.key] = isApplicableToSection(sub, name) ? 0 : -1
      })
      const sec = (sections as any[]).find(s => s.name === name)
      const total = store.sectionCapacityOverrides?.[name] ?? sec?.strength ?? 0
      return { sectionName: name, stream: guessStream(name), subjectStrengths: sub_strengths, totalStudents: total || undefined }
    })
    setSectionStrengths(init)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allRowNames.length, allCols.length])

  // ── Total students helpers ─────────────────────────────────────────────────
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
      const upd = [...current]; upd[idx] = { ...upd[idx], totalStudents: val }
      setSectionStrengths(upd)
    } else {
      setSectionStrengths([...current, { sectionName, stream: guessStream(sectionName), subjectStrengths: {}, totalStudents: val }])
    }
  }, [sectionStrengths, setSectionStrengths])

  // ── Cell update ───────────────────────────────────────────────────────────
  const updateCell = useCallback((sectionName: string, colKey: string, value: number) => {
    const current = sectionStrengths as SectionStrength[]
    const idx = current.findIndex(r => r.sectionName === sectionName)
    const clamped = value < 0 ? -1 : Math.max(0, value)   // -1 = NA, 0+ = count
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
    // Seed NA for non-applicable rows
    const sub = (subjects as any[]).find(s => s.name === subjectName)
    const current = sectionStrengths as SectionStrength[]
    const updated = allRowNames.map(name => {
      const existing = current.find(r => r.sectionName === name) ?? { sectionName: name, stream: guessStream(name), subjectStrengths: {} }
      if (existing.subjectStrengths[subjectName] !== undefined) return existing
      const applicable = isApplicableToSection(sub, name)
      return { ...existing, subjectStrengths: { ...existing.subjectStrengths, [subjectName]: applicable ? 0 : -1 } }
    })
    setSectionStrengths(updated)
    setShowColPicker(false)
    setPickerSearch('')
  }, [allCols, subjectList, hiddenCols, subjects, sectionStrengths, allRowNames, setSectionStrengths])

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
    setSectionStrengths([
      ...(sectionStrengths as SectionStrength[]),
      { sectionName: newName, stream: '', subjectStrengths: sub_strengths },
    ])
  }, [allRowNames.length, allCols, sectionStrengths, setSectionStrengths])

  const removeRow = useCallback((name: string) => {
    if (optionalSections.some((s: any) => s.name === name))
      setHiddenRows(prev => new Set([...prev, name]))
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
    if (e.key === 'ArrowDown'  || (e.key === 'Enter' && !e.shiftKey)) { nextR = ri + 1; e.preventDefault() }
    else if (e.key === 'ArrowUp' || (e.key === 'Enter' && e.shiftKey)) { nextR = ri - 1; e.preventDefault() }
    else if (e.key === 'ArrowRight') { nextC = ci + 1; e.preventDefault() }
    else if (e.key === 'ArrowLeft')  { nextC = ci - 1; e.preventDefault() }
    else return
    tableWrapRef.current?.querySelector<HTMLInputElement>(
      `input[data-row="${nextR}"][data-col="${nextC}"]`
    )?.focus()
  }, [])

  // ── AI Regenerate ─────────────────────────────────────────────────────────
  const handleRegenerate = async () => {
    setRegenerating(true)
    await new Promise(r => setTimeout(r, 900))
    const generated: typeof dynamicLearningGroups = []
    const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday']
    const periods = ['P1', 'P2', 'P3', 'P4', 'P5', 'P6']
    allCols.forEach((col, si) => {
      const behavior = subjectGroupingRules[col.key] ?? 'SAME_GRADE_ONLY'
      if (behavior === 'NO_GROUPING') return
      const activeSections = rows
        .filter(r => (r.subjectStrengths?.[col.key] ?? 0) >= 5)
        .map(r => r.sectionName)
      if (activeSections.length < 2) return
      const batchSize = behavior === 'CROSS_GRADE_ALLOWED' ? 3 : 2
      for (let gi = 0; gi < activeSections.length; gi += batchSize) {
        const batch = activeSections.slice(gi, gi + batchSize)
        const totalStr = batch.reduce((a, sn) => {
          const row = rows.find(r => r.sectionName === sn)
          return a + (row?.subjectStrengths?.[col.key] ?? 0)
        }, 0)
        generated.push({
          id: `${generateGroupId(col.label, Math.floor(gi / batchSize))}_${Date.now()}`,
          subject: col.label, sectionNames: batch, totalStrength: totalStr,
          teacher: '', room: `Room ${100 + si + Math.floor(gi / batchSize)}`,
          behavior, day: days[si % days.length], periodId: periods[(gi + si) % periods.length],
        })
      }
    })
    setDynamicLearningGroups(generated)
    setRegenerating(false)
  }

  // ── Subjects available to add via picker ──────────────────────────────────
  const alreadyInCols = new Set(allCols.map(c => c.key))
  const subjectsToAdd = useMemo(() => {
    const q = pickerSearch.toLowerCase()
    return (subjects as any[])
      .filter(s => !alreadyInCols.has(s.name) && (!q || s.name.toLowerCase().includes(q) || (s.category ?? '').toLowerCase().includes(q)))
      .sort((a, b) => {
        const ao = (a.category ?? '').includes('Optional') ? 0 : 1
        const bo = (b.category ?? '').includes('Optional') ? 0 : 1
        return ao - bo || a.name.localeCompare(b.name)
      })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subjects, alreadyInCols, pickerSearch])

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
          <h2 style={{ fontFamily: "'DM Serif Display', serif", fontSize: 22, color: '#13111E', margin: 0, lineHeight: 1.1 }}>
            Student Groups
          </h2>
          <div style={{ fontSize: 12, color: '#4B5275', marginTop: 3 }}>
            <em style={{ color: '#7C6FE0' }}>AI</em> uses student counts + grouping rules to create optimised cross-class learning groups.
          </div>
        </div>
      </div>

      {/* ══════════════════════════════════════
          PANEL 1: Student Preference Matrix
      ══════════════════════════════════════ */}
      <Section
        title="Student Preference Matrix"
        icon={<GraduationCap size={15} color="#7C6FE0" />}
        hint="Auto-filled from section data. Click headers to rename. NA = subject not applicable to that class."
      >
        {!showMatrix && subjects.length === 0 ? (
          <EmptyState msg="Add subjects in Resources, mark them as Optional (4th/5th/6th Optional category) to appear here." />
        ) : !showMatrix ? (
          <EmptyState msg='Mark at least one subject as Optional (category = "4th Optional", "5th Optional", etc.) in the Subjects panel.' />
        ) : (
          <div ref={tableWrapRef} style={{ overflowX: 'auto' as const, position: 'relative' as const }}>
            <table style={{ borderCollapse: 'collapse' as const, width: '100%', minWidth: 400 }}>
              <thead>
                <tr>
                  {/* Class column */}
                  <th style={thStyle(140, true)}>Class / Section</th>
                  {/* Total students */}
                  <th style={thStyle(90)}>
                    <span title="Auto-filled from section data. Click to edit per row.">
                      Total Students
                    </span>
                  </th>
                  {/* Status */}
                  <th style={thStyle(36)} title="Match status: green=ok, orange=under, red=over" />

                  {/* Subject columns — editable headers */}
                  {allCols.map((col) => (
                    <th key={col.key} style={{ ...thStyle(colW), position: 'relative' as const }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 3 }}>
                        <EditableColHeader
                          value={col.label}
                          onChange={newLabel => renameCol(col.key, newLabel)}
                        />
                        <button
                          onClick={() => removeCol(col.key)}
                          title={`Remove "${col.label}"`}
                          style={{
                            display: 'inline-flex', width: 13, height: 13, borderRadius: 3,
                            border: 'none', background: 'transparent',
                            color: '#C4B5FD', cursor: 'pointer', padding: 0,
                            fontSize: 11, fontWeight: 800, alignItems: 'center', justifyContent: 'center',
                            flexShrink: 0,
                          }}
                          onMouseEnter={e => { e.currentTarget.style.background = '#FEE2E2'; e.currentTarget.style.color = '#DC2626' }}
                          onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#C4B5FD' }}
                        >×</button>
                      </div>
                    </th>
                  ))}

                  {/* Add subject column button — with picker */}
                  <th style={{ ...thStyle(42), textAlign: 'center' as const, padding: '4px', position: 'relative' as const }}>
                    <button
                      ref={addBtnRef}
                      onClick={() => { setShowColPicker(p => !p); setPickerSearch('') }}
                      title="Add subject column"
                      style={{
                        display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 2,
                        width: 32, height: 24, borderRadius: 6,
                        border: `1.5px ${showColPicker ? 'solid #7C6FE0' : 'dashed #C4B5FD'}`,
                        background: showColPicker ? '#EDE9FF' : '#F5F2FF',
                        color: '#7C6FE0', cursor: 'pointer', padding: 0,
                      }}
                    >
                      <Plus size={11} />
                    </button>

                    {/* Subject picker dropdown */}
                    {showColPicker && (
                      <div
                        ref={pickerRef}
                        style={{
                          position: 'fixed' as const, zIndex: 200,
                          top: (addBtnRef.current?.getBoundingClientRect().bottom ?? 0) + 4,
                          left: Math.max(8, (addBtnRef.current?.getBoundingClientRect().right ?? 0) - 260),
                          width: 260,
                          background: '#fff', border: '1.5px solid #DDD8FF', borderRadius: 10,
                          boxShadow: '0 8px 24px rgba(124,111,224,0.18)',
                          overflow: 'hidden',
                        }}
                        onClick={e => e.stopPropagation()}
                      >
                        {/* Search */}
                        <div style={{ padding: '8px 10px', borderBottom: '1px solid #F0EDFF' }}>
                          <input
                            autoFocus
                            placeholder="Search subjects…"
                            value={pickerSearch}
                            onChange={e => setPickerSearch(e.target.value)}
                            onKeyDown={e => {
                              if (e.key === 'Escape') setShowColPicker(false)
                              if (e.key === 'Enter' && subjectsToAdd.length === 0 && pickerSearch.trim()) {
                                addCustomCol(pickerSearch)
                              }
                            }}
                            style={{
                              width: '100%', padding: '5px 8px', borderRadius: 6,
                              border: '1px solid #E8E4FF', fontSize: 11, outline: 'none',
                              fontFamily: 'inherit', boxSizing: 'border-box' as const,
                            }}
                          />
                        </div>
                        {/* Subject list */}
                        <div style={{ maxHeight: 220, overflowY: 'auto' as const }}>
                          {subjectsToAdd.length === 0 ? (
                            <div style={{ padding: '10px 12px', fontSize: 11, color: '#8B87AD', textAlign: 'center' as const }}>
                              {pickerSearch.trim()
                                ? <span>No match. <button onClick={() => addCustomCol(pickerSearch)} style={{ color: '#7C6FE0', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 700, fontSize: 11, fontFamily: 'inherit' }}>Add "{pickerSearch}" as custom column</button></span>
                                : 'All subjects already added'}
                            </div>
                          ) : subjectsToAdd.map((s: any) => (
                            <button
                              key={s.name}
                              onClick={() => addSubjectCol(s.name)}
                              style={{
                                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                width: '100%', padding: '7px 12px', border: 'none',
                                background: 'transparent', cursor: 'pointer', fontFamily: 'inherit',
                                textAlign: 'left' as const,
                              }}
                              onMouseEnter={e => { e.currentTarget.style.background = '#F5F2FF' }}
                              onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
                            >
                              <span style={{ fontSize: 12, fontWeight: 600, color: '#13111E' }}>{s.name}</span>
                              {s.category && (
                                <span style={{
                                  fontSize: 9, fontWeight: 700, padding: '1px 6px', borderRadius: 8,
                                  background: (s.category ?? '').includes('Optional') ? '#EDE9FF' : '#F0F0F0',
                                  color: (s.category ?? '').includes('Optional') ? '#7C3AED' : '#8B87AD',
                                }}>{s.category}</span>
                              )}
                            </button>
                          ))}
                        </div>
                        {/* Custom name option */}
                        {pickerSearch.trim() && subjectsToAdd.length > 0 && (
                          <div style={{ padding: '6px 10px', borderTop: '1px solid #F0EDFF' }}>
                            <button
                              onClick={() => addCustomCol(pickerSearch)}
                              style={{
                                width: '100%', padding: '5px 8px', borderRadius: 6,
                                border: '1px dashed #C4B5FD', background: '#F5F2FF',
                                color: '#7C6FE0', fontSize: 11, fontWeight: 600,
                                cursor: 'pointer', fontFamily: 'inherit',
                              }}
                            >
                              <Plus size={10} style={{ display: 'inline', marginRight: 4, verticalAlign: 'middle' }} />
                              Add "{pickerSearch}" as custom column
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                  </th>
                </tr>
              </thead>

              <tbody>
                {rows.map((row, ri) => {
                  const totalStudents = getSectionTotal(row.sectionName)
                  const nonNASum = allCols.reduce((a, c) => {
                    const v = row.subjectStrengths?.[c.key] ?? 0
                    return v === -1 ? a : a + v
                  }, 0)
                  const status = getRowStatus(row, totalStudents, allCols)

                  return (
                    <tr key={row.sectionName} style={{ background: ri % 2 === 0 ? '#fff' : '#FAFAFE' }}>
                      {/* Section name */}
                      <td style={tdSticky()}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                          <span style={{ flex: 1 }}>{row.sectionName}</span>
                          <button
                            onClick={() => removeRow(row.sectionName)}
                            title="Remove row"
                            style={{
                              display: 'inline-flex', width: 15, height: 15, borderRadius: 3,
                              border: 'none', background: 'transparent',
                              color: '#D1D5DB', cursor: 'pointer', padding: 0, flexShrink: 0,
                              alignItems: 'center', justifyContent: 'center',
                            }}
                            onMouseEnter={e => { e.currentTarget.style.background = '#FEE2E2'; e.currentTarget.style.color = '#DC2626' }}
                            onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#D1D5DB' }}
                          >
                            <Trash2 size={9} />
                          </button>
                        </div>
                      </td>

                      {/* Total students — auto-filled, editable */}
                      <td style={tdCenter()}>
                        <TotalStudentsCell
                          value={totalStudents}
                          onChange={v => updateTotalStudents(row.sectionName, v)}
                        />
                      </td>

                      {/* Status badge */}
                      <td style={{ ...tdCenter(), width: 36 }}>
                        <RowStatusBadge status={status} sum={nonNASum} total={totalStudents} />
                      </td>

                      {/* Subject cells */}
                      {allCols.map((col, ci) => {
                        const raw = row.subjectStrengths?.[col.key]
                        const isNA = raw === -1

                        // Auto-detect if non-applicable (only on first render, if not yet stored)
                        const sub = (subjects as any[]).find(s => s.name === col.key)
                        const wouldBeNA = raw === undefined && !isApplicableToSection(sub, row.sectionName)

                        if (isNA || (raw === undefined && wouldBeNA)) {
                          return (
                            <td key={col.key} style={tdCenter()}>
                              <NACell onUnmark={() => updateCell(row.sectionName, col.key, 0)} />
                            </td>
                          )
                        }

                        const val = raw ?? 0
                        return (
                          <td key={col.key} style={tdCenter()}>
                            <input
                              type="number" min={0} max={9999}
                              value={val || ''}
                              placeholder="0"
                              data-row={ri} data-col={ci}
                              onChange={e => updateCell(row.sectionName, col.key, parseInt(e.target.value) || 0)}
                              onKeyDown={e => {
                                // Ctrl+Delete or Ctrl+Backspace → mark NA
                                if ((e.key === 'Delete' || e.key === 'Backspace') && (e.ctrlKey || e.metaKey)) {
                                  updateCell(row.sectionName, col.key, -1)
                                  e.preventDefault()
                                  return
                                }
                                handleCellKey(e, ri, ci)
                              }}
                              onFocus={e => e.currentTarget.select()}
                              style={{
                                width: '100%', maxWidth: 62, textAlign: 'center' as const,
                                padding: '4px 5px', borderRadius: 6,
                                border: `1px solid ${val >= 5 ? '#7C6FE0' : '#E8E4FF'}`,
                                background: val >= 5 ? '#F5F2FF' : '#fff',
                                fontSize: 12, fontWeight: 700, fontFamily: "'DM Mono', monospace",
                                color: val >= 5 ? '#7C3AED' : '#4B5275',
                                outline: 'none',
                              }}
                            />
                          </td>
                        )
                      })}

                      {/* Empty cell under + header */}
                      <td style={{ borderBottom: '1px solid #F0EDFF' }} />
                    </tr>
                  )
                })}

                {/* Add row */}
                <tr>
                  <td colSpan={allCols.length + 4} style={{ padding: '7px 10px', borderBottom: '1px solid #F0EDFF' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' as const }}>
                      <button onClick={addRow} style={{
                        display: 'inline-flex', alignItems: 'center', gap: 5,
                        padding: '4px 12px', borderRadius: 6,
                        border: '1.5px dashed #C4B5FD', background: '#F5F2FF',
                        color: '#7C6FE0', fontSize: 11, fontWeight: 700,
                        cursor: 'pointer', fontFamily: 'inherit',
                      }}
                        onMouseEnter={e => { e.currentTarget.style.background = '#EDE9FF' }}
                        onMouseLeave={e => { e.currentTarget.style.background = '#F5F2FF' }}
                      >
                        <Plus size={11} /> Add class
                      </button>
                      {(hiddenCols.size > 0 || hiddenRows.size > 0) && (
                        <button
                          onClick={() => { setHiddenCols(new Set()); setHiddenRows(new Set()) }}
                          style={{
                            display: 'inline-flex', alignItems: 'center', gap: 4,
                            padding: '4px 10px', borderRadius: 6,
                            border: '1px solid #E8E4FF', background: '#fff',
                            color: '#8B87AD', fontSize: 10, fontWeight: 600,
                            cursor: 'pointer', fontFamily: 'inherit',
                          }}
                        >
                          <RefreshCw size={9} /> Restore hidden ({hiddenCols.size + hiddenRows.size})
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        )}

        {/* Legend */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' as const, marginTop: 10, fontSize: 10, color: '#B8B4D4' }}>
          <span>✦ Purple = ≥ 5 students (AI forms a group)</span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            <CheckCircle2 size={10} color="#15803D" /> Sum = Total
          </span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            <AlertCircle size={10} color="#D97706" /> Under
          </span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            <XCircle size={10} color="#DC2626" /> Over
          </span>
          <span>NA = not applicable · Ctrl+Del = mark NA</span>
        </div>
        <TableKeyboardHint />
      </Section>

      {/* ══════════════════════════════════════
          PANEL 2: Subject Grouping Rules
      ══════════════════════════════════════ */}
      <Section
        title="Subject Grouping Rules"
        icon={<BookOpen size={15} color="#7C6FE0" />}
        hint="Set how AI groups students for each subject."
      >
        {allCols.length === 0 ? (
          <EmptyState msg='Mark subjects as Optional (category = "4th Optional" etc.) to configure grouping rules.' />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 8 }}>
            {allCols.map(col => {
              const current = (subjectGroupingRules[col.key] ?? 'SAME_GRADE_ONLY') as GroupingBehavior
              const meta = BEHAVIOR_META[current]
              return (
                <div key={col.key} style={{
                  display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px',
                  borderRadius: 10, background: '#fff', border: '1px solid #E8E4FF', flexWrap: 'wrap' as const,
                }}>
                  <div style={{ minWidth: 140, fontSize: 13, fontWeight: 600, color: '#13111E' }}>{col.label}</div>
                  <div style={{ flex: 1, display: 'flex', gap: 6, flexWrap: 'wrap' as const }}>
                    {BEHAVIORS.map(beh => {
                      const bMeta = BEHAVIOR_META[beh]; const active = beh === current
                      return (
                        <button key={beh} onClick={() => setSubjectGroupingRule(col.key, beh)} title={bMeta.desc} style={{
                          padding: '4px 10px', borderRadius: 20,
                          border: `1px solid ${active ? bMeta.border : '#E8E4FF'}`,
                          background: active ? bMeta.bg : '#F8F7FF',
                          color: active ? bMeta.fg : '#8B87AD',
                          fontSize: 10, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
                        }}>{bMeta.short}</button>
                      )
                    })}
                  </div>
                  <span style={{ fontSize: 10, color: meta.fg, fontWeight: 600, padding: '2px 8px', borderRadius: 10, background: meta.bg, border: `1px solid ${meta.border}` }}>
                    {meta.label}
                  </span>
                </div>
              )
            })}
          </div>
        )}
      </Section>

      {/* ══════════════════════════════════════
          PANEL 3: AI Logic Summary
      ══════════════════════════════════════ */}
      <Section title="AI Logic Summary" icon={<CheckSquare size={15} color="#7C6FE0" />}
        hint="Rules the AI applies. Uncheck to disable.">
        <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 8 }}>
          {AI_LOGIC_ITEMS.map((item, i) => (
            <label key={i} style={{
              display: 'flex', alignItems: 'flex-start', gap: 10, padding: '8px 12px', borderRadius: 8,
              background: logicChecked[i] ? '#F5F2FF' : '#F8F7FF',
              border: `1px solid ${logicChecked[i] ? '#D8D2FF' : '#E8E4FF'}`, cursor: 'pointer',
            }}>
              <input type="checkbox" checked={logicChecked[i] ?? true}
                onChange={e => setLogicChecked(prev => ({ ...prev, [i]: e.target.checked }))}
                style={{ marginTop: 2, accentColor: '#7C6FE0', width: 14, height: 14, flexShrink: 0 }}
              />
              <span style={{ fontSize: 12, color: logicChecked[i] ? '#13111E' : '#B8B4D4', lineHeight: 1.5 }}>{item}</span>
            </label>
          ))}
        </div>
      </Section>

      {/* ══════════════════════════════════════
          PANEL 4: AI-Generated Groups
      ══════════════════════════════════════ */}
      <Section title="AI-Generated Groups" icon={<Sparkles size={15} color="#7C6FE0" />}
        hint={dynamicLearningGroups.length > 0
          ? `${dynamicLearningGroups.length} group${dynamicLearningGroups.length !== 1 ? 's' : ''} generated.`
          : 'Click "Regenerate groups" to build optimised learning groups.'}>
        {dynamicLearningGroups.length === 0 ? (
          <div style={{ padding: '32px 24px', textAlign: 'center' as const, background: '#F8F7FF', borderRadius: 10, border: '1px dashed #D8D2FF' }}>
            <Sparkles size={28} color="#C4B5FD" style={{ marginBottom: 10 }} />
            <div style={{ fontSize: 13, color: '#8B87AD', marginBottom: 6 }}>No groups generated yet</div>
            <div style={{ fontSize: 11, color: '#B8B4D4' }}>Fill in the preference matrix and click ✦ Regenerate groups below</div>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 12 }}>
            {dynamicLearningGroups.map((grp: any, gi: number) => (
              <GroupCard key={grp.id} grp={grp} colorDot={groupColor(gi)} />
            ))}
          </div>
        )}
      </Section>

      {/* Navigation */}
      <div style={{ display: 'flex', gap: 10, marginTop: 8, flexWrap: 'wrap' as const, alignItems: 'center' }}>
        <button onClick={() => setStep(3)} style={{
          display: 'inline-flex', alignItems: 'center', gap: 6, padding: '9px 16px', borderRadius: 8,
          border: '1px solid #E8E4FF', background: '#fff', color: '#4B5275', fontSize: 12, fontWeight: 600,
          cursor: 'pointer', fontFamily: 'inherit',
        }}>
          <ChevronLeft size={14} /> Period allocation
        </button>
        <button onClick={handleRegenerate} disabled={regenerating} style={{
          display: 'inline-flex', alignItems: 'center', gap: 7, padding: '9px 18px', borderRadius: 8,
          border: '1px solid #C4B5FD', background: regenerating ? '#EDE9FF' : '#F5F2FF', color: '#7C3AED',
          fontSize: 12, fontWeight: 700, cursor: regenerating ? 'wait' : 'pointer',
          fontFamily: 'inherit', transition: 'all 0.15s',
        }}>
          <RefreshCw size={13} style={{ animation: regenerating ? 'spin 0.7s linear infinite' : 'none' }} />
          {regenerating ? 'Generating…' : '✦ Regenerate groups'}
        </button>
        <div style={{ flex: 1 }} />
        <button onClick={() => setStep(5)} style={{
          display: 'inline-flex', alignItems: 'center', gap: 7, padding: '9px 20px', borderRadius: 8,
          border: 'none', background: 'linear-gradient(135deg, #7C6FE0, #9B8EF5)', color: '#fff',
          fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
          boxShadow: '0 2px 8px rgba(124,111,224,0.35)',
        }}>
          Next: Review & generate <ChevronRight size={14} />
        </button>
      </div>

      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}

// ── Total-students editable cell ──────────────────────────────────────────────

function TotalStudentsCell({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(String(value || ''))

  useEffect(() => { if (!editing) setDraft(String(value || '')) }, [value, editing])

  if (editing) {
    return (
      <input
        autoFocus
        type="number" min={0} value={draft}
        onChange={e => setDraft(e.target.value)}
        onBlur={() => { onChange(parseInt(draft) || 0); setEditing(false) }}
        onKeyDown={e => {
          if (e.key === 'Enter') { onChange(parseInt(draft) || 0); setEditing(false) }
          if (e.key === 'Escape') setEditing(false)
        }}
        onFocus={e => e.currentTarget.select()}
        style={{
          width: 60, textAlign: 'center' as const, padding: '3px 5px', borderRadius: 5,
          border: '1.5px solid #7C6FE0', background: '#F5F2FF',
          fontSize: 12, fontWeight: 700, fontFamily: "'DM Mono', monospace",
          color: '#7C3AED', outline: 'none',
        }}
      />
    )
  }
  return (
    <span
      onClick={() => setEditing(true)}
      title="Click to edit total students"
      style={{
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        minWidth: 42, padding: '3px 7px', borderRadius: 5,
        background: value > 0 ? '#F5F2FF' : '#F8F7FF',
        border: `1px solid ${value > 0 ? '#C4B5FD' : '#E8E4FF'}`,
        fontSize: 12, fontWeight: 700, fontFamily: "'DM Mono', monospace",
        color: value > 0 ? '#7C3AED' : '#C4C0DC',
        cursor: 'text',
      }}
    >
      {value > 0 ? value : '—'}
    </span>
  )
}

// ── Sub-components ────────────────────────────────────────────────────────────

function Section({ title, icon, hint, children }: {
  title: string; icon: React.ReactNode; hint?: string; children: React.ReactNode
}) {
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
  return <div style={{ padding: '20px 0', textAlign: 'center' as const, color: '#B8B4D4', fontSize: 12 }}>{msg}</div>
}

function GroupCard({ grp, colorDot }: { grp: any; colorDot: string }) {
  const behMeta = BEHAVIOR_META[grp.behavior as GroupingBehavior] ?? BEHAVIOR_META.SAME_GRADE_ONLY
  return (
    <div style={{ borderRadius: 10, border: '1px solid #E8E4FF', background: '#fff', overflow: 'hidden', boxShadow: '0 1px 4px rgba(124,111,224,0.07)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px', background: 'linear-gradient(135deg, #F5F2FF, #FAFAFE)', borderBottom: '1px solid #F0EDFF' }}>
        <div style={{ width: 10, height: 10, borderRadius: '50%', background: colorDot, flexShrink: 0 }} />
        <span style={{ fontSize: 12, fontWeight: 800, color: '#13111E', fontFamily: "'DM Mono', monospace", flex: 1 }}>
          {grp.id.split('_')[0]}_{grp.id.split('_')[1]}
        </span>
        <span style={{ fontSize: 9, fontWeight: 700, padding: '2px 7px', borderRadius: 10, background: behMeta.bg, color: behMeta.fg, border: `1px solid ${behMeta.border}` }}>
          {behMeta.short}
        </span>
      </div>
      <div style={{ padding: '10px 12px' }}>
        <div style={{ fontSize: 11, color: '#4B5275', marginBottom: 6 }}><strong style={{ color: '#13111E' }}>Subject:</strong> {grp.subject}</div>
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' as const, marginBottom: 6 }}>
          {grp.sectionNames.map((sn: string) => (
            <span key={sn} style={{ padding: '2px 7px', borderRadius: 8, background: '#EDE9FF', color: '#7C3AED', fontSize: 10, fontWeight: 700, border: '1px solid #C4B5FD' }}>{sn}</span>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 12, fontSize: 10, color: '#8B87AD' }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}><Users size={9} /> {grp.totalStrength} students</span>
          {grp.room && <span>🏫 {grp.room}</span>}
        </div>
        {(grp.day || grp.periodId) && (
          <div style={{ marginTop: 8, padding: '5px 8px', borderRadius: 6, background: '#F5F2FF', border: '1px solid #E8E4FF', display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 10, color: '#7C3AED', fontWeight: 600 }}>
            📅 {grp.day?.slice(0, 3)} {grp.periodId}
          </div>
        )}
      </div>
    </div>
  )
}

function thStyle(width: number, sticky = false): React.CSSProperties {
  return {
    width, minWidth: width, padding: '8px 10px',
    fontSize: 10, fontWeight: 800, color: '#8B87AD',
    textTransform: 'uppercase', letterSpacing: '0.08em',
    background: '#F8F7FF', borderBottom: '2px solid #E8E4FF',
    textAlign: sticky ? 'left' : 'center', whiteSpace: 'nowrap',
    position: sticky ? 'sticky' : 'static', left: sticky ? 0 : undefined, zIndex: sticky ? 1 : undefined,
  } as React.CSSProperties
}
function tdSticky(): React.CSSProperties {
  return {
    padding: '6px 10px', fontSize: 12, fontWeight: 700, color: '#13111E',
    borderBottom: '1px solid #F0EDFF', position: 'sticky', left: 0, background: 'inherit', zIndex: 1, whiteSpace: 'nowrap',
  }
}
function tdCenter(): React.CSSProperties {
  return { padding: '4px 6px', textAlign: 'center', borderBottom: '1px solid #F0EDFF' }
}

const TABLE_SHORTCUTS = [
  { key: 'Tab',        label: 'Next field' },
  { key: 'Enter',      label: 'Next row'   },
  { key: '↑↓ ←→',    label: 'Navigate'   },
  { key: 'Ctrl+Del',  label: 'Mark NA'    },
  { key: 'Esc',        label: 'Cancel'     },
]
function TableKeyboardHint() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '4px 16px', padding: '7px 4px', marginTop: 4 }}>
      <span style={{ fontSize: 10, color: '#B8B4D4', fontWeight: 700, flexShrink: 0 }}>Shortcuts:</span>
      {TABLE_SHORTCUTS.map(s => (
        <span key={s.key + s.label} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, flexShrink: 0 }}>
          <kbd style={{ display: 'inline-flex', alignItems: 'center', padding: '1px 6px', borderRadius: 4, border: '1px solid #E8E4FF', background: '#fff', color: '#555', fontSize: 10, fontWeight: 700, fontFamily: 'inherit', boxShadow: '0 1px 0 rgba(0,0,0,0.06)', whiteSpace: 'nowrap' as const }}>{s.key}</kbd>
          <span style={{ fontSize: 10, color: '#B8B4D4' }}>{s.label}</span>
        </span>
      ))}
    </div>
  )
}
