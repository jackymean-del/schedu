import type { MetadataRoute } from 'next'
import { SITE_URL } from '@/lib/structuredData'
import { DOC_ARTICLES } from '@/content/docs'

export const dynamic = 'force-static'

export default function sitemap(): MetadataRoute.Sitemap {
  const staticRoutes = ['', '/features', '/pricing', '/docs', '/contact']
  const docRoutes = DOC_ARTICLES.map(d => `/docs/${d.slug}`)
  return [...staticRoutes, ...docRoutes].map(path => ({
    url: `${SITE_URL}${path}`,
  }))
}
