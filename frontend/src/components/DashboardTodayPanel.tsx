/**
 * DashboardTodayPanel — a calm, read-only glance at today's schedule.
 * Replaces the old embedded CalendarView (which duplicated /timetable's
 * toolbar and rendered a second toolbar on top of that). This panel has no
 * filters or controls of its own: it's a list of today's periods, flagging
 * any that still need a substitute, with a single button to the full editor
 * for everything else (editing, printing, sharing, substitution).
 *
 * Renders nothing when there's no active schedule with data.
 */
import { useEffect } from 'react'
import { useTimetableStore } from '@/store/timetableStore'
import { useAuthStore } from '@/store/authStore'
import { loadActiveTimetableIntoStore } from '@/lib/ttRegistry'
import { loadLeaves } from '@/lib/leaveUtils'
import { computeTodaySummary } from '@/lib/scheduleToday'
import { CalendarClock, ExternalLink, AlertTriangle, Coffee } from 'lucide-react'

const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December']
const DOW = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday']

function fmtClock(min: number, h24: boolean): string {
  const h = Math.floor(min / 60), m = min % 60
  if (h24) return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
  const ap = h >= 12 ? 'PM' : 'AM', h12 = h % 12 || 12
  return `${h12}:${String(m).padStart(2, '0')} ${ap}`
}

export function DashboardTodayPanel() {
  const store = useTimetableStore() as any
  const uid = useAuthStore.getState().user?.id ?? ''

  useEffect(() => { loadActiveTimetableIntoStore() }, [])

  const sections: any[] = store.sections ?? []
  const classTT = store.classTT ?? {}
  const hasSchedule = sections.length > 0 && Object.keys(classTT).length > 0
  if (!hasSchedule) return null

  const today = new Date()
  const leaves = loadLeaves(uid)
  const h24 = (store.config?.timeFormat ?? '12h') === '24h'
  const summary = computeTodaySummary({
    periods: store.periods ?? [], sections, classTT, config: store.config ?? {},
    substitutions: store.substitutions ?? {}, leaves,
    conflicts: (store.conflicts ?? []).length, date: today,
  })

  return (
    <div style={{ marginBottom: 24 }}>
      <div style={{ background: '#fff', border: '1px solid #E5E7EB', borderRadius: 12, overflow: 'hidden' }}>
        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          gap: 12, flexWrap: 'wrap', padding: '14px 16px', borderBottom: '1px solid #F1F1F4',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <CalendarClock size={16} color="#7C6FE0" />
            <div>
              <h2 style={{ fontSize: 15, fontWeight: 700, color: '#13111E', margin: 0 }}>Today's schedule</h2>
              <div style={{ fontSize: 12, color: '#9CA3AF', marginTop: 1 }}>
                {DOW[today.getDay()]}, {MONTHS[today.getMonth()]} {today.getDate()}
              </div>
            </div>
          </div>
          <a href="/timetable" style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            padding: '8px 14px', borderRadius: 9, background: '#7C6FE0', color: '#fff',
            fontSize: 13, fontWeight: 700, textDecoration: 'none',
          }}>
            Open full editor <ExternalLink size={13} />
          </a>
        </div>

        {!summary.isWorkDay ? (
          <div style={{ padding: '28px 20px', textAlign: 'center' }}>
            <Coffee size={22} color="#C9C3EC" />
            <div style={{ fontSize: 13.5, color: '#6B7280', marginTop: 8 }}>No classes today — enjoy the day off.</div>
          </div>
        ) : (
          <>
            {/* Period list */}
            <div style={{ padding: '8px 8px' }}>
              {summary.periodRows.map(row => (
                <div key={row.id} style={{
                  display: 'flex', alignItems: 'center', gap: 12,
                  padding: '9px 10px', borderRadius: 8,
                }}>
                  <div style={{ width: 96, flexShrink: 0, fontSize: 11.5, color: '#9CA3AF', fontWeight: 600 }}>
                    {fmtClock(row.startMin, h24)}
                  </div>
                  <div style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{
                      fontSize: 13, fontWeight: row.isBreak ? 500 : 700,
                      color: row.isBreak ? '#B0ABCC' : '#13111E',
                      fontStyle: row.isBreak ? 'italic' : 'normal',
                    }}>
                      {row.name}
                    </span>
                    {row.uncovered > 0 && (
                      <span style={{
                        display: 'inline-flex', alignItems: 'center', gap: 4,
                        padding: '2px 8px', borderRadius: 20, background: '#FEF2F2',
                        color: '#DC2626', fontSize: 11, fontWeight: 700, flexShrink: 0,
                      }}>
                        <AlertTriangle size={11} /> {row.uncovered} need{row.uncovered === 1 ? 's' : ''} cover
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {/* Teachers on leave today */}
            {summary.teachersOnLeave.length > 0 && (
              <div style={{ padding: '12px 16px', borderTop: '1px solid #F1F1F4', background: '#FFFBEB' }}>
                <div style={{ fontSize: 11.5, fontWeight: 700, color: '#92400E', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  On leave today
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {summary.teachersOnLeave.map(name => (
                    <a key={name} href="/calendar" style={{
                      display: 'inline-flex', alignItems: 'center', gap: 6,
                      padding: '4px 10px', borderRadius: 8, background: '#fff',
                      border: '1px solid #FDE68A', fontSize: 12, fontWeight: 600,
                      color: '#92400E', textDecoration: 'none',
                    }}>
                      {name}
                    </a>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
