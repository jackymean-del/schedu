import { useState } from 'react'
import {
  CalendarDays, LayoutDashboard, BookOpen, BarChart2,
  Users, Settings, HelpCircle, FileText, ChevronLeft,
  ChevronRight, LogOut, Sparkles, Calendar, CheckCircle2,
  Database,
} from 'lucide-react'
import { useAuthStore } from '@/store/authStore'

// ── Sidebar palette — Bhusku / SchedU White Lavender ──────────
const BG          = '#FFFFFF'   // Pure white sidebar
const BG_HOVER    = '#F5F2FF'   // Very light lavender hover
const BG_ACTIVE   = '#EDE9FF'   // Lavender mist (active)
const TEXT_DIM    = '#9CA3AF'   // Cool grey (inactive icons)
const TEXT_MID    = '#4B5275'   // Mid purple-grey (inactive labels)
const TEXT_ON     = '#13111E'   // Deep ink (active label)
const TEXT_ACT    = '#7C6FE0'   // Lavender (active icon)
const BORDER      = '#E8E4FF'   // Lavender border (divisions)
const BORDER_SOFT = '#F0EDFF'   // Softer divider
const ACCENT      = '#7C6FE0'   // Lavender Violet
const GROUP_LABEL = '#8B87AD'   // Group label text

interface NavItem {
  icon: React.ReactNode
  label: string
  href: string
  count?: number
}

const NAV_PRIMARY: NavItem[] = [
  { icon: <span />, label: 'Dashboard',   href: '/dashboard' },
  { icon: <span />, label: 'Schedule',    href: '/timetable' },
  { icon: <span />, label: 'Calendar',    href: '/calendar' },
  { icon: <span />, label: 'Master Data', href: '/master-data' },
  { icon: <span />, label: 'Insights',    href: '/insights' },
]

const NAV_SECONDARY: NavItem[] = [
  { icon: <span />, label: 'Users',        href: '/users' },
  { icon: <span />, label: 'Settings',     href: '/settings' },
  { icon: <span />, label: 'Profile',      href: '/profile' },
  { icon: <span />, label: 'Subscription', href: '/subscription' },
  { icon: <span />, label: 'Help',         href: '/support' },
]

interface AppSidebarProps {
  collapsed: boolean
  onToggle: () => void
}

