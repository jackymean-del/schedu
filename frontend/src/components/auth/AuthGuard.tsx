/**
 * Route guard for protected app pages. When Clerk is enabled it redirects
 * signed-out users to /login; otherwise (mock auth in dev) it renders freely.
 * The implementation is chosen once at module load by CLERK_ENABLED, so neither
 * variant ever calls Clerk hooks conditionally.
 */
import type { ReactNode } from 'react'
import { useAuth } from '@clerk/clerk-react'
import { CLERK_ENABLED } from '@/lib/clerk'

function ClerkGuard({ children }: { children: ReactNode }) {
  const { isLoaded, isSignedIn } = useAuth()
  if (!isLoaded) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#6D6A8A', fontSize: 14 }}>
        Loading…
      </div>
    )
  }
  if (!isSignedIn) {
    if (typeof window !== 'undefined' && window.location.pathname !== '/login') {
      window.location.href = '/login'
    }
    return null
  }
  return <>{children}</>
}

function MockGuard({ children }: { children: ReactNode }) {
  // Dev/mock mode: routes stay open (no real auth wired).
  return <>{children}</>
}

export const AuthGuard = CLERK_ENABLED ? ClerkGuard : MockGuard
