/**
 * PublishExportPanel — modal for exporting / publishing a generated timetable.
 *
 * Four export shapes:
 *   1. Class timetables  (XLSX)  — one sheet per section, periods × days grid
 *   2. Teacher timetables (XLSX) — one sheet per teacher, periods × days grid
 *   3. Master data        (CSV)  — flat row-per-assignment interchange format
 *   4. Print / PDF        (HTML) — opens new tab, auto-triggers browser print
 *
 * Options
 *   • Show teacher name in cell
 *   • Show room in cell
 *
 * SheetJS (xlsx) is imported dynamically so it is not in the critical bundle.
 * No other external deps beyond lucide-react and the timetableExport helpers.
 */

import { useState, useCallback } from 'react'
import {
  X, Download, FileSpreadsheet, FileText, Printer,
  Users2, CheckCircle2, Loader2, ChevronDown, ChevronRight,
  ToggleLeft, ToggleRight,
} from 'lucide-react'
import {
  type ExportOptions,
  buildClassSheet,
  buildTeacherSheet,
  buildFlatSheet,
  buildPrintHTML,
} from '@/lib/timetableExport'
import { useTimetableStore } from '@/store/timetableStore'
import { markActiveTimetablePublished } from '@/lib/ttRegistry'

// ─── Props ────────────────────────────────────────────────

interface Props {
  onClose: () => void
  exportOptions: Omit<ExportOptions, 'showTeacher' | 'showRoom'>
}

// ─── Export format descriptors ───────────────────────────

type FormatId = 'class-xlsx' | 'teacher-xlsx' | 'master-csv' | 'print'

interface Format {
  id: FormatId
  icon: React.ReactNode
  label: string
  sublabel: string
  accent: string
  bg: string
  border: string
}

const FORMATS: Format[] = [
  {
    id: 'class-xlsx',
    icon: <FileSpreadsheet size={20} />,
    label: 'Class Timetables',
    sublabel: 'One sheet per section · XLSX',
    accent: '#16A34A',
    bg: '#F0FDF4',
    border: '#BBF7D0',
  },
  {
    id: 'teacher-xlsx',
    icon: <Users2 size={20} />,
    label: 'Teacher Timetables',
    sublabel: 'One sheet per teacher · XLSX',
    accent: '#7C6FE0',
    bg: '#F5F3FF',
    border: '#DDD6FE',
  },
  {
    id: 'master-csv',
    icon: <FileText size={20} />,
    label: 'Master Data',
    sublabel: 'All assignments · CSV',
    accent: '#0EA5E9',
    bg: '#F0F9FF',
    border: '#BAE6FD',
  },
  {
    id: 'print',
    icon: <Printer size={20} />,
    label: 'Print / PDF',
    sublabel: 'Opens in new tab · auto-print',
    accent: '#D4920E',
    bg: '#FFFBEB',
    border: '#FDE68A',
  },
]

// ─── Component ────────────────────────────────────────────

