/**
 * AllocationGridAG — Period-allocation spreadsheet.
 *
 * Architecture contract:
 *   AG Grid OWNS — focus, selection, editing, clipboard, undo/redo, keyboard
 *   React/Zustand OWNS — data persistence only
 *
 * One critical sync point that makes AG Grid undo work with Zustand:
 *   allocationsRef.current MUST be updated SYNCHRONOUSLY inside valueSetter
 *   before returning true.  AG Grid calls valueGetter() immediately after
 *   valueSetter() returns to capture newValue for its undo entry.  If the
 *   ref is stale (React hasn't re-rendered yet) valueGetter sees the old
 *   value → old === new → undo entry silently discarded.
 *
 * Nothing else is custom.  No keyboard interceptors, no undo stack,
 * no clipboard hacks.  AG Grid handles Esc / Ctrl+Z / Ctrl+C/V natively.
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
  type ICellRendererParams,
  type CellSelectionChangedEvent,
  type CellValueChangedEvent,
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
  if (h) return String(Math.max(0, Math.round(parseFloat(h[1]) * 60 / pm)))
  const m = val.match(/^(\d+(?:\.\d+)?)m$/i)
  if (m) return String(Math.max(0, Math.round(parseFloat(m[1]) / pm)))
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

// ─────────────────────────────────────────────────────────────────
// Usage cell renderer — "41 / 48•"
// ─────────────────────────────────────────────────────────────────

function UsageCellRenderer(params: ICellRendererParams<RowData>) {
  const ctx = params.context as GridContext
  const sn  = params.data?.sectionName ?? ''
  const alloc = ctx.getAllocations()
  const pm    = ctx.getPeriodMinutes()
  const dm    = ctx.getDisplayMode()
  const c     = effectiveCap(ctx, sn)
  let u = 0
  Object.values(alloc[sn] ?? {}).forEach(raw => {
    if (!raw || raw === '0') return
    const p = parseAllocation(raw); if (p.valid) u += p.weeklyTotal
  })
  const st = utilisationStatus(u, c)
  const dot  = st === 'over' ? '#DC2626' : st === 'tight' ? '#D97706' : st === 'ok' ? '#16A34A' : u > 0 ? '#2563EB' : '#D1D5DB'
  const text = st === 'over' ? '#DC2626' : st === 'tight' ? '#92400E' : '#4B5275'
  const ul   = dm === 'hours' ? toHourMin(u, pm) : String(u)
  const cl   = dm === 'hours' ? toHourMin(c, pm) : String(c)
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 5, padding: '0 8px', height: '100%' }}>
      <span style={{ fontSize: 11, fontWeight: 700, color: text, fontFamily: "'DM Mono', monospace", whiteSpace: 'nowrap' }}>
        {ul}<span style={{ color: '#D1CCF0', fontWeight: 400 }}>/</span>
        <span style={{ color: '#9B8EF5', borderBottom: '1px dashed #C4BDFF' }}>{cl}</span>
      </span>
      <span style={{ width: 5, height: 5, borderRadius: '50%', background: dot, flexShrink: 0, opacity: 0.85 }} />
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
          {[
            { label: 'CSV (.csv)',    fn: () => { onCsv();   setOpen(false) } },
            { label: 'Excel (.xlsx)', fn: () => { onExcel(); setOpen(false) } },
          ].map(({ label, fn }) => (
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
// Grid styles — no overflow:visible, no z-index tricks
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
  --ag-range-selection-border-style: solid;
  --ag-range-selection-background-color: rgba(124,111,224,0.05);
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
  background: #F8F7FC !important; border-right: 1px solid #E8E4FF !important;
}
.ag-alloc-wrap .ag-row-number-header {
  background: #F8F7FC !important; border-right: 1px solid #E8E4FF !important;
}
.ag-alloc-wrap .ag-cell { line-height: 32px; }
.ag-alloc-wrap .ag-cell-focus:not(.ag-cell-range-selected):not(.ag-cell-inline-editing) {
  border: 1px solid #A99FF5 !important; outline: none;
}
.ag-alloc-wrap .ag-cell-inline-editing {
  border: 1.5px solid #7C6FE0 !important;
  box-shadow: 0 0 0 2px rgba(124,111,224,0.15) !important;
}
.ag-alloc-wrap .ag-cell-edit-wrapper input {
  font-family: 'DM Mono', monospace !important; font-size: 12px !important;
  font-weight: 600; color: #13111E !important; text-align: right;
}
.ag-alloc-wrap .ag-pinned-left-header {
  border-right: 1px solid #E4E1F5 !important;
}
.ag-alloc-wrap .ag-pinned-left-cols-container {
  border-right: 1px solid #E4E1F5 !important;
}
.ag-alloc-wrap .ag-pinned-left-header .ag-header-cell,
.ag-alloc-wrap .ag-pinned-left-cols-container .ag-cell {
  background: #FAFAFA !important;
}
.ag-alloc-wrap .ag-cell-range-selected {
  background-color: rgba(124,111,224,0.05) !important;
}
.ag-alloc-wrap .ag-fill-handle {
  background: #7C6FE0; border: 1.5px solid #fff;
  width: 6px !important; height: 6px !important; border-radius: 1px;
}
.ag-alloc-wrap .ag-body-horizontal-scroll-viewport::-webkit-scrollbar { height: 5px; }
.ag-alloc-wrap .ag-body-horizontal-scroll-viewport::-webkit-scrollbar-thumb {
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

  // ── Stable refs — closures always see the latest value without re-creating fns ──
  const allocationsRef  = useRef<Record<string, Record<string, string>>>(subjectAllocations)
  const capOverrideRef  = useRef<Record<string, number>>(sectionCapacityOverrides)
  const capRef          = useRef(cap)
  const sectionsRef     = useRef<Section[]>(sections)
  const displayModeRef  = useRef(displayMode)
  const periodMinRef    = useRef(periodMinutes)
  const gridRef         = useRef<AgGridReact<RowData>>(null)

  // Update refs every render — O(1), no side effects
  allocationsRef.current = subjectAllocations
  capOverrideRef.current = sectionCapacityOverrides
  capRef.current         = cap
  sectionsRef.current    = sections
  displayModeRef.current = displayMode
  periodMinRef.current   = periodMinutes

  // Skip sibling sync + batch refresh during paste operations
  const isPastingRef = useRef(false)

  // ── UI state ─────────────────────────────────────────────────
  const [quickFilter, setQuickFilter] = useState('')
  const [statusBar, setStatusBar] = useState<{ cells: number; periods: number; avg: number } | null>(null)

  // ── Row data ─────────────────────────────────────────────────
  const rowData = useMemo<RowData[]>(() =>
    (sections as Section[]).map((sec: any) => ({
      __sectionId: sec.id,
      sectionName: sec.name,
    }))
  , [sections])

  // ── Grid context — stable, never recreated ────────────────────
  const gridContext = useMemo<GridContext>(() => ({
    getAllocations:   () => allocationsRef.current,
    getCap:           () => capRef.current,
    getCapOverrides:  () => capOverrideRef.current,
    getDisplayMode:   () => displayModeRef.current,
    getPeriodMinutes: () => periodMinRef.current,
  }), [])

  // ── Column definitions — only rebuilt when subjects list changes ──
  const columnDefs = useMemo<ColDef<RowData>[]>(() => {
    const cols: ColDef<RowData>[] = [

      // ── Class (read-only label, navigable) ───────────────────
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
        sortable: true,
        cellStyle: {
          fontWeight: 600,
          fontSize: 11.5,
          color: '#13111E',
          fontFamily: "'DM Sans', sans-serif",
          paddingLeft: 10,
        },
      },

      // ── Used / Capacity (editable denominator) ───────────────
      {
        headerName: 'Used',
        colId: '__usage',
        headerTooltip: 'Used / Capacity.  Click the capacity number to override per section.',
        pinned: 'left',
        width: 82,
        minWidth: 74,
        editable: true,
        lockPinned: true,
        suppressMovable: true,
        sortable: false,
        cellRenderer: UsageCellRenderer,

        valueGetter: (params) => {
          const sn = params.data?.sectionName ?? ''
          const o  = capOverrideRef.current[sn]
          return o !== undefined ? o : capacityForSection(capRef.current, inferBandFromSection(sn))
        },

        valueSetter: (params) => {
          const sn = params.data?.sectionName ?? ''
          const n  = parseInt(String(params.newValue ?? ''), 10)
          if (isNaN(n) || n < 0) return false
          // Synchronous ref update so valueGetter returns new value immediately
          capOverrideRef.current = { ...capOverrideRef.current, [sn]: n }
          store.setSectionCapacityOverrides?.(capOverrideRef.current)
          return true
        },

        cellStyle: (params) => {
          const sn = params.data?.sectionName ?? ''
          const c  = effectiveCap(gridContext, sn)
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
        minWidth: 48,
        maxWidth: 90,
        sortable: true,
        headerTooltip: sub.name,

        valueGetter: (params: ValueGetterParams<RowData>) => {
          const sn = params.data?.sectionName ?? ''
          const v  = allocationsRef.current[sn]?.[sub.name]
          if (!v || v === '0') return ''
          if (displayModeRef.current === 'hours') {
            const p = parseAllocation(v)
            if (p.valid && p.weeklyTotal > 0) return toHourMin(p.weeklyTotal, periodMinRef.current)
            return ''
          }
          return v
        },

        // ── THE CRITICAL CONTRACT ──────────────────────────────
        // allocationsRef.current MUST be updated before returning true.
        // AG Grid calls valueGetter() immediately after valueSetter() to
        // record newValue in its undo entry.  Stale ref → entry discarded.
        valueSetter: (params: ValueSetterParams<RowData>) => {
          let val = String(params.newValue ?? '').trim()
          if (displayModeRef.current === 'hours') val = parseHoursInput(val, periodMinRef.current)

          const sn = params.data?.sectionName ?? ''

          // Synchronous ref update (AG Grid reads this in its immediate valueGetter call)
          const secRow = { ...(allocationsRef.current[sn] ?? {}) }
          if (val === '') delete secRow[sub.name]; else secRow[sub.name] = val
          const withCurrent = { ...allocationsRef.current }
          if (Object.keys(secRow).length === 0) delete withCurrent[sn]; else withCurrent[sn] = secRow
          allocationsRef.current = withCurrent

          // Paste: write only current section (no sibling sync)
          if (isPastingRef.current) {
            store.setSubjectAllocations?.(withCurrent)
            return true
          }

          // Normal edit: propagate to same-grade siblings atomically
          const grade    = gradeOf(sn)
          const siblings = (sectionsRef.current as Section[]).filter(
            (s: Section) => gradeOf(s.name) === grade && s.name !== sn
          )
          const merged = { ...withCurrent }
          siblings.forEach((s: Section) => {
            const sibRow = { ...(withCurrent[s.name] ?? {}) }
            if (val === '') delete sibRow[sub.name]; else sibRow[sub.name] = val
            if (Object.keys(sibRow).length === 0) delete merged[s.name]; else merged[s.name] = sibRow
          })
          store.setSubjectAllocations?.(merged)
          return true
        },

        cellStyle: (params) => {
          const sn   = params.data?.sectionName ?? ''
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
  }, [subjects, gridContext])

  // ── Refresh siblings + usage after each cell edit ─────────────
  const onCellValueChanged = useCallback((e: CellValueChangedEvent<RowData>) => {
    if (isPastingRef.current) return   // onPasteEnd handles bulk refresh

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
      const thisNode = findNode(sn)
      const sibNodes = siblings.map(s => findNode(s.name)).filter(Boolean)
      const allNodes = [thisNode, ...sibNodes].filter(Boolean) as any[]

      if (sibNodes.length) api.refreshCells({ rowNodes: sibNodes as any, columns: [colId], force: false })
      api.refreshCells({ rowNodes: allNodes, columns: ['__usage'], force: false })
    })
  }, [])

  // ── Paste handlers — only flag + bulk refresh ─────────────────
  const onPasteStart = useCallback(() => { isPastingRef.current = true  }, [])
  const onPasteEnd   = useCallback(() => {
    isPastingRef.current = false
    requestAnimationFrame(() => gridRef.current?.api?.refreshCells({ force: false }))
  }, [])

  // ── Selection → status bar ─────────────────────────────────────
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

  // ── AI fill ───────────────────────────────────────────────────
  const handleAISuggest = useCallback(() => {
    const secs  = sectionsRef.current as Section[]
    const subjs = subjects as Subject[]
    const next: Record<string, Record<string, string>> = {}

    secs.forEach(sec => {
      const capacity = effectiveCap(gridContext, sec.name)
      const ideal    = subjs
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
  }, [store, subjects, gridContext])

  // Auto-fill on mount if empty or conflicted
  useEffect(() => {
    const alloc = allocationsRef.current
    const secs  = sectionsRef.current as Section[]
    const subjs = subjects as Subject[]
    const hasConflicts = secs.some(sec => {
      let u = 0
      subjs.forEach(sub => {
        const raw = alloc[sec.name]?.[sub.name]
        if (!raw || raw === '0') return
        const p = parseAllocation(raw); if (p.valid) u += p.weeklyTotal
      })
      return effectiveCap(gridContext, sec.name) > 0 && u > effectiveCap(gridContext, sec.name)
    })
    const hasAny = Object.values(alloc ?? {}).some(
      row => Object.values(row ?? {}).some(v => v && String(v).trim() !== '' && v !== '0')
    )
    if (!hasAny || hasConflicts) handleAISuggest()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const gridHeight = Math.max(200, Math.min(600, rowData.length * 32 + 32 + 2))

  return (
    <div className="ag-alloc-wrap" style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
      <style>{GRID_STYLES}</style>

      {/* ── Toolbar ── */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap',
        padding: '5px 10px', background: '#F8F7FC',
        border: '1px solid #EFEFF3', borderBottom: 'none',
        borderRadius: '8px 8px 0 0', minHeight: 34,
      }}>
        {toolbarExtra}
        <div style={{ flex: 1 }} />
        <ExportDropdown
          onCsv={() => gridRef.current?.api?.exportDataAsCsv()}
          onExcel={() => (gridRef.current?.api as any)?.exportDataAsExcel?.()}
        />
        <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
          <Search size={10} style={{ position: 'absolute', left: 7, color: '#C0BDDA', pointerEvents: 'none' }} />
          <input
            type="text" placeholder="Search…" value={quickFilter}
            onChange={e => {
              setQuickFilter(e.target.value)
              gridRef.current?.api?.setGridOption('quickFilterText', e.target.value)
            }}
            style={{
              paddingLeft: 22, paddingRight: 8, paddingTop: 3, paddingBottom: 3,
              borderRadius: 5, border: '1px solid #ECECF2', background: '#fff',
              color: '#13111E', fontSize: 10.5, fontFamily: 'inherit', outline: 'none', width: 100,
            }}
          />
        </div>
      </div>

      {/* ── AG Grid ── */}
      <div className="ag-theme-quartz" style={{ height: gridHeight, width: '100%', border: '1px solid #EFEFF3', borderTop: 'none', overflow: 'hidden' }}>
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
          getRowId={(p) => p.data.__sectionId}
          context={gridContext}

          rowNumbers={{ width: 40, minWidth: 36 }}

          // ── AG Grid owns the full editing/keyboard/clipboard/undo lifecycle ──
          singleClickEdit={false}
          stopEditingWhenCellsLoseFocus={true}
          enterNavigatesVertically={true}
          enterNavigatesVerticallyAfterEdit={true}
          undoRedoCellEditing={true}
          undoRedoCellEditingLimit={1000}

          suppressLastEmptyLineOnPaste={true}

          cellSelection={{
            enableColumnSelection: true,
            handle: { mode: 'fill', direction: 'xy' },
          }}

          ensureDomOrder={true}
          rowHeight={32}
          headerHeight={32}
          animateRows={false}
          domLayout="normal"

          onCellValueChanged={onCellValueChanged}
          onPasteStart={onPasteStart}
          onPasteEnd={onPasteEnd}
          onCellSelectionChanged={onCellSelectionChanged}

          tooltipShowDelay={500}
          tooltipHideDelay={3000}
        />
      </div>

      {/* ── Status bar ── */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '3px 10px', background: '#F8F7FC',
        border: '1px solid #EFEFF3', borderTop: 'none',
        borderRadius: '0 0 8px 8px', minHeight: 22,
      }}>
        <div style={{ display: 'flex', gap: 12 }}>
          {[['F2/↵','Edit'],['Esc','Cancel'],['Del','Clear'],['⌃C/V','Copy/Paste'],['⌃Z','Undo']].map(([k, v]) => (
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
