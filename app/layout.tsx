import type { Metadata, Viewport } from 'next';
import Script from 'next/script';
import './globals.css';
import { ROOT_METADATA } from '@/lib/seo/metadata';

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  viewportFit: 'cover',
};

export const metadata: Metadata = {
  ...ROOT_METADATA,
  // Google Search Console verification — set NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION in Vercel env
  ...(process.env.NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION
    ? { verification: { google: process.env.NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION } }
    : {}),
};

const GA_ID = 'G-9QY4K8MZ1X';

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <script dangerouslySetInnerHTML={{ __html: `
          try {
            var t = localStorage.getItem('redlined1-theme');
            // Dark is the platform default — only opt into light explicitly
            if (t === 'light') {
              document.documentElement.setAttribute('data-theme', 'light');
            } else {
              document.documentElement.setAttribute('data-theme', 'dark');
            }
          } catch(e) {}
        `}} />
        {/* Inject Supabase public config at runtime so client bundles don't
            rely on build-time NEXT_PUBLIC_* baking (works around Turbopack cache) */}
        <script dangerouslySetInnerHTML={{ __html: `
          window.__SB_URL__="${process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''}";
          window.__SB_KEY__="${process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? ''}";
        `}} />
        <link rel="apple-touch-icon" href="/icons/icon-192x192.png" />
        <meta name="theme-color" content="#dc2626" />
      </head>
      <body>
        {children}
        {/* Google Analytics */}
        <Script
          src={`https://www.googletagmanager.com/gtag/js?id=${GA_ID}`}
          strategy="afterInteractive"
        />
        <Script id="google-analytics" strategy="afterInteractive">
          {`
            window.dataLayer = window.dataLayer || [];
            function gtag(){dataLayer.push(arguments);}
            gtag('js', new Date());
            gtag('config', '${GA_ID}', { page_path: window.location.pathname });
          `}
        </Script>
        <Script id="register-sw" strategy="afterInteractive">
          {`
            if ('serviceWorker' in navigator) {
              window.addEventListener('load', function() {
                navigator.serviceWorker.register('/sw.js');
              });
            }
          `}
        </Script>
      </body>
    </html>
  );
}
