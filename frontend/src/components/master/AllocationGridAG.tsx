/**
 * AllocationGridAG — Period-allocation spreadsheet.
 *
 * Architecture:
 *   AG Grid OWNS:  DOM rendering, cell editing, undo/redo, OS clipboard write
 *   Engine OWNS:   selection state, copy state, keyboard, paste validation, overlay
 *
 * Single source of truth: SpreadsheetEngineState  (useReducer)
 *   selection    — what is currently highlighted (CELL_RANGE | COLUMN_RANGE)
 *   copied       — copy buffer: serialized values + source range + AG Grid ranges for overlay
 *   pasteWarning — transient validation toast
 *
 * All AG Grid event callbacks normalize into engine state.
 * All rendering derives from engine state.
 * No parallel refs for selection or copy state.
 *
 * Undo/redo for cell values: owned entirely by AG Grid (undoRedoCellEditing).
 * We intentionally do not duplicate that stack.
 */

import 'ag-grid-community/styles/ag-grid.css'
import 'ag-grid-community/styles/ag-theme-quartz.css'

import { useMemo, useCallback, useRef, useEffect, useState, useReducer } from 'react'
import { AgGridReact, type CustomCellEditorProps } from 'ag-grid-react'
import {
  ModuleRegistry,
  AllCommunityModule,
  type ColDef,
  type ValueGetterParams,
  type ValueSetterParams,
  type ICellRendererParams,
  type CellSelectionChangedEvent,
  type CellValueChangedEvent,
  type ProcessDataFromClipboardParams,
} from 'ag-grid-community'
import { AllEnterpriseModule } from 'ag-grid-enterprise'

import { useTimetableStore } from '@/store/timetableStore'
import { buildPeriodSequence } from '@/lib/aiEngine'
import type { Subject, Section, Period } from '@/types'
import { parseAllocation, validateAllocationCapacity } from '@/lib/allocationSyntax'
import {
  computeCapacity, capacityForSection, inferBandFromSection, utilisationStatus,
} from '@/lib/capacityEngine'
import { Search, ChevronDown, Minus, Plus, Check } from 'lucide-react'

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
// Component types
// ─────────────────────────────────────────────────────────────────

interface RowData { __sectionId: string; sectionName: string }

interface GridContext {
  getAllocations:   () => Record<string, Record<string, string>>
  getCap:           () => ReturnType<typeof computeCapacity>
  getCapOverrides:  () => Record<string, number>
  getDisplayMode:   () => 'periods' | 'hours'
  getPeriodMinutes: () => number
  getSections:      () => Section[]
}

function effectiveCap(ctx: GridContext, sn: string): number {
  const o = ctx.getCapOverrides()[sn]
  return o !== undefined ? o : capacityForSection(ctx.getCap(), inferBandFromSection(sn))
}

/** Plain-English translation of an allocation syntax string ("5+1" → "5 theory + 1 lab = 6 periods/week"). */
function describeAllocation(raw: string | undefined | null): string | null {
  if (!raw || raw === '0') return null
  const p = parseAllocation(raw)
  if (!p.valid) return `"${raw}" is not a recognised allocation`
  const bits: string[] = []
  if (p.theoryPeriods > 0) bits.push(`${p.theoryPeriods} theory`)
  if (p.labPeriods > 0)    bits.push(`${p.labPeriods} lab`)
  if (p.doublePeriods > 0) bits.push(`${p.doublePeriods} block${p.doublePeriods > 1 ? 's' : ''} of ${p.doubleSpan} consecutive`)
  if (!bits.length) return null
  return `${bits.join(' + ')} = ${p.weeklyTotal} period${p.weeklyTotal !== 1 ? 's' : ''}/week`
}

