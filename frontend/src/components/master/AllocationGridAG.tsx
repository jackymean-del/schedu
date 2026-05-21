/**
 * AllocationGridAG — AG Grid Enterprise period-allocation spreadsheet.
 *
 * ── UNDO ARCHITECTURE ────────────────────────────────────────────────────────
 * AG Grid's `undoRedoCellEditing` is DISABLED.  It is unreliable with
 * Zustand external stores: AG Grid's internal undo queue fires BEFORE
 * onCellKeyDown, creating races where undo runs twice or silently discards.
 *
 * Instead we own a simple immutable snapshot stack:
 *   pushUndo()             → snapshot current state before any write
 *   onCellKeyDown Ctrl+Z   → pop + restore
 *   onCellKeyDown Ctrl+Y   → redo
 *
 * Every write path calls pushUndo() before mutating: valueSetter (normal edit),
 * onPasteStart (one push per paste batch), context-menu clear, AI fill.
 *
 * ── COPY / MARCHING ANTS ────────────────────────────────────────────────────
 * AG Grid handles the actual Ctrl+C clipboard write.  We track copy-active
 * state in React and apply CSS to the selection range:
 *   - Top/bottom outer cells get animated dashed lines (::before / ::after)
 *   - Left/right outer cells get solid inset box-shadow
 * State cleared on: Ctrl+V, Ctrl+X, Esc, paste, new edit.
 *
 * ── ESC KEY ─────────────────────────────────────────────────────────────────
 * In edit mode   → AG Grid cancels the edit natively (we return early)
 * In select mode → onCellKeyDown clears the cell selection
 *
 * ── KEYBOARD CONTRACT ───────────────────────────────────────────────────────
 *  Single click     select         Double-click / Enter / type   edit
 *  Esc (editing)    cancel         Esc (selecting)               clear selection
 *  Delete/Bksp      clear range    Ctrl+C                        copy + march
 *  Ctrl+V           paste          Ctrl+X                        cut
 *  Ctrl+Z           undo (custom)  Ctrl+Shift+Z / Ctrl+Y         redo
 *  Tab              confirm+right  Arrow keys                    navigate
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
  type CellSelectionChangedEvent,
  type CellValueChangedEvent,
  type CellKeyDownEvent,
} from 'ag-grid-community'
import { AllEnterpriseModule } from 'ag-grid-enterprise'

import { useTimetableStore } from '@/store/timetableStore'
import type { Subject, Section, Period } from '@/types'
import { parseAllocation, validateAllocationCapacity } from '@/lib/allocationSyntax'
import {
  computeCapacity, capacityForSection, inferBandFromSection, utilisationStatus,
} from '@/lib/capacityEngine'
import { Search, ChevronDown } from 'lucide-react'

ModuleRegistry.registerModules([AllCommunityModule, AllEnterpriseModule])

// ─────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────

function gradeOf(name: string): string {
  const parts = name.split('-')
  return parts.length > 1 ? parts.slice(0, -1).join('-') : name
}

function toHourMin(p: number, pm: number): string {
  const m = Math.round(p * pm)
  const h = Math.floor(m / 60), rem = m % 60
  if (h === 0) return `${rem}m`
  if (rem === 0) return `${h}h`
  return `${h}h${rem}m`
}

function parseHoursInput(val: string, pm: number): string {
  val = val.trim()
  const hm = val.match(/^(\d+)h\s*(\d+)m?$/i)
  if (hm) return String(Math.max(0, Math.round((+hm[1] * 60 + +hm[2]) / pm)))
  const h = val.match(/^(\d+(?:\.\d+)?)h$/i)
  if (h)  return String(Math.max(0, Math.round(parseFloat(h[1]) * 60 / pm)))
  const m = val.match(/^(\d+(?:\.\d+)?)m$/i)
  if (m)  return String(Math.max(0, Math.round(parseFloat(m[1]) / pm)))
  const n = parseFloat(val)
  if (!isNaN(n) && n >= 0) return String(Math.max(0, Math.round(n * 60 / pm)))
  return ''
}

function abbrev(name: string, shortName?: string | null): string {
  if (shortName) {
    const s = shortName.trim()
    return s.length <= 5 ? s.toUpperCase() : s.slice(0, 3).toUpperCase()
  }
  const words = name.trim().split(/[\s_-]+/).filter(Boolean)
  if (words.length >= 2) return words.slice(0, 4).map(w => (w[0] ?? '').toUpperCase()).join('')
  return name.slice(0, 3).toUpperCase()
}

// ─────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────

interface RowData { __sectionId: string; sectionName: string }

interface GridContext {
  getAllocations:   () => Record<string, Record<string, string>>
  getCap:           () => ReturnType<typeof computeCapacity>
  getCapOverrides:  () => Record<string, number>
  getDisplayMode:   () => 'periods' | 'hours'
  getPeriodMinutes: () => number
}

function effectiveCap(ctx: GridContext, sn: string): number {
  const o = ctx.getCapOverrides()[sn]
  return o !== undefined ? o : capacityForSection(ctx.getCap(), inferBandFromSection(sn))
}

// Undo/redo snapshot
interface Snapshot {
  alloc:       Record<string, Record<string, string>>
  capOverrides: Record<string, number>
}

// ─────────────────────────────────────────────────────────────────
// Usage cell renderer — shows "41 / 48•"
// ─────────────────────────────────────────────────────────────────

function UsageCellRenderer(params: ICellRendererParams<RowData>) {
  const ctx = params.context as GridContext
  const sn  = params.data?.sectionName ?? ''
  const alloc = ctx.getAllocations()
  const displayMode = ctx.getDisplayMode()
  const pm = ctx.getPeriodMinutes()

  const c = effectiveCap(ctx, sn)
  let u = 0
  Object.values(alloc[sn] ?? {}).forEach(raw => {
    if (!raw || raw === '0') return
    const p = parseAllocation(raw)
    if (p.valid) u += p.weeklyTotal
  })

  const status    = utilisationStatus(u, c)
  const dotColor  = status === 'over' ? '#DC2626' : status === 'tight' ? '#D97706' : status === 'ok' ? '#16A34A' : u > 0 ? '#2563EB' : '#D1D5DB'
  const textColor = status === 'over' ? '#DC2626' : status === 'tight' ? '#92400E' : '#4B5275'
  const uLabel    = displayMode === 'hours' ? toHourMin(u, pm) : String(u)
  const cLabel    = displayMode === 'hours' ? toHourMin(c, pm) : String(c)

  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 5, padding: '0 8px', height: '100%' }}>
      <span style={{ fontSize: 11, fontWeight: 700, color: textColor, fontFamily: "'DM Mono', monospace", whiteSpace: 'nowrap', letterSpacing: '-0.01em' }}>
        {uLabel}
        <span style={{ color: '#D1CCF0', fontWeight: 400 }}>/</span>
        <span style={{ color: '#9B8EF5', borderBottom: '1px dashed #C4BDFF' }}>{cLabel}</span>
      </span>
      <span style={{ width: 5, height: 5, borderRadius: '50%', background: dotColor, flexShrink: 0, opacity: 0.85 }} />
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────
// Export dropdown
// ─────────────────────────────────────────────────────────────────

function ExportDropdown({ onCsv, onExcel }: { onCsv: () => void; onExcel: () => void }) {
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
      <button onClick={() => setOpen(o => !o)}
        style={{ display: 'inline-flex', alignItems: 'center', gap: 3, padding: '3px 8px', borderRadius: 5, border: '1px solid #E5E5EA', background: 'transparent', color: '#8B87AD', fontSize: 10.5, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
        Export <ChevronDown size={9} />
      </button>
      {open && (
        <div style={{ position: 'absolute', top: 'calc(100% + 3px)', right: 0, background: '#fff', border: '1px solid #E8E4FF', borderRadius: 7, boxShadow: '0 4px 12px rgba(0,0,0,0.08)', zIndex: 200, minWidth: 110, padding: '3px 0' }}>
          {[{ label: 'CSV (.csv)', fn: () => { onCsv(); setOpen(false) } }, { label: 'Excel (.xlsx)', fn: () => { onExcel(); setOpen(false) } }].map(({ label, fn }) => (
            <button key={label} onClick={fn}
              style={{ display: 'block', width: '100%', padding: '6px 14px', border: 'none', background: 'transparent', textAlign: 'left', fontSize: 11, color: '#13111E', cursor: 'pointer', fontFamily: 'inherit', fontWeight: 500 }}
              onMouseEnter={e => (e.currentTarget.style.background = '#F5F2FF')}
              onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
              {label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────
// Scoped CSS
// ─────────────────────────────────────────────────────────────────

const GRID_STYLES = `
.ag-alloc-wrap .ag-theme-quartz {
  --ag-border-color: #EFEFF3;
  --ag-header-background-color: #F8F7FC;
  --ag-background-color: #ffffff;
  --ag-odd-row-background-color: #ffffff;
  --ag-row-hover-color: #FAFAFD;
  --ag-selected-row-background-color: #F3F0FF;
  --ag-range-selection-border-color: #A99FF5;
  --ag-range-selection-background-color: rgba(124,111,224,0.04);
  --ag-range-selection-highlight-color: rgba(124,111,224,0.12);
  --ag-cell-horizontal-padding: 7px;
  --ag-font-family: 'DM Sans', sans-serif;
  --ag-font-size: 12px;
  --ag-foreground-color: #13111E;
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
  --ag-row-numbers-background-color: #F8F7FC;
  font-family: 'DM Sans', sans-serif;
}
.ag-alloc-wrap .ag-header-cell-menu-button,
.ag-alloc-wrap .ag-header-cell-filter-button { display: none !important; }

.ag-alloc-wrap .ag-header-cell-label {
  font-size: 10.5px; font-weight: 700; color: #6B6B8A;
  letter-spacing: 0.03em; text-transform: uppercase; justify-content: flex-end;
}
.ag-alloc-wrap [col-id="sectionName"] .ag-header-cell-label {
  justify-content: flex-start; text-transform: none; letter-spacing: 0; font-size: 11px;
}
.ag-alloc-wrap .ag-row-number {
  font-size: 10px; color: #A8A4C0; font-family: 'DM Mono', monospace;
  background: #F8F7FC !important; border-right: 1px solid #E8E4FF !important; cursor: pointer;
}
.ag-alloc-wrap .ag-row-number:hover { background: #EDE9FF !important; color: #7C6FE0; }
.ag-alloc-wrap .ag-row-number-header { background: #F8F7FC !important; border-right: 1px solid #E8E4FF !important; }

.ag-alloc-wrap .ag-cell { line-height: 32px; position: relative; overflow: visible; }
.ag-alloc-wrap .ag-cell-focus:not(.ag-cell-range-selected):not(.ag-cell-inline-editing) {
  border: 1px solid #A99FF5 !important; outline: none;
}
.ag-alloc-wrap .ag-cell-inline-editing {
  border: 1.5px solid #7C6FE0 !important;
  box-shadow: 0 0 0 2px rgba(124,111,224,0.15) !important; border-radius: 2px;
}
.ag-alloc-wrap .ag-cell-edit-wrapper input {
  font-family: 'DM Mono', monospace !important; font-size: 12px !important;
  font-weight: 600; color: #13111E !important; text-align: right;
}
.ag-alloc-wrap .ag-pinned-left-header {
  border-right: 1px solid #E4E1F5 !important;
  box-shadow: 3px 0 8px -3px rgba(80,60,160,0.08);
}
.ag-alloc-wrap .ag-pinned-left-cols-container {
  border-right: 1px solid #E4E1F5 !important;
  box-shadow: 3px 0 8px -3px rgba(80,60,160,0.06);
}
.ag-alloc-wrap .ag-pinned-left-header .ag-header-cell,
.ag-alloc-wrap .ag-pinned-left-cols-container .ag-cell { background: #FAFAFA !important; }
.ag-alloc-wrap .ag-row-hover .ag-cell { background: #FAFAFD !important; }
.ag-alloc-wrap .ag-pinned-left-cols-container .ag-row-hover .ag-cell { background: #F6F4FE !important; }
.ag-alloc-wrap .ag-cell-range-selected { background-color: rgba(124,111,224,0.05) !important; }
.ag-alloc-wrap .ag-fill-handle { background: #7C6FE0; border: 1.5px solid #fff; width: 6px !important; height: 6px !important; border-radius: 1px; }
.ag-alloc-wrap .ag-body-horizontal-scroll-viewport::-webkit-scrollbar { height: 5px; }
.ag-alloc-wrap .ag-body-horizontal-scroll-viewport::-webkit-scrollbar-thumb { background: #D1CCF0; border-radius: 3px; }

/* ── Marching ants: shown while copy-active ────────────────────── */
@keyframes march-right { to { background-position-x: 10px; } }
@keyframes march-left  { to { background-position-x: -10px; } }

