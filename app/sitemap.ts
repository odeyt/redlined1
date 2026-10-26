import type { MetadataRoute } from 'next';
import { SEO_PAGE_PATHS } from '@/lib/marketing/publicPaths';

export default function sitemap(): MetadataRoute.Sitemap {
  // Only report lastModified when the content change date is known.
  return [
    { url: 'https://www.redlined1.com/', changeFrequency: 'weekly', priority: 1 },
    ...[...SEO_PAGE_PATHS, '/shop-owner-demo', '/shop-audit'].map(path => ({
      url: `https://www.redlined1.com${path}`,
      changeFrequency: 'monthly' as const,
      priority: 0.8,
    })),
    ...['/privacy', '/terms', '/refund-policy'].map(path => ({
      url: `https://www.redlined1.com${path}`,
      changeFrequency: 'yearly' as const,
      priority: 0.3,
    })),
  ];
}
