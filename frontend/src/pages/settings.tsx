/**
 * Settings — organization profile + account. This is the permanent home for
 * editing the organization details first captured by the onboarding guide.
 */
import { useState, useMemo } from 'react'
import { PageHeader } from '@/components/layout/PageHeader'
import { useOrgProfile } from '@/store/orgProfile'
import { useAuthStore, openUserProfile } from '@/store/authStore'
import { meApi } from '@/api/client'
import { loadTerms, saveTerms, plural, TERM_SUGGESTIONS, type Terms, type TermKey } from '@/lib/terms'
import { useTimetableStore } from '@/store/timetableStore'
import { useWorkloadLimits } from '@/store/workloadLimits'
import { HolidayManager } from '@/components/HolidayManager'
import { WorkloadNormModal } from '@/components/master/WorkloadNormModal'
import { useCan } from '@/lib/permissions'
import {
  BAND_LABELS, normTeacherHoursWeek, normStudentHoursWeek, effectiveTeacherMaxPeriods,
  type GradeBand,
} from '@/lib/educationNorms'
import {
  countryHours, studentHoursWeekFor, teacherHoursWeekFor, shouldPromptCustom, countryOptions, detectCountry,
} from '@/lib/countryHours'

const KINDS = ['School', 'College', 'University', 'Coaching / Training Center', 'Company', 'Hospital', 'NGO', 'Government', 'Other']
const ACCENT = '#7C6FE0'

