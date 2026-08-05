/**
 * THE SMARTBOARD — a corridor or staffroom display.
 *
 * Read from four metres away by someone walking past, so: very large type, no
 * navigation, no controls that matter, dark by default because it sits on a
 * screen that is on all day. It refreshes itself; nobody touches it.
 *
 * It answers three questions and refuses to pad. What is on now, when does the
 * bell go, and is any class sitting without a teacher. The derivation — and in
 * particular every awkward state, which is where a board earns or loses trust —
 * lives in lib/smartboard so it can be tested at 7am, mid-lesson and midnight.
 */
import { useEffect, useMemo, useState } from 'react'
import { useAuthStore } from '@/store/authStore'
import { useOrgProfile } from '@/store/orgProfile'
import { useTimetableStore } from '@/store/timetableStore'
import { loadActiveBundles } from '@/lib/activeSchedules'
import { useLeaves, teachersOnLeaveOn } from '@/lib/leaveUtils'
import { useHolidays } from '@/lib/holidays'
import { useSchoolEvents, teachingSuspendedOn } from '@/lib/schoolEvents'
import { boardNow, boardRows, uncoveredRows, soonestRings } from '@/lib/smartboard'
import { fmtRingTime } from '@/lib/bellSchedule'
import { DAY_NAMES as DAY_KEY } from '@/lib/days'


const toISO = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

const INK = '#0B0A12'
const CARD = '#16141F'
const LINE = '#262234'
const DIM = '#8B87AD'
const ACCENT = '#9E92FF'
const ALARM = '#F87171'

