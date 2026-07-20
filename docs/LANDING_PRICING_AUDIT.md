# LANDING_PRICING_AUDIT.md
# Redlined1 — Pricing & Copy Audit Report
# Audited: 2026-07-20

---

## 1. Source-of-Truth Hierarchy

| Priority | File | Role | Business Price |
|----------|------|------|----------------|
| **1 — Checkout** | `config/plans.ts` | Drives Creem `getProductId()` | **$179 / $1,790** |
| 2 — Entitlements | `lib/entitlements/planRegistry.ts` | Feature gates, usage limits | $199 / $1,990 ⚠️ |
| 3 — Commercial API | `commercial/plans/planManager.ts` | `/api/billing/plans` response | $199 / $1,990 ⚠️ |
| 4 — Public display | `commercial/plans/publicPricing.ts` | (currently unused by landing) | $199 / $1,990 ⚠️ |
| 5 — Signup page | `app/signup/page.tsx` | Shows price at registration | $179 / $1,790 ✓ |
| 6 — Landing section | `components/marketing/PricingSection.tsx` | Public pricing cards | $179 / $1,790 ✓ |

**Resolution**: `config/plans.ts` drives actual payment sessions. Its $179/$1,790 is what customers are charged. The landing page and signup page already display the correct amount. `planRegistry.ts` and commercial plans carry a stale $199 figure but do not affect checkout amounts. This discrepancy is out of scope for the landing update (requires migration analysis).

---

## 2. All Files Containing Pricing Data

| File | Type | Plan Names | Notes |
|------|------|------------|-------|
| `config/plans.ts` | Checkout config | free, solo, starter, professional, business, enterprise | Canonical for checkout |
| `lib/entitlements/planRegistry.ts` | Entitlement engine | Free Forever, Solo, Starter, Professional, Business, Enterprise | Stale $199 Business |
| `commercial/plans/planManager.ts` | API response | free, starter, professional, business, enterprise | Missing Solo; $199 Business |
| `commercial/plans/publicPricing.ts` | Display data | free, starter, professional, business, enterprise | Missing Solo; $199 Business; unused |
| `app/signup/page.tsx` | Registration UI | free, solo, starter, professional, business | Shows $179 Business ✓ |
| `components/marketing/PricingSection.tsx` | Landing cards | Trial(!), solo, starter, professional, business, enterprise | Wrong "Trial" card; see issues |
| `components/marketing/FAQSection.tsx` | FAQ answers | Solo $24, Starter $49, Professional $99 | 7-day trial claim inaccurate |
| `components/marketing/MarketingHeader.tsx` | Nav dropdown | Solo, Starter, Professional, Business | "unlimited seats" incorrect |
| `components/marketing/FinalCTA.tsx` | Footer CTA | (no explicit plans) | "7-Day Free Trial" claim |
| `commercial/trials/onboardingHook.ts` | Trial logic | professional (14-day trial) | 14-day, not 7-day |

---

## 3. Current Package Names (Before Fix)

| Landing Name | Registry Name | Status |
|-------------|---------------|--------|
| Trial | *(no such plan key)* | ❌ Not a real plan — remove |
| Solo | Solo | ✓ |
| Starter | Starter | ✓ |
| Professional | Professional | ✓ |
| Business | Business | ✓ |
| Enterprise | Enterprise | ✓ |
| *(absent)* | Free Forever | ❌ Missing from landing cards |

---

## 4. Pricing Conflicts

### 4.1 "Trial" card instead of "Free Forever"
- **Problem**: PricingSection shows a "Trial" plan at $0 with "Full platform access for 7 days." There is no `trial` plan key in any authoritative source. The plan registry's free tier is called "Free Forever" and is permanent.
- **Impact**: Misleads users into thinking Free access expires. Users selecting "trial" are routed to `/signup?intent=trial` which maps to the `free` plan.
- **Fix**: Replace "Trial" card with "Free Forever" card.

### 4.2 "All plans include a 7-day free trial"
- **Problem**: Bottom note in PricingSection and CTAs throughout claim "7-day free trial." Backend (`onboardingHook.ts`) implements a 14-day Professional trial, only when `BILLING_ENABLED=true`. Billing is disabled by default.
- **Impact**: Advertising a trial that the live system does not actively provide.
- **Fix**: Remove "7-day free trial" language. Use "Start Free — No Credit Card Required" for Free Forever. Use "Choose [Plan]" for paid plans until a trial is confirmed active.

### 4.3 Business plan price in planRegistry vs checkout
- **Problem**: `lib/entitlements/planRegistry.ts` and `commercial/plans/` have Business at $199/$1,990. Checkout config (`config/plans.ts`) has $179/$1,790.
- **Impact**: API endpoint `/api/billing/plans` returns $199 but checkout charges $179. Landing already shows $179.
- **Resolution**: Landing page should continue showing $179 (matching checkout). Stale $199 in planRegistry is an internal inconsistency to fix separately.

### 4.4 "Every plan includes the full platform"
- **Problem**: PricingSection header claims "Every plan includes the full platform." The plan registry and config/plans.ts clearly show tiered feature access (AI, reports, repair intelligence, multi-location all gated).
- **Fix**: Remove this claim.

### 4.5 Annual savings badge "SAVE ~17%"
- **Status**: Mathematically accurate for all plans (each annual price = 10× monthly = 16.7% off).
- **Action**: Keep, but clarify meaning.

### 4.6 Feature claims in Starter card
- **Problem**: PricingSection shows "Multi-bay scheduling" and "Inventory tracking" for Starter. Neither appears in `config/plans.ts` or `planRegistry.ts`.
- **Fix**: Remove unsubstantiated claims. Replace with factual features.

