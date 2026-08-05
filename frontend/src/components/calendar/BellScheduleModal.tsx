/**
 * The bell schedule, as a sheet you can pin up.
 *
 * Laid out the way a bell chart is read on a wall: time down the left, classes
 * across the top, and each cell naming the block that is running. A block that
 * spans several time bands is named once, on the row it starts.
 *
 * Everything is derived — nobody types a bell time. See lib/bellSchedule for
 * why classes on different clocks get their own column rather than being
 * flattened into one list that would ring for nobody.
 */
import { useMemo } from 'react'
import { Bell, X, Printer } from 'lucide-react'
import { bellColumns, bellGrid, fmtRingTime } from '@/lib/bellSchedule'
import type { Period } from '@/types'

const ACCENT = '#7C6FE0'

export function BellScheduleModal({
  schedules, schoolName, h24 = false, onClose,
}: {
  /** Every ACTIVE schedule with its OWN bell. Passing one schedule's config
   *  for another's classes would print ring times that never happen. */
  schedules: Array<{ sections: string[]; config: any; periods: Period[] }>
  schoolName?: string
  h24?: boolean
  onClose: () => void
}) {
  const columns = useMemo(() => bellColumns(schedules), [schedules])
  const rows = useMemo(() => bellGrid(columns), [columns])

  const band = (startMin: number, endMin: number) =>
    `${fmtRingTime(startMin, h24)} – ${fmtRingTime(endMin, h24)}`

  const print = () => {
    const win = window.open('', '_blank')
    if (!win) return
    const esc = (s: string) => s.replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]!))
    const head = columns.map(c => `<th>${esc(c.sections.join(', '))}</th>`).join('')
    const body = rows.map(r => `<tr>
      <td class="t">${esc(band(r.startMin, r.endMin))}</td>
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
          {rows.length === 0 ? (
            <p style={{ fontSize: 13, color: '#8B87AD', margin: 0 }}>
              No bell times yet — generate a schedule and the bells come from its own timings, with nothing to type.
            </p>
          ) : (
            <>
              {columns.length > 1 && (
                <p style={{ fontSize: 12, color: '#8B87AD', margin: '0 0 12px', lineHeight: 1.5 }}>
                  These classes don't share a clock — early dispersal or class-wise breaks give them
                  their own bells. A blank cell means that column has nothing running then.
                </p>
              )}
              <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: 'inherit' }}>
                <thead>
                  <tr>
                    <th style={{ ...th, width: 1, whiteSpace: 'nowrap' }}>Time</th>
                    {columns.map((c, i) => (
                      <th key={i} style={th}>{c.sections.join(', ')}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, ri) => (
                    <tr key={ri}>
                      <td style={{ ...td, fontWeight: 800, color: '#13111E', whiteSpace: 'nowrap', background: '#FBFAFF' }}>
                        {band(r.startMin, r.endMin)}
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
