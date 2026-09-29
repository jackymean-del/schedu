import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { CLERK_ENABLED } from '@/lib/clerk'

export interface AuthUser {
  id: string
  name: string
  email: string
  schoolName?: string
  /** Institution mailing address - printed in document headers when set. */
  address?: string
  role: 'admin' | 'teacher' | 'viewer'
  /** Subscription tier. Absent / 'free' shows the schedU print watermark. */
  plan?: 'free' | 'pro' | 'enterprise'
  createdAt: string
}

interface AuthState {
  user: AuthUser | null
  token: string | null
  isAuthenticated: boolean
  /** False until auth has been resolved on this page load (Clerk finished
   *  loading). Lets protected pages show a loader instead of flashing the
   *  login form. Always true in mock-auth dev (resolves synchronously). */
  authReady: boolean

  login: (email: string, password: string) => Promise<void>
  register: (name: string, email: string, password: string, schoolName?: string) => Promise<void>
  logout: () => void
  updateUser: (patch: Partial<AuthUser>) => void
}

function makeId() { return Math.random().toString(36).slice(2, 10) }
function makeToken() { return `schedu_${makeId()}${makeId()}` }

// When Clerk is active, ClerkAuthSync registers its signOut here so the app's
// existing logout() buttons also end the Clerk session.
let clerkSignOut: (() => void) | null = null
export function setClerkSignOut(fn: (() => void) | null) { clerkSignOut = fn }

// Likewise for Clerk's profile editor (change name / email / password).
let clerkOpenProfile: (() => void) | null = null
export function setClerkOpenProfile(fn: (() => void) | null) { clerkOpenProfile = fn }
export function openUserProfile() { try { clerkOpenProfile?.() } catch { /* ignore */ } }

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      token: null,
      isAuthenticated: false,
      // When Clerk is active, wait for ClerkAuthSync to flip this true once the
      // session is known. In mock mode there's no async load, so start ready.
      authReady: !CLERK_ENABLED,

      login: async (email, _password) => {
        // Simulate network delay
        await new Promise(r => setTimeout(r, 600))
        const stored = localStorage.getItem(`schedu_user_${email}`)
        if (stored) {
          const user: AuthUser = JSON.parse(stored)
          set({ user, token: makeToken(), isAuthenticated: true })
        } else {
          // Create user on first login (demo / dev mode)
          const user: AuthUser = {
            id: makeId(), name: email.split('@')[0],
            email, role: 'admin', createdAt: new Date().toISOString(),
          }
          localStorage.setItem(`schedu_user_${email}`, JSON.stringify(user))
          set({ user, token: makeToken(), isAuthenticated: true })
        }
      },

      register: async (name, email, _password, schoolName) => {
        await new Promise(r => setTimeout(r, 700))
        const user: AuthUser = {
          id: makeId(), name, email, schoolName, role: 'admin',
          createdAt: new Date().toISOString(),
        }
        localStorage.setItem(`schedu_user_${email}`, JSON.stringify(user))
        set({ user, token: makeToken(), isAuthenticated: true })
      },

      logout: () => {
        // Wipe the local session first so nothing can rehydrate it (this also
        // clears stale mock/demo sessions created before Clerk was enabled).
        set({ user: null, token: null, isAuthenticated: false })
        try { localStorage.removeItem('auth_token') } catch { /* ignore */ }
        try { localStorage.removeItem('schedu-auth') } catch { /* ignore */ }
        // End the Clerk session too (redirects to /login when Clerk is active).
        try { clerkSignOut?.() } catch { /* ignore */ }
      },

      updateUser: (patch) =>
        set(s => ({ user: s.user ? { ...s.user, ...patch } : null })),
    }),
    {
      name: 'schedu-auth',
      // authReady is per-page-load runtime state - never persist it, or a stale
      // `true` would skip the loader and reintroduce the login-form flash.
      partialize: (s) => ({ user: s.user, token: s.token, isAuthenticated: s.isAuthenticated }),
    }
  )
)
