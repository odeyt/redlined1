# SI-13 Change Manifest — Customer Lifetime Intelligence

**Branch:** `feature/si-13-customer-lifetime-intelligence`
**Date:** 2026-07-10
**Status:** In Progress

---

## Planned New Files

### Database
- `supabase/migrations/migration_customer_lifetime_intelligence.sql`

### Types
- `intelligence/customer/types.ts`

### Intelligence Engines
- `intelligence/customer/CustomerContextBuilder.ts`
- `intelligence/customer/CustomerLifetimeEngine.ts`
- `intelligence/customer/CustomerRelationshipScoring.ts`
- `intelligence/customer/CustomerSegmentationEngine.ts`
- `intelligence/customer/CustomerRetentionRiskEngine.ts`
- `intelligence/customer/CustomerOpportunityEngine.ts`
- `intelligence/customer/CustomerTimelineEngine.ts`
- `intelligence/customer/CustomerServiceAdvisorAdapter.ts`
- `intelligence/customer/CustomerLearningAdapter.ts`
- `intelligence/customer/SapeleeCustomerIntelligencePayload.ts`

### Service Layer
- `services/customerLifetimeIntelligenceService.ts`

### API Routes
- `app/api/intelligence/customer/[customerId]/route.ts`
- `app/api/intelligence/customer/[customerId]/timeline/route.ts`
- `app/api/intelligence/customer/[customerId]/segments/route.ts`
- `app/api/intelligence/customer/[customerId]/opportunities/route.ts`
- `app/api/intelligence/customer/summary/route.ts`

### UI Components
- `features/customer-intelligence/CustomerLifetimePanel.tsx`
- `features/customer-intelligence/CustomerRelationshipCard.tsx`
- `features/customer-intelligence/CustomerRetentionCard.tsx`
- `features/customer-intelligence/CustomerSegmentsCard.tsx`
- `features/customer-intelligence/CustomerOpportunitiesCard.tsx`
- `features/customer-intelligence/CustomerTimeline.tsx`
- `features/customer-intelligence/CustomerFinancialSummary.tsx`
- `features/customer-intelligence/CustomerIntelligenceErrorBoundary.tsx`

### Script
- `scripts/rebuild-customer-lifetime-intelligence.ts`

### Tests
- `tests/intelligence/customer-lifetime-engine.spec.ts`
- `tests/intelligence/customer-segmentation-engine.spec.ts`
- `tests/intelligence/customer-retention-risk.spec.ts`
- `tests/intelligence/customer-opportunity-engine.spec.ts`
- `tests/intelligence/customer-timeline-engine.spec.ts`
- `tests/intelligence/customer-intelligence-api.spec.ts`
- `tests/intelligence/customer-intelligence-isolation.spec.ts`

### Documentation
- `docs/intelligence/SI13_CHANGE_MANIFEST.md` (this file)
- `docs/intelligence/CUSTOMER_LIFETIME_INTELLIGENCE.md`
- `docs/intelligence/CUSTOMER_RETENTION_SCORE.md`
- `docs/intelligence/CUSTOMER_RELATIONSHIP_SCORE.md`
- `docs/intelligence/CUSTOMER_SEGMENTATION.md`
- `docs/intelligence/CUSTOMER_REVENUE_OPPORTUNITIES.md`
- `docs/intelligence/CUSTOMER_INTELLIGENCE_PRIVACY.md`
- `docs/intelligence/SI13_ROLLOUT.md`
- `docs/intelligence/SI13_ROLLBACK.md`
- `docs/intelligence/SI13_REGRESSION_REPORT.md`
- `docs/testing/staff/SI13_CUSTOMER_INTELLIGENCE_UAT.md`
- `docs/testing/staff/SI13_CUSTOMER_INTELLIGENCE_UAT.html`

---

## Existing Modules That May Be Touched

| Module | Touch Type | Reason |
|--------|------------|--------|
| `features/command-center/CommandCenterView.tsx` | Additive | Customer Intelligence section (flag-gated) |
| `features/customers/` | Read-only integration | Mount CustomerLifetimePanel as optional section |
| `package.json` | Additive | Add `intelligence:customers` script |

**Zero changes to customer CRUD, estimates, invoices, payments, or any core workflow.**

---

## Additive Database Changes

5 new tables:
1. `customer_lifetime_profiles`
2. `customer_segments`
3. `customer_intelligence_signals`
4. `customer_intelligence_events`
5. `customer_opportunity_outcomes`

10 new feature flags (all OFF).

---

## Feature Flags

All default OFF. No automatic enablement.

---

## Rollback Method

1. Disable all 10 SI-13 feature flags.
2. All existing customer, estimate, invoice, job card pages continue normally.
3. Additive tables remain (no risk).
4. `git revert` if code rollback needed.
5. No database restore required.

---

## Protected Modules

Authentication, shop switching, mirroring, customers CRUD, vehicles, appointments, job cards, estimates, invoices, payments, inventory, repair orders, Vehicle Intelligence, SI-12 Service Advisor, Command Center (existing), Morning Brief (existing), billing.

---

## Known Assumptions

1. `customers` table has `id`, `shop_id`, `created_at`.
2. `invoices` table has `customer_id`, `total_amount`, `status`, `paid_at`.
3. `estimates` table has `customer_id`, `approved_at`, `declined_at`, `total_amount`.
4. `job_cards` table has `customer_id`, `vehicle_id`, `created_at`.
5. `vehicles` table has `customer_id`, `shop_id`.
6. `appointments` table has `customer_id`, `status`, `scheduled_at`.
7. `estimate_declined_items` table exists (used in SI-12).
8. `business_memory` table exists (SI-9).
9. `vehicle_intelligence_signals` table exists (SI-10).
10. `feature_flags` composite unique constraint applies.
11. Phone/email remain in existing customer tables only — never copied into SI-13 tables.

---

## Privacy Risks

- Phone, email, address: never stored in SI-13 tables or logs.
- `Price Sensitive` segment: never shown to customer or in customer-facing output.
- All scores are internal operational metrics only — not creditworthiness, not social worth.
- VIN: never in SI-13 tables (Vehicle Intelligence scope only).
- Payment instrument details: never stored.

---

## Tests Required Before Merge

- `npx tsc --noEmit` clean
- `npm run build` passing
- All 7 SI-13 spec files
- Isolation: customer page renders without intelligence
- No cross-shop leakage
