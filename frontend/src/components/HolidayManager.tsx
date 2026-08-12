/**
 * School holiday calendar — ADMIN ONLY (Blueprint v6 permissions).
 *
 * "Admin can: set and mark holidays from the beginning of the session, set an
 *  ad hoc missed day at any point, mark a faculty member as absent.
 *  Faculty can: only mark a period/day as missed … faculty does NOT have general
 *  holiday-setting authority. That stays an admin action."
 *
 * So this lives in Settings (the admin surface), not on the Syllabus page that
 * faculty use day to day. Faculty keep the per-subject "Lost classes" log, which
 * is exactly the narrower right the blueprint grants them.
 *
 * Declared holidays are applied by deriving each subject's lost hours from the
 * timetable — see lib/holidays.ts — so one entry here updates coverage
 * everywhere without anyone logging it per subject.
 */
import { useMemo, useState } from 'react'
import { useHolidays, holidayImpact, totalHolidayHours, weekdayOf } from '@/lib/holidays'
import { useTimetableStore } from '@/store/timetableStore'
import { ScopePicker, describeScope } from '@/components/ScopePicker'
import { Trash2, Plus, Upload, CalendarDays } from 'lucide-react'

const ACCENT = '#7C6FE0'

export function HolidayManager({ onSaved }: { onSaved?: () => void }) {
  const { holidays, addHoliday, removeHoliday } = useHolidays()
  const store = useTimetableStore() as any
  const sections: any[] = store.sections ?? []
  const periodMinutes = store.config?.periodMinutes ?? 40

  const sectionNames: string[] = sections.map((s: any) => s.name).filter(Boolean)

  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [name, setName] = useState('')
  // Empty = whole school. Most holidays are; a class trip or board exam is not.
  const [scope, setScope] = useState<string[]>([])
  const [bulkOpen, setBulkOpen] = useState(false)
  const [bulk, setBulk] = useState('')
  const [bulkMsg, setBulkMsg] = useState('')

  const impact = useMemo(
    () => holidayImpact(store.classTT ?? {}, holidays, periodMinutes),
    [store.classTT, holidays, periodMinutes],
  )
  const total = totalHolidayHours(impact)

  const add = () => {
    if (!date) return
    addHoliday({ date, name: name.trim() || 'Holiday', sections: scope.length ? scope : undefined })
    setName('')
    onSaved?.()
  }

  /**
   * Bulk paste — one holiday per line, "date, name, classes" (all but the date
   * optional). Accepts YYYY-MM-DD or DD/MM/YYYY, tolerates a header row and
   * blank lines, and reports exactly what it skipped rather than failing
   * silently. The third field narrows the holiday to particular classes: a
   * space- or slash-separated list of section names, matched case-insensitively
   * against the school's own; anything unrecognised is reported, never guessed.
   */
  const importBulk = () => {
    const lines = bulk.split(/\r?\n/).map(l => l.trim()).filter(Boolean)
    let added = 0
    const skipped: string[] = []
    const unknownScopes = new Set<string>()
    for (const line of lines) {
      const [rawDate, rawName, rawScope] = line.split(/[,\t;]/)
      const d = normaliseDate((rawDate ?? '').trim())
      if (!d) { skipped.push(line); continue }
      const scoped: string[] = []
      for (const token of (rawScope ?? '').split(/[/|+]|\s+/).map(t => t.trim()).filter(Boolean)) {
        const match = sectionNames.find(s => s.toLowerCase() === token.toLowerCase())
        if (match) scoped.push(match)
        else unknownScopes.add(token)
      }
      addHoliday({
        date: d, name: (rawName ?? '').trim() || 'Holiday',
        sections: scoped.length ? scoped : undefined,
      })
      added++
    }
    const unknownNote = unknownScopes.size
      ? ` · ignored unknown class${unknownScopes.size > 1 ? 'es' : ''} ${[...unknownScopes].join(', ')} (those entries apply school-wide)`
      : ''
    setBulkMsg(
      added === 0
        ? `Nothing imported — no usable dates found${skipped.length ? ` (${skipped.length} line${skipped.length > 1 ? 's' : ''} unreadable)` : ''}.`
        : `Added ${added} holiday${added > 1 ? 's' : ''}${skipped.length ? ` · skipped ${skipped.length} unreadable line${skipped.length > 1 ? 's' : ''}` : ''}${unknownNote}.`,
    )
    if (added > 0) { setBulk(''); onSaved?.() }
  }

  const onFile = async (f: File | null) => {
    if (!f) return
    setBulk(await f.text())
    setBulkMsg('')
  }

  return (
    <section style={{ background: '#fff', borderRadius: 14, border: '1px solid #ECE9FB', padding: 20 }}>
      <h2 style={{ fontSize: 15, fontWeight: 800, color: '#13111E', margin: 0, display: 'flex', alignItems: 'center', gap: 7 }}>
        <CalendarDays size={15} color={ACCENT} /> School holidays
      </h2>
      <p style={{ fontSize: 12.5, color: '#6D6A8A', margin: '4px 0 16px' }}>
        Admin-only. Declare a holiday once — every subject scheduled that weekday loses its periods automatically,
        and remaining-hours figures update across the app. Faculty can still log a missed period for their own subject,
        but only an admin sets holidays.
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {holidays.length > 0 && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap',
            padding: '8px 11px', borderRadius: 9,
            background: total > 0 ? '#FFFBEB' : '#F8F7FF',
            border: `1px solid ${total > 0 ? '#FDE68A' : '#ECE9FB'}`, fontSize: 12,
          }}>
            <strong style={{ color: total > 0 ? '#92400E' : '#4B41C4' }}>
              {holidays.length} holiday{holidays.length > 1 ? 's' : ''} declared
            </strong>
            <span style={{ color: '#6D6A8A' }}>
              {total > 0
                ? `— ${total} teaching hours removed from the year.`
                : '— no teaching hours affected yet (generate a timetable and the impact appears here).'}
            </span>
          </div>
        )}

        {holidays.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5, maxHeight: 260, overflowY: 'auto' }}>
            {holidays.map(h => {
              const wd = weekdayOf(h.date)
              const hrs = Object.entries(impact)
                .filter(([, v]) => v.dates.includes(h.date))
                .reduce((a, [, v]) => a + v.hours, 0)
              return (
                <div key={h.id} style={{ display: 'grid', gridTemplateColumns: '110px 90px 1fr 90px 30px', gap: 8, alignItems: 'center', padding: '6px 9px', borderRadius: 8, border: '1px solid #ECE9FB' }}>
                  <span style={{ fontSize: 11.5, fontFamily: "'DM Mono', monospace", color: '#4B5275' }}>{h.date}</span>
                  <span style={{ fontSize: 11, color: '#6D6A8A' }}>{wd ? wd[0] + wd.slice(1).toLowerCase() : '—'}</span>
                  <span style={{ fontSize: 12, color: '#13111E', fontWeight: 600 }}>
                    {h.name}
                    <span style={{ color: h.sections?.length ? '#4B41C4' : '#6D6A8A', fontWeight: h.sections?.length ? 600 : 400 }}>
                      {' · '}{describeScope(h.sections, sectionNames)}
                    </span>
                  </span>
                  <span style={{ fontSize: 11.5, fontFamily: "'DM Mono', monospace", textAlign: 'right', color: hrs > 0 ? '#B45309' : '#C9C3EC', fontWeight: 700 }}>
                    {hrs > 0 ? `${Math.round(hrs * 10) / 10} h lost` : '—'}
                  </span>
                  <button onClick={() => removeHoliday(h.id)} title="Remove holiday"
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#C9C3EC', display: 'flex', justifyContent: 'center' }}>
                    <Trash2 size={13} />
                  </button>
                </div>
              )
            })}
          </div>
        )}

        {/* Add one */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 11 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '150px 1fr 130px', gap: 8, alignItems: 'end' }}>
            <label style={{ display: 'block' }}>
              <div style={lbl}>Date</div>
              <input type="date" value={date} onChange={e => setDate(e.target.value)} style={inputStyle} />
            </label>
            <label style={{ display: 'block' }}>
              <div style={lbl}>Name</div>
              <input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Independence Day"
                onKeyDown={e => { if (e.key === 'Enter') add() }} style={inputStyle} />
            </label>
            <button onClick={add} disabled={!date} style={{ ...btnPrimary, opacity: date ? 1 : 0.5 }}>
              <Plus size={13} /> Add holiday
            </button>
          </div>
          {/* A board exam or a class trip closes one class, not the school. */}
          <ScopePicker sections={sectionNames} value={scope} onChange={setScope} />
        </div>

        {/* Bulk */}
        <div>
          <button onClick={() => setBulkOpen(o => !o)} style={btnGhost}>
            <Upload size={13} /> {bulkOpen ? 'Hide bulk upload' : 'Bulk upload holidays'}
          </button>
          {bulkOpen && (
            <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ fontSize: 11.5, color: '#6D6A8A' }}>
                One per line: <code>date, name, classes</code> — e.g. <code>2026-08-15, Independence Day</code>.
                Dates may be <code>YYYY-MM-DD</code> or <code>DD/MM/YYYY</code>; a header row and blank lines are ignored.
                Leave the third field out for the whole school, or list class-sections
                (<code>IX-A IX-B</code>) to close only those.
              </div>
              <input type="file" accept=".csv,.txt" onChange={e => onFile(e.target.files?.[0] ?? null)}
                style={{ fontSize: 12, color: '#4B5275' }} />
              <textarea
                value={bulk} onChange={e => { setBulk(e.target.value); setBulkMsg('') }}
                rows={6} placeholder={'2026-08-15, Independence Day\n2026-10-02, Gandhi Jayanti\n25/12/2026, Christmas\n2026-11-09, Board exam leave, IX-A IX-B'}
                style={{ ...inputStyle, fontFamily: "'DM Mono', monospace", fontSize: 12, resize: 'vertical' }}
              />
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <button onClick={importBulk} disabled={!bulk.trim()} style={{ ...btnPrimary, opacity: bulk.trim() ? 1 : 0.5 }}>
                  Import
                </button>
                {bulkMsg && <span style={{ fontSize: 11.5, color: /^Added/.test(bulkMsg) ? '#067647' : '#B45309' }}>{bulkMsg}</span>}
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  )
}

