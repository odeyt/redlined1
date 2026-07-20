/**
 * lib/analytics/seoEvents.ts
 *
 * Typed event helpers for public SEO/marketing pages.
 * Uses the existing GA4 gtag() global injected in app/layout.tsx.
 *
 * Safe to call server-side (returns without error).
 * Safe to call when gtag is blocked or unavailable.
 *
 * Do NOT use for authenticated app events — use a separate analytics module.
 * Do NOT send PII, VINs, customer names, shop IDs, or billing data.
 */

import type { SeoEventPayload, SeoEventName } from './types';

declare global {
  interface Window {
    gtag?: (...args: unknown[]) => void;
  }
}

/** Read UTM params from the current URL (client-side only) */
function getUtmParams(): Pick<SeoEventPayload, 'utm_source' | 'utm_medium' | 'utm_campaign'> {
  if (typeof window === 'undefined') return {};
  const sp = new URLSearchParams(window.location.search);
  return {
    utm_source: sp.get('utm_source') ?? undefined,
    utm_medium: sp.get('utm_medium') ?? undefined,
    utm_campaign: sp.get('utm_campaign') ?? undefined,
  };
}

/** Fire a typed SEO analytics event via gtag. Fails silently. */
export function trackSeoEvent(payload: SeoEventPayload): void {
  if (typeof window === 'undefined') return;
  if (typeof window.gtag !== 'function') return;

  const { event_name, ...params } = {
    ...payload,
    page_path: payload.page_path ?? window.location.pathname,
    ...getUtmParams(),
  };

  try {
    window.gtag('event', event_name, params);
  } catch {
    // Never throw from analytics
  }
}

/** Track a CTA click */
export function trackCtaClick(opts: {
  ctaLabel: string;
  ctaDestination: string;
  pageType?: SeoEventPayload['page_type'];
  position?: string;
}): void {
  trackSeoEvent({
    event_name: 'seo_cta_clicked',
    cta_label: opts.ctaLabel,
    cta_destination: opts.ctaDestination,
    page_type: opts.pageType,
    cta_position: opts.position,
  });
}

/** Track when a user starts using a calculator */
export function trackCalculatorStarted(toolName: string): void {
  trackSeoEvent({ event_name: 'seo_calculator_started', tool_name: toolName });
}

/** Track when a calculator produces a result */
export function trackCalculatorCompleted(toolName: string): void {
  trackSeoEvent({ event_name: 'seo_calculator_completed', tool_name: toolName });
}

/** Track when a resource is printed */
export function trackResourcePrinted(resourceName: string): void {
  trackSeoEvent({ event_name: 'seo_resource_printed', resource_name: resourceName });
}

/** Track when a comparison page is viewed */
export function trackComparisonViewed(competitorName: string): void {
  trackSeoEvent({ event_name: 'seo_comparison_viewed', comparison_name: competitorName });
}

/** Track an internal navigation link click */
export function trackInternalLinkClick(opts: { label: string; destination: string }): void {
  trackSeoEvent({
    event_name: 'seo_internal_link_clicked',
    cta_label: opts.label,
    cta_destination: opts.destination,
  });
}

/** Convenience: track a "Start Free" / "Try Free" trial CTA */
export function trackTrialStarted(position: string, pageType?: SeoEventPayload['page_type']): void {
  trackSeoEvent({
    event_name: 'seo_trial_started',
    cta_position: position,
    page_type: pageType,
    cta_destination: '/signup',
  });
}

/** Convenience: track a "Contact Sales" CTA */
export function trackContactSalesClick(position: string): void {
  trackSeoEvent({
    event_name: 'seo_contact_sales_clicked',
    cta_position: position,
    cta_destination: '/signup?plan=enterprise',
  });
}
