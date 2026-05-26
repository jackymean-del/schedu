/**
 * SubjectsPanel — Tab 2.  Curriculum-aware AI edition.
 *
 * Architecture (correct academic model):
 *   Subject + Class Mapping → slots/week
 *   Mathematics → I-A: 5, I-B: 5, X-A: 7
 *
 * Main table: Subject | Short | Applicable Classes | Actions
 * Expanded:   Class | Slots/Week (per-class, editable)
 *
 * Data model: Subject.classConfigs[].sectionName + periodsPerWeek
 * Fallback:   Subject.periodsPerWeek as default for any class
 *
 * Features:
 * - Board selector  (CBSE / ICSE / IB / Cambridge / Custom)
 * - Load Unit selector (Slots/Wk · Hours/Wk · etc.) — applies to expanded per-class view
 * - Global AI Assign — delegates to parent engine (all 4 resource types)
 * - Undo AI — snapshot-based rollback
 * - All chips shown (no truncation)
 */

import { useState, useRef, useMemo, useEffect, useCallback } from 'react'
import type { Subject, Section, SubjectClassConfig } from '@/types'
import { Plus, BookOpen, ChevronDown, ChevronUp } from 'lucide-react'
import {
  P, P_D, P_L, P_B,
  TH, TD, TABLE_CARD,
  InlineChipSelect, ImportModal,
  DeleteActionButton, actionBtn, outlineBtn,
  type AllocationUnit, ALLOCATION_LABELS, ALLOCATION_SHORT,
  toDisplayValue, toEditableHours, fromDisplayValue,
  ResourceGlobalStyles, useUndoHistory,
} from './shared'
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
  gradeKey,
} from './curriculum'

// Re-export for step-resources-v2.tsx
export { generateShortName, suggestClassesForSubject } from './curriculum'

function makeId() { return Math.random().toString(36).slice(2, 9) }

const BOARD_ORDER: CurriculumBoard[] = ['CBSE','ICSE','IB','Cambridge','Custom']
const UNIT_ORDER:  AllocationUnit[]  = ['slots_week','hours_week','slots_month','hours_month','daily_slots']

const inp: React.CSSProperties = {
  padding: '3px 8px', border: '1px solid #E4E0FF', borderRadius: 4,
  fontSize: 12, color: '#111028', outline: 'none', fontFamily: 'inherit', background: '#FAFAFE',
  boxSizing: 'border-box' as const,
}

// ─── Helpers for classConfigs ─────────────────────────────────────────────────

/** Get effective slots/week for a class (per-class override or subject default) */
function getClassSlots(sub: Subject, className: string): number {
  const cfg = (sub.classConfigs ?? []).find(c => c.sectionName === className)
  return cfg?.periodsPerWeek ?? sub.periodsPerWeek
}

/** Get sorted list of assigned class names from classConfigs + sections fallback */
function getAssignedClasses(sub: Subject): string[] {
  const fromConfigs = (sub.classConfigs ?? []).map(c => c.sectionName).filter(Boolean) as string[]
  if (fromConfigs.length > 0) return fromConfigs
  return sub.sections ?? []
}

/** Build updated classConfigs when classes change */
function buildClassConfigs(
  sub: Subject,
  newClasses: string[],
  defaultSlots: number,
): SubjectClassConfig[] {
  return newClasses.map(name => {
    const existing = (sub.classConfigs ?? []).find(c => c.sectionName === name)
    return {
      sectionName:      name,
      periodsPerWeek:   existing?.periodsPerWeek ?? defaultSlots,
      maxPeriodsPerDay: existing?.maxPeriodsPerDay ?? sub.maxPeriodsPerDay ?? 2,
      sessionDuration:  existing?.sessionDuration ?? sub.sessionDuration ?? 45,
    }
  })
}

// ─── Inline edit cell ─────────────────────────────────────────────────────────
function EditCell({ value, onSave, placeholder = '…', style: extra }: {
  value: string; onSave: (v: string) => void
  placeholder?: string; style?: React.CSSProperties
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
      style={{ ...inp, ...extra }}
    />
  )
  return (
    <span onClick={() => setE(true)} title="Click to edit"
      style={{ cursor: 'text', padding: '2px 4px', borderRadius: 3, display: 'inline-block', minWidth: 28, color: value ? '#111028' : '#C4C0DC', ...extra }}
      onMouseEnter={ev => (ev.currentTarget.style.background = '#EDE9FF')}
      onMouseLeave={ev => (ev.currentTarget.style.background = '')}
    >{value || placeholder}</span>
  )
}

// ─── Single grade row in the expanded slots table ────────────────────────────
/**
 * Extracted to a real component so it can hold local state (focus/edit mode for hours units).
 * Hours units: display shows "45 min" / "1hr 30min"; on focus, switches to editable decimal hours.
 * Non-hours units: plain number input.
 */
