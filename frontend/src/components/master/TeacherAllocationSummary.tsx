/**
 * TeacherAllocationSummary — Clean teacher overview with Assignments column.
 *
 * Columns: Teacher (name, type chip) | Weekly Load (bar) | Assignments (subject → classes)
 *
 * Simple enough for naive users. Each assignment row shows:
 *   SubjectName  →  Class-1-A, Class-1-B  (6p)
 *
 * Sortable by name, load, or assignment count. Overload warning banner.
 */

import { useMemo, useState } from 'react'
import { useTimetableStore } from '@/store/timetableStore'
import type { Staff } from '@/types'
import { AlertTriangle, BarChart3, ChevronUp, ChevronDown, ExternalLink, Sparkles, ArrowUpDown, RotateCcw } from 'lucide-react'
import { TeacherAllocationModal } from './TeacherAllocationModal'
import { effectiveTeacherMaxPeriods } from '@/lib/educationNorms'
import { teacherHoursWeekFor } from '@/lib/countryHours'
import { useWorkloadLimits, schoolCountry } from '@/store/workloadLimits'

interface SummaryProps {
  displayMode?: 'periods' | 'hours'
  periodMinutes?: number
  toolbarExtra?: React.ReactNode
}

// ── helpers ──────────────────────────────────────────────────

function weeklyLoad(
  name: string,
  allocations: Record<string, Record<string, Record<string, number>>>,
): number {
  const tMap = allocations[name] ?? {}
  let total = 0
  Object.values(tMap).forEach((sMap: any) =>
    Object.values(sMap ?? {}).forEach((p: any) => { if (typeof p === 'number') total += p })
  )
  return total
}

/** Returns subject → { sections: string[], totalPeriods: number } */
function assignmentsForTeacher(
  name: string,
  allocations: Record<string, Record<string, Record<string, number>>>,
): Array<{ subject: string; sections: string[]; totalPeriods: number }> {
  const tMap = allocations[name] ?? {}
  const subMap: Record<string, { sections: string[]; total: number }> = {}
  Object.entries(tMap).forEach(([sec, sMap]: [string, any]) => {
    Object.entries(sMap ?? {}).forEach(([sub, p]: [string, any]) => {
      if (typeof p === 'number' && p > 0) {
        if (!subMap[sub]) subMap[sub] = { sections: [], total: 0 }
        subMap[sub].sections.push(sec)
        subMap[sub].total += p
      }
    })
  })
  return Object.entries(subMap)
    .map(([subject, { sections, total }]) => ({ subject, sections, totalPeriods: total }))
    .sort((a, b) => b.totalPeriods - a.totalPeriods)
}

type TeacherType = 'Class Teacher' | 'Specialist' | 'Activity'

function inferType(t: Staff, assignmentCount: number): TeacherType {
  const role = (t as any).role?.toLowerCase() ?? ''
  if (role.includes('activity') || role.includes('sport') || role.includes('art') || role.includes('music')) return 'Activity'
  if (assignmentCount <= 1) return 'Class Teacher'
  return 'Specialist'
}

const TYPE_STYLE: Record<TeacherType, { bg: string; fg: string; border: string }> = {
  'Specialist':    { bg: '#EDE9FF', fg: '#7C6FE0', border: '#C4B5FD' },
  'Class Teacher': { bg: '#DCFCE7', fg: '#15803D', border: '#BBF7D0' },
  'Activity':      { bg: '#FEF3C7', fg: '#92400E', border: '#FDE68A' },
}

function statusBadge(load: number, max: number): { label: string; bg: string; fg: string; border: string } {
  if (max <= 0) return { label: 'Unset', bg: '#F8F7FF', fg: '#B8B4D4', border: '#E8E4FF' }
  const ratio = load / max
  if (ratio > 1.05) return { label: 'Overloaded', bg: '#FEE2E2', fg: '#991B1B', border: '#FECACA' }
  if (ratio > 0.4)  return { label: 'Balanced',   bg: '#DCFCE7', fg: '#15803D', border: '#BBF7D0' }
  if (load === 0)   return { label: 'Unassigned',  bg: '#F8F7FF', fg: '#B8B4D4', border: '#E8E4FF' }
  return { label: 'Light', bg: '#EFF6FF', fg: '#1D4ED8', border: '#DBEAFE' }
}

