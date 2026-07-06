/**
 * The Vite SPA lives on its own subdomain now (marketing owns the root
 * domain). Cross-origin means this site can't read the app's auth state from
 * localStorage — so every CTA points at /login unconditionally. The app's own
 * login page already redirects an already-signed-in visitor to /dashboard
 * (frontend/src/pages/login.tsx), so this still lands the user in the right
 * place without needing shared auth state.
 */
export const APP_URL = 'https://app.schedu.bhusku.com'

export function appHref(path: string = '/login'): string {
  return `${APP_URL}${path}`
}
