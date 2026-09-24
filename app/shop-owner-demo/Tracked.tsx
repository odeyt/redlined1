'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { trackEvent } from '@/lib/analytics/track';

/**
 * The two calls to action, as the only client code the page's links need.
 *
 * `cta` picks both the destination and the event, so a button cannot be
 * labelled "Start free" and report itself as a walkthrough click:
 *
 *   walkthrough → the request form further down this page
 *   start_free  → /signup, the real account-creation route
 *
 * `location` says which instance was clicked (hero, nav, closing…), which is
 * what tells you whether repeating the CTA is earning its place.
 *
 * The `data-analytics` attribute mirrors the marker the other marketing pages
 * carry, for anyone inspecting the DOM. It sends nothing on its own; the
 * onClick below is what reports the event.
 */
type Cta = 'walkthrough' | 'start_free';

const CTA: Record<Cta, { href: string; event: string }> = {
  walkthrough: { href: '#book-walkthrough', event: 'book_walkthrough_click' },
  start_free: { href: '/signup', event: 'start_free_click' },
};

export function CtaLink({ cta, location, className, children }: {
  cta: Cta;
  location: string;
  className?: string;
  children: React.ReactNode;
}) {
  const { href, event } = CTA[cta];
  const onClick = () => trackEvent(event, { page: 'shop_owner_demo', cta_location: location });

  // An in-page anchor stays a plain <a>: next/link adds nothing to a jump
  // within the same document.
  if (href.startsWith('#')) {
    return (
      <a href={href} className={className} onClick={onClick} data-analytics={event} data-cta-location={location}>
        {children}
      </a>
    );
  }
  return (
    <Link href={href} className={className} onClick={onClick} data-analytics={event} data-cta-location={location}>
      {children}
    </Link>
  );
}

/**
 * A page-specific view event.
 *
 * GA's own page_view fires from the root layout on a full load only, so a
 * visitor arriving by client-side navigation is not counted there. This fires
 * on every mount. It is a separate event name, not a second page_view, so
 * direct visits are not double-counted in GA's standard reports.
 */
export function PageViewEvent() {
  useEffect(() => {
    trackEvent('shop_owner_demo_view', { page: 'shop_owner_demo' });
  }, []);
  return null;
}