export function AppSidebar({ collapsed, onToggle }: AppSidebarProps) {
  const { user, logout } = useAuthStore()
  const path = window.location.pathname + window.location.search
  const handleLogout = () => { logout(); window.location.href = '/login' }
  const W = collapsed ? 52 : 200

  const NavGroup = ({ label, items }: { label: string; items: NavItem[] }) => (
    <div style={{ marginBottom: 4 }}>
      {!collapsed && label && (
        <div style={{
          fontSize: 9, fontWeight: 700, letterSpacing: '0.12em',
          color: GROUP_LABEL, textTransform: 'uppercase',
          padding: '12px 16px 6px',
        }}>
          {label}
        </div>
      )}
      {collapsed && <div style={{ height: 10 }} />}

      {items.map(item => {
        // Active match for wizard items so /wizard, /master-data, etc. light up correctly
        const isActive = path === item.href ||
          (item.href !== '/dashboard' && item.href !== '/' && !item.href.includes('?') && path.startsWith(item.href))
        return (
          <a
            key={item.label}
            href={item.href}
            title={collapsed ? item.label : undefined}
            style={{
              display: 'flex', alignItems: 'center',
              gap: collapsed ? 0 : 10,
              padding: collapsed ? '8px 0' : '8px 16px',
              margin: '1px 4px',
              borderRadius: 7,
              textDecoration: 'none',
              background: isActive ? BG_ACTIVE : 'transparent',
              color: isActive ? TEXT_ON : TEXT_MID,
              fontWeight: isActive ? 700 : 500,
              fontSize: 13,
              justifyContent: collapsed ? 'center' : 'flex-start',
              transition: 'background 0.12s, color 0.12s',
            }}
            onMouseEnter={e => {
              if (!isActive) (e.currentTarget as HTMLAnchorElement).style.background = BG_HOVER
            }}
            onMouseLeave={e => {
              if (!isActive) (e.currentTarget as HTMLAnchorElement).style.background = 'transparent'
            }}
          >
            {/* Bullet-dot indicator — purple when active, soft when inactive */}
            <span style={{
              flexShrink: 0,
              width: 7, height: 7, borderRadius: '50%',
              background: isActive ? ACCENT : '#D8D2FF',
              boxShadow: isActive ? `0 0 0 3px rgba(124,111,224,0.18)` : 'none',
              transition: 'all 0.15s',
            }} />
            {!collapsed && (
              <span style={{ flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', letterSpacing: '-0.1px' }}>
                {item.label}
              </span>
            )}
          </a>
        )
      })}
    </div>
  )

  return (
    <aside style={{
      width: W, flexShrink: 0,
      height: '100vh', position: 'sticky', top: 0,
      background: BG, borderRight: `1px solid ${BORDER}`,
      display: 'flex', flexDirection: 'column',
      transition: 'width 0.2s ease', overflow: 'hidden',
      zIndex: 50,
    }}>

      {/* ── Logo ── */}
      <div style={{
        height: 56, display: 'flex', alignItems: 'center',
        padding: collapsed ? '0' : '0 16px',
        borderBottom: `1px solid ${BORDER}`, flexShrink: 0,
        justifyContent: collapsed ? 'center' : 'space-between',
      }}>
        {!collapsed ? (
          <>
            <a href="/dashboard" style={{ display: 'flex', alignItems: 'center', gap: 9, textDecoration: 'none' }}>
              {/* SchedU mark — the Fader U */}
              <div style={{ width: 32, height: 32, borderRadius: 8, background: ACCENT, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <svg width="20" height="20" viewBox="0 0 52 52" fill="none">
                  <path d="M 16 9 L 16 30 A 10 10 0 0 0 36 30 L 36 22" stroke="white" strokeWidth="8" fill="none" strokeLinecap="round"/>
                  <circle cx="36" cy="12.5" r="4.5" fill="#D4920E"/>
                </svg>
              </div>
              <div>
                <div style={{ fontFamily: "'Plus Jakarta Sans',sans-serif", fontSize: 17, fontWeight: 900, color: TEXT_ON, letterSpacing: '-0.6px', lineHeight: 1 }}>
                  Sched<span style={{ color: ACCENT, fontFamily: "'Plus Jakarta Sans',Georgia,serif", fontStyle: 'italic', fontSize: 18 }}>U</span>
                </div>
                <div style={{ fontSize: 8, fontWeight: 600, letterSpacing: '0.14em', textTransform: 'uppercase', color: GROUP_LABEL, lineHeight: 1, marginTop: 3 }}>Smart Scheduling</div>
              </div>
            </a>
            <button
              onClick={onToggle}
              title="Collapse sidebar"
              style={{
                width: 24, height: 24, borderRadius: 5,
                border: `1px solid ${BORDER}`, background: BG_HOVER,
                cursor: 'pointer', display: 'flex', alignItems: 'center',
                justifyContent: 'center', color: TEXT_DIM,
              }}
            >
              <ChevronLeft size={12} />
            </button>
          </>
        ) : (
          <a href="/dashboard" style={{ textDecoration: 'none' }} title="SchedU — Dashboard">
            <div style={{ width: 30, height: 30, borderRadius: 8, background: ACCENT, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <svg width="19" height="19" viewBox="0 0 52 52" fill="none">
                <path d="M 16 9 L 16 30 A 10 10 0 0 0 36 30 L 36 22" stroke="white" strokeWidth="8" fill="none" strokeLinecap="round"/>
                <circle cx="36" cy="12.5" r="4.5" fill="#D4920E"/>
              </svg>
            </div>
          </a>
        )}
      </div>

      {/* ── Expand button when collapsed ── */}
      {collapsed && (
        <button onClick={onToggle} title="Expand"
          style={{
            margin: '8px auto 4px', width: 34, height: 26, borderRadius: 6,
            border: `1px solid ${BORDER}`, background: BG_HOVER,
            cursor: 'pointer', display: 'flex', alignItems: 'center',
            justifyContent: 'center', color: TEXT_DIM,
          }}>
          <ChevronRight size={12} />
        </button>
      )}

      {/* ── User / school info ── */}
      {!collapsed && user && (
        <div style={{
          padding: '12px 16px', borderBottom: `1px solid ${BORDER}`,
          flexShrink: 0,
        }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: GROUP_LABEL, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4 }}>
            My Workspace
          </div>
          <div style={{ fontSize: 12, color: TEXT_ON, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {user.schoolName || user.name}
          </div>
          {user.schoolName && (
            <div style={{ fontSize: 10, color: GROUP_LABEL, marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {user.name}
            </div>
          )}
        </div>
      )}

      {/* ── New Schedule CTA ── */}
      <div style={{ padding: collapsed ? '10px 6px' : '12px 10px', flexShrink: 0 }}>
        <a href="/dashboard?new=1" title={collapsed ? 'New Schedule' : undefined} style={{ textDecoration: 'none' }}>
          <button style={{
            width: '100%', padding: collapsed ? '8px 0' : '8px 12px',
            borderRadius: 8, border: 'none',
            background: ACCENT,
            color: '#fff', fontWeight: 600, fontSize: 12, cursor: 'pointer',
            display: 'flex', alignItems: 'center',
            justifyContent: collapsed ? 'center' : 'center',
            gap: 6,
          }}>
            <Sparkles size={13} />
            {!collapsed && 'New Schedule'}
          </button>
        </a>
      </div>

      {/* ── Nav (bullet-pill, two groups separated by hairline) ── */}
      <nav style={{ flex: 1, overflowY: 'auto', paddingTop: 12 }}>
        <NavGroup label="" items={NAV_PRIMARY} />
        <div style={{ height: 1, background: BORDER, margin: '12px 14px' }} />
        <NavGroup label="" items={NAV_SECONDARY} />
      </nav>

      {/* ── User card ── */}
      {user && (
        <div style={{
          borderTop: `1px solid ${BORDER}`,
          padding: collapsed ? '10px 0' : '10px 12px',
          display: 'flex', alignItems: 'center',
          gap: collapsed ? 0 : 9,
          justifyContent: collapsed ? 'center' : 'flex-start',
          flexShrink: 0,
        }}>
          <div
            style={{
              width: 32, height: 32, borderRadius: '50%',
              background: ACCENT, display: 'flex', alignItems: 'center',
              justifyContent: 'center', color: '#fff', fontSize: 12,
              fontWeight: 700, flexShrink: 0, cursor: collapsed ? 'pointer' : 'default',
            }}
            title={collapsed ? `${user.name} — Logout` : undefined}
            onClick={collapsed ? handleLogout : undefined}
          >
            {user.name[0].toUpperCase()}
          </div>

          {!collapsed && (
            <>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: TEXT_ON, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {user.name}
                </div>
                <div style={{ fontSize: 10, color: TEXT_DIM, marginTop: 1 }}>Owner</div>
              </div>
              <button
                onClick={handleLogout}
                title="Logout"
                style={{
                  background: 'none', border: 'none', cursor: 'pointer',
                  color: TEXT_DIM, padding: 4, display: 'flex', alignItems: 'center',
                  borderRadius: 5,
                }}
                onMouseEnter={e => (e.currentTarget as HTMLButtonElement).style.color = '#ef4444'}
                onMouseLeave={e => (e.currentTarget as HTMLButtonElement).style.color = TEXT_DIM}
              >
                <LogOut size={14} />
              </button>
            </>
          )}
        </div>
      )}
    </aside>
  )
}
