/**
 * Custom workload loads, set where they are being used.
 *
 * The Mapping sidebar used to say "Change in Settings →", which asked someone
 * mid-way through balancing a timetable to leave the page, find the right card
 * in Settings, change a number, and come back to see what it did. The figure is
 * the seed for the allocation on this very screen, so it should be editable on
 * this very screen.
 *
 * Two axes, same as everywhere else in the workload model (lib/facultyWorkload):
 * hours or periods, per week or per day. The national norm stays visible in its
 * own column so a custom value always reads as a departure from it rather than
 * a number from nowhere.
 *
 * Edits are held as a DRAFT and applied on Save — this changes what the engine
 * will produce for the whole school, which is not something to fire off on every
 * keystroke.
 */
import { useMemo, useState } from 'react'
import { X, RotateCcw, ShieldCheck } from 'lucide-react'
import type { Section } from '@/types'
import { bandForSection, BAND_LABELS, normTeacherHoursWeek, type GradeBand } from '@/lib/educationNorms'
import { studentHoursWeekFor, countryHours } from '@/lib/countryHours'
import { useWorkloadLimits } from '@/store/workloadLimits'
import {
  periodsFromHours, hoursFromPeriods, perDayFromPerWeek,
  type WorkloadUnit, type WorkloadSpan,
} from '@/lib/facultyWorkload'

const P = '#7C6FE0'

interface Row {
  key: string
  label: string
  /** The national reference, in hours per week. */
  norm: number
  /** The school's own figure, in hours per week — undefined when following the norm. */
  custom?: number
  band?: GradeBand
  isTeacher?: boolean
}

