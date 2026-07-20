# RedlineD1 — Public Pricing Alignment Audit

Audit date: 2026-07-21  
Scope: All public pricing surfaces, plan registry, billing configuration, marketing components.

---

## Canonical plan definitions

Source of truth: `lib/entitlements/planRegistry.ts`

| Plan key | Display name | Monthly | Annual | Technicians | Notes |
|----------|-------------|---------|--------|-------------|-------|
| `free` | Free Forever | $0 | $0 | 1 | No credit card required, no expiry |
| `solo` | Solo | $24 | $240 | 1 | Mobile mechanics, independent shops |
| `starter` | Starter | $49 | $490 | **1** | ⚠️ Corrected from 3 to 1 in this audit |
| `professional` | Professional | $99 | $990 | 8 | AI features, highlighted plan |
| `business` | Business | $179 | $1,790 | Unlimited | Up to 10 locations |
| `enterprise` | Enterprise | Contact Sales | Contact Sales | Unlimited | Custom contract |

---

## Billing provider mapping

Provider: **Creem**

| Plan | Monthly env var key | Annual env var key |
|------|--------------------|--------------------|
| Solo | `CREEM_SOLO_MONTHLY_PRODUCT_ID` | `CREEM_SOLO_ANNUAL_PRODUCT_ID` |
| Starter | `CREEM_STARTER_MONTHLY_PRODUCT_ID` | `CREEM_STARTER_ANNUAL_PRODUCT_ID` |
| Professional | `CREEM_PROFESSIONAL_MONTHLY_PRODUCT_ID` | `CREEM_PROFESSIONAL_ANNUAL_PRODUCT_ID` |
| Business | `CREEM_BUSINESS_MONTHLY_PRODUCT_ID` | `CREEM_BUSINESS_ANNUAL_PRODUCT_ID` |

**Status:** Product IDs are stored as environment variable keys, not hardcoded values. Actual Creem product IDs must be verified in the Vercel environment variables panel. If Creem product IDs are not yet configured for the corrected Starter plan (1 technician), billing must not be enabled for that plan until Creem products are updated.

---

## Public surfaces audited

### 1. `components/marketing/PricingSection.tsx`
- All plan prices correct: $0 / $24 / $49 / $99 / $179 / Custom
- Annual prices correct: $0 / $240 / $490 / $990 / $1,790 / Custom
- **CORRECTED:** Starter technician count changed from "Up to 3 technician seats" to "1 technician seat"

### 2. `components/marketing/FAQSection.tsx`
- Billing answers reference $24/mo Solo, $49/mo Starter, $99/mo Professional correctly
- **CORRECTED:** Starter FAQ updated to "1 technician seat" for Starter

### 3. `app/(marketing)/pricing/page.tsx`
- Uses `PricingSection` component — inherits corrected data
- FAQ content is accurate and confirmed

### 4. `app/signup/page.tsx` (PLAN_META)
- $0 Free Forever, $24/mo Solo, $49/mo Starter, $99/mo Professional, $179/mo Business
- Annual prices: $240/yr, $490/yr, $990/yr, $1,790/yr
- **All correct**

### 5. `components/marketing/HeroSection.tsx` (QUICK_PLANS)
- Solo $24, Starter $49, Professional $99, Business $179
- **All correct**

### 6. `lib/entitlements/planRegistry.ts`
- **CORRECTED:** Starter `techniciansTotal` changed from 3 to 1

---

## Issues found and corrected

| Issue | Severity | File | Fix |
|-------|----------|------|-----|
| Starter plan showed "Up to 3 technician seats" but constraint is 1 | HIGH | PricingSection, FAQSection, planRegistry | Changed to 1 |

---

## Legacy identifiers

No legacy plan identifiers found (`Pro`, `Pro Plus`, `$29.99`, `$49.99`, `$99.99`).

---

## Remaining manual work (not blocking deployment)

1. **Vercel env vars**: Confirm `CREEM_STARTER_*` product IDs in Vercel dashboard reflect the updated 1-technician Starter plan. If existing subscribers have 3 technicians, a migration decision is required before changing the entitlement cap enforcement.
2. **Creem dashboard**: Update Starter plan description to "1 technician seat" if displayed to customers in the Creem billing portal.

---

## Trial system

- In-app trial: 7-day trial (AppShell.tsx shows "Your 7-day trial is complete" and countdown banners)
- Free tier: "Free Forever" — no expiry, no credit card
- These are two separate systems; both are consistently implemented

---

## Annual discount

Displayed as "~17% savings" in PricingSection. Actual savings by plan:

| Plan | Monthly × 12 | Annual | Savings |
|------|-------------|--------|---------|
| Solo | $288 | $240 | $48 (16.7%) |
| Starter | $588 | $490 | $98 (16.7%) |
| Professional | $1,188 | $990 | $198 (16.7%) |
| Business | $2,148 | $1,790 | $358 (16.7%) |

"~17%" is accurate across all plans. No correction needed.
