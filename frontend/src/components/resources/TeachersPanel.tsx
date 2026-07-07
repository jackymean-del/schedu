/**
 * TeachersPanel — Tab 3.
 *
 * Unified subject→class mapping: each subject carries its own applicable classes.
 * Table: Teacher | Subject Assignments | Slots/Wk | Class Teacher Of | [ Show More ] [ Delete ]
 *
 * Subject Assignments cell:
 *   ┃ English   [V-A] [V-B] ✕
 *   ┃ History   [VI-A]       ✕
 *   + Subject
 *
 * Clicking "+ Subject" opens a one-step portal list — picking a subject adds
 * it immediately (no classes yet). Classes are then assigned on the subject's
 * own row via the grade-grouped chip selector; ✕ removes the subject row.
 *
 * Data model: Staff extended with `subjectMappings?: { subject, classes }[]`
 */

import { useState, useRef, useMemo, useEffect, useCallback, Fragment, type KeyboardEvent as RKeyboardEvent } from 'react'
import { createPortal } from 'react-dom'
import type { Staff, Section, Subject } from '@/types'
import { Plus, X, Users, ChevronDown, ChevronUp, CalendarRange } from 'lucide-react'
import {
  P, P_D, P_L, P_B,
  TH, TD, TABLE_CARD,
  InlineChipSelect, ImportModal,
  actionBtn, DeleteActionButton, outlineBtn,
  ResourceGlobalStyles, useUndoHistory, SmartEmptyState,
} from './shared'
import type { ChipOption } from './shared'
import { calcTeacherSlots, slotLoadLevel, seedStandardStaff } from './aiEngine'
import { normalizeBoardType, type CurriculumBoard } from './curriculum'
import { useDirectoryStore } from '@/store/directoryStore'

// ─── Types ────────────────────────────────────────────────────────────────────
interface SubjectMapping { subject: string; classes: string[] }
type StaffExt = Staff & { subjectMappings?: SubjectMapping[] }

function makeId()   { return Math.random().toString(36).slice(2, 9) }
function initials(n: string) {
  return n.replace(/^(Mr|Mrs|Ms|Dr|Prof)\.?\s*/i, '')
          .split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0].toUpperCase()).join('')
}
function getGrade(n: string) {
  const t = n.trim(), idx = t.lastIndexOf('-')
  // Treat the trailing segment as a section suffix (not part of the grade) if it is
  // ≤ 4 chars.  Limit bumped from 3→4 so "Arts" (4) is treated as a suffix rather
  // than a grade name — keeping "XI-Arts", "XI-Com-A", "XI-Sci-A" all in "Grade XI".
  if (idx > 0 && t.slice(idx + 1).length <= 4)
    return t.slice(0, idx)
              .replace(/-(science|commerce|humanities?|sci|com|arts?|hum|gen|pcm|pcb)$/i, '')
              .trim()
  return t
}
const GRADE_ORDER = ['Nursery','LKG','UKG','I','II','III','IV','V','VI','VII','VIII','IX','X','XI','XII']
function gradeKey(g: string) { const i = GRADE_ORDER.indexOf(g); return i >= 0 ? i : 100 + g.charCodeAt(0) }
const ROLES   = ['Teacher','HoD','Coordinator','Principal','Vice Principal','Lab Incharge','Librarian']
const ROLE_DISPLAY_ORDER = ['Principal','Vice Principal','HoD','Coordinator','Teacher','Senior Teacher','Lab Incharge','Librarian','Counselor','Admin Staff']
const GENDERS = ['','female','male','other']

function getMappings(t: StaffExt): SubjectMapping[] {
  if (t.subjectMappings && t.subjectMappings.length > 0) return t.subjectMappings
  return (t.subjects ?? []).map(s => ({ subject: s, classes: t.classes ?? [] }))
}

// ─── Load level badge colors ──────────────────────────────────────────────────
const LOAD_STYLE: Record<ReturnType<typeof slotLoadLevel>, { bg: string; fg: string; border: string }> = {
  none: { bg: '#F2F1F9', fg: '#9896B5', border: '#E0DCF4' },
  low:  { bg: '#EEF3FF', fg: '#3B5BDB', border: '#BFD0FF' },
  good: { bg: '#ECFDF5', fg: '#059669', border: '#A7F3D0' },
  high: { bg: '#FFF4E6', fg: '#C05621', border: '#FBD38D' },
  over: { bg: '#FFF1F2', fg: '#C81E4A', border: '#FECDD3' },
}

// ─── Avatar ───────────────────────────────────────────────────────────────────
function Avatar({ name }: { name: string }) {
  return (
    <div style={{
      width: 28, height: 28, borderRadius: '50%',
      background: P_L, color: P_D,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: 10.5, fontWeight: 800, flexShrink: 0,
      border: '1.5px solid rgba(124,111,224,0.28)', letterSpacing: '0.02em',
    }}>
      {initials(name) || '?'}
    </div>
  )
}

