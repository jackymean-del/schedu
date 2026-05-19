/**
 * Dashboard — Page 4 (Home)
 *
 * Layout:
 *   ┌─ Top nav ─────────────────────────────────────────────────┐
 *   │ schedU │ Dashboard  Timetables  Resources  Reports │ school │
 *   ├─ Icon sidebar ──┬─ Content area ────────────────────────────┤
 *   │  🏠              │  Greeting + "+ New timetable"            │
 *   │  📅              │  Stats row (4 cards)                     │
 *   │  👤              │  AI insight banner                       │
 *   │  📄              │  Your timetables list                    │
 *   │  📊              │  Quick actions (3 cards)                 │
 *   │                 │                                           │
 *   │  ⚙️  (bottom)    │                                           │
 *   └─────────────────┴───────────────────────────────────────────┘
 */

import { useState } from 'react'
import { useAuthStore } from '@/store/authStore'
import { useTimetableStore } from '@/store/timetableStore'
import {
  Home, Calendar, Users, FileText, BarChart2, Settings,
  Bell, Plus, Sparkles, MoreHorizontal, ChevronRight,
  ArrowRight,
} from 'lucide-react'

// ── helpers ────────────────────────────────────────────────────
function greeting() {
  const h = new Date().getHours()
  if (h < 12) return 'Good morning'
  if (h < 17) return 'Good afternoon'
  return 'Good evening'
}

// ── types ──────────────────────────────────────────────────────
type NavTab = 'dashboard' | 'timetables' | 'resources' | 'reports'

// ── Demo timetable rows (supplement store data) ────────────────
const DEMO_TT = [
  {
    id: 'tt1', name: 'AY 2025–26 · Main',
    meta: '52 classes · 84 teachers · Generated 3 days ago',
    status: 'active' as const,
  },
  {
    id: 'tt2', name: 'AY 2025–26 · Revised (Post-annual)',
    meta: '52 classes · 84 teachers · In wizard · Step 3',
    status: 'draft' as const,
  },
  {
    id: 'tt3', name: 'AY 2024–25 · Archive',
    meta: '49 classes · 80 teachers · Archived',
    status: 'archived' as const,
  },
]

const STATUS_META = {
  active:   { label: 'Active',   bg: '#DCFCE7', fg: '#15803D', border: '#BBF7D0' },
  draft:    { label: 'Draft',    bg: '#FEF3C7', fg: '#92400E', border: '#FDE68A' },
  archived: { label: 'Archived', bg: '#F3F4F6', fg: '#6B7280', border: '#E5E7EB' },
}

