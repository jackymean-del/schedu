/**
 * Reports & Analytics — leave, substitution, and cancelled-lesson insight
 * across the active schedule. All derived from dated leave records + the
 * schedule + coverage (see lib/reportsData.ts); no separate logging layer.
 */
import { useState, useEffect, useMemo } from 'react'
import { PageHeader } from '@/components/layout/PageHeader'
import { useTimetableStore } from '@/store/timetableStore'
import { useAuthStore } from '@/store/authStore'
import { loadActiveTimetableIntoStore } from '@/lib/ttRegistry'
import { loadLeaves } from '@/lib/leaveUtils'
import { computeReports, rangeFor, type ReportsData, type TrendPoint, type ReportSource } from '@/lib/reportsData'
import { loadAssignments, type FreeAssignment } from '@/lib/freeAssignments'
import { loadActiveBundles } from '@/lib/activeSchedules'
import { ExportControls } from '@/components/ExportControls'
import type { ExportSheet } from '@/lib/exportData'
import {
  BarChart3, Users, CalendarDays, XCircle, TrendingUp, PieChart, LayoutGrid,
  UserMinus, CheckCircle2, ClipboardList,
} from 'lucide-react'

type Tab = 'summary' | 'faculty' | 'class' | 'trends' | 'leaveTypes' | 'cancelled' | 'duties'
const RANGES: { key: string; label: string }[] = [
  { key: 'today', label: 'Today' }, { key: 'week', label: 'This Week' },
  { key: 'month', label: 'This Month' }, { key: 'lastMonth', label: 'Last Month' },
  { key: '3months', label: 'Last 3 Months' },
]
const DOW = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat']
function fmtDate(iso: string) { const d = new Date(iso + 'T00:00:00'); return `${DOW[d.getDay()]} ${d.getDate()}/${d.getMonth() + 1}` }
function fmtClock(min: number) { const h = Math.floor(min / 60) % 12 || 12, m = min % 60, ap = Math.floor(min / 60) >= 12 ? 'PM' : 'AM'; return `${h}:${String(m).padStart(2, '0')} ${ap}` }