// ─── AddSubjectFlow — one-step portal dropdown ────────────────────────────────
// Picking a subject adds it to the educator immediately (with no classes).
// Classes are assigned afterwards on the subject's own row.
function AddSubjectFlow({ anchorEl, availableSubjects, onAdd, onClose }: {
  anchorEl: HTMLElement | null
  availableSubjects: Subject[]
  onAdd: (subject: string) => void
  onClose: () => void
}) {
  const [subSearch, setSubSearch] = useState('')
  const [pos, setPos]             = useState({ top: 0, left: 0, width: 290 })
  const dropRef   = useRef<HTMLDivElement>(null)
  const subInRef  = useRef<HTMLInputElement>(null)

  const calcPos = useCallback(() => {
    if (!anchorEl) return
    const rect = anchorEl.getBoundingClientRect()
    const w = 290
    const spaceBelow = window.innerHeight - rect.bottom
    setPos({
      left: Math.min(rect.left, window.innerWidth - w - 8),
      width: w,
      top: spaceBelow > 330 ? rect.bottom + 4 : Math.max(8, rect.top - 330),
    })
  }, [anchorEl])

  useEffect(() => {
    calcPos()
    document.addEventListener('scroll', calcPos, true)
    return () => document.removeEventListener('scroll', calcPos, true)
  }, [calcPos])

  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (dropRef.current && !dropRef.current.contains(e.target as Node) && anchorEl && !anchorEl.contains(e.target as Node)) onClose()
    }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [anchorEl, onClose])

  useEffect(() => { setTimeout(() => subInRef.current?.focus(), 30) }, [])

  const filteredSubs = availableSubjects.filter(s =>
    !subSearch || s.name.toLowerCase().includes(subSearch.toLowerCase())
  )

  return createPortal(
    <div ref={dropRef} style={{ position: 'fixed', top: pos.top, left: pos.left, width: pos.width, background: '#fff', border: '1px solid #dbd5ff', borderRadius: 10, boxShadow: '0 10px 32px rgba(124,111,224,0.22)', zIndex: 9999, overflow: 'hidden' }}>
      <div style={{ padding: '9px 12px', background: '#faf9ff', borderBottom: '1px solid #f0eeff', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontSize: 10, fontWeight: 800, color: P, textTransform: 'uppercase', letterSpacing: '0.07em' }}>Add Subject</span>
        <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#bbb', padding: 2, lineHeight: 1 }}><X size={12} /></button>
      </div>
      <div style={{ padding: '7px 10px', borderBottom: '1px solid #f5f3ff' }}>
        <input ref={subInRef} value={subSearch} onChange={e => setSubSearch(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Escape') onClose()
            if (e.key === 'Enter' && filteredSubs.length === 1) { onAdd(filteredSubs[0].name); onClose() }
          }}
          placeholder="Search subjects…"
          style={{ width: '100%', border: '1px solid #e0dcff', borderRadius: 5, padding: '5px 8px', fontSize: 12, outline: 'none', boxSizing: 'border-box' as const, fontFamily: 'inherit' }}
        />
      </div>
      <div style={{ maxHeight: 230, overflowY: 'auto' }}>
        {filteredSubs.length === 0 ? (
          <div style={{ padding: '16px', textAlign: 'center', fontSize: 12, color: '#bbb' }}>
            {subSearch ? `No matches for "${subSearch}"` : 'All subjects already assigned'}
          </div>
        ) : filteredSubs.map(s => (
          <div key={s.id} onClick={() => { onAdd(s.name); onClose() }}
            style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 12px', cursor: 'pointer', fontSize: 12, color: '#1a1a2e' }}
            onMouseEnter={e => (e.currentTarget.style.background = '#f5f3ff')}
            onMouseLeave={e => (e.currentTarget.style.background = '')}
          >
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: s.color ?? P, flexShrink: 0 }} />
            <span style={{ flex: 1, fontWeight: 500 }}>{s.name}</span>
            <Plus size={11} color="#C4BDFF" style={{ flexShrink: 0 }} />
          </div>
        ))}
      </div>
      <div style={{ padding: '6px 12px', borderTop: '1px solid #f0eeff', background: '#faf9ff', fontSize: 10, color: '#9896B5' }}>
        Pick a subject — then assign its classes on the row.
      </div>
    </div>,
    document.body,
  )
}

