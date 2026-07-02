import { Outlet } from "@tanstack/react-router"
import { Topbar } from "@/components/layout/Topbar"
import { useTimetableStore } from "@/store/timetableStore"
import { AuthGuard } from "@/components/auth/AuthGuard"
import { AppShell } from "@/components/layout/AppShell"

const STEP_LABELS = [
  'Resources',
  'Shifts & Timing',
  'Allocation',
  'Student Groups',
  'Generate',
]

export function RootLayout() {
  const step = useTimetableStore(s => s.step)
  const path = window.location.pathname
  const isWizard    = path.startsWith('/wizard')
  const isAuthPage  = path === '/login' || path === '/register'
  const isHome      = path === '/'
  // Public marketing pages bring their own nav/footer (MarketingChrome)
  const isMarketing =
    ['/features', '/pricing', '/docs', '/contact'].includes(path) ||
    path.startsWith('/docs/') ||
    path.startsWith('/share/') // public read-only timetable viewer

  // Pages requiring a signed-in user (real auth via Clerk; open in mock mode).
  const PROTECTED = ['/dashboard', '/wizard', '/timetable', '/master-data',
    '/settings', '/insights', '/users', '/calendar', '/support',
    '/guide', '/profile', '/subscription', '/configure']
  const isProtected = PROTECTED.some(p => path === p || path.startsWith(p + '/'))

  // Signed-in app pages (everything protected except the wizard, which runs its
  // own focused chrome) share the persistent AppShell sidebar.
  const isAppShell = isProtected && !isWizard

  if (isAppShell) {
    return <AuthGuard><AppShell><Outlet /></AppShell></AuthGuard>
  }

  // Auth / home / marketing pages own their full-screen layout; the wizard and
  // any other page get the slim topbar.
  const inner = (isAuthPage || isHome || isMarketing)
    ? <Outlet />
    : (
      <div style={{ minHeight:'100vh', background:'#F9F8FF', display:'flex', flexDirection:'column' }}>
        <Topbar
          step={isWizard ? step : undefined}
          totalSteps={isWizard ? 5 : undefined}
          stepLabel={isWizard ? STEP_LABELS[step - 1] : undefined}
        />
        <Outlet />
      </div>
    )

  return isProtected ? <AuthGuard>{inner}</AuthGuard> : inner
}
