/**
 * AllocationGridAG — AG Grid Enterprise spreadsheet for Period Allocation.
 *
 * True Excel-parity + premium Airtable/Linear visual quality:
 *  - Double-click / F2 / Enter → edit mode  |  Esc → cancel
 *  - Single click = select only; arrow keys navigate
 *  - Delete / Backspace → clear selected cells
 *  - Ctrl+C/V/X: multi-cell rectangular copy/paste/cut (Excel-compatible TSV)
 *  - Ctrl+Z / Ctrl+Shift+Z: native 20-step undo/redo
 *  - Range select: Shift+click, drag
 *  - Fill handle: drag bottom-right handle to replicate/fill
 *  - Context menu: Copy, Paste, Cut, Clear, Export
 *  - Same-grade section propagation in valueSetter
 *  - Status bar: live "N cells · N periods" as you select
 *  - Export ▾ dropdown: CSV + Excel
 */

import 'ag-grid-community/styles/ag-grid.css'
import 'ag-grid-community/styles/ag-theme-quartz.css'

import { useMemo, useCallback, useRef, useEffect, useState } from 'react'
import { AgGridReact } from 'ag-grid-react'
import {
  ModuleRegistry,
  AllCommunityModule,
  type ColDef,
  type ValueGetterParams,
  type ValueSetterParams,
  type GetContextMenuItemsParams,
  type ICellRendererParams,
  type MenuItemDef,
  type DefaultMenuItem,
  type GridReadyEvent,
  type CellSelectionChangedEvent,
} from 'ag-grid-community'
import { AllEnterpriseModule } from 'ag-grid-enterprise'

import { useTimetableStore } from '@/store/timetableStore'
import type { Subject, Section, Period } from '@/types'
import { parseAllocation, validateAllocationCapacity } from '@/lib/allocationSyntax'
import {
  computeCapacity, capacityForSection, inferBandFromSection, utilisationStatus,
} from '@/lib/capacityEngine'
import { Search, ChevronDown } from 'lucide-react'

// ── Register AG Grid modules once (idempotent) ───────────────────
ModuleRegistry.registerModules([AllCommunityModule, AllEnterpriseModule])

// ─────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────

function gradeOf(name: string): string {
  const parts = name.split('-')
  return parts.length > 1 ? parts.slice(0, -1).join('-') : name
}

function toHourMin(periods: number, periodMinutes: number): string {
  const totalMins = Math.round(periods * periodMinutes)
  const h = Math.floor(totalMins / 60)
  const m = totalMins % 60
  if (h === 0) return `${m}m`
  if (m === 0) return `${h}h`
  return `${h}h${m}m`
}

function parseHoursInput(val: string, periodMinutes: number): string {
  val = val.trim()
  const hm = val.match(/^(\d+)h\s*(\d+)m?$/i)
  if (hm) return String(Math.max(0, Math.round((parseInt(hm[1]) * 60 + parseInt(hm[2])) / periodMinutes)))
  const h = val.match(/^(\d+(?:\.\d+)?)h$/i)
  if (h) return String(Math.max(0, Math.round(parseFloat(h[1]) * 60 / periodMinutes)))
  const m = val.match(/^(\d+(?:\.\d+)?)m$/i)
  if (m) return String(Math.max(0, Math.round(parseFloat(m[1]) / periodMinutes)))
  const n = parseFloat(val)
  if (!isNaN(n) && n >= 0) return String(Math.max(0, Math.round(n * 60 / periodMinutes)))
  return ''
}

/**
 * Smart 3–4 char column abbreviation.
 * Uses shortName if compact, otherwise derives initials or first-3 letters.
 * Examples: "English" → "ENG"  "Physical Education" → "PE"  "Computer Science" → "CS"
 */
function abbrev(name: string, shortName?: string | null): string {
  if (shortName) {
    const s = shortName.trim()
    return s.length <= 5 ? s.toUpperCase() : s.slice(0, 3).toUpperCase()
  }
  const words = name.trim().split(/[\s_-]+/).filter(Boolean)
  if (words.length >= 2) {
    return words.slice(0, 4).map(w => (w[0] ?? '').toUpperCase()).join('')
  }
  return name.slice(0, 3).toUpperCase()
}

