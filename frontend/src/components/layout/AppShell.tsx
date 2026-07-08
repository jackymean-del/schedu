/**
 * AppShell — the single, persistent chrome for every signed-in page.
 *
 * Before this, only the dashboard had a sidebar; every other page fell back to
 * a bare top bar, so navigation "vanished" as soon as you left the dashboard.
 * Now one collapsible left sidebar wraps all app pages (Calendar, Insights,
 * Resources, Settings, the schedule view…), with the current page highlighted
 * automatically from the URL. Content renders in a scrollable main area; each
 * page still owns its own header and body.
 *
 * Collapsed state persists across navigations (localStorage).
 */
import { useState } from 'react'
import {
  Home, CalendarDays, Calendar, BarChart2, Users, Database, Settings,
  LifeBuoy, BookOpen, Video, ChevronLeft, ChevronRight, Zap, LogOut,
} from 'lucide-react'
import { useAuthStore, openUserProfile } from '@/store/authStore'
import { CLERK_ENABLED } from '@/lib/clerk'

interface NavItem { icon: React.ElementType; label: string; href: string; external?: boolean }
interface NavSection { heading: string; items: NavItem[] }

const SECTIONS: NavSection[] = [
  {
    heading: 'WORKSPACE',
    items: [
      { icon: Home,         label: 'Dashboard', href: '/dashboard' },
      { icon: CalendarDays, label: 'Schedules', href: '/wizard' },
      { icon: Calendar,     label: 'Calendar',  href: '/calendar' },
      { icon: BarChart2,    label: 'Insights',  href: '/insights' },
    ],
  },
  {
    heading: 'ADMINISTRATION',
    items: [
      { icon: Users,    label: 'Users',     href: '/users' },
      { icon: Database, label: 'Resources', href: '/master-data' },
      { icon: Settings, label: 'Settings',  href: '/settings' },
    ],
  },
  {
    heading: 'HELP & SUPPORT',
    items: [
      { icon: LifeBuoy, label: 'Support Center', href: '/support' },
      { icon: BookOpen, label: 'Documentation',  href: '/docs' },
      { icon: Video,    label: 'Book a Demo',     href: '/demo' },
    ],
  },
]

const W_OPEN = 224
const W_SHUT = 64
const TRANSITION = 'width 0.2s cubic-bezier(0.4,0,0.2,1)'
const COLLAPSE_KEY = 'schedu-sidebar-collapsed'

