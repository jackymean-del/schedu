/**
 * SubjectsPanel — Tab 2. Premium compact redesign (3rd pass).
 * Columns: Subject | Short | p/w | Applicable Classes | [expand] [delete]
 *
 * Key changes (3rd pass):
 * - generateShortName() — AI shortform engine with CBSE/ICSE academic abbreviations
 * - Row-hover-reveal action buttons
 * - Larger, more visible action icons
 * - More prominent "Assign Classes" button
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

// ─── AI Shortform Engine ──────────────────────────────────────────────────────
// Board-standard abbreviations: CBSE / ICSE / IB / Cambridge conventions
const SHORT_MAP: Record<string, string> = {
  'Mathematics':              'MATH',
  'English':                  'ENG',
  'Science':                  'SCI',
  'Social Studies':           'SST',
  'Social Science':           'SOC SCI',
  'Physics':                  'PHY',
  'Chemistry':                'CHEM',
  'Biology':                  'BIO',
  'Hindi':                    'HIN',
  'Sanskrit':                 'SANS',
  'Sanskrit / MIL':           'SANS',
  'Odia':                     'ODI',
  'Odia / Regional Language': 'ODI',
  'Computer Science':         'CS',
  'Informatics Practices':    'IP',
  'EVS':                      'EVS',
  'Environmental Studies':    'ENV SCI',
  'Accountancy':              'ACC',
  'Business Studies':         'BST',
  'Economics':                'ECO',
  'History':                  'HIST',
  'Geography':                'GEO',
  'Political Science':        'POL SCI',
  'Psychology':               'PSY',
  'Physical Education':       'PE',
  'Artificial Intelligence':  'AI',
  'English Literature':       'ENG LIT',
  'English Language':         'ENG LANG',
  'Moral Science':            'MS',
  'Entrepreneurship':         'ENT',
  'Number Work':              'NUM',
  'G.K.':                     'GK',
  'General Knowledge':        'GK',
  'Drawing':                  'DRW',
  'Art & Craft':              'ART',
  'Music':                    'MUS',
  'Dance':                    'DANCE',
  'Library':                  'LIB',
  'SUPW / Life Skills':       'SUPW',
  'Yoga & Health':            'YOGA',
  'Scout & Guide':            'SCOUT',
  'Activity / Free Play':     'ACT',
  'Nursery Rhymes & Stories': 'NRS',
  'Mathematics (Optional)':   'MATH OPT',
  'Life Science':             'LIFE SCI',
  'Earth Science':            'EARTH SCI',
  'Home Science':             'HOME SCI',
  'Fine Arts':                'FINE ART',
  'Vocational Studies':       'VOC',
  'Applied Mathematics':      'APPL MATH',
  'Biotechnology':            'BIOTECH',
  'Legal Studies':            'LEGAL',
  'Media Studies':            'MEDIA',
  'Sociology':                'SOC',
  'Philosophy':               'PHIL',
  'Statistics':               'STAT',
  'French':                   'FRN',
  'German':                   'GER',
  'Spanish':                  'SPA',
  'Tamil':                    'TAM',
  'Telugu':                   'TEL',
  'Kannada':                  'KAN',
  'Malayalam':                'MAL',
  'Gujarati':                 'GUJ',
  'Punjabi':                  'PUN',
  'Marathi':                  'MAR',
  'Urdu':                     'URD',
  'Bengali':                  'BEN',
}

export function generateShortName(name: string): string {
  const n = name.trim()
  // Exact match
  if (SHORT_MAP[n]) return SHORT_MAP[n]
  // Case-insensitive match
  const lower = n.toLowerCase()
  for (const [k, v] of Object.entries(SHORT_MAP)) {
    if (k.toLowerCase() === lower) return v
  }
  // Starts-with match (e.g. "Mathematics Advanced" → MATH)
  for (const [k, v] of Object.entries(SHORT_MAP)) {
    if (lower.startsWith(k.toLowerCase() + ' ')) return v + ' ' + lower.slice(k.length + 1).slice(0, 3).toUpperCase()
  }
  // Generate from words
  const words = n.split(/[\s/&()+,]+/).filter(w => w.length > 1 && !/^[0-9]+$/.test(w))
  if (words.length === 0) return n.slice(0, 5).toUpperCase()
  if (words.length === 1) {
    const w = words[0].toUpperCase()
    return w.length <= 5 ? w : w.slice(0, 4)
  }
  if (words.length === 2) {
    const a = words[0].toUpperCase(), b = words[1].toUpperCase()
    if (a.length <= 2 && b.length <= 4) return `${a} ${b}`
    return `${a.slice(0, 3)} ${b.slice(0, 3)}`
  }
  // 3+ words: use acronym if each word is meaningful
  const stopWords = new Set(['and','the','of','in','for','a','an','&','/'])
  const significant = words.filter(w => !stopWords.has(w.toLowerCase()))
  return significant.slice(0, 3).map(w => w[0].toUpperCase()).join('')
}

// ─── Input style ──────────────────────────────────────────────────────────────
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
      style={{ cursor: 'text', padding: '2px 3px', borderRadius: 3, display: 'inline-block', minWidth: 28, color: value ? '#111028' : '#C4C0DC' }}
      onMouseEnter={ev => (ev.currentTarget.style.background = '#EDE9FF')}
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
          placeholder="Subject name" style={{ ...inp, width: 148 }}
        />
      </td>
      <td style={TD}>
        <span style={{ fontSize: 10.5, color: P_D, fontWeight: 700, fontStyle: 'normal', background: P_L, padding: '1px 5px', borderRadius: 3 }}>
          {name.trim() ? generateShortName(name.trim()) : '—'}
        </span>
      </td>
      <td style={{ ...TD, textAlign: 'center' }}>
        <input type="number" value={ppw} onChange={e => setPpw(+e.target.value)} min={0} max={30}
          style={{ ...inp, width: 38, textAlign: 'center', fontWeight: 700, color: P }} />
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
function SubjectRow({ sub, classOptions, allSectionNames, onUpdate, onDelete }: {
  sub: Subject
  classOptions: ChipOption[]
  allSectionNames: string[]
  onUpdate: (patch: Partial<Subject>) => void
  onDelete: () => void
}) {
  const [expanded, setExpanded] = useState(false)
  const [hovered, setHovered]   = useState(false)
  const selected = sub.sections ?? []

  return (
    <>
      <tr
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        style={{ background: hovered ? '#F6F4FF' : '', transition: 'background 0.07s' }}
      >
        {/* Name */}
        <td style={TD}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ width: 7, height: 7, borderRadius: '50%', background: sub.color ?? P, flexShrink: 0, border: '1.5px solid rgba(0,0,0,0.08)', display: 'inline-block' }} />
            <EditCell value={sub.name} onSave={v => onUpdate({ name: v })} placeholder="Subject name" width={148} />
          </div>
        </td>
        {/* Short — editable, auto-gen badge */}
        <td style={TD}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <EditCell value={sub.shortName ?? ''} onSave={v => onUpdate({ shortName: v })} placeholder="Short" width={56} />
            {hovered && (!sub.shortName || sub.shortName === sub.name.slice(0, 6)) && (
              <button
                title="Auto-generate abbreviation"
                onClick={() => onUpdate({ shortName: generateShortName(sub.name) })}
                style={{ fontSize: 9, color: P_D, background: P_L, border: `1px solid ${P_B}`, borderRadius: 3, padding: '1px 5px', cursor: 'pointer', fontWeight: 700, flexShrink: 0 }}
              >
                AI ↻
              </button>
            )}
          </div>
        </td>
        {/* p/w — styled badge input */}
        <td style={{ ...TD, textAlign: 'center' }}>
          <input
            type="number" value={sub.periodsPerWeek} min={0} max={30}
            onChange={e => onUpdate({ periodsPerWeek: +e.target.value })}
            style={{
              width: 38, padding: '2px 3px', border: '1.5px solid #C4BDFF', borderRadius: 5,
              fontSize: 12, color: P_D, fontWeight: 800, outline: 'none', textAlign: 'center',
              background: P_L, fontFamily: 'inherit',
            }}
          />
        </td>
        {/* Applicable classes */}
        <td style={{ ...TD, minWidth: 160 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <InlineChipSelect
              selected={selected}
              options={classOptions}
              onChange={v => onUpdate({ sections: v })}
              placeholder="+ Assign Classes"
              maxChips={3}
            />
            {allSectionNames.length > 0 && selected.length > 0 && selected.length < allSectionNames.length && (
              <button
                title="Assign to all classes"
                onClick={() => onUpdate({ sections: allSectionNames })}
                style={{
                  fontSize: 9.5, color: P_D, background: P_L, border: `1px solid ${P_B}`,
                  borderRadius: 4, padding: '2px 7px', cursor: 'pointer',
                  whiteSpace: 'nowrap', flexShrink: 0, fontWeight: 700,
                }}
                onMouseEnter={e => { e.currentTarget.style.background = P; e.currentTarget.style.color = '#fff'; e.currentTarget.style.borderColor = P }}
                onMouseLeave={e => { e.currentTarget.style.background = P_L; e.currentTarget.style.color = P_D; e.currentTarget.style.borderColor = P_B }}
              >All</button>
            )}
          </div>
        </td>
        {/* Actions */}
        <td style={{ ...TD, whiteSpace: 'nowrap', textAlign: 'right', paddingRight: 6, width: 54 }}>
          <button onClick={() => setExpanded(o => !o)}
            title="Settings"
            style={{
              background: expanded ? P_L : 'none', border: 'none', cursor: 'pointer',
              color: expanded ? P : (hovered ? '#B0ABCC' : 'transparent'),
              padding: '3px 5px', marginRight: 1, lineHeight: 1, borderRadius: 4,
              transition: 'color 0.1s, background 0.1s',
            }}
            onMouseEnter={e => { e.currentTarget.style.color = P; e.currentTarget.style.background = P_L }}
            onMouseLeave={e => { e.currentTarget.style.color = expanded ? P : (hovered ? '#B0ABCC' : 'transparent'); e.currentTarget.style.background = expanded ? P_L : 'none' }}
          >
            {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          </button>
          <button onClick={onDelete}
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              color: hovered ? '#C4BCDC' : 'transparent',
              padding: '3px 5px', lineHeight: 1, borderRadius: 4,
              transition: 'color 0.1s, background 0.1s',
            }}
            onMouseEnter={e => { e.currentTarget.style.color = '#e74c3c'; e.currentTarget.style.background = '#FFF0F0' }}
            onMouseLeave={e => { e.currentTarget.style.color = hovered ? '#C4BCDC' : 'transparent'; e.currentTarget.style.background = 'none' }}
          >
            <Trash2 size={14} />
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
  function autoFixShortNames() {
    setSubjects(subjects.map(s => ({
      ...s,
      shortName: (s.shortName && s.shortName !== s.name.slice(0, 6)) ? s.shortName : generateShortName(s.name),
    })))
  }

  const assignedCount = useMemo(() => subjects.filter(s => (s.sections ?? []).length > 0).length, [subjects])
  const needsShortFix = useMemo(() =>
    subjects.some(s => !s.shortName || s.shortName === s.name.slice(0, 6)),
    [subjects]
  )

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* Toolbar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, paddingBottom: 7, flexShrink: 0 }}>
        {/* Left: title + stats */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 7, flexShrink: 0 }}>
          <BookOpen size={13} color={P} />
          <span style={{ fontSize: 12.5, fontWeight: 700, color: '#111028' }}>Subjects</span>
          <span style={{ fontSize: 10, color: P, background: P_L, borderRadius: 10, padding: '1px 7px 2px', fontWeight: 700, border: `1px solid ${P_B}` }}>
            {subjects.length}
          </span>
          {subjects.length > 0 && assignedCount < subjects.length && (
            <span style={{ fontSize: 10, color: '#F59E0B', fontWeight: 700, background: '#FFFBEB', padding: '1px 6px 2px', borderRadius: 4, border: '1px solid #FDE68A' }}>
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
        <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
          {needsShortFix && subjects.length > 0 && (
            <button onClick={autoFixShortNames}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 4,
                background: '#fff', color: P_D, border: `1.5px solid ${P_B}`,
                borderRadius: 6, padding: '5px 10px', fontSize: 11, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
              }}
              onMouseEnter={e => { e.currentTarget.style.background = P_L }}
              onMouseLeave={e => { e.currentTarget.style.background = '#fff' }}
            >
              AI Fix Shortforms
            </button>
          )}
          {allSectionNames.length > 0 && (
            <button onClick={assignAll}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 5,
                background: P, color: '#fff', border: 'none',
                borderRadius: 6, padding: '5px 12px', fontSize: 11.5, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
                boxShadow: '0 2px 6px rgba(124,111,224,0.28)',
              }}
              onMouseEnter={e => { e.currentTarget.style.background = P_D }}
              onMouseLeave={e => { e.currentTarget.style.background = P }}
            >
              Assign All → Classes
            </button>
          )}
        </div>
      </div>

      {/* Classes hint */}
      {sections.length === 0 && (
        <div style={{ margin: '0 0 6px', padding: '5px 10px', background: '#FFFBF0', border: '1px solid #FFE8A0', borderRadius: 5, fontSize: 11, color: '#7A5800' }}>
          💡 Add classes first, then assign subjects to them.
        </div>
      )}

      {/* Table */}
      <div style={TABLE_CARD}>
        {subjects.length === 0 && !search ? (
          <div style={{ textAlign: 'center', padding: '40px 0' }}>
            <div style={{ fontSize: 28, marginBottom: 6 }}>📖</div>
            <div style={{ fontSize: 12.5, fontWeight: 700, color: '#9896B5', marginBottom: 3 }}>No subjects yet</div>
            <div style={{ fontSize: 11.5, color: '#C4C0DC' }}>Add your first subject below.</div>
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={TH}>Subject</th>
                <th style={{ ...TH, width: 72 }}>Short</th>
                <th style={{ ...TH, width: 44, textAlign: 'center' }}>p/w</th>
                <th style={TH}>Applicable Classes</th>
                <th style={{ ...TH, width: 54 }} />
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
                <tr><td colSpan={5} style={{ ...TD, textAlign: 'center', color: '#C4C0DC', padding: '16px 10px' }}>No subjects match "{search}"</td></tr>
              )}
              <AddRow onAdd={add} />
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
