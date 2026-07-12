# RedlineD1 Product Status Matrix

Authoritative classification of every capability that may be referenced in landing-page marketing copy. Verified against real repository code as of this writing (branch `feature/landing-page-master-spec-preview`, base `main`). All landing-page copy (master spec, preview route) must match these labels exactly. Do not upgrade a label based on the sophistication of the code — a feature is only AVAILABLE NOW if a real, non-flagged, working UI/data path exists in `main`.

**Labels:**
- **AVAILABLE NOW** — shipped, working, unflagged, in `main` today.
- **DEPLOYED BUT GATED** — code exists and works but is intentionally disabled (e.g. behind `NEXT_PUBLIC_BILLING_ENABLED=false`).
- **PARTIAL** — a real, working subset exists; the full promoted vision is not yet complete.
- **PLANNED** — designed/roadmapped, not yet built, or exists only on an unmerged branch.
- **UNSUPPORTED** — no evidence in the repository; must not be claimed.

| Capability | Status | Evidence |
|---|---|---|
| Customer Management | AVAILABLE NOW | `features/customers/CustomersView.tsx`, live in `AppShell` view registry. |
| Vehicle Management | AVAILABLE NOW | `features/vehicles/VehiclesView.tsx`, live in `AppShell`. |
| Job Cards | AVAILABLE NOW | `features/job-cards/JobCardsView.tsx` + `JobArchiveView.tsx`, live. |
| Vehicle Intake / Triage | AVAILABLE NOW | `features/triage/TriageView.tsx`; `CLAUDE.md` confirms "Vehicle intake sync — completing triage now auto-registers the vehicle in Vehicle Management" as recently completed. |
| Estimates | AVAILABLE NOW | `features/estimates/EstimatesView.tsx`; multi-currency (USD/THB) fix documented as completed in `CLAUDE.md`. |
| Repair Orders | AVAILABLE NOW | `features/repair-orders/RepairOrdersView.tsx`. |
| Invoices | AVAILABLE NOW | `features/invoices/InvoicesView.tsx`. |
| Payments | AVAILABLE NOW | `features/payments/PaymentsView.tsx`. |
| Inventory | AVAILABLE NOW | `features/parts/PartsView.tsx`. |
| Parts Orders | AVAILABLE NOW | `features/parts/PartsOrdersView.tsx`, `PartsReceivedView.tsx`. |
| Time Tracking | AVAILABLE NOW | `features/time-tracking/TimeTrackingView.tsx`. |
| Command Center | AVAILABLE NOW | `features/command-center/CommandCenterView.tsx`; `CLAUDE.md`: "D1 Command Center UI — live", "Live Intelligence Pipeline — feeding Command Center metrics." |
| Morning Brief | AVAILABLE NOW | `features/command-center/MorningBriefModal.tsx`, part of the live Command Center. |
| Repair Intelligence | PARTIAL | `features/repair-intelligence/RepairIntelligenceView.tsx` and `scripts/backfill-repair-cases-to-graph.ts` exist and are live, but `CLAUDE.md`'s "Next Recommended Phase" (SI-5, explicitly **not yet instructed to start**) describes turning Command Center into a full evidence-scored decision dashboard — the deeper "every repair automatically improves every future recommendation" loop is still maturing. Copy should describe present capability ("captures diagnosis, tests, resolution, and lessons learned") without claiming the full autonomous-learning loop is complete. |
| Vehicle Intelligence | AVAILABLE NOW | `features/vehicle-intelligence/` directory + `scripts/rebuild-vehicle-intelligence.ts`. |
| Intelligent Service Advisor | AVAILABLE NOW | `features/intelligent-service-advisor/` + `scripts/analyze-service-advisor-opportunities.ts`. |
| Customer Lifetime Intelligence | AVAILABLE NOW | `features/customer-intelligence/` (8 components: `CustomerLifetimePanel`, `CustomerFinancialSummary`, `CustomerRetentionCard`, `CustomerOpportunitiesCard`, `CustomerRelationshipCard`, `CustomerSegmentsCard`, `CustomerTimeline`, error boundary) + `scripts/rebuild-customer-lifetime-intelligence.ts`. |
| Business Memory | PARTIAL | `features/memory/EntityMemoryPanel.tsx` + `scripts/rebuild-business-memory.ts` exist and run, but this is a single panel, not yet the full cross-entity "business memory" narrative implied by the vision docs. Describe as a real, working capability without overstating scope. |
| Multi-location | AVAILABLE NOW | `shop_mirrors` table, `lib/shopStore.ts`, `lib/useShop.ts`; `CLAUDE.md` confirms both real D1 shop locations are bidirectionally mirrored today. |
| Billing | DEPLOYED BUT GATED | `commercial/billing/`, `commercial/subscriptions/`, `commercial/licensing/` all exist and work; `NEXT_PUBLIC_BILLING_ENABLED=false` per `CLAUDE.md` Hard Constraint #4, confirmed unchanged. Marketing copy must show pricing but must not claim live self-serve checkout. |
| Trial | DEPLOYED BUT GATED | `commercial/trials/onboardingHook.ts` exists; trial flow is scaffolded but tied to the same gated billing system. `/signup` route is real and safe to link to; whether it currently activates a full 7-day trial end-to-end without billing is not independently confirmed by this docs pass — copy uses "Start Your 7-Day Free Trial" as the CTA label (per mission Part 4) routed to the real signup page, without asserting the full commercial trial-metering pipeline is live. |
| Migration / Import | PARTIAL | `features/parts/PartsView.tsx` has real, working CSV/XLSX bulk import (via the `xlsx` package) for parts/inventory data, including column-alias mapping. No full-shop, cross-platform migration pipeline (customers, vehicles, history import from a competitor export) exists anywhere in the repo. Migration copy must center on the real capability (CSV/Excel import) and frame competitor names only as "if you're coming from X, here's what to expect," never as an integration or partnership. |
| PWA / Mobile Readiness | AVAILABLE NOW | `public/manifest.json` (standalone display, installable icons, theme color), service-worker registration in `app/layout.tsx` (`navigator.serviceWorker.register('/sw.js')`). Confirmed installable, responsive web app. |
| Native Mobile Apps | UNSUPPORTED (PLANNED at most) | No iOS/Android project, no React Native/Capacitor/Expo directory, no app-store listing evidence anywhere in the repo. Must never be claimed as live; may appear only in the "Planned" column of Product Evolution, if at all. |
| API Access | PLANNED | `app/api/*` are internal Next.js route handlers for the app's own frontend, not a published customer-facing developer API/SDK. The unmerged `feature/commercial-pricing-trial-entitlements` branch's plan catalog includes an `api_access` entitlement flag for future plans, confirming this is roadmapped, not shipped. |
| Sapelee integration | EXCLUDED FROM PUBLIC COPY | Confirmed internal-only AI/intelligence-provider abstraction (`CLAUDE.md`: "Sapelee integration: not connected (provider abstraction ready)"). Not customer-facing. Must not appear anywhere in landing-page copy, per mission instruction. |

## Notes on usage in copy

- Any section referencing Repair Intelligence or Business Memory must use present-tense language for what exists today (capture, record, surface) and avoid implying a fully autonomous "gets smarter automatically with zero human oversight" loop is complete — use "designed to improve through verified shop outcomes" language (per mission Part 11) rather than asserting it as finished.
- Trial/Billing copy must never state or imply a live self-serve checkout is running. All paid-plan CTAs route to a controlled disabled/contact state (see `M2_CHANGE_MANIFEST.md`).
- Migration copy must lead with CSV/Excel import as the concrete, real capability; named competitor-source platforms (Tekmetric, Shopmonkey, Shop-Ware, AutoLeap, Mitchell 1, RO Writer, Protractor, NAPA TRACS, MaxxTraxx, Manager SE, Shop Boss, GaragePlug) appear only as plain text labels under "if you're switching from X" framing, never as logos, never as claimed integrations or partnerships.
- Mobile copy must say "Mobile-ready today" (PWA) and must not claim a native app exists.
