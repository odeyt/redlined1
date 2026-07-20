# RedlineD1 — Search Console Setup

Last updated: 2026-07-21

---

## Google Search Console

### Verification

1. Go to: https://search.google.com/search-console/
2. Click "Add property" → "URL prefix" → enter `https://www.redlined1.com`
3. Choose verification method: **HTML tag** (recommended for Next.js)
4. Copy the `<meta name="google-site-verification" content="..." />` tag
5. Add to `app/layout.tsx` root layout:
   ```tsx
   export const metadata: Metadata = {
     verification: {
       google: 'YOUR_VERIFICATION_CODE_HERE',
     },
     // ... rest of metadata
   };
   ```
6. Deploy, then click Verify in Search Console

### Sitemap submission

After verification:
1. In Search Console, go to **Sitemaps**
2. Add: `https://www.redlined1.com/sitemap.xml`
3. Click Submit
4. Expected status: "Success" — check that discovered URLs matches the count in `PUBLIC_ROUTES`

### Post-submission checks (within 48–72 hours)

- **Coverage report**: look for "Excluded" URLs that should be indexed
- **Crawl stats**: confirm Googlebot is accessing the site
- **Core Web Vitals**: check LCP, FID/INP, CLS on marketing pages
- **Manual Actions**: confirm none flagged

### URL inspection

For any URL that was previously redirecting to `/login`:
1. Open URL Inspection in Search Console
2. Enter the URL (e.g., `https://www.redlined1.com/pricing`)
3. Click "Request Indexing"
4. Repeat for all 17 marketing pages

---

## Bing Webmaster Tools

1. Go to: https://www.bing.com/webmasters/
2. Sign in with Microsoft account
3. Add site: `https://www.redlined1.com`
4. Verify via XML file method or CNAME (or import from Google Search Console)
5. Submit sitemap: `https://www.redlined1.com/sitemap.xml`

### Auto-import from Google (recommended)

Bing Webmaster allows importing property + sitemap from Google Search Console:
1. In Bing Webmaster → Settings → Import from Google Search Console
2. Connect Google account
3. Select `https://www.redlined1.com`
4. Import

---

## Google Analytics 4

### Setup

1. Create GA4 property at https://analytics.google.com/
2. Property name: `RedlineD1`
3. Timezone: UTC+7 (Indochina Time, where D1 Imports operates)
4. Currency: USD (primary billing currency)

### Measurement ID integration

```tsx
// app/layout.tsx — add GA4 script
// Use next/script for performance
import Script from 'next/script';

// In the layout JSX:
<Script
  src={`https://www.googletagmanager.com/gtag/js?id=G-XXXXXXXXXX`}
  strategy="afterInteractive"
/>
<Script id="ga4-init" strategy="afterInteractive">
  {`
    window.dataLayer = window.dataLayer || [];
    function gtag(){dataLayer.push(arguments);}
    gtag('js', new Date());
    gtag('config', 'G-XXXXXXXXXX');
  `}
</Script>
```

Replace `G-XXXXXXXXXX` with actual Measurement ID.

### Key events to track (see `SEO_ANALYTICS_EVENTS.md`)

- `signup_start` — when user clicks "Get Started" / "Start Free Trial"
- `pricing_view` — when `/pricing` page is viewed
- `tool_used` — when a calculator is used
- `resource_downloaded` — when a resource is printed/downloaded
- `comparison_viewed` — when a comparison page is viewed

---

## Privacy note

Do not send personally identifiable information (PII) to GA4. Specifically:
- Do not pass user email, shop ID, or technician name to analytics events
- Anonymous event tracking only on public marketing pages
- Authenticated app pages can use different, privacy-compliant analytics
