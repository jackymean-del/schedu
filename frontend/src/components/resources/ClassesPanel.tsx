/**
 * ClassesPanel — Tab 1.
 * Columns: Class | Strength | Actions
 * Class Teacher is handled in the Shift & Timing step — not here.
 */

import React, { useState, useRef, useMemo, useEffect, useCallback } from 'react'
import type { Section } from '@/types'
import { useTimetableStore } from '@/store/timetableStore'
import { parseGradeLevel } from '@/lib/gradeParse'
import { Layers, X, CalendarRange, ChevronDown } from 'lucide-react'
import {
  P, P_D, P_L, P_B,
  TH, TD, TABLE_CARD,
  ImportModal,
  DeleteActionButton, actionBtn,
  outlineBtn, primaryBtn,
  ResourceGlobalStyles, useUndoHistory,
} from './shared'

type SectionExt = Section & { strength?: number; stream?: string }

function makeId() { return Math.random().toString(36).slice(2, 9) }

const inp: React.CSSProperties = {
  padding: '4px 8px', border: '1px solid #E4E0FF', borderRadius: 6,
  fontSize: 12.5, color: '#111028', outline: 'none',
  fontFamily: 'inherit', background: '#FAFAFE',
  boxSizing: 'border-box' as const, width: '100%',
}

const GRADE_ORDER = ['Nursery','LKG','UKG','I','II','III','IV','V','VI','VII','VIII','IX','X','XI','XII']
function gradeKey(g: string) { const i = GRADE_ORDER.indexOf(g); return i >= 0 ? i : 100 + g.charCodeAt(0) }

/** Normalise a grade label ("Class I" / "Class-V" / "Grade-1" → "I"/"V"/"1")
 *  for matching against GRADE_ORDER. Handles space OR hyphen after the prefix. */
function normalizeGrade(g?: string): string {
  return (g ?? '').trim().replace(/^(class|grade|std|standard)\s*[-\s]*/i, '')
}

/** The grades to seed when "Create smartly" is used — from the onboarding
 *  range (config.grades, else config.fromGrade/toGrade), with a sane fallback. */
function gradesForGroup(group: string): string[] {
  const k = group.toLowerCase().replace(/[^a-z]/g, '')
  if (k.startsWith('prek') || k.startsWith('prep') || k.startsWith('nursery') || k.startsWith('kinder')) return ['Nursery','LKG','UKG']
  if (k.startsWith('primary'))                        return ['I','II','III','IV','V']
  if (k.startsWith('middle') || k.startsWith('upper')) return ['VI','VII','VIII']
  if (k.startsWith('srsec') || k.startsWith('senior')) return ['XI','XII']
  if (k.startsWith('secondary'))                      return ['IX','X']
  return []
}
function smartRangeGrades(): string[] {
  const cfg = useTimetableStore.getState().config as any
  const explicit = Array.isArray(cfg?.grades) ? cfg.grades.map(normalizeGrade).filter(Boolean) : []
  if (explicit.length) return explicit
  // Adaptive: parse the typed from/to to numeric levels — this handles ANY
  // naming convention ("Class-V", "Grade 5", "V", "Std 5") via the shared
  // parser. The old GRADE_ORDER.indexOf() only matched "Class I" (space) and
  // silently fell through to the I–X fallback for hyphenated input like
  // "Class-V" — so a I–V school was seeded all the way to Class X.
  const f = parseGradeLevel(cfg?.fromGrade)
  const t = parseGradeLevel(cfg?.toGrade)
  if (f !== null && t !== null && f <= t) {
    const out = GRADE_ORDER.filter(g => { const l = parseGradeLevel(g); return l != null && l >= f && l <= t })
    if (out.length) return out
  }
  if (Array.isArray(cfg?.gradeGroups) && cfg.gradeGroups.length) {
    const grades = cfg.gradeGroups.flatMap((g: string) => gradesForGroup(g))
    if (grades.length) return grades
  }
  return GRADE_ORDER.slice(3, 13) // fallback: Class I–X
}

// ─── Class-group hierarchy (Group → Grade → Section) ──────────────────────────
const GROUP_DEFS: Array<{ name: string; emoji: string; grades: string[] }> = [
  { name: 'Pre-Primary',      emoji: '🧸', grades: ['Nursery', 'LKG', 'UKG'] },
  { name: 'Primary',          emoji: '📚', grades: ['I', 'II', 'III', 'IV', 'V'] },
  { name: 'Middle',           emoji: '📖', grades: ['VI', 'VII', 'VIII'] },
  { name: 'Secondary',        emoji: '🎯', grades: ['IX', 'X'] },
  { name: 'Senior Secondary', emoji: '🎓', grades: ['XI', 'XII'] },
]
function gradeGroup(g: string): string {
  const u = g.trim()
  const def = GROUP_DEFS.find(d => d.grades.some(x => x.toLowerCase() === u.toLowerCase()))
  if (def) return def.name
  const n = parseInt(u)
  if (!isNaN(n)) return n <= 5 ? 'Primary' : n <= 8 ? 'Middle' : n <= 10 ? 'Secondary' : 'Senior Secondary'
  return 'Other'
}
function groupSortKey(name: string) { const i = GROUP_DEFS.findIndex(d => d.name === name); return i >= 0 ? i : 99 }
function groupEmoji(name: string)   { return GROUP_DEFS.find(d => d.name === name)?.emoji ?? '🏷️' }

// Detect grade from a class name. Checks if the first dash-segment is a
// known grade label or a numeric grade; everything else is stream + section.
function getGrade(name: string): string {
  const t = name.trim()
  const parts = t.split('-')
  if (parts.length >= 2) {
    const first = parts[0]
    if (GRADE_ORDER.includes(first) || /^\d+$/.test(first)) return first
  }
  // Fallback: remove section suffix then strip old-style stream abbreviations
  const idx = t.lastIndexOf('-')
  if (idx > 0 && t.slice(idx + 1).length <= 3)
    return t.slice(0, idx).replace(/-(sci|com|arts?|hum|gen|pcm|pcb)$/i, '').trim()
  return t
}

// Returns the stream token embedded in an old-style name like "XI-Sci-A".
// Used ONLY as a fallback for legacy data that has no explicit stream field.
function getStreamFromName(name: string, grade: string): string | null {
  const t = name.trim()
  const prefix = grade + '-'
  const withoutGrade = t.startsWith(prefix) ? t.slice(prefix.length) : t
  const parts = withoutGrade.split('-')
  if (parts.length >= 2) return parts.slice(0, -1).join('-')
  return null
}

// Well-known stream abbreviation → full name map.
// Only covers unambiguous expansions; ambiguous ones (e.g. "Spa") are left
// for the user to enter so we don't guess wrong.
const STREAM_EXPANSIONS: Record<string, string> = {
  sci:   'Science',
  com:   'Commerce',
  comm:  'Commerce',
  arts:  'Arts',
  art:   'Arts',
  hum:   'Humanities',
  gen:   'General',
  pcm:   'PCM',
  pcb:   'PCB',
  bio:   'Biology',
  voc:   'Vocational',
  med:   'Medical',
  eng:   'Engineering',
  math:  'Mathematics',
  it:    'IT',
  lang:  'Languages',
  spa:   'Spark',
}

