/**
 * Step 4 — AND Groups + OR Groups
 *
 * AND Groups tab: a responsive grid of compact "combination" cards. Each card is
 *   one split point — rows = sections, columns = mutually-exclusive subjects
 *   (e.g. Maths vs Bio). Everything is edited inline (no modal). A per-card scope
 *   knob controls how sections merge into teaching groups.
 *
 * OR Groups tab: elective slots via SubjectGroupsSection (unchanged).
 *
 * The conservative AI auto-creates ONLY high-confidence stream splits
 * (XI/XII Science: Maths vs Bio). Broadly-shared electives are surfaced as a
 * dismissible hint pointing to the OR tab — never bundled into a combination.
 */

import { useState, useMemo, useRef, useEffect } from 'react'
import { useTimetableStore } from '@/store/timetableStore'
import type { AndComboGroup, AndTeachingGroup, AndGroupScope, SubjectBundle } from '@/types'
import {
  Layers, Shuffle, ChevronRight, ChevronLeft, Plus, Trash2,
  Sparkles, RefreshCw, Zap, CheckCircle2, AlertCircle, XCircle,
  Wand2, Info, X,
} from 'lucide-react'
import { SubjectGroupsSection } from '@/components/resources/SubjectGroupsSection'

// ── constants & helpers ────────────────────────────────────────────────────────

const PALETTE = ['#7C6FE0', '#10B981', '#F59E0B', '#EF4444', '#3B82F6', '#EC4899', '#8B5CF6', '#06B6D4']
function colColor(i: number) { return PALETTE[i % PALETTE.length] }
function makeId() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 6) }

/** Section name → { grade, stream }. "XI-Sci-A" → { grade:'XI', stream:'Sci' } */
function parseSection(name: string): { grade: string; stream: string } {
  const parts = (name ?? '').split('-')
  return { grade: parts[0] ?? name, stream: parts[1] ?? '' }
}

function isScienceSenior(secName: string): boolean {
  const u = (secName ?? '').toUpperCase()
  return (u.includes('SCI') || u.includes('SCIENCE')) &&
    (secName.startsWith('XI') || secName.startsWith('XII'))
}

const ROMAN: Record<string, number> = { I:1, II:2, III:3, IV:4, V:5, VI:6, VII:7, VIII:8, IX:9, X:10, XI:11, XII:12 }
function gradeNum(grade: string): number {
  const u = (grade ?? '').toUpperCase().replace(/[^IVX0-9]/g, '')
  if (ROMAN[u] != null) return ROMAN[u]
  const n = parseInt(grade)
  return isNaN(n) ? 99 : n
}
/** Grade-band proxy used for the "block" scope dimension. */
function blockOf(secName: string): string {
  const n = gradeNum(parseSection(secName).grade)
  if (n <= 5) return 'Primary'
  if (n <= 8) return 'Middle'
  if (n <= 10) return 'Secondary'
  if (n <= 12) return 'Senior'
  return 'Other'
}

// ── grouping scope (4 independent same/cross axes) ──────────────────────────────

const DEFAULT_SCOPE: AndGroupScope = { section: 'same', grade: 'same', stream: 'same', block: 'same' }

const SCOPE_DIMS: { key: keyof AndGroupScope; label: string; desc: string }[] = [
  { key: 'section', label: 'Section', desc: 'Same: each section keeps its own group. Cross: sections may merge.' },
  { key: 'grade',   label: 'Grade',   desc: 'Same: only merge sections of the same grade. Cross: merge across grades.' },
  { key: 'stream',  label: 'Stream',  desc: 'Same: only merge same-stream sections. Cross: merge across streams.' },
  { key: 'block',   label: 'Block',   desc: 'Same: only merge within the same grade-band (Primary/Middle/Secondary/Senior). Cross: merge across bands.' },
]

/** Tolerant read: migrates the old single-enum groupingScope to the axis record. */
function getScope(g: AndComboGroup): AndGroupScope {
  const s: any = g.groupingScope
  if (!s) return DEFAULT_SCOPE
  if (typeof s === 'string') {
    switch (s) {
      case 'SAME_GRADE':  return { section: 'cross', grade: 'same',  stream: 'cross', block: 'cross' }
      case 'SAME_STREAM': return { section: 'cross', grade: 'cross', stream: 'same',  block: 'cross' }
      case 'CROSS_GRADE': return { section: 'cross', grade: 'cross', stream: 'cross', block: 'cross' }
      default:            return DEFAULT_SCOPE // PER_SECTION
    }
  }
  return {
    section: s.section ?? 'same', grade: s.grade ?? 'same',
    stream: s.stream ?? 'same',  block: s.block ?? 'same',
  }
}

// ── group <-> column helpers ─────────────────────────────────────────────────

