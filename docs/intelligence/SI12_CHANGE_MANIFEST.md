# SI-12 Change Manifest — Intelligent Service Advisor

**Branch:** `feature/si-12-intelligent-service-advisor`
**Date:** 2026-07-10
**Status:** In Progress

---

## Planned New Files

### Database
- `supabase/migrations/migration_intelligent_service_advisor.sql`

### Types
- `intelligence/service-advisor/types.ts`

### Intelligence Engines
- `intelligence/service-advisor/AdvisorContextBuilder.ts`
- `intelligence/service-advisor/EstimateQualityEngine.ts`
- `intelligence/service-advisor/RelatedServiceEngine.ts`
- `intelligence/service-advisor/CustomerExplanationBuilder.ts`
- `intelligence/service-advisor/EstimateFollowUpEngine.ts`
- `intelligence/service-advisor/IntelligentServiceAdvisor.ts`
- `intelligence/service-advisor/ServiceAdvisorLearningAdapter.ts`
- `intelligence/service-advisor/SapeleeAdvisorPayload.ts`

### Service Layer
- `services/intelligentServiceAdvisorService.ts`

### API Routes
- `app/api/intelligence/service-advisor/session/route.ts`
- `app/api/intelligence/service-advisor/session/[sessionId]/suggestions/route.ts`
- `app/api/intelligence/service-advisor/session/[sessionId]/explanation/route.ts`
- `app/api/intelligence/service-advisor/estimate/[estimateId]/route.ts`
- `app/api/intelligence/service-advisor/follow-ups/route.ts`
- `app/api/intelligence/service-advisor/outcome/route.ts`

### UI Components
- `features/intelligent-service-advisor/ServiceAdvisorPanel.tsx`
- `features/intelligent-service-advisor/EstimateQualityCard.tsx`
- `features/intelligent-service-advisor/CustomerExplanationCard.tsx`
- `features/intelligent-service-advisor/RelatedServicesCard.tsx`
- `features/intelligent-service-advisor/EstimateFollowUpCard.tsx`
- `features/intelligent-service-advisor/ApprovalOpportunityCard.tsx`
- `features/intelligent-service-advisor/AdvisorEvidenceDrawer.tsx`
- `features/intelligent-service-advisor/AdvisorSuggestionActions.tsx`
- `features/intelligent-service-advisor/ServiceAdvisorErrorBoundary.tsx`

### Script
- `scripts/analyze-service-advisor-opportunities.ts`

### Tests
- `tests/intelligence/service-advisor-context.spec.ts`
- `tests/intelligence/estimate-quality-engine.spec.ts`
- `tests/intelligence/related-service-engine.spec.ts`
- `tests/intelligence/customer-explanation-builder.spec.ts`
- `tests/intelligence/estimate-follow-up-engine.spec.ts`
- `tests/intelligence/intelligent-service-advisor-api.spec.ts`
- `tests/intelligence/intelligent-service-advisor-isolation.spec.ts`

### Documentation
- `docs/intelligence/SI12_CHANGE_MANIFEST.md` (this file)
- `docs/intelligence/INTELLIGENT_SERVICE_ADVISOR.md`
- `docs/intelligence/ESTIMATE_QUALITY_ENGINE.md`
- `docs/intelligence/ETHICAL_RELATED_SERVICES.md`
- `docs/intelligence/CUSTOMER_EXPLANATION_ENGINE.md`
- `docs/intelligence/ESTIMATE_FOLLOW_UP_INTELLIGENCE.md`
- `docs/intelligence/SERVICE_ADVISOR_PRIVACY.md`
- `docs/intelligence/SI12_ROLLOUT.md`
- `docs/intelligence/SI12_ROLLBACK.md`
- `docs/intelligence/SI12_REGRESSION_REPORT.md`
- `docs/testing/staff/SI12_SERVICE_ADVISOR_UAT.md`
- `docs/testing/staff/SI12_SERVICE_ADVISOR_UAT.html`

---

## Existing Modules That May Be Touched

| Module | Touch Type | Reason |
|--------|------------|--------|
| `features/command-center/CommandCenterView.tsx` | Additive | Add Service Advisor Opportunities section (flag-gated) |
| `features/estimates/` | Read-only integration | Mount ServiceAdvisorPanel as optional section |
| `features/job-cards/` | Read-only integration | Mount compact Advisor Context card |
| `package.json` | Additive | Add `intelligence:service-advisor` script |

**Critical: No changes to estimate totals, calculations, tax, approval, or payment logic.**

---

## Additive Database Changes

4 new tables (additive only, no existing table changes):
1. `service_advisor_sessions`
2. `service_advisor_suggestions`
3. `service_advisor_outcomes`
4. `advisor_templates`

8 new feature flags (all OFF):
- `intelligent_service_advisor`
- `service_advisor_estimate_panel`
- `service_advisor_customer_explanations`
- `service_advisor_related_services`
- `service_advisor_follow_up`
- `service_advisor_command_center`
- `service_advisor_outcome_tracking`
- `service_advisor_sapelee_enhancement`

---

## Feature Flags

All default OFF. No automatic enablement.

---

## Rollback Method

1. Disable all 8 SI-12 feature flags in Supabase `feature_flags` table.
2. All existing estimate, job card, and workflow pages remain fully functional.
3. Additive tables remain (no data corruption risk).
4. `git revert` the SI-12 commit if code rollback is needed.

No database restore required.

---

## Protected Workflows (must not be affected)

- Authentication and session management
- Shop switching and mirror behavior
- Customer, Vehicle, Appointment CRUD
- Vehicle Intake / Smart Intake
- Job Card creation and editing
- Digital Inspections
- Estimate creation, editing, totals, tax, discounts
- Estimate approval (link-based and in-app)
- Repair Orders and QA
- Invoice generation and PDF
- Payment recording
- Inventory management
- Parts orders and receiving
- Vehicle Intelligence Engine
- Command Center existing sections
- Morning Brief
- Billing disabled state

---

## Known Assumptions

1. `recommendations` table exists (from SI-5/SI-6 migrations).
2. `intelligence_events` table exists with corrected RLS (INFRA BUG 001 fix applied).
3. `feature_flags` table exists with composite unique constraint.
4. `vehicle_intelligence_profiles` and `vehicle_intelligence_signals` tables exist.
5. `shop_users` table has `user_id`, `shop_id`, `role` columns.
6. `shop_mirrors` table exists for mirror behavior.
7. `business_memory` table exists (SI-9).
8. `repair_cases` or equivalent exists (SI-5).
9. Lao language support is template-architecture only — no live translations in this epic.

---

## Tests Required Before Merge

- TypeScript: `npx tsc --noEmit` — must pass clean
- Build: `npm run build` — must succeed
- All 7 SI-12 spec files
- Isolation test: estimate page renders without advisor module
- No cross-shop data leakage

---

## Manual Supabase Steps After Merge

Run in Supabase SQL Editor:
1. `migration_intelligent_service_advisor.sql` — creates 4 tables + RLS + 8 feature flags
