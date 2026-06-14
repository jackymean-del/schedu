/**
 * RoomsPanel — Tab 4.
 * Rooms are grouped under a Block / Building / Area header (collapsible), mirroring
 * the Classes tab's grade grouping. Each block holds many rooms/venues; each room can
 * be assigned to multiple classes. The block label uses the Classroom.building field.
 * Columns: Room | Type | Cap | Assigned Classes | Special Subjects | [ Delete ]
 */

import React, { useState, useRef, useMemo, useEffect, useCallback } from 'react'
import type { Subject, Section } from '@/types'
import type { RoomRow } from '@/components/master/EntityGrids'
import { Plus, Building2, CalendarRange, ChevronDown } from 'lucide-react'
import {
  P, P_D, P_L, P_B,
  TH, TD, TABLE_CARD,
  InlineChipSelect, ImportModal,
  DeleteActionButton, outlineBtn, actionBtn,
  ResourceGlobalStyles, useUndoHistory, SmartEmptyState,
} from './shared'
import type { ChipOption } from './shared'
import { seedStandardRooms } from './aiEngine'

export type RoomExt = RoomRow & { subjectMappings?: string[]; notes?: string }

function makeId() { return Math.random().toString(36).slice(2, 9) }

const DEFAULT_BLOCK = 'Main Block'
/** Normalise a room's block label (empty → default) for grouping/display. */
function blockOf(r: RoomExt): string { return (r.building || '').trim() || DEFAULT_BLOCK }

function getGrade(name: string): string {
  const t = name.trim()
  const idx = t.lastIndexOf('-')
  if (idx > 0 && t.slice(idx + 1).length <= 3)
    return t.slice(0, idx).replace(/-(sci|com|arts?|hum|gen|pcm|pcb)$/i, '').trim()
  return t
}
const GRADE_ORDER = ['Nursery','LKG','UKG','I','II','III','IV','V','VI','VII','VIII','IX','X','XI','XII']
function gradeKey(g: string) { const i = GRADE_ORDER.indexOf(g); return i >= 0 ? i : 100 + g.charCodeAt(0) }

const ROOM_TYPES = ['Classroom','Lab','Computer Lab','Library','Hall','Gym','Staff Room','Other']
const TYPE_META: Record<string, { color: string }> = {
  Classroom:      { color: '#3B82F6' },
  Lab:            { color: '#EF4444' },
  'Computer Lab': { color: '#10B981' },
  Library:        { color: '#F59E0B' },
  Hall:           { color: '#8B5CF6' },
  Gym:            { color: '#14B8A6' },
  'Staff Room':   { color: '#6B7280' },
  Other:          { color: '#7C6FE0' },
}

const inp: React.CSSProperties = {
  padding: '3px 7px', border: '1px solid #E4E0FF', borderRadius: 5,
  fontSize: 12, color: '#111028', outline: 'none', fontFamily: 'inherit', background: '#FAFAFE',
  boxSizing: 'border-box' as const,
}

// ─── Inline name cell ─────────────────────────────────────────────────────────
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
      style={{ ...inp, width: '100%', fontWeight: 600 }}
    />
  )
  return (
    <span onClick={() => setE(true)} title="Click to edit"
      style={{ cursor: 'text', fontWeight: 600, fontSize: 12.5, color: '#111028', padding: '2px 4px', borderRadius: 4, display: 'inline-block' }}
      onMouseEnter={ev => (ev.currentTarget.style.background = '#F0ECFE')}
      onMouseLeave={ev => (ev.currentTarget.style.background = '')}
    >{value}</span>
  )
}

