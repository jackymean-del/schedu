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
import { useEffect, useState } from 'react'
import { useBillingLive } from '@/lib/billingConfig'
import {
  Home, CalendarDays, Calendar, BarChart2, Users, Database, Settings,
  LifeBuoy, BookOpen, Video, ChevronLeft, ChevronRight, Zap, LogOut, Menu, X,
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
      { icon: BookOpen,     label: 'Syllabus',  href: '/syllabus' },
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
      // Docs live on the marketing site since the domain split. Open them in
      // a new tab — navigating this tab there would drop a signed-in user
      // into logged-out marketing chrome and look like being signed out.
      { icon: BookOpen, label: 'Documentation',  href: 'https://schedu.bhusku.com/docs', external: true },
      { icon: Video,    label: 'Book a Demo',     href: '/demo' },
    ],
  },
]

const W_OPEN = 224
const W_SHUT = 64
/**
 * Below this the sidebar stops being a column and becomes an overlay.
 *
 * At 375px it was taking 224px — sixty percent of the screen — leaving 151px
 * for content that needed 540, clipped with no way to scroll to it. The
 * dashboard's own "Fix venues" button was off-screen and unreachable. A phone
 * has no room for a permanent nav rail.
 */
const OVERLAY_BELOW = 900
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
  const billingLive = useBillingLive()
  const { user, logout } = useAuthStore()
  const [narrow, setNarrow] = useState(() =>
    typeof window !== 'undefined' && window.innerWidth < OVERLAY_BELOW)
  useEffect(() => {
    const onResize = () => setNarrow(window.innerWidth < OVERLAY_BELOW)
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  // On a phone the nav starts out of the way; on a desktop it remembers what
  // the person chose last time.
  const [open, setOpen] = useState(() => {
    try {
      if (typeof window !== 'undefined' && window.innerWidth < OVERLAY_BELOW) return false
      return localStorage.getItem(COLLAPSE_KEY) !== '1'
    } catch { return true }
  })
  const toggle = () => setOpen(o => {
    const next = !o
    // Only remember the choice where it is a layout preference. On a phone it
    // is a transient "show me the menu", and persisting it would reopen the
    // overlay over the content on every page load.
    if (!narrow) { try { localStorage.setItem(COLLAPSE_KEY, next ? '0' : '1') } catch { /* ignore */ } }
    return next
  })
  // Following a link on a phone should put the menu away again.
  const closeIfNarrow = () => { if (narrow) setOpen(false) }

  const path = typeof window !== 'undefined' ? window.location.pathname : ''
  const active = activeHref(path)
  // Overlaid, the sidebar takes no layout width at all — content gets the
  // whole screen and the nav floats above it.
  const W = open ? W_OPEN : W_SHUT
  const asideW = narrow ? W_OPEN : W
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

      {/* Backdrop — tapping away closes the menu, the behaviour every phone
          user already expects. */}
      {narrow && open && (
        <div onClick={() => setOpen(false)} style={{
          position: 'fixed', inset: 0, zIndex: 40, background: 'rgba(19,17,30,0.45)',
        }} />
      )}

      <aside style={{
        width: asideW, flexShrink: 0, background: '#fff', borderRight: '1px solid #ECE9FB',
        // Overlaid and fully off-screen when closed: a phone has no room for
        // even an icon rail once a timetable grid is on screen.
        ...(narrow ? {
          position: 'fixed', insetBlock: 0, left: 0, zIndex: 50,
          transform: open ? 'translateX(0)' : 'translateX(-100%)',
          transition: 'transform .22s cubic-bezier(0.4,0,0.2,1)',
          boxShadow: open ? '0 0 40px rgba(0,0,0,0.28)' : 'none',
        } : null),
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
          <button onClick={toggle} title={open ? 'Collapse' : 'Expand'} aria-label={open ? 'Collapse menu' : 'Expand menu'} aria-expanded={open} className="as-icon" style={{
            width: 30, height: 30, borderRadius: 8, flexShrink: 0, background: 'none', border: 'none',
            cursor: 'pointer', color: '#6D6A8A', display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            {open ? <ChevronLeft size={16} /> : <ChevronRight size={16} />}
          </button>
        </div>

        {/* Nav */}
        <nav style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden', padding: '10px 8px 0' }}>
          {SECTIONS.map((section, si) => (
            <div key={section.heading} style={{ marginBottom: si < SECTIONS.length - 1 ? 10 : 0 }}>
              {open
                ? <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.08em', color: '#777489', padding: '10px 10px 4px', userSelect: 'none' }}>{section.heading}</div>
                : si > 0 && <div style={{ height: 1, background: '#F3F1FB', margin: '8px 10px' }} />}
              {section.items.map(item => {
                const isActive = active === item.href
                const Icon = item.icon
                return (
                  <a key={item.href} href={item.href} className="as-item" onClick={closeIfNarrow}
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
                    <Icon size={18} style={{ flexShrink: 0, color: isActive ? '#7C6FE0' : '#6D6A8A' }} />
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
                <div style={{ fontSize: 11, color: '#6B7079', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{user?.email ?? ''}</div>
              </div>
            )}
            {open && (
              <button onClick={() => { logout(); window.location.href = '/login' }} title="Log out" aria-label="Log out" className="as-icon"
                style={{ width: 28, height: 28, borderRadius: 7, flexShrink: 0, background: 'none', border: 'none', cursor: 'pointer', color: '#6B7079', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <LogOut size={15} />
              </button>
            )}
          </div>
          {open && (
            <a href="/subscription" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#F9F8FF', borderRadius: 9, border: '1px solid #EDE9FF', padding: '7px 10px', textDecoration: 'none', gap: 8 }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
                <Zap size={13} color="#7C6FE0" />
                {/* An "Upgrade" button that leads to a page with nothing to buy
                    is a dead end, so it only appears once payments are live. */}
                <span style={{ fontSize: 12, fontWeight: 600, color: '#7C6FE0', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {billingLive ? 'Free Plan' : 'Free — early access'}
                </span>
              </span>
              {billingLive && (
                <span className="as-upgrade" style={{ padding: '4px 12px', borderRadius: 6, background: '#7C6FE0', color: '#fff', fontSize: 12, fontWeight: 700 }}>Upgrade</span>
              )}
            </a>
          )}
        </div>
      </aside>

      {/* Without this a phone has NO navigation at all once the rail is
          hidden. Floats over the page rather than pushing content, so it costs
          no layout width. */}
      {narrow && !open && (
        <button onClick={() => setOpen(true)} aria-label="Open menu" style={{
          position: 'fixed', top: 10, left: 10, zIndex: 45,
          width: 40, height: 40, borderRadius: 11,
          background: '#fff', border: '1px solid #ECE9FB',
          boxShadow: '0 4px 14px rgba(19,17,30,0.12)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          cursor: 'pointer', color: '#4B5275',
        }}>
          <Menu size={19} />
        </button>
      )}

      <main style={{ flex: 1, minWidth: 0, height: '100vh', overflowY: 'auto' }}>
        {children}
      </main>
    </div>
  )
}
