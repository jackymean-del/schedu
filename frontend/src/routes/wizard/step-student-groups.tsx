/**
 * Step 4 — AND Groups + OR Groups
 *
 * AND Groups tab: Inline matrix tables — sections as rows, subjects as columns.
 *   No modal. Add subjects / sections directly inside the table.
 *   Grouping scope toggles (same/cross × section/stream/class/block).
 *
 * OR Groups tab: Elective slots via SubjectGroupsSection (unchanged).
 */

import { useState, useMemo, useRef, useEffect } from 'react'
import { useTimetableStore } from '@/store/timetableStore'
import type { AndComboGroup, AndTeachingGroup } from '@/types'
import {
  Layers, Shuffle, ChevronRight, ChevronLeft, Plus, Trash2,
  Sparkles, RefreshCw, Zap, CheckCircle2, AlertCircle, XCircle,
} from 'lucide-react'
import { SubjectGroupsSection } from '@/components/resources/SubjectGroupsSection'

// ── constants & helpers ────────────────────────────────────────────────────────

const PALETTE = ['#7C6FE0','#10B981','#F59E0B','#EF4444','#3B82F6','#EC4899','#8B5CF6','#06B6D4']
function makeId() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 6) }
function colColor(i: number) { return PALETTE[i % PALETTE.length] }

type ScopeVal = 'same' | 'cross'
interface GroupingScope { section: ScopeVal; stream: ScopeVal; class: ScopeVal; block: ScopeVal }
const DEFAULT_SCOPE: GroupingScope = { section: 'cross', stream: 'same', class: 'same', block: 'same' }

function getSubjectCols(group: AndComboGroup): string[] {
  if (group.subjectColumns && group.subjectColumns.length > 0) return group.subjectColumns
  const cols: string[] = []
  for (const b of group.bundles ?? []) {
    for (const s of b.subjects) { if (!cols.includes(s)) cols.push(s) }
  }
  return cols
}

function getScope(group: AndComboGroup): GroupingScope {
  return group.groupingScope ?? DEFAULT_SCOPE
}

function getCell(group: AndComboGroup, sec: string, sub: string): number {
  return group.strengthMatrix?.[sec]?.[sub] ?? 0
}

// ── AI suggestion ──────────────────────────────────────────────────────────────

function suggestAndComboGroups(subjects: any[], sections: any[]): AndComboGroup[] {
  const suggestions: AndComboGroup[] = []

  // Science optional split (Maths vs Bio, etc.)
  const sciSecs = sections.filter(s => {
    const u = (s.name ?? '').toUpperCase()
    return (u.includes('SCI') || u.includes('SCIENCE')) &&
      (s.name.startsWith('XI') || s.name.startsWith('XII'))
  })
  if (sciSecs.length > 0) {
    const opts = subjects.filter(s => s.isOptional)
    const mathName = opts.find(s => /math/i.test(s.name))?.name
    const bioName  = opts.find(s => /bio/i.test(s.name))?.name
    const cols = [mathName, bioName].filter(Boolean) as string[]
    if (cols.length >= 2) {
      suggestions.push({
        id: `suggest_sci_${Date.now()}`,
        name: 'Science XI–XII: Maths vs Bio',
        applicableSections: sciSecs.map(s => s.name),
        bundles: [], subjectColumns: cols,
        groupingScope: { section: 'cross', stream: 'same', class: 'same', block: 'same' },
        strengthMatrix: {}, aiSuggested: true,
      })
    }
  }

  // Cross-stream: optional subjects sharing identical section signature
  const bySig = new Map<string, any[]>()
  for (const sub of subjects.filter(s => s.isOptional)) {
    const fromCfg = (sub.classConfigs ?? []).map((c: any) => c.sectionName).filter(Boolean) as string[]
    const sig = [...new Set([...fromCfg, ...(sub.sections ?? [])])].sort().join('|')
    if (!sig) continue
    if (!bySig.has(sig)) bySig.set(sig, [])
    bySig.get(sig)!.push(sub)
  }
  for (const [sig, subs] of bySig) {
    if (subs.length < 2) continue
    const alreadyCovered = suggestions.some(sg =>
      subs.every((s: any) => getSubjectCols(sg).includes(s.name)))
    if (alreadyCovered) continue
    const secNames = sig.split('|')
    suggestions.push({
      id: `suggest_sig_${sig.slice(0, 20)}_${Date.now()}`,
      name: `${subs.map((s: any) => s.name).join(' vs ')} (${secNames[0]}…)`,
      applicableSections: secNames,
      bundles: [], subjectColumns: subs.map((s: any) => s.name),
      groupingScope: DEFAULT_SCOPE,
      strengthMatrix: {}, aiSuggested: true,
    })
  }

  return suggestions
}

