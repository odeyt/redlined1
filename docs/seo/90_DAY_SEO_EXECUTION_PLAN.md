# RedlineD1 — 90-Day SEO Execution Plan

Last updated: 2026-07-21  
Start date: 2026-07-21

---

## Month 1 (Days 1–30): Foundation and indexing

### Week 1–2: Technical SEO bedrock

- [x] Fix auth proxy blocking all marketing routes (`proxy.ts`)
- [x] Fix canonical domain (`www.redlined1.com`)
- [x] Create DVI checklist resource page
- [x] Create repair order template resource page
- [x] Create comparison index page
- [x] Create Tekmetric comparison page
- [x] Create Shopmonkey comparison page
- [ ] Set up Google Search Console, verify property
- [ ] Submit sitemap
- [ ] Request indexing for all 17 marketing URLs
- [ ] Set up Bing Webmaster Tools
- [ ] Set up GA4, add Measurement ID to layout

### Week 3–4: Stage C feature pages

- [ ] Create `/auto-repair-estimate-software`
- [ ] Create `/multi-location-auto-repair-software`
- [ ] Create `/solo-mechanic-shop-software`
- [ ] Add routes to `proxy.ts` and `PUBLIC_ROUTES`
- [ ] Confirm sitemap updates

---

## Month 2 (Days 31–60): Content and structure

### Content

- [ ] AutoLeap comparison page (`/compare/redlined1-vs-autoleap`)
- [ ] Blog or guides section (if prioritized)
- [ ] Additional resource pages (if planned)

### Technical

- [ ] Review Search Console Coverage report — fix any remaining excluded URLs
- [ ] Core Web Vitals audit on mobile — fix any LCP/CLS issues
- [ ] Run Rich Results Test on all structured-data pages
- [ ] Verify internal linking is implemented on all feature pages (per `INTERNAL_LINKING_MAP.md`)

### Analytics

- [ ] Instrument `cta_click` events on all marketing CTAs
- [ ] Instrument `pricing_plan_click` on pricing page
- [ ] Set up signup funnel in GA4
- [ ] Link Search Console to GA4

---

## Month 3 (Days 61–90): Growth signals

### Organic link acquisition (Stage D — confirm before starting)

- [ ] Submit DVI checklist to relevant directories and resource lists
- [ ] Submit repair order template to mechanic communities
- [ ] List RedlineD1 on G2, Capterra, Software Advice (manual submissions)
- [ ] Monitor Search Console for any new inbound links

### Measurement

- [ ] Review GA4 — identify which pages drive signups
- [ ] Review Search Console — identify which queries are getting impressions but low CTR
- [ ] Optimize meta descriptions for low-CTR high-impression queries
- [ ] Identify gaps in keyword coverage from `KEYWORD_MAP.md`

---

## Success metrics at 90 days

| Metric | Target | How to measure |
|--------|--------|---------------|
| Pages indexed | 15+ marketing pages | Search Console Coverage |
| Sitemap submitted | Yes | Search Console Sitemaps |
| Organic impressions (GSC) | Trending up | Search Console Performance |
| 0 blocked marketing pages | 0 URLs redirecting to /login | URL Inspection |
| Core Web Vitals | All green | Search Console CWV report |

---

## What is NOT in this plan

- Paid search / Google Ads — out of scope
- Social media SEO — out of scope for this plan
- Stage D backlink CRM and automated outreach — explicitly deferred until manually initiated
- AI content generation pipeline — deferred