function getCols(group: AndComboGroup): string[] {
  if (group.subjects && group.subjects.length) return group.subjects
  // back-compat: derive from bundles
  const cols: string[] = []
  for (const b of group.bundles ?? []) for (const s of b.subjects) if (!cols.includes(s)) cols.push(s)
  return cols
}

/** Keep `bundles` in sync with the subject columns so the solver bridge — which
 *  reads group.bundles[].id and strengthMatrix[sec][bundle.id] — keeps working. */
function syncBundles(cols: string[]): SubjectBundle[] {
  return cols.map((s, i) => ({ id: s, name: s, subjects: [s], color: colColor(i) }))
}

function autoName(cols: string[]): string {
  return cols.map(c => c.split(' ')[0]).join(' / ')
}

function getCell(group: AndComboGroup, sec: string, sub: string): number {
  return group.strengthMatrix?.[sec]?.[sub] ?? 0
}

// ── AI suggestion (slot / category driven) ──────────────────────────────────────

interface OptInfo { sub: any; optional: boolean; slot?: string; category?: string; sections: string[] }

function readOpt(sub: any): OptInfo {
  const cfgs = (sub.classConfigs ?? []) as any[]
  const optional = sub.isOptional === true || cfgs.some(c => c.isOptional === true)
  const slot = sub.electiveSlotId ?? cfgs.find(c => c.electiveSlotId)?.electiveSlotId
  const category = sub.category ?? cfgs.find(c => c.category)?.category
  const fromCfg = cfgs.map(c => c.sectionName).filter(Boolean) as string[]
  const sections = [...new Set([...fromCfg, ...(sub.sections ?? [])])]
  return { sub, optional, slot, category, sections }
}

/**
 * Auto-build combination tables from how electives were set up in Resources →
 * Subjects. Mutually-exclusive electives are grouped by:
 *   1. electiveSlotId  (explicit slot — strongest signal), else
 *   2. category + identical section signature (e.g. two "Co-scholastic" options
 *      offered to the same sections).
 * A group becomes a card ONLY when it has ≥2 distinct subjects — a lone elective
 * shared across sections is never turned into a combination (per requirement).
 * Different slots / categories stay in SEPARATE cards (Maths/Bio apart from PE/Painting).
 */
function suggestAndComboGroups(subjects: any[], sections: any[]): AndComboGroup[] {
  const opts = subjects.map(readOpt).filter(o => o.optional && o.sections.length > 0)

  const byKey = new Map<string, OptInfo[]>()
  for (const o of opts) {
    const key = o.slot
      ? `slot:${o.slot}`
      : o.category
        ? `cat:${o.category}|${[...o.sections].sort().join(',')}`
        : null
    if (!key) continue
    if (!byKey.has(key)) byKey.set(key, [])
    byKey.get(key)!.push(o)
  }

  const out: AndComboGroup[] = []
  const seen = new Set<string>()
  for (const [key, members] of byKey) {
    const cols = [...new Set(members.map(m => m.sub.name))]
    if (cols.length < 2) continue                 // lone elective → not a combination
    const sig = [...cols].sort().join('|')
    if (seen.has(sig)) continue
    seen.add(sig)
    const secs = [...new Set(members.flatMap(m => m.sections))]
      .sort((a, b) => gradeNum(parseSection(a).grade) - gradeNum(parseSection(b).grade) || a.localeCompare(b))
    out.push({
      id: `ai_${key.replace(/[^a-z0-9]/gi, '').slice(0, 14)}_${cols.join('').replace(/[^a-z0-9]/gi, '').slice(0, 10)}`,
      name: autoName(cols),
      applicableSections: secs,
      subjects: cols,
      bundles: syncBundles(cols),
      groupingScope: DEFAULT_SCOPE,
      strengthMatrix: {},
      aiSuggested: true,
    })
  }

  // Fallback: classic Science Maths-vs-Bio split when no slot/category produced one
  if (out.length === 0) {
    const sci = sections.filter(s => isScienceSenior(s.name))
    if (sci.length > 0) {
      const maths = subjects.find(s => readOpt(s).optional && /math/i.test(s.name))?.name
      const bio   = subjects.find(s => readOpt(s).optional && /bio/i.test(s.name))?.name
      const cols = [maths, bio].filter(Boolean) as string[]
      if (cols.length >= 2) out.push({
        id: 'ai_sci_mathsbio', name: autoName(cols),
        applicableSections: sci.map(s => s.name),
        subjects: cols, bundles: syncBundles(cols),
        groupingScope: DEFAULT_SCOPE, strengthMatrix: {}, aiSuggested: true,
      })
    }
  }

  return out
}

/** Optional subjects NOT consumed by any auto card (lone electives). Surfaced as
 *  a hint pointing to the OR tab — never bundled into a combination. */