export function InsightsPage() {
  const store = useTimetableStore() as any
  const uid = useAuthStore.getState().user?.id ?? ''
  useEffect(() => { loadActiveTimetableIntoStore() }, [])

  const [tab, setTab] = useState<Tab>('summary')
  const [rangeKey, setRangeKey] = useState('month')

  const sections = store.sections ?? []

  // Analytics span every ACTIVE schedule (multi-active); a single active
  // reduces to one source built from the store — same numbers as before.
  const bundles = useMemo(() => loadActiveBundles(uid), [uid])
  const multiActive = bundles.length > 1
  const sources: ReportSource[] = multiActive
    ? bundles.map(b => ({ sections: b.sections, periods: b.periods, classTT: b.classTT, substitutions: b.substitutions, config: b.config }))
    : [{ sections, periods: store.periods ?? [], classTT: store.classTT ?? {}, substitutions: store.substitutions ?? {}, config: store.config ?? {} }]
  const hasData = sources.some(s => s.sections.length > 0 && Object.keys(s.classTT).length > 0)

  const reports: ReportsData = useMemo(() => computeReports({
    leaves: loadLeaves(uid), sources, range: rangeFor(rangeKey),
  }), [uid, sources, rangeKey])

  // Extra duties (free-slot task assignments) in the selected range — same
  // date-scoped records the Calendar writes, so the audit trail is automatic.
  // periodName resolves against the OWNING schedule's periods (a.sid) — a
  // flat cross-schedule search would be ambiguous when two schedules reuse the
  // same period id at a different time. Legacy untagged records (pre-dating
  // schedule tagging) fall back to the flat search.
  const duties = useMemo(() => {
    const range = rangeFor(rangeKey)
    const allPeriods = sources.flatMap(s => s.periods)
    const periodName = (a: FreeAssignment) => {
      const ownPeriods = a.sid ? bundles.find(b => b.id === a.sid)?.periods : undefined
      return (ownPeriods ?? allPeriods).find((p: any) => p.id === a.periodId)?.name ?? a.periodId
    }
    return loadAssignments(uid)
      .filter(a => a.date >= range.start && a.date <= range.end)
      .sort((a, b) => b.date.localeCompare(a.date))
      .map(a => ({ ...a, periodName: periodName(a) }))
  }, [uid, rangeKey, sources, bundles])

  const buildSheets = (): ExportSheet[] => [
    { name: 'Extra Duties', rows: [['Date','Period','Resource Type','Assigned To','Task','Note'],
      ...duties.map(d => [d.date, d.periodName, d.kind, d.entity, d.title, d.note ?? ''])] },
    { name: 'Cancelled Lessons', rows: [['Date','Day','Period','Time','Subject','Faculty','Class','Reason'],
      ...reports.cancelled.map(e => [e.date, e.day, e.periodName, fmtClock(e.startMin), e.subject, e.faculty, e.section, e.reason ?? ''])] },
    { name: 'Faculty Summary', rows: [['Faculty','Leave Days','Periods Missed','Covered','As Substitute'],
      ...reports.facultyStats.map(f => [f.name, f.leaveDays, f.periodsMissed, f.periodsCovered, f.periodsAsSub])] },
    { name: 'Class Summary', rows: [['Class','Affected','Covered','Cancelled'],
      ...reports.classStats.map(c => [c.name, c.affected, c.covered, c.cancelled])] },
    { name: 'Leave Types', rows: [['Type','Count'], ...reports.leaveTypes.map(t => [t.type, t.count])] },
  ]

  const TABS: { key: Tab; label: string; icon: React.ReactNode }[] = [
    { key: 'summary', label: 'Summary', icon: <BarChart3 size={14} /> },
    { key: 'faculty', label: 'Faculty', icon: <Users size={14} /> },
    { key: 'class', label: 'Class', icon: <LayoutGrid size={14} /> },
    { key: 'trends', label: 'Trends', icon: <TrendingUp size={14} /> },
    { key: 'leaveTypes', label: 'Leave Types', icon: <PieChart size={14} /> },
    { key: 'cancelled', label: 'Cancelled Lessons', icon: <XCircle size={14} /> },
    { key: 'duties', label: 'Extra Duties', icon: <ClipboardList size={14} /> },
  ]

  const coverageRate = reports.totals.substitutes + reports.totals.cancelled > 0
    ? Math.round((reports.totals.substitutes / (reports.totals.substitutes + reports.totals.cancelled)) * 100) : null

  return (
    <div style={{ minHeight: '100vh', background: '#F5F2FF' }}>
      <PageHeader icon="📊" title="Reports & Analytics" description={multiActive ? `Combined insight across all ${bundles.length} active schedules.` : "Leave, substitution and cancelled-lesson insight across your schedule."}
        actions={hasData ? <ExportControls filename="schedu-reports.xlsx" sheets={buildSheets} title="Reports" /> : undefined} />

      <div style={{ maxWidth: 1080, margin: '0 auto', padding: '22px 26px 60px' }}>
        {!hasData ? (
          <Empty />
        ) : (
          <>
            {/* Summary cards */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(170px,1fr))', gap: 12, marginBottom: 16 }}>
              <Stat icon={<UserMinus size={16} />} label="Total Leaves" value={reports.totals.leaves} tint="#7C6FE0" />
              <Stat icon={<CheckCircle2 size={16} />} label="Substitutes" value={reports.totals.substitutes} tint="#16A34A" />
              <Stat icon={<XCircle size={16} />} label="Cancelled" value={reports.totals.cancelled} tint="#DC2626" red={reports.totals.cancelled > 0} />
              <Stat icon={<CalendarDays size={16} />} label="Leave Days" value={reports.totals.leaveDays} tint="#D97706" />
              <Stat icon={<Users size={16} />} label="Faculty on Leave" value={reports.totals.facultyOnLeave} tint="#2563EB" />
            </div>

            {/* Range chips */}
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 14 }}>
              {RANGES.map(r => (
                <button key={r.key} onClick={() => setRangeKey(r.key)}
                  style={{ padding: '7px 14px', borderRadius: 9, border: 'none', cursor: 'pointer', fontSize: 12.5, fontWeight: 700, fontFamily: 'inherit',
                    background: rangeKey === r.key ? '#7C6FE0' : '#fff', color: rangeKey === r.key ? '#fff' : '#6B7280',
                    boxShadow: rangeKey === r.key ? '0 2px 8px rgba(124,111,224,0.28)' : '0 1px 2px rgba(0,0,0,0.04)' }}>
                  {r.label}
                </button>
              ))}
            </div>

            {/* Tabs */}
            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 16, background: '#fff', padding: 5, borderRadius: 12, border: '1px solid #ECEAFB' }}>
              {TABS.map(t => (
                <button key={t.key} onClick={() => setTab(t.key)}
                  style={{ padding: '8px 15px', borderRadius: 8, border: 'none', cursor: 'pointer', fontSize: 12.5, fontWeight: 700, fontFamily: 'inherit',
                    display: 'inline-flex', alignItems: 'center', gap: 7,
                    background: tab === t.key ? '#7C6FE0' : 'transparent', color: tab === t.key ? '#fff' : '#4B5275' }}>
                  <span style={{ color: tab === t.key ? '#fff' : '#8B87AD' }}>{t.icon}</span>{t.label}
                </button>
              ))}
            </div>

            {tab === 'duties' ? (
              <Card>
                {duties.length === 0 ? <NoActivity msg="No extra duties in this range — assign tasks to free resources from the Calendar’s Live view." /> : (
                  <Table head={['Date', 'Period', 'Type', 'Assigned To', 'Task', 'Note']}
                    rows={duties.map(d => [fmtDate(d.date), d.periodName, d.kind === 'room' ? 'Venue' : d.kind === 'class' ? 'Class' : 'Teacher', d.entity, d.title, d.note ?? ''])} />
                )}
              </Card>
            ) : reports.events.length === 0 && tab !== 'trends' ? (
              <Card><NoActivity /></Card>
            ) : tab === 'summary' ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))', gap: 12 }}>
                  <Highlight label="Coverage rate" value={coverageRate === null ? '—' : `${coverageRate}%`}
                    sub={coverageRate === null ? 'No absences' : `${reports.totals.substitutes} of ${reports.totals.substitutes + reports.totals.cancelled} periods covered`}
                    tint={coverageRate !== null && coverageRate < 80 ? '#DC2626' : '#16A34A'} />
                  <Highlight label="Most affected faculty" value={reports.mostAffectedFaculty?.name ?? '—'} sub={reports.mostAffectedFaculty ? `${reports.mostAffectedFaculty.count} periods` : ''} tint="#7C6FE0" />
                  <Highlight label="Most affected class" value={reports.mostAffectedClass?.name ?? '—'} sub={reports.mostAffectedClass ? `${reports.mostAffectedClass.count} periods` : ''} tint="#2563EB" />
                  <Highlight label="Top cancel reason" value={reports.topReason?.reason ?? '—'} sub={reports.topReason ? `${reports.topReason.count} lessons` : ''} tint="#D97706" />
                </div>
                <Card><TrendsChart points={reports.trends} /></Card>
              </div>
            ) : tab === 'trends' ? (
              <Card><TrendsChart points={reports.trends} tall /></Card>
            ) : tab === 'faculty' ? (
              <Card>
                <Table head={['Faculty', 'Leave Days', 'Periods Missed', 'Covered', 'As Substitute']}
                  rows={reports.facultyStats.map(f => [f.name, String(f.leaveDays), String(f.periodsMissed), String(f.periodsCovered), String(f.periodsAsSub)])} />
              </Card>
            ) : tab === 'class' ? (
              <Card>
                <Table head={['Class', 'Affected', 'Covered', 'Cancelled']}
                  rows={reports.classStats.map(c => [c.name, String(c.affected), String(c.covered), String(c.cancelled)])} />
              </Card>
            ) : tab === 'leaveTypes' ? (
              <Card><LeaveTypes types={reports.leaveTypes} total={reports.totals.leaves} /></Card>
            ) : (
              <>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(200px,1fr))', gap: 12, marginBottom: 14 }}>
                  <MiniCard tint="#DC2626" bg="#FEF2F2" label="Total Cancelled" big={String(reports.totals.cancelled)} />
                  <MiniCard tint="#2563EB" bg="#EFF6FF" label="Most Affected Faculty" big={reports.mostAffectedFaculty?.name ?? '—'} small={reports.mostAffectedFaculty ? `${reports.mostAffectedFaculty.count} lessons` : ''} />
                  <MiniCard tint="#16A34A" bg="#F0FDF4" label="Most Affected Class" big={reports.mostAffectedClass?.name ?? '—'} small={reports.mostAffectedClass ? `${reports.mostAffectedClass.count} lessons` : ''} />
                  <MiniCard tint="#D97706" bg="#FFFBEB" label="Top Reason" big={reports.topReason?.reason ?? '—'} small={reports.topReason ? `${reports.topReason.count} lessons` : ''} />
                </div>
                <Card>
                  {reports.cancelled.length === 0 ? <NoActivity msg="No cancelled lessons in this range — every absence was covered." /> : (
                    <Table head={['Date', 'Period', 'Time', 'Subject', 'Faculty', 'Class', 'Reason']}
                      rows={reports.cancelled.map(e => [fmtDate(e.date), e.periodName, fmtClock(e.startMin), e.subject, e.faculty, e.section, e.reason ?? ''])} />
                  )}
                </Card>
              </>
            )}
          </>
        )}
      </div>
    </div>
  )
}

