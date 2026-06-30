/**
 * Subscription — current plan and upgrade options.
 */
import { PageHeader } from '@/components/layout/PageHeader'
import { CheckCircle2, Zap } from 'lucide-react'

const FREE_FEATURES = [
  '1 active timetable',
  'Up to 30 classes',
  'AI auto-assign (basic)',
  'Export to Excel & PDF',
  'Calendar view',
]

const PRO_FEATURES = [
  'Unlimited timetables',
  'Unlimited classes & sections',
  'Advanced AI scheduling',
  'Teacher availability & substitution',
  'Multi-shift & block scheduling',
  'Team collaboration (invite users)',
  'Priority support',
]

export function SubscriptionPage() {
  return (
    <div style={{ minHeight: '100vh', background: '#F5F2FF' }}>
      <PageHeader icon="⚡" title="Subscription" description="Your current plan and available upgrades." />
      <div style={{ maxWidth: 780, margin: '0 auto', padding: '24px 28px', display: 'flex', flexDirection: 'column', gap: 20 }}>

        {/* Current plan */}
        <div style={{ background: '#EDE9FF', border: '2px solid #7C6FE0', borderRadius: 14, padding: '18px 22px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
            <Zap size={16} color="#7C6FE0" />
            <span style={{ fontSize: 12, fontWeight: 800, color: '#7C6FE0', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
              Current plan
            </span>
          </div>
          <div style={{ fontSize: 22, fontWeight: 900, color: '#13111E' }}>Free</div>
          <div style={{ fontSize: 13, color: '#4B5275', marginTop: 4 }}>Great for getting started. Upgrade any time.</div>
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
            <div style={{ marginTop: 18, padding: '8px 16px', borderRadius: 8, background: '#EDE9FF', color: '#7C6FE0', fontSize: 12.5, fontWeight: 700, textAlign: 'center' }}>
              Current plan
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
            <button style={{
              marginTop: 18, width: '100%', padding: '9px 16px', borderRadius: 8,
              background: 'linear-gradient(135deg,#7C6FE0,#A78BFA)',
              color: '#fff', fontSize: 12.5, fontWeight: 700, border: 'none', cursor: 'not-allowed',
              opacity: 0.7,
            }}>
              Notify me when available
            </button>
          </div>
        </div>

        <p style={{ fontSize: 12, color: '#8B87AD', textAlign: 'center', margin: 0 }}>
          Questions? Reach out via <a href="/support" style={{ color: '#7C6FE0', fontWeight: 600 }}>Help & Support</a>.
        </p>
      </div>
    </div>
  )
}
