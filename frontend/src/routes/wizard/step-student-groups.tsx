/**
 * Step 4 — AND Groups + OR Groups
 *
 * AND Groups tab: combinations are grouped into BLOCKS. Each block has a fixed
 *   Section + Total rail pinned at the left, and one or more combination "cards"
 *   beside it (each card = one optional group: subjects as columns + a validation
 *   tick). Rows (sections) are shared across all cards in a block. Add sections,
 *   subjects and whole combinations inline on the table. A big Generate button
 *   builds the parallel teaching groups, which can be cleared independently.
 *
 * OR Groups tab: elective slots via SubjectGroupsSection (unchanged).
 */

import { useState, useMemo, useRef, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { useTimetableStore } from '@/store/timetableStore'
import type { AndComboGroup, AndTeachingGroup, AndGroupScope, SubjectBundle } from '@/types'
import {
  Layers, Shuffle, ChevronRight, ChevronLeft, ChevronDown, Plus, Trash2,
  Sparkles, RefreshCw, Zap, CheckCircle2, AlertCircle, XCircle,
  Wand2, Info, X, Users, Eye, EyeOff,
} from 'lucide-react'
import { SubjectGroupsSection } from '@/components/resources/SubjectGroupsSection'

// ── constants & helpers ────────────────────────────────────────────────────────

const PALETTE = ['#7C6FE0', '#10B981', '#F59E0B', '#EF4444', '#3B82F6', '#EC4899', '#8B5CF6', '#06B6D4']
function colColor(i: number) { return PALETTE[i % PALETTE.length] }
function makeId() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 6) }

/** hex → HSL components. */
function hexToHsl(hex: string): { h: number; s: number; l: number } {
  let x = hex.replace('#', '')
  if (x.length === 3) x = x.split('').map(c => c + c).join('')
  const r = parseInt(x.slice(0, 2), 16) / 255, g = parseInt(x.slice(2, 4), 16) / 255, b = parseInt(x.slice(4, 6), 16) / 255
  const max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2
  let h = 0, s = 0
  if (max !== min) {
    const d = max - min
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
    h = (max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4) * 60
  }
  return { h: Math.round(h), s: Math.round(s * 100), l: Math.round(l * 100) }
}

/** A distinct shade for group #idx of a subject — same hue, stepped lightness,
 *  so every generated group gets its own unique colour. */
function shadeFor(baseHex: string, idx: number): { dot: string; headBg: string; border: string } {
  const { h, s } = hexToHsl(baseHex)
  const sat = Math.max(48, s)
  const lights = [48, 36, 60, 30, 68, 42, 54, 24, 64, 40]
  const l = lights[idx % lights.length]
  return {
    dot: `hsl(${h}deg ${sat}% ${l}%)`,
    headBg: `hsl(${h}deg ${Math.max(40, sat - 8)}% ${Math.min(95, l + 42)}%)`,
    border: `hsl(${h}deg ${Math.max(38, sat - 12)}% ${Math.min(88, l + 34)}%)`,
  }
}

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

function expandStream(s: string): string {
  const u = (s ?? '').toLowerCase()
  if (u.startsWith('sci')) return 'Science'
  if (u.startsWith('com')) return 'Commerce'
  if (u.startsWith('hum') || u.startsWith('art')) return 'Humanities'
  return s
}

/** Human label for a block from its section set, e.g. "Science XI–XII". */
function classGroupName(sections: string[]): string {
  if (sections.length === 0) return 'New combination'
  const grades = [...new Set(sections.map(s => parseSection(s).grade))].sort((a, b) => gradeNum(a) - gradeNum(b))
  const streams = [...new Set(sections.map(s => parseSection(s).stream).filter(Boolean))]
  const streamPart = streams.length === 1 ? expandStream(streams[0]) : ''
  const gradePart = grades.length === 1 ? grades[0] : `${grades[0]}–${grades[grades.length - 1]}`
  return [streamPart, gradePart].filter(Boolean).join(' ') || 'Combination'
}

/** Stable block id from a section set (combos sharing sections share a rail). */
function blockIdFor(sections: string[]): string {
  return 'blk_' + [...sections].sort().join(',').replace(/[^a-z0-9]/gi, '').slice(0, 24)
}
function blockKey(g: AndComboGroup): string {
  return g.blockId ?? blockIdFor(g.applicableSections ?? [])
}

// ── grouping scope (4 independent same/cross axes) ──────────────────────────────

const DEFAULT_SCOPE: AndGroupScope = { section: 'same', grade: 'same', stream: 'same', block: 'same' }

const SCOPE_DIMS: { key: keyof AndGroupScope; label: string; desc: string }[] = [
  { key: 'section', label: 'Section', desc: 'Same: each section keeps its own group. Cross: sections may merge.' },
  { key: 'grade',   label: 'Grade',   desc: 'Same: only merge sections of the same grade. Cross: merge across grades.' },
  { key: 'stream',  label: 'Stream',  desc: 'Same: only merge same-stream sections. Cross: merge across streams.' },
  { key: 'block',   label: 'Block',   desc: 'Same: only merge within the same grade-band (Primary/Middle/Secondary/Senior). Cross: merge across bands.' },
]

function getScope(g: AndComboGroup): AndGroupScope {
  const s: any = g.groupingScope
  if (!s) return DEFAULT_SCOPE
  if (typeof s === 'string') {
    switch (s) {
      case 'SAME_GRADE':  return { section: 'cross', grade: 'same',  stream: 'cross', block: 'cross' }
      case 'SAME_STREAM': return { section: 'cross', grade: 'cross', stream: 'same',  block: 'cross' }
      case 'CROSS_GRADE': return { section: 'cross', grade: 'cross', stream: 'cross', block: 'cross' }
      default:            return DEFAULT_SCOPE
    }
  }
  return { section: s.section ?? 'same', grade: s.grade ?? 'same', stream: s.stream ?? 'same', block: s.block ?? 'same' }
}

// ── group <-> column helpers ─────────────────────────────────────────────────

function getCols(group: AndComboGroup): string[] {
  if (group.subjects && group.subjects.length) return group.subjects
  const cols: string[] = []
  for (const b of group.bundles ?? []) for (const s of b.subjects) if (!cols.includes(s)) cols.push(s)
  return cols
}
function syncBundles(cols: string[]): SubjectBundle[] {
  return cols.map((s, i) => ({ id: s, name: s, subjects: [s], color: colColor(i) }))
}
function autoName(cols: string[]): string {
  return cols.map(c => c.split(' ')[0]).join(' / ')
}
function getCell(group: AndComboGroup, sec: string, sub: string): number {
  return group.strengthMatrix?.[sec]?.[sub] ?? 0
}

// ── AI suggestion (optional-group aware) ─────────────────────────────────────────

interface OptInfo { sub: any; optional: boolean; slot?: string; category?: string; type: 'academic' | 'activity'; sections: string[] }

const ACTIVITY_RE = /\b(p\.?\s?e\.?|phys(ical)?\s*(ed|education)?|sports?|games?|athletics|art|arts|paint(ing)?|drawing|music|dance|drama|theatre|theater|craft|yoga|gym|swim(ming)?|library|hobby|club|cca|scout|ncc|nss)\b/i
function inferType(name: string, category?: string): 'academic' | 'activity' {
  const c = (category ?? '').toLowerCase()
  if (c.includes('co-scholastic') || c.includes('co scholastic') || c.includes('activity')) return 'activity'
  if (c.includes('scholastic')) return 'academic'
  return ACTIVITY_RE.test(name) ? 'activity' : 'academic'
}

function readOpt(sub: any): OptInfo {
  const cfgs = (sub.classConfigs ?? []) as any[]
  const optionalCfgs = cfgs.filter(c => c.isOptional === true)
  const optional = sub.isOptional === true || optionalCfgs.length > 0
  const slot = sub.electiveSlotId
    ?? optionalCfgs.find(c => c.electiveSlotId)?.electiveSlotId
    ?? cfgs.find(c => c.electiveSlotId)?.electiveSlotId
  const category = sub.category ?? cfgs.find(c => c.category)?.category
  // Elective SCOPE is per-section. Marking any section elective also sets the
  // subject-level isOptional flag (types/index.ts) — that flag must not widen
  // the scope back to every section the subject is merely TAUGHT in, or "PE
  // elective in XI–XII" drags LKG–X into the combo cards too. When explicit
  // per-section elective flags exist, they alone define the scope; the
  // subject-level flag with no per-section detail keeps the legacy
  // everywhere-it's-taught behaviour.
  const sections = optionalCfgs.length > 0
    ? [...new Set(optionalCfgs.map(c => c.sectionName).filter(Boolean) as string[])]
    : [...new Set([
        ...(cfgs.map(c => c.sectionName).filter(Boolean) as string[]),
        ...(sub.sections ?? []),
      ])]
  return { sub, optional, slot, category, type: inferType(sub.name, category), sections }
}