// ── Trends chart (lightweight inline SVG) ──────────────────────
function TrendsChart({ points, tall }: { points: TrendPoint[]; tall?: boolean }) {
  const W = 720, H = tall ? 300 : 200, PAD = 34
  const totalLeaves = points.reduce((a, p) => a + p.leaves, 0)
  const totalSubs = points.reduce((a, p) => a + p.substitutes, 0)
  const maxY = Math.max(1, ...points.map(p => Math.max(p.leaves, p.substitutes)))
  const n = Math.max(1, points.length - 1)
  const x = (i: number) => PAD + (i / n) * (W - PAD * 2)
  const y = (v: number) => H - PAD - (v / maxY) * (H - PAD * 2)
  const path = (key: 'leaves' | 'substitutes') => points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${x(i).toFixed(1)} ${y(p[key]).toFixed(1)}`).join(' ')
  const labelIdx = points.length <= 8 ? points.map((_, i) => i) : Array.from({ length: 7 }, (_, k) => Math.round(k * n / 6))

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 18, marginBottom: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 12.5, fontWeight: 700, color: '#13111E' }}>
          <TrendingUp size={15} color="#7C6FE0" /> Trends
        </div>
        <Legend color="#EA580C" label={`Leaves: ${totalLeaves}`} />
        <Legend color="#7C6FE0" label={`Substitutes: ${totalSubs}`} />
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 'auto' }} preserveAspectRatio="xMidYMid meet">
        {[0, 0.25, 0.5, 0.75, 1].map(f => (
          <g key={f}>
            <line x1={PAD} x2={W - PAD} y1={PAD + f * (H - PAD * 2)} y2={PAD + f * (H - PAD * 2)} stroke="#F0EEFA" strokeWidth={1} />
            <text x={PAD - 8} y={PAD + f * (H - PAD * 2) + 3} textAnchor="end" fontSize={9} fill="#B5B0CF">{Math.round(maxY * (1 - f))}</text>
          </g>
        ))}
        <path d={path('leaves')} fill="none" stroke="#EA580C" strokeWidth={2} strokeLinejoin="round" />
        <path d={path('substitutes')} fill="none" stroke="#7C6FE0" strokeWidth={2} strokeLinejoin="round" />
        {points.map((p, i) => (
          <g key={i}>
            <circle cx={x(i)} cy={y(p.leaves)} r={2.5} fill="#EA580C" />
            <circle cx={x(i)} cy={y(p.substitutes)} r={2.5} fill="#7C6FE0" />
          </g>
        ))}
        {labelIdx.map(i => (
          <text key={i} x={x(i)} y={H - PAD + 16} textAnchor="middle" fontSize={9} fill="#9A95BC">{fmtDate(points[i].date)}</text>
        ))}
      </svg>
    </div>
  )
}
function Legend({ color, label }: { color: string; label: string }) {
  return <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 600, color: '#4B5275' }}>
    <span style={{ width: 9, height: 9, borderRadius: 5, background: color }} />{label}
  </span>
}

// ── small building blocks ──────────────────────────────────────
function Card({ children }: { children: React.ReactNode }) {
  return <div style={{ background: '#fff', border: '1px solid #ECE9FB', borderRadius: 14, padding: 18 }}>{children}</div>
}
function Stat({ icon, label, value, tint, red }: { icon: React.ReactNode; label: string; value: number; tint: string; red?: boolean }) {
  return (
    <div style={{ background: '#fff', border: '1px solid #ECE9FB', borderRadius: 14, padding: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 7, color: tint, marginBottom: 8 }}>{icon}<span style={{ fontSize: 12, fontWeight: 600, color: '#6B7280' }}>{label}</span></div>
      <div style={{ fontSize: 28, fontWeight: 800, color: red ? '#DC2626' : '#13111E' }}>{value}</div>
    </div>
  )
}
function Highlight({ label, value, sub, tint }: { label: string; value: string; sub: string; tint: string }) {
  return (
    <div style={{ background: '#fff', border: '1px solid #ECE9FB', borderRadius: 14, padding: 16 }}>
      <div style={{ fontSize: 11.5, fontWeight: 700, color: '#9A95BC', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 8 }}>{label}</div>
      <div style={{ fontSize: 20, fontWeight: 800, color: tint, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{value}</div>
      {sub && <div style={{ fontSize: 12, color: '#9A95BC', marginTop: 3 }}>{sub}</div>}
    </div>
  )
}
function MiniCard({ tint, bg, label, big, small }: { tint: string; bg: string; label: string; big: string; small?: string }) {
  return (
    <div style={{ background: bg, border: `1px solid ${tint}22`, borderRadius: 12, padding: 14 }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: tint, marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: 17, fontWeight: 800, color: '#13111E', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{big}</div>
      {small && <div style={{ fontSize: 11, color: '#6B7280', marginTop: 2 }}>{small}</div>}
    </div>
  )
}
function Table({ head, rows }: { head: string[]; rows: string[][] }) {
  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
        <thead>
          <tr>{head.map((h, i) => (
            <th key={h} style={{ textAlign: i === 0 ? 'left' : 'center', padding: '8px 10px', fontSize: 11, fontWeight: 800, color: '#9A95BC', textTransform: 'uppercase', letterSpacing: '0.04em', borderBottom: '2px solid #F0EEFA', whiteSpace: 'nowrap' }}>{h}</th>
          ))}</tr>
        </thead>
        <tbody>
          {rows.map((r, ri) => (
            <tr key={ri}>{r.map((cell, ci) => (
              <td key={ci} style={{ textAlign: ci === 0 ? 'left' : 'center', padding: '9px 10px', borderBottom: '1px solid #F5F3FC', color: ci === 0 ? '#13111E' : '#4B5275', fontWeight: ci === 0 ? 700 : 500, whiteSpace: 'nowrap' }}>{cell}</td>
            ))}</tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
function LeaveTypes({ types, total }: { types: { type: string; count: number }[]; total: number }) {
  const COLORS = ['#7C6FE0', '#2563EB', '#16A34A', '#D97706', '#DB2777', '#0891B2']
  const max = Math.max(1, ...types.map(t => t.count))
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {types.length === 0 && <NoActivity msg="No leaves recorded in this range." />}
      {types.map((t, i) => (
        <div key={t.type}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, marginBottom: 5 }}>
            <span style={{ fontWeight: 700, color: '#13111E' }}>{t.type}</span>
            <span style={{ color: '#6B7280' }}>{t.count} · {total ? Math.round((t.count / total) * 100) : 0}%</span>
          </div>
          <div style={{ height: 10, borderRadius: 6, background: '#F1EFFA', overflow: 'hidden' }}>
            <div style={{ width: `${(t.count / max) * 100}%`, height: '100%', background: COLORS[i % COLORS.length], borderRadius: 6 }} />
          </div>
        </div>
      ))}
    </div>
  )
}
function NoActivity({ msg }: { msg?: string }) {
  return (
    <div style={{ padding: '40px 20px', textAlign: 'center' }}>
      <CheckCircle2 size={26} color="#16A34A" />
      <div style={{ fontSize: 13.5, color: '#6B7280', marginTop: 8 }}>{msg ?? 'No leave or substitution activity in this range.'}</div>
    </div>
  )
}
function Empty() {
  return (
    <div style={{ background: '#fff', border: '1px solid #ECE9FB', borderRadius: 14, padding: '52px 24px', textAlign: 'center' }}>
      <BarChart3 size={30} color="#C9C3EC" />
      <h3 style={{ fontSize: 16, fontWeight: 800, color: '#13111E', margin: '12px 0 6px' }}>No data yet</h3>
      <p style={{ fontSize: 13, color: '#8B87AD', margin: '0 0 16px' }}>Generate a schedule and record leaves in the Calendar — analytics will build from there.</p>
      <a href="/calendar" style={{ display: 'inline-block', padding: '9px 18px', borderRadius: 9, background: '#7C6FE0', color: '#fff', fontWeight: 700, fontSize: 13, textDecoration: 'none' }}>Go to Calendar</a>
    </div>
  )
}