function detectSharedElectives(subjects: any[], consumed: Set<string>): string[] {
  const shared: string[] = []
  for (const sub of subjects) {
    if (consumed.has(sub.name)) continue
    const o = readOpt(sub)
    if (o.optional && o.sections.length >= 2) shared.push(sub.name)
  }
  return shared
}

// ── teaching-group generation (scope-aware) ─────────────────────────────────────

/** Pool key from the scope axes set to 'same'. Empty (all cross) → one pool. */
function poolKeyFor(scope: AndGroupScope, secName: string): string {
  const { grade, stream } = parseSection(secName)
  const parts: string[] = []
  if (scope.section === 'same') parts.push('S:' + secName)
  if (scope.grade === 'same')   parts.push('G:' + grade)
  if (scope.stream === 'same')  parts.push('T:' + (stream || '-'))
  if (scope.block === 'same')   parts.push('B:' + blockOf(secName))
  return parts.join('|') || 'ALL'
}

function generateAndGroups(group: AndComboGroup, rooms: any[]): AndTeachingGroup[] {
  const cols = getCols(group)
  const scope = getScope(group)
  const sorted = [...rooms].sort((a, b) => (a.capacity ?? 0) - (b.capacity ?? 0))
  const biggest = sorted.length > 0 ? sorted[sorted.length - 1].capacity ?? 0 : Infinity
  const result: AndTeachingGroup[] = []

  for (const sub of cols) {
    // slices with a positive headcount
    const slices = group.applicableSections
      .map(sec => ({ sectionName: sec, studentCount: getCell(group, sec, sub) }))
      .filter(s => s.studentCount > 0)
    if (slices.length === 0) continue

    // pool slices by scope
    const pools = new Map<string, typeof slices>()
    for (const sl of slices) {
      const k = poolKeyFor(scope, sl.sectionName)
      if (!pools.has(k)) pools.set(k, [])
      pools.get(k)!.push(sl)
    }

    const subKey = sub.replace(/\s/g, '')
    let gIdx = 1

    const emit = (poolSlices: typeof slices, strength: number) => {
      const room = sorted.find(r => (r.capacity ?? 0) >= strength) ?? sorted[sorted.length - 1]
      result.push({
        id: `${group.id}_${subKey}_G${gIdx++}`,
        bundleId: sub,
        bundleName: sub,
        subjects: [sub],
        sectionSlices: poolSlices,
        totalStrength: strength,
        room: room?.name ?? room?.actualName,
        roomCapacity: room?.capacity,
        capacityWarning: (room?.capacity ?? 0) < strength,
      })
    }

    for (const poolSlices of pools.values()) {
      const total = poolSlices.reduce((a, s) => a + s.studentCount, 0)
      if (total <= biggest || biggest === Infinity) {
        emit(poolSlices, total)
      } else {
        // split the pool into room-sized batches
        let batch: typeof slices = []
        let bstr = 0
        const flush = () => { if (batch.length) { emit([...batch], bstr); batch = []; bstr = 0 } }
        for (const sl of poolSlices) {
          if (bstr + sl.studentCount > biggest && batch.length) flush()
          batch.push(sl); bstr += sl.studentCount
        }
        flush()
      }
    }
  }
  return result
}

// ── table styles ─────────────────────────────────────────────────────────────

const TH = (align: 'left' | 'center', w?: number): React.CSSProperties => ({
  padding: '5px 7px', fontSize: 9.5, fontWeight: 800, color: '#8B87AD',
  textTransform: 'uppercase', letterSpacing: '0.05em', background: '#F8F7FF',
  borderBottom: '2px solid #E8E4FF', textAlign: align,
  width: w, minWidth: w, whiteSpace: 'nowrap',
} as React.CSSProperties)
const TD = (align: 'left' | 'center'): React.CSSProperties => ({
  padding: '4px 7px', textAlign: align, borderBottom: '1px solid #F0EDFF',
})

// ── inline picker dropdown ─────────────────────────────────────────────────────