function toHourMin(periods: number, periodMinutes: number): string {
  const totalMins = Math.round(periods * periodMinutes)
  const h = Math.floor(totalMins / 60)
  const m = totalMins % 60
  if (h === 0) return `${m}m`
  if (m === 0) return `${h}h`
  return `${h}h${m}m`
}

type SortField = 'name' | 'load' | 'subjects' | 'status'

// ── component ─────────────────────────────────────────────────

export function TeacherAllocationSummary({ displayMode = 'periods', periodMinutes = 40, toolbarExtra }: SummaryProps) {
  const store = useTimetableStore() as any
  const { staff, teacherAllocations, setStaff, config } = store
  const [editTarget, setEditTarget] = useState<{ teacher: string; subject: string } | null>(null)
  const [filter, setFilter] = useState<TeacherType | 'All'>('All')
  const [sortField, setSortField] = useState<SortField>('name')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')

  const toggleSort = (field: SortField) => {
    if (sortField === field) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortField(field); setSortDir('asc') }
  }

  // The Step 0 workload norm — country default or the admin's custom override —
  // is the DEFAULT cap for a teacher with no per-person figure set. Blueprint v6:
  // this is the only place the cap is edited; Resources shows it read-only.
  const country = schoolCountry(config?.countryCode)
  const teacherMaxHoursWeek = useWorkloadLimits(s => s.teacherMaxHoursWeek)
  const normMax = effectiveTeacherMaxPeriods(country, periodMinutes, teacherMaxHoursWeek)

  const updateMax = (name: string, next: number | undefined) => {
    setStaff?.(staff.map((t: Staff) => t.name === name ? { ...t, maxPeriodsPerWeek: next as any } : t))
  }

  // Per-teacher stats
  const rows = useMemo(() => staff.map((t: Staff) => {
    const load = weeklyLoad(t.name, teacherAllocations)
    const explicit = (t as any).maxPeriodsPerWeek
    const max = explicit && explicit > 0 ? explicit : normMax
    const assignments = assignmentsForTeacher(t.name, teacherAllocations)
    const type = inferType(t, assignments.length)
    const status = statusBadge(load, max)
    // `overridden` drives the "custom" chip and the reset affordance — a school
    // must be able to see at a glance which caps are its own and which are the
    // national norm, and get back to the norm without remembering the number.
    return { t, load, max, assignments, type, status, overridden: !!(explicit && explicit > 0) }
  }), [staff, teacherAllocations, normMax])

  // Overloaded
  const overloaded = rows.filter((r: any) => r.load > r.max && r.max > 0)

  // Filter + sort
  const visible = useMemo(() => {
    let out = filter === 'All' ? rows : rows.filter((r: any) => r.type === filter)
    out = [...out].sort((a: any, b: any) => {
      let cmp = 0
      if (sortField === 'name') cmp = a.t.name.localeCompare(b.t.name)
      else if (sortField === 'load') cmp = a.load - b.load
      else if (sortField === 'subjects') cmp = a.assignments.length - b.assignments.length
      else if (sortField === 'status') cmp = a.status.label.localeCompare(b.status.label)
      return sortDir === 'asc' ? cmp : -cmp
    })
    return out
  }, [rows, filter, sortField, sortDir])

  const fmtLoad = (p: number) => displayMode === 'hours' ? toHourMin(p, periodMinutes) : `${p}p`

  const SortIcon = ({ field }: { field: SortField }) =>
    sortField === field
      ? (sortDir === 'asc' ? <ChevronUp size={11} style={{ flexShrink: 0 }} /> : <ChevronDown size={11} style={{ flexShrink: 0 }} />)
      : <ArrowUpDown size={10} style={{ flexShrink: 0, opacity: 0.3 }} />

  return (
    <div>
      {/* ── Toolbar row ── */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' as const, alignItems: 'center' }}>
        {toolbarExtra}
        {/* Type filter chips */}
        {(['All', 'Class Teacher', 'Specialist', 'Activity'] as const).map(f => (
          <button key={f} onClick={() => setFilter(f)}
            style={{
              padding: '4px 11px', borderRadius: 20, border: 'none', cursor: 'pointer',
              fontSize: 11, fontWeight: 700, fontFamily: 'inherit',
              background: filter === f ? '#7C6FE0' : '#F0EDFF',
              color: filter === f ? '#fff' : '#4B5275',
            }}>
            {f}
          </button>
        ))}
        <div style={{ flex: 1 }} />
        <span style={{ fontSize: 10, color: '#8B87AD' }}>
          {rows.filter((r: any) => r.load > 0).length} active · {overloaded.length > 0
            ? <span style={{ color: '#DC2626', fontWeight: 700 }}>{overloaded.length} overloaded</span>
            : <span style={{ color: '#16A34A', fontWeight: 700 }}>No overloads</span>}
        </span>
      </div>

      {/* ── The DEFAULT norms, stated separately from the editable caps above ──
          Blueprint v6 Step 5: the globally-set workload "is shown for both
          faculty and students". Showing where the default comes from is what
          makes the per-teacher override meaningful rather than a mystery number. */}
      <NormDefaultsBar
        country={country}
        periodMinutes={periodMinutes}
        normMax={normMax}
        teacherCustom={teacherMaxHoursWeek}
        overriddenCount={rows.filter((r: any) => r.overridden).length}
      />

      {/* ── AI overload warning ── */}
      {overloaded.length > 0 && (
        <div style={{
          display: 'flex', alignItems: 'flex-start', gap: 10,
          padding: '10px 14px', marginBottom: 14,
          background: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: 10,
          borderLeft: '4px solid #F59E0B',
        }}>
          <AlertTriangle size={16} color="#D97706" style={{ flexShrink: 0, marginTop: 1 }} />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: '#92400E', marginBottom: 3 }}>
              ✦ {overloaded.length} overloaded teacher{overloaded.length > 1 ? 's' : ''} detected
            </div>
            {overloaded.map((r: any) => (
              <div key={r.t.name} style={{ fontSize: 11, color: '#78350F', marginBottom: 2 }}>
                <strong>{r.t.name}</strong> — {r.load}p assigned vs {r.max}p max.{' '}
                <span style={{ color: '#D97706' }}>
                  Consider splitting {r.assignments[0]?.subject} with another teacher.
                </span>
              </div>
            ))}
          </div>
          <button
            onClick={() => overloaded[0]?.assignments[0] && setEditTarget({ teacher: overloaded[0].t.name, subject: overloaded[0].assignments[0].subject })}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 4,
              padding: '4px 10px', borderRadius: 6, border: '1px solid #FDE68A',
              background: '#FEF3C7', color: '#92400E', fontSize: 10, fontWeight: 700,
              cursor: 'pointer', fontFamily: 'inherit', flexShrink: 0,
            }}>
            Fix <ExternalLink size={10} />
          </button>
        </div>
      )}

      {/* ── Table ── */}
      <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #E8E4FF', overflow: 'hidden' }}>
        {/* Header */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: '220px 170px 1fr',
          padding: '8px 16px', gap: 12,
          background: '#F8F7FF', borderBottom: '2px solid #E8E4FF',
          fontSize: 10, fontWeight: 800, color: '#8B87AD',
          letterSpacing: '0.1em', textTransform: 'uppercase' as const,
        }}>
          <button onClick={() => toggleSort('name')} style={{ all: 'unset', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, fontSize: 'inherit', fontWeight: 'inherit', color: sortField === 'name' ? '#7C6FE0' : 'inherit' }}>
            Teacher <SortIcon field="name" />
          </button>
          <button onClick={() => toggleSort('load')} style={{ all: 'unset', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, fontSize: 'inherit', fontWeight: 'inherit', color: sortField === 'load' ? '#7C6FE0' : 'inherit' }}>
            Weekly Load <SortIcon field="load" />
          </button>
          <button onClick={() => toggleSort('subjects')} style={{ all: 'unset', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, fontSize: 'inherit', fontWeight: 'inherit', color: sortField === 'subjects' ? '#7C6FE0' : 'inherit' }}>
            Assignments <SortIcon field="subjects" />
          </button>
        </div>

        {/* Rows */}
        {visible.length === 0 ? (
          <div style={{ padding: '32px 16px', textAlign: 'center' as const, color: '#B8B4D4', fontSize: 13 }}>
            {staff.length === 0 ? 'No teachers added yet. Add teachers in Step 1 → Resources.' : 'No teachers match filter.'}
          </div>
        ) : visible.map((row: any, i: number) => (
          <TeacherRow
            key={row.t.id ?? row.t.name}
            row={row}
            borderTop={i > 0}
            displayMode={displayMode}
            periodMinutes={periodMinutes}
            fmtLoad={fmtLoad}
            normMax={normMax}
            onUpdateMax={next => updateMax(row.t.name, next)}
            onEditSubject={(sub) => setEditTarget({ teacher: row.t.name, subject: sub })}
          />
        ))}
      </div>

      {/* Stats footer */}
      {rows.length > 0 && (
        <div style={{
          display: 'flex', gap: 16, marginTop: 10, padding: '8px 14px',
          background: '#F8F7FF', borderRadius: 8, border: '1px solid #E8E4FF',
          fontSize: 10, color: '#4B5275', alignItems: 'center',
        }}>
          <BarChart3 size={12} color="#7C6FE0" />
          <span>
            {rows.filter((r: any) => r.load > 0).length} active teachers ·{' '}
            Avg {rows.length > 0 ? (displayMode === 'hours'
              ? toHourMin(Math.round(rows.reduce((a: number, r: any) => a + r.load, 0) / rows.length), periodMinutes)
              : `${Math.round(rows.reduce((a: number, r: any) => a + r.load, 0) / rows.length)}p`
            ) : 0}/teacher ·{' '}
            {overloaded.length > 0 ? <span style={{ color: '#DC2626', fontWeight: 700 }}>{overloaded.length} overloaded</span> : <span style={{ color: '#16A34A', fontWeight: 700 }}>No overloads ✓</span>}
          </span>
        </div>
      )}

      {/* Edit modal */}
      {editTarget && editTarget.subject && (
        <TeacherAllocationModal
          teacher={editTarget.teacher}
          subject={editTarget.subject}
          onClose={() => setEditTarget(null)}
        />
      )}
    </div>
  )
}