export function BoardPage() {
  const user = useAuthStore(s => s.user)
  const uid = user?.id ?? ''
  const schoolName = useOrgProfile(s => s.name)
  const leaves = useLeaves(s => s.leaves)
  const holidays = useHolidays(s => s.holidays)
  const events = useSchoolEvents(s => s.events)
  const openTT = useTimetableStore(s => (s as any).classTT)

  // A display is left running for days; without this it would still be showing
  // Tuesday's first period on Thursday afternoon.
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 15_000)
    return () => clearInterval(t)
  }, [])

  const bundles = useMemo(() => {
    const active = loadActiveBundles(uid)
    if (active.length > 0) return active
    const st = useTimetableStore.getState() as any
    if (!Object.keys(st.classTT ?? {}).length) return []
    return [{
      id: 'open', name: st.config?.timetableName ?? 'Current schedule',
      sections: st.sections ?? [], staff: st.staff ?? [], rooms: st.rooms ?? [],
      subjects: st.subjects ?? [], periods: st.periods ?? [], config: st.config ?? {},
      classTT: st.classTT ?? {}, substitutions: st.substitutions ?? {},
    }]
  }, [uid, openTT])

  const isoDate = toISO(now)
  const dayKey = DAY_KEY[now.getDay()]
  const nowMin = now.getHours() * 60 + now.getMinutes()

  const allSections = useMemo(
    () => bundles.flatMap(b => (b.sections ?? []).map((s: any) => s.name)).filter(Boolean),
    [bundles],
  )

  // Why there might be no lessons — three different sources, one answer.
  const holidayToday = holidays.find(h => h.date === isoDate && !h.sections?.length)
  const suspended = teachingSuspendedOn(events, isoDate)
  // The union: if ANY active schedule teaches today, the school is open.
  const workDays: string[] = bundles.length
    ? Array.from(new Set(bundles.flatMap(b =>
        b.config?.workDays?.length ? b.config.workDays : ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY'])))
    : ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY']
  const closedReason = holidayToday
    ? `${holidayToday.name} — school holiday`
    : suspended
    ? `${suspended.title} — normal lessons suspended`
    : undefined

  // Each schedule resolves against ITS OWN bell — see lib/smartboard.
  const rings = useMemo(
    () => soonestRings(bundles.map(b => ({
      sections: (b.sections ?? []).map((s: any) => s.name).filter(Boolean),
      config: b.config ?? {},
      periods: b.periods ?? [],
    }))),
    [bundles],
  )
  const state = boardNow(rings, nowMin, { isWorkDay: workDays.includes(dayKey), closedReason })

  const absent = useMemo(() => new Set(teachersOnLeaveOn(leaves, isoDate)), [leaves, isoDate])
  const rows = useMemo(
    () => boardRows(bundles as any, dayKey, nowMin, absent),
    [bundles, dayKey, nowMin, absent],
  )
  const uncovered = useMemo(() => uncoveredRows(rows), [rows])
  const teaching = rows.filter(r => r.subject)
  const multi = bundles.length > 1

  const clock = now.toLocaleTimeString('en-GB', { hour: 'numeric', minute: '2-digit', hour12: true })
  const longDate = now.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })

  return (
    <div style={{
      minHeight: '100vh', background: INK, color: '#F4F2FF',
      fontFamily: 'inherit', padding: 'clamp(18px, 2.6vw, 40px)',
      display: 'flex', flexDirection: 'column', gap: 'clamp(14px, 1.8vw, 26px)',
    }}>
      {/* Header — who and when */}
      <header style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 24, flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontSize: 'clamp(20px, 2.6vw, 38px)', fontWeight: 800, letterSpacing: -0.5 }}>
            {schoolName || 'Today'}
          </div>
          <div style={{ fontSize: 'clamp(13px, 1.3vw, 20px)', color: DIM, marginTop: 2 }}>{longDate}</div>
        </div>
        <div style={{ fontSize: 'clamp(38px, 6.5vw, 96px)', fontWeight: 800, lineHeight: 1, letterSpacing: -2, fontVariantNumeric: 'tabular-nums' }}>
          {clock}
        </div>
      </header>

      {/* The one line everyone looks for */}
      <StatusBand state={state} />

      {/* Anything broken comes before anything routine. */}
      {uncovered.length > 0 && state.state === 'during' && (
        <div style={{
          border: `2px solid ${ALARM}`, background: 'rgba(248,113,113,0.10)',
          borderRadius: 16, padding: 'clamp(12px, 1.4vw, 20px)',
        }}>
          <div style={{ fontSize: 'clamp(14px, 1.5vw, 22px)', fontWeight: 800, color: ALARM, marginBottom: 8 }}>
            {uncovered.length} class{uncovered.length === 1 ? '' : 'es'} with no teacher
          </div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            {uncovered.map((r, i) => (
              <span key={i} style={{
                fontSize: 'clamp(13px, 1.3vw, 19px)', fontWeight: 700,
                background: 'rgba(248,113,113,0.16)', color: '#FCA5A5',
                padding: '6px 13px', borderRadius: 10,
              }}>
                {r.section} · {r.subject}{r.room ? ` · ${r.room}` : ''}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Now */}
      {state.state === 'during' && (
        teaching.length === 0 ? (
          <Empty text="Nothing scheduled at this moment." />
        ) : (
          <div style={{
            display: 'grid', gap: 'clamp(8px, 0.9vw, 14px)',
            gridTemplateColumns: 'repeat(auto-fill, minmax(clamp(210px, 22vw, 330px), 1fr))',
          }}>
            {teaching.map((r, i) => (
              <div key={i} style={{
                background: CARD, border: `1px solid ${r.uncovered ? ALARM : LINE}`,
                borderRadius: 14, padding: 'clamp(11px, 1.1vw, 18px)',
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
                  <span style={{ fontSize: 'clamp(16px, 1.7vw, 26px)', fontWeight: 800 }}>{r.section}</span>
                  {r.endMin != null && (
                    <span style={{ fontSize: 'clamp(11px, 1vw, 15px)', color: DIM, fontVariantNumeric: 'tabular-nums' }}>
                      till {fmtRingTime(r.endMin)}
                    </span>
                  )}
                </div>
                <div style={{ fontSize: 'clamp(14px, 1.4vw, 21px)', color: ACCENT, fontWeight: 700, marginTop: 4 }}>
                  {r.subject}
                </div>
                <div style={{ fontSize: 'clamp(12px, 1.15vw, 17px)', color: DIM, marginTop: 3, display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                  <span>{r.uncovered ? 'No teacher assigned' : (r.teacher || '—')}</span>
                  {r.isSub && (
                    <span style={{ fontSize: '0.78em', fontWeight: 800, letterSpacing: 0.4, color: '#FCD34D', background: 'rgba(252,211,77,0.14)', padding: '2px 7px', borderRadius: 20 }}>
                      COVER
                    </span>
                  )}
                  {r.room && <span>· {r.room}</span>}
                  {multi && <span>· {r.schedule}</span>}
                </div>
              </div>
            ))}
          </div>
        )
      )}

      {/* Absences are useful all day, not only mid-lesson. */}
      {absent.size > 0 && state.state !== 'closed' && (
        <div style={{ fontSize: 'clamp(12px, 1.2vw, 18px)', color: DIM }}>
          <strong style={{ color: '#C9C3EC' }}>Out today:</strong> {[...absent].join(' · ')}
        </div>
      )}

      <div style={{ marginTop: 'auto', fontSize: 'clamp(10px, 0.9vw, 13px)', color: '#4A4560' }}>
        Updates on its own · schedU
      </div>
    </div>
  )
}

function StatusBand({ state }: { state: ReturnType<typeof boardNow> }) {
  const big: React.CSSProperties = { fontSize: 'clamp(20px, 2.4vw, 36px)', fontWeight: 800 }
  const small: React.CSSProperties = { fontSize: 'clamp(12px, 1.2vw, 18px)', color: DIM, marginTop: 4 }
  const box: React.CSSProperties = {
    background: CARD, border: `1px solid ${LINE}`, borderRadius: 16,
    padding: 'clamp(14px, 1.6vw, 24px)',
  }

  if (state.state === 'closed') {
    return (
      <div style={box}>
        <div style={big}>{state.reason}</div>
        <div style={small}>No lessons are running today.</div>
      </div>
    )
  }
  if (state.state === 'before') {
    return (
      <div style={box}>
        <div style={big}>School hasn't started</div>
        <div style={small}>
          First bell at {fmtRingTime(state.firstBellAt!)} — in {state.nextBellIn} min.
        </div>
      </div>
    )
  }
  if (state.state === 'after') {
    return (
      <div style={box}>
        <div style={big}>The school day has ended</div>
        <div style={small}>Last bell went at {fmtRingTime(state.lastBellAt!)}.</div>
      </div>
    )
  }
  return (
    <div style={{ ...box, display: 'flex', alignItems: 'baseline', gap: 16, flexWrap: 'wrap' }}>
      <span style={{ ...big, color: ACCENT }}>
        Next bell in {state.nextBellIn} min
      </span>
      <span style={small}>
        {fmtRingTime(state.nextBellAt!)} — {state.nextBellMeans}
      </span>
    </div>
  )
}

function Empty({ text }: { text: string }) {
  return (
    <div style={{
      background: CARD, border: `1px solid ${LINE}`, borderRadius: 16,
      padding: 'clamp(24px, 3vw, 48px)', textAlign: 'center',
      fontSize: 'clamp(14px, 1.4vw, 20px)', color: DIM,
    }}>
      {text}
    </div>
  )
}
