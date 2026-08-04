/**
 * The bell schedule, as a sheet you can pin up.
 *
 * Everything here is derived — nobody types a bell time. See lib/bellSchedule
 * for why one moment is one bell (P1 ends and P2 begins together) and why
 * sections with different clocks get their own column rather than being
 * flattened into a single list that would ring for nobody.
 */
import { useMemo } from 'react'
import { Bell, X, Printer } from 'lucide-react'
import { bellGroups, describeRing, fmtRingTime, minutesToNextRing } from '@/lib/bellSchedule'
import type { Period } from '@/types'

const ACCENT = '#7C6FE0'

export function BellScheduleModal({
  sections, config, periods, schoolName, nowMin, h24 = false, onClose,
}: {
  sections: string[]
  config: any
  periods: Period[]
  schoolName?: string
  /** Minutes past midnight, for the "next bell" line. Omit to hide it. */
  nowMin?: number
  h24?: boolean
  onClose: () => void
}) {
  const groups = useMemo(() => bellGroups(sections, config, periods), [sections, config, periods])

  const print = () => {
    const win = window.open('', '_blank')
    if (!win) return
    const esc = (s: string) => s.replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]!))
    const cols = groups.map(g => `
      <section>
        <h2>${esc(g.sections.join(', '))}</h2>
        <table>
          <thead><tr><th>Time</th><th>Bell</th></tr></thead>
          <tbody>
            ${g.rings.map(r => `<tr><td class="t">${esc(fmtRingTime(r.at, h24))}</td><td>${esc(describeRing(r))}</td></tr>`).join('')}
          </tbody>
        </table>
      </section>`).join('')
    win.document.write(`<!DOCTYPE html><html><head><title>Bell schedule</title><style>
      *{box-sizing:border-box}
      body{font:13px/1.5 system-ui,-apple-system,Segoe UI,Roboto,sans-serif;color:#13111E;margin:26px}
      h1{font-size:19px;margin:0 0 3px}
      .sub{color:#666;font-size:12px;margin:0 0 18px}
      .wrap{display:flex;gap:26px;flex-wrap:wrap;align-items:flex-start}
      section{break-inside:avoid;min-width:230px}
      h2{font-size:13px;margin:0 0 7px;padding-bottom:5px;border-bottom:2px solid #13111E}
      table{border-collapse:collapse;width:100%}
      th{text-align:left;font-size:10px;text-transform:uppercase;letter-spacing:.5px;color:#666;padding:5px 8px 5px 0}
      td{padding:5px 8px 5px 0;border-top:1px solid #E5E5E5}
      td.t{font-weight:700;white-space:nowrap}
      @media print{body{margin:12mm}}
    </style></head><body>
      <h1>Bell schedule</h1>
      <p class="sub">${esc(schoolName ?? '')}</p>
      <div class="wrap">${cols}</div>
    </body></html>`)
    win.document.close()
    win.focus()
    win.print()
  }

  return (
    <div onClick={e => { if (e.target === e.currentTarget) onClose() }}
      style={{ position: 'fixed', inset: 0, zIndex: 1100, background: 'rgba(19,17,30,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div style={{ width: '100%', maxWidth: 640, maxHeight: '90vh', display: 'flex', flexDirection: 'column', background: '#fff', borderRadius: 16, overflow: 'hidden', boxShadow: '0 24px 70px rgba(0,0,0,0.28)' }}>
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

        <div style={{ padding: 20, flex: 1, minHeight: 0, overflowY: 'auto' }}>
          {groups.length === 0 ? (
            <p style={{ fontSize: 13, color: '#8B87AD', margin: 0 }}>
              No bell times yet — generate a schedule and the bells come from its own timings, with nothing to type.
            </p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
              {groups.length > 1 && (
                <p style={{ fontSize: 12, color: '#8B87AD', margin: 0, lineHeight: 1.5 }}>
                  These classes don't share a clock — early dispersal or class-wise breaks give them
                  their own bells. Each list below rings only for the classes named above it.
                </p>
              )}
              {groups.map((g, i) => {
                const toNext = nowMin != null ? minutesToNextRing(g.rings, nowMin) : undefined
                return (
                  <div key={i} style={{ border: '1px solid #ECE9FB', borderRadius: 12, overflow: 'hidden' }}>
                    <div style={{ padding: '10px 14px', background: '#FBFAFF', borderBottom: '1px solid #ECE9FB', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
                      <span style={{ fontSize: 13, fontWeight: 800, color: '#2E2A4A' }}>{g.sections.join(', ')}</span>
                      {toNext != null && (
                        <span style={{ fontSize: 11.5, fontWeight: 700, color: ACCENT, background: '#EDE9FF', padding: '3px 9px', borderRadius: 20 }}>
                          Next bell in {toNext} min
                        </span>
                      )}
                    </div>
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                      <tbody>
                        {g.rings.map((r, j) => (
                          <tr key={j} style={{ borderTop: j ? '1px solid #F3F1FB' : 'none' }}>
                            <td style={{ padding: '8px 14px', fontSize: 13, fontWeight: 800, color: '#13111E', whiteSpace: 'nowrap', width: 110 }}>
                              {fmtRingTime(r.at, h24)}
                            </td>
                            <td style={{ padding: '8px 14px', fontSize: 12.5, color: '#4B5275' }}>{describeRing(r)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
