/**
 * DashboardTodayPanel — a calm, read-only glance at today's schedule.
 *
 * A school runs many classes at once, so a raw period-by-period list is
 * either too abstract (counts with no names) or too dense (every class,
 * every period) to be useful at a glance. Instead this panel is built
 * around "what needs your attention": exactly which class, subject, and
 * teacher is affected by today's leave, with a direct link to arrange
 * cover. When nothing needs attention it says so plainly instead of
 * padding the space with a schedule nobody asked to see here.
 *
 * No filters or controls of its own — Open full editor goes to /timetable
 * for editing, printing, sharing, and substitution.
 *
 * Renders nothing when there's no active schedule with data.
 */
import { useEffect } from 'react'
import { useTimetableStore } from '@/store/timetableStore'
import { useAuthStore } from '@/store/authStore'
import { loadActiveTimetableIntoStore } from '@/lib/ttRegistry'
import { loadLeaves } from '@/lib/leaveUtils'
import { computeTodaySummary, type AffectedSlot } from '@/lib/scheduleToday'
import { CalendarClock, ExternalLink, AlertTriangle, CheckCircle2, Coffee, ArrowRight, DoorOpen } from 'lucide-react'

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
  const allClear = summary.isWorkDay && summary.uncoveredSlots.length === 0
    && summary.teachersOnLeave.length === 0 && summary.roomClashes.length === 0

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
              <h2 style={{ fontSize: 15, fontWeight: 700, color: '#13111E', margin: 0 }}>Today</h2>
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
        ) : allClear ? (
          <div style={{ padding: '24px 20px', textAlign: 'center' }}>
            <CheckCircle2 size={22} color="#16A34A" />
            <div style={{ fontSize: 13.5, fontWeight: 600, color: '#13111E', marginTop: 8 }}>
              All clear — {summary.periodsToday} period{summary.periodsToday !== 1 ? 's' : ''} running as scheduled
            </div>
            <div style={{ fontSize: 12, color: '#9CA3AF', marginTop: 3 }}>No absences today.</div>
          </div>
        ) : (
          <div style={{ padding: '10px 16px 14px' }}>
            {summary.uncoveredSlots.length > 0 && (
              <SlotSection
                icon={<AlertTriangle size={13} />}
                title={`Needs cover · ${summary.uncoveredSlots.length}`}
                tone="warn"
                slots={summary.uncoveredSlots}
                h24={h24}
                cta="Arrange"
              />
            )}
            {summary.roomClashes.length > 0 && (
              <div style={{ marginBottom: 6 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, fontWeight: 700, color: '#C2410C', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  <DoorOpen size={13} /> Room clashes · {summary.roomClashes.length}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {summary.roomClashes.map(rc => (
                    <a key={`${rc.room}|${rc.periodId}`} href="/timetable" style={{
                      display: 'flex', alignItems: 'center', gap: 10,
                      padding: '9px 12px', borderRadius: 9, background: '#FFF7ED',
                      border: '1px solid #FED7AA', textDecoration: 'none',
                    }}>
                      <div style={{ width: 72, flexShrink: 0, fontSize: 11, fontWeight: 700, color: '#C2410C' }}>
                        {fmtClock(rc.startMin, h24)}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 700, color: '#13111E', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {rc.room} double-booked
                        </div>
                        <div style={{ fontSize: 11.5, color: '#6B7280', marginTop: 1 }}>
                          {rc.sections.join(' & ')} share this room
                        </div>
                      </div>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 11.5, fontWeight: 700, color: '#C2410C', flexShrink: 0 }}>
                        Reassign <ArrowRight size={12} />
                      </span>
                    </a>
                  ))}
                </div>
              </div>
            )}
            {summary.coveredSlots.length > 0 && (
              <SlotSection
                icon={<CheckCircle2 size={13} />}
                title={`Covered · ${summary.coveredSlots.length}`}
                tone="ok"
                slots={summary.coveredSlots}
                h24={h24}
              />
            )}
            {summary.teachersOnLeave.length > 0 && (
              <div style={{ marginTop: summary.uncoveredSlots.length || summary.coveredSlots.length ? 14 : 0 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#9CA3AF', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  On leave today
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {summary.teachersOnLeave.map(name => (
                    <a key={name} href="/calendar" style={{
                      display: 'inline-flex', alignItems: 'center', gap: 6,
                      padding: '4px 10px', borderRadius: 8, background: '#FFFBEB',
                      border: '1px solid #FDE68A', fontSize: 12, fontWeight: 600,
                      color: '#92400E', textDecoration: 'none',
                    }}>
                      {name}
                    </a>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

function SlotSection({ icon, title, tone, slots, h24, cta }: {
  icon: React.ReactNode; title: string; tone: 'warn' | 'ok'
  slots: AffectedSlot[]; h24: boolean; cta?: string
}) {
  const color = tone === 'warn' ? '#DC2626' : '#16A34A'
  const bg    = tone === 'warn' ? '#FEF2F2' : '#F0FDF4'
  const border = tone === 'warn' ? '#FECACA' : '#BBF7D0'
  return (
    <div style={{ marginBottom: 6 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, fontWeight: 700, color, marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
        {icon} {title}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {slots.map(s => (
          <a key={`${s.section}|${s.periodId}`} href="/calendar" style={{
            display: 'flex', alignItems: 'center', gap: 10,
            padding: '9px 12px', borderRadius: 9, background: bg,
            border: `1px solid ${border}`, textDecoration: 'none',
          }}>
            <div style={{ width: 72, flexShrink: 0, fontSize: 11, fontWeight: 700, color }}>
              {fmtClock(s.startMin, h24)}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#13111E', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {s.subject} · {s.section}
              </div>
              <div style={{ fontSize: 11.5, color: '#6B7280', marginTop: 1 }}>
                {s.coveredBy ? <>{s.teacher} → covered by <strong>{s.coveredBy}</strong></> : <>{s.teacher} is on leave</>}
              </div>
            </div>
            {cta && !s.coveredBy && (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 11.5, fontWeight: 700, color, flexShrink: 0 }}>
                {cta} <ArrowRight size={12} />
              </span>
            )}
          </a>
        ))}
      </div>
    </div>
  )
}