### 4.7 Professional card claims "Up to 8 technician seats"
- **Status**: `config/plans.ts` `maxTechnicians: 8` confirms this. ✓

### 4.8 Business card claims "Unlimited technician seats"
- **Status**: `config/plans.ts` `maxTechnicians: null` (unlimited). ✓

### 4.9 Business card claims "Multi-location dashboard"
- **Status**: `config/plans.ts` `multiLocation: true` for Business. The MultiLocationSection confirms shop_mirrors are available. ✓ (but "Fleet management" is unconfirmed)

### 4.10 Nav "Multi-location, unlimited seats" for Business
- **Problem**: Nav dropdown description says "Multi-location, unlimited seats." The "unlimited seats" claim in nav context implies unlimited users. Business actually has `maxUsers: 25` (per planRegistry) and unlimited technicians.
- **Fix**: Update description.

### 4.11 FAQ "Do I need a credit card to start my trial?"
- **Problem**: Answer says "The 7-day free trial gives you full platform access." The actual free tier is Free Forever (permanent, not 7-day), and paid trials are 14-day Professional trials that only activate when billing is enabled.
- **Fix**: Update to describe Free Forever accurately.

---

## 5. Outdated Plan Names Found

| Location | Outdated Name | Action |
|----------|---------------|--------|
| PricingSection.tsx `key: 'trial'` | "Trial" | Replace with "Free Forever" |
| FAQSection "free trial" language | "trial" framing of Free tier | Replace with "Free Forever" |
| FinalCTA.tsx CTA text | "Start Your 7-Day Free Trial" | Update |
| MarketingHeader.tsx nav | "7 days full access, no card required" | Update |

No instances of "Basic", "Pro", "Shop Pro", "Growth", or "Premium" found in marketing components. ✓

---

## 6. Hardcoded Values

| File | Value | Type | Action |
|------|-------|------|--------|
| PricingSection.tsx | All prices, features, plan names | Hardcoded array | Keep hardcoded but validate against `config/plans.ts` |
| FAQSection.tsx | `$24/mo`, `$49/mo`, `$99/mo`, `$179/mo` | Hardcoded | Correct per checkout config ✓ |
| HeroSection.tsx | `$24`, `$49`, `$99`, `$179` in QUICK_PLANS | Hardcoded | Correct ✓ |
| MarketingHeader.tsx | `$24/mo`, `$49/mo`, `$99/mo`, `$179/mo` | Nav labels | Correct ✓ |

**Architecture note**: The landing page uses its own hardcoded data, not importing from `config/plans.ts` or `commercial/plans/publicPricing.ts`. This creates a second source of truth. Ideal architecture would import from `config/plans.ts` or `publicPricing.ts`, but changing this in scope creates risk. For now: validate landing data against source files and document.

---

## 7. Checkout/Product Mapping Status

- Creem product IDs are resolved from env vars via `config/plans.ts` `getProductId()`.
- Solo, Starter, Professional, Business all have Creem product key env var names defined.
- Free and Enterprise have no Creem checkout (handled separately). ✓
- Landing page CTAs route to `/signup?plan={key}&period={interval}` which persists to localStorage for post-email-verification checkout. ✓
- Enterprise routes to `mailto:` — acceptable but not a formal contact form.

---

## 8. Trial Inconsistencies

| Source | Trial Claim |
|--------|-------------|
| `onboardingHook.ts` | 14-day Professional trial (when BILLING_ENABLED=true) |
| PricingSection.tsx | "7-day free trial" |
| FAQSection.tsx | "7-day free trial" |
| FinalCTA.tsx | "7-Day Free Trial" |
| MarketingHeader.tsx | "7 days full access" |

**Decision**: Remove all "7-day trial" claims from the public landing. The Free Forever plan is the conversion tool when billing is disabled. If a paid trial is confirmed active in production, language should read "14-day trial" matching the backend.

---

## 9. Recommended Changes

### Must Fix
- [ ] Replace "Trial" plan card with "Free Forever" card
- [ ] Remove "All plans include a 7-day free trial" note
- [ ] Remove "Every plan includes the full platform"
- [ ] Fix "Start Free Trial" CTAs → "Start Free" (Free) or "Choose [Plan]" (paid)
- [ ] Fix FAQSection trial language
- [ ] Fix FinalCTA trial language
- [ ] Remove unverified feature claims (multi-bay scheduling, inventory tracking, fleet management)
- [ ] Fix nav "unlimited seats" description for Business

### Should Fix
- [ ] Add Free Forever to FAQ plan CTA strip
- [ ] Update FAQ "Do I need a credit card?" to reflect Free Forever, not trial
- [ ] Update annual savings language to be plan-specific where possible
- [ ] Clarify technician limits in card feature lists

### Document Only (Out of Scope for Landing)
- [ ] Reconcile `planRegistry.ts` Business price ($199 vs $179)
- [ ] Add Solo plan to `commercial/plans/planManager.ts` and `publicPricing.ts`

---

## 10. Files Proposed for Modification

1. `components/marketing/PricingSection.tsx`
2. `components/marketing/FAQSection.tsx`
3. `components/marketing/FinalCTA.tsx`
4. `components/marketing/MarketingHeader.tsx`

**Files NOT modified**:
- `config/plans.ts` — source of truth, correct as-is
- `lib/entitlements/planRegistry.ts` — separate migration required
- `commercial/plans/planManager.ts` — separate migration required
- `commercial/plans/publicPricing.ts` — separate migration required
- `app/signup/page.tsx` — already correct
- `app/api/billing/checkout/route.ts` — no changes needed
