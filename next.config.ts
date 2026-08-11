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

  /**
   * The build identity, fixed at build time and readable in the browser.
   *
   * Three things depend on one value: the service worker's cache name, the
   * URL it is registered under, and what the app reports about itself. A
   * hand-maintained version drifts from the deploy the moment someone forgets
   * to bump it — which is how a stale bundle survives a release.
   *
   * Falls back to 'dev' locally, where there is no deployment to identify.
   */
  env: {
    NEXT_PUBLIC_BUILD_ID: (process.env.VERCEL_GIT_COMMIT_SHA ?? 'dev').slice(0, 7),
  },

  // Prevent browsers and CDN from caching HTML/API responses.
  // _next/static chunks are content-hashed and stay immutable.
  async headers() {
    return [
      {
        source: '/((?!_next/static|_next/image|favicon\\.ico).*)',
        headers: [
          { key: 'Cache-Control', value: 'no-store, no-cache, must-revalidate' },
          { key: 'Pragma', value: 'no-cache' },
        ],
      },
    ];
  },
};

export default nextConfig;
