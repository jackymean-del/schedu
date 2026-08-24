/**
 * Academic terms — ADMIN ONLY, same authority as holidays.
 *
 * Declaring a term doesn't change a single timetable. It changes the WINDOW
 * every hours figure is measured over, which is the difference between "this
 * syllabus will finish by March" and "this syllabus will not finish by the
 * Term 1 exam in three weeks". Both are true at once, and only the second is
 * actionable in November.
 *
 * See lib/academicTerms for why a term narrows a schedule's range rather than
 * replacing it, and why declaring none keeps today's behaviour exactly.
 */
import { useMemo, useState } from 'react'
import { localISO } from '@/lib/days'
import {
  useAcademicTerms, overlappingTerms, termGaps, termOn, type AcademicTerm,
} from '@/lib/academicTerms'
import { Trash2, Plus, CalendarRange } from 'lucide-react'

const ACCENT = '#685DBC'

const todayISO = () => {
  const d = new Date()
  return localISO(d)
}

const fmt = (s: string) =>
  new Date(`${s}T00:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })

/** Teaching days in a range, weekends excluded — a rough size, not the hours
 *  figure, which depends on each schedule's own bell. */
function weekdaysBetween(start: string, end: string): number {
  const a = new Date(`${start}T00:00:00`), b = new Date(`${end}T00:00:00`)
  if (isNaN(a.getTime()) || isNaN(b.getTime()) || a > b) return 0
  let n = 0
  for (const d = new Date(a); d <= b; d.setDate(d.getDate() + 1)) {
    const wd = d.getDay()
    if (wd !== 0 && wd !== 6) n++
  }
  return n
}

export function TermManager({ onSaved }: { onSaved?: () => void }) {
  const { terms, addTerm, updateTerm, removeTerm } = useAcademicTerms()

  const [name, setName] = useState('')
  const [start, setStart] = useState('')
  const [end, setEnd] = useState('')

  const today = todayISO()
  const current = useMemo(() => termOn(terms, today), [terms, today])
  const overlaps = useMemo(() => overlappingTerms(terms), [terms])
  const gaps = useMemo(() => termGaps(terms), [terms])

  const rangeValid = !!start && !!end && end >= start
  const add = () => {
    if (!rangeValid) return
    addTerm({ name: name.trim() || `Term ${terms.length + 1}`, start, end })
    setName(''); setStart(''); setEnd('')
    onSaved?.()
  }

  return (
    <div style={card}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 4 }}>
        <CalendarRange size={16} color={ACCENT} />
        <h3 style={{ margin: 0, fontSize: 14.5, fontWeight: 800, color: '#2E2A4A' }}>Academic terms</h3>
      </div>
      <p style={{ margin: '0 0 14px', fontSize: 12.5, color: '#6D6A8A', lineHeight: 1.5 }}>
        Split the year into the periods you report on. The Syllabus page can then measure hours,
        pace and time remaining per term instead of across the whole schedule. Timetables are not
        affected — this only changes what the figures are measured over.
      </p>

      {terms.length === 0 && (
        <div style={emptyBox}>
          No terms declared. Every figure is measured across each schedule's full run — which is
          fine for a school that doesn't split its year.
        </div>
      )}

      {terms.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 14 }}>
          {terms.map(t => (
            <TermRow
              key={t.id}
              term={t}
              isCurrent={current?.id === t.id}
              onChange={(patch) => { updateTerm(t.id, patch); onSaved?.() }}
              onRemove={() => { removeTerm(t.id); onSaved?.() }}
            />
          ))}
        </div>
      )}

      {overlaps.length > 0 && (
        <div style={warnBox}>
          {overlaps.map(([a, b], i) => (
            <div key={i}>
              <strong>{a.name}</strong> and <strong>{b.name}</strong> overlap. A date inside both
              belongs to whichever comes first, so the later term will under-report those days.
            </div>
          ))}
        </div>
      )}

      {gaps.length > 0 && (
        <div style={noteBox}>
          {gaps.map((g, i) => (
            <div key={i}>
              {g.days} day{g.days === 1 ? '' : 's'} between <strong>{g.after.name}</strong> and{' '}
              <strong>{g.before.name}</strong> — expected if that's the break, worth checking if not.
            </div>
          ))}
        </div>
      )}

      {/* Add */}
      <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', flexWrap: 'wrap' }}>
        <label style={fieldWrap}>
          <span style={fieldLabel}>Name</span>
          <input value={name} onChange={e => setName(e.target.value)}
            placeholder={`Term ${terms.length + 1}`} style={{ ...input, width: 130 }} />
        </label>
        <label style={fieldWrap}>
          <span style={fieldLabel}>Starts</span>
          <input type="date" value={start} onChange={e => setStart(e.target.value)} style={input} />
        </label>
        <label style={fieldWrap}>
          <span style={fieldLabel}>Ends</span>
          <input type="date" value={end} onChange={e => setEnd(e.target.value)} style={input} />
        </label>
        <button onClick={add} disabled={!rangeValid}
          style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '8px 14px', borderRadius: 9, border: 'none',
            background: rangeValid ? ACCENT : '#C9C3EC', color: '#fff',
            fontWeight: 700, fontSize: 12.5, fontFamily: 'inherit',
            cursor: rangeValid ? 'pointer' : 'not-allowed',
          }}>
          <Plus size={13} /> Add term
        </button>
      </div>
      {start && end && end < start && (
        <div style={{ fontSize: 11.5, color: '#dc2626', marginTop: 7 }}>
          The end date is before the start date.
        </div>
      )}
    </div>
  )
}

function TermRow({ term, isCurrent, onChange, onRemove }: {
  term: AcademicTerm
  isCurrent: boolean
  onChange: (patch: Partial<Omit<AcademicTerm, 'id'>>) => void
  onRemove: () => void
}) {
  const days = weekdaysBetween(term.start, term.end)
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
      padding: '9px 12px', borderRadius: 10,
      background: isCurrent ? '#F4F1FF' : '#FBFAFF',
      border: `1px solid ${isCurrent ? '#D8D2FF' : '#ECE9FB'}`,
    }}>
      <input
        value={term.name}
        onChange={e => onChange({ name: e.target.value })}
        style={{ ...input, width: 130, fontWeight: 700 }}
      />
      <input type="date" value={term.start} onChange={e => onChange({ start: e.target.value })} style={input} />
      <span style={{ color: '#6D6A8A', fontSize: 12 }}>→</span>
      <input type="date" value={term.end} onChange={e => onChange({ end: e.target.value })} style={input} />
      <span style={{ fontSize: 11.5, color: '#6D6A8A' }}>
        {fmt(term.start)} – {fmt(term.end)} · {days} weekday{days === 1 ? '' : 's'}
      </span>
      {isCurrent && (
        <span style={{
          fontSize: 10.5, fontWeight: 800, letterSpacing: 0.3, textTransform: 'uppercase',
          padding: '3px 8px', borderRadius: 20, background: '#EDE9FF', color: ACCENT,
        }}>
          Now
        </span>
      )}
      <button onClick={onRemove} title="Remove this term"
        style={{
          marginLeft: 'auto', display: 'flex', alignItems: 'center',
          background: 'none', border: 'none', cursor: 'pointer', color: '#B9B4D6', padding: 4,
        }}>
        <Trash2 size={14} />
      </button>
    </div>
  )
}

const card: React.CSSProperties = {
  background: '#fff', border: '1px solid #ECE9FB', borderRadius: 14, padding: '18px 20px',
}
const input: React.CSSProperties = {
  padding: '7px 10px', borderRadius: 8, border: '1px solid #E3DFF7',
  fontSize: 12.5, fontFamily: 'inherit', color: '#2E2A4A', background: '#fff',
}
const fieldWrap: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: 4 }
const fieldLabel: React.CSSProperties = { fontSize: 11, fontWeight: 700, color: '#6D6A8A' }
const emptyBox: React.CSSProperties = {
  fontSize: 12, color: '#6D6A8A', padding: '10px 12px', borderRadius: 10,
  background: '#FBFAFF', border: '1px solid #ECE9FB', marginBottom: 14, lineHeight: 1.5,
}
const warnBox: React.CSSProperties = {
  fontSize: 11.5, color: '#92400E', padding: '9px 12px', borderRadius: 10,
  background: '#FFFBEB', border: '1px solid #FDE68A', marginBottom: 12,
  display: 'flex', flexDirection: 'column', gap: 4, lineHeight: 1.5,
}
const noteBox: React.CSSProperties = {
  fontSize: 11.5, color: '#6D6A8A', padding: '9px 12px', borderRadius: 10,
  background: '#FBFAFF', border: '1px solid #ECE9FB', marginBottom: 12,
  display: 'flex', flexDirection: 'column', gap: 4, lineHeight: 1.5,
}