// ── Default norms bar ─────────────────────────────────────────
//
// Deliberately a separate strip rather than a tooltip on each row: "what does
// this school consider a full teaching week, and where did that number come
// from?" is one question with one answer, and repeating it 22 times would bury
// it. It also names the SOURCE — country reference vs the admin's own figure —
// because an unverified default that looks authoritative is worse than one
// that admits what it is.

function NormDefaultsBar({
  country, periodMinutes, normMax, teacherCustom, overriddenCount,
}: {
  country: string
  periodMinutes: number
  normMax: number
  teacherCustom?: number
  overriddenCount: number
}) {
  const ref = teacherHoursWeekFor(country, 'lowerPrimary' as any)
  const custom = !!(teacherCustom && teacherCustom > 0)
  const hours = custom ? teacherCustom! : (ref?.usable ? ref.hours : undefined)

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' as const,
      padding: '8px 14px', marginBottom: 12,
      background: '#F8F7FF', border: '1px solid #E8E4FF', borderRadius: 10,
      fontSize: 11, color: '#4B5275',
    }}>
      <span style={{ fontWeight: 800, color: '#13111E' }}>Default faculty workload</span>
      <span style={{ fontFamily: "'DM Mono', monospace", fontWeight: 800, color: '#4B41C4' }}>
        {normMax}p / week
      </span>
      {hours != null && (
        <span style={{ color: '#8B87AD' }}>≈ {hours} h at {periodMinutes} min</span>
      )}
      <span style={{
        fontSize: 9.5, fontWeight: 700, borderRadius: 4, padding: '1px 6px',
        background: custom ? '#EFEBFF' : '#EEF6FF',
        color: custom ? '#4B41C4' : '#1E5BB8',
      }}>
        {custom ? 'custom' : `${ref?.country?.name ?? country} norm`}
      </span>
      {/* An 'Approximate'-tier reference shouldn't masquerade as policy, and a
          prep-inclusive figure (India) must not be read as a teaching cap. */}
      {!custom && ref && !ref.usable && (
        <span style={{ color: '#B45309' }}>
          — published figure includes prep time, so this uses the safe teaching norm
        </span>
      )}
      {!custom && ref?.usable && ref.confidence !== 'verified' && (
        <span style={{ color: '#B45309' }}>— {ref.confidence} tier, worth confirming</span>
      )}
      <div style={{ flex: 1 }} />
      {overriddenCount > 0 && (
        <span style={{ color: '#7C6FE0', fontWeight: 700 }}>
          {overriddenCount} teacher{overriddenCount > 1 ? 's' : ''} overridden
        </span>
      )}
      <a href="/settings" style={{ fontSize: 10.5, fontWeight: 700, color: '#7C6FE0', textDecoration: 'none' }}>
        Change default →
      </a>
    </div>
  )
}

