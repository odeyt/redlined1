# RedlineD1 Landing Page — Master Specification

Single source of truth for the `/landing-preview` marketing page. Does not overwrite `docs/design/aura/DESIGN.md` or `DESIGN_VERIFIED.md` — this document is the content/copy/behavior layer built on top of that visual token spec. Every capability claim below is checked against `docs/design/aura/PRODUCT_STATUS_MATRIX.md`.

## 1. Brand positioning

RedlineD1 is the **Automotive Business Operating System** — not a point tool for one workflow (invoicing, or scheduling, or inspections alone), but a connected platform spanning the full repair lifecycle plus the business intelligence layer built on top of it. Positioning statement: *"The operating system that helps repair shops think."* RedlineD1 is built and proven inside a real, operating two-location repair business (D1 Imports), not designed in the abstract for a hypothetical shop.

## 2. Audience

- **Primary:** Independent and small-team repair shop owners (1-15 bays) who currently run their business on a mix of spreadsheets, paper, and single-purpose software (invoicing-only or scheduling-only tools).
- **Secondary:** Mobile mechanics and solo operators who need a phone-first, no-office workflow.
- **Tertiary:** Multi-location operators evaluating a platform that can scale across locations without duplicating data entry.

## 3. Core value proposition

Run customers, vehicles, estimates, technicians, invoices, payments, and business intelligence from one connected platform — and let the system surface what deserves attention next, instead of the owner having to dig for it.

## 4. Page narrative / section order

1. Hero
2. Built inside a real repair shop
3. Industry pain points
4. Why traditional shop software falls short (folded into the Comparison section)
5. Time-savings calculator
6. Revenue-opportunity calculator
7. Repair lifecycle workflow
8. Owner Command Center
9. Repair Intelligence
10. Vehicle Intelligence
11. Intelligent Service Advisor
12. Customer Lifetime Intelligence
13. Migration and switching
14. Mobile mechanic experience
15. Multi-location support
16. RedlineD1 intelligence philosophy
17. Product evolution
18. Pricing
19. Security and reliability
20. FAQ
21. Final CTA
22. Footer

Story arc: **Problem → Evidence → Solution → Business Impact → Trust → Trial.** No repetitive wall-of-feature-cards; each section either proves a new capability or advances the narrative toward the trial CTA.

## 5. Section-by-section copy

### 5.1 Hero
- Eyebrow/trust line (small, above headline): "Built inside a real automotive repair business."
- H1: "The operating system that helps repair shops think."
- Supporting line: "Run customers, vehicles, estimates, technicians, invoices, payments, and business intelligence from one connected platform."
- Secondary copy: "RedlineD1 helps automotive businesses recover missed revenue, preserve repair knowledge, reduce repeated mistakes, and know what deserves attention next."
- Primary CTA: "Start Your 7-Day Free Trial" → `/signup`.
- Secondary CTA: "Watch Product Tour" → scrolls to `#workflow` (no product-tour video asset exists; this is documented honestly as a scroll action, not a fabricated video link).
- No version badge ("RedlineD1 Engine v2.0" is fabricated per audit — omitted entirely).

### 5.2 Built inside a real shop
- H2: "Built inside a real repair shop."
- Body: "RedlineD1 was created inside an active automotive business to solve real problems involving job flow, technician knowledge, estimates, invoices, customer history, inventory, and owner visibility."
- Verified bullet list only: Tested in daily shop operations · Built around real technician workflows · Designed for active service bays · Improved through real repair cases · Built for solo mechanics, growing shops, and multi-location operators.
- No testimonials, no names, no photos of people (per the earlier-session removal of fabricated testimonials/team photos — must not be reintroduced).
- Visual: CSS/SVG structured illustration (workshop-bay silhouette / process diagram), not a stock photo and not a real photo of the shop (no rights confirmed for this epic).

### 5.3 Industry pain points
- H2: "Repair shops lose money in ways most software never shows."
- Editorial list (problem-framed, no product mention yet): estimates that never get followed up · completed jobs that never get invoiced · unpaid invoices that go unnoticed · declined work nobody revisits · technicians re-diagnosing the same problem twice · repair knowledge that lives only in one person's memory · owners digging through reports to find what matters · customer and vehicle history scattered across systems · inventory shortages discovered mid-job · limited visibility once a business has more than one location.
- Transition line: "RedlineD1 connects these problems inside one operating system."