function GradeSlotRow({
  grade, sections, sub, unit, sessionMins, onUpdateGradeSlots, onRemoveGrade,
}: {
  grade:              string
  sections:           string[]
  sub:                Subject
  unit:               AllocationUnit
  sessionMins:        number
  onUpdateGradeSlots: (classNames: string[], periodsPerWeek: number) => void
  onRemoveGrade:      (classNames: string[]) => void
}) {
  const [editFocused, setEditFocused] = useState(false)
  const [editText,    setEditText]    = useState('')
  const isHours = unit === 'hours_week' || unit === 'hours_month'

  const slots      = getClassSlots(sub, sections[0])
  const displayVal = toDisplayValue(slots, unit, sessionMins)           // "45 min" | number
  const editableHr = toEditableHours(slots, unit, sessionMins)          // 0.75 for hours edit

  // Value shown in the input element
  const inputValue = isHours
    ? (editFocused ? editText : String(displayVal))
    : (displayVal as number)

  function handleFocus() {
    if (!isHours) return
    setEditFocused(true)
    setEditText(String(editableHr))
  }

  function handleBlur() {
    if (!isHours) return
    const parsed = parseFloat(editText)
    if (!isNaN(parsed) && parsed > 0) {
      const newSlots = fromDisplayValue(parsed, unit, sessionMins)
      if (newSlots >= 1) onUpdateGradeSlots(sections, newSlots)
    }
    setEditFocused(false)
  }

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    if (isHours) {
      setEditText(e.target.value)
    } else {
      const newSlots = fromDisplayValue(+e.target.value, unit, sessionMins)
      if (newSlots >= 1) onUpdateGradeSlots(sections, newSlots)
    }
  }

  return (
    <tr
      style={{ transition: 'background 0.06s' }}
      onMouseEnter={e => (e.currentTarget.style.background = '#F0EDFF')}
      onMouseLeave={e => (e.currentTarget.style.background = '')}
    >
      {/* Grade label */}
      <td style={{ padding: '3px 8px' }}>
        <span
          style={{ background: '#E8E3FF', color: '#3D35A8', borderRadius: 4, padding: '1px 7px', fontSize: 11, fontWeight: 700, border: '1px solid rgba(100,85,210,0.3)', cursor: 'default' }}
          title={sections.length > 1 ? `Applies to: ${sections.join(', ')}` : sections[0]}
        >
          {grade}
          {sections.length > 1 && (
            <span style={{ fontSize: 9, fontWeight: 600, color: '#6B5FC8', marginLeft: 3, opacity: 0.8 }}>×{sections.length}</span>
          )}
        </span>
      </td>

      {/* Slots / time input */}
      <td style={{ padding: '3px 8px' }}>
        <input
          type={isHours ? 'text' : 'number'}
          inputMode={isHours ? 'decimal' : 'numeric'}
          value={inputValue}
          min={isHours ? undefined : 1}
          max={isHours ? undefined : 200}
          step={isHours ? undefined : 1}
          className="rp-inp rp-num"
          onChange={handleChange}
          onFocus={handleFocus}
          onBlur={handleBlur}
          onKeyDown={e => {
            if (e.key === 'ArrowUp' || e.key === 'ArrowDown') e.preventDefault()
            e.stopPropagation()
            if (isHours && e.key === 'Enter') e.currentTarget.blur()
          }}
          style={{
            width: '100%', padding: '3px 6px',
            border: '1.5px solid #C4BDFF', borderRadius: 5,
            fontSize: 12.5, color: P_D, fontWeight: 800,
            outline: 'none', textAlign: 'center', background: P_L,
            fontFamily: 'inherit', boxSizing: 'border-box' as const,
          }}
        />
      </td>

      {/* Remove grade */}
      <td style={{ padding: '3px 4px', textAlign: 'center' }}>
        <button
          onClick={() => onRemoveGrade(sections)}
          title={`Remove Grade ${grade}`}
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#D4CFEC', padding: '1px 2px', lineHeight: 1, fontSize: 14 }}
          onMouseEnter={e => (e.currentTarget.style.color = '#E11D48')}
          onMouseLeave={e => (e.currentTarget.style.color = '#D4CFEC')}
        >×</button>
      </td>
    </tr>
  )
}

