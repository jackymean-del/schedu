/**
 * Step 4 — AND Groups + OR Groups
 *
 * AND Groups tab: Subject bundles where students split into mutually exclusive
 *   combinations (e.g. PCM vs PCB). Each bundle card has a per-section strength
 *   matrix and can generate concrete teaching groups.
 *
 * OR Groups tab: Elective slots where students pick one subject from a list
 *   (e.g. R1/R2/R3 regional language, PE/Art/Music). Uses SubjectGroupsSection.
 */

import { useState, useMemo, useCallback, useRef, useEffect } from 'react'
import { useTimetableStore } from '@/store/timetableStore'
import type { AndComboGroup, AndTeachingGroup, SubjectBundle } from '@/types'
import {
  Layers, Shuffle, ChevronRight, ChevronLeft, Plus, Trash2, Pencil,
  Sparkles, Users, Check, X, RefreshCw, Info, Zap, CheckCircle2,
  AlertCircle, XCircle,
} from 'lucide-react'
import { SubjectGroupsSection } from '@/components/resources/SubjectGroupsSection'

// ── color palette ──────────────────────────────────────────────────────────────

const BUNDLE_COLORS = ['#7C6FE0', '#10B981', '#F59E0B', '#EF4444', '#3B82F6', '#EC4899', '#8B5CF6', '#06B6D4']
function bundleColor(i: number) { return BUNDLE_COLORS[i % BUNDLE_COLORS.length] }
function makeId() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 6) }

// ── helpers ────────────────────────────────────────────────────────────────────

function guessStream(secName: string): string {
  const u = secName.toUpperCase()
  if (u.includes('SCIENCE') || u.includes('SCI') || u.includes('PCM') || u.includes('PCB')) return 'Science'
  if (u.includes('COMMERCE') || u.includes('COM')) return 'Commerce'
  if (u.includes('HUM') || u.includes('ARTS')) return 'Humanities'
  return 'General'
}

// ── AI suggestion logic ────────────────────────────────────────────────────────

function suggestAndComboGroups(
  subjects: any[],
  sections: any[],
): AndComboGroup[] {
  const suggestions: AndComboGroup[] = []

  // Science stream: PCM vs PCB
  const sciSections = sections.filter(s => {
    const u = (s.name ?? '').toUpperCase()
    return (u.includes('SCI') || u.includes('SCIENCE')) &&
      (s.name.startsWith('XI') || s.name.startsWith('XII'))
  })
  if (sciSections.length > 0) {
    const hasMaths = subjects.some(s => s.name.toLowerCase().includes('math') && s.isOptional)
    const hasBio   = subjects.some(s => s.name.toLowerCase().includes('bio')  && s.isOptional)
    const hasPhy   = subjects.some(s => s.name.toLowerCase().includes('phys') && s.isOptional)
    const hasChem  = subjects.some(s => s.name.toLowerCase().includes('chem') && s.isOptional)
    if ((hasMaths || hasBio) && (hasPhy || hasChem)) {
      const bundles: SubjectBundle[] = []
      if (hasMaths) bundles.push({
        id: 'pcm', name: 'PCM',
        subjects: ['Physics','Chemistry','Mathematics'].filter(n => subjects.some(s => s.name === n)),
        color: '#7C6FE0',
      })
      if (hasBio) bundles.push({
        id: 'pcb', name: 'PCB',
        subjects: ['Physics','Chemistry','Biology'].filter(n => subjects.some(s => s.name === n)),
        color: '#10B981',
      })
      if (bundles.length >= 2) {
        suggestions.push({
          id: `suggest_sci_${Date.now()}`,
          name: `Science Stream: ${bundles.map(b => b.name).join(' vs ')}`,
          applicableSections: sciSections.map(s => s.name),
          bundles,
          strengthMatrix: {},
          aiSuggested: true,
        })
      }
    }
  }

  // Cross-stream: optional subjects with the same section signature
  const bySig = new Map<string, any[]>()
  for (const sub of subjects.filter(s => s.isOptional)) {
    const fromConfigs = (sub.classConfigs ?? []).map((c: any) => c.sectionName).filter(Boolean) as string[]
    const assigned = [...new Set([...fromConfigs, ...(sub.sections ?? [])])].sort().join('|')
    if (!assigned) continue
    if (!bySig.has(assigned)) bySig.set(assigned, [])
    bySig.get(assigned)!.push(sub)
  }
  for (const [sig, subs] of bySig) {
    if (subs.length < 2) continue
    const alreadyCovered = suggestions.some(sg =>
      subs.every(s => sg.bundles.some(b => b.subjects.includes(s.name))))
    if (alreadyCovered) continue
    const secNames = sig.split('|')
    suggestions.push({
      id: `suggest_sig_${sig.slice(0, 20)}_${Date.now()}`,
      name: `${subs.map((s: any) => s.name).join(' vs ')} (${secNames[0]}…)`,
      applicableSections: secNames,
      bundles: subs.map((s: any, i: number) => ({
        id: s.id,
        name: s.name,
        subjects: [s.name],
        color: BUNDLE_COLORS[i % BUNDLE_COLORS.length],
      })),
      strengthMatrix: {},
      aiSuggested: true,
    })
  }

  return suggestions
}