function Picker({
  items, existing, placeholder, anchor, onAdd, onClose,
}: {
  items: string[]
  existing: string[]
  placeholder: string
  anchor: 'up' | 'down'
  onAdd: (s: string) => void
  onClose: () => void
}) {
  const [q, setQ] = useState('')
  const avail = items.filter(s => !existing.includes(s) && s.toLowerCase().includes(q.toLowerCase()))
  return (
    <div
      onMouseDown={e => e.stopPropagation()}
      style={{
        position: 'absolute', zIndex: 500, left: 0,
        [anchor === 'up' ? 'bottom' : 'top']: '100%',
        [anchor === 'up' ? 'marginBottom' : 'marginTop']: 4,
        background: '#fff', border: '1.5px solid #E4E0FF', borderRadius: 9,
        boxShadow: '0 8px 28px rgba(0,0,0,0.13)', minWidth: 190,
      }}
    >
      <div style={{ padding: '6px 8px', borderBottom: '1px solid #F0EDFF' }}>
        <input
          autoFocus value={q} onChange={e => setQ(e.target.value)} placeholder={placeholder}
          style={{ width: '100%', boxSizing: 'border-box', padding: '4px 7px', borderRadius: 5, border: '1.5px solid #E4E0FF', fontSize: 12, outline: 'none', fontFamily: 'inherit' }}
        />
      </div>
      <div style={{ maxHeight: 190, overflowY: 'auto' }}>
        {avail.length === 0
          ? <div style={{ padding: '9px 12px', fontSize: 12, color: '#C4C0DC' }}>Nothing to add</div>
          : avail.map(s => (
            <button key={s} onMouseDown={() => { onAdd(s); onClose() }} style={{
              display: 'block', width: '100%', textAlign: 'left', padding: '7px 12px',
              border: 'none', background: 'none', fontSize: 12, color: '#374151',
              cursor: 'pointer', fontFamily: 'inherit',
            }}
            onMouseEnter={e => { e.currentTarget.style.background = '#F5F2FF' }}
            onMouseLeave={e => { e.currentTarget.style.background = 'none' }}>
              + {s}
            </button>
          ))}
      </div>
    </div>
  )
}

// ── combination card ───────────────────────────────────────────────────────────

