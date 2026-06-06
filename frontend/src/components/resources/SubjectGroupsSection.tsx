/**
 * SubjectGroupsSection — AND / OR subject-group configurator
 *
 * Lets users declare that certain subjects share a single period slot:
 *   OR  → "PHY OR CHEM OR BIO"  — ONE of them runs per slot (rotation / teacher-availability)
 *   AND → "PHY AND CHEM AND BIO" — ALL run in parallel in the same slot (lab splits, etc.)
 *
 * Groups are stored in the Zustand store (`subjectGroups`) and passed to the
 * timetable engine as scheduling constraints.
 */

import { useState, useMemo, useRef, useEffect } from 'react'
import { Plus, Trash2, Pencil, X, Check, ChevronDown, ChevronUp } from 'lucide-react'

// ── Types ─────────────────────────────────────────────────────────────────────
export interface SubjectAndOrGroup {
  id:      string
  name?:   string          // optional human label
  logic:   'AND' | 'OR'
  subjects: string[]       // subject display names
  sections?: string[]      // if empty → applies to all sections
  periodsPerWeek?: number  // slots/week for this group slot
}

// ── Colours ───────────────────────────────────────────────────────────────────
const OR_BG    = '#FFFBEB'
const OR_BDR   = '#FDE68A'
const OR_TEXT  = '#92400E'
const OR_TAG   = '#D97706'
const AND_BG   = '#EDE9FF'
const AND_BDR  = '#C4B5FD'
const AND_TEXT = '#3730A3'
const AND_TAG  = '#7C6FE0'

function makeId() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 6) }

// ── Group "pill" display ──────────────────────────────────────────────────────
export function GroupDisplay({ group }: { group: SubjectAndOrGroup }) {
  const { logic, subjects } = group
  const bg    = logic === 'OR' ? OR_BG   : AND_BG
  const bdr   = logic === 'OR' ? OR_BDR  : AND_BDR
  const text  = logic === 'OR' ? OR_TEXT : AND_TEXT
  const tag   = logic === 'OR' ? OR_TAG  : AND_TAG

  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      background: bg, border: `1px solid ${bdr}`, borderRadius: 6,
      padding: '2px 8px',
    }}>
      <span style={{
        fontSize: 9, fontWeight: 800, letterSpacing: '0.06em',
        background: tag, color: '#fff', borderRadius: 3,
        padding: '0 4px 1px', flexShrink: 0,
      }}>{logic}</span>
      <span style={{ fontSize: 11.5, fontWeight: 700, color: text, letterSpacing: '-0.01em' }}>
        {subjects.join(` ${logic} `)}
      </span>
    </span>
  )
}

