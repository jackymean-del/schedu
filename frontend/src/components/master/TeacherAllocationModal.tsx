/**
 * TeacherAllocationModal — per-section split editor for one
 * (teacher, subject) cell.
 *
 * Shows every section where the subject is offered, with columns:
 *   Section · Target · Other teachers · This teacher · Available
 *
 * Editing the "This teacher" cell calls setTeacherAllocationCell so
 * the bidirectional sync handles totals + subjectAllocations
 * reflows automatically. The modal is just a sane editor surface.
 */

import { useMemo, useState, useEffect } from 'react'
import type { Section, Staff } from '@/types'
import { useTimetableStore } from '@/store/timetableStore'
import { parseAllocation } from '@/lib/allocationSyntax'
import { X, Users, BookOpen, Save, AlertTriangle, CheckCircle2, Trophy, ChevronsDown } from 'lucide-react'
import { explainAssignment } from '@/lib/explanationEngine'
import { ExplanationInfoIcon } from './ExplanationPopover'
import { CandidateComparisonModal } from './CandidateComparisonModal'

interface Props {
  teacher: string
  subject: string
  onClose: () => void
}

interface Row {
  section: string
  grade: string
  target: number               // total periods needed for (section, subject)
  otherTeachers: number        // periods already assigned to OTHER teachers
  thisTeacher: number          // periods assigned to THIS teacher (current draft value)
}

