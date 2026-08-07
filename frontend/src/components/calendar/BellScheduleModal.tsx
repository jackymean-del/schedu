/**
 * The bell schedule, as a sheet you can pin up.
 *
 * Laid out the way a bell chart is read on a wall: time down the left, classes
 * across the top, each cell naming the block that is running. A block spanning
 * several bands is named once, on the row it starts.
 *
 * Only the START time is shown per row. A bell chart is a list of the moments
 * something changes; printing "8:00 – 8:15" as well says the same thing twice,
 * because the next row already states when the band ends.
 *
 * Three ways to head the columns, because schools describe themselves
 * differently — see VIEWS below. Everything is derived; nobody types a time.
 */
import { useMemo, useState } from 'react'
import { Bell, X, Printer } from 'lucide-react'
import { bellColumns, bellGrid, fmtRingTime, rangeLabel, type BellColumn } from '@/lib/bellSchedule'
import type { Period } from '@/types'

const ACCENT = '#7C6FE0'

/** A block-wise (per-shift) timetable: each block has its own clock. */
export interface BellBlock {
  id: string
  name: string
  startTime: string
  sectionNames: string[]
  periods: Period[]
}

type View = 'classes' | 'range' | 'block'

const VIEWS: Array<{ key: View; label: string; hint: string }> = [
  { key: 'classes', label: 'By class',   hint: 'Every class-section named' },
  { key: 'range',   label: 'Class range', hint: 'Headed by the first and last class, in school order' },
  { key: 'block',   label: 'Block-wise',  hint: "One column per block, on that block's own clock" },
]