// ─── Expanded grade-level slots view ─────────────────────────────────────────
function ClassSlotsExpanded({ sub, unit, sessionMins, onUpdateGradeSlots, onRemoveGrade }: {
  sub: Subject
  unit: AllocationUnit
  sessionMins: number
  onUpdateGradeSlots: (classNames: string[], periodsPerWeek: number) => void
  onRemoveGrade: (classNames: string[]) => void
}) {
  const classes = getAssignedClasses(sub)

  if (classes.length === 0) {
    return (
      <div style={{ padding: '8px 16px', background: '#FAFAFE', borderTop: '1px solid #EEE9FF', fontSize: 11.5, color: '#C4C0DC', fontStyle: 'italic' }}>
        No classes assigned — use the Applicable Classes column above to assign.
      </div>
    )
  }

  const gradeMap = new Map<string, string[]>()
  for (const cls of classes) {
    const grade = getGrade(cls)
    if (!gradeMap.has(grade)) gradeMap.set(grade, [])
    gradeMap.get(grade)!.push(cls)
  }
  const sortedGrades = [...gradeMap.keys()].sort((a, b) => gradeKey(a) - gradeKey(b))

  return (
    <div style={{ background: '#FAFAFE', borderTop: '1px solid #EEE9FF', padding: '7px 16px 10px' }}>
      <div style={{ fontSize: 9.5, fontWeight: 800, color: '#9896B5', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 6 }}>
        Slots per Grade
        <span style={{ fontWeight: 500, textTransform: 'none', marginLeft: 6, fontSize: 9.5, color: '#C4C0DC' }}>
          · {ALLOCATION_LABELS[unit]}
        </span>
      </div>
      <table style={{ borderCollapse: 'collapse', tableLayout: 'fixed', maxWidth: 360 }}>
        <colgroup>
          <col style={{ width: 120 }} />
          <col style={{ width: 148 }} />
          <col style={{ width: 28 }} />
        </colgroup>
        <thead>
          <tr>
            <th style={{ padding: '2px 8px', fontSize: 9.5, fontWeight: 700, color: '#9896B5', textAlign: 'left', textTransform: 'uppercase', letterSpacing: '0.06em', borderBottom: '1px solid #E4E0FF' }}>Grade</th>
            <th style={{ padding: '2px 8px', fontSize: 9.5, fontWeight: 700, color: '#9896B5', textAlign: 'center', textTransform: 'uppercase', letterSpacing: '0.06em', borderBottom: '1px solid #E4E0FF' }}>{ALLOCATION_SHORT[unit]}</th>
            <th style={{ borderBottom: '1px solid #E4E0FF' }} />
          </tr>
        </thead>
        <tbody>
          {sortedGrades.map(grade => (
            <GradeSlotRow
              key={grade}
              grade={grade}
              sections={gradeMap.get(grade)!}
              sub={sub}
              unit={unit}
              sessionMins={sessionMins}
              onUpdateGradeSlots={onUpdateGradeSlots}
              onRemoveGrade={onRemoveGrade}
            />
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ─── Expandable extra settings ─────────────────────────────────────────────────
function OptionalSettings({ sub, onChange }: { sub: Subject; onChange: (patch: Partial<Subject>) => void }) {
  const CATS = ['Compulsory','Language','4th Optional','5th Optional','6th Optional','Practical','Activity','EST','CCA','Skill']
  return (
    <div style={{ display: 'flex', gap: 14, padding: '8px 16px 10px', background: '#F7F5FF', borderTop: '1px solid #EEE9FF', flexWrap: 'wrap', alignItems: 'flex-end' }}>
      <label style={{ display: 'flex', flexDirection: 'column', gap: 3, fontSize: 10.5, color: '#6B6891', fontWeight: 600 }}>
        Category
        <select value={sub.category ?? 'Compulsory'} onChange={e => onChange({ category: e.target.value })} style={inp}>
          {CATS.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
      </label>
      <label style={{ display: 'flex', flexDirection: 'column', gap: 3, fontSize: 10.5, color: '#6B6891', fontWeight: 600 }}>
        Max / day
        <input type="number" value={sub.maxPeriodsPerDay} min={1} max={8}
          onChange={e => onChange({ maxPeriodsPerDay: +e.target.value })}
          style={{ ...inp, width: 48 }}
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
  const ref = useRef<HTMLInputElement>(null)
  useEffect(() => { if (active) ref.current?.focus() }, [active])

  function commit() {
    if (!name.trim()) { setActive(false); return }
    onAdd({
      id: makeId(), name: name.trim(),
      shortName: generateShortName(name.trim()),
      category: 'Compulsory', periodsPerWeek: 5,
      sessionDuration: 45, maxPeriodsPerDay: 2,
      color: P, isOptional: false, requiresLab: false,
      sections: [], classConfigs: [],
    } as unknown as Subject)
    setName(''); setActive(false)
  }

  if (!active) return (
    <tr>
      <td colSpan={4} style={{ ...TD, padding: '8px 10px' }}>
        <button onClick={() => setActive(true)}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 5, background: 'none', border: '1px dashed #C8C2F0', borderRadius: 5, color: P, fontSize: 11.5, fontWeight: 600, padding: '4px 12px', cursor: 'pointer', fontFamily: 'inherit' }}>
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
          placeholder="Subject name" style={{ ...inp, width: '100%' }}
        />
      </td>
      <td style={TD}>
        <span style={{ fontSize: 11, color: P_D, fontWeight: 700, background: P_L, padding: '1px 5px', borderRadius: 3 }}>
          {name.trim() ? generateShortName(name.trim()) : '—'}
        </span>
      </td>
      <td style={TD}>
        <span style={{ fontSize: 10.5, color: '#C4C0DC', fontStyle: 'italic' }}>Assign after saving</span>
      </td>
      <td style={{ ...TD, whiteSpace: 'nowrap' }}>
        <button onClick={commit} style={{ background: P, color: '#fff', border: 'none', borderRadius: 5, padding: '5px 12px', fontSize: 12, fontWeight: 700, cursor: 'pointer', marginRight: 5, fontFamily: 'inherit' }}>✓ Add</button>
        <button onClick={() => setActive(false)} style={{ background: '#F0F0F0', color: '#888', border: 'none', borderRadius: 5, padding: '5px 10px', fontSize: 12, cursor: 'pointer', fontFamily: 'inherit' }}>✗</button>
      </td>
    </tr>
  )
}

// ─── Subject row ──────────────────────────────────────────────────────────────
function SubjectRow({ sub, classOptions, sections, board, isAiAssigned, unit, sessionMins, onUpdate, onDelete }: {
  sub:          Subject
  classOptions: ChipOption[]
  sections:     Section[]
  board:        CurriculumBoard
  isAiAssigned: boolean
  unit:         AllocationUnit
  sessionMins:  number
  onUpdate:     (patch: Partial<Subject>) => void
  onDelete:     () => void
}) {
  const [expandSlots,    setExpandSlots]    = useState(false)
  const [expandSettings, setExpandSettings] = useState(false)

  const assignedClasses = getAssignedClasses(sub)

  const aiSuggestion = useMemo(
    () => sections.length > 0 ? suggestClassesForSubject(sub.name, sections, board) : [],
    [sub.name, sections, board]
  )
  const aiGradeGroup = useMemo<GradeGroup | undefined>(
    () => aiSuggestion.length > 0 ? dominantGradeGroup(aiSuggestion) : undefined,
    [aiSuggestion]
  )
  const aiSlot    = aiGradeGroup ? suggestSlotsPerWeek(sub.name, aiGradeGroup, board) : undefined
  const fullHint  = getSubjectHint(sub.name, board)
  const shortHint = aiGradeGroup ? getShortHint(sub.name, aiGradeGroup, board) : undefined

  // When user changes classes via chip selector
  function handleClassChange(newClasses: string[]) {
    const defaultSlots = aiSlot ?? sub.periodsPerWeek ?? 5
    const newConfigs = buildClassConfigs(sub, newClasses, defaultSlots)
    onUpdate({
      sections:     newClasses,
      classConfigs: newConfigs,
    })
  }

  // Atomically update slots for ALL sections of a grade — always syncs sections too
  function handleUpdateGradeSlots(classNames: string[], periodsPerWeek: number) {
    const classSet    = new Set(classNames)
    // CRITICAL: build from ALL currently assigned classes (sections OR classConfigs).
    // When classes come from `sections` array (chip selector, AI assign), classConfigs may be [],
    // so iterating only classConfigs would silently drop all other grades.
    const allAssigned = getAssignedClasses(sub)
    const existingMap = new Map((sub.classConfigs ?? []).map(c => [c.sectionName!, c]))

    const updated: SubjectClassConfig[] = allAssigned.map(name => {
      const ex = existingMap.get(name)
      return {
        sectionName:      name,
        periodsPerWeek:   classSet.has(name) ? periodsPerWeek : (ex?.periodsPerWeek ?? sub.periodsPerWeek),
        maxPeriodsPerDay: ex?.maxPeriodsPerDay ?? sub.maxPeriodsPerDay ?? 2,
        sessionDuration:  ex?.sessionDuration  ?? sub.sessionDuration  ?? 45,
      }
    })
    // Also add any classNames not yet in allAssigned (shouldn't normally happen, but guard)
    for (const name of classNames) {
      if (!updated.some(c => c.sectionName === name)) {
        updated.push({ sectionName: name, periodsPerWeek, maxPeriodsPerDay: sub.maxPeriodsPerDay ?? 2, sessionDuration: sub.sessionDuration ?? 45 })
      }
    }
    const newSections = updated.map(c => c.sectionName!).filter(Boolean)
    onUpdate({ classConfigs: updated, sections: newSections })
  }

  // Atomically remove all sections of a grade
  function handleRemoveGrade(classNames: string[]) {
    const classSet    = new Set(classNames)
    // Same pattern: start from ALL assigned classes, not just classConfigs
    const allAssigned = getAssignedClasses(sub)
    const existingMap = new Map((sub.classConfigs ?? []).map(c => [c.sectionName!, c]))
    const newConfigs: SubjectClassConfig[] = allAssigned
      .filter(name => !classSet.has(name))
      .map(name => {
        const ex = existingMap.get(name)
        return {
          sectionName:      name,
          periodsPerWeek:   ex?.periodsPerWeek   ?? sub.periodsPerWeek,
          maxPeriodsPerDay: ex?.maxPeriodsPerDay ?? sub.maxPeriodsPerDay ?? 2,
          sessionDuration:  ex?.sessionDuration  ?? sub.sessionDuration  ?? 45,
        }
      })
    const newSections = newConfigs.map(c => c.sectionName!).filter(Boolean)
    onUpdate({ sections: newSections, classConfigs: newConfigs })
  }

  const isExpanded = expandSlots || expandSettings

  return (
    <>
      <tr
        style={{ transition: 'background 0.07s', verticalAlign: 'middle' }}
        onMouseEnter={e => (e.currentTarget.style.background = '#F6F4FF')}
        onMouseLeave={e => (e.currentTarget.style.background = '')}
      >
        {/* Name + AI badge */}
        <td style={TD}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ width: 7, height: 7, borderRadius: '50%', background: sub.color ?? P, flexShrink: 0, border: '1.5px solid rgba(0,0,0,0.08)' }} />
            <EditCell value={sub.name} onSave={v => onUpdate({ name: v })} placeholder="Subject name"
              style={{ fontSize: 12.5, fontWeight: 600 }} />
            {isAiAssigned && (
              <span title={fullHint}
                style={{ fontSize: 9, fontWeight: 800, color: P, background: P_L, border: `1px solid ${P_B}`, borderRadius: 3, padding: '0 4px 1px', lineHeight: '14px', whiteSpace: 'nowrap', cursor: 'help', flexShrink: 0 }}
              >⚡ AI</span>
            )}
          </div>
        </td>

        {/* Short */}
        <td style={TD}>
          <EditCell value={sub.shortName ?? ''} onSave={v => onUpdate({ shortName: v })} placeholder="Short"
            style={{ fontSize: 12, fontWeight: 700, color: P_D }} />
        </td>

        {/* Applicable Classes — ALL chips, no truncation, + AI suggestion */}
        <td style={{ ...TD, paddingTop: 5, paddingBottom: 5 }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 6, flexWrap: 'wrap' }}>
            <InlineChipSelect
              selected={assignedClasses}
              options={classOptions}
              onChange={handleClassChange}
              placeholder="+ Assign Classes"
              maxChips={4}
            />
            {aiSuggestion.length > 0 && (
              <button
                title={`${fullHint}\n\nClick to assign ${aiSuggestion.length} class${aiSuggestion.length !== 1 ? 'es' : ''}${aiSlot !== undefined ? ` · ${aiSlot} slots/wk` : ''}`}
                onClick={() => {
                  const defaultSlots = aiSlot ?? sub.periodsPerWeek ?? 5
                  const newConfigs = buildClassConfigs(sub, aiSuggestion, defaultSlots)
                  onUpdate({
                    sections: aiSuggestion,
                    classConfigs: newConfigs,
                    periodsPerWeek: aiSlot ?? sub.periodsPerWeek,
                    requiresLab: CURRICULUM[sub.name]?.requiresLab ?? sub.requiresLab,
                  })
                }}
                style={{ fontSize: 10, color: '#fff', background: P, border: 'none', borderRadius: 4, padding: '2px 8px', cursor: 'pointer', fontWeight: 700, flexShrink: 0, whiteSpace: 'nowrap', fontFamily: 'inherit' }}
                onMouseEnter={e => (e.currentTarget.style.background = P_D)}
                onMouseLeave={e => (e.currentTarget.style.background = P)}
              >
                ⚡ {shortHint ? `(${aiSuggestion.length})` : `AI (${aiSuggestion.length})`}
              </button>
            )}
          </div>
        </td>

        {/* Actions */}
        <td style={{ ...TD, whiteSpace: 'nowrap' }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
            <button
              onClick={() => { setExpandSlots(o => !o); setExpandSettings(false) }}
              style={{
                ...actionBtn,
                gap: 5,
                ...(expandSlots ? { background: P_L, color: P_D, borderColor: P_B } : {}),
              }}
              onMouseEnter={e => { e.currentTarget.style.background = P_L; e.currentTarget.style.color = P_D; e.currentTarget.style.borderColor = P_B }}
              onMouseLeave={e => {
                e.currentTarget.style.background = expandSlots ? P_L : 'transparent'
                e.currentTarget.style.color = expandSlots ? P_D : '#8886A8'
                e.currentTarget.style.borderColor = expandSlots ? P_B : '#DDD8FF'
              }}
            >
              {expandSlots ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
              {expandSlots ? 'Show Less' : 'Show More'}
            </button>
            <DeleteActionButton onDelete={onDelete} tooltip="Delete subject" />
          </div>
        </td>
      </tr>

      {/* Expanded: per-class slots */}
      {expandSlots && (
        <tr>
          <td colSpan={4} style={{ padding: 0 }}>
            <ClassSlotsExpanded
              sub={sub}
              unit={unit}
              sessionMins={sessionMins}
              onUpdateGradeSlots={handleUpdateGradeSlots}
              onRemoveGrade={handleRemoveGrade}
            />
            <OptionalSettings sub={sub} onChange={onUpdate} />
          </td>
        </tr>
      )}
    </>
  )
}

// ─── Local AI Snapshot (subject-only fallback) ─────────────────────────────────
interface SubjectSnapshot {
  id:             string
  sections:       string[]
  classConfigs:   SubjectClassConfig[]
  periodsPerWeek: number
}

// ─── Main export ──────────────────────────────────────────────────────────────
export function SubjectsPanel({
  subjects, setSubjects, sections, board: boardProp,
  onGlobalAIAssign,
  globalAILoading = false,
  globalAIStatus  = '',
  globalAIHasSnapshot = false,
  onGlobalAIUndo,
}: {
  subjects:    Subject[]
  setSubjects: (s: Subject[]) => void
  sections:    Section[]
  board?:      string
  onGlobalAIAssign?:    (board: CurriculumBoard) => Promise<void>
  globalAILoading?:     boolean
  globalAIStatus?:      string
  globalAIHasSnapshot?: boolean
  onGlobalAIUndo?:      () => void
}) {
  const [search,     setSearch]     = useState('')
  const [importOpen, setImportOpen] = useState(false)
  const [searchFocused, setSearchFocused] = useState(false)
  const searchRef   = useRef<HTMLInputElement>(null)
  const undoHistory = useUndoHistory<Subject[]>()

  // Academic Load Unit — applies to per-class slots in expanded view
  const [unit, setUnit] = useState<AllocationUnit>(() => {
    const stored = localStorage.getItem('schedu-alloc-unit') as AllocationUnit | null
    return stored && UNIT_ORDER.includes(stored) ? stored : 'slots_week'
  })
  useEffect(() => { localStorage.setItem('schedu-alloc-unit', unit) }, [unit])

  const sessionMins = 45

  // Board state
  const [board, setBoard] = useState<CurriculumBoard>(() => {
    const stored = localStorage.getItem('schedu-curriculum-board') as CurriculumBoard | null
    if (boardProp) return normalizeBoardType(boardProp)
    return stored && BOARD_ORDER.includes(stored) ? stored : 'CBSE'
  })
  useEffect(() => { if (boardProp) setBoard(normalizeBoardType(boardProp)) }, [boardProp])
  useEffect(() => { localStorage.setItem('schedu-curriculum-board', board) }, [board])

  // Local snapshot (subject-only fallback)
  const [localSnapshot,       setLocalSnapshot]       = useState<SubjectSnapshot[] | null>(null)
  const [localAiAssignedIds,  setLocalAiAssignedIds]  = useState<Set<string>>(new Set())

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

  function update(id: string, patch: Partial<Subject>) {
    undoHistory.push(subjects)
    if ('sections' in patch && localAiAssignedIds.has(id)) {
      setLocalAiAssignedIds(prev => { const next = new Set(prev); next.delete(id); return next })
    }
    setSubjects(subjects.map(s => s.id === id ? { ...s, ...patch } : s))
  }

  function remove(id: string) { undoHistory.push(subjects); setSubjects(subjects.filter(s => s.id !== id)) }
  function add(s: Subject)    { undoHistory.push(subjects); setSubjects([...subjects, s]) }

  // ── Local AI assign (subject-only fallback) ───────────────────────────────
  // Re-evaluates ALL subjects every run — no "already assigned" guard.
  // buildClassConfigs() preserves any existing per-class slot overrides.
  function localAiAssignAll() {
    if (!sections.length) return
    undoHistory.push(subjects)
    const snapshot: SubjectSnapshot[] = subjects.map(s => ({
      id: s.id,
      sections: s.sections ?? [],
      classConfigs: s.classConfigs ?? [],
      periodsPerWeek: s.periodsPerWeek,
    }))
    setLocalSnapshot(snapshot)
    const newlyAssignedIds = new Set<string>()
    const updated = subjects.map(s => {
      const suggestedSections = suggestClassesForSubject(s.name, sections, board)
      if (suggestedSections.length === 0) return s  // Curriculum has no suggestion
      const grp   = dominantGradeGroup(suggestedSections)
      const slots = suggestSlotsPerWeek(s.name, grp, board) ?? s.periodsPerWeek
      // buildClassConfigs preserves any per-class overrides the user set manually
      const newConfigs = buildClassConfigs(s, suggestedSections, slots)
      newlyAssignedIds.add(s.id)
      return {
        ...s,
        sections:       suggestedSections,
        classConfigs:   newConfigs,
        periodsPerWeek: slots,
        requiresLab:    CURRICULUM[s.name]?.requiresLab ?? s.requiresLab,
      }
    })
    setLocalAiAssignedIds(newlyAssignedIds)
    setSubjects(updated)
  }

  function localUndoAI() {
    if (!localSnapshot) return
    const byId = new Map(localSnapshot.map(s => [s.id, s]))
    setSubjects(subjects.map(s => {
      const snap = byId.get(s.id)
      return snap ? { ...s, sections: snap.sections, classConfigs: snap.classConfigs, periodsPerWeek: snap.periodsPerWeek } : s
    }))
    setLocalSnapshot(null); setLocalAiAssignedIds(new Set())
  }

  // ── AI delegation ─────────────────────────────────────────────────────────
  const hasGlobalAI   = typeof onGlobalAIAssign === 'function'
  const showUndo      = hasGlobalAI ? globalAIHasSnapshot : !!localSnapshot
  const isAiLoading   = hasGlobalAI ? globalAILoading : false
  const currentStatus = hasGlobalAI ? globalAIStatus : ''

  function triggerAIAssign() {
    if (isAiLoading) return
    if (hasGlobalAI) onGlobalAIAssign!(board)
    else localAiAssignAll()
  }

  function triggerUndo() {
    if (hasGlobalAI && onGlobalAIUndo) onGlobalAIUndo()
    else localUndoAI()
  }

  // Ctrl+Z handler — fires on keydown bubbled from any focused child input
  const handlePanelKeyDown = useCallback((e: React.KeyboardEvent) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
      const prev = undoHistory.undo()
      if (prev !== undefined) { e.preventDefault(); setSubjects(prev) }
    }
  }, [undoHistory, setSubjects])

  function handlePasteImport(rows: string[][]) {
    undoHistory.push(subjects)
    const newSubjects = rows
      .map(cells => ({
        id: makeId(),
        name:            cells[0]?.trim() || '',
        shortName:       cells[1]?.trim() || generateShortName(cells[0]?.trim() || ''),
        category:        'Compulsory' as any,
        periodsPerWeek:  parseInt(cells[2]) || 5,
        sessionDuration: sessionMins, maxPeriodsPerDay: 2,
        color: P, isOptional: false, requiresLab: false,
        sections: [], classConfigs: [],
      } as unknown as Subject))
      .filter(s => s.name)
    if (newSubjects.length) setSubjects([...subjects, ...newSubjects])
  }

  const assignedCount   = useMemo(() => subjects.filter(s => getAssignedClasses(s).length > 0).length, [subjects])
  const unassignedCount = subjects.length - assignedCount

  // ─────────────────────────────────────────────────────────────────────────────
  return (
    <div
      style={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}
      onKeyDown={handlePanelKeyDown}
    >
      <ResourceGlobalStyles />

      {/* ── Toolbar ─────────────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, paddingBottom: 7, flexShrink: 0, flexWrap: 'wrap' }}>

        {/* Title + counts */}
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
        <div style={{ position: 'relative', width: 280, flexShrink: 0 }}>
          <span style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#C0BBD8', pointerEvents: 'none', fontSize: 13 }}>⌕</span>
          <input
            ref={searchRef}
            value={search} onChange={e => setSearch(e.target.value)}
            onFocus={() => setSearchFocused(true)}
            onBlur={() => setSearchFocused(false)}
            onMouseEnter={() => searchRef.current?.focus()}
            placeholder="Search subjects…"
            className="rp-inp"
            style={{
              width: '100%', padding: '6px 10px 6px 28px',
              border: `1.5px solid ${searchFocused ? P : '#E4E0FF'}`,
              borderRadius: 8, fontSize: 12, color: '#111028',
              outline: 'none', boxSizing: 'border-box' as const,
              background: '#FAFAFE', fontFamily: 'inherit',
              height: 34, transition: 'border-color 0.2s',
              boxShadow: searchFocused ? `0 0 0 3px ${P_B}` : 'none',
            }}
          />
        </div>

        {/* Load Unit selector */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexShrink: 0, background: '#F5F3FF', border: '1.5px solid #DDD8FF', borderRadius: 7, padding: '2px 8px', height: 34, boxSizing: 'border-box' as const }}>
          <span style={{ fontSize: 9.5, color: '#9896B5', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', whiteSpace: 'nowrap' }}>Unit</span>
          <select
            value={unit}
            onChange={e => setUnit(e.target.value as AllocationUnit)}
            style={{ border: 'none', background: 'transparent', padding: '2px 4px', fontSize: 11, color: P_D, outline: 'none', fontFamily: 'inherit', fontWeight: 700, cursor: 'pointer' }}
            title="Change academic load display unit — no data lost"
          >
            {UNIT_ORDER.map(u => <option key={u} value={u}>{ALLOCATION_LABELS[u]}</option>)}
          </select>
        </div>

        {/* Board — readonly badge (set during school profile setup) */}
        <span
          title="Board set during school profile setup"
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 5,
            background: P_L, color: P_D, border: `1.5px solid ${P_B}`,
            borderRadius: 6, padding: '4px 10px', fontSize: 11.5, fontWeight: 800,
            height: 34, boxSizing: 'border-box' as const, flexShrink: 0,
            letterSpacing: '0.04em', cursor: 'default', userSelect: 'none',
          }}
        >
          {board}
        </span>

        {/* Spacer */}
        <div style={{ flex: 1 }} />

        {/* Action buttons */}
        <div style={{ display: 'flex', gap: 6, flexShrink: 0, alignItems: 'center' }}>
          <button onClick={() => setImportOpen(true)} style={outlineBtn}
            onMouseEnter={e => { e.currentTarget.style.background = P_L; e.currentTarget.style.borderColor = P_B; e.currentTarget.style.color = P_D }}
            onMouseLeave={e => { e.currentTarget.style.background = '#fff'; e.currentTarget.style.borderColor = '#DDD8FF'; e.currentTarget.style.color = '#6B6891' }}
          >⬆ Import</button>

          {showUndo && (
            <button onClick={triggerUndo} title="Undo last AI assignment"
              style={{ display: 'inline-flex', alignItems: 'center', gap: 5, background: '#FFFBEB', color: '#92400E', border: '1.5px solid #FDE68A', borderRadius: 7, padding: '6px 14px', fontSize: 11.5, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', flexShrink: 0, whiteSpace: 'nowrap', height: 34, boxSizing: 'border-box' as const }}
              onMouseEnter={e => { e.currentTarget.style.background = '#FEF3C7' }}
              onMouseLeave={e => { e.currentTarget.style.background = '#FFFBEB' }}
            >↩ Undo AI</button>
          )}

          <button
            onClick={triggerAIAssign}
            disabled={isAiLoading}
            title={hasGlobalAI
              ? `AI-assign ALL resources: subjects → teachers → rooms — ${board} standards`
              : `Auto-assign ${unassignedCount} unassigned subject${unassignedCount !== 1 ? 's' : ''} to relevant classes`
            }
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              background: isAiLoading ? '#B8B0EE' : P,
              color: '#fff', border: 'none', borderRadius: 7,
              padding: '6px 16px', fontSize: 12, fontWeight: 700,
              cursor: isAiLoading ? 'default' : 'pointer',
              fontFamily: 'inherit',
              boxShadow: isAiLoading ? 'none' : '0 2px 6px rgba(124,111,224,0.28)',
              whiteSpace: 'nowrap', flexShrink: 0, height: 34,
              boxSizing: 'border-box' as const,
              transition: 'background 0.15s',
              minWidth: 130,
            }}
            onMouseEnter={e => { if (!isAiLoading) e.currentTarget.style.background = P_D }}
            onMouseLeave={e => { if (!isAiLoading) e.currentTarget.style.background = P }}
          >
            {isAiLoading
              ? <><span style={{ display: 'inline-block', animation: 'spin 0.8s linear infinite' }}>⟳</span> {currentStatus || 'AI Assigning...'}</>
              : <>⚡ AI Assign ({board}){hasGlobalAI ? ' — All' : ''}</>
            }
          </button>
        </div>
      </div>

      {/* AI status banner */}
      {isAiLoading && currentStatus && (
        <div style={{ marginBottom: 6, padding: '5px 12px', background: '#EDE9FF', border: '1px solid #DDD8FF', borderRadius: 6, fontSize: 11, color: P_D, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
          <span style={{ display: 'inline-block', animation: 'spin 0.8s linear infinite' }}>⚡</span>
          {currentStatus}
          <span style={{ marginLeft: 'auto', fontSize: 10, color: '#9896B5' }}>applying {BOARD_LABELS[board]} curriculum standards…</span>
        </div>
      )}

      {sections.length === 0 && (
        <div style={{ margin: '0 0 6px', padding: '5px 10px', background: '#FFFBF0', border: '1px solid #FFE8A0', borderRadius: 5, fontSize: 11, color: '#7A5800', flexShrink: 0 }}>
          💡 Add classes first — AI will automatically assign subjects to the right grade levels based on {BOARD_LABELS[board]} curriculum.
        </div>
      )}

      {/* Table */}
      <div style={TABLE_CARD}>
        {subjects.length === 0 && !search ? (
          <div style={{ textAlign: 'center', padding: '44px 0' }}>
            <div style={{ fontSize: 28, marginBottom: 7 }}>📖</div>
            <div style={{ fontSize: 12.5, fontWeight: 700, color: '#9896B5', marginBottom: 4 }}>No subjects yet</div>
            <div style={{ fontSize: 11.5, color: '#C4C0DC' }}>Add subjects, then use ⚡ AI Assign to auto-fill class mappings and teacher workloads.</div>
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
            <colgroup>
              <col style={{ width: 210 }} />
              <col style={{ width: 80 }} />
              <col />
              <col style={{ width: 170 }} />
            </colgroup>
            <thead>
              <tr>
                <th style={TH}>Subject</th>
                <th style={TH}>Short</th>
                <th style={TH}>Applicable Classes</th>
                <th style={{ ...TH, textAlign: 'right', paddingRight: 10 }}>Actions</th>
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
                  isAiAssigned={localAiAssignedIds.has(sub.id)}
                  unit={unit}
                  sessionMins={sessionMins}
                  onUpdate={patch => update(sub.id, patch)}
                  onDelete={() => remove(sub.id)}
                />
              ))}
              {filtered.length === 0 && search && (
                <tr><td colSpan={4} style={{ ...TD, textAlign: 'center', color: '#C4C0DC', padding: '18px 10px' }}>No subjects match "{search}"</td></tr>
              )}
              <AddRow onAdd={add} />
            </tbody>
          </table>
        )}
      </div>

      {importOpen && (
        <ImportModal
          title="Subjects"
          sampleHeaders={['Subject Name', 'Short (optional)', 'Default Slots/Week']}
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

      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
    </div>
  )
}
