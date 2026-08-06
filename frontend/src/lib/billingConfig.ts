/**
 * Is there any way to actually take money right now?
 *
 * The backend answers this on a PUBLIC endpoint (/api/billing/config, outside
 * the auth-guarded /v1 group) and it is simply whether Razorpay keys are
 * configured. Until a company bank account exists there are no keys, so there
 * is nothing to sell — and the app should say "free for now" rather than show
 * prices behind a button that cannot work.
 *
 * Everything reads this one flag, so the day keys are added the paid pitch
 * comes back everywhere at once with no code change.
 *
 * Fetched once per page load and cached; a failed fetch means NOT live, which
 * is the safe direction — the worst case is offering something free that you
 * could have charged for, not charging for something that cannot be delivered.
 */
import { create } from 'zustand'

export interface BillingConfig {
  enabled: boolean
  keyId?: string
  currency?: string
  monthly?: { amount: number }
  yearly?: { amount: number; discountPct: number }
}

interface BillingConfigState {
  cfg: BillingConfig | null
  loaded: boolean
  load: () => void
}

let inFlight: Promise<void> | null = null

export const useBillingConfig = create<BillingConfigState>((set, get) => ({
  cfg: null,
  loaded: false,
  load: () => {
    if (get().loaded || inFlight) return
    inFlight = fetch('/api/billing/config')
      .then(r => (r.ok ? r.json() : null))
      .then((d: BillingConfig | null) => set({ cfg: d, loaded: true }))
      .catch(() => set({ cfg: null, loaded: true }))
      .finally(() => { inFlight = null })
  },
}))

/** True only when the backend says payments are live. Defaults to false. */
export function useBillingLive(): boolean {
  const cfg = useBillingConfig(s => s.cfg)
  const load = useBillingConfig(s => s.load)
  load()
  return cfg?.enabled ?? false
}
