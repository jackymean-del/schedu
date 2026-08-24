/**
 * Organization setup nudge. Shown only INSIDE the signed-in app, and only while
 * the org profile is still incomplete.
 *
 * It deliberately holds no form: editing the organization lives in Settings, and
 * duplicating those fields here meant two places to keep in sync and two places
 * that could disagree. The nudge just points there.
 *
 * Gating (both conditions, not either):
 *  - the user is actually authenticated, and
 *  - the current route is an app route — never on /login, /register, the
 *    marketing pages or a public share link, where a persisted session from an
 *    earlier visit would otherwise make it appear before sign-in.
 */
import { useState } from 'react'
import { useAuthStore } from '@/store/authStore'
import { useOrgProfile, isOrgProfileComplete } from '@/store/orgProfile'

const ACCENT = '#685DBC'

/** Routes that are public or part of signing in — never nudge on these. */
const PUBLIC_PREFIXES = [
  '/login', '/register', '/sso-callback', '/share', '/demo',
  '/features', '/pricing', '/docs', '/contact',
]

function onPublicRoute(): boolean {
  if (typeof window === 'undefined') return true
  const p = window.location.pathname
  if (p === '/') return true
  return PUBLIC_PREFIXES.some(prefix => p === prefix || p.startsWith(prefix + '/'))
}

export function OnboardingGuide() {
  const { user, isAuthenticated, authReady } = useAuthStore()
  const { name } = useOrgProfile()
  const complete = isOrgProfileComplete({ name })
  const [dismissed, setDismissed] = useState(false)

  // Wait for auth to resolve, require a real session, and stay off public pages.
  if (!authReady || !isAuthenticated || !user) return null
  if (onPublicRoute()) return null
  if (complete || dismissed) return null

  return (
    <div style={{
      position: 'fixed', right: 20, bottom: 20, zIndex: 9000,
      width: 340, maxWidth: 'calc(100vw - 40px)',
      background: '#fff', borderRadius: 16, overflow: 'hidden',
      boxShadow: '0 16px 48px rgba(19,17,30,0.22)', border: '1px solid #ECE9FB',
      fontFamily: "'Plus Jakarta Sans', sans-serif", color: '#13111E',
    }}>
      <div style={{ background: ACCENT, padding: '14px 16px', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <div>
          <div style={{ color: '#fff', fontSize: 15, fontWeight: 800 }}>Welcome! Set up your organization</div>
          <div style={{ color: '#EDEAFB', fontSize: 12, marginTop: 2 }}>
            Add your name, type and academic period so schedU can tailor everything to you.
          </div>
        </div>
        <button onClick={() => setDismissed(true)} aria-label="Close"
          style={{ background: 'rgba(255,255,255,0.18)', border: 'none', color: '#fff', borderRadius: 8, width: 26, height: 26, cursor: 'pointer', fontSize: 15, lineHeight: 1, flexShrink: 0 }}>×</button>
      </div>

      <div style={{ padding: 16, display: 'flex', gap: 8 }}>
        <a href="/settings" style={{ flex: 1, textDecoration: 'none' }}>
          <button style={{
            width: '100%', padding: '10px 14px', borderRadius: 9, border: 'none', cursor: 'pointer',
            background: ACCENT, color: '#fff', fontWeight: 700, fontSize: 13, fontFamily: 'inherit',
          }}>
            Go to Settings
          </button>
        </a>
        <button onClick={() => setDismissed(true)}
          style={{ padding: '10px 14px', borderRadius: 9, border: '1px solid #E5E7EB', background: '#fff', color: '#69707E', fontWeight: 600, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' }}>
          Later
        </button>
      </div>
    </div>
  )
}
