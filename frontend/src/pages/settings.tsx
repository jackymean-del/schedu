/**
 * Settings — organization profile + account. This is the permanent home for
 * editing the organization details first captured by the onboarding guide.
 */
import { useState } from 'react'
import { PageHeader } from '@/components/layout/PageHeader'
import { useOrgProfile } from '@/store/orgProfile'
import { useAuthStore, openUserProfile } from '@/store/authStore'
import { meApi } from '@/api/client'
import { loadTerms, saveTerms, plural, TERM_SUGGESTIONS, type Terms, type TermKey } from '@/lib/terms'
import { useTimetableStore } from '@/store/timetableStore'
import { useWorkloadLimits } from '@/store/workloadLimits'
import {
  BAND_LABELS, normTeacherHoursWeek, normStudentHoursWeek, effectiveTeacherMaxPeriods,
  type GradeBand,
} from '@/lib/educationNorms'

const KINDS = ['School', 'College', 'University', 'Coaching / Training Center', 'Company', 'Hospital', 'NGO', 'Government', 'Other']
const ACCENT = '#7C6FE0'

export function SettingsPage() {
  const { user, logout } = useAuthStore()
  const { name, kind, period, setProfile } = useOrgProfile()
  const [fName, setFName] = useState(name)
  const [fKind, setFKind] = useState(kind)
  const [fPeriod, setFPeriod] = useState(period)
  const [saved, setSaved] = useState(false)
  const dirty = fName !== name || fKind !== kind || fPeriod !== period

  const save = async () => {
    setProfile({ name: fName.trim(), kind: fKind, period: fPeriod.trim() })
    try { await meApi.sync({ schoolName: fName.trim() }) } catch { /* offline ok */ }
    setSaved(true); setTimeout(() => setSaved(false), 2000)
  }

  return (
    <div style={{ minHeight: '100vh', background: '#F5F2FF' }}>
      <PageHeader icon="⚙️" title="Settings" description="Manage your organization profile and account." status={saved ? 'saved' : null} statusLabel={saved ? 'Saved' : undefined} />

      <div style={{ maxWidth: 720, margin: '0 auto', padding: '24px 28px', display: 'flex', flexDirection: 'column', gap: 20 }}>
        {/* Organization */}
        <Card title="Organization" subtitle="Shown across your dashboard and printed documents.">
          <Field label="Organization name">
            <input value={fName} onChange={e => setFName(e.target.value)} placeholder="e.g. Greenfield Academy" style={inputStyle} />
          </Field>
          <Field label="Type">
            <select value={fKind} onChange={e => setFKind(e.target.value)} style={inputStyle}>
              <option value="">Select a type…</option>
              {KINDS.map(k => <option key={k} value={k}>{k}</option>)}
            </select>
          </Field>
          <Field label="Academic / planning period">
            <input value={fPeriod} onChange={e => setFPeriod(e.target.value)} placeholder="e.g. 2025–26" style={inputStyle} />
          </Field>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 4 }}>
            <button onClick={save} disabled={!dirty || !fName.trim()}
              style={{ padding: '9px 18px', borderRadius: 9, border: 'none', background: dirty && fName.trim() ? ACCENT : '#C9C3EC', color: '#fff', fontWeight: 700, fontSize: 13, cursor: dirty && fName.trim() ? 'pointer' : 'not-allowed', fontFamily: 'inherit' }}>
              Save changes
            </button>
          </div>
        </Card>

        {/* Institution naming */}
        <NamingCard onSaved={() => { setSaved(true); setTimeout(() => setSaved(false), 2000) }} />

        {/* Workload limits */}
        <WorkloadCard />

        {/* Account */}
        <Card title="Account" subtitle="Your personal sign-in and profile.">
          <Row label="Name" value={user?.name ?? '—'} />
          <Row label="Email" value={user?.email ?? '—'} />
          <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
            <button onClick={() => openUserProfile()} style={btnSecondary}>Edit profile & password</button>
            <button onClick={() => { logout(); window.location.href = '/login' }} style={{ ...btnSecondary, color: '#dc2626', borderColor: '#FCA5A5' }}>Sign out</button>
          </div>
        </Card>
      </div>
    </div>
  )
}

