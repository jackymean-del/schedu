/**
 * AllocationReportModal — Printable A4 allocation reports.
 *
 * Four view tabs available in BOTH periods and teacher modes:
 *   Class-wise | Subject-wise | Teacher-wise | Room-wise
 *
 * Filter chips narrow any view to specific classes / subjects / teachers / rooms.
 * Multi-select: click chips to toggle. "All" clears the filter.
 *
 * Print/PDF uses CSS head-injection (visibility: hidden on body *,
 * visibility: visible on .print-report-overlay *) — works regardless of
 * how deeply the modal is nested inside #root.
 */

import { useState, useMemo, useCallback } from 'react'
import { safeSheetName } from '@/lib/sheetNames'
import { teacherWeeklyCap } from '@/lib/teacherCap'
import { useDialog } from '@/hooks/useDialog'
// xlsx is loaded on demand (export click) — keeps it out of the main bundle
import { useTimetableStore } from '@/store/timetableStore'
import type { Section, Subject, Staff } from '@/types'
import { parseAllocation } from '@/lib/allocationSyntax'
import {
  X, Printer, ChevronUp, ChevronDown, ArrowUpDown,
  FileSpreadsheet, FileText as FileCsvIcon,
} from 'lucide-react'

interface Props {
  mode: 'periods' | 'teachers'
  onClose: () => void
  displayMode?: 'periods' | 'hours'
  periodMinutes?: number
}

type ReportTab = 'class' | 'subject' | 'teacher' | 'room'

// ── helpers ───────────────────────────────────────────────────────────────────

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
      const av = a[sortField]; const bv = b[sortField]
      const an = parseFloat(String(av ?? '')); const bn = parseFloat(String(bv ?? ''))
      const cmp = (!isNaN(an) && !isNaN(bn))
        ? an - bn
        : String(av ?? '').localeCompare(String(bv ?? ''), undefined, { numeric: true, sensitivity: 'base' })
      return sortDir === 'asc' ? cmp : -cmp
    })
  }, [data, sortField, sortDir])
  return { sorted, sortField, sortDir, toggle }
}

// ── Sortable column header ────────────────────────────────────────────────────

function SortTh({
  label, field, sortField, sortDir, onToggle, align = 'left',
}: { label: string; field: string; sortField: string; sortDir: 'asc' | 'desc'; onToggle: (f: string) => void; align?: 'left' | 'right' | 'center' }) {
  const active = sortField === field
  return (
    <th onClick={() => onToggle(field)} style={{
      ...thStyle, textAlign: align as any, cursor: 'pointer', userSelect: 'none',
      color: active ? '#5B4EC0' : '#555', whiteSpace: 'nowrap',
    }}>
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
        {label}
        {active
          ? (sortDir === 'asc' ? <ChevronUp size={10} /> : <ChevronDown size={10} />)
          : <ArrowUpDown size={9} style={{ opacity: 0.3 }} />}
      </span>
    </th>
  )
}

const thStyle: React.CSSProperties = {
  padding: '8px 10px', background: '#F2F2F5', fontWeight: 700,
  fontSize: 11, borderBottom: '2px solid #E2E2E7', position: 'sticky', top: 0,
}
const tdStyle: React.CSSProperties = { padding: '7px 10px', fontSize: 12, borderBottom: '1px solid #F0EDFF' }
const tdNum: React.CSSProperties = { ...tdStyle, textAlign: 'right', fontFamily: "'DM Mono', monospace", fontWeight: 600 }

// ── Filter chip bar ───────────────────────────────────────────────────────────

/**
 * Group key for an item: everything before the last hyphen.
 * "I-A" → "I", "Nursery-B" → "Nursery", "XI-Sci-A" → "XI-Sci".
 *
 * Only used where the caller says the names carry that structure (see
 * `groupLabel`), never inferred — a teacher called "Anne-Marie" must not
 * become a group.
 */
function groupOf(item: string): string | null {
  const i = item.lastIndexOf('-')
  return i > 0 ? item.slice(0, i) : null
}

/** Above this many chips, finding one by eye stops working and search appears. */
const SEARCHABLE_FROM = 12
/** Never render more than this many at once; the rest need narrowing. */
const MAX_CHIPS = 40

