/**
 * lib/analytics/types.ts
 *
 * Typed analytics event definitions for public SEO/marketing pages.
 * All events are sent to GA4 (G-9QY4K8MZ1X) via the existing gtag() global.
 *
 * Rules:
 * - Never include PII: no email, name, phone, VIN, customer ID, shop ID
 * - Never include financial amounts or billing data
 * - All fields optional except event_name
 * - Fail safely when gtag is unavailable (SSR, ad blockers, dev)
 */

export type SeoEventName =
  | 'seo_cta_clicked'
  | 'seo_pricing_viewed'
  | 'seo_trial_started'
  | 'seo_contact_sales_clicked'
  | 'seo_calculator_started'
  | 'seo_calculator_completed'
  | 'seo_resource_printed'
  | 'seo_comparison_viewed'
  | 'seo_internal_link_clicked';

export type PageType =
  | 'feature'
  | 'pricing'
  | 'tool'
  | 'resource'
  | 'comparison'
  | 'homepage'
  | 'landing';

export interface SeoEventPayload {
  event_name: SeoEventName;
  page_path?: string;
  page_type?: PageType;
  /** Label on the CTA button */
  cta_label?: string;
  /** Destination href of the CTA */
  cta_destination?: string;
  /** Position of CTA on page: hero | nav | section | footer */
  cta_position?: string;
  /** For tool events */
  tool_name?: string;
  /** For resource events */
  resource_name?: string;
  /** For comparison events */
  comparison_name?: string;
  /** utm_source from the current URL, if present */
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
}
