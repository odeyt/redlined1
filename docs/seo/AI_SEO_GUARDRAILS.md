# RedlineD1 — AI SEO Guardrails

Last updated: 2026-07-21

---

## Purpose

This document defines what an AI assistant (or AI-generated code) MAY and MAY NOT do when generating or modifying SEO-related content for RedlineD1.

These rules exist because SEO content is a high-trust surface: it is the first thing prospects read, it affects legal compliance (false advertising), and it can damage Google rankings if it violates webmaster guidelines.

---

## Hard rules — NEVER violate

### No invented data

- Do NOT generate fake customer testimonials, quotes, or named customer case studies
- Do NOT generate fake adoption statistics ("Join 4,000+ shops", "1.2M invoices sent")
- Do NOT generate fake review counts ("4.8 stars based on 2,500 reviews")
- Do NOT generate fake "#1 rated" or "most popular" claims without verifiable source
- Do NOT add fake `AggregateRating` structured data
- Do NOT invent competitor facts or pricing

### No unsupported feature claims

- Do NOT write feature claims that contradict `planRegistry.ts` entitlements
- Do NOT claim a feature exists if it is not confirmed in the codebase
- Starter plan: 1 technician seat (not 3, not "multi-user")
- Professional plan: 8 technician seats
- AI features: Professional and above only

### No private route exposure

- Do NOT add links to `/admin/`, `/api/`, `/settings/`, `/onboarding/`, `/internal/` in public pages
- Do NOT expose tenant IDs, user IDs, or shop IDs in public URLs or SEO content
- Internal shop IDs (D1 Imports) MUST NEVER appear in public content

### No competitor trademark misuse

- Competitor names (Tekmetric, Shopmonkey, AutoLeap) may only appear on comparison pages
- Comparison pages must mark unconfirmed competitor claims as "Verify with vendor"
- Do NOT use competitor trademarks in `<title>` tags or meta descriptions of non-comparison pages

### No misleading pricing claims

- Always use canonical prices from `planRegistry.ts`
- Do NOT write "starts at $X" if that creates a false expectation (e.g., hidden fees)
- Annual pricing must match: Solo $240, Starter $490, Professional $990, Business $1,790

---

## Permitted practices

- Describing features that verifiably exist in the codebase
- Writing comparison tables with honest "Verify with vendor" caveats on unconfirmed items
- Using the phrase "Free Forever" for the $0 plan (this is the actual plan name)
- Describing the product as "Built in a real repair shop" — D1 Imports operates two locations
- Showing illustrative dashboard mockups clearly labeled "Sample data shown for illustration only"
- Writing FAQ content that accurately describes plans and limits

---

## Structured data rules

| Schema type | Allowed? | Notes |
|-------------|---------|-------|
| `Organization` | Yes | Use verified business information |
| `SoftwareApplication` | Yes | No fake ratings |
| `FAQPage` | Yes | Only real FAQs with accurate answers |
| `HowTo` | Yes | Must reflect actual product workflow |
| `BreadcrumbList` | Yes | Must match actual URL structure |
| `ItemList` | Yes | For comparison index |
| `AggregateRating` | **NO** | No real ratings exist yet |
| `Review` | **NO** | No real reviews to reference |
| `LocalBusiness` | Only if verified | D1 Imports shop data only |

---

## When adding a new claim to marketing copy

1. Ask: "Is this claim backed by actual code or business fact?"
2. If yes: cite the source (planRegistry.ts line, Supabase table, codebase feature)
3. If no: do not add the claim
4. If "maybe" / "we plan to": use future tense or "coming soon" phrasing, do not assert as present

---

## Checklist before generating a new marketing page

- [ ] All feature claims match `planRegistry.ts`
- [ ] No fake testimonials added
- [ ] No fake stats or ratings
- [ ] Competitor mentions only on comparison pages with "Verify with vendor" caveats
- [ ] New route added to `proxy.ts` `publicPaths`
- [ ] New route added to `PUBLIC_ROUTES` in `lib/seo/config.ts`
- [ ] Metadata uses `generateMeta()` with correct `slug` and `pageType`
- [ ] Sitemap regeneration confirmed (automatic via `app/sitemap.ts`)
