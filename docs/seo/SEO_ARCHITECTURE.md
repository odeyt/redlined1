# RedlineD1 — SEO Architecture

Last updated: 2026-07-21

---

## Framework

Next.js 16.2.9 App Router with Turbopack. SEO is implemented via:

1. **`generateMetadata()` / `metadata` exports** — page-level title, description, canonical, OG, Twitter
2. **`app/sitemap.ts`** — dynamic XML sitemap via Next.js route handler
3. **`app/robots.ts`** — robots.txt via Next.js route handler
4. **`lib/seo/schema.ts`** — JSON-LD structured data helpers (Organization, SoftwareApplication, FAQPage, HowTo, BreadcrumbList, ItemList)
5. **`lib/seo/config.ts`** — canonical `SITE_CONFIG` object, `PUBLIC_ROUTES` list, `PRIVATE_ROUTE_PREFIXES` list
6. **`lib/seo/metadata.ts`** — `generateMeta()` helper that constructs full `Metadata` objects with canonical URLs

---

## Route structure

```
app/
├── (marketing)/          ← route group (no URL segment)
│   ├── layout.tsx        ← marketing shell: nav, footer, OG
│   ├── page.tsx          ← / (rewritten from landing-preview for unauth'd)
│   ├── pricing/
│   ├── mobile-mechanic-software/
│   ├── digital-vehicle-inspection-software/
│   ├── auto-repair-invoicing-software/
│   ├── repair-order-software/
│   ├── ai-auto-repair-shop-software/
│   ├── auto-repair-estimate-software/         ← Stage C (pending)
│   ├── multi-location-auto-repair-software/   ← Stage C (pending)
│   ├── solo-mechanic-shop-software/           ← Stage C (pending)
│   ├── tools/
│   │   ├── labor-rate-calculator/
│   │   ├── missed-revenue-calculator/
│   │   └── technician-efficiency-calculator/
│   ├── resources/
│   │   ├── digital-vehicle-inspection-checklist/
│   │   └── repair-order-template/
│   └── compare/
│       ├── page.tsx                           ← comparison index
│       ├── redlined1-vs-tekmetric/
│       └── redlined1-vs-shopmonkey/
├── sitemap.ts            ← /sitemap.xml
├── robots.ts             ← /robots.txt
└── (app)/                ← authenticated app, noindex enforced by proxy.ts
```

---

## Auth proxy interaction (critical)

**File:** `proxy.ts` (Vercel edge middleware convention)

The auth proxy runs on every request. Marketing routes MUST be listed in the `publicPaths` array — if not listed, unauthenticated visitors (including Googlebot) are redirected to `/login`.

**Current publicPaths includes:**
- All auth flows (`/login`, `/signup`, etc.)
- Legal pages (`/privacy`, `/terms`, `/refund-policy`)
- All marketing route prefixes (uses `startsWith` match)
- SEO files (`/robots.txt`, `/sitemap.xml`)

**Critical invariant:** Any new public marketing page MUST be added to `publicPaths` in `proxy.ts` before it can be indexed. Adding it to `PUBLIC_ROUTES` in `lib/seo/config.ts` is not sufficient on its own.

---

## Canonical URL strategy

- Canonical domain: `https://www.redlined1.com`
- Bare domain `redlined1.com` returns HTTP 308 → `www.redlined1.com` (Vercel redirect configured in dashboard)
- All canonical tags, OG URLs, sitemap URLs, and robots.txt use `https://www.redlined1.com/`
- Source of truth: `SITE_CONFIG.origin` in `lib/seo/config.ts`

---

## Metadata generation

**`lib/seo/metadata.ts`** — `generateMeta(opts)` returns a `Metadata` object:
- `title`: formatted as `"${title} | RedlineD1"`
- `description`: from opts or SITE_CONFIG.description
- `alternates.canonical`: `${SITE_CONFIG.origin}${slug}`
- `openGraph`: title, description, canonical URL, site name, OG image
- `twitter`: card type, title, description, image

**Pattern for page files (server components):**
```typescript
// metadata.ts (separate file)
import { generateMeta } from '@/lib/seo/metadata';
export const metadata = generateMeta({ title: '...', slug: '/path', pageType: 'feature' });

// page.tsx (imports from metadata.ts)
export { metadata } from './metadata';
```

**Why separate files?** Pages that use client components (e.g., interactive calculators) must be `'use client'` — but Next.js does not allow exporting `metadata` from client components. Splitting into `page.tsx` + `metadata.ts` avoids this constraint.

---

## Structured data (JSON-LD)

**`lib/seo/schema.ts`** provides factory functions. Each page embeds schema in a `<script type="application/ld+json">` tag server-side.

| Schema type | Used on |
|-------------|---------|
| `Organization` | Home, pricing, landing pages |
| `SoftwareApplication` | Feature landing pages |
| `FAQPage` | FAQ sections on landing pages |
| `HowTo` | Resource/guide pages |
| `BreadcrumbList` | All pages with navigation path |
| `ItemList` | Comparison index page |
| `WebPage` | Fallback for pages without specific schema |

---

## Sitemap

**`app/sitemap.ts`** generates `/sitemap.xml` dynamically. Sources:
- `PUBLIC_ROUTES` from `lib/seo/config.ts` — all known marketing routes
- `changeFrequency` and `priority` set per route type

Production URL: `https://www.redlined1.com/sitemap.xml`

---

## Non-production indexing suppression

Three layers prevent staging/preview URLs from being indexed:

1. **`proxy.ts`**: Adds `X-Robots-Tag: noindex, nofollow` to all responses when `VERCEL_ENV === 'preview'`
2. **`app/robots.ts`**: Returns `disallow: '/'` for all user agents when not in production
3. **`app/layout.tsx` root** (if applicable): Can add `<meta name="robots" content="noindex">` programmatically

---

## Current coverage

| Route segment | SEO implemented | Notes |
|--------------|----------------|-------|
| `/` | Yes | Home/landing, full schema |
| `/pricing` | Yes | FAQ schema, pricing table |
| `/mobile-mechanic-software` | Yes | Feature page |
| `/digital-vehicle-inspection-software` | Yes | Feature page |
| `/auto-repair-invoicing-software` | Yes | Feature page |
| `/repair-order-software` | Yes | Feature page |
| `/ai-auto-repair-shop-software` | Yes | Feature page |
| `/auto-repair-estimate-software` | Pending | Stage C |
| `/multi-location-auto-repair-software` | Pending | Stage C |
| `/solo-mechanic-shop-software` | Pending | Stage C |
| `/tools/*` | Yes | Calculators |
| `/resources/*` | Yes | Checklist, template |
| `/compare` | Yes | Comparison index |
| `/compare/redlined1-vs-tekmetric` | Yes | Comparison page |
| `/compare/redlined1-vs-shopmonkey` | Yes | Comparison page |
| `/compare/redlined1-vs-autoleap` | Planned | Not yet created |
