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
import { collabApi, type MySchedule, type OrDecisionRow } from '@/api/client'
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
  const [decisions, setDecisions] = useState<Record<string, OrDecisionRow>>({})
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

  const loadDecisions = useCallback(() => {
    if (!activeId) return
    // A refusal is about one click on one slot. Carrying it across a change of
    // schedule or date would leave a teacher reading a complaint about a period
    // they are no longer looking at.
    setError('')
    collabApi.orDecisions(activeId, date, date)
      .then(r => {
        const map: Record<string, OrDecisionRow> = {}
        for (const d of r.data?.decisions ?? []) map[d.key] = d
        setDecisions(map)
      })
      .catch(() => setDecisions({}))
  }, [activeId, date])

  useEffect(() => { loadDecisions() }, [loadDecisions])

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
  const claim = async (
    section: string, periodId: string, subject: string,
    options: Array<{ subject: string; teacher?: string }>,
  ) => {
    if (!activeId) return
    const key = orDecisionKey(section, date, periodId)
    setBusyKey(key); setError('')
    try {
      await collabApi.decideOr(activeId, { section, date, periodId, subject, options })
      loadDecisions()
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
              <button onClick={loadDecisions} style={ghost}><RefreshCw size={12} /> Refresh</button>
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
              decisions={decisions}
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
 * The OR periods for this day, and who has taken them.
 *
 * The lessons themselves come from the school's own schedule, which this
 * account may not hold locally — a teacher's browser has no copy of their
 * school's timetable. Until the read side of that is wired, this shows the
 * decisions the server already holds and lets a teacher release one; claiming a
 * NEW slot needs the day's options, which arrive with that same read.
 */
function OrSlots({ schedule, date, decisions, busyKey, onClaim, me }: {
  schedule?: MySchedule
  date: string
  decisions: Record<string, OrDecisionRow>
  busyKey: string
  onClaim: (section: string, periodId: string, subject: string,
            options: Array<{ subject: string; teacher?: string }>) => void
  me: string
}) {
  const rows = Object.values(decisions)
  if (!schedule) return null

  return (
    <div style={card}>
      <div style={{ fontSize: 13, fontWeight: 800, color: INK, marginBottom: 4 }}>
        Choice periods on {date}
      </div>
      <div style={{ fontSize: 11.5, color: DIM, marginBottom: 12 }}>
        A choice period runs one of two subjects. Left alone it goes to whichever
        is further behind on syllabus; take it to teach yours instead. The choice
        applies to this day only.
      </div>

      {rows.length === 0 ? (
        <div style={{ fontSize: 12.5, color: DIM }}>
          Nothing has been decided for this day yet.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {rows.map(d => (
            <div key={d.key} style={{
              display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
              border: `1px solid ${LINE}`, borderRadius: 10, padding: '9px 12px', flexShrink: 0,
            }}>
              <span style={{ fontWeight: 700, fontSize: 13, color: INK }}>{d.section}</span>
              <span style={{ fontSize: 12, color: DIM }}>{d.periodId}</span>
              <span style={{
                fontSize: 12, fontWeight: 700, color: ACCENT,
                background: '#EDE9FF', padding: '2px 9px', borderRadius: 20,
              }}>
                <Check size={11} style={{ verticalAlign: -1 }} /> {d.subject}
              </span>
              {d.by && <span style={{ fontSize: 11.5, color: DIM }}>taken by {d.by}</span>}
              {mine(d, me) ? (
                <button
                  disabled={busyKey === d.key}
                  onClick={() => onClaim(d.section, d.periodId, '', [])}
                  style={{ ...ghost, marginLeft: 'auto' }}>
                  {busyKey === d.key ? 'Working…' : 'Hand it back'}
                </button>
              ) : (
                // Somebody else took this one. The server refuses a clear from
                // anyone but its author, so offering the button here would only
                // be a promise the next click breaks.
                <span style={{ fontSize: 11, color: DIM, marginLeft: 'auto' }}>
                  not yours to change
                </span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

/** Whether this decision is the signed-in teacher's own, by roster name. */
function mine(d: OrDecisionRow, me: string) {
  const who = me.trim()
  const by = (d.by ?? '').trim()
  return who !== '' && by !== '' && who.toLowerCase() === by.toLowerCase()
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
const ghost: React.CSSProperties = {
  border: `1px solid ${LINE}`, borderRadius: 8, background: '#fff',
  padding: '5px 11px', fontSize: 11.5, color: ACCENT, cursor: 'pointer',
  fontFamily: 'inherit', display: 'inline-flex', alignItems: 'center', gap: 5,
}
