/**
 * BackwardSyncReport — opt-in reconciliation + printable allocation reports.
 *
 * Post-generation, the timetable can be hand-edited / re-optimised while the
 * Allocation plan stays as the user set it (an intentional custom load is never
 * silently overwritten). This modal lets the user, ON DEMAND:
 *   1. See the Class and Faculty allocation implied by the CURRENT timetable.
 *   2. "Backward Sync" — push those numbers back into the Allocation plan
 *      (teacherAllocations + subjectAllocations) so the wizard steps match.
 *   3. Print or download the reports in a clean format.
 *
 * Periods are the native unit; hours are shown as periods × periodMinutes / 60
 * (e.g. 30 periods × 40 min = 20 h), and faculty load is compared to the
 * national safe teaching-period norm.
 */
import { useMemo, useState } from 'react'
import { useTimetableStore } from '@/store/timetableStore'
import { deriveTeacherAllocations, deriveSubjectAllocations } from '@/lib/schedulingEngine'
import { teacherNorms } from '@/lib/educationNorms'
import type { ClassTimetable, Section, Staff } from '@/types'
import { X, ArrowLeftRight, Printer, Download, Check } from 'lucide-react'

const asHours = (periods: number, periodMinutes: number) => {
  const mins = periods * periodMinutes
  const h = Math.floor(mins / 60), m = mins % 60
  return m ? `${h}h ${m}m` : `${h}h`
}

