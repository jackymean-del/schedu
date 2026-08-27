/// <reference types="vite/client" />
import axios from 'axios'

// ─────────────────────────────────────────────────────────────
// AXIOS INSTANCE
// ─────────────────────────────────────────────────────────────

export const apiClient = axios.create({
  baseURL: '/api/v1',
  headers: { 'Content-Type': 'application/json' },
})

// Token source. When Clerk is active, ClerkAuthSync registers a getter that
// returns a fresh Clerk session token; otherwise we fall back to a token in
// localStorage (mock auth).
let tokenGetter: (() => Promise<string | null>) | null = null
export function setTokenGetter(fn: (() => Promise<string | null>) | null) { tokenGetter = fn }

apiClient.interceptors.request.use(async (config) => {
  let token: string | null = null
  if (tokenGetter) {
    try { token = await tokenGetter() } catch { /* fall through */ }
  }
  if (!token) token = localStorage.getItem('auth_token')
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

apiClient.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401) {
      localStorage.removeItem('auth_token')
      window.location.href = '/login'
    }
    return Promise.reject(err)
  }
)

/** Ensure a DB user row exists for the signed-in Clerk user; returns plan/role. */
export const meApi = {
  sync: (data: { email?: string; name?: string; schoolName?: string }) =>
    apiClient.post<{ id: string; email: string; name: string; plan: string; role?: string }>('/me', data),
}

/** Billing / subscriptions (Razorpay). Authed endpoints go through apiClient. */
export interface BillingStatus {
  plan: string
  enabled: boolean
  status?: string
  interval?: 'monthly' | 'yearly'
  hasSubscription?: boolean
  currentPeriodEnd?: string
}
export const billingApi = {
  status:    ()                                => apiClient.get<BillingStatus>('/billing/status'),
  subscribe: (interval: 'monthly' | 'yearly')  =>
    apiClient.post<{ subscriptionId: string; keyId: string; shortUrl?: string; interval: string }>('/billing/subscribe', { interval }),
  cancel:    ()                                => apiClient.post<{ ok: boolean; status: string; message: string }>('/billing/cancel'),
}

// ─────────────────────────────────────────────────────────────
// TIMETABLES
// ─────────────────────────────────────────────────────────────
//
// These five are the whole server-side surface, and they match
// backend/cmd/server/main.go one for one.
//
// This file used to declare 53 endpoints. Forty-four of them — CRUD for
// classes, teachers, subjects, rooms, students, sessions, profiles, clusters,
// parallel blocks, bell schedules, a scheduler job runner, per-entity timetable
// views, and a substitution service — had no route on the backend and no caller
// in the app. They were the shape of an earlier architecture, where the solver
// ran on the server; it runs in a Web Worker in the browser now, and resources
// live in the per-schedule snapshot rather than in tables.
//
// Left in place they were a trap: `timetableApi.publish()` reads as a working
// call and returns a 404 in production. Deleted rather than commented out —
// git has them if the server-side plan ever comes back.

export const timetableApi = {
  list:   ()                                    => apiClient.get('/timetables'),
  get:    (id: string)                          => apiClient.get(`/timetables/${id}`),
  create: (data: unknown)                       => apiClient.post('/timetables', data),
  update: (id: string, data: unknown)           => apiClient.put(`/timetables/${id}`, data),
  delete: (id: string)                          => apiClient.delete(`/timetables/${id}`),
}
