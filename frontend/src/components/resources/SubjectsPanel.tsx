/**
 * SubjectsPanel — Tab 2.  Curriculum-aware AI edition.
 *
 * Features:
 * - Board selector  (CBSE / ICSE / IB / Cambridge / Custom)
 * - AI Assign Classes  — assigns sections AND recommends slots/week per board
 * - Per-row ⚡ AI (N)  — individual subject AI assign with confidence hint
 * - Undo AI / Reset AI — snapshot-based recovery system
 * - AI-assigned badge  — subtle ⚡ indicator on AI-set rows
 * - generateShortName()   — re-exported from curriculum.ts
 * - suggestClassesForSubject() — re-exported from curriculum.ts
 */

import { useState, useRef, useMemo, useEffect } from 'react'
import type { Subject, Section } from '@/types'
import { Trash2, Plus, ChevronDown, ChevronRight, BookOpen, Settings } from 'lucide-react'
import { P, P_D, P_L, P_B, TH, TD, TABLE_CARD, InlineChipSelect, ImportModal } from './shared'
import type { ChipOption } from './shared'
import {
  CURRICULUM,
  BOARD_LABELS,
  type CurriculumBoard,
  type GradeGroup,
  generateShortName,
  suggestClassesForSubject,
  suggestSlotsPerWeek,
  dominantGradeGroup,
  getSubjectHint,
  getShortHint,
  normalizeBoardType,
  getGrade,
  getGradeGroup,
  gradeKey,
} from './curriculum'

// Re-export for step-resources-v2.tsx
export { generateShortName, suggestClassesForSubject } from './curriculum'

function makeId() { return Math.random().toString(36).slice(2, 9) }

const CATS = ['Compulsory','Language','4th Optional','5th Optional','6th Optional','Practical','Activity','EST','CCA','Skill']

const BOARD_ORDER: CurriculumBoard[] = ['CBSE','ICSE','IB','Cambridge','Custom']

// ─── Input style ──────────────────────────────────────────────────────────────
const inp: React.CSSProperties = {
  padding: '3px 6px', border: '1px solid #E4E0FF', borderRadius: 4,
  fontSize: 12, color: '#111028', outline: 'none', fontFamily: 'inherit', background: '#FAFAFE',
}

const outlineBtn = (active = false): React.CSSProperties => ({
  display: 'inline-flex', alignItems: 'center', gap: 4,
  background: active ? P_L : '#fff',
  color: active ? P_D : '#6B6891',
  border: `1px solid ${active ? P_B : '#DDD8FF'}`,
  borderRadius: 5, padding: '4px 9px', fontSize: 11, fontWeight: 600,
  cursor: 'pointer', fontFamily: 'inherit', flexShrink: 0,
  whiteSpace: 'nowrap' as const,
})

// ─── Inline edit cell ─────────────────────────────────────────────────────────
function EditCell({ value, onSave, placeholder = '…', width = 100 }: {
  value: string; onSave: (v: string) => void; placeholder?: string; width?: number
}) {
  const [e, setE] = useState(false)
  const [t, setT] = useState(value)
  const ref = useRef<HTMLInputElement>(null)
  useEffect(() => { if (e) ref.current?.focus() }, [e])
  useEffect(() => { setT(value) }, [value])
  function commit() { onSave(t.trim() || value); setE(false) }
  if (e) return (
    <input ref={ref} value={t} onChange={ev => setT(ev.target.value)}
      onBlur={commit}
      onKeyDown={ev => { if (ev.key === 'Enter') commit(); if (ev.key === 'Escape') { setT(value); setE(false) } }}
      style={{ ...inp, width }}
    />
  )
  return (
    <span onClick={() => setE(true)} title="Click to edit"
      style={{ cursor: 'text', padding: '2px 3px', borderRadius: 3, display: 'inline-block', minWidth: 28, color: value ? '#111028' : '#C4C0DC' }}
      onMouseEnter={ev => (ev.currentTarget.style.background = '#EDE9FF')}
      onMouseLeave={ev => (ev.currentTarget.style.background = '')}
    >{value || placeholder}</span>
  )
}

