/**
 * Subscription — real plan state + working Razorpay checkout.
 *
 * - Current plan comes from real account state: the server's billing status
 *   (authoritative, webhook-driven) with the auth store as a fast fallback.
 * - Upgrade opens Razorpay Checkout for a monthly or yearly Pro subscription.
 *   The plan is only promoted to 'pro' server-side, by the activation webhook —
 *   never on the client — so a closed/failed checkout can't grant Pro.
 * - Prices + whether billing is live are read from the public /billing/config
 *   endpoint, so the page is honest when billing isn't configured yet (button
 *   disabled, no dead-end).
 */
import { useEffect, useMemo, useState } from 'react'
import { PageHeader } from '@/components/layout/PageHeader'
import { CheckCircle2, Zap, Check, Loader2, ShieldCheck } from 'lucide-react'
import { useAuthStore } from '@/store/authStore'
import { billingApi, type BillingStatus } from '@/api/client'

declare global {
  interface Window {
    Razorpay?: new (options: Record<string, unknown>) => { open: () => void; on: (e: string, cb: (r: unknown) => void) => void }
  }
}

interface BillingConfig {
  enabled: boolean
  keyId: string
  currency: string
  monthly: { amount: number }
  yearly: { amount: number; discountPct: number }
}

const FREE_FEATURES = [
  'AI auto-scheduling — conflict-free in minutes',
  '1 active schedule',
  'Up to 40 classes',
  'Class, Faculty, Venue & Subject views',
  'Live calendar (view mode)',
  'Excel & print / PDF export',
]

const PRO_FEATURES = [
  'Unlimited schedules & classes',
  'Live task assignment & substitutions',
  'Team collaboration — invite & manage users',
  'Advanced AI & multi-shift / block scheduling',
  'Workload analytics & optimisation',
  'Priority support',
]

const RZP_SCRIPT = 'https://checkout.razorpay.com/v1/checkout.js'

/** Load the Razorpay Checkout script once, resolving when window.Razorpay exists. */
function loadRazorpay(): Promise<boolean> {
  return new Promise((resolve) => {
    if (window.Razorpay) return resolve(true)
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${RZP_SCRIPT}"]`)
    if (existing) {
      existing.addEventListener('load', () => resolve(!!window.Razorpay))
      existing.addEventListener('error', () => resolve(false))
      return
    }
    const s = document.createElement('script')
    s.src = RZP_SCRIPT
    s.async = true
    s.onload = () => resolve(!!window.Razorpay)
    s.onerror = () => resolve(false)
    document.body.appendChild(s)
  })
}

const inr = (n: number) => `₹${n.toLocaleString('en-IN')}`

