/**
 * Bridges Clerk's session into the app's existing `useAuthStore`, so every
 * consumer that reads `useAuthStore` (institution branding, nav, share token,
 * role checks, …) keeps working unchanged. Also wires the API client's token
 * getter to Clerk and ensures a DB user row exists.
 *
 * Rendered only when Clerk is enabled (inside <ClerkProvider>).
 */
import { useEffect } from 'react'
import { useUser, useAuth, useClerk } from '@clerk/clerk-react'
import { useAuthStore, setClerkSignOut, type AuthUser } from '@/store/authStore'
import { setTokenGetter, meApi } from '@/api/client'

export function ClerkAuthSync() {
  const { isLoaded, isSignedIn, user } = useUser()
  const { getToken } = useAuth()
  const { signOut } = useClerk()

  // Wire the API client + logout buttons to Clerk.
  useEffect(() => {
    setTokenGetter(() => getToken())
    setClerkSignOut(() => { void signOut({ redirectUrl: '/login' }) })
    return () => { setTokenGetter(null); setClerkSignOut(null) }
  }, [getToken, signOut])

  // Mirror the Clerk user into the app store.
  useEffect(() => {
    if (!isLoaded) return
    if (!isSignedIn || !user) {
      useAuthStore.setState({ user: null, token: null, isAuthenticated: false })
      return
    }
    // Merge metadata: publicMetadata (backend-set) wins over unsafeMetadata
    // (set by our custom sign-up form for org name, address, etc.).
    const md = { ...(user.unsafeMetadata ?? {}), ...(user.publicMetadata ?? {}) } as Record<string, unknown>
    const email = user.primaryEmailAddress?.emailAddress ?? ''
    const appUser: AuthUser = {
      id: user.id,
      name: user.fullName || (md.name as string) || user.username || email.split('@')[0] || 'User',
      email,
      schoolName: (md.schoolName as string) || user.organizationMemberships?.[0]?.organization?.name || undefined,
      address: (md.address as string) || undefined,
      role: ((md.role as AuthUser['role']) ?? 'admin'),
      plan: ((md.plan as AuthUser['plan']) ?? 'free'),
      createdAt: user.createdAt ? new Date(user.createdAt).toISOString() : new Date().toISOString(),
    }
    useAuthStore.setState({ user: appUser, isAuthenticated: true })

    void getToken().then((t) => {
      useAuthStore.setState({ token: t })
      if (!t) return
      // Upsert the DB user row; let the backend be authoritative for plan/role.
      meApi.sync({ email: appUser.email, name: appUser.name, schoolName: appUser.schoolName })
        .then((res) => {
          const d = res.data
          useAuthStore.setState((s) => ({
            user: s.user ? { ...s.user, plan: (d.plan as AuthUser['plan']) ?? s.user.plan, role: (d.role as AuthUser['role']) ?? s.user.role } : s.user,
          }))
        })
        .catch(() => { /* backend optional/offline — keep Clerk-derived values */ })
    })
  }, [isLoaded, isSignedIn, user, getToken])

  return null
}
