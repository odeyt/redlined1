import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '*.supabase.co',
        pathname: '/storage/v1/object/public/**',
      },
    ],
  },

  reactStrictMode: true,

  async headers() {
    return [
      // ── API routes: never cache ────────────────────────────────────────
      {
        source: '/api/:path*',
        headers: [
          { key: 'Cache-Control', value: 'no-store, no-cache, must-revalidate' },
          { key: 'Pragma', value: 'no-cache' },
        ],
      },
      // ── Auth / private app routes: never cache ─────────────────────────
      {
        source: '/(login|signup|forgot-password|reset-password|admin|auth|billing|portal|inspection|status|landing-preview|qa)/:path*',
        headers: [
          { key: 'Cache-Control', value: 'no-store, no-cache, must-revalidate' },
          { key: 'Pragma', value: 'no-cache' },
        ],
      },
      // ── Public marketing pages: allow short-lived caching ─────────────
      // CDN/browser can cache for 60 seconds; stale-while-revalidate for 5 min
      {
        source: '/(|pricing|privacy|terms|refund-policy|help|mobile-mechanic-software|auto-repair-invoicing-software|digital-vehicle-inspection-software|repair-order-software|ai-auto-repair-shop-software|auto-repair-estimate-software|multi-location-auto-repair-software|solo-mechanic-shop-software|compare|tools|resources|guides|integrations|case-studies|research|about)',
        headers: [
          { key: 'Cache-Control', value: 'public, s-maxage=60, stale-while-revalidate=300' },
        ],
      },
      // ── Static assets: immutable ─────────────────────────────────────
      {
        source: '/_next/static/:path*',
        headers: [
          { key: 'Cache-Control', value: 'public, max-age=31536000, immutable' },
        ],
      },
    ];
  },
};

export default nextConfig;