export function SubscriptionPage() {
  const user = useAuthStore(s => s.user)

  const [cfg, setCfg] = useState<BillingConfig | null>(null)
  const [status, setStatus] = useState<BillingStatus | null>(null)
  const [interval, setPlanInterval] = useState<'monthly' | 'yearly'>('yearly')
  const [busy, setBusy] = useState(false)
  const [phase, setPhase] = useState<'idle' | 'activating' | 'done' | 'error'>('idle')
  const [errMsg, setErrMsg] = useState('')
  const [cancelling, setCancelling] = useState(false)
  const [confirmCancel, setConfirmCancel] = useState(false)

  // Plan: server status wins; fall back to the auth store while it loads.
  const plan = (status?.plan ?? user?.plan ?? 'free') as string
  const isPro = plan === 'pro' || plan === 'enterprise'

  // Prices (from server config, with sane fallbacks so the page always renders).
  const monthly = cfg?.monthly.amount ?? 333
  const yearly = cfg?.yearly.amount ?? 3333
  const discountPct = cfg?.yearly.discountPct ?? Math.round((1 - yearly / (monthly * 12)) * 100)
  const yearlyPerMonth = Math.round(yearly / 12)
  const billingEnabled = cfg?.enabled ?? false

  useEffect(() => {
    // Public config (prices + whether billing is live) — plain fetch, no auth.
    fetch('/api/billing/config')
      .then(r => (r.ok ? r.json() : null))
      .then((d: BillingConfig | null) => d && setCfg(d))
      .catch(() => { /* fall back to defaults */ })
    // Authoritative billing status for the signed-in user.
    billingApi.status().then(r => setStatus(r.data)).catch(() => { /* fall back to auth store */ })
  }, [])

  const refreshStatus = () => billingApi.status().then(r => setStatus(r.data)).catch(() => {})

  // After a successful checkout the webhook may take a few seconds to flip the
  // plan. Poll status briefly so the UI updates without a manual refresh.
  const pollActivation = async () => {
    setPhase('activating')
    for (let i = 0; i < 8; i++) {
      await new Promise(res => setTimeout(res, 2000))
      try {
        const { data } = await billingApi.status()
        setStatus(data)
        if (data.plan === 'pro' || data.plan === 'enterprise') { setPhase('done'); return }
      } catch { /* keep polling */ }
    }
    // Payment captured but webhook not yet reflected — reassure, don't alarm.
    setPhase('done')
  }

  const upgrade = async () => {
    if (busy || !billingEnabled) return
    setBusy(true); setErrMsg(''); setPhase('idle')
    try {
      const { data } = await billingApi.subscribe(interval)
      const ok = await loadRazorpay()
      if (!ok || !window.Razorpay) throw new Error('Could not load the payment window. Check your connection and try again.')

      const rzp = new window.Razorpay({
        key: data.keyId,
        subscription_id: data.subscriptionId,
        name: 'schedU',
        description: interval === 'yearly' ? 'schedU Pro — Annual' : 'schedU Pro — Monthly',
        prefill: { name: user?.name || '', email: user?.email || '' },
        theme: { color: '#7C6FE0' },
        handler: () => { setBusy(false); void pollActivation() },
        modal: { ondismiss: () => setBusy(false) },
      })
      rzp.on('payment.failed', () => {
        setBusy(false); setPhase('error')
        setErrMsg('The payment could not be completed. You have not been charged — please try again.')
      })
      rzp.open()
    } catch (e) {
      setBusy(false); setPhase('error')
      setErrMsg(e instanceof Error ? e.message : 'Something went wrong starting checkout. Please try again.')
    }
  }

  const cancel = async () => {
    setCancelling(true); setErrMsg('')
    try {
      await billingApi.cancel()
      await refreshStatus()
      setConfirmCancel(false)
    } catch {
      setErrMsg('Could not cancel right now — please try again, or reach out via Support.')
    } finally {
      setCancelling(false)
    }
  }

  const periodEnd = useMemo(() => {
    if (!status?.currentPeriodEnd) return null
    const d = new Date(status.currentPeriodEnd)
    return isNaN(d.getTime()) ? null : d.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })
  }, [status?.currentPeriodEnd])

  return (
    <div style={{ minHeight: '100vh', background: '#F5F2FF' }}>
      <PageHeader icon="⚡" title="Subscription" description="Your current plan and available upgrades." />
      <div style={{ maxWidth: 820, margin: '0 auto', padding: '24px 28px', display: 'flex', flexDirection: 'column', gap: 20 }}>

        {/* Current plan — real account state */}
        <div style={{ background: isPro ? '#13111E' : '#EDE9FF', border: `2px solid ${isPro ? '#A78BFA' : '#7C6FE0'}`, borderRadius: 14, padding: '18px 22px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
            <Zap size={16} color={isPro ? '#A78BFA' : '#7C6FE0'} />
            <span style={{ fontSize: 12, fontWeight: 800, color: isPro ? '#A78BFA' : '#7C6FE0', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
              Current plan
            </span>
          </div>
          <div style={{ fontSize: 22, fontWeight: 900, color: isPro ? '#fff' : '#13111E', textTransform: 'capitalize' }}>{plan}</div>
          <div style={{ fontSize: 13, color: isPro ? '#C4C0E8' : '#4B5275', marginTop: 4 }}>
            {isPro
              ? (status?.status === 'cancelled'
                  ? `Your Pro plan is cancelled${periodEnd ? ` — access continues until ${periodEnd}` : ''}.`
                  : `You're on Pro${status?.interval ? ` (${status.interval})` : ''}${periodEnd ? ` — renews ${periodEnd}` : ''}.`)
              : 'Everything you need while schedU is in early access.'}
          </div>

          {isPro && status?.status !== 'cancelled' && (
            confirmCancel ? (
              <div style={{ marginTop: 14, display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                <span style={{ fontSize: 12.5, color: '#C4C0E8' }}>Cancel Pro? You&rsquo;ll keep access until the period you&rsquo;ve paid for ends.</span>
                <button onClick={cancel} disabled={cancelling}
                  style={{ padding: '6px 14px', borderRadius: 8, background: '#EF4444', color: '#fff', border: 'none', fontSize: 12.5, fontWeight: 700, cursor: cancelling ? 'wait' : 'pointer' }}>
                  {cancelling ? 'Cancelling…' : 'Yes, cancel'}
                </button>
                <button onClick={() => setConfirmCancel(false)} disabled={cancelling}
                  style={{ padding: '6px 14px', borderRadius: 8, background: 'transparent', color: '#C4C0E8', border: '1px solid #8B87AD', fontSize: 12.5, fontWeight: 700, cursor: 'pointer' }}>
                  Keep Pro
                </button>
              </div>
            ) : (
              <button onClick={() => setConfirmCancel(true)}
                style={{ marginTop: 12, padding: '6px 14px', borderRadius: 8, background: 'transparent', color: '#A78BFA', border: '1px solid #A78BFA', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
                Cancel subscription
              </button>
            )
          )}
        </div>

        {/* Activation / error banners */}
        {phase === 'activating' && (
          <div style={{ background: '#EFF6FF', border: '1px solid #BFDBFE', borderRadius: 10, padding: '10px 14px', fontSize: 12.5, color: '#1E40AF', display: 'flex', alignItems: 'center', gap: 8 }}>
            <Loader2 size={14} className="spin" /> Payment received — activating your Pro plan…
          </div>
        )}
        {phase === 'done' && (
          <div style={{ background: 'rgba(52,211,153,0.12)', border: '1px solid rgba(52,211,153,0.4)', borderRadius: 10, padding: '10px 14px', fontSize: 12.5, color: '#065F46', display: 'flex', alignItems: 'center', gap: 8 }}>
            <Check size={14} /> You&rsquo;re on Pro — thank you! If anything still shows Free, refresh in a moment.
          </div>
        )}
        {phase === 'error' && errMsg && (
          <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 10, padding: '10px 14px', fontSize: 12.5, color: '#991B1B' }}>
            {errMsg}
          </div>
        )}

        {/* Plan comparison — hidden once the user is Pro (nothing to upsell) */}
        {!isPro && (
          <>
            {/* Billing-interval toggle */}
            <div style={{ display: 'flex', justifyContent: 'center' }}>
              <div style={{ display: 'inline-flex', background: '#fff', border: '1px solid #ECE9FB', borderRadius: 999, padding: 4 }}>
                {(['monthly', 'yearly'] as const).map(opt => (
                  <button key={opt} onClick={() => setPlanInterval(opt)}
                    style={{
                      padding: '7px 18px', borderRadius: 999, border: 'none', cursor: 'pointer',
                      fontSize: 12.5, fontWeight: 700,
                      background: interval === opt ? 'linear-gradient(135deg,#7C6FE0,#A78BFA)' : 'transparent',
                      color: interval === opt ? '#fff' : '#4B5275',
                    }}>
                    {opt === 'monthly' ? 'Monthly' : 'Yearly'}
                    {opt === 'yearly' && <span style={{ marginLeft: 6, fontSize: 11, opacity: 0.9 }}>Save {discountPct}%</span>}
                  </button>
                ))}
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              {/* Free */}
              <div style={{ background: '#fff', border: '1px solid #ECE9FB', borderRadius: 14, padding: 20 }}>
                <div style={{ fontSize: 16, fontWeight: 800, color: '#13111E', marginBottom: 4 }}>Free</div>
                <div style={{ fontSize: 24, fontWeight: 900, color: '#7C6FE0', marginBottom: 16 }}>
                  ₹0 <span style={{ fontSize: 13, fontWeight: 500, color: '#8B87AD' }}>/ month</span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {FREE_FEATURES.map(f => (
                    <div key={f} style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                      <CheckCircle2 size={14} color="#7C6FE0" style={{ flexShrink: 0, marginTop: 1 }} />
                      <span style={{ fontSize: 12.5, color: '#4B5275' }}>{f}</span>
                    </div>
                  ))}
                </div>
                <div style={{ marginTop: 18, padding: '8px 16px', borderRadius: 8, background: '#EDE9FF', color: '#7C6FE0', fontSize: 12.5, fontWeight: 700, textAlign: 'center' }}>
                  Current plan
                </div>
              </div>

              {/* Pro */}
              <div style={{ background: '#13111E', border: '2px solid #7C6FE0', borderRadius: 14, padding: 20, position: 'relative' }}>
                <div style={{ fontSize: 16, fontWeight: 800, color: '#fff', marginBottom: 4 }}>Pro</div>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 2 }}>
                  <span style={{ fontSize: 24, fontWeight: 900, color: '#A78BFA' }}>
                    {interval === 'monthly' ? inr(monthly) : inr(yearly)}
                  </span>
                  <span style={{ fontSize: 13, fontWeight: 500, color: '#8B87AD' }}>
                    {interval === 'monthly' ? '/ month' : '/ year'}
                  </span>
                </div>
                <div style={{ fontSize: 11.5, color: '#8B87AD', marginBottom: 16, minHeight: 16 }}>
                  {interval === 'yearly' ? `≈ ${inr(yearlyPerMonth)}/mo · save ${discountPct}% vs monthly` : `or ${inr(yearly)}/yr — save ${discountPct}%`}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {PRO_FEATURES.map(f => (
                    <div key={f} style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                      <CheckCircle2 size={14} color="#A78BFA" style={{ flexShrink: 0, marginTop: 1 }} />
                      <span style={{ fontSize: 12.5, color: '#C4C0E8' }}>{f}</span>
                    </div>
                  ))}
                </div>

                <button
                  onClick={upgrade}
                  disabled={busy || !billingEnabled}
                  style={{
                    marginTop: 18, width: '100%', padding: '10px 16px', borderRadius: 8,
                    background: billingEnabled ? 'linear-gradient(135deg,#7C6FE0,#A78BFA)' : '#3A3550',
                    color: billingEnabled ? '#fff' : '#8B87AD', fontSize: 13, fontWeight: 800, border: 'none',
                    cursor: busy ? 'wait' : billingEnabled ? 'pointer' : 'not-allowed',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                  }}>
                  {busy ? <><Loader2 size={14} className="spin" /> Opening checkout…</> : billingEnabled ? 'Upgrade to Pro' : 'Online payment coming soon'}
                </button>

                <div style={{ marginTop: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, fontSize: 10.5, color: '#8B87AD' }}>
                  <ShieldCheck size={12} /> Secure payment via Razorpay · UPI, cards &amp; netbanking
                </div>
                {!billingEnabled && (
                  <div style={{ marginTop: 8, fontSize: 11, color: '#8B87AD', textAlign: 'center' }}>
                    We&rsquo;re finalising online payments — this will be live shortly.
                  </div>
                )}
              </div>
            </div>
          </>
        )}

        <p style={{ fontSize: 12, color: '#8B87AD', textAlign: 'center', margin: 0 }}>
          Questions? Reach out via <a href="/support" style={{ color: '#7C6FE0', fontWeight: 600 }}>Help &amp; Support</a>.
        </p>
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg) } } .spin { animation: spin 0.8s linear infinite; }`}</style>
    </div>
  )
}
