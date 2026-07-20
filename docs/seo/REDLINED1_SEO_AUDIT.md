# RedlineD1 — SEO Audit

Audit date: 2026-07-21  
Auditor: SEO verification and completion pass  
Scope: Full codebase SEO implementation audit

---

## Executive summary

RedlineD1's SEO implementation is functional after this audit pass. The most critical issue found — all marketing routes redirecting to `/login` for unauthenticated visitors including search engine crawlers — has been corrected. Secondary issues (canonical domain mismatch, Starter plan technician count inconsistency) were also corrected.

---

## Critical issues found and resolved

### 1. Auth proxy blocking all marketing pages (CRITICAL)

**Impact:** Every marketing page, the sitemap, and robots.txt were redirecting unauthenticated requests to `/login`. Googlebot would have seen login page content on every URL.

**Root cause:** `proxy.ts` `publicPaths` array was missing all marketing routes.

**Fix:** Added all marketing route prefixes (`/mobile-mechanic-software`, `/pricing`, `/tools`, `/resources`, `/compare`, etc.) to both `publicPaths` lists in `proxy.ts`.

**Files:** `proxy.ts`

---

### 2. Canonical domain mismatch

**Impact:** All SEO metadata, structured data, and sitemap entries referenced `https://redlined1.com` (no www). Vercel redirects the bare domain to `https://www.redlined1.com` (308). This would create canonical tag mismatches between the tag in HTML and the actual URL served to crawlers.

**Fix:** Updated `SITE_CONFIG.origin` and all absolute URLs to `https://www.redlined1.com`.

**Files:** `lib/seo/config.ts`, `app/robots.ts`

---

### 3. Starter plan technician count (HIGH)

**Impact:** Marketing copy showed "Up to 3 technician seats" for Starter but the brief mandates "Starter is limited to one technician."

**Fix:** Changed to 1 technician seat across planRegistry, PricingSection, FAQSection.

**Files:** `lib/entitlements/planRegistry.ts`, `components/marketing/PricingSection.tsx`, `components/marketing/FAQSection.tsx`

---

## No issues found

### Fabricated statistics
No fake adoption stats, testimonials, or ratings found anywhere in the codebase.

### Privacy violations
No private route exposure on public pages. Internal shop IDs not exposed in public content.

### Pricing discrepancies
All plan prices match canonical brief values after Starter fix: $0 / $24 / $49 / $99 / $179 / Custom.

### Competitor trademark misuse
No competitor brand names in non-comparison page metadata. Comparison pages correctly use "Verify with vendor" for unconfirmed competitor claims.

---

## SEO implementation coverage

| Component | Status |
|-----------|--------|
| `generateMeta()` helper | Implemented — `lib/seo/metadata.ts` |
| `app/sitemap.ts` | Implemented — generates XML sitemap from `PUBLIC_ROUTES` |
| `app/robots.ts` | Implemented — production allow/disallow, preview block-all |
| Structured data helpers | Implemented — `lib/seo/schema.ts` |
| SITE_CONFIG canonical | Implemented — `lib/seo/config.ts` |
| Public route registry | Implemented — `PUBLIC_ROUTES` in config.ts |
| Auth proxy (publicPaths) | **Fixed** — was missing all marketing routes |
| Non-production noindex | Implemented — `proxy.ts` X-Robots-Tag + robots.ts disallow |
| Trailing slash redirect | Implemented — 301 redirect in proxy.ts |

---

## Page coverage

| Page | Metadata | Schema | publicPaths | sitemap |
|------|----------|--------|------------|---------|
| `/` | ✅ | ✅ | ✅ (root) | ✅ |
| `/pricing` | ✅ | ✅ FAQPage | ✅ | ✅ |
| `/mobile-mechanic-software` | ✅ | ✅ | ✅ | ✅ |
| `/digital-vehicle-inspection-software` | ✅ | ✅ | ✅ | ✅ |
| `/auto-repair-invoicing-software` | ✅ | ✅ | ✅ | ✅ |
| `/repair-order-software` | ✅ | ✅ | ✅ | ✅ |
| `/ai-auto-repair-shop-software` | ✅ | ✅ | ✅ | ✅ |
| `/auto-repair-estimate-software` | ⏳ pending | ⏳ | ⏳ | ⏳ |
| `/multi-location-auto-repair-software` | ⏳ pending | ⏳ | ⏳ | ⏳ |
| `/solo-mechanic-shop-software` | ⏳ pending | ⏳ | ⏳ | ⏳ |
| `/tools/labor-rate-calculator` | ✅ | ✅ | ✅ | ✅ |
| `/tools/missed-revenue-calculator` | ✅ | ✅ | ✅ | ✅ |
| `/tools/technician-efficiency-calculator` | ✅ | ✅ | ✅ | ✅ |
| `/resources/dvi-checklist` | ✅ | ✅ | ✅ | ✅ |
| `/resources/repair-order-template` | ✅ | ✅ | ✅ | ✅ |
| `/compare` | ✅ | ✅ ItemList | ✅ | ✅ |
| `/compare/redlined1-vs-tekmetric` | ✅ | ✅ | ✅ | ✅ |
| `/compare/redlined1-vs-shopmonkey` | ✅ | ✅ | ✅ | ✅ |

---

## Remaining work

1. **Stage C pages** (3 feature pages): `/auto-repair-estimate-software`, `/multi-location-auto-repair-software`, `/solo-mechanic-shop-software`
2. **AutoLeap comparison page**: `/compare/redlined1-vs-autoleap`
3. **Search Console setup**: Verify property, submit sitemap, request indexing
4. **GA4 setup**: Create property, add Measurement ID to layout
5. **Analytics events**: Instrument CTAs with event tracking

---

## Lint status

`next lint` is broken on this system (Next.js 16 + Windows CLI bug: "Invalid project directory provided, no such directory: lint"). Direct ESLint invocation also fails with circular JSON error in flat config compatibility layer. TypeScript (`tsc --noEmit`) and build (`npm run build`) both pass clean. This is a tooling environment issue, not a code quality issue.