// ── Group Edit Modal ───────────────────────────────────────────────────────────
function GroupModal({
  initial, allSubjects, allSections, onSave, onClose,
}: {
  initial?: SubjectAndOrGroup | null
  allSubjects: string[]
  allSections: string[]
  onSave: (g: SubjectAndOrGroup) => void
  onClose: () => void
}) {
  const [logic,    setLogic]    = useState<'AND'|'OR'>(initial?.logic    ?? 'OR')
  const [name,     setName]     = useState(initial?.name ?? '')
  const [selected, setSelected] = useState<string[]>(initial?.subjects ?? [])
  const [sections, setSections] = useState<string[]>(initial?.sections  ?? [])
  const [ppw,      setPpw]      = useState(String(initial?.periodsPerWeek ?? ''))
  const [subQ,     setSubQ]     = useState('')
  const [secQ,     setSecQ]     = useState('')

  const filteredSubs = useMemo(() =>
    allSubjects.filter(s => s.toLowerCase().includes(subQ.toLowerCase()) && !selected.includes(s)),
    [allSubjects, subQ, selected])

  const filteredSecs = useMemo(() =>
    allSections.filter(s => s.toLowerCase().includes(secQ.toLowerCase())),
    [allSections, secQ])

  const toggleSub = (s: string) =>
    setSelected(p => p.includes(s) ? p.filter(x => x !== s) : [...p, s])
  const toggleSec = (s: string) =>
    setSections(p => p.includes(s) ? p.filter(x => x !== s) : [...p, s])

  const canSave = selected.length >= 2

  return (
    <div
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
      style={{
        position: 'fixed', inset: 0, zIndex: 2000,
        background: 'rgba(0,0,0,0.4)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
        fontFamily: "'Inter', sans-serif",
      }}
    >
      <div style={{
        background: '#fff', borderRadius: 14, width: '100%', maxWidth: 500,
        maxHeight: '92vh', overflowY: 'auto',
        boxShadow: '0 20px 60px rgba(0,0,0,0.2)',
        padding: '24px 24px 20px',
      }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
          <h3 style={{ margin: 0, fontSize: 15, fontWeight: 800, color: '#13111E' }}>
            {initial ? 'Edit Subject Group' : 'New Subject Group'}
          </h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9CA3AF', padding: 4 }}>
            <X size={16} />
          </button>
        </div>

        {/* AND / OR toggle */}
        <div style={{ marginBottom: 16 }}>
          <label style={{ fontSize: 11, fontWeight: 700, color: '#6B7280', display: 'block', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            Logic type
          </label>
          <div style={{ display: 'flex', gap: 8 }}>
            {(['OR','AND'] as const).map(l => {
              const active = logic === l
              const bg   = l === 'OR'  ? (active ? OR_TAG  : '#F9FAFB') : (active ? AND_TAG : '#F9FAFB')
              const text = l === 'OR'  ? (active ? '#fff'  : OR_TEXT)  : (active ? '#fff'   : AND_TEXT)
              const bdr  = l === 'OR'  ? OR_BDR  : AND_BDR
              return (
                <button key={l} onClick={() => setLogic(l)} style={{
                  flex: 1, padding: '8px 0', borderRadius: 8,
                  border: `2px solid ${active ? bg : bdr}`,
                  background: active ? bg : '#F9FAFB',
                  color: text, fontSize: 13, fontWeight: 800,
                  cursor: 'pointer', fontFamily: 'inherit', transition: 'all 0.15s',
                }}>
                  {l}
                  <div style={{ fontSize: 10, fontWeight: 400, marginTop: 2, opacity: 0.8 }}>
                    {l === 'OR'
                      ? 'One subject per slot (rotation)'
                      : 'All subjects in parallel (same slot)'}
                  </div>
                </button>
              )
            })}
          </div>
        </div>

        {/* Optional name */}
        <div style={{ marginBottom: 14 }}>
          <label style={{ fontSize: 11, fontWeight: 700, color: '#6B7280', display: 'block', marginBottom: 5, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            Group name <span style={{ color: '#C4C0DC', fontWeight: 400 }}>(optional)</span>
          </label>
          <input
            value={name} onChange={e => setName(e.target.value)}
            placeholder={`e.g. "Science Rotation" or "Lab Block"`}
            style={{
              width: '100%', boxSizing: 'border-box', padding: '7px 10px', borderRadius: 7,
              border: '1.5px solid #E4E0FF', fontSize: 13, outline: 'none',
              fontFamily: 'inherit', color: '#13111E', background: '#FAFAFE',
            }}
          />
        </div>

        {/* Subject picker */}
        <div style={{ marginBottom: 14 }}>
          <label style={{ fontSize: 11, fontWeight: 700, color: '#6B7280', display: 'block', marginBottom: 5, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            Subjects <span style={{ color: '#EF4444' }}>*</span>
            <span style={{ color: '#C4C0DC', fontWeight: 400, marginLeft: 4 }}>select 2+</span>
          </label>
          {/* Selected chips */}
          {selected.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginBottom: 7 }}>
              {selected.map(s => (
                <span key={s} style={{
                  display: 'inline-flex', alignItems: 'center', gap: 4,
                  background: logic === 'OR' ? OR_BG : AND_BG,
                  border: `1px solid ${logic === 'OR' ? OR_BDR : AND_BDR}`,
                  color: logic === 'OR' ? OR_TEXT : AND_TEXT,
                  borderRadius: 5, padding: '2px 7px', fontSize: 11.5, fontWeight: 700,
                }}>
                  {s}
                  <button onClick={() => toggleSub(s)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'inherit', padding: 0, lineHeight: 1, fontSize: 12, opacity: 0.7 }}>✕</button>
                </span>
              ))}
            </div>
          )}
          {/* Preview label */}
          {selected.length >= 2 && (
            <div style={{ marginBottom: 7 }}>
              <GroupDisplay group={{ id: '', logic, subjects: selected }} />
            </div>
          )}
          {/* Search + dropdown */}
          <input
            value={subQ} onChange={e => setSubQ(e.target.value)}
            placeholder="Search subjects to add…"
            style={{
              width: '100%', boxSizing: 'border-box', padding: '6px 10px', borderRadius: 7,
              border: '1.5px solid #E4E0FF', fontSize: 12, outline: 'none',
              fontFamily: 'inherit', background: '#FAFAFE',
            }}
          />
          {filteredSubs.length > 0 && (
            <div style={{
              marginTop: 4, border: '1px solid #E4E0FF', borderRadius: 7,
              maxHeight: 140, overflowY: 'auto', background: '#fff',
            }}>
              {filteredSubs.map(s => (
                <button key={s} onClick={() => { toggleSub(s); setSubQ('') }} style={{
                  display: 'block', width: '100%', textAlign: 'left', padding: '7px 10px',
                  border: 'none', background: 'none', fontSize: 12, cursor: 'pointer',
                  fontFamily: 'inherit', color: '#374151',
                }}
                  onMouseEnter={e => (e.currentTarget.style.background = '#F5F3FF')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'none')}
                >
                  {s}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Periods per week */}
        <div style={{ marginBottom: 14 }}>
          <label style={{ fontSize: 11, fontWeight: 700, color: '#6B7280', display: 'block', marginBottom: 5, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            Slots / week <span style={{ color: '#C4C0DC', fontWeight: 400 }}>(optional)</span>
          </label>
          <input
            type="number" min={1} value={ppw} onChange={e => setPpw(e.target.value)}
            placeholder="e.g. 2"
            style={{
              width: 80, padding: '6px 10px', borderRadius: 7,
              border: '1.5px solid #E4E0FF', fontSize: 13, outline: 'none',
              fontFamily: 'inherit', textAlign: 'center',
            }}
          />
        </div>

        {/* Section applicability */}
        {allSections.length > 0 && (
          <div style={{ marginBottom: 18 }}>
            <label style={{ fontSize: 11, fontWeight: 700, color: '#6B7280', display: 'block', marginBottom: 5, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              Applies to sections
              <span style={{ color: '#C4C0DC', fontWeight: 400, marginLeft: 4 }}>
                {sections.length === 0 ? '— all sections' : `(${sections.length} selected)`}
              </span>
            </label>
            <input
              value={secQ} onChange={e => setSecQ(e.target.value)}
              placeholder="Search sections…"
              style={{
                width: '100%', boxSizing: 'border-box', padding: '6px 10px', borderRadius: 7,
                border: '1.5px solid #E4E0FF', fontSize: 12, outline: 'none',
                fontFamily: 'inherit', background: '#FAFAFE', marginBottom: 5,
              }}
            />
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, maxHeight: 80, overflowY: 'auto' }}>
              {filteredSecs.map(s => {
                const on = sections.includes(s)
                return (
                  <button key={s} onClick={() => toggleSec(s)} style={{
                    padding: '2px 8px', borderRadius: 5, fontSize: 11, fontWeight: 700,
                    border: `1.5px solid ${on ? '#7C6FE0' : '#E4E0FF'}`,
                    background: on ? '#EDE9FF' : '#F9FAFB',
                    color: on ? '#4C1D95' : '#6B7280',
                    cursor: 'pointer', fontFamily: 'inherit',
                  }}>
                    {s}
                  </button>
                )
              })}
            </div>
          </div>
        )}

        {/* Footer */}
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', paddingTop: 12, borderTop: '1px solid #F3F4F6' }}>
          <button onClick={onClose} style={{
            padding: '8px 18px', borderRadius: 7, border: '1.5px solid #D1D5DB',
            background: '#fff', fontSize: 13, fontWeight: 600, color: '#374151',
            cursor: 'pointer', fontFamily: 'inherit',
          }}>Cancel</button>
          <button
            disabled={!canSave}
            onClick={() => {
              if (!canSave) return
              onSave({
                id:      initial?.id ?? makeId(),
                name:    name.trim() || undefined,
                logic,
                subjects: selected,
                sections: sections.length ? sections : undefined,
                periodsPerWeek: ppw ? parseInt(ppw) : undefined,
              })
            }}
            style={{
              padding: '8px 20px', borderRadius: 7, border: 'none',
              background: canSave ? '#7C6FE0' : '#E5E7EB',
              color: canSave ? '#fff' : '#9CA3AF', fontSize: 13, fontWeight: 700,
              cursor: canSave ? 'pointer' : 'default', fontFamily: 'inherit',
              display: 'inline-flex', alignItems: 'center', gap: 6,
              boxShadow: canSave ? '0 2px 8px rgba(124,111,224,0.3)' : 'none',
              transition: 'all 0.15s',
            }}
          >
            <Check size={13} /> {initial ? 'Save changes' : 'Add group'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Main exported section ─────────────────────────────────────────────────────
export function SubjectGroupsSection({
  groups,
  setGroups,
  allSubjectNames,
  allSectionNames,
}: {
  groups: SubjectAndOrGroup[]
  setGroups: (g: SubjectAndOrGroup[]) => void
  allSubjectNames: string[]
  allSectionNames: string[]
}) {
  const [open,        setOpen]        = useState(false)
  const [editTarget,  setEditTarget]  = useState<SubjectAndOrGroup | null | 'new'>('new' as any)
  const [modalOpen,   setModalOpen]   = useState(false)

  const openNew  = () => { setEditTarget(null); setModalOpen(true) }
  const openEdit = (g: SubjectAndOrGroup) => { setEditTarget(g); setModalOpen(true) }

  const handleSave = (g: SubjectAndOrGroup) => {
    setGroups(
      editTarget && (editTarget as any).id
        ? groups.map(x => x.id === g.id ? g : x)
        : [...groups, g]
    )
    setModalOpen(false)
  }

  const remove = (id: string) => setGroups(groups.filter(g => g.id !== id))

  return (
    <>
      {/* Toggle header */}
      <div style={{
        margin: '10px 0 0',
        border: '1px solid #EAE6FF', borderRadius: 8,
        background: open ? '#FAFAFE' : '#fff',
        overflow: 'hidden',
      }}>
        <button
          onClick={() => setOpen(p => !p)}
          style={{
            width: '100%', display: 'flex', alignItems: 'center', gap: 8,
            padding: '8px 12px', background: 'none', border: 'none',
            cursor: 'pointer', fontFamily: 'inherit',
          }}
        >
          <span style={{ fontSize: 12, fontWeight: 700, color: '#374151', flex: 1, textAlign: 'left' }}>
            Subject AND / OR Groups
          </span>
          {groups.length > 0 && (
            <span style={{
              fontSize: 10, fontWeight: 700, padding: '1px 6px 2px', borderRadius: 10,
              background: '#EDE9FF', color: '#7C6FE0',
            }}>{groups.length}</span>
          )}
          {open ? <ChevronUp size={13} color="#9CA3AF" /> : <ChevronDown size={13} color="#9CA3AF" />}
        </button>

        {open && (
          <div style={{ padding: '0 12px 12px', borderTop: '1px solid #F3F4F6' }}>
            {/* Explainer */}
            <p style={{ fontSize: 11.5, color: '#6B7280', margin: '8px 0 10px', lineHeight: 1.5 }}>
              <strong style={{ color: '#374151' }}>OR</strong> — one subject per slot (teacher picks based on availability).<br />
              <strong style={{ color: '#374151' }}>AND</strong> — all subjects run in parallel in the same slot (class splits / lab rotation).
            </p>

            {/* Existing groups */}
            {groups.length === 0 ? (
              <p style={{ fontSize: 11.5, color: '#C4C0DC', margin: '0 0 10px', fontStyle: 'italic' }}>
                No groups yet. Add one below.
              </p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 10 }}>
                {groups.map(g => (
                  <div key={g.id} style={{
                    display: 'flex', alignItems: 'center', gap: 8,
                    padding: '6px 10px', borderRadius: 7,
                    background: g.logic === 'OR' ? OR_BG : AND_BG,
                    border: `1px solid ${g.logic === 'OR' ? OR_BDR : AND_BDR}`,
                  }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      {g.name && (
                        <div style={{ fontSize: 10, fontWeight: 700, color: '#9CA3AF', marginBottom: 2, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                          {g.name}
                        </div>
                      )}
                      <GroupDisplay group={g} />
                      {(g.sections?.length || g.periodsPerWeek) ? (
                        <div style={{ fontSize: 10, color: '#9CA3AF', marginTop: 3 }}>
                          {g.periodsPerWeek ? `${g.periodsPerWeek} slots/week` : ''}
                          {g.periodsPerWeek && g.sections?.length ? ' · ' : ''}
                          {g.sections?.length ? g.sections.join(', ') : ''}
                        </div>
                      ) : null}
                    </div>
                    <button onClick={() => openEdit(g)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9CA3AF', padding: 3 }} title="Edit">
                      <Pencil size={12} />
                    </button>
                    <button onClick={() => remove(g.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#EF4444', padding: 3 }} title="Remove">
                      <Trash2 size={12} />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* Add button */}
            <button onClick={openNew} style={{
              display: 'inline-flex', alignItems: 'center', gap: 5,
              padding: '6px 14px', borderRadius: 7,
              border: '1.5px dashed #C4B5FD', background: '#F5F3FF',
              color: '#7C6FE0', fontSize: 12, fontWeight: 700,
              cursor: 'pointer', fontFamily: 'inherit',
            }}>
              <Plus size={12} /> New Group
            </button>
          </div>
        )}
      </div>

      {/* Modal */}
      {modalOpen && (
        <GroupModal
          initial={editTarget && (editTarget as any).id ? editTarget as SubjectAndOrGroup : null}
          allSubjects={allSubjectNames}
          allSections={allSectionNames}
          onSave={handleSave}
          onClose={() => setModalOpen(false)}
        />
      )}
    </>
  )
}