// ─── Expandable settings ──────────────────────────────────────────────────────
function OptionalSettings({ sub, onChange }: { sub: Subject; onChange: (patch: Partial<Subject>) => void }) {
  return (
    <div style={{ display: 'flex', gap: 12, padding: '7px 12px', background: '#FAFAFE', borderTop: '1px solid #EEE9FF', flexWrap: 'wrap', alignItems: 'flex-end' }}>
      <label style={{ display: 'flex', flexDirection: 'column', gap: 3, fontSize: 10.5, color: '#6B6891', fontWeight: 600 }}>
        Category
        <select value={sub.category ?? 'Compulsory'} onChange={e => onChange({ category: e.target.value })} style={inp}>
          {CATS.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
      </label>
      <label style={{ display: 'flex', flexDirection: 'column', gap: 3, fontSize: 10.5, color: '#6B6891', fontWeight: 600 }}>
        Session (min)
        <input type="number" value={sub.sessionDuration} min={10} max={180} step={5}
          onChange={e => onChange({ sessionDuration: +e.target.value })}
          style={{ ...inp, width: 56 }}
        />
      </label>
      <label style={{ display: 'flex', flexDirection: 'column', gap: 3, fontSize: 10.5, color: '#6B6891', fontWeight: 600 }}>
        Max/day
        <input type="number" value={sub.maxPeriodsPerDay} min={1} max={8}
          onChange={e => onChange({ maxPeriodsPerDay: +e.target.value })}
          style={{ ...inp, width: 46 }}
        />
      </label>
      <label style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: '#555', fontWeight: 600, cursor: 'pointer', paddingBottom: 2 }}>
        <input type="checkbox" checked={!!sub.requiresLab} onChange={e => onChange({ requiresLab: e.target.checked })} style={{ accentColor: P }} />
        Lab required
      </label>
      <label style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: '#555', fontWeight: 600, cursor: 'pointer', paddingBottom: 2 }}>
        <input type="checkbox" checked={!!sub.isOptional} onChange={e => onChange({ isOptional: e.target.checked })} style={{ accentColor: P }} />
        Optional
      </label>
    </div>
  )
}

