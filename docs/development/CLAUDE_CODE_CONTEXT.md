# RedlineD1 — Claude Code Development Context

> **Note:** `CLAUDE.md` at the repo root is the authoritative operating instruction for Claude Code.
> This document is the human-readable archive and onboarding reference.
> Last updated: 2026-07-09

---

## What Is RedlineD1?

RedlineD1 is a full-stack automotive shop management SaaS built for **D1 Imports**, a two-location auto repair business in Laos. It handles the complete repair shop workflow: customer CRM, vehicle intake, job cards, repair orders, inspections, estimates, invoices, payments, parts inventory, technician time tracking, and a command center intelligence dashboard.

- **Production URL:** redlined1.com
- **Vercel project:** Auto-deploys from GitHub `main`
- **Supabase project:** `redlined1` (d1group org)
- **Repo path:** `C:\Users\wallyd1\REDLINE`

---

## Production Data

### Shop IDs

| Shop | UUID |
|------|------|
| D1 Imports (primary) | `38d55fae-741b-4bac-b520-f96eed65bf38` |
| D1 Imports — Location 2 | `90b72748-bf01-4456-999f-f4ba48091606` |

Both shops are **bidirectionally mirrored** via the `shop_mirrors` table. Data created in either shop is visible in both.

### Query Pattern

```ts
// Reads — always use getShopIds() so mirrored shop data is included
.in('shop_id', getShopIds())

// Writes — always use getShopId() so new records go to the active shop only
shop_id: getShopId()
```

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 14+ App Router |
| Language | TypeScript (strict) |
| UI | React 19, custom CSS variables, no component library |
| Database | Supabase PostgreSQL with row-level security (RLS) |
| Auth | Supabase Auth |
| Excel import | SheetJS (XLSX) |
| Deployment | Vercel |
| Currency | USD + THB (mixed per estimate line item) |
| Languages | English + Lao bilingual documents |

---

## Development Rules

### Commit checklist (required before every commit)

```bash
npx tsc --noEmit    # must pass with zero errors
npm run build       # must succeed
```

Review `git diff --stat` before staging files.

### Push policy

**Never push to `main` automatically.** Always commit locally first, report what changed, and wait for explicit approval. Push only when the owner says "push," "deploy," or "go ahead."

### Windows environment

Development machine is **Windows 11**. Use PowerShell for bulk operations. Avoid Bash-only syntax.

---

## Hard Constraints

These rules are permanent and non-negotiable.

| # | Rule |
|---|------|
| 1 | Production stability always wins — never break daily staff workflows |
| 2 | No AI/LLM calls in product code without per-feature written approval |
| 3 | Provider abstraction only — no hard dependency on a single AI vendor |
| 4 | `NEXT_PUBLIC_BILLING_ENABLED=false` until owner explicitly activates billing |
| 5 | No secrets in source code |
| 6 | Never block D1 internal shops |
| 7 | No destructive SQL on production without approval + rollback plan |
| 8 | VIN is shop-private — never expose in shared/public contexts |
| 9 | `share_to_network` defaults to false |
| 10 | All experimental features must be feature-flagged (off by default) |
| 11 | Intelligence/billing hooks must be fire-and-forget, wrapped in try/catch |
| 12 | RedlineD1 must operate normally even if all external providers are offline |

---

## Module Map

| Module | Path | Description |
|--------|------|-------------|
| Customer CRM | `features/customers/` | Customer accounts, follow-ups, tags |
| Vehicle Management | `features/vehicles/` | Vehicle records, service history |
| Vehicle Intake | `features/triage/` | 5-step intake flow → job card or inspection |
| Job Cards | `features/job-cards/` | Active repair jobs |
| Repair Orders | `features/repair-orders/` | Detailed repair work, labor, parts |
| Inspections | `features/inspections/` | Digital inspection checklists |
| Estimates | `features/estimates/` | Multi-currency estimates with Lao translation |
| Parts Quotation | `features/parts/PartsEstimatesView.tsx` | Parts-specific quote flow |
| Parts Inventory | `features/parts/PartsView.tsx` | Parts stock, bulk XLS import |
| Invoices | `features/invoices/` | Invoicing, payment tracking |
| Payments | `features/payments/` | Payment records |
| Time Tracking | `features/time-tracking/` | Technician time entries |
| Technicians | `features/technicians/` | Tech profiles, performance |
| Command Center | `features/command-center/` | D1 Intelligence Dashboard |
| Settings | `features/settings/` | Shop config, permissions |

---

## Key Service Patterns

