import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export interface AuthUser {
  id: string
  name: string
  email: string
  schoolName?: string
  /** Institution mailing address — printed in document headers when set. */
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

  login: (email: string, password: string) => Promise<void>
  register: (name: string, email: string, password: string, schoolName?: string) => Promise<void>
  logout: () => void
  updateUser: (patch: Partial<AuthUser>) => void
}

function makeId() { return Math.random().toString(36).slice(2, 10) }
function makeToken() { return `schedu_${makeId()}${makeId()}` }

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      token: null,
      isAuthenticated: false,

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

      logout: () => set({ user: null, token: null, isAuthenticated: false }),

      updateUser: (patch) =>
        set(s => ({ user: s.user ? { ...s.user, ...patch } : null })),
    }),
    { name: 'schedu-auth' }
  )
)
