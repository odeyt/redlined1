# RedlineD1 — Content Model

Last updated: 2026-07-21

---

## Page types

### 1. Feature landing page

**Purpose:** Target a specific software category keyword (mobile mechanic software, DVI software, etc.)  
**Route pattern:** `/{category}-software`  
**Template components:**
- `HeroSection` with feature-specific headline and subhead
- `FeatureHighlights` — 3–6 feature blocks with icon and copy
- `HowItWorksSection` — numbered steps (3–5 steps)
- `PricingSection` — full pricing table
- `FAQSection` — 4–8 questions targeting long-tail variations
- `CTASection` — primary CTA to signup or pricing

**Schema:** `SoftwareApplication`, `FAQPage`, `BreadcrumbList`  
**Metadata pattern:** `generateMeta({ title: '...', slug: '/...', pageType: 'feature' })`

### 2. Tool page

**Purpose:** Free interactive calculator; captures top-of-funnel search intent  
**Route pattern:** `/tools/{tool-name}`  
**Template components:**
- `ToolHero` — problem + tool description
- Interactive calculator component (client component)
- `CTASection` — "Use RedlineD1 to act on this number"

**Schema:** `WebPage`, optionally `HowTo`  
**Notes:** Tool pages are `'use client'` or have a client component wrapper. Export `metadata` from a separate `metadata.ts`.

### 3. Resource page

**Purpose:** Downloadable/printable reference content; targets informational keywords  
**Route pattern:** `/resources/{resource-name}`  
**Template components:**
- Resource header (title, intro, print button)
- Resource content (checklist, form, reference table)
- `PrintButton` (client component, isolated)

**Schema:** `HowTo` or `Article`  
**Notes:** Must be a server component to export `metadata`. Extract any client interactivity into isolated components.

### 4. Comparison page

**Purpose:** Capture competitor-alternative search traffic  
**Route pattern:** `/compare/redlined1-vs-{competitor}`  
**Template components:**
- Comparison hero with key differentiator
- Feature comparison table with `Status` column
- Methodology/disclaimer section ("Verify with vendor" for unconfirmed claims)
- CTA

**Schema:** No fake ratings. Use `WebPage` or simple `Article`.  
**Rules:**
- All competitor claims marked "Verify with vendor" unless sourced from competitor's own public documentation
- `VERIFIED_DATE` prominently displayed
- No fake aggregate scores or ratings

### 5. Comparison index

**Route:** `/compare`  
**Schema:** `ItemList`  
**Purpose:** Links to all comparison pages; captures "auto repair software comparison" intent

### 6. Pricing page

**Route:** `/pricing`  
**Schema:** `FAQPage`  
**Components:** `PricingSection`, `FAQSection`

---

## Metadata rules

| Field | Rule |
|-------|------|
| `title` | `"[Page title] | RedlineD1"` — max 60 chars before ` | RedlineD1` |
| `description` | 140–160 chars; include primary keyword naturally; no keyword stuffing |
| `canonical` | Always `https://www.redlined1.com/[slug]` — no trailing slash |
| `og:image` | `/icons/icon-512x512.png` default; custom per page when available |
| `robots` | Not set on public marketing pages (defaults to index/follow) |
| `robots` | `noindex, nofollow` enforced by `proxy.ts` on private routes |

---

## Component import rules

| Scenario | Rule |
|----------|------|
| Interactive button/form in a server component page | Extract to `'use client'` component, import into server page |
| Client-only page that needs metadata | Create `page.tsx` (server) + `client-page.tsx` (client) + `metadata.ts` |
| Page in `(marketing)` route group | Must be listed in `proxy.ts` `publicPaths` |
| New public route | Add to `PUBLIC_ROUTES` in `lib/seo/config.ts` AND `publicPaths` in `proxy.ts` |

---

## Content tone

- Direct, practical language
- Written from the perspective of someone who runs an actual repair shop
- No invented statistics or fabricated social proof
- Feature claims must be verifiable against actual `planRegistry.ts` entitlements
- Competitor comparisons: fact-based, "Verify with vendor" on any unconfirmed item