// ── Teaching group generation ──────────────────────────────────────────────────

function generateMatrixGroups(group: AndComboGroup, rooms: any[]): AndTeachingGroup[] {
  const cols = getSubjectCols(group)
  const sorted = [...rooms].sort((a, b) => (a.capacity ?? 0) - (b.capacity ?? 0))
  const biggest = sorted.length > 0 ? sorted[sorted.length - 1].capacity ?? 0 : Infinity
  const result: AndTeachingGroup[] = []

  for (const sub of cols) {
    const slices = group.applicableSections
      .map(sec => ({ sectionName: sec, studentCount: getCell(group, sec, sub) }))
      .filter(s => s.studentCount > 0)
    if (slices.length === 0) continue
    const total = slices.reduce((a, s) => a + s.studentCount, 0)
    const room = sorted.find(r => (r.capacity ?? 0) >= total) ?? sorted[sorted.length - 1]
    result.push({
      id: `${group.id}_${sub.replace(/\s/g, '')}_G1`,
      bundleId: sub,
      bundleName: sub,
      subjects: [sub],
      sectionSlices: slices,
      totalStrength: total,
      room: room?.name ?? room?.actualName,
      roomCapacity: room?.capacity,
      capacityWarning: (room?.capacity ?? 0) < total,
    })
  }
  return result
}

// ── Table style helpers ────────────────────────────────────────────────────────

const TH = (align: 'left' | 'center', w?: number): React.CSSProperties => ({
  padding: '6px 8px', fontSize: 10, fontWeight: 800, color: '#8B87AD',
  textTransform: 'uppercase', letterSpacing: '0.07em', background: '#F8F7FF',
  borderBottom: '2px solid #E8E4FF', textAlign: align,
  width: w, minWidth: w, whiteSpace: 'nowrap',
} as React.CSSProperties)

const TD = (align: 'left' | 'center'): React.CSSProperties => ({
  padding: '5px 8px', textAlign: align, borderBottom: '1px solid #F0EDFF',
})

// ── Scope toggle row ───────────────────────────────────────────────────────────

const SCOPE_DIMS: { key: keyof GroupingScope; label: string }[] = [
  { key: 'section', label: 'Section' },
  { key: 'stream',  label: 'Stream'  },
  { key: 'class',   label: 'Class'   },
  { key: 'block',   label: 'Block'   },
]

function ScopeToggle({ scope, onChange }: { scope: GroupingScope; onChange: (s: GroupingScope) => void }) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, padding: '8px 14px', borderBottom: '1px solid #F0EDFF', background: '#FAFAFE' }}>
      <span style={{ fontSize: 10, fontWeight: 700, color: '#8B87AD', alignSelf: 'center', textTransform: 'uppercase', letterSpacing: '0.06em', minWidth: 90 }}>Parallel groups</span>
      {SCOPE_DIMS.map(({ key, label }) => (
        <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <span style={{ fontSize: 10, color: '#9CA3AF', marginRight: 2 }}>{label}:</span>
          {(['same', 'cross'] as ScopeVal[]).map(val => (
            <button
              key={val}
              onClick={() => onChange({ ...scope, [key]: val })}
              style={{
                padding: '2px 8px', borderRadius: 4, fontSize: 10, fontWeight: 600,
                border: `1.5px solid ${scope[key] === val ? '#7C6FE0' : '#E4E0FF'}`,
                background: scope[key] === val ? '#7C6FE0' : '#fff',
                color: scope[key] === val ? '#fff' : '#9CA3AF',
                cursor: 'pointer', fontFamily: 'inherit',
              }}
            >
              {val === 'same' ? 'Same' : 'Cross'}-{label}
            </button>
          ))}
        </div>
      ))}
    </div>
  )
}

// ── Subject picker dropdown ────────────────────────────────────────────────────