// ── TeacherRow ────────────────────────────────────────────────

function TeacherRow({
  row, borderTop, displayMode, periodMinutes, fmtLoad, normMax, onUpdateMax, onEditSubject,
}: {
  row: { t: Staff; load: number; max: number; assignments: Array<{ subject: string; sections: string[]; totalPeriods: number }>; type: TeacherType; status: ReturnType<typeof statusBadge>; overridden: boolean }
  borderTop: boolean
  displayMode: 'periods' | 'hours'
  periodMinutes: number
  fmtLoad: (p: number) => string
  /** The national/custom norm — what the cap falls back to. */
  normMax: number
  onUpdateMax: (next: number | undefined) => void
  onEditSubject: (sub: string) => void
}) {
  const { t, load, max, assignments, type, status, overridden } = row
  const [draft, setDraft] = useState<string | null>(null)
  const pct = max > 0 ? Math.min(100, (load / max) * 100) : 0
  const barColor = load > max ? '#DC2626' : load >= max * 0.9 ? '#D4920E' : load > 0 ? '#16A34A' : '#B8B4D4'
  const typeStyle = TYPE_STYLE[type]

  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: '220px 170px 1fr',
      padding: '12px 16px', gap: 12, alignItems: 'start',
      borderTop: borderTop ? '1px solid #F0EDFF' : 'none',
      transition: 'background 0.1s',
    }}
      onMouseEnter={e => (e.currentTarget as HTMLDivElement).style.background = '#FAFAFE'}
      onMouseLeave={e => (e.currentTarget as HTMLDivElement).style.background = 'transparent'}
    >
      {/* ── Col 1: Teacher info ── */}
      <div>
        <div style={{ fontSize: 13, fontWeight: 700, color: '#13111E', marginBottom: 4 }}>{t.name}</div>
        <span style={{
          display: 'inline-block', padding: '2px 8px', borderRadius: 20,
          fontSize: 9.5, fontWeight: 700,
          background: typeStyle.bg, color: typeStyle.fg, border: `1px solid ${typeStyle.border}`,
          marginBottom: (t as any).email ? 4 : 0,
        }}>
          {type}
        </span>
        {(t as any).email && (
          <div style={{ fontSize: 10, color: '#B8B4D4', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const, maxWidth: 190 }}>
            {(t as any).email}
          </div>
        )}
        {/* Status badge */}
        <div style={{ marginTop: 6 }}>
          <span style={{
            display: 'inline-block', padding: '2px 8px', borderRadius: 20,
            fontSize: 9.5, fontWeight: 700,
            background: status.bg, color: status.fg, border: `1px solid ${status.border}`,
          }}>
            {status.label}
          </span>
        </div>
      </div>

      {/* ── Col 2: Weekly load + the EDITABLE cap ──
          Blueprint v6 Step 5: "User can override/change the load per teacher."
          This is the only place that cap is editable; Resources shows it
          read-only. The norm it defaults to is stated underneath rather than
          silently baked in, so an override is always visibly an override. */}
      <div style={{ paddingTop: 2 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 5, marginBottom: 6 }}>
          <span style={{ fontSize: 18, fontWeight: 900, color: barColor, fontFamily: "'DM Mono', monospace", lineHeight: 1 }}>
            {fmtLoad(load)}
          </span>
          <span style={{ fontSize: 10, color: '#B8B4D4', fontFamily: "'DM Mono', monospace" }}>/</span>
          <input
            type="number" min={1} max={60}
            value={draft ?? String(max)}
            onChange={e => setDraft(e.target.value)}
            onFocus={() => setDraft(String(max))}
            onBlur={() => {
              const v = parseInt(draft ?? '', 10)
              // Typing the norm back is the same as having no override at all —
              // clear it, so the teacher keeps tracking the norm if it changes.
              if (!isNaN(v) && v > 0 && v !== normMax) onUpdateMax(v)
              else if (!isNaN(v) && v === normMax) onUpdateMax(undefined)
              setDraft(null)
            }}
            onKeyDown={e => { if (e.key === 'Enter') (e.currentTarget as HTMLInputElement).blur() }}
            title={`Max periods per week for ${t.name}. Default is the ${normMax}p workload norm.`}
            style={{
              width: 52, padding: '1px 5px', borderRadius: 5,
              border: `1.5px solid ${overridden ? '#C4BDFF' : '#E8E4FF'}`,
              background: overridden ? '#F4F1FF' : '#fff',
              fontSize: 12, fontWeight: 800, color: '#4B41C4',
              textAlign: 'center', outline: 'none', fontFamily: "'DM Mono', monospace",
              boxSizing: 'border-box' as const,
            }}
          />
          {overridden && (
            <button
              onClick={() => onUpdateMax(undefined)}
              title={`Reset to the ${normMax}p norm`}
              style={{
                all: 'unset', cursor: 'pointer', display: 'inline-flex',
                alignItems: 'center', color: '#9A95BC', flexShrink: 0,
              }}>
              <RotateCcw size={10} />
            </button>
          )}
        </div>
        <div style={{ height: 8, background: '#F0EDFF', borderRadius: 4, overflow: 'hidden' }}>
          <div style={{
            height: '100%', width: `${pct}%`, borderRadius: 4,
            background: barColor, transition: 'width 0.3s ease',
          }} />
        </div>
        <div style={{ marginTop: 4, fontSize: 9, color: '#B8B4D4' }}>
          {Math.round(pct)}% of {fmtLoad(max)}
          {overridden
            ? <> · <span style={{ color: '#7C6FE0', fontWeight: 700 }}>custom</span> (norm {normMax}p)</>
            : ' · workload norm'}
        </div>
      </div>

      {/* ── Col 3: Assignments list ── */}
      <div style={{ paddingTop: 2 }}>
        {assignments.length === 0 ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#B8B4D4', fontSize: 11 }}>
            <Sparkles size={11} />
            <span>No assignments yet — use HI allocate to fill</span>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 5 }}>
            {assignments.map(({ subject, sections, totalPeriods }) => (
              <div key={subject} style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' as const }}>
                {/* Subject name — clickable */}
                <button
                  onClick={() => onEditSubject(subject)}
                  style={{
                    padding: '3px 9px', borderRadius: 6,
                    border: '1px solid #D8D2FF',
                    background: '#EDE9FF', color: '#5B4EC0',
                    fontSize: 11, fontWeight: 700, cursor: 'pointer',
                    fontFamily: 'inherit', flexShrink: 0,
                    transition: 'background 0.1s',
                  }}
                  onMouseEnter={e => (e.currentTarget as HTMLButtonElement).style.background = '#DDD6FF'}
                  onMouseLeave={e => (e.currentTarget as HTMLButtonElement).style.background = '#EDE9FF'}
                  title="Click to edit section split"
                >
                  {subject}
                </button>

                {/* Arrow */}
                <span style={{ color: '#B8B4D4', fontSize: 12, flexShrink: 0 }}>→</span>

                {/* Sections chips */}
                <span style={{ fontSize: 11, color: '#4B5275', fontWeight: 500, flexWrap: 'wrap' as const }}>
                  {sections.slice(0, 4).join(', ')}
                  {sections.length > 4 && <span style={{ color: '#B8B4D4' }}> +{sections.length - 4} more</span>}
                </span>

                {/* Period count pill */}
                <span style={{
                  marginLeft: 'auto', flexShrink: 0,
                  padding: '1px 7px', borderRadius: 10,
                  background: '#F8F7FF', border: '1px solid #E8E4FF',
                  fontSize: 10, fontWeight: 700, color: '#7C6FE0',
                  fontFamily: "'DM Mono', monospace",
                }}>
                  {displayMode === 'hours' ? toHourMin(totalPeriods, periodMinutes) : `${totalPeriods}p`}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