// ─── Add row ──────────────────────────────────────────────────────────────────
function AddRow({ onAdd }: { onAdd: (s: Subject) => void }) {
  const [active, setActive] = useState(false)
  const [name, setName]     = useState('')
  const [ppw, setPpw]       = useState(5)
  const ref = useRef<HTMLInputElement>(null)
  useEffect(() => { if (active) ref.current?.focus() }, [active])

  function commit() {
    if (!name.trim()) { setActive(false); return }
    onAdd({
      id: makeId(), name: name.trim(),
      shortName: generateShortName(name.trim()),
      category: 'Compulsory', periodsPerWeek: ppw,
      sessionDuration: 45, maxPeriodsPerDay: 2,
      color: P, isOptional: false, requiresLab: false,
      sections: [], classConfigs: [],
    } as unknown as Subject)
    setName(''); setPpw(5); setActive(false)
  }

  if (!active) return (
    <tr>
      <td colSpan={5} style={{ ...TD, padding: '7px 8px' }}>
        <button onClick={() => setActive(true)}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 4, background: 'none', border: '1px dashed #C8C2F0', borderRadius: 5, color: P, fontSize: 11.5, fontWeight: 600, padding: '3px 10px', cursor: 'pointer' }}>
          <Plus size={11} /> Add Subject
        </button>
      </td>
    </tr>
  )

  return (
    <tr style={{ background: '#FAFAFE' }}>
      <td style={TD}>
        <input ref={ref} value={name} onChange={e => setName(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') setActive(false) }}
          placeholder="Subject name" style={{ ...inp, width: '100%', boxSizing: 'border-box' }}
        />
      </td>
      <td style={TD}>
        <span style={{ fontSize: 10.5, color: P_D, fontWeight: 700, background: P_L, padding: '1px 5px', borderRadius: 3 }}>
          {name.trim() ? generateShortName(name.trim()) : '—'}
        </span>
      </td>
      <td style={{ ...TD, textAlign: 'center' }}>
        <input type="number" value={ppw} onChange={e => setPpw(+e.target.value)} min={0} max={30}
          style={{ ...inp, width: 40, textAlign: 'center', fontWeight: 700, color: P }} />
      </td>
      <td style={TD}>
        <span style={{ fontSize: 10.5, color: '#C4C0DC', fontStyle: 'italic' }}>Assign after saving</span>
      </td>
      <td style={{ ...TD, whiteSpace: 'nowrap' }}>
        <button onClick={commit} style={{ background: P, color: '#fff', border: 'none', borderRadius: 5, padding: '4px 10px', fontSize: 12, fontWeight: 700, cursor: 'pointer', marginRight: 3 }}>✓</button>
        <button onClick={() => setActive(false)} style={{ background: '#F0F0F0', color: '#888', border: 'none', borderRadius: 5, padding: '4px 8px', fontSize: 12, cursor: 'pointer' }}>✗</button>
      </td>
    </tr>
  )
}

// ─── Subject row ──────────────────────────────────────────────────────────────
function SubjectRow({ sub, classOptions, sections, board, isAiAssigned, onUpdate, onDelete }: {
  sub:          Subject
  classOptions: ChipOption[]
  sections:     Section[]
  board:        CurriculumBoard
  isAiAssigned: boolean
  onUpdate:     (patch: Partial<Subject>) => void
  onDelete:     () => void
}) {
  const [expanded, setExpanded] = useState(false)
  const [hovered, setHovered]   = useState(false)
  const selected = sub.sections ?? []

  // AI suggestions for this row
  const aiSuggestion = useMemo(
    () => sections.length > 0 ? suggestClassesForSubject(sub.name, sections, board) : [],
    [sub.name, sections, board]
  )

  // Dominant grade group for slot hint
  const aiGradeGroup = useMemo<GradeGroup | undefined>(
    () => aiSuggestion.length > 0 ? dominantGradeGroup(aiSuggestion) : undefined,
    [aiSuggestion]
  )
  const aiSlot = aiGradeGroup ? suggestSlotsPerWeek(sub.name, aiGradeGroup, board) : undefined
  const fullHint = getSubjectHint(sub.name, board)
  const shortHint = aiGradeGroup ? getShortHint(sub.name, aiGradeGroup, board) : undefined

  return (
    <>
      <tr
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        style={{ background: hovered ? '#F6F4FF' : '', transition: 'background 0.07s' }}
      >
        {/* Name + AI badge */}
        <td style={TD}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ width: 7, height: 7, borderRadius: '50%', background: sub.color ?? P, flexShrink: 0, border: '1.5px solid rgba(0,0,0,0.08)' }} />
            <EditCell value={sub.name} onSave={v => onUpdate({ name: v })} placeholder="Subject name" width={150} />
            {/* Subtle AI-assigned badge */}
            {isAiAssigned && (
              <span
                title={fullHint}
                style={{ fontSize: 9, fontWeight: 800, color: P, background: P_L, border: `1px solid ${P_B}`, borderRadius: 3, padding: '0 4px 1px', lineHeight: '14px', whiteSpace: 'nowrap', cursor: 'help', flexShrink: 0 }}
              >⚡ AI</span>
            )}
          </div>
        </td>

        {/* Short */}
        <td style={TD}>
          <EditCell value={sub.shortName ?? ''} onSave={v => onUpdate({ shortName: v })} placeholder="Short" width={58} />
        </td>

        {/* p/w — with AI slot hint */}
        <td style={{ ...TD, textAlign: 'center' }}>
          <div style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'center', gap: 0 }}>
            <input
              type="number" value={sub.periodsPerWeek} min={0} max={30}
              onChange={e => onUpdate({ periodsPerWeek: +e.target.value })}
              title={aiSlot !== undefined ? `${board} recommends ${aiSlot} p/w for ${sub.name} at this level` : 'Periods per week'}
              style={{ width: 40, padding: '2px 3px', border: `1.5px solid ${isAiAssigned && aiSlot !== undefined && sub.periodsPerWeek === aiSlot ? P : '#C4BDFF'}`, borderRadius: 5, fontSize: 12.5, color: P_D, fontWeight: 800, outline: 'none', textAlign: 'center', background: P_L, fontFamily: 'inherit', cursor: 'text' }}
            />
            {/* Slot hint when hovered and AI suggests different value */}
            {hovered && aiSlot !== undefined && aiSlot !== sub.periodsPerWeek && (
              <span
                title={`${board} recommends ${aiSlot} p/w`}
                style={{ fontSize: 9, color: '#9B8EC4', whiteSpace: 'nowrap', cursor: 'help' }}
              >AI: {aiSlot}</span>
            )}
          </div>
        </td>

        {/* Applicable classes */}
        <td style={{ ...TD }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <InlineChipSelect
              selected={selected}
              options={classOptions}
              onChange={v => onUpdate({ sections: v })}
              placeholder="+ Assign Classes"
              maxChips={3}
            />
            {/* Per-row AI button — shown when hovered AND (no assignment OR AI suggests different) */}
            {hovered && aiSuggestion.length > 0 && (
              <button
                title={`${fullHint}\n\nClick to assign ${aiSuggestion.length} class${aiSuggestion.length !== 1 ? 'es' : ''}${aiSlot !== undefined ? ` · ${aiSlot} p/w` : ''}`}
                onClick={() => onUpdate({ sections: aiSuggestion, periodsPerWeek: aiSlot ?? sub.periodsPerWeek })}
                style={{ fontSize: 10, color: '#fff', background: P, border: 'none', borderRadius: 4, padding: '2px 8px', cursor: 'pointer', fontWeight: 700, flexShrink: 0, whiteSpace: 'nowrap' }}
                onMouseEnter={e => (e.currentTarget.style.background = P_D)}
                onMouseLeave={e => (e.currentTarget.style.background = P)}
              >
                ⚡ {shortHint ? `(${aiSuggestion.length})` : `AI (${aiSuggestion.length})`}
              </button>
            )}
          </div>
        </td>

        {/* Actions */}
        <td style={{ ...TD, textAlign: 'right', paddingRight: 6 }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 2 }}>
            {/* Settings expand */}
            <button
              onClick={() => setExpanded(o => !o)}
              title="Subject settings"
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 3,
                background: expanded ? P_L : 'transparent',
                border: `1px solid ${expanded ? P_B : 'transparent'}`,
                borderRadius: 5, padding: '3px 7px', cursor: 'pointer',
                color: expanded ? P : '#C4C0DC',
                fontSize: 10.5, fontWeight: 600, transition: 'all 0.1s', flexShrink: 0,
              }}
              onMouseEnter={e => { e.currentTarget.style.background = P_L; e.currentTarget.style.color = P; e.currentTarget.style.borderColor = P_B }}
              onMouseLeave={e => {
                e.currentTarget.style.background = expanded ? P_L : 'transparent'
                e.currentTarget.style.color = expanded ? P : '#C4C0DC'
                e.currentTarget.style.borderColor = expanded ? P_B : 'transparent'
              }}
            >
              <Settings size={11} />
              {expanded ? <ChevronDown size={10} /> : <ChevronRight size={10} />}
            </button>
            {/* Delete */}
            <button
              onClick={onDelete}
              title="Delete subject"
              style={{ background: 'transparent', border: '1px solid transparent', borderRadius: 5, padding: '3px 7px', cursor: 'pointer', color: '#C4BCDC', lineHeight: 1, transition: 'all 0.1s' }}
              onMouseEnter={e => { e.currentTarget.style.background = '#FFF0F0'; e.currentTarget.style.color = '#e74c3c'; e.currentTarget.style.borderColor = '#FFCDD2' }}
              onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#C4BCDC'; e.currentTarget.style.borderColor = 'transparent' }}
            >
              <Trash2 size={14} />
            </button>
          </div>
        </td>
      </tr>

      {expanded && (
        <tr>
          <td colSpan={5} style={{ padding: 0 }}>
            <OptionalSettings sub={sub} onChange={onUpdate} />
          </td>
        </tr>
      )}
    </>
  )
}