### 5.4 Competitive comparison
- H2: "Traditional Shop Software vs. RedlineD1 Automotive Business OS."
- Left column label: **"Traditional Shop Software"** (generic, never a named competitor — cannot be verified against any specific competitor's real feature set).
- Right column label: **"RedlineD1"**.
- Rows (category → traditional / RedlineD1 maturity label): Customers (Standard / Available) · Vehicles (Standard / Available) · Estimates (Standard / Available) · Repair Orders (Limited / Available) · Invoices (Standard / Available) · Inventory (Limited / Available) · Technician Workflow (Limited / Available) · Repair Intelligence (Planned / Evidence-Based) · Vehicle Intelligence (Limited / Advanced) · Customer Lifetime Intelligence (Limited / Advanced) · Owner Decision Intelligence (Limited / Evidence-Based) · Business Memory (Planned / Available) · Evidence-Based Recommendations (Planned / Evidence-Based) · Knowledge Retention (Limited / Advanced) · Migration Assistance (Standard / Available) · Mobile Readiness (Limited / Available).
- Footnote: "'Traditional Shop Software' describes common patterns across general-purpose shop-management tools, not any specific product. RedlineD1 ratings reflect verified, currently shipped capability — see the Product Evolution section for what is available now versus rolling out."

### 5.5 Time-savings calculator
See Section 7 (ROI calculator logic) below. Interactive, client component.

### 5.6 Revenue-opportunity calculator
See Section 7 below.

### 5.7 Repair lifecycle workflow
- H2: "One connected repair lifecycle."
- Horizontal step row: Intake → Job Card → Estimate → Repair Order → Invoice → Payment → Intelligence.
- Each step is real and AVAILABLE NOW per the matrix; final "Intelligence" node styled distinctly (dark, dashed connector) to signal it's the layer built on top of the workflow, not a separate product.

### 5.8 Owner Command Center
- H2: "Know what deserves attention before the day gets away from you."
- Mockup shows (all sample/illustrative data, clearly labeled): unpaid invoices, completed-but-not-invoiced jobs, stale estimates, approved-but-not-scheduled work, low inventory, open jobs, follow-up opportunities.
- Each action row: priority, action, reason, evidence, estimated value (labeled "Illustrative"), status.
- Maturity note under the section: "Available Now (core visibility). Rolling Out: expanded evidence-scored recommendations." — matches the PARTIAL/SI-5 status in the product matrix.

### 5.9 Repair Intelligence
- H2: "Every repair should make the shop smarter."
- Shows: Complaint · Symptoms · DTCs · Tests performed · Failed attempts · Final repair · Parts used · Verification status · Lesson learned · Similar repairs.
- Copy: "RedlineD1 captures how a problem was diagnosed, what failed, what fixed it, and how the repair was verified — turning completed repairs into reusable shop knowledge." (Present-tense for the capture/record capability, which is real; does not claim the fully autonomous "gets smarter with zero oversight" loop is finished, per matrix PARTIAL status.)
- Intelligence loop diagram (Part 11): Repair Work → Repair Intelligence → Vehicle Memory → Customer Memory → Business Memory → Owner Recommendations → Better Decisions → Verified Outcomes. Caption: "Designed to improve through verified shop outcomes."

### 5.10 Vehicle Intelligence
- H2: "Every vehicle arrives with context."
- Shows: visit history, repeat concerns, recurring DTCs, declined work, repair patterns, risk signals, recommended checks, an operational vehicle-health indicator.
- Disclaimer: "Based on recorded shop data. Not a replacement for inspection or diagnosis."

### 5.11 Intelligent Service Advisor
- H2: "Build better estimates. Explain repairs more clearly."
- Shows: missing descriptions, zero-price line review, duplicate-line warnings, missing labor/parts review, prior declined work, customer-explanation drafts, evidence, follow-up opportunity.
- Trust labels shown as small badges: Evidence-based · Human-reviewed · Transparent · Editable · Ethical.
- Does not claim automatic customer communication — drafts are reviewed/sent by shop staff, not auto-sent.

### 5.12 Customer Lifetime Intelligence
- H2: "Understand the relationship, not just the last invoice."
- Shows: lifetime revenue, visit count, average invoice, approval history, declined work, unpaid balance, retention indicator, expected next-visit window, opportunities, relationship timeline.
- Tone check: informational/business-facing language only, no manipulative or surveillance-style phrasing.

### 5.13 Migration and switching
See Section 8 below.

### 5.14 Mobile mechanic experience
- H2: "Built for the shop floor, driveway, and road."
- Shows a phone-frame mockup of: add customer → add vehicle → enter VIN → take photos → create Job Card → build estimate → capture signature → generate invoice → view history.
- Label: **"Mobile-ready today."** (PWA, installable, responsive — confirmed AVAILABLE NOW.) Native apps mentioned only under Product Evolution's "Planned" column, never as live.

### 5.15 Multi-location support
- H2: "Run every location from one connected system."
- Copy: "RedlineD1 mirrors customer, vehicle, and job data across multiple locations, so owners and staff see one shared picture instead of separate silos." (Matches real `shop_mirrors` capability, confirmed AVAILABLE NOW.)

### 5.16 RedlineD1 intelligence philosophy (dark editorial section)
- H2: "The RedlineD1 North Star"
- Four statements (exact copy, per mission Part 18):
  1. "Every repetitive task in an automotive business should eventually be handled by AI."
  2. "Every important decision should be supported by AI."
  3. "Every repair should make the AI smarter."
  4. "Every shop should become more profitable because of RedlineD1."
- Supporting copy: "AI should reduce repetitive work, preserve knowledge, and support better decisions. It should never hide reasoning or replace skilled technicians. Humans remain in control."

### 5.17 Product evolution
- Three columns, populated **only** from `PRODUCT_STATUS_MATRIX.md`:
  - **Available Now:** Customer/Vehicle/Job Card/Estimate/Repair Order/Invoice/Payment/Inventory management, Time Tracking, Command Center, Morning Brief, Vehicle Intelligence, Intelligent Service Advisor, Customer Lifetime Intelligence, Multi-location mirroring, PWA/mobile-ready web app, CSV/Excel parts import.
  - **Rolling Out:** Full evidence-scored Owner decision dashboard (SI-5), expanded Business Memory, deeper Repair Intelligence automation.
  - **Planned:** Native mobile apps, published developer API access, expanded migration tooling beyond CSV/Excel.
  - Sapelee never appears anywhere in this section or elsewhere on the page.

### 5.18 Pricing
See Section 9 below.

### 5.19 Security and reliability
- H2: "Built for daily shop operations, not a demo."
- Verified statements only: Supabase-backed PostgreSQL with row-level security · daily operational use inside a real two-location shop · feature flags for safe rollout of new capability · fire-and-forget intelligence/billing hooks so a third-party outage never blocks a job card, estimate, or invoice from being created. No uptime SLA percentage, no "99.9% uptime" style claim is used anywhere, since no such SLA is documented or verifiable in this repo.

### 5.20 FAQ
Accessible disclosure pattern (see Section 12). Question set:
1. "Is RedlineD1 ready for a real shop today?" — Yes; it's built and used inside an active two-location repair business. Some intelligence features are still expanding (see Product Evolution).
2. "Do I need a credit card to start my trial?" — The 7-day trial is designed to be a no-risk evaluation; billing activation is handled separately by our team before any charge occurs.
3. "Can I import my existing data?" — Parts and inventory data can be imported today via CSV/Excel. Full-shop migration support is expanding — see the Migration section.
4. "Is there a native mobile app?" — RedlineD1 is a mobile-ready, installable web app (PWA) today. Native iOS/Android apps are on the roadmap, not yet available.
5. "How does RedlineD1's AI work?" — It surfaces evidence-based recommendations (what happened, why it matters, what to do) — it never replaces technician judgment and never hides its reasoning.
6. "Can I run more than one shop location?" — Yes, multi-location data mirroring is available today.
7. "What if I decide RedlineD1 isn't the right fit?" — You can export your data and cancel at any time; contact our team.

### 5.21 Final CTA
- H2: "Run your shop from one connected system."
- Primary CTA: "Start Your 7-Day Free Trial" → `/signup`.
- Secondary: "Talk to us" → `mailto:` sales contact.

### 5.22 Footer
- Standard marketing footer: logo (compact variant), nav links (Product, Pricing, FAQ), legal/contact placeholders, and a small "Brand" sub-section showing the logo variant set (full, compact, monochrome, tagline, light/dark) per Part 21's instruction to integrate the variant preview into the page itself rather than a separate page.
- No fabricated social proof, no customer logos, no press mentions.

## 6. Product-status labels

Every capability-bearing section carries the label from `PRODUCT_STATUS_MATRIX.md` verbatim (Available Now / Rolling Out / Planned, or the matrix's PARTIAL/DEPLOYED BUT GATED nuance folded into hedged copy). No section may claim a higher maturity than the matrix supports.

## 7. Time-savings & revenue-opportunity calculator logic

### 7.1 Time-Savings Calculator
Inputs (all editable number fields, conservative defaults):
- Technicians: **2**
- Jobs completed per technician per day: **8**
- Minutes saved per job: **3**
- Working days per week: **5**
- Working weeks per year: **48**

Formulas:
```
dailyMinutesSaved   = technicians × jobsPerDay × minutesPerJob
weeklyHoursSaved     = (dailyMinutesSaved × workingDaysPerWeek) / 60
monthlyHoursSaved    = weeklyHoursSaved × (workingWeeksPerYear / 12)
annualHoursSaved     = weeklyHoursSaved × workingWeeksPerYear
equivalentWorkDays   = annualHoursSaved / 8
```
Displayed outputs: daily minutes saved, weekly/monthly/annual hours saved, equivalent 8-hour working days per year. Formula is shown on-page (not hidden) so the user can audit the math.

Disclaimer (verbatim, required): *"Illustrative estimate only. Actual results depend on shop workflow, staffing, usage, and data quality."*

### 7.2 Revenue-Opportunity Calculator
Inputs (all editable, conservative defaults):
- Average invoice value: **$350**
- Estimates created per month: **40**
- Illustrative approval-rate improvement: **5%**
- Missed invoices per month: **3**
- Average missed-invoice value: **$300**

Formulas:
```
approvalOpportunity  = estimatesPerMonth × avgInvoiceValue × (approvalImprovementPct / 100)
missedInvoiceRecovery = missedInvoicesPerMonth × avgMissedInvoiceValue
monthlyOpportunity   = approvalOpportunity + missedInvoiceRecovery
annualOpportunity    = monthlyOpportunity × 12
```
Results are labeled **"Potential Opportunity"** everywhere — never "Guaranteed Revenue," never "Projected Revenue."

Disclaimer (verbatim, required): *"Illustrative estimate only. Actual results vary by shop activity, pricing, customer behavior, and staff execution."*

Both calculators are client components (`'use client'`), keyboard-accessible (standard number inputs with visible labels, `<label for>` association), and recompute live on input change with no network call.

## 8. Migration messaging

Headline: "Switch without losing your shop history."
Copy: "RedlineD1 supports migration through available export formats, structured imports, and assisted onboarding."
Visual flow (static step diagram, not an interactive form): Export → Upload → Map Fields → Detect Duplicates → Validate → Review → Go Live.

Supported-source examples (plain text cards, no logos — no rights to third-party marks): Tekmetric, Shopmonkey, Shop-Ware, AutoLeap, Mitchell 1, RO Writer, Protractor, NAPA TRACS, MaxxTraxx, Manager SE, Shop Boss, GaragePlug, plus generic CSV and Excel. Framing for every named platform: *"Coming from [Platform]? Export your data and import it into RedlineD1 via CSV/Excel."* — never "integrates with," never "official partner," with an explicit disclaimer line: *"These are common shop-management platforms shop owners switch from. RedlineD1 has no official partnership with the platforms listed. Import capabilities vary by source platform and available export format."*

Service tiers (presented, not all necessarily live end-to-end — framed as service levels, not automated pipeline claims): **Self-Service Import** (CSV/Excel, real today), **Assisted Migration** (guided by our team), **White-Glove Migration** (full-service, contact sales).

Data categories claimed importable today: parts/inventory records via CSV/Excel (matches `features/parts/PartsView.tsx` verified capability). Customer/vehicle/history import is described as part of Assisted/White-Glove tiers (human-assisted), not claimed as an automated self-service pipeline, since no such pipeline exists in the repo today.

## 9. Competitive comparison

Approach fully specified in Section 5.4 above. Categorical, never competitor-specific, uses maturity labels (Standard/Limited/Available/Advanced/Evidence-Based/Planned) instead of checkmarks, per mission Part 7 and `06_COMPETITIVE_COMPARISON_AUDIT.md`.

## 10. Mobile positioning

"Mobile-ready today" (installable PWA, responsive at all breakpoints). Native apps appear only in the Planned column of Product Evolution. No app-store links, no app-store badges, since no native app exists.

## 11. Trust / reliability

See Section 5.19. No SLA percentage claims, no fabricated customer counts, no fabricated testimonials or logos anywhere on the page.

## 12. Pricing

Approved catalog (matches values referenced read-only from `feature/commercial-pricing-trial-entitlements:commercial/plans/planCatalog.ts` via `git show`, re-authored locally — see `M2_CHANGE_MANIFEST.md`):

| Plan | Monthly | Annual | Badge |
|---|---|---|---|
| Trial | Free, 7 days | — | — |
| Solo | $24/mo | $240/yr | "Best for Mobile Mechanics" |
| Starter | $49/mo | $490/yr | — |
| Professional | $99/mo | $990/yr | "Most Popular" |
| Business | $179/mo | $1,790/yr | — |
| Enterprise | Custom | Custom | — |

Annual toggle message: "Save with annual billing."

**Billing gating (critical):** because `NEXT_PUBLIC_BILLING_ENABLED=false` (confirmed unchanged), every paid-plan CTA opens a controlled disabled/contact state — a `mailto:` link or an inert "Billing activation coming soon — contact us" panel. No CTA calls any live checkout code, no CTA navigates to `/api/billing/checkout` or any billing route. The Trial plan's CTA still routes to the real `/signup` page since account creation itself is not a payment action.

## 13. FAQ

See Section 5.20. Accessible disclosure widget (Section 12/24 accessibility notes below).

## 14. SEO

`/landing-preview` metadata export sets `robots: { index: false, follow: false }` (noindex, nofollow) — this route must never be indexed. The following metadata is **prepared and documented here** for a future production page, but is **not activated** on the noindexed preview route (per mission Part 26, this is intentional — do not wire structured data meant for indexing onto a page that explicitly opts out of indexing):

- **Title:** "RedlineD1 — Automotive Business Operating System"
- **Description:** "Run customers, vehicles, estimates, repair orders, invoices, staff, and shop intelligence from one connected platform."
- **Open Graph:** `og:title`/`og:description` same as above; `og:type=website`; `og:image` would need a real 1200×630 marketing image (not yet produced — see `PRODUCT_ASSET_REQUIREMENTS.md`).
- **Twitter Card:** `summary_large_image`, same title/description, same missing-image caveat.
- **Canonical strategy:** when this content eventually replaces `/portal` or becomes `/`, the canonical URL should be the production root domain; `/landing-preview` itself must never carry a canonical pointing at a URL other than itself (to avoid confusing search engines while it's still a preview).
- **Structured data:** a `SoftwareApplication` JSON-LD block (name, applicationCategory: BusinessApplication, offers referencing the Pricing table above) and an `FAQPage` JSON-LD block (mirroring Section 5.20's Q&A) are valid candidates for the production page, but must not be added to the noindexed preview route now — doing so would be inert at best and confusing at worst.

## 15. Accessibility

Full requirements list in Part 24 of the mission; summarized here as the spec-of-record: WCAG-aware contrast only (no `text-light` #A3A3A3 as text color; no `warning` #F59E0B as light-background text color — both per `DESIGN_VERIFIED.md`'s restrictions), visible `:focus-visible` outlines using the `focus-ring` (#2563EB) token, real keyboard-operable navigation (including a true mobile disclosure menu, not "hinted" buttons), accessible calculator inputs (labeled, keyboard-operable number fields), an accessible pricing monthly/annual toggle (real `<button role="switch" aria-checked>` or equivalent, not a div with an onClick), an accessible FAQ (`<button aria-expanded>` disclosure pattern), 44×44px minimum touch targets, `prefers-reduced-motion` support, one `<h1>` with logical `<h2>`/`<h3>` nesting, descriptive `alt` text on every meaningful image/mockup, and an `aria-label` on the logo.

## 16. Analytics events

No new analytics vendor is introduced. The only existing instrumentation in this repo is direct `gtag()` calls wired in `app/layout.tsx` (Google Analytics, ID `G-9QY4K8MZ1X`). This epic documents intended event names/triggers as a **future wiring point** rather than inventing a new tracking system, since `/landing-preview` is noindexed/unpublished and should not fire real analytics into production GA data until the page is production-ready:

| Event | Trigger |
|---|---|
| `landing_view` | Page mount |
| `pricing_view` | Pricing section enters viewport |
| `trial_cta_click` | Any "Start Your 7-Day Free Trial" click |
| `product_tour_click` | "Watch Product Tour" click |
| `migration_cta_click` | Any CTA inside the Migration section |
| `roi_calculator_used` | Either calculator's inputs change |
| `comparison_viewed` | Comparison section enters viewport |
| `pricing_plan_selected` | A plan card's CTA is clicked |
| `contact_sales_click` | Enterprise/"Talk to us" `mailto:` click |

## 17. Image / screenshot requirements

See `docs/design/aura/PRODUCT_ASSET_REQUIREMENTS.md` (Part 23) for full detail. Summary: all product mockups are component-based CSS/SVG with fictitious sample data; no real customer data, VINs, phone numbers, addresses, or payment data anywhere on the page.

## 18. Production rollout / rollback

See `docs/design/aura/LANDING_PAGE_PRODUCTION_ROLLOUT.md` (Part 30) for the full sequenced plan. This epic implements the preview only; it does not execute any production replacement step.
