/**
 * A TEACHER'S OWN DAY, and the one decision they get to make.
 *
 * Everything else in this app is built for whoever plans the timetable. This
 * page is for the person who teaches it: the schedules a school has put them
 * on, today's lessons, and — where the school runs an OR group — the button
 * that says "I'll take this one".
 *
 * An OR group is a subject CHOICE for a whole class, "Physics OR Chemistry",
 * normally settled by whichever subject is further behind on syllabus. A
 * teacher may override that for one day, because they know things the
 * percentages do not: a lab free this morning, an exam next week, a topic left
 * half-finished. They may only ever claim a slot for a subject THEY teach, and
 * the server enforces that rather than this page — a button that is merely
 * hidden is not a permission.
 *
 * Decisions are DATED. "We are doing Physics this Tuesday" is a fact about
 * Tuesday; making it permanent would quietly rewrite every Tuesday after it.
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { CalendarDays, Check, Loader2, RefreshCw } from 'lucide-react'
import { collabApi, type MySchedule, type OrSlotRow } from '@/api/client'
import { useAuthStore } from '@/store/authStore'
import { localISO, DAY_NAMES } from '@/lib/days'
import { orDecisionKey } from '@/lib/orChoice'
import { PageHeader } from '@/components/layout/PageHeader'

const INK = '#13111E'
const DIM = '#6D6A8A'
const LINE = '#E8E4FF'
const ACCENT = '#685DBC'

export function MyTeachingPage() {
  const user = useAuthStore(s => s.user)
  const [schedules, setSchedules] = useState<MySchedule[] | null>(null)
  const [activeId, setActiveId] = useState<string>('')
  const [slots, setSlots] = useState<OrSlotRow[] | null>(null)
  const [busyKey, setBusyKey] = useState<string>('')
  const [error, setError] = useState('')
  const [date, setDate] = useState(() => localISO(new Date()))

  const active = schedules?.find(s => s.id === activeId)

  useEffect(() => {
    let alive = true
    collabApi.mySchedules()
      .then(r => {
        if (!alive) return
        const list = r.data?.schedules ?? []
        setSchedules(list)
        setActiveId(prev => prev || list[0]?.id || '')
      })
      .catch(() => alive && setSchedules([]))
    return () => { alive = false }
  }, [])

  const loadSlots = useCallback(() => {
    if (!activeId) { setSlots([]); return }
    // A refusal is about one click on one slot. Carrying it across a change of
    // schedule or date would leave a teacher reading a complaint about a period
    // they are no longer looking at.
    setError('')
    setSlots(null)
    collabApi.orSlots(activeId, date)
      .then(r => setSlots(r.data?.slots ?? []))
      .catch(() => setSlots([]))
  }, [activeId, date])

  useEffect(() => { loadSlots() }, [loadSlots])

  const dayName = useMemo(() => {
    const d = new Date(`${date}T00:00:00`)
    return DAY_NAMES[d.getDay()]
  }, [date])

  /**
   * Take a slot, or hand it back.
   *
   * The options travel with the request so the server can check the caller
   * teaches the subject being claimed — this page never decides that. A refusal
   * is shown as it arrives rather than being pre-empted, because the honest
   * answer to "why can I not press this" comes from whoever enforces it.
   */
  const claim = async (section: string, periodId: string, subject: string) => {
    if (!activeId) return
    const key = orDecisionKey(section, date, periodId)
    setBusyKey(key); setError('')
    try {
      await collabApi.decideOr(activeId, { section, date, periodId, subject })
      loadSlots()
    } catch (e: any) {
      setError(e?.response?.data?.error || e?.message || 'Could not record that.')
    } finally {
      setBusyKey('')
    }
  }

  if (!user) { window.location.href = '/login'; return null }

  return (
    <div style={{ minHeight: '100vh', background: '#F7F6FC' }}>
      <PageHeader
        icon="🧑‍🏫"
        title="My teaching"
        description="The schedules you are on, and the periods you can choose."
      />

      <div style={{ maxWidth: 900, margin: '0 auto', padding: '18px 20px 60px' }}>
        {schedules === null && (
          <Note><Loader2 size={14} className="spin" /> Loading your schedules…</Note>
        )}

        {schedules?.length === 0 && (
          <Note>
            No school has added you to a schedule yet. Ask whoever manages your
            timetable to add your email on the Users page — the address you signed
            in with, and the name they use for you in the timetable.
          </Note>
        )}

        {!!schedules?.length && (
          <>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginBottom: 16 }}>
              <select value={activeId} onChange={e => setActiveId(e.target.value)} style={input}>
                {schedules.map(s => (
                  <option key={s.id} value={s.id}>
                    {s.name}{s.mine ? '' : ` — ${s.role}`}
                  </option>
                ))}
              </select>
              <input type="date" value={date} onChange={e => setDate(e.target.value)} style={input} />
              <span style={{ fontSize: 12, color: DIM }}>
                <CalendarDays size={12} style={{ verticalAlign: -2 }} /> {dayName[0] + dayName.slice(1).toLowerCase()}
              </span>
              <button onClick={loadSlots} style={ghost}><RefreshCw size={12} /> Refresh</button>
            </div>

            {active && !active.staffName && !active.mine && (
              <Note tone="warn">
                This school has your email but has not matched it to a name in the
                timetable, so nothing here can be linked to your lessons yet. Ask
                them to set your staff name against your invitation.
              </Note>
            )}

            {error && <Note tone="warn">{error}</Note>}

            <OrSlots
              schedule={active}
              date={date}
              slots={slots}
              busyKey={busyKey}
              onClaim={claim}
              me={active?.staffName ?? ''}
            />
          </>
        )}
      </div>
    </div>
  )
}

