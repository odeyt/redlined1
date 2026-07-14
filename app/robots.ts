import type { MetadataRoute } from 'next';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: ['/', '/privacy', '/terms', '/refund-policy'],
        disallow: ['/api/', '/admin/', '/auth/', '/billing/'],
      },
    ],
    sitemap: 'https://www.redlined1.com/sitemap.xml',
  };
}
