import { useEffect } from 'react'

/**
 * Sends the browser to the same path on the live marketing site
 * (schedu.bhusku.com) and shows a minimal placeholder while it happens.
 *
 * Why: the app carries its own copies of the public marketing pages
 * (home / features / pricing / docs / contact). In PRODUCTION these are already
 * 301-redirected to the marketing site by frontend/vercel.json, so real users
 * never see them — but in local dev / demo (mock-auth) they render the app's own
 * copies, which have drifted from the real site. Deferring to the marketing site
 * at runtime too makes demo show EXACTLY what production shows, and leaves a
 * single source of truth for marketing content (it can never drift again).
 *
 * The current path + query are mirrored, so `/pricing` → `.../pricing`,
 * `/docs/foo` → `.../docs/foo`, `/` → `.../`.
 */
const MARKETING_ORIGIN = 'https://schedu.bhusku.com'

export function MarketingRedirect() {
  useEffect(() => {
    const { pathname, search } = window.location
    window.location.replace(`${MARKETING_ORIGIN}${pathname}${search}`)
  }, [])

  return (
    <div
      style={{
        minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: '#F5F4F0', color: '#8B87AD', fontFamily: "'Plus Jakarta Sans', -apple-system, sans-serif",
        fontSize: 14,
      }}
    >
      Taking you to schedU…
    </div>
  )
}
