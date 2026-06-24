import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { RouterProvider } from '@tanstack/react-router'
import { ClerkProvider } from '@clerk/clerk-react'
import './index.css'
import { router } from './routeTree.gen'
import { CLERK_PUBLISHABLE_KEY } from './lib/clerk'
import { ClerkAuthSync } from './components/auth/ClerkAuthSync'
import { OnboardingGuide } from './components/OnboardingGuide'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 1000 * 60 * 5, retry: 1 },
  },
})

const app = (
  <QueryClientProvider client={queryClient}>
    <RouterProvider router={router} />
    {/* Global, route-independent: shows the org-setup guide on every page for
        signed-in users (gates itself on auth internally). */}
    <OnboardingGuide />
  </QueryClientProvider>
)

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {CLERK_PUBLISHABLE_KEY ? (
      <ClerkProvider publishableKey={CLERK_PUBLISHABLE_KEY} afterSignOutUrl="/login">
        <ClerkAuthSync />
        {app}
      </ClerkProvider>
    ) : (
      app
    )}
  </StrictMode>,
)
