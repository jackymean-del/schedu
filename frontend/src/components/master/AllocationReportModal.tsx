/**
 * AllocationReportModal — Printable A4 allocation reports.
 *
 * Period tab opens:  Class-wise | Subject-wise
 * Teacher tab opens: Class-wise | Subject-wise | Teacher-wise
 *
 * Print button calls window.print() with @media print styles
 * that hide everything except the report content.
 */

import { useState, useMemo } from 'react'
import { useTimetableStore } from '@/store/timetableStore'
import type { Section, Subject, Staff } from '@/types'
import { parseAllocation } from '@/lib/allocationSyntax'
import { X, Printer, ChevronUp, ChevronDown, ArrowUpDown } from 'lucide-react'

interface Props {
  mode: 'periods' | 'teachers'
  onClose: () => void
  displayMode?: 'periods' | 'hours'
  periodMinutes?: number
}

type ReportTab = 'class' | 'subject' | 'teacher'

function toHourMin(periods: number, periodMinutes: number): string {
  const totalMins = Math.round(periods * periodMinutes)
  const h = Math.floor(totalMins / 60)
  const m = totalMins % 60
  if (h === 0) return `${m}m`
  if (m === 0) return `${h}h`
  return `${h}h${m}m`
}

function fmtPeriods(p: number, displayMode: 'periods' | 'hours', periodMinutes: number) {
  if (p === 0) return '—'
  return displayMode === 'hours' ? toHourMin(p, periodMinutes) : String(p)
}

function useSortable<T>(data: T[], defaultField: keyof T | string) {
  const [sortField, setSortField] = useState<string>(String(defaultField))
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')
  const toggle = (field: string) => {
    if (sortField === field) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortField(field); setSortDir('asc') }
  }
  const sorted = useMemo(() => {
    return [...data].sort((a: any, b: any) => {
      const av = a[sortField]
      const bv = b[sortField]
      const an = parseFloat(String(av ?? ''))
      const bn = parseFloat(String(bv ?? ''))
      const cmp = (!isNaN(an) && !isNaN(bn))
        ? an - bn
        : String(av ?? '').localeCompare(String(bv ?? ''), undefined, { numeric: true, sensitivity: 'base' })
      return sortDir === 'asc' ? cmp : -cmp
    })
  }, [data, sortField, sortDir])
  return { sorted, sortField, sortDir, toggle }
}

function SortTh({
  label, field, sortField, sortDir, onToggle, align = 'left',
}: { label: string; field: string; sortField: string; sortDir: 'asc' | 'desc'; onToggle: (f: string) => void; align?: 'left' | 'right' | 'center' }) {
  const active = sortField === field
  return (
    <th
      onClick={() => onToggle(field)}
      style={{
        ...thStyle, textAlign: align as any, cursor: 'pointer', userSelect: 'none',
        color: active ? '#5B4EC0' : '#555', whiteSpace: 'nowrap',
      }}
    >
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
        {label}
        {active
          ? (sortDir === 'asc' ? <ChevronUp size={10} /> : <ChevronDown size={10} />)
          : <ArrowUpDown size={9} style={{ opacity: 0.3 }} />
        }
      </span>
    </th>
  )
}

const thStyle: React.CSSProperties = {
  padding: '8px 10px', background: '#F2F2F5', fontWeight: 700,
  fontSize: 11, borderBottom: '2px solid #E2E2E7',
  position: 'sticky', top: 0,
}
const tdStyle: React.CSSProperties = {
  padding: '7px 10px', fontSize: 12, borderBottom: '1px solid #F0EDFF',
}
const tdNum: React.CSSProperties = {
  ...tdStyle, textAlign: 'right', fontFamily: "'DM Mono', monospace", fontWeight: 600,
}

