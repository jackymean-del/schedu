/**
 * SubjectsPanel — Tab 2. Premium compact redesign.
 * Columns: Subject | Short | p/w | Applicable Classes | [expand] [delete]
 */

import { useState, useRef, useMemo, useEffect } from 'react'
import type { Subject, Section } from '@/types'
import { Trash2, Plus, ChevronDown, ChevronRight, BookOpen } from 'lucide-react'
import { P, P_D, P_L, P_B, TH, TD, TABLE_CARD, InlineChipSelect } from './shared'
import type { ChipOption } from './shared'

function makeId() { return Math.random().toString(36).slice(2, 9) }

function getGrade(name: string): string {
  const t = name.trim()
  const idx = t.lastIndexOf('-')
  if (idx > 0 && t.slice(idx + 1).length <= 3)
    return t.slice(0, idx).replace(/-(sci|com|arts?|hum|gen|pcm|pcb)$/i, '').trim()
  return t
}

const GRADE_ORDER = ['Nursery','LKG','UKG','I','II','III','IV','V','VI','VII','VIII','IX','X','XI','XII']
function gradeKey(g: string) { const i = GRADE_ORDER.indexOf(g); return i >= 0 ? i : 100 + g.charCodeAt(0) }

const CATS = ['Compulsory','Language','4th Optional','5th Optional','6th Optional','Practical','Activity','EST','CCA','Skill']

const inp: React.CSSProperties = {
  padding: '3px 6px', border: '1px solid #E4E0FF', borderRadius: 4,
  fontSize: 12, color: '#111028', outline: 'none', fontFamily: 'inherit', background: '#FAFAFE',
}

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
      style={{ cursor: 'text', padding: '2px 3px', borderRadius: 3, display: 'inline-block', minWidth: 30, color: value ? '#111028' : '#C4C0DC' }}
      onMouseEnter={ev => (ev.currentTarget.style.background = '#F0ECFE')}
      onMouseLeave={ev => (ev.currentTarget.style.background = '')}
    >{value || placeholder}</span>
  )
}

// ─── Expandable settings ─────────────────────────────────────────────────────
function OptionalSettings({ sub, onChange }: {
  sub: Subject
  onChange: (patch: Partial<Subject>) => void
}) {
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
  const [name, setName] = useState('')
  const [ppw, setPpw]   = useState(5)
  const ref = useRef<HTMLInputElement>(null)
  useEffect(() => { if (active) ref.current?.focus() }, [active])

  function commit() {
    if (!name.trim()) { setActive(false); return }
    onAdd({
      id: makeId(), name: name.trim(),
      shortName: name.trim().slice(0, 6),
      category: 'Compulsory', periodsPerWeek: ppw,
      sessionDuration: 45, maxPeriodsPerDay: 2,
      color: P, isOptional: false, requiresLab: false,
      sections: [], classConfigs: [],
    } as unknown as Subject)
    setName(''); setPpw(5); setActive(false)
  }

  if (!active) return (
    <tr>
      <td colSpan={5} style={{ ...TD, padding: '8px 10px' }}>
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
          placeholder="Subject name" style={{ ...inp, width: 145 }}
        />
      </td>
      <td style={TD}>
        <span style={{ fontSize: 10.5, color: '#C4C0DC', fontStyle: 'italic' }}>{name.slice(0, 6) || '—'}</span>
      </td>
      <td style={{ ...TD, textAlign: 'center' }}>
        <input type="number" value={ppw} onChange={e => setPpw(+e.target.value)} min={0} max={30}
          style={{ ...inp, width: 38, textAlign: 'center', fontWeight: 700, color: P }} />
      </td>
      <td style={TD}>
        <span style={{ fontSize: 10.5, color: '#C4C0DC', fontStyle: 'italic' }}>Assign after saving</span>
      </td>
      <td style={{ ...TD, whiteSpace: 'nowrap' }}>
        <button onClick={commit} style={{ background: P, color: '#fff', border: 'none', borderRadius: 4, padding: '3px 9px', fontSize: 11.5, fontWeight: 700, cursor: 'pointer', marginRight: 3 }}>✓</button>
        <button onClick={() => setActive(false)} style={{ background: '#F0F0F0', color: '#888', border: 'none', borderRadius: 4, padding: '3px 7px', fontSize: 11.5, cursor: 'pointer' }}>✗</button>
      </td>
    </tr>
  )
}