// ── Institution naming ─────────────────────────────────────────
// Every institution names things differently — Class vs Grade vs Batch,
// Teacher vs Faculty vs Trainer. Pick a suggestion or type your own word;
// labels update everywhere instantly, even on already-generated timetables
// (they're display words only — the underlying data never changes).
const TERM_ROWS: { key: TermKey; label: string; hint: string }[] = [
  { key: 'class',   label: 'A group of learners',   hint: 'Class · Grade · Section · Batch · Cohort…' },
  { key: 'teacher', label: 'A person who teaches',  hint: 'Teacher · Faculty · Instructor · Trainer…' },
  { key: 'subject', label: 'A thing being taught',  hint: 'Subject · Course · Module · Paper…' },
  { key: 'venue',   label: 'A place teaching happens', hint: 'Venue · Room · Hall · Lab · Studio…' },
  { key: 'period',  label: 'A block of teaching time', hint: 'Period · Session · Lecture · Slot…' },
]

function NamingCard({ onSaved }: { onSaved: () => void }) {
  const uid = useAuthStore.getState().user?.id ?? ''
  const [terms, setTerms] = useState<Terms>(() => loadTerms(uid))
  const [dirty, setDirty] = useState(false)

  const update = (key: TermKey, value: string) => {
    setTerms(t => ({ ...t, [key]: value }))
    setDirty(true)
  }
  const save = () => {
    const clean = { ...terms }
    ;(Object.keys(clean) as TermKey[]).forEach(k => { clean[k] = clean[k].trim() || TERM_SUGGESTIONS[k][0] })
    setTerms(clean)
    saveTerms(uid, clean)
    setDirty(false)
    onSaved()
  }

  return (
    <Card title="Institution naming" subtitle="Call things what your institution calls them — the words update across the whole app, even on generated timetables.">
      {TERM_ROWS.map(row => (
        <div key={row.key} style={{ display: 'grid', gridTemplateColumns: '1fr 180px 120px', gap: 12, alignItems: 'center' }}>
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#13111E' }}>{row.label}</div>
            <div style={{ fontSize: 11.5, color: '#9A95BC', marginTop: 1 }}>{row.hint}</div>
          </div>
          <div>
            <input
              value={terms[row.key]}
              onChange={e => update(row.key, e.target.value)}
              list={`terms-${row.key}`}
              placeholder={TERM_SUGGESTIONS[row.key][0]}
              style={inputStyle}
            />
            <datalist id={`terms-${row.key}`}>
              {TERM_SUGGESTIONS[row.key].map(s => <option key={s} value={s} />)}
            </datalist>
          </div>
          <div style={{ fontSize: 12, color: '#8B87AD' }}>
            plural: <strong style={{ color: '#4B5275' }}>{plural(terms[row.key] || TERM_SUGGESTIONS[row.key][0])}</strong>
          </div>
        </div>
      ))}
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 4 }}>
        <button onClick={save} disabled={!dirty}
          style={{ padding: '9px 18px', borderRadius: 9, border: 'none', background: dirty ? ACCENT : '#C9C3EC', color: '#fff', fontWeight: 700, fontSize: 13, cursor: dirty ? 'pointer' : 'not-allowed', fontFamily: 'inherit' }}>
          Save naming
        </button>
      </div>
    </Card>
  )
}

// ── Workload limits ─────────────────────────────────────────────
// Global override for the max weekly hours the planner schedules — for all
// teachers and for children per grade band. Blank = use the national norm.
const BAND_ORDER: GradeBand[] = ['prePrimary', 'lowerPrimary', 'upperPrimary', 'secondary', 'seniorSecondary']

