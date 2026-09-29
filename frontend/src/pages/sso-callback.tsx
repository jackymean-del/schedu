/**
 * OAuth landing page. Clerk redirects here after Google sign-in/up; the
 * callback component finishes the handshake and forwards to the app.
 *
 * Shows the shared full-screen branded loader (animated SchedU mark) - no
 * marketing header. __root.tsx special-cases this path so no chrome wraps it.
 */
import { AuthenticateWithRedirectCallback } from '@clerk/clerk-react'
import { CLERK_ENABLED } from '@/lib/clerk'
import { BrandedLoader } from '@/components/BrandedLoader'

export function SSOCallbackPage() {
  if (!CLERK_ENABLED) { window.location.href = '/login'; return null }
  return (
    <>
      <BrandedLoader label="Signing you in…" />
      <AuthenticateWithRedirectCallback
        signInForceRedirectUrl="/dashboard"
        signUpForceRedirectUrl="/dashboard"
      />
    </>
  )
}