// ─── BulkCreate popover ────────────────────────────────────────────────────────
function BulkCreatePopover({ onClose, onCreate, existingStreams }: {
  onClose: () => void
  onCreate: (sections: SectionExt[]) => void
  existingStreams: string[]
}) {
  const [grade,  setGrade]  = useState('')
  const [stream, setStream] = useState('')
  const [secs,   setSecs]   = useState('A, B, C, D')
  const [str,    setStr]    = useState(40)
  const ref = useRef<HTMLDivElement>(null)
  const streamId = useRef('bulk-stream-list-' + makeId()).current

  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [onClose])

  const g = grade.trim()
  const s = stream.trim()
  const tokens  = secs.split(',').map(t => t.trim().toUpperCase()).filter(Boolean)
  const preview = g ? tokens.map(t => `${g}-${t}`) : []
  const canCreate = g !== '' && tokens.length > 0

  function create() {
    if (!canCreate) return
    onCreate(tokens.map(t => ({
      id: makeId(),
      name: `${g}-${t}`,
      grade: g,
      stream: s || undefined,
      room: '', classTeacher: '', strength: str,
    } as SectionExt)))
    onClose()
  }

  const label: React.CSSProperties = {
    display: 'flex', flexDirection: 'column', gap: 5,
    fontSize: 11, color: '#6B6891', fontWeight: 600,
  }

  return (
    <div ref={ref} style={{
      position: 'absolute', top: 'calc(100% + 6px)', right: 0, width: 320,
      background: '#fff', border: '1px solid #DDD8FF',
      borderRadius: 12, boxShadow: '0 10px 32px rgba(90,80,180,0.18)',
      zIndex: 300, padding: '18px',
    }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <span style={{ fontSize: 13, fontWeight: 700, color: '#111028' }}>Bulk Create Classes</span>
        <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#C0BBD8', padding: 2 }}>
          <X size={14} />
        </button>
      </div>

      {/* Fields */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 14 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <label style={label}>
            Grade *
            <input value={grade} onChange={e => setGrade(e.target.value)}
              placeholder="e.g. XI" style={inp} autoFocus />
          </label>
          <label style={label}>
            Strength
            <input type="number" value={str} onChange={e => setStr(+e.target.value)}
              min={1} max={999} style={{ ...inp, textAlign: 'center' }} />
          </label>
        </div>

        <label style={label}>
          Stream <span style={{ fontWeight: 400, color: '#AAA6C8' }}>(optional)</span>
          <input
            value={stream} onChange={e => setStream(e.target.value)}
            placeholder="e.g. Science, Commerce, Spark…"
            list={streamId}
            style={inp}
          />
          <datalist id={streamId}>
            {existingStreams.map(s => <option key={s} value={s} />)}
          </datalist>
          {stream.trim() && (
            <span style={{ fontSize: 10.5, color: '#9590BF', marginTop: 1 }}>
              Classes will be grouped under <strong>{stream.trim()}</strong>
            </span>
          )}
        </label>

        <label style={label}>
          Sections <span style={{ fontWeight: 400, color: '#AAA6C8' }}>(comma-separated)</span>
          <input value={secs} onChange={e => setSecs(e.target.value)}
            placeholder="A, B, C, D" style={inp} />
        </label>
      </div>

      {/* Preview */}
      {preview.length > 0 && (
        <div style={{ marginBottom: 14, padding: '10px 12px', background: '#F7F5FF', borderRadius: 8, border: '1px solid #E8E4FF' }}>
          <div style={{ fontSize: 10, color: '#B0ABCC', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 700 }}>
            Preview · {preview.length} class{preview.length !== 1 ? 'es' : ''}
            {s && <span style={{ fontWeight: 500, textTransform: 'none', marginLeft: 4 }}>in <strong>{s}</strong></span>}
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
            {preview.map(p => (
              <span key={p} style={{ background: P_L, color: P, borderRadius: 5, padding: '3px 9px', fontSize: 11, fontWeight: 600, border: `1px solid ${P_B}` }}>{p}</span>
            ))}
          </div>
        </div>
      )}

      <button
        onClick={create} disabled={!canCreate}
        style={{
          width: '100%', padding: '9px', borderRadius: 7,
          background: canCreate ? P : '#E8E4FF',
          color: canCreate ? '#fff' : '#B4ADDD',
          border: 'none', fontSize: 13, fontWeight: 700,
          cursor: canCreate ? 'pointer' : 'not-allowed',
          fontFamily: 'inherit',
          boxShadow: canCreate ? '0 2px 8px rgba(124,111,224,0.28)' : 'none',
          transition: 'background 0.12s',
        }}
        onMouseEnter={e => { if (canCreate) (e.currentTarget.style.background = P_D) }}
        onMouseLeave={e => { if (canCreate) (e.currentTarget.style.background = P) }}
      >
        Create {preview.length > 0 ? `${preview.length} class${preview.length !== 1 ? 'es' : ''}` : 'Classes'}
      </button>
    </div>
  )
}

// ─── Add row ──────────────────────────────────────────────────────────────────
function AddRow({ onAdd, existingStreams }: {
  onAdd: (s: SectionExt) => void
  existingStreams: string[]
}) {
  const [active,  setActive]  = useState(false)
  const [name,    setName]    = useState('')
  const [stream,  setStream]  = useState('')
  const [str,     setStr]     = useState(40)
  const nameRef   = useRef<HTMLInputElement>(null)
  const streamListId = useRef('add-stream-list-' + makeId()).current
  useEffect(() => { if (active) nameRef.current?.focus() }, [active])

  function commit() {
    if (!name.trim()) { setActive(false); return }
    onAdd({
      id: makeId(), name: name.trim(),
      grade: getGrade(name.trim()),
      stream: stream.trim() || undefined,
      room: '', classTeacher: '', strength: str,
    } as SectionExt)
    setName(''); setStream(''); setStr(40); setActive(false)
  }

  if (!active) return (
    <tr>
      <td colSpan={3} style={{ ...TD, padding: '8px 10px' }}>
        <button
          onClick={() => setActive(true)}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 5, background: 'none', border: '1px dashed #C8C2F0', borderRadius: 5, color: P, fontSize: 11.5, fontWeight: 600, padding: '4px 12px', cursor: 'pointer', fontFamily: 'inherit' }}
        >
          + Add Class
        </button>
      </td>
    </tr>
  )

  return (
    <tr style={{ background: '#F9F7FF' }}>
      <td style={TD}>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <input ref={nameRef} value={name} onChange={e => setName(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') setActive(false) }}
            placeholder="e.g. XI-A" style={{ ...inp, flex: 1 }}
          />
          <input
            value={stream} onChange={e => setStream(e.target.value)}
            placeholder="Stream (opt.)"
            list={streamListId}
            style={{ ...inp, width: 120, fontSize: 11.5, color: '#7C6FE0' }}
          />
          <datalist id={streamListId}>
            {existingStreams.map(s => <option key={s} value={s} />)}
          </datalist>
        </div>
      </td>
      <td style={TD}>
        <input type="number" value={str} onChange={e => setStr(+e.target.value)} min={1} max={999}
          style={{ ...inp, textAlign: 'center', width: '100%' }} />
      </td>
      <td style={{ ...TD, whiteSpace: 'nowrap' }}>
        <button onClick={commit} style={{ background: P, color: '#fff', border: 'none', borderRadius: 5, padding: '5px 13px', fontSize: 12, fontWeight: 700, cursor: 'pointer', marginRight: 6, fontFamily: 'inherit' }}>✓ Add</button>
        <button onClick={() => setActive(false)} style={{ background: '#F0F0F0', color: '#888', border: 'none', borderRadius: 5, padding: '5px 10px', fontSize: 12, cursor: 'pointer', fontFamily: 'inherit' }}>✗</button>
      </td>
    </tr>
  )
}

// ─── Section row ──────────────────────────────────────────────────────────────
function SectionRow({ sec, onUpdate, onDelete, onScopeClick, existingStreams, indent }: {
  sec: SectionExt
  onUpdate: (p: Partial<SectionExt>) => void
  onDelete: () => void
  onScopeClick?: (sec: SectionExt, rect: DOMRect) => void
  existingStreams: string[]
  indent?: boolean          // true when this row sits under a stream sub-header
}) {
  const grade = sec.grade ?? getGrade(sec.name)
  // Prefer stored stream; fall back to name-parsed stream so legacy rows auto-fill
  const inferredStream = sec.stream ?? getStreamFromName(sec.name, grade) ?? null

  const [editingName,   setEditingName]   = useState(false)
  const [editingStream, setEditingStream] = useState(false)
  const [tmpName,   setTmpName]   = useState(sec.name)
  const [tmpStream, setTmpStream] = useState(inferredStream ?? '')
  const nameRef   = useRef<HTMLInputElement>(null)
  const streamRef = useRef<HTMLInputElement>(null)
  const streamListId = useRef('row-stream-' + sec.id).current

  useEffect(() => { if (editingName)   nameRef.current?.focus()   }, [editingName])
  useEffect(() => { if (editingStream) streamRef.current?.focus() }, [editingStream])
  useEffect(() => { setTmpName(sec.name) },           [sec.name])
  useEffect(() => { setTmpStream(inferredStream ?? '') }, [inferredStream])

  function commitName() {
    onUpdate({ name: tmpName.trim() || sec.name, grade: getGrade(tmpName.trim() || sec.name) })
    setEditingName(false)
  }
  function commitStream() {
    onUpdate({ stream: tmpStream.trim() || undefined })
    setEditingStream(false)
  }

  return (
    <tr
      style={{ transition: 'background 0.07s' }}
      onMouseEnter={e => (e.currentTarget.style.background = '#F6F4FF')}
      onMouseLeave={e => (e.currentTarget.style.background = '')}
    >
      {/* Class name + stream pill */}
      <td style={{ ...TD, paddingLeft: indent ? 72 : 52 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap' }}>
          {editingName ? (
            <input ref={nameRef} value={tmpName} onChange={e => setTmpName(e.target.value)}
              onBlur={commitName}
              onKeyDown={e => { if (e.key === 'Enter') commitName(); if (e.key === 'Escape') { setTmpName(sec.name); setEditingName(false) } }}
              style={{ ...inp, fontWeight: 600, maxWidth: 160 }}
            />
          ) : (
            <span onClick={() => setEditingName(true)} title="Click to edit name"
              style={{ cursor: 'text', fontWeight: 600, fontSize: 12.5, color: '#111028', padding: '2px 5px', borderRadius: 4, display: 'inline-block' }}
              onMouseEnter={e => (e.currentTarget.style.background = '#EDE9FF')}
              onMouseLeave={e => (e.currentTarget.style.background = '')}
            >{sec.name}</span>
          )}

          {/* Stream pill — shows inferred name for legacy classes, explicit name for new */}
          {editingStream ? (
            <div style={{ position: 'relative' }}>
              <input
                ref={streamRef}
                value={tmpStream}
                onChange={e => setTmpStream(e.target.value)}
                onBlur={commitStream}
                onKeyDown={e => { if (e.key === 'Enter') commitStream(); if (e.key === 'Escape') { setTmpStream(inferredStream ?? ''); setEditingStream(false) } }}
                list={streamListId}
                placeholder="Stream name…"
                style={{ ...inp, fontSize: 11, width: 130, padding: '3px 7px' }}
              />
              <datalist id={streamListId}>
                {existingStreams.map(s => <option key={s} value={s} />)}
              </datalist>
            </div>
          ) : inferredStream ? (
            // Solid pill if explicitly stored; dashed outline if only inferred from name
            <span
              onClick={() => { setTmpStream(inferredStream); setEditingStream(true) }}
              title={sec.stream ? 'Click to change stream' : 'Stream inferred from class name — click to confirm or rename'}
              style={{
                fontSize: 10.5, fontWeight: 600,
                color:      sec.stream ? P        : '#7C78AA',
                background: sec.stream ? '#EDEAFF' : '#F4F2FF',
                border:     sec.stream ? `1px solid ${P_B}` : '1px dashed #C4BAFF',
                borderRadius: 20, padding: '2px 9px',
                cursor: 'pointer', whiteSpace: 'nowrap',
              }}
              onMouseEnter={e => { e.currentTarget.style.background = P_L; e.currentTarget.style.borderColor = P }}
              onMouseLeave={e => {
                e.currentTarget.style.background = sec.stream ? '#EDEAFF' : '#F4F2FF'
                e.currentTarget.style.borderColor = sec.stream ? P_B : '#C4BAFF'
              }}
            >
              {inferredStream}
            </span>
          ) : (
            <span
              onClick={() => setEditingStream(true)}
              title="Assign to a stream"
              style={{
                fontSize: 10.5, fontWeight: 500, color: '#B0ABCC',
                border: '1px dashed #D4CEEE', borderRadius: 20,
                padding: '2px 8px', cursor: 'pointer', whiteSpace: 'nowrap',
              }}
              onMouseEnter={e => { e.currentTarget.style.color = P; e.currentTarget.style.borderColor = P_B }}
              onMouseLeave={e => { e.currentTarget.style.color = '#B0ABCC'; e.currentTarget.style.borderColor = '#D4CEEE' }}
            >
              + stream
            </span>
          )}
        </div>
      </td>

      {/* Strength */}
      <td style={TD}>
        <input
          type="number" value={sec.strength ?? 40}
          onChange={e => onUpdate({ strength: +e.target.value })}
          min={1} max={999}
          className="rp-inp rp-num"
          style={{ width: '100%', padding: '4px 7px', border: '1px solid #E4E0FF', borderRadius: 5, fontSize: 12.5, fontWeight: 600, color: '#333', outline: 'none', textAlign: 'center', background: '#FAFAFE', boxSizing: 'border-box' as const, fontFamily: 'inherit' }}
        />
      </td>

      {/* Actions */}
      <td style={{ ...TD, textAlign: 'center', whiteSpace: 'nowrap' }}>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}>
          {onScopeClick && (
            <button
              title="Set availability scope for this class"
              onClick={e => onScopeClick(sec, e.currentTarget.getBoundingClientRect())}
              style={{ ...actionBtn, gap: 4 }}
              onMouseEnter={e => { e.currentTarget.style.background = P_L; e.currentTarget.style.color = P_D; e.currentTarget.style.borderColor = P_B }}
              onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#8886A8'; e.currentTarget.style.borderColor = '#DDD8FF' }}
            >
              <CalendarRange size={12} /> Scope
            </button>
          )}
          <DeleteActionButton onDelete={onDelete} tooltip="Delete class" />
        </div>
      </td>
    </tr>
  )
}

// ─── Create Stream popover ────────────────────────────────────────────────────
function StreamCreatePopover({ onClose, onCreate, existingStreams }: {
  onClose: () => void
  onCreate: (sections: SectionExt[]) => void
  existingStreams: string[]
}) {
  const [streamName, setStreamName] = useState('')
  const [grade,      setGrade]      = useState('')
  const [secs,       setSecs]       = useState('A, B, C')
  const [str,        setStr]        = useState(40)
  const ref = useRef<HTMLDivElement>(null)
  const streamListId = useRef('sc-list-' + makeId()).current

  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [onClose])

  const tokens  = secs.split(',').map(t => t.trim().toUpperCase()).filter(Boolean)
  const preview = grade.trim() && streamName.trim()
    ? tokens.map(t => `${grade.trim()}-${t}`)
    : []
  const canCreate = streamName.trim() !== '' && grade.trim() !== '' && tokens.length > 0

  function create() {
    if (!canCreate) return
    onCreate(tokens.map(t => ({
      id: makeId(),
      name:     `${grade.trim()}-${t}`,
      grade:    grade.trim(),
      stream:   streamName.trim(),
      room: '', classTeacher: '', strength: str,
    } as SectionExt)))
    onClose()
  }

  const lbl2: React.CSSProperties = {
    display: 'flex', flexDirection: 'column', gap: 5,
    fontSize: 11, color: '#6B6891', fontWeight: 600,
  }

  return (
    <div ref={ref} style={{
      position: 'absolute', top: 'calc(100% + 6px)', right: 0, width: 320,
      background: '#fff', border: '1px solid #DDD8FF',
      borderRadius: 12, boxShadow: '0 10px 32px rgba(90,80,180,0.18)',
      zIndex: 300, padding: '18px',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#111028' }}>New Stream</div>
          <div style={{ fontSize: 11, color: '#9896B5', marginTop: 2 }}>Define a stream and create its class sections</div>
        </div>
        <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#C0BBD8', padding: 2 }}>
          <X size={14} />
        </button>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 14 }}>
        <label style={lbl2}>
          Stream name <span style={{ color: '#EF4444' }}>*</span>
          <input
            value={streamName}
            onChange={e => setStreamName(e.target.value)}
            placeholder="e.g. Science, Commerce, Spark…"
            list={streamListId}
            style={inp}
            autoFocus
          />
          <datalist id={streamListId}>
            {existingStreams.map(s => <option key={s} value={s} />)}
          </datalist>
        </label>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <label style={lbl2}>
            Grade <span style={{ color: '#EF4444' }}>*</span>
            <input value={grade} onChange={e => setGrade(e.target.value)} placeholder="e.g. XI" style={inp} />
          </label>
          <label style={lbl2}>
            Strength
            <input type="number" value={str} onChange={e => setStr(+e.target.value)} min={1} max={999}
              style={{ ...inp, textAlign: 'center' }} />
          </label>
        </div>

        <label style={lbl2}>
          Sections <span style={{ fontWeight: 400, color: '#AAA6C8' }}>(comma-separated)</span>
          <input value={secs} onChange={e => setSecs(e.target.value)} placeholder="A, B, C" style={inp} />
        </label>
      </div>

      {preview.length > 0 && (
        <div style={{ marginBottom: 14, padding: '10px 12px', background: '#F7F5FF', borderRadius: 8, border: '1px solid #E8E4FF' }}>
          <div style={{ fontSize: 10, color: '#B0ABCC', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 700 }}>
            Preview · {preview.length} class{preview.length !== 1 ? 'es' : ''} in <strong style={{ color: P }}>{streamName.trim()}</strong>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
            {preview.map(p => (
              <span key={p} style={{ background: P_L, color: P, borderRadius: 5, padding: '3px 9px', fontSize: 11, fontWeight: 600, border: `1px solid ${P_B}` }}>{p}</span>
            ))}
          </div>
        </div>
      )}

      <button onClick={create} disabled={!canCreate} style={{
        width: '100%', padding: '9px', borderRadius: 7,
        background: canCreate ? P : '#E8E4FF',
        color: canCreate ? '#fff' : '#B4ADDD',
        border: 'none', fontSize: 13, fontWeight: 700,
        cursor: canCreate ? 'pointer' : 'not-allowed',
        fontFamily: 'inherit',
        boxShadow: canCreate ? '0 2px 8px rgba(124,111,224,0.28)' : 'none',
        transition: 'background 0.12s',
      }}
        onMouseEnter={e => { if (canCreate) e.currentTarget.style.background = P_D }}
        onMouseLeave={e => { if (canCreate) e.currentTarget.style.background = P }}
      >
        Create stream
      </button>
    </div>
  )
}

// ─── Stream setup banner ───────────────────────────────────────────────────────
// Auto-appears when any stream name looks abbreviated (≤ 5 chars).
// Shows all streams as labelled text inputs — user types full names, clicks Apply.
function StreamSetupBanner({ streams, onApply }: {
  streams: string[]
  onApply: (map: Record<string, string>) => void
}) {
  const abbreviated = streams.filter(s => s.length <= 5)
  const [vals, setVals] = useState<Record<string, string>>(() =>
    Object.fromEntries(streams.map(s => [s, s]))
  )
  // Keep vals in sync if streams change (new stream added, etc.)
  useEffect(() => {
    setVals(prev => {
      const next = { ...prev }
      streams.forEach(s => { if (!(s in next)) next[s] = s })
      return next
    })
  }, [streams])

  if (abbreviated.length === 0) return null

  const allFilled = abbreviated.every(s => (vals[s] ?? '').trim().length > 0)

  return (
    <div style={{
      flexShrink: 0,
      background: '#FFFBEB', border: '1px solid #FDE68A',
      borderRadius: 10, margin: '0 0 8px 0',
      padding: '12px 16px',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <span style={{ fontSize: 15 }}>✏️</span>
        <div>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#92400E' }}>
            Enter full stream names
          </div>
          <div style={{ fontSize: 11.5, color: '#B45309', marginTop: 1 }}>
            Short names detected — type the full name for each stream below.
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginBottom: 12 }}>
        {abbreviated.map(s => (
          <label key={s} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span style={{
              fontSize: 10, fontWeight: 700, color: '#92400E',
              textTransform: 'uppercase', letterSpacing: '0.07em',
            }}>
              "{s}" full name
            </span>
            <input
              value={vals[s] ?? s}
              onChange={e => setVals(v => ({ ...v, [s]: e.target.value }))}
              onKeyDown={e => { if (e.key === 'Enter' && allFilled) onApply(vals) }}
              placeholder={`e.g. ${s === 'Sci' ? 'Science' : s === 'Com' ? 'Commerce' : s === 'Hum' ? 'Humanities' : s === 'Arts' ? 'Arts' : 'Full name…'}`}
              style={{
                padding: '6px 12px', border: '1.5px solid #FDE68A', borderRadius: 7,
                fontSize: 13, fontWeight: 600, color: '#111028',
                background: '#fff', outline: 'none', fontFamily: 'inherit',
                width: 160,
                transition: 'border-color 0.15s',
              }}
              onFocus={e => (e.currentTarget.style.borderColor = '#F59E0B')}
              onBlur={e => (e.currentTarget.style.borderColor = '#FDE68A')}
            />
          </label>
        ))}
      </div>

      <button
        onClick={() => onApply(vals)}
        disabled={!allFilled}
        style={{
          padding: '7px 20px', borderRadius: 7, border: 'none',
          background: allFilled ? '#D97706' : '#FDE68A',
          color: allFilled ? '#fff' : '#B45309',
          fontSize: 13, fontWeight: 700, cursor: allFilled ? 'pointer' : 'not-allowed',
          fontFamily: 'inherit',
          transition: 'background 0.13s',
        }}
        onMouseEnter={e => { if (allFilled) e.currentTarget.style.background = '#B45309' }}
        onMouseLeave={e => { if (allFilled) e.currentTarget.style.background = '#D97706' }}
      >
        Apply stream names
      </button>
    </div>
  )
}

// ─── Stream name input — always visible in the stream header row ─────────────
function StreamNameInput({ initial, onCommit, onCancel: _onCancel }: {
  initial: string
  onCommit: (v: string) => void
  onCancel: () => void
}) {
  const [val, setVal] = useState(initial)
  // Keep in sync when the stored stream name changes (e.g. after a rename)
  useEffect(() => { setVal(initial) }, [initial])

  const isShort = initial.trim().length <= 5   // highlight if still abbreviated

  return (
    <input
      value={val}
      onChange={e => setVal(e.target.value)}
      onBlur={() => { if (val.trim() && val.trim() !== initial) onCommit(val.trim()) }}
      onKeyDown={e => {
        if (e.key === 'Enter') { e.preventDefault(); if (val.trim()) onCommit(val.trim()) }
        if (e.key === 'Escape') { e.preventDefault(); setVal(initial) }
      }}
      placeholder="Enter full stream name…"
      title="Type full stream name and press Enter"
      style={{
        fontSize: 12, fontWeight: 700,
        color: val.trim().length > 5 ? '#6B64A8' : '#B45309',
        border: isShort ? '1.5px solid #FDE68A' : `1.5px solid ${P_B}`,
        background: isShort ? '#FFFBEB' : '#F7F5FF',
        borderRadius: 6, padding: '3px 10px', outline: 'none',
        fontFamily: 'inherit', width: 170,
        transition: 'border-color 0.15s, background 0.15s',
      }}
      onFocus={e => { e.currentTarget.style.borderColor = isShort ? '#F59E0B' : P; e.currentTarget.style.boxShadow = `0 0 0 3px ${isShort ? '#FDE68A' : P_B}` }}
      onBlurCapture={e => { e.currentTarget.style.boxShadow = 'none' }}
    />
  )
}

// ─── Level strength total (Group / Grade / Stream header rows) ────────────────
// Read-only sum of the child sections' strengths. Recomputes automatically when
// any section's strength is edited (derived straight from the sections state).
function LevelStrengthTotal({ secs, title }: { secs: SectionExt[]; title: string }) {
  const total = secs.reduce((a, s) => a + (s.strength ?? 40), 0)
  return (
    <span
      title={title}
      onClick={e => e.stopPropagation()}
      style={{
        display: 'inline-block', minWidth: 58, padding: '3px 10px',
        fontSize: 12.5, fontWeight: 800, color: P_D, textAlign: 'center',
        background: 'rgba(255,255,255,0.75)', border: '1px solid #D4CCFF',
        borderRadius: 5, cursor: 'default', userSelect: 'none',
      }}
    >
      {total}
    </span>
  )
}

// ─── Inline group rename ──────────────────────────────────────────────────────
function GroupNameCell({ name, onRename }: { name: string; onRename: (v: string) => void }) {
  const [editing, setEditing] = useState(false)
  const [val, setVal] = useState(name)
  const ref = useRef<HTMLInputElement>(null)
  useEffect(() => { if (editing) ref.current?.focus() }, [editing])
  useEffect(() => { setVal(name) }, [name])
  function commit() { const v = val.trim(); if (v && v !== name) onRename(v); setEditing(false) }
  if (editing) return (
    <input ref={ref} value={val} onChange={e => setVal(e.target.value)}
      onClick={e => e.stopPropagation()}
      onBlur={commit}
      onKeyDown={e => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') { setVal(name); setEditing(false) } }}
      style={{ fontSize: 13.5, fontWeight: 800, letterSpacing: '0.05em', color: '#3D3580', textTransform: 'uppercase', border: `1.5px solid ${P}`, background: '#fff', borderRadius: 6, padding: '1px 8px', outline: 'none', fontFamily: 'inherit', width: 160 }}
    />
  )
  return (
    <span
      onClick={e => { e.stopPropagation(); setEditing(true) }}
      title="Click to rename this group"
      style={{ fontSize: 13.5, fontWeight: 800, letterSpacing: '0.05em', color: '#3D3580', textTransform: 'uppercase', cursor: 'text', padding: '1px 6px', borderRadius: 5 }}
      onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.6)')}
      onMouseLeave={e => (e.currentTarget.style.background = '')}
    >{name}</span>
  )
}

// ─── New-group popover ────────────────────────────────────────────────────────
const GROUP_EMOJI_OPTIONS = ['🏷️','📋','🎒','🏫','📝','⭐','🌟','💡','🔬','🎨','⚽','🎭','🌱','🦋','🏆']

function GroupCreatePopover({ onClose, onConfirm }: {
  onClose: () => void
  onConfirm: (name: string, emoji: string, grades: string[]) => void
}) {
  const [name, setName] = useState('')
  const [gradesStr, setGradesStr] = useState('')
  const [emoji, setEmoji] = useState('🏷️')
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) onClose() }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [onClose])
  const grades = gradesStr.split(',').map(g => g.trim()).filter(Boolean)
  const canCreate = name.trim() !== ''
  function create() { if (!canCreate) return; onConfirm(name.trim(), emoji, grades); onClose() }
  const lbl: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: 5, fontSize: 11, color: '#6B6891', fontWeight: 600 }
  return (
    <div ref={ref} style={{
      position: 'absolute', top: 'calc(100% + 6px)', right: 0, width: 320,
      background: '#fff', border: '1px solid #DDD8FF',
      borderRadius: 12, boxShadow: '0 10px 32px rgba(90,80,180,0.18)',
      zIndex: 300, padding: '18px',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#111028' }}>New Group</div>
          <div style={{ fontSize: 11, color: '#9896B5', marginTop: 2 }}>Create a custom class group</div>
        </div>
        <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#C0BBD8', padding: 2 }}><X size={14} /></button>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 14 }}>
        <label style={lbl}>
          Group name <span style={{ color: '#EF4444' }}>*</span>
          <input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Foundation, Advanced…"
            style={inp} autoFocus onKeyDown={e => { if (e.key === 'Enter') create() }} />
        </label>
        <label style={lbl}>
          Grades to include <span style={{ fontWeight: 400, color: '#AAA6C8' }}>(comma-separated, optional)</span>
          <input value={gradesStr} onChange={e => setGradesStr(e.target.value)}
            placeholder="e.g. Nursery, LKG, UKG" style={inp} />
          {grades.length > 0 && (
            <span style={{ fontSize: 10.5, color: '#9590BF' }}>
              These grades will be moved into this group.
            </span>
          )}
        </label>
        <div>
          <div style={{ fontSize: 11, color: '#6B6891', fontWeight: 600, marginBottom: 6 }}>Icon</div>
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
            {GROUP_EMOJI_OPTIONS.map(e => (
              <button key={e} onClick={() => setEmoji(e)} style={{
                fontSize: 16, padding: '4px 6px', borderRadius: 6, cursor: 'pointer', border: 'none',
                outline: emoji === e ? `2px solid ${P}` : '2px solid transparent',
                background: emoji === e ? P_L : 'transparent',
              }}>{e}</button>
            ))}
          </div>
        </div>
      </div>
      <button onClick={create} disabled={!canCreate} style={{
        width: '100%', padding: '9px', borderRadius: 7,
        background: canCreate ? P : '#E8E4FF', color: canCreate ? '#fff' : '#B4ADDD',
        border: 'none', fontSize: 13, fontWeight: 700,
        cursor: canCreate ? 'pointer' : 'not-allowed', fontFamily: 'inherit',
        boxShadow: canCreate ? '0 2px 8px rgba(124,111,224,0.28)' : 'none',
      }}
        onMouseEnter={e => { if (canCreate) e.currentTarget.style.background = P_D }}
        onMouseLeave={e => { if (canCreate) e.currentTarget.style.background = P }}
      >
        Create group
      </button>
    </div>
  )
}

// ─── Inline grade rename (rewrites grade field + section name prefixes) ───────
function GradeNameCell({ grade, onRename }: { grade: string; onRename: (v: string) => void }) {
  const [editing, setEditing] = useState(false)
  const [val, setVal] = useState(grade)
  const ref = useRef<HTMLInputElement>(null)
  useEffect(() => { if (editing) ref.current?.focus() }, [editing])
  useEffect(() => { setVal(grade) }, [grade])
  function commit() { const v = val.trim(); if (v && v !== grade) onRename(v); setEditing(false) }
  if (editing) return (
    <input ref={ref} value={val} onChange={e => setVal(e.target.value)}
      onClick={e => e.stopPropagation()}
      onBlur={commit}
      onKeyDown={e => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') { setVal(grade); setEditing(false) } }}
      style={{ fontSize: 13, fontWeight: 800, letterSpacing: '0.04em', color: P_D, textTransform: 'uppercase', border: `1.5px solid ${P}`, background: '#fff', borderRadius: 6, padding: '1px 8px', outline: 'none', fontFamily: 'inherit', width: 110 }}
    />
  )
  return (
    <span
      onClick={e => { e.stopPropagation(); setEditing(true) }}
      title="Click to rename this grade (updates all its sections)"
      style={{ fontSize: 13, fontWeight: 800, letterSpacing: '0.04em', color: P_D, textTransform: 'uppercase', cursor: 'text', padding: '1px 6px', borderRadius: 5 }}
      onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.7)')}
      onMouseLeave={e => (e.currentTarget.style.background = '')}
    >
      Grade {grade}
    </span>
  )
}

// ─── Main export ──────────────────────────────────────────────────────────────
export function ClassesPanel({ sections, setSections, onScopeClick }: {
  sections: Section[]
  setSections: (s: Section[]) => void
  onScopeClick?: (sec: Section, rect: DOMRect) => void
}) {
  const [search, setSearch]         = useState('')
  const [showBulk,         setShowBulk]         = useState(false)
  const [showStreamCreate, setShowStreamCreate] = useState(false)
  const [showAddGroup,     setShowAddGroup]     = useState(false)
  const [importOpen,       setImportOpen]       = useState(false)
  const [manual,           setManual]           = useState(false)

  // "Create smartly" — auto-seed grade sections from the onboarding range.
  // Pre-primary grades get one section; others get A–D. All editable after.
  const smartCreate = () => {
    const preK = new Set(['Nursery', 'LKG', 'UKG'])
    const out: SectionExt[] = []
    smartRangeGrades().forEach(g => {
      const isPreK = preK.has(normalizeGrade(g))
      ;(isPreK ? ['A'] : ['A', 'B', 'C', 'D']).forEach(t =>
        out.push({ id: makeId(), name: `${g}-${t}`, grade: g, room: '', classTeacher: '', strength: isPreK ? 25 : 40 } as SectionExt),
      )
    })
    if (out.length) setSections(out as unknown as Section[])
  }

  // Dynamic group definitions — user can rename or create new groups
  const [groupDefs, setGroupDefs] = useState(() => GROUP_DEFS.map(g => ({ ...g })))
  const [searchFocused, setSearchFocused] = useState(false)
  const searchRef   = useRef<HTMLInputElement>(null)
  const undoHistory = useUndoHistory<Section[]>()

  const handlePanelKeyDown = useCallback((e: React.KeyboardEvent) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
      const prev = undoHistory.undo()
      if (prev !== undefined) { e.preventDefault(); setSections(prev) }
    }
  }, [undoHistory, setSections])

  // Dynamic group resolution uses the mutable groupDefs state
  const gradeGroupFn = useCallback((g: string): string => {
    const u = g.trim()
    const def = groupDefs.find(d => d.grades.some(x => x.toLowerCase() === u.toLowerCase()))
    if (def) return def.name
    const n = parseInt(u)
    if (!isNaN(n)) return n <= 5 ? 'Primary' : n <= 8 ? 'Middle' : n <= 10 ? 'Secondary' : 'Senior Secondary'
    return 'Other'
  }, [groupDefs])

  function renameGroup(oldName: string, newName: string) {
    const trimmed = newName.trim()
    if (!trimmed || trimmed === oldName) return
    setGroupDefs(prev => prev.map(g => g.name === oldName ? { ...g, name: trimmed } : g))
  }

  function addGroup(name: string, emoji: string, grades: string[]) {
    const trimmed = name.trim()
    if (!trimmed) return
    setGroupDefs(prev => {
      // Remove specified grades from whichever existing group currently owns them
      const updated = prev.map(g => ({
        ...g,
        grades: g.grades.filter(gr => !grades.some(ng => ng.toLowerCase() === gr.toLowerCase()))
      }))
      return [...updated, { name: trimmed, emoji, grades }]
    })
  }

  function handleImport(rows: string[][]) {
    const newSections = rows
      .map(cells => ({
        id: makeId(),
        name: cells[0]?.trim() || '',
        grade: getGrade(cells[0]?.trim() || ''),
        room: '', classTeacher: '',
        strength: parseInt(cells[1]) || 40,
      } as SectionExt))
      .filter(s => s.name)
    if (newSections.length) setSections([...sections, ...newSections as Section[]])
  }

  const [sortAZ, setSortAZ] = useState(false)
  const [collapsedGroups,  setCollapsedGroups]  = useState<Set<string>>(new Set())
  const [collapsedGrades,  setCollapsedGrades]  = useState<Set<string>>(new Set())
  const [collapsedStreams,  setCollapsedStreams]  = useState<Set<string>>(new Set())
  const [editingStreamKey, setEditingStreamKey] = useState<string | null>(null) // "grade:stream"

  // All unique stream names in use — used for autocomplete everywhere
  const existingStreams = useMemo(() =>
    [...new Set(
      sections
        .map(s => (s as SectionExt).stream ?? getStreamFromName(s.name, (s as SectionExt).grade ?? getGrade(s.name)))
        .filter((s): s is string => Boolean(s))
    )].sort(),
    [sections]
  )

  // Auto-expand well-known stream abbreviations whenever they appear
  // (covers both explicit short sec.stream values and name-embedded ones)
  useEffect(() => {
    if (sections.length === 0) return
    const needsWork = sections.some(s => {
      const sec = s as SectionExt
      const g  = sec.grade ?? getGrade(s.name)
      const st = sec.stream ?? getStreamFromName(s.name, g)
      return st ? Boolean(STREAM_EXPANSIONS[st.toLowerCase()]) : false
    })
    if (!needsWork) return
    setSections(sections.map(s => {
      const sec = s as SectionExt
      const g  = sec.grade ?? getGrade(s.name)
      const st = sec.stream ?? getStreamFromName(s.name, g)
      if (!st) return s
      const full = STREAM_EXPANSIONS[st.toLowerCase()]
      return full ? { ...s, stream: full } as Section : s
    }))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sections.map(s => (s as SectionExt).stream ?? '').join(',')])

  function toggleGroup(group: string) {
    setCollapsedGroups(prev => {
      const next = new Set(prev)
      if (next.has(group)) next.delete(group); else next.add(group)
      return next
    })
  }
  function toggleGrade(grade: string) {
    setCollapsedGrades(prev => {
      const next = new Set(prev)
      if (next.has(grade)) next.delete(grade); else next.add(grade)
      return next
    })
  }
  function toggleStream(grade: string, stream: string) {
    const key = `${grade}:${stream}`
    setCollapsedStreams(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key); else next.add(key)
      return next
    })
  }

  // Rename within one grade (used by inline header edit)
  function renameStream(grade: string, oldStream: string, newName: string) {
    const trimmed = newName.trim()
    if (!trimmed || trimmed === oldStream) { setEditingStreamKey(null); return }
    undoHistory.push(sections)
    setSections(sections.map(s => {
      const sec = s as SectionExt
      const g = sec.grade ?? getGrade(s.name)
      const st = sec.stream ?? getStreamFromName(s.name, g) ?? ''
      if (g === grade && st === oldStream) return { ...s, stream: trimmed } as Section
      return s
    }) as Section[])
    setEditingStreamKey(null)
  }

  // Rename across ALL grades (used by the StreamsBar at the top)
  function renameStreamGlobal(oldStream: string, newName: string) {
    const trimmed = newName.trim()
    if (!trimmed || trimmed === oldStream) return
    undoHistory.push(sections)
    setSections(sections.map(s => {
      const sec = s as SectionExt
      const g = sec.grade ?? getGrade(s.name)
      const st = sec.stream ?? getStreamFromName(s.name, g) ?? ''
      if (st === oldStream) return { ...s, stream: trimmed } as Section
      return s
    }) as Section[])
  }

  // grouped: GROUP → grade → stream ('' if none) → sections
  const grouped = useMemo(() => {
    const q = search.toLowerCase()
    const filtered = sections.filter(s => !q || s.name.toLowerCase().includes(q))
    const byGrade = new Map<string, Map<string, SectionExt[]>>()
    filtered.forEach(s => {
      const sec = s as SectionExt
      const grade = sec.grade ?? getGrade(s.name)
      // Prefer explicit stream field; fall back to name-parsing for legacy data
      const stream = sec.stream ?? getStreamFromName(s.name, grade) ?? ''
      if (!byGrade.has(grade)) byGrade.set(grade, new Map())
      const sm = byGrade.get(grade)!
      if (!sm.has(stream)) sm.set(stream, [])
      sm.get(stream)!.push(sec)
    })
    if (sortAZ) {
      byGrade.forEach(sm => {
        sm.forEach((secs, stream) => sm.set(stream, [...secs].sort((a, b) => a.name.localeCompare(b.name))))
      })
    }
    // Wrap grades in their groups; grades sorted by GRADE_ORDER (Nursery first)
    const byGroup = new Map<string, Map<string, Map<string, SectionExt[]>>>()
    ;[...byGrade.entries()]
      .sort((a, b) => gradeKey(a[0]) - gradeKey(b[0]))
      .forEach(([grade, sm]) => {
        const grp = gradeGroupFn(grade)
        if (!byGroup.has(grp)) byGroup.set(grp, new Map())
        byGroup.get(grp)!.set(grade, sm)
      })
    // Empty groups (no sections) are intentionally NOT shown — a group only
    // appears once at least one section falls under it.
    const groupSortKeyDyn = (name: string) => { const i = groupDefs.findIndex(d => d.name === name); return i >= 0 ? i : 99 }
    return new Map([...byGroup.entries()].sort((a, b) => groupSortKeyDyn(a[0]) - groupSortKeyDyn(b[0])))
  }, [sections, search, sortAZ, gradeGroupFn, groupDefs])

  const filteredCount = useMemo(() =>
    Array.from(grouped.values()).reduce((acc, gradeMap) =>
      acc + Array.from(gradeMap.values()).reduce((a, sm) =>
        a + Array.from(sm.values()).reduce((b, secs) => b + secs.length, 0), 0), 0),
    [grouped]
  )

  function update(id: string, patch: Partial<SectionExt>) {
    undoHistory.push(sections)
    setSections(sections.map(s => s.id === id ? { ...s, ...patch } : s))
  }
  function remove(id: string) { undoHistory.push(sections); setSections(sections.filter(s => s.id !== id)) }
  function add(s: SectionExt) { undoHistory.push(sections); setSections([...sections, s as Section]) }
  function bulkAdd(news: SectionExt[]) { undoHistory.push(sections); setSections([...sections, ...news.map(s => s as Section)]) }

  // ── Level mutators (Group / Grade header actions) ───────────────────────────
  /** Delete every section in the given id set (used by grade/group delete). */
  function removeMany(ids: Set<string>) {
    undoHistory.push(sections)
    setSections(sections.filter(s => !ids.has(s.id)))
  }
  /** Rename a grade — updates the grade field AND the "Grade-…" name prefix of its sections. */
  function renameGrade(oldGrade: string, newGrade: string) {
    const trimmed = newGrade.trim().replace(/^grade\s+/i, '')
    if (!trimmed || trimmed === oldGrade) return
    undoHistory.push(sections)
    setSections(sections.map(s => {
      const sec = s as SectionExt
      const g = sec.grade ?? getGrade(s.name)
      if (g !== oldGrade) return s
      const newName = s.name.startsWith(oldGrade + '-')
        ? trimmed + s.name.slice(oldGrade.length)
        : s.name
      return { ...s, grade: trimmed, name: newName } as Section
    }))
  }

  return (
    <div
      style={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}
      onKeyDown={handlePanelKeyDown}
    >
      <ResourceGlobalStyles />
      {/* Toolbar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, paddingBottom: 7, flexShrink: 0 }}>
        {/* Title */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 7, flexShrink: 0 }}>
          <span style={{ fontSize: 13, lineHeight: 1 }}>🎓</span>
          <span style={{ fontSize: 12.5, fontWeight: 700, color: '#111028' }}>Classes</span>
          <span style={{ fontSize: 10, color: P, background: P_L, borderRadius: 10, padding: '1px 7px 2px', fontWeight: 700, border: `1px solid ${P_B}` }}>
            {sections.length}
          </span>
          {search && filteredCount !== sections.length && (
            <span style={{ fontSize: 10, color: '#9896B5', fontWeight: 500 }}>{filteredCount} shown</span>
          )}
        </div>

        <div style={{ width: 1, height: 14, background: '#EAE6FF', flexShrink: 0 }} />

        {/* Search */}
        <div style={{ position: 'relative', width: 260, flexShrink: 0 }}>
          <span style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#C0BBD8', pointerEvents: 'none', fontSize: 13 }}>⌕</span>
          <input
            ref={searchRef}
            value={search} onChange={e => setSearch(e.target.value)}
            onFocus={() => setSearchFocused(true)}
            onBlur={() => setSearchFocused(false)}
            placeholder="Search classes…"
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

        {/* Sort A→Z */}
        <button
          onClick={() => setSortAZ(p => !p)}
          title={sortAZ ? 'Sorted A→Z (click to reset)' : 'Sort classes A→Z within each grade'}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 5, padding: '5px 10px', borderRadius: 7,
            border: `1.5px solid ${sortAZ ? P : '#E4E0FF'}`,
            background: sortAZ ? '#EDE9FF' : '#FAFAFE',
            color: sortAZ ? '#7C6FE0' : '#8B87AD',
            fontSize: 11, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', flexShrink: 0,
          }}
        >↑Z Sort</button>

        {/* Spacer */}
        <div style={{ flex: 1 }} />

        {/* Action buttons */}
        <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
          {onScopeClick && (
            <button
              title="Set availability scope for all classes"
              onClick={e => onScopeClick({ id: '__bulk__' } as unknown as Section, e.currentTarget.getBoundingClientRect())}
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
          <div style={{ position: 'relative' }}>
            <button
              onClick={() => setShowBulk(o => !o)}
              style={{ ...primaryBtn }}
              onMouseEnter={e => (e.currentTarget.style.background = P_D)}
              onMouseLeave={e => (e.currentTarget.style.background = P)}
            >
              <Layers size={13} /> Bulk Create
            </button>
            {showBulk && <BulkCreatePopover onClose={() => setShowBulk(false)} onCreate={bulkAdd} existingStreams={existingStreams} />}
          </div>

          {/* + Stream button */}
          <div style={{ position: 'relative' }}>
            <button
              onClick={() => { setShowStreamCreate(o => !o); setShowBulk(false); setShowAddGroup(false) }}
              style={{
                ...outlineBtn,
                display: 'inline-flex', alignItems: 'center', gap: 5,
                background: showStreamCreate ? P_L : '#fff',
                borderColor: showStreamCreate ? P : '#DDD8FF',
                color: showStreamCreate ? P_D : '#6B6891',
              }}
              title="Create a new stream and add its sections"
              onMouseEnter={e => { e.currentTarget.style.background = P_L; e.currentTarget.style.borderColor = P_B; e.currentTarget.style.color = P_D }}
              onMouseLeave={e => {
                e.currentTarget.style.background = showStreamCreate ? P_L : '#fff'
                e.currentTarget.style.borderColor = showStreamCreate ? P : '#DDD8FF'
                e.currentTarget.style.color = showStreamCreate ? P_D : '#6B6891'
              }}
            >
              + Stream
            </button>
            {showStreamCreate && (
              <StreamCreatePopover
                onClose={() => setShowStreamCreate(false)}
                onCreate={news => { bulkAdd(news); setShowStreamCreate(false) }}
                existingStreams={existingStreams}
              />
            )}
          </div>

          {/* + Group button */}
          <div style={{ position: 'relative' }}>
            <button
              onClick={() => { setShowAddGroup(o => !o); setShowBulk(false); setShowStreamCreate(false) }}
              style={{
                ...outlineBtn,
                display: 'inline-flex', alignItems: 'center', gap: 5,
                background: showAddGroup ? P_L : '#fff',
                borderColor: showAddGroup ? P : '#DDD8FF',
                color: showAddGroup ? P_D : '#6B6891',
              }}
              title="Create a new class group"
              onMouseEnter={e => { e.currentTarget.style.background = P_L; e.currentTarget.style.borderColor = P_B; e.currentTarget.style.color = P_D }}
              onMouseLeave={e => {
                e.currentTarget.style.background = showAddGroup ? P_L : '#fff'
                e.currentTarget.style.borderColor = showAddGroup ? P : '#DDD8FF'
                e.currentTarget.style.color = showAddGroup ? P_D : '#6B6891'
              }}
            >
              + Group
            </button>
            {showAddGroup && (
              <GroupCreatePopover
                onClose={() => setShowAddGroup(false)}
                onConfirm={(name, emoji, grades) => { addGroup(name, emoji, grades); setShowAddGroup(false) }}
              />
            )}
          </div>
        </div>
      </div>

      {importOpen && (
        <ImportModal
          title="Classes"
          sampleHeaders={['Class Name', 'Strength']}
          sampleRows={[
            ['IX-A', '40'],
            ['IX-B', '38'],
            ['X-A',  '42'],
            ['X-B',  '40'],
          ]}
          onImport={handleImport}
          onClose={() => setImportOpen(false)}
        />
      )}

      {/* Table */}
      <div style={TABLE_CARD}>
        {sections.length === 0 && !search && !manual ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '40px 20px', textAlign: 'center' }}>
            <div style={{ fontSize: 30, marginBottom: 8 }}>🎓</div>
            <div style={{ fontSize: 15, fontWeight: 800, color: '#13111E', marginBottom: 6 }}>No classes yet</div>
            <div style={{ fontSize: 12.5, color: '#8B87AD', maxWidth: 420, lineHeight: 1.6, marginBottom: 20 }}>
              Let schedU create starter classes from your class range — pre-primary gets one section, other grades get A–D. Rename and tune afterwards.
            </div>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', justifyContent: 'center' }}>
              <button onClick={smartCreate}
                style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 2, padding: '14px 22px', borderRadius: 12, border: 'none', background: '#7C6FE0', color: '#fff', cursor: 'pointer', fontFamily: 'inherit', minWidth: 200, boxShadow: '0 4px 14px rgba(124,111,224,0.32)' }}>
                <span style={{ fontSize: 14, fontWeight: 800 }}>✨ Let me create smartly</span>
                <span style={{ fontSize: 11.5, opacity: 0.9 }}>Classes for your whole range</span>
              </button>
              <button onClick={() => setManual(true)}
                style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 2, padding: '14px 22px', borderRadius: 12, border: '1px solid #E8E4FF', background: '#fff', color: '#13111E', cursor: 'pointer', fontFamily: 'inherit', minWidth: 200 }}>
                <span style={{ fontSize: 14, fontWeight: 800 }}>✏️ Add manually</span>
                <span style={{ fontSize: 11.5, color: '#8B87AD' }}>Start with a blank table</span>
              </button>
            </div>
          </div>
        ) : sections.length === 0 && !search ? (
          <div style={{ textAlign: 'center', padding: '44px 0' }}>
            <div style={{ fontSize: 28, marginBottom: 7 }}>🎓</div>
            <div style={{ fontSize: 12.5, fontWeight: 700, color: '#9896B5', marginBottom: 4 }}>No classes yet</div>
            <div style={{ fontSize: 11.5, color: '#C4C0DC' }}>Use “Bulk Create”, “+ Stream” or “+ Group” above to add classes.</div>
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
            <colgroup>
              <col style={{ width: '60%' }} />
              <col style={{ width: '10%' }} />
              <col style={{ width: '30%' }} />
            </colgroup>
            <thead>
              <tr>
                <th style={TH}>Class</th>
                <th style={{ ...TH, textAlign: 'center' }}>Strength</th>
                <th style={{ ...TH, textAlign: 'center', whiteSpace: 'nowrap' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {Array.from(grouped.entries()).map(([group, gradeMap]) => {
                const groupSecs = Array.from(gradeMap.values())
                  .flatMap(sm => Array.from(sm.values()).flat())
                const groupIds  = new Set(groupSecs.map(s => s.id))
                const groupCollapsed = collapsedGroups.has(group)
                const groupHdrCell: React.CSSProperties = {
                  padding: '11px 14px',
                  background: 'linear-gradient(90deg, #DDD5FF 0%, #EAE5FF 60%, #F3F0FF 100%)',
                  borderTop: '2px solid #B9ACFA',
                  borderBottom: '1px solid #D4CCFF',
                }
                return (
                  <React.Fragment key={group}>
                    {/* ══ GROUP row (Pre-Primary / Primary / …) ══ */}
                    <tr style={{ userSelect: 'none' }}>
                      <td style={{ ...groupHdrCell, cursor: 'pointer' }} onClick={() => toggleGroup(group)}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span style={{ color: P_D, flexShrink: 0, transition: 'transform 0.18s', transform: groupCollapsed ? 'rotate(0deg)' : 'rotate(180deg)', display: 'flex' }}>
                            <ChevronDown size={17} strokeWidth={2.5} />
                          </span>
                          <span style={{ fontSize: 14 }}>{groupDefs.find(d => d.name === group)?.emoji ?? '🏷️'}</span>
                          <GroupNameCell name={group} onRename={v => renameGroup(group, v)} />
                          <span style={{ fontSize: 11.5, fontWeight: 600, color: '#7C76AC' }}>
                            · {gradeMap.size} grade{gradeMap.size !== 1 ? 's' : ''} · {groupSecs.length} section{groupSecs.length !== 1 ? 's' : ''}
                          </span>
                        </div>
                      </td>
                      <td style={{ ...groupHdrCell, textAlign: 'center' }}>
                        <LevelStrengthTotal
                          secs={groupSecs}
                          title={`Total students across ${groupSecs.length} sections in ${group}`}
                        />
                      </td>
                      <td style={{ ...groupHdrCell, textAlign: 'center' }} onClick={e => e.stopPropagation()}>
                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}>
                          {onScopeClick && (
                            <button
                              title={`Set availability scope for all ${groupSecs.length} sections in ${group}`}
                              onClick={e => onScopeClick(
                                { id: '__bulk__', name: `${group} (${groupSecs.length} sections)`, memberIds: groupSecs.map(s => s.id) } as unknown as Section,
                                e.currentTarget.getBoundingClientRect(),
                              )}
                              style={{ ...actionBtn, gap: 4 }}
                              onMouseEnter={e => { e.currentTarget.style.background = '#fff'; e.currentTarget.style.color = P_D; e.currentTarget.style.borderColor = P_B }}
                              onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#8886A8'; e.currentTarget.style.borderColor = '#DDD8FF' }}
                            >
                              <CalendarRange size={12} /> Scope
                            </button>
                          )}
                          <DeleteActionButton
                            onDelete={() => removeMany(groupIds)}
                            tooltip={`Delete ${group} — removes all ${groupSecs.length} sections`}
                          />
                        </div>
                      </td>
                    </tr>

                    {!groupCollapsed && Array.from(gradeMap.entries()).map(([grade, streamMap]) => {
                      const hasStreams = Array.from(streamMap.keys()).some(k => k !== '')
                      const gradeSecs  = Array.from(streamMap.values()).flat()
                      const gradeIds   = new Set(gradeSecs.map(s => s.id))
                      const gradeCollapsed = collapsedGrades.has(grade)
                      const gradeHdrCell: React.CSSProperties = {
                        padding: '8px 14px 8px 36px',
                        background: 'linear-gradient(90deg, #EFEBFF 0%, #F6F3FF 60%, #FAF9FF 100%)',
                        borderBottom: '1px solid #E4DEFF',
                      }
                      return (
                        <React.Fragment key={grade}>
                          {/* ── Grade row ── */}
                          <tr style={{ userSelect: 'none' }}>
                            <td style={{ ...gradeHdrCell, cursor: 'pointer' }} onClick={() => toggleGrade(grade)}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                <span style={{ color: P, flexShrink: 0, transition: 'transform 0.18s', transform: gradeCollapsed ? 'rotate(0deg)' : 'rotate(180deg)', display: 'flex' }}>
                                  <ChevronDown size={15} strokeWidth={2.5} />
                                </span>
                                <GradeNameCell grade={grade} onRename={v => renameGrade(grade, v)} />
                                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginLeft: 2 }}>
                                  <span style={{ fontSize: 11.5, fontWeight: 500, color: '#9590BF' }}>
                                    · {gradeSecs.length} section{gradeSecs.length !== 1 ? 's' : ''}
                                  </span>
                                  {hasStreams && (
                                    <span style={{
                                      fontSize: 10.5, fontWeight: 700, color: P,
                                      background: '#EDE9FF', border: `1px solid #D4CCFF`,
                                      borderRadius: 20, padding: '1px 8px',
                                    }}>
                                      {streamMap.size} stream{streamMap.size !== 1 ? 's' : ''}
                                    </span>
                                  )}
                                </div>
                              </div>
                            </td>
                            <td style={{ ...gradeHdrCell, textAlign: 'center' }}>
                              <LevelStrengthTotal
                                secs={gradeSecs}
                                title={`Total students across ${gradeSecs.length} sections in Grade ${grade}`}
                              />
                            </td>
                            <td style={{ ...gradeHdrCell, textAlign: 'center' }} onClick={e => e.stopPropagation()}>
                              <div style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}>
                                {onScopeClick && (
                                  <button
                                    title={`Set availability scope for all ${gradeSecs.length} sections in Grade ${grade}`}
                                    onClick={e => onScopeClick(
                                      { id: '__bulk__', name: `Grade ${grade} (${gradeSecs.length} sections)`, memberIds: gradeSecs.map(s => s.id) } as unknown as Section,
                                      e.currentTarget.getBoundingClientRect(),
                                    )}
                                    style={{ ...actionBtn, gap: 4 }}
                                    onMouseEnter={e => { e.currentTarget.style.background = '#fff'; e.currentTarget.style.color = P_D; e.currentTarget.style.borderColor = P_B }}
                                    onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#8886A8'; e.currentTarget.style.borderColor = '#DDD8FF' }}
                                  >
                                    <CalendarRange size={12} /> Scope
                                  </button>
                                )}
                                <DeleteActionButton
                                  onDelete={() => removeMany(gradeIds)}
                                  tooltip={`Delete Grade ${grade} — removes its ${gradeSecs.length} sections`}
                                />
                              </div>
                            </td>
                          </tr>

                          {!gradeCollapsed && Array.from(streamMap.entries()).map(([stream, secs]) => {
                            if (!hasStreams) {
                              // No streams for this grade — render sections directly
                              return secs.map(sec => (
                                <SectionRow
                                  key={sec.id} sec={sec}
                                  onUpdate={p => update(sec.id, p)}
                                  onDelete={() => remove(sec.id)}
                                  onScopeClick={onScopeClick ? (s, rect) => onScopeClick(s as Section, rect) : undefined}
                                  existingStreams={existingStreams}
                                />
                              ))
                            }

                            const streamKey = `${grade}:${stream}`
                            const streamCollapsed = collapsedStreams.has(streamKey)
                            const streamIds = new Set(secs.map(s => s.id))
                            const streamHdrCell: React.CSSProperties = {
                              padding: '7px 14px 7px 42px',
                              background: '#F7F5FF',
                              borderBottom: '1px solid #EBE7FF',
                            }
                            return (
                              <React.Fragment key={stream}>
                                {/* ── Stream row ── */}
                                <tr style={{ userSelect: 'none' }}>
                                  <td style={{ ...streamHdrCell, borderLeft: '3px solid #C4BAFF' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                                      {/* Collapse chevron */}
                                      <span
                                        onClick={() => toggleStream(grade, stream)}
                                        style={{ color: '#9590BF', flexShrink: 0, transition: 'transform 0.18s', transform: streamCollapsed ? 'rotate(0deg)' : 'rotate(180deg)', display: 'flex', cursor: 'pointer' }}
                                      >
                                        <ChevronDown size={13} strokeWidth={2.5} />
                                      </span>

                                      {/* Stream name — always an input so user types directly */}
                                      <StreamNameInput
                                        initial={stream}
                                        onCommit={v => renameStream(grade, stream, v)}
                                        onCancel={() => {}}
                                      />

                                      <span style={{ fontSize: 11, fontWeight: 500, color: '#ADA8CC' }}>
                                        · {secs.length} class{secs.length !== 1 ? 'es' : ''}
                                      </span>
                                    </div>
                                  </td>
                                  <td style={{ ...streamHdrCell, textAlign: 'center' }}>
                                    <LevelStrengthTotal
                                      secs={secs}
                                      title={`Total students across ${secs.length} classes in ${stream}`}
                                    />
                                  </td>
                                  <td style={{ ...streamHdrCell, textAlign: 'center' }}>
                                    <DeleteActionButton
                                      onDelete={() => removeMany(streamIds)}
                                      tooltip={`Delete ${stream} (${grade}) — removes its ${secs.length} classes`}
                                    />
                                  </td>
                                </tr>
                                {!streamCollapsed && secs.map(sec => (
                                  <SectionRow
                                    key={sec.id} sec={sec}
                                    onUpdate={p => update(sec.id, p)}
                                    onDelete={() => remove(sec.id)}
                                    onScopeClick={onScopeClick ? (s, rect) => onScopeClick(s as Section, rect) : undefined}
                                    existingStreams={existingStreams}
                                    indent
                                  />
                                ))}
                              </React.Fragment>
                            )
                          })}
                        </React.Fragment>
                      )
                    })}
                  </React.Fragment>
                )
              })}
              {grouped.size === 0 && search && (
                <tr>
                  <td colSpan={3} style={{ ...TD, textAlign: 'center', color: '#C4C0DC', padding: '18px 10px' }}>
                    No classes match "{search}"
                  </td>
                </tr>
              )}
              <AddRow onAdd={add} existingStreams={existingStreams} />
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