// ─── Subject mapping line ─────────────────────────────────────────────────────
function SubjectLine({ mapping, subjectColor, classOpts, onUpdate, onRemove }: {
  mapping: SubjectMapping; subjectColor: string
  classOpts: ChipOption[]; onUpdate: (classes: string[]) => void; onRemove: () => void
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', flexWrap: 'wrap', gap: 3, borderLeft: `2.5px solid ${subjectColor}bb`, paddingLeft: 6, marginBottom: 2, minHeight: 22, maxWidth: '100%', overflow: 'hidden' }}>
      <span style={{ fontSize: 11, fontWeight: 700, color: '#111028', width: 90, flexShrink: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', alignSelf: 'center' }}>
        {mapping.subject}
      </span>
      <div style={{ flex: 1, minWidth: 0, overflow: 'hidden' }}>
        {/* maxChips=3: prevents cell overflow; "+N more" badge reveals the rest on click */}
        <InlineChipSelect selected={mapping.classes} options={classOpts} onChange={onUpdate} placeholder="+ classes" minDropdownWidth={260} maxChips={3} />
      </div>
      <button onClick={onRemove} title={`Remove ${mapping.subject} from this educator`}
        style={{ background: 'none', border: '1px solid transparent', borderRadius: 4, cursor: 'pointer', padding: '2px 3px', color: '#B8B2DC', lineHeight: 1, flexShrink: 0, alignSelf: 'center', display: 'inline-flex' }}
        onMouseEnter={e => { e.currentTarget.style.color = '#e74c3c'; e.currentTarget.style.background = '#FEF2F2'; e.currentTarget.style.borderColor = '#FECACA' }}
        onMouseLeave={e => { e.currentTarget.style.color = '#B8B2DC'; e.currentTarget.style.background = 'none'; e.currentTarget.style.borderColor = 'transparent' }}
      ><X size={11} /></button>
    </div>
  )
}

// ─── Subject assignments cell ─────────────────────────────────────────────────
function SubjectAssignmentCell({ teacher, subjects, classOpts, onUpdateMappings }: {
  teacher: StaffExt; subjects: Subject[]
  classOpts: ChipOption[]; onUpdateMappings: (m: SubjectMapping[]) => void
}) {
  const [showAdd, setShowAdd] = useState(false)
  const addBtnRef = useRef<HTMLButtonElement>(null)
  const [anchor, setAnchor]   = useState<HTMLElement | null>(null)

  const mappings  = getMappings(teacher)
  const assigned  = new Set(mappings.map(m => m.subject))
  const available = subjects.filter(s => !assigned.has(s.name))

  const subjectColorMap = useMemo(() => {
    const m: Record<string, string> = {}
    subjects.forEach(s => { m[s.name] = s.color ?? P })
    return m
  }, [subjects])

  function addMapping(subject: string, classes: string[]) { onUpdateMappings([...mappings, { subject, classes }]) }
  function removeMapping(i: number) { const n = [...mappings]; n.splice(i, 1); onUpdateMappings(n) }
  function updateClasses(i: number, classes: string[]) { const n = [...mappings]; n[i] = { ...n[i], classes }; onUpdateMappings(n) }

  return (
    <div style={{ minWidth: 0 }}>
      {mappings.length === 0 && (
        <span style={{ fontSize: 11, color: '#C4C0DC', fontStyle: 'italic', paddingLeft: 2 }}>— not assigned —</span>
      )}
      {mappings.map((m, i) => (
        <SubjectLine key={m.subject + i} mapping={m}
          subjectColor={subjectColorMap[m.subject] ?? P}
          classOpts={classOpts}
          onUpdate={cls => updateClasses(i, cls)}
          onRemove={() => removeMapping(i)}
        />
      ))}
      <button ref={addBtnRef}
        onClick={() => {
          if (showAdd) { setShowAdd(false); setAnchor(null); return }
          setAnchor(addBtnRef.current); setShowAdd(true)
        }}
        style={{ display: 'inline-flex', alignItems: 'center', gap: 4, background: showAdd ? P : '#fff', border: `1.5px solid ${showAdd ? P : '#DDD8FF'}`, borderRadius: 5, color: showAdd ? '#fff' : P, fontSize: 11, fontWeight: 700, padding: '3px 9px', marginTop: mappings.length > 0 ? 4 : 0, cursor: 'pointer', transition: 'all 0.12s', fontFamily: 'inherit' }}
        onMouseEnter={e => { if (!showAdd) { e.currentTarget.style.background = P_L; e.currentTarget.style.borderColor = P } }}
        onMouseLeave={e => { if (!showAdd) { e.currentTarget.style.background = '#fff'; e.currentTarget.style.borderColor = '#DDD8FF' } }}
      >
        <Plus size={10} /> Subject
      </button>
      {showAdd && anchor && (
        <AddSubjectFlow anchorEl={anchor} availableSubjects={available}
          onAdd={name => addMapping(name, [])} onClose={() => { setShowAdd(false); setAnchor(null) }}
        />
      )}
    </div>
  )
}

// ─── Expanded details row ─────────────────────────────────────────────────────
const fld: React.CSSProperties = {
  padding: '3px 7px', border: '1px solid #E4E0FF', borderRadius: 5,
  fontSize: 12, color: '#111028', outline: 'none', fontFamily: 'inherit', background: '#FAFAFE',
}

const DESIGNATIONS = ['Teacher','Senior Teacher','HoD','Coordinator','Principal','Vice Principal','Lab Incharge','Librarian','Counselor','Admin Staff']

function ExpandedDetails({ t, onChange }: { t: Staff; onChange: (p: Partial<Staff>) => void }) {
  const ext = t as any  // extended fields not in the base type yet
  const lbl: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: 3, fontSize: 11, color: '#6B6891', fontWeight: 600 }
  return (
    <div style={{ display: 'flex', gap: 12, padding: '8px 50px 10px', background: '#FAFAFE', borderTop: '1px solid #EEE9FF', flexWrap: 'wrap', alignItems: 'flex-end' }}>
      <label style={lbl}>
        Designation
        <select value={t.role ?? 'Teacher'} onChange={e => onChange({ role: e.target.value })} style={fld}>
          {DESIGNATIONS.map(d => <option key={d} value={d}>{d}</option>)}
        </select>
      </label>
      <label style={lbl}>
        Gender
        <select value={t.gender ?? ''} onChange={e => onChange({ gender: e.target.value as any })} style={fld}>
          {GENDERS.map(g => <option key={g} value={g}>{g || '— not set —'}</option>)}
        </select>
      </label>
      <label style={lbl}>
        Contact
        <input
          type="tel"
          value={ext.phone ?? ''}
          onChange={e => onChange({ ...t, phone: e.target.value } as any)}
          placeholder="+91 98765 43210"
          style={{ ...fld, width: 138 }}
        />
      </label>
      <label style={lbl}>
        Email
        <input
          type="email"
          value={ext.email ?? ''}
          onChange={e => onChange({ ...t, email: e.target.value } as any)}
          placeholder="teacher@school.edu"
          style={{ ...fld, width: 180 }}
        />
      </label>
      <label style={lbl}>
        Notes
        <input
          value={ext.notes ?? ''}
          onChange={e => onChange({ ...t, notes: e.target.value } as any)}
          placeholder="Optional notes…"
          style={{ ...fld, width: 200 }}
        />
      </label>
    </div>
  )
}

// ─── Inline name edit ─────────────────────────────────────────────────────────
function NameCell({ value, onSave }: { value: string; onSave: (v: string) => void }) {
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
      style={{ ...fld, width: '100%', fontSize: 12.5, fontWeight: 600 }}
    />
  )
  return (
    <span onClick={() => setE(true)} title={value}
      style={{
        cursor: 'text', fontSize: 12.5, fontWeight: 600, color: '#111028',
        padding: '2px 4px', borderRadius: 3, display: 'block',
        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
      }}
      onMouseEnter={ev => (ev.currentTarget.style.background = '#F0ECFE')}
      onMouseLeave={ev => (ev.currentTarget.style.background = '')}
    >{value}</span>
  )
}

