import type { MetadataRoute } from 'next';

export default function robots(): MetadataRoute.Robots {
  const isProduction = process.env.VERCEL_ENV === 'production' || process.env.NODE_ENV === 'production';

  // Non-production deployments (preview, branch, development) must not be indexed
  if (!isProduction || process.env.VERCEL_ENV === 'preview') {
    return {
      rules: [{ userAgent: '*', disallow: '/' }],
    };
  }

  return {
    rules: [
      {
        userAgent: '*',
        allow: [
          '/',
          '/pricing',
          '/privacy',
          '/terms',
          '/refund-policy',
          '/help',
          '/mobile-mechanic-software',
          '/auto-repair-invoicing-software',
          '/digital-vehicle-inspection-software',
          '/repair-order-software',
          '/ai-auto-repair-shop-software',
          '/auto-repair-estimate-software',
          '/multi-location-auto-repair-software',
          '/solo-mechanic-shop-software',
          '/tools/',
          '/resources/',
          '/compare/',
          '/research/',
          '/case-studies/',
          '/guides/',
          '/integrations/',
        ],
        disallow: [
          // Authenticated application
          '/api/',
          '/admin/',
          '/auth/',
          '/billing/',
          '/login',
          '/signup',
          '/forgot-password',
          '/reset-password',
          '/onboarding/',
          '/settings/',
          '/internal/',
          // Dynamic customer-specific links
          '/portal/',
          '/inspection/',
          '/status/',
          // Preview / internal routes
          '/landing-preview',
          '/qa',
          // Public test files in /public
          '/*.html$',
        ],
      },
    ],
    sitemap: 'https://www.redlined1.com/sitemap.xml',
  };
}