// ── Teaching group generation ──────────────────────────────────────────────────

// Composite key for per-subject headcount in strengthMatrix
function subjKey(bundleId: string, subjectName: string) {
  return `${bundleId}::${subjectName}`
}

function generateAndGroups(
  group: AndComboGroup,
  rooms: any[],
): AndTeachingGroup[] {
  const result: AndTeachingGroup[] = []
  const sortedRooms = [...rooms].sort((a, b) => (a.capacity ?? 0) - (b.capacity ?? 0))
  const biggestRoom = sortedRooms.length > 0
    ? sortedRooms[sortedRooms.length - 1].capacity ?? 0
    : Infinity

  for (const bundle of group.bundles) {
    // One teaching group per subject (subjects within a bundle are alternatives)
    for (const subjectName of bundle.subjects) {
      const key = subjKey(bundle.id, subjectName)
      const sectionSlices: Array<{ sectionName: string; studentCount: number }> = []
      for (const secName of group.applicableSections) {
        const count = group.strengthMatrix?.[secName]?.[key] ?? 0
        if (count > 0) sectionSlices.push({ sectionName: secName, studentCount: count })
      }
      if (sectionSlices.length === 0) continue

      const totalStrength = sectionSlices.reduce((a, s) => a + s.studentCount, 0)
      const subKey = subjectName.replace(/\s/g, '')

      const pushGroup = (
        id: string,
        slices: Array<{ sectionName: string; studentCount: number }>,
        strength: number,
      ) => {
        const room = sortedRooms.find(r => (r.capacity ?? 0) >= strength)
          ?? sortedRooms[sortedRooms.length - 1]
        result.push({
          id,
          bundleId: bundle.id,
          bundleName: bundle.name,
          subjects: [subjectName],
          sectionSlices: slices,
          totalStrength: strength,
          room: room?.name ?? room?.actualName,
          roomCapacity: room?.capacity,
          capacityWarning: (room?.capacity ?? 0) < strength,
        })
      }

      if (totalStrength <= biggestRoom || biggestRoom === Infinity) {
        pushGroup(`${group.id}_${bundle.id}_${subKey}_G1`, sectionSlices, totalStrength)
      } else {
        let batch: Array<{ sectionName: string; studentCount: number }> = []
        let batchStr = 0
        let gIdx = 1
        const flush = () => {
          if (batch.length === 0) return
          pushGroup(`${group.id}_${bundle.id}_${subKey}_G${gIdx}`, [...batch], batchStr)
          batch = []; batchStr = 0; gIdx++
        }
        for (const slice of sectionSlices) {
          if (batchStr + slice.studentCount > biggestRoom && batch.length > 0) flush()
          batch.push(slice); batchStr += slice.studentCount
        }
        flush()
      }
    }
  }
  return result
}

// ── Mini table helpers ─────────────────────────────────────────────────────────

function miniTH(align: 'left' | 'center', w?: number): React.CSSProperties {
  return {
    padding: '6px 8px', fontSize: 10, fontWeight: 800, color: '#8B87AD',
    textTransform: 'uppercase', letterSpacing: '0.07em', background: '#F8F7FF',
    borderBottom: '2px solid #E8E4FF', textAlign: align,
    width: w, minWidth: w, whiteSpace: 'nowrap',
  } as React.CSSProperties
}
function miniTD(align: 'left' | 'center'): React.CSSProperties {
  return { padding: '5px 8px', textAlign: align, borderBottom: '1px solid #F0EDFF' }
}

// ── AND Group Card ─────────────────────────────────────────────────────────────