// ─── AI Snapshot type ─────────────────────────────────────────────────────────
interface SubjectSnapshot {
  id:             string
  sections:       string[]
  periodsPerWeek: number
}

// ─── Main export ──────────────────────────────────────────────────────────────
export function SubjectsPanel({ subjects, setSubjects, sections, board: boardProp }: {
  subjects:    Subject[]
  setSubjects: (s: Subject[]) => void
  sections:    Section[]
  board?:      string
}) {
  const [search,       setSearch]       = useState('')
  const [importOpen,   setImportOpen]   = useState(false)

  // Board state — initialize from prop, then localStorage, default CBSE
  const [board, setBoard] = useState<CurriculumBoard>(() => {
    const stored = localStorage.getItem('schedu-curriculum-board') as CurriculumBoard | null
    if (boardProp) return normalizeBoardType(boardProp)
    return stored && BOARD_ORDER.includes(stored) ? stored : 'CBSE'
  })

  // Undo: snapshot of {id → {sections, periodsPerWeek}} taken before last AI assign
  const [aiSnapshot, setAiSnapshot]     = useState<SubjectSnapshot[] | null>(null)
  // Track which subject IDs were last assigned by AI (for selective reset)
  const [aiAssignedIds, setAiAssignedIds] = useState<Set<string>>(new Set())

  // Sync board from parent prop changes
  useEffect(() => {
    if (boardProp) setBoard(normalizeBoardType(boardProp))
  }, [boardProp])

  // Persist board choice
  useEffect(() => {
    localStorage.setItem('schedu-curriculum-board', board)
  }, [board])

  const filtered = useMemo(() => {
    const q = search.toLowerCase()
    if (!q) return subjects
    return subjects.filter(s => s.name.toLowerCase().includes(q) || (s.category ?? '').toLowerCase().includes(q))
  }, [subjects, search])

  const classOptions = useMemo<ChipOption[]>(() => {
    const map = new Map<string, string[]>()
    sections.forEach(s => {
      const g = getGrade(s.name)
      if (!map.has(g)) map.set(g, [])
      map.get(g)!.push(s.name)
    })
    const sorted = [...map.entries()].sort((a, b) => gradeKey(a[0]) - gradeKey(b[0]))
    const opts: ChipOption[] = []
    sorted.forEach(([grade, names]) => names.forEach(n => opts.push({ value: n, label: n, group: `Grade ${grade}` })))
    return opts
  }, [sections])

  // ── Update helper — clears AI badge when user manually edits ─────────────────
  function update(id: string, patch: Partial<Subject>) {
    if ('sections' in patch && aiAssignedIds.has(id)) {
      setAiAssignedIds(prev => { const next = new Set(prev); next.delete(id); return next })
    }
    setSubjects(subjects.map(s => s.id === id ? { ...s, ...patch } : s))
  }

  function remove(id: string) { setSubjects(subjects.filter(s => s.id !== id)) }
  function add(s: Subject)    { setSubjects([...subjects, s]) }

  // ── AI Assign All ─────────────────────────────────────────────────────────────
  function aiAssignAll() {
    if (!sections.length) return
    // Take snapshot before modifying
    const snapshot: SubjectSnapshot[] = subjects.map(s => ({
      id: s.id, sections: s.sections ?? [], periodsPerWeek: s.periodsPerWeek,
    }))
    setAiSnapshot(snapshot)

    const newlyAssignedIds = new Set<string>()

    const updated = subjects.map(s => {
      // Don't override subjects that already have manual class assignments
      if ((s.sections ?? []).length > 0) return s

      const suggestedSections = suggestClassesForSubject(s.name, sections, board)
      if (suggestedSections.length === 0) return s

      // Recommend slots for the dominant grade group
      const grp   = dominantGradeGroup(suggestedSections)
      const slots = suggestSlotsPerWeek(s.name, grp, board)

      newlyAssignedIds.add(s.id)
      return {
        ...s,
        sections:       suggestedSections,
        periodsPerWeek: slots ?? s.periodsPerWeek,
        requiresLab:    CURRICULUM[s.name]?.requiresLab ?? s.requiresLab,
      }
    })

    setAiAssignedIds(newlyAssignedIds)
    setSubjects(updated)
  }

  // ── Undo last AI assign ───────────────────────────────────────────────────────
  function undoAI() {
    if (!aiSnapshot) return
    const byId = new Map(aiSnapshot.map(s => [s.id, s]))
    setSubjects(subjects.map(s => {
      const snap = byId.get(s.id)
      if (!snap) return s
      return { ...s, sections: snap.sections, periodsPerWeek: snap.periodsPerWeek }
    }))
    setAiSnapshot(null)
    setAiAssignedIds(new Set())
  }

  // ── Reset AI-assigned mappings ────────────────────────────────────────────────
  function resetAIAssignments() {
    if (aiAssignedIds.size === 0) return
    // Snapshot current state so undo works after reset
    const snapshot: SubjectSnapshot[] = subjects.map(s => ({
      id: s.id, sections: s.sections ?? [], periodsPerWeek: s.periodsPerWeek,
    }))
    setAiSnapshot(snapshot)
    setSubjects(subjects.map(s =>
      aiAssignedIds.has(s.id) ? { ...s, sections: [] } : s
    ))
    setAiAssignedIds(new Set())
  }

  // ── Paste import ──────────────────────────────────────────────────────────────
  function handlePasteImport(rows: string[][]) {
    const newSubjects = rows
      .map(cells => ({
        id: makeId(),
        name:           cells[0]?.trim() || '',
        shortName:      cells[1]?.trim() || generateShortName(cells[0]?.trim() || ''),
        category:       'Compulsory' as any,
        periodsPerWeek: parseInt(cells[2]) || 5,
        sessionDuration: 45, maxPeriodsPerDay: 2,
        color: P, isOptional: false, requiresLab: false,
        sections: [], classConfigs: [],
      } as unknown as Subject))
      .filter(s => s.name)
    if (newSubjects.length) setSubjects([...subjects, ...newSubjects])
  }

  const assignedCount   = useMemo(() => subjects.filter(s => (s.sections ?? []).length > 0).length, [subjects])
  const unassignedCount = subjects.length - assignedCount

  // ─────────────────────────────────────────────────────────────────────────────
  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>

      {/* ── Toolbar ─────────────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 7, paddingBottom: 7, flexShrink: 0, flexWrap: 'wrap' }}>

        {/* Left: title + stats */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 7, flexShrink: 0 }}>
          <BookOpen size={13} color={P} />
          <span style={{ fontSize: 12.5, fontWeight: 700, color: '#111028' }}>Subjects</span>
          <span style={{ fontSize: 10, color: P, background: P_L, borderRadius: 10, padding: '1px 7px 2px', fontWeight: 700, border: `1px solid ${P_B}` }}>
            {subjects.length}
          </span>
          {subjects.length > 0 && unassignedCount > 0 && (
            <span style={{ fontSize: 10, color: '#D97706', fontWeight: 700, background: '#FFFBEB', padding: '1px 6px 2px', borderRadius: 4, border: '1px solid #FDE68A' }}>
              {unassignedCount} unassigned
            </span>
          )}
        </div>

        <div style={{ width: 1, height: 14, background: '#EAE6FF', flexShrink: 0 }} />

        {/* Search */}
        <div style={{ position: 'relative', flex: 1, minWidth: 120 }}>
          <span style={{ position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)', color: '#C0BBD8', pointerEvents: 'none', fontSize: 12 }}>⌕</span>
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search subjects…"
            style={{ width: '100%', padding: '4px 8px 4px 24px', border: '1px solid #E4E0FF', borderRadius: 5, fontSize: 12, color: '#111028', outline: 'none', boxSizing: 'border-box', background: '#FAFAFE', fontFamily: 'inherit' }}
          />
        </div>

        {/* Board selector */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
          <span style={{ fontSize: 9.5, color: '#9896B5', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', whiteSpace: 'nowrap' }}>Board</span>
          <select
            value={board}
            onChange={e => setBoard(e.target.value as CurriculumBoard)}
            style={{ border: `1.5px solid ${P_B}`, borderRadius: 6, padding: '3px 7px', fontSize: 11, color: P_D, background: P_L, outline: 'none', fontFamily: 'inherit', fontWeight: 700, cursor: 'pointer' }}
            title="Select curriculum board — affects AI class mapping and slot recommendations"
          >
            {BOARD_ORDER.map(b => <option key={b} value={b}>{b}</option>)}
          </select>
        </div>

        {/* Actions */}
        <div style={{ display: 'flex', gap: 5, flexShrink: 0, alignItems: 'center' }}>

          {/* Import */}
          <button
            onClick={() => setImportOpen(true)}
            style={outlineBtn()}
            onMouseEnter={e => { e.currentTarget.style.background = P_L; e.currentTarget.style.borderColor = P_B; e.currentTarget.style.color = P_D }}
            onMouseLeave={e => { e.currentTarget.style.background = '#fff'; e.currentTarget.style.borderColor = '#DDD8FF'; e.currentTarget.style.color = '#6B6891' }}
          >
            ⬆ Import
          </button>

          {/* Undo AI — only visible after AI assign */}
          {aiSnapshot && (
            <button
              onClick={undoAI}
              title="Undo last AI assignment — restores previous class assignments and slots/week"
              style={{ display: 'inline-flex', alignItems: 'center', gap: 4, background: '#FFFBEB', color: '#92400E', border: '1px solid #FDE68A', borderRadius: 5, padding: '4px 9px', fontSize: 11, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', flexShrink: 0, whiteSpace: 'nowrap' }}
              onMouseEnter={e => { e.currentTarget.style.background = '#FEF3C7' }}
              onMouseLeave={e => { e.currentTarget.style.background = '#FFFBEB' }}
            >
              ↩ Undo AI
            </button>
          )}

          {/* Reset AI — only when AI-assigned subjects exist */}
          {aiAssignedIds.size > 0 && (
            <button
              onClick={resetAIAssignments}
              title={`Remove AI-generated assignments from ${aiAssignedIds.size} subject${aiAssignedIds.size !== 1 ? 's' : ''}`}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 4, background: '#FFF5F5', color: '#C53030', border: '1px solid #FFCDD2', borderRadius: 5, padding: '4px 9px', fontSize: 11, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', flexShrink: 0, whiteSpace: 'nowrap' }}
              onMouseEnter={e => { e.currentTarget.style.background = '#FED7D7' }}
              onMouseLeave={e => { e.currentTarget.style.background = '#FFF5F5' }}
            >
              ✕ Reset AI ({aiAssignedIds.size})
            </button>
          )}

          {/* AI Assign All */}
          {sections.length > 0 && (
            <button
              onClick={aiAssignAll}
              title={`Auto-assign ${unassignedCount} unassigned subject${unassignedCount !== 1 ? 's' : ''} to relevant classes with ${board}-standard slot counts`}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 5, background: P, color: '#fff', border: 'none', borderRadius: 6, padding: '5px 12px', fontSize: 11.5, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', boxShadow: '0 2px 6px rgba(124,111,224,0.28)', whiteSpace: 'nowrap', flexShrink: 0 }}
              onMouseEnter={e => (e.currentTarget.style.background = P_D)}
              onMouseLeave={e => (e.currentTarget.style.background = P)}
            >
              ⚡ AI Assign ({board})
            </button>
          )}
        </div>
      </div>

      {/* Classes hint */}
      {sections.length === 0 && (
        <div style={{ margin: '0 0 6px', padding: '5px 10px', background: '#FFFBF0', border: '1px solid #FFE8A0', borderRadius: 5, fontSize: 11, color: '#7A5800' }}>
          💡 Add classes first — AI will automatically assign subjects to the right grade levels based on {BOARD_LABELS[board]} curriculum.
        </div>
      )}

      {/* Table */}
      <div style={TABLE_CARD}>
        {subjects.length === 0 && !search ? (
          <div style={{ textAlign: 'center', padding: '40px 0' }}>
            <div style={{ fontSize: 28, marginBottom: 6 }}>📖</div>
            <div style={{ fontSize: 12.5, fontWeight: 700, color: '#9896B5', marginBottom: 3 }}>No subjects yet</div>
            <div style={{ fontSize: 11.5, color: '#C4C0DC' }}>Add subjects, then use ⚡ AI Assign to auto-fill class mappings.</div>
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={TH}>Subject</th>
                <th style={{ ...TH, width: 80 }}>Short</th>
                <th style={{ ...TH, width: 48, textAlign: 'center' }}>p/w</th>
                <th style={{ ...TH, minWidth: 180 }}>Applicable Classes</th>
                <th style={{ ...TH, width: 80 }} />
              </tr>
            </thead>
            <tbody>
              {filtered.map(sub => (
                <SubjectRow
                  key={sub.id}
                  sub={sub}
                  classOptions={classOptions}
                  sections={sections}
                  board={board}
                  isAiAssigned={aiAssignedIds.has(sub.id)}
                  onUpdate={patch => update(sub.id, patch)}
                  onDelete={() => remove(sub.id)}
                />
              ))}
              {filtered.length === 0 && search && (
                <tr><td colSpan={5} style={{ ...TD, textAlign: 'center', color: '#C4C0DC', padding: '16px 10px' }}>No subjects match "{search}"</td></tr>
              )}
              <AddRow onAdd={add} />
            </tbody>
          </table>
        )}
      </div>

      {/* Import Modal */}
      {importOpen && (
        <ImportModal
          title="Subjects"
          sampleHeaders={['Subject Name', 'Short (optional)', 'Periods/Week']}
          sampleRows={[
            ['Mathematics',      'MATH', '6'],
            ['English',          'ENG',  '5'],
            ['Physics',          'PHY',  '5'],
            ['Chemistry',        'CHEM', '5'],
            ['Computer Science', 'CS',   '4'],
          ]}
          onImport={handlePasteImport}
          onClose={() => setImportOpen(false)}
        />
      )}
    </div>
  )
}
