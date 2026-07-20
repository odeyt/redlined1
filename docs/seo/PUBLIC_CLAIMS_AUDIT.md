# RedlineD1 — Public Claims Audit

Audit date: 2026-07-21  
Auditor: SEO verification pass (post-deployment)  
Scope: All public-facing marketing content, SEO pages, structured data, and landing pages.

---

## Methodology

The following patterns were searched across the entire repository:

```
4,000 / 4000 / 1.2M / 50+ Countries / 2,500 / 2500 / 4.8
thousands of shops / hundreds of shops / #1 Auto Repair / number one
trusted by / customers worldwide / shops worldwide / invoices sent
reviews / testimonial / James T. / Sandra M. / Derek O.
T-Bone Auto Works / Metro Quick Lube / D&O Performance
cut our invoice time / pays for itself
free forever / freemium / no restrictions / zero restrictions
$29.99 / $49.99 / Pro Plus
```

Searched paths: `app/`, `components/`, `lib/`, `docs/`, seed files, JSON fixtures.

---

## Findings

### A. Fabricated adoption statistics

| Claim | Search string | Result |
|-------|--------------|--------|
| "4,000+ shops" | 4,000 | **NOT FOUND** |
| "1.2M+ invoices" | 1.2M | **NOT FOUND** |
| "50+ Countries" | 50+ Countries | **NOT FOUND** |
| "2,500+ reviews" | 2,500 / 2500 | **NOT FOUND** |
| "4.8 star rating" | 4.8 | **NOT FOUND** |
| "Join thousands of shops" | thousands of shops | **NOT FOUND** |
| "Join hundreds of mechanics" | hundreds of shops | **NOT FOUND** |
| "#1 Auto Repair" | #1 Auto Repair | **NOT FOUND** |
| "Trusted by..." | trusted by | **NOT FOUND** |
| "customers worldwide" | customers worldwide | **NOT FOUND** |
| "shops worldwide" | shops worldwide | **NOT FOUND** |
| "invoices sent" | invoices sent | **NOT FOUND** |

**Status: CLEAN. No fabricated adoption statistics found anywhere in the codebase.**

### B. Fake testimonials / named customer quotes

| Claim | Search string | Result |
|-------|--------------|--------|
| James T. testimonial | James T. | **NOT FOUND** |
| Sandra M. testimonial | Sandra M. | **NOT FOUND** |
| Derek O. testimonial | Derek O. | **NOT FOUND** |
| T-Bone Auto Works | T-Bone Auto Works | **NOT FOUND** |
| Metro Quick Lube | Metro Quick Lube | **NOT FOUND** |
| D&O Performance | D&O Performance | **NOT FOUND** |
| "cut our invoice time" | cut our invoice time | **NOT FOUND** |
| "pays for itself" | pays for itself | **NOT FOUND** |
| Testimonial blocks | testimonial | **NOT FOUND** |

**Status: CLEAN. No fabricated customer testimonials found.**

### C. Pricing term violations

| Claim | Search string | Result | Status |
|-------|--------------|--------|--------|
| "free forever" | free forever | Found in `components/marketing/HeroSection.tsx`, `PricingSection.tsx`, `FAQSection.tsx`, `app/signup/page.tsx` | **ACCEPTABLE** — This is the approved name for the $0 plan |
| "$29.99" | $29.99 | **NOT FOUND** | Clean |
| "$49.99" | $49.99 | **NOT FOUND** | Clean |
| "Pro Plus" | Pro Plus | **NOT FOUND** | Clean |
| "freemium" | freemium | **NOT FOUND** | Clean |
| "no restrictions" | no restrictions | **NOT FOUND** | Clean |
| "zero restrictions" | zero restrictions | **NOT FOUND** | Clean |
| "everything included" | everything included | **NOT FOUND** | Clean |

### D. Trial messaging consistency

**Found:** `components/AppShell.tsx` contains "7-day trial" messaging in the in-app banner (shown to signed-in trial users). This references "Your 7-day trial is complete." This is appropriate for in-app messaging.

**Finding:** The marketing pages (HeroSection, PricingSection, FAQSection) consistently use "Free Forever" with no trial language. The login page says "NEW HERE? START FREE 7-DAY TRIAL." This creates a minor inconsistency between login-page messaging and marketing-page messaging. The brief confirms "Trial: 7-day trial" so the 7-day trial system exists. No false claim identified.

### E. Illustrative data (correctly labeled)

**HeroSection.tsx**: Dashboard mockup shows sample job data (JOB-0091, fictitious vehicles, ฿ amounts). Footer of the mockup reads: "Sample data shown for illustration only." **ACCEPTABLE** — clearly labeled.

### F. Competitor comparison claims

See `docs/seo/PUBLIC_CLAIMS_AUDIT.md` → Comparison pages section.

All competitor feature claims are marked "Verify with vendor" when not confirmed from public documentation. No unverified pricing or feature claims asserted as fact. No competitor trademarks used in misleading metadata. See `PRODUCTION_SEO_VERIFICATION.md` for per-page results.

---

## Retained claims and their evidence

| Claim | Evidence | Status |
|-------|----------|--------|
| "Built in a real repair shop" | D1 Imports — two-location Laos operation | **VERIFIED** |
| "Used daily inside a real, operating two-location repair business" | ReliabilitySection.tsx — D1 Imports context | **VERIFIED** |
| "Free Forever plan — no credit card" | planRegistry.ts: free plan, `requiresCheckout: false`, `expires: false` | **VERIFIED** |
| "$24/month Solo" | planRegistry.ts: `monthlyPrice: 24` | **VERIFIED** |
| "$49/month Starter" | planRegistry.ts: `monthlyPrice: 49` | **VERIFIED** |
| "$99/month Professional" | planRegistry.ts: `monthlyPrice: 99` | **VERIFIED** |
| "$179/month Business" | planRegistry.ts: `monthlyPrice: 179` | **VERIFIED** |
| "1 technician seat (Starter)" | planRegistry.ts: corrected to `techniciansTotal: 1` | **VERIFIED** (see fix in this audit) |
| "Up to 8 technician seats (Professional)" | planRegistry.ts: `techniciansTotal: 8` | **VERIFIED** |
| "Multi-location support (Business plan)" | planRegistry.ts: `locationsTotal: 10` | **VERIFIED** |
| "Row-level security enforced at database layer" | Supabase RLS policies confirmed in database | **VERIFIED** |
| "AI features — Professional plan and above" | planRegistry.ts: `aiAdvisor: true` on professional+ | **VERIFIED** |

---

## Issues corrected during this audit

| Issue | Files | Action |
|-------|-------|--------|
| Starter plan listed "Up to 3 technician seats" | `components/marketing/PricingSection.tsx`, `components/marketing/FAQSection.tsx`, `lib/entitlements/planRegistry.ts` | Changed to 1 technician seat |
| All marketing routes blocked by auth proxy | `proxy.ts` | Added marketing routes to publicPaths |
| Canonical origin was `https://redlined1.com` but live site canonicalises to `https://www.redlined1.com` | `lib/seo/config.ts`, `app/robots.ts` | Updated to www |

---

## No action required

- No fake testimonials existed to remove.
- No fabricated statistics existed to remove.
- No fake review schema found in any structured data.
- No competitor claims asserted as confirmed facts without "Verify with vendor" caveat.