```
services/
  customerService.ts      — CRUD for customers
  vehicleService.ts       — CRUD for vehicles (saveVehicle accepts make/model/year/fuelType)
  estimateService.ts      — calculateEstimateTotals (excludes shopSupplies, taxRate defaults to 0)
  partsEstimateService.ts — parts quotation CRUD
  jobCardService.ts       — job card lifecycle
  invoiceService.ts       — invoice + payment
  partsService.ts         — inventory CRUD + photo upload
  globalSearchService.ts  — cross-entity search using getShopIds()
  triageService.ts        — triage session save/list

lib/
  shopStore.ts            — getShopId() / getShopIds() / setMirrorShopIds()
  useShop.ts              — React hook, loads shop list + mirror IDs from DB
  supabase.ts             — Supabase client (uses anon key, respects RLS)
```

---

## Recent Work Log (as of 2026-07-09)

| Date | Change |
|------|--------|
| 2026-07-09 | Shop mirror: both shops share data via shop_mirrors table |
| 2026-07-09 | Parts XLS import: smart header row detection + column alias mapping |
| 2026-07-09 | Estimate totals: fixed phantom $10 (stale shop_supplies), tax/discount hidden when zero |
| 2026-07-09 | Vehicle intake: triage completion now writes vehicle to vehicles table |
| 2026-07-08 | Multi-currency estimates: THB+USD per line item working correctly |
| 2026-07-08 | Messaging channels: SMS, WhatsApp, LINE, Telegram for estimates/invoices |

---

## Pending Work

| Item | Status |
|------|--------|
| Staging environment (Vercel + Namecheap) | 5 steps remaining |
| Commercial billing (Creem) | Scaffolded, not live |
| Sapelee integration | Not connected (abstraction layer ready) |
| SI-5 Evidence Engine | Planned — see next phase below |

---

## Next Phase: SI-5 — Evidence Engine

**Goal:** Upgrade D1 Command Center from a metrics display into an actionable decision dashboard.

Each recommendation card must provide:
1. **Action** — what the owner should do right now
2. **Reason** — why it matters to the business
3. **Evidence** — specific records, counts, amounts backing the recommendation
4. **Impact** — expected revenue gain or risk reduction
5. **Next step** — a direct button or link to execute the action

> **Do not implement SI-5 until explicitly instructed by the owner.**

---

# Long-Term Mission

RedlineD1 is becoming the world's Automotive Business Operating System.

It is not a shop management tool. It is the intelligence layer that makes every automotive business smarter, faster, and more profitable.

Every feature should contribute toward one or more of these capabilities:

| Capability | Status |
|-----------|--------|
| **Automation** | Eliminate repetitive tasks progressively |
| **Business Intelligence** | Command Center, Morning Brief, Executive Score |
| **Knowledge Graph** | Compounding relationship network across all entities |
| **Business Memory** | Shop-level learned patterns (SI-9) |
| **Executive Intelligence** | Action queue, decision scoring, owner briefing |
| **Vehicle Intelligence** | Per-vehicle health scores and risk signals (SI-10) |
| **Customer Intelligence** | Lifetime value, retention risk, visit patterns (SI-11, planned) |
| **Technician Intelligence** | Performance profiles, strengths, comeback rates (SI-12, planned) |
| **Parts Intelligence** | Failure patterns, reorder prediction, supplier scoring (SI-13, planned) |
| **Continuous Learning** | Every completed repair improves the system |

## Completed Intelligence Epics

| Epic | Description |
|------|-------------|
| SI-1 | Intelligence Foundation — bus, flags, provider abstraction |
| SI-2 | Recommendation Engine |
| SI-3 | Executive Decision Engine |
| SI-4 | Evidence Engine |
| SI-5 | Command Center |
| SI-6 | Action Intelligence |
| SI-7 | Morning Brief Engine |
| SI-8 | Sapelee Provider Connector |
| SI-9 | Business Memory Engine |
| SI-10 | Vehicle Intelligence Engine |

## Permanent Hard Constraints

These never change regardless of sprint scope:

- No AI embeddings or direct LLM calls in production
- All external AI behind provider abstraction (`IntelligenceProvider`)
- All intelligence features fire-and-forget — never block workflows
- All new feature flags default OFF
- No migration may drop, rename, or truncate existing production tables
- Billing disabled by default (`NEXT_PUBLIC_BILLING_ENABLED=false`)
- VIN is shop-private — never exposed in cross-shop data or graph edges
- PII (customer name, phone, email, address, invoice amounts) never in intelligence payloads
- `share_to_network` defaults to `false`
- No automatic SMS, email, or notifications
- No automatic modification of customer, vehicle, or financial data