function AndGroupCard({
  group, sections, onUpdate, onDelete, onEdit, onGenerateGroups,
}: {
  group: AndComboGroup
  sections: any[]
  onUpdate: (g: AndComboGroup) => void
  onDelete: () => void
  onEdit: () => void
  onGenerateGroups: () => void
}) {
  const getTotal = (secName: string) =>
    sections.find((s: any) => s.name === secName)?.strength ?? 0

  const getSubjCount = (secName: string, bundleId: string, subjectName: string) =>
    group.strengthMatrix?.[secName]?.[subjKey(bundleId, subjectName)] ?? 0

  const setSubjCount = (secName: string, bundleId: string, subjectName: string, val: number) => {
    const key = subjKey(bundleId, subjectName)
    onUpdate({
      ...group,
      aiSuggested: false,
      strengthMatrix: {
        ...group.strengthMatrix,
        [secName]: { ...(group.strengthMatrix?.[secName] ?? {}), [key]: val },
      },
    })
  }

  return (
    <div style={{
      border: '1.5px solid #E4E0FF', borderRadius: 12, overflow: 'hidden',
      background: '#FAFAFE', marginBottom: 14,
    }}>
      {/* Card header */}
      <div style={{
        padding: '12px 16px', background: '#F3F1FF',
        borderBottom: '1px solid #E8E4FF',
        display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
      }}>
        <span style={{ fontSize: 13, fontWeight: 800, color: '#13111E', flex: 1, display: 'flex', alignItems: 'center', gap: 7 }}>
          {group.aiSuggested && (
            <span style={{ fontSize: 9, background: '#7C6FE0', color: '#fff', borderRadius: 3, padding: '1px 6px', fontWeight: 700 }}>⚡ AI</span>
          )}
          {group.name}
        </span>
        <span style={{ fontSize: 11, color: '#8B87AD' }}>
          {group.bundles.length} bundle{group.bundles.length !== 1 ? 's' : ''} · {group.applicableSections.length} section{group.applicableSections.length !== 1 ? 's' : ''}
        </span>
        <button onClick={onEdit} title="Edit" style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9CA3AF', padding: 4 }}>
          <Pencil size={13} />
        </button>
        <button onClick={onDelete} title="Delete" style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#EF4444', padding: 4 }}>
          <Trash2 size={13} />
        </button>
      </div>

      {/* One mini-table per bundle (subjects as columns) */}
      <div style={{ padding: '10px 16px' }}>
        {group.applicableSections.length === 0 ? (
          <p style={{ fontSize: 12, color: '#C4C0DC', margin: 0 }}>No sections selected. Edit to add sections.</p>
        ) : (
          group.bundles.map(bundle => {
            const color = bundle.color ?? '#7C6FE0'
            return (
              <div key={bundle.id} style={{ marginBottom: 12 }}>
                {/* Bundle label */}
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 6,
                  padding: '5px 8px', marginBottom: 4,
                  background: `${color}12`, borderRadius: 6,
                  border: `1px solid ${color}30`,
                }}>
                  <div style={{ width: 8, height: 8, borderRadius: '50%', background: color, flexShrink: 0 }} />
                  <span style={{ fontSize: 11, fontWeight: 800, color }}>{bundle.name}</span>
                  <span style={{ fontSize: 10, color: '#9CA3AF' }}>{bundle.subjects.join(' · ')}</span>
                </div>
                {/* Table: sections × subjects */}
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ borderCollapse: 'collapse', width: '100%' }}>
                    <thead>
                      <tr>
                        <th style={miniTH('left', 130)}>Section</th>
                        <th style={miniTH('center', 62)}>Total</th>
                        {bundle.subjects.map(sub => (
                          <th key={sub} style={{ ...miniTH('center', 86), color }}>{sub}</th>
                        ))}
                        <th style={miniTH('center', 90)}>Validation</th>
                      </tr>
                    </thead>
                    <tbody>
                      {group.applicableSections.map((secName, ri) => {
                        const total = getTotal(secName)
                        const sum = bundle.subjects.reduce((a, s) => a + getSubjCount(secName, bundle.id, s), 0)
                        const isMatch = total > 0 && sum === total
                        const isOver  = sum > total
                        return (
                          <tr key={secName} style={{ background: ri % 2 === 0 ? '#fff' : '#FAFAFE' }}>
                            <td style={miniTD('left')}>
                              <span style={{ fontSize: 12, fontWeight: 700, color: '#374151' }}>{secName}</span>
                            </td>
                            <td style={miniTD('center')}>
                              <span style={{ fontSize: 12, fontWeight: 600, color: '#6B7280' }}>{total || '—'}</span>
                            </td>
                            {bundle.subjects.map(sub => (
                              <td key={sub} style={miniTD('center')}>
                                <input
                                  type="number" min={0}
                                  value={getSubjCount(secName, bundle.id, sub) || ''}
                                  onChange={e => setSubjCount(secName, bundle.id, sub, Math.max(0, parseInt(e.target.value) || 0))}
                                  placeholder="0"
                                  style={{
                                    width: 62, padding: '4px 5px', borderRadius: 6, textAlign: 'center',
                                    border: `1.5px solid ${isOver ? '#FCA5A5' : color + '55'}`,
                                    fontSize: 13, fontWeight: 700, outline: 'none',
                                    fontFamily: 'inherit',
                                    background: isOver ? '#FEF2F2' : `${color}0D`,
                                    color: '#111028',
                                  }}
                                />
                              </td>
                            ))}
                            <td style={miniTD('center')}>
                              {total === 0 ? (
                                <span style={{ fontSize: 10, color: '#C4C0DC' }}>—</span>
                              ) : isMatch ? (
                                <span style={{ color: '#15803D', fontSize: 11, fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 2 }}>
                                  <CheckCircle2 size={11} /> {sum}/{total}
                                </span>
                              ) : isOver ? (
                                <span style={{ color: '#DC2626', fontSize: 11, fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 2 }}>
                                  <XCircle size={11} /> +{sum - total}
                                </span>
                              ) : sum > 0 ? (
                                <span style={{ color: '#D97706', fontSize: 11, fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 2 }}>
                                  <AlertCircle size={11} /> −{total - sum}
                                </span>
                              ) : (
                                <span style={{ fontSize: 10, color: '#C4C0DC' }}>○ {total}</span>
                              )}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )
          })
        )}

        {/* Generate / generated groups */}
        <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <button onClick={onGenerateGroups} style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            padding: '6px 14px', borderRadius: 7,
            border: '1.5px solid #C4B5FD', background: '#F5F2FF',
            color: '#7C6FE0', fontSize: 11, fontWeight: 700,
            cursor: 'pointer', fontFamily: 'inherit',
          }}>
            <RefreshCw size={11} /> Generate Teaching Groups
          </button>
          {group.generatedGroups && group.generatedGroups.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {group.generatedGroups.map(g => {
                const bc = group.bundles.find(b => b.id === g.bundleId)?.color ?? '#7C6FE0'
                return (
                  <span key={g.id} title={g.sectionSlices.map(s => `${s.sectionName}: ${s.studentCount}`).join(', ')} style={{
                    fontSize: 10, fontWeight: 700, padding: '3px 9px',
                    background: bc, color: '#fff', borderRadius: 5,
                  }}>
                    {g.subjects[0] ?? g.bundleName} · {g.totalStrength} students
                    {g.room ? ` · ${g.room}` : ''}
                    {g.capacityWarning ? ' ⚠' : ''}
                  </span>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ── AND Group Modal ────────────────────────────────────────────────────────────

function AndGroupModal({
  initial, allSubjects, allSections, onSave, onClose,
}: {
  initial?: AndComboGroup | null
  allSubjects: string[]
  allSections: string[]
  onSave: (g: AndComboGroup) => void
  onClose: () => void
}) {
  const [name, setName] = useState(initial?.name ?? '')
  const [selectedSections, setSelectedSections] = useState<string[]>(initial?.applicableSections ?? [])
  const [bundles, setBundles] = useState<SubjectBundle[]>(
    initial?.bundles?.length
      ? initial.bundles
      : [
          { id: makeId(), name: '', subjects: [], color: BUNDLE_COLORS[0] },
          { id: makeId(), name: '', subjects: [], color: BUNDLE_COLORS[1] },
        ]
  )
  const [secQ, setSecQ] = useState('')

  const filteredSections = useMemo(() =>
    allSections.filter(s => s.toLowerCase().includes(secQ.toLowerCase()) && !selectedSections.includes(s)),
    [allSections, secQ, selectedSections],
  )

  const updateBundle = (id: string, patch: Partial<SubjectBundle>) =>
    setBundles(bs => bs.map(b => b.id === id ? { ...b, ...patch } : b))

  const autoName = (subs: string[]) => subs.map(s => s.split(' ')[0]).join('/')

  const toggleBundleSubject = (bundleId: string, subj: string) => {
    setBundles(bs => bs.map(b => {
      if (b.id !== bundleId) return b
      const newSubjects = b.subjects.includes(subj)
        ? b.subjects.filter(s => s !== subj)
        : [...b.subjects, subj]
      const wasAuto = !b.name || b.name === autoName(b.subjects)
      return {
        ...b,
        subjects: newSubjects,
        name: wasAuto ? autoName(newSubjects) : b.name,
      }
    }))
  }

  const addBundle = () => {
    setBundles(bs => [...bs, {
      id: makeId(), name: '',
      subjects: [],
      color: BUNDLE_COLORS[bs.length % BUNDLE_COLORS.length],
    }])
  }

  const removeBundle = (id: string) => {
    setBundles(bs => bs.filter(b => b.id !== id))
  }

  const canSave = name.trim() && bundles.length >= 2 && bundles.every(b => b.name.trim() && b.subjects.length >= 1) && selectedSections.length >= 1

  return (
    <div
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
      style={{
        position: 'fixed', inset: 0, zIndex: 2000,
        background: 'rgba(0,0,0,0.42)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
        fontFamily: "'Plus Jakarta Sans', sans-serif",
      }}
    >
      <div style={{
        background: '#fff', borderRadius: 14, width: '100%', maxWidth: 560,
        maxHeight: '92vh', overflowY: 'auto',
        boxShadow: '0 20px 60px rgba(0,0,0,0.22)',
        padding: '22px 22px 18px',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
          <h3 style={{ margin: 0, fontSize: 15, fontWeight: 800, color: '#13111E' }}>
            {initial ? 'Edit AND Group' : 'New AND Group'}
          </h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9CA3AF', padding: 4 }}>
            <X size={16} />
          </button>
        </div>

        {/* Info callout */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 18, padding: '9px 12px', background: '#EDE9FF', border: '1px solid #C4B5FD', borderRadius: 8 }}>
          <Info size={13} color="#7C6FE0" style={{ flexShrink: 0, marginTop: 1 }} />
          <div style={{ fontSize: 11, color: '#4C1D95', lineHeight: 1.55 }}>
            Students split into <strong>mutually exclusive bundles</strong> — PCM students take Physics+Chemistry+Maths,
            PCB students take Physics+Chemistry+Biology. The sum of all bundle headcounts = section total.
          </div>
        </div>

        {/* Group name */}
        <div style={{ marginBottom: 14 }}>
          <label style={{ fontSize: 11, fontWeight: 700, color: '#6B7280', display: 'block', marginBottom: 5, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            Group name <span style={{ color: '#EF4444' }}>*</span>
          </label>
          <input
            value={name} onChange={e => setName(e.target.value)}
            placeholder='e.g. "Science XI-XII: PCM vs PCB"'
            style={{ width: '100%', boxSizing: 'border-box', padding: '7px 10px', borderRadius: 7, border: '1.5px solid #E4E0FF', fontSize: 13, outline: 'none', fontFamily: 'inherit', color: '#13111E', background: '#FAFAFE' }}
          />
        </div>

        {/* Applicable sections */}
        <div style={{ marginBottom: 18 }}>
          <label style={{ fontSize: 11, fontWeight: 700, color: '#6B7280', display: 'block', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            Applicable sections <span style={{ color: '#EF4444' }}>*</span>
            <span style={{ color: '#C4C0DC', fontWeight: 400, marginLeft: 4 }}>({selectedSections.length} selected)</span>
          </label>

          {selectedSections.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginBottom: 8, padding: '7px 10px', borderRadius: 8, background: '#EDE9FF', border: '1px solid #C4B5FD' }}>
              {selectedSections.map(s => (
                <span key={s} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, background: '#fff', border: '1.5px solid #7C6FE0', borderRadius: 5, padding: '2px 7px', fontSize: 11, fontWeight: 700, color: '#4C1D95' }}>
                  {s}
                  <button onClick={() => setSelectedSections(p => p.filter(x => x !== s))} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#7C6FE0', padding: 0, lineHeight: 1, fontSize: 12 }}>✕</button>
                </span>
              ))}
            </div>
          )}
          <input
            value={secQ} onChange={e => setSecQ(e.target.value)}
            placeholder="Search sections…"
            style={{ width: '100%', boxSizing: 'border-box', padding: '6px 10px', borderRadius: 7, border: '1.5px solid #E4E0FF', fontSize: 12, outline: 'none', fontFamily: 'inherit', background: '#FAFAFE', marginBottom: 6 }}
          />
          {filteredSections.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, maxHeight: 90, overflowY: 'auto', padding: '6px 8px', borderRadius: 7, background: '#F9FAFB', border: '1px solid #E4E0FF' }}>
              {filteredSections.map(s => (
                <button key={s} onClick={() => setSelectedSections(p => [...p, s])} style={{ padding: '3px 9px', borderRadius: 5, fontSize: 11, fontWeight: 600, border: '1.5px solid #E4E0FF', background: '#fff', color: '#6B7280', cursor: 'pointer', fontFamily: 'inherit' }}
                  onMouseEnter={e => { e.currentTarget.style.background = '#EDE9FF'; e.currentTarget.style.borderColor = '#7C6FE0'; e.currentTarget.style.color = '#4C1D95' }}
                  onMouseLeave={e => { e.currentTarget.style.background = '#fff'; e.currentTarget.style.borderColor = '#E4E0FF'; e.currentTarget.style.color = '#6B7280' }}>
                  + {s}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Bundles */}
        <div style={{ marginBottom: 14 }}>
          <label style={{ fontSize: 11, fontWeight: 700, color: '#6B7280', display: 'block', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            Bundles <span style={{ color: '#EF4444' }}>*</span>
            <span style={{ color: '#C4C0DC', fontWeight: 400, marginLeft: 4 }}>min 2 required</span>
          </label>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {bundles.map((bundle, bi) => (
              <div key={bundle.id} style={{ border: `2px solid ${bundle.color ?? '#E4E0FF'}22`, borderRadius: 10, padding: '12px 14px', background: '#FAFAFE' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                  <div style={{ width: 12, height: 12, borderRadius: '50%', background: bundle.color ?? '#7C6FE0', flexShrink: 0 }} />
                  <input
                    value={bundle.name}
                    onChange={e => updateBundle(bundle.id, { name: e.target.value })}
                    placeholder={`Bundle ${bi + 1} name (e.g. PCM, PCB, Arts)`}
                    style={{ flex: 1, padding: '5px 9px', borderRadius: 6, border: '1.5px solid #E4E0FF', fontSize: 12, fontWeight: 700, outline: 'none', fontFamily: 'inherit', color: '#13111E' }}
                  />
                  {/* Color swatches */}
                  <div style={{ display: 'flex', gap: 3 }}>
                    {BUNDLE_COLORS.slice(0, 6).map(c => (
                      <button key={c} onClick={() => updateBundle(bundle.id, { color: c })} title={c} style={{ width: 14, height: 14, borderRadius: '50%', background: c, border: `2px solid ${bundle.color === c ? '#13111E' : 'transparent'}`, cursor: 'pointer', padding: 0 }} />
                    ))}
                  </div>
                  {bundles.length > 2 && (
                    <button onClick={() => removeBundle(bundle.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#EF4444', padding: 2 }}>
                      <X size={13} />
                    </button>
                  )}
                </div>
                {/* Subject picker for this bundle */}
                <div style={{ fontSize: 11, fontWeight: 600, color: '#6B7280', marginBottom: 5 }}>Subjects in bundle:</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                  {allSubjects.map(s => {
                    const selected = bundle.subjects.includes(s)
                    return (
                      <button key={s} onClick={() => toggleBundleSubject(bundle.id, s)} style={{
                        padding: '3px 9px', borderRadius: 5, fontSize: 11, fontWeight: 600,
                        border: `1.5px solid ${selected ? (bundle.color ?? '#7C6FE0') : '#E4E0FF'}`,
                        background: selected ? `${bundle.color ?? '#7C6FE0'}22` : '#fff',
                        color: selected ? (bundle.color ?? '#7C6FE0') : '#6B7280',
                        cursor: 'pointer', fontFamily: 'inherit', transition: 'all 0.1s',
                      }}>
                        {selected ? '✓ ' : '+ '}{s}
                      </button>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>

          <button onClick={addBundle} style={{ marginTop: 8, display: 'inline-flex', alignItems: 'center', gap: 5, padding: '6px 14px', borderRadius: 7, border: '1.5px dashed #C4B5FD', background: '#F5F3FF', color: '#7C6FE0', fontSize: 11, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
            <Plus size={11} /> Add Bundle
          </button>
        </div>

        {/* Footer */}
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', paddingTop: 12, borderTop: '1px solid #F3F4F6' }}>
          <button onClick={onClose} style={{ padding: '8px 18px', borderRadius: 7, border: '1.5px solid #D1D5DB', background: '#fff', fontSize: 13, fontWeight: 600, color: '#374151', cursor: 'pointer', fontFamily: 'inherit' }}>
            Cancel
          </button>
          <button
            disabled={!canSave}
            onClick={() => {
              if (!canSave) return
              onSave({
                id: initial?.id ?? makeId(),
                name: name.trim(),
                applicableSections: selectedSections,
                bundles,
                strengthMatrix: initial?.strengthMatrix ?? {},
                aiSuggested: false,
                generatedGroups: undefined,
              })
            }}
            style={{
              padding: '8px 22px', borderRadius: 7, border: 'none',
              background: canSave ? '#7C6FE0' : '#E5E7EB',
              color: canSave ? '#fff' : '#9CA3AF',
              fontSize: 13, fontWeight: 700,
              cursor: canSave ? 'pointer' : 'default',
              fontFamily: 'inherit',
              display: 'inline-flex', alignItems: 'center', gap: 6,
            }}
          >
            <Check size={13} /> {initial ? 'Save changes' : 'Add AND Group'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Main component ─────────────────────────────────────────────────────────────

export function StepStudentGroups() {
  const store = useTimetableStore() as any
  const {
    sections, subjects, setStep,
    andComboGroups, setAndComboGroups,
  } = store

  const rooms: any[] = useMemo(() => store.rooms ?? [], [store])

  const [activeTab, setActiveTab] = useState<'and' | 'or'>('and')

  // ── AND Groups state ───────────────────────────────────────────────────────
  const [modalOpen, setModalOpen] = useState(false)
  const [editTarget, setEditTarget] = useState<AndComboGroup | null>(null)
  const [dismissedSugs, setDismissedSugs] = useState<Set<string>>(new Set())

  // Auto-populate suggestions as real cards on first mount when store is empty
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

  const openNew  = () => { setEditTarget(null); setModalOpen(true) }
  const openEdit = (g: AndComboGroup) => { setEditTarget(g); setModalOpen(true) }

  const handleSaveGroup = (g: AndComboGroup) => {
    const isEdit = editTarget && editTarget.id !== ''
    setAndComboGroups(
      isEdit
        ? (andComboGroups as AndComboGroup[]).map((x: AndComboGroup) => x.id === g.id ? g : x)
        : [...(andComboGroups as AndComboGroup[]), g]
    )
    setModalOpen(false)
  }

  const handleDeleteGroup = (id: string) => {
    setAndComboGroups((andComboGroups as AndComboGroup[]).filter((g: AndComboGroup) => g.id !== id))
  }

  const handleUpdateGroup = (updated: AndComboGroup) => {
    setAndComboGroups((andComboGroups as AndComboGroup[]).map((g: AndComboGroup) => g.id === updated.id ? updated : g))
  }

  const handleGenerateGroups = (groupId: string) => {
    const group = (andComboGroups as AndComboGroup[]).find((g: AndComboGroup) => g.id === groupId)
    if (!group) return
    const generated = generateAndGroups(group, rooms)
    handleUpdateGroup({ ...group, generatedGroups: generated })
  }

  // AI suggestions
  const rawSuggestions = useMemo(
    () => suggestAndComboGroups(subjects as any[], sections as any[]),
    [subjects, sections],
  )
  const suggestions = useMemo(
    () => rawSuggestions.filter(s => !dismissedSugs.has(s.id)),
    [rawSuggestions, dismissedSugs],
  )

  const useSuggestion = (sug: AndComboGroup) => {
    // Pre-fill the modal with the suggestion — user can still edit
    setEditTarget({ ...sug, id: '' })
    setModalOpen(true)
  }

  // Subject sections map for the OR Groups tab
  const subjectSectionsMap = useMemo(() => {
    const map: Record<string, string[]> = {}
    for (const sub of subjects as any[]) {
      const fromConfigs = (sub.classConfigs ?? []).map((c: any) => c.sectionName).filter(Boolean) as string[]
      const fromSections: string[] = sub.sections ?? []
      const all = [...new Set([...fromConfigs, ...fromSections])]
      if (all.length > 0) map[sub.name] = all
    }
    return map
  }, [subjects])

  const allSubjectNames = useMemo(() => (subjects as any[]).map((s: any) => s.name), [subjects])
  const allSectionNames = useMemo(() => (sections as any[]).map((s: any) => s.name), [sections])

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div style={{ padding: '20px 24px 40px', maxWidth: 1280, margin: '0 auto' }}>

      {/* ── Header ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
        <div style={{ width: 40, height: 40, borderRadius: 10, background: '#EDE9FF', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Layers size={20} color="#7C6FE0" />
        </div>
        <div style={{ flex: 1 }}>
          <h2 style={{ fontFamily: "'Plus Jakarta Sans', serif", fontSize: 22, color: '#13111E', margin: 0, lineHeight: 1.1 }}>Groups &amp; Combos</h2>
          <div style={{ fontSize: 12, color: '#4B5275', marginTop: 3 }}>
            Define <em style={{ color: '#7C6FE0' }}>AND subject bundles</em> (PCM/PCB) and{' '}
            <em style={{ color: '#D97706' }}>OR elective slots</em> (R1/R2/R3, PE/Art) for parallel scheduling.
          </div>
        </div>
      </div>

      {/* ── Tab bar ── */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 20, borderBottom: '2px solid #E8E4FF', paddingBottom: 0 }}>
        {([
          { key: 'and', label: 'AND Groups', icon: <Layers size={14} />, desc: 'Subject combinations — students split by bundle (PCM/PCB, Arts/Commerce)' },
          { key: 'or',  label: 'OR Groups',  icon: <Shuffle size={14} />, desc: 'Elective slots — students pick one subject from a list (R1/R2/R3, PE/Art)' },
        ] as const).map(tab => {
          const active = activeTab === tab.key
          return (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              title={tab.desc}
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

      {/* ══ TAB 1: AND Groups ══ */}
      {activeTab === 'and' && (
        <div>
          {/* Tab header bar */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#13111E', marginBottom: 2 }}>AND Groups</div>
              <div style={{ fontSize: 11, color: '#6B7280' }}>
                Each group defines mutually exclusive bundles — the sum of all bundle headcounts equals the section total.
              </div>
            </div>
            <button onClick={() => {
              const fresh = suggestAndComboGroups(subjects as any[], sections as any[])
              setDismissedSugs(new Set())
              if (fresh.length === 0) alert('No suggestions found — mark subjects as Elective in Resources → Subjects first.')
            }} style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              padding: '8px 14px', borderRadius: 8,
              border: '1.5px solid #FDE68A', background: '#FFFBEB',
              color: '#92400E', fontSize: 12, fontWeight: 700,
              cursor: 'pointer', fontFamily: 'inherit',
            }}>
              <Sparkles size={13} color="#D97706" /> AI Suggest
            </button>
            <button onClick={openNew} style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              padding: '8px 16px', borderRadius: 8,
              border: 'none', background: '#7C6FE0',
              color: '#fff', fontSize: 12, fontWeight: 700,
              cursor: 'pointer', fontFamily: 'inherit',
              boxShadow: '0 2px 8px rgba(124,111,224,0.35)',
            }}>
              <Plus size={13} /> New AND Group
            </button>
          </div>

          {/* AI Suggestions */}
          {suggestions.length > 0 && (
            <div style={{ marginBottom: 20 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
                <Sparkles size={12} color="#D97706" />
                <span style={{ fontSize: 11, fontWeight: 700, color: '#92400E', letterSpacing: '0.04em', textTransform: 'uppercase' }}>
                  AI Suggestions
                </span>
                <span style={{ fontSize: 10, color: '#B45309', background: '#FEF3C7', border: '1px solid #FDE68A', borderRadius: 8, padding: '1px 6px', fontWeight: 600 }}>
                  {suggestions.length}
                </span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {suggestions.map(sug => (
                  <div key={sug.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 12, padding: '12px 14px', borderRadius: 10, background: '#FFFBEB', border: '1px solid #FDE68A' }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 12, fontWeight: 700, color: '#92400E', marginBottom: 5 }}>
                        ⚡ {sug.name}
                      </div>
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                        {sug.bundles.map(b => (
                          <span key={b.id} style={{ fontSize: 11, fontWeight: 700, padding: '2px 9px', background: b.color ?? '#7C6FE0', color: '#fff', borderRadius: 4 }}>
                            {b.name}: {b.subjects.join('+')}
                          </span>
                        ))}
                      </div>
                      <div style={{ fontSize: 10, color: '#B45309', marginTop: 5 }}>
                        Applies to: {sug.applicableSections.slice(0, 4).join(', ')}{sug.applicableSections.length > 4 ? ` +${sug.applicableSections.length - 4} more` : ''}
                      </div>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                      <button onClick={() => useSuggestion(sug)} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '5px 12px', borderRadius: 6, border: 'none', background: '#D97706', color: '#fff', fontSize: 11, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
                        Use
                      </button>
                      <button onClick={() => setDismissedSugs(p => new Set([...p, sug.id]))} style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', padding: '4px 8px', borderRadius: 6, border: '1px solid #FDE68A', background: 'transparent', color: '#B45309', fontSize: 10, cursor: 'pointer', fontFamily: 'inherit' }}>
                        <X size={10} /> dismiss
                      </button>
                    </div>
                  </div>
                ))}
              </div>
              {(andComboGroups as AndComboGroup[]).length > 0 && (
                <div style={{ borderTop: '1px dashed #E4E0FF', margin: '16px 0 0' }} />
              )}
            </div>
          )}

          {/* AND Group Cards */}
          {(andComboGroups as AndComboGroup[]).length === 0 && suggestions.length === 0 ? (
            <div style={{ padding: '40px 20px', textAlign: 'center', background: '#FAFAFE', borderRadius: 12, border: '1.5px dashed #E4E0FF' }}>
              <Layers size={32} color="#C4B5FD" style={{ marginBottom: 12 }} />
              <div style={{ fontSize: 14, fontWeight: 700, color: '#8B87AD', marginBottom: 6 }}>No AND Groups yet</div>
              <div style={{ fontSize: 12, color: '#B8B4D4', marginBottom: 16, lineHeight: 1.6 }}>
                AND groups define subject bundles — e.g. PCM students take Physics+Chemistry+Maths, PCB students take Physics+Chemistry+Biology.<br />
                Mark subjects as <strong>Elective</strong> in Resources → Subjects, then click <strong>AI Suggest</strong> or <strong>New AND Group</strong>.
              </div>
              <button onClick={openNew} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '9px 20px', borderRadius: 8, border: 'none', background: '#7C6FE0', color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', boxShadow: '0 2px 8px rgba(124,111,224,0.3)' }}>
                <Plus size={14} /> New AND Group
              </button>
            </div>
          ) : (
            (andComboGroups as AndComboGroup[]).map((group: AndComboGroup) => (
              <AndGroupCard
                key={group.id}
                group={group}
                sections={sections as any[]}
                onUpdate={handleUpdateGroup}
                onDelete={() => handleDeleteGroup(group.id)}
                onEdit={() => openEdit(group)}
                onGenerateGroups={() => handleGenerateGroups(group.id)}
              />
            ))
          )}

          {/* Generate all button if any groups exist */}
          {(andComboGroups as AndComboGroup[]).length > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8, padding: '10px 14px', borderRadius: 8, background: '#F5F2FF', border: '1px solid #E8E4FF' }}>
              <Zap size={13} color="#7C6FE0" />
              <span style={{ fontSize: 11, color: '#7C6FE0', fontWeight: 600, flex: 1 }}>
                {(andComboGroups as AndComboGroup[]).reduce((t: number, g: AndComboGroup) => t + (g.generatedGroups?.length ?? 0), 0)} teaching groups generated across {(andComboGroups as AndComboGroup[]).length} AND group{(andComboGroups as AndComboGroup[]).length !== 1 ? 's' : ''}
              </span>
              <button onClick={() => {
                const updated = (andComboGroups as AndComboGroup[]).map((g: AndComboGroup) => ({ ...g, generatedGroups: generateAndGroups(g, rooms) }))
                setAndComboGroups(updated)
              }} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '6px 14px', borderRadius: 7, border: '1.5px solid #C4B5FD', background: '#fff', color: '#7C6FE0', fontSize: 11, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
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

      {/* ══ TAB 2: OR Groups ══ */}
      {activeTab === 'or' && (
        <div>
          {/* Explainer banner */}
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, padding: '14px 16px', marginBottom: 20, borderRadius: 10, background: '#FFFBEB', border: '1px solid #FDE68A' }}>
            <Shuffle size={18} color="#D97706" style={{ flexShrink: 0, marginTop: 2 }} />
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#92400E', marginBottom: 4 }}>
                OR / AND Subject Combos
              </div>
              <div style={{ fontSize: 12, color: '#78350F', lineHeight: 1.65 }}>
                <strong>OR combo</strong> — one of the listed subjects runs per slot. Whichever teacher is free takes that period
                (e.g. <em style={{ fontFamily: "'DM Mono', monospace" }}>PHY OR CHEM OR BIO</em>).<br />
                <strong>AND combo</strong> — all subjects share one slot in parallel — students divide into groups
                (e.g. <em style={{ fontFamily: "'DM Mono', monospace" }}>PHY AND CHEM AND BIO</em> = lab split).<br />
                Combos defined here become pre-set constraints for the timetable generator.
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

          {/* Navigation */}
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

      {/* AND Group Modal */}
      {modalOpen && (
        <AndGroupModal
          initial={editTarget}
          allSubjects={allSubjectNames}
          allSections={allSectionNames}
          onSave={handleSaveGroup}
          onClose={() => setModalOpen(false)}
        />
      )}

      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}
