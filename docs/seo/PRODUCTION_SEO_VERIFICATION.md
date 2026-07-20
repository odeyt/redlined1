# RedlineD1 — Production SEO Verification

Verification date: 2026-07-21  
Domain: https://www.redlined1.com  
Method: HTTP status, canonical tag, robots header, sitemap presence

---

## Summary of prior blocking issue

All marketing routes were redirecting to `/login` for unauthenticated requests. Root cause: `proxy.ts` `publicPaths` array did not include any marketing routes. Fixed: all marketing route prefixes added to `publicPaths` in both the Supabase-available and Supabase-unavailable code paths.

---

## URL verification matrix

| URL | Expected status | Auth-unblocked | Canonical expected |
|-----|----------------|---------------|-------------------|
| `https://www.redlined1.com/` | 200 | Yes (public landing rewrite) | `/` |
| `https://www.redlined1.com/pricing` | 200 | Yes | `/pricing` |
| `https://www.redlined1.com/mobile-mechanic-software` | 200 | Yes | `/mobile-mechanic-software` |
| `https://www.redlined1.com/digital-vehicle-inspection-software` | 200 | Yes | `/digital-vehicle-inspection-software` |
| `https://www.redlined1.com/auto-repair-invoicing-software` | 200 | Yes | `/auto-repair-invoicing-software` |
| `https://www.redlined1.com/repair-order-software` | 200 | Yes | `/repair-order-software` |
| `https://www.redlined1.com/ai-auto-repair-shop-software` | 200 | Yes | `/ai-auto-repair-shop-software` |
| `https://www.redlined1.com/tools/labor-rate-calculator` | 200 | Yes | `/tools/labor-rate-calculator` |
| `https://www.redlined1.com/tools/missed-revenue-calculator` | 200 | Yes | `/tools/missed-revenue-calculator` |
| `https://www.redlined1.com/tools/technician-efficiency-calculator` | 200 | Yes | `/tools/technician-efficiency-calculator` |
| `https://www.redlined1.com/resources/digital-vehicle-inspection-checklist` | 200 | Yes | `/resources/digital-vehicle-inspection-checklist` |
| `https://www.redlined1.com/resources/repair-order-template` | 200 | Yes | `/resources/repair-order-template` |
| `https://www.redlined1.com/compare` | 200 | Yes | `/compare` |
| `https://www.redlined1.com/compare/redlined1-vs-tekmetric` | 200 | Yes | `/compare/redlined1-vs-tekmetric` |
| `https://www.redlined1.com/compare/redlined1-vs-shopmonkey` | 200 | Yes | `/compare/redlined1-vs-shopmonkey` |
| `https://www.redlined1.com/sitemap.xml` | 200 | Yes | N/A |
| `https://www.redlined1.com/robots.txt` | 200 | Yes | N/A |

---

## Bare domain redirect

| Request | Expected |
|---------|----------|
| `http://redlined1.com/` | 308 → `https://www.redlined1.com/` |
| `https://redlined1.com/` | 308 → `https://www.redlined1.com/` |

Configured in Vercel dashboard. Not managed by application code.

---

## robots.txt expected content (production)

```
User-agent: *
Allow: /
Allow: /pricing
Allow: /privacy
Allow: /terms
Allow: /refund-policy
Allow: /help
Allow: /mobile-mechanic-software
Allow: /auto-repair-invoicing-software
Allow: /digital-vehicle-inspection-software
Allow: /repair-order-software
Allow: /ai-auto-repair-shop-software
Allow: /tools/
Allow: /resources/
Allow: /compare/
Disallow: /api/
Disallow: /admin/
Disallow: /auth/
Disallow: /billing/
Disallow: /login
Disallow: /signup
Disallow: /forgot-password
Disallow: /reset-password
Disallow: /onboarding/
Disallow: /settings/
Disallow: /internal/
Disallow: /portal/
Disallow: /inspection/
Disallow: /status/
Disallow: /landing-preview
Disallow: /qa
Sitemap: https://www.redlined1.com/sitemap.xml
```

---

## Structured data to verify (Google Rich Results Test)

Run https://search.google.com/test/rich-results against each URL:

| URL | Schema type | Expected result |
|-----|-------------|----------------|
| `/` | SoftwareApplication, Organization | Pass |
| `/pricing` | FAQPage | Pass |
| `/mobile-mechanic-software` | SoftwareApplication, FAQPage | Pass |
| `/resources/digital-vehicle-inspection-checklist` | HowTo or Article | Pass |
| `/compare` | ItemList | Pass |
| `/compare/redlined1-vs-tekmetric` | Table page, no fake ratings | Pass |

---

## Issues to watch for post-deployment

1. **Crawl delay**: Google re-crawls can take days to weeks after a 200 response is restored. Submit sitemap via Search Console to expedite.
2. **Coverage report**: Check Search Console Coverage report for "Redirect" or "Blocked by robots.txt" on previously blocked URLs.
3. **Canonical mismatch**: If any page previously returned 308 to `/login`, Google may have indexed the login redirect URL. Sitemap submission clears this.

---

## Non-production suppression verification

Verify via Vercel Preview URL that:
- `robots.txt` returns `Disallow: /` (full block)
- `X-Robots-Tag: noindex, nofollow` header is present on all responses

This is handled by `app/robots.ts` and `proxy.ts` checking `VERCEL_ENV`.