export function BellScheduleModal({
  schedules, blocks, schoolName, h24 = false, onClose,
}: {
  /** Every ACTIVE schedule with its OWN bell. Passing one schedule's config
   *  for another's classes would print ring times that never happen. */
  schedules: Array<{ sections: string[]; config: any; periods: Period[] }>
  /** Present only when the timetable was generated block-wise. */
  blocks?: BellBlock[]
  schoolName?: string
  h24?: boolean
  onClose: () => void
}) {
  const hasBlocks = (blocks?.length ?? 0) > 1
  const [view, setView] = useState<View>('classes')
  const active: View = view === 'block' && !hasBlocks ? 'classes' : view

  const columns = useMemo<BellColumn[]>(() => {
    if (active === 'block' && blocks) {
      // A block runs on its own start time and its own period grid, so it is
      // resolved against those rather than the school-wide bell.
      return blocks.flatMap(b => {
        // Deliberately WITHOUT the school-wide bellSchedules: a block-wise
        // timetable means the block defines the clock, and its own start time
        // plus its own period grid are the whole answer. Leaving them in let
        // the school rows split one block into two identically-named columns.
        const cols = bellColumns([{
          sections: b.sectionNames ?? [],
          config: { startTime: b.startTime },
          periods: b.periods ?? [],
        }])
        // One heading per block. Sections inside a block share its clock, so
        // this collapses to a single column; take the first defensively.
        return cols.slice(0, 1).map(c => ({ ...c, sections: [b.name] }))
      })
    }
    const cols = bellColumns(schedules)
    return active === 'range'
      ? cols.map(c => ({ ...c, sections: [rangeLabel(c.sections)] }))
      : cols
  }, [active, schedules, blocks])

  const rows = useMemo(() => bellGrid(columns), [columns])

  const print = () => {
    const win = window.open('', '_blank')
    if (!win) return
    const esc = (s: string) => s.replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]!))
    const head = columns.map(c => `<th>${esc(c.sections.join(', '))}</th>`).join('')
    const body = rows.map(r => `<tr>
      <td class="t">${esc(fmtRingTime(r.startMin, h24))}</td>
      ${r.cells.map(c => `<td>${c.isStart ? esc(c.label!) : ''}</td>`).join('')}
    </tr>`).join('')
    win.document.write(`<!DOCTYPE html><html><head><title>Bell schedule</title><style>
      *{box-sizing:border-box}
      body{font:13px/1.5 system-ui,-apple-system,Segoe UI,Roboto,sans-serif;color:#13111E;margin:26px}
      h1{font-size:19px;margin:0 0 3px}
      .sub{color:#666;font-size:12px;margin:0 0 18px}
      table{border-collapse:collapse;width:100%}
      th,td{border:1px solid #D8D8E0;padding:6px 10px;text-align:left;vertical-align:middle}
      thead th{background:#F4F2FF;font-size:11px;text-transform:uppercase;letter-spacing:.4px}
      td.t{font-weight:700;white-space:nowrap;width:1%}
      @media print{body{margin:12mm}}
    </style></head><body>
      <h1>Bell schedule</h1>
      ${schoolName ? `<p class="sub">${esc(schoolName)}</p>` : ''}
      <table><thead><tr><th>Time</th>${head}</tr></thead><tbody>${body}</tbody></table>
    </body></html>`)
    win.document.close()
    win.focus()
    win.print()
  }

  const shown = VIEWS.filter(v => v.key !== 'block' || hasBlocks)

  return (
    <div onClick={e => { if (e.target === e.currentTarget) onClose() }}
      style={{ position: 'fixed', inset: 0, zIndex: 1100, background: 'rgba(19,17,30,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div style={{ width: '100%', maxWidth: 760, maxHeight: '90vh', display: 'flex', flexDirection: 'column', background: '#fff', borderRadius: 16, overflow: 'hidden', boxShadow: '0 24px 70px rgba(0,0,0,0.28)' }}>
        <div style={{ flexShrink: 0, background: 'linear-gradient(135deg,#7C6FE0,#5D4FCF)', padding: '18px 22px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: '#fff' }}>
            <Bell size={20} />
            <span style={{ fontSize: 18, fontWeight: 800 }}>Bell schedule</span>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={print} title="Print"
              style={{ border: 'none', background: 'rgba(255,255,255,0.18)', color: '#fff', height: 30, padding: '0 12px', borderRadius: 8, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5, fontWeight: 700, fontFamily: 'inherit' }}>
              <Printer size={14} /> Print
            </button>
            <button onClick={onClose}
              style={{ border: 'none', background: 'rgba(255,255,255,0.18)', color: '#fff', width: 30, height: 30, borderRadius: 8, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><X size={16} /></button>
          </div>
        </div>

        <div style={{ padding: 20, flex: 1, minHeight: 0, overflow: 'auto' }}>
          {/* Only offered when there is more than one way to read the sheet. */}
          {shown.length > 1 && (
            <div style={{ display: 'inline-flex', background: '#F4F2FF', border: '1px solid #ECE9FB', borderRadius: 10, padding: 3, marginBottom: 14 }}>
              {shown.map(v => (
                <button key={v.key} onClick={() => setView(v.key)} title={v.hint}
                  style={{
                    padding: '6px 13px', borderRadius: 7, border: 'none', cursor: 'pointer',
                    fontSize: 12, fontWeight: 700, fontFamily: 'inherit',
                    background: active === v.key ? ACCENT : 'transparent',
                    color: active === v.key ? '#fff' : '#4B5275',
                  }}>
                  {v.label}
                </button>
              ))}
            </div>
          )}

          {rows.length === 0 ? (
            <p style={{ fontSize: 13, color: '#767393', margin: 0 }}>
              No bell times yet — generate a schedule and the bells come from its own timings, with nothing to type.
            </p>
          ) : (
            <>
              {columns.length > 1 && (
                <p style={{ fontSize: 12, color: '#767393', margin: '0 0 12px', lineHeight: 1.5 }}>
                  {active === 'block'
                    ? 'Each block runs on its own clock. A blank cell means that block has nothing running then.'
                    : "These classes don't share a clock — early dispersal or class-wise breaks give them their own bells. A blank cell means that column has nothing running then."}
                </p>
              )}
              <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: 'inherit' }}>
                <thead>
                  <tr>
                    <th style={{ ...th, width: 1, whiteSpace: 'nowrap' }}>Time</th>
                    {columns.map((c, i) => <th key={i} style={th}>{c.sections.join(', ')}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, ri) => (
                    <tr key={ri}>
                      <td style={{ ...td, fontWeight: 800, color: '#13111E', whiteSpace: 'nowrap', background: '#FBFAFF' }}>
                        {fmtRingTime(r.startMin, h24)}
                      </td>
                      {r.cells.map((c, ci) => (
                        <td key={ci} style={{
                          ...td,
                          color: c.label ? '#2E2A4A' : '#C9C3EC',
                          fontWeight: c.isStart ? 700 : 400,
                          background: c.label ? '#fff' : '#FCFCFE',
                        }}>
                          {c.isStart ? c.label : ''}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
              {/* The chart's last row starts a block; without this the reader
                  has no idea when the day actually finishes. */}
              <p style={{ fontSize: 12, color: '#767393', margin: '10px 0 0' }}>
                Day ends at <strong>{fmtRingTime(rows[rows.length - 1].endMin, h24)}</strong>.
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

const th: React.CSSProperties = {
  textAlign: 'left', padding: '9px 12px', fontSize: 11, fontWeight: 800,
  letterSpacing: 0.4, textTransform: 'uppercase', color: ACCENT,
  background: '#F4F2FF', border: '1px solid #ECE9FB',
}
const td: React.CSSProperties = {
  padding: '9px 12px', fontSize: 13, border: '1px solid #ECE9FB',
}
