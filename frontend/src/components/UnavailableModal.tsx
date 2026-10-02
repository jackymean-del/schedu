/**
 * Mark somebody unavailable - one form, used wherever it is needed: an
 * administrator on the Calendar or Dashboard, or a teacher reporting
 * themselves from My Teaching.
 *
 * "Unavailable", not "leave": a teacher at an exam centre or a training is not
 * on leave, and their class needs cover all the same. The reason says which.
 * Duration matches how absences really happen - a whole day, half of one,
 * a couple of hours for a meeting, or several days - so cover is arranged for
 * exactly the lessons missed and no others.
 */
import { useState } from 'react'
import { UserMinus, X } from 'lucide-react'
import { UNAVAILABLE_REASONS, type CalLeave } from '@/lib/leaveUtils'

type Span = 'full' | 'first' | 'second' | 'hours' | 'long'

const SPANS: Array<{ key: Span; label: string }> = [
  { key: 'full', label: 'Full day' },
  { key: 'first', label: 'First half' },
  { key: 'second', label: 'Second half' },
  { key: 'hours', label: 'Specific hours' },
  { key: 'long', label: 'Several days' },
]

const ACCENT = '#685DBC'
const toMin = (t: string) => { const [h, m] = t.split(':').map(Number); return (h || 0) * 60 + (m || 0) }

