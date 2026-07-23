/**
 * Pricing currency rule (simple, deliberate):
 *   • India   → shown in INR (₹) — the real charge (Razorpay bills INR).
 *   • Everyone else → shown in USD ($), ROUNDED to a whole dollar, using the
 *     LIVE INR→USD rate. No local-currency conversion, no "≈", and no
 *     equivalent-in-rupees number.
 *
 * The rate is fetched client-side once (cached) with a static fallback so the
 * page still renders a sensible dollar figure if the FX endpoint is unreachable.
 */

// Fallback INR→USD (≈ used only if the live fetch fails). Refresh occasionally.
export const FALLBACK_INR_USD = 0.012

/**
 * Is the visitor in India? Uses the browser locale region AND the IST timezone
 * (many Indian users run an en-US locale but sit in Asia/Kolkata), so either
 * signal is enough.
 */
export function isIndia(): boolean {
  // Timezone is the strongest geographic signal — an Indian expat abroad (whose
  // browser may still list en-IN) should see USD, so we do NOT scan secondary
  // languages; only the primary locale region + the timezone decide.
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || ''
    if (/Kolkata|Calcutta/i.test(tz)) return true
  } catch { /* ignore */ }
  if (typeof navigator !== 'undefined' && navigator.language) {
    const l = navigator.language
    try {
      const loc = new Intl.Locale(l)
      const region = (loc.maximize?.() as Intl.Locale | undefined)?.region ?? loc.region
      if (region && region.toUpperCase() === 'IN') return true
    } catch { /* fall through */ }
    const m = l.match(/[-_]([A-Za-z]{2})(?:$|[-_])/)
    if (m && m[1].toUpperCase() === 'IN') return true
  }
  return false
}

let _rate: number | null = null
let _inflight: Promise<number> | null = null

/** Live INR→USD rate (cached for the session; static fallback on failure). */
export function getInrToUsd(): Promise<number> {
  if (_rate != null) return Promise.resolve(_rate)
  if (_inflight) return _inflight
  _inflight = (async () => {
    try {
      const r = await fetch('https://open.er-api.com/v6/latest/INR', { cache: 'no-store' })
      const j = await r.json()
      const usd = j?.rates?.USD
      if (typeof usd === 'number' && usd > 0) { _rate = usd; return usd }
    } catch { /* fall back */ }
    _rate = FALLBACK_INR_USD
    return _rate
  })()
  return _inflight
}

/** Format an INR amount as a rounded whole-dollar string: "$4", "$40", "$0". */
export function roundedUSD(inr: number, rate: number): string {
  return '$' + Math.round(inr * rate).toLocaleString('en-US')
}

/** Format an INR amount as "₹333". */
export function formatINR(inr: number): string {
  return '₹' + inr.toLocaleString('en-IN')
}
