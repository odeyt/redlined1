# RedlineD1 organic traffic launch

Prepared 26 October 2026. Target: English-speaking repair shops and mobile mechanics worldwide.

## Observed baseline

- Production: Vercel team `redlined1-s-projects`, project `redlined1`, GitHub `odeyt/redlined1`. Live homepage build `74305db` matches the checked-out main revision before this work.
- Homepage has an indexable robots tag, a canonical URL, useful product content and a GA4 script for `G-9QY4K8MZ1X`. Analytics account ownership and event collection are not verified by the script's presence.
- Live robots.txt and sitemap.xml are accessible. Sitemap omits the shop-audit page.
- Google verification metadata contains `XXXXXXXXX`. This is not a valid verification token; DNS or another method could still have verified the property.
- No homepage JSON-LD was present. Most feature navigation points to homepage fragments rather than dedicated search landing pages.
- A public search returned no site results. This is not proof of Google's index status; use Search Console URL Inspection.

## Implementation

- Dedicated mobile mechanic and digital vehicle inspection pages with unique titles, descriptions, canonicals, useful workflows, trial checklists and FAQs.
- Homepage footer links to both pages and the existing shop-owner demo.
- Organization and WebSite JSON-LD using public facts. No invented reviews or rich-result promises.
- Sitemap includes the new pages and shop audit. Omit lastModified rather than label every rebuild as a content update.
- Root metadataBase fixes resolution of relative canonical URLs. Google verification is read from GOOGLE_SITE_VERIFICATION when provided; no placeholder is emitted.
- New pages send start_free_click with a fixed page identifier through the existing analytics helper. A CTA click is not a completed registration.
- Only the two exact public content routes bypass session handling. No customer data, database schemas, policies or authenticated dashboards are changed.

## Account setup still required

1. In Search Console, select or verify the redlined1.com property. The owner is handling sign-in and submission separately. Prefer the existing verified property. If using HTML verification, set the exact token as GOOGLE_SITE_VERIFICATION in Vercel and redeploy; DNS verification needs no HTML token.
2. Submit https://www.redlined1.com/sitemap.xml after release. Inspect the homepage and both new URLs, run the live test, and request indexing where appropriate.
3. In GA4, confirm that G-9QY4K8MZ1X is the intended property and stream. Check Realtime/DebugView with a controlled visit. Verify generate_lead on successful lead submission; never count start_free_click as a completed signup. Audit completed signup tracking before using it for acquisition decisions.
4. Review consent requirements for target markets before expanding tracking or advertising. Do not send names, emails, vehicle identifiers or customer notes to Analytics.

## First 30 days

Week 1: release, verify indexing eligibility and measurement, check forms manually without sending fake leads to the production inbox. Record a baseline of organic visits, qualified lead submissions, signup completions and activation.

Week 2: publish a practical mobile-mechanic workflow demo and a DVI demo using sample records. Show one real task end to end. Publish an accompanying guide with screenshots and link to the matching landing page.

Week 3: prepare an owner-approved case study from the operating repair business. Report only documented results with dates and sample size; get permission before using customer identities, photos or testimonials. Seek relevant listings and partner links with accurate descriptions, not bulk backlink packages.

Week 4: compare landing-page visits and qualified conversions. Use Search Console queries to refine headings and fill genuine content gaps. Diagnose low conversion before buying more traffic. SEO improvements can take weeks or months; there is no guaranteed ranking or visitor count.

## Ready-to-use campaign copy (drafts, not posted)

### Mobile mechanic demo
Your next job starts in a driveway. Your paperwork can stay with it. See how RedlineD1 connects customer records, inspection photos, estimates and invoices from your phone. Start with seven days of full access, no card required, then keep the Free plan or upgrade.

YouTube description link:
https://www.redlined1.com/mobile-mechanic-software?utm_source=youtube&utm_medium=organic_video&utm_campaign=mobile_workflow_launch

### Inspection demo
A finding is easier to explain when the customer can see it. Walk through a digital vehicle inspection in RedlineD1: checklist, photo, technician note and customer report, connected to the repair workflow.

YouTube description link:
https://www.redlined1.com/digital-vehicle-inspection-software?utm_source=youtube&utm_medium=organic_video&utm_campaign=dvi_workflow_launch

### Shop-owner demo
Which vehicles are waiting for approval? Which are held up by parts? See a vehicle board your team keeps current, with technician assignments and clear work stages. Watch the RedlineD1 walkthrough or start free.

Owned LinkedIn post link:
https://www.redlined1.com/shop-owner-demo?utm_source=linkedin&utm_medium=organic_social&utm_campaign=shop_workflow_launch

Do not use campaign UTMs on internal website links. No ads, paid listings, outreach messages or social posts were purchased or sent as part of this source change.

## Reference

- https://developers.google.com/search/docs/fundamentals/seo-starter-guide
- https://nextjs.org/docs/app/api-reference/functions/generate-metadata

## Release checks

Validate targeted lint, TypeScript, production build and route-boundary tests. After deployment, inspect HTTP success, canonical URLs, page headings, sitemap entries and structured data on the live domain. Keep the prior Vercel deployment available for rollback. Actual test and release outcomes belong in the PR and task report.
