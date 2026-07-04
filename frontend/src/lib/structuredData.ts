/**
 * Shared schema.org JSON-LD for the public marketing pages. Only real,
 * currently-published values (brand name, URL, contact email already shown on
 * /contact) — no invented ratings, review counts, or founding dates.
 */
const SITE_URL = 'https://schedu.bhusku.com'

export const ORGANIZATION_SCHEMA = {
  '@context': 'https://schema.org',
  '@type': 'Organization',
  name: 'schedU',
  url: SITE_URL,
  logo: `${SITE_URL}/logo.svg`,
  email: 'hello@bhusku.com',
  contactPoint: {
    '@type': 'ContactPoint',
    email: 'hello@bhusku.com',
    contactType: 'customer support',
  },
}