// ─────────────────────────────────────────────────────────────────
// Row type — section metadata only; values read via valueGetter
// ─────────────────────────────────────────────────────────────────

interface RowData {
  __sectionId: string
  sectionName: string
}

// ─────────────────────────────────────────────────────────────────
// Grid context (passed to cell renderers via params.context)
// ─────────────────────────────────────────────────────────────────

interface GridContext {
  getAllocations: () => Record<string, Record<string, string>>
  getCap: () => ReturnType<typeof computeCapacity>
  getDisplayMode: () => 'periods' | 'hours'
  getPeriodMinutes: () => number
}

// ─────────────────────────────────────────────────────────────────
// Usage cell renderer — pinned, read-only
// ─────────────────────────────────────────────────────────────────

function UsageCellRenderer(params: ICellRendererParams<RowData>) {
  const ctx = params.context as GridContext
  const sectionName = params.data?.sectionName ?? ''
  const alloc = ctx.getAllocations()
  const cap = ctx.getCap()
  const displayMode = ctx.getDisplayMode()
  const periodMinutes = ctx.getPeriodMinutes()

  const band = inferBandFromSection(sectionName)
  const c = capacityForSection(cap, band)
  let u = 0
  Object.values(alloc[sectionName] ?? {}).forEach(raw => {
    if (!raw || raw === '0') return
    const p = parseAllocation(raw)
    if (p.valid) u += p.weeklyTotal
  })

  const status = utilisationStatus(u, c)
  const dotColor =
    status === 'over'  ? '#DC2626' :
    status === 'tight' ? '#D97706' :
    status === 'ok'    ? '#16A34A' :
    u > 0 ? '#2563EB' : '#D1D5DB'
  const textColor =
    status === 'over'  ? '#DC2626' :
    status === 'tight' ? '#92400E' : '#4B5275'

  const uLabel = displayMode === 'hours' ? toHourMin(u, periodMinutes) : String(u)
  const cLabel = displayMode === 'hours' ? toHourMin(c, periodMinutes) : String(c)

  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'flex-end',
      gap: 5, padding: '0 8px', height: '100%',
    }}>
      <span style={{
        fontSize: 11, fontWeight: 700, color: textColor,
        fontFamily: "'DM Mono', monospace", whiteSpace: 'nowrap',
        letterSpacing: '-0.01em',
      }}>
        {uLabel}<span style={{ color: '#D1CCF0', fontWeight: 400 }}>/{cLabel}</span>
      </span>
      <span style={{
        width: 5, height: 5, borderRadius: '50%',
        background: dotColor, flexShrink: 0, opacity: 0.85,
      }} />
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────
// Export dropdown
// ─────────────────────────────────────────────────────────────────

function ExportDropdown({
  onCsv, onExcel,
}: { onCsv: () => void; onExcel: () => void }) {
  const [open, setOpen] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const close = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [open])

  return (
    <div ref={wrapRef} style={{ position: 'relative' }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 3,
          padding: '3px 8px', borderRadius: 5,
          border: '1px solid #E5E5EA', background: 'transparent',
          color: '#8B87AD', fontSize: 10.5, fontWeight: 600,
          cursor: 'pointer', fontFamily: 'inherit',
        }}
      >
        Export <ChevronDown size={9} />
      </button>
      {open && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 3px)', right: 0,
          background: '#fff', border: '1px solid #E8E4FF',
          borderRadius: 7, boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
          zIndex: 200, minWidth: 100, overflow: 'hidden',
          padding: '3px 0',
        }}>
          {[
            { label: 'CSV (.csv)', fn: () => { onCsv(); setOpen(false) } },
            { label: 'Excel (.xlsx)', fn: () => { onExcel(); setOpen(false) } },
          ].map(({ label, fn }) => (
            <button key={label} onClick={fn} style={{
              display: 'block', width: '100%', padding: '6px 14px',
              border: 'none', background: 'transparent', textAlign: 'left',
              fontSize: 11, color: '#13111E', cursor: 'pointer',
              fontFamily: 'inherit', fontWeight: 500,
            }}
              onMouseEnter={e => (e.currentTarget.style.background = '#F5F2FF')}
              onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
            >
              {label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────
// Scoped AG Grid styles
// ─────────────────────────────────────────────────────────────────

const GRID_STYLES = `
/* ── Theme variables ── */
.ag-alloc-wrap .ag-theme-quartz {
  --ag-border-color: #EFEFF3;
  --ag-header-background-color: #F8F7FC;
  --ag-background-color: #ffffff;
  --ag-odd-row-background-color: #ffffff;
  --ag-row-hover-color: #FAFAFD;
  --ag-selected-row-background-color: #F3F0FF;
  --ag-range-selection-border-color: #A99FF5;
  --ag-range-selection-border-style: solid;
  --ag-range-selection-background-color: rgba(124,111,224,0.04);
  --ag-range-selection-highlight-color: rgba(124,111,224,0.10);
  --ag-cell-horizontal-padding: 7px;
  --ag-font-family: 'DM Sans', sans-serif;
  --ag-font-size: 12px;
  --ag-foreground-color: #13111E;
  --ag-secondary-foreground-color: #6B7280;
  --ag-header-foreground-color: #6B6B8A;
  --ag-cell-horizontal-border: solid #F0EFF5;
  --ag-header-column-separator-display: block;
  --ag-header-column-separator-color: #EEECF8;
  --ag-pinned-column-border-color: #E4E1F5;
  --ag-input-focus-border-color: #9B8EF5;
  --ag-input-focus-box-shadow: 0 0 0 2px rgba(124,111,224,0.18);
  --ag-fill-handle-color: #7C6FE0;
  --ag-fill-handle-size: 6px;
  --ag-row-border-color: #F3F2F9;
  font-family: 'DM Sans', sans-serif;
}

/* ── Column menu dots — hidden (sort by header click) ── */
.ag-alloc-wrap .ag-header-cell-menu-button,
.ag-alloc-wrap .ag-header-cell-filter-button {
  display: none !important;
}

/* ── Header text ── */
.ag-alloc-wrap .ag-header-cell-label {
  font-size: 10.5px;
  font-weight: 700;
  color: #6B6B8A;
  letter-spacing: 0.03em;
  text-transform: uppercase;
  justify-content: flex-end;
}
.ag-alloc-wrap .ag-header-cell:first-child .ag-header-cell-label,
.ag-alloc-wrap .ag-header-cell[col-id="sectionName"] .ag-header-cell-label {
  justify-content: flex-start;
  text-transform: none;
  letter-spacing: 0;
  font-size: 11px;
}

/* ── Sort icon — small and tight ── */
.ag-alloc-wrap .ag-sort-indicator-icon {
  font-size: 8px;
  opacity: 0.5;
}

/* ── Cell lines ── */
.ag-alloc-wrap .ag-cell {
  line-height: 32px;
  border-right: 1px solid #F0EFF5 !important;
}

/* ── Focus: thin, elegant ── */
.ag-alloc-wrap .ag-cell-focus:not(.ag-cell-range-selected):not(.ag-cell-inline-editing) {
  border: 1px solid #A99FF5 !important;
  outline: none;
}

/* ── Editing cell ── */
.ag-alloc-wrap .ag-cell-inline-editing {
  border: 1.5px solid #7C6FE0 !important;
  box-shadow: 0 0 0 2px rgba(124,111,224,0.15) !important;
  border-radius: 2px;
}
.ag-alloc-wrap .ag-cell-edit-wrapper input {
  font-family: 'DM Mono', monospace !important;
  font-size: 12px !important;
  font-weight: 600;
  color: #13111E !important;
  text-align: right;
}

/* ── Pinned columns — subtle elevation shadow ── */
.ag-alloc-wrap .ag-pinned-left-header {
  border-right: 1px solid #E4E1F5 !important;
  box-shadow: 3px 0 8px -3px rgba(80,60,160,0.08);
}
.ag-alloc-wrap .ag-pinned-left-cols-container {
  border-right: 1px solid #E4E1F5 !important;
  box-shadow: 3px 0 8px -3px rgba(80,60,160,0.06);
}
.ag-alloc-wrap .ag-pinned-left-header .ag-header-cell,
.ag-alloc-wrap .ag-pinned-left-cols-container .ag-cell {
  background: #FAFAFA !important;
}

/* ── Row hover ── */
.ag-alloc-wrap .ag-row-hover .ag-cell {
  background: #FAFAFD !important;
}
.ag-alloc-wrap .ag-row-hover .ag-pinned-left-cols-container .ag-cell,
.ag-alloc-wrap .ag-pinned-left-cols-container .ag-row-hover .ag-cell {
  background: #F6F4FE !important;
}

/* ── Range selection ── */
.ag-alloc-wrap .ag-cell-range-selected {
  background-color: rgba(124,111,224,0.05) !important;
}
.ag-alloc-wrap .ag-cell-range-selected.ag-cell-range-top,
.ag-alloc-wrap .ag-cell-range-selected.ag-cell-range-bottom,
.ag-alloc-wrap .ag-cell-range-selected.ag-cell-range-left,
.ag-alloc-wrap .ag-cell-range-selected.ag-cell-range-right {
  border-color: #A99FF5 !important;
}

/* ── Fill handle ── */
.ag-alloc-wrap .ag-fill-handle {
  background: #7C6FE0;
  border: 1.5px solid #fff;
  width: 6px !important;
  height: 6px !important;
  border-radius: 1px;
}

/* ── Scrollbar ── */
.ag-alloc-wrap .ag-body-horizontal-scroll-viewport::-webkit-scrollbar { height: 5px; }
.ag-alloc-wrap .ag-body-horizontal-scroll-viewport::-webkit-scrollbar-thumb {
  background: #D1CCF0; border-radius: 3px;
}
.ag-alloc-wrap .ag-body-vertical-scroll-viewport::-webkit-scrollbar { width: 5px; }
.ag-alloc-wrap .ag-body-vertical-scroll-viewport::-webkit-scrollbar-thumb {
  background: #D1CCF0; border-radius: 3px;
}
`

// ─────────────────────────────────────────────────────────────────
// Props
// ─────────────────────────────────────────────────────────────────

interface Props {
  displayMode?: 'periods' | 'hours'
  periodMinutes?: number
  toolbarExtra?: React.ReactNode
}

// ─────────────────────────────────────────────────────────────────
// Main component
// ─────────────────────────────────────────────────────────────────

export function AllocationGridAG({
  displayMode = 'periods',
  periodMinutes = 40,
  toolbarExtra,
}: Props) {
  const store = useTimetableStore() as any
  const { sections, subjects, subjectAllocations, config } = store
  const periods: Period[] = store.periods ?? []
  const workDays: string[] = config?.workDays ?? ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY']

  const cap = useMemo(() => computeCapacity(workDays, periods), [workDays, periods])

  // ── Stable refs so column defs never need rebuilding on data change ──
  const allocationsRef = useRef<Record<string, Record<string, string>>>(subjectAllocations)
  allocationsRef.current = subjectAllocations
  const capRef = useRef(cap)
  capRef.current = cap
  const sectionsRef = useRef<Section[]>(sections)
  sectionsRef.current = sections
  const displayModeRef = useRef(displayMode)
  displayModeRef.current = displayMode
  const periodMinutesRef = useRef(periodMinutes)
  periodMinutesRef.current = periodMinutes

  const gridRef = useRef<AgGridReact<RowData>>(null)

  // ── Quick filter ──────────────────────────────────────────────
  const [quickFilter, setQuickFilter] = useState('')

  // ── Status bar state ─────────────────────────────────────────
  const [statusBar, setStatusBar] = useState<{
    cells: number; periods: number; avg: number
  } | null>(null)

  // ── Refresh cells when store changes ─────────────────────────
  useEffect(() => {
    gridRef.current?.api?.refreshCells({ force: true })
  }, [subjectAllocations])

  useEffect(() => {
    capRef.current = cap
    gridRef.current?.api?.refreshCells({ force: true })
  }, [cap])

  // ── Row data — section metadata only ─────────────────────────
  const rowData = useMemo<RowData[]>(() =>
    (sections as Section[]).map((sec: any) => ({
      __sectionId: sec.id,
      sectionName: sec.name,
    })), [sections])

  // ── Grid context ──────────────────────────────────────────────
  const gridContext = useMemo<GridContext>(() => ({
    getAllocations: () => allocationsRef.current,
    getCap: () => capRef.current,
    getDisplayMode: () => displayModeRef.current,
    getPeriodMinutes: () => periodMinutesRef.current,
  }), [])

  // ── Column definitions ────────────────────────────────────────
  // Only rebuilt when subjects list changes
  const columnDefs = useMemo<ColDef<RowData>[]>(() => {
    const cols: ColDef<RowData>[] = [
      // ── Class column ──────────────────────────────────────────
      {
        headerName: 'Class',
        colId: 'sectionName',
        field: 'sectionName',
        pinned: 'left',
        width: 120,
        minWidth: 90,
        editable: false,
        lockPinned: true,
        suppressMovable: true,
        suppressNavigable: true,
        sortable: true,
        cellStyle: {
          fontWeight: 600,
          fontSize: 11.5,
          color: '#13111E',
          fontFamily: "'DM Sans', sans-serif",
          paddingLeft: 10,
        },
      },
      // ── Used / capacity column ────────────────────────────────
      {
        headerName: 'Used',
        colId: '__usage',
        pinned: 'left',
        width: 72,
        minWidth: 64,
        editable: false,
        lockPinned: true,
        suppressMovable: true,
        suppressNavigable: true,
        sortable: false,
        cellRenderer: UsageCellRenderer,
        cellStyle: (params) => {
          const sectionName = params.data?.sectionName ?? ''
          const c = capacityForSection(capRef.current, inferBandFromSection(sectionName))
          let u = 0
          Object.values(allocationsRef.current[sectionName] ?? {}).forEach(raw => {
            if (!raw || raw === '0') return
            const p = parseAllocation(raw)
            if (p.valid) u += p.weeklyTotal
          })
          const status = utilisationStatus(u, c)
          if (status === 'over')  return { background: '#FEF2F2' }
          if (status === 'tight') return { background: '#FFFBEB' }
          return {}
        },
        valueGetter: (params) => {
          const sectionName = params.data?.sectionName ?? ''
          const c = capacityForSection(capRef.current, inferBandFromSection(sectionName))
          let u = 0
          Object.values(allocationsRef.current[sectionName] ?? {}).forEach(raw => {
            if (!raw || raw === '0') return
            const p = parseAllocation(raw)
            if (p.valid) u += p.weeklyTotal
          })
          return `${u}/${c}`
        },
      },
    ]

    // ── Subject columns ──────────────────────────────────────────
    ;(subjects as Subject[]).forEach((sub: Subject) => {
      const headerText = abbrev(sub.name, sub.shortName)
      // Width: 3-char → 52px, 4-char → 58px, 5+ → 64px
      const colWidth = Math.max(52, Math.min(64, headerText.length * 10 + 22))

      cols.push({
        headerName: headerText,
        colId: `subj:${sub.name}`,
        editable: true,
        width: colWidth,
        minWidth: 48,
        maxWidth: 90,
        sortable: true,
        headerTooltip: sub.name,

        valueGetter: (params: ValueGetterParams<RowData>) => {
          const sectionName = params.data?.sectionName ?? ''
          const v = allocationsRef.current[sectionName]?.[sub.name]
          if (!v || v === '0') return ''
          if (displayModeRef.current === 'hours') {
            const parsed = parseAllocation(v)
            if (parsed.valid && parsed.weeklyTotal > 0)
              return toHourMin(parsed.weeklyTotal, periodMinutesRef.current)
            return ''
          }
          return v
        },

        valueSetter: (params: ValueSetterParams<RowData>) => {
          let val = String(params.newValue ?? '').trim()
          if (displayModeRef.current === 'hours') {
            val = parseHoursInput(val, periodMinutesRef.current)
          }

          const sectionName = params.data?.sectionName ?? ''
          const grade = gradeOf(sectionName)
          const siblings = sectionsRef.current.filter(
            (s: Section) => gradeOf(s.name) === grade && s.name !== sectionName
          )

          const merged: Record<string, Record<string, string>> = { ...allocationsRef.current }
          const applyTo = (secName: string) => {
            const existing = { ...(allocationsRef.current[secName] ?? {}) }
            if (val === '') delete existing[sub.name]
            else existing[sub.name] = val
            if (Object.keys(existing).length === 0) delete merged[secName]
            else merged[secName] = existing
          }

          applyTo(sectionName)
          siblings.forEach((s: Section) => applyTo(s.name))
          store.setSubjectAllocations?.(merged)

          if (siblings.length > 0) {
            setTimeout(() => gridRef.current?.api?.refreshCells({ force: true }), 0)
          }
          return true
        },

        cellStyle: (params) => {
          const sectionName = params.data?.sectionName ?? ''
          const rawV = allocationsRef.current[sectionName]?.[sub.name]
          if (!rawV || rawV === '0') return null
          const parsed = parseAllocation(rawV)
          if (!parsed.valid) return { background: '#FEF2F2' }
          const cellCap = capacityForSection(capRef.current, inferBandFromSection(sectionName))
          if (!validateAllocationCapacity(parsed, cellCap).ok) return { background: '#FFFBEB' }
          return null
        },
      })
    })

    return cols
  }, [subjects])

  // ── Context menu ──────────────────────────────────────────────
  const getContextMenuItems = useCallback((
    params: GetContextMenuItemsParams<RowData>
  ): (DefaultMenuItem | MenuItemDef<RowData>)[] => {
    const clearRanges = () => {
      const ranges = params.api.getCellRanges()
      const merged: Record<string, Record<string, string>> = { ...allocationsRef.current }

      const clearCell = (rowIdx: number, colId: string) => {
        if (!colId.startsWith('subj:')) return
        const subName = colId.slice(5)
        const node = params.api.getDisplayedRowAtIndex(rowIdx)
        if (!node?.data) return
        const secName = node.data.sectionName
        if (merged[secName]) {
          const copy = { ...merged[secName] }
          delete copy[subName]
          if (Object.keys(copy).length === 0) delete merged[secName]
          else merged[secName] = copy
        }
      }

      if (ranges?.length) {
        ranges.forEach(range => {
          const r0 = Math.min(range.startRow!.rowIndex, range.endRow!.rowIndex)
          const r1 = Math.max(range.startRow!.rowIndex, range.endRow!.rowIndex)
          range.columns.forEach(col => {
            for (let i = r0; i <= r1; i++) clearCell(i, col.getColId())
          })
        })
      } else {
        const f = params.api.getFocusedCell()
        if (f) clearCell(f.rowIndex, f.column.getColId())
      }
      store.setSubjectAllocations?.(merged)
    }

    return [
      'copy',
      'copyWithHeaders',
      'paste',
      'cut',
      'separator',
      { name: 'Clear cell(s)', shortcut: 'Del', action: clearRanges },
      'separator',
      'csvExport',
      'excelExport',
    ]
  }, [store])

  // ── Selection → status bar ────────────────────────────────────
  const onCellSelectionChanged = useCallback((e: CellSelectionChangedEvent<RowData>) => {
    const ranges = e.api.getCellRanges()
    if (!ranges?.length) { setStatusBar(null); return }

    let cells = 0
    let totalPeriods = 0

    ranges.forEach(range => {
      const r0 = Math.min(range.startRow!.rowIndex, range.endRow!.rowIndex)
      const r1 = Math.max(range.startRow!.rowIndex, range.endRow!.rowIndex)
      range.columns.forEach(col => {
        if (!col.getColId().startsWith('subj:')) return
        const subName = col.getColId().slice(5)
        for (let i = r0; i <= r1; i++) {
          const node = e.api.getDisplayedRowAtIndex(i)
          if (!node?.data) continue
          cells++
          const rawV = allocationsRef.current[node.data.sectionName]?.[subName]
          if (rawV && rawV !== '0') {
            const parsed = parseAllocation(rawV)
            if (parsed.valid) totalPeriods += parsed.weeklyTotal
          }
        }
      })
    })

    if (cells <= 1) { setStatusBar(null); return }
    setStatusBar({
      cells,
      periods: totalPeriods,
      avg: cells > 0 ? Math.round((totalPeriods / cells) * 10) / 10 : 0,
    })
  }, [])

  // ── AI fill (called on mount) ─────────────────────────────────
  const handleAISuggest = useCallback(() => {
    const secs = sectionsRef.current
    const subjs = subjects as Subject[]
    const cap = capRef.current
    const next: Record<string, Record<string, string>> = {}

    secs.forEach((sec: Section) => {
      const band = inferBandFromSection(sec.name)
      const capacity = capacityForSection(cap, band)
      const ideal = subjs
        .filter(s => s.periodsPerWeek && s.periodsPerWeek > 0)
        .map(s => ({ name: s.name, pw: s.periodsPerWeek!, isLab: !!(s as any).requiresLab }))
      if (!ideal.length) return

      const totalIdeal = ideal.reduce((a, s) => a + s.pw, 0)
      const row: Record<string, string> = {}

      if (capacity <= 0 || totalIdeal <= capacity) {
        ideal.forEach(s => { row[s.name] = s.isLab ? `${Math.max(1, s.pw - 1)}+1L` : String(s.pw) })
      } else {
        const scale = capacity / totalIdeal
        let allocated = 0
        ideal.forEach((s, i) => {
          const isLast = i === ideal.length - 1
          const raw = isLast ? Math.max(0, capacity - allocated) : Math.max(1, Math.floor(s.pw * scale))
          if (raw > 0) row[s.name] = String(raw)
          allocated += raw
        })
      }
      if (Object.keys(row).length) next[sec.name] = row
    })

    store.setSubjectAllocations?.(next)
  }, [store, subjects])

  // Auto-fill on mount when empty or conflicted
  useEffect(() => {
    const secs = sectionsRef.current
    const alloc = allocationsRef.current
    const subjs = subjects as Subject[]
    const cap = capRef.current

    const rowTotals: Record<string, number> = {}
    secs.forEach((sec: Section) => {
      const row = alloc[sec.name] ?? {}
      let t = 0
      subjs.forEach((sub: Subject) => {
        const raw = row[sub.name]
        if (!raw || raw === '0') return
        const p = parseAllocation(raw)
        if (p.valid) t += p.weeklyTotal
      })
      rowTotals[sec.name] = t
    })

    const hasConflicts = secs.some((sec: Section) => {
      const band = inferBandFromSection(sec.name)
      const c = capacityForSection(cap, band)
      return c > 0 && (rowTotals[sec.name] ?? 0) > c
    })
    const hasAny = Object.values(alloc ?? {}).some(
      (row: any) => Object.values(row ?? {}).some(
        (v: any) => v && String(v).trim() !== '' && v !== '0'
      )
    )
    if (!hasAny || hasConflicts) handleAISuggest()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── Dynamic grid height ───────────────────────────────────────
  const gridHeight = Math.max(200, Math.min(600, rowData.length * 32 + 34 + 2))

  return (
    <div className="ag-alloc-wrap" style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
      <style>{GRID_STYLES}</style>

      {/* ── Toolbar ── */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap',
        padding: '5px 10px',
        background: '#F8F7FC',
        border: '1px solid #EFEFF3',
        borderBottom: 'none',
        borderRadius: '8px 8px 0 0',
        minHeight: 34,
      }}>
        {toolbarExtra}
        <div style={{ flex: 1 }} />

        {/* Export dropdown */}
        <ExportDropdown
          onCsv={() => gridRef.current?.api?.exportDataAsCsv()}
          onExcel={() => (gridRef.current?.api as any)?.exportDataAsExcel?.()}
        />

        {/* Quick search */}
        <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
          <Search size={10} style={{ position: 'absolute', left: 7, color: '#C0BDDA', pointerEvents: 'none' }} />
          <input
            type="text"
            placeholder="Search…"
            value={quickFilter}
            onChange={e => {
              setQuickFilter(e.target.value)
              gridRef.current?.api?.setGridOption('quickFilterText', e.target.value)
            }}
            style={{
              paddingLeft: 22, paddingRight: 8, paddingTop: 3, paddingBottom: 3,
              borderRadius: 5, border: '1px solid #ECECF2',
              background: '#fff', color: '#13111E',
              fontSize: 10.5, fontFamily: 'inherit', outline: 'none',
              width: 100,
            }}
          />
        </div>
      </div>

      {/* ── AG Grid ── */}
      <div
        className="ag-theme-quartz"
        style={{
          height: gridHeight,
          width: '100%',
          border: '1px solid #EFEFF3',
          borderTop: 'none',
          overflow: 'hidden',
        }}
      >
        <AgGridReact<RowData>
          ref={gridRef}
          rowData={rowData}
          columnDefs={columnDefs}
          defaultColDef={{
            sortable: true,
            resizable: true,
            suppressMovable: false,
            suppressHeaderMenuButton: true,
          }}
          getRowId={(params) => params.data.__sectionId}
          context={gridContext}

          // ── Editing ──
          singleClickEdit={false}
          stopEditingWhenCellsLoseFocus={true}
          enterNavigatesVertically={true}
          enterNavigatesVerticallyAfterEdit={true}
          undoRedoCellEditing={true}
          undoRedoCellEditingLimit={20}

          // ── Range selection + fill handle ──
          cellSelection={{
            handle: { mode: 'fill', direction: 'xy' },
          }}

          // ── Layout ──
          rowHeight={32}
          headerHeight={32}
          animateRows={false}
          domLayout="normal"

          // ── Context menu ──
          getContextMenuItems={getContextMenuItems}

          // ── Status bar events ──
          onCellSelectionChanged={onCellSelectionChanged}

          // ── Tooltip ──
          tooltipShowDelay={500}
          tooltipHideDelay={3000}
        />
      </div>

      {/* ── Status bar ── */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '3px 10px',
        background: '#F8F7FC',
        border: '1px solid #EFEFF3',
        borderTop: 'none',
        borderRadius: '0 0 8px 8px',
        minHeight: 22,
      }}>
        {/* Keyboard hints */}
        <div style={{ display: 'flex', gap: 12 }}>
          {[['↵/F2', 'Edit'], ['Esc', 'Cancel'], ['Del', 'Clear'], ['Ctrl+C/V', 'Copy/Paste'], ['Ctrl+Z', 'Undo']].map(([k, v]) => (
            <span key={k} style={{ fontSize: 9.5, color: '#C0BDDA', fontFamily: "'DM Mono', monospace" }}>
              <span style={{ fontWeight: 700, color: '#ADA8D0' }}>{k}</span> {v}
            </span>
          ))}
        </div>

        {/* Selection stats */}
        {statusBar && (
          <div style={{
            display: 'flex', gap: 10, fontSize: 10, color: '#7C6FE0',
            fontFamily: "'DM Mono', monospace", fontWeight: 600,
          }}>
            <span>{statusBar.cells} cells</span>
            <span style={{ color: '#C0BDDA' }}>·</span>
            <span>Sum: {statusBar.periods}p</span>
            <span style={{ color: '#C0BDDA' }}>·</span>
            <span>Avg: {statusBar.avg}p</span>
          </div>
        )}
      </div>
    </div>
  )
}