export function PublishExportPanel({ onClose, exportOptions }: Props) {
  const [selected, setSelected] = useState<Set<FormatId>>(
    new Set(['class-xlsx', 'print']),
  )
  const [showTeacher, setShowTeacher] = useState(true)
  const [showRoom, setShowRoom]       = useState(false)
  const [exporting, setExporting]     = useState(false)
  const [done, setDone]               = useState<FormatId[]>([])
  const [error, setError]             = useState<string | null>(null)
  const [advOpen, setAdvOpen]         = useState(false)

  const toggle = (id: FormatId) =>
    setSelected(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })

  const buildOpts = useCallback((): ExportOptions => ({
    ...exportOptions,
    showTeacher,
    showRoom,
  }), [exportOptions, showTeacher, showRoom])

  const handleExport = useCallback(async () => {
    if (selected.size === 0) return
    setExporting(true)
    setDone([])
    setError(null)

    try {
      const opts = buildOpts()
      const completed: FormatId[] = []

      // ── XLSX exports (class + teacher may share one workbook or separate) ──
      const needsXlsx = selected.has('class-xlsx') || selected.has('teacher-xlsx')
      if (needsXlsx) {
        // Dynamic import to keep SheetJS out of initial bundle
        const XLSX = await import('xlsx').catch(() => null)
        if (!XLSX) throw new Error('SheetJS (xlsx) is not installed. Run: npm i xlsx')

        // ── Class timetables workbook ──
        if (selected.has('class-xlsx')) {
          const wb = XLSX.utils.book_new()
          opts.sections.forEach(sec => {
            const aoa = buildClassSheet(sec.name, opts)
            const ws  = XLSX.utils.aoa_to_sheet(aoa)
            // Column widths: first col wider, rest equal
            ws['!cols'] = [
              { wch: 18 },
              ...opts.workDays.map(() => ({ wch: 20 })),
            ]
            XLSX.utils.book_append_sheet(wb, ws, sec.name.slice(0, 31))
          })
          XLSX.writeFile(wb, 'class-timetables.xlsx')
          completed.push('class-xlsx')
          setDone(d => [...d, 'class-xlsx'])
        }

        // ── Teacher timetables workbook ──
        if (selected.has('teacher-xlsx')) {
          const wb = XLSX.utils.book_new()
          opts.staff.forEach(teacher => {
            const aoa = buildTeacherSheet(teacher.name, opts)
            const ws  = XLSX.utils.aoa_to_sheet(aoa)
            ws['!cols'] = [
              { wch: 18 },
              ...opts.workDays.map(() => ({ wch: 22 })),
            ]
            // Sheet names must be ≤31 chars
            const sheetName = teacher.name.slice(0, 31)
            XLSX.utils.book_append_sheet(wb, ws, sheetName)
          })
          XLSX.writeFile(wb, 'teacher-timetables.xlsx')
          completed.push('teacher-xlsx')
          setDone(d => [...d, 'teacher-xlsx'])
        }
      }

      // ── CSV master export ──
      if (selected.has('master-csv')) {
        const XLSX = await import('xlsx').catch(() => null)
        if (!XLSX) throw new Error('SheetJS (xlsx) is not installed. Run: npm i xlsx')
        const aoa = buildFlatSheet(opts)
        const ws  = XLSX.utils.aoa_to_sheet(aoa)
        const csv = XLSX.utils.sheet_to_csv(ws)
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
        const url  = URL.createObjectURL(blob)
        const a    = document.createElement('a')
        a.href = url; a.download = 'master-timetable.csv'
        document.body.appendChild(a); a.click()
        document.body.removeChild(a)
        URL.revokeObjectURL(url)
        setDone(d => [...d, 'master-csv'])
      }

      // ── Print / PDF ──
      if (selected.has('print')) {
        const html = buildPrintHTML(opts)
        const blob = new Blob([html], { type: 'text/html;charset=utf-8;' })
        const url  = URL.createObjectURL(blob)
        const win  = window.open(url, '_blank')
        // Clean up the object URL after the window has loaded
        if (win) win.addEventListener('load', () => URL.revokeObjectURL(url))
        else URL.revokeObjectURL(url)
        setDone(d => [...d, 'print'])
      }

      // The button reads "Publish & Export" — actually mark the timetable
      // published once the chosen exports have succeeded (previously nothing
      // in the app ever set this, so a "published" timetable still showed as
      // a draft on the dashboard).
      useTimetableStore.getState().setTimetableStatus('published')
      markActiveTimetablePublished()
    } catch (err: any) {
      setError(err?.message ?? 'Export failed. Please try again.')
    } finally {
      setExporting(false)
    }
  }, [selected, buildOpts])

  const allDone = done.length === selected.size && selected.size > 0

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: 'fixed', inset: 0, zIndex: 9000,
          background: 'rgba(19,17,30,0.45)',
          backdropFilter: 'blur(2px)',
        }}
      />

      {/* Panel */}
      <div style={{
        position: 'fixed',
        top: '50%', left: '50%',
        transform: 'translate(-50%, -50%)',
        zIndex: 9001,
        width: 520, maxWidth: 'calc(100vw - 32px)',
        maxHeight: 'calc(100vh - 48px)',
        background: '#fff',
        borderRadius: 18,
        boxShadow: '0 24px 64px rgba(19,17,30,0.28), 0 4px 12px rgba(124,111,224,0.12)',
        display: 'flex', flexDirection: 'column',
        fontFamily: "'Plus Jakarta Sans', sans-serif",
        overflow: 'hidden',
      }}>

        {/* ─── Header ─── */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10,
          padding: '16px 20px 14px',
          borderBottom: '1px solid #ECEAFB',
          flexShrink: 0,
        }}>
          <div style={{
            width: 32, height: 32, borderRadius: 9,
            background: '#EDE9FF', color: '#7C6FE0',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <Download size={16} />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 14, fontWeight: 800, color: '#13111E', letterSpacing: '-0.2px' }}>
              Publish &amp; Export
            </div>
            <div style={{ fontSize: 10.5, color: '#8B87AD', marginTop: 1 }}>
              Choose formats, then click Export
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              width: 28, height: 28, borderRadius: 7,
              border: '1px solid #ECEAFB', background: '#FAFAFE',
              color: '#8B87AD', cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
            title="Close"
          >
            <X size={14} />
          </button>
        </div>

        {/* ─── Body (scrollable) ─── */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '18px 20px' }}>

          {/* Format selector grid */}
          <div style={{
            fontSize: 9, fontWeight: 800, letterSpacing: '0.14em',
            textTransform: 'uppercase', color: '#8B87AD', marginBottom: 10,
          }}>
            Export formats
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 18 }}>
            {FORMATS.map(fmt => {
              const active = selected.has(fmt.id)
              const isDone = done.includes(fmt.id)
              return (
                <button
                  key={fmt.id}
                  onClick={() => !exporting && toggle(fmt.id)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 12,
                    padding: '12px 14px',
                    borderRadius: 12,
                    border: `1.5px solid ${active ? fmt.border : '#ECEAFB'}`,
                    background: active ? fmt.bg : '#FAFAFE',
                    cursor: exporting ? 'default' : 'pointer',
                    textAlign: 'left',
                    transition: 'border-color 0.12s, background 0.12s',
                    opacity: exporting && !active ? 0.5 : 1,
                    position: 'relative',
                  }}
                >
                  {/* Icon */}
                  <div style={{
                    width: 36, height: 36, borderRadius: 9, flexShrink: 0,
                    background: active ? `${fmt.accent}22` : '#F0EEF8',
                    color: active ? fmt.accent : '#8B87AD',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    {isDone
                      ? <CheckCircle2 size={18} color={fmt.accent} />
                      : exporting && active
                        ? <Loader2 size={18} color={fmt.accent} style={{ animation: 'spin 0.8s linear infinite' }} />
                        : fmt.icon}
                  </div>
                  {/* Text */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{
                      fontSize: 12, fontWeight: 700,
                      color: active ? '#13111E' : '#4B5275',
                      lineHeight: 1.2,
                    }}>
                      {fmt.label}
                    </div>
                    <div style={{
                      fontSize: 10, color: active ? fmt.accent : '#8B87AD',
                      marginTop: 2, fontWeight: 500,
                    }}>
                      {fmt.sublabel}
                    </div>
                  </div>
                  {/* Selection indicator */}
                  <div style={{
                    width: 16, height: 16, borderRadius: 5,
                    border: `2px solid ${active ? fmt.accent : '#D8D2FF'}`,
                    background: active ? fmt.accent : 'transparent',
                    flexShrink: 0,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    {active && (
                      <svg width="9" height="7" viewBox="0 0 9 7" fill="none">
                        <path d="M1 3.5L3.5 6L8 1" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    )}
                  </div>
                </button>
              )
            })}
          </div>

          {/* ─── Cell options ─── */}
          <div style={{
            fontSize: 9, fontWeight: 800, letterSpacing: '0.14em',
            textTransform: 'uppercase', color: '#8B87AD', marginBottom: 10,
          }}>
            Cell content
          </div>
          <div style={{
            display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 18,
          }}>
            <ToggleChip
              label="Show teacher name"
              value={showTeacher}
              onChange={setShowTeacher}
              disabled={exporting}
            />
            <ToggleChip
              label="Show room"
              value={showRoom}
              onChange={setShowRoom}
              disabled={exporting}
            />
          </div>

          {/* ─── Advanced section (sheet stats) ─── */}
          <button
            onClick={() => setAdvOpen(v => !v)}
            style={{
              display: 'flex', alignItems: 'center', gap: 6, width: '100%',
              background: 'none', border: 'none', cursor: 'pointer',
              fontSize: 10, fontWeight: 700, color: '#8B87AD', padding: 0, marginBottom: 8,
              fontFamily: 'inherit',
            }}
          >
            {advOpen ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
            What will be generated
          </button>
          {advOpen && (
            <div style={{
              background: '#FAFAFE', border: '1px solid #ECEAFB', borderRadius: 10,
              padding: '10px 12px', fontSize: 10.5, color: '#4B5275', marginBottom: 16,
            }}>
              <SummaryRow label="Sections" value={exportOptions.sections.length} note="sheets in class XLSX" />
              <SummaryRow label="Teachers" value={exportOptions.staff.length} note="sheets in teacher XLSX" />
              <SummaryRow label="Work days" value={exportOptions.workDays.length} note="columns per sheet" />
              <SummaryRow
                label="Periods"
                value={exportOptions.periods.filter(p => p.type !== 'break').length}
                note="rows per sheet (excl. breaks)"
              />
              <SummaryRow
                label="Total assignments"
                value={countAssignments(exportOptions)}
                note="rows in master CSV"
              />
            </div>
          )}

          {/* Error banner */}
          {error && (
            <div style={{
              padding: '9px 12px', borderRadius: 9,
              background: '#FEE2E2', border: '1px solid #FECACA',
              color: '#991B1B', fontSize: 11, fontWeight: 600,
              marginBottom: 12,
            }}>
              ⚠ {error}
            </div>
          )}

          {/* All-done banner */}
          {allDone && !error && (
            <div style={{
              display: 'flex', alignItems: 'center', gap: 8,
              padding: '9px 12px', borderRadius: 9,
              background: '#DCFCE7', border: '1px solid #BBF7D0',
              color: '#15803D', fontSize: 11.5, fontWeight: 700,
              marginBottom: 12,
            }}>
              <CheckCircle2 size={14} />
              All exports complete! Check your downloads.
            </div>
          )}
        </div>

        {/* ─── Footer ─── */}
        <div style={{
          padding: '12px 20px',
          borderTop: '1px solid #ECEAFB',
          display: 'flex', alignItems: 'center', gap: 10,
          flexShrink: 0, background: '#FAFAFE',
        }}>
          <span style={{ flex: 1, fontSize: 10.5, color: '#8B87AD' }}>
            {selected.size === 0
              ? 'Select at least one format'
              : `${selected.size} format${selected.size !== 1 ? 's' : ''} selected`}
          </span>
          <button
            onClick={onClose}
            style={{
              padding: '8px 16px', borderRadius: 9,
              border: '1px solid #ECEAFB', background: '#fff',
              color: '#4B5275', fontSize: 11.5, fontWeight: 600,
              cursor: 'pointer', fontFamily: 'inherit',
            }}
          >
            Close
          </button>
          <button
            onClick={handleExport}
            disabled={exporting || selected.size === 0}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 7,
              padding: '8px 18px', borderRadius: 9, border: 'none',
              background: exporting || selected.size === 0 ? '#C4C0F0' : '#7C6FE0',
              color: '#fff',
              fontSize: 12, fontWeight: 800, cursor: exporting || selected.size === 0 ? 'default' : 'pointer',
              fontFamily: 'inherit', letterSpacing: '0.02em',
              transition: 'background 0.12s',
            }}
          >
            {exporting
              ? <><Loader2 size={13} style={{ animation: 'spin 0.8s linear infinite' }} /> Exporting…</>
              : <><Download size={13} /> Export</>}
          </button>
        </div>
      </div>
    </>
  )
}