/** Canonical compact syntax from counts — mirrors the syntax guide's examples. */
function composeSyntax(theory: number, lab: number, doubles: number, span: number): string {
  if (doubles > 0) return `${doubles}(${Math.max(2, span)}X)`
  if (theory > 0 && lab > 0) return `${theory}+${lab}`
  if (lab > 0)    return `${lab}L`
  if (theory > 0) return String(theory)
  return ''
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
// Allocation Composer — popup cell editor
//
// Typing stays first-class (the input is auto-focused and seeded with the
// pressed key), but nobody has to MEMORISE the syntax any more: steppers for
// theory / lab / double blocks write the canonical syntax for you, quick
// chips cover the common values, and a live line translates whatever is in
// the box to plain English with a capacity check for this class.
// AG Grid v31+ controlled-editor contract: mirror every change through
// props.onValueChange(); commit = stopEditing(), Esc = grid-native cancel.
// ─────────────────────────────────────────────────────────────────

const QUICK_CHIPS = ['2', '3', '4', '5', '6', '5+1', '4+2', '2L', '3(2X)']

function AllocationComposer(props: CustomCellEditorProps<RowData> & { subjectName?: string }) {
  const ctx = props.context as GridContext
  const sectionName = props.data?.sectionName ?? ''
  const subjectName = props.subjectName ?? String(props.colDef?.colId ?? '').replace(/^subj:/, '')

  // Seed: printable key starts a fresh value (spreadsheet convention);
  // Enter / F2 / double-click edits the existing one.
  const seed = props.eventKey && props.eventKey.length === 1 && /[\d]/.test(props.eventKey)
    ? props.eventKey
    : String(props.value ?? '')
  const [text, setText] = useState(seed)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    props.onValueChange(text === '' ? null : text)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text])

  useEffect(() => {
    const el = inputRef.current
    if (!el) return
    el.focus()
    // Fresh-typed seed: caret at end. Existing value: select all for overwrite.
    if (seed === String(props.value ?? '') && seed !== '') el.select()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const parsed = parseAllocation(text)
  const theory  = parsed.valid ? parsed.theoryPeriods  : 0
  const lab     = parsed.valid ? parsed.labPeriods     : 0
  const doubles = parsed.valid ? parsed.doublePeriods  : 0
  const span    = parsed.valid && parsed.doubleSpan >= 2 ? parsed.doubleSpan : 2

  // Capacity preview: class total EXCLUDING this cell + the value being typed
  const cap = effectiveCap(ctx, sectionName)
  let usedOthers = 0
  Object.entries(ctx.getAllocations()[sectionName] ?? {}).forEach(([sub, raw]) => {
    if (sub === subjectName || !raw || raw === '0') return
    const p = parseAllocation(raw)
    if (p.valid) usedOthers += p.weeklyTotal
  })
  const newTotal = usedOthers + (parsed.valid ? parsed.weeklyTotal : 0)
  const over = cap > 0 && newTotal > cap

  // Same-grade sibling propagation happens in the valueSetter — be transparent.
  const grade = gradeOf(sectionName)
  const siblingCount = ctx.getSections().filter(s => gradeOf(s.name) === grade).length

  const bump = (kind: 'theory' | 'lab' | 'doubles', delta: number) => {
    // Steppers and double-blocks are mutually exclusive in the syntax —
    // touching one family clears the other.
    let t = theory, l = lab, d = doubles
    if (kind === 'doubles') { d = Math.max(0, d + delta); if (d > 0) { t = 0; l = 0 } }
    else {
      if (kind === 'theory') t = Math.max(0, t + delta)
      if (kind === 'lab')    l = Math.max(0, l + delta)
      d = 0
    }
    setText(composeSyntax(t, l, d, span))
  }

  const commit = () => props.api.stopEditing()

  const stepRow = (label: string, value: number, kind: 'theory' | 'lab' | 'doubles', hint?: string) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <span style={{ flex: 1, fontSize: 10.5, fontWeight: 600, color: '#5A5A78' }}>
        {label}{hint && <span style={{ color: '#B0ABCC', fontWeight: 500 }}> {hint}</span>}
      </span>
      <button onClick={() => bump(kind, -1)} disabled={value <= 0} style={{
        width: 20, height: 20, borderRadius: 5, border: '1px solid #DDD8FF', background: '#fff',
        color: value > 0 ? '#6358C4' : '#D5D0F0', cursor: value > 0 ? 'pointer' : 'default',
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center', padding: 0,
      }}><Minus size={11} strokeWidth={2.5} /></button>
      <span style={{ width: 18, textAlign: 'center', fontSize: 12, fontWeight: 700, color: value > 0 ? '#13111E' : '#C4C0DC', fontFamily: "'DM Mono', monospace" }}>
        {value}
      </span>
      <button onClick={() => bump(kind, +1)} style={{
        width: 20, height: 20, borderRadius: 5, border: '1px solid #DDD8FF', background: '#fff',
        color: '#6358C4', cursor: 'pointer',
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center', padding: 0,
      }}><Plus size={11} strokeWidth={2.5} /></button>
    </div>
  )

  const desc = text.trim() === '' ? null : describeAllocation(text)

  return (
    <div style={{
      width: 248, background: '#fff', border: '1px solid #C8C2F0', borderRadius: 10,
      boxShadow: '0 10px 32px rgba(60,50,140,0.18)', padding: 12,
      fontFamily: "'Plus Jakarta Sans', system-ui, sans-serif",
      display: 'flex', flexDirection: 'column', gap: 9,
    }}>
      {/* Header: subject @ section */}
      <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.06em', textTransform: 'uppercase', color: '#8B7FE8' }}>
        {subjectName} <span style={{ color: '#C4BBF0' }}>·</span> <span style={{ color: '#6B6891' }}>{sectionName}</span>
      </div>

      {/* Syntax input + apply */}
      <div style={{ display: 'flex', gap: 6 }}>
        <input
          ref={inputRef}
          value={text}
          onChange={e => setText(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter') { e.preventDefault(); commit() }
            e.stopPropagation()   // keep grid nav keys out while composing
          }}
          placeholder="e.g. 5+1"
          spellCheck={false}
          style={{
            flex: 1, minWidth: 0, padding: '6px 9px', borderRadius: 7,
            border: `1.5px solid ${text && !parsed.valid ? '#FCA5A5' : '#C8C2F0'}`,
            fontSize: 13, fontWeight: 700, fontFamily: "'DM Mono', monospace",
            color: '#13111E', outline: 'none', background: '#FAFAFE',
          }}
        />
        <button onClick={commit} title="Apply (Enter)" style={{
          width: 30, borderRadius: 7, border: 'none', background: '#7C6FE0', color: '#fff',
          cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        }}><Check size={14} strokeWidth={2.5} /></button>
      </div>

      {/* Live translation + capacity check */}
      <div style={{ fontSize: 10, lineHeight: 1.5, minHeight: 15 }}>
        {text.trim() === '' ? (
          <span style={{ color: '#B0ABCC' }}>Empty — no periods for this subject</span>
        ) : parsed.valid ? (
          <span style={{ color: '#15803D', fontWeight: 600 }}>
            {desc}
            <span style={{ color: over ? '#DC2626' : '#8B87AD', fontWeight: 600 }}>
              {' '}· class {newTotal}/{cap}{over ? ' — over capacity' : ''}
            </span>
          </span>
        ) : (
          <span style={{ color: '#DC2626', fontWeight: 600 }}>{desc}</span>
        )}
      </div>

      {/* Steppers */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 5, padding: '8px 9px', background: '#F7F5FF', borderRadius: 8, border: '1px solid #ECE8FF' }}>
        {stepRow('Theory', theory, 'theory')}
        {stepRow('Lab / practical', lab, 'lab')}
        {stepRow('Double blocks', doubles, 'doubles', `(${span} consecutive)`)}
      </div>

      {/* Quick chips */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
        {QUICK_CHIPS.map(c => (
          <button key={c} onClick={() => setText(c)} style={{
            padding: '2px 8px', borderRadius: 11, cursor: 'pointer',
            border: `1px solid ${text === c ? '#7C6FE0' : '#E4E0FF'}`,
            background: text === c ? '#EDE9FF' : '#fff',
            color: text === c ? '#6358C4' : '#6B6891',
            fontSize: 10.5, fontWeight: 700, fontFamily: "'DM Mono', monospace",
          }}>{c}</button>
        ))}
      </div>

      {/* Sibling propagation note */}
      {siblingCount > 1 && (
        <div style={{ fontSize: 9.5, color: '#9B96BD', borderTop: '1px solid #F0EDFF', paddingTop: 7 }}>
          Applies to all <strong style={{ color: '#6B6891' }}>{siblingCount} {grade}</strong> sections
        </div>
      )}
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
// Grid styles
// ─────────────────────────────────────────────────────────────────

const GRID_STYLES = `
/* ── Kill native drag-ghost / text-selection ────────────────────────────────
   Ctrl+Click on cells fires browser text-selection + native drag logic, which
   produces the translucent ghost overlay.  Disabling user-select on the wrapper
   prevents text from ever being selected (and therefore dragged).
   Re-enable it only on active edit inputs so cursor/copy works inside cells.
   ─────────────────────────────────────────────────────────────────────────── */
.ag-alloc-wrap {
  -webkit-user-select: none;
  -moz-user-select: none;
  user-select: none;
  -webkit-touch-callout: none;
}
.ag-alloc-wrap input,
.ag-alloc-wrap textarea,
.ag-alloc-wrap [contenteditable="true"] {
  -webkit-user-select: text !important;
  -moz-user-select: text !important;
  user-select: text !important;
}

/* ── Theme variables ── */
.ag-alloc-wrap .ag-theme-quartz {
  --ag-border-color: #C8C8C8;
  --ag-header-background-color: #F2F2F7;
  --ag-background-color: #ffffff;
  --ag-odd-row-background-color: #ffffff;
  --ag-row-hover-color: #FAFAFD;
  --ag-selected-row-background-color: #EEF2FF;
  --ag-range-selection-border-color: #8B85F0;
  --ag-range-selection-border-style: solid;
  --ag-range-selection-background-color: rgba(99,92,220,0.07);
  --ag-range-selection-highlight-color: rgba(99,92,220,0.13);
  --ag-cell-horizontal-padding: 7px;
  --ag-font-family: 'DM Sans', sans-serif;
  --ag-font-size: 12px;
  --ag-foreground-color: #13111E;
  --ag-header-foreground-color: #5A5A78;
  --ag-cell-horizontal-border: 1px solid #D0D0D0;
  --ag-header-column-separator-display: block;
  --ag-header-column-separator-color: #C8C8C8;
  --ag-pinned-column-border-color: #C0BCD8;
  --ag-input-focus-border-color: #8B85F0;
  --ag-input-focus-box-shadow: 0 0 0 2px rgba(99,92,220,0.18);
  --ag-fill-handle-color: #5A52D5;
  --ag-fill-handle-size: 6px;
  --ag-row-border-color: #D0D0D0;
  --ag-row-numbers-background-color: #F2F2F7;
  font-family: 'DM Sans', sans-serif;
}

/* ── Visible Excel-style grid lines on every cell ── */
.ag-alloc-wrap .ag-cell {
  border-right: 1px solid #D0D0D0 !important;
  line-height: 32px;
}
.ag-alloc-wrap .ag-row {
  border-bottom: 1px solid #D0D0D0 !important;
}
.ag-alloc-wrap .ag-header-cell {
  border-right: 1px solid #C8C8C8 !important;
}
.ag-alloc-wrap .ag-header {
  border-bottom: 2px solid #B8B8C8 !important;
}

/* ── Header labels ── */
.ag-alloc-wrap .ag-header-cell-menu-button,
.ag-alloc-wrap .ag-header-cell-filter-button { display: none !important; }
.ag-alloc-wrap .ag-header-cell-label {
  font-size: 10.5px; font-weight: 700; color: #5A5A78;
  letter-spacing: 0.03em; text-transform: uppercase; justify-content: flex-end;
}
.ag-alloc-wrap [col-id="sectionName"] .ag-header-cell-label {
  justify-content: flex-start; text-transform: none; letter-spacing: 0; font-size: 11px;
}

/* ── Row numbers ── */
.ag-alloc-wrap .ag-row-number {
  font-size: 10px; color: #9894B0; font-family: 'DM Mono', monospace;
  background: #F2F2F7 !important;
  border-right: 1px solid #C0BCD8 !important;
}
.ag-alloc-wrap .ag-row-number-header {
  background: #F2F2F7 !important;
  border-right: 1px solid #C0BCD8 !important;
}

/* ── Suppress ALL native browser focus chrome ───────────────────────────────
   AG Grid adds tabIndex="0" dynamically to cells for keyboard navigation.
   Without this block the browser paints its own focus ring (blue square)
   ON TOP of the custom marching-ants border.
   ─────────────────────────────────────────────────────────────────────────── */
.ag-alloc-wrap *:focus,
.ag-alloc-wrap *:focus-visible,
.ag-alloc-wrap *:focus-within {
  outline: none !important;
  box-shadow: none !important;
}
.ag-alloc-wrap .ag-cell:focus,
.ag-alloc-wrap .ag-cell:focus-visible { outline: none !important; box-shadow: none !important; }
.ag-alloc-wrap .ag-header-cell:focus,
.ag-alloc-wrap .ag-header-cell:focus-visible { outline: none !important; box-shadow: none !important; }
.ag-alloc-wrap .ag-root-wrapper:focus,
.ag-alloc-wrap .ag-root-wrapper:focus-visible,
.ag-alloc-wrap .ag-root:focus,
.ag-alloc-wrap .ag-root:focus-visible { outline: none !important; box-shadow: none !important; }

/* ── Focus / selection states ── */
.ag-alloc-wrap .ag-cell-focus:not(.ag-cell-range-selected):not(.ag-cell-inline-editing) {
  border: 1.5px solid #5A52D5 !important;
  outline: none !important;
}
.ag-alloc-wrap .ag-cell-inline-editing {
  border: 2px solid #5A52D5 !important;
  box-shadow: 0 0 0 2px rgba(90,82,213,0.18) !important;
}
.ag-alloc-wrap .ag-cell-edit-wrapper input {
  font-family: 'DM Mono', monospace !important; font-size: 12px !important;
  font-weight: 600; color: #13111E !important; text-align: left;
}

/* ── Pinned columns ── */
.ag-alloc-wrap .ag-pinned-left-header { border-right: 2px solid #C0BCD8 !important; }
.ag-alloc-wrap .ag-pinned-left-cols-container { border-right: 2px solid #C0BCD8 !important; }
.ag-alloc-wrap .ag-pinned-left-header .ag-header-cell,
.ag-alloc-wrap .ag-pinned-left-cols-container .ag-cell { background: #FAFAFA !important; }

/* ── Range selection — override all stacking levels ─────────────────────────
   AG Grid compounds ag-cell-range-selected-1/2/3/4 across overlapping ranges.
   Without overriding ALL variants, cells in two ranges go near-black.
   ─────────────────────────────────────────────────────────────────────────── */
.ag-alloc-wrap .ag-cell-range-selected,
.ag-alloc-wrap .ag-cell-range-selected-1,
.ag-alloc-wrap .ag-cell-range-selected-2,
.ag-alloc-wrap .ag-cell-range-selected-3,
.ag-alloc-wrap .ag-cell-range-selected-4 {
  background-color: rgba(99,92,220,0.07) !important;
}

/* ── Fill handle ── */
.ag-alloc-wrap .ag-fill-handle {
  background: #5A52D5; border: 1.5px solid #fff;
  width: 6px !important; height: 6px !important; border-radius: 1px;
}

/* ── Scrollbar ── */
.ag-alloc-wrap .ag-body-horizontal-scroll-viewport::-webkit-scrollbar { height: 5px; }
.ag-alloc-wrap .ag-body-horizontal-scroll-viewport::-webkit-scrollbar-thumb {
  background: #C8C4E8; border-radius: 3px;
}

/* ── Marching ants overlay ───────────────────────────────────────────────────
   One absolutely-positioned <div.march-overlay-rect> per copied range, rendered
   ABOVE the grid cells.  Excel / Google Sheets architecture: no per-cell class
   toggling, no edge-suppression hacks.  The overlay container has overflow:hidden
   so rects that extend beyond the viewport are clipped cleanly.
   ─────────────────────────────────────────────────────────────────────────── */
@keyframes ag-march {
  from { background-position: 0 0,     100% 0,     100% 100%,   0 100%; }
  to   { background-position: 10px 0,  100% 10px,  calc(100% - 10px) 100%,  0 calc(100% - 10px); }
}
.march-overlay-rect {
  position: absolute;
  pointer-events: none;
  background-image:
    repeating-linear-gradient(90deg,  #1A1A2E 0, #1A1A2E 5px, transparent 5px, transparent 10px),
    repeating-linear-gradient(180deg, #1A1A2E 0, #1A1A2E 5px, transparent 5px, transparent 10px),
    repeating-linear-gradient(90deg,  #1A1A2E 0, #1A1A2E 5px, transparent 5px, transparent 10px),
    repeating-linear-gradient(180deg, #1A1A2E 0, #1A1A2E 5px, transparent 5px, transparent 10px);
  background-size:     10px 1.5px, 1.5px 10px, 10px 1.5px, 1.5px 10px;
  background-position: 0 0,        100% 0,      100% 100%,   0 100%;
  background-repeat:   repeat-x,   repeat-y,    repeat-x,    repeat-y;
  animation: ag-march 0.45s linear infinite;
}

/* ── Paste warning toast ── */
@keyframes paste-warn-in {
  from { opacity: 0; transform: translateX(-50%) translateY(6px); }
  to   { opacity: 1; transform: translateX(-50%) translateY(0); }
}
`

// ─────────────────────────────────────────────────────────────────
// Spreadsheet Engine — state machine
//
// This is the single source of truth for all spreadsheet interactions.
// Selection, copy state, and paste validation all live here.
// No parallel refs, no disconnected state.
// ─────────────────────────────────────────────────────────────────

type SelectionType = 'CELL_RANGE' | 'COLUMN_RANGE' | 'ROW_RANGE'

/**
 * Normalized selection in row-index × colId space.
 * startRow/endRow are always the min/max (i.e. startRow <= endRow).
 */
interface SelectionCoords {
  type:       SelectionType
  startRow:   number    // inclusive, min row index
  endRow:     number    // inclusive, max row index
  startColId: string    // leftmost visible colId
  endColId:   string    // rightmost visible colId
}

/**
 * Snapshot of the copy buffer.
 * data is serialized at copy-time so edits after copying don't affect it.
 * agRanges is kept for the overlay DOM walk (getBoundingClientRect).
 */
interface CopiedState {
  sourceRange: SelectionCoords
  data:        string[][]   // [row][col], row-major
  agRanges:    any[]        // raw AG Grid CellRange[] — for overlay recompute on scroll
}

interface SpreadsheetEngineState {
  selection:    SelectionCoords | null
  activeCell:   { rowIndex: number; colId: string } | null
  copied:       CopiedState | null
  pasteWarning: string | null
}

type EngineAction =
  | { type: 'SELECTION_CHANGED'; selection: SelectionCoords | null; activeCell?: { rowIndex: number; colId: string } | null }
  | { type: 'COPY';              copied: CopiedState }
  | { type: 'CLEAR_COPY' }
  | { type: 'CLEAR_SELECTION' }
  | { type: 'SET_PASTE_WARNING'; message: string | null }

const ENGINE_INITIAL: SpreadsheetEngineState = {
  selection:    null,
  activeCell:   null,
  copied:       null,
  pasteWarning: null,
}

function engineReducer(s: SpreadsheetEngineState, a: EngineAction): SpreadsheetEngineState {
  switch (a.type) {

    case 'SELECTION_CHANGED':
      // Changing selection does NOT clear the copy buffer.
      // Excel keeps marching ants alive after the selection moves so the user
      // can pick a paste destination without losing the copy preview.
      return {
        ...s,
        selection:  a.selection,
        activeCell: a.activeCell !== undefined ? a.activeCell : s.activeCell,
      }

    case 'COPY':
      return { ...s, copied: a.copied }

    case 'CLEAR_COPY':
      // First ESC: dismiss ants, keep selection active.
      return { ...s, copied: null }

    case 'CLEAR_SELECTION':
      // Second ESC (or click outside): clear everything.
      return { ...s, selection: null, activeCell: null, copied: null }

    case 'SET_PASTE_WARNING':
      return { ...s, pasteWarning: a.message }

    default:
      return s
  }
}

// ─────────────────────────────────────────────────────────────────
// Props
// ─────────────────────────────────────────────────────────────────

interface Props {
  displayMode?: 'periods' | 'hours'
  periodMinutes?: number
  toolbarExtra?: React.ReactNode
  sortRowsAZ?: boolean
  sortColsAZ?: boolean
}

// ─────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────

export function AllocationGridAG({
  displayMode = 'periods',
  periodMinutes = 40,
  toolbarExtra,
  sortRowsAZ = false,
  sortColsAZ = false,
}: Props) {
  const store = useTimetableStore() as any
  const { sections, subjects, subjectAllocations, sectionCapacityOverrides = {}, config } = store
  // store.periods is only populated AFTER the first generation — on a fresh
  // wizard run derive the abstract sequence from the bell-step breaks so the
  // capacity engine (and the auto-suggest that depends on it) works first time.
  const storePeriodsArr: Period[] = store.periods ?? []
  const periods: Period[] = useMemo(() => {
    if (storePeriodsArr.length) return storePeriodsArr
    try { return buildPeriodSequence(store.breaks ?? [], config?.periodsPerDay ?? 8) }
    catch { return [] }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storePeriodsArr, store.breaks, config?.periodsPerDay])
  const workDays: string[] = config?.workDays ?? ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY']

  const cap = useMemo(() => computeCapacity(workDays, periods), [workDays, periods])

  // ── DOM refs ──────────────────────────────────────────────────
  const gridRef          = useRef<AgGridReact<RowData>>(null)
  const wrapperRef       = useRef<HTMLDivElement>(null)
  // .ag-theme-quartz div — position:relative anchor for the overlay.
  // Overlay coords are relative to THIS element, not wrapperRef.
  const gridContainerRef = useRef<HTMLDivElement>(null)

  // ── Live data refs — updated every render, O(1) ───────────────
  // These allow all useCallback / useMemo closures to read fresh data
  // without declaring it in their deps (which would cause re-creation).
  const allocationsRef  = useRef<Record<string, Record<string, string>>>(subjectAllocations)
  const capOverrideRef  = useRef<Record<string, number>>(sectionCapacityOverrides)
  const capRef          = useRef(cap)
  const sectionsRef     = useRef<Section[]>(sections)
  const displayModeRef  = useRef(displayMode)
  const periodMinRef    = useRef(periodMinutes)
  allocationsRef.current  = subjectAllocations
  capOverrideRef.current  = sectionCapacityOverrides
  capRef.current          = cap
  sectionsRef.current     = sections
  displayModeRef.current  = displayMode
  periodMinRef.current    = periodMinutes

  // ── Spreadsheet Engine ────────────────────────────────────────
  const [ssState, ssDispatch] = useReducer(engineReducer, ENGINE_INITIAL)

  // Stable refs so useMemo([]) closures always call the latest implementation
  // without needing to be recreated.  Updated every render (O(1), no side effects).
  const stateRef    = useRef(ssState)
  const dispatchRef = useRef(ssDispatch)
  stateRef.current    = ssState
  dispatchRef.current = ssDispatch

  // handleCopyRef is synced below, after handleCopy is defined
  const handleCopyRef = useRef<(api: any) => void>(() => {})

  // ── Skip sibling sync during paste bulk-update ────────────────
  const isPastingRef = useRef(false)

  // ── Marching ants overlay ─────────────────────────────────────
  // Derives entirely from ssState.copied — single source of truth.
  // No separate marchRangesRef, no marchActiveRef.
  type MarchRect = { left: number; top: number; width: number; height: number }
  const [marchRects, setMarchRects] = useState<MarchRect[]>([])

  // DOM walk: convert AG Grid CellRange[] to pixel rects relative to the
  // gridContainerRef (position:relative containing block of the overlay).
  const computeMarchRects = useCallback((agRanges: any[]): MarchRect[] => {
    const gridEl      = wrapperRef.current
    const containerEl = gridContainerRef.current
    if (!gridEl || !containerEl || !agRanges?.length) return []

    const wrapRect = containerEl.getBoundingClientRect()
    const out: MarchRect[] = []

    agRanges.forEach((range: any) => {
      if (!range.startRow || !range.endRow) return
      const r0   = Math.min(range.startRow.rowIndex, range.endRow.rowIndex)
      const r1   = Math.max(range.startRow.rowIndex, range.endRow.rowIndex)
      const cols = range.columns as any[]

      let minL = Infinity, minT = Infinity, maxR = -Infinity, maxB = -Infinity
      let hit  = false

      cols.forEach((col: any) => {
        const colId = col.getColId() as string
        for (let ri = r0; ri <= r1; ri++) {
          // Both pinned-left and center-body containers may have the same row index
          gridEl.querySelectorAll<HTMLElement>(`.ag-row[row-index="${ri}"]`)
            .forEach(rowEl => {
              rowEl.querySelectorAll<HTMLElement>('.ag-cell').forEach(cell => {
                if (cell.getAttribute('col-id') !== colId) return
                const r = cell.getBoundingClientRect()
                if (r.width === 0 || r.height === 0) return
                minL = Math.min(minL, r.left   - wrapRect.left)
                minT = Math.min(minT, r.top    - wrapRect.top)
                maxR = Math.max(maxR, r.right  - wrapRect.left)
                maxB = Math.max(maxB, r.bottom - wrapRect.top)
                hit  = true
              })
            })
        }
      })

      if (hit && isFinite(minL)) {
        out.push({ left: minL, top: minT, width: maxR - minL, height: maxB - minT })
      }
    })

    return out
  }, [])

  // Overlay re-derives whenever copied state changes
  useEffect(() => {
    if (!ssState.copied) { setMarchRects([]); return }
    setMarchRects(computeMarchRects(ssState.copied.agRanges))
  }, [ssState.copied, computeMarchRects])

  // Recompute overlay on grid scroll (cells move, overlay must follow)
  const onBodyScroll = useCallback(() => {
    const copied = stateRef.current.copied
    if (copied) setMarchRects(computeMarchRects(copied.agRanges))
  }, [computeMarchRects])

  // ── Paste warning auto-dismiss ────────────────────────────────
  useEffect(() => {
    if (!ssState.pasteWarning) return
    const t = setTimeout(
      () => dispatchRef.current({ type: 'SET_PASTE_WARNING', message: null }),
      4000
    )
    return () => clearTimeout(t)
  }, [ssState.pasteWarning])

  // ── Helper: normalize AG Grid CellRange[] → SelectionCoords ──
  // Detects COLUMN_RANGE when the selection spans all displayed rows.
  // For multiple ranges (Ctrl+Click sparse) we take the bounding box.
  const normalizeAgRanges = useCallback((
    agRanges: any[],
    totalRows: number
  ): SelectionCoords | null => {
    if (!agRanges?.length) return null

    let startRow = Infinity, endRow = -Infinity
    const colIds: string[] = []

    agRanges.forEach((range: any) => {
      if (!range.startRow || !range.endRow) return
      startRow = Math.min(startRow, range.startRow.rowIndex, range.endRow.rowIndex)
      endRow   = Math.max(endRow,   range.startRow.rowIndex, range.endRow.rowIndex)
      ;(range.columns as any[]).forEach((col: any) => {
        const id = col.getColId()
        if (!colIds.includes(id)) colIds.push(id)
      })
    })

    if (!isFinite(startRow) || !colIds.length) return null

    // COLUMN_RANGE: the selection covers every row in the grid
    const type: SelectionType =
      startRow === 0 && endRow >= totalRows - 1 ? 'COLUMN_RANGE' : 'CELL_RANGE'

    return {
      type,
      startRow,
      endRow,
      startColId: colIds[0],
      endColId:   colIds[colIds.length - 1],
    }
  }, [])

  // ── Helper: serialize SelectionCoords → string[][] ────────────
  // Reads from allocationsRef (the Zustand store mirror) — NOT from the DOM.
  // This is why the clipboard engine is decoupled from visual rendering.
  const serializeSelection = useCallback((
    sel: SelectionCoords,
    api: any
  ): string[][] => {
    const allCols: any[] = (api as any).getAllDisplayedColumns?.() ?? []
    const si = allCols.findIndex(c => c.getColId() === sel.startColId)
    const ei = allCols.findIndex(c => c.getColId() === sel.endColId)
    const c0 = Math.min(si < 0 ? 0 : si, ei < 0 ? 0 : ei)
    const c1 = Math.max(si < 0 ? 0 : si, ei < 0 ? 0 : ei)
    const rangedCols = allCols.slice(c0, c1 + 1)

    const rows: string[][] = []
    for (let ri = sel.startRow; ri <= sel.endRow; ri++) {
      const node = api.getDisplayedRowAtIndex(ri)
      if (!node?.data) continue
      const sn = (node.data as RowData).sectionName
      rows.push(
        rangedCols.map((col: any) => {
          const colId = col.getColId() as string
          if (!colId.startsWith('subj:')) return ''
          return allocationsRef.current[sn]?.[colId.slice(5)] ?? ''
        })
      )
    }
    return rows
  }, [])

  // ── Copy handler — single entry point for ALL copy operations ─
  // Called from onCellKeyDown (cell Ctrl+C) and suppressHeaderKeyboardEvent
  // (column header Ctrl+C).  Returns false everywhere so AG Grid still writes
  // the TSV to the OS clipboard — we only add the engine state snapshot.
  const handleCopy = useCallback((api: any) => {
    if (!api) return
    const agRanges = (api as any).getCellRanges?.() as any[] | undefined
    if (!agRanges?.length) return

    const totalRows = (api as any).getDisplayedRowCount?.() ?? 0
    const sel = normalizeAgRanges(agRanges, totalRows)
    if (!sel) return

    window.getSelection()?.removeAllRanges()

    // Serialize into engine state.  One rAF lets AG Grid finish its internal
    // copy so getBoundingClientRect() in computeMarchRects sees stable DOM.
    const data = serializeSelection(sel, api)
    requestAnimationFrame(() => {
      dispatchRef.current({ type: 'COPY', copied: { sourceRange: sel, data, agRanges } })
    })
  }, [normalizeAgRanges, serializeSelection])

  // Keep handleCopyRef in sync so useMemo([]) closures can call it
  handleCopyRef.current = handleCopy

  // ── Grid context — stable, never recreated ────────────────────
  const gridContext = useMemo<GridContext>(() => ({
    getAllocations:   () => allocationsRef.current,
    getCap:           () => capRef.current,
    getCapOverrides:  () => capOverrideRef.current,
    getDisplayMode:   () => displayModeRef.current,
    getPeriodMinutes: () => periodMinRef.current,
    getSections:      () => sectionsRef.current as Section[],
  }), [])

  // ── defaultColDef — stable, empty deps ───────────────────────
  // Must be empty deps because AG Grid memoizes this at grid init.
  // stateRef, dispatchRef, handleCopyRef are stable ref objects — safe to
  // read from an empty-deps useMemo closure.
  const defaultColDef = useMemo<ColDef<RowData>>(() => ({
    sortable: true,
    resizable: true,
    suppressMovable: false,
    suppressHeaderMenuButton: true,

    // Two-press ESC model (matches Excel exactly):
    //   Ants visible  → first  ESC: CLEAR_COPY only  (selection stays active)
    //   No ants       → second ESC: clear selection + blur
    suppressKeyboardEvent: (params: any) => {
      if (params.event.key === 'Escape' && !params.editing) {
        if (stateRef.current.copied) {
          dispatchRef.current({ type: 'CLEAR_COPY' })
        } else {
          ;(params.api as any).clearCellSelection?.()
          ;(params.api as any).clearFocusedCell?.()
          ;(document.activeElement as HTMLElement)?.blur?.()
        }
        return true
      }
      return false
    },

    // Column header keyboard: Ctrl+C → handleCopy; ESC → same two-press model.
    suppressHeaderKeyboardEvent: (params: any) => {
      const ctrl = params.event.ctrlKey || params.event.metaKey
      const key  = params.event.key

      if (ctrl && key.toLowerCase() === 'c') {
        // Trigger engine copy (ants + state snapshot).
        // Return false so AG Grid also writes TSV to the OS clipboard.
        handleCopyRef.current(params.api)
        return false
      }

      if (key === 'Escape') {
        if (stateRef.current.copied) {
          dispatchRef.current({ type: 'CLEAR_COPY' })
        } else {
          ;(params.api as any).clearCellSelection?.()
          ;(params.api as any).clearFocusedCell?.()
          ;(document.activeElement as HTMLElement)?.blur?.()
        }
        return true
      }
      return false
    },
  }), []) // intentionally empty — reads only stable refs

  // ── Column definitions ────────────────────────────────────────
  const columnDefs = useMemo<ColDef<RowData>[]>(() => {
    const cols: ColDef<RowData>[] = [

      // Class label (pinned, read-only)
      {
        headerName: 'Class',
        colId: 'sectionName',
        field: 'sectionName',
        pinned: 'left',
        width: 120, minWidth: 90,
        editable: false,
        lockPinned: true, suppressMovable: true, sortable: true,
        cellStyle: {
          fontWeight: 600, fontSize: 11.5, color: '#13111E',
          fontFamily: "'DM Sans', sans-serif", paddingLeft: 10,
        },
      },

      // Used / Capacity (editable denominator)
      {
        headerName: 'Used',
        colId: '__usage',
        headerTooltip: 'Used / Capacity.  Click the capacity number to override per section.',
        pinned: 'left',
        width: 82, minWidth: 74,
        editable: true,
        lockPinned: true, suppressMovable: true, sortable: false,
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
          const st = utilisationStatus(u, c)
          if (st === 'over')  return { backgroundColor: '#FEF2F2' }
          if (st === 'tight') return { backgroundColor: '#FFFBEB' }
          return null
        },
      },
    ]

    // Subject columns
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

        // Composer popup in periods mode; plain text editor in hours mode
        // (hours input is a simple number/duration, no syntax to compose).
        cellEditorSelector: () => displayModeRef.current === 'hours'
          ? { component: 'agTextCellEditor' }
          : { component: AllocationComposer, popup: true, popupPosition: 'under', params: { subjectName: sub.name } },

        // Hover translation: "Mathematics — 5 theory + 1 lab = 6 periods/week"
        tooltipValueGetter: (p) => {
          const sn = p.data?.sectionName ?? ''
          const d = describeAllocation(allocationsRef.current[sn]?.[sub.name])
          return d ? `${sub.name} — ${d}` : sub.name
        },

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

        // ── CRITICAL CONTRACT ────────────────────────────────────
        // allocationsRef.current MUST be updated SYNCHRONOUSLY before returning
        // true.  AG Grid calls valueGetter() immediately after valueSetter() to
        // capture newValue for its undo entry.  Stale ref → entry discarded → undo broken.
        valueSetter: (params: ValueSetterParams<RowData>) => {
          let val = String(params.newValue ?? '').trim()
          if (displayModeRef.current === 'hours') val = parseHoursInput(val, periodMinRef.current)

          const sn = params.data?.sectionName ?? ''

          const secRow = { ...(allocationsRef.current[sn] ?? {}) }
          if (val === '') delete secRow[sub.name]; else secRow[sub.name] = val
          const withCurrent = { ...allocationsRef.current }
          if (Object.keys(secRow).length === 0) delete withCurrent[sn]; else withCurrent[sn] = secRow
          allocationsRef.current = withCurrent   // sync BEFORE returning

          if (isPastingRef.current) {
            store.setSubjectAllocations?.(withCurrent)
            return true
          }

          // Propagate to same-grade siblings
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
          if (!parsed.valid) return { backgroundColor: '#FEF2F2' }
          const c = effectiveCap(gridContext, sn)
          if (!validateAllocationCapacity(parsed, c).ok) return { backgroundColor: '#FFFBEB' }
          return null
        },
      })
    })

    if (sortColsAZ) {
      const pinned = cols.filter(c => c.colId === 'sectionName' || c.colId === '__usage')
      const subjectCols = cols.filter(c => c.colId?.startsWith('subj:'))
      subjectCols.sort((a, b) => (a.headerName ?? '').localeCompare(b.headerName ?? ''))
      return [...pinned, ...subjectCols]
    }
    return cols
  }, [subjects, gridContext, sortColsAZ])

  // ── Row data ──────────────────────────────────────────────────
  const rowData = useMemo<RowData[]>(() => {
    const secs = sortRowsAZ
      ? [...(sections as Section[])].sort((a, b) => a.name.localeCompare(b.name))
      : (sections as Section[])
    return secs.map((sec: any) => ({ __sectionId: sec.id, sectionName: sec.name }))
  }, [sections, sortRowsAZ])

  // ── onCellSelectionChanged ────────────────────────────────────
  // Projects AG Grid selection into engine state.
  // Also computes the status bar (cell count, period sum, average).
  const [statusBar, setStatusBar] = useState<{ cells: number; periods: number; avg: number } | null>(null)

  const onCellSelectionChanged = useCallback((e: CellSelectionChangedEvent<RowData>) => {
    window.getSelection()?.removeAllRanges()

    const api      = e.api
    const agRanges = api.getCellRanges() as any[] ?? []
    const totalRows = (api as any).getDisplayedRowCount?.() ?? 0

    // Project into engine
    const sel = normalizeAgRanges(agRanges, totalRows)
    dispatchRef.current({ type: 'SELECTION_CHANGED', selection: sel })

    // Status bar
    if (!sel || !agRanges.length) { setStatusBar(null); return }
    let cells = 0, total = 0
    agRanges.forEach((range: any) => {
      const r0 = Math.min(range.startRow!.rowIndex, range.endRow!.rowIndex)
      const r1 = Math.max(range.startRow!.rowIndex, range.endRow!.rowIndex)
      ;(range.columns as any[]).forEach((col: any) => {
        const colId = col.getColId() as string
        if (!colId.startsWith('subj:')) return
        const subName = colId.slice(5)
        for (let i = r0; i <= r1; i++) {
          const node = api.getDisplayedRowAtIndex(i)
          if (!node?.data) continue
          cells++
          const rawV = allocationsRef.current[node.data.sectionName]?.[subName]
          if (rawV && rawV !== '0') {
            const p = parseAllocation(rawV)
            if (p.valid) total += p.weeklyTotal
          }
        }
      })
    })
    if (cells <= 1) { setStatusBar(null); return }
    setStatusBar({ cells, periods: total, avg: cells > 0 ? Math.round((total / cells) * 10) / 10 : 0 })
  }, [normalizeAgRanges])

  // ── onCellKeyDown — observe only, no preventDefault ───────────
  // Delegates Ctrl+C to handleCopy; AG Grid handles everything else.
  const onCellKeyDown = useCallback((e: any) => {
    const ke = e.event as KeyboardEvent | undefined
    if (!ke) return
    if ((ke.ctrlKey || ke.metaKey) && ke.key.toLowerCase() === 'c') {
      handleCopy(e.api ?? gridRef.current?.api)
    }
  }, [handleCopy])

  // ── Paste handlers ────────────────────────────────────────────
  const onPasteStart = useCallback(() => { isPastingRef.current = true }, [])
  const onPasteEnd   = useCallback(() => {
    isPastingRef.current = false
    // Refresh UI after bulk paste; keep ants alive (Excel behaviour)
    requestAnimationFrame(() => gridRef.current?.api?.refreshCells({ force: false }))
  }, [])

  // ── processDataFromClipboard — shape compatibility validation ────
  // Excel rule: overlap with the copy source is IRRELEVANT.
  // The only thing that matters is whether the DESTINATION SELECTION
  // dimensions are compatible with the CLIPBOARD DATA dimensions.
  //
  // Allow when:
  //   • clipboard is 1×1 (single-cell broadcast)
  //   • destination selection is 1×1 (paste expands to clipboard size)
  //   • destination rows == data rows AND destination cols == data cols (exact fit)
  //   • destination is an integer multiple of data in both dims (tiling)
  //
  // Block only when the destination selection is multi-cell AND its shape
  // is incompatible with the clipboard data (not an exact fit or valid tile).
  const processDataFromClipboard = useCallback((
    params: ProcessDataFromClipboardParams
  ): string[][] | null => {
    const api = gridRef.current?.api
    if (!api) return params.data

    const dstRanges = (api as any).getCellRanges?.() as any[] | undefined
    if (!dstRanges?.length) return params.data

    const dataRows = params.data.length
    const dataCols = Math.max(...params.data.map(r => r.length), 0)
    if (!dataRows || !dataCols) return params.data

    // 1×1 clipboard → broadcast to any destination, always valid
    if (dataRows === 1 && dataCols === 1) return params.data

    // Read destination selection shape from the first range anchor
    const sel = dstRanges[0]
    if (!sel?.startRow || !sel?.endRow) return params.data

    const r0      = Math.min(sel.startRow.rowIndex, sel.endRow.rowIndex)
    const r1      = Math.max(sel.startRow.rowIndex, sel.endRow.rowIndex)
    const selRows = r1 - r0 + 1
    const selCols = (sel.columns as any[]).length

    // 1×1 destination → paste always expands to clipboard dimensions
    if (selRows === 1 && selCols === 1) return params.data

    // Exact fit: destination shape == clipboard shape → allow
    // Tiling:    destination is an N×M multiple of clipboard → allow
    const rowsOk = selRows === dataRows || selRows % dataRows === 0
    const colsOk = selCols === dataCols || selCols % dataCols === 0
    if (rowsOk && colsOk) return params.data

    dispatchRef.current({
      type: 'SET_PASTE_WARNING',
      message: `The copy area and paste area aren't the same size. Select just one cell in the paste area or an area that's the same size, then paste again.`,
    })
    return null
  }, []) // reads only stable refs (gridRef, dispatchRef)

  // ── Click outside → clear engine state ───────────────────────
  useEffect(() => {
    const onDocMouseDown = (e: MouseEvent) => {
      if (wrapperRef.current?.contains(e.target as Node)) return
      const api = gridRef.current?.api
      ;(document.activeElement as HTMLElement)?.blur?.()
      if (api) {
        ;(api as any).clearCellSelection?.()
        ;(api as any).clearFocusedCell?.()
      }
      dispatchRef.current({ type: 'CLEAR_SELECTION' })
    }
    document.addEventListener('mousedown', onDocMouseDown)
    return () => document.removeEventListener('mousedown', onDocMouseDown)
  }, [])

  // ── Refresh siblings + usage after each cell edit ─────────────
  const onCellValueChanged = useCallback((e: CellValueChangedEvent<RowData>) => {
    if (isPastingRef.current) return

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

  // Auto-fill on mount if grid is empty or over-capacity
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

  // ── Render ────────────────────────────────────────────────────
  return (
    <div
      ref={wrapperRef}
      className="ag-alloc-wrap"
      style={{ display: 'flex', flexDirection: 'column', gap: 0 }}
      onDragStart={(e) => { e.preventDefault() }}
    >
      <style>{GRID_STYLES}</style>

      {/* ── Toolbar ── */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap',
        padding: '5px 10px', background: '#F2F2F7',
        border: '1px solid #C8C8C8', borderBottom: 'none',
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
            type="text" placeholder="Search…"
            onChange={e => {
              gridRef.current?.api?.setGridOption('quickFilterText', e.target.value)
            }}
            style={{
              paddingLeft: 22, paddingRight: 8, paddingTop: 3, paddingBottom: 3,
              borderRadius: 5, border: '1px solid #D0D0D0', background: '#fff',
              color: '#13111E', fontSize: 10.5, fontFamily: 'inherit', outline: 'none', width: 100,
            }}
          />
        </div>
      </div>

      {/* ── AG Grid container — position:relative anchor for the overlay ── */}
      <div
        ref={gridContainerRef}
        className="ag-theme-quartz"
        style={{ height: gridHeight, width: '100%', border: '1px solid #C8C8C8', borderTop: 'none', overflow: 'hidden', position: 'relative' }}
      >
        <AgGridReact<RowData>
          ref={gridRef}
          rowData={rowData}
          columnDefs={columnDefs}
          defaultColDef={defaultColDef}
          getRowId={(p) => p.data.__sectionId}
          context={gridContext}
          onGridReady={e => { if (import.meta.env.DEV) (window as any).__allocApi = e.api }}

          rowNumbers={{ width: 40, minWidth: 36 }}

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

          suppressColumnVirtualisation={true}
          ensureDomOrder={true}
          rowHeight={32}
          headerHeight={32}
          animateRows={false}
          domLayout="normal"

          onCellValueChanged={onCellValueChanged}
          onPasteStart={onPasteStart}
          onPasteEnd={onPasteEnd}
          processDataFromClipboard={processDataFromClipboard}
          onCellSelectionChanged={onCellSelectionChanged}
          onCellKeyDown={onCellKeyDown}
          onBodyScroll={onBodyScroll}

          tooltipShowDelay={500}
          tooltipHideDelay={3000}
        />

        {/* ── Marching ants overlay ──────────────────────────────────
            Renders from ssState.copied — the single source of truth.
            One absolutely-positioned div per copied range.
            pointerEvents:none — zero interference with grid interactions. */}
        {marchRects.length > 0 && (
          <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 5, overflow: 'hidden' }}>
            {marchRects.map((rect, i) => (
              <div
                key={i}
                className="march-overlay-rect"
                style={{ left: rect.left, top: rect.top, width: rect.width, height: rect.height }}
              />
            ))}
          </div>
        )}

        {/* ── Paste validation warning toast ─────────────────────────
            Renders from ssState.pasteWarning.  Auto-dismisses after 4 s. */}
        {ssState.pasteWarning && (
          <div style={{
            position: 'absolute', bottom: 10, left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 20, pointerEvents: 'none',
            background: '#1A1A2E', color: '#fff',
            fontSize: 11.5, fontFamily: 'inherit', fontWeight: 500,
            padding: '7px 14px', borderRadius: 6,
            boxShadow: '0 2px 10px rgba(0,0,0,0.25)',
            display: 'flex', alignItems: 'center', gap: 7,
            maxWidth: 420, textAlign: 'center', lineHeight: 1.4,
            animation: 'paste-warn-in 0.15s ease-out',
          }}>
            <span style={{ fontSize: 13 }}>⚠️</span>
            {ssState.pasteWarning}
          </div>
        )}
      </div>

      {/* ── Status bar ── */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '3px 10px', background: '#F2F2F7',
        border: '1px solid #C8C8C8', borderTop: 'none',
        borderRadius: '0 0 8px 8px', minHeight: 22,
      }}>
        <div style={{ display: 'flex', gap: 12 }}>
          {[['F2/↵','Edit'],['Esc','Cancel'],['Del','Clear'],['⌃C/V','Copy/Paste'],['⌃Z','Undo']].map(([k, v]) => (
            <span key={k} style={{ fontSize: 9.5, color: '#B0ADCA', fontFamily: "'DM Mono', monospace" }}>
              <span style={{ fontWeight: 700, color: '#9894B0' }}>{k}</span> {v}
            </span>
          ))}
        </div>
        {statusBar && (
          <div style={{ display: 'flex', gap: 10, fontSize: 10, color: '#5A52D5', fontFamily: "'DM Mono', monospace", fontWeight: 600 }}>
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
