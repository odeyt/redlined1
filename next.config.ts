import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Allow next/image to load from Supabase Storage
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
};

export default nextConfig;