export function TeacherAllocationModal({ teacher, subject, onClose }: Props) {
  const store = useTimetableStore() as any
  const { sections, subjectAllocations, teacherAllocations } = store

  // Subject default periodsPerWeek for fallback
  const subjectsList = store.subjects ?? []
  const subjMeta = subjectsList.find((s: any) => s.name === subject)
  const defaultPw = subjMeta?.periodsPerWeek ?? 0

  // Build initial rows
  const buildRows = (): Row[] => {
    return (sections as Section[]).map(sec => {
      const cellStr = subjectAllocations[sec.name]?.[subject]
      const target = cellStr
        ? (parseAllocation(cellStr).weeklyTotal || 0)
        : defaultPw

      let other = 0
      Object.entries(teacherAllocations as any).forEach(([tName, tMap]: [string, any]) => {
        if (tName === teacher) return
        const p = tMap?.[sec.name]?.[subject] ?? 0
        if (typeof p === 'number') other += p
      })
      const thisT = teacherAllocations[teacher]?.[sec.name]?.[subject] ?? 0
      return {
        section: sec.name,
        grade: (sec as any).grade ?? '',
        target, otherTeachers: other, thisTeacher: thisT,
      }
    })
  }

  const [rows, setRows] = useState<Row[]>(() => buildRows())
  const [compareSection, setCompareSection] = useState<string | null>(null)
  // Reset rows if (teacher, subject) changes
  useEffect(() => { setRows(buildRows()) /* eslint-disable-next-line */ }, [teacher, subject])

  const totalThisTeacher = rows.reduce((a, r) => a + r.thisTeacher, 0)
  const hasUnsaved = useMemo(() => {
    return rows.some(r => {
      const stored = teacherAllocations[teacher]?.[r.section]?.[subject] ?? 0
      return stored !== r.thisTeacher
    })
  }, [rows, teacher, subject, teacherAllocations])

  // Group rows by grade — preserves insertion order of first occurrence
  const gradeGroups = useMemo(() => {
    const map = new Map<string, Row[]>()
    for (const r of rows) {
      const g = r.grade || ''
      if (!map.has(g)) map.set(g, [])
      map.get(g)!.push(r)
    }
    return map
  }, [rows])

  const handleChangeCell = (sectionName: string, value: number) => {
    setRows(prev => prev.map(r =>
      r.section === sectionName ? { ...r, thisTeacher: Math.max(0, Math.round(value || 0)) } : r
    ))
  }

  // Fill all sections of a grade with one value
  const handleFillGrade = (grade: string, value: number) => {
    const v = Math.max(0, Math.round(value || 0))
    setRows(prev => prev.map(r =>
      (r.grade || '') === grade ? { ...r, thisTeacher: v } : r
    ))
  }

  // Fill each section with its available capacity (target − otherTeachers) for a grade
  const handleFillGradeAvailable = (grade: string) => {
    setRows(prev => prev.map(r =>
      (r.grade || '') === grade
        ? { ...r, thisTeacher: Math.max(0, r.target - r.otherTeachers) }
        : r
    ))
  }

  const handleFillAll = () => {
    // Match each row's available capacity exactly (target − otherTeachers)
    setRows(prev => prev.map(r => ({
      ...r,
      thisTeacher: Math.max(0, r.target - r.otherTeachers),
    })))
  }

  const handleClearAll = () => {
    setRows(prev => prev.map(r => ({ ...r, thisTeacher: 0 })))
  }

  const handleSave = () => {
    // Commit each changed row via setTeacherAllocationCell (triggers sync)
    rows.forEach(r => {
      const current = teacherAllocations[teacher]?.[r.section]?.[subject] ?? 0
      if (current !== r.thisTeacher) {
        store.setTeacherAllocationCell?.(teacher, r.section, subject, r.thisTeacher)
      }
    })
    onClose()
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(19,17,30,0.6)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 9999, padding: 20, backdropFilter: 'blur(4px)',
    }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{
        background: '#fff', borderRadius: 16, width: '100%', maxWidth: 760,
        maxHeight: '92vh', display: 'flex', flexDirection: 'column' as const,
        boxShadow: '0 24px 60px rgba(19,17,30,0.35)',
        fontFamily: "'Hanken Grotesk', sans-serif",
      }}>

        {/* Header */}
        <div style={{
          padding: '16px 20px', borderBottom: '1px solid #ECEAFB',
          display: 'flex', alignItems: 'center', gap: 12,
          background: 'linear-gradient(135deg, #EDE9FF 0%, #FAFAFE 100%)',
          borderRadius: '16px 16px 0 0',
        }}>
          <div style={{
            width: 36, height: 36, borderRadius: 9, background: '#7C6FE0',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <Users size={16} color="#fff" />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 9, fontWeight: 800, letterSpacing: '0.18em', textTransform: 'uppercase' as const, color: '#7C6FE0' }}>
              Edit Allocation
            </div>
            <div style={{ fontSize: 16, fontWeight: 900, color: '#13111E', letterSpacing: '-0.3px', marginTop: 2 }}>
              {teacher}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 2 }}>
              <BookOpen size={11} color="#9B8EF5" />
              <span style={{ fontSize: 11, color: '#4B5275', fontWeight: 600 }}>{subject}</span>
            </div>
          </div>
          <button onClick={onClose} style={{
            background: 'none', border: 'none', cursor: 'pointer', padding: 6, color: '#8B87AD', display: 'flex',
          }}>
            <X size={18} />
          </button>
        </div>

        {/* Quick actions */}
        <div style={{
          padding: '10px 20px', display: 'flex', gap: 8, alignItems: 'center',
          borderBottom: '1px solid #F3F1FF',
        }}>
          <button onClick={handleFillAll} style={btnSubtle}>
            Fill all available
          </button>
          <button onClick={handleClearAll} style={btnSubtle}>
            Clear all
          </button>
          <div style={{ flex: 1 }} />
          <span style={{ fontSize: 11, color: '#4B5275' }}>
            Total: <strong style={{ color: '#13111E', fontFamily: "'DM Mono', monospace", fontSize: 13 }}>{totalThisTeacher}</strong> periods/week
          </span>
        </div>

        {/* Table */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '12px 20px' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr>
                <Th>Section</Th>
                <Th align="center">Target</Th>
                <Th align="center">Others</Th>
                <Th align="center">This teacher</Th>
                <Th align="center">Available</Th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && (
                <tr><td colSpan={5} style={{ padding: 24, textAlign: 'center', color: '#8B87AD' }}>No sections defined.</td></tr>
              )}
              {Array.from(gradeGroups.entries()).map(([grade, gradeRows]) => {
                // Grade-level aggregates
                const gradeTarget   = gradeRows.reduce((a, r) => a + r.target, 0)
                const gradeOthers   = gradeRows.reduce((a, r) => a + r.otherTeachers, 0)
                const gradeThis     = gradeRows.reduce((a, r) => a + r.thisTeacher, 0)
                const gradeAvail    = gradeTarget - gradeOthers

                // Batch input shows shared value when all sections agree, blank if mixed
                const allSame = gradeRows.every(r => r.thisTeacher === gradeRows[0].thisTeacher)
                const batchVal = allSame ? gradeRows[0].thisTeacher : null

                const gradeOver  = gradeOthers + gradeThis > gradeTarget && gradeTarget > 0
                const gradeMatch = gradeOthers + gradeThis === gradeTarget && gradeTarget > 0

                const showGradeHeader = grade !== '' || gradeGroups.size > 1

                return [
                  /* ── Grade header row ── */
                  showGradeHeader && (
                    <tr key={`grade-${grade}`} style={{ background: '#F5F2FF' }}>
                      <td style={{ padding: '6px 6px 6px 8px', fontWeight: 800, fontSize: 11,
                        color: '#4B3FCE', letterSpacing: '0.04em', textTransform: 'uppercase' as const }}>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                          <ChevronsDown size={12} color="#7C6FE0" />
                          {grade || 'Sections'}
                          <span style={{ fontWeight: 500, fontSize: 10, color: '#9B8EF5' }}>
                            ({gradeRows.length} section{gradeRows.length !== 1 ? 's' : ''})
                          </span>
                        </span>
                      </td>
                      {/* Grade target total */}
                      <td style={{ padding: '6px', textAlign: 'center', fontFamily: "'DM Mono', monospace",
                        fontSize: 11, color: '#4B5275', fontWeight: 700 }}>
                        {gradeTarget || '—'}
                      </td>
                      {/* Grade others total */}
                      <td style={{ padding: '6px', textAlign: 'center', fontFamily: "'DM Mono', monospace",
                        fontSize: 11, color: '#8B87AD' }}>
                        {gradeOthers || '—'}
                      </td>
                      {/* Grade batch input */}
                      <td style={{ padding: '4px 6px', textAlign: 'center' }}>
                        <input
                          type="number" min={0}
                          value={batchVal === null ? '' : batchVal === 0 ? '' : batchVal}
                          placeholder={batchVal === null ? 'mixed' : '0'}
                          title="Set this value for all sections in this grade"
                          onChange={e => handleFillGrade(grade, parseInt(e.target.value) || 0)}
                          onFocus={e => e.target.select()}
                          style={{
                            width: 64, padding: '4px 8px',
                            fontSize: 12, fontWeight: 700,
                            fontFamily: "'DM Mono', monospace",
                            color: '#4B3FCE', textAlign: 'right' as const,
                            border: `1.5px dashed ${gradeOver ? '#FECACA' : gradeMatch ? '#BBF7D0' : '#C4BAF5'}`,
                            background: gradeOver ? '#FEF2F2' : gradeMatch ? '#F0FDF4' : '#EDE9FF',
                            borderRadius: 6, outline: 'none',
                          }}
                        />
                      </td>
                      {/* Grade available / fill button */}
                      <td style={{ padding: '6px', textAlign: 'center' }}>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                          <span style={{
                            fontSize: 11, fontWeight: 700, fontFamily: "'DM Mono', monospace",
                            color: gradeOver ? '#DC2626' : gradeMatch ? '#16A34A' : '#8B87AD',
                            display: 'inline-flex', alignItems: 'center', gap: 3,
                          }}>
                            {gradeOver  && <AlertTriangle size={10} />}
                            {gradeMatch && <CheckCircle2 size={10} />}
                            {gradeAvail > 0 ? `+${gradeAvail - gradeThis}` : '0'}
                          </span>
                          {gradeTarget > 0 && (
                            <button
                              onClick={() => handleFillGradeAvailable(grade)}
                              title="Fill all sections with available capacity"
                              style={{
                                background: 'transparent', border: '1px solid #C4BAF5',
                                borderRadius: 5, padding: '2px 5px',
                                cursor: 'pointer', color: '#7C6FE0', fontSize: 9,
                                fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 2,
                              }}
                              onMouseEnter={e => (e.currentTarget as HTMLButtonElement).style.background = '#EDE9FF'}
                              onMouseLeave={e => (e.currentTarget as HTMLButtonElement).style.background = 'transparent'}
                            >
                              Fill
                            </button>
                          )}
                        </span>
                      </td>
                    </tr>
                  ),

                  /* ── Section rows for this grade ── */
                  ...gradeRows.map(r => {
                    const available = r.target - r.otherTeachers
                    const proposedTotal = r.otherTeachers + r.thisTeacher
                    const status = r.target === 0
                      ? 'unset'
                      : proposedTotal > r.target ? 'over'
                      : proposedTotal === r.target ? 'match'
                      : r.thisTeacher > 0 ? 'partial' : 'empty'

                    const teacherObj = (store.staff as Staff[]).find(s => s.name === teacher)
                    const sectionObj = sections.find((s: Section) => s.name === r.section)
                    const explanation = (teacherObj && sectionObj && subjMeta && r.thisTeacher > 0)
                      ? explainAssignment({
                          teacher: teacherObj,
                          section: sectionObj,
                          subject: subjMeta,
                          otherTeachersPeriods: r.otherTeachers,
                        })
                      : null

                    return (
                      <tr key={r.section} style={{ borderBottom: '1px solid #F3F1FF' }}>
                        <td style={{ padding: '8px 6px 8px 20px', fontSize: 12, fontWeight: 700, color: '#13111E' }}>
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                            {r.section}
                            {explanation && <ExplanationInfoIcon explanation={explanation} anchor="top-left" />}
                          </span>
                        </td>
                        <td style={{ padding: '8px 6px', textAlign: 'center', fontFamily: "'DM Mono', monospace", color: '#4B5275' }}>
                          {r.target || '—'}
                        </td>
                        <td style={{ padding: '8px 6px', textAlign: 'center', fontFamily: "'DM Mono', monospace", color: '#8B87AD' }}>
                          {r.otherTeachers || '—'}
                        </td>
                        <td style={{ padding: '4px 6px', textAlign: 'center' }}>
                          <input
                            type="number" min={0}
                            value={r.thisTeacher === 0 ? '' : r.thisTeacher}
                            placeholder="0"
                            onChange={e => handleChangeCell(r.section, parseInt(e.target.value) || 0)}
                            onFocus={e => e.target.select()}
                            style={{
                              width: 64, padding: '5px 8px',
                              fontSize: 13, fontWeight: 700,
                              fontFamily: "'DM Mono', monospace",
                              color: '#13111E', textAlign: 'right' as const,
                              border: `1px solid ${status === 'over' ? '#FECACA' : status === 'match' ? '#BBF7D0' : '#ECEAFB'}`,
                              background: status === 'over' ? '#FEF2F2' : status === 'match' ? '#F0FDF4' : '#fff',
                              borderRadius: 6, outline: 'none',
                            }}
                          />
                        </td>
                        <td style={{ padding: '8px 6px', textAlign: 'center' }}>
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                            <span style={{
                              display: 'inline-flex', alignItems: 'center', gap: 4,
                              fontSize: 11, fontWeight: 700, fontFamily: "'DM Mono', monospace",
                              color: status === 'over' ? '#DC2626'
                                : status === 'match' ? '#16A34A'
                                : status === 'partial' ? '#D4920E'
                                : '#8B87AD',
                            }}>
                              {status === 'over'    && <AlertTriangle size={11} />}
                              {status === 'match'   && <CheckCircle2 size={11} />}
                              {available > 0 ? `+${available - r.thisTeacher}` : `0`}
                            </span>
                            {r.target > 0 && (
                              <button
                                onClick={() => setCompareSection(r.section)}
                                title="Compare candidates for this section"
                                style={{
                                  background: 'transparent', border: '1px solid #ECEAFB',
                                  borderRadius: 5, padding: '2px 5px',
                                  cursor: 'pointer', color: '#7C6FE0',
                                  display: 'inline-flex', alignItems: 'center',
                                }}
                                onMouseEnter={e => (e.currentTarget as HTMLButtonElement).style.background = '#F5F2FF'}
                                onMouseLeave={e => (e.currentTarget as HTMLButtonElement).style.background = 'transparent'}
                              >
                                <Trophy size={10} />
                              </button>
                            )}
                          </span>
                        </td>
                      </tr>
                    )
                  }),
                ]
              })}
            </tbody>
          </table>
        </div>

        {/* Footer */}
        <div style={{
          padding: '12px 20px', borderTop: '1px solid #ECEAFB',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10,
        }}>
          <div style={{ fontSize: 11, color: '#8B87AD' }}>
            {hasUnsaved
              ? <span style={{ color: '#D4920E', fontWeight: 700 }}>Unsaved changes</span>
              : 'No changes'}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={onClose} style={btnGhost}>Cancel</button>
            <button onClick={handleSave} disabled={!hasUnsaved} style={{ ...btnPri, opacity: hasUnsaved ? 1 : 0.5, cursor: hasUnsaved ? 'pointer' : 'not-allowed' }}>
              <Save size={12} /> Save
            </button>
          </div>
        </div>

      </div>

      {/* Compare candidates modal — opens on Trophy button click */}
      {compareSection && (() => {
        const sec = sections.find((s: Section) => s.name === compareSection)
        if (!sec || !subjMeta) return null
        return (
          <CandidateComparisonModal
            section={sec}
            subject={subjMeta}
            onClose={() => setCompareSection(null)}
            onAssigned={() => setRows(buildRows())}
          />
        )
      })()}
    </div>
  )
}

