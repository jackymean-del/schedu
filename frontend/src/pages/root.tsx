import { Outlet } from "@tanstack/react-router"
import { Topbar } from "@/components/layout/Topbar"
import { useTimetableStore } from "@/store/timetableStore"
import { AuthGuard } from "@/components/auth/AuthGuard"

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
  const isDashboard = path === '/dashboard'
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

  // These pages own their full-screen layout — no app topbar
  const inner = (isAuthPage || isDashboard || isHome || isMarketing)
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