export function UnavailableModal({ teacher, staffOptions, date, self, onClose, onSubmit }: {
  /** Fixed person (a calendar row, or the teacher themselves). */
  teacher?: string
  /** Otherwise, who can be chosen. */
  staffOptions?: string[]
  date: string
  /** The person is reporting themselves - wording changes, nothing else. */
  self?: boolean
  onClose: () => void
  /** Resolves when recorded; a thrown error is shown on the form. */
  onSubmit: (leave: CalLeave) => Promise<void> | void
}) {
  const [who, setWho] = useState(teacher ?? '')
  const [when, setWhen] = useState(date)
  const [until, setUntil] = useState(date)
  const [span, setSpan] = useState<Span>('full')
  const [from, setFrom] = useState('10:00')
  const [to, setTo] = useState('12:00')
  const [reason, setReason] = useState(UNAVAILABLE_REASONS[0].key)
  const [other, setOther] = useState('')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const problem =
    !who.trim() ? 'Choose who is unavailable.'
    : !when ? 'Choose a date.'
    : span === 'long' && until < when ? 'The last day is before the first.'
    : span === 'hours' && toMin(to) <= toMin(from) ? 'The end time must be after the start time.'
    : reason === 'Other' && !other.trim() ? 'Say why.'
    : ''

  const submit = async () => {
    if (problem || busy) return
    const leave: CalLeave = {
      id: `loc-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
      teacher: who.trim(), date: when,
      duration: span === 'first' || span === 'second' ? 'half' : span,
      part: span === 'first' || span === 'second' ? span : undefined,
      endDate: span === 'long' ? until : undefined,
      fromMin: span === 'hours' ? toMin(from) : undefined,
      toMin: span === 'hours' ? toMin(to) : undefined,
      type: reason === 'Other' ? other.trim().slice(0, 80) : reason,
      reason: note.trim() || undefined,
      source: self ? 'self' : 'admin',
    }
    setBusy(true); setError('')
    try {
      await onSubmit(leave)
    } catch (e: any) {
      setError(e?.message || 'Could not record it. Try again.')
      setBusy(false)
    }
  }

  const field: React.CSSProperties = {
    width: '100%', boxSizing: 'border-box', padding: '9px 11px', borderRadius: 9,
    border: '1px solid #E0DBF2', fontSize: 13.5, fontFamily: 'inherit', color: '#13111E', background: '#fff', outline: 'none',
  }
  const label: React.CSSProperties = { fontSize: 12, fontWeight: 700, color: '#4B5275', marginBottom: 6, display: 'block' }

  return (
    <div onClick={e => { if (e.target === e.currentTarget) onClose() }} role="dialog" aria-modal="true" aria-label="Mark unavailable"
      style={{ position: 'fixed', inset: 0, zIndex: 1100, background: 'rgba(19,17,30,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div style={{ width: '100%', maxWidth: 520, maxHeight: '92vh', display: 'flex', flexDirection: 'column', background: '#fff', borderRadius: 16, overflow: 'hidden', boxShadow: '0 24px 70px rgba(0,0,0,0.28)', fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
        <div style={{ padding: '16px 20px', display: 'flex', alignItems: 'center', gap: 12, borderBottom: '1px solid #F1EFFA' }}>
          <span style={{ width: 34, height: 34, borderRadius: 10, background: '#FFF1E6', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}><UserMinus size={17} color="#EA580C" /></span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 17, fontWeight: 800, color: '#13111E' }}>{self ? "I'm unavailable" : 'Mark unavailable'}</div>
            <div style={{ fontSize: 12.5, color: '#6D6A8A' }}>
              {self ? 'Your school sees this and arranges cover.' : 'Cover is arranged for the lessons this takes them out of.'}
            </div>
          </div>
          <button onClick={onClose} aria-label="Close" style={{ border: 'none', background: '#F4F2FC', width: 32, height: 32, borderRadius: 9, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#6B6890' }}><X size={16} /></button>
        </div>

        <div style={{ padding: 20, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 16 }}>
          {!teacher && (
            <div>
              <label style={label} htmlFor="ua-who">Who</label>
              <select id="ua-who" value={who} onChange={e => setWho(e.target.value)} style={{ ...field, cursor: 'pointer' }}>
                <option value="">Choose a teacher…</option>
                {(staffOptions ?? []).map(n => <option key={n} value={n}>{n}</option>)}
              </select>
            </div>
          )}
          {teacher && !self && <div style={{ fontSize: 14, fontWeight: 700, color: '#13111E' }}>{teacher}</div>}

          <div>
            <span style={label}>How long</span>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }} role="radiogroup" aria-label="How long">
              {SPANS.map(s => (
                <button key={s.key} role="radio" aria-checked={span === s.key} onClick={() => setSpan(s.key)}
                  style={{ padding: '7px 12px', borderRadius: 999, cursor: 'pointer', fontSize: 12.5, fontWeight: 700, fontFamily: 'inherit',
                    border: `1.5px solid ${span === s.key ? ACCENT : '#E6E2F2'}`, background: span === s.key ? '#EDE9FF' : '#fff', color: span === s.key ? ACCENT : '#4B5275' }}>
                  {s.label}
                </button>
              ))}
            </div>
          </div>

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
            <div style={{ flex: '1 1 150px' }}>
              <label style={label} htmlFor="ua-date">{span === 'long' ? 'From' : 'Date'}</label>
              <input id="ua-date" type="date" value={when} onChange={e => { setWhen(e.target.value); if (until < e.target.value) setUntil(e.target.value) }} style={field} />
            </div>
            {span === 'long' && (
              <div style={{ flex: '1 1 150px' }}>
                <label style={label} htmlFor="ua-until">To (last day away)</label>
                <input id="ua-until" type="date" value={until} min={when} onChange={e => setUntil(e.target.value)} style={field} />
              </div>
            )}
            {span === 'hours' && (
              <>
                <div style={{ flex: '1 1 100px' }}>
                  <label style={label} htmlFor="ua-from">From</label>
                  <input id="ua-from" type="time" value={from} onChange={e => setFrom(e.target.value)} style={field} />
                </div>
                <div style={{ flex: '1 1 100px' }}>
                  <label style={label} htmlFor="ua-to">To</label>
                  <input id="ua-to" type="time" value={to} onChange={e => setTo(e.target.value)} style={field} />
                </div>
              </>
            )}
          </div>

          <div>
            <label style={label} htmlFor="ua-reason">Reason</label>
            <select id="ua-reason" value={reason} onChange={e => setReason(e.target.value)} style={{ ...field, cursor: 'pointer' }}>
              {UNAVAILABLE_REASONS.map(r => <option key={r.key} value={r.key}>{r.label}</option>)}
            </select>
            {reason === 'Other' && (
              <input value={other} onChange={e => setOther(e.target.value)} placeholder="Why - a few words" maxLength={80}
                aria-label="Other reason" style={{ ...field, marginTop: 8 }} />
            )}
          </div>

          <div>
            <label style={label} htmlFor="ua-note">Note for the school (optional)</label>
            <input id="ua-note" value={note} onChange={e => setNote(e.target.value)} maxLength={500}
              placeholder={self ? 'e.g. Class 7 test papers are on my desk' : 'Anything the cover teacher should know'} style={field} />
          </div>

          {(error || (problem && problem !== 'Choose who is unavailable.')) && (
            <div role="alert" style={{ fontSize: 12.5, color: error ? '#B91C1C' : '#92400E', background: error ? '#FEF2F2' : '#FFFBEB', border: `1px solid ${error ? '#FECACA' : '#FDE68A'}`, borderRadius: 8, padding: '8px 10px' }}>
              {error || problem}
            </div>
          )}
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, padding: '14px 20px', borderTop: '1px solid #F1EFFA' }}>
          <button onClick={onClose} style={{ padding: '10px 18px', borderRadius: 10, border: '1.5px solid #E0DBF2', background: '#fff', fontSize: 13.5, fontWeight: 700, color: '#4B5275', cursor: 'pointer', fontFamily: 'inherit' }}>Cancel</button>
          <button onClick={submit} disabled={!!problem || busy}
            style={{ padding: '10px 20px', borderRadius: 10, border: 'none', fontSize: 13.5, fontWeight: 800, cursor: problem || busy ? 'default' : 'pointer', fontFamily: 'inherit',
              background: problem || busy ? '#D6D2EA' : 'linear-gradient(135deg,#F59E0B,#EA580C)', color: '#fff' }}>
            {busy ? 'Saving…' : self ? 'Report' : 'Mark unavailable'}
          </button>
        </div>
      </div>
    </div>
  )
}