/**
 * Auto-build combinations. Each card = ONE optional group; subject TYPE
 * (academic vs activity) is a hard separator. Cards that share the same section
 * set are tagged with the same blockId so they render under one fixed rail.
 */
export function suggestAndComboGroups(subjects: any[], sections: any[]): AndComboGroup[] {
  const opts = subjects.map(readOpt).filter(o => o.optional && o.sections.length > 0)

  const byKey = new Map<string, OptInfo[]>()
  for (const o of opts) {
    const refiner = o.slot ?? o.category ?? [...o.sections].sort().join(',')
    const key = `${o.type}::${refiner}`
    if (!byKey.has(key)) byKey.set(key, [])
    byKey.get(key)!.push(o)
  }

  const out: AndComboGroup[] = []
  const seen = new Set<string>()
  for (const [key, members] of byKey) {
    const cols = [...new Set(members.map(m => m.sub.name))]
    if (cols.length < 2) continue
    const sig = [...cols].sort().join('|')
    if (seen.has(sig)) continue
    seen.add(sig)
    const secs = [...new Set(members.flatMap(m => m.sections))]
      .sort((a, b) => gradeNum(parseSection(a).grade) - gradeNum(parseSection(b).grade) || a.localeCompare(b))
    out.push({
      id: `ai_${key.replace(/[^a-z0-9]/gi, '').slice(0, 18)}_${cols.join('').replace(/[^a-z0-9]/gi, '').slice(0, 10)}`,
      name: autoName(cols),
      applicableSections: secs,
      subjects: cols,
      bundles: syncBundles(cols),
      blockId: blockIdFor(secs),
      blockName: classGroupName(secs),
      roomCapacitySensitive: true,
      groupingScope: DEFAULT_SCOPE,
      strengthMatrix: {},
      aiSuggested: true,
    })
  }

  if (out.length === 0) {
    const sci = sections.filter(s => isScienceSenior(s.name))
    if (sci.length > 0) {
      const maths = subjects.find(s => readOpt(s).optional && /math/i.test(s.name))?.name
      const bio   = subjects.find(s => readOpt(s).optional && /bio/i.test(s.name))?.name
      const cols = [maths, bio].filter(Boolean) as string[]
      const secs = sci.map(s => s.name)
      if (cols.length >= 2) out.push({
        id: 'ai_sci_mathsbio', name: autoName(cols),
        applicableSections: secs, subjects: cols, bundles: syncBundles(cols),
        blockId: blockIdFor(secs), blockName: classGroupName(secs), roomCapacitySensitive: true,
        groupingScope: DEFAULT_SCOPE, strengthMatrix: {}, aiSuggested: true,
      })
    }
  }

  return out
}

/** Optional subjects NOT consumed by any auto card (lone electives). */
function detectSharedElectives(subjects: any[], consumed: Set<string>): string[] {
  const shared: string[] = []
  for (const sub of subjects) {
    if (consumed.has(sub.name)) continue
    const o = readOpt(sub)
    if (o.optional && o.sections.length >= 2) shared.push(sub.name)
  }
  return shared
}

// ── teaching-group generation (scope + capacity aware) ───────────────────────────

function poolKeyFor(scope: AndGroupScope, secName: string): string {
  const { grade, stream } = parseSection(secName)
  const parts: string[] = []
  if (scope.section === 'same') parts.push('S:' + secName)
  if (scope.grade === 'same')   parts.push('G:' + grade)
  if (scope.stream === 'same')  parts.push('T:' + (stream || '-'))
  if (scope.block === 'same')   parts.push('B:' + blockOf(secName))
  return parts.join('|') || 'ALL'
}

/** Best-matching teacher for a subject taught to any of these sections. */
function teacherForSubject(sub: string, secNames: string[], staff: any[]): string {
  const secSet = new Set(secNames)
  const teaches = (t: any) => (t.subjects ?? []).includes(sub) ||
    (t.subjectMappings ?? []).some((m: any) => m.subject === sub)
  const inSections = (t: any) => (t.classes ?? []).some((c: string) => secSet.has(c)) ||
    (t.subjectMappings ?? []).some((m: any) => m.subject === sub && (m.classes ?? []).some((c: string) => secSet.has(c)))
  const exact = staff.find(t => teaches(t) && inSections(t))
  if (exact) return exact.name
  const any = staff.find(t => teaches(t))
  return any?.name ?? ''
}

function generateAndGroups(group: AndComboGroup, rooms: any[], staff: any[] = []): AndTeachingGroup[] {
  const cols = getCols(group)
  const scope = getScope(group)
  const capacitySensitive = group.roomCapacitySensitive !== false
  const sorted = [...rooms].sort((a, b) => (a.capacity ?? 0) - (b.capacity ?? 0))
  // When capacity sensitivity is OFF, never split a pool — one group per pool.
  const biggest = !capacitySensitive
    ? Infinity
    : (sorted.length > 0 ? sorted[sorted.length - 1].capacity ?? 0 : Infinity)
  const result: AndTeachingGroup[] = []

  for (const sub of cols) {
    const slices = group.applicableSections
      .map(sec => ({ sectionName: sec, studentCount: getCell(group, sec, sub) }))
      .filter(s => s.studentCount > 0)   // negative (NA) and 0 are excluded
    if (slices.length === 0) continue

    const pools = new Map<string, typeof slices>()
    for (const sl of slices) {
      const k = poolKeyFor(scope, sl.sectionName)
      if (!pools.has(k)) pools.set(k, [])
      pools.get(k)!.push(sl)
    }

    const subKey = sub.replace(/\s/g, '')
    let gIdx = 1
    const emit = (poolSlices: typeof slices, strength: number) => {
      // Room is intentionally NOT auto-assigned (avoids irrelevant rooms and keeps
      // the room dropdown unfiltered). The teacher is matched from the faculty list.
      result.push({
        id: `${group.id}_${subKey}_G${gIdx++}`,
        bundleId: sub, bundleName: sub, subjects: [sub],
        sectionSlices: poolSlices, totalStrength: strength,
        teacher: teacherForSubject(sub, poolSlices.map(s => s.sectionName), staff),
        room: '', roomCapacity: undefined, capacityWarning: false,
      })
    }

    for (const poolSlices of pools.values()) {
      const total = poolSlices.reduce((a, s) => a + s.studentCount, 0)
      if (total <= biggest || biggest === Infinity) {
        emit(poolSlices, total)
      } else {
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

const SEC_W = 150
const TOT_W = 52
function stickyHead(left: number, w: number): React.CSSProperties {
  return {
    position: 'sticky', left, zIndex: 3, width: w, minWidth: w,
    padding: '6px 8px', fontSize: 9.5, fontWeight: 800, color: '#8B87AD',
    textTransform: 'uppercase', letterSpacing: '0.05em', background: '#F1EEFF',
    borderBottom: '2px solid #E8E4FF', borderRight: '2px solid #E8E4FF', textAlign: 'left', whiteSpace: 'nowrap',
  } as React.CSSProperties
}
function stickyCell(left: number, w: number, bg: string): React.CSSProperties {
  return {
    position: 'sticky', left, zIndex: 2, width: w, minWidth: w,
    padding: '4px 8px', borderBottom: '1px solid #F0EDFF', borderRight: '2px solid #E8E4FF',
    background: bg, whiteSpace: 'nowrap',
  } as React.CSSProperties
}

// ── inline picker dropdown ─────────────────────────────────────────────────────

function Picker({
  items, existing, placeholder, onAdd, onClose,
}: {
  items: string[]; existing: string[]; placeholder: string
  onAdd: (s: string) => void; onClose: () => void
}) {
  const [q, setQ] = useState('')
  const avail = items.filter(s => !existing.includes(s) && s.toLowerCase().includes(q.toLowerCase()))
  return (
    <div onMouseDown={e => e.stopPropagation()} style={{
      position: 'absolute', zIndex: 600, top: '100%', left: 0, marginTop: 4,
      background: '#fff', border: '1.5px solid #E4E0FF', borderRadius: 9,
      boxShadow: '0 8px 28px rgba(0,0,0,0.16)', minWidth: 190,
    }}>
      <div style={{ padding: '6px 8px', borderBottom: '1px solid #F0EDFF' }}>
        <input autoFocus value={q} onChange={e => setQ(e.target.value)} placeholder={placeholder}
          style={{ width: '100%', boxSizing: 'border-box', padding: '4px 7px', borderRadius: 5, border: '1.5px solid #E4E0FF', fontSize: 12, outline: 'none', fontFamily: 'inherit' }} />
      </div>
      <div style={{ maxHeight: 200, overflowY: 'auto' }}>
        {avail.length === 0
          ? <div style={{ padding: '9px 12px', fontSize: 12, color: '#C4C0DC' }}>Nothing to add</div>
          : avail.map(s => (
            <button key={s} onMouseDown={() => { onAdd(s); onClose() }} style={{
              display: 'block', width: '100%', textAlign: 'left', padding: '7px 12px',
              border: 'none', background: 'none', fontSize: 12, color: '#374151', cursor: 'pointer', fontFamily: 'inherit',
            }}
            onMouseEnter={e => { e.currentTarget.style.background = '#F5F2FF' }}
            onMouseLeave={e => { e.currentTarget.style.background = 'none' }}>+ {s}</button>
          ))}
      </div>
    </div>
  )
}

/** Editable field with a dropdown that ALWAYS lists every option (filtered only
 *  by what you type) — unlike a native datalist, which hides options once the
 *  field already has a value. */
function ComboField({ value, options, placeholder, title, onChange }: {
  value: string; options: string[]; placeholder: string; title?: string; onChange: (v: string) => void
}) {
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState<string | null>(null) // null = show full list
  const [rect, setRect] = useState<{ left: number; top: number; width: number } | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const place = () => {
    const r = inputRef.current?.getBoundingClientRect()
    if (r) setRect({ left: r.left, top: r.bottom + 3, width: r.width })
  }
  useEffect(() => {
    if (!open) return
    place()
    const close = (e: MouseEvent) => { if (inputRef.current && e.target !== inputRef.current) { setOpen(false); setQ(null) } }
    const reposition = () => place()
    // close on outside click; reposition on scroll/resize (portal is fixed)
    window.addEventListener('mousedown', close)
    window.addEventListener('scroll', reposition, true)
    window.addEventListener('resize', reposition)
    return () => { window.removeEventListener('mousedown', close); window.removeEventListener('scroll', reposition, true); window.removeEventListener('resize', reposition) }
  }, [open])

  const filter = (q ?? '').toLowerCase()
  const shown = options.filter(o => o.toLowerCase().includes(filter))
  return (
    <>
      <input
        ref={inputRef}
        value={q === null ? value : q}
        title={title}
        onFocus={() => { setOpen(true); setQ('') }}
        onChange={e => { setQ(e.target.value); onChange(e.target.value) }}
        placeholder={placeholder}
        style={{ flex: 1, minWidth: 0, boxSizing: 'border-box', padding: '3px 6px', borderRadius: 5, border: '1.5px solid #E4E0FF', fontSize: 11, fontWeight: 600, color: '#13111E', outline: 'none', fontFamily: 'inherit', background: '#FAFAFE' }}
      />
      {open && rect && createPortal(
        <div
          onMouseDown={e => e.preventDefault()} // keep input focus; let onMouseDown on items fire
          style={{ position: 'fixed', zIndex: 4000, left: rect.left, top: rect.top, width: Math.max(rect.width, 150), background: '#fff', border: '1.5px solid #E4E0FF', borderRadius: 8, boxShadow: '0 10px 30px rgba(0,0,0,0.18)', maxHeight: 200, overflowY: 'auto' }}
        >
          {shown.length === 0
            ? <div style={{ padding: '8px 12px', fontSize: 11, color: '#C4C0DC' }}>No matches</div>
            : shown.map(o => (
              <button key={o} onMouseDown={() => { onChange(o); setQ(null); setOpen(false) }} style={{
                display: 'block', width: '100%', textAlign: 'left', padding: '6px 10px', border: 'none',
                background: o === value ? '#F5F2FF' : '#fff', fontSize: 11, color: '#374151', cursor: 'pointer', fontFamily: 'inherit',
              }}
              onMouseEnter={e => { e.currentTarget.style.background = '#F5F2FF' }}
              onMouseLeave={e => { e.currentTarget.style.background = o === value ? '#F5F2FF' : '#fff' }}>{o}</button>
            ))}
        </div>,
        document.body,
      )}
    </>
  )
}

// ── generated parallel group (last-day card style, editable room) ───────────────

function ParallelGroupCard({
  tg, shade, allRoomNames, allTeacherNames, onRoom, onTeacher, onDelete,
}: {
  tg: AndTeachingGroup; shade: { dot: string; headBg: string; border: string }
  allRoomNames: string[]; allTeacherNames: string[]
  onRoom: (room: string) => void; onTeacher: (teacher: string) => void; onDelete: () => void
}) {
  const subject = tg.subjects[0] ?? tg.bundleName
  const secs = tg.sectionSlices.map(s => s.sectionName)
  const title = secs.length === 0 ? subject
    : secs.length <= 2 ? `${subject} · ${secs.join(', ')}`
    : `${subject} · ${secs[0]} +${secs.length - 1}`
  const over = tg.capacityWarning
  return (
    <div style={{ borderRadius: 9, border: `1px solid ${over ? '#FECACA' : shade.border}`, background: '#fff', overflow: 'hidden', boxShadow: '0 1px 4px rgba(124,111,224,0.07)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 9px', background: shade.headBg, borderBottom: `1px solid ${shade.border}` }}>
        <div style={{ width: 10, height: 10, borderRadius: '50%', background: shade.dot, flexShrink: 0, boxShadow: `0 0 0 2px ${shade.headBg}` }} />
        <span title={title} style={{ fontSize: 10.5, fontWeight: 700, color: '#13111E', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{title}</span>
        <button onClick={onDelete} title="Delete this group" style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#C4C0DC', padding: 1, flexShrink: 0, lineHeight: 1 }}
          onMouseEnter={e => { e.currentTarget.style.color = '#EF4444' }} onMouseLeave={e => { e.currentTarget.style.color = '#C4C0DC' }}>
          <X size={12} />
        </button>
      </div>
      <div style={{ padding: '7px 9px' }}>
        <div style={{ display: 'flex', gap: 3, flexWrap: 'wrap', marginBottom: 6 }}>
          {secs.map(sn => <span key={sn} style={{ padding: '1px 6px', borderRadius: 7, background: '#EDE9FF', color: '#7C6FE0', fontSize: 9, fontWeight: 700, border: '1px solid #C4B5FD' }}>{sn}</span>)}
        </div>
        <div style={{ fontSize: 10, color: '#8B87AD', display: 'flex', alignItems: 'center', gap: 4, marginBottom: 6 }}>
          <Users size={9} /> {tg.totalStrength} students
          {tg.roomCapacity ? <span style={{ color: over ? '#DC2626' : '#15803D', fontWeight: 700 }}>{over ? ` · over cap ${tg.roomCapacity}` : ` · cap ${tg.roomCapacity} ✓`}</span> : null}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 5 }}>
          <span style={{ fontSize: 12, flexShrink: 0 }} title="Faculty">👤</span>
          <ComboField value={tg.teacher ?? ''} options={allTeacherNames} placeholder="Teacher…" title="Assign faculty" onChange={onTeacher} />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <span style={{ fontSize: 12, flexShrink: 0 }} title="Room / venue">🏫</span>
          <ComboField value={tg.room ?? ''} options={allRoomNames} placeholder="Room…" title="Assign room / venue" onChange={onRoom} />
        </div>
      </div>
    </div>
  )
}

// ── BLOCK CARD: fixed Section/Total rail + one column-group per combination ──────

interface Block { blockId: string; blockName: string; sections: string[]; combos: AndComboGroup[] }

function BlockCard({
  block, sectionsStore, allSubjectNames, allSectionNames, allRoomNames, allTeacherNames, rooms, staff, onReplace, onDeleteBlock,
}: {
  block: Block
  sectionsStore: any[]
  allSubjectNames: string[]
  allSectionNames: string[]
  allRoomNames: string[]
  allTeacherNames: string[]
  rooms: any[]
  staff: any[]
  onReplace: (combos: AndComboGroup[]) => void
  onDeleteBlock: () => void
}) {
  const [picker, setPicker] = useState<null | { type: 'section' } | { type: 'subject'; comboId: string }>(null)
  const [groupsCollapsed, setGroupsCollapsed] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  const combos = block.combos
  const sections = block.sections
  const scope = combos.length ? getScope(combos[0]) : DEFAULT_SCOPE
  const roomSensitive = combos.length ? combos[0].roomCapacitySensitive !== false : true

  useEffect(() => {
    if (!picker) return
    const onDoc = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setPicker(null) }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [picker])

  const getTotal = (sec: string) => sectionsStore.find((s: any) => s.name === sec)?.strength ?? 0

  // ── mutators ──
  // Once a block has generated groups, structural/headcount edits auto-regenerate
  // (no explicit "Generate" press needed). Manually-set rooms are preserved when
  // a group's subject + section composition is unchanged.
  const hasGroups = combos.some(c => (c.generatedGroups?.length ?? 0) > 0)
  const gKey = (g: AndTeachingGroup) => `${g.subjects[0] ?? g.bundleName}|${g.sectionSlices.map(s => s.sectionName).sort().join(',')}`
  const regen = (cs: AndComboGroup[]): AndComboGroup[] => cs.map(c => {
    const prev = new Map((c.generatedGroups ?? []).map(g => [gKey(g), g]))
    const fresh = generateAndGroups(c, rooms, staff).map(g => {
      const p = prev.get(gKey(g))
      // preserve manually-edited room / teacher when composition is unchanged
      return p ? { ...g, room: p.room || g.room, teacher: p.teacher || g.teacher } : g
    })
    return { ...c, generatedGroups: fresh }
  })
  /** auto-regenerating commit — used by all matrix / scope / structure edits */
  const commit = (next: AndComboGroup[]) => onReplace(hasGroups ? regen(next) : next)
  /** raw commit — bypasses regeneration (room edits, group deletes, name edits) */
  const commitRaw = (next: AndComboGroup[]) => onReplace(next)

  const setCell = (comboId: string, sec: string, sub: string, val: number) =>
    commit(combos.map(c => c.id !== comboId ? c : {
      ...c, aiSuggested: false,
      strengthMatrix: { ...c.strengthMatrix, [sec]: { ...(c.strengthMatrix?.[sec] ?? {}), [sub]: val } },
    }))
  // NA = subject not applicable to this section (stored as -1, excluded everywhere)
  const isNA = (combo: AndComboGroup, sec: string, sub: string) => (combo.strengthMatrix?.[sec]?.[sub] ?? 0) < 0
  const toggleNA = (comboId: string, sec: string, sub: string) =>
    commit(combos.map(c => {
      if (c.id !== comboId) return c
      const cur = c.strengthMatrix?.[sec]?.[sub] ?? 0
      return { ...c, aiSuggested: false, strengthMatrix: { ...c.strengthMatrix, [sec]: { ...(c.strengthMatrix?.[sec] ?? {}), [sub]: cur < 0 ? 0 : -1 } } }
    }))

  const addSection = (sec: string) =>
    commit(combos.map(c => ({ ...c, aiSuggested: false, applicableSections: [...c.applicableSections, sec] })))

  const removeSection = (sec: string) =>
    commit(combos.map(c => {
      const sm = { ...c.strengthMatrix }; delete sm[sec]
      return { ...c, applicableSections: c.applicableSections.filter(s => s !== sec), strengthMatrix: sm }
    }))

  const addSubject = (comboId: string, sub: string) =>
    commit(combos.map(c => {
      if (c.id !== comboId) return c
      const next = [...getCols(c), sub]
      const auto = !c.name?.trim() || c.name === autoName(getCols(c))
      return { ...c, aiSuggested: false, subjects: next, bundles: syncBundles(next), name: auto ? autoName(next) : c.name }
    }))

  const removeSubject = (comboId: string, sub: string) =>
    commit(combos.map(c => {
      if (c.id !== comboId) return c
      const next = getCols(c).filter(s => s !== sub)
      const sm: Record<string, Record<string, number>> = {}
      for (const [sec, vals] of Object.entries(c.strengthMatrix ?? {})) { const v = { ...vals }; delete v[sub]; sm[sec] = v }
      const auto = !c.name?.trim() || c.name === autoName(getCols(c))
      return { ...c, subjects: next, bundles: syncBundles(next), strengthMatrix: sm, name: auto ? autoName(next) : c.name }
    }))

  const renameCombo = (comboId: string, name: string) =>
    commitRaw(combos.map(c => c.id === comboId ? { ...c, name } : c))

  const addCombo = () =>
    commit([...combos, {
      id: makeId(), name: '', applicableSections: [...sections], subjects: [], bundles: [],
      blockId: block.blockId, blockName: block.blockName, roomCapacitySensitive: roomSensitive,
      groupingScope: scope, strengthMatrix: {},
    } as AndComboGroup])

  const deleteCombo = (comboId: string) => commit(combos.filter(c => c.id !== comboId))

  const setScope = (s: AndGroupScope) => commit(combos.map(c => ({ ...c, groupingScope: s })))
  const setComboScope = (comboId: string, s: AndGroupScope) => commit(combos.map(c => c.id === comboId ? { ...c, groupingScope: s } : c))
  const setRoomSensitive = (b: boolean) => commit(combos.map(c => ({ ...c, roomCapacitySensitive: b })))
  const renameBlock = (name: string) => commitRaw(combos.map(c => ({ ...c, blockName: name })))

  const splitEvenly = () =>
    commit(combos.map(c => {
      const cols = getCols(c); if (!cols.length) return c
      const sm: Record<string, Record<string, number>> = { ...c.strengthMatrix }
      for (const sec of c.applicableSections) {
        const total = getTotal(sec); if (total <= 0) continue
        const base = Math.floor(total / cols.length), rem = total - base * cols.length
        const row: Record<string, number> = { ...(sm[sec] ?? {}) }
        cols.forEach((col, i) => { row[col] = base + (i < rem ? 1 : 0) })
        sm[sec] = row
      }
      return { ...c, strengthMatrix: sm }
    }))

  const generate = () => commitRaw(combos.map(c => ({ ...c, generatedGroups: generateAndGroups(c, rooms, staff) })))
  const clearGroups = () => commitRaw(combos.map(c => ({ ...c, generatedGroups: undefined })))
  const deleteGroup = (comboId: string, groupId: string) =>
    commitRaw(combos.map(c => c.id !== comboId ? c : { ...c, generatedGroups: (c.generatedGroups ?? []).filter(g => g.id !== groupId) }))

  const allGenerated = combos.flatMap(c => c.generatedGroups ?? [])
  // assign every generated group its own unique shade: hue from the subject,
  // lightness stepped per group within that subject
  const groupShades = useMemo(() => {
    const allSubjects = [...new Set(combos.flatMap(getCols))]
    const perSubject = new Map<string, number>()
    const map = new Map<string, { dot: string; headBg: string; border: string }>()
    for (const c of combos) for (const g of (c.generatedGroups ?? [])) {
      const subj = g.subjects[0] ?? g.bundleName
      const base = colColor(allSubjects.indexOf(subj) >= 0 ? allSubjects.indexOf(subj) : 0)
      const k = perSubject.get(subj) ?? 0
      perSubject.set(subj, k + 1)
      map.set(g.id, shadeFor(base, k))
    }
    return map
  }, [combos])
  const shadeOf = (g: AndTeachingGroup) => groupShades.get(g.id) ?? shadeFor(colColor(0), 0)

  return (
    <div ref={ref} style={{ border: '1.5px solid #E4E0FF', borderRadius: 12, background: '#fff', marginBottom: 16, boxShadow: '0 1px 3px rgba(124,111,224,0.06)', overflow: 'hidden' }}>
      {/* block header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 12px', background: '#F3F1FF', borderBottom: '1px solid #E8E4FF', flexWrap: 'wrap' }}>
        <Layers size={14} color="#7C6FE0" style={{ flexShrink: 0 }} />
        <input value={block.blockName} onChange={e => renameBlock(e.target.value)} placeholder="Block name (class-group or custom)…"
          style={{ flex: 1, minWidth: 120, padding: '3px 7px', borderRadius: 5, border: '1.5px solid transparent', background: 'transparent', fontSize: 13, fontWeight: 800, color: '#13111E', outline: 'none', fontFamily: 'inherit' }}
          onFocus={e => { e.currentTarget.style.border = '1.5px solid #C4B5FD'; e.currentTarget.style.background = '#fff' }}
          onBlur={e => { e.currentTarget.style.border = '1.5px solid transparent'; e.currentTarget.style.background = 'transparent' }} />

        {/* room capacity sensitivity toggle */}
        <div title="When OFF, room capacity is ignored — any number of sections can pool into a single group." style={{ display: 'inline-flex', alignItems: 'center', borderRadius: 5, overflow: 'hidden', border: '1.5px solid #E4E0FF' }}>
          <span style={{ fontSize: 9, fontWeight: 700, color: '#8B87AD', padding: '2px 6px', background: '#fff' }}>Room cap.</span>
          {([['on', true], ['off', false]] as const).map(([lbl, val]) => (
            <button key={lbl} onClick={() => setRoomSensitive(val)} style={{
              padding: '2px 8px', border: 'none', fontSize: 9.5, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
              background: roomSensitive === val ? (val ? '#10B981' : '#9CA3AF') : '#fff',
              color: roomSensitive === val ? '#fff' : '#C4C0DC',
            }}>{lbl === 'on' ? 'On' : 'Off'}</button>
          ))}
        </div>

        <button onClick={addCombo} title="Add another combination (a new optional group)" style={{ display: 'inline-flex', alignItems: 'center', gap: 4, background: '#7C6FE0', border: 'none', borderRadius: 6, cursor: 'pointer', color: '#fff', padding: '5px 11px', fontSize: 10.5, fontWeight: 800, fontFamily: 'inherit', flexShrink: 0, boxShadow: '0 2px 6px rgba(124,111,224,0.35)' }}>
          <Plus size={13} /> Add combo
        </button>
        <button onClick={onDeleteBlock} title="Delete this block (all its combinations)" style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#EF4444', padding: 3, flexShrink: 0 }}>
          <Trash2 size={14} />
        </button>
      </div>

      {/* the shared table */}
      <div style={{ overflowX: 'auto', position: 'relative' }}>
        <table style={{ borderCollapse: 'collapse', width: '100%' }}>
          <thead>
            <tr>
              <th rowSpan={2} style={stickyHead(0, SEC_W)}>Section</th>
              <th rowSpan={2} style={{ ...stickyHead(SEC_W, TOT_W), textAlign: 'center' }}>Tot</th>
              {combos.map((combo, ci) => {
                const cols = getCols(combo)
                return (
                  <th key={combo.id} colSpan={(cols.length || 1) + 2} style={{
                    padding: '5px 8px', background: colColor(ci) + '14', borderBottom: `2px solid ${colColor(ci)}55`,
                    borderLeft: '2px solid #E8E4FF', whiteSpace: 'nowrap',
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                      <input value={combo.name} onChange={e => renameCombo(combo.id, e.target.value)} placeholder={`Combo ${ci + 1}`}
                        style={{ flex: 1, minWidth: 60, padding: '2px 5px', borderRadius: 4, border: '1.5px solid transparent', background: 'transparent', fontSize: 11, fontWeight: 800, color: colColor(ci), outline: 'none', fontFamily: 'inherit' }}
                        onFocus={e => { e.currentTarget.style.border = `1.5px solid ${colColor(ci)}`; e.currentTarget.style.background = '#fff' }}
                        onBlur={e => { e.currentTarget.style.border = '1.5px solid transparent'; e.currentTarget.style.background = 'transparent' }} />
                      <button onClick={() => deleteCombo(combo.id)} title="Delete this combination"
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#EF4444', padding: 1 }}>
                        <X size={12} />
                      </button>
                    </div>
                  </th>
                )
              })}
            </tr>
            <tr>
              {combos.map((combo, ci) => {
                const cols = getCols(combo)
                return [
                  ...(cols.length ? cols : ['—']).map((sub, si) => (
                    <th key={combo.id + sub + si} style={{
                      padding: '4px 6px', fontSize: 9.5, fontWeight: 800, color: cols.length ? colColor(ci) : '#C4C0DC',
                      textTransform: 'uppercase', letterSpacing: '0.04em', background: '#FAFAFE', borderBottom: '2px solid #E8E4FF',
                      borderLeft: si === 0 ? '2px solid #E8E4FF' : 'none', textAlign: 'center', whiteSpace: 'nowrap', minWidth: 64,
                    }}>
                      {cols.length ? (
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                          {sub.split(' ')[0]}
                          <button onClick={() => removeSubject(combo.id, sub)} title={`Remove ${sub}`} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#D1D5DB', padding: 0, lineHeight: 1, fontSize: 10 }}
                            onMouseEnter={e => { e.currentTarget.style.color = '#EF4444' }} onMouseLeave={e => { e.currentTarget.style.color = '#D1D5DB' }}>✕</button>
                        </span>
                      ) : 'add →'}
                    </th>
                  )),
                  <th key={combo.id + 'val'} style={{ padding: '4px 6px', fontSize: 11, fontWeight: 800, color: '#15803D', background: '#FAFAFE', borderBottom: '2px solid #E8E4FF', textAlign: 'center', width: 40, minWidth: 40 }}>✓</th>,
                  <th key={combo.id + 'addsubj'} style={{ padding: '4px 6px', background: '#FAFAFE', borderBottom: '2px solid #E8E4FF', textAlign: 'center', width: 78, minWidth: 78, position: 'relative' }}>
                    <button onClick={() => setPicker(p => p && p.type === 'subject' && p.comboId === combo.id ? null : { type: 'subject', comboId: combo.id })} title="Add a subject column to this combination"
                      style={{ display: 'inline-flex', alignItems: 'center', gap: 3, padding: '4px 8px', borderRadius: 6, border: '1.5px dashed #34D399', background: '#ECFDF5', color: '#047857', cursor: 'pointer', fontSize: 10, fontWeight: 800, fontFamily: 'inherit', whiteSpace: 'nowrap' }}>
                      <Plus size={11} /> Subject
                    </button>
                    {picker?.type === 'subject' && picker.comboId === combo.id && (
                      <Picker items={allSubjectNames} existing={cols} placeholder="Add subject…" onAdd={s => addSubject(combo.id, s)} onClose={() => setPicker(null)} />
                    )}
                  </th>,
                ]
              })}
            </tr>
          </thead>
          <tbody>
            {sections.map((sec, ri) => {
              const bg = ri % 2 === 0 ? '#fff' : '#FAFAFE'
              const total = getTotal(sec)
              return (
                <tr key={sec} style={{ background: bg }}>
                  <td style={stickyCell(0, SEC_W, bg)}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                      <span style={{ fontSize: 11.5, fontWeight: 700, color: '#374151' }}>{sec}</span>
                      <button onClick={() => removeSection(sec)} title="Remove section" style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#D1D5DB', padding: 0, lineHeight: 1, fontSize: 10 }}
                        onMouseEnter={e => { e.currentTarget.style.color = '#EF4444' }} onMouseLeave={e => { e.currentTarget.style.color = '#D1D5DB' }}>✕</button>
                    </span>
                  </td>
                  <td style={{ ...stickyCell(SEC_W, TOT_W, bg), textAlign: 'center' }}>
                    <span style={{ fontSize: 11.5, fontWeight: 600, color: '#6B7280' }}>{total || '—'}</span>
                  </td>
                  {combos.map((combo, ci) => {
                    const cols = getCols(combo)
                    const sum = cols.reduce((a, s) => a + Math.max(0, getCell(combo, sec, s)), 0)
                    const isMatch = total > 0 && sum === total
                    const isOver = sum > total
                    return [
                      ...(cols.length ? cols : ['—']).map((sub, si) => (
                        <td key={combo.id + sub + si} style={{ padding: '4px 6px', textAlign: 'center', borderBottom: '1px solid #F0EDFF', borderLeft: si === 0 ? '2px solid #E8E4FF' : 'none' }}>
                          {!cols.length ? <span style={{ fontSize: 10, color: '#D1D5DB' }}>—</span>
                          : isNA(combo, sec, sub) ? (
                            <button onClick={() => toggleNA(combo.id, sec, sub)} title="Not applicable to this section — click to enable"
                              style={{ width: 52, padding: '3px 4px', borderRadius: 5, border: '1.5px dashed #D1D5DB', background: '#F3F4F6', color: '#9CA3AF', fontSize: 10.5, fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit' }}>NA</button>
                          ) : (
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 2 }}>
                              <input type="number" min={0} value={getCell(combo, sec, sub) || ''}
                                onChange={e => setCell(combo.id, sec, sub, Math.max(0, parseInt(e.target.value) || 0))} placeholder="0"
                                style={{ width: 46, padding: '3px 4px', borderRadius: 5, textAlign: 'center', border: `1.5px solid ${isOver ? '#FCA5A5' : colColor(ci) + '55'}`, fontSize: 12.5, fontWeight: 700, outline: 'none', fontFamily: 'inherit', background: isOver ? '#FEF2F2' : colColor(ci) + '0D', color: '#111028' }} />
                              <button onClick={() => toggleNA(combo.id, sec, sub)} title="Mark Not Applicable for this section"
                                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#C4C0DC', fontSize: 8, fontWeight: 800, padding: 0, lineHeight: 1 }}
                                onMouseEnter={e => { e.currentTarget.style.color = '#6B7280' }} onMouseLeave={e => { e.currentTarget.style.color = '#C4C0DC' }}>NA</button>
                            </span>
                          )}
                        </td>
                      )),
                      <td key={combo.id + 'val'} style={{ width: 40, textAlign: 'center', borderBottom: '1px solid #F0EDFF' }}>
                        {total === 0 ? <span style={{ fontSize: 10, color: '#C4C0DC' }}>—</span>
                          : isMatch ? <CheckCircle2 size={14} color="#15803D" />
                          : isOver ? <span style={{ color: '#DC2626', fontSize: 10.5, fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 1 }}><XCircle size={11} />+{sum - total}</span>
                          : sum > 0 ? <span style={{ color: '#D97706', fontSize: 10.5, fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 1 }}><AlertCircle size={11} />−{total - sum}</span>
                          : <span style={{ fontSize: 10, color: '#C4C0DC' }}>○</span>}
                      </td>,
                      <td key={combo.id + 'addsubj'} style={{ width: 78, borderBottom: '1px solid #F0EDFF' }} />,
                    ]
                  })}
                </tr>
              )
            })}
            {/* add-section row — always directly below the last section */}
            <tr>
              <td style={{ ...stickyCell(0, SEC_W, '#fff'), position: 'relative' }}>
                <button onClick={() => setPicker(p => p && p.type === 'section' ? null : { type: 'section' })} title="Add a class-section row"
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '5px 10px', borderRadius: 7, border: '1.5px dashed #A78BFA', background: '#EDE9FF', color: '#6D28D9', cursor: 'pointer', fontSize: 11, fontWeight: 800, fontFamily: 'inherit', whiteSpace: 'nowrap' }}>
                  <Plus size={13} /> Add section
                </button>
                {picker?.type === 'section' && (
                  <Picker items={allSectionNames} existing={sections} placeholder="Add section…" onAdd={addSection} onClose={() => setPicker(null)} />
                )}
              </td>
              <td style={stickyCell(SEC_W, TOT_W, '#fff')} />
              {combos.map(combo => (
                <td key={combo.id + 'addrow'} colSpan={(getCols(combo).length || 1) + 2} style={{ borderLeft: '2px solid #E8E4FF' }} />
              ))}
            </tr>
          </tbody>
        </table>
      </div>

      {/* per-combo merge bars */}
      {combos.length > 0 && (
        <div style={{ padding: '8px 12px', borderTop: '1px solid #F0EDFF', display: 'flex', flexDirection: 'column', gap: 6 }}>
          <span style={{ fontSize: 9, fontWeight: 800, color: '#8B87AD', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Merge each combination into teaching groups by:</span>
          {combos.map((combo, ci) => {
            const cs = getScope(combo)
            return (
              <div key={combo.id} style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 10, fontWeight: 800, color: colColor(ci), minWidth: 96, maxWidth: 130, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {combo.name || `Combo ${ci + 1}`}
                </span>
                {SCOPE_DIMS.map(dim => (
                  <div key={dim.key} title={dim.desc} style={{ display: 'inline-flex', alignItems: 'center', borderRadius: 5, overflow: 'hidden', border: '1.5px solid #E4E0FF' }}>
                    <span style={{ fontSize: 9, fontWeight: 700, color: '#8B87AD', padding: '2px 5px', background: '#F8F7FF' }}>{dim.label}</span>
                    {(['same', 'cross'] as const).map(v => {
                      const active = cs[dim.key] === v
                      return (
                        <button key={v} onClick={() => setComboScope(combo.id, { ...cs, [dim.key]: v })} style={{
                          padding: '2px 7px', border: 'none', fontSize: 9.5, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
                          background: active ? (v === 'same' ? '#7C6FE0' : '#F59E0B') : '#fff',
                          color: active ? '#fff' : '#C4C0DC',
                        }}>{v === 'same' ? 'Same' : 'Cross'}</button>
                      )
                    })}
                  </div>
                ))}
              </div>
            )
          })}
        </div>
      )}

      {/* footer actions */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderTop: '1px dashed #E8E4FF' }}>
        <button onClick={splitEvenly} title="Split each section's total evenly across each combo's columns"
          style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '7px 12px', borderRadius: 7, border: '1.5px solid #FDE68A', background: '#FFFBEB', color: '#92400E', fontSize: 11, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', flexShrink: 0 }}>
          <Wand2 size={12} /> Split evenly
        </button>
        <button onClick={generate} style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '8px 16px', borderRadius: 8, border: 'none', background: 'linear-gradient(135deg, #7C6FE0, #9B8EF5)', color: '#fff', fontSize: 12, fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit', boxShadow: '0 2px 8px rgba(124,111,224,0.35)', flexShrink: 0 }}>
          <RefreshCw size={13} /> Generate groups
        </button>
        <div style={{ flex: 1 }} />
      </div>

      {/* generated groups — show/hide applies to THIS section only */}
      {allGenerated.length > 0 && (
        <div style={{ padding: '2px 12px 12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '4px 0 7px' }}>
            <span style={{ fontSize: 9.5, fontWeight: 800, color: '#8B87AD', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Parallel groups ({allGenerated.length})</span>
            <button onClick={() => setGroupsCollapsed(c => !c)} title={groupsCollapsed ? 'Show groups' : 'Hide groups'}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 3, padding: '2px 8px', borderRadius: 6, border: '1.5px solid #E4E0FF', background: '#fff', color: '#7C6FE0', fontSize: 10, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
              {groupsCollapsed ? <Eye size={11} /> : <EyeOff size={11} />}{groupsCollapsed ? 'Show' : 'Hide'}
              <ChevronDown size={12} style={{ transform: groupsCollapsed ? 'rotate(-90deg)' : 'none', transition: 'transform .15s' }} />
            </button>
            <button onClick={clearGroups} title="Delete the generated groups only (keeps the tables above)"
              style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 8px', borderRadius: 6, border: '1px solid #FECACA', background: '#FEF2F2', color: '#DC2626', fontSize: 10, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
              <Trash2 size={10} /> Delete groups
            </button>
          </div>
          {!groupsCollapsed && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(168px, 1fr))', gap: 8 }}>
              {combos.flatMap(c => (c.generatedGroups ?? []).map(g => (
                <ParallelGroupCard key={g.id} tg={g} shade={shadeOf(g)} allRoomNames={allRoomNames} allTeacherNames={allTeacherNames}
                  onRoom={room => commitRaw(combos.map(cc => cc.id !== c.id ? cc : { ...cc, generatedGroups: (cc.generatedGroups ?? []).map(x => x.id === g.id ? { ...x, room } : x) }))}
                  onTeacher={teacher => commitRaw(combos.map(cc => cc.id !== c.id ? cc : { ...cc, generatedGroups: (cc.generatedGroups ?? []).map(x => x.id === g.id ? { ...x, teacher } : x) }))}
                  onDelete={() => deleteGroup(c.id, g.id)} />
              )))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── main component ─────────────────────────────────────────────────────────────

export function StepStudentGroups() {
  const store = useTimetableStore() as any
  const { sections, subjects, setStep, andComboGroups, setAndComboGroups } = store
  // All venues across every store source (rooms / classrooms / facilities), deduped by name.
  const rooms: any[] = useMemo(() => {
    const seen = new Set<string>()
    const out: any[] = []
    for (const r of [...(store.rooms ?? []), ...(store.classrooms ?? []), ...(store.facilities ?? [])]) {
      const name = r?.name ?? r?.actualName ?? r?.roomName ?? r?.label
      if (!name || seen.has(name)) continue
      seen.add(name)
      out.push({ ...r, name, capacity: r?.capacity ?? r?.seats ?? r?.size ?? 0 })
    }
    return out
  }, [store.rooms, store.classrooms, store.facilities])

  const [activeTab, setActiveTab] = useState<'and' | 'or'>('and')
  const [hintDismissed, setHintDismissed] = useState(false)
  const [globalScope, setGlobalScope] = useState<AndGroupScope>(DEFAULT_SCOPE)
  const [showGuide, setShowGuide] = useState(true)

  const groups = andComboGroups as AndComboGroup[]

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

  // group combos into blocks
  const blocks: Block[] = useMemo(() => {
    const map = new Map<string, Block>()
    for (const g of groups) {
      const key = blockKey(g)
      if (!map.has(key)) map.set(key, { blockId: key, blockName: g.blockName ?? classGroupName(g.applicableSections ?? []), sections: g.applicableSections ?? [], combos: [] })
      const b = map.get(key)!
      b.combos.push(g)
      // union sections so the rail covers every combo's sections
      for (const s of g.applicableSections ?? []) if (!b.sections.includes(s)) b.sections.push(s)
    }
    // order sections within each block
    for (const b of map.values()) {
      b.sections.sort((a, z) => gradeNum(parseSection(a).grade) - gradeNum(parseSection(z).grade) || a.localeCompare(z))
    }
    return [...map.values()]
  }, [groups])

  const replaceBlock = (blockId: string, newCombos: AndComboGroup[]) =>
    commitGroups([...groups.filter(g => blockKey(g) !== blockId), ...newCombos])

  const deleteBlock = (blockId: string) =>
    setAndComboGroups(groups.filter(g => blockKey(g) !== blockId))

  const addBlankBlock = () => {
    const id = makeId()
    setAndComboGroups([...groups, {
      id: makeId(), name: '', applicableSections: [], subjects: [], bundles: [],
      blockId: 'blk_' + id, blockName: 'New combination', roomCapacitySensitive: true,
      groupingScope: DEFAULT_SCOPE, strengthMatrix: {},
    } as AndComboGroup])
  }

  const runAiSuggest = () => {
    const fresh = suggestAndComboGroups(subjects as any[], sections as any[])
      .filter(f => !groups.some(g => g.subjects?.join() === f.subjects?.join()))
    if (fresh.length === 0) { alert('No new optional groups detected. Mark subjects as Elective in Resources → Subjects, or add a combination manually.'); return }
    commitGroups([...groups, ...fresh])
  }

  const applyGlobalScope = (scope: AndGroupScope) => setAndComboGroups(groups.map(g => ({ ...g, groupingScope: scope })))

  const staff: any[] = useMemo(() => store.staff ?? store.teachers ?? [], [store.staff, store.teachers])
  const allSubjectNames = useMemo(() => (subjects as any[]).map((s: any) => s.name), [subjects])
  const allSectionNames = useMemo(() => (sections as any[]).map((s: any) => s.name), [sections])
  const allRoomNames    = useMemo(() => rooms.map((r: any) => r.name), [rooms])
  const allTeacherNames = useMemo(() => [...new Set((staff as any[]).map((t: any) => t.name).filter(Boolean))], [staff])

  // Write-back link: reflect combo subject↔section assignments into Resources → Subjects.
  // A subject used in a combo becomes Elective and assigned to its applicable sections;
  // a cell marked NA removes that section from the subject. Existing assignments are kept.
  const reconcileSubjects = (newGroups: AndComboGroup[]) => {
    if (!store.setSubjects) return
    const applicable = new Map<string, Set<string>>()
    const naSet = new Map<string, Set<string>>()
    for (const g of newGroups) {
      for (const sub of getCols(g)) {
        if (!applicable.has(sub)) { applicable.set(sub, new Set()); naSet.set(sub, new Set()) }
        for (const sec of g.applicableSections ?? []) {
          const v = g.strengthMatrix?.[sec]?.[sub] ?? 0
          if (v < 0) naSet.get(sub)!.add(sec)
          else applicable.get(sub)!.add(sec)
        }
      }
    }
    if (applicable.size === 0) return
    let changed = false
    const next = (subjects as any[]).map((s: any) => {
      if (!applicable.has(s.name)) return s
      const existing = new Set<string>((s.classConfigs ?? []).map((c: any) => c.sectionName).filter(Boolean))
      const finalSecs = new Set<string>([...existing, ...applicable.get(s.name)!])
      for (const x of naSet.get(s.name)!) finalSecs.delete(x)
      const cfgs = [...finalSecs].map(sec => {
        const ex = (s.classConfigs ?? []).find((c: any) => c.sectionName === sec)
        return {
          sectionName: sec,
          periodsPerWeek: ex?.periodsPerWeek ?? s.periodsPerWeek ?? 5,
          maxPeriodsPerDay: ex?.maxPeriodsPerDay ?? s.maxPeriodsPerDay ?? 2,
          sessionDuration: ex?.sessionDuration ?? s.sessionDuration ?? 45,
          isOptional: true, electiveSlotId: ex?.electiveSlotId, category: ex?.category, requiresLab: ex?.requiresLab,
        }
      })
      const before = [...existing].sort().join(',') + '|' + (s.isOptional ? 1 : 0)
      const after = [...finalSecs].sort().join(',') + '|1'
      if (before !== after) changed = true
      return { ...s, isOptional: true, sections: [...finalSecs], classConfigs: cfgs }
    })
    if (changed) store.setSubjects(next)
  }
  const commitGroups = (next: AndComboGroup[]) => { setAndComboGroups(next); reconcileSubjects(next) }

  const consumed = useMemo(() => { const set = new Set<string>(); for (const g of groups) for (const c of getCols(g)) set.add(c); return set }, [groups])
  const sharedElectives = useMemo(() => detectSharedElectives(subjects as any[], consumed), [subjects, consumed])

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
    <div style={{ padding: '20px 24px 40px', maxWidth: 1320, margin: '0 auto' }}>
      {/* header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
        <div style={{ width: 40, height: 40, borderRadius: 10, background: '#EDE9FF', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Layers size={20} color="#7C6FE0" />
        </div>
        <div style={{ flex: 1 }}>
          <h2 style={{ fontFamily: "'Plus Jakarta Sans', serif", fontSize: 22, color: '#13111E', margin: 0, lineHeight: 1.1 }}>Groups &amp; Combos</h2>
          <div style={{ fontSize: 12, color: '#4B5275', marginTop: 3 }}>
            Define <em style={{ color: '#7C6FE0' }}>AND combinations</em> (each optional group splits a section in parallel) and{' '}
            <em style={{ color: '#D97706' }}>OR elective slots</em> (pick one of many).
          </div>
        </div>
      </div>

      {/* tabs */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 20, borderBottom: '2px solid #E8E4FF' }}>
        {([{ key: 'and', label: 'AND Groups', icon: <Layers size={14} /> }, { key: 'or', label: 'OR Groups', icon: <Shuffle size={14} /> }] as const).map(tab => {
          const active = activeTab === tab.key
          return (
            <button key={tab.key} onClick={() => setActiveTab(tab.key)} style={{
              display: 'inline-flex', alignItems: 'center', gap: 7, padding: '9px 18px', border: 'none', cursor: 'pointer',
              background: 'transparent', fontFamily: 'inherit', fontSize: 13, fontWeight: active ? 700 : 500,
              color: active ? '#7C6FE0' : '#8B87AD', borderBottom: active ? '3px solid #7C6FE0' : '3px solid transparent', marginBottom: -2,
            }}>
              <span style={{ color: active ? '#7C6FE0' : '#C4B5FD' }}>{tab.icon}</span>{tab.label}
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
              <div style={{ fontSize: 13, fontWeight: 700, color: '#13111E', marginBottom: 2 }}>Combination blocks</div>
              <div style={{ fontSize: 11, color: '#6B7280' }}>
                Each block shares one Section/Total rail; each card beside it is one optional group whose columns sum to the section total.
              </div>
            </div>
            <button onClick={runAiSuggest} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 8, border: '1.5px solid #FDE68A', background: '#FFFBEB', color: '#92400E', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
              <Sparkles size={13} color="#D97706" /> AI Suggest
            </button>
            <button onClick={addBlankBlock} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 16px', borderRadius: 8, border: 'none', background: '#7C6FE0', color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', boxShadow: '0 2px 8px rgba(124,111,224,0.35)' }}>
              <Plus size={13} /> New block
            </button>
          </div>

          {/* user guide */}
          <div style={{ marginBottom: 16, borderRadius: 10, border: '1px solid #C4B5FD', background: 'linear-gradient(135deg, #F5F2FF, #FAFAFE)', overflow: 'hidden' }}>
            <button onClick={() => setShowGuide(g => !g)} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 8, padding: '9px 14px', border: 'none', background: 'transparent', cursor: 'pointer', fontFamily: 'inherit' }}>
              <Info size={15} color="#7C6FE0" />
              <span style={{ fontSize: 12.5, fontWeight: 800, color: '#4C1D95', flex: 1, textAlign: 'left' }}>How to build a combination — quick guide</span>
              <ChevronDown size={16} color="#7C6FE0" style={{ transform: showGuide ? 'none' : 'rotate(-90deg)', transition: 'transform .15s' }} />
            </button>
            {showGuide && (
              <div style={{ padding: '4px 14px 14px' }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10 }}>
                  {[
                    { n: 1, t: 'Add the class-sections', d: 'Use the purple “＋ Add section” under the Section heading. They become the rows of this block.' },
                    { n: 2, t: 'Add subjects per combo', d: 'Click the green “＋ Subject” in a combo to add its mutually-exclusive choices (e.g. Maths, Bio).' },
                    { n: 3, t: 'Add more combinations', d: 'Use “＋ Add combo” on the right for a separate optional group (e.g. PE / Painting).' },
                    { n: 4, t: 'Enter the headcounts', d: 'Type how many students take each subject — each combo’s row must sum to the section total (green ✓). “Split evenly” fills them fast.' },
                    { n: 5, t: 'Set how groups merge', d: 'Use Merge (Section/Grade/Stream/Block) and the Room-capacity toggle to control pooling, then press “Generate teaching groups”.' },
                    { n: 6, t: 'Review & assign rooms', d: 'Each generated group shows its sections & size — set a Room, delete a single group, or hit “Show / Hide” to preview.' },
                  ].map(s => (
                    <div key={s.n} style={{ display: 'flex', gap: 8 }}>
                      <div style={{ flexShrink: 0, width: 20, height: 20, borderRadius: '50%', background: '#7C6FE0', color: '#fff', fontSize: 11, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{s.n}</div>
                      <div>
                        <div style={{ fontSize: 11.5, fontWeight: 800, color: '#13111E', marginBottom: 2 }}>{s.t}</div>
                        <div style={{ fontSize: 10.5, color: '#6B7280', lineHeight: 1.45 }}>{s.d}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* global merge */}
          {groups.length > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', marginBottom: 14, borderRadius: 9, background: '#F5F2FF', border: '1px solid #E8E4FF', flexWrap: 'wrap' }}>
              <span style={{ fontSize: 9.5, fontWeight: 800, color: '#7C6FE0', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Global merge:</span>
              {SCOPE_DIMS.map(dim => (
                <div key={dim.key} title={dim.desc} style={{ display: 'inline-flex', alignItems: 'center', borderRadius: 5, overflow: 'hidden', border: '1.5px solid #E4E0FF' }}>
                  <span style={{ fontSize: 9, fontWeight: 700, color: '#8B87AD', padding: '2px 5px', background: '#fff' }}>{dim.label}</span>
                  {(['same', 'cross'] as const).map(v => {
                    const active = globalScope[dim.key] === v
                    return <button key={v} onClick={() => setGlobalScope(s => ({ ...s, [dim.key]: v }))} style={{ padding: '2px 7px', border: 'none', fontSize: 9.5, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', background: active ? (v === 'same' ? '#7C6FE0' : '#F59E0B') : '#fff', color: active ? '#fff' : '#C4C0DC' }}>{v === 'same' ? 'Same' : 'Cross'}</button>
                  })}
                </div>
              ))}
              <button onClick={() => applyGlobalScope(globalScope)} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '5px 12px', borderRadius: 7, border: 'none', background: '#7C6FE0', color: '#fff', fontSize: 10.5, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
                Apply to all {blocks.length} block{blocks.length !== 1 ? 's' : ''}
              </button>
            </div>
          )}

          {/* shared-electives hint */}
          {sharedElectives.length > 0 && !hintDismissed && (
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '10px 14px', marginBottom: 16, borderRadius: 10, background: '#FFFBEB', border: '1px solid #FDE68A' }}>
              <Info size={15} color="#D97706" style={{ flexShrink: 0, marginTop: 1 }} />
              <div style={{ flex: 1, fontSize: 11.5, color: '#78350F', lineHeight: 1.55 }}>
                <strong>{sharedElectives.slice(0, 5).join(', ')}{sharedElectives.length > 5 ? ` +${sharedElectives.length - 5}` : ''}</strong> look like single elective choices — set them up as{' '}
                <button onClick={() => setActiveTab('or')} style={{ background: 'none', border: 'none', padding: 0, color: '#B45309', fontWeight: 700, textDecoration: 'underline', cursor: 'pointer', fontFamily: 'inherit', fontSize: 11.5 }}>OR Groups</button>.
              </div>
              <button onClick={() => setHintDismissed(true)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#B45309', padding: 2, flexShrink: 0 }}><X size={13} /></button>
            </div>
          )}

          {/* blocks */}
          {blocks.length === 0 ? (
            <div style={{ padding: '44px 20px', textAlign: 'center', background: '#FAFAFE', borderRadius: 12, border: '1.5px dashed #E4E0FF' }}>
              <Layers size={32} color="#C4B5FD" style={{ marginBottom: 12 }} />
              <div style={{ fontSize: 14, fontWeight: 700, color: '#8B87AD', marginBottom: 6 }}>No combinations yet</div>
              <div style={{ fontSize: 12, color: '#B8B4D4', marginBottom: 16, lineHeight: 1.6 }}>
                Click <strong>AI Suggest</strong> to auto-build blocks from your electives, or <strong>New block</strong> to start one.
              </div>
              <button onClick={addBlankBlock} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '9px 20px', borderRadius: 8, border: 'none', background: '#7C6FE0', color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', boxShadow: '0 2px 8px rgba(124,111,224,0.3)' }}>
                <Plus size={14} /> New block
              </button>
            </div>
          ) : blocks.map(block => (
            <BlockCard key={block.blockId} block={block} sectionsStore={sections as any[]} rooms={rooms} staff={staff}
              allSubjectNames={allSubjectNames} allSectionNames={allSectionNames} allRoomNames={allRoomNames} allTeacherNames={allTeacherNames}
              onReplace={combos => replaceBlock(block.blockId, combos)} onDeleteBlock={() => deleteBlock(block.blockId)} />
          ))}

          {/* summary */}
          {groups.length > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10, padding: '10px 14px', borderRadius: 8, background: '#F5F2FF', border: '1px solid #E8E4FF' }}>
              <Zap size={13} color="#7C6FE0" />
              <span style={{ fontSize: 11, color: '#7C6FE0', fontWeight: 600, flex: 1 }}>
                {totalGenerated} teaching group{totalGenerated !== 1 ? 's' : ''} across {blocks.length} block{blocks.length !== 1 ? 's' : ''}
              </span>
              <button onClick={() => setAndComboGroups(groups.map(g => ({ ...g, generatedGroups: generateAndGroups(g, rooms, staff) })))} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '6px 14px', borderRadius: 7, border: '1.5px solid #C4B5FD', background: '#fff', color: '#7C6FE0', fontSize: 11, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
                <RefreshCw size={11} /> Generate all
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
              <div style={{ fontSize: 13, fontWeight: 700, color: '#92400E', marginBottom: 4 }}>OR Elective Slots</div>
              <div style={{ fontSize: 12, color: '#78350F', lineHeight: 1.65 }}>
                <strong>OR slot</strong> — one of the listed subjects runs per slot; each student picks one and whichever teacher is free takes that period (e.g. a Third-Language slot: Hindi / French / German).<br />
                Parallel splits where a section divides simultaneously belong in the <strong>AND Groups</strong> tab.
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
            orOnly
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
