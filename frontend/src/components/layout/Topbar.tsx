import { LogOut, LayoutDashboard, Sparkles } from 'lucide-react'
import { useAuthStore } from '@/store/authStore'

interface TopbarProps {
  step?: number
  totalSteps?: number
  stepLabel?: string
}

export function Topbar({ step, totalSteps, stepLabel }: TopbarProps) {
  const { user, isAuthenticated, logout } = useAuthStore()
  const isWizard = window.location.pathname.startsWith('/wizard')

  const handleLogout = () => { logout(); window.location.href = '/login' }

  return (
    <header style={{
      height: 56, background: '#fff',
      borderBottom: '1px solid #E8E4FF',
      display: 'flex', alignItems: 'center',
      padding: '0 20px', position: 'sticky',
      top: 0, zIndex: 500, gap: 12,
    }}>
      {/* Bhusku-b mark + SchedU wordmark */}
      <a href={isAuthenticated ? '/dashboard' : '/'} style={{ display:'flex', alignItems:'center', gap:10, textDecoration:'none', flexShrink:0 }}>
        <div style={{ width:32, height:32, borderRadius:8, background:'#7C6FE0', display:'flex', alignItems:'center', justifyContent:'center' }}>
          <svg width="19" height="19" viewBox="0 0 52 52" fill="none">
            <rect x="12" y="9" width="8" height="33" rx="4" fill="white"/>
            <path d="M 20 22 C 23 14 40 15 40 30 C 40 45 23 46 20 42" stroke="white" strokeWidth="8" fill="none" strokeLinecap="round"/>
            <circle cx="39" cy="10" r="4.5" fill="#D4920E"/>
          </svg>
        </div>
        <div>
          <div style={{ fontSize: 8, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: '#8B87AD', lineHeight: 1, marginBottom: 2 }}>by bhusku</div>
          <div style={{ fontFamily: "'Hanken Grotesk',sans-serif", fontSize: 16, fontWeight: 900, color: '#13111E', letterSpacing: '-0.5px', lineHeight: 1 }}>
            Sched<span style={{ color: '#7C6FE0', fontFamily: "'Fraunces',Georgia,serif", fontStyle: 'italic', fontSize: 17 }}>U</span>
          </div>
        </div>
      </a>

      {/* Wizard step pill — center */}
      <div style={{ flex:1, display:'flex', justifyContent:'center' }}>
        {isWizard && step && totalSteps && (
          <div style={{ display:'flex', alignItems:'center', gap:8, padding:'4px 14px', background:'#F5F2FF', borderRadius:20, border:'1px solid #E8E4FF' }}>
            <div style={{ display:'flex', gap:4 }}>
              {Array.from({ length: totalSteps }).map((_, i) => (
                <div key={i} style={{
                  width: i + 1 === step ? 16 : 6, height:6, borderRadius:3,
                  background: i + 1 < step ? '#7C6FE0' : i + 1 === step ? '#9B8EF5' : '#D8D2FF',
                  transition:'all 0.2s',
                }} />
              ))}
            </div>
            <span style={{ fontSize:11, color:'#4B5275' }}>
              Step {step}/{totalSteps}: <strong style={{ color:'#13111E' }}>{stepLabel}</strong>
            </span>
          </div>
        )}
      </div>

      {/* Right — auth-aware */}
      <div style={{ display:'flex', alignItems:'center', gap:8, flexShrink:0 }}>
        {isAuthenticated && user ? (
          <>
            {!isWizard && (
              <a href="/dashboard" style={{ textDecoration:'none' }}>
                <button style={{ display:'flex', alignItems:'center', gap:6, padding:'7px 13px', borderRadius:7, border:'1px solid #E8E4FF', background:'#fff', fontSize:12, color:'#4B5275', cursor:'pointer', fontWeight:600 }}>
                  <LayoutDashboard size={13} /> Dashboard
                </button>
              </a>
            )}
            <div style={{ display:'flex', alignItems:'center', gap:9, padding:'5px 11px', background:'#F5F2FF', borderRadius:8, border:'1px solid #E8E4FF' }}>
              <div style={{ width:26, height:26, borderRadius:'50%', background:'#7C6FE0', display:'flex', alignItems:'center', justifyContent:'center', color:'#fff', fontSize:11, fontWeight:700, flexShrink:0 }}>
                {user.name[0].toUpperCase()}
              </div>
              <div style={{ lineHeight:1.2 }}>
                <div style={{ fontSize:12, fontWeight:600, color:'#13111E' }}>{user.name}</div>
                {user.schoolName && <div style={{ fontSize:10, color:'#8B87AD' }}>{user.schoolName}</div>}
              </div>
              <button onClick={handleLogout} title="Logout"
                style={{ background:'none', border:'none', cursor:'pointer', color:'#8B87AD', padding:'2px', display:'flex', alignItems:'center' }}>
                <LogOut size={13} />
              </button>
            </div>
          </>
        ) : (
          <>
            <a href="/login" style={{ textDecoration:'none' }}>
              <button style={{ padding:'7px 14px', borderRadius:7, border:'1px solid #E8E4FF', background:'#fff', fontSize:12, fontWeight:600, color:'#4B5275', cursor:'pointer' }}>
                Sign in
              </button>
            </a>
            <a href="/wizard" style={{ textDecoration:'none' }}>
              <button style={{ display:'flex', alignItems:'center', gap:6, padding:'7px 14px', borderRadius:7, background:'#7C6FE0', color:'#fff', border:'none', fontSize:12, fontWeight:600, cursor:'pointer' }}>
                <Sparkles size={12} /> Get started
              </button>
            </a>
          </>
        )}
      </div>
    </header>
  )
}