// ─── Block move pill (next to room name) ──────────────────────────────────────
function BlockPill({ block, blocks, onMove }: {
  block: string
  blocks: string[]
  onMove: (b: string) => void
}) {
  const [editing, setEditing] = useState(false)
  const [val, setVal] = useState(block)
  const ref = useRef<HTMLInputElement>(null)
  const listId = useRef('room-block-' + makeId()).current
  useEffect(() => { if (editing) ref.current?.focus() }, [editing])
  useEffect(() => { setVal(block) }, [block])
  function commit() { const v = val.trim(); if (v && v !== block) onMove(v); setEditing(false) }
  if (editing) return (
    <>
      <input ref={ref} value={val} onChange={e => setVal(e.target.value)} onBlur={commit}
        onKeyDown={e => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') { setVal(block); setEditing(false) } }}
        list={listId} placeholder="Block / Building…"
        style={{ ...inp, fontSize: 10.5, width: 130, padding: '2px 6px' }} />
      <datalist id={listId}>{blocks.map(b => <option key={b} value={b} />)}</datalist>
    </>
  )
  return (
    <span onClick={() => { setVal(block); setEditing(true) }} title="Move to another block / building"
      style={{
        fontSize: 10, fontWeight: 600, color: '#7C78AA', background: '#F4F2FF',
        border: '1px dashed #C4BAFF', borderRadius: 20, padding: '1px 8px',
        cursor: 'pointer', whiteSpace: 'nowrap', display: 'inline-flex', alignItems: 'center', gap: 3,
      }}
      onMouseEnter={e => { e.currentTarget.style.background = P_L; e.currentTarget.style.borderColor = P }}
      onMouseLeave={e => { e.currentTarget.style.background = '#F4F2FF'; e.currentTarget.style.borderColor = '#C4BAFF' }}
    ><Building2 size={9} /> {block}</span>
  )
}

// ─── Block header name input (mirrors Classes stream header) ───────────────────
function BlockNameInput({ initial, onCommit }: { initial: string; onCommit: (v: string) => void }) {
  const [val, setVal] = useState(initial)
  useEffect(() => { setVal(initial) }, [initial])
  return (
    <input
      value={val}
      onChange={e => setVal(e.target.value)}
      onClick={e => e.stopPropagation()}
      onBlur={() => { if (val.trim() && val.trim() !== initial) onCommit(val.trim()) }}
      onKeyDown={e => {
        if (e.key === 'Enter') { e.preventDefault(); if (val.trim()) onCommit(val.trim()) }
        if (e.key === 'Escape') { e.preventDefault(); setVal(initial) }
      }}
      title="Rename this block / building / area"
      style={{
        fontSize: 13, fontWeight: 800, letterSpacing: '0.03em',
        color: P_D, border: `1.5px solid transparent`, background: 'transparent',
        borderRadius: 6, padding: '2px 8px', outline: 'none', fontFamily: 'inherit', width: 200,
        transition: 'border-color 0.15s, background 0.15s',
      }}
      onFocus={e => { e.currentTarget.style.borderColor = P; e.currentTarget.style.background = '#fff' }}
      onBlurCapture={e => { e.currentTarget.style.borderColor = 'transparent'; e.currentTarget.style.background = 'transparent' }}
    />
  )
}

// ─── Add row ──────────────────────────────────────────────────────────────────
function AddRow({ onAdd, defaultBlock, blocks }: {
  onAdd: (r: RoomExt) => void
  defaultBlock: string
  blocks: string[]
}) {
  const [active, setActive] = useState(false)
  const [name, setName]   = useState('')
  const [type, setType]   = useState('Classroom')
  const [cap, setCap]     = useState(40)
  const [block, setBlock] = useState(defaultBlock)
  const ref = useRef<HTMLInputElement>(null)
  const listId = useRef('add-room-block-' + makeId()).current
  useEffect(() => { if (active) ref.current?.focus() }, [active])
  useEffect(() => { setBlock(defaultBlock) }, [defaultBlock])

  function commit() {
    if (!name.trim()) { setActive(false); return }
    onAdd({ id: makeId(), name: name.trim(), type, capacity: cap, building: block.trim() || DEFAULT_BLOCK, floor: '', subjectMappings: [], notes: '' })
    setName(''); setType('Classroom'); setCap(40); setBlock(defaultBlock); setActive(false)
  }

  if (!active) return (
    <tr>
      <td colSpan={6} style={{ ...TD, padding: '8px 12px 8px 36px' }}>
        <button onClick={() => setActive(true)}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 5, background: 'none', border: '1px dashed #C8C2F0', borderRadius: 6, color: P, fontSize: 12, fontWeight: 600, padding: '4px 11px', cursor: 'pointer', fontFamily: 'inherit' }}>
          <Plus size={13} /> Add Room {defaultBlock !== DEFAULT_BLOCK ? `to ${defaultBlock}` : ''}
        </button>
      </td>
    </tr>
  )

  return (
    <tr style={{ background: '#FAFAFE' }}>
      <td style={TD}>
        <input ref={ref} value={name} onChange={e => setName(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') setActive(false) }}
          placeholder="Room name" style={{ ...inp, width: '100%' }}
        />
      </td>
      <td style={TD}>
        <select value={type} onChange={e => setType(e.target.value)} style={{ ...inp, width: '100%' }}>
          {ROOM_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
      </td>
      <td style={TD}>
        <input type="number" value={cap} onChange={e => setCap(+e.target.value)} min={1} max={999}
          style={{ ...inp, width: '100%', textAlign: 'center' }} />
      </td>
      <td style={TD}>
        <input value={block} onChange={e => setBlock(e.target.value)} list={listId}
          placeholder="Block / Building" style={{ ...inp, width: '100%' }} />
        <datalist id={listId}>{blocks.map(b => <option key={b} value={b} />)}</datalist>
      </td>
      <td colSpan={2} style={{ ...TD, whiteSpace: 'nowrap' }}>
        <button onClick={commit} style={{ background: P, color: '#fff', border: 'none', borderRadius: 5, padding: '5px 13px', fontSize: 12, fontWeight: 700, cursor: 'pointer', marginRight: 6, fontFamily: 'inherit' }}>✓ Add</button>
        <button onClick={() => setActive(false)} style={{ background: '#F0F0F0', color: '#888', border: 'none', borderRadius: 5, padding: '5px 10px', fontSize: 12, cursor: 'pointer', fontFamily: 'inherit' }}>✗</button>
      </td>
    </tr>
  )
}

// ─── Room row ─────────────────────────────────────────────────────────────────
function RoomRow_({ room, blocks, classOpts, subjectOpts, assignedClasses, onUpdate, onUpdateSections, onDelete, onScopeClick }: {
  room: RoomExt
  blocks: string[]
  classOpts: ChipOption[]
  subjectOpts: ChipOption[]
  assignedClasses: string[]
  onUpdate: (p: Partial<RoomExt>) => void
  onUpdateSections: (add: string[], remove: string[]) => void
  onDelete: () => void
  onScopeClick?: (room: RoomExt, rect: DOMRect) => void
}) {
  const meta = TYPE_META[room.type] ?? TYPE_META.Other

  function handleClassChange(next: string[]) {
    const prev    = assignedClasses
    const toAdd    = next.filter(v => !prev.includes(v))
    const toRemove = prev.filter(v => !next.includes(v))
    onUpdateSections(toAdd, toRemove)
  }

  return (
    <tr
      style={{ transition: 'background 0.08s' }}
      onMouseEnter={e => (e.currentTarget.style.background = '#F6F4FF')}
      onMouseLeave={e => (e.currentTarget.style.background = '')}
    >
      {/* Name + block pill */}
      <td style={{ ...TD, paddingLeft: 36 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap' }}>
          <NameCell value={room.name} onSave={v => onUpdate({ name: v })} />
          <BlockPill block={blockOf(room)} blocks={blocks} onMove={b => onUpdate({ building: b })} />
        </div>
      </td>

      {/* Type — colored badge select */}
      <td style={TD}>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
          <span style={{ width: 7, height: 7, borderRadius: '50%', background: meta.color, flexShrink: 0 }} />
          <select
            value={room.type}
            onChange={e => onUpdate({ type: e.target.value })}
            style={{
              padding: '3px 6px',
              border: `1px solid ${meta.color}44`,
              borderRadius: 5, fontSize: 11.5, fontWeight: 600,
              color: meta.color, outline: 'none',
              background: `${meta.color}0d`,
              cursor: 'pointer', fontFamily: 'inherit',
            }}
          >
            {ROOM_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
      </td>

      {/* Capacity */}
      <td style={{ ...TD }}>
        <input type="number" value={room.capacity} min={1} max={999}
          onChange={e => onUpdate({ capacity: +e.target.value })}
          className="rp-inp rp-num"
          style={{ width: '100%', padding: '3px 5px', border: '1px solid #E4E0FF', borderRadius: 5, fontSize: 12.5, fontWeight: 600, color: '#444', outline: 'none', textAlign: 'center', background: '#FAFAFE', boxSizing: 'border-box' as const, fontFamily: 'inherit' }}
        />
      </td>

      {/* Assigned Classes — 3 chips visible, +N more on overflow */}
      <td style={{ ...TD, paddingTop: 5, paddingBottom: 5 }}>
        <InlineChipSelect
          selected={assignedClasses}
          options={classOpts}
          onChange={handleClassChange}
          placeholder="+ Assign class"
          maxChips={3}
        />
      </td>

      {/* Special Subjects — 3 chips visible, +N more on overflow */}
      <td style={{ ...TD, paddingTop: 5, paddingBottom: 5 }}>
        <InlineChipSelect
          selected={room.subjectMappings ?? []}
          options={subjectOpts}
          onChange={v => onUpdate({ subjectMappings: v })}
          placeholder="+ Special subjects"
          maxChips={3}
        />
      </td>

      {/* Actions */}
      <td style={{ ...TD, textAlign: 'center', whiteSpace: 'nowrap' }}>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4, flexWrap: 'nowrap' }}>
          {onScopeClick && (
            <button
              title="Set availability scope for this room"
              onClick={e => onScopeClick(room, e.currentTarget.getBoundingClientRect())}
              style={{ ...actionBtn, minWidth: 0, gap: 4, padding: '5px 10px' }}
              onMouseEnter={e => { e.currentTarget.style.background = P_L; e.currentTarget.style.color = P_D; e.currentTarget.style.borderColor = P_B }}
              onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#8886A8'; e.currentTarget.style.borderColor = '#DDD8FF' }}
            >
              <CalendarRange size={12} /> Scope
            </button>
          )}
          <DeleteActionButton onDelete={onDelete} tooltip="Delete room" />
        </div>
      </td>
    </tr>
  )
}

// ─── Main export ──────────────────────────────────────────────────────────────
export function RoomsPanel({ rooms, setRooms, sections, setSections, subjects, onScopeClick, onAIFix, aiLoading, aiApplied }: {
  rooms: RoomExt[]
  setRooms: (r: RoomExt[]) => void
  sections: Section[]
  setSections: (s: Section[]) => void
  subjects: Subject[]
  onScopeClick?: (room: RoomExt, rect: DOMRect) => void
  onAIFix?: () => void
  aiLoading?: boolean
  aiApplied?: boolean
}) {
  const [search, setSearch]         = useState('')
  const [importOpen, setImportOpen] = useState(false)
  const [searchFocused, setSearchFocused] = useState(false)
  const [manualMode, setManualMode] = useState(false)
  const [collapsedBlocks, setCollapsedBlocks] = useState<Set<string>>(new Set())
  const searchRef   = useRef<HTMLInputElement>(null)
  const undoHistory = useUndoHistory<RoomExt[]>()

  // Smart-create rooms: a homeroom per section + special rooms (labs, library)
  // implied by the subjects present, with lab→subject mappings pre-wired.
  function handleSmartCreate() {
    if (!sections.length) return
    undoHistory.push(rooms)
    setRooms(seedStandardRooms(sections, subjects))
  }

  const handlePanelKeyDown = useCallback((e: React.KeyboardEvent) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
      const prev = undoHistory.undo()
      if (prev !== undefined) { e.preventDefault(); setRooms(prev) }
    }
  }, [undoHistory, setRooms])

  function handleImport(rows: string[][]) {
    const newRooms = rows
      .map(cells => ({
        id: makeId(),
        name: cells[0]?.trim() || '',
        type: cells[1]?.trim() || 'Classroom',
        capacity: parseInt(cells[2]) || 40,
        building: cells[3]?.trim() || DEFAULT_BLOCK, floor: '',
        subjectMappings: [], notes: '',
      } as RoomExt))
      .filter(r => r.name)
    if (newRooms.length) setRooms([...rooms, ...newRooms])
  }

  const [sortAZ, setSortAZ] = useState(false)

  // All block names currently in use (for datalists + the "+ Block" affordance)
  const blocks = useMemo(() => {
    const set = new Set<string>(rooms.map(blockOf))
    set.add(DEFAULT_BLOCK)
    return [...set].sort((a, b) => a === DEFAULT_BLOCK ? -1 : b === DEFAULT_BLOCK ? 1 : a.localeCompare(b))
  }, [rooms])

  // grouped: block → rooms[]  (respects search + sort)
  const grouped = useMemo(() => {
    const q = search.toLowerCase()
    const base = !q ? rooms : rooms.filter(r => r.name.toLowerCase().includes(q) || r.type.toLowerCase().includes(q) || blockOf(r).toLowerCase().includes(q))
    const map = new Map<string, RoomExt[]>()
    base.forEach(r => {
      const b = blockOf(r)
      if (!map.has(b)) map.set(b, [])
      map.get(b)!.push(r)
    })
    const sorted = new Map([...map.entries()].sort((a, b) =>
      a[0] === DEFAULT_BLOCK ? -1 : b[0] === DEFAULT_BLOCK ? 1 : a[0].localeCompare(b[0])))
    if (sortAZ) sorted.forEach((rs, b) => sorted.set(b, [...rs].sort((x, y) => x.name.localeCompare(y.name))))
    return sorted
  }, [rooms, search, sortAZ])

  const shownCount = useMemo(() => Array.from(grouped.values()).reduce((a, rs) => a + rs.length, 0), [grouped])

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

  const subjectOpts = useMemo<ChipOption[]>(
    () => subjects.map(s => ({ value: s.name, label: s.name })),
    [subjects]
  )

  const roomClassMap = useMemo(() => {
    const map = new Map<string, string[]>()
    rooms.forEach(r => map.set(r.name, []))
    sections.forEach(s => {
      if (s.room && map.has(s.room)) map.get(s.room)!.push(s.name)
    })
    return map
  }, [rooms, sections])

  function updateRoom(id: string, p: Partial<RoomExt>) {
    undoHistory.push(rooms)
    setRooms(rooms.map(r => r.id === id ? { ...r, ...p } : r))
  }

  function updateSections(roomName: string, toAdd: string[], toRemove: string[]) {
    setSections(sections.map(s => {
      if (toAdd.includes(s.name))    return { ...s, room: roomName }
      if (toRemove.includes(s.name)) return { ...s, room: '' }
      return s
    }))
  }

  function removeRoom(id: string) {
    undoHistory.push(rooms)
    const room = rooms.find(r => r.id === id)
    if (room) setSections(sections.map(s => s.room === room.name ? { ...s, room: '' } : s))
    setRooms(rooms.filter(r => r.id !== id))
  }

  function addRoom(r: RoomExt) { undoHistory.push(rooms); setRooms([...rooms, r]) }

  // Rename a whole block → move every room in it to the new label.
  function renameBlock(oldName: string, newName: string) {
    const trimmed = newName.trim()
    if (!trimmed || trimmed === oldName) return
    undoHistory.push(rooms)
    setRooms(rooms.map(r => blockOf(r) === oldName ? { ...r, building: trimmed } : r))
  }

  // Add a brand-new block: seed it with one room so it persists (blocks are derived
  // from rooms' building field), then the user renames the room.
  function addBlock() {
    const base = 'New Block'
    let name = base; let n = 2
    while (blocks.includes(name)) { name = `${base} ${n++}` }
    undoHistory.push(rooms)
    setRooms([...rooms, { id: makeId(), name: 'Room 1', type: 'Classroom', capacity: 40, building: name, floor: '', subjectMappings: [], notes: '' } as RoomExt])
  }

  function toggleBlock(b: string) {
    setCollapsedBlocks(prev => { const next = new Set(prev); next.has(b) ? next.delete(b) : next.add(b); return next })
  }

  return (
    <div
      style={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}
      onKeyDown={handlePanelKeyDown}
    >
      <ResourceGlobalStyles />
      {/* Toolbar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, paddingBottom: 7, flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7, flexShrink: 0 }}>
          <Building2 size={13} color={P} />
          <span style={{ fontSize: 12.5, fontWeight: 700, color: '#111028' }}>Rooms</span>
          <span style={{ fontSize: 10, color: P, background: P_L, borderRadius: 4, padding: '1px 6px 2px', fontWeight: 700, border: `1px solid ${P_B}` }}>
            {rooms.length}
          </span>
          {search && shownCount !== rooms.length && (
            <span style={{ fontSize: 10, color: '#9896B5', fontWeight: 500 }}>{shownCount} shown</span>
          )}
        </div>
        <div style={{ width: 1, height: 14, background: '#EAE6FF', flexShrink: 0 }} />
        <div style={{ position: 'relative', width: 240, flexShrink: 0 }}>
          <span style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#C0BBD8', pointerEvents: 'none', fontSize: 13 }}>⌕</span>
          <input
            ref={searchRef}
            value={search} onChange={e => setSearch(e.target.value)}
            onFocus={() => setSearchFocused(true)}
            onBlur={() => setSearchFocused(false)}
            placeholder="Search rooms or blocks…"
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
          title={sortAZ ? 'Sorted A→Z (click to reset)' : 'Sort rooms A→Z within each block'}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 5, padding: '5px 10px', borderRadius: 7,
            border: `1.5px solid ${sortAZ ? P : '#E4E0FF'}`,
            background: sortAZ ? '#EDE9FF' : '#FAFAFE',
            color: sortAZ ? '#7C6FE0' : '#8B87AD',
            fontSize: 11, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', flexShrink: 0,
          }}
        >↑Z Sort</button>
        <div style={{ flex: 1 }} />
        <div style={{ display: 'flex', gap: 5, flexShrink: 0, alignItems: 'center' }}>
          <button
            onClick={addBlock}
            title="Add a new block / building / area"
            style={outlineBtn}
            onMouseEnter={e => { e.currentTarget.style.background = P_L; e.currentTarget.style.borderColor = P_B; e.currentTarget.style.color = P_D }}
            onMouseLeave={e => { e.currentTarget.style.background = '#fff'; e.currentTarget.style.borderColor = '#DDD8FF'; e.currentTarget.style.color = '#6B6891' }}
          ><Building2 size={12} style={{ display: 'inline', verticalAlign: 'middle', marginRight: 4 }} />+ Block</button>
          {onScopeClick && (
            <button
              title="Set availability scope for all rooms"
              onClick={e => onScopeClick({ id: '__bulk__' } as unknown as RoomExt, e.currentTarget.getBoundingClientRect())}
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
            <button
              onClick={aiLoading ? undefined : onAIFix}
              disabled={aiLoading}
              title="AI-assign classes and subjects to all rooms"
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 5,
                background: aiApplied ? '#059669' : aiLoading ? '#9b8fef' : P,
                color: '#fff', border: 'none', borderRadius: 7,
                padding: '6px 14px', fontSize: 11.5, fontWeight: 700,
                cursor: aiLoading ? 'not-allowed' : 'pointer', fontFamily: 'inherit',
                boxShadow: '0 2px 6px rgba(124,111,224,0.28)',
                whiteSpace: 'nowrap', height: 34, boxSizing: 'border-box' as const,
                opacity: aiLoading ? 0.85 : 1,
                transition: 'background 0.2s',
              }}
            >
              {aiLoading
                ? <><span style={{ display:'inline-block', width:10, height:10, border:'2px solid rgba(255,255,255,0.4)', borderTopColor:'#fff', borderRadius:'50%', animation:'spin 0.7s linear infinite' }} />Applying…</>
                : aiApplied
                  ? <>✓ Applied</>
                  : <>⚡ AI Fix</>
              }
            </button>
          )}
          <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
        </div>
      </div>

      {/* Helper hint */}
      <div style={{ flexShrink: 0, fontSize: 11, color: '#8B87AD', margin: '0 0 7px 2px', lineHeight: 1.5 }}>
        Group rooms by <strong style={{ color: P_D }}>block / building / area</strong> so timetabling knows which classes share a location.
        Click a block name to rename it; use the pill beside a room to move it. Skipping this is fine — everything stays in “{DEFAULT_BLOCK}”.
      </div>

      {importOpen && (
        <ImportModal
          title="Rooms"
          sampleHeaders={['Room Name', 'Type', 'Capacity', 'Block / Building']}
          sampleRows={[
            ['Room 101',    'Classroom',    '40', 'Main Block'],
            ['Room 102',    'Classroom',    '40', 'Main Block'],
            ['Chem Lab',    'Lab',          '30', 'Science Block'],
            ['Computer Lab','Computer Lab', '35', 'Science Block'],
            ['Library',     'Library',      '60', 'Main Block'],
          ]}
          onImport={handleImport}
          onClose={() => setImportOpen(false)}
        />
      )}

      {/* Table */}
      <div style={TABLE_CARD}>
        {rooms.length === 0 && !search && !manualMode ? (
          <SmartEmptyState
            icon={<Building2 size={26} color={P} />}
            title="No rooms yet"
            subtitle={sections.length === 0
              ? 'Add classes first — then schedU can lay out a homeroom for each plus the labs your subjects need, or you can add rooms by hand.'
              : `Let schedU lay out a starter set — one homeroom per class for your ${sections.length} section${sections.length !== 1 ? 's' : ''}, plus the special rooms your subjects need (Computer Lab, science labs, Library) with subject mappings wired.`}
            smartLabel="Let me create smartly"
            smartSubtext={sections.length > 0 ? `Homerooms + labs for ${sections.length} class${sections.length !== 1 ? 'es' : ''}` : undefined}
            onSmart={handleSmartCreate}
            smartDisabled={sections.length === 0}
            smartDisabledHint="Add at least one class first — a homeroom is created per section."
            manualLabel="Add manually"
            manualSubtext="Start with a blank table"
            onManual={() => setManualMode(true)}
          />
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
            <colgroup>
              <col style={{ width: '24%' }} />  {/* Room + block pill */}
              <col style={{ width: '13%' }} />  {/* Type */}
              <col style={{ width: '6%' }} />   {/* Cap */}
              <col style={{ width: '25%' }} />  {/* Assigned Classes */}
              <col style={{ width: '20%' }} />  {/* Special Subjects */}
              <col style={{ width: '12%' }} />  {/* Actions */}
            </colgroup>
            <thead>
              <tr>
                <th style={TH}>Room</th>
                <th style={TH}>Type</th>
                <th style={{ ...TH, textAlign: 'center' }}>Cap</th>
                <th style={TH}>Assigned Classes</th>
                <th style={TH}>Special Subjects</th>
                <th style={{ ...TH, textAlign: 'center', whiteSpace: 'nowrap' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {Array.from(grouped.entries()).map(([block, blockRooms]) => {
                const collapsed = collapsedBlocks.has(block)
                return (
                  <React.Fragment key={block}>
                    {/* ── Block header ── */}
                    <tr>
                      <td colSpan={6} style={{
                        padding: '8px 14px',
                        background: 'linear-gradient(90deg, #EAE5FF 0%, #F3F0FF 55%, #F9F8FF 100%)',
                        borderTop: '2px solid #D4CCFF',
                        borderBottom: '1px solid #DDD8FF',
                      }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <span onClick={() => toggleBlock(block)}
                            style={{ color: P, flexShrink: 0, transition: 'transform 0.18s', transform: collapsed ? 'rotate(0deg)' : 'rotate(180deg)', display: 'flex', cursor: 'pointer' }}>
                            <ChevronDown size={16} strokeWidth={2.5} />
                          </span>
                          <Building2 size={13} color={P_D} style={{ flexShrink: 0 }} />
                          <BlockNameInput initial={block} onCommit={v => renameBlock(block, v)} />
                          <span style={{ fontSize: 11.5, fontWeight: 500, color: '#9590BF' }}>
                            · {blockRooms.length} room{blockRooms.length !== 1 ? 's' : ''}
                          </span>
                        </div>
                      </td>
                    </tr>

                    {!collapsed && blockRooms.map(room => (
                      <RoomRow_
                        key={room.id}
                        room={room}
                        blocks={blocks}
                        classOpts={classOpts}
                        subjectOpts={subjectOpts}
                        assignedClasses={roomClassMap.get(room.name) ?? []}
                        onUpdate={p => updateRoom(room.id, p)}
                        onUpdateSections={(add, rem) => updateSections(room.name, add, rem)}
                        onDelete={() => removeRoom(room.id)}
                        onScopeClick={onScopeClick ? (r, rect) => onScopeClick(r, rect) : undefined}
                      />
                    ))}
                    {!collapsed && <AddRow onAdd={addRoom} defaultBlock={block} blocks={blocks} />}
                  </React.Fragment>
                )
              })}
              {grouped.size === 0 && search && (
                <tr><td colSpan={6} style={{ ...TD, textAlign: 'center', color: '#C4C0DC', padding: '22px 12px' }}>No rooms match "{search}"</td></tr>
              )}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
