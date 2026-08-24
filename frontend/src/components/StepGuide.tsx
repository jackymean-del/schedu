/**
 * Inline step guide — a calm, in-page help banner shown at the top of a wizard
 * step (NOT a popup). The user can hide it; the choice persists across every
 * step and session. When hidden, a small "Show guide" pill lets them bring it
 * back on any step.
 */
import { useGuidePrefs } from '@/store/guidePrefs'
import { Sparkles, X, HelpCircle } from 'lucide-react'

const ACCENT = '#685DBC'

export function StepGuide({
  title,
  children,
  tips,
}: {
  title: string
  /** Optional rich body. */
  children?: React.ReactNode
  /** Optional quick bullet tips. */
  tips?: string[]
}) {
  const { enabled, setEnabled } = useGuidePrefs()

  if (!enabled) {
    return (
      <button
        onClick={() => setEnabled(true)}
        title="Show the guide for this step"
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 6,
          margin: '0 0 12px', padding: '5px 12px', borderRadius: 999,
          border: '1px solid #E5E7EB', background: '#fff', color: '#69707E',
          fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
        }}
      >
        <HelpCircle size={13} /> Show guide
      </button>
    )
  }

  return (
    <div style={{
      position: 'relative',
      background: 'linear-gradient(180deg,#F7F5FF 0%,#F3F0FE 100%)',
      border: '1px solid #E4DEFB', borderRadius: 12,
      padding: '13px 40px 13px 14px', margin: '0 0 16px',
      fontFamily: "'Plus Jakarta Sans', sans-serif",
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: tips || children ? 7 : 0 }}>
        <Sparkles size={14} color={ACCENT} style={{ flexShrink: 0 }} />
        <span style={{ fontSize: 13, fontWeight: 800, color: '#13111E' }}>{title}</span>
      </div>

      {children && <div style={{ fontSize: 12.5, color: '#4B5275', lineHeight: 1.6 }}>{children}</div>}

      {tips && tips.length > 0 && (
        <ul style={{ margin: children ? '8px 0 0' : 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 5 }}>
          {tips.map((t, i) => (
            <li key={i} style={{ display: 'flex', gap: 8, fontSize: 12.5, color: '#4B5275', lineHeight: 1.55 }}>
              <span style={{ color: ACCENT, fontWeight: 800, flexShrink: 0 }}>·</span>
              <span>{t}</span>
            </li>
          ))}
        </ul>
      )}

      <button
        onClick={() => setEnabled(false)}
        title="Hide step guides"
        aria-label="Hide step guides"
        style={{
          position: 'absolute', top: 10, right: 10,
          width: 24, height: 24, borderRadius: 7,
          border: 'none', background: 'rgba(124,111,224,0.12)', color: ACCENT,
          cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}
      >
        <X size={14} />
      </button>
    </div>
  )
}