/** Accept YYYY-MM-DD or DD/MM/YYYY (also with - or .), else reject. */
export function normaliseDate(s: string): string | null {
  const t = (s ?? '').trim()
  if (!t) return null
  if (/^\d{4}-\d{2}-\d{2}$/.test(t)) return isRealDate(t) ? t : null
  const m = t.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/)
  if (m) {
    const iso = `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`
    return isRealDate(iso) ? iso : null
  }
  return null
}
function isRealDate(iso: string): boolean {
  const d = new Date(`${iso}T00:00:00`)
  return !isNaN(d.getTime()) && iso === `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

const lbl: React.CSSProperties = { fontSize: 12, fontWeight: 600, color: '#4B5275', marginBottom: 5 }
const inputStyle: React.CSSProperties = { width: '100%', padding: '9px 11px', borderRadius: 9, border: '1px solid #E5E7EB', fontSize: 13.5, fontFamily: 'inherit', color: '#13111E', outline: 'none', background: '#fff' }
const btnPrimary: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 5, padding: '9px 14px', borderRadius: 9, border: 'none', background: ACCENT, color: '#fff', fontSize: 12.5, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }
const btnGhost: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 13px', borderRadius: 9, border: '1px solid #E4E0FF', background: '#F8F7FF', color: ACCENT, fontSize: 12.5, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }
