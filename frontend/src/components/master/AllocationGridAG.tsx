/**
 * AllocationGridAG — AG Grid Enterprise spreadsheet for Period Allocation.
 *
 * True Excel-parity interaction via AG Grid Enterprise:
 *  - Double-click (or F2/Enter) to enter edit mode
 *  - Single click = select cell only; arrow keys navigate
 *  - Delete / Backspace clears selected cell(s)
 *  - Ctrl+C/V/X: multi-cell range copy/paste/cut (Excel-compatible)
 *  - Ctrl+Z / Ctrl+Shift+Z: AG Grid native undo/redo (20-step stack)
 *  - Shift+click / drag: multi-cell range selection
 *  - Drag fill handle: replicate/increment values down/right
 *  - Right-click context menu: Copy, Paste, Cut, Clear, Fill Down/Right, Export
 *  - Same-grade auto-fill: editing one section propagates to siblings
 *
 * Architecture: store is source of truth.
 *   valueGetter reads from allocationsRef (always current)
 *   valueSetter writes to store + same-grade siblings
 *   refreshCells() syncs display after external store changes
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
  type GridReadyEvent,
} from 'ag-grid-community'
import { AllEnterpriseModule } from 'ag-grid-enterprise'

import { useTimetableStore } from '@/store/timetableStore'
import type { Subject, Section, Period } from '@/types'
import { parseAllocation, validateAllocationCapacity } from '@/lib/allocationSyntax'
import {
  computeCapacity, capacityForSection, inferBandFromSection, utilisationStatus,
} from '@/lib/capacityEngine'
import { Search, Download } from 'lucide-react'

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

// ─────────────────────────────────────────────────────────────────
// Row type — only section metadata; values read via valueGetter
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
// Usage cell renderer — pinned, computed, read-only
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
  const row = alloc[sectionName] ?? {}
  Object.values(row).forEach(raw => {
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
    status === 'tight' ? '#92400E' : '#13111E'

  const uLabel = displayMode === 'hours' ? toHourMin(u, periodMinutes) : String(u)
  const cLabel = displayMode === 'hours' ? toHourMin(c, periodMinutes) : String(c)

  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'flex-end',
      gap: 5, padding: '0 8px', height: '100%',
    }}>
      <span style={{
        fontSize: 11.5, fontWeight: 700, color: textColor,
        fontFamily: "'DM Mono', monospace", whiteSpace: 'nowrap',
      }}>
        {uLabel}<span style={{ color: '#C4C0D8', fontWeight: 400 }}>/{cLabel}</span>
      </span>
      <span style={{
        width: 6, height: 6, borderRadius: '50%',
        background: dotColor, flexShrink: 0,
      }} />
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────
// Scoped styles for the allocation grid
// ─────────────────────────────────────────────────────────────────

const GRID_STYLES = `
.ag-alloc-wrap .ag-theme-quartz {
  --ag-border-color: #EBEBEF;
  --ag-header-background-color: #F7F6FC;
  --ag-background-color: #ffffff;
  --ag-odd-row-background-color: #ffffff;
  --ag-row-hover-color: #F8F7FF;
  --ag-selected-row-background-color: #F0EDFF;
  --ag-range-selection-border-color: #7C6FE0;
  --ag-range-selection-border-style: solid;
  --ag-range-selection-border-width: 1.5px;
  --ag-range-selection-background-color: rgba(124,111,224,0.06);
  --ag-range-selection-highlight-color: rgba(124,111,224,0.15);
  --ag-cell-horizontal-padding: 8px;
  --ag-font-family: 'DM Sans', sans-serif;
  --ag-font-size: 12px;
  --ag-foreground-color: #13111E;
  --ag-secondary-foreground-color: #6B7280;
  --ag-header-foreground-color: #4B5275;
  --ag-cell-horizontal-border: solid #EBEBEF;
  --ag-header-column-separator-display: block;
  --ag-header-column-separator-color: #EBEBEF;
  --ag-pinned-column-border-color: #DDDAF5;
  --ag-pinned-row-border-color: #DDDAF5;
  --ag-input-focus-border-color: #7C6FE0;
  --ag-input-focus-box-shadow: 0 0 0 2px rgba(124,111,224,0.25);
  --ag-fill-handle-color: #7C6FE0;
  --ag-fill-handle-size: 7px;
  font-family: 'DM Sans', sans-serif;
}
.ag-alloc-wrap .ag-header-cell-label {
  font-size: 11px;
  font-weight: 700;
  color: #4B5275;
  letter-spacing: 0.02em;
}
.ag-alloc-wrap .ag-header-cell-pinned-left .ag-header-cell-label {
  color: #4B5275;
}
.ag-alloc-wrap .ag-cell {
  line-height: 32px;
}
.ag-alloc-wrap .ag-cell-edit-wrapper input {
  font-family: 'DM Mono', monospace !important;
  font-size: 12px !important;
}
.ag-alloc-wrap .ag-row-focus {
  background: #FDFCFF;
}
.ag-alloc-wrap .ag-cell-focus:not(.ag-cell-range-selected) {
  border: 1.5px solid #7C6FE0 !important;
}
.ag-alloc-wrap .ag-pinned-left-cols-container .ag-cell {
  border-right: 1.5px solid #DDDAF5 !important;
}
.ag-alloc-wrap .ag-ltr .ag-cell-focus.ag-cell-range-selected:focus-within {
  border-color: #7C6FE0 !important;
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

  // ── Stable refs (avoids column rebuild on every store change) ──
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

  // ── Quick filter state ─────────────────────────────────────────
  const [quickFilter, setQuickFilter] = useState('')

  // ── Refresh display when store changes (external AI fill, etc.) ─
  useEffect(() => {
    gridRef.current?.api?.refreshCells({ force: true })
  }, [subjectAllocations])

  // Also keep capRef in sync
  useEffect(() => {
    capRef.current = cap
    gridRef.current?.api?.refreshCells({ force: true })
  }, [cap])

  // ── Row data — stable section metadata only ────────────────────
  const rowData = useMemo<RowData[]>(() =>
    (sections as Section[]).map((sec: any) => ({
      __sectionId: sec.id,
      sectionName: sec.name,
    })), [sections])

  // ── Grid context — stable (callbacks use getter fns) ──────────
  const gridContext = useMemo<GridContext>(() => ({
    getAllocations: () => allocationsRef.current,
    getCap: () => capRef.current,
    getDisplayMode: () => displayModeRef.current,
    getPeriodMinutes: () => periodMinutesRef.current,
  }), [])

  // ── Column definitions ─────────────────────────────────────────
  // Rebuilt only when subjects list changes (not on every store update)
  const columnDefs = useMemo<ColDef<RowData>[]>(() => {
    const cols: ColDef<RowData>[] = [
      // ── Class column (pinned left) ─────────────────────────────
      {
        headerName: 'Class',
        colId: 'sectionName',
        field: 'sectionName',
        pinned: 'left',
        width: 112,
        minWidth: 90,
        editable: false,
        lockPinned: true,
        suppressMovable: true,
        suppressNavigable: true,
        cellStyle: {
          fontWeight: 700,
          fontSize: 12,
          color: '#13111E',
          fontFamily: "'DM Sans', sans-serif",
          background: '#FAFAFA',
        },
      },
      // ── Used/capacity column (pinned left, computed) ───────────
      {
        headerName: 'Used',
        colId: '__usage',
        pinned: 'left',
        width: 88,
        minWidth: 80,
        editable: false,
        lockPinned: true,
        suppressMovable: true,
        suppressNavigable: true,
        cellRenderer: UsageCellRenderer,
        cellStyle: (params) => {
          const sectionName = params.data?.sectionName ?? ''
          const alloc = allocationsRef.current
          const c = capacityForSection(capRef.current, inferBandFromSection(sectionName))
          let u = 0
          Object.values(alloc[sectionName] ?? {}).forEach(raw => {
            if (!raw || raw === '0') return
            const p = parseAllocation(raw)
            if (p.valid) u += p.weeklyTotal
          })
          const status = utilisationStatus(u, c)
          if (status === 'over') return { background: '#FEF2F2' }
          if (status === 'tight') return { background: '#FFFBEB' }
          return { background: '#FAFAFA' }
        },
        // valueGetter used for CSV export value
        valueGetter: (params) => {
          const sectionName = params.data?.sectionName ?? ''
          const alloc = allocationsRef.current
          const c = capacityForSection(capRef.current, inferBandFromSection(sectionName))
          let u = 0
          Object.values(alloc[sectionName] ?? {}).forEach(raw => {
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
      cols.push({
        headerName: sub.shortName ?? sub.name,
        colId: `subj:${sub.name}`,
        // no `field` — data comes from valueGetter (store-backed)
        editable: true,
        width: Math.max(56, Math.min(80, (sub.shortName ?? sub.name).length * 9 + 24)),
        minWidth: 50,
        headerTooltip: sub.name,
        type: 'numericColumn',

        // ── Read from store ──
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

        // ── Write to store (same-grade propagation) ──
        valueSetter: (params: ValueSetterParams<RowData>) => {
          let val = String(params.newValue ?? '').trim()
          if (displayModeRef.current === 'hours') {
            val = parseHoursInput(val, periodMinutesRef.current)
          }

          const sectionName = params.data?.sectionName ?? ''
          const grade = gradeOf(sectionName)
          const secs = sectionsRef.current
          const siblings = secs.filter(
            (s: Section) => gradeOf(s.name) === grade && s.name !== sectionName
          )

          const merged: Record<string, Record<string, string>> = { ...allocationsRef.current }
          const applyToSection = (secName: string) => {
            const existing = { ...(allocationsRef.current[secName] ?? {}) }
            if (val === '') {
              delete existing[sub.name]
            } else {
              existing[sub.name] = val
            }
            if (Object.keys(existing).length === 0) delete merged[secName]
            else merged[secName] = existing
          }

          applyToSection(sectionName)
          siblings.forEach((s: Section) => applyToSection(s.name))

          store.setSubjectAllocations?.(merged)

          // Refresh siblings so their cells update immediately
          if (siblings.length > 0) {
            setTimeout(() => {
              gridRef.current?.api?.refreshCells({ force: true })
            }, 0)
          }

          return true
        },

        // ── Validation background ──
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

        // ── Placeholder hint ──
        tooltipValueGetter: () =>
          sub.periodsPerWeek
            ? `Default: ${displayModeRef.current === 'hours'
                ? toHourMin(sub.periodsPerWeek, periodMinutesRef.current)
                : String(sub.periodsPerWeek)}`
            : undefined,
      })
    })

    return cols
  }, [subjects]) // Only rebuild when subjects change

  // ── Context menu ──────────────────────────────────────────────
  const getContextMenuItems = useCallback((
    params: GetContextMenuItemsParams<RowData>
  ): (MenuItemDef | string)[] => {
    const clearSelectedCells = () => {
      const ranges = params.api.getCellRanges()
      const merged: Record<string, Record<string, string>> = { ...allocationsRef.current }

      const clearCell = (rowIndex: number, colId: string) => {
        if (!colId.startsWith('subj:')) return
        const subName = colId.slice(5)
        const node = params.api.getDisplayedRowAtIndex(rowIndex)
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
          const startRow = Math.min(range.startRow!.rowIndex, range.endRow!.rowIndex)
          const endRow = Math.max(range.startRow!.rowIndex, range.endRow!.rowIndex)
          range.columns.forEach(col => {
            for (let i = startRow; i <= endRow; i++) {
              clearCell(i, col.getColId())
            }
          })
        })
      } else {
        const focused = params.api.getFocusedCell()
        if (focused) clearCell(focused.rowIndex, focused.column.getColId())
      }

      store.setSubjectAllocations?.(merged)
    }

    return [
      'copy',
      'copyWithHeaders',
      'paste',
      'cut',
      'separator',
      {
        name: 'Clear cell(s)',
        shortcut: 'Del',
        action: clearSelectedCells,
      },
      'separator',
      'export',
    ]
  }, [store])

  // ── AI fill (on mount + manual) ────────────────────────────────
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
    const cap = capRef.current
    const alloc = allocationsRef.current
    const subjs = subjects as Subject[]

    const rowTotals: Record<string, number> = {}
    secs.forEach((sec: Section) => {
      const row = alloc[sec.name] ?? {}
      let total = 0
      subjs.forEach((sub: Subject) => {
        const raw = row[sub.name]
        if (!raw || raw === '0') return
        const parsed = parseAllocation(raw)
        if (parsed.valid) total += parsed.weeklyTotal
      })
      rowTotals[sec.name] = total
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

  // ── Grid ready ─────────────────────────────────────────────────
  const onGridReady = useCallback((_params: GridReadyEvent) => {
    // Auto-size pinned columns; fit remaining to container
    // (no auto-size for subject cols — they have fixed widths)
  }, [])

  // ── Grid height: fills available space up to a max ─────────────
  const gridHeight = Math.max(240, Math.min(640, (rowData.length * 32) + 34 + 4))

  return (
    <div className="ag-alloc-wrap" style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>

      {/* ── Inject scoped styles ── */}
      <style>{GRID_STYLES}</style>

      {/* ── Toolbar ── */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap',
        padding: '5px 10px',
        background: '#FAFAFA',
        border: '1px solid #EBEBEF',
        borderBottom: 'none',
        borderRadius: '8px 8px 0 0',
        minHeight: 36,
      }}>
        {/* Parent-provided controls (Periods/Hours, AI Fill, Reports…) */}
        {toolbarExtra}

        {/* Spacer */}
        <div style={{ flex: 1 }} />

        {/* Export CSV */}
        <button
          onClick={() => gridRef.current?.api?.exportDataAsCsv()}
          title="Export to CSV"
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 4,
            padding: '3px 8px', borderRadius: 5,
            border: '1px solid #E5E5EA', background: 'transparent',
            color: '#8B87AD', fontSize: 10.5, fontWeight: 600,
            cursor: 'pointer', fontFamily: 'inherit',
          }}
        >
          <Download size={10} /> CSV
        </button>

        {/* Quick search */}
        <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
          <Search size={11} style={{
            position: 'absolute', left: 7, color: '#B0ADCA', pointerEvents: 'none',
          }} />
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
              borderRadius: 5, border: '1px solid #E5E5EA',
              background: '#fff', color: '#13111E',
              fontSize: 11, fontFamily: 'inherit', outline: 'none',
              width: 110,
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
          borderRadius: '0 0 8px 8px',
          border: '1px solid #EBEBEF',
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
            suppressSizeToFit: false,
            suppressMovable: false,
            // Right-align subject (numeric) columns by default
            // (overridden per-column with type:'numericColumn')
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
            handle: {
              mode: 'fill',
              direction: 'xy',
            },
          }}

          // ── Layout ──
          rowHeight={32}
          headerHeight={34}
          animateRows={false}
          domLayout="normal"

          // ── Context menu ──
          getContextMenuItems={getContextMenuItems}

          // ── Events ──
          onGridReady={onGridReady}

          // ── Tooltip ──
          tooltipShowDelay={400}
        />
      </div>

      {/* ── Keyboard hints ── */}
      <div style={{
        display: 'flex', gap: 14, padding: '4px 10px',
        fontSize: 9.5, color: '#B0ADCA', fontFamily: "'DM Mono', monospace",
      }}>
        {[
          ['↵ / F2', 'Edit'],
          ['Esc', 'Cancel'],
          ['Del', 'Clear'],
          ['Ctrl+C/V', 'Copy/Paste'],
          ['Ctrl+Z', 'Undo'],
          ['⬛ drag', 'Fill'],
        ].map(([k, v]) => (
          <span key={k}>
            <span style={{ fontWeight: 700, color: '#9B97B8' }}>{k}</span>
            {' '}{v}
          </span>
        ))}
      </div>
    </div>
  )
}