// ─── Subject row ──────────────────────────────────────────────────────────────
function SubjectRow({ sub, classOptions, allSectionNames, onUpdate, onDelete }: {
  sub: Subject
  classOptions: ChipOption[]
  allSectionNames: string[]
  onUpdate: (patch: Partial<Subject>) => void
  onDelete: () => void
}) {
  const [expanded, setExpanded] = useState(false)
  const selected = sub.sections ?? []

  return (
    <>
      <tr
        style={{ transition: 'background 0.07s' }}
        onMouseEnter={e => (e.currentTarget.style.background = '#F8F6FF')}
        onMouseLeave={e => (e.currentTarget.style.background = '')}
      >
        {/* Name */}
        <td style={TD}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ width: 7, height: 7, borderRadius: '50%', background: sub.color ?? P, flexShrink: 0, border: '1.5px solid rgba(0,0,0,0.08)', display: 'inline-block' }} />
            <EditCell value={sub.name} onSave={v => onUpdate({ name: v })} placeholder="Subject name" width={145} />
          </div>
        </td>
        {/* Short */}
        <td style={TD}>
          <EditCell value={sub.shortName ?? ''} onSave={v => onUpdate({ shortName: v })} placeholder="Short" width={54} />
        </td>
        {/* p/w — styled badge */}
        <td style={{ ...TD, textAlign: 'center' }}>
          <input
            type="number" value={sub.periodsPerWeek} min={0} max={30}
            onChange={e => onUpdate({ periodsPerWeek: +e.target.value })}
            style={{
              width: 36, padding: '2px 3px', border: '1px solid #DDD8FF', borderRadius: 4,
              fontSize: 12, color: P, fontWeight: 800, outline: 'none', textAlign: 'center',
              background: P_L,
            }}
          />
        </td>
        {/* Applicable classes */}
        <td style={{ ...TD, minWidth: 150 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <InlineChipSelect
              selected={selected}
              options={classOptions}
              onChange={v => onUpdate({ sections: v })}
              placeholder="+ Assign classes"
              maxChips={3}
            />
            {allSectionNames.length > 0 && selected.length > 0 && selected.length < allSectionNames.length && (
              <button
                title="Assign to all classes"
                onClick={() => onUpdate({ sections: allSectionNames })}
                style={{
                  fontSize: 9.5, color: P_D, background: P_L, border: `1px solid ${P_B}`,
                  borderRadius: 3, padding: '1px 6px', cursor: 'pointer',
                  whiteSpace: 'nowrap', flexShrink: 0, fontWeight: 700,
                }}
              >All</button>
            )}
          </div>
        </td>
        {/* Actions */}
        <td style={{ ...TD, whiteSpace: 'nowrap', textAlign: 'right', paddingRight: 8 }}>
          <button onClick={() => setExpanded(o => !o)}
            title="Settings"
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: expanded ? P : '#D4CFF0', padding: '2px 2px', marginRight: 1, lineHeight: 1 }}
            onMouseEnter={e => (e.currentTarget.style.color = P)}
            onMouseLeave={e => (e.currentTarget.style.color = expanded ? P : '#D4CFF0')}
          >
            {expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
          </button>
          <button onClick={onDelete}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#D4CFF0', padding: '2px 2px', lineHeight: 1 }}
            onMouseEnter={e => (e.currentTarget.style.color = '#e74c3c')}
            onMouseLeave={e => (e.currentTarget.style.color = '#D4CFF0')}
          >
            <Trash2 size={12} />
          </button>
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

// ─── Main export ──────────────────────────────────────────────────────────────
export function SubjectsPanel({ subjects, setSubjects, sections }: {
  subjects: Subject[]
  setSubjects: (s: Subject[]) => void
  sections: Section[]
}) {
  const [search, setSearch] = useState('')

  const filtered = useMemo(() => {
    const q = search.toLowerCase()
    if (!q) return subjects
    return subjects.filter(s =>
      s.name.toLowerCase().includes(q) || (s.category ?? '').toLowerCase().includes(q)
    )
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

  const allSectionNames = useMemo(() => sections.map(s => s.name), [sections])

  function update(id: string, patch: Partial<Subject>) {
    setSubjects(subjects.map(s => s.id === id ? { ...s, ...patch } : s))
  }
  function remove(id: string) { setSubjects(subjects.filter(s => s.id !== id)) }
  function add(s: Subject) { setSubjects([...subjects, s]) }
  function assignAll() { setSubjects(subjects.map(s => ({ ...s, sections: allSectionNames }))) }

  const assignedCount = useMemo(() => subjects.filter(s => (s.sections ?? []).length > 0).length, [subjects])

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* Toolbar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, paddingBottom: 8, flexShrink: 0 }}>
        {/* Left: title + stats */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 7, flexShrink: 0 }}>
          <BookOpen size={13} color={P} />
          <span style={{ fontSize: 12.5, fontWeight: 700, color: '#111028' }}>Subjects</span>
          <span style={{ fontSize: 10, color: P, background: P_L, borderRadius: 4, padding: '1px 6px 2px', fontWeight: 700, border: `1px solid ${P_B}` }}>
            {subjects.length}
          </span>
          {subjects.length > 0 && assignedCount < subjects.length && (
            <span style={{ fontSize: 10, color: '#F59E0B', fontWeight: 600 }}>
              {subjects.length - assignedCount} unassigned
            </span>
          )}
        </div>

        <div style={{ width: 1, height: 14, background: '#EAE6FF', flexShrink: 0 }} />

        {/* Search */}
        <div style={{ position: 'relative', flex: 1 }}>
          <span style={{ position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)', color: '#C0BBD8', pointerEvents: 'none', fontSize: 12 }}>⌕</span>
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search subjects…"
            style={{ width: '100%', padding: '4px 8px 4px 24px', border: '1px solid #E4E0FF', borderRadius: 5, fontSize: 12, color: '#111028', outline: 'none', boxSizing: 'border-box', background: '#FAFAFE', fontFamily: 'inherit' }}
          />
        </div>

        {/* Actions */}
        {allSectionNames.length > 0 && (
          <button onClick={assignAll}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 4,
              background: P, color: '#fff', border: 'none',
              borderRadius: 5, padding: '4px 11px', fontSize: 11.5, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', flexShrink: 0,
            }}
            onMouseEnter={e => (e.currentTarget.style.opacity = '0.88')}
            onMouseLeave={e => (e.currentTarget.style.opacity = '1')}
          >
            Assign All → Classes
          </button>
        )}
      </div>

      {/* Classes hint */}
      {sections.length === 0 && (
        <div style={{ margin: '0 0 7px', padding: '6px 10px', background: '#FFFBF0', border: '1px solid #FFE8A0', borderRadius: 5, fontSize: 11, color: '#7A5800' }}>
          💡 Add classes first, then assign subjects to them.
        </div>
      )}

      {/* Table */}
      <div style={TABLE_CARD}>
        {subjects.length === 0 && !search ? (
          <div style={{ textAlign: 'center', padding: '44px 0' }}>
            <div style={{ fontSize: 28, marginBottom: 7 }}>📖</div>
            <div style={{ fontSize: 12.5, fontWeight: 700, color: '#9896B5', marginBottom: 3 }}>No subjects yet</div>
            <div style={{ fontSize: 11.5, color: '#C4C0DC' }}>Add your first subject below.</div>
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={TH}>Subject</th>
                <th style={{ ...TH, width: 64 }}>Short</th>
                <th style={{ ...TH, width: 46, textAlign: 'center' }}>p/w</th>
                <th style={TH}>Applicable Classes</th>
                <th style={{ ...TH, width: 48 }} />
              </tr>
            </thead>
            <tbody>
              {filtered.map(sub => (
                <SubjectRow
                  key={sub.id}
                  sub={sub}
                  classOptions={classOptions}
                  allSectionNames={allSectionNames}
                  onUpdate={patch => update(sub.id, patch)}
                  onDelete={() => remove(sub.id)}
                />
              ))}
              {filtered.length === 0 && search && (
                <tr><td colSpan={5} style={{ ...TD, textAlign: 'center', color: '#C4C0DC', padding: '18px 10px' }}>No subjects match "{search}"</td></tr>
              )}
              <AddRow onAdd={add} />
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
