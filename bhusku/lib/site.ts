/**
 * bhusku parent-brand constants + business identity.
 *
 * The BUSINESS.* fields below feed the legal/policy pages and Razorpay
 * onboarding. Values marked "FILL:" are placeholders the owner MUST replace
 * with real details before the policy pages go live / before submitting the
 * site to Razorpay - a compliance page must not carry a placeholder or an
 * invented value. Everything else (brand name, tagline, contact email) is real.
 */
export const SITE_URL = 'https://bhusku.com'
export const APP_URL = 'https://app.schedu.bhusku.com'
export const SCHEDU_URL = 'https://schedu.bhusku.com'

export const BRAND = {
  name: 'bhusku',
  tagline: 'Heavy on craft. Full of energy.',
  blurb:
    'bhusku is an independent product studio building calm, capable software for the work people actually do. We sweat the details so the tools disappear and the work gets easier.',
  email: 'hello@bhusku.com',
}

// Business/legal identity - sole proprietorship. FILL the placeholders.
export const BUSINESS = {
  // The proprietor's full legal name (as on PAN / bank account used for payouts).
  legalName: 'FILL: Proprietor legal name',
  // "<Legal name> (sole proprietor), trading as bhusku"
  entityLine: 'FILL: Proprietor legal name (sole proprietor), trading as bhusku',
  email: 'hello@bhusku.com',
  // Optional but recommended for Razorpay + trust.
  phone: 'FILL: +91 XXXXX XXXXX',
  address: 'FILL: City, State, India',
  jurisdiction: 'FILL: City, State', // courts of this place govern disputes
  // Kept in sync with schedU's checkout (frontend subscription page + backend
  // billing config). If pricing changes, update all three.
  proMonthlyINR: 333,
  proYearlyINR: 3333,
}

export const PRODUCTS = [
  {
    name: 'schedU',
    // Not "AI timetable scheduling". This line is why Google described the
    // product as AI-powered long after the product site stopped saying so: the
    // parent site is a separate deployment, it links to schedU, and the search
    // result took its wording almost verbatim.
    tagline: 'Timetable scheduling built on Human Intelligence',
    blurb:
      'Conflict-free timetables for schools, colleges, and universities on any board, built by applying the rules a timetable in-charge applies rather than guessing at them. Live operations, substitutions, and workload analytics included.',
    href: SCHEDU_URL,
    status: 'live' as const,
    markColor: '#7C6FE0',
  },
]

// Human-readable "last updated" for the policy pages. Update when you edit them.
export const POLICY_UPDATED = '20 July 2026'
