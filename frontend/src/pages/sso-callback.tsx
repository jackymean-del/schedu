/**
 * OAuth landing page. Clerk redirects here after Google sign-in/up; the
 * callback component finishes the handshake and forwards to the app.
 *
 * Renders a clean, full-screen branded loader (animated SchedU mark) — no
 * marketing header. __root.tsx special-cases this path so no chrome wraps it.
 */
import { AuthenticateWithRedirectCallback } from '@clerk/clerk-react'
import { CLERK_ENABLED } from '@/lib/clerk'

export function SSOCallbackPage() {
  if (!CLERK_ENABLED) { window.location.href = '/login'; return null }
  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9999,
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      gap: 18, background: '#F5F4F0',
      fontFamily: "'Plus Jakarta Sans', -apple-system, sans-serif",
    }}>
      <style>{`
        @keyframes schedu-pulse {
          0%, 100% { transform: scale(1);    box-shadow: 0 8px 24px rgba(124,111,224,0.30); }
          50%      { transform: scale(1.08); box-shadow: 0 12px 32px rgba(124,111,224,0.45); }
        }
        @keyframes schedu-fade { 0%,100% { opacity: 0.55; } 50% { opacity: 1; } }
      `}</style>

      {/* Animated SchedU mark — the only thing that "loads" */}
      <div style={{
        width: 64, height: 64, borderRadius: 18, background: '#7C6FE0',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        animation: 'schedu-pulse 1.2s ease-in-out infinite',
      }}>
        <svg width="38" height="38" viewBox="0 0 52 52" fill="none">
          <rect x="12" y="9" width="8" height="33" rx="4" fill="white"/>
          <path d="M 20 22 C 23 14 40 15 40 30 C 40 45 23 46 20 42" stroke="white" strokeWidth="8" fill="none" strokeLinecap="round"/>
          <circle cx="39" cy="10" r="4.5" fill="#D4920E"/>
        </svg>
      </div>

      <div style={{ fontSize: 14, color: '#6B7280', animation: 'schedu-fade 1.2s ease-in-out infinite' }}>
        Signing you in…
      </div>

      <AuthenticateWithRedirectCallback
        signInForceRedirectUrl="/dashboard"
        signUpForceRedirectUrl="/dashboard"
      />
    </div>
  )
}
