/**
 * DashboardPulse — schedU's own dashboard hero. Instead of a wall of stat
 * cards the reader has to parse (Classes / Teachers / Conflicts…), the Pulse
 * states the school's operational status in one plain sentence and surfaces
 * only the single action that matters right now. Hard facts live as a quiet
 * secondary line, de-emphasised on purpose. One glance answers "is everything
 * OK, and if not, what do I do?".
 *
 * Deliberately not modelled on any other product: a live status orb + human
 * headline, low cognitive load, one primary action.
 */
import { ArrowRight, Plus } from 'lucide-react'

type PulseState = 'setup' | 'rest' | 'attention' | 'covered' | 'clear'

interface Props {
  hasSchedule: boolean
  isWorkDay: boolean
  periodsToday: number
  uncovered: number
  onLeave: number
  covered: number
  roomClashes: number
  roomClashText?: string   // short human description of the first clash
  conflicts: number
  classes: number
  teachers: number
  venues: number
  onNewSchedule: () => void
}

const TONE: Record<PulseState, { dot: string; glow: string; wash: string }> = {
  setup:     { dot: '#7C6FE0', glow: 'rgba(124,111,224,0.28)', wash: 'linear-gradient(120deg,#FBFAFF,#F3F0FF)' },
  rest:      { dot: '#9CA3AF', glow: 'rgba(156,163,175,0.22)', wash: 'linear-gradient(120deg,#FBFBFC,#F4F5F7)' },
  attention: { dot: '#EA580C', glow: 'rgba(234,88,12,0.26)',   wash: 'linear-gradient(120deg,#FFFDFB,#FFF4EC)' },
  covered:   { dot: '#2563EB', glow: 'rgba(37,99,235,0.22)',   wash: 'linear-gradient(120deg,#FBFCFF,#EEF4FF)' },
  clear:     { dot: '#16A34A', glow: 'rgba(22,163,74,0.22)',   wash: 'linear-gradient(120deg,#FBFEFC,#EEFBF2)' },
}