function SubjectDropdown({
  allSubjects, existing, onAdd, onClose,
}: {
  allSubjects: string[]
  existing: string[]
  onAdd: (s: string) => void
  onClose: () => void
}) {
  const [q, setQ] = useState('')
  const available = allSubjects.filter(s =>
    !existing.includes(s) && s.toLowerCase().includes(q.toLowerCase()))
  return (
    <div
      style={{
        position: 'absolute', zIndex: 400, top: '100%', left: 0, marginTop: 4,
        background: '#fff', border: '1.5px solid #E4E0FF', borderRadius: 9,
        boxShadow: '0 8px 28px rgba(0,0,0,0.13)', minWidth: 200,
      }}
      onMouseDown={e => e.stopPropagation()}
    >
      <div style={{ padding: '6px 8px', borderBottom: '1px solid #F0EDFF' }}>
        <input
          autoFocus
          value={q} onChange={e => setQ(e.target.value)}
          placeholder="Search subjects…"
          style={{ width: '100%', boxSizing: 'border-box', padding: '4px 7px', borderRadius: 5, border: '1.5px solid #E4E0FF', fontSize: 12, outline: 'none', fontFamily: 'inherit' }}
        />
      </div>
      <div style={{ maxHeight: 200, overflowY: 'auto' }}>
        {available.length === 0
          ? <div style={{ padding: '10px 12px', fontSize: 12, color: '#C4C0DC' }}>All subjects added</div>
          : available.map(s => (
            <button key={s} onMouseDown={() => { onAdd(s); onClose() }} style={{
              display: 'block', width: '100%', textAlign: 'left',
              padding: '7px 12px', border: 'none', background: 'none',
              fontSize: 12, color: '#374151', cursor: 'pointer', fontFamily: 'inherit',
            }}
            onMouseEnter={e => { e.currentTarget.style.background = '#F5F2FF' }}
            onMouseLeave={e => { e.currentTarget.style.background = 'none' }}>
              + {s}
            </button>
          ))
        }
      </div>
    </div>
  )
}

// ── Section picker dropdown ────────────────────────────────────────────────────

function SectionDropdown({
  allSections, existing, onAdd, onClose,
}: {
  allSections: string[]
  existing: string[]
  onAdd: (s: string) => void
  onClose: () => void
}) {
  const [q, setQ] = useState('')
  const available = allSections.filter(s =>
    !existing.includes(s) && s.toLowerCase().includes(q.toLowerCase()))
  return (
    <div
      style={{
        position: 'absolute', zIndex: 400, bottom: '100%', left: 0, marginBottom: 4,
        background: '#fff', border: '1.5px solid #E4E0FF', borderRadius: 9,
        boxShadow: '0 8px 28px rgba(0,0,0,0.13)', minWidth: 200,
      }}
      onMouseDown={e => e.stopPropagation()}
    >
      <div style={{ padding: '6px 8px', borderBottom: '1px solid #F0EDFF' }}>
        <input
          autoFocus
          value={q} onChange={e => setQ(e.target.value)}
          placeholder="Search sections…"
          style={{ width: '100%', boxSizing: 'border-box', padding: '4px 7px', borderRadius: 5, border: '1.5px solid #E4E0FF', fontSize: 12, outline: 'none', fontFamily: 'inherit' }}
        />
      </div>
      <div style={{ maxHeight: 200, overflowY: 'auto' }}>
        {available.length === 0
          ? <div style={{ padding: '10px 12px', fontSize: 12, color: '#C4C0DC' }}>All sections added</div>
          : available.map(s => (
            <button key={s} onMouseDown={() => { onAdd(s); onClose() }} style={{
              display: 'block', width: '100%', textAlign: 'left',
              padding: '7px 12px', border: 'none', background: 'none',
              fontSize: 12, color: '#374151', cursor: 'pointer', fontFamily: 'inherit',
            }}
            onMouseEnter={e => { e.currentTarget.style.background = '#F5F2FF' }}
            onMouseLeave={e => { e.currentTarget.style.background = 'none' }}>
              + {s}
            </button>
          ))
        }
      </div>
    </div>
  )
}

// ── Matrix Table Card ──────────────────────────────────────────────────────────

