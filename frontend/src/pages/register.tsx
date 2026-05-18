import { useState } from 'react'
import { CalendarDays, Mail, Lock, User, School, Loader2 } from 'lucide-react'
import { useAuthStore } from '@/store/authStore'

// Google "G" logo SVG
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

// Fake Google accounts for demo simulation
const FAKE_GOOGLE_USERS = [
  { name: 'Priya Sharma', email: 'priya.sharma@gmail.com', school: 'Delhi Public School' },
  { name: 'Rajesh Kumar',  email: 'rajesh.kumar@gmail.com',  school: 'Kendriya Vidyalaya' },
  { name: 'Anita Verma',   email: 'anita.verma@gmail.com',   school: 'DAV Public School' },
]

export function RegisterPage() {
  const { register } = useAuthStore()
  const [name, setName]           = useState('')
  const [email, setEmail]         = useState('')
  const [school, setSchool]       = useState('')
  const [password, setPassword]   = useState('')
  const [loading, setLoading]     = useState(false)
  const [googleLoading, setGoogleLoading] = useState(false)
  const [error, setError]         = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name || !email || !password) { setError('All fields are required'); return }
    if (password.length < 6) { setError('Password must be at least 6 characters'); return }
    setError(''); setLoading(true)
    try {
      await register(name, email, password, school || undefined)
      window.location.href = '/wizard'
    } catch {
      setError('Registration failed. Please try again.')
    } finally { setLoading(false) }
  }

  const handleGoogle = async () => {
    setGoogleLoading(true)
    setError('')
    // Simulate Google OAuth popup delay
    await new Promise(r => setTimeout(r, 1200))
    try {
      const u = FAKE_GOOGLE_USERS[Math.floor(Math.random() * FAKE_GOOGLE_USERS.length)]
      await register(u.name, u.email, 'google-oauth-token', u.school)
      window.location.href = '/wizard'
    } catch {
      setError('Google sign-in failed. Please try again.')
      setGoogleLoading(false)
    }
  }

  return (
    <div style={{
      minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center',
      background:'linear-gradient(135deg,#F5F2FF 0%,#FAFAFE 100%)',
      padding:'24px',
    }}>
      <div style={{ width:'100%', maxWidth:440, background:'#fff', borderRadius:16, padding:'40px 40px', boxShadow:'0 4px 24px rgba(0,0,0,0.08)', border:'1px solid #E8E4FF' }}>

        {/* Logo */}
        <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:28 }}>
          <div style={{ width:32, height:32, borderRadius:9, background:'linear-gradient(135deg,#9B8EF5,#7C6FE0)', display:'flex', alignItems:'center', justifyContent:'center' }}>
            <CalendarDays size={16} color="#fff" />
          </div>
          <span style={{ fontFamily:"'DM Serif Display',Georgia,serif", fontSize:18, color:'#13111E' }}>
            Sche<span style={{ color:'#7C6FE0' }}>du</span>
          </span>
        </div>

        <h1 style={{ fontSize:22, fontWeight:700, color:'#13111E', marginBottom:4 }}>Create your account</h1>
        <p style={{ color:'#4B5275', fontSize:13, marginBottom:24 }}>
          Already have one?{' '}
          <a href="/login" style={{ color:'#7C6FE0', fontWeight:600, textDecoration:'none' }}>Sign in</a>
        </p>

        {/* ── Google button ── */}
        <button onClick={handleGoogle} disabled={googleLoading || loading}
          style={{
            width:'100%', padding:'11px 16px', borderRadius:8,
            border:'1.5px solid #E8E4FF', background: googleLoading ? '#f9fafb' : '#fff',
            display:'flex', alignItems:'center', justifyContent:'center', gap:10,
            fontSize:14, fontWeight:600, color:'#4B5275', cursor: googleLoading ? 'default' : 'pointer',
            boxShadow:'0 1px 3px rgba(0,0,0,0.07)', transition:'box-shadow 0.15s, border-color 0.15s',
            marginBottom:20,
          }}
          onMouseEnter={e => { if (!googleLoading) { (e.currentTarget as HTMLButtonElement).style.borderColor='#D8D2FF'; (e.currentTarget as HTMLButtonElement).style.boxShadow='0 2px 6px rgba(0,0,0,0.10)' } }}
          onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.borderColor='#E8E4FF'; (e.currentTarget as HTMLButtonElement).style.boxShadow='0 1px 3px rgba(0,0,0,0.07)' }}
        >
          {googleLoading
            ? <><Loader2 size={16} style={{ animation:'spin 1s linear infinite', color:'#4B5275' }} /> Connecting to Google...</>
            : <><GoogleIcon /> Continue with Google</>
          }
        </button>

        {/* ── OR divider ── */}
        <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:20 }}>
          <div style={{ flex:1, height:1, background:'#E8E4FF' }} />
          <span style={{ fontSize:11, fontWeight:600, color:'#8B87AD', letterSpacing:'0.06em', textTransform:'uppercase' }}>or</span>
          <div style={{ flex:1, height:1, background:'#E8E4FF' }} />
        </div>

        {/* ── Email/password form ── */}
        <form onSubmit={handleSubmit} style={{ display:'flex', flexDirection:'column', gap:14 }}>
          <Field label="Full Name" icon={<User size={14} color="#8B87AD" />}>
            <input value={name} onChange={e => setName(e.target.value)}
              placeholder="Priya Sharma" style={inp}
              onFocus={e => fi(e.target as HTMLInputElement)} onBlur={e => fo(e.target as HTMLInputElement)} />
          </Field>

          <Field label="School / Institution" icon={<School size={14} color="#8B87AD" />}>
            <input value={school} onChange={e => setSchool(e.target.value)}
              placeholder="Delhi Public School (optional)" style={inp}
              onFocus={e => fi(e.target as HTMLInputElement)} onBlur={e => fo(e.target as HTMLInputElement)} />
          </Field>

          <Field label="Email Address" icon={<Mail size={14} color="#8B87AD" />}>
            <input type="email" value={email} onChange={e => setEmail(e.target.value)}
              placeholder="you@school.edu" style={inp}
              onFocus={e => fi(e.target as HTMLInputElement)} onBlur={e => fo(e.target as HTMLInputElement)} />
          </Field>

          <Field label="Password" icon={<Lock size={14} color="#8B87AD" />}>
            <input type="password" value={password} onChange={e => setPassword(e.target.value)}
              placeholder="Min. 6 characters" style={inp}
              onFocus={e => fi(e.target as HTMLInputElement)} onBlur={e => fo(e.target as HTMLInputElement)} />
          </Field>

          {error && (
            <div style={{ padding:'9px 12px', background:'#fef2f2', border:'1px solid #fecaca', borderRadius:7, fontSize:12, color:'#dc2626' }}>
              {error}
            </div>
          )}

          <button type="submit" disabled={loading || googleLoading}
            style={{
              padding:'12px', borderRadius:8, border:'none', marginTop:4,
              background: (loading || googleLoading) ? '#D8D2FF' : '#7C6FE0', color:'#fff',
              fontSize:14, fontWeight:600, cursor: (loading || googleLoading) ? 'default' : 'pointer',
              display:'flex', alignItems:'center', justifyContent:'center', gap:8,
              transition:'background 0.15s',
            }}>
            {loading
              ? <><Loader2 size={15} style={{ animation:'spin 1s linear infinite' }} /> Creating account...</>
              : 'Create account & start setup'}
          </button>
        </form>

        <p style={{ marginTop:20, fontSize:11, color:'#8B87AD', textAlign:'center', lineHeight:1.6 }}>
          By signing up you agree to Schedu's terms. Your data stays on your device in demo mode.
        </p>
      </div>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  )
}

function Field({ label, icon, children }: { label:string; icon?:React.ReactNode; children:React.ReactNode }) {
  return (
    <div>
      <label style={{ display:'block', fontSize:12, fontWeight:600, color:'#4B5275', marginBottom:5 }}>{label}</label>
      <div style={{ position:'relative' }}>
        {icon && <span style={{ position:'absolute', left:11, top:'50%', transform:'translateY(-50%)', pointerEvents:'none' }}>{icon}</span>}
        {children}
      </div>
    </div>
  )
}

const inp: React.CSSProperties = {
  width:'100%', padding:'10px 12px 10px 34px', border:'1.5px solid #E8E4FF',
  borderRadius:7, fontSize:13, outline:'none', background:'#fff', boxSizing:'border-box', color:'#13111E',
}
const fi = (el: HTMLInputElement) => { el.style.borderColor='#7C6FE0'; el.style.boxShadow='0 0 0 3px rgba(124,111,224,0.08)' }
const fo = (el: HTMLInputElement) => { el.style.borderColor='#E8E4FF'; el.style.boxShadow='none' }
