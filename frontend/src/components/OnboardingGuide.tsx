/**
 * Organization setup guide. Shown on every page once the user is signed in:
 *  - Auto-opens while the org profile is incomplete (re-appears on each page
 *    until the user fills it in).
 *  - Once a name is entered it stays closed by default, but a floating launcher
 *    lets the user reopen/edit it on any page at any time.
 *  - Fully closable.
 *
 * Deliberately generic — no school/board assumptions. Specific labels show only
 * after the user types them.
 */
import { useState } from 'react'
import { useAuthStore } from '@/store/authStore'
import { useOrgProfile, isOrgProfileComplete } from '@/store/orgProfile'
import { meApi } from '@/api/client'

const KINDS = [
  'School', 'College', 'University', 'Coaching / Training Center',
  'Company', 'Hospital', 'NGO', 'Government', 'Other',
]

const ACCENT = '#7C6FE0'

export function OnboardingGuide() {
  const { user } = useAuthStore()
  const { name, kind, period, setProfile } = useOrgProfile()
  const complete = isOrgProfileComplete({ name })

  // Open by default while incomplete; closed once set up. Because in-app
  // navigation does full page loads, this re-evaluates on each page → the guide
  // keeps re-appearing until the profile is filled in.
  const [open, setOpen] = useState(!complete)

  // Local form state (seeded from the store).
  const [fName, setFName] = useState(name)
  const [fKind, setFKind] = useState(kind)
  const [fPeriod, setFPeriod] = useState(period)
  const [saving, setSaving] = useState(false)

  // Only for signed-in users.
  if (!user) return null

  const save = async () => {
    const trimmed = fName.trim()
    if (!trimmed) return
    setSaving(true)
    setProfile({ name: trimmed, kind: fKind, period: fPeriod.trim() })
    // Persist the name server-side too (best-effort) so it follows the user.
    try { await meApi.sync({ schoolName: trimmed }) } catch { /* offline ok */ }
    setSaving(false)
    setOpen(false)
  }

  // ── Collapsed launcher ──────────────────────────────────────────
  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        title={complete ? 'Edit organization profile' : 'Finish setting up your organization'}
        style={{
          position: 'fixed', right: 20, bottom: 20, zIndex: 9000,
          display: 'flex', alignItems: 'center', gap: 8,
          padding: '10px 16px', borderRadius: 999, cursor: 'pointer',
          background: complete ? '#fff' : ACCENT,
          color: complete ? '#13111E' : '#fff',
          border: complete ? '1px solid #E5E7EB' : 'none',
          boxShadow: '0 6px 20px rgba(124,111,224,0.25)',
          fontFamily: "'Plus Jakarta Sans', sans-serif", fontSize: 13, fontWeight: 700,
        }}
      >
        <span style={{ fontSize: 15 }}>{complete ? '🏛️' : '✨'}</span>
        {complete ? 'Organization' : 'Finish setup'}
      </button>
    )
  }

  // ── Open guide card ─────────────────────────────────────────────
  return (
    <div style={{
      position: 'fixed', right: 20, bottom: 20, zIndex: 9000,
      width: 360, maxWidth: 'calc(100vw - 40px)',
      background: '#fff', borderRadius: 16, overflow: 'hidden',
      boxShadow: '0 16px 48px rgba(19,17,30,0.22)', border: '1px solid #ECE9FB',
      fontFamily: "'Plus Jakarta Sans', sans-serif", color: '#13111E',
    }}>
      <div style={{ background: ACCENT, padding: '14px 16px', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <div>
          <div style={{ color: '#fff', fontSize: 15, fontWeight: 800 }}>
            {complete ? 'Your organization' : 'Welcome! Set up your organization'}
          </div>
          <div style={{ color: '#EDEAFB', fontSize: 12, marginTop: 2 }}>
            {complete ? 'Edit the details shown across your dashboard.' : 'A few details so we can tailor everything to you.'}
          </div>
        </div>
        <button onClick={() => setOpen(false)} aria-label="Close"
          style={{ background: 'rgba(255,255,255,0.18)', border: 'none', color: '#fff', borderRadius: 8, width: 26, height: 26, cursor: 'pointer', fontSize: 15, lineHeight: 1, flexShrink: 0 }}>×</button>
      </div>

      <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
        <Field label="Organization name">
          <input value={fName} onChange={(e) => setFName(e.target.value)} placeholder="e.g. Greenfield Academy"
            style={inputStyle} autoFocus />
        </Field>
        <Field label="Type">
          <select value={fKind} onChange={(e) => setFKind(e.target.value)} style={inputStyle}>
            <option value="">Select a type…</option>
            {KINDS.map(k => <option key={k} value={k}>{k}</option>)}
          </select>
        </Field>
        <Field label="Academic / planning period (optional)">
          <input value={fPeriod} onChange={(e) => setFPeriod(e.target.value)} placeholder="e.g. 2025–26"
            style={inputStyle} />
        </Field>

        <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
          <button onClick={save} disabled={!fName.trim() || saving}
            style={{
              flex: 1, padding: '10px 14px', borderRadius: 9, border: 'none', cursor: fName.trim() ? 'pointer' : 'not-allowed',
              background: fName.trim() ? ACCENT : '#C9C3EC', color: '#fff', fontWeight: 700, fontSize: 13, fontFamily: 'inherit',
            }}>
            {saving ? 'Saving…' : complete ? 'Save changes' : 'Save & continue'}
          </button>
          <button onClick={() => setOpen(false)}
            style={{ padding: '10px 14px', borderRadius: 9, border: '1px solid #E5E7EB', background: '#fff', color: '#6B7280', fontWeight: 600, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' }}>
            Later
          </button>
        </div>
      </div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: 'block' }}>
      <div style={{ fontSize: 12, fontWeight: 600, color: '#4B5275', marginBottom: 5 }}>{label}</div>
      {children}
    </label>
  )
}

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '9px 11px', borderRadius: 9, border: '1px solid #E5E7EB',
  fontSize: 13, fontFamily: 'inherit', color: '#13111E', outline: 'none', background: '#fff',
}