// ── Component ──────────────────────────────────────────────────
export function DashboardPage() {
  const { user, logout } = useAuthStore()
  const store = useTimetableStore() as any
  const { sections, staff, subjects, classTT } = store

  const [activeTab, setActiveTab] = useState<NavTab>('dashboard')

  if (!user) { window.location.href = '/login'; return null }

  const firstName  = user.name?.split(' ')[0] ?? 'there'
  const schoolName = user.schoolName ?? 'Your School'
  const hasTT      = Object.keys(classTT ?? {}).length > 0
  const conflicts  = (store.conflicts ?? []).length

  // Stats (use store counts; fall back to demo values for new accounts)
  const stats = [
    {
      label: 'Timetables',
      value: hasTT ? 1 : 3,
      sub: hasTT ? '1 active' : '2 active · 1 draft',
      red: false,
    },
    {
      label: 'Total classes',
      value: sections.length || 52,
      sub: sections.length ? `${sections.length} sections` : 'Across I–XII',
      red: false,
    },
    {
      label: 'Teachers',
      value: staff.length || 84,
      sub: staff.length ? `${staff.length} staff` : '78 allocated',
      red: false,
    },
    {
      label: 'Conflicts',
      value: conflicts || 2,
      sub: 'Needs attention',
      red: true,
    },
  ]

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', minHeight: '100vh',
      fontFamily: "'Inter', -apple-system, sans-serif",
      background: '#F5F4F0', color: '#13111E',
    }}>
      <style>{`
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        .db-tab { transition: background 0.13s, color 0.13s; }
        .db-tab:hover { background: #F5F4F0 !important; }
        .db-icon-btn { transition: background 0.13s; border-radius: 9px; }
        .db-icon-btn:hover { background: #EDE9FF !important; }
        .db-tt-row { transition: box-shadow 0.14s, border-color 0.14s; }
        .db-tt-row:hover { border-color: #D1D5DB !important; box-shadow: 0 2px 10px rgba(0,0,0,0.06); }
        .db-qa-card { transition: transform 0.15s, box-shadow 0.15s, border-color 0.15s; }
        .db-qa-card:hover { transform: translateY(-2px); box-shadow: 0 6px 18px rgba(0,0,0,0.07); border-color: #D1D5DB !important; }
        .db-action-btn { transition: background 0.13s, border-color 0.13s; }
        .db-action-btn:hover { background: #F3F4F6 !important; }
      `}</style>

      {/* ══════════════════════════════
          TOP NAV
      ══════════════════════════════ */}
      <header style={{
        height: 52, background: '#fff',
        borderBottom: '1px solid #E5E7EB',
        display: 'flex', alignItems: 'center',
        padding: '0 16px 0 0',
        flexShrink: 0, zIndex: 100,
        position: 'sticky', top: 0,
      }}>
        {/* Logo */}
        <div style={{
          width: 56, height: 52, flexShrink: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          borderRight: '1px solid #F0EDFF',
        }}>
          <a href="/" style={{ textDecoration: 'none' }}>
            <span style={{ fontSize: 14, fontWeight: 900, letterSpacing: '-0.3px', color: '#13111E' }}>
              sched<span style={{ color: '#7C6FE0', fontFamily: "'DM Serif Display',Georgia,serif", fontStyle: 'italic' }}>U</span>
            </span>
          </a>
        </div>

        {/* Tabs */}
        <nav style={{ display: 'flex', alignItems: 'center', gap: 2, padding: '0 16px', flex: 1 }}>
          {([
            { key: 'dashboard',  label: 'Dashboard' },
            { key: 'timetables', label: 'Timetables' },
            { key: 'resources',  label: 'Resources' },
            { key: 'reports',    label: 'Reports' },
          ] as { key: NavTab; label: string }[]).map(t => (
            <button key={t.key}
              className="db-tab"
              onClick={() => setActiveTab(t.key)}
              style={{
                padding: '5px 14px', borderRadius: 7, border: 'none',
                background: activeTab === t.key ? '#F0EDFF' : 'transparent',
                color: activeTab === t.key ? '#7C3AED' : '#6B7280',
                fontSize: 13, fontWeight: activeTab === t.key ? 600 : 500,
                cursor: 'pointer', fontFamily: 'inherit',
              }}>
              {t.label}
            </button>
          ))}
        </nav>

        {/* Right — school + bell + avatar + menu */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
          <span style={{ fontSize: 13, fontWeight: 500, color: '#374151' }}>{schoolName}</span>

          <button className="db-icon-btn" style={{
            width: 32, height: 32, display: 'flex', alignItems: 'center',
            justifyContent: 'center', background: 'none', border: 'none', cursor: 'pointer',
            position: 'relative',
          }}>
            <Bell size={17} color="#6B7280" />
            <span style={{
              position: 'absolute', top: 5, right: 6,
              width: 7, height: 7, borderRadius: '50%',
              background: '#EF4444', border: '1.5px solid #fff',
            }} />
          </button>

          {/* Avatar */}
          <div style={{
            width: 30, height: 30, borderRadius: '50%',
            background: '#7C6FE0', color: '#fff',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 12, fontWeight: 700, flexShrink: 0, cursor: 'pointer',
          }}>
            {(user.name?.[0] ?? 'U').toUpperCase()}
          </div>

          <button onClick={() => { logout(); window.location.href = '/login' }}
            style={{
              background: 'none', border: 'none', cursor: 'pointer', padding: 4,
              color: '#6B7280', display: 'flex', alignItems: 'center',
            }}>
            <MoreHorizontal size={18} />
          </button>
        </div>
      </header>

      {/* ══════════════════════════════
          BODY  (sidebar + content)
      ══════════════════════════════ */}
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>

        {/* ── Icon sidebar ── */}
        <aside style={{
          width: 56, flexShrink: 0, background: '#fff',
          borderRight: '1px solid #E5E7EB',
          display: 'flex', flexDirection: 'column',
          alignItems: 'center', padding: '12px 0', gap: 4,
        }}>
          {[
            { icon: <Home size={18} />,      active: true  },
            { icon: <Calendar size={18} />,  active: false },
            { icon: <Users size={18} />,     active: false },
            { icon: <FileText size={18} />,  active: false },
            { icon: <BarChart2 size={18} />, active: false },
          ].map((item, i) => (
            <button key={i}
              className="db-icon-btn"
              style={{
                width: 38, height: 38,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: item.active ? '#EDE9FF' : 'none',
                border: 'none', cursor: 'pointer',
                color: item.active ? '#7C3AED' : '#9CA3AF',
              }}>
              {item.icon}
            </button>
          ))}

          {/* Push settings to bottom */}
          <div style={{ flex: 1 }} />
          <button className="db-icon-btn" style={{
            width: 38, height: 38,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'none', border: 'none', cursor: 'pointer', color: '#9CA3AF',
          }}>
            <Settings size={18} />
          </button>
        </aside>

        {/* ── Main content ── */}
        <main style={{
          flex: 1, overflowY: 'auto',
          padding: '24px 28px',
        }}>

          {/* Greeting row */}
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 20 }}>
            <div>
              <h1 style={{ fontSize: 20, fontWeight: 700, color: '#13111E', marginBottom: 4, letterSpacing: '-0.3px' }}>
                {greeting()}, {firstName}
              </h1>
              <p style={{ fontSize: 13, color: '#6B7280' }}>
                {schoolName} · AY 2025–26 · {(store.config as any)?.boardName ?? 'CBSE'}
              </p>
            </div>
            <a href="/wizard" style={{ textDecoration: 'none' }}>
              <button style={{
                display: 'inline-flex', alignItems: 'center', gap: 7,
                padding: '8px 16px', borderRadius: 8,
                border: '1px solid #D1D5DB', background: '#fff',
                fontSize: 13, fontWeight: 600, color: '#13111E', cursor: 'pointer',
                fontFamily: 'inherit',
              }}>
                <Plus size={14} /> New timetable
              </button>
            </a>
          </div>

          {/* Stats row */}
          <div style={{
            display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)',
            gap: 12, marginBottom: 16,
          }}>
            {stats.map(s => (
              <div key={s.label} style={{
                background: '#fff', borderRadius: 10,
                border: '1px solid #E5E7EB', padding: '14px 16px',
              }}>
                <div style={{ fontSize: 12, color: '#6B7280', marginBottom: 6 }}>{s.label}</div>
                <div style={{
                  fontSize: 28, fontWeight: 800, lineHeight: 1,
                  color: s.red ? '#EF4444' : '#13111E',
                  fontFamily: "'DM Mono', monospace",
                  marginBottom: 5,
                }}>
                  {s.value}
                </div>
                <div style={{ fontSize: 12, color: '#9CA3AF' }}>{s.sub}</div>
              </div>
            ))}
          </div>

          {/* AI insight banner */}
          <div style={{
            background: '#F0FDF4', border: '1px solid #86EFAC', borderRadius: 10,
            padding: '12px 16px', marginBottom: 20,
            display: 'flex', alignItems: 'center', gap: 12,
          }}>
            <Sparkles size={16} color="#15803D" style={{ flexShrink: 0 }} />
            <p style={{ flex: 1, fontSize: 13, color: '#166534', lineHeight: 1.55 }}>
              <strong>AI insight:</strong> Mr. Sharma is overloaded by 6 periods in the AY 2025–26 draft.
              Reassigning Chemistry XI to Ms. Nair would balance both workloads within capacity.
            </p>
            <button style={{
              display: 'inline-flex', alignItems: 'center', gap: 5,
              padding: '6px 14px', borderRadius: 7, border: 'none',
              background: '#16A34A', color: '#fff',
              fontSize: 12, fontWeight: 700, cursor: 'pointer',
              fontFamily: 'inherit', flexShrink: 0,
            }}>
              Fix <ChevronRight size={12} />
            </button>
          </div>

          {/* Your timetables */}
          <div style={{ marginBottom: 24 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <h2 style={{ fontSize: 15, fontWeight: 700, color: '#13111E' }}>Your timetables</h2>
              <a href="#" style={{ fontSize: 13, color: '#7C6FE0', fontWeight: 500, textDecoration: 'none' }}>
                View all
              </a>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {DEMO_TT.map(tt => {
                const sm = STATUS_META[tt.status]
                return (
                  <div key={tt.id} className="db-tt-row" style={{
                    background: '#fff', borderRadius: 10,
                    border: '1px solid #E5E7EB', padding: '14px 16px',
                    display: 'flex', alignItems: 'center', gap: 14,
                  }}>
                    {/* Icon */}
                    <div style={{
                      width: 36, height: 36, borderRadius: 8,
                      background: '#F5F4F0', flexShrink: 0,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                      <Calendar size={17} color="#6B7280" />
                    </div>

                    {/* Info */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 14, fontWeight: 600, color: '#13111E', marginBottom: 2 }}>{tt.name}</div>
                      <div style={{ fontSize: 12, color: '#9CA3AF' }}>{tt.meta}</div>
                    </div>

                    {/* Status badge */}
                    <span style={{
                      padding: '3px 10px', borderRadius: 20,
                      background: sm.bg, color: sm.fg, border: `1px solid ${sm.border}`,
                      fontSize: 12, fontWeight: 600, flexShrink: 0,
                    }}>
                      {sm.label}
                    </span>

                    {/* Action buttons */}
                    {tt.status === 'active' && (
                      <>
                        <TtBtn onClick={() => window.location.href = '/timetable'}>Edit</TtBtn>
                        <TtBtn onClick={() => {}}>Export</TtBtn>
                      </>
                    )}
                    {tt.status === 'draft' && (
                      <TtBtn primary onClick={() => window.location.href = '/wizard'}>
                        Continue <ArrowRight size={12} />
                      </TtBtn>
                    )}
                    {tt.status === 'archived' && (
                      <TtBtn onClick={() => window.location.href = '/timetable'}>View</TtBtn>
                    )}
                  </div>
                )
              })}
            </div>
          </div>

          {/* Quick actions */}
          <div>
            <h2 style={{ fontSize: 15, fontWeight: 700, color: '#13111E', marginBottom: 12 }}>
              Quick actions
            </h2>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
              {[
                {
                  icon: <Users size={22} color="#6B7280" />,
                  title: 'Manage teachers',
                  desc: 'Update staff, subjects, and workload limits',
                  href: '/master-data',
                },
                {
                  icon: <FileText size={22} color="#6B7280" />,
                  title: 'Manage rooms',
                  desc: 'Add venues, set capacity, configure availability',
                  href: '/master-data',
                },
                {
                  icon: <BarChart2 size={22} color="#6B7280" />,
                  title: 'View reports',
                  desc: 'Workload analysis, room usage, conflict log',
                  href: '/timetable',
                },
              ].map(qa => (
                <a key={qa.title} href={qa.href} style={{ textDecoration: 'none' }}>
                  <div className="db-qa-card" style={{
                    background: '#fff', borderRadius: 10,
                    border: '1px solid #E5E7EB', padding: '18px 16px',
                    cursor: 'pointer',
                  }}>
                    <div style={{ marginBottom: 12 }}>{qa.icon}</div>
                    <div style={{ fontSize: 14, fontWeight: 700, color: '#13111E', marginBottom: 4 }}>{qa.title}</div>
                    <div style={{ fontSize: 12, color: '#9CA3AF', lineHeight: 1.55 }}>{qa.desc}</div>
                  </div>
                </a>
              ))}
            </div>
          </div>

        </main>
      </div>
    </div>
  )
}

// ── Timetable action button ─────────────────────────────────────
function TtBtn({ children, onClick, primary }: {
  children: React.ReactNode; onClick: () => void; primary?: boolean
}) {
  return (
    <button onClick={onClick} className="db-action-btn" style={{
      display: 'inline-flex', alignItems: 'center', gap: 5,
      padding: '6px 14px', borderRadius: 7, cursor: 'pointer',
      border: primary ? 'none' : '1px solid #E5E7EB',
      background: primary ? '#13111E' : '#fff',
      color: primary ? '#fff' : '#374151',
      fontSize: 13, fontWeight: 600, flexShrink: 0,
      fontFamily: 'inherit',
    }}>
      {children}
    </button>
  )
}