// ─── Short name cell (for timetable display) ──────────────────────────────────
function ShortNameCell({ value, onSave }: { value?: string; onSave: (v: string) => void }) {
  const [e, setE] = useState(false)
  const [t, setT] = useState(value ?? '')
  const ref = useRef<HTMLInputElement>(null)
  useEffect(() => { if (e) ref.current?.focus() }, [e])
  useEffect(() => { setT(value ?? '') }, [value])
  function commit() { onSave(t.trim()); setE(false) }
  const displayValue = t.trim() || '(auto)'
  if (e) return (
    <input ref={ref} value={t} onChange={ev => setT(ev.target.value)}
      onBlur={commit}
      onKeyDown={ev => { if (ev.key === 'Enter') commit(); if (ev.key === 'Escape') { setT(value ?? ''); setE(false) } }}
      maxLength={6}
      placeholder="e.g. MR"
      style={{ ...fld, width: '60px', fontSize: 11, fontWeight: 500, padding: '3px 6px' }}
    />
  )
  return (
    <span onClick={() => setE(true)} title="Short name for calendar (e.g. MR, JD) • Click to edit"
      style={{
        cursor: 'text', fontSize: 10, fontWeight: 500, color: '#7C6FE0', padding: '2px 4px', borderRadius: 3,
        display: 'inline-block', background: displayValue === '(auto)' ? 'transparent' : '#F0ECFE',
        border: '0.5px dashed #D4CEFF'
      }}
      onMouseEnter={ev => (ev.currentTarget.style.background = '#F0ECFE')}
      onMouseLeave={ev => (ev.currentTarget.style.background = displayValue === '(auto)' ? 'transparent' : '#F0ECFE')}
    >{displayValue}</span>
  )
}

// ─── Add teacher row ──────────────────────────────────────────────────────────
// Consults the shared cross-schedule staff directory (store/directoryStore.ts)
// so "same name" becomes a deliberate choice: typing a name that already
// exists there offers "use this teacher" (links via directoryId, reused
// across schedules) instead of silently creating a second, disconnected
// record that later looks like a double-booking or a merged-away duplicate.
function AddRow({ onAdd }: { onAdd: (t: StaffExt) => void }) {
  const [active, setActive] = useState(false)
  const [name, setName] = useState('')
  const ref = useRef<HTMLInputElement>(null)
  useEffect(() => { if (active) ref.current?.focus() }, [active])

  const directoryStaff = useDirectoryStore(s => s.staff)
  const trimmed = name.trim()
  const collision = trimmed
    ? directoryStaff.find(s => s.name.toLowerCase() === trimmed.toLowerCase())
    : undefined

  function addRecord(directoryId: string, base?: Partial<StaffExt>) {
    onAdd({
      id: makeId(), name: trimmed, shortName: '', role: 'Teacher',
      subjects: [], classes: [], isClassTeacher: '', maxPeriodsPerWeek: 30,
      ...base, directoryId,
    } as unknown as StaffExt)
    setName(''); setActive(false)
  }

  function commit() {
    if (!trimmed) { setActive(false); return }
    if (collision) return // resolve the conflict below first — see useExisting()
    const entry = useDirectoryStore.getState().addStaff({ name: trimmed })
    addRecord(entry.id)
  }

  function useExisting() {
    if (!collision) return
    addRecord(collision.id, {
      shortName: collision.shortName ?? '',
      role: collision.role ?? 'Teacher',
      subjects: collision.subjects ?? [],
      maxPeriodsPerWeek: collision.maxPeriodsPerWeek ?? 30,
      gender: collision.gender,
    } as Partial<StaffExt>)
  }

  if (!active) return (
    <tr>
      <td colSpan={5} style={{ ...TD, padding: '9px 12px' }}>
        <button onClick={() => setActive(true)}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 5, background: 'none', border: '1px dashed #C8C2F0', borderRadius: 6, color: P, fontSize: 12, fontWeight: 600, padding: '4px 11px', cursor: 'pointer', fontFamily: 'inherit' }}>
          <Plus size={13} /> Add Educator
        </button>
      </td>
    </tr>
  )
  return (
    <tr style={{ background: '#FAFAFE' }}>
      <td colSpan={3} style={{ ...TD, verticalAlign: 'top' }}>
        <input ref={ref} value={name} onChange={e => setName(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && !collision) commit(); if (e.key === 'Escape') setActive(false) }}
          placeholder="Educator full name"
          style={{ ...fld, width: '100%', fontSize: 12.5, boxSizing: 'border-box' as const, borderColor: collision ? '#F59E0B' : undefined }}
        />
        {collision && (
          <div style={{ marginTop: 6, padding: '7px 9px', borderRadius: 6, background: '#FFFBEB', border: '1px solid #FDE68A', fontSize: 11, color: '#92400E', lineHeight: 1.5 }}>
            <strong>{collision.name}</strong> already exists in your staff directory.
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 5, flexWrap: 'wrap' }}>
              <button onClick={useExisting}
                style={{ background: '#D97706', color: '#fff', border: 'none', borderRadius: 5, padding: '3px 9px', fontSize: 10.5, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
                ✓ Use this teacher
              </button>
              <span style={{ color: '#B45309' }}>Different person? Make the name distinguishable (e.g. add a last initial) to add them separately.</span>
            </div>
          </div>
        )}
      </td>
      <td colSpan={2} style={{ ...TD, whiteSpace: 'nowrap', verticalAlign: 'top' }}>
        <button onClick={commit} disabled={!!collision}
          title={collision ? 'Resolve the name conflict before adding' : undefined}
          style={{ background: collision ? '#E5E7EB' : P, color: collision ? '#9CA3AF' : '#fff', border: 'none', borderRadius: 5, padding: '5px 13px', fontSize: 12, fontWeight: 700, cursor: collision ? 'not-allowed' : 'pointer', marginRight: 6, fontFamily: 'inherit' }}>✓ Add</button>
        <button onClick={() => setActive(false)} style={{ background: '#F0F0F0', color: '#888', border: 'none', borderRadius: 5, padding: '5px 10px', fontSize: 12, cursor: 'pointer', fontFamily: 'inherit' }}>✗</button>
      </td>
    </tr>
  )
}

