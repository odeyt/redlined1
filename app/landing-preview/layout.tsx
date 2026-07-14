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
    'Manage customers, vehicles, digital inspections, estimates, repair orders, invoices, payments, inventory, and repair intelligence from one connected automotive business platform.',
  keywords: [
    'digital vehicle inspection software',
    'DVI software for repair shops',
    'automotive inspection software',
    'digital inspection app for mechanics',
    'mobile mechanic inspection software',
    'vehicle inspection report software',
    'auto repair inspection checklist',
    'automotive shop management software',
    'mobile mechanic software',
    'repair shop software',
  ],
  robots: {
    index: false,
    follow: false,
    nocache: true,
  },
};

export default function LandingPreviewLayout({ children }: { children: React.ReactNode }) {
  return <div className="rd1-landing">{children}</div>;
}
