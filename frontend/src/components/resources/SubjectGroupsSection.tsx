/**
 * SubjectGroupsSection — OR / AND (Parallel Split) subject-combo configurator
 *
 * OR  → "PHY OR CHEM OR BIO"  — ONE subject per slot (rotation / teacher-availability)
 * AND → "PHY AND CHEM AND BIO" — all subjects in parallel, same slot, students split into groups
 *       (NOT the same as Student Groups — see inline note)
 */

import { useState, useMemo } from 'react'
import { Plus, Trash2, Pencil, X, Check, ChevronDown, ChevronUp, Info } from 'lucide-react'

// ── Types ─────────────────────────────────────────────────────────────────────
export interface SubjectAndOrGroup {
  id:      string
  name?:   string
  logic:   'AND' | 'OR'
  subjects: string[]
  sections?: string[]      // empty → applies to all sections
  periodsPerWeek?: number
}

// ── Palette ───────────────────────────────────────────────────────────────────
const OR_BG   = '#FFFBEB'; const OR_BDR  = '#FDE68A'; const OR_TEXT  = '#92400E'; const OR_TAG  = '#D97706'
const AND_BG  = '#EDE9FF'; const AND_BDR = '#C4B5FD'; const AND_TEXT = '#3730A3'; const AND_TAG = '#7C6FE0'

function makeId() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 6) }

// ── Group pill display ────────────────────────────────────────────────────────
export function GroupDisplay({ group }: { group: SubjectAndOrGroup }) {
  const { logic, subjects } = group
  const bg = logic === 'OR' ? OR_BG : AND_BG; const bdr = logic === 'OR' ? OR_BDR : AND_BDR
  const text = logic === 'OR' ? OR_TEXT : AND_TEXT; const tag = logic === 'OR' ? OR_TAG : AND_TAG
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, background: bg, border: `1px solid ${bdr}`, borderRadius: 6, padding: '2px 8px' }}>
      <span style={{ fontSize: 9, fontWeight: 800, letterSpacing: '0.06em', background: tag, color: '#fff', borderRadius: 3, padding: '0 4px 1px', flexShrink: 0 }}>{logic}</span>
      <span style={{ fontSize: 11.5, fontWeight: 700, color: text, letterSpacing: '-0.01em' }}>{subjects.join(` ${logic} `)}</span>
    </span>
  )
}