export function WorkloadNormModal({
  country, periodMinutes, workDays, sections, onClose,
}: {
  country: string
  periodMinutes: number
  workDays: number
  sections: Section[]
  onClose: () => void
}) {
  const { studentMaxHoursWeek, teacherMaxHoursWeek, setStudentMaxHoursWeek, setTeacherMaxHoursWeek } = useWorkloadLimits()
  const [unit, setUnit] = useState<WorkloadUnit>('hours')
  const [span, setSpan] = useState<WorkloadSpan>('week')
  /** key → what the admin has typed, in HOURS PER WEEK. '' means "clear it". */
  const [draft, setDraft] = useState<Record<string, string>>({})
  // Show the country by name — "IN national norms" reads like a bug.
  const countryName = countryHours(country)?.name ?? country

  // Only the bands this school actually runs — a primary school has no business
  // being shown senior-secondary norms it will never use.
  const rows: Row[] = useMemo(() => {
    const bands = [...new Set(sections.map(s => bandForSection(s.name)))]
    const out: Row[] = bands.map(band => ({
      key: band,
      label: BAND_LABELS[band] ?? band,
      norm: studentHoursWeekFor(country, band as any)?.hours ?? 0,
      custom: studentMaxHoursWeek?.[band],
      band,
    }))
    out.push({
      key: 'faculty',
      label: 'Faculty (teaching load)',
      // The SAFE TEACHING norm, not the published total — that is the figure
      // the allocation engine actually falls back to.
      norm: normTeacherHoursWeek(country, periodMinutes),
      custom: teacherMaxHoursWeek,
      isTeacher: true,
    })
    return out
  }, [sections, country, periodMinutes, studentMaxHoursWeek, teacherMaxHoursWeek])

  /** Hours/week → whatever the admin is currently looking at. */
  const show = (hoursWeek: number): string => {
    if (!(hoursWeek > 0)) return '—'
    const periodsWeek = periodsFromHours(hoursWeek, periodMinutes)
    if (span === 'week') return unit === 'hours' ? `${hoursWeek} h` : `${periodsWeek}p`
    const periodsDay = perDayFromPerWeek(periodsWeek, workDays)
    return unit === 'hours' ? `${hoursFromPeriods(periodsDay, periodMinutes)} h` : `${periodsDay}p`
  }

  /**
   * What the admin typed, back into hours per week for storage.
   *
   * Storage is hours/week, so an hours entry is kept VERBATIM — converting it
   * to periods and back would floor it (15 h at 40 min → 22p → 14.7 h) and hand
   * back a number nobody typed. Only a periods entry needs converting, and that
   * direction is exact.
   */
  const toHoursWeek = (raw: string): number | undefined => {
    const v = parseFloat(raw)
    if (isNaN(v) || v <= 0) return undefined
    if (unit === 'hours') return span === 'day' ? Math.round(v * workDays * 10) / 10 : v
    const weekPeriods = span === 'day' ? v * workDays : v
    return hoursFromPeriods(weekPeriods, periodMinutes)
  }

  const currentValue = (r: Row): string => {
    if (draft[r.key] !== undefined) return draft[r.key]
    if (r.custom == null || !(r.custom > 0)) return ''
    const periodsWeek = periodsFromHours(r.custom, periodMinutes)
    if (span === 'week') return String(unit === 'hours' ? r.custom : periodsWeek)
    const periodsDay = perDayFromPerWeek(periodsWeek, workDays)
    return String(unit === 'hours' ? hoursFromPeriods(periodsDay, periodMinutes) : periodsDay)
  }

  const save = () => {
    for (const r of rows) {
      const typed = draft[r.key]
      if (typed === undefined) continue          // untouched
      const hours = toHoursWeek(typed)
      if (r.isTeacher) setTeacherMaxHoursWeek(hours)
      else if (r.band) setStudentMaxHoursWeek(r.band, hours)
    }
    onClose()
  }

  const dirty = Object.keys(draft).length > 0

  return (
    <div
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
      style={{
        position: 'fixed', inset: 0, zIndex: 1200, background: 'rgba(19,17,30,0.5)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
      }}
    >
      <div style={{ width: '100%', maxWidth: 640, background: '#fff', borderRadius: 16, overflow: 'hidden', boxShadow: '0 24px 70px rgba(0,0,0,0.28)' }}>
        {/* Header */}
        <div style={{ background: 'linear-gradient(135deg,#7C6FE0,#5D4FCF)', padding: '16px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ color: '#fff' }}>
            <div style={{ fontSize: 16, fontWeight: 800, display: 'flex', alignItems: 'center', gap: 7 }}>
              <ShieldCheck size={16} /> Custom workload
            </div>
            <div style={{ fontSize: 12, opacity: 0.85 }}>
              {countryName} · applies across the school and re-seeds the allocation
            </div>
          </div>
          <button onClick={onClose} style={{ border: 'none', background: 'rgba(255,255,255,0.18)', color: '#fff', width: 30, height: 30, borderRadius: 8, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <X size={16} />
          </button>
        </div>

        <div style={{ padding: 18 }}>
          {/* Unit + span switches — the same four ways of stating a load the
              per-teacher caps accept, so nobody converts by hand. */}
          <div style={{ display: 'flex', gap: 14, marginBottom: 13, flexWrap: 'wrap', alignItems: 'center' }}>
            <Switch<WorkloadUnit> label="Unit" value={unit} onChange={setUnit}
              options={[['hours', 'Hours'], ['periods', 'Periods']]} />
            <Switch<WorkloadSpan> label="Per" value={span} onChange={setSpan}
              options={[['week', 'Week'], ['day', 'Day']]} />
            <div style={{ flex: 1 }} />
            <span style={{ fontSize: 10.5, color: '#9A95BC' }}>
              1 period = {periodMinutes} min · {workDays}-day week
            </span>
          </div>

          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
            <thead>
              <tr style={{ background: '#F8F7FF' }}>
                <th style={th}>Applies to</th>
                <th style={{ ...th, textAlign: 'right' }}>National norm</th>
                <th style={{ ...th, textAlign: 'right', width: 130 }}>Custom</th>
                <th style={{ ...th, width: 34 }} />
              </tr>
            </thead>
            <tbody>
              {rows.map(r => {
                const value = currentValue(r)
                const isCustom = value !== ''
                return (
                  <tr key={r.key} style={{ borderTop: '1px solid #F1EFFA' }}>
                    <td style={{ ...td, fontWeight: 600, color: '#13111E' }}>{r.label}</td>
                    <td style={{ ...td, textAlign: 'right', fontFamily: "'DM Mono', monospace", color: '#8B87AD' }}>
                      {show(r.norm)}
                    </td>
                    <td style={{ ...td, textAlign: 'right' }}>
                      <input
                        type="number" min={0} step="any"
                        value={value}
                        placeholder={show(r.norm).replace(/[ hp]/g, '')}
                        onChange={e => setDraft(d => ({ ...d, [r.key]: e.target.value }))}
                        style={{
                          width: 96, padding: '5px 8px', borderRadius: 7,
                          border: `1.5px solid ${isCustom ? '#C4BDFF' : '#E8E4FF'}`,
                          background: isCustom ? '#F7F5FF' : '#fff',
                          fontSize: 12.5, fontWeight: 700, color: '#4B41C4',
                          textAlign: 'right', outline: 'none', fontFamily: "'DM Mono', monospace",
                          boxSizing: 'border-box',
                        }}
                      />
                    </td>
                    <td style={{ ...td, textAlign: 'center' }}>
                      {isCustom && (
                        <button
                          onClick={() => setDraft(d => ({ ...d, [r.key]: '' }))}
                          title="Follow the national norm again"
                          style={{ all: 'unset', cursor: 'pointer', color: '#9A95BC', display: 'inline-flex' }}>
                          <RotateCcw size={12} />
                        </button>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>

          <p style={{ fontSize: 11.5, color: '#8B87AD', margin: '12px 0 0', lineHeight: 1.5 }}>
            Leave a field blank to follow the national norm. A custom value takes precedence for every
            allocation and load-balancing run until you change it again — including the period counts
            derived on this page.
          </p>
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, padding: '13px 20px', borderTop: '1px solid #F1EFFA' }}>
          <button onClick={onClose}
            style={{ padding: '9px 18px', borderRadius: 9, border: '1.5px solid #E0DBF2', background: '#fff', fontSize: 13, fontWeight: 700, color: '#4B5275', cursor: 'pointer', fontFamily: 'inherit' }}>
            Cancel
          </button>
          <button onClick={save} disabled={!dirty}
            style={{
              padding: '9px 22px', borderRadius: 9, border: 'none', fontSize: 13, fontWeight: 800,
              cursor: dirty ? 'pointer' : 'not-allowed', fontFamily: 'inherit', color: '#fff',
              background: dirty ? 'linear-gradient(135deg,#7C6FE0,#5D4FCF)' : '#D8D3EC',
            }}>
            Save workload
          </button>
        </div>
      </div>
    </div>
  )
}

function Switch<T extends string>({ label, value, onChange, options }: {
  label: string
  value: T
  onChange: (v: T) => void
  options: Array<[T, string]>
}) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
      <span style={{ fontSize: 11, fontWeight: 700, color: '#8B87AD' }}>{label}</span>
      <span style={{ display: 'inline-flex', border: '1px solid #E0DBF2', borderRadius: 7, overflow: 'hidden' }}>
        {options.map(([v, text]) => (
          <button key={v} onClick={() => onChange(v)}
            style={{
              all: 'unset', cursor: 'pointer', padding: '3px 11px',
              fontSize: 11, fontWeight: 700,
              background: value === v ? P : '#fff',
              color: value === v ? '#fff' : '#8B87AD',
            }}>
            {text}
          </button>
        ))}
      </span>
    </span>
  )
}

const th: React.CSSProperties = {
  padding: '7px 10px', fontSize: 10, fontWeight: 800, color: '#8B87AD',
  textTransform: 'uppercase', letterSpacing: '0.06em', textAlign: 'left',
}
const td: React.CSSProperties = { padding: '8px 10px' }
