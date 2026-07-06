/**
 * Shared schema.org JSON-LD — only real, currently-published values (brand
 * name, URL, contact email shown on /contact). No invented ratings, review
 * counts, or founding dates. Mirrors frontend/src/lib/structuredData.ts.
 */
export const SITE_URL = 'https://schedu.bhusku.com'

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