// ── Modal ─────────────────────────────────────────────────────────────────────
function GroupModal({
  initial, allSubjects, allSections, subjectSectionsMap, onSave, onClose,
}: {
  initial?: SubjectAndOrGroup | null
  allSubjects: string[]
  allSections: string[]
  subjectSectionsMap?: Record<string, string[]>
  onSave: (g: SubjectAndOrGroup) => void
  onClose: () => void
}) {
  const [logic,    setLogic]    = useState<'AND' | 'OR'>(initial?.logic ?? 'OR')
  const [name,     setName]     = useState(initial?.name ?? '')
  const [selected, setSelected] = useState<string[]>(initial?.subjects ?? [])
  const [sections, setSections] = useState<string[]>(initial?.sections ?? [])
  const [ppw,      setPpw]      = useState(String(initial?.periodsPerWeek ?? ''))
  const [subQ,     setSubQ]     = useState('')
  const [secQ,     setSecQ]     = useState('')

  // Subjects not yet selected, filtered by search query
  const filteredSubs = useMemo(() =>
    allSubjects.filter(s => s.toLowerCase().includes(subQ.toLowerCase()) && !selected.includes(s)),
    [allSubjects, subQ, selected])

  // Sections relevant to the currently selected subjects
  // Union: any section that has at least one selected subject assigned to it
  const relevantSections = useMemo(() => {
    if (!subjectSectionsMap || selected.length === 0) return allSections
    const relevant = new Set<string>()
    for (const sub of selected) {
      const secs = subjectSectionsMap[sub] ?? []
      secs.forEach(s => relevant.add(s))
    }
    // If no mapping found for any subject, fall back to all sections
    return relevant.size > 0
      ? allSections.filter(s => relevant.has(s))
      : allSections
  }, [subjectSectionsMap, selected, allSections])

  // Sections after search filter, excluding already-selected (shown as chips)
  const filteredSecs = useMemo(() =>
    relevantSections.filter(s =>
      s.toLowerCase().includes(secQ.toLowerCase()) && !sections.includes(s)
    ),
    [relevantSections, secQ, sections])

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
        background: 'rgba(0,0,0,0.42)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
        fontFamily: "'Inter', sans-serif",
      }}
    >
      <div style={{
        background: '#fff', borderRadius: 14, width: '100%', maxWidth: 520,
        maxHeight: '92vh', overflowY: 'auto',
        boxShadow: '0 20px 60px rgba(0,0,0,0.22)',
        padding: '22px 22px 18px',
      }}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
          <h3 style={{ margin: 0, fontSize: 15, fontWeight: 800, color: '#13111E' }}>
            {initial ? 'Edit Subject Combo' : 'New Subject Combo'}
          </h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9CA3AF', padding: 4 }}>
            <X size={16} />
          </button>
        </div>

        {/* ── Logic type ── */}
        <div style={{ marginBottom: 18 }}>
          <label style={{ fontSize: 11, fontWeight: 700, color: '#6B7280', display: 'block', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            Logic type
          </label>
          <div style={{ display: 'flex', gap: 8 }}>
            {/* OR button */}
            {(() => {
              const active = logic === 'OR'
              return (
                <button onClick={() => setLogic('OR')} style={{
                  flex: 1, padding: '10px 8px', borderRadius: 9, cursor: 'pointer', fontFamily: 'inherit',
                  border: `2px solid ${active ? OR_TAG : OR_BDR}`,
                  background: active ? OR_TAG : '#FFFBEB',
                  color: active ? '#fff' : OR_TEXT,
                  transition: 'all 0.15s', textAlign: 'center',
                }}>
                  <div style={{ fontSize: 14, fontWeight: 900, letterSpacing: '0.04em' }}>OR</div>
                  <div style={{ fontSize: 10, fontWeight: 500, marginTop: 3, lineHeight: 1.4, opacity: 0.9 }}>
                    Rotation — one subject<br />runs per slot
                  </div>
                </button>
              )
            })()}
            {/* AND / Parallel Split button */}
            {(() => {
              const active = logic === 'AND'
              return (
                <button onClick={() => setLogic('AND')} style={{
                  flex: 1, padding: '10px 8px', borderRadius: 9, cursor: 'pointer', fontFamily: 'inherit',
                  border: `2px solid ${active ? AND_TAG : AND_BDR}`,
                  background: active ? AND_TAG : '#EDE9FF',
                  color: active ? '#fff' : AND_TEXT,
                  transition: 'all 0.15s', textAlign: 'center',
                }}>
                  <div style={{ fontSize: 14, fontWeight: 900, letterSpacing: '0.04em' }}>AND</div>
                  <div style={{ fontSize: 10, fontWeight: 500, marginTop: 3, lineHeight: 1.4, opacity: 0.9 }}>
                    Parallel split — students<br />divide into groups
                  </div>
                </button>
              )
            })()}
          </div>

          {/* AND disclaimer — distinguish from Student Groups */}
          {logic === 'AND' && (
            <div style={{
              display: 'flex', gap: 8, marginTop: 10, padding: '9px 12px',
              background: '#F0F9FF', border: '1px solid #BAE6FD', borderRadius: 8,
            }}>
              <Info size={13} color="#0284C7" style={{ flexShrink: 0, marginTop: 1 }} />
              <div style={{ fontSize: 11, color: '#0C4A6E', lineHeight: 1.55 }}>
                <strong>Different from Student Groups:</strong> Student Groups combine students from{' '}
                <em>different class-sections</em> for the <em>same subject</em>. A Parallel Split
                divides <em>one class-section</em> into groups — each studying a <em>different subject</em>{' '}
                in the same period slot (e.g. Physics lab + Chemistry lab running simultaneously).
              </div>
            </div>
          )}
        </div>

        {/* ── Group name (optional) ── */}
        <div style={{ marginBottom: 14 }}>
          <label style={{ fontSize: 11, fontWeight: 700, color: '#6B7280', display: 'block', marginBottom: 5, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            Combo name <span style={{ color: '#C4C0DC', fontWeight: 400 }}>(optional)</span>
          </label>
          <input
            value={name} onChange={e => setName(e.target.value)}
            placeholder={logic === 'OR' ? 'e.g. "Science Rotation"' : 'e.g. "Lab Split Block"'}
            style={{
              width: '100%', boxSizing: 'border-box', padding: '7px 10px', borderRadius: 7,
              border: '1.5px solid #E4E0FF', fontSize: 13, outline: 'none',
              fontFamily: 'inherit', color: '#13111E', background: '#FAFAFE',
            }}
          />
        </div>

        {/* ── Subject picker ── */}
        <div style={{ marginBottom: 16 }}>
          <label style={{ fontSize: 11, fontWeight: 700, color: '#6B7280', display: 'block', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            Subjects <span style={{ color: '#EF4444' }}>*</span>
            <span style={{ color: '#C4C0DC', fontWeight: 400, marginLeft: 4 }}>select 2+</span>
          </label>

          {/* Selected subject chips */}
          {selected.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginBottom: 8 }}>
              {selected.map(s => (
                <span key={s} style={{
                  display: 'inline-flex', alignItems: 'center', gap: 4,
                  background: logic === 'OR' ? OR_BG : AND_BG,
                  border: `1.5px solid ${logic === 'OR' ? OR_BDR : AND_BDR}`,
                  color: logic === 'OR' ? OR_TEXT : AND_TEXT,
                  borderRadius: 5, padding: '3px 8px', fontSize: 12, fontWeight: 700,
                }}>
                  {s}
                  <button onClick={() => toggleSub(s)} style={{
                    background: 'none', border: 'none', cursor: 'pointer',
                    color: 'inherit', padding: 0, lineHeight: 1, fontSize: 13, opacity: 0.6,
                  }}>✕</button>
                </span>
              ))}
            </div>
          )}

          {/* Preview pill */}
          {selected.length >= 2 && (
            <div style={{ marginBottom: 8 }}>
              <GroupDisplay group={{ id: '', logic, subjects: selected }} />
            </div>
          )}

          {/* Search input */}
          <input
            value={subQ} onChange={e => setSubQ(e.target.value)}
            placeholder="Search subjects to add…"
            style={{
              width: '100%', boxSizing: 'border-box', padding: '7px 10px', borderRadius: 7,
              border: '1.5px solid #E4E0FF', fontSize: 12, outline: 'none',
              fontFamily: 'inherit', background: '#FAFAFE',
            }}
          />

          {/* Subject dropdown */}
          {filteredSubs.length > 0 && (
            <div style={{
              marginTop: 4, border: '1px solid #E4E0FF', borderRadius: 7,
              maxHeight: 150, overflowY: 'auto', background: '#fff',
              boxShadow: '0 4px 12px rgba(0,0,0,0.06)',
            }}>
              {filteredSubs.map(s => (
                <button key={s} onClick={() => { toggleSub(s); setSubQ('') }} style={{
                  display: 'block', width: '100%', textAlign: 'left', padding: '8px 12px',
                  border: 'none', background: 'none', fontSize: 12.5, cursor: 'pointer',
                  fontFamily: 'inherit', color: '#374151',
                }}
                  onMouseEnter={e => (e.currentTarget.style.background = '#F5F3FF')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'none')}
                >
                  + {s}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* ── Slots / week ── */}
        <div style={{ marginBottom: 16 }}>
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

        {/* ── Applies to sections ── */}
        {allSections.length > 0 && (
          <div style={{ marginBottom: 18 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
              <label style={{ fontSize: 11, fontWeight: 700, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                Applies to sections
                <span style={{ color: '#C4C0DC', fontWeight: 400, marginLeft: 5 }}>
                  {sections.length === 0 ? '— all sections' : `(${sections.length} selected)`}
                </span>
              </label>
              {sections.length > 0 && (
                <button onClick={() => setSections([])} style={{
                  fontSize: 10, color: '#9CA3AF', background: 'none', border: 'none',
                  cursor: 'pointer', fontFamily: 'inherit', padding: '0 2px',
                }}>
                  Clear all
                </button>
              )}
            </div>

            {/* Selected section chips — always visible at top */}
            {sections.length > 0 && (
              <div style={{
                display: 'flex', flexWrap: 'wrap', gap: 5, marginBottom: 8,
                padding: '8px 10px', borderRadius: 8,
                background: '#EDE9FF', border: '1px solid #C4B5FD',
              }}>
                {sections.map(s => (
                  <span key={s} style={{
                    display: 'inline-flex', alignItems: 'center', gap: 4,
                    background: '#fff', border: '1.5px solid #7C6FE0', borderRadius: 5,
                    padding: '2px 7px', fontSize: 11, fontWeight: 700, color: '#4C1D95',
                  }}>
                    {s}
                    <button onClick={() => toggleSec(s)} style={{
                      background: 'none', border: 'none', cursor: 'pointer',
                      color: '#7C6FE0', padding: 0, lineHeight: 1, fontSize: 12, opacity: 0.7,
                    }}>✕</button>
                  </span>
                ))}
              </div>
            )}

            {/* Subject-filtered section hint */}
            {subjectSectionsMap && selected.length > 0 && relevantSections.length < allSections.length && (
              <div style={{
                fontSize: 10, color: '#6B7280', marginBottom: 5,
                display: 'flex', alignItems: 'center', gap: 4,
              }}>
                <Info size={10} />
                Showing {relevantSections.length} of {allSections.length} sections relevant to selected subjects
              </div>
            )}

            {/* Search */}
            <input
              value={secQ} onChange={e => setSecQ(e.target.value)}
              placeholder="Search sections…"
              style={{
                width: '100%', boxSizing: 'border-box', padding: '6px 10px', borderRadius: 7,
                border: '1.5px solid #E4E0FF', fontSize: 12, outline: 'none',
                fontFamily: 'inherit', background: '#FAFAFE', marginBottom: 6,
              }}
            />

            {/* Unselected section chips to pick from */}
            {filteredSecs.length > 0 ? (
              <div style={{
                display: 'flex', flexWrap: 'wrap', gap: 4,
                maxHeight: 90, overflowY: 'auto',
                padding: '6px 8px', borderRadius: 7,
                background: '#F9FAFB', border: '1px solid #E4E0FF',
              }}>
                {filteredSecs.map(s => (
                  <button key={s} onClick={() => toggleSec(s)} style={{
                    padding: '3px 9px', borderRadius: 5, fontSize: 11, fontWeight: 600,
                    border: '1.5px solid #E4E0FF',
                    background: '#fff', color: '#6B7280',
                    cursor: 'pointer', fontFamily: 'inherit',
                    transition: 'all 0.1s',
                  }}
                    onMouseEnter={e => {
                      e.currentTarget.style.background = '#EDE9FF'
                      e.currentTarget.style.borderColor = '#7C6FE0'
                      e.currentTarget.style.color = '#4C1D95'
                    }}
                    onMouseLeave={e => {
                      e.currentTarget.style.background = '#fff'
                      e.currentTarget.style.borderColor = '#E4E0FF'
                      e.currentTarget.style.color = '#6B7280'
                    }}
                  >
                    + {s}
                  </button>
                ))}
              </div>
            ) : (
              <div style={{ fontSize: 11, color: '#C4C0DC', padding: '6px 0', fontStyle: 'italic' }}>
                {sections.length > 0 ? 'All relevant sections selected.' : 'No sections match your search.'}
              </div>
            )}

            {sections.length === 0 && (
              <div style={{ fontSize: 10, color: '#9CA3AF', marginTop: 5 }}>
                Tip: leaving all unselected means this combo applies to every section.
              </div>
            )}
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
                id:  initial?.id ?? makeId(),
                name: name.trim() || undefined,
                logic,
                subjects: selected,
                sections: sections.length ? sections : undefined,
                periodsPerWeek: ppw ? parseInt(ppw) : undefined,
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
              boxShadow: canSave ? '0 2px 8px rgba(124,111,224,0.3)' : 'none',
              transition: 'all 0.15s',
            }}
          >
            <Check size={13} /> {initial ? 'Save changes' : 'Add combo'}
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
  subjectSectionsMap,
  defaultOpen = false,
}: {
  groups: SubjectAndOrGroup[]
  setGroups: (g: SubjectAndOrGroup[]) => void
  allSubjectNames: string[]
  allSectionNames: string[]
  /** subject name → applicable section names (used to filter the section picker) */
  subjectSectionsMap?: Record<string, string[]>
  /** Start the collapsible panel open (default false; set true when used as primary content) */
  defaultOpen?: boolean
}) {
  const [open,       setOpen]       = useState(defaultOpen)
  const [editTarget, setEditTarget] = useState<SubjectAndOrGroup | null>(null)
  const [modalOpen,  setModalOpen]  = useState(false)

  const openNew  = () => { setEditTarget(null); setModalOpen(true) }
  const openEdit = (g: SubjectAndOrGroup) => { setEditTarget(g); setModalOpen(true) }

  const handleSave = (g: SubjectAndOrGroup) => {
    setGroups(
      editTarget
        ? groups.map(x => x.id === g.id ? g : x)
        : [...groups, g]
    )
    setModalOpen(false)
  }

  const remove = (id: string) => setGroups(groups.filter(g => g.id !== id))

  return (
    <>
      <div style={{
        margin: '10px 0 0',
        border: '1px solid #EAE6FF', borderRadius: 8,
        background: open ? '#FAFAFE' : '#fff',
        overflow: 'hidden',
      }}>
        {/* Collapsible header */}
        <button
          onClick={() => setOpen(p => !p)}
          style={{
            width: '100%', display: 'flex', alignItems: 'center', gap: 8,
            padding: '10px 14px', background: 'none', border: 'none',
            cursor: 'pointer', fontFamily: 'inherit',
          }}
        >
          <span style={{ fontSize: 12, fontWeight: 700, color: '#374151', flex: 1, textAlign: 'left' }}>
            Subject OR / AND Combos
          </span>
          {groups.length > 0 && (
            <span style={{
              fontSize: 10, fontWeight: 700, padding: '1px 7px 2px', borderRadius: 10,
              background: '#EDE9FF', color: '#7C6FE0',
            }}>{groups.length}</span>
          )}
          {open ? <ChevronUp size={13} color="#9CA3AF" /> : <ChevronDown size={13} color="#9CA3AF" />}
        </button>

        {open && (
          <div style={{ padding: '0 14px 14px', borderTop: '1px solid #F3F4F6' }}>
            {/* Legend */}
            <div style={{ display: 'flex', gap: 10, margin: '10px 0 12px', flexWrap: 'wrap' }}>
              <span style={{
                display: 'inline-flex', alignItems: 'center', gap: 5,
                fontSize: 11, color: OR_TEXT, background: OR_BG,
                border: `1px solid ${OR_BDR}`, borderRadius: 6, padding: '3px 9px',
              }}>
                <span style={{ fontSize: 8, fontWeight: 900, background: OR_TAG, color: '#fff', borderRadius: 2, padding: '0 3px' }}>OR</span>
                <strong>Rotation</strong> — one subject per slot
              </span>
              <span style={{
                display: 'inline-flex', alignItems: 'center', gap: 5,
                fontSize: 11, color: AND_TEXT, background: AND_BG,
                border: `1px solid ${AND_BDR}`, borderRadius: 6, padding: '3px 9px',
              }}>
                <span style={{ fontSize: 8, fontWeight: 900, background: AND_TAG, color: '#fff', borderRadius: 2, padding: '0 3px' }}>AND</span>
                <strong>Parallel split</strong> — same slot, students divide
              </span>
            </div>

            {/* Existing combos */}
            {groups.length === 0 ? (
              <p style={{ fontSize: 12, color: '#C4C0DC', margin: '0 0 12px', fontStyle: 'italic' }}>
                No combos yet — add one below.
              </p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 12 }}>
                {groups.map(g => (
                  <div key={g.id} style={{
                    display: 'flex', alignItems: 'center', gap: 8,
                    padding: '7px 10px', borderRadius: 8,
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
                          {g.periodsPerWeek ? `${g.periodsPerWeek} slots/wk` : ''}
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

            <button onClick={openNew} style={{
              display: 'inline-flex', alignItems: 'center', gap: 5,
              padding: '7px 16px', borderRadius: 7,
              border: '1.5px dashed #C4B5FD', background: '#F5F3FF',
              color: '#7C6FE0', fontSize: 12, fontWeight: 700,
              cursor: 'pointer', fontFamily: 'inherit',
            }}
              onMouseEnter={e => (e.currentTarget.style.background = '#EDE9FF')}
              onMouseLeave={e => (e.currentTarget.style.background = '#F5F3FF')}
            >
              <Plus size={12} /> New Combo
            </button>
          </div>
        )}
      </div>

      {/* Modal */}
      {modalOpen && (
        <GroupModal
          initial={editTarget}
          allSubjects={allSubjectNames}
          allSections={allSectionNames}
          subjectSectionsMap={subjectSectionsMap}
          onSave={handleSave}
          onClose={() => setModalOpen(false)}
        />
      )}
    </>
  )
}