function MatrixTableCard({
  group, sections, allSubjectNames, allSectionNames, onUpdate, onDelete, onGenerateGroups,
}: {
  group: AndComboGroup
  sections: any[]
  allSubjectNames: string[]
  allSectionNames: string[]
  onUpdate: (g: AndComboGroup) => void
  onDelete: () => void
  onGenerateGroups: () => void
}) {
  const [showSubjPicker, setShowSubjPicker] = useState(false)
  const [showSecPicker, setShowSecPicker]   = useState(false)
  const cardRef = useRef<HTMLDivElement>(null)

  const cols  = getSubjectCols(group)
  const scope = getScope(group)

  // Close dropdowns on outside click
  useEffect(() => {
    if (!showSubjPicker && !showSecPicker) return
    const handler = (e: MouseEvent) => {
      if (cardRef.current && !cardRef.current.contains(e.target as Node)) {
        setShowSubjPicker(false)
        setShowSecPicker(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [showSubjPicker, showSecPicker])

  const patch = (p: Partial<AndComboGroup>) => onUpdate({ ...group, ...p })

  const setCell = (sec: string, sub: string, val: number) =>
    patch({
      aiSuggested: false,
      strengthMatrix: {
        ...group.strengthMatrix,
        [sec]: { ...(group.strengthMatrix?.[sec] ?? {}), [sub]: val },
      },
    })

  const addSubject = (sub: string) =>
    patch({ subjectColumns: [...cols, sub], bundles: [], aiSuggested: false })

  const removeSubject = (sub: string) => {
    const sm: Record<string, Record<string, number>> = {}
    for (const [sec, vals] of Object.entries(group.strengthMatrix ?? {})) {
      const v = { ...vals }; delete v[sub]; sm[sec] = v
    }
    onUpdate({ ...group, subjectColumns: cols.filter(s => s !== sub), bundles: [], strengthMatrix: sm })
  }

  const addSection = (sec: string) =>
    patch({ applicableSections: [...group.applicableSections, sec], aiSuggested: false })

  const removeSection = (sec: string) => {
    const sm = { ...group.strengthMatrix }; delete sm[sec]
    onUpdate({ ...group, applicableSections: group.applicableSections.filter(s => s !== sec), strengthMatrix: sm })
  }

  const getTotal = (sec: string) => sections.find(s => s.name === sec)?.strength ?? 0

  return (
    <div ref={cardRef} style={{
      border: '1.5px solid #E4E0FF', borderRadius: 12, overflow: 'visible',
      background: '#fff', marginBottom: 16, position: 'relative',
    }}>
      {/* Name row */}
      <div style={{
        padding: '10px 14px', background: '#F3F1FF',
        borderBottom: '1px solid #E8E4FF',
        display: 'flex', alignItems: 'center', gap: 8, borderRadius: '12px 12px 0 0',
      }}>
        {group.aiSuggested && (
          <span style={{ fontSize: 9, background: '#7C6FE0', color: '#fff', borderRadius: 3, padding: '1px 6px', fontWeight: 700, flexShrink: 0 }}>⚡ AI</span>
        )}
        <input
          value={group.name}
          onChange={e => patch({ name: e.target.value, aiSuggested: false })}
          placeholder="Group name (e.g. Science XI–XII: Maths vs Bio)…"
          style={{
            flex: 1, padding: '4px 8px', borderRadius: 6, border: '1.5px solid #E4E0FF',
            fontSize: 13, fontWeight: 700, outline: 'none', fontFamily: 'inherit',
            color: '#13111E', background: 'transparent',
          }}
        />
        <button onClick={onDelete} title="Delete" style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#EF4444', padding: 4 }}>
          <Trash2 size={14} />
        </button>
      </div>

      {/* Grouping scope row */}
      <ScopeToggle scope={scope} onChange={s => patch({ groupingScope: s })} />

      {/* Matrix table */}
      <div style={{ overflowX: 'auto', padding: '10px 14px 0' }}>
        {cols.length === 0 && group.applicableSections.length === 0 ? (
          <div style={{ padding: '18px 0', textAlign: 'center', color: '#B8B4D4', fontSize: 12 }}>
            Use the buttons below to add subjects (columns) and class-sections (rows).
          </div>
        ) : (
          <table style={{ borderCollapse: 'collapse', width: '100%' }}>
            <thead>
              <tr>
                <th style={TH('left', 140)}>Section</th>
                <th style={TH('center', 62)}>Total</th>
                {cols.map((sub, ci) => (
                  <th key={sub} style={{ ...TH('center', 86), color: colColor(ci) }}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                      {sub}
                      <button
                        onClick={() => removeSubject(sub)}
                        title={`Remove ${sub}`}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#D1D5DB', padding: 0, lineHeight: 1, fontSize: 10 }}
                        onMouseEnter={e => { e.currentTarget.style.color = '#EF4444' }}
                        onMouseLeave={e => { e.currentTarget.style.color = '#D1D5DB' }}
                      >✕</button>
                    </span>
                  </th>
                ))}
                <th style={TH('center', 90)}>Validation</th>
              </tr>
            </thead>
            <tbody>
              {group.applicableSections.map((sec, ri) => {
                const total = getTotal(sec)
                const sum   = cols.reduce((a, s) => a + getCell(group, sec, s), 0)
                const isMatch = total > 0 && sum === total
                const isOver  = sum > total
                return (
                  <tr key={sec} style={{ background: ri % 2 === 0 ? '#fff' : '#FAFAFE' }}>
                    <td style={TD('left')}>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                        <span style={{ fontSize: 12, fontWeight: 700, color: '#374151' }}>{sec}</span>
                        <button
                          onClick={() => removeSection(sec)}
                          title="Remove section"
                          style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#D1D5DB', padding: 0, lineHeight: 1, fontSize: 10 }}
                          onMouseEnter={e => { e.currentTarget.style.color = '#EF4444' }}
                          onMouseLeave={e => { e.currentTarget.style.color = '#D1D5DB' }}
                        >✕</button>
                      </span>
                    </td>
                    <td style={TD('center')}>
                      <span style={{ fontSize: 12, fontWeight: 600, color: '#6B7280' }}>{total || '—'}</span>
                    </td>
                    {cols.map((sub, ci) => (
                      <td key={sub} style={TD('center')}>
                        <input
                          type="number" min={0}
                          value={getCell(group, sec, sub) || ''}
                          onChange={e => setCell(sec, sub, Math.max(0, parseInt(e.target.value) || 0))}
                          placeholder="0"
                          style={{
                            width: 60, padding: '4px 5px', borderRadius: 6, textAlign: 'center',
                            border: `1.5px solid ${isOver ? '#FCA5A5' : colColor(ci) + '55'}`,
                            fontSize: 13, fontWeight: 700, outline: 'none',
                            fontFamily: 'inherit',
                            background: isOver ? '#FEF2F2' : colColor(ci) + '0D',
                            color: '#111028',
                          }}
                        />
                      </td>
                    ))}
                    <td style={TD('center')}>
                      {total === 0
                        ? <span style={{ fontSize: 10, color: '#C4C0DC' }}>—</span>
                        : isMatch
                          ? <span style={{ color: '#15803D', fontSize: 11, fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 2 }}><CheckCircle2 size={11} /> {sum}/{total}</span>
                          : isOver
                            ? <span style={{ color: '#DC2626', fontSize: 11, fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 2 }}><XCircle size={11} /> +{sum - total}</span>
                            : sum > 0
                              ? <span style={{ color: '#D97706', fontSize: 11, fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 2 }}><AlertCircle size={11} /> −{total - sum}</span>
                              : <span style={{ fontSize: 10, color: '#C4C0DC' }}>○ {total}</span>
                      }
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Action row: Add Class-Section | Add Subject | Generate */}
      <div style={{
        padding: '10px 14px 12px',
        display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap',
        borderTop: group.applicableSections.length > 0 || cols.length > 0 ? '1px dashed #E8E4FF' : 'none',
        marginTop: 6,
      }}>
        {/* Add Class-Section */}
        <div style={{ position: 'relative' }}>
          <button
            onClick={() => { setShowSecPicker(v => !v); setShowSubjPicker(false) }}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 5,
              padding: '5px 12px', borderRadius: 7,
              border: '1.5px dashed #C4B5FD', background: '#F5F3FF',
              color: '#7C6FE0', fontSize: 11, fontWeight: 700,
              cursor: 'pointer', fontFamily: 'inherit',
            }}
          >
            <Plus size={11} /> Add Class-Section
          </button>
          {showSecPicker && (
            <SectionDropdown
              allSections={allSectionNames}
              existing={group.applicableSections}
              onAdd={s => { addSection(s); setShowSecPicker(false) }}
              onClose={() => setShowSecPicker(false)}
            />
          )}
        </div>

        {/* Add Subject */}
        <div style={{ position: 'relative' }}>
          <button
            onClick={() => { setShowSubjPicker(v => !v); setShowSecPicker(false) }}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 5,
              padding: '5px 12px', borderRadius: 7,
              border: '1.5px dashed #A7F3D0', background: '#F0FDF4',
              color: '#065F46', fontSize: 11, fontWeight: 700,
              cursor: 'pointer', fontFamily: 'inherit',
            }}
          >
            <Plus size={11} /> Add Subject
          </button>
          {showSubjPicker && (
            <SubjectDropdown
              allSubjects={allSubjectNames}
              existing={cols}
              onAdd={s => { addSubject(s); setShowSubjPicker(false) }}
              onClose={() => setShowSubjPicker(false)}
            />
          )}
        </div>

        <div style={{ flex: 1 }} />

        <button onClick={onGenerateGroups} style={{
          display: 'inline-flex', alignItems: 'center', gap: 6,
          padding: '6px 14px', borderRadius: 7,
          border: '1.5px solid #C4B5FD', background: '#F5F2FF',
          color: '#7C6FE0', fontSize: 11, fontWeight: 700,
          cursor: 'pointer', fontFamily: 'inherit',
        }}>
          <RefreshCw size={11} /> Generate Teaching Groups
        </button>
      </div>

      {/* Generated group chips */}
      {group.generatedGroups && group.generatedGroups.length > 0 && (
        <div style={{ padding: '0 14px 12px', display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {group.generatedGroups.map((g, gi) => (
            <span
              key={g.id}
              title={g.sectionSlices.map(s => `${s.sectionName}: ${s.studentCount}`).join(', ')}
              style={{
                fontSize: 10, fontWeight: 700, padding: '3px 9px',
                background: colColor(gi), color: '#fff', borderRadius: 5,
              }}
            >
              {g.subjects[0] ?? g.bundleName} · {g.totalStrength}
              {g.room ? ` · ${g.room}` : ''}
              {g.capacityWarning ? ' ⚠' : ''}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Main component ─────────────────────────────────────────────────────────────

export function StepStudentGroups() {
  const store = useTimetableStore() as any
  const { sections, subjects, setStep, andComboGroups, setAndComboGroups } = store
  const rooms: any[] = useMemo(() => store.rooms ?? [], [store])

  const [activeTab, setActiveTab] = useState<'and' | 'or'>('and')

  // Auto-populate suggestions on first mount when store is empty
  const didAutoSuggest = useRef(false)
  useEffect(() => {
    if (didAutoSuggest.current) return
    didAutoSuggest.current = true
    if ((andComboGroups as AndComboGroup[]).length === 0) {
      const suggested = suggestAndComboGroups(subjects as any[], sections as any[])
      if (suggested.length > 0) setAndComboGroups(suggested)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleUpdate = (updated: AndComboGroup) =>
    setAndComboGroups((andComboGroups as AndComboGroup[]).map((g: AndComboGroup) => g.id === updated.id ? updated : g))

  const handleDelete = (id: string) =>
    setAndComboGroups((andComboGroups as AndComboGroup[]).filter((g: AndComboGroup) => g.id !== id))

  const handleGenerate = (id: string) => {
    const group = (andComboGroups as AndComboGroup[]).find((g: AndComboGroup) => g.id === id)
    if (!group) return
    handleUpdate({ ...group, generatedGroups: generateMatrixGroups(group, rooms) })
  }

  const addBlankMatrix = () =>
    setAndComboGroups([
      ...(andComboGroups as AndComboGroup[]),
      {
        id: makeId(), name: '', applicableSections: [],
        bundles: [], subjectColumns: [],
        groupingScope: DEFAULT_SCOPE, strengthMatrix: {},
      } as AndComboGroup,
    ])

  const allSubjectNames = useMemo(() => (subjects as any[]).map((s: any) => s.name), [subjects])
  const allSectionNames = useMemo(() => (sections as any[]).map((s: any) => s.name), [sections])

  const subjectSectionsMap = useMemo(() => {
    const map: Record<string, string[]> = {}
    for (const sub of subjects as any[]) {
      const fromCfg = (sub.classConfigs ?? []).map((c: any) => c.sectionName).filter(Boolean) as string[]
      const all = [...new Set([...fromCfg, ...(sub.sections ?? [])])]
      if (all.length > 0) map[sub.name] = all
    }
    return map
  }, [subjects])

  const groups = andComboGroups as AndComboGroup[]
  const totalGeneratedGroups = groups.reduce((t, g) => t + (g.generatedGroups?.length ?? 0), 0)

  return (
    <div style={{ padding: '20px 24px 40px', maxWidth: 1280, margin: '0 auto' }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
        <div style={{ width: 40, height: 40, borderRadius: 10, background: '#EDE9FF', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Layers size={20} color="#7C6FE0" />
        </div>
        <div style={{ flex: 1 }}>
          <h2 style={{ fontFamily: "'Plus Jakarta Sans', serif", fontSize: 22, color: '#13111E', margin: 0, lineHeight: 1.1 }}>Groups &amp; Combos</h2>
          <div style={{ fontSize: 12, color: '#4B5275', marginTop: 3 }}>
            Define <em style={{ color: '#7C6FE0' }}>AND subject groups</em> (Maths vs Bio, PE vs Painting) and{' '}
            <em style={{ color: '#D97706' }}>OR elective slots</em> (R1/R2/R3, PE/Art) for parallel scheduling.
          </div>
        </div>
      </div>

      {/* Tab bar */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 20, borderBottom: '2px solid #E8E4FF' }}>
        {([
          { key: 'and', label: 'AND Groups', icon: <Layers size={14} /> },
          { key: 'or',  label: 'OR Groups',  icon: <Shuffle size={14} /> },
        ] as const).map(tab => {
          const active = activeTab === tab.key
          return (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 7,
                padding: '9px 18px', border: 'none', cursor: 'pointer',
                background: 'transparent', fontFamily: 'inherit',
                fontSize: 13, fontWeight: active ? 700 : 500,
                color: active ? '#7C6FE0' : '#8B87AD',
                borderBottom: active ? '3px solid #7C6FE0' : '3px solid transparent',
                marginBottom: -2, transition: 'all 0.13s',
              }}
            >
              <span style={{ color: active ? '#7C6FE0' : '#C4B5FD' }}>{tab.icon}</span>
              {tab.label}
            </button>
          )
        })}
      </div>

      {/* ══ AND Groups ══ */}
      {activeTab === 'and' && (
        <div>
          {/* Toolbar */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#13111E', marginBottom: 2 }}>AND Groups</div>
              <div style={{ fontSize: 11, color: '#6B7280' }}>
                Each matrix: sections as rows, subjects as columns — students split across subjects, headcounts sum to section total.
              </div>
            </div>
            <button
              onClick={() => {
                const fresh = suggestAndComboGroups(subjects as any[], sections as any[])
                if (fresh.length === 0) {
                  alert('No suggestions found — mark subjects as Elective in Resources → Subjects first.')
                } else {
                  setAndComboGroups([
                    ...groups,
                    ...fresh.filter(f => !groups.some(g => g.id === f.id)),
                  ])
                }
              }}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                padding: '8px 14px', borderRadius: 8,
                border: '1.5px solid #FDE68A', background: '#FFFBEB',
                color: '#92400E', fontSize: 12, fontWeight: 700,
                cursor: 'pointer', fontFamily: 'inherit',
              }}
            >
              <Sparkles size={13} color="#D97706" /> AI Suggest
            </button>
            <button
              onClick={addBlankMatrix}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                padding: '8px 16px', borderRadius: 8, border: 'none',
                background: '#7C6FE0', color: '#fff', fontSize: 12, fontWeight: 700,
                cursor: 'pointer', fontFamily: 'inherit',
                boxShadow: '0 2px 8px rgba(124,111,224,0.35)',
              }}
            >
              <Plus size={13} /> Add Matrix Table
            </button>
          </div>

          {/* Cards */}
          {groups.length === 0 ? (
            <div style={{ padding: '44px 20px', textAlign: 'center', background: '#FAFAFE', borderRadius: 12, border: '1.5px dashed #E4E0FF' }}>
              <Layers size={32} color="#C4B5FD" style={{ marginBottom: 12 }} />
              <div style={{ fontSize: 14, fontWeight: 700, color: '#8B87AD', marginBottom: 6 }}>No AND Groups yet</div>
              <div style={{ fontSize: 12, color: '#B8B4D4', marginBottom: 16, lineHeight: 1.6 }}>
                Click <strong>AI Suggest</strong> to auto-detect optional subject splits,<br />
                or <strong>Add Matrix Table</strong> to create one manually.
              </div>
              <button onClick={addBlankMatrix} style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                padding: '9px 20px', borderRadius: 8, border: 'none',
                background: '#7C6FE0', color: '#fff', fontSize: 13, fontWeight: 700,
                cursor: 'pointer', fontFamily: 'inherit',
                boxShadow: '0 2px 8px rgba(124,111,224,0.3)',
              }}>
                <Plus size={14} /> Add Matrix Table
              </button>
            </div>
          ) : (
            groups.map(group => (
              <MatrixTableCard
                key={group.id}
                group={group}
                sections={sections as any[]}
                allSubjectNames={allSubjectNames}
                allSectionNames={allSectionNames}
                onUpdate={handleUpdate}
                onDelete={() => handleDelete(group.id)}
                onGenerateGroups={() => handleGenerate(group.id)}
              />
            ))
          )}

          {/* Summary bar */}
          {groups.length > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4, padding: '10px 14px', borderRadius: 8, background: '#F5F2FF', border: '1px solid #E8E4FF' }}>
              <Zap size={13} color="#7C6FE0" />
              <span style={{ fontSize: 11, color: '#7C6FE0', fontWeight: 600, flex: 1 }}>
                {totalGeneratedGroups} teaching group{totalGeneratedGroups !== 1 ? 's' : ''} across {groups.length} matrix table{groups.length !== 1 ? 's' : ''}
              </span>
              <button
                onClick={() => setAndComboGroups(groups.map(g => ({ ...g, generatedGroups: generateMatrixGroups(g, rooms) })))}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '6px 14px', borderRadius: 7, border: '1.5px solid #C4B5FD', background: '#fff', color: '#7C6FE0', fontSize: 11, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}
              >
                <RefreshCw size={11} /> Generate All
              </button>
            </div>
          )}

          {/* Navigation */}
          <div style={{ display: 'flex', gap: 10, marginTop: 16, flexWrap: 'wrap', alignItems: 'center' }}>
            <button onClick={() => setStep(3)} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '9px 16px', borderRadius: 8, border: '1px solid #E8E4FF', background: '#fff', color: '#4B5275', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
              <ChevronLeft size={14} /> Period allocation
            </button>
            <div style={{ flex: 1 }} />
            <button onClick={() => setActiveTab('or')} style={{ display: 'inline-flex', alignItems: 'center', gap: 7, padding: '9px 18px', borderRadius: 8, border: '1px solid #FDE68A', background: '#FFFBEB', color: '#92400E', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
              OR Groups <Shuffle size={13} />
            </button>
            <button onClick={() => setStep(5)} style={{ display: 'inline-flex', alignItems: 'center', gap: 7, padding: '9px 20px', borderRadius: 8, border: 'none', background: 'linear-gradient(135deg, #7C6FE0, #9B8EF5)', color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', boxShadow: '0 2px 8px rgba(124,111,224,0.35)' }}>
              Next: Review &amp; generate <ChevronRight size={14} />
            </button>
          </div>
        </div>
      )}

      {/* ══ OR Groups ══ */}
      {activeTab === 'or' && (
        <div>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, padding: '14px 16px', marginBottom: 20, borderRadius: 10, background: '#FFFBEB', border: '1px solid #FDE68A' }}>
            <Shuffle size={18} color="#D97706" style={{ flexShrink: 0, marginTop: 2 }} />
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#92400E', marginBottom: 4 }}>OR / AND Subject Combos</div>
              <div style={{ fontSize: 12, color: '#78350F', lineHeight: 1.65 }}>
                <strong>OR combo</strong> — one subject runs per slot; whichever teacher is free takes that period.<br />
                <strong>AND combo</strong> — all subjects share one slot in parallel, students divide into groups.
              </div>
            </div>
          </div>

          <SubjectGroupsSection
            groups={store.subjectGroups ?? []}
            setGroups={store.setSubjectGroups}
            allSubjectNames={allSubjectNames}
            allSectionNames={allSectionNames}
            subjectSectionsMap={subjectSectionsMap}
            defaultOpen
          />

          <div style={{ display: 'flex', gap: 10, marginTop: 20, flexWrap: 'wrap', alignItems: 'center' }}>
            <button onClick={() => setActiveTab('and')} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '9px 16px', borderRadius: 8, border: '1px solid #E8E4FF', background: '#fff', color: '#4B5275', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
              <ChevronLeft size={14} /> AND Groups
            </button>
            <div style={{ flex: 1 }} />
            <button onClick={() => setStep(5)} style={{ display: 'inline-flex', alignItems: 'center', gap: 7, padding: '9px 20px', borderRadius: 8, border: 'none', background: 'linear-gradient(135deg, #7C6FE0, #9B8EF5)', color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', boxShadow: '0 2px 8px rgba(124,111,224,0.35)' }}>
              Next: Review &amp; generate <ChevronRight size={14} />
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
