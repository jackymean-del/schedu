import { useEffect } from "react"
import { Outlet } from "@tanstack/react-router"
import { Topbar } from "@/components/layout/Topbar"
import { useTimetableStore } from "@/store/timetableStore"
import { AuthGuard } from "@/components/auth/AuthGuard"
import { AppShell } from "@/components/layout/AppShell"
import { useAuthStore } from "@/store/authStore"
import { useMembers } from "@/store/members"
import { wizardStepLabel, WIZARD_STEP_COUNT } from "@/lib/wizardSteps"
import { migrateLegacyLeaves } from "@/lib/leaveUtils"
import { migrateLegacyEvents } from "@/lib/schoolEvents"
import { migrateLegacyAssignments } from "@/lib/freeAssignments"
import { migrateLegacyPullouts } from "@/lib/urgentReassignments"
import { migrateLegacyNaming } from "@/lib/terms"
import { migrateLegacySubstitutions } from "@/lib/substitutionKeys"

// These were all stored per signed-in account and are all facts about the
// SCHOOL — see lib/schoolScope. Fold any such records into the school-wide
// stores once, before anything reads them.
migrateLegacyLeaves()
migrateLegacyEvents()
migrateLegacyAssignments()
migrateLegacyPullouts()
migrateLegacyNaming()

// Substitutions used to be keyed by weekday, which made a one-off cover repeat
// every week. Move any that remain onto real dates before anything reads them.
{
  const moved = migrateLegacySubstitutions()
  if (moved) console.info(`schedU: moved ${moved} weekday-keyed substitution(s) onto dates`)
}

// Must mirror pages/wizard.tsx STEP_META — Groups & Combos precedes Mapping
// (Blueprint v6: Mapping depends on the parallel-subject rules).

export function RootLayout() {
  const step = useTimetableStore(s => s.step)
  const path = window.location.pathname

  // Record whoever signs in on the school roster, so an administrator can see
  // them and set a role. Done here rather than in each of the auth store's
  // sign-in paths because this also catches Clerk sessions restored on load.
  // The first person through the door becomes the administrator — see
  // store/members.ensureMember.
  const authedUser = useAuthStore(s => s.user)
  const ensureMember = useMembers(s => s.ensureMember)
  useEffect(() => {
    if (authedUser?.email) ensureMember(authedUser.email, authedUser.name)
  }, [authedUser?.email, authedUser?.name, ensureMember])
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
    '/guide', '/profile', '/subscription', '/configure', '/syllabus', '/board']
  const isProtected = PROTECTED.some(p => path === p || path.startsWith(p + '/'))

  // The corridor display fills the screen it lives on: no sidebar, no topbar,
  // nothing to click. Chrome on a wall-mounted board is wasted pixels.
  const isBoard = path === '/board'

  // Signed-in app pages (everything protected except the wizard and the board,
  // which run their own focused chrome) share the persistent AppShell sidebar.
  const isAppShell = isProtected && !isWizard && !isBoard

  if (isAppShell) {
    return <AuthGuard><AppShell><Outlet /></AppShell></AuthGuard>
  }

  // Auth / home / marketing pages own their full-screen layout; the wizard and
  // any other page get the slim topbar.
  const inner = (isAuthPage || isHome || isMarketing || isBoard)
    ? <Outlet />
    : (
      <div style={{ minHeight:'100vh', background:'#F9F8FF', display:'flex', flexDirection:'column' }}>
        <Topbar
          step={isWizard ? step : undefined}
          totalSteps={isWizard ? WIZARD_STEP_COUNT : undefined}
          stepLabel={isWizard ? wizardStepLabel(step) : undefined}
        />
        <Outlet />
      </div>
    )

  return isProtected ? <AuthGuard>{inner}</AuthGuard> : inner
}
