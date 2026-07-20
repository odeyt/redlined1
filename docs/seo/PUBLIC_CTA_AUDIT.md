# Public CTA Audit — Stage C

**Date:** 2026-07-21
**Scope:** All public-facing CTAs across the marketing route group

---

## CTA Inventory

### Primary CTA pattern: "Start Free" / "Start Free — No Credit Card"

**Used on:** All 6 new Stage C pages + existing marketing pages

| Page | Primary CTA Label | Primary CTA Destination | Secondary CTA |
|------|-------------------|------------------------|---------------|
| `/auto-repair-estimate-software` | Start Free — No Credit Card | `/signup` | See Plans → `/pricing` |
| `/solo-mechanic-shop-software` | Start Free — No Credit Card | `/signup` | See Plans → `/pricing` |
| `/multi-location-auto-repair-software` | Start Free | `/signup` | See Plans → `/pricing` |
| `/auto-repair-crm` | Start Free — No Credit Card | `/signup` | See Plans → `/pricing` |
| `/technician-time-tracking` | Start Free | `/signup` | Try Efficiency Calculator → `/tools/technician-efficiency-calculator` |
| `/automotive-business-operating-system` | Start Free — No Credit Card | `/signup` | See Plans → `/pricing` |

### Non-signup secondary CTAs

| Page | CTA Label | Destination | Type |
|------|-----------|-------------|------|
| `/technician-time-tracking` (hero) | Try the Efficiency Calculator | `/tools/technician-efficiency-calculator` | Tool |
| `/technician-time-tracking` (mid-page) | Open the Efficiency Calculator → | `/tools/technician-efficiency-calculator` | Tool |
| `/auto-repair-estimate-software` | View All Templates | `/resources/templates` | Resource |

---

## CTA Rules Applied

1. **No fake urgency:** No "Limited time", "Only X spots left", "Act now" copy on any CTA.
2. **No implied guarantee:** No "Risk-free", "Cancel anytime" claims without verification of the billing flow.
3. **Accurate plan attribution:** "No Credit Card" claim applies to the Free Forever plan only. Verified: Free plan does not require payment info at signup.
4. **Pricing accuracy:** "$179/month" on Business plan page matches `PricingSection.tsx` display value. Note: `planRegistry.ts` has `monthlyPrice: 199` — discrepancy logged for separate billing audit.
5. **Solo plan $24/month:** Matches `PricingSection.tsx`. Displayed as `$24/month ($240/year)`.
6. **Professional plan $99/month:** Matches `PricingSection.tsx` display.

---

## Routes Verified Accessible Without Auth

All CTAs link to:
- `/signup` — confirmed public in `proxy.ts`
- `/pricing` — confirmed public in `proxy.ts`
- `/tools/technician-efficiency-calculator` — under `/tools` which is a public prefix in `proxy.ts`
- `/resources/templates` — under `/resources` which is a public prefix in `proxy.ts`

---

## CTAs Not Present (Appropriate Omissions)

- **Contact Sales / Enterprise inquiry:** Not added to pages. Enterprise plan exists but no contact form or sales flow was verified as implemented. Linking to pricing page where Enterprise is listed is sufficient.
- **Demo booking:** Not added. No demo booking flow was verified.
- **Phone number / WhatsApp:** Not added. Communication channels not verified as monitored.

---

## Issues Found

| Issue | Severity | Action |
|-------|----------|--------|
| `planRegistry.ts` monthly price ($199) does not match display price ($179) | Medium | Logged for separate billing audit. Pages use display price. |
| No `trackCtaClick` calls on Stage C pages (pages are server components) | Low | Analytics events fire on client-interactive components (PageCTA, etc.). Server pages cannot call browser events inline. |
