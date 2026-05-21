import { Outlet } from "@tanstack/react-router"
import { Topbar } from "@/components/layout/Topbar"
import { useTimetableStore } from "@/store/timetableStore"

const STEP_LABELS = [
  'Shifts & Timing',
  'Resources',
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

  // These pages own their full-screen layout — no app topbar
  if (isAuthPage || isDashboard || isHome) return <Outlet />

  return (
    <div style={{ minHeight:'100vh', background:'#F9F8FF', display:'flex', flexDirection:'column' }}>
      <Topbar
        step={isWizard ? step : undefined}
        totalSteps={isWizard ? 5 : undefined}
        stepLabel={isWizard ? STEP_LABELS[step - 1] : undefined}
      />
      <Outlet />
    </div>
  )
}
