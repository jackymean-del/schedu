import { useEffect, useState } from 'react'

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
  // True when this shell is running ON the marketing origin — see the guard
  // below. It means the visitor is looking at a stale copy of the app where the
  // marketing site should be.
  const [stranded, setStranded] = useState(false)

  useEffect(() => {
    const { origin, pathname, search } = window.location
    // Guard against a redirect loop: if the app shell is ever served ON the
    // marketing origin itself (a stale browser cache, or an apex regression
    // serving app HTML), redirecting to the same origin would reload the shell
    // forever. Only redirect when we're on a DIFFERENT origin (app/localhost).
    if (origin === MARKETING_ORIGIN) { setStranded(true); return }
    window.location.replace(`${MARKETING_ORIGIN}${pathname}${search}`)
  }, [])

  // Re-request the SAME url with a cache-busting param. location.reload() is
  // not enough — browsers may serve the cached document again, which is the
  // exact state we're trying to escape.
  const refetch = () => {
    const { pathname } = window.location
    window.location.replace(`${pathname}?_cb=${Date.now()}`)
  }

  return (
    <div
      style={{
        minHeight: '100vh', display: 'flex', flexDirection: 'column', gap: 14,
        alignItems: 'center', justifyContent: 'center', padding: 24, textAlign: 'center',
        background: '#F5F4F0', color: '#767393', fontFamily: "'Plus Jakarta Sans', -apple-system, sans-serif",
        fontSize: 14,
      }}
    >
      {stranded ? (
        <>
          {/* Without this the screen just says "Taking you to schedU…" forever,
              with no hint that the fix is a refresh — a dead end that reads as
              a broken site. Say what happened and offer the one-click escape. */}
          <div style={{ fontSize: 15, fontWeight: 700, color: '#4B5275' }}>
            You're seeing a cached copy of schedU
          </div>
          <div style={{ maxWidth: 420, lineHeight: 1.55 }}>
            Your browser saved an older version of this page. Reloading fetches the current
            site — or press <strong>Ctrl</strong>+<strong>Shift</strong>+<strong>R</strong>
            {' '}(<strong>⌘</strong>+<strong>Shift</strong>+<strong>R</strong> on a Mac).
          </div>
          <button
            onClick={refetch}
            style={{
              padding: '10px 20px', borderRadius: 10, border: 'none', cursor: 'pointer',
              background: '#7C6FE0', color: '#fff', fontSize: 13.5, fontWeight: 700,
              fontFamily: 'inherit',
            }}
          >
            Reload the page
          </button>
        </>
      ) : (
        'Taking you to schedU…'
      )}
    </div>
  )
}
