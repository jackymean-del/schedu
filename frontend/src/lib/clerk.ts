/**
 * Clerk configuration. Real authentication is active only when a publishable
 * key is provided (VITE_CLERK_PUBLISHABLE_KEY). Without it the app falls back
 * to the local mock auth store so dev/builds keep working.
 */
export const CLERK_PUBLISHABLE_KEY = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY as string | undefined
export const CLERK_ENABLED = !!CLERK_PUBLISHABLE_KEY

/** Pull a human-readable message out of a Clerk (or generic) error. */
export function authErrorMessage(err: unknown, fallback = 'Something went wrong. Please try again.'): string {
  const e = err as { errors?: Array<{ longMessage?: string; message?: string }>; message?: string }
  return e?.errors?.[0]?.longMessage || e?.errors?.[0]?.message || e?.message || fallback
}
