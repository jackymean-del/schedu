import type { MetadataRoute } from 'next'
import { SITE_URL } from '@/lib/structuredData'
import { DOC_ARTICLES } from '@/content/docs'

export const dynamic = 'force-static'

export default function sitemap(): MetadataRoute.Sitemap {
  const staticRoutes = ['', '/features', '/pricing', '/docs', '/contact']
  const docRoutes = DOC_ARTICLES.map(d => `/docs/${d.slug}`)
  const lastModified = new Date()
  // lastmod / changefreq / priority give crawlers a freshness + importance
  // signal. The home + core marketing pages rank highest; docs slightly lower.
  return [...staticRoutes, ...docRoutes].map(path => {
    const isCore = staticRoutes.includes(path)
    return {
      url: `${SITE_URL}${path}`,
      lastModified,
      changeFrequency: (isCore ? 'weekly' : 'monthly') as 'weekly' | 'monthly',
      priority: path === '' ? 1 : isCore ? 0.8 : 0.6,
    }
  })
}