export function SettingsPage() {
  const { user, logout } = useAuthStore()
  const canManageHolidays = useCan('holiday.manage')
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

        {/* School holidays — admin-only (Blueprint v6): declaring one removes
            teaching time from every subject in the school. */}
        {canManageHolidays && (
          <HolidayManager onSaved={() => { setSaved(true); setTimeout(() => setSaved(false), 2000) }} />
        )}

        {/* Workload limits */}
        <WorkloadCard onSaved={() => { setSaved(true); setTimeout(() => setSaved(false), 2000) }} />

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

function WorkloadCard({ onSaved }: { onSaved: () => void }) {
  const config = useTimetableStore(s => s.config) as any
  const sections = useTimetableStore(s => (s as any).sections) ?? []
  const subjects = useTimetableStore(s => (s as any).subjects) ?? []
  const [workloadOpen, setWorkloadOpen] = useState(false)
  const board = config?.board
  const periodMinutes = config?.periodMinutes ?? 40
  const daysPerWeek = (config?.workDays?.length) || 6
  const {
    country: schoolCountryCode, teacherMaxHoursWeek, studentMaxHoursWeek,
    setCountry,
  } = useWorkloadLimits()

  // School-level choice wins; fall back to whatever the active schedule was set
  // up with, then a browser-detected guess, then India (the historical default).
  const detected = useMemo(() => detectCountry(), [])
  const country = schoolCountryCode || config?.countryCode || detected || 'IN'
  const autoDetected = !schoolCountryCode && !config?.countryCode && !!detected

  /** Picking a country also updates the active schedule, so generation, the
   *  bell-timing guidance and the Backward Sync report all follow immediately. */
  const pickCountry = (code: string) => {
    setCountry(code)
    useTimetableStore.getState().setConfig?.({ ...(config ?? {}), countryCode: code } as any)
  }


  // Blueprint v5 — country-wise allocation automation. The school's own country
  // seeds the defaults; where the published figure is net teaching time we use
  // it, and where it isn't (India publishes total working hours incl. prep) we
  // keep the teaching norm and nudge for a custom value instead.
  const ref = countryHours(country)
  const refTeacher = teacherHoursWeekFor(country, 'lowerPrimary')
  const nudge = shouldPromptCustom(country)
  const teacherDefault = refTeacher?.usable
    ? refTeacher.hours
    : normTeacherHoursWeek(country, periodMinutes)
  const teacherPeriods = effectiveTeacherMaxPeriods(country, periodMinutes, teacherMaxHoursWeek)
  const rowStyle: React.CSSProperties = { display: 'grid', gridTemplateColumns: '1fr 120px 140px', gap: 12, alignItems: 'center' }

  const nudgeText =
    nudge.reason === 'uncovered' ? `We don’t hold verified figures for this country, so the OECD average is shown. Enter your own values below.`
    : nudge.reason === 'basis'   ? `${ref?.name}'s published teacher figure (~${ref?.teacherHoursYear.primary} h/yr) is TOTAL working time including preparation, not classroom teaching — so it isn’t used as a teaching cap. Enter your own if your school sets one.`
    : nudge.reason === 'approximate' ? `These figures follow established OECD patterns for ${ref?.name} but weren’t individually re-verified — treat them as indicative and override if you know better.`
    : null

  return (
    <Card
      title="Workload limits"
      subtitle={`What the planner uses when it allocates. Anything you don’t set follows your country’s reference value. 1 period = ${periodMinutes} min · ${daysPerWeek}-day week.`}
    >
      {/* Country picker — captured once for the school (Blueprint v5) */}
      <Field label="Education system / country">
        <select value={country} onChange={e => pickCountry(e.target.value)} style={inputStyle}>
          {countryOptions().map(o => (
            <option key={o.code} value={o.code}>
              {o.name}{o.code === 'OECD' ? '' : ` — ${o.confidence === 'verified' ? 'Verified' : 'Approximate'}`}
            </option>
          ))}
        </select>
        <div style={{ fontSize: 11, color: '#9A95BC', marginTop: 4 }}>
          {autoDetected
            ? `Detected from your device’s timezone — confirm or change it. Nothing is sent anywhere to work this out.`
            : `Taken from your sign-up details. Change it here if your school follows a different system.`}
        </div>
      </Field>

      {/* Country reference — what this school's own system actually says */}
      {ref && (
        <div style={{
          background: nudge.prompt ? '#FFFBEB' : '#F0FDF4',
          border: `1px solid ${nudge.prompt ? '#FDE68A' : '#BBF7D0'}`,
          borderRadius: 10, padding: '10px 13px', fontSize: 11.5, color: '#4B5275',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: nudgeText ? 5 : 0 }}>
            <strong style={{ color: '#13111E', fontSize: 12.5 }}>{ref.name}</strong>
            <span style={{
              fontSize: 10, fontWeight: 800, borderRadius: 999, padding: '2px 8px', textTransform: 'uppercase',
              background: ref.confidence === 'verified' ? '#DCFCE7' : '#FEF3C7',
              color: ref.confidence === 'verified' ? '#067647' : '#92400E',
            }}>
              {ref.confidence}
            </span>
            <span>
              {ref.daysPerWeek}-day week · {ref.weeksPerYear} teaching weeks/yr · reference hours are term-time averages
            </span>
          </div>
          {nudgeText && <div style={{ color: '#92400E' }}>{nudgeText}</div>}
        </div>
      )}

      {/* ── Table 1 · National norm (read-only) ─────────────────── */}
      <div>
        <div style={{ fontSize: 12.5, fontWeight: 800, color: '#4B41C4', marginBottom: 6 }}>
          National norm — {ref?.name ?? country}
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: 12 }}>
            <thead>
              <tr style={{ background: '#F3F1FC' }}>
                <th style={{ ...th, textAlign: 'left' }}>Level</th>
                <th style={th}>Students h/wk</th>
                <th style={th}>Teachers h/wk</th>
                <th style={{ ...th, textAlign: 'left' }}>Basis</th>
              </tr>
            </thead>
            <tbody>
              {BAND_ORDER.map(band => {
                const s = studentHoursWeekFor(country, band)
                const t = teacherHoursWeekFor(country, band)
                const sHrs = s ? s.hours : normStudentHoursWeek(country, board, band, daysPerWeek)
                return (
                  <tr key={band}>
                    <td style={{ ...td, textAlign: 'left' }}>{BAND_LABELS[band]}</td>
                    <td style={td}>{sHrs}</td>
                    <td style={{ ...td, color: t?.usable ? '#13111E' : '#9A95BC' }}>
                      {t ? t.hours : '—'}
                    </td>
                    <td style={{ ...td, textAlign: 'left', fontSize: 11, color: '#8B87AD' }}>
                      {t?.usable ? 'Net teaching time' : 'Total incl. prep — not a teaching cap'}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        <p style={{ fontSize: 11, color: '#9A95BC', margin: '6px 0 0' }}>
          Term-time averages (annual hours ÷ {ref?.weeksPerYear ?? 38} teaching weeks). Source: {ref?.sourceNote ?? 'OECD Education at a Glance'}.
          {' '}These are the policy defaults — the planner uses them unless you set a custom norm below.
        </p>
      </div>

      <div style={{ height: 1, background: '#F0EDFB' }} />

      {/* ── Table 2 · What this school actually uses (READ-ONLY) ──
          Editing lives in ONE place: the workload modal, reached from here and
          from the Mapping step. Two editors for the same stored values meant two
          UIs that could drift apart in what they offered — this one only did
          stages and a global teacher cap, while the modal also does per-class
          and per-subject. Same data, one editor, several doors. */}
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, flexWrap: 'wrap' }}>
          <div style={{ fontSize: 12.5, fontWeight: 800, color: '#4B41C4' }}>In effect — your school</div>
          <span style={{ fontSize: 11, color: '#8B87AD' }}>A custom value always wins over the national figure.</span>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: 12 }}>
            <thead>
              <tr style={{ background: '#F3F1FC' }}>
                <th style={{ ...th, textAlign: 'left' }}>Level</th>
                <th style={th}>Students h/wk</th>
                <th style={{ ...th, textAlign: 'left' }}>Source</th>
              </tr>
            </thead>
            <tbody>
              {BAND_ORDER.map(band => {
                const s = studentHoursWeekFor(country, band)
                const def = s ? s.hours : normStudentHoursWeek(country, board, band, daysPerWeek)
                const custom = studentMaxHoursWeek[band]
                const isCustom = custom != null && custom > 0
                return (
                  <tr key={band}>
                    <td style={{ ...td, textAlign: 'left' }}>{BAND_LABELS[band]}</td>
                    <td style={{ ...td, fontWeight: isCustom ? 700 : 400, color: isCustom ? '#4B41C4' : '#13111E' }}>
                      {isCustom ? custom : def}
                    </td>
                    <td style={{ ...td, textAlign: 'left', color: isCustom ? '#4B41C4' : '#8B87AD' }}>
                      {isCustom ? 'Custom' : 'National'}
                    </td>
                  </tr>
                )
              })}
              <tr>
                <td style={{ ...td, textAlign: 'left', fontWeight: 700 }}>All teachers — teaching h/wk</td>
                <td style={{ ...td, fontWeight: teacherMaxHoursWeek != null ? 700 : 400, color: teacherMaxHoursWeek != null ? '#4B41C4' : '#13111E' }}>
                  {teacherMaxHoursWeek ?? teacherDefault}
                </td>
                <td style={{ ...td, textAlign: 'left', color: teacherMaxHoursWeek != null ? '#4B41C4' : '#8B87AD' }}>
                  {teacherMaxHoursWeek != null ? 'Custom' : 'National'} · ≈ {teacherPeriods} periods
                  {' '}({Math.round((teacherPeriods / daysPerWeek) * 10) / 10}/day)
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 10, justifyContent: 'flex-end' }}>
        <span style={{ fontSize: 11.5, color: '#9A95BC', marginRight: 'auto' }}>
          Applied to every schedule. Teacher hours convert to periods using your {periodMinutes}-min period length.
        </span>
        <button onClick={() => setWorkloadOpen(true)}
          style={{ padding: '9px 18px', borderRadius: 9, border: 'none', background: ACCENT, color: '#fff', fontWeight: 700, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' }}>
          Set custom loads
        </button>
      </div>

      {workloadOpen && (
        <WorkloadNormModal
          country={country}
          periodMinutes={periodMinutes}
          workDays={daysPerWeek}
          sections={sections}
          subjects={subjects.map((s: any) => ({ name: s.name }))}
          board={board}
          onClose={() => { setWorkloadOpen(false); onSaved() }}
        />
      )}
    </Card>
  )
}

const th: React.CSSProperties = { border: '1px solid #E3E0F0', padding: '6px 9px', textAlign: 'right', fontWeight: 700, color: '#4B5275' }
const td: React.CSSProperties = { border: '1px solid #F0EDFB', padding: '6px 9px', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }

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
