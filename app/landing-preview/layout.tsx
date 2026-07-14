import type { Metadata } from 'next';
import './landing.css';

/**
 * Route-scoped metadata for /landing-preview. This route must never be
 * indexed - it is an internal preview build, not a replacement for the live
 * homepage (app/portal/page.tsx) or the app root (app/page.tsx), neither of
 * which this epic touches. See docs/design/aura/LANDING_PAGE_MASTER_SPEC.md
 * Section 14 for the full SEO metadata prepared for a future production
 * page (not activated here).
 */
export const metadata: Metadata = {
  title: 'RedlineD1 | Automotive Shop Management Software',
  description:
    'Manage customers, vehicles, digital inspections, estimates, repair orders, invoices, payments, and repair intelligence from one connected automotive business platform. Built for independent shops and mobile mechanics.',
  keywords: [
    'automotive shop management software',
    'auto repair shop software',
    'digital vehicle inspection software',
    'DVI software for repair shops',
    'mobile mechanic software',
    'repair shop management system',
    'automotive CRM',
    'auto repair invoicing software',
    'vehicle inspection report software',
    'repair order software',
  ],
  metadataBase: new URL('https://www.redlined1.com'),
  alternates: {
    canonical: 'https://www.redlined1.com',
  },
  openGraph: {
    type: 'website',
    url: 'https://www.redlined1.com',
    title: 'RedlineD1 | Automotive Shop Management Software',
    description:
      'The all-in-one shop OS for independent auto repair shops and mobile mechanics. Digital inspections, invoicing, AI repair intelligence, and more.',
    siteName: 'RedlineD1',
    images: [
      {
        url: '/icons/icon-512x512.png',
        width: 512,
        height: 512,
        alt: 'RedlineD1 Logo',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'RedlineD1 | Automotive Shop Management Software',
    description:
      'The all-in-one shop OS for independent auto repair shops and mobile mechanics.',
    images: ['/icons/icon-512x512.png'],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-snippet': -1,
      'max-image-preview': 'large',
      'max-video-preview': -1,
    },
  },
};

export default function LandingPreviewLayout({ children }: { children: React.ReactNode }) {
  return <div className="rd1-landing">{children}</div>;
}