/** Longest-prefix match so /master-data highlights Resources, /docs/x highlights Docs. */
function activeHref(path: string): string {
  let best = ''
  for (const s of SECTIONS) for (const it of s.items) {
    if ((path === it.href || path.startsWith(it.href + '/')) && it.href.length > best.length) best = it.href
  }
  return best
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const { user, logout } = useAuthStore()
  const [open, setOpen] = useState(() => {
    try { return localStorage.getItem(COLLAPSE_KEY) !== '1' } catch { return true }
  })
  const toggle = () => setOpen(o => {
    const next = !o
    try { localStorage.setItem(COLLAPSE_KEY, next ? '0' : '1') } catch { /* ignore */ }
    return next
  })

  const path = typeof window !== 'undefined' ? window.location.pathname : ''
  const active = activeHref(path)
  const W = open ? W_OPEN : W_SHUT
  const initials = (user?.name ?? 'U').split(' ').map(p => p[0]).slice(0, 2).join('').toUpperCase()

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden', background: '#F5F2FF' }}>
      <style>{`
        .as-item { transition: background .13s, color .13s; text-decoration: none; }
        .as-item:hover { background: #F0EDFF; }
        .as-upgrade { transition: background .14s; }
        .as-upgrade:hover { background: #6655CC; }
        .as-icon { transition: background .12s; }
        .as-icon:hover { background: #F0EDFF; }
      `}</style>

      <aside style={{
        width: W, flexShrink: 0, background: '#fff', borderRight: '1px solid #ECE9FB',
        display: 'flex', flexDirection: 'column', transition: TRANSITION, overflow: 'hidden',
      }}>
        {/* Brand + collapse */}
        <div style={{
          height: 56, flexShrink: 0, display: 'flex', alignItems: 'center',
          gap: 9, padding: open ? '0 10px 0 14px' : '0', justifyContent: open ? 'space-between' : 'center',
          borderBottom: '1px solid #F3F1FB',
        }}>
          {open && (
            <a href="/dashboard" style={{ textDecoration: 'none', lineHeight: 1, display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ width: 26, height: 26, borderRadius: 7, background: '#7C6FE0', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
                <svg width="15" height="15" viewBox="0 0 52 52" fill="none">
                  <path d="M 16 9 L 16 30 A 10 10 0 0 0 36 30 L 36 22" stroke="white" strokeWidth="8" fill="none" strokeLinecap="round"/>
                  <circle cx="36" cy="12.5" r="4.5" fill="#D4920E"/>
                </svg>
              </span>
              <span style={{ fontSize: 15, fontWeight: 900, letterSpacing: '-0.3px', color: '#13111E' }}>
                sched<span style={{ color: '#7C6FE0', fontFamily: "'Plus Jakarta Sans',Georgia,serif", fontStyle: 'italic' }}>U</span>
              </span>
            </a>
          )}
          <button onClick={toggle} title={open ? 'Collapse' : 'Expand'} className="as-icon" style={{
            width: 30, height: 30, borderRadius: 8, flexShrink: 0, background: 'none', border: 'none',
            cursor: 'pointer', color: '#8B87AD', display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            {open ? <ChevronLeft size={16} /> : <ChevronRight size={16} />}
          </button>
        </div>

        {/* Nav */}
        <nav style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden', padding: '10px 8px 0' }}>
          {SECTIONS.map((section, si) => (
            <div key={section.heading} style={{ marginBottom: si < SECTIONS.length - 1 ? 10 : 0 }}>
              {open
                ? <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.08em', color: '#B5B0CF', padding: '10px 10px 4px', userSelect: 'none' }}>{section.heading}</div>
                : si > 0 && <div style={{ height: 1, background: '#F3F1FB', margin: '8px 10px' }} />}
              {section.items.map(item => {
                const isActive = active === item.href
                const Icon = item.icon
                return (
                  <a key={item.href} href={item.href} className="as-item"
                    title={!open ? item.label : undefined}
                    target={item.external ? '_blank' : undefined}
                    rel={item.external ? 'noopener noreferrer' : undefined}
                    style={{
                      display: 'flex', alignItems: 'center', gap: open ? 11 : 0,
                      justifyContent: open ? 'flex-start' : 'center',
                      padding: open ? '9px 10px' : '10px 0', margin: '0 0 2px', borderRadius: 9,
                      background: isActive ? '#EDE9FF' : 'none', color: isActive ? '#7C6FE0' : '#4B5563',
                      overflow: 'hidden', minWidth: 0,
                    }}>
                    <Icon size={18} style={{ flexShrink: 0, color: isActive ? '#7C6FE0' : '#8B87AD' }} />
                    {open && <span style={{ fontSize: 13.5, fontWeight: isActive ? 700 : 500, whiteSpace: 'nowrap' }}>{item.label}</span>}
                  </a>
                )
              })}
            </div>
          ))}
        </nav>

        {/* Account */}
        <div style={{ borderTop: '1px solid #F3F1FB', padding: open ? '10px 12px' : '10px 8px', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: open ? 10 : 0, justifyContent: open ? 'flex-start' : 'center', marginBottom: open ? 8 : 0 }}>
            <button onClick={CLERK_ENABLED ? openUserProfile : undefined}
              title={CLERK_ENABLED ? 'Edit profile' : undefined}
              style={{ width: 32, height: 32, borderRadius: '50%', background: '#7C6FE0', color: '#fff', border: 'none', cursor: CLERK_ENABLED ? 'pointer' : 'default', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, flexShrink: 0 }}>
              {initials}
            </button>
            {open && (
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: '#13111E', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{user?.name ?? 'User'}</div>
                <div style={{ fontSize: 11, color: '#9CA3AF', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{user?.email ?? ''}</div>
              </div>
            )}
            {open && (
              <button onClick={() => { logout(); window.location.href = '/login' }} title="Log out" className="as-icon"
                style={{ width: 28, height: 28, borderRadius: 7, flexShrink: 0, background: 'none', border: 'none', cursor: 'pointer', color: '#9CA3AF', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <LogOut size={15} />
              </button>
            )}
          </div>
          {open && (
            <a href="/subscription" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#F9F8FF', borderRadius: 9, border: '1px solid #EDE9FF', padding: '7px 10px', textDecoration: 'none' }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <Zap size={13} color="#7C6FE0" />
                <span style={{ fontSize: 12, fontWeight: 600, color: '#7C6FE0' }}>Free Plan</span>
              </span>
              <span className="as-upgrade" style={{ padding: '4px 12px', borderRadius: 6, background: '#7C6FE0', color: '#fff', fontSize: 12, fontWeight: 700 }}>Upgrade</span>
            </a>
          )}
        </div>
      </aside>

      <main style={{ flex: 1, minWidth: 0, height: '100vh', overflowY: 'auto' }}>
        {children}
      </main>
    </div>
  )
}
