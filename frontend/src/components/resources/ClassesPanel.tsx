/**
 * ClassesPanel — Tab 1.
 * Columns: Class | Strength | Actions
 * Class Teacher is handled in the Shift & Timing step — not here.
 */

import React, { useState, useRef, useMemo, useEffect, useCallback } from 'react'
import type { Section } from '@/types'
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
      <td style={{ ...TD, paddingLeft: indent ? 44 : undefined }}>
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
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
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

// ─── Inline stream name editor (used inside stream header row) ────────────────
function StreamNameInput({ initial, onCommit, onCancel }: {
  initial: string
  onCommit: (v: string) => void
  onCancel: () => void
}) {
  const [val, setVal] = useState(initial)
  const ref = useRef<HTMLInputElement>(null)
  useEffect(() => { ref.current?.focus(); ref.current?.select() }, [])
  return (
    <input
      ref={ref}
      value={val}
      onChange={e => setVal(e.target.value)}
      onBlur={() => onCommit(val)}
      onKeyDown={e => {
        if (e.key === 'Enter') { e.preventDefault(); onCommit(val) }
        if (e.key === 'Escape') { e.preventDefault(); onCancel() }
      }}
      placeholder="Full stream name…"
      style={{
        fontSize: 12, fontWeight: 700, color: '#6B64A8',
        border: '1.5px solid #C4BAFF', borderRadius: 6,
        padding: '2px 8px', outline: 'none', background: '#fff',
        fontFamily: 'inherit', width: 160,
      }}
    />
  )
}

