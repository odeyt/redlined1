# Search Console Submission Checklist — Stage C

**Date:** 2026-07-21
**Domain:** https://www.redlined1.com

---

## Pre-Submission Verification

### 1. Domain ownership

- [ ] Verify `NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION` env var is set in Vercel production environment
- [ ] Confirm the meta tag renders on the homepage: `<meta name="google-site-verification" content="..." />`
- [ ] Search Console property: **URL prefix** `https://www.redlined1.com` (not bare domain)
- [ ] Confirm 308 redirect: `https://redlined1.com` → `https://www.redlined1.com`

### 2. Sitemap

- [ ] `https://www.redlined1.com/sitemap.xml` returns HTTP 200
- [ ] Sitemap uses `https://www.redlined1.com` origin (fixed in Stage C — was bare domain)
- [ ] All 6 new Stage C routes appear in sitemap:
  - [ ] `/auto-repair-estimate-software`
  - [ ] `/multi-location-auto-repair-software`
  - [ ] `/solo-mechanic-shop-software`
  - [ ] `/auto-repair-crm`
  - [ ] `/technician-time-tracking`
  - [ ] `/automotive-business-operating-system`
- [ ] No 404 routes in sitemap (removed `/compare/redlined1-vs-autoleap` in Stage C)

### 3. Robots.txt

- [ ] `https://www.redlined1.com/robots.txt` returns HTTP 200
- [ ] `Disallow` rules do not block any marketing pages
- [ ] Sitemap URL is referenced in robots.txt

### 4. New route accessibility

Verify each new route returns HTTP 200 **without authentication cookies**:

```
curl -I https://www.redlined1.com/auto-repair-estimate-software
curl -I https://www.redlined1.com/multi-location-auto-repair-software
curl -I https://www.redlined1.com/solo-mechanic-shop-software
curl -I https://www.redlined1.com/auto-repair-crm
curl -I https://www.redlined1.com/technician-time-tracking
curl -I https://www.redlined1.com/automotive-business-operating-system
```

All must return `HTTP/2 200`, not a redirect to `/login`.

### 5. Canonical tags

For each new page, verify canonical points to the www version:

```html
<link rel="canonical" href="https://www.redlined1.com/[slug]" />
```

- [ ] `/auto-repair-estimate-software`
- [ ] `/multi-location-auto-repair-software`
- [ ] `/solo-mechanic-shop-software`
- [ ] `/auto-repair-crm`
- [ ] `/technician-time-tracking`
- [ ] `/automotive-business-operating-system`

### 6. Structured data

Validate each new page in Google's Rich Results Test or schema.org validator:

- [ ] `SoftwareApplication` schema present
- [ ] `WebPage` schema present
- [ ] `FAQPage` schema present (all pages have FAQs)
- [ ] No errors or warnings from validator
- [ ] No invented ratings, review counts, or aggregate review data

### 7. Page indexability

For each new page, verify in page source:

- [ ] No `<meta name="robots" content="noindex">` tag
- [ ] No `X-Robots-Tag: noindex` response header

---

## Search Console Submission Steps

1. Log in to [Google Search Console](https://search.google.com/search-console)
2. Select property: `https://www.redlined1.com`
3. Navigate to **Sitemaps**
4. Submit: `https://www.redlined1.com/sitemap.xml`
5. For each new URL, use **URL Inspection** tool → **Request Indexing**

Priority order for manual indexing requests:
1. `/automotive-business-operating-system` (category/strategic page)
2. `/auto-repair-crm` (high search volume intent)
3. `/technician-time-tracking` (calculator cross-link traffic)
4. `/multi-location-auto-repair-software` (high commercial intent)
5. `/auto-repair-estimate-software` (high commercial intent)
6. `/solo-mechanic-shop-software` (long-tail segment)

---

## Post-Submission Monitoring

**Week 1:**
- [ ] Check Search Console > Coverage for new URLs (should move from "Discovered" to "Crawled")
- [ ] Verify no coverage errors for new routes

**Week 2–4:**
- [ ] Check impressions in Performance tab for new routes
- [ ] Verify Core Web Vitals for new pages (should inherit existing layout performance)

---

## Known Issues

| Issue | Impact | Status |
|-------|--------|--------|
| `planRegistry.ts` price ($199) vs display ($179) | Could cause mismatch if structured data ever includes pricing | Not added to schema — no pricing in SoftwareApplication schema |
| Centralized inventory cross-location not live | Potential misleading content risk | Explicitly disclaimed on `/multi-location-auto-repair-software` |
