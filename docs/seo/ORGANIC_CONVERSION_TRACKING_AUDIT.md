# Organic Conversion Tracking Audit — Stage C

**Date:** 2026-07-21
**Scope:** SEO pages and organic funnel tracking for RedlineD1

---

## Analytics Stack Audit

### What exists before Stage C

| Component | Status | Location |
|-----------|--------|----------|
| GA4 tag | Installed | `app/layout.tsx` — `G-9QY4K8MZ1X` via `next/script afterInteractive` |
| Google Search Console | Hook in layout | `process.env.NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION` meta tag |
| Event abstraction | None | No typed event layer existed prior to Stage C |
| Conversion goals | None configured | No funnel events were being sent |

**No additional analytics packages were installed.** Stage C uses the existing GA4 global (`window.gtag`) via a typed abstraction layer.

---

## New Files Created

### `lib/analytics/types.ts`

Typed event names and payload interface for all SEO conversion events:

```typescript
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
```

All events include `page_path`, `page_type`, and optional contextual fields (`cta_label`, `cta_destination`, `tool_name`, UTM params).

### `lib/analytics/seoEvents.ts`

Exported event helpers:
- `trackSeoEvent(payload)` — base sender, fails silently server-side or when gtag is absent
- `trackCtaClick({ label, destination, position })` — fires `seo_cta_clicked`
- `trackTrialStarted()` — fires `seo_trial_started`
- `trackContactSalesClick()` — fires `seo_contact_sales_clicked`
- `trackCalculatorStarted(toolName)` — fires `seo_calculator_started`
- `trackCalculatorCompleted(toolName)` — fires `seo_calculator_completed`
- `trackResourcePrinted(resourceName)` — fires `seo_resource_printed`
- `trackComparisonViewed(comparisonName)` — fires `seo_comparison_viewed`
- `trackInternalLinkClick(destination)` — fires `seo_internal_link_clicked`

UTM parameters (`utm_source`, `utm_medium`, `utm_campaign`) are read automatically from `window.location.search` and appended to every event.

---

## Privacy Rules

- No PII is sent in any event payload
- No VINs, shop IDs, or customer IDs are included
- `page_path` uses `window.location.pathname` (no query strings)
- All events fail silently if `window.gtag` is undefined (SSR safety)

---

## GA4 Goals to Configure in Search Console / GA4

After deployment, create the following conversion events in GA4:

| Event | Recommended Goal | Priority |
|-------|-----------------|----------|
| `seo_trial_started` | Primary conversion | High |
| `seo_cta_clicked` (destination=/signup) | Primary conversion | High |
| `seo_pricing_viewed` | Micro-conversion | Medium |
| `seo_calculator_completed` | Micro-conversion | Medium |
| `seo_contact_sales_clicked` | Secondary conversion | Medium |

---

## What Is Not Tracked

- Individual user identity (no user ID in events)
- Session recording or heatmaps (no Hotjar, FullStory, etc.)
- Form field values
- Revenue amounts or payment events (handled by billing infrastructure separately)
