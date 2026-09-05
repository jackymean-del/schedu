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

// ─────────────────────────────────────────────────────────────
// PEOPLE, AND THE DECISIONS THEY MAY TAKE
// ─────────────────────────────────────────────────────────────
//
// The first endpoints in this app that somebody other than the account owner
// writes to. A teacher signs in, sees the schedules a school has put them on,
// and takes an OR period for a subject they teach. Authorisation is the
// server's: it checks that the caller's ROSTER NAME is against the subject
// being claimed, because a timetable names teachers by roster name and never
// by login.

export interface MemberRow {
  id: string
  email: string
  /** How this person is named in the timetable — the join that makes the rest work. */
  staffName: string
  role: 'admin' | 'teacher' | 'viewer'
  status: 'active' | 'invited'
}

export const memberApi = {
  list:   ()                     => apiClient.get<{ members: MemberRow[] }>('/members'),
  upsert: (m: { email: string; staffName?: string; role?: string }) =>
    apiClient.post('/members', m),
  remove: (id: string)           => apiClient.delete(`/members/${id}`),
}

export interface MySchedule {
  id: string
  name: string
  status: string
  /** True when this is the caller's own school rather than one they teach at. */
  mine: boolean
  role: 'admin' | 'teacher' | 'viewer'
  staffName: string
}

export interface OrDecisionRow {
  /** `section|YYYY-MM-DD|periodId` — the same key lib/orChoice builds. */
  key: string
  section: string
  date: string
  periodId: string
  subject: string
  by: string
}

export const collabApi = {
  /** Every timetable this account may see: their own, plus any school that
   *  lists them on its roster. */
  mySchedules: () => apiClient.get<{ schedules: MySchedule[] }>('/my-schedules'),

  orDecisions: (timetableId: string, from?: string, to?: string) =>
    apiClient.get<{ decisions: OrDecisionRow[] }>(
      `/timetables/${timetableId}/or-decisions`, { params: { from, to } }),

  /** Take (or, with an empty subject, release) one OR period for one date.
   *  `options` is sent as the timetable holds them so the server can check the
   *  caller actually teaches the subject being claimed. */
  decideOr: (timetableId: string, body: {
    section: string; date: string; periodId: string; subject: string
    options?: Array<{ subject: string; teacher?: string }>
  }) => apiClient.post(`/timetables/${timetableId}/or-decisions`, body),
}
