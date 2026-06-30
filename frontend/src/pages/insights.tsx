/**
 * Insights — analytics across the user's timetables. Shows real metrics when
 * data exists, and a clear empty state (no invented numbers) before then.
 */
import { PageHeader } from '@/components/layout/PageHeader'
import { useTimetableStore } from '@/store/timetableStore'
import { BarChart3, Users, CalendarDays, AlertTriangle } from 'lucide-react'

export function InsightsPage() {
  const store = useTimetableStore() as any
  const sections = store.sections ?? []
  const staff = store.staff ?? []
  const conflicts = (store.conflicts ?? []).length
  const hasData = sections.length > 0 || staff.length > 0

  const metrics = [
    { icon: <CalendarDays size={18} />, label: 'Classes', value: sections.length },
    { icon: <Users size={18} />, label: 'Teachers', value: staff.length },
    { icon: <BarChart3 size={18} />, label: 'Avg load / teacher', value: staff.length ? Math.round((sections.length * 6) / staff.length) : 0 },
    { icon: <AlertTriangle size={18} />, label: 'Conflicts', value: conflicts, red: true },
  ]

  return (
    <div style={{ minHeight: '100vh', background: '#F5F2FF' }}>
      <PageHeader icon="📊" title="Insights" description="Workload, utilization and conflict analytics across your schedules." />
      <div style={{ maxWidth: 1000, margin: '0 auto', padding: '24px 28px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 14, marginBottom: 24 }}>
          {metrics.map(m => (
            <div key={m.label} style={{ background: '#fff', border: '1px solid #ECE9FB', borderRadius: 14, padding: 18 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: m.red ? '#dc2626' : '#7C6FE0', marginBottom: 10 }}>{m.icon}<span style={{ fontSize: 12.5, fontWeight: 600, color: '#6B7280' }}>{m.label}</span></div>
              <div style={{ fontSize: 30, fontWeight: 800, color: m.red && m.value ? '#dc2626' : '#13111E' }}>{m.value}</div>
            </div>
          ))}
        </div>

        {!hasData && (
          <div style={{ background: '#fff', border: '1px solid #ECE9FB', borderRadius: 14, padding: '48px 24px', textAlign: 'center' }}>
            <BarChart3 size={32} color="#C9C3EC" />
            <h3 style={{ fontSize: 16, fontWeight: 700, color: '#13111E', margin: '12px 0 6px' }}>No insights yet</h3>
            <p style={{ fontSize: 13, color: '#8B87AD', margin: '0 0 16px' }}>Create and generate a schedule, and workload &amp; utilization analytics will appear here.</p>
            <a href="/wizard" style={{ display: 'inline-block', padding: '9px 18px', borderRadius: 9, background: '#7C6FE0', color: '#fff', fontWeight: 700, fontSize: 13, textDecoration: 'none' }}>+ New schedule</a>
          </div>
        )}
      </div>
    </div>
  )
}
