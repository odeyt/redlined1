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
  title: 'RedlineD1 - Automotive Business Operating System (Preview)',
  description:
    'Run customers, vehicles, estimates, repair orders, invoices, staff, and shop intelligence from one connected platform.',
  robots: {
    index: false,
    follow: false,
    nocache: true,
  },
};

export default function LandingPreviewLayout({ children }: { children: React.ReactNode }) {
  return <div className="rd1-landing">{children}</div>;
}
