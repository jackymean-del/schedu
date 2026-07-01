/**
 * SubstitutionSettingsModal — how Calendar ranks and auto-picks substitutes.
 * Opened from the Calendar page's gear icon. Four collapsible sections so the
 * default view stays light: Auto-Suggestions, Scoring Priorities, Default
 * Limits, and Faculty Settings (the long one — collapsed by default).
 */
import { useState } from 'react'
import {
  X, Settings2, SlidersHorizontal, Scale, Users, ChevronDown, ChevronUp, Minus, Plus, Check,
} from 'lucide-react'
import {
  type SubstitutionSettings, type WeightLevel, type ScoringWeights,
  WEIGHT_LEVELS, WEIGHT_LABEL, overrideFor,
} from '@/lib/substitutionSettings'

interface Props {
  settings: SubstitutionSettings
  staff: { id: string; name: string }[]
  onChange: (next: SubstitutionSettings) => void
  onClose: () => void
}

const WEIGHT_FIELDS: { key: keyof ScoringWeights; label: string; hint: string }[] = [
  { key: 'classFamiliarity',      label: 'Class Familiarity',      hint: 'Prefer faculty who teach this class (different subject)' },
  { key: 'subjectFamiliarity',    label: 'Subject Familiarity',    hint: 'Prefer faculty who teach this subject (different class)' },
  { key: 'dailyWorkloadBalance',  label: 'Daily Workload Balance', hint: 'Avoid overloading faculty on the same day' },
  { key: 'weeklyWorkloadBalance', label: 'Weekly Workload Balance',hint: 'Distribute workload evenly across the week' },
  { key: 'dailySubBalance',       label: 'Daily Substitute Balance',hint: 'Spread substitute duties across faculty each day' },
  { key: 'weeklySubBalance',      label: 'Weekly Substitute Balance',hint: 'Balance substitute assignments over the week' },
]