// ─── sub-components ───
function Th({ children, align = 'left' }: { children: React.ReactNode; align?: 'left' | 'center' | 'right' }) {
  return (
    <th style={{
      padding: '8px 6px', textAlign: align as any,
      fontSize: 9, fontWeight: 800, letterSpacing: '0.1em',
      textTransform: 'uppercase' as const, color: '#4B5275',
      background: '#F8F7FF', borderBottom: '1px solid #ECEAFB',
    }}>{children}</th>
  )
}

const btnPri: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 6,
  padding: '8px 14px', borderRadius: 8, border: 'none',
  background: '#7C6FE0', color: '#fff', fontSize: 12, fontWeight: 700,
  fontFamily: 'inherit',
}
const btnGhost: React.CSSProperties = {
  padding: '7px 12px', borderRadius: 7, border: '1px solid #ECEAFB',
  background: '#fff', color: '#4B5275', fontSize: 11.5, fontWeight: 600, cursor: 'pointer',
  fontFamily: 'inherit',
}
const btnSubtle: React.CSSProperties = {
  padding: '5px 10px', borderRadius: 6,
  border: '1px solid #ECEAFB', background: '#FAFAFE',
  color: '#7C6FE0', fontSize: 10.5, fontWeight: 700, cursor: 'pointer',
  fontFamily: 'inherit',
}