// ─── Role header row ──────────────────────────────────────────────────────────
function RoleHeaderRow({ role, count, collapsed, onToggle }: {
  role: string; count: number; collapsed: boolean; onToggle: () => void
}) {
  return (
    <tr>
      <td colSpan={6} style={{ padding: 0 }}>
        <button
          onClick={onToggle}
          style={{
            width: '100%', display: 'flex', alignItems: 'center', gap: 7,
            padding: '4px 12px', background: '#F3F1FF',
            border: 'none', borderBottom: '1px solid #E8E4FF',
            cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left' as const,
          }}
          onMouseEnter={e => (e.currentTarget.style.background = '#EDEBFF')}
          onMouseLeave={e => (e.currentTarget.style.background = '#F3F1FF')}
        >
          {collapsed
            ? <ChevronDown size={11} color={P} />
            : <ChevronUp size={11} color={P} />
          }
          <span style={{ fontSize: 10.5, fontWeight: 800, color: P_D, textTransform: 'uppercase', letterSpacing: '0.07em' }}>{role}</span>
          <span style={{ fontSize: 9.5, fontWeight: 700, color: P, background: P_L, borderRadius: 8, padding: '0 5px', border: `1px solid ${P_B}` }}>{count}</span>
        </button>
      </td>
    </tr>
  )
}

// ─── Teacher row ──────────────────────────────────────────────────────────────
function TeacherRow({ t, subjects, classOpts, classTeacherOpts, coClassTeacherOpts, onUpdate, onDelete, onScopeClick }: {
  t: StaffExt
  subjects: Subject[]
  classOpts: ChipOption[]
  classTeacherOpts: ChipOption[]
  coClassTeacherOpts: ChipOption[]
  onUpdate: (p: Partial<StaffExt>) => void
  onDelete: () => void
  onScopeClick?: (t: StaffExt, rect: DOMRect) => void
}) {
  const [expanded, setExpanded] = useState(false)
  const mappings = getMappings(t)

  function updateMappings(maps: SubjectMapping[]) {
    onUpdate({
      subjectMappings: maps,
      subjects: maps.map(m => m.subject),
      classes: [...new Set(maps.flatMap(m => m.classes))],
    } as Partial<StaffExt>)
  }

  const isClassTeacherOf = t.isClassTeacher || ''
  const slots = calcTeacherSlots(t as any, subjects)
  const level = slotLoadLevel(slots)
  const { bg: loadBg, fg: loadFg, border: loadBorder } = LOAD_STYLE[level]

  return (
    <>
      <tr
        style={{ verticalAlign: 'top', transition: 'background 0.08s' }}
        onMouseEnter={e => (e.currentTarget.style.background = '#F6F4FF')}
        onMouseLeave={e => (e.currentTarget.style.background = '')}
      >
        {/* Name + avatar */}
        <td style={{ ...TD, padding: '7px 12px', overflow: 'hidden' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
            <Avatar name={t.name} />
            <div style={{ minWidth: 0, overflow: 'hidden' }}>
              <NameCell value={t.name} onSave={v => onUpdate({ name: v })} />
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 3 }}>
                <ShortNameCell value={t.shortName} onSave={v => onUpdate({ shortName: v })} />
                {t.role && t.role !== 'Teacher' && (
                  <div style={{ fontSize: 10, color: '#9896B5', fontWeight: 600, letterSpacing: '0.02em' }}>{t.role}</div>
                )}
              </div>
            </div>
          </div>
        </td>

        {/* Subject assignments */}
        <td style={{ ...TD, padding: '7px 10px' }}>
          <SubjectAssignmentCell teacher={t} subjects={subjects} classOpts={classOpts} onUpdateMappings={updateMappings} />
        </td>

        {/* Slots / Week — single editable input, load-level colored */}
        <td style={{ ...TD, padding: '7px 8px', textAlign: 'center', whiteSpace: 'nowrap' }}>
          <input
            type="number" min={1} max={60}
            value={t.maxPeriodsPerWeek ?? 30}
            onChange={e => onUpdate({ maxPeriodsPerWeek: +e.target.value } as any)}
            className="rp-inp rp-num"
            title="Max periods per week"
            style={{
              width: 72, padding: '4px 8px',
              border: `1.5px solid ${loadBorder}`,
              borderRadius: 5,
              fontSize: 13, fontWeight: 700, color: loadFg,
              textAlign: 'center', outline: 'none',
              background: loadBg, fontFamily: 'inherit',
              boxSizing: 'border-box' as const,
            }}
          />
          <div style={{ fontSize: 9, color: '#9896B5', marginTop: 2, fontWeight: 600 }}>
            {slots} assigned{level !== 'none' ? ` · ${level}` : ''}
          </div>
        </td>

        {/* Class teacher (single select) */}
        <td style={{ ...TD, padding: '7px 10px' }}>
          <InlineChipSelect
            selected={isClassTeacherOf ? [isClassTeacherOf] : []}
            options={classTeacherOpts}
            onChange={v => onUpdate({ isClassTeacher: v[0] ?? '' })}
            singleSelect
            placeholder="— none —"
            maxChips={1}
            minDropdownWidth={220}
          />
        </td>

        {/* Co-Class teacher (single select) */}
        <td style={{ ...TD, padding: '7px 10px' }}>
          <InlineChipSelect
            selected={t.isCoClassTeacher ? [t.isCoClassTeacher] : []}
            options={coClassTeacherOpts}
            onChange={v => onUpdate({ isCoClassTeacher: v[0] ?? '' } as Partial<StaffExt>)}
            singleSelect
            placeholder="— none —"
            maxChips={1}
            minDropdownWidth={220}
          />
        </td>

        {/* Actions — Show More / Scope / Delete */}
        <td style={{ ...TD, padding: '6px 8px', whiteSpace: 'nowrap' }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4, flexWrap: 'nowrap' }}>
            <button
              onClick={() => setExpanded(o => !o)}
              style={{
                ...actionBtn, minWidth: 0, gap: 4, padding: '5px 10px',
                ...(expanded ? { background: P_L, color: P_D, borderColor: P_B } : {}),
              }}
              onMouseEnter={e => { e.currentTarget.style.background = P_L; e.currentTarget.style.color = P_D; e.currentTarget.style.borderColor = P_B }}
              onMouseLeave={e => {
                e.currentTarget.style.background = expanded ? P_L : 'transparent'
                e.currentTarget.style.color = expanded ? P_D : '#8886A8'
                e.currentTarget.style.borderColor = expanded ? P_B : '#DDD8FF'
              }}
            >
              {expanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
              {expanded ? 'Less' : 'More'}
            </button>
            {onScopeClick && (
              <button
                title="Set availability scope for this educator"
                onClick={e => onScopeClick(t, e.currentTarget.getBoundingClientRect())}
                style={{ ...actionBtn, minWidth: 0, gap: 4, padding: '5px 10px' }}
                onMouseEnter={e => { e.currentTarget.style.background = P_L; e.currentTarget.style.color = P_D; e.currentTarget.style.borderColor = P_B }}
                onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#8886A8'; e.currentTarget.style.borderColor = '#DDD8FF' }}
              >
                <CalendarRange size={12} /> Scope
              </button>
            )}
            <DeleteActionButton onDelete={onDelete} tooltip="Delete educator" />
          </div>
        </td>
      </tr>

      {expanded && (
        <tr>
          <td colSpan={5} style={{ padding: 0 }}>
            <ExpandedDetails t={t} onChange={onUpdate} />
          </td>
        </tr>
      )}
    </>
  )
}