/**
 * A two-level filter: pick classes, then optionally narrow to sections.
 *
 * With two sections one row of chips was fine. With forty it was a horizontal
 * scroll strip — you could not see what existed, let alone reach "VIII-C".
 *
 * The top row is the one people actually want: CLASS. Pick one, several, or
 * All. Sections below then offer only what those classes contain, so choosing
 * Class III turns forty chips into four. Picking a section is a refinement
 * within that, not a separate idea to hold in your head.
 *
 * The class row only exists when the caller passes `groupLabel`; the subject,
 * teacher and venue tabs have no such hierarchy and get a single row.
 */
function FilterBar({
  label, items, filter, setFilter, groupLabel, itemLabel,
}: {
  label: string
  items: string[]
  filter: Set<string>
  setFilter: React.Dispatch<React.SetStateAction<Set<string>>>
  /** Enables the top-level row, e.g. "Class". Omit for flat lists. */
  groupLabel?: string
  /** Names the second row when grouped, e.g. "Section". */
  itemLabel?: string
}) {
  const [q, setQ] = useState('')
  const [groups, setGroups] = useState<Set<string>>(new Set())

  const byGroup = useMemo(() => {
    const m = new Map<string, string[]>()
    if (!groupLabel) return m
    for (const it of items) {
      const g = groupOf(it)
      if (!g) continue
      const list = m.get(g) ?? []
      list.push(it)
      m.set(g, list)
    }
    return m
  }, [items, groupLabel])

  // AFTER every hook: an early return above them would change the hook count
  // between renders the moment a list emptied, and React throws.
  if (items.length === 0) return null

  const groupNames = [...byGroup.keys()]
  const hasGroups = groupNames.length > 0

  // Sections on offer: only those inside the chosen classes.
  const inScope = groups.size > 0
    ? items.filter(i => { const g = groupOf(i); return g !== null && groups.has(g) })
    : items

  const needle = q.trim().toLowerCase()
  const searchable = inScope.length > SEARCHABLE_FROM
  const matching = needle ? inScope.filter(i => i.toLowerCase().includes(needle)) : inScope
  // Selected first, so a chosen filter is always reachable to switch off.
  const ordered = [...matching].sort((a, b) => Number(filter.has(b)) - Number(filter.has(a)))
  const shown = ordered.slice(0, MAX_CHIPS)
  const hidden = ordered.length - shown.length

  const chip: React.CSSProperties = {
    padding: '3px 9px', borderRadius: 20, fontSize: 9.5, fontWeight: 700,
    cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap', flexShrink: 0,
    border: '1px solid transparent',
  }
  const tone = (on: boolean, strong = false): React.CSSProperties => ({
    background:  on ? (strong ? '#7C6FE0' : '#EDE9FF') : '#F8F7FF',
    color:       on ? (strong ? '#fff'    : '#7C6FE0') : '#6D6A8A',
    borderColor: on ? '#7C6FE0' : '#E8E4FF',
  })
  const rowLabel: React.CSSProperties = {
    fontSize: 9.5, fontWeight: 800, color: '#6D6A8A',
    textTransform: 'uppercase', letterSpacing: '0.06em', whiteSpace: 'nowrap',
  }

  const clearAll = () => { setGroups(new Set()); setFilter(new Set()); setQ('') }

  /** Sections covered by a set of classes — this IS what the table filters on,
   *  so picking a class narrows the report immediately rather than only
   *  narrowing which chips are offered. */
  const membersOf = (gs: Set<string>) =>
    new Set(items.filter(i => { const g = groupOf(i); return g !== null && gs.has(g) }))

  const toggleGroup = (g: string) => {
    const next = new Set(groups)
    next.has(g) ? next.delete(g) : next.add(g)
    setGroups(next)
    // Reset the section refinement to the whole of the new class selection:
    // keeping a stale section pick from a class you just switched off would
    // leave the table showing rows the chips say are not selected.
    setFilter(next.size > 0 ? membersOf(next) : new Set())
    setQ('')
  }

  /** "All" means all of whatever is currently in scope. */
  const resetItems = () => setFilter(groups.size > 0 ? membersOf(groups) : new Set())

  return (
    <div className="no-print" style={{ padding: '6px 0 10px', marginBottom: 8, borderBottom: '1px solid #F0EDFF', display: 'flex', flexDirection: 'column', gap: 6 }}>
      {/* ── Level 1: class ── */}
      {hasGroups && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap' }}>
          <span style={rowLabel}>{groupLabel}:</span>
          <button onClick={clearAll} style={{ ...chip, ...tone(groups.size === 0, true) }}>
            All {groupLabel?.toLowerCase()}es
          </button>
          {groupNames.map(g => (
            <button key={g} onClick={() => toggleGroup(g)}
              title={(byGroup.get(g) ?? []).join(', ')}
              style={{ ...chip, ...tone(groups.has(g), true) }}>
              {g} · {(byGroup.get(g) ?? []).length}
            </button>
          ))}
        </div>
      )}

      {/* ── Level 2: the individual items ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap' }}>
        <span style={rowLabel}>{hasGroups ? `${itemLabel ?? 'Section'}:` : `${label}:`}</span>
        <button onClick={resetItems}
          style={{ ...chip, ...tone(groups.size > 0 ? filter.size === membersOf(groups).size : filter.size === 0, true) }}>
          {groups.size > 0 ? `All ${(itemLabel ?? 'section').toLowerCase()}s` : 'All'}
        </button>

        {searchable && (
          <input value={q} onChange={e => setQ(e.target.value)}
            placeholder={`Search ${inScope.length}…`}
            style={{
              padding: '3px 9px', borderRadius: 20, fontSize: 10, fontFamily: 'inherit',
              border: '1px solid #E8E4FF', background: '#fff', color: '#2E2A4A',
              outline: 'none', width: 130,
            }} />
        )}

        {shown.map(item => (
          <button key={item}
            onClick={() => setFilter(prev => {
              const next = new Set(prev)
              next.has(item) ? next.delete(item) : next.add(item)
              return next
            })}
            style={{ ...chip, ...tone(filter.has(item)) }}>{item}</button>
        ))}

        {hidden > 0 && (
          <span style={{ fontSize: 9.5, color: '#6D6A8A' }}>+{hidden} more — type to narrow</span>
        )}
        {needle && shown.length === 0 && (
          <span style={{ fontSize: 9.5, color: '#6D6A8A' }}>Nothing matches “{q}”.</span>
        )}

        {(filter.size > 0 || groups.size > 0) && (
          <button onClick={clearAll} style={{ ...chip, background: '#FEF2F2', color: '#DC2626', borderColor: '#FECACA' }}>
            ✕ Clear
          </button>
        )}
      </div>
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export function AllocationReportModal({ mode, onClose, displayMode = 'periods', periodMinutes = 40 }: Props) {
  const store        = useTimetableStore() as any
  const { sections, subjects, subjectAllocations, teacherAllocations, staff } = store
  const storeRooms: any[] = (store as any).rooms ?? []

  // All four tabs shown in both modes
  const tabs: ReportTab[] = ['class', 'subject', 'teacher', 'room']
  const [activeTab, setActiveTab] = useState<ReportTab>('class')

  // ── Per-tab filter state (empty Set = show all) ──
  const [classFilter,   setClassFilter]   = useState<Set<string>>(new Set())
  const [subjectFilter, setSubjectFilter] = useState<Set<string>>(new Set())
  const [teacherFilter, setTeacherFilter] = useState<Set<string>>(new Set())
  const [roomFilter,    setRoomFilter]    = useState<Set<string>>(new Set())

  // ── Class-wise data ──────────────────────────────────────────────────────────
  const classRows = useMemo(() => (sections as Section[]).map((sec: Section) => {
    const row: Record<string, any> = { section: sec.name }
    let total = 0
    ;(subjects as Subject[]).forEach((sub: Subject) => {
      const raw = subjectAllocations[sec.name]?.[sub.name]
      const p = raw ? parseAllocation(raw).weeklyTotal : 0
      row[sub.name] = p; total += p
    })
    row['__total'] = total
    return row
  }), [sections, subjects, subjectAllocations])

  const { sorted: sortedClassRows,   sortField: cSortField, sortDir: cSortDir, toggle: cToggle } = useSortable(classRows, 'section')
  const filteredClassRows = classFilter.size > 0 ? sortedClassRows.filter((r: any) => classFilter.has(r.section)) : sortedClassRows

  // ── Subject-wise data ────────────────────────────────────────────────────────
  const subjectRows = useMemo(() => (subjects as Subject[]).map((sub: Subject) => {
    let total = 0; let sectionCount = 0
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
  const filteredSubjectRows = subjectFilter.size > 0 ? sortedSubjectRows.filter((r: any) => subjectFilter.has(r.subject)) : sortedSubjectRows

  // ── Teacher-wise data ────────────────────────────────────────────────────────
  const teacherRows = useMemo(() => (staff as Staff[]).map((t: Staff) => {
    const tMap = teacherAllocations[t.name] ?? {}
    let total = 0
    const subjectCount = new Set<string>(); const sectionCount = new Set<string>()
    Object.entries(tMap).forEach(([sec, sMap]: [string, any]) => {
      Object.entries(sMap ?? {}).forEach(([sub, p]: [string, any]) => {
        if (typeof p === 'number' && p > 0) { total += p; subjectCount.add(sub); sectionCount.add(sec) }
      })
    })
    const max = teacherWeeklyCap(t as any)
    return {
      teacher: t.name, total, max,
      subjects: subjectCount.size, sections: sectionCount.size,
      utilisation: max > 0 ? Math.round((total / max) * 100) : 0,
      assignments: Object.entries(tMap).flatMap(([sec, sMap]: [string, any]) =>
        Object.entries(sMap ?? {})
          .filter(([, p]: [string, any]) => typeof p === 'number' && p > 0)
          .map(([sub, p]: [string, any]) => ({ sec, sub, p: p as number }))
      ),
    }
  }), [staff, teacherAllocations])

  const { sorted: sortedTeacherRows, sortField: tSortField, sortDir: tSortDir, toggle: tToggle } = useSortable(teacherRows, 'teacher')
  const filteredTeacherRows = teacherFilter.size > 0 ? sortedTeacherRows.filter((r: any) => teacherFilter.has(r.teacher)) : sortedTeacherRows

  // ── Room-wise data ───────────────────────────────────────────────────────────
  const roomRows = useMemo(() => storeRooms.map((room: any) => {
    const mappedSubjects: string[] = room.subjectMappings ?? []
    let totalPeriods = 0
    const perSubject: Record<string, number> = {}
    mappedSubjects.forEach((subName: string) => {
      let subTotal = 0
      ;(sections as Section[]).forEach((sec: Section) => {
        const raw = subjectAllocations[sec.name]?.[subName]
        const p = raw ? parseAllocation(raw).weeklyTotal : 0
        subTotal += p
      })
      perSubject[subName] = subTotal
      totalPeriods += subTotal
    })
    return {
      room: room.name,
      roomType: room.type ?? '',
      capacity: room.capacity ?? 0,
      subjectCount: mappedSubjects.length,
      totalPeriods,
      perSubject,
      subjects: mappedSubjects,
    }
  }), [storeRooms, sections, subjectAllocations])

  const { sorted: sortedRoomRows, sortField: rSortField, sortDir: rSortDir, toggle: rToggle } = useSortable(roomRows, 'room')
  const filteredRoomRows = roomFilter.size > 0 ? sortedRoomRows.filter((r: any) => roomFilter.has(r.room)) : sortedRoomRows

  const title = mode === 'teachers' ? 'Teacher Allocation Report' : 'Period Allocation Report'

  // ── Build export data for the active tab (respects active filter) ────────────
  const buildExportData = useCallback((): string[][] => {
    const subjs = subjects as Subject[]
    if (activeTab === 'class') {
      const header = ['Section', ...subjs.map(s => s.shortName ?? s.name), 'Total']
      const rows = filteredClassRows.map((r: any) => [
        r.section,
        ...subjs.map((s: Subject) => {
          const v = r[s.name]
          return v ? (displayMode === 'hours' ? toHourMin(v, periodMinutes) : String(v)) : ''
        }),
        r.__total ? (displayMode === 'hours' ? toHourMin(r.__total, periodMinutes) : String(r.__total)) : '0',
      ])
      return [header, ...rows]
    }
    if (activeTab === 'subject') {
      const header = ['Subject', 'Total periods', 'Sections covered', 'Default p/w']
      const rows = filteredSubjectRows.map((r: any) => [
        r.subject,
        displayMode === 'hours' ? toHourMin(r.total, periodMinutes) : String(r.total),
        String(r.sectionCount),
        String(r.periodsPerWeek),
      ])
      return [header, ...rows]
    }
    if (activeTab === 'teacher') {
      const header = ['Teacher', 'Assigned', 'Max', 'Utilisation %', 'Subjects', 'Classes']
      const rows = filteredTeacherRows.map((r: any) => [
        r.teacher,
        displayMode === 'hours' ? toHourMin(r.total, periodMinutes) : String(r.total),
        displayMode === 'hours' ? toHourMin(r.max, periodMinutes) : String(r.max),
        String(r.utilisation),
        String(r.subjects),
        String(r.sections),
      ])
      return [header, ...rows]
    }
    if (activeTab === 'room') {
      const header = ['Room', 'Type', 'Capacity', 'Subjects mapped', 'Total p/w', 'Subject Breakdown']
      const rows = filteredRoomRows.map((r: any) => [
        r.room,
        r.roomType || '',
        String(r.capacity || ''),
        String(r.subjectCount),
        displayMode === 'hours' ? toHourMin(r.totalPeriods, periodMinutes) : String(r.totalPeriods),
        r.subjects.map((sub: string) => `${sub}: ${r.perSubject[sub] ?? 0}p/wk`).join('; '),
      ])
      return [header, ...rows]
    }
    return []
  }, [activeTab, filteredClassRows, filteredSubjectRows, filteredTeacherRows, filteredRoomRows, subjects, displayMode, periodMinutes])

  const handleExportExcel = useCallback(async () => {
    const data = buildExportData()
    if (!data.length) return
    const XLSX = await import('xlsx')
    const wb = XLSX.utils.book_new()
    const ws = XLSX.utils.aoa_to_sheet(data)
    ws['!cols'] = data[0].map((_, ci) => ({ wch: Math.min(30, Math.max(10, ...data.map(r => String(r[ci] ?? '').length))) }))
    const tabName = activeTab === 'class' ? 'Class-wise' : activeTab === 'subject' ? 'Subject-wise' : activeTab === 'teacher' ? 'Teacher-wise' : 'Room-wise'
    XLSX.utils.book_append_sheet(wb, ws, safeSheetName(tabName, new Set<string>()))
    XLSX.writeFile(wb, `${title.replace(/ /g, '_')}_${activeTab}.xlsx`)
  }, [buildExportData, title, activeTab])

  const handleExportCSV = useCallback(() => {
    const data = buildExportData()
    if (!data.length) return
    const csv = data.map(row => row.map(cell => `"${String(cell ?? '').replace(/"/g, '""')}"`).join(',')).join('\n')
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a'); a.href = url
    a.download = `${title.replace(/ /g, '_')}_${activeTab}.csv`
    a.click(); URL.revokeObjectURL(url)
  }, [buildExportData, title, activeTab])

  // ── Print: CSS head-injection — works regardless of DOM nesting depth ─────────
  // Injects @media print with visibility:hidden on body* / visible on overlay*.
  // Cleaned up via afterprint event (fallback: 8 s timeout).
  const handlePrint = useCallback(() => {
    const style = document.createElement('style')
    style.id = '_print_modal_override'
    style.textContent = `
      @media print {
        body * { visibility: hidden !important; }
        .print-report-overlay,
        .print-report-overlay * { visibility: visible !important; }
        .print-report-overlay .no-print,
        .print-report-overlay .no-print * { visibility: hidden !important; display: none !important; }
        .print-report-overlay {
          position: fixed !important;
          left: 0 !important; top: 0 !important;
          width: 100% !important; height: auto !important;
          background: white !important;
          overflow: visible !important;
          padding: 0 !important;
          z-index: 9999 !important;
          display: block !important;
        }
        .print-report-overlay .print-content {
          box-shadow: none !important;
          max-height: none !important;
          overflow: visible !important;
          border-radius: 0 !important;
          max-width: 100% !important;
          width: 100% !important;
        }
        @page { size: A4; margin: 15mm; }
      }
    `
    document.head.appendChild(style)
    const cleanup = () => {
      const s = document.getElementById('_print_modal_override')
      if (s) s.remove()
      window.removeEventListener('afterprint', cleanup)
    }
    window.addEventListener('afterprint', cleanup)
    setTimeout(() => { const s = document.getElementById('_print_modal_override'); if (s) s.remove() }, 8000)
    window.print()
  }, [])

  const { dialogProps } = useDialog({ onClose, label: 'Period allocation report' })

  return (
    <div className="print-report-overlay" style={{
      position: 'fixed', inset: 0, zIndex: 1000,
      background: 'rgba(19,17,30,0.55)', backdropFilter: 'blur(3px)',
      display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
      padding: '24px 16px', overflowY: 'auto',
    }}>
      <div {...dialogProps} className="print-content" style={{
        outline: 'none',
        background: '#fff', borderRadius: 16, width: '100%', maxWidth: 960,
        boxShadow: '0 20px 60px rgba(0,0,0,0.25)',
        maxHeight: 'calc(100vh - 48px)', overflow: 'auto',
      }}>

        {/* ── Modal header ── */}
        <div className="no-print" style={{
          display: 'flex', alignItems: 'center', gap: 12, padding: '16px 20px',
          borderBottom: '1px solid #E8E4FF', position: 'sticky', top: 0,
          background: '#fff', zIndex: 2,
        }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 16, fontWeight: 800, color: '#13111E' }}>{title}</div>
            <div style={{ fontSize: 11, color: '#6D6A8A', marginTop: 2 }}>
              {displayMode === 'hours' ? `Hours (1 period = ${periodMinutes} min)` : 'Periods per week'} · Click column headers to sort · Search or pick a whole class to narrow view
            </div>
          </div>
          <div style={{ display: 'inline-flex', borderRadius: 8, overflow: 'hidden', border: '1px solid #DDD8FF' }}>
            <button onClick={handleExportExcel} title="Export to Excel (.xlsx)"
              style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '7px 12px', border: 'none', background: '#F8F7FF', color: '#0A8136', fontSize: 11.5, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', borderRight: '1px solid #DDD8FF' }}>
              <FileSpreadsheet size={13} /> Excel
            </button>
            <button onClick={handleExportCSV} title="Export to CSV"
              style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '7px 12px', border: 'none', background: '#F8F7FF', color: '#0369A1', fontSize: 11.5, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', borderRight: '1px solid #DDD8FF' }}>
              <FileCsvIcon size={13} /> CSV
            </button>
            <button onClick={handlePrint} title="Print / Save as PDF — A4 portrait & landscape"
              style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '7px 12px', border: 'none', background: '#7C6FE0', color: '#fff', fontSize: 11.5, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
              <Printer size={13} /> Print / PDF
            </button>
          </div>
          <button onClick={onClose}
            style={{ display: 'inline-flex', padding: 8, borderRadius: 8, border: 'none', background: '#F0EDFF', cursor: 'pointer', color: '#7C6FE0' }}>
            <X size={16} />
          </button>
        </div>

        {/* ── View tabs: Class | Subject | Teacher | Room ── */}
        <div className="no-print" style={{ display: 'flex', borderBottom: '2px solid #F0EDFF', padding: '0 20px' }}>
          {tabs.map(tab => (
            <button key={tab} onClick={() => setActiveTab(tab)} style={{
              padding: '10px 18px', border: 'none', cursor: 'pointer', background: 'transparent',
              fontSize: 12, fontWeight: activeTab === tab ? 800 : 600,
              color: activeTab === tab ? '#7C6FE0' : '#4B5275', fontFamily: 'inherit',
              borderBottom: activeTab === tab ? '2px solid #7C6FE0' : '2px solid transparent',
              marginBottom: -2,
            }}>
              {tab === 'class' ? 'Class-wise' : tab === 'subject' ? 'Subject-wise' : tab === 'teacher' ? 'Teacher-wise' : 'Room-wise'}
            </button>
          ))}
        </div>

        {/* ── Report body ── */}
        <div style={{ padding: '20px' }}>

          {/* Print title — visible only on printed page */}
          <div style={{ marginBottom: 16 }}>
            <h2 style={{ fontSize: 20, fontWeight: 800, color: '#13111E', margin: '0 0 2px' }}>{title}</h2>
            <div style={{ fontSize: 11, color: '#6D6A8A' }}>
              {activeTab === 'class' ? 'Class-wise' : activeTab === 'subject' ? 'Subject-wise' : activeTab === 'teacher' ? 'Teacher-wise' : 'Room-wise'} allocation ·{' '}
              {displayMode === 'hours' ? `Hours (1p = ${periodMinutes} min)` : 'Periods per week'} ·{' '}
              Generated {new Date().toLocaleDateString()}
            </div>
          </div>

          {/* ── Class-wise ── */}
          {activeTab === 'class' && (
            <div>
              <FilterBar
                label="Filter by class"
                groupLabel="Class"
                itemLabel="Section"
                items={sortedClassRows.map((r: any) => r.section)}
                filter={classFilter}
                setFilter={setClassFilter}
              />
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
                    {filteredClassRows.map((row: any, i: number) => (
                      <tr key={row.section} style={{ background: i % 2 === 0 ? '#fff' : '#FAFAFE' }}>
                        <td style={{ ...tdStyle, fontWeight: 700, color: '#13111E' }}>{row.section}</td>
                        {(subjects as Subject[]).map((sub: Subject) => {
                          const p = row[sub.name] ?? 0
                          return (
                            <td key={sub.name} style={{ ...tdNum, color: p === 0 ? '#D1D5DB' : '#13111E' }}>
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
                  <tfoot>
                    <tr style={{ background: '#F8F7FF', borderTop: '2px solid #E8E4FF' }}>
                      <td style={{ ...tdStyle, fontWeight: 800, fontSize: 11, color: '#6D6A8A', textTransform: 'uppercase' }}>Total</td>
                      {(subjects as Subject[]).map((sub: Subject) => {
                        const total = filteredClassRows.reduce((acc: number, r: any) => acc + (r[sub.name] ?? 0), 0)
                        return (
                          <td key={sub.name} style={{ ...tdNum, fontWeight: 800, color: '#13111E' }}>
                            {fmtPeriods(total, displayMode, periodMinutes)}
                          </td>
                        )
                      })}
                      <td style={{ ...tdNum, fontWeight: 800, color: '#7C6FE0', borderLeft: '2px solid #E8E4FF' }}>
                        {fmtPeriods(filteredClassRows.reduce((a: number, r: any) => a + (r.__total ?? 0), 0), displayMode, periodMinutes)}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          )}

          {/* ── Subject-wise ── */}
          {activeTab === 'subject' && (
            <div>
              <FilterBar
                label="Filter by subject"
                items={sortedSubjectRows.map((r: any) => r.subject)}
                filter={subjectFilter}
                setFilter={setSubjectFilter}
              />
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
                    {filteredSubjectRows.map((row: any, i: number) => {
                      const activeSections = Object.entries(row.perSection)
                        .filter(([, p]) => (p as number) > 0)
                        .sort(([, a], [, b]) => (b as number) - (a as number))
                      return (
                        <tr key={row.subject} style={{ background: i % 2 === 0 ? '#fff' : '#FAFAFE' }}>
                          <td style={{ ...tdStyle, fontWeight: 700, color: '#13111E' }}>{row.subject}</td>
                          <td style={{ ...tdNum, color: '#6D6A8A' }}>{fmtPeriods(row.periodsPerWeek, displayMode, periodMinutes)}</td>
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
            </div>
          )}

          {/* ── Teacher-wise ── */}
          {activeTab === 'teacher' && (
            <div>
              <FilterBar
                label="Filter by teacher"
                items={sortedTeacherRows.map((r: any) => r.teacher)}
                filter={teacherFilter}
                setFilter={setTeacherFilter}
              />
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
                    {filteredTeacherRows.map((row: any, i: number) => {
                      const isOver = row.total > row.max && row.max > 0
                      const bySubject: Record<string, { secs: string[]; total: number }> = {}
                      row.assignments.forEach(({ sec, sub, p }: any) => {
                        if (!bySubject[sub]) bySubject[sub] = { secs: [], total: 0 }
                        bySubject[sub].secs.push(sec); bySubject[sub].total += p
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
                          <td style={{ ...tdNum, color: '#6D6A8A' }}>{fmtPeriods(row.max, displayMode, periodMinutes)}</td>
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
                      <td style={{ ...tdStyle, fontWeight: 800, fontSize: 11, color: '#6D6A8A', textTransform: 'uppercase' }}>Total</td>
                      <td style={{ ...tdNum, fontWeight: 800, color: '#7C6FE0' }}>
                        {fmtPeriods(filteredTeacherRows.reduce((a: number, r: any) => a + r.total, 0), displayMode, periodMinutes)}
                      </td>
                      <td style={{ ...tdNum, color: '#6D6A8A' }}>
                        {fmtPeriods(filteredTeacherRows.reduce((a: number, r: any) => a + r.max, 0), displayMode, periodMinutes)}
                      </td>
                      <td colSpan={4} />
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          )}

          {/* ── Room-wise ── */}
          {activeTab === 'room' && (
            <div>
              {storeRooms.length === 0 ? (
                <div style={{ padding: '40px 0', textAlign: 'center', color: '#B8B4D4', fontSize: 13 }}>
                  No rooms configured yet — add rooms in the Resources step.
                </div>
              ) : (
                <>
                  <FilterBar
                    label="Filter by room"
                    items={sortedRoomRows.map((r: any) => r.room)}
                    filter={roomFilter}
                    setFilter={setRoomFilter}
                  />
                  <div style={{ overflowX: 'auto' }}>
                    <table style={{ borderCollapse: 'collapse', width: '100%' }}>
                      <thead>
                        <tr>
                          <SortTh label="Room" field="room" sortField={rSortField} sortDir={rSortDir} onToggle={rToggle} />
                          <SortTh label="Type" field="roomType" sortField={rSortField} sortDir={rSortDir} onToggle={rToggle} />
                          <SortTh label="Capacity" field="capacity" sortField={rSortField} sortDir={rSortDir} onToggle={rToggle} align="right" />
                          <SortTh label="Subjects" field="subjectCount" sortField={rSortField} sortDir={rSortDir} onToggle={rToggle} align="right" />
                          <SortTh label="Total p/w" field="totalPeriods" sortField={rSortField} sortDir={rSortDir} onToggle={rToggle} align="right" />
                          <th style={{ ...thStyle, textAlign: 'left' }}>Subject Breakdown</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredRoomRows.map((row: any, i: number) => (
                          <tr key={row.room} style={{ background: i % 2 === 0 ? '#fff' : '#FAFAFE' }}>
                            <td style={{ ...tdStyle, fontWeight: 700, color: '#13111E' }}>{row.room}</td>
                            <td style={{ ...tdStyle, color: '#4B5275' }}>
                              {row.roomType ? (
                                <span style={{ padding: '1px 7px', borderRadius: 6, fontSize: 10, background: '#F0EDFF', color: '#7C6FE0', fontWeight: 700 }}>
                                  {row.roomType}
                                </span>
                              ) : <span style={{ color: '#D1D5DB' }}>—</span>}
                            </td>
                            <td style={{ ...tdNum }}>{row.capacity > 0 ? row.capacity : <span style={{ color: '#D1D5DB' }}>—</span>}</td>
                            <td style={{ ...tdNum }}>{row.subjectCount || <span style={{ color: '#D1D5DB' }}>—</span>}</td>
                            <td style={{ ...tdNum, fontWeight: 800, color: row.totalPeriods > 0 ? '#7C6FE0' : '#D1D5DB' }}>
                              {fmtPeriods(row.totalPeriods, displayMode, periodMinutes)}
                            </td>
                            <td style={{ ...tdStyle, fontSize: 11 }}>
                              {row.subjects.length === 0 ? (
                                <span style={{ color: '#D1D5DB' }}>No subjects mapped</span>
                              ) : (
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                                  {row.subjects.map((sub: string) => (
                                    <span key={sub} style={{
                                      padding: '2px 7px', borderRadius: 8, fontSize: 10,
                                      background: '#EDE9FF', color: '#5B4EC0',
                                      border: '1px solid #D8D2FF', fontWeight: 600,
                                    }}>
                                      {sub}
                                      {(row.perSubject[sub] ?? 0) > 0 && (
                                        <span style={{ marginLeft: 4, color: '#7C6FE0' }}>
                                          ({fmtPeriods(row.perSubject[sub], displayMode, periodMinutes)})
                                        </span>
                                      )}
                                    </span>
                                  ))}
                                </div>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr style={{ background: '#F8F7FF', borderTop: '2px solid #E8E4FF' }}>
                          <td style={{ ...tdStyle, fontWeight: 800, fontSize: 11, color: '#6D6A8A', textTransform: 'uppercase' }}>Total</td>
                          <td colSpan={3} />
                          <td style={{ ...tdNum, fontWeight: 800, color: '#7C6FE0' }}>
                            {fmtPeriods(filteredRoomRows.reduce((a: number, r: any) => a + r.totalPeriods, 0), displayMode, periodMinutes)}
                          </td>
                          <td />
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                </>
              )}
            </div>
          )}

        </div>
      </div>
    </div>
  )
}
