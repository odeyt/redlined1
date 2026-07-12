# Part 3 — Product Claim Verification

Method: every product-related mention in `docs/design/aura/DESIGN.md` was
checked against real code in this repository (`features/`, `app/`,
`commercial/`, `app/api/`), and against `CLAUDE.md`'s "Recent Completed Work"
/ "Pending / Not Yet Active" lists, which are treated as ground truth for
current production state.

**Important framing note:** DESIGN.md is a 126-line design-token/style
spec, not page copy. It makes very few explicit product-capability claims —
most of the categories the mission asks to verify (Inventory, Time Tracking,
Repair Orders, Invoices, Payments, Business Memory, Multi-location, API
access, Native mobile apps, Data import/Migration, Sapelee) are **simply not
mentioned anywhere in the document**. Where a category is absent, it is
marked "NOT PRESENT IN SPEC" below rather than force-fit into a claim
verdict — there is nothing to verify because nothing is claimed.

## Claim-by-claim verification

| Claim in DESIGN.md | Where | Verified against code | Verdict |
|---|---|---|---|
| "RedlineD1 Automotive OS" / "Automotive Business Operating System" framing | frontmatter `name`, Overview (line 40) | Matches `CLAUDE.md` self-description and `docs/vision/` framing | AVAILABLE NOW |
| "RedlineD1 Engine v2.0" pill notification | Hero, line 82 | No "Engine v2.0" or any versioned "Engine" concept found anywhere in the codebase (`grep` across repo for "Engine v2" / version markers returned zero hits outside the DESIGN.md files themselves) | **UNSUPPORTED** — fabricated version marker with no product backing; reads as a specific technical-maturity claim to a visitor |
| "Morning Brief" card in hero mockup | line 83 | Confirmed: `app/api/intelligence/morning-brief/route.ts`, `BriefDeliveryService`, `tests/intelligence/morning-brief-engine.spec.ts` exist | AVAILABLE NOW |
| "Owner Intelligence" white cards with alert boxes | line 95 | Matches real `/api/intelligence/recommendations`, `/api/intelligence/executive-score`, `/api/intelligence/action-queue`, `/api/intelligence/decision-engine` endpoints (Command Center decision-dashboard concept from CLAUDE.md's "Next Recommended Phase" SI-5) | AVAILABLE NOW (concept), **PARTIAL** in maturity — CLAUDE.md's own SI-5 phase note says the Command Center is still being transformed "from a metrics dashboard into a decision dashboard" and that work is explicitly **not yet instructed to begin** |
| **"$12,450 Stale Estimates"** specific dollar figure in mockup | line 95 | This is illustrative UI-mockup content, not a verifiable business metric. Because it is a specific, precise-looking dollar amount attached to a real feature name (Estimates), it reads like a real customer statistic rather than a placeholder | **NEEDS REWORDING** — replace with an obviously-illustrative value (e.g. "$X,XXX" or a labeled "Example" badge) so it cannot be mistaken for an actual revenue claim; ties to the mission's "no exact performance/revenue gains without evidence" rule |
| "Intelligent Service Advisor" dark-mode section | line 96 | Confirmed: `features/intelligent-service-advisor/`, `/api/intelligence/service-advisor/*` routes (estimate, follow-ups, outcome, session, suggestions, explanation) exist and are substantial | AVAILABLE NOW |
| "Repair Case" diagnostic tree (Symptoms → Tests → Resolution) | line 97 | Matches `features/repair-intelligence/RepairIntelligenceView.tsx` and `tests/repair-intelligence/repair-intelligence.spec.ts` conceptually (evidence-backed diagnostic case structure) | AVAILABLE NOW (as a concept) — exact "Symptoms → Tests → Resolution" tree UI was not independently verifiable from code alone within this audit's scope; the underlying evidence-engine capability is real per `CLAUDE.md`'s "Live Intelligence Pipeline" note |
| "OS Workflow" — horizontal pills "Intake to Intelligence," final node signifying "AI Intelligence" | line 90 | Broadly consistent with the real repair lifecycle (`triage`, `job-cards`, `estimates`, `repair-orders`, `invoices`, `payments` all exist as features) feeding into the Intelligence Bus (`CLAUDE.md`: "Intelligence Bus — complete") | AVAILABLE NOW |
| Trial CTA in nav ("Sign In, Trial CTA") | line 77 | `commercial/trials/onboardingHook.ts` exists; trial mechanics are real. However billing is `NEXT_PUBLIC_BILLING_ENABLED=false` (confirmed in `.env.production.example` line 85 and restated as Hard Constraint #4 in `CLAUDE.md`) | AVAILABLE NOW for the trial signup itself, but **DEPLOYED BUT GATED** for any CTA that would imply a live paid-checkout flow. DESIGN.md does not specify what the Trial CTA links to — flag for implementation: it must not be wired to a live billing/checkout path while billing is intentionally disabled |
| "Pricing / Future Roadmap" 3-column grid: current / rollout / future, dashed borders + 70% opacity for future items | lines 99-101 | This labeling pattern is exactly right and should be preserved — it already distinguishes shipped vs. planned, which is the mission's required Available Now / Rolling Out / Planned distinction | AVAILABLE NOW (as a *design pattern* — correctly built to avoid overclaiming) |
| "Aura Controls: the codebase includes specific performance controllers to pause animations..." | line 106 | This sentence describes **Aura's own generated output** (the design-tool's internal implementation), not a RedlineD1 product feature. It is ambiguous prose that could be misread as a claim about the RedlineD1 codebase | **NEEDS REWORDING** — clarify this refers to implementation guidance for whoever builds the page (a to-do for the builder), not an existing RedlineD1 capability |

## Explicit prohibited-claim checks (per mission Part 3 rules)

| Prohibited claim type | Present in DESIGN.md? | Notes |
|---|---|---|
| Native mobile apps live | No | Only a "Floating Mobile mockup (260px wide)" web/responsive mockup is described (line 83) — no claim of an App Store / Play Store native app. Confirmed no native app project exists in the repo (Next.js web app only). Safe as written, but the eventual page copy must not imply "download our app." |
| Automated competitor migration (beyond CSV/Excel) | No | DESIGN.md contains **no migration section at all** — see Part 4. Actual repo capability is limited to a parts bulk XLS/CSV import (`SheetJS`, smart header detection per `CLAUDE.md`'s "Parts bulk XLS import" note) — there is no full-shop-data migration pipeline with field mapping/duplicate detection. Since DESIGN.md doesn't claim migration at all, there's no violation to flag here, but the gap is real and must be authored carefully in Part 11/Part 4 rather than invented. |
| Official integrations/partnerships that don't exist | No | Not mentioned. |
| Live payment checkout while billing is disabled | No explicit claim | Real API routes for `/api/billing/checkout`, `/api/billing/portal`, and both Stripe and Creem webhooks exist in code, but billing is off by default per Hard Constraint #4. DESIGN.md doesn't describe a checkout flow, so no direct contradiction — but this is exactly why the Trial CTA destination (above) needs explicit, careful wording at implementation time. |
| Sapelee integration presented as customer-facing | No | Sapelee is not mentioned anywhere in DESIGN.md. Confirmed correct per mission instruction — Sapelee remains an internal-only intelligence-provider abstraction (`supabase/migrations/migration_sapelee_flags.sql`, `tests/intelligence/sapelee-provider.spec.ts`), not connected per `CLAUDE.md`'s "Pending / Not Yet Active" list. **No violation — keep it this way in Part 11.** |
| Fake customer counts | No | No numeric customer/shop counts appear anywhere in the document. |
| Fake testimonials | No | No testimonial section exists in DESIGN.md at all. Separately confirmed (via git log) that `app/portal/page.tsx` previously had fabricated testimonials and fake team photos removed in prior commits (`c4a91ce`, `f568bcf`). DESIGN.md does not reintroduce anything resembling that content — **no regression risk from this document.** |
| Exact performance/revenue gains without evidence | Yes — see "$12,450 Stale Estimates" above | The one specific dollar figure in the document is UI-mockup illustrative data attached to a real feature, and needs an "illustrative example" treatment (see Part 5's ROI-disclaimer pattern, which should be applied here too even though this isn't the ROI calculator section). |

## Categories with no claim to verify (absent from DESIGN.md entirely)

Customers, Vehicles, Job Cards, Estimates (beyond the mockup dollar figure),
Repair Orders, Invoices, Payments, Inventory, Time Tracking, Vehicle
Intelligence (feature exists in code — `features/vehicle-intelligence/` — but
is not named anywhere in DESIGN.md), Customer Lifetime Intelligence (feature
exists in code — `features/customer-intelligence/CustomerLifetimePanel.tsx`
— but is not named in DESIGN.md), Business Memory (exists in code —
`scripts/rebuild-business-memory.ts` — not named in DESIGN.md), Multi-location
support (real, via `shop_mirrors` bidirectional linkage per `CLAUDE.md` — not
mentioned in DESIGN.md), Data import/Migration (not mentioned — see Part 4),
API access (no public developer API exists in the repo at all; not mentioned
in DESIGN.md), Native mobile apps (not mentioned), Command Center (the
concept is present under the "Owner Intelligence" name but the term "Command
Center" itself is never used in DESIGN.md, even though it's the real feature
folder/branding used in the actual product — `features/command-center/`,
"D1 Command Center UI — live" per `CLAUDE.md`).

**These are gaps, not violations.** Since this is a token/style spec rather
than full page copy, silence on a feature is not a false claim. Part 11 and
any future page-copy authoring pass should make sure real, shipped features
(Command Center by its actual product name, Vehicle Intelligence, Customer
Lifetime Intelligence, Business Memory, multi-location) get proper billing in
the eventual page, since they are true and currently under-represented.

## Summary verdicts

| Verdict | Items |
|---|---|
| AVAILABLE NOW | RedlineD1 OS framing, Morning Brief, Owner Intelligence concept, Intelligent Service Advisor, Repair Case/Repair Intelligence concept, OS Workflow pipeline, Trial signup itself, Pricing tiering pattern |
| DEPLOYED BUT GATED | Trial CTA destination (must not link to live checkout while billing is off) |
| PARTIAL | Owner Intelligence / Command Center "decision dashboard" maturity (SI-5 not yet built per CLAUDE.md) |
| UNSUPPORTED | "RedlineD1 Engine v2.0" version marker |
| NEEDS REWORDING | "$12,450 Stale Estimates" (needs illustrative labeling), "Aura Controls" sentence (ambiguous authorship — implementation note, not product claim) |
| N/A — not claimed | Native mobile apps, automated competitor migration, official partnerships, live checkout, Sapelee (correctly absent), fake counts, fake testimonials |

No BLOCKER-level false claims were found. Two items need rewording before
implementation (Engine v2.0 version marker, and the stale-estimates dollar
figure), and one item needs an explicit implementation safeguard (Trial CTA
destination while billing is disabled). All three are carried into Part 11's
normalized spec and Part 12's diff report.
