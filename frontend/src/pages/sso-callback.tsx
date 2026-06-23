/**
 * OAuth landing page. Clerk redirects here after Google sign-in/up; the
 * callback component finishes the handshake and forwards to the app.
 */
import { AuthenticateWithRedirectCallback } from '@clerk/clerk-react'
import { CLERK_ENABLED } from '@/lib/clerk'

export function SSOCallbackPage() {
  if (!CLERK_ENABLED) { window.location.href = '/login'; return null }
  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#F5F4F0', fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
      <AuthenticateWithRedirectCallback
        signInForceRedirectUrl="/dashboard"
        signUpForceRedirectUrl="/wizard"
      />
      <div style={{ fontSize: 14, color: '#6B7280' }}>Signing you in…</div>
    </div>
  )
}