export function BackwardSyncReport({
  classTT, sections, staff, periodMinutes, countryCode, onClose,
}: {
  classTT: ClassTimetable
  sections: Section[]
  staff: Staff[]
  periodMinutes: number
  countryCode: string
  onClose: () => void
}) {
  const [synced, setSynced] = useState(false)
  const norm = teacherNorms(countryCode)

  // Faculty allocation: teacher → total periods (+ the sections/subjects taught).
  const faculty = useMemo(() => {
    const ta = deriveTeacherAllocations(classTT)
    const rows = Object.keys(ta).map(teacher => {
      let total = 0
      const items: string[] = []
      for (const sec in ta[teacher]) for (const sub in ta[teacher][sec]) {
        const p = ta[teacher][sec][sub]; total += p
        items.push(`${sec} · ${sub} (${p})`)
      }
      return { teacher, total, items: items.sort() }
    })
    return rows.sort((a, b) => b.total - a.total)
  }, [classTT])

  // Class allocation: section → subject → periods.
  const classes = useMemo(() => {
    const sa = deriveSubjectAllocations(classTT)
    const order = sections.map(s => s.name).filter(n => sa[n])
    for (const n in sa) if (!order.includes(n)) order.push(n)
    return order.map(sec => {
      const subs = Object.entries(sa[sec]).map(([subject, v]) => ({ subject, periods: Number(v) })).sort((a, b) => b.periods - a.periods)
      const total = subs.reduce((a, s) => a + s.periods, 0)
      return { section: sec, subs, total }
    })
  }, [classTT, sections])

  const doBackwardSync = () => {
    const s = useTimetableStore.getState() as any
    s.setTeacherAllocations?.(deriveTeacherAllocations(classTT))
    s.setSubjectAllocations?.(deriveSubjectAllocations(classTT))
    setSynced(true)
  }

  const buildReportHTML = () => {
    const esc = (x: string) => String(x).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' } as any)[c])
    const facultyRows = faculty.map(f => {
      const over = f.total > norm.safeMaxPeriodsWeek
      return `<tr><td>${esc(f.teacher)}</td><td class="num">${f.total}</td><td class="num">${asHours(f.total, periodMinutes)}</td><td class="num">${norm.safeMaxPeriodsWeek}</td><td class="${over ? 'over' : 'ok'}">${over ? 'Over safe load' : 'Within norm'}</td><td>${esc(f.items.join('; '))}</td></tr>`
    }).join('')
    const classRows = classes.map(c =>
      `<tr><td>${esc(c.section)}</td><td>${esc(c.subs.map(s => `${s.subject} (${s.periods})`).join(', '))}</td><td class="num">${c.total}</td><td class="num">${asHours(c.total, periodMinutes)}</td></tr>`
    ).join('')
    return `<!doctype html><html><head><meta charset="utf-8"><title>Allocation Report</title>
      <style>
        body{font-family:'Plus Jakarta Sans',Arial,sans-serif;color:#13111E;margin:28px}
        h1{font-size:18px;margin:0 0 2px} h2{font-size:14px;margin:22px 0 8px;color:#4B41C4}
        .sub{color:#6b6786;font-size:11px;margin-bottom:6px}
        table{border-collapse:collapse;width:100%;font-size:11px;margin-bottom:8px}
        th,td{border:1px solid #E3E0F0;padding:5px 8px;text-align:left;vertical-align:top}
        th{background:#F3F1FC;font-weight:700} .num{text-align:right;font-variant-numeric:tabular-nums}
        .over{color:#B42318;font-weight:700}.ok{color:#067647}
        @media print{body{margin:10mm}}
      </style></head><body>
      <h1>Allocation Report</h1>
      <div class="sub">1 period = ${periodMinutes} min · hours = periods × ${periodMinutes}/60 · safe teaching load ≈ ${norm.safeMaxPeriodsWeek} periods/wk (${countryCode})</div>
      <h2>Faculty allocation</h2>
      <table><thead><tr><th>Teacher</th><th class="num">Periods/wk</th><th class="num">Hours/wk</th><th class="num">Safe max</th><th>Status</th><th>Sections · subjects (periods)</th></tr></thead><tbody>${facultyRows}</tbody></table>
      <h2>Class allocation</h2>
      <table><thead><tr><th>Class</th><th>Subjects (periods)</th><th class="num">Periods/wk</th><th class="num">Hours/wk</th></tr></thead><tbody>${classRows}</tbody></table>
      </body></html>`
  }

  const doPrint = () => {
    const w = window.open('', '_blank')
    if (!w) return
    w.document.write(buildReportHTML())
    w.document.close()
    w.focus()
    setTimeout(() => w.print(), 250)
  }

  const doDownloadCSV = () => {
    const q = (x: string) => `"${String(x).replace(/"/g, '""')}"`
    let csv = 'FACULTY ALLOCATION\nTeacher,Periods/wk,Hours/wk,Safe max,Status,Sections & subjects\n'
    faculty.forEach(f => {
      csv += [q(f.teacher), f.total, q(asHours(f.total, periodMinutes)), norm.safeMaxPeriodsWeek,
        q(f.total > norm.safeMaxPeriodsWeek ? 'Over safe load' : 'Within norm'), q(f.items.join('; '))].join(',') + '\n'
    })
    csv += '\nCLASS ALLOCATION\nClass,Subjects (periods),Periods/wk,Hours/wk\n'
    classes.forEach(c => {
      csv += [q(c.section), q(c.subs.map(s => `${s.subject} (${s.periods})`).join(', ')), c.total, q(asHours(c.total, periodMinutes))].join(',') + '\n'
    })
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = 'allocation-report.csv'
    a.click()
    URL.revokeObjectURL(a.href)
  }

  const btn = (bg: string, fg: string): React.CSSProperties => ({
    display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 14px',
    borderRadius: 8, border: 'none', background: bg, color: fg, fontSize: 12.5,
    fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
  })

  return (
    <div onClick={e => { if (e.target === e.currentTarget) onClose() }}
      style={{ position: 'fixed', inset: 0, zIndex: 1100, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
      <div style={{ width: '100%', maxWidth: 860, maxHeight: '90vh', overflow: 'auto', background: '#fff', borderRadius: 14, border: '1px solid #E5E7EB', boxShadow: '0 8px 40px rgba(0,0,0,0.18)' }}>
        {/* Header */}
        <div style={{ position: 'sticky', top: 0, background: '#fff', borderBottom: '1px solid #EEE', padding: '16px 20px', display: 'flex', alignItems: 'center', gap: 10, zIndex: 1 }}>
          <ArrowLeftRight size={17} color="#7C6FE0" />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 15, fontWeight: 800, color: '#13111E' }}>Backward Sync &amp; Allocation Report</div>
            <div style={{ fontSize: 11.5, color: '#8B87AD' }}>What the current timetable implies for your Class &amp; Faculty allocation.</div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#8B87AD' }}><X size={18} /></button>
        </div>

        <div style={{ padding: '16px 20px' }}>
          {/* Units + sync banner */}
          <div style={{ background: '#F5F2FF', border: '1px solid #E4E0FF', borderRadius: 10, padding: '10px 13px', fontSize: 11.5, color: '#4B5275', marginBottom: 14 }}>
            <strong>1 period = {periodMinutes} min.</strong> Hours = periods × {periodMinutes}/60 (e.g. 30 periods = {asHours(30, periodMinutes)}). Safe teaching load ≈ <strong>{norm.safeMaxPeriodsWeek} periods/wk</strong> for {countryCode} — a teaching-period count, separate from total working hours (which include prep).
          </div>

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
            <button onClick={doBackwardSync} style={btn(synced ? '#DCFCE7' : 'linear-gradient(135deg,#7C6FE0,#9B8EF5)', synced ? '#067647' : '#fff')}>
              {synced ? <><Check size={14} /> Synced to Allocation plan</> : <><ArrowLeftRight size={14} /> Backward Sync to Allocation</>}
            </button>
            <button onClick={doPrint} style={btn('#F8F7FF', '#7C6FE0')}><Printer size={14} /> Print</button>
            <button onClick={doDownloadCSV} style={btn('#F8F7FF', '#7C6FE0')}><Download size={14} /> Download CSV</button>
          </div>
          {synced && (
            <div style={{ fontSize: 11.5, color: '#067647', marginBottom: 14 }}>
              ✓ Your Allocation plan (Resources → Allocation) now matches this timetable. Re-generating will start from these numbers.
            </div>
          )}

          {/* Faculty allocation */}
          <div style={{ fontSize: 13, fontWeight: 800, color: '#4B41C4', margin: '4px 0 8px' }}>Faculty allocation</div>
          <div style={{ overflowX: 'auto', marginBottom: 20 }}>
            <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: 11.5 }}>
              <thead><tr style={{ background: '#F3F1FC' }}>
                {['Teacher', 'Periods/wk', 'Hours/wk', 'Safe max', 'Status', 'Sections · subjects'].map((h, i) => (
                  <th key={h} style={{ border: '1px solid #E3E0F0', padding: '5px 8px', textAlign: i >= 1 && i <= 3 ? 'right' : 'left', fontWeight: 700 }}>{h}</th>
                ))}
              </tr></thead>
              <tbody>{faculty.map(f => {
                const over = f.total > norm.safeMaxPeriodsWeek
                return (<tr key={f.teacher}>
                  <td style={{ border: '1px solid #E3E0F0', padding: '5px 8px' }}>{f.teacher}</td>
                  <td style={{ border: '1px solid #E3E0F0', padding: '5px 8px', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{f.total}</td>
                  <td style={{ border: '1px solid #E3E0F0', padding: '5px 8px', textAlign: 'right' }}>{asHours(f.total, periodMinutes)}</td>
                  <td style={{ border: '1px solid #E3E0F0', padding: '5px 8px', textAlign: 'right' }}>{norm.safeMaxPeriodsWeek}</td>
                  <td style={{ border: '1px solid #E3E0F0', padding: '5px 8px', color: over ? '#B42318' : '#067647', fontWeight: over ? 700 : 500 }}>{over ? 'Over safe load' : 'Within norm'}</td>
                  <td style={{ border: '1px solid #E3E0F0', padding: '5px 8px', color: '#6b6786' }}>{f.items.join('; ')}</td>
                </tr>)
              })}</tbody>
            </table>
          </div>

          {/* Class allocation */}
          <div style={{ fontSize: 13, fontWeight: 800, color: '#4B41C4', margin: '4px 0 8px' }}>Class allocation</div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: 11.5 }}>
              <thead><tr style={{ background: '#F3F1FC' }}>
                {['Class', 'Subjects (periods)', 'Periods/wk', 'Hours/wk'].map((h, i) => (
                  <th key={h} style={{ border: '1px solid #E3E0F0', padding: '5px 8px', textAlign: i >= 2 ? 'right' : 'left', fontWeight: 700 }}>{h}</th>
                ))}
              </tr></thead>
              <tbody>{classes.map(c => (
                <tr key={c.section}>
                  <td style={{ border: '1px solid #E3E0F0', padding: '5px 8px', fontWeight: 600 }}>{c.section}</td>
                  <td style={{ border: '1px solid #E3E0F0', padding: '5px 8px', color: '#4B5275' }}>{c.subs.map(s => `${s.subject} (${s.periods})`).join(', ')}</td>
                  <td style={{ border: '1px solid #E3E0F0', padding: '5px 8px', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{c.total}</td>
                  <td style={{ border: '1px solid #E3E0F0', padding: '5px 8px', textAlign: 'right' }}>{asHours(c.total, periodMinutes)}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  )
}
