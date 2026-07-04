import { createRootRoute, createRoute, createRouter, lazyRouteComponent } from "@tanstack/react-router"
import { RootLayout }    from "./pages/root"
import { HomePage }      from "./pages/home"
import { LoginPage }     from "./pages/login"
import { RegisterPage }  from "./pages/register"
import { TimetablePage }  from "./pages/timetable"
import { DemoPage }       from "./pages/demo"
import { FeaturesPage }  from "./pages/features"
import { PricingPage }   from "./pages/pricing"
import { DocsPage }      from "./pages/docs"
import { DocArticlePage } from "./pages/doc-article"
import { ContactPage }   from "./pages/contact"
import { SharedTimetablePage } from "./pages/shared-timetable"
import { SSOCallbackPage } from "./pages/sso-callback"
import { UsersPage }     from "./pages/users"
import { SupportPage }      from "./pages/support"
import { GuidePage }        from "./pages/guide"
import { ProfilePage }      from "./pages/profile"
import { SubscriptionPage } from "./pages/subscription"
import { ConfigurePage }    from "./pages/configure"
import { RouteLoadingFallback } from "./components/RouteLoadingFallback"

// Heavier app-console pages are route-split: none of their code (including
// downstream libs like AG Grid/xlsx pulled in by the wizard) is in the chunk
// a homepage/marketing visitor downloads. `pendingComponent` gives each route
// its OWN Suspense boundary (see TanStack Router's Match.js), so only the
// route content — not the surrounding AppShell — shows the loading fallback.
const DashboardPage  = lazyRouteComponent(() => import("./pages/dashboard"), "DashboardPage")
const WizardPage     = lazyRouteComponent(() => import("./pages/wizard"), "WizardPage")
const MasterDataPage = lazyRouteComponent(() => import("./pages/master-data"), "MasterDataPage")
const SettingsPage   = lazyRouteComponent(() => import("./pages/settings"), "SettingsPage")
const InsightsPage   = lazyRouteComponent(() => import("./pages/insights"), "InsightsPage")
const CalendarPage   = lazyRouteComponent(() => import("./pages/calendar"), "CalendarPage")

const rootRoute      = createRootRoute({ component: RootLayout })
const indexRoute     = createRoute({ getParentRoute: () => rootRoute, path: "/",           component: HomePage })
const loginRoute     = createRoute({ getParentRoute: () => rootRoute, path: "/login",      component: LoginPage })
const registerRoute  = createRoute({ getParentRoute: () => rootRoute, path: "/register",   component: RegisterPage })
const dashboardRoute  = createRoute({ getParentRoute: () => rootRoute, path: "/dashboard",   component: DashboardPage, pendingComponent: RouteLoadingFallback })
const wizardRoute     = createRoute({ getParentRoute: () => rootRoute, path: "/wizard",      component: WizardPage, pendingComponent: RouteLoadingFallback })
const timetableRoute  = createRoute({ getParentRoute: () => rootRoute, path: "/timetable",   component: TimetablePage })
const demoRoute       = createRoute({ getParentRoute: () => rootRoute, path: "/demo",        component: DemoPage })
const masterDataRoute = createRoute({ getParentRoute: () => rootRoute, path: "/master-data", component: MasterDataPage, pendingComponent: RouteLoadingFallback })
const featuresRoute   = createRoute({ getParentRoute: () => rootRoute, path: "/features",    component: FeaturesPage })
const pricingRoute    = createRoute({ getParentRoute: () => rootRoute, path: "/pricing",     component: PricingPage })
const docsRoute       = createRoute({ getParentRoute: () => rootRoute, path: "/docs",        component: DocsPage })
const docArticleRoute = createRoute({ getParentRoute: () => rootRoute, path: "/docs/$slug",  component: DocArticlePage })
const contactRoute    = createRoute({ getParentRoute: () => rootRoute, path: "/contact",     component: ContactPage })
const sharedRoute     = createRoute({ getParentRoute: () => rootRoute, path: "/share/$token", component: SharedTimetablePage })
const ssoCallbackRoute = createRoute({ getParentRoute: () => rootRoute, path: "/sso-callback", component: SSOCallbackPage })
const settingsRoute   = createRoute({ getParentRoute: () => rootRoute, path: "/settings",   component: SettingsPage, pendingComponent: RouteLoadingFallback })
const insightsRoute   = createRoute({ getParentRoute: () => rootRoute, path: "/insights",   component: InsightsPage, pendingComponent: RouteLoadingFallback })
const usersRoute      = createRoute({ getParentRoute: () => rootRoute, path: "/users",      component: UsersPage })
const calendarRoute      = createRoute({ getParentRoute: () => rootRoute, path: "/calendar",      component: CalendarPage, pendingComponent: RouteLoadingFallback })
const supportRoute       = createRoute({ getParentRoute: () => rootRoute, path: "/support",       component: SupportPage })
const guideRoute         = createRoute({ getParentRoute: () => rootRoute, path: "/guide",         component: GuidePage })
const profileRoute       = createRoute({ getParentRoute: () => rootRoute, path: "/profile",       component: ProfilePage })
const subscriptionRoute  = createRoute({ getParentRoute: () => rootRoute, path: "/subscription",  component: SubscriptionPage })
const configureRoute     = createRoute({ getParentRoute: () => rootRoute, path: "/configure",     component: ConfigurePage })

export const routeTree = rootRoute.addChildren([
  indexRoute, loginRoute, registerRoute, dashboardRoute,
  wizardRoute, timetableRoute, demoRoute, masterDataRoute,
  featuresRoute, pricingRoute, docsRoute, docArticleRoute, contactRoute,
  sharedRoute, ssoCallbackRoute,
  settingsRoute, insightsRoute, usersRoute, calendarRoute, supportRoute,
  guideRoute, profileRoute, subscriptionRoute, configureRoute,
])
export const router = createRouter({ routeTree })

declare module "@tanstack/react-router" {
  interface Register { router: typeof router }
}