function ComboCard({
  group, sections, allSubjectNames, allSectionNames, onUpdate, onDelete, onGenerate,
}: {
  group: AndComboGroup
  sections: any[]
  allSubjectNames: string[]
  allSectionNames: string[]
  onUpdate: (g: AndComboGroup) => void
  onDelete: () => void
  onGenerate: () => void
}) {
  const [picker, setPicker] = useState<null | 'subject' | 'section'>(null)
  const cardRef = useRef<HTMLDivElement>(null)

  const cols  = getCols(group)
  const scope = getScope(group)

  useEffect(() => {
    if (!picker) return
    const onDoc = (e: MouseEvent) => {
      if (cardRef.current && !cardRef.current.contains(e.target as Node)) setPicker(null)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [picker])

  const getTotal = (sec: string) => sections.find((s: any) => s.name === sec)?.strength ?? 0

  const patch = (p: Partial<AndComboGroup>) => onUpdate({ ...group, aiSuggested: false, ...p })

  const setCell = (sec: string, sub: string, val: number) =>
    patch({
      strengthMatrix: {
        ...group.strengthMatrix,
        [sec]: { ...(group.strengthMatrix?.[sec] ?? {}), [sub]: val },
      },
    })

  const addSubject = (sub: string) => {
    const next = [...cols, sub]
    patch({ subjects: next, bundles: syncBundles(next), name: group.name?.trim() && group.name !== autoName(cols) ? group.name : autoName(next) })
  }
  const removeSubject = (sub: string) => {
    const next = cols.filter(c => c !== sub)
    const sm: Record<string, Record<string, number>> = {}
    for (const [sec, vals] of Object.entries(group.strengthMatrix ?? {})) {
      const v = { ...vals }; delete v[sub]; sm[sec] = v
    }
    patch({ subjects: next, bundles: syncBundles(next), strengthMatrix: sm, name: !group.name?.trim() || group.name === autoName(cols) ? autoName(next) : group.name })
  }
  const addSection = (sec: string) => patch({ applicableSections: [...group.applicableSections, sec] })
  const removeSection = (sec: string) => {
    const sm = { ...group.strengthMatrix }; delete sm[sec]
    patch({ applicableSections: group.applicableSections.filter(s => s !== sec), strengthMatrix: sm })
  }

  const splitEvenly = () => {
    if (cols.length === 0) return
    const sm: Record<string, Record<string, number>> = { ...group.strengthMatrix }
    for (const sec of group.applicableSections) {
      const total = getTotal(sec)
      if (total <= 0) continue
      const base = Math.floor(total / cols.length)
      const rem  = total - base * cols.length
      const row: Record<string, number> = { ...(sm[sec] ?? {}) }
      cols.forEach((c, i) => { row[c] = base + (i < rem ? 1 : 0) })
      sm[sec] = row
    }
    patch({ strengthMatrix: sm })
  }

  const generatedCount = group.generatedGroups?.length ?? 0

  return (
    <div ref={cardRef} style={{
      border: '1.5px solid #E4E0FF', borderRadius: 12, background: '#fff',
      position: 'relative', display: 'flex', flexDirection: 'column',
      boxShadow: '0 1px 3px rgba(124,111,224,0.06)',
    }}>
      {/* header */}
      <div style={{
        padding: '9px 12px', background: '#F3F1FF', borderRadius: '12px 12px 0 0',
        borderBottom: '1px solid #E8E4FF', display: 'flex', alignItems: 'center', gap: 7,
      }}>
        {group.aiSuggested && (
          <span style={{ fontSize: 9, background: '#7C6FE0', color: '#fff', borderRadius: 3, padding: '1px 5px', fontWeight: 700, flexShrink: 0 }}>⚡ AI</span>
        )}
        <input
          value={group.name}
          onChange={e => patch({ name: e.target.value })}
          placeholder="Combination name…"
          style={{
            flex: 1, minWidth: 0, padding: '3px 7px', borderRadius: 5,
            border: '1.5px solid transparent', background: 'transparent',
            fontSize: 12.5, fontWeight: 800, color: '#13111E', outline: 'none', fontFamily: 'inherit',
          }}
          onFocus={e => { e.currentTarget.style.border = '1.5px solid #C4B5FD'; e.currentTarget.style.background = '#fff' }}
          onBlur={e => { e.currentTarget.style.border = '1.5px solid transparent'; e.currentTarget.style.background = 'transparent' }}
        />
        <button onClick={onDelete} title="Delete combination" style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#EF4444', padding: 3, flexShrink: 0 }}>
          <Trash2 size={13} />
        </button>
      </div>

      {/* scope selector — 4 independent same/cross axes */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 12px', borderBottom: '1px solid #F0EDFF', flexWrap: 'wrap' }}>
        <span style={{ fontSize: 9.5, fontWeight: 700, color: '#8B87AD', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Merge:</span>
        {SCOPE_DIMS.map(dim => {
          const val = scope[dim.key]
          return (
            <div key={dim.key} title={dim.desc} style={{ display: 'inline-flex', alignItems: 'center', borderRadius: 5, overflow: 'hidden', border: '1.5px solid #E4E0FF' }}>
              <span style={{ fontSize: 9, fontWeight: 700, color: '#8B87AD', padding: '2px 5px', background: '#F8F7FF' }}>{dim.label}</span>
              {(['same', 'cross'] as const).map(v => {
                const active = val === v
                return (
                  <button key={v} onClick={() => patch({ groupingScope: { ...scope, [dim.key]: v } })} style={{
                    padding: '2px 7px', border: 'none', fontSize: 9.5, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
                    background: active ? (v === 'same' ? '#7C6FE0' : '#F59E0B') : '#fff',
                    color: active ? '#fff' : '#C4C0DC',
                  }}>
                    {v === 'same' ? 'Same' : 'Cross'}
                  </button>
                )
              })}
            </div>
          )
        })}
      </div>

      {/* matrix */}
      <div style={{ padding: '8px 12px', overflowX: 'auto', flex: 1 }}>
        {cols.length === 0 && group.applicableSections.length === 0 ? (
          <div style={{ padding: '16px 0', textAlign: 'center', color: '#B8B4D4', fontSize: 11.5, lineHeight: 1.5 }}>
            Add subjects (columns) and<br />class-sections (rows) below.
          </div>
        ) : (
          <table style={{ borderCollapse: 'collapse', width: '100%' }}>
            <thead>
              <tr>
                <th style={TH('left', 96)}>Section</th>
                <th style={TH('center', 44)}>Tot</th>
                {cols.map((sub, ci) => (
                  <th key={sub} style={{ ...TH('center', 70), color: colColor(ci) }}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                      {sub.split(' ')[0]}
                      <button onClick={() => removeSubject(sub)} title={`Remove ${sub}`} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#D1D5DB', padding: 0, lineHeight: 1, fontSize: 10 }}
                        onMouseEnter={e => { e.currentTarget.style.color = '#EF4444' }}
                        onMouseLeave={e => { e.currentTarget.style.color = '#D1D5DB' }}>✕</button>
                    </span>
                  </th>
                ))}
                <th style={TH('center', 56)}>✓</th>
              </tr>
            </thead>
            <tbody>
              {group.applicableSections.map((sec, ri) => {
                const total = getTotal(sec)
                const sum = cols.reduce((a, s) => a + getCell(group, sec, s), 0)
                const isMatch = total > 0 && sum === total
                const isOver = sum > total
                return (
                  <tr key={sec} style={{ background: ri % 2 === 0 ? '#fff' : '#FAFAFE' }}>
                    <td style={TD('left')}>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                        <span style={{ fontSize: 11.5, fontWeight: 700, color: '#374151' }}>{sec}</span>
                        <button onClick={() => removeSection(sec)} title="Remove section" style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#D1D5DB', padding: 0, lineHeight: 1, fontSize: 10 }}
                          onMouseEnter={e => { e.currentTarget.style.color = '#EF4444' }}
                          onMouseLeave={e => { e.currentTarget.style.color = '#D1D5DB' }}>✕</button>
                      </span>
                    </td>
                    <td style={TD('center')}>
                      <span style={{ fontSize: 11.5, fontWeight: 600, color: '#6B7280' }}>{total || '—'}</span>
                    </td>
                    {cols.map((sub, ci) => (
                      <td key={sub} style={TD('center')}>
                        <input
                          type="number" min={0}
                          value={getCell(group, sec, sub) || ''}
                          onChange={e => setCell(sec, sub, Math.max(0, parseInt(e.target.value) || 0))}
                          placeholder="0"
                          style={{
                            width: 52, padding: '3px 4px', borderRadius: 5, textAlign: 'center',
                            border: `1.5px solid ${isOver ? '#FCA5A5' : colColor(ci) + '55'}`,
                            fontSize: 12.5, fontWeight: 700, outline: 'none', fontFamily: 'inherit',
                            background: isOver ? '#FEF2F2' : colColor(ci) + '0D', color: '#111028',
                          }}
                        />
                      </td>
                    ))}
                    <td style={TD('center')}>
                      {total === 0
                        ? <span style={{ fontSize: 10, color: '#C4C0DC' }}>—</span>
                        : isMatch
                          ? <CheckCircle2 size={13} color="#15803D" />
                          : isOver
                            ? <span style={{ color: '#DC2626', fontSize: 10.5, fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 1 }}><XCircle size={11} />+{sum - total}</span>
                            : sum > 0
                              ? <span style={{ color: '#D97706', fontSize: 10.5, fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 1 }}><AlertCircle size={11} />−{total - sum}</span>
                              : <span style={{ fontSize: 10, color: '#C4C0DC' }}>○</span>
                      }
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* actions */}
      <div style={{ padding: '8px 12px 10px', display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', borderTop: '1px dashed #E8E4FF' }}>
        <div style={{ position: 'relative' }}>
          <button onClick={() => setPicker(p => p === 'section' ? null : 'section')} style={{
            display: 'inline-flex', alignItems: 'center', gap: 4, padding: '4px 9px', borderRadius: 6,
            border: '1.5px dashed #C4B5FD', background: '#F5F3FF', color: '#7C6FE0', fontSize: 10.5, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
          }}>
            <Plus size={10} /> Section
          </button>
          {picker === 'section' && (
            <Picker items={allSectionNames} existing={group.applicableSections} placeholder="Search sections…" anchor="up"
              onAdd={addSection} onClose={() => setPicker(null)} />
          )}
        </div>

        <div style={{ position: 'relative' }}>
          <button onClick={() => setPicker(p => p === 'subject' ? null : 'subject')} style={{
            display: 'inline-flex', alignItems: 'center', gap: 4, padding: '4px 9px', borderRadius: 6,
            border: '1.5px dashed #A7F3D0', background: '#F0FDF4', color: '#065F46', fontSize: 10.5, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
          }}>
            <Plus size={10} /> Subject
          </button>
          {picker === 'subject' && (
            <Picker items={allSubjectNames} existing={cols} placeholder="Search subjects…" anchor="up"
              onAdd={addSubject} onClose={() => setPicker(null)} />
          )}
        </div>

        {cols.length > 0 && group.applicableSections.length > 0 && (
          <button onClick={splitEvenly} title="Split each section's total evenly across the columns" style={{
            display: 'inline-flex', alignItems: 'center', gap: 4, padding: '4px 9px', borderRadius: 6,
            border: '1.5px solid #FDE68A', background: '#FFFBEB', color: '#92400E', fontSize: 10.5, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
          }}>
            <Wand2 size={10} /> Split evenly
          </button>
        )}

        <div style={{ flex: 1 }} />

        <button onClick={onGenerate} title="Generate teaching groups" style={{
          display: 'inline-flex', alignItems: 'center', gap: 4, padding: '4px 10px', borderRadius: 6,
          border: '1.5px solid #C4B5FD', background: '#F5F2FF', color: '#7C6FE0', fontSize: 10.5, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
        }}>
          <RefreshCw size={10} /> Groups
        </button>
      </div>

      {/* generated chips */}
      {generatedCount > 0 && (
        <div style={{ padding: '0 12px 10px', display: 'flex', flexWrap: 'wrap', gap: 5 }}>
          {group.generatedGroups!.map((g, gi) => (
            <span key={g.id} title={g.sectionSlices.map(s => `${s.sectionName}: ${s.studentCount}`).join(', ')} style={{
              fontSize: 9.5, fontWeight: 700, padding: '2px 7px', background: colColor(gi), color: '#fff', borderRadius: 4,
            }}>
              {g.subjects[0] ?? g.bundleName} · {g.totalStrength}{g.room ? ` · ${g.room}` : ''}{g.capacityWarning ? ' ⚠' : ''}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}

// ── main component ─────────────────────────────────────────────────────────────

export function StepStudentGroups() {
  const store = useTimetableStore() as any
  const { sections, subjects, setStep, andComboGroups, setAndComboGroups } = store
  const rooms: any[] = useMemo(() => store.rooms ?? [], [store])

  const [activeTab, setActiveTab] = useState<'and' | 'or'>('and')
  const [hintDismissed, setHintDismissed] = useState(false)

  const groups = andComboGroups as AndComboGroup[]

  // Conservative auto-suggest on first mount when store is empty
  const didAuto = useRef(false)
  useEffect(() => {
    if (didAuto.current) return
    didAuto.current = true
    if (groups.length === 0) {
      const fresh = suggestAndComboGroups(subjects as any[], sections as any[])
      if (fresh.length > 0) setAndComboGroups(fresh)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleUpdate = (u: AndComboGroup) => setAndComboGroups(groups.map(g => g.id === u.id ? u : g))
  const handleDelete = (id: string) => setAndComboGroups(groups.filter(g => g.id !== id))
  const handleGenerate = (id: string) => {
    const g = groups.find(x => x.id === id); if (!g) return
    handleUpdate({ ...g, generatedGroups: generateAndGroups(g, rooms) })
  }
  const addBlank = () => setAndComboGroups([
    ...groups,
    { id: makeId(), name: '', applicableSections: [], subjects: [], bundles: [], groupingScope: DEFAULT_SCOPE, strengthMatrix: {} } as AndComboGroup,
  ])
  const runAiSuggest = () => {
    const fresh = suggestAndComboGroups(subjects as any[], sections as any[])
      .filter(f => !groups.some(g => g.subjects?.join() === f.subjects?.join()))
    if (fresh.length === 0) { alert('No new stream splits detected. Mark academic options (Maths/Bio) as Elective in Resources → Subjects, or add a combination manually.'); return }
    setAndComboGroups([...groups, ...fresh])
  }

  const allSubjectNames = useMemo(() => (subjects as any[]).map((s: any) => s.name), [subjects])
  const allSectionNames = useMemo(() => (sections as any[]).map((s: any) => s.name), [sections])

  // shared electives (hint only)
  const consumed = useMemo(() => {
    const set = new Set<string>()
    for (const g of groups) for (const c of getCols(g)) set.add(c)
    return set
  }, [groups])
  const sharedElectives = useMemo(
    () => detectSharedElectives(subjects as any[], consumed),
    [subjects, consumed],
  )

  const subjectSectionsMap = useMemo(() => {
    const map: Record<string, string[]> = {}
    for (const sub of subjects as any[]) {
      const fromCfg = (sub.classConfigs ?? []).map((c: any) => c.sectionName).filter(Boolean) as string[]
      const all = [...new Set([...fromCfg, ...(sub.sections ?? [])])]
      if (all.length > 0) map[sub.name] = all
    }
    return map
  }, [subjects])

  const totalGenerated = groups.reduce((t, g) => t + (g.generatedGroups?.length ?? 0), 0)

  return (
    <div style={{ padding: '20px 24px 40px', maxWidth: 1280, margin: '0 auto' }}>

      {/* header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
        <div style={{ width: 40, height: 40, borderRadius: 10, background: '#EDE9FF', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Layers size={20} color="#7C6FE0" />
        </div>
        <div style={{ flex: 1 }}>
          <h2 style={{ fontFamily: "'Plus Jakarta Sans', serif", fontSize: 22, color: '#13111E', margin: 0, lineHeight: 1.1 }}>Groups &amp; Combos</h2>
          <div style={{ fontSize: 12, color: '#4B5275', marginTop: 3 }}>
            Define <em style={{ color: '#7C6FE0' }}>AND combinations</em> (Maths vs Bio — students split in parallel) and{' '}
            <em style={{ color: '#D97706' }}>OR elective slots</em> (pick one of many).
          </div>
        </div>
      </div>

      {/* tabs */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 20, borderBottom: '2px solid #E8E4FF' }}>
        {([
          { key: 'and', label: 'AND Groups', icon: <Layers size={14} /> },
          { key: 'or',  label: 'OR Groups',  icon: <Shuffle size={14} /> },
        ] as const).map(tab => {
          const active = activeTab === tab.key
          return (
            <button key={tab.key} onClick={() => setActiveTab(tab.key)} style={{
              display: 'inline-flex', alignItems: 'center', gap: 7, padding: '9px 18px', border: 'none', cursor: 'pointer',
              background: 'transparent', fontFamily: 'inherit', fontSize: 13, fontWeight: active ? 700 : 500,
              color: active ? '#7C6FE0' : '#8B87AD', borderBottom: active ? '3px solid #7C6FE0' : '3px solid transparent',
              marginBottom: -2, transition: 'all 0.13s',
            }}>
              <span style={{ color: active ? '#7C6FE0' : '#C4B5FD' }}>{tab.icon}</span>
              {tab.label}
            </button>
          )
        })}
      </div>

      {/* ══ AND Groups ══ */}
      {activeTab === 'and' && (
        <div>
          {/* toolbar */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14, flexWrap: 'wrap' }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#13111E', marginBottom: 2 }}>Combinations</div>
              <div style={{ fontSize: 11, color: '#6B7280' }}>
                Each card: sections as rows, mutually-exclusive subjects as columns. Headcounts sum to the section total.
              </div>
            </div>
            <button onClick={runAiSuggest} style={{
              display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 8,
              border: '1.5px solid #FDE68A', background: '#FFFBEB', color: '#92400E', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
            }}>
              <Sparkles size={13} color="#D97706" /> AI Suggest
            </button>
            <button onClick={addBlank} style={{
              display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 16px', borderRadius: 8, border: 'none',
              background: '#7C6FE0', color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
              boxShadow: '0 2px 8px rgba(124,111,224,0.35)',
            }}>
              <Plus size={13} /> New Combination
            </button>
          </div>

          {/* shared-electives hint */}
          {sharedElectives.length > 0 && !hintDismissed && (
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '10px 14px', marginBottom: 16, borderRadius: 10, background: '#FFFBEB', border: '1px solid #FDE68A' }}>
              <Info size={15} color="#D97706" style={{ flexShrink: 0, marginTop: 1 }} />
              <div style={{ flex: 1, fontSize: 11.5, color: '#78350F', lineHeight: 1.55 }}>
                <strong>{sharedElectives.slice(0, 5).join(', ')}{sharedElectives.length > 5 ? ` +${sharedElectives.length - 5}` : ''}</strong> look like elective <em>choices</em> offered across sections — not parallel splits. Set them up as{' '}
                <button onClick={() => setActiveTab('or')} style={{ background: 'none', border: 'none', padding: 0, color: '#B45309', fontWeight: 700, textDecoration: 'underline', cursor: 'pointer', fontFamily: 'inherit', fontSize: 11.5 }}>OR Groups</button>.
              </div>
              <button onClick={() => setHintDismissed(true)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#B45309', padding: 2, flexShrink: 0 }}>
                <X size={13} />
              </button>
            </div>
          )}

          {/* cards grid */}
          {groups.length === 0 ? (
            <div style={{ padding: '44px 20px', textAlign: 'center', background: '#FAFAFE', borderRadius: 12, border: '1.5px dashed #E4E0FF' }}>
              <Layers size={32} color="#C4B5FD" style={{ marginBottom: 12 }} />
              <div style={{ fontSize: 14, fontWeight: 700, color: '#8B87AD', marginBottom: 6 }}>No combinations yet</div>
              <div style={{ fontSize: 12, color: '#B8B4D4', marginBottom: 16, lineHeight: 1.6 }}>
                A combination splits a section across parallel subjects (e.g. XI-Sci → Maths vs Bio).<br />
                Click <strong>AI Suggest</strong> to auto-detect stream splits, or <strong>New Combination</strong> to build one.
              </div>
              <button onClick={addBlank} style={{
                display: 'inline-flex', alignItems: 'center', gap: 6, padding: '9px 20px', borderRadius: 8, border: 'none',
                background: '#7C6FE0', color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', boxShadow: '0 2px 8px rgba(124,111,224,0.3)',
              }}>
                <Plus size={14} /> New Combination
              </button>
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(360px, 1fr))', gap: 14, marginBottom: 6 }}>
              {groups.map(group => (
                <ComboCard
                  key={group.id}
                  group={group}
                  sections={sections as any[]}
                  allSubjectNames={allSubjectNames}
                  allSectionNames={allSectionNames}
                  onUpdate={handleUpdate}
                  onDelete={() => handleDelete(group.id)}
                  onGenerate={() => handleGenerate(group.id)}
                />
              ))}
            </div>
          )}

          {/* summary */}
          {groups.length > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10, padding: '10px 14px', borderRadius: 8, background: '#F5F2FF', border: '1px solid #E8E4FF' }}>
              <Zap size={13} color="#7C6FE0" />
              <span style={{ fontSize: 11, color: '#7C6FE0', fontWeight: 600, flex: 1 }}>
                {totalGenerated} teaching group{totalGenerated !== 1 ? 's' : ''} across {groups.length} combination{groups.length !== 1 ? 's' : ''}
              </span>
              <button onClick={() => setAndComboGroups(groups.map(g => ({ ...g, generatedGroups: generateAndGroups(g, rooms) })))} style={{
                display: 'inline-flex', alignItems: 'center', gap: 5, padding: '6px 14px', borderRadius: 7, border: '1.5px solid #C4B5FD', background: '#fff', color: '#7C6FE0', fontSize: 11, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
              }}>
                <RefreshCw size={11} /> Generate All
              </button>
            </div>
          )}

          {/* nav */}
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
                <strong>OR combo</strong> — one of the listed subjects runs per slot; whichever teacher is free takes that period.<br />
                <strong>AND combo</strong> — all subjects share one slot in parallel; students divide into groups.
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
