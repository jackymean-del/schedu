import { useState } from 'react'
import { CalendarDays, Mail, Lock, Loader2, Eye, EyeOff } from 'lucide-react'
import { useAuthStore } from '@/store/authStore'

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844a4.14 4.14 0 01-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615z" fill="#4285F4"/>
      <path d="M9 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 009 18z" fill="#34A853"/>
      <path d="M3.964 10.706A5.41 5.41 0 013.682 9c0-.593.102-1.17.282-1.706V4.962H.957A8.996 8.996 0 000 9c0 1.452.348 2.827.957 4.038l3.007-2.332z" fill="#FBBC05"/>
      <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 00.957 4.962L3.964 7.294C4.672 5.163 6.656 3.58 9 3.58z" fill="#EA4335"/>
    </svg>
  )
}

const FAKE_GOOGLE_USERS = [
  { name: 'Priya Sharma', email: 'priya.sharma@gmail.com', school: 'Delhi Public School' },
  { name: 'Rajesh Kumar',  email: 'rajesh.kumar@gmail.com',  school: 'Kendriya Vidyalaya' },
  { name: 'Anita Verma',   email: 'anita.verma@gmail.com',   school: 'DAV Public School' },
]

export function LoginPage() {
  const { login, register } = useAuthStore()
  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')
  const [showPw, setShowPw]     = useState(false)
  const [loading, setLoading]   = useState(false)
  const [googleLoading, setGoogleLoading] = useState(false)
  const [error, setError]       = useState('')

  const handleGoogle = async () => {
    setGoogleLoading(true)
    setError('')
    await new Promise(r => setTimeout(r, 1200))
    try {
      const u = FAKE_GOOGLE_USERS[Math.floor(Math.random() * FAKE_GOOGLE_USERS.length)]
      await register(u.name, u.email, 'google-oauth-token', u.school)
      window.location.href = '/dashboard'
    } catch {
      setError('Google sign-in failed. Please try again.')
      setGoogleLoading(false)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!email || !password) { setError('Enter email and password'); return }
    setError(''); setLoading(true)
    try {
      await login(email, password)
      window.location.href = '/dashboard'
    } catch {
      setError('Invalid credentials. Please try again.')
    } finally { setLoading(false) }
  }

  return (
    <div style={{
      minHeight: '100vh', display: 'flex',
      background: 'linear-gradient(135deg, #F5F2FF 0%, #FAFAFE 100%)',
    }}>
      {/* Left branding panel */}
      <div style={{
        width: 420, flexShrink: 0, background: '#13111E',
        display: 'flex', flexDirection: 'column', justifyContent: 'center',
        padding: '60px 52px', position: 'relative', overflow: 'hidden',
      }}>
        {/* Background decoration */}
        <div style={{ position:'absolute', top:-80, right:-80, width:300, height:300, borderRadius:'50%', background:'rgba(79,70,229,0.15)' }} />
        <div style={{ position:'absolute', bottom:-60, left:-60, width:220, height:220, borderRadius:'50%', background:'rgba(124,111,224,0.12)' }} />

        <div style={{ position:'relative', zIndex:1 }}>
          <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:52 }}>
            <div style={{ width:36, height:36, borderRadius:10, background:'linear-gradient(135deg,#9B8EF5,#7C6FE0)', display:'flex', alignItems:'center', justifyContent:'center' }}>
              <CalendarDays size={18} color="#fff" />
            </div>
            <span style={{ fontFamily:"'DM Serif Display',Georgia,serif", fontSize:20, color:'#fff' }}>
              Sche<span style={{ color:'#9B8EF5' }}>du</span>
            </span>
          </div>

          <h2 style={{ fontFamily:"'DM Serif Display',Georgia,serif", fontSize:32, color:'#fff', lineHeight:1.25, marginBottom:16 }}>
            India's smartest<br />timetable engine
          </h2>
          <p style={{ color:'#8B87AD', fontSize:14, lineHeight:1.75, marginBottom:40 }}>
            CBSE · ICSE · State Boards · IB<br />
            AI-generated, conflict-free schedules<br />
            in under 60 seconds.
          </p>

          <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
            {['Zero double-bookings, guaranteed', 'XI–XII optional subjects handled automatically', 'Export to Excel & PDF in one click'].map(f => (
              <div key={f} style={{ display:'flex', alignItems:'center', gap:10 }}>
                <div style={{ width:18, height:18, borderRadius:'50%', background:'#9B8EF5', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0, fontSize:10, color:'#fff', fontWeight:700 }}>✓</div>
                <span style={{ color:'#D8D2FF', fontSize:13 }}>{f}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Right form panel */}
      <div style={{ flex:1, display:'flex', alignItems:'center', justifyContent:'center', padding:'40px 24px' }}>
        <div style={{ width:'100%', maxWidth:400 }}>
          <h1 style={{ fontSize:26, fontWeight:700, color:'#13111E', marginBottom:6 }}>Welcome back</h1>
          <p style={{ color:'#4B5275', fontSize:14, marginBottom:32 }}>
            Sign in to continue to your timetables.{' '}
            <a href="/register" style={{ color:'#7C6FE0', fontWeight:600, textDecoration:'none' }}>Create account</a>
          </p>

          {/* Google button */}
          <button onClick={handleGoogle} disabled={googleLoading || loading} type="button"
            style={{
              width:'100%', padding:'11px 16px', borderRadius:9,
              border:'1.5px solid #E8E4FF', background: googleLoading ? '#F8F7FF' : '#fff',
              display:'flex', alignItems:'center', justifyContent:'center', gap:10,
              fontSize:14, fontWeight:600, color:'#4B5275', cursor: googleLoading ? 'default' : 'pointer',
              boxShadow:'0 1px 3px rgba(0,0,0,0.07)', marginBottom:20, transition:'box-shadow 0.15s, border-color 0.15s',
            }}
            onMouseEnter={e => { if (!googleLoading) { (e.currentTarget as HTMLButtonElement).style.borderColor='#D8D2FF'; (e.currentTarget as HTMLButtonElement).style.boxShadow='0 2px 6px rgba(0,0,0,0.10)' } }}
            onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.borderColor='#E8E4FF'; (e.currentTarget as HTMLButtonElement).style.boxShadow='0 1px 3px rgba(0,0,0,0.07)' }}
          >
            {googleLoading
              ? <><Loader2 size={16} style={{ animation:'spin 1s linear infinite', color:'#4B5275' }} /> Connecting to Google...</>
              : <><GoogleIcon /> Continue with Google</>
            }
          </button>

          {/* OR divider */}
          <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:4 }}>
            <div style={{ flex:1, height:1, background:'#E8E4FF' }} />
            <span style={{ fontSize:11, fontWeight:600, color:'#8B87AD', letterSpacing:'0.06em', textTransform:'uppercase' as const }}>or</span>
            <div style={{ flex:1, height:1, background:'#E8E4FF' }} />
          </div>

          <form onSubmit={handleSubmit} style={{ display:'flex', flexDirection:'column', gap:16 }}>
            <Field label="Email address" icon={<Mail size={15} color="#8B87AD" />}>
              <input type="email" value={email} onChange={e => setEmail(e.target.value)}
                placeholder="you@school.edu"
                style={inputStyle} autoFocus
                onFocus={e => focusIn(e.target as HTMLInputElement)}
                onBlur={e => focusOut(e.target as HTMLInputElement)} />
            </Field>

            <Field label="Password" icon={<Lock size={15} color="#8B87AD" />}
              right={
                <button type="button" onClick={() => setShowPw(v => !v)}
                  style={{ background:'none', border:'none', cursor:'pointer', padding:'0 4px', color:'#8B87AD' }}>
                  {showPw ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              }>
              <input type={showPw ? 'text' : 'password'} value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="••••••••"
                style={inputStyle}
                onFocus={e => focusIn(e.target as HTMLInputElement)}
                onBlur={e => focusOut(e.target as HTMLInputElement)} />
            </Field>

            {error && (
              <div style={{ padding:'10px 14px', background:'#fef2f2', border:'1px solid #fecaca', borderRadius:8, fontSize:12, color:'#dc2626' }}>
                {error}
              </div>
            )}

            <button type="submit" disabled={loading || googleLoading}
              style={{
                padding:'12px', borderRadius:9, border:'none',
                background: (loading || googleLoading) ? '#D8D2FF' : '#7C6FE0',
                color:'#fff', fontSize:14, fontWeight:600, cursor: (loading || googleLoading) ? 'default' : 'pointer',
                display:'flex', alignItems:'center', justifyContent:'center', gap:8, marginTop:4,
                transition:'background 0.15s',
              }}>
              {loading ? <><Loader2 size={16} style={{ animation:'spin 1s linear infinite' }} /> Signing in...</> : 'Sign in'}
            </button>
          </form>

          <div style={{ marginTop:24, padding:'14px 16px', background:'#F8F7FF', borderRadius:8, border:'1px solid #E8E4FF', fontSize:12, color:'#4B5275' }}>
            <strong>Demo:</strong> Enter any email + any password to get started instantly.
          </div>
        </div>
      </div>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  )
}

function Field({ label, icon, right, children }: { label:string; icon?:React.ReactNode; right?:React.ReactNode; children:React.ReactNode }) {
  return (
    <div>
      <label style={{ display:'block', fontSize:12, fontWeight:600, color:'#4B5275', marginBottom:6 }}>{label}</label>
      <div style={{ position:'relative', display:'flex', alignItems:'center' }}>
        {icon && <span style={{ position:'absolute', left:12, pointerEvents:'none' }}>{icon}</span>}
        <div style={{ flex:1 }}>{children}</div>
        {right && <span style={{ position:'absolute', right:10 }}>{right}</span>}
      </div>
    </div>
  )
}

const inputStyle: React.CSSProperties = {
  width:'100%', padding:'10px 12px 10px 36px',
  border:'1.5px solid #E8E4FF', borderRadius:8, fontSize:14,
  outline:'none', background:'#fff', boxSizing:'border-box', color:'#13111E',
}
const focusIn  = (el: HTMLInputElement) => { el.style.borderColor = '#7C6FE0'; el.style.boxShadow = '0 0 0 3px rgba(79,70,229,0.08)' }
const focusOut = (el: HTMLInputElement) => { el.style.borderColor = '#E8E4FF'; el.style.boxShadow = 'none' }
