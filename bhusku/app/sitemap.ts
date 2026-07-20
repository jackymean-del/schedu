import type { MetadataRoute } from 'next'
import { SITE_URL } from '@/lib/site'

export const dynamic = 'force-static'

export default function sitemap(): MetadataRoute.Sitemap {
  const routes = ['', '/contact', '/terms', '/privacy', '/refunds']
  const lastModified = new Date()
  return routes.map(path => ({
    url: `${SITE_URL}${path}`,
    lastModified,
    changeFrequency: path === '' ? 'monthly' : 'yearly',
    priority: path === '' ? 1 : 0.5,
  }))
}