// ─── Main export ──────────────────────────────────────────────────────────────
export function ClassesPanel({ sections, setSections, onScopeClick }: {
  sections: Section[]
  setSections: (s: Section[]) => void
  onScopeClick?: (sec: Section, rect: DOMRect) => void
}) {
  const [search, setSearch]         = useState('')
  const [showBulk, setShowBulk]     = useState(false)
  const [importOpen, setImportOpen] = useState(false)
  const [searchFocused, setSearchFocused] = useState(false)
  const searchRef   = useRef<HTMLInputElement>(null)
  const undoHistory = useUndoHistory<Section[]>()

  const handlePanelKeyDown = useCallback((e: React.KeyboardEvent) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
      const prev = undoHistory.undo()
      if (prev !== undefined) { e.preventDefault(); setSections(prev) }
    }
  }, [undoHistory, setSections])

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

  // Rename a stream: update sec.stream on every section in that grade+stream group
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
    }))
    setEditingStreamKey(null)
  }

  // grouped: grade → stream ('' if none) → sections
  const grouped = useMemo(() => {
    const q = search.toLowerCase()
    const filtered = sections.filter(s => !q || s.name.toLowerCase().includes(q))
    const map = new Map<string, Map<string, SectionExt[]>>()
    filtered.forEach(s => {
      const sec = s as SectionExt
      const grade = sec.grade ?? getGrade(s.name)
      // Prefer explicit stream field; fall back to name-parsing for legacy data
      const stream = sec.stream ?? getStreamFromName(s.name, grade) ?? ''
      if (!map.has(grade)) map.set(grade, new Map())
      const sm = map.get(grade)!
      if (!sm.has(stream)) sm.set(stream, [])
      sm.get(stream)!.push(sec)
    })
    const sorted = new Map([...map.entries()].sort((a, b) => gradeKey(a[0]) - gradeKey(b[0])))
    if (sortAZ) {
      sorted.forEach(sm => {
        sm.forEach((secs, stream) => sm.set(stream, [...secs].sort((a, b) => a.name.localeCompare(b.name))))
      })
    }
    return sorted
  }, [sections, search, sortAZ])

  const filteredCount = useMemo(() =>
    Array.from(grouped.values()).reduce((a, sm) =>
      a + Array.from(sm.values()).reduce((b, secs) => b + secs.length, 0), 0),
    [grouped]
  )

  function update(id: string, patch: Partial<SectionExt>) {
    undoHistory.push(sections)
    setSections(sections.map(s => s.id === id ? { ...s, ...patch } : s))
  }
  function remove(id: string) { undoHistory.push(sections); setSections(sections.filter(s => s.id !== id)) }
  function add(s: SectionExt) { undoHistory.push(sections); setSections([...sections, s as Section]) }
  function bulkAdd(news: SectionExt[]) { undoHistory.push(sections); setSections([...sections, ...news.map(s => s as Section)]) }

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
            color: sortAZ ? '#7C3AED' : '#8B87AD',
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
        {sections.length === 0 && !search ? (
          <div style={{ textAlign: 'center', padding: '44px 0' }}>
            <div style={{ fontSize: 28, marginBottom: 7 }}>🎓</div>
            <div style={{ fontSize: 12.5, fontWeight: 700, color: '#9896B5', marginBottom: 4 }}>No classes yet</div>
            <div style={{ fontSize: 11.5, color: '#C4C0DC' }}>Use "Bulk Create" to generate grade sections quickly.</div>
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
            <colgroup>
              <col />                             {/* Class: gets remaining ~50% */}
              <col style={{ width: '25%' }} />    {/* Strength */}
              <col style={{ width: '22%' }} />    {/* Actions */}
            </colgroup>
            <thead>
              <tr>
                <th style={TH}>Class</th>
                <th style={{ ...TH, textAlign: 'center' }}>Strength</th>
                <th style={{ ...TH, textAlign: 'center' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {Array.from(grouped.entries()).map(([grade, streamMap]) => {
                const hasStreams = Array.from(streamMap.keys()).some(k => k !== '')
                const totalSecs = Array.from(streamMap.values()).reduce((a, s) => a + s.length, 0)
                const gradeCollapsed = collapsedGrades.has(grade)
                return (
                  <React.Fragment key={grade}>
                    {/* ── Grade row ── */}
                    <tr
                      onClick={() => toggleGrade(grade)}
                      style={{ cursor: 'pointer', userSelect: 'none' }}
                      onMouseEnter={e => (e.currentTarget.style.filter = 'brightness(0.97)')}
                      onMouseLeave={e => (e.currentTarget.style.filter = '')}
                    >
                      <td colSpan={3} style={{
                        padding: '10px 14px',
                        background: 'linear-gradient(90deg, #EAE5FF 0%, #F3F0FF 55%, #F9F8FF 100%)',
                        borderTop: '2px solid #D4CCFF',
                        borderBottom: '1px solid #DDD8FF',
                      }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span style={{ color: P, flexShrink: 0, transition: 'transform 0.18s', transform: gradeCollapsed ? 'rotate(0deg)' : 'rotate(180deg)', display: 'flex' }}>
                            <ChevronDown size={16} strokeWidth={2.5} />
                          </span>
                          <span style={{ fontSize: 13, fontWeight: 800, letterSpacing: '0.04em', color: P_D, textTransform: 'uppercase' }}>
                            Grade {grade}
                          </span>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginLeft: 2 }}>
                            <span style={{ fontSize: 11.5, fontWeight: 500, color: '#9590BF' }}>
                              · {totalSecs} section{totalSecs !== 1 ? 's' : ''}
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
                      return (
                        <React.Fragment key={stream}>
                          {/* ── Stream row ── */}
                          <tr style={{ userSelect: 'none' }}>
                            <td colSpan={3} style={{
                              padding: '8px 14px 8px 36px',
                              background: '#F7F5FF',
                              borderBottom: '1px solid #EBE7FF',
                              borderLeft: '3px solid #C4BAFF',
                            }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                                {/* Collapse chevron */}
                                <span
                                  onClick={() => toggleStream(grade, stream)}
                                  style={{ color: '#9590BF', flexShrink: 0, transition: 'transform 0.18s', transform: streamCollapsed ? 'rotate(0deg)' : 'rotate(180deg)', display: 'flex', cursor: 'pointer' }}
                                >
                                  <ChevronDown size={13} strokeWidth={2.5} />
                                </span>

                                {/* Inline-editable stream name */}
                                {editingStreamKey === streamKey ? (
                                  <StreamNameInput
                                    initial={stream}
                                    onCommit={v => renameStream(grade, stream, v)}
                                    onCancel={() => setEditingStreamKey(null)}
                                  />
                                ) : (
                                  <span
                                    onClick={() => setEditingStreamKey(streamKey)}
                                    title="Click to rename this stream"
                                    style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.01em', color: '#6B64A8', cursor: 'text', borderRadius: 4, padding: '1px 4px' }}
                                    onMouseEnter={e => (e.currentTarget.style.background = '#EDE9FF')}
                                    onMouseLeave={e => (e.currentTarget.style.background = '')}
                                  >
                                    {stream}
                                  </span>
                                )}

                                <span style={{ fontSize: 11, fontWeight: 500, color: '#ADA8CC' }}>
                                  · {secs.length} class{secs.length !== 1 ? 'es' : ''}
                                </span>
                              </div>
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