/**
 * The choice periods for this day, and what this teacher may do with them.
 *
 * The periods come from the SCHOOL's timetable via the server: a teacher's own
 * browser holds no copy of it, so this list could not be built locally. Each
 * row shows every option and who teaches it, so a teacher can see what they are
 * choosing between rather than only what they personally offer.
 */
function OrSlots({ schedule, date, slots, busyKey, onClaim, me }: {
  schedule?: MySchedule
  date: string
  slots: OrSlotRow[] | null
  busyKey: string
  onClaim: (section: string, periodId: string, subject: string) => void
  me: string
}) {
  if (!schedule) return null

  return (
    <div style={card}>
      <div style={{ fontSize: 13, fontWeight: 800, color: INK, marginBottom: 4 }}>
        Choice periods on {date}
      </div>
      <div style={{ fontSize: 11.5, color: DIM, marginBottom: 12 }}>
        A choice period runs one of its subjects. Left alone it goes to whichever
        is further behind on syllabus; take it to teach yours instead. The choice
        applies to this day only.
      </div>

      {slots === null ? (
        <div style={{ fontSize: 12.5, color: DIM }}>
          <Loader2 size={13} className="spin" style={{ verticalAlign: -2 }} /> Loading this day…
        </div>
      ) : slots.length === 0 ? (
        <div style={{ fontSize: 12.5, color: DIM }}>
          No choice periods on this day.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {slots.map(sl => {
            const key = orDecisionKey(sl.section, date, sl.periodId)
            const busy = busyKey === key
            // Only the person who took it may hand it back; the server refuses
            // anyone else, so offering the button would be a promise the next
            // click breaks.
            const isMine = !!sl.decidedBy && !!me &&
              sl.decidedBy.trim().toLowerCase() === me.trim().toLowerCase()
            return (
              <div key={key} style={{
                display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap',
                border: `1px solid ${LINE}`, borderRadius: 10, padding: '9px 12px', flexShrink: 0,
              }}>
                <span style={{ fontWeight: 700, fontSize: 13, color: INK, minWidth: 54 }}>
                  {sl.section}
                </span>
                <span style={{ fontSize: 12, color: DIM, minWidth: 28 }}>{sl.periodId}</span>

                {sl.options.map(o => {
                  const running = sl.decided
                    ? o.subject === sl.decided
                    : false
                  return (
                    <span key={o.subject} style={{
                      fontSize: 11.5, padding: '2px 9px', borderRadius: 20,
                      fontWeight: running ? 700 : 500,
                      color: running ? ACCENT : DIM,
                      background: running ? '#EDE9FF' : '#F4F3FA',
                      border: `1px solid ${running ? '#D9D2FF' : LINE}`,
                    }}>
                      {running && <Check size={11} style={{ verticalAlign: -1 }} />} {o.subject}
                      {o.teacher ? <span style={{ opacity: 0.7 }}> · {o.teacher}</span> : null}
                    </span>
                  )
                })}

                {sl.decided
                  ? <span style={{ fontSize: 11, color: DIM }}>
                      {sl.decidedBy ? `taken by ${sl.decidedBy}` : 'set by the school'}
                    </span>
                  : <span style={{ fontSize: 11, color: DIM }}>undecided — syllabus decides</span>}

                <span style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
                  {isMine && (
                    <button disabled={busy} onClick={() => onClaim(sl.section, sl.periodId, '')}
                            style={ghost}>
                      {busy ? 'Working…' : 'Hand it back'}
                    </button>
                  )}
                  {/* Claimable when this teacher offers one of the options and
                      has not already got the slot. */}
                  {sl.claimable && !isMine && (
                    <button disabled={busy}
                            onClick={() => onClaim(sl.section, sl.periodId, sl.claimable!)}
                            style={primary}>
                      {busy ? 'Working…' : `I'll take ${sl.claimable}`}
                    </button>
                  )}
                  {!sl.claimable && !isMine && (
                    <span style={{ fontSize: 11, color: DIM }}>not yours to change</span>
                  )}
                </span>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

function Note({ children, tone }: { children: React.ReactNode; tone?: 'warn' }) {
  return (
    <div style={{
      ...card,
      background: tone === 'warn' ? '#FFFBEB' : '#fff',
      border: `1px solid ${tone === 'warn' ? '#FDE68A' : LINE}`,
      color: tone === 'warn' ? '#92400E' : DIM,
      fontSize: 12.5, marginBottom: 14,
    }}>
      {children}
    </div>
  )
}

const card: React.CSSProperties = {
  background: '#fff', border: `1px solid ${LINE}`, borderRadius: 14, padding: 16,
}
const input: React.CSSProperties = {
  border: `1px solid ${LINE}`, borderRadius: 9, padding: '7px 10px',
  fontSize: 12.5, fontFamily: 'inherit', color: INK, background: '#fff',
}
const primary: React.CSSProperties = {
  border: `1px solid ${ACCENT}`, borderRadius: 8, background: ACCENT,
  padding: '5px 11px', fontSize: 11.5, color: '#fff', cursor: 'pointer',
  fontFamily: 'inherit', display: 'inline-flex', alignItems: 'center', gap: 5,
  fontWeight: 600,
}
const ghost: React.CSSProperties = {
  border: `1px solid ${LINE}`, borderRadius: 8, background: '#fff',
  padding: '5px 11px', fontSize: 11.5, color: ACCENT, cursor: 'pointer',
  fontFamily: 'inherit', display: 'inline-flex', alignItems: 'center', gap: 5,
}