function WorkloadCard() {
  const config = useTimetableStore(s => s.config) as any
  const country = config?.countryCode || 'IN'
  const board = config?.board
  const periodMinutes = config?.periodMinutes ?? 40
  const daysPerWeek = (config?.workDays?.length) || 6
  const {
    teacherMaxHoursWeek, studentMaxHoursWeek,
    setTeacherMaxHoursWeek, setStudentMaxHoursWeek,
  } = useWorkloadLimits()

  const teacherDefault = normTeacherHoursWeek(country, periodMinutes)
  const teacherPeriods = effectiveTeacherMaxPeriods(country, periodMinutes, teacherMaxHoursWeek)
  const rowStyle: React.CSSProperties = { display: 'grid', gridTemplateColumns: '1fr 120px 140px', gap: 12, alignItems: 'center' }

  return (
    <Card
      title="Workload limits"
      subtitle={`Cap the max weekly hours the planner schedules. Leave a field blank to use the national norm (${country}). 1 period = ${periodMinutes} min · ${daysPerWeek}-day week.`}
    >
      {/* Teachers */}
      <div style={rowStyle}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#13111E' }}>All teachers — max teaching hours / week</div>
          <div style={{ fontSize: 11.5, color: '#9A95BC', marginTop: 1 }}>Applies to every auto-generated teacher. Norm ≈ {teacherDefault} h/wk.</div>
        </div>
        <input
          type="number" min={1} step="0.5" value={teacherMaxHoursWeek ?? ''} placeholder={String(teacherDefault)}
          onChange={e => setTeacherMaxHoursWeek(e.target.value === '' ? undefined : Number(e.target.value))}
          style={inputStyle}
        />
        <div style={{ fontSize: 12, color: '#8B87AD' }}>≈ <strong style={{ color: '#4B5275' }}>{teacherPeriods}</strong> periods/wk</div>
      </div>

      <div style={{ height: 1, background: '#F0EDFB', margin: '2px 0' }} />

      {/* Children per band */}
      <div style={{ fontSize: 12.5, fontWeight: 700, color: '#4B41C4' }}>Children — max instructional hours / week, by grade</div>
      {BAND_ORDER.map(band => {
        const def = normStudentHoursWeek(country, board, band, daysPerWeek)
        return (
          <div key={band} style={rowStyle}>
            <div style={{ fontSize: 12.5, color: '#13111E' }}>{BAND_LABELS[band]}</div>
            <input
              type="number" min={1} step="0.5" value={studentMaxHoursWeek[band] ?? ''} placeholder={String(def)}
              onChange={e => setStudentMaxHoursWeek(band, e.target.value === '' ? undefined : Number(e.target.value))}
              style={inputStyle}
            />
            <div style={{ fontSize: 12, color: '#8B87AD' }}>norm ≈ {def} h/wk</div>
          </div>
        )
      })}

      <p style={{ fontSize: 11.5, color: '#9A95BC', margin: '4px 0 0' }}>
        Saved automatically and applied to every schedule. Teacher hours convert to periods with your period length; the generator keeps loads within this cap.
      </p>
    </Card>
  )
}

function Card({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <section style={{ background: '#fff', borderRadius: 14, border: '1px solid #ECE9FB', padding: 20 }}>
      <h2 style={{ fontSize: 15, fontWeight: 800, color: '#13111E', margin: 0 }}>{title}</h2>
      {subtitle && <p style={{ fontSize: 12.5, color: '#8B87AD', margin: '4px 0 16px' }}>{subtitle}</p>}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>{children}</div>
    </section>
  )
}
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label style={{ display: 'block' }}><div style={{ fontSize: 12, fontWeight: 600, color: '#4B5275', marginBottom: 5 }}>{label}</div>{children}</label>
}
function Row({ label, value }: { label: string; value: string }) {
  return <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13.5, padding: '6px 0', borderBottom: '1px solid #F3F1FB' }}><span style={{ color: '#8B87AD' }}>{label}</span><span style={{ color: '#13111E', fontWeight: 600 }}>{value}</span></div>
}
const inputStyle: React.CSSProperties = { width: '100%', padding: '9px 11px', borderRadius: 9, border: '1px solid #E5E7EB', fontSize: 13.5, fontFamily: 'inherit', color: '#13111E', outline: 'none', background: '#fff' }
const btnSecondary: React.CSSProperties = { padding: '9px 16px', borderRadius: 9, border: '1px solid #E5E7EB', background: '#fff', color: '#13111E', fontWeight: 600, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' }