export function SubstitutionSettingsModal({ settings, staff, onChange, onClose }: Props) {
  const [open, setOpen] = useState({ auto: true, scoring: true, limits: true, faculty: false })
  const toggle = (k: keyof typeof open) => setOpen(o => ({ ...o, [k]: !o[k] }))

  const setWeight = (key: keyof ScoringWeights, level: WeightLevel) =>
    onChange({ ...settings, weights: { ...settings.weights, [key]: level } })

  const setDefault = <K extends keyof SubstitutionSettings['defaults']>(key: K, value: SubstitutionSettings['defaults'][K]) =>
    onChange({ ...settings, defaults: { ...settings.defaults, [key]: value } })

  const setFacultyOverride = (staffId: string, patch: Partial<SubstitutionSettings['facultyOverrides'][string]>) => {
    const current = overrideFor(settings, staffId)
    onChange({
      ...settings,
      facultyOverrides: { ...settings.facultyOverrides, [staffId]: { ...current, ...patch } },
    })
  }

  return (
    <div onClick={e => { if (e.target === e.currentTarget) onClose() }}
      style={{ position: 'fixed', inset: 0, zIndex: 1200, background: 'rgba(19,17,30,0.5)', display: 'flex', alignItems: 'stretch', justifyContent: 'flex-end' }}>
      <div style={{ width: 'min(760px, 96vw)', background: '#F7F6FC', display: 'flex', flexDirection: 'column', boxShadow: '-20px 0 60px rgba(0,0,0,0.25)' }}>

        {/* Header */}
        <div style={{ background: '#fff', borderBottom: '1px solid #ECE9FB', padding: '16px 22px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ width: 38, height: 38, borderRadius: 10, background: '#EDE9FF', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}><Settings2 size={18} color="#7C6FE0" /></span>
            <div>
              <div style={{ fontSize: 17, fontWeight: 800, color: '#13111E' }}>Substitution Settings</div>
              <div style={{ fontSize: 12.5, color: '#8B87AD' }}>Controls how Calendar ranks and auto-picks substitutes</div>
            </div>
          </div>
          <button onClick={onClose} style={{ width: 38, height: 38, borderRadius: 11, border: '1px solid #E7E3F6', background: '#fff', color: '#6B6890', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}><X size={17} /></button>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: 18, display: 'flex', flexDirection: 'column', gap: 14 }}>

          {/* ── Auto-Suggestions ── */}
          <Section title="Auto-Suggestions" icon={<SlidersHorizontal size={15} color="#7C6FE0" />} open={open.auto} onToggle={() => toggle('auto')}>
            <Row label="Enable Auto-Suggestions" hint="Show substitute suggestions based on scoring algorithm">
              <Switch checked={settings.defaults.autoSuggestionsEnabled} onChange={v => setDefault('autoSuggestionsEnabled', v)} />
            </Row>
            {settings.defaults.autoSuggestionsEnabled && (
              <div style={{ marginTop: 12 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: '#374151', marginBottom: 6 }}>Max Suggestions to Show</div>
                <input
                  type="number" min={1} placeholder="All available"
                  value={settings.defaults.maxSuggestionsToShow ?? ''}
                  onChange={e => setDefault('maxSuggestionsToShow', e.target.value === '' ? null : Math.max(1, Number(e.target.value)))}
                  style={inp}
                />
                <div style={{ fontSize: 11.5, color: '#9A95BC', marginTop: 5 }}>Leave empty to show all available substitutes</div>
              </div>
            )}
          </Section>

          {/* ── Scoring Priorities ── */}
          <Section title="Scoring Priorities" icon={<Scale size={15} color="#7C6FE0" />} open={open.scoring} onToggle={() => toggle('scoring')}>
            <div style={{ background: '#EFF6FF', border: '1px solid #DBEAFE', borderRadius: 10, padding: '10px 12px', fontSize: 12.5, color: '#1D4ED8', marginBottom: 14 }}>
              Set how much each factor matters when suggesting substitutes. Higher priority means that factor is weighted more heavily.
            </div>

            <WeightField label="Exact Match (Same Subject + Class)"
              hint="Strongest signal: faculty already teaching this exact subject to this exact class elsewhere in the schedule"
              value={settings.weights.exactMatch} onChange={v => setWeight('exactMatch', v)} />

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginTop: 14 }}>
              {WEIGHT_FIELDS.map(f => (
                <WeightField key={f.key} label={f.label} hint={f.hint}
                  value={settings.weights[f.key]} onChange={v => setWeight(f.key, v)} compact />
              ))}
            </div>
          </Section>

          {/* ── Default Limits ── */}
          <Section title="Default Limits" icon={<Scale size={15} color="#7C6FE0" />} open={open.limits} onToggle={() => toggle('limits')}>
            <div style={{ background: '#EFF6FF', border: '1px solid #DBEAFE', borderRadius: 10, padding: '10px 12px', fontSize: 12.5, color: '#1D4ED8', marginBottom: 14 }}>
              Applied to all faculty by default. Override per person in Faculty Settings below.
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 14 }}>
              <Stepper label="Max Periods/Day" hint="Total periods including substitutions"
                value={settings.defaults.maxPeriodsPerDay} onChange={v => setDefault('maxPeriodsPerDay', v)} />
              <Stepper label="Max Substitutes/Day" hint="Maximum substitute periods per day"
                value={settings.defaults.maxSubstitutesPerDay} onChange={v => setDefault('maxSubstitutesPerDay', v)} />
              <Stepper label="Max Substitutes/Week" hint="Maximum substitute periods per week"
                value={settings.defaults.maxSubstitutesPerWeek} onChange={v => setDefault('maxSubstitutesPerWeek', v)} />
            </div>
          </Section>

          {/* ── Faculty Settings ── */}
          <Section title="Faculty Settings" icon={<Users size={15} color="#7C6FE0" />} open={open.faculty} onToggle={() => toggle('faculty')}
            badge={`${staff.length} faculty`}>
            <div style={{ background: '#EFF6FF', border: '1px solid #DBEAFE', borderRadius: 10, padding: '10px 12px', fontSize: 12.5, color: '#1D4ED8', marginBottom: 12 }}>
              Configure which faculty can be assigned as substitutes and set individual limits. Blank cells use the defaults above.
            </div>
            <div style={{ border: '1px solid #ECE9FB', borderRadius: 10, overflow: 'hidden' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1.6fr 0.8fr 0.7fr 0.7fr 0.8fr', gap: 0, background: '#FAF9FF', padding: '8px 12px', fontSize: 10.5, fontWeight: 800, color: '#9A95BC', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                <div>Faculty</div><div style={{ textAlign: 'center' }}>Can Sub</div><div style={{ textAlign: 'center' }}>Max/Day</div><div style={{ textAlign: 'center' }}>Max/Week</div><div style={{ textAlign: 'center' }}>Auto-Assign</div>
              </div>
              {staff.map(st => {
                const ov = overrideFor(settings, st.id)
                return (
                  <div key={st.id} style={{ display: 'grid', gridTemplateColumns: '1.6fr 0.8fr 0.7fr 0.7fr 0.8fr', alignItems: 'center', padding: '8px 12px', borderTop: '1px solid #F2F0FB', fontSize: 12.5 }}>
                    <div style={{ fontWeight: 700, color: '#13111E', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{st.name}</div>
                    <div style={{ textAlign: 'center' }}>
                      <button onClick={() => setFacultyOverride(st.id, { canSub: !ov.canSub })}
                        title={ov.canSub ? 'Disable substitution for this faculty' : 'Enable substitution for this faculty'}
                        style={{
                          width: 24, height: 24, borderRadius: 7, border: 'none', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                          background: ov.canSub ? '#DCFCE7' : '#FEE2E2', color: ov.canSub ? '#16A34A' : '#DC2626',
                        }}>
                        {ov.canSub ? <Check size={13} /> : <X size={13} />}
                      </button>
                    </div>
                    <div>
                      <input type="number" min={0} value={ov.maxSubsPerDay ?? ''} placeholder={String(settings.defaults.maxSubstitutesPerDay)}
                        onChange={e => setFacultyOverride(st.id, { maxSubsPerDay: e.target.value === '' ? undefined : Math.max(0, Number(e.target.value)) })}
                        style={cellInp} />
                    </div>
                    <div>
                      <input type="number" min={0} value={ov.maxSubsPerWeek ?? ''} placeholder={String(settings.defaults.maxSubstitutesPerWeek)}
                        onChange={e => setFacultyOverride(st.id, { maxSubsPerWeek: e.target.value === '' ? undefined : Math.max(0, Number(e.target.value)) })}
                        style={cellInp} />
                    </div>
                    <div style={{ textAlign: 'center' }}>
                      <button onClick={() => setFacultyOverride(st.id, { autoAssign: !ov.autoAssign })}
                        disabled={!ov.canSub}
                        style={{
                          padding: '3px 10px', borderRadius: 6, border: 'none', cursor: ov.canSub ? 'pointer' : 'not-allowed',
                          fontSize: 10.5, fontWeight: 700, opacity: ov.canSub ? 1 : 0.4,
                          background: ov.autoAssign ? '#EDE9FF' : '#F1F1F4', color: ov.autoAssign ? '#7C6FE0' : '#9CA3AF',
                        }}>
                        {ov.autoAssign ? 'Auto' : 'Manual'}
                      </button>
                    </div>
                  </div>
                )
              })}
              {staff.length === 0 && (
                <div style={{ padding: '20px', textAlign: 'center', fontSize: 12.5, color: '#9A95BC' }}>No faculty configured yet.</div>
              )}
            </div>
          </Section>
        </div>
      </div>
    </div>
  )
}

// ── shared pieces ──────────────────────────────────────────────
function Section({ title, icon, open, onToggle, badge, children }: {
  title: string; icon: React.ReactNode; open: boolean; onToggle: () => void; badge?: string; children: React.ReactNode
}) {
  return (
    <div style={{ background: '#fff', border: '1px solid #ECE9FB', borderRadius: 14, overflow: 'hidden' }}>
      <button onClick={onToggle} style={{
        width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '14px 16px', border: 'none', background: 'transparent', cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
          {icon}
          <span style={{ fontSize: 14.5, fontWeight: 800, color: '#13111E' }}>{title}</span>
          {badge && <span style={{ fontSize: 11, fontWeight: 700, color: '#7C6FE0', background: '#EDE9FF', padding: '2px 9px', borderRadius: 20 }}>{badge}</span>}
        </div>
        {open ? <ChevronUp size={16} color="#9A95BC" /> : <ChevronDown size={16} color="#9A95BC" />}
      </button>
      {open && <div style={{ padding: '0 16px 16px' }}>{children}</div>}
    </div>
  )
}

function Row({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
      <div>
        <div style={{ fontSize: 13.5, fontWeight: 700, color: '#13111E' }}>{label}</div>
        {hint && <div style={{ fontSize: 11.5, color: '#9A95BC', marginTop: 2 }}>{hint}</div>}
      </div>
      {children}
    </div>
  )
}

function Switch({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button onClick={() => onChange(!checked)} style={{
      width: 42, height: 24, borderRadius: 12, border: 'none', cursor: 'pointer', flexShrink: 0,
      background: checked ? '#7C6FE0' : '#E5E1F4', position: 'relative', transition: 'background .15s',
    }}>
      <span style={{
        position: 'absolute', top: 3, left: checked ? 21 : 3, width: 18, height: 18, borderRadius: 9,
        background: '#fff', transition: 'left .15s', boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
      }} />
    </button>
  )
}

function WeightField({ label, hint, value, onChange, compact }: {
  label: string; hint: string; value: WeightLevel; onChange: (v: WeightLevel) => void; compact?: boolean
}) {
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <span style={{ fontSize: compact ? 12.5 : 13.5, fontWeight: 700, color: '#13111E' }}>{label}</span>
        <span style={{ fontSize: 10.5, fontWeight: 700, color: '#7C6FE0', background: '#EDE9FF', padding: '2px 8px', borderRadius: 20 }}>{WEIGHT_LABEL[value]}</span>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 6 }}>
        {WEIGHT_LEVELS.map(level => (
          <button key={level} onClick={() => onChange(level)}
            style={{
              padding: compact ? '6px 4px' : '8px 4px', borderRadius: 8, cursor: 'pointer', fontFamily: 'inherit',
              fontSize: compact ? 11 : 12, fontWeight: 700,
              border: value === level ? '1.5px solid #7C6FE0' : '1.5px solid #E5E1F4',
              background: value === level ? '#F5F3FF' : '#fff',
              color: value === level ? '#7C6FE0' : '#6B7280',
            }}>
            {WEIGHT_LABEL[level]}
          </button>
        ))}
      </div>
      <div style={{ fontSize: 11, color: '#9A95BC', marginTop: 5 }}>{hint}</div>
    </div>
  )
}

function Stepper({ label, hint, value, onChange }: {
  label: string; hint: string; value: number; onChange: (v: number) => void
}) {
  return (
    <div>
      <div style={{ fontSize: 13, fontWeight: 700, color: '#374151', marginBottom: 6 }}>{label}</div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <button onClick={() => onChange(Math.max(0, value - 1))} style={stepBtn}><Minus size={13} /></button>
        <input type="number" value={value} onChange={e => onChange(Math.max(0, Number(e.target.value) || 0))} style={{ ...inp, textAlign: 'center', width: 56, padding: '8px 4px' }} />
        <button onClick={() => onChange(value + 1)} style={stepBtn}><Plus size={13} /></button>
      </div>
      <div style={{ fontSize: 11, color: '#9A95BC', marginTop: 5 }}>{hint}</div>
    </div>
  )
}

const inp: React.CSSProperties = {
  width: '100%', padding: '9px 12px', border: '1.5px solid #E5E1F4', borderRadius: 9,
  fontSize: 13.5, fontFamily: 'inherit', color: '#13111E', background: '#fff', outline: 'none', boxSizing: 'border-box',
}
const cellInp: React.CSSProperties = {
  width: '100%', padding: '5px 8px', border: '1px solid #ECE9FB', borderRadius: 6,
  fontSize: 12.5, fontFamily: 'inherit', color: '#13111E', background: '#fff', outline: 'none', boxSizing: 'border-box', textAlign: 'center',
}
const stepBtn: React.CSSProperties = {
  width: 28, height: 28, borderRadius: 8, border: '1px solid #E5E1F4', background: '#fff',
  color: '#6B6890', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
}