// ─── ToggleChip ───────────────────────────────────────────

function ToggleChip({
  label, value, onChange, disabled,
}: {
  label: string; value: boolean; onChange: (v: boolean) => void; disabled?: boolean
}) {
  return (
    <button
      onClick={() => !disabled && onChange(!value)}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 7,
        padding: '6px 12px', borderRadius: 20,
        border: `1.5px solid ${value ? '#7C6FE0' : '#D8D2FF'}`,
        background: value ? '#EDE9FF' : '#FAFAFE',
        color: value ? '#5B4FBA' : '#8B87AD',
        fontSize: 11, fontWeight: 600,
        cursor: disabled ? 'default' : 'pointer',
        fontFamily: 'inherit',
        opacity: disabled ? 0.6 : 1,
        transition: 'border-color 0.12s, background 0.12s',
      }}
    >
      {value
        ? <ToggleRight size={14} color="#7C6FE0" />
        : <ToggleLeft  size={14} color="#C4C0F0" />}
      {label}
    </button>
  )
}

// ─── SummaryRow ───────────────────────────────────────────

function SummaryRow({ label, value, note }: { label: string; value: number; note: string }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 10,
      padding: '3px 0', borderBottom: '1px dashed #ECEAFB',
    }}>
      <span style={{ flex: 1, color: '#4B5275' }}>{label}</span>
      <span style={{
        fontFamily: "'DM Mono', monospace", fontWeight: 700, color: '#13111E',
        minWidth: 32, textAlign: 'right',
      }}>{value}</span>
      <span style={{ color: '#8B87AD', minWidth: 160 }}>{note}</span>
    </div>
  )
}

// ─── Helpers ─────────────────────────────────────────────

function countAssignments(opts: Omit<ExportOptions, 'showTeacher' | 'showRoom'>): number {
  let n = 0
  Object.values(opts.classTT).forEach(secMap =>
    opts.workDays.forEach(day =>
      opts.periods.forEach(period => {
        if (period.type === 'break') return
        const cell = (secMap as any)[day]?.[period.id]
        if (cell?.subject) n++
      })
    )
  )
  return n
}