/* Top edge: animated dashes via ::before */
.ag-alloc-wrap.copy-active .ag-cell.ag-cell-range-selected.ag-cell-range-top::before {
  content: '';
  position: absolute;
  top: 0; left: 0; right: 0; height: 2px;
  background: repeating-linear-gradient(90deg, #7C6FE0 0 5px, rgba(124,111,224,0.15) 5px 10px);
  background-size: 10px 2px;
  animation: march-right 0.35s linear infinite;
  z-index: 6; pointer-events: none;
}

/* Bottom edge: animated dashes via ::after (marches opposite direction) */
.ag-alloc-wrap.copy-active .ag-cell.ag-cell-range-selected.ag-cell-range-bottom::after {
  content: '';
  position: absolute;
  bottom: 0; left: 0; right: 0; height: 2px;
  background: repeating-linear-gradient(90deg, #7C6FE0 0 5px, rgba(124,111,224,0.15) 5px 10px);
  background-size: 10px 2px;
  animation: march-left 0.35s linear infinite;
  z-index: 6; pointer-events: none;
}

/* Left edge: solid inset shadow */
.ag-alloc-wrap.copy-active .ag-cell.ag-cell-range-selected.ag-cell-range-left {
  box-shadow: inset 2px 0 0 #7C6FE0;
}
/* Right edge: solid inset shadow */
.ag-alloc-wrap.copy-active .ag-cell.ag-cell-range-selected.ag-cell-range-right {
  box-shadow: inset -2px 0 0 #7C6FE0;
}
/* Corner combinations */
.ag-alloc-wrap.copy-active .ag-cell.ag-cell-range-selected.ag-cell-range-left.ag-cell-range-right {
  box-shadow: inset 2px 0 0 #7C6FE0, inset -2px 0 0 #7C6FE0;
}
.ag-alloc-wrap.copy-active .ag-cell.ag-cell-range-selected.ag-cell-range-left.ag-cell-range-bottom {
  box-shadow: inset 2px 0 0 #7C6FE0;
}
.ag-alloc-wrap.copy-active .ag-cell.ag-cell-range-selected.ag-cell-range-right.ag-cell-range-bottom {
  box-shadow: inset -2px 0 0 #7C6FE0;
}
/* Also highlight the selection range content slightly */
.ag-alloc-wrap.copy-active .ag-cell.ag-cell-range-selected {
  background-color: rgba(124,111,224,0.07) !important;
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
// Component
// ─────────────────────────────────────────────────────────────────

export function AllocationGridAG({
  displayMode = 'periods',
  periodMinutes = 40,
  toolbarExtra,
}: Props) {
  const store = useTimetableStore() as any
  const { sections, subjects, subjectAllocations, sectionCapacityOverrides = {}, config } = store
  const periods: Period[] = store.periods ?? []
  const workDays: string[] = config?.workDays ?? ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY']

  const cap = useMemo(() => computeCapacity(workDays, periods), [workDays, periods])

  // ── Stable refs (updated every render so closures see latest values) ──
  // CRITICAL: allocationsRef updated IMMEDIATELY inside valueSetter so that
  // valueGetter returns the correct newValue right after valueSetter returns.
  const allocationsRef  = useRef<Record<string, Record<string, string>>>(subjectAllocations)
  allocationsRef.current = subjectAllocations

  const capOverrideRef  = useRef<Record<string, number>>(sectionCapacityOverrides)
  capOverrideRef.current = sectionCapacityOverrides

  const capRef          = useRef(cap); capRef.current = cap
  const sectionsRef     = useRef<Section[]>(sections); sectionsRef.current = sections
  const displayModeRef  = useRef(displayMode); displayModeRef.current = displayMode
  const periodMinRef    = useRef(periodMinutes); periodMinRef.current = periodMinutes
  const gridRef         = useRef<AgGridReact<RowData>>(null)

  // Paste-in-progress: skip sibling sync + skip undo push per-cell
  const isPastingRef = useRef(false)

  // ── Custom undo / redo stacks ─────────────────────────────────
  // We own undo because AG Grid's undoRedoCellEditing is unreliable with
  // external Zustand stores (timing races, double-undo on Ctrl+Z).
  const undoStack = useRef<Snapshot[]>([])
  const redoStack = useRef<Snapshot[]>([])

  const pushUndo = useCallback(() => {
    undoStack.current.push({
      alloc:       { ...allocationsRef.current },
      capOverrides: { ...capOverrideRef.current },
    })
    redoStack.current = []   // any new edit clears redo
    if (undoStack.current.length > 300) undoStack.current.shift()
  }, [])

  // ── Copy / marching ants state ────────────────────────────────
  const [copyActive, setCopyActive] = useState(false)
  const copyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const clearCopy = useCallback(() => {
    setCopyActive(false)
    if (copyTimerRef.current) { clearTimeout(copyTimerRef.current); copyTimerRef.current = null }
  }, [])

  // ── UI ────────────────────────────────────────────────────────
  const [quickFilter, setQuickFilter] = useState('')
  const [statusBar, setStatusBar] = useState<{ cells: number; periods: number; avg: number } | null>(null)

  // ── Row data ──────────────────────────────────────────────────
  const rowData = useMemo<RowData[]>(() =>
    (sections as Section[]).map((sec: any) => ({
      __sectionId: sec.id, sectionName: sec.name,
    })), [sections])

  // ── Grid context ──────────────────────────────────────────────
  const gridContext = useMemo<GridContext>(() => ({
    getAllocations:   () => allocationsRef.current,
    getCap:           () => capRef.current,
    getCapOverrides:  () => capOverrideRef.current,
    getDisplayMode:   () => displayModeRef.current,
    getPeriodMinutes: () => periodMinRef.current,
  }), [])

  // ─────────────────────────────────────────────────────────────
  // Column definitions
  // ─────────────────────────────────────────────────────────────
  const columnDefs = useMemo<ColDef<RowData>[]>(() => {
    const cols: ColDef<RowData>[] = [

      // ── Class ────────────────────────────────────────────────
      {
        headerName: 'Class', colId: 'sectionName', field: 'sectionName',
        pinned: 'left', width: 120, minWidth: 90,
        editable: false, lockPinned: true, suppressMovable: true, suppressNavigable: true,
        sortable: true,
        cellStyle: { fontWeight: 600, fontSize: 11.5, color: '#13111E', fontFamily: "'DM Sans', sans-serif", paddingLeft: 10 },
      },

      // ── Used / Capacity (editable denominator) ───────────────
      {
        headerName: 'Used', colId: '__usage',
        headerTooltip: 'Used / Max.  Double-click the capacity number to override it per section.',
        pinned: 'left', width: 80, minWidth: 72,
        editable: true,       // capacity denominator is editable
        lockPinned: true, suppressMovable: true, sortable: false,
        cellRenderer: UsageCellRenderer,

        // valueGetter returns capacity — editor shows/changes this value
        valueGetter: (params) => {
          const sn = params.data?.sectionName ?? ''
          const o = capOverrideRef.current[sn]
          return o !== undefined ? o : capacityForSection(capRef.current, inferBandFromSection(sn))
        },

        valueSetter: (params) => {
          const sn = params.data?.sectionName ?? ''
          const n = parseInt(String(params.newValue ?? ''), 10)
          if (isNaN(n) || n < 0) return false
          pushUndo()
          capOverrideRef.current = { ...capOverrideRef.current, [sn]: n }
          store.setSectionCapacityOverrides?.(capOverrideRef.current)
          return true
        },

        cellStyle: (params) => {
          const sn = params.data?.sectionName ?? ''
          const c = effectiveCap(gridContext, sn)
          let u = 0
          Object.values(allocationsRef.current[sn] ?? {}).forEach(raw => {
            if (!raw || raw === '0') return
            const p = parseAllocation(raw); if (p.valid) u += p.weeklyTotal
          })
          const s = utilisationStatus(u, c)
          if (s === 'over')  return { background: '#FEF2F2' }
          if (s === 'tight') return { background: '#FFFBEB' }
          return null
        },
      },
    ]

    // ── Subject columns ─────────────────────────────────────────
    ;(subjects as Subject[]).forEach((sub: Subject) => {
      const hdr = abbrev(sub.name, sub.shortName)
      cols.push({
        headerName: hdr,
        colId: `subj:${sub.name}`,
        editable: true,
        width: Math.max(52, Math.min(64, hdr.length * 10 + 22)),
        minWidth: 48, maxWidth: 90,
        sortable: true,
        headerTooltip: sub.name,

        valueGetter: (params: ValueGetterParams<RowData>) => {
          const sn = params.data?.sectionName ?? ''
          const v = allocationsRef.current[sn]?.[sub.name]
          if (!v || v === '0') return ''
          if (displayModeRef.current === 'hours') {
            const p = parseAllocation(v)
            if (p.valid && p.weeklyTotal > 0) return toHourMin(p.weeklyTotal, periodMinRef.current)
            return ''
          }
          return v
        },

        // ── THE CRITICAL FIX ────────────────────────────────────────────────
        // 1. Push undo BEFORE writing (not during paste — onPasteStart does it once)
        // 2. Update allocationsRef.current IMMEDIATELY before returning true.
        //    AG Grid calls valueGetter() right after valueSetter() to compare
        //    old vs new. If the ref still points at the pre-edit store state
        //    (React hasn't re-rendered yet), old === new → display stays stale.
        valueSetter: (params: ValueSetterParams<RowData>) => {
          let val = String(params.newValue ?? '').trim()
          if (displayModeRef.current === 'hours') val = parseHoursInput(val, periodMinRef.current)

          const sn = params.data?.sectionName ?? ''

          // Push undo for normal edits (paste pushes once in onPasteStart)
          if (!isPastingRef.current) pushUndo()

          // Immediate ref update
          const secRow = { ...(allocationsRef.current[sn] ?? {}) }
          if (val === '') delete secRow[sub.name]; else secRow[sub.name] = val
          const withCurrent = { ...allocationsRef.current }
          if (Object.keys(secRow).length === 0) delete withCurrent[sn]
          else withCurrent[sn] = secRow
          allocationsRef.current = withCurrent

          // Paste: write current section only (no sibling sync, no additional pushUndo)
          if (isPastingRef.current) {
            store.setSubjectAllocations?.(withCurrent)
            return true
          }

          // Normal edit: sibling sync in one atomic store write
          const grade = gradeOf(sn)
          const siblings = (sectionsRef.current as Section[]).filter(
            (s: Section) => gradeOf(s.name) === grade && s.name !== sn
          )
          const merged = { ...withCurrent }
          siblings.forEach((s: Section) => {
            const sibRow = { ...(withCurrent[s.name] ?? {}) }
            if (val === '') delete sibRow[sub.name]; else sibRow[sub.name] = val
            if (Object.keys(sibRow).length === 0) delete merged[s.name]
            else merged[s.name] = sibRow
          })
          store.setSubjectAllocations?.(merged)
          return true
        },

        cellStyle: (params) => {
          const sn = params.data?.sectionName ?? ''
          const rawV = allocationsRef.current[sn]?.[sub.name]
          if (!rawV || rawV === '0') return null
          const parsed = parseAllocation(rawV)
          if (!parsed.valid) return { background: '#FEF2F2' }
          const c = effectiveCap(gridContext, sn)
          if (!validateAllocationCapacity(parsed, c).ok) return { background: '#FFFBEB' }
          return null
        },
      })
    })

    return cols
  }, [subjects, pushUndo, gridContext])

  // ─────────────────────────────────────────────────────────────
  // Keyboard handler — owns Esc / Ctrl+Z / Ctrl+Y / Ctrl+C
  // ─────────────────────────────────────────────────────────────
  const onCellKeyDown = useCallback((e: CellKeyDownEvent<RowData> | any) => {
    const evt = e.event as KeyboardEvent
    if (!evt) return
    const api = e.api
    const isEditing = api.getEditingCells().length > 0
    const ctrl = evt.ctrlKey || evt.metaKey

    // ── In edit mode: only block Ctrl+Z / Ctrl+Y to prevent browser undo ──
    // Leave everything else to AG Grid's native editor handling (Esc, Enter, Tab).
    if (isEditing) {
      if (ctrl && (evt.key === 'z' || evt.key === 'y')) {
        evt.preventDefault()  // don't let browser undo native text input
      }
      return
    }

    // ── Esc: clear cell selection ──
    if (evt.key === 'Escape') {
      api.clearCellSelection()
      clearCopy()
      return
    }

    // ── Ctrl+C: activate marching ants ──
    if (ctrl && evt.key === 'c') {
      setCopyActive(true)
      if (copyTimerRef.current) clearTimeout(copyTimerRef.current)
      // Auto-clear marching ants after 6 seconds (like Excel dismisses if no paste)
      copyTimerRef.current = setTimeout(() => setCopyActive(false), 6000)
      // Do NOT preventDefault — let AG Grid handle the actual clipboard write
      return
    }

    // ── Ctrl+V / Ctrl+X: clear copy indicator, let AG Grid handle ──
    if (ctrl && (evt.key === 'v' || evt.key === 'x')) {
      clearCopy()
      return
    }

    // ── Ctrl+Z: undo ──
    if (ctrl && evt.key === 'z' && !evt.shiftKey) {
      evt.preventDefault()
      const prev = undoStack.current.pop()
      if (prev) {
        redoStack.current.push({ alloc: allocationsRef.current, capOverrides: capOverrideRef.current })
        allocationsRef.current = prev.alloc
        capOverrideRef.current = prev.capOverrides
        store.setSubjectAllocations?.(prev.alloc)
        store.setSectionCapacityOverrides?.(prev.capOverrides)
        requestAnimationFrame(() => api.refreshCells({ force: false }))
      }
      return
    }

    // ── Ctrl+Shift+Z / Ctrl+Y: redo ──
    if (ctrl && (evt.key === 'y' || (evt.key === 'z' && evt.shiftKey))) {
      evt.preventDefault()
      const next = redoStack.current.pop()
      if (next) {
        undoStack.current.push({ alloc: allocationsRef.current, capOverrides: capOverrideRef.current })
        allocationsRef.current = next.alloc
        capOverrideRef.current = next.capOverrides
        store.setSubjectAllocations?.(next.alloc)
        store.setSectionCapacityOverrides?.(next.capOverrides)
        requestAnimationFrame(() => api.refreshCells({ force: false }))
      }
      return
    }
  }, [store, clearCopy, pushUndo])

  // ─────────────────────────────────────────────────────────────
  // onCellValueChanged — surgical refresh for siblings + usage
  // ─────────────────────────────────────────────────────────────
  const onCellValueChanged = useCallback((e: CellValueChangedEvent<RowData>) => {
    if (isPastingRef.current) return  // onPasteEnd handles bulk refresh

    const colId = e.column.getColId()
    const sn    = e.data?.sectionName
    if (!sn) return

    requestAnimationFrame(() => {
      const api = gridRef.current?.api
      if (!api) return

      const findNode = (name: string) => {
        const sec = (sectionsRef.current as Section[]).find((s: any) => s.name === name)
        return sec ? api.getRowNode((sec as any).id) : null
      }

      if (colId === '__usage') {
        const node = findNode(sn)
        if (node) api.refreshCells({ rowNodes: [node as any], force: false })
        return
      }
      if (!colId.startsWith('subj:')) return

      const grade    = gradeOf(sn)
      const siblings = (sectionsRef.current as Section[]).filter(s => gradeOf(s.name) === grade && s.name !== sn)
      const thisNode  = findNode(sn)
      const sibNodes  = siblings.map(s => findNode(s.name)).filter(Boolean)
      const allNodes  = [thisNode, ...sibNodes].filter(Boolean) as any[]

      if (sibNodes.length) api.refreshCells({ rowNodes: sibNodes as any, columns: [colId], force: false })
      api.refreshCells({ rowNodes: allNodes, columns: ['__usage'], force: false })
    })
  }, [])

  // ─────────────────────────────────────────────────────────────
  // Paste: one undo push at start, full refresh at end
  // ─────────────────────────────────────────────────────────────
  const onPasteStart = useCallback(() => {
    isPastingRef.current = true
    pushUndo()  // capture pre-paste state once
    clearCopy()
  }, [pushUndo, clearCopy])

  const onPasteEnd = useCallback(() => {
    isPastingRef.current = false
    requestAnimationFrame(() => gridRef.current?.api?.refreshCells({ force: false }))
  }, [])

  // ─────────────────────────────────────────────────────────────
  // Context menu
  // ─────────────────────────────────────────────────────────────
  const getContextMenuItems = useCallback((
    params: GetContextMenuItemsParams<RowData>
  ): (DefaultMenuItem | MenuItemDef<RowData>)[] => {

    const clearRanges = () => {
      pushUndo()
      const ranges = params.api.getCellRanges()
      const merged: Record<string, Record<string, string>> = { ...allocationsRef.current }
      const clearCell = (ri: number, colId: string) => {
        if (!colId.startsWith('subj:')) return
        const node = params.api.getDisplayedRowAtIndex(ri)
        if (!node?.data) return
        const sn = node.data.sectionName
        if (!merged[sn]) return
        const copy = { ...merged[sn] }; delete copy[colId.slice(5)]
        if (Object.keys(copy).length === 0) delete merged[sn]; else merged[sn] = copy
      }
      if (ranges?.length) {
        ranges.forEach(r => {
          const r0 = Math.min(r.startRow!.rowIndex, r.endRow!.rowIndex)
          const r1 = Math.max(r.startRow!.rowIndex, r.endRow!.rowIndex)
          r.columns.forEach(col => { for (let i = r0; i <= r1; i++) clearCell(i, col.getColId()) })
        })
      } else {
        const f = params.api.getFocusedCell()
        if (f) clearCell(f.rowIndex, f.column.getColId())
      }
      allocationsRef.current = merged
      store.setSubjectAllocations?.(merged)
      requestAnimationFrame(() => gridRef.current?.api?.refreshCells({ force: false }))
    }

    const clearRow = () => {
      pushUndo()
      const node = params.node
      if (!node?.data) return
      const sn = node.data.sectionName
      const merged = { ...allocationsRef.current }
      delete merged[sn]
      allocationsRef.current = merged
      store.setSubjectAllocations?.(merged)
      requestAnimationFrame(() => {
        if (node) gridRef.current?.api?.refreshCells({ rowNodes: [node as any], force: false })
      })
    }

    return [
      'copy', 'copyWithHeaders', 'paste',
      'separator',
      { name: 'Clear cell(s)',    shortcut: 'Del', action: clearRanges },
      { name: 'Clear entire row',                 action: clearRow    },
      'separator',
      'csvExport', 'excelExport',
    ]
  }, [store, pushUndo])

  // ─────────────────────────────────────────────────────────────
  // Selection → status bar
  // ─────────────────────────────────────────────────────────────
  const onCellSelectionChanged = useCallback((e: CellSelectionChangedEvent<RowData>) => {
    const ranges = e.api.getCellRanges()
    if (!ranges?.length) { setStatusBar(null); return }
    let cells = 0, total = 0
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
          if (rawV && rawV !== '0') { const p = parseAllocation(rawV); if (p.valid) total += p.weeklyTotal }
        }
      })
    })
    if (cells <= 1) { setStatusBar(null); return }
    setStatusBar({ cells, periods: total, avg: cells > 0 ? Math.round((total / cells) * 10) / 10 : 0 })
  }, [])

  // ─────────────────────────────────────────────────────────────
  // AI fill
  // ─────────────────────────────────────────────────────────────
  const handleAISuggest = useCallback(() => {
    pushUndo()
    const secs  = sectionsRef.current as Section[]
    const subjs = subjects as Subject[]
    const next: Record<string, Record<string, string>> = {}

    secs.forEach(sec => {
      const capacity = effectiveCap(gridContext, sec.name)
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
        let used = 0
        ideal.forEach((s, i) => {
          const isLast = i === ideal.length - 1
          const raw = isLast ? Math.max(0, capacity - used) : Math.max(1, Math.floor(s.pw * scale))
          if (raw > 0) row[s.name] = String(raw)
          used += raw
        })
      }
      if (Object.keys(row).length) next[sec.name] = row
    })

    allocationsRef.current = next
    store.setSubjectAllocations?.(next)
    requestAnimationFrame(() => gridRef.current?.api?.refreshCells({ force: false }))
  }, [store, subjects, pushUndo, gridContext])

  // Auto-fill on mount
  useEffect(() => {
    const alloc = allocationsRef.current
    const secs  = sectionsRef.current as Section[]
    const subjs = subjects as Subject[]
    const hasConflicts = secs.some(sec => {
      let u = 0
      subjs.forEach(sub => { const raw = alloc[sec.name]?.[sub.name]; if (!raw || raw === '0') return; const p = parseAllocation(raw); if (p.valid) u += p.weeklyTotal })
      return effectiveCap(gridContext, sec.name) > 0 && u > effectiveCap(gridContext, sec.name)
    })
    const hasAny = Object.values(alloc ?? {}).some(row => Object.values(row ?? {}).some(v => v && String(v).trim() !== '' && v !== '0'))
    if (!hasAny || hasConflicts) handleAISuggest()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Cleanup copy timer on unmount
  useEffect(() => () => { if (copyTimerRef.current) clearTimeout(copyTimerRef.current) }, [])

  const gridHeight = Math.max(200, Math.min(600, rowData.length * 32 + 32 + 2))

  return (
    <div className={`ag-alloc-wrap${copyActive ? ' copy-active' : ''}`}
      style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
      <style>{GRID_STYLES}</style>

      {/* ── Toolbar ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', padding: '5px 10px', background: '#F8F7FC', border: '1px solid #EFEFF3', borderBottom: 'none', borderRadius: '8px 8px 0 0', minHeight: 34 }}>
        {toolbarExtra}
        <div style={{ flex: 1 }} />
        <ExportDropdown
          onCsv={() => gridRef.current?.api?.exportDataAsCsv()}
          onExcel={() => (gridRef.current?.api as any)?.exportDataAsExcel?.()}
        />
        <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
          <Search size={10} style={{ position: 'absolute', left: 7, color: '#C0BDDA', pointerEvents: 'none' }} />
          <input type="text" placeholder="Search…" value={quickFilter}
            onChange={e => { setQuickFilter(e.target.value); gridRef.current?.api?.setGridOption('quickFilterText', e.target.value) }}
            style={{ paddingLeft: 22, paddingRight: 8, paddingTop: 3, paddingBottom: 3, borderRadius: 5, border: '1px solid #ECECF2', background: '#fff', color: '#13111E', fontSize: 10.5, fontFamily: 'inherit', outline: 'none', width: 100 }}
          />
        </div>
      </div>

      {/* ── AG Grid ── */}
      <div className="ag-theme-quartz" style={{ height: gridHeight, width: '100%', border: '1px solid #EFEFF3', borderTop: 'none', overflow: 'hidden' }}>
        <AgGridReact<RowData>
          ref={gridRef}
          rowData={rowData}
          columnDefs={columnDefs}
          defaultColDef={{ sortable: true, resizable: true, suppressMovable: false, suppressHeaderMenuButton: true }}
          getRowId={(p) => p.data.__sectionId}
          context={gridContext}

          rowNumbers={{ width: 40, minWidth: 36 }}

          // ── Editing ──────────────────────────────────────────────
          singleClickEdit={false}
          stopEditingWhenCellsLoseFocus={true}
          enterNavigatesVertically={true}
          enterNavigatesVerticallyAfterEdit={true}
          // undoRedoCellEditing is intentionally OFF — we use custom undo stack

          // ── Clipboard / paste ────────────────────────────────────
          suppressLastEmptyLineOnPaste={true}

          // ── Range + fill handle ──────────────────────────────────
          cellSelection={{
            enableColumnSelection: true,
            handle: { mode: 'fill', direction: 'xy' },
          }}

          ensureDomOrder={true}
          rowHeight={32}
          headerHeight={32}
          animateRows={false}
          domLayout="normal"

          // ── Event handlers ───────────────────────────────────────
          getContextMenuItems={getContextMenuItems}
          onCellValueChanged={onCellValueChanged}
          onCellKeyDown={onCellKeyDown}
          onPasteStart={onPasteStart}
          onPasteEnd={onPasteEnd}
          onCellSelectionChanged={onCellSelectionChanged}

          tooltipShowDelay={500}
          tooltipHideDelay={3000}
        />
      </div>

      {/* ── Hint / status bar ── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '3px 10px', background: '#F8F7FC', border: '1px solid #EFEFF3', borderTop: 'none', borderRadius: '0 0 8px 8px', minHeight: 22 }}>
        <div style={{ display: 'flex', gap: 12 }}>
          {[['↵/F2','Edit'],['Esc','Cancel'],['Del','Clear'],['⌃C/V','Copy/Paste'],['⌃Z','Undo']].map(([k,v]) => (
            <span key={k} style={{ fontSize: 9.5, color: '#C0BDDA', fontFamily: "'DM Mono', monospace" }}>
              <span style={{ fontWeight: 700, color: '#ADA8D0' }}>{k}</span> {v}
            </span>
          ))}
        </div>
        {statusBar && (
          <div style={{ display: 'flex', gap: 10, fontSize: 10, color: '#7C6FE0', fontFamily: "'DM Mono', monospace", fontWeight: 600 }}>
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
