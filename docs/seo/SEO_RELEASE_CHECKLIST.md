# RedlineD1 — SEO Release Checklist

Last updated: 2026-07-21

---

## Use this checklist before every production deployment that touches marketing pages

---

## Pre-deployment

### Code checks

- [ ] `npx tsc --noEmit` passes with zero errors
- [ ] `npm run build` completes without error
- [ ] No new `'use client'` component exports `metadata` (Next.js will throw at build)
- [ ] New pages have `export { metadata } from './metadata'` or inline `generateMeta()` call

### New routes

For any new public marketing page added:
- [ ] Route added to `publicPaths` in `proxy.ts` (both auth flow AND Supabase-unavailable paths)
- [ ] Route added to `PUBLIC_ROUTES` in `lib/seo/config.ts`
- [ ] Route will appear in `/sitemap.xml` (check via `app/sitemap.ts` logic)

### Claims verification

- [ ] No fabricated statistics added
- [ ] No fake testimonials or named customers added
- [ ] No fake `AggregateRating` structured data added
- [ ] Plan feature claims verified against `planRegistry.ts`
- [ ] Starter plan: 1 technician seat (not 3, not "multi-user")
- [ ] Pricing correct: $24 Solo / $49 Starter / $99 Professional / $179 Business

### Canonical and metadata

- [ ] All new pages use `https://www.redlined1.com` as canonical origin (not bare domain)
- [ ] No trailing slashes in canonical URLs
- [ ] Page titles are ≤60 chars before ` | RedlineD1`
- [ ] Meta descriptions are 140–160 chars

### Auth proxy

- [ ] All new public routes tested without login cookies — confirm 200, not redirect to `/login`
- [ ] All new private routes tested without login cookies — confirm redirect to `/login`

---

## Post-deployment

### Live verification

- [ ] `https://www.redlined1.com/sitemap.xml` returns 200 with correct URLs
- [ ] `https://www.redlined1.com/robots.txt` returns 200 with correct rules
- [ ] Spot-check 3 marketing pages: confirm 200, not redirect

### Structured data

- [ ] Run one new page through https://search.google.com/test/rich-results
- [ ] No errors or warnings on schema output

### Search Console

- [ ] Submit updated sitemap if route set changed
- [ ] Request indexing for any newly public URLs (especially those previously blocked)

---

## Rollback criteria

Roll back if any of the following is observed post-deployment:

- Authenticated pages (`/settings/`, `/billing/`, etc.) return 200 to unauthenticated requests
- `/sitemap.xml` returns 4xx or empty
- `proxy.ts` changes caused a crash (check Vercel function logs)
- Build broke (but this should be caught pre-deployment)

---

## Environment-specific behavior

| VERCEL_ENV | robots.txt | X-Robots-Tag | indexing |
|-----------|-----------|-------------|---------|
| `production` | Full allow/disallow | Not set (indexable) | Yes |
| `preview` | Disallow all | `noindex, nofollow` | No |
| `development` | Disallow all | `noindex, nofollow` | No |
| `undefined` (local) | Disallow all | Not set | No (no public URL) |