export function DashboardPulse(p: Props) {
  const s = (n: number) => (n === 1 ? '' : 's')
  const hasCover = p.uncovered > 0
  const hasRoom = p.roomClashes > 0
  const needsAttention = p.hasSchedule && p.isWorkDay && (hasCover || hasRoom)

  const state: PulseState =
    !p.hasSchedule ? 'setup'
    : !p.isWorkDay ? 'rest'
    : needsAttention ? 'attention'
    : p.onLeave > 0 ? 'covered'
    : 'clear'

  // Attention copy adapts to which problems exist — coverage, room clashes,
  // or both — so the one headline always names the real issue.
  const attentionCopy = (): { head: string; sub: string } => {
    if (hasCover && hasRoom) {
      return {
        head: `${p.uncovered + p.roomClashes} issues need attention`,
        sub: `${p.uncovered} period${s(p.uncovered)} to cover · ${p.roomClashes} venue clash${s(p.roomClashes)}.`,
      }
    }
    if (hasCover) {
      return { head: `${p.uncovered} period${s(p.uncovered)} need cover`, sub: `${p.onLeave} teacher${s(p.onLeave)} out today — arrange a substitute.` }
    }
    return {
      head: `${p.roomClashes} venue clash${s(p.roomClashes)} today`,
      sub: p.roomClashText ?? 'Two classes are booked into the same venue — reassign one.',
    }
  }

  const copyMap: Record<PulseState, { head: string; sub: string }> = {
    setup:     { head: 'Build your first schedule', sub: 'Add classes, teachers and subjects — schedU generates the rest.' },
    rest:      { head: 'No classes today', sub: 'Enjoy the day off.' },
    attention: attentionCopy(),
    covered:   { head: 'All absences covered', sub: `${p.onLeave} out today · ${p.covered} substitution${s(p.covered)} arranged.` },
    clear:     { head: 'Everything’s running smoothly', sub: `${p.periodsToday} period${s(p.periodsToday)} today · staff and venues all set.` },
  }
  const copy = copyMap[state]

  const tone = TONE[state]

  // Send the reader to where the fix lives: coverage → Calendar, a pure room
  // clash → the editor where the cell's room can be reassigned.
  const action =
    state === 'setup'     ? { kind: 'button' as const, label: 'New schedule', icon: <Plus size={16} strokeWidth={2.6} /> }
    : state === 'attention' ? (hasCover
        ? { kind: 'link' as const, href: '/calendar', label: 'Arrange cover', icon: <ArrowRight size={16} /> }
        : { kind: 'link' as const, href: '/timetable', label: 'Fix venues', icon: <ArrowRight size={16} /> })
    : state === 'rest'      ? null
    : { kind: 'link' as const, href: '/calendar', label: 'View day', icon: <ArrowRight size={16} /> }

  const primary = state === 'setup' || state === 'attention'

  return (
    <div style={{ marginBottom: 16 }}>
      <style>{`
        @keyframes pulse-ring { 0% { transform: scale(1); opacity: .55 } 100% { transform: scale(2.4); opacity: 0 } }
        .pulse-act { transition: transform .06s, filter .12s; }
        .pulse-act:active { transform: translateY(1px); }
      `}</style>

      <div style={{ background: tone.wash, border: '1px solid #ECE9FB', borderRadius: 16, padding: '18px 20px' }}>
        {/* Row 1 — the human status */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
          {/* live orb */}
          <div style={{ position: 'relative', width: 16, height: 16, flexShrink: 0 }}>
            <span style={{ position: 'absolute', inset: 0, borderRadius: '50%', background: tone.dot, opacity: 0.5, animation: 'pulse-ring 2.4s ease-out infinite' }} />
            <span style={{ position: 'absolute', inset: 2, borderRadius: '50%', background: tone.dot, boxShadow: `0 0 0 4px ${tone.glow}` }} />
          </div>

          <div style={{ flex: 1, minWidth: 220 }}>
            <div style={{ fontSize: 19, fontWeight: 800, color: '#13111E', letterSpacing: '-0.3px', lineHeight: 1.2 }}>{copy.head}</div>
            <div style={{ fontSize: 13.5, color: '#6B7280', marginTop: 3 }}>{copy.sub}</div>
          </div>

          {action && (
            action.kind === 'button' ? (
              <button onClick={p.onNewSchedule} className="pulse-act" style={actionStyle(primary, tone.dot)}>
                {action.icon} {action.label}
              </button>
            ) : (
              <a href={action.href} className="pulse-act" style={{ ...actionStyle(primary, tone.dot), textDecoration: 'none' }}>
                {action.label} {action.icon}
              </a>
            )
          )}
        </div>

        {/* Row 2 — quiet facts, deliberately understated */}
        {p.hasSchedule && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginTop: 14, paddingTop: 12, borderTop: '1px solid rgba(19,17,30,0.06)' }}>
            <Fact value={p.classes} label={`class${p.classes === 1 ? '' : 'es'}`} />
            <Dotsep />
            <Fact value={p.teachers} label={`teacher${s(p.teachers)}`} />
            <Dotsep />
            <Fact value={p.venues} label={`venue${s(p.venues)}`} />
            <Dotsep />
            {p.conflicts > 0 ? (
              <a href="/timetable" style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12.5, fontWeight: 700, color: '#DC2626', textDecoration: 'none' }}>
                {p.conflicts} conflict{s(p.conflicts)} <ArrowRight size={12} />
              </a>
            ) : (
              <span style={{ fontSize: 12.5, color: '#9CA3AF', fontWeight: 600 }}>No conflicts</span>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

function Fact({ value, label }: { value: number; label: string }) {
  return (
    <span style={{ fontSize: 12.5, color: '#6B7280', fontWeight: 600 }}>
      <strong style={{ color: '#13111E', fontWeight: 800 }}>{value}</strong> {label}
    </span>
  )
}
function Dotsep() {
  return <span style={{ width: 3, height: 3, borderRadius: 2, background: '#CBC9DA', flexShrink: 0 }} />
}

function actionStyle(primary: boolean, accent: string): React.CSSProperties {
  return primary
    ? {
        display: 'inline-flex', alignItems: 'center', gap: 7, flexShrink: 0,
        padding: '10px 18px', borderRadius: 11, border: 'none', cursor: 'pointer',
        fontSize: 14, fontWeight: 800, fontFamily: 'inherit', color: '#fff',
        background: accent, boxShadow: `0 6px 16px ${accent}44`,
      }
    : {
        display: 'inline-flex', alignItems: 'center', gap: 6, flexShrink: 0,
        padding: '9px 14px', borderRadius: 10, cursor: 'pointer',
        fontSize: 13, fontWeight: 700, fontFamily: 'inherit', color: accent,
        background: '#fff', border: `1px solid ${accent}33`,
      }
}
