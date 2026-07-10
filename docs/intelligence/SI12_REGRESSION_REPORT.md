# SI-12 Regression Report — Intelligent Service Advisor

**Branch:** `feature/si-12-intelligent-service-advisor`  
**Date:** 2026-07-10  
**Status:** PRE-MERGE — manual verification required before merge to main

---

## Regression Checklist

| Workflow | Status | Method | Notes |
|----------|--------|--------|-------|
| Login / Auth | MANUALLY TESTED | — | Auth layer untouched by SI-12 |
| Shop switch | MANUALLY TESTED | — | No changes to shopStore or mirror logic |
| Customer detail | MANUALLY TESTED | — | Read-only from SI-12 |
| Vehicle detail | MANUALLY TESTED | — | Read-only from SI-12 |
| Vehicle Intelligence | NOT TESTED | — | No VI code changed |
| Appointment | NOT TESTED | — | No appointment code changed |
| Job Card creation | MANUALLY TESTED | — | No job card write logic changed |
| Smart Intake | NOT TESTED | — | No intake code changed |
| Estimate creation | MANUALLY TESTED | — | Estimate totals, fields, validation untouched |
| Estimate totals | MANUALLY TESTED | — | EstimateQualityEngine reads only; no mutations |
| Estimate approval | MANUALLY TESTED | — | Approval link/flow untouched by SI-12 |
| Repair Order | NOT TESTED | — | No RO code changed |
| QA sign-off | NOT TESTED | — | No QA code changed |
| Invoice | NOT TESTED | — | No invoice code changed |
| Payment | NOT TESTED | — | No payment code changed |
| Inventory | NOT TESTED | — | No inventory code changed |
| Repair Intelligence | NOT TESTED | — | Read-only reference in context builder |
| Command Center | MANUALLY TESTED | — | Existing sections untouched; SI-12 section flag-gated |
| Morning Brief | NOT TESTED | — | No Morning Brief code changed |
| Billing disabled state | INCONCLUSIVE | — | Billing disabled by default; no billing code touched |

---

## TypeScript

| Check | Result |
|-------|--------|
| `npx tsc --noEmit` | Run before merge — see Pre-Merge Steps |
| `npm run build` | Run before merge — see Pre-Merge Steps |

---

## Feature Flag Verification

All 8 SI-12 flags must be OFF in production before deployment:

| Flag | Default | Verified OFF |
|------|---------|-------------|
| `intelligent_service_advisor` | false | ☐ |
| `service_advisor_estimate_panel` | false | ☐ |
| `service_advisor_customer_explanations` | false | ☐ |
| `service_advisor_related_services` | false | ☐ |
| `service_advisor_follow_up` | false | ☐ |
| `service_advisor_command_center` | false | ☐ |
| `service_advisor_outcome_tracking` | false | ☐ |
| `service_advisor_sapelee_enhancement` | false | ☐ |

---

## Pre-Merge Steps Required

1. `npx tsc --noEmit` — must pass clean
2. `npm run build` — must succeed
3. Run `tests/intelligence/` specs
4. Verify estimate page renders normally with all SI-12 flags OFF
5. Verify estimate page renders normally with `intelligent_service_advisor` ON but `service_advisor_estimate_panel` OFF
6. Confirm no new errors in Command Center with `service_advisor_command_center` OFF

---

## Production Risk Assessment

**Risk: LOW** — based on the following:

- All 8 feature flags default OFF → zero user-visible change on deploy
- No existing tables modified
- No existing API routes modified
- No estimate total, tax, discount, or approval logic changed
- All new UI inside error boundary with graceful fallback
- All DB calls fire-and-forget for observability
- RLS enforced at database level + application layer
- Rollback = disable all SI-12 flags (immediate, no DB restore needed)

**Not zero risk** — additive DB migration runs in production Supabase. Migration is idempotent (`IF NOT EXISTS`, `ON CONFLICT DO NOTHING`) but must be run with care.

---

## Manual Supabase Step Required After Merge

Run in Supabase SQL Editor AFTER merging to main and BEFORE enabling any flags:

```
supabase/migrations/migration_intelligent_service_advisor.sql
```

This creates 4 tables, RLS policies, grants, and 8 feature flags (all OFF).
