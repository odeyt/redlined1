# LANDING_PRICING_UPDATE.md
# Redlined1 — Landing Pricing & Copy Update
# Applied: 2026-07-20

---

## Summary

All pricing, plan names, feature claims, and CTAs on the public landing page have been audited and corrected. No checkout behavior, database records, or Creem product configuration was changed.

---

## Files Modified

| File | Change Summary |
|------|----------------|
| `components/marketing/PricingSection.tsx` | Replaced "Trial" card with "Free Forever"; updated header, CTAs, bottom note; removed unverified features |
| `components/marketing/FAQSection.tsx` | Fixed trial FAQ, plan CTA strip, CTA strip tagline, and bottom strip link |
| `components/marketing/MarketingHeader.tsx` | Fixed nav "Start Free Trial" → "Start Free"; fixed Business description; fixed FAQ dropdown entry |
| `components/marketing/FinalCTA.tsx` | Fixed "Start Your 7-Day Free Trial" → "Start Free — No Credit Card Required" |
| `components/marketing/HeroSection.tsx` | Fixed hero CTA and quick plan picker Free card |
| `components/marketing/MobileMechanicSection.tsx` | Fixed two "Start Free Trial" / "7-day free trial" instances |
| `components/marketing/DVISection.tsx` | Fixed "Start Free Trial" CTA |
| `components/marketing/MarketingFooter.tsx` | Fixed "Start Free Trial" footer link |

---

## All Changes Applied

### Plan Card Changes (PricingSection.tsx)

| Before | After |
|--------|-------|
| "Trial" card — $0 — "Try everything free for 7 days" | "Free Forever" card — $0 — "Start managing jobs at no cost, no expiry" |
| CTA: "Start Free Trial" → `/signup?intent=trial` | CTA: "Start Free" → `/signup` |
| Header: "Every plan includes the full platform. Pay for the seats and scale you need." | "Each plan unlocks more capacity, intelligence, and locations. Start free — upgrade when you grow." |
| "Get Solo" | "Choose Solo" |
| "Get Starter" | "Choose Starter" |
| "Get Professional" | "Choose Professional" |
| "Get Business" | "Choose Business" |
| Starter features: "Multi-bay scheduling", "Inventory tracking" (unverified) | Removed; kept "Team job assignments", "Priority support" |
| Business features: "Fleet management" (unverified) | Removed |
| Bottom note: "All plans include a 7-day free trial. No credit card required to start." | "Free Forever requires no credit card. Paid plans billed monthly or annually." |

### FAQ Changes (FAQSection.tsx)

| Before | After |
|--------|-------|
| Q: "Do I need a credit card to start my trial?" | Q: "Do I need a credit card to get started?" |
| A: "The 7-day free trial gives you full platform access..." | A: "The Free Forever plan requires no credit card. Create an account and start managing jobs immediately at no cost." |
| CTA: "Start Free Trial" | CTA: "Start Free — No Card Required" |
| Plan CTA strip: Solo, Starter, Professional, Business | Added Free Forever ($0) as first entry |
| Strip tagline: "7-day free trial included. No credit card required." | "Free Forever requires no credit card. Paid plans billed monthly or annually." |
| Strip button: "Start with Free Trial" | "Start Free — No Card Required" |
| "Get Solo — $24/mo" | "Choose Solo — $24/mo" |
| "Get Starter — $49/mo" | "Choose Starter — $49/mo" |
| Starter answer: "multi-bay scheduling, and inventory tracking" | Removed unverified features |

### Nav Changes (MarketingHeader.tsx)

| Before | After |
|--------|-------|
| Business dropdown: "Multi-location, unlimited seats" | "Multi-location, unlimited technician seats" |
| FAQ dropdown: "Free trial details" / "7 days full access, no card required" | "Free Forever plan" / "Start free, no credit card required" |
| Desktop CTA: "Start Free Trial" | "Start Free" |
| Mobile CTA: "Start Free Trial" | "Start Free" |

### FinalCTA Changes

| Before | After |
|--------|-------|
| "Start Your 7-Day Free Trial" | "Start Free — No Credit Card Required" |

### Hero Changes (HeroSection.tsx)

| Before | After |
|--------|-------|
| Hero button: "Start Free Trial — 7 Days" | "Start Free — No Credit Card Required" |
| Quick picker card: "Free Trial / 7 days free" | "Free Forever / $0 · no card" |

### MobileMechanicSection Changes

| Before | After |
|--------|-------|
| CTA: "Start Free Trial" | "Start Free" |
| CTA: "Start Your Free Trial" | "Start Free" |
| Subtext: "7-day free trial. No credit card required." | "Free to start — no credit card required." |

### DVISection Changes

| Before | After |
|--------|-------|
| CTA: "Start Free Trial" | "Start Free" |

### MarketingFooter Changes

| Before | After |
|--------|-------|
| Footer link: "Start Free Trial" | "Start Free" |

---

## Prices Unchanged (Already Correct)

| Plan | Monthly | Annual | Status |
|------|---------|--------|--------|
| Free Forever | $0 | — | ✓ No change needed |
| Solo | $24 | $240 | ✓ Already correct |
| Starter | $49 | $490 | ✓ Already correct |
| Professional | $99 | $990 | ✓ Already correct |
| Business | $179 | $1,790 | ✓ Already correct |
| Enterprise | Contact Sales | — | ✓ No change needed |

Annual savings badge "SAVE ~17%" — mathematically accurate, kept as-is.

---

## What Was NOT Changed

- `config/plans.ts` — no change; it is the checkout source of truth
- `lib/entitlements/planRegistry.ts` — stale Business price ($199) is a separate migration; out of scope
- `commercial/plans/planManager.ts` — missing Solo and stale Business price; separate migration
- `commercial/plans/publicPricing.ts` — same; separate migration
- `app/signup/page.tsx` — already correct ($179 for Business)
- `app/api/billing/checkout/route.ts` — no change; checkout behavior unchanged
- No Creem products created or changed
- No database records modified

---

## Conflicts Documented (Not Resolved Here)

1. **Business plan price**: `planRegistry.ts` + `commercial/plans/*` = $199/$1,990; checkout = $179/$1,790. Landing and signup use $179 (correct). Internal inconsistency requires migration analysis before fixing.
2. **Solo plan missing from commercial plans**: `planManager.ts` and `publicPricing.ts` lack Solo. Checkout (`config/plans.ts`) supports Solo. Landing continues to show Solo — checkout works.

---

## Test Coverage

TypeScript: `npx tsc --noEmit` → 0 errors  
Browser verified: Pricing section DOM confirmed via `innerText` extraction — all plan names, prices, and CTAs match spec.
