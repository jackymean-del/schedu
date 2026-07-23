/**
 * Local-currency DISPLAY for prices that are always CHARGED in INR (Razorpay).
 *
 * The plan costs the same everywhere (₹333/mo, ₹3,333/yr). This module only
 * localises the *displayed* figure so a visitor sees roughly what it costs in
 * their own money — e.g. a US visitor sees "≈ $4", a UK visitor "≈ £3". The
 * amount billed is unchanged (INR); the local figure is indicative, so callers
 * show it with a "≈" and a "billed in INR" note.
 *
 * Detection is client-side (browser locale/region); conversion uses a static
 * indicative rate table (no network call — safe for the static export). During
 * SSR/first paint `navigator` is undefined, so it returns INR; a client
 * component then swaps in the local figure after hydration. Unknown regions, or
 * regions whose currency we don't have a rate for, keep the real INR price.
 */

// Indicative INR → currency rates (1 INR = N units of the currency). These
// drift over time — refresh occasionally. They only affect the *shown* figure.
export const INR_RATES: Record<string, number> = {
  USD: 0.0120, EUR: 0.0110, GBP: 0.0095, AUD: 0.0183, CAD: 0.0164, NZD: 0.0200,
  CHF: 0.0106, SEK: 0.126, NOK: 0.128, DKK: 0.082, PLN: 0.048, CZK: 0.276,
  HUF: 4.30, RON: 0.055, TRY: 0.41, ILS: 0.045,
  AED: 0.0441, SAR: 0.0450, QAR: 0.0437, KWD: 0.0037, BHD: 0.0045, OMR: 0.0046,
  SGD: 0.0158, HKD: 0.0936, MYR: 0.0533, THB: 0.435, IDR: 195, PHP: 0.685,
  JPY: 1.86, CNY: 0.0865, KRW: 16.6, VND: 305,
  ZAR: 0.221, NGN: 18.6, KES: 1.55, EGP: 0.585, GHS: 0.18,
  BRL: 0.0668, MXN: 0.222, CLP: 11.3, COP: 47,
  PKR: 3.34, BDT: 1.43, LKR: 3.62, NPR: 1.60,
}

// Country (ISO-3166 alpha-2) → currency, for the currencies we have a rate for.
// Anything not listed falls back to the real INR price.
export const COUNTRY_CCY: Record<string, string> = {
  US: 'USD', GB: 'GBP', IN: 'INR',
  DE: 'EUR', FR: 'EUR', ES: 'EUR', IT: 'EUR', NL: 'EUR', IE: 'EUR', PT: 'EUR',
  BE: 'EUR', AT: 'EUR', FI: 'EUR', GR: 'EUR', SK: 'EUR', SI: 'EUR', LT: 'EUR',
  LV: 'EUR', EE: 'EUR', LU: 'EUR', CY: 'EUR', MT: 'EUR', HR: 'EUR',
  AU: 'AUD', CA: 'CAD', NZ: 'NZD', CH: 'CHF',
  SE: 'SEK', NO: 'NOK', DK: 'DKK', PL: 'PLN', CZ: 'CZK', HU: 'HUF', RO: 'RON',
  TR: 'TRY', IL: 'ILS',
  AE: 'AED', SA: 'SAR', QA: 'QAR', KW: 'KWD', BH: 'BHD', OM: 'OMR',
  SG: 'SGD', HK: 'HKD', MY: 'MYR', TH: 'THB', ID: 'IDR', PH: 'PHP', VN: 'VND',
  JP: 'JPY', CN: 'CNY', KR: 'KRW',
  ZA: 'ZAR', NG: 'NGN', KE: 'KES', EG: 'EGP', GH: 'GHS',
  BR: 'BRL', MX: 'MXN', CL: 'CLP', CO: 'COP',
  PK: 'PKR', BD: 'BDT', LK: 'LKR', NP: 'NPR',
}

/** Best-effort ISO country for the current browser (locale region). */
export function detectCountry(): string | null {
  if (typeof navigator === 'undefined') return null
  const langs = [navigator.language, ...(navigator.languages ?? [])].filter(Boolean)
  for (const l of langs) {
    try {
      const loc = new Intl.Locale(l)
      const region = (loc.maximize?.() as Intl.Locale | undefined)?.region ?? loc.region
      if (region) return region.toUpperCase()
    } catch { /* fall through to tag parsing */ }
    const m = String(l).match(/[-_]([A-Za-z]{2})(?:$|[-_])/)
    if (m) return m[1].toUpperCase()
  }
  return null
}

export interface LocalPriceResult {
  /** Formatted amount, NO "≈" prefix (e.g. "$4", "£3", "₹333"). */
  amount: string
  /** ISO currency code actually used. */
  currency: string
  /** True when shown in a non-INR local currency (an approximation). */
  converted: boolean
}

/** Localise an INR amount for display. Falls back to INR when unknown. */
export function localizeINR(inr: number, locale?: string): LocalPriceResult {
  const country = detectCountry()
  const ccy = country ? COUNTRY_CCY[country] : undefined
  const loc = locale ?? (typeof navigator !== 'undefined' ? navigator.language : 'en-IN')

  if (!ccy || ccy === 'INR' || !INR_RATES[ccy]) {
    return { amount: '₹' + inr.toLocaleString('en-IN'), currency: 'INR', converted: false }
  }

  const value = inr * INR_RATES[ccy]
  const frac = value > 0 && value < 10 ? 2 : 0
  let amount: string
  try {
    amount = new Intl.NumberFormat(loc, {
      style: 'currency', currency: ccy,
      maximumFractionDigits: frac, minimumFractionDigits: 0,
    }).format(value)
  } catch {
    amount = `${ccy} ${value.toFixed(frac)}`
  }
  return { amount, currency: ccy, converted: true }
}

/**
 * Replace every "₹<number>" token inside a string with its localised form,
 * keeping the surrounding text (for lines like "or ₹3,333/yr — save 17%").
 * Returns the original string unchanged when there's nothing to convert.
 */
export function localizeMoneyInText(text: string, locale?: string): { text: string; converted: boolean } {
  let converted = false
  const out = text.replace(/₹\s?([\d,]+)/g, (_m, digits: string) => {
    const n = Number(digits.replace(/,/g, ''))
    if (!isFinite(n)) return _m
    const r = localizeINR(n, locale)
    if (r.converted) converted = true
    return r.amount
  })
  return { text: out, converted }
}