export function AllocationReportModal({ mode, onClose, displayMode = 'periods', periodMinutes = 40 }: Props) {
  const store = useTimetableStore() as any
  const { sections, subjects, subjectAllocations, teacherAllocations, staff } = store

  const tabs: ReportTab[] = mode === 'teachers' ? ['class', 'subject', 'teacher'] : ['class', 'subject']
  const [activeTab, setActiveTab] = useState<ReportTab>('class')

  // ── Class-wise data ──
  const classRows = useMemo(() => (sections as Section[]).map((sec: Section) => {
    const row: Record<string, any> = { section: sec.name }
    let total = 0
    ;(subjects as Subject[]).forEach((sub: Subject) => {
      const raw = subjectAllocations[sec.name]?.[sub.name]
      const p = raw ? parseAllocation(raw).weeklyTotal : 0
      row[sub.name] = p
      total += p
    })
    row['__total'] = total
    return row
  }), [sections, subjects, subjectAllocations])

  const { sorted: sortedClassRows, sortField: cSortField, sortDir: cSortDir, toggle: cToggle } = useSortable(classRows, 'section')

  // ── Subject-wise data ──
  const subjectRows = useMemo(() => (subjects as Subject[]).map((sub: Subject) => {
    let total = 0
    let sectionCount = 0
    const perSection: Record<string, number> = {}
    ;(sections as Section[]).forEach((sec: Section) => {
      const raw = subjectAllocations[sec.name]?.[sub.name]
      const p = raw ? parseAllocation(raw).weeklyTotal : 0
      perSection[sec.name] = p
      if (p > 0) { total += p; sectionCount++ }
    })
    return { subject: sub.name, shortName: sub.shortName ?? sub.name, total, sectionCount, periodsPerWeek: sub.periodsPerWeek ?? 0, perSection }
  }), [sections, subjects, subjectAllocations])

  const { sorted: sortedSubjectRows, sortField: sSortField, sortDir: sSortDir, toggle: sToggle } = useSortable(subjectRows, 'subject')

  // ── Teacher-wise data ──
  const teacherRows = useMemo(() => (staff as Staff[]).map((t: Staff) => {
    const tMap = teacherAllocations[t.name] ?? {}
    let total = 0
    const subjectCount = new Set<string>()
    const sectionCount = new Set<string>()
    Object.entries(tMap).forEach(([sec, sMap]: [string, any]) => {
      Object.entries(sMap ?? {}).forEach(([sub, p]: [string, any]) => {
        if (typeof p === 'number' && p > 0) {
          total += p
          subjectCount.add(sub)
          sectionCount.add(sec)
        }
      })
    })
    const max = (t as any).maxPeriodsPerWeek ?? 40
    return {
      teacher: t.name,
      total,
      max,
      subjects: subjectCount.size,
      sections: sectionCount.size,
      utilisation: max > 0 ? Math.round((total / max) * 100) : 0,
      assignments: Object.entries(tMap).flatMap(([sec, sMap]: [string, any]) =>
        Object.entries(sMap ?? {})
          .filter(([, p]: [string, any]) => typeof p === 'number' && p > 0)
          .map(([sub, p]: [string, any]) => ({ sec, sub, p: p as number }))
      ),
    }
  }), [staff, teacherAllocations])

  const { sorted: sortedTeacherRows, sortField: tSortField, sortDir: tSortDir, toggle: tToggle } = useSortable(teacherRows, 'teacher')

  const title = mode === 'teachers' ? 'Teacher Allocation Report' : 'Period Allocation Report'

  return (
    <>
      {/* Print styles — injected inline so they work with any bundler */}
      <style>{`
        @media print {
          body > * { display: none !important; }
          .print-report-overlay { display: block !important; position: static !important; background: white !important; }
          .print-report-overlay .no-print { display: none !important; }
          .print-report-overlay .print-content { box-shadow: none !important; max-height: none !important; overflow: visible !important; }
          @page { size: A4; margin: 15mm; }
        }
      `}</style>

      {/* Overlay */}
      <div className="print-report-overlay" style={{
        position: 'fixed', inset: 0, zIndex: 1000,
        background: 'rgba(19,17,30,0.55)', backdropFilter: 'blur(3px)',
        display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
        padding: '24px 16px', overflowY: 'auto',
      }}>
        <div className="print-content" style={{
          background: '#fff', borderRadius: 16, width: '100%', maxWidth: 960,
          boxShadow: '0 20px 60px rgba(0,0,0,0.25)',
          maxHeight: 'calc(100vh - 48px)', overflow: 'auto',
        }}>
          {/* Modal header */}
          <div className="no-print" style={{
            display: 'flex', alignItems: 'center', gap: 12, padding: '16px 20px',
            borderBottom: '1px solid #E8E4FF', position: 'sticky', top: 0,
            background: '#fff', zIndex: 2,
          }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 16, fontWeight: 800, color: '#13111E' }}>{title}</div>
              <div style={{ fontSize: 11, color: '#8B87AD', marginTop: 2 }}>
                {displayMode === 'hours' ? `Hours (1 period = ${periodMinutes} min)` : 'Periods per week'} · Click column headers to sort
              </div>
            </div>
            <button onClick={() => window.print()}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                padding: '8px 16px', borderRadius: 8, border: 'none',
                background: '#7C6FE0', color: '#fff', fontSize: 12, fontWeight: 700,
                cursor: 'pointer', fontFamily: 'inherit',
              }}>
              <Printer size={14} /> Download / Print A4
            </button>
            <button onClick={onClose}
              style={{ display: 'inline-flex', padding: 8, borderRadius: 8, border: 'none', background: '#F0EDFF', cursor: 'pointer', color: '#7C6FE0' }}>
              <X size={16} />
            </button>
          </div>

          {/* Report-type tabs */}
          <div className="no-print" style={{ display: 'flex', borderBottom: '2px solid #F0EDFF', padding: '0 20px' }}>
            {tabs.map(tab => (
              <button key={tab} onClick={() => setActiveTab(tab)}
                style={{
                  padding: '10px 18px', border: 'none', cursor: 'pointer', background: 'transparent',
                  fontSize: 12, fontWeight: activeTab === tab ? 800 : 600,
                  color: activeTab === tab ? '#7C6FE0' : '#4B5275', fontFamily: 'inherit',
                  borderBottom: activeTab === tab ? '2px solid #7C6FE0' : '2px solid transparent',
                  marginBottom: -2,
                }}>
                {tab === 'class' ? 'Class-wise' : tab === 'subject' ? 'Subject-wise' : 'Teacher-wise'}
              </button>
            ))}
          </div>

          {/* Report body */}
          <div style={{ padding: '20px' }}>
            {/* Print title (shows on printed page only) */}
            <div style={{ marginBottom: 16 }}>
              <h2 style={{ fontSize: 20, fontWeight: 800, color: '#13111E', margin: '0 0 2px' }}>{title}</h2>
              <div style={{ fontSize: 11, color: '#8B87AD' }}>
                {activeTab === 'class' ? 'Class-wise allocation' : activeTab === 'subject' ? 'Subject-wise allocation' : 'Teacher-wise allocation'} ·{' '}
                {displayMode === 'hours' ? `Hours (1p = ${periodMinutes} min)` : 'Periods per week'} ·{' '}
                Generated {new Date().toLocaleDateString()}
              </div>
            </div>

            {/* Class-wise report */}
            {activeTab === 'class' && (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 600 }}>
                  <thead>
                    <tr>
                      <SortTh label="Section" field="section" sortField={cSortField} sortDir={cSortDir} onToggle={cToggle} />
                      {(subjects as Subject[]).map((sub: Subject) => (
                        <SortTh key={sub.name} label={sub.shortName ?? sub.name} field={sub.name}
                          sortField={cSortField} sortDir={cSortDir} onToggle={cToggle} align="right" />
                      ))}
                      <SortTh label="Total" field="__total" sortField={cSortField} sortDir={cSortDir} onToggle={cToggle} align="right" />
                    </tr>
                  </thead>
                  <tbody>
                    {sortedClassRows.map((row: any, i: number) => (
                      <tr key={row.section} style={{ background: i % 2 === 0 ? '#fff' : '#FAFAFE' }}>
                        <td style={{ ...tdStyle, fontWeight: 700, color: '#13111E' }}>{row.section}</td>
                        {(subjects as Subject[]).map((sub: Subject) => {
                          const p = row[sub.name] ?? 0
                          return (
                            <td key={sub.name} style={{
                              ...tdNum,
                              color: p === 0 ? '#D1D5DB' : '#13111E',
                            }}>
                              {fmtPeriods(p, displayMode, periodMinutes)}
                            </td>
                          )
                        })}
                        <td style={{ ...tdNum, fontWeight: 800, color: '#7C6FE0', borderLeft: '2px solid #E8E4FF' }}>
                          {fmtPeriods(row.__total, displayMode, periodMinutes)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  {/* Totals footer */}
                  <tfoot>
                    <tr style={{ background: '#F8F7FF', borderTop: '2px solid #E8E4FF' }}>
                      <td style={{ ...tdStyle, fontWeight: 800, fontSize: 11, color: '#8B87AD', textTransform: 'uppercase' }}>Total</td>
                      {(subjects as Subject[]).map((sub: Subject) => {
                        const total = sortedClassRows.reduce((acc: number, r: any) => acc + (r[sub.name] ?? 0), 0)
                        return (
                          <td key={sub.name} style={{ ...tdNum, fontWeight: 800, color: '#13111E' }}>
                            {fmtPeriods(total, displayMode, periodMinutes)}
                          </td>
                        )
                      })}
                      <td style={{ ...tdNum, fontWeight: 800, color: '#7C6FE0', borderLeft: '2px solid #E8E4FF' }}>
                        {fmtPeriods(sortedClassRows.reduce((a: number, r: any) => a + (r.__total ?? 0), 0), displayMode, periodMinutes)}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}

            {/* Subject-wise report */}
            {activeTab === 'subject' && (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ borderCollapse: 'collapse', width: '100%' }}>
                  <thead>
                    <tr>
                      <SortTh label="Subject" field="subject" sortField={sSortField} sortDir={sSortDir} onToggle={sToggle} />
                      <SortTh label="Default/wk" field="periodsPerWeek" sortField={sSortField} sortDir={sSortDir} onToggle={sToggle} align="right" />
                      <SortTh label="Sections" field="sectionCount" sortField={sSortField} sortDir={sSortDir} onToggle={sToggle} align="right" />
                      <SortTh label="Total periods" field="total" sortField={sSortField} sortDir={sSortDir} onToggle={sToggle} align="right" />
                      <th style={{ ...thStyle, textAlign: 'left' }}>Per-section breakdown</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sortedSubjectRows.map((row: any, i: number) => {
                      const activeSections = Object.entries(row.perSection)
                        .filter(([, p]) => (p as number) > 0)
                        .sort(([, a], [, b]) => (b as number) - (a as number))
                      return (
                        <tr key={row.subject} style={{ background: i % 2 === 0 ? '#fff' : '#FAFAFE' }}>
                          <td style={{ ...tdStyle, fontWeight: 700, color: '#13111E' }}>{row.subject}</td>
                          <td style={{ ...tdNum, color: '#8B87AD' }}>{fmtPeriods(row.periodsPerWeek, displayMode, periodMinutes)}</td>
                          <td style={{ ...tdNum }}>{row.sectionCount}</td>
                          <td style={{ ...tdNum, fontWeight: 800, color: '#7C6FE0' }}>
                            {fmtPeriods(row.total, displayMode, periodMinutes)}
                          </td>
                          <td style={{ ...tdStyle, fontSize: 11, color: '#4B5275' }}>
                            {activeSections.length === 0 ? (
                              <span style={{ color: '#D1D5DB' }}>—</span>
                            ) : (
                              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                                {activeSections.map(([sec, p]) => (
                                  <span key={sec} style={{
                                    padding: '1px 6px', borderRadius: 8, fontSize: 10,
                                    background: '#EDE9FF', color: '#5B4EC0', fontWeight: 600,
                                  }}>
                                    {sec} ({fmtPeriods(p as number, displayMode, periodMinutes)})
                                  </span>
                                ))}
                              </div>
                            )}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {/* Teacher-wise report (teachers mode only) */}
            {activeTab === 'teacher' && (
              <div>
                {/* Summary table */}
                <div style={{ overflowX: 'auto', marginBottom: 24 }}>
                  <table style={{ borderCollapse: 'collapse', width: '100%' }}>
                    <thead>
                      <tr>
                        <SortTh label="Teacher" field="teacher" sortField={tSortField} sortDir={tSortDir} onToggle={tToggle} />
                        <SortTh label="Assigned" field="total" sortField={tSortField} sortDir={tSortDir} onToggle={tToggle} align="right" />
                        <SortTh label="Max" field="max" sortField={tSortField} sortDir={tSortDir} onToggle={tToggle} align="right" />
                        <SortTh label="Utilisation" field="utilisation" sortField={tSortField} sortDir={tSortDir} onToggle={tToggle} align="right" />
                        <SortTh label="Subjects" field="subjects" sortField={tSortField} sortDir={tSortDir} onToggle={tToggle} align="right" />
                        <SortTh label="Classes" field="sections" sortField={tSortField} sortDir={tSortDir} onToggle={tToggle} align="right" />
                        <th style={{ ...thStyle, textAlign: 'left' }}>Assignment Detail</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sortedTeacherRows.map((row: any, i: number) => {
                        const isOver = row.total > row.max && row.max > 0
                        // Group assignments by subject
                        const bySubject: Record<string, { secs: string[]; total: number }> = {}
                        row.assignments.forEach(({ sec, sub, p }: any) => {
                          if (!bySubject[sub]) bySubject[sub] = { secs: [], total: 0 }
                          bySubject[sub].secs.push(sec)
                          bySubject[sub].total += p
                        })
                        return (
                          <tr key={row.teacher} style={{ background: isOver ? '#FEF2F2' : i % 2 === 0 ? '#fff' : '#FAFAFE' }}>
                            <td style={{ ...tdStyle, fontWeight: 700, color: '#13111E' }}>
                              {row.teacher}
                              {isOver && <span style={{ marginLeft: 6, fontSize: 9, background: '#FEE2E2', color: '#991B1B', padding: '1px 5px', borderRadius: 4, fontWeight: 800 }}>OVER</span>}
                            </td>
                            <td style={{ ...tdNum, color: isOver ? '#DC2626' : '#13111E', fontWeight: 800 }}>
                              {fmtPeriods(row.total, displayMode, periodMinutes)}
                            </td>
                            <td style={{ ...tdNum, color: '#8B87AD' }}>{fmtPeriods(row.max, displayMode, periodMinutes)}</td>
                            <td style={{ ...tdNum, color: isOver ? '#DC2626' : row.utilisation >= 85 ? '#15803D' : '#4B5275' }}>
                              {row.max > 0 ? `${row.utilisation}%` : '—'}
                            </td>
                            <td style={{ ...tdNum }}>{row.subjects}</td>
                            <td style={{ ...tdNum }}>{row.sections}</td>
                            <td style={{ ...tdStyle, fontSize: 11 }}>
                              {Object.entries(bySubject).length === 0 ? (
                                <span style={{ color: '#D1D5DB' }}>Unassigned</span>
                              ) : (
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                                  {Object.entries(bySubject).map(([sub, { secs, total }]) => (
                                    <span key={sub} style={{
                                      padding: '2px 7px', borderRadius: 8, fontSize: 10,
                                      background: '#EDE9FF', color: '#5B4EC0',
                                      border: '1px solid #D8D2FF', fontWeight: 600,
                                    }}>
                                      {sub} ({secs.slice(0, 3).join(', ')}{secs.length > 3 ? ` +${secs.length - 3}` : ''} · {fmtPeriods(total, displayMode, periodMinutes)})
                                    </span>
                                  ))}
                                </div>
                              )}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                    <tfoot>
                      <tr style={{ background: '#F8F7FF', borderTop: '2px solid #E8E4FF' }}>
                        <td style={{ ...tdStyle, fontWeight: 800, fontSize: 11, color: '#8B87AD', textTransform: 'uppercase' }}>Total</td>
                        <td style={{ ...tdNum, fontWeight: 800, color: '#7C6FE0' }}>
                          {fmtPeriods(sortedTeacherRows.reduce((a: number, r: any) => a + r.total, 0), displayMode, periodMinutes)}
                        </td>
                        <td style={{ ...tdNum, color: '#8B87AD' }}>
                          {fmtPeriods(sortedTeacherRows.reduce((a: number, r: any) => a + r.max, 0), displayMode, periodMinutes)}
                        </td>
                        <td colSpan={4} />
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  )
}
