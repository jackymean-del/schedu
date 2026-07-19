/**
 * Subscription — current plan + upgrade options.
 *
 * The current plan is read from the real account state (authStore user.plan),
 * not hardcoded. Pro is pre-launch: the "Notify me" button captures genuine
 * interest into the same team-visible store the contact form uses
 * (source="pro-waitlist"), so it's a working waitlist, not a dead button.
 *
 * Free-plan copy describes what the product ACTUALLY does today (multiple
 * active schedules, every view, export, live calendar & substitution) — the
 * old "1 active timetable / up to 30 classes" caps were never enforced and
 * contradicted the product, so they're gone.
 */
import { useState } from 'react'
import { PageHeader } from '@/components/layout/PageHeader'
import { CheckCircle2, Zap, Check, Loader2 } from 'lucide-react'
import { useAuthStore } from '@/store/authStore'

const PLAN_META: Record<string, { label: string; blurb: string }> = {
  free:       { label: 'Free',       blurb: 'Everything you need while schedU is in early access.' },
  pro:        { label: 'Pro',        blurb: 'Full scale, team collaboration, and priority support.' },
  enterprise: { label: 'Enterprise', blurb: 'Multi-campus management with SSO and a success manager.' },
}

const FREE_FEATURES = [
  'AI auto-scheduling — conflict-free in minutes',
  'Multiple active schedules at once',
  'Class, Faculty, Venue & Subject views',
  'Live calendar with substitutions & fair duty',
  'Drag-and-drop editing with clash checks',
  'Excel & print / PDF export',
]

const PRO_FEATURES = [
  'Everything in Free, at unlimited scale',
  'Team collaboration — invite & manage users',
  'Advanced AI & multi-shift / block scheduling',
  'Workload analytics & optimisation',
  'Priority support',
]

export function SubscriptionPage() {
  const user = useAuthStore(s => s.user)
  const plan = (user?.plan ?? 'free') as keyof typeof PLAN_META
  const current = PLAN_META[plan] ?? PLAN_META.free

  const [waitState, setWaitState] = useState<'idle' | 'sending' | 'done' | 'error'>('idle')

  const joinWaitlist = async () => {
    if (waitState === 'sending' || waitState === 'done') return
    setWaitState('sending')
    try {
      const res = await fetch('/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: user?.name || 'schedU user',
          email: user?.email || '',
          message: 'Requested to be notified when the Pro plan launches (from the in-app Subscription page).',
          source: 'pro-waitlist',
        }),
      })
      if (!res.ok) throw new Error('request failed')
      setWaitState('done')
    } catch {
      setWaitState('error')
    }
  }

  return (
    <div style={{ minHeight: '100vh', background: '#F5F2FF' }}>
      <PageHeader icon="⚡" title="Subscription" description="Your current plan and available upgrades." />
      <div style={{ maxWidth: 780, margin: '0 auto', padding: '24px 28px', display: 'flex', flexDirection: 'column', gap: 20 }}>

        {/* Current plan — real account state */}
        <div style={{ background: '#EDE9FF', border: '2px solid #7C6FE0', borderRadius: 14, padding: '18px 22px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
            <Zap size={16} color="#7C6FE0" />
            <span style={{ fontSize: 12, fontWeight: 800, color: '#7C6FE0', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
              Current plan
            </span>
          </div>
          <div style={{ fontSize: 22, fontWeight: 900, color: '#13111E' }}>{current.label}</div>
          <div style={{ fontSize: 13, color: '#4B5275', marginTop: 4 }}>{current.blurb}</div>
        </div>

        {/* Plan comparison */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          {/* Free */}
          <div style={{ background: '#fff', border: '1px solid #ECE9FB', borderRadius: 14, padding: 20 }}>
            <div style={{ fontSize: 16, fontWeight: 800, color: '#13111E', marginBottom: 4 }}>Free</div>
            <div style={{ fontSize: 24, fontWeight: 900, color: '#7C6FE0', marginBottom: 16 }}>
              $0 <span style={{ fontSize: 13, fontWeight: 500, color: '#8B87AD' }}>/ month</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {FREE_FEATURES.map(f => (
                <div key={f} style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                  <CheckCircle2 size={14} color="#7C6FE0" style={{ flexShrink: 0, marginTop: 1 }} />
                  <span style={{ fontSize: 12.5, color: '#4B5275' }}>{f}</span>
                </div>
              ))}
            </div>
            <div style={{
              marginTop: 18, padding: '8px 16px', borderRadius: 8,
              background: plan === 'free' ? '#EDE9FF' : '#F5F5F7',
              color: plan === 'free' ? '#7C6FE0' : '#9CA3AF',
              fontSize: 12.5, fontWeight: 700, textAlign: 'center',
            }}>
              {plan === 'free' ? 'Current plan' : 'Included'}
            </div>
          </div>

          {/* Pro */}
          <div style={{ background: '#13111E', border: '2px solid #7C6FE0', borderRadius: 14, padding: 20 }}>
            <div style={{ fontSize: 16, fontWeight: 800, color: '#fff', marginBottom: 4 }}>Pro</div>
            <div style={{ fontSize: 24, fontWeight: 900, color: '#A78BFA', marginBottom: 16 }}>
              Coming soon
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {PRO_FEATURES.map(f => (
                <div key={f} style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                  <CheckCircle2 size={14} color="#A78BFA" style={{ flexShrink: 0, marginTop: 1 }} />
                  <span style={{ fontSize: 12.5, color: '#C4C0E8' }}>{f}</span>
                </div>
              ))}
            </div>

            {waitState === 'done' ? (
              <div style={{
                marginTop: 18, width: '100%', padding: '9px 16px', borderRadius: 8,
                background: 'rgba(52,211,153,0.15)', border: '1px solid rgba(52,211,153,0.4)',
                color: '#6EE7B7', fontSize: 12.5, fontWeight: 700, textAlign: 'center',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
              }}>
                <Check size={14} /> You&rsquo;re on the list — we&rsquo;ll email you at launch
              </div>
            ) : (
              <button
                onClick={joinWaitlist}
                disabled={waitState === 'sending'}
                style={{
                  marginTop: 18, width: '100%', padding: '9px 16px', borderRadius: 8,
                  background: 'linear-gradient(135deg,#7C6FE0,#A78BFA)',
                  color: '#fff', fontSize: 12.5, fontWeight: 700, border: 'none',
                  cursor: waitState === 'sending' ? 'wait' : 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                }}>
                {waitState === 'sending'
                  ? <><Loader2 size={14} className="spin" /> Adding you…</>
                  : 'Notify me when available'}
              </button>
            )}
            {waitState === 'error' && (
              <div style={{ marginTop: 8, fontSize: 11, color: '#FCA5A5', textAlign: 'center' }}>
                Couldn&rsquo;t reach the server — please try again, or email us via Support.
              </div>
            )}
          </div>
        </div>

        <p style={{ fontSize: 12, color: '#8B87AD', textAlign: 'center', margin: 0 }}>
          Questions? Reach out via <a href="/support" style={{ color: '#7C6FE0', fontWeight: 600 }}>Help &amp; Support</a>.
        </p>
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg) } } .spin { animation: spin 0.8s linear infinite; }`}</style>
    </div>
  )
}