// ─── Main export ──────────────────────────────────────────────────────────────
export function TeachersPanel({ staff, setStaff, sections, subjects, onScopeClick, onAIFix, aiLoading, aiApplied, hasGaps }: {
  staff: Staff[]
  setStaff: (s: Staff[]) => void
  sections: Section[]
  subjects: Subject[]
  onScopeClick?: (t: Staff, rect: DOMRect) => void
  onAIFix?: () => void
  aiLoading?: boolean
  aiApplied?: boolean
  hasGaps?: boolean
}) {
  const [search, setSearch]         = useState('')
  const [importOpen, setImportOpen] = useState(false)
  const [searchFocused, setSearchFocused] = useState(false)
  const [manualMode, setManualMode] = useState(false)
  const searchRef   = useRef<HTMLInputElement>(null)
  const undoHistory = useUndoHistory<Staff[]>()

  // Smart-create faculty from the subject list (load-sized teachers per subject)
  function handleSmartCreate() {
    if (!subjects.length) return
    undoHistory.push(staff)
    const board = normalizeBoardType('CBSE') as CurriculumBoard
    setStaff(seedStandardStaff(subjects, board) as unknown as Staff[])
  }

  const handlePanelKeyDown = useCallback((e: RKeyboardEvent<HTMLDivElement>) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
      const prev = undoHistory.undo()
      if (prev !== undefined) { e.preventDefault(); setStaff(prev) }
    }
  }, [undoHistory, setStaff])

  function handleImport(rows: string[][]) {
    const newStaff = rows
      .map(cells => ({
        id: makeId(), name: cells[0]?.trim() || '',
        role: cells[1]?.trim() || 'Teacher',
        subjects: [], classes: [], isClassTeacher: '', maxPeriodsPerWeek: 30,
      } as unknown as Staff))
      .filter(t => (t as any).name)
    if (newStaff.length) setStaff([...staff, ...newStaff])
  }

  const [sortAZ, setSortAZ] = useState(false)
  const [collapsedRoles, setCollapsedRoles] = useState<Set<string>>(new Set())

  const filtered = useMemo(() => {
    const q = search.toLowerCase()
    const base = !q ? (staff as StaffExt[]) : (staff as StaffExt[]).filter(t =>
      t.name.toLowerCase().includes(q) ||
      (t.role ?? '').toLowerCase().includes(q) ||
      getMappings(t).some(m => m.subject.toLowerCase().includes(q))
    )
    return sortAZ ? [...base].sort((a, b) => a.name.localeCompare(b.name)) : base
  }, [staff, search, sortAZ])

  const classOpts = useMemo<ChipOption[]>(() => {
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

  const classTeacherOpts = classOpts
  const allRoleExpanded = collapsedRoles.size === 0
  const groupedByRole = useMemo(() => {
    const map = new Map<string, StaffExt[]>()
    for (const t of filtered) {
      const role = t.role || 'Teacher'
      if (!map.has(role)) map.set(role, [])
      map.get(role)!.push(t)
    }
    return [...map.entries()].sort((a, b) => {
      const ai = ROLE_DISPLAY_ORDER.indexOf(a[0]); const bi = ROLE_DISPLAY_ORDER.indexOf(b[0])
      return (ai < 0 ? 999 : ai) - (bi < 0 ? 999 : bi)
    })
  }, [filtered])
  function toggleRole(role: string) {
    setCollapsedRoles(prev => { const n = new Set(prev); n.has(role) ? n.delete(role) : n.add(role); return n })
  }

  function update(id: string, p: Partial<StaffExt>) {
    undoHistory.push(staff)
    setStaff((staff as StaffExt[]).map(t => t.id === id ? { ...t, ...p } : t) as Staff[])
  }

  function remove(id: string) { undoHistory.push(staff); setStaff(staff.filter(t => t.id !== id)) }
  function add(t: StaffExt) { undoHistory.push(staff); setStaff([...staff, t as Staff]) }

  return (
    <div
      style={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}
      onKeyDown={handlePanelKeyDown}
    >
      <ResourceGlobalStyles />
      {/* Toolbar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, paddingBottom: 7, flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7, flexShrink: 0 }}>
          <Users size={13} color={P} />
          <span style={{ fontSize: 12.5, fontWeight: 700, color: '#111028' }}>Educators</span>
          <span style={{ fontSize: 10, color: P, background: P_L, borderRadius: 4, padding: '1px 6px 2px', fontWeight: 700, border: `1px solid ${P_B}` }}>
            {staff.length}
          </span>
          {search && filtered.length !== staff.length && (
            <span style={{ fontSize: 10, color: '#9896B5', fontWeight: 500 }}>{filtered.length} shown</span>
          )}
        </div>
        <div style={{ width: 1, height: 14, background: '#EAE6FF', flexShrink: 0 }} />
        <div style={{ position: 'relative', width: 280, flexShrink: 0 }}>
          <span style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#C0BBD8', pointerEvents: 'none', fontSize: 13 }}>⌕</span>
          <input
            ref={searchRef}
            value={search} onChange={e => setSearch(e.target.value)}
            onFocus={() => setSearchFocused(true)}
            onBlur={() => setSearchFocused(false)}
            placeholder="Search educators, subjects…"
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
        <button
          onClick={() => setSortAZ(p => !p)}
          title={sortAZ ? 'Sorted A→Z (click to reset)' : 'Sort teachers A→Z'}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 5, padding: '5px 10px', borderRadius: 7,
            border: `1.5px solid ${sortAZ ? P : '#E4E0FF'}`,
            background: sortAZ ? '#EDE9FF' : '#FAFAFE',
            color: sortAZ ? '#7C6FE0' : '#8B87AD',
            fontSize: 11, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', flexShrink: 0,
          }}
        >↑Z Sort</button>
        {groupedByRole.length > 1 && (
          <button
            onClick={() => setCollapsedRoles(allRoleExpanded ? new Set(groupedByRole.map(([r]) => r)) : new Set())}
            title={allRoleExpanded ? 'Collapse all roles' : 'Expand all roles'}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 5, padding: '5px 10px', borderRadius: 7,
              border: '1.5px solid #E4E0FF', background: '#FAFAFE', color: '#8B87AD',
              fontSize: 11, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', flexShrink: 0,
            }}
            onMouseEnter={e => { e.currentTarget.style.background = P_L; e.currentTarget.style.borderColor = P_B; e.currentTarget.style.color = P_D }}
            onMouseLeave={e => { e.currentTarget.style.background = '#FAFAFE'; e.currentTarget.style.borderColor = '#E4E0FF'; e.currentTarget.style.color = '#8B87AD' }}
          >
            {allRoleExpanded ? <ChevronDown size={11} /> : <ChevronUp size={11} />}
            {allRoleExpanded ? 'Collapse' : 'Expand'}
          </button>
        )}
        <div style={{ flex: 1 }} />
        <div style={{ display: 'flex', gap: 5, flexShrink: 0, alignItems: 'center' }}>
          {onScopeClick && (
            <button
              title="Set availability scope for all educators"
              onClick={e => onScopeClick({ id: '__bulk__' } as unknown as Staff, e.currentTarget.getBoundingClientRect())}
              style={outlineBtn}
              onMouseEnter={e => { e.currentTarget.style.background = P_L; e.currentTarget.style.borderColor = P_B; e.currentTarget.style.color = P_D }}
              onMouseLeave={e => { e.currentTarget.style.background = '#fff'; e.currentTarget.style.borderColor = '#DDD8FF'; e.currentTarget.style.color = '#6B6891' }}
            ><CalendarRange size={12} style={{ display: 'inline', verticalAlign: 'middle', marginRight: 4 }} />Set Scope</button>
          )}
          <button
            onClick={() => setImportOpen(true)}
            style={outlineBtn}
            onMouseEnter={e => { e.currentTarget.style.background = P_L; e.currentTarget.style.borderColor = P_B; e.currentTarget.style.color = P_D }}
            onMouseLeave={e => { e.currentTarget.style.background = '#fff'; e.currentTarget.style.borderColor = '#DDD8FF'; e.currentTarget.style.color = '#6B6891' }}
          >⬆ Import</button>
          {onAIFix && (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 3 }}>
              {hasGaps && !aiApplied && !aiLoading && (
                <span style={{ fontSize: 10, fontWeight: 700, color: '#DC2626', animation: 'fadeInDown 0.3s ease' }}>
                  ↓ Click to auto-assign missing teachers
                </span>
              )}
              <button
                onClick={aiLoading ? undefined : onAIFix}
                disabled={aiLoading}
                title="AI-assign subjects, classes and workloads to all educators"
                className={hasGaps && !aiApplied && !aiLoading ? 'ai-fix-pulse' : ''}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 5,
                  background: aiApplied ? '#059669' : aiLoading ? '#9b8fef' : P,
                  color: '#fff', border: hasGaps && !aiApplied && !aiLoading ? '2px solid #fff' : 'none',
                  borderRadius: 7,
                  padding: '6px 14px', fontSize: 11.5, fontWeight: 700,
                  cursor: aiLoading ? 'not-allowed' : 'pointer', fontFamily: 'inherit',
                  boxShadow: hasGaps && !aiApplied && !aiLoading
                    ? '0 0 0 3px rgba(220,38,38,0.4), 0 2px 10px rgba(124,111,224,0.4)'
                    : '0 2px 6px rgba(124,111,224,0.28)',
                  whiteSpace: 'nowrap', height: 34, boxSizing: 'border-box' as const,
                  opacity: aiLoading ? 0.85 : 1,
                  transition: 'background 0.2s, box-shadow 0.2s',
                }}
              >
                {aiLoading
                  ? <><span style={{ display:'inline-block', width:10, height:10, border:'2px solid rgba(255,255,255,0.4)', borderTopColor:'#fff', borderRadius:'50%', animation:'spin 0.7s linear infinite' }} />Applying…</>
                  : aiApplied
                    ? <>✓ Applied</>
                    : <>⚡ AI Fix</>
                }
              </button>
            </div>
          )}
          <style>{`
            @keyframes spin { to { transform: rotate(360deg) } }
            @keyframes aiFixPulse {
              0%,100% { box-shadow: 0 0 0 3px rgba(220,38,38,0.4), 0 2px 10px rgba(124,111,224,0.4); }
              50%      { box-shadow: 0 0 0 6px rgba(220,38,38,0.2), 0 4px 20px rgba(124,111,224,0.5); }
            }
            @keyframes fadeInDown {
              from { opacity: 0; transform: translateY(-4px); }
              to   { opacity: 1; transform: translateY(0); }
            }
            .ai-fix-pulse { animation: aiFixPulse 1.4s ease-in-out infinite; }
          `}</style>
        </div>
      </div>

      {importOpen && (
        <ImportModal
          title="Educators"
          sampleHeaders={['Educator Name', 'Role (optional)']}
          sampleRows={[
            ['Mrs. Anita Sharma', 'Teacher'],
            ['Mr. Rajesh Kumar',  'HoD'],
            ['Ms. Priya Nair',    'Teacher'],
            ['Dr. Suresh Menon',  'Coordinator'],
          ]}
          onImport={handleImport}
          onClose={() => setImportOpen(false)}
        />
      )}

      {/* Table */}
      <div style={TABLE_CARD}>
        {staff.length === 0 && !search && !manualMode ? (
          <SmartEmptyState
            icon={<Users size={26} color={P} />}
            title="No educators yet"
            subtitle={subjects.length === 0
              ? 'Add subjects first — then schedU can create a load-balanced faculty roster for them automatically, or you can add educators by hand.'
              : `Let schedU create a starter faculty from your ${subjects.length} subject${subjects.length !== 1 ? 's' : ''} — one or more teachers per subject, sized to the weekly load, with class assignments wired. Rename and tune afterwards.`}
            smartLabel="Let me create smartly"
            smartSubtext={subjects.length > 0 ? `Teachers for ${subjects.length} subject${subjects.length !== 1 ? 's' : ''}` : undefined}
            onSmart={handleSmartCreate}
            smartDisabled={subjects.length === 0}
            smartDisabledHint="Add subjects first — the roster is built from your subject list."
            manualLabel="Add manually"
            manualSubtext="Start with a blank table"
            onManual={() => setManualMode(true)}
          />
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
            <colgroup>
              <col style={{ width: '16%' }} />
              <col style={{ width: '26%' }} />
              <col style={{ width: '8%' }} />
              <col style={{ width: '16%' }} />
              <col style={{ width: '14%' }} />
              <col style={{ width: '20%' }} />
            </colgroup>
            <thead>
              <tr>
                <th style={TH}>Educator</th>
                <th style={TH}>Subject Assignments</th>
                <th style={{ ...TH, textAlign: 'center' }}>Slots/Wk</th>
                <th style={TH}>Class Teacher Of</th>
                <th style={TH}>Co-Class Teacher Of</th>
                <th style={{ ...TH, whiteSpace: 'nowrap' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {groupedByRole.map(([role, teachers]) => (
                <Fragment key={`role-${role}`}>
                  <RoleHeaderRow role={role} count={teachers.length} collapsed={collapsedRoles.has(role)} onToggle={() => toggleRole(role)} />
                  {!collapsedRoles.has(role) && teachers.map(t => (
                    <TeacherRow
                      key={t.id}
                      t={t}
                      subjects={subjects}
                      classOpts={classOpts}
                      classTeacherOpts={classTeacherOpts}
                      coClassTeacherOpts={classTeacherOpts}
                      onUpdate={p => update(t.id, p)}
                      onDelete={() => remove(t.id)}
                      onScopeClick={onScopeClick
                        ? (st, rect) => onScopeClick(st as Staff, rect)
                        : undefined}
                    />
                  ))}
                </Fragment>
              ))}
              {filtered.length === 0 && search && (
                <tr>
                  <td colSpan={6} style={{ ...TD, textAlign: 'center', color: '#C4C0DC', padding: '22px 12px' }}>
                    No teachers match "{search}"
                  </td>
                </tr>
              )}
              <AddRow onAdd={add} />
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
