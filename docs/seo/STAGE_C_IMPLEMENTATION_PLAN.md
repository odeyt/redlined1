# RedlineD1 — Stage C SEO Implementation Plan

Created: 2026-07-21

---

## Audit findings

### Existing pattern (from /mobile-mechanic-software)

Server component page file at `app/(marketing)/{slug}/page.tsx` with:
- `generateMeta()` call inline (no separate metadata.ts needed — page is server component)
- `softwareApplicationSchema` + `webPageSchema` JSON-LD
- `Breadcrumb` from `components/seo/Breadcrumb`
- `FAQSection` from `components/seo/FAQSection`
- `PageCTA` from `components/seo/PageCTA`
- Inline styles using `var(--accent)`, `var(--muted)`, `var(--surface)`, `var(--line)`, `var(--surface-soft)`
- Pain points grid → Features grid → Who it's for → Related links → FAQ → CTA

### Components available (no new components needed)
- `Breadcrumb` — BreadcrumbList schema + nav
- `FAQSection` — renders FAQPage schema + accordion
- `PageCTA` — red CTA section, props: heading/subtext/primaryLabel/primaryHref/secondaryLabel/secondaryHref
- All schema generators in `lib/seo/schema.ts`
- `generateMeta()` in `lib/seo/metadata.ts`
- `absoluteUrl()` in `lib/seo/urls.ts`

### Bugs found during audit

| Bug | File | Fix |
|-----|------|-----|
| Sitemap uses `https://redlined1.com` (no www) | `app/sitemap.ts` | Change ORIGIN to `https://www.redlined1.com` |
| Sitemap includes `/compare/redlined1-vs-autoleap` which has no page | `app/sitemap.ts` | Remove entry |
| `technician-efficiency-calculator` has `status: 'planned'` but page exists | `lib/seo/internalLinkRegistry.ts` | Change to `'published'` |
| `vs-shopmonkey` has `status: 'planned'` but page exists | `lib/seo/internalLinkRegistry.ts` | Change to `'published'` |
| planRegistry `business.monthlyPrice: 199` but PricingSection shows $179 | `lib/entitlements/planRegistry.ts` | Note: display shows $179; registry shows 199. SEO pages use display price. |

### Analytics
- GA4 is already implemented: `GA_ID = 'G-9QY4K8MZ1X'` hardcoded in `app/layout.tsx`
- Tracks page views automatically via `page_path: window.location.pathname`
- No typed event abstraction exists — needs creation at `lib/analytics/seoEvents.ts`
- No consent banner — all users receive GA4 (no EU consent required per current setup)

### Feature verification

| Feature | Implemented? | Source |
|---------|-------------|--------|
| Estimates | Yes | Referenced throughout AppShell, services |
| Repair orders | Yes | Core feature |
| Invoicing | Yes | Core feature |
| Digital inspections | Yes | `dviPerMonth` limits, DVISection.tsx |
| Customer profiles + vehicle history | Yes | Customer/vehicle tables in Supabase |
| Multi-location | Yes (Business+ only) | `locationsTotal`, `multiLocation: true` on business+ |
| Clock-in / Clock-out time tracking | **Yes** | `features/time-tracking/TimeTrackingView.tsx`, `clockIn`/`clockOut` services |
| AI advisor / shop intelligence | Yes (Professional+) | `aiAdvisor: true` on professional+ |
| Marketing automation / bulk SMS campaigns | No | `smsPerMonth` exists but per-job only |
| Centralized inventory across locations | Unverified | Do not claim |
| Location transfer of jobs | Unverified | Do not claim |
| Customer portal (external facing) | Yes | `app/portal/[token]/` exists |

---

## Pages to create

| Route | Title focus | Plan gate |
|-------|-------------|-----------|
| `/auto-repair-estimate-software` | Estimates, labor+parts line items, auth flow → RO → invoice | All plans |
| `/multi-location-auto-repair-software` | Multi-location ops, Business plan | Business ($179/mo display) |
| `/solo-mechanic-shop-software` | Solo plan, one operator workflow | Solo ($24/mo) |
| `/auto-repair-crm` | Customer profiles, vehicle history, service history, portal | All plans |
| `/technician-time-tracking` | Clock-in/clock-out, job assignments, efficiency | Professional+ for reports |
| `/automotive-business-operating-system` | Category page: full-platform operating system concept | All plans |

---

## Sitemap changes

- Fix ORIGIN to `https://www.redlined1.com`
- Remove `/compare/redlined1-vs-autoleap` (no page exists)
- Add 6 new routes

## Internal link registry changes

- Update statuses: `technician-efficiency-calculator` → published, `vs-shopmonkey` → published
- Add 6 new entries with `status: 'published'`

## Required link relationships

Per brief:
- Estimate → Repair order, Invoicing
- Solo mechanic → Mobile mechanic
- Multi-location → Automotive Business OS
- CRM → Repair order
- Time tracking → Technician efficiency calculator
- Automotive Business OS → AI auto repair shop software

## Analytics events to add

Using existing GA4 (G-9QY4K8MZ1X). Create typed abstraction at:
- `lib/analytics/seoEvents.ts` — event fire functions
- `lib/analytics/types.ts` — event type definitions

Events: `seo_cta_clicked`, `seo_calculator_started`, `seo_calculator_completed`, `seo_resource_printed`, `seo_comparison_viewed`, `seo_internal_link_clicked`

## Content safeguards

Add module-level eslint disable comment / runtime check in `lib/seo/contentGuards.ts` to detect banned phrases in marketing copy when run as a test.

## Risks

- Business plan price discrepancy: `planRegistry.monthlyPrice: 199` vs PricingSection display `$179`. New pages will use $179 to match what customers see. This should be reconciled in a separate billing pass.
- Multi-location page: must not claim cross-location inventory or job transfers unless verified.
- Time tracking page: clock-in/clock-out IS implemented — can claim it.
