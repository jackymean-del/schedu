/**
 * Profile — user account details. Uses Clerk's hosted profile management.
 */
import { useAuthStore } from '@/store/authStore'
import { PageHeader } from '@/components/layout/PageHeader'
import { useOrgProfile } from '@/store/orgProfile'
import { LogOut, User, Mail, Shield } from 'lucide-react'

export function ProfilePage() {
  const { user, logout } = useAuthStore()
  const { name: orgName } = useOrgProfile()

  const handleLogout = () => { logout(); window.location.href = '/login' }

  return (
    <div style={{ minHeight: '100vh', background: '#F5F2FF' }}>
      <PageHeader icon="👤" title="Profile" description="Your account and sign-in details." />
      <div style={{ maxWidth: 560, margin: '0 auto', padding: '24px 28px', display: 'flex', flexDirection: 'column', gap: 16 }}>

        {/* Account card */}
        <div style={{ background: '#fff', border: '1px solid #ECE9FB', borderRadius: 14, padding: 24 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 20 }}>
            <div style={{
              width: 56, height: 56, borderRadius: '50%',
              background: 'linear-gradient(135deg,#7C6FE0,#A78BFA)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 22, color: '#fff', fontWeight: 800,
              flexShrink: 0,
            }}>
              {user?.email?.[0]?.toUpperCase() ?? '?'}
            </div>
            <div>
              <div style={{ fontSize: 15, fontWeight: 800, color: '#13111E' }}>
                {user?.email ?? '—'}
              </div>
              {orgName && (
                <div style={{ fontSize: 12.5, color: '#8B87AD', marginTop: 2 }}>{orgName}</div>
              )}
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <Row icon={<Mail size={14} />} label="Email" value={user?.email ?? '—'} />
            <Row icon={<User size={14} />} label="User ID" value={user?.id ? user.id.slice(0, 18) + '…' : '—'} mono />
            <Row icon={<Shield size={14} />} label="Auth provider" value="Clerk" />
          </div>
        </div>

        {/* Manage via Clerk */}
        <div style={{ background: '#fff', border: '1px solid #ECE9FB', borderRadius: 14, padding: 20 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#13111E', marginBottom: 6 }}>Account management</div>
          <p style={{ fontSize: 12.5, color: '#8B87AD', margin: '0 0 14px', lineHeight: 1.6 }}>
            Change your password, manage connected accounts and security settings through your Clerk account portal.
          </p>
          <button
            onClick={() => { try { (window as any).Clerk?.openUserProfile?.() } catch { /* noop */ } }}
            style={{
              padding: '8px 18px', borderRadius: 8, border: '1px solid #DDD8FF',
              background: '#F5F2FF', color: '#7C6FE0',
              fontSize: 13, fontWeight: 700, cursor: 'pointer',
            }}
          >
            Open account settings
          </button>
        </div>

        {/* Sign out */}
        <button
          onClick={handleLogout}
          style={{
            display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'center',
            padding: '10px 20px', borderRadius: 10,
            border: '1px solid #FECACA', background: '#FFF5F5',
            color: '#DC2626', fontSize: 13, fontWeight: 700, cursor: 'pointer',
          }}
        >
          <LogOut size={14} /> Sign out
        </button>
      </div>
    </div>
  )
}

function Row({ icon, label, value, mono }: { icon: React.ReactNode; label: string; value: string; mono?: boolean }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px', background: '#FAF9FF', borderRadius: 8 }}>
      <span style={{ color: '#8B87AD', flexShrink: 0 }}>{icon}</span>
      <span style={{ fontSize: 12, color: '#8B87AD', width: 80, flexShrink: 0 }}>{label}</span>
      <span style={{ fontSize: 12.5, color: '#13111E', fontWeight: 600, fontFamily: mono ? "'DM Mono', monospace" : 'inherit' }}>
        {value}
      </span>
    </div>
  )
}
