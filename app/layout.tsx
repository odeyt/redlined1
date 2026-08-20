import type { Metadata, Viewport } from 'next';
import Script from 'next/script';
import './globals.css';
import { PwaUpdater } from '@/components/PwaUpdater';
import { ConnectionStatus } from '@/components/ConnectionStatus';

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  // maximumScale was 1, which disables pinch-zoom. It is a common way to stop
  // iOS zooming when an input is focused, but it takes zoom away from everyone
  // — including a technician trying to read a VIN plate in a photo — and fails
  // WCAG 1.4.4. The focus-zoom problem is solved properly by 16px inputs,
  // which the mobile components already use.
  viewportFit: 'cover',
  themeColor: '#dc2626',
};

export const metadata: Metadata = {
  title: 'Redlined1',
  description: 'Automotive CRM and shop operations',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'Redlined1',
  },
  verification: {
    google: 'XXXXXXXXX',
  },
  other: {
    'mobile-web-app-capable': 'yes',
    'apple-mobile-web-app-capable': 'yes',
  },
};

const GA_ID = 'G-9QY4K8MZ1X';

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        {/*
          Which build this page was rendered from, readable without opening
          Settings or reading a network trace.

          A day went into a bug whose whole explanation was a browser running
          months-old JavaScript, and at no point could either the operator or
          an automated test answer "what is this page actually running?".
          A meta tag can be read by a test, by view-source, and by anyone
          helping over a phone call.
        */}
        <meta name="build" content={process.env.NEXT_PUBLIC_BUILD_ID ?? 'dev'} />
        <script dangerouslySetInnerHTML={{ __html: `
          try {
            var t = localStorage.getItem('redlined1-theme');
            // Light is the platform default — only opt into dark explicitly.
            // Anyone who chose dark keeps it; a browser with nothing stored
            // gets light. This runs before first paint, which is why it is an
            // inline script rather than an effect: setting the attribute after
            // React mounts would show the wrong theme for a frame first.
            if (t === 'dark') {
              document.documentElement.setAttribute('data-theme', 'dark');
            } else {
              document.documentElement.setAttribute('data-theme', 'light');
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
        {/* Registration moved out of an inline script so the worker can be
            registered per build and an available update can be surfaced.
            The old script registered '/sw.js' with no version and no update
            handling, so a tab could run a superseded bundle indefinitely. */}
        <PwaUpdater />
        <ConnectionStatus />
      </body>
    </html>
  );
}
