# SI-10 Regression Report — Vehicle Intelligence Engine

Branch: `feature/si-10-vehicle-intelligence`
Date: 2026-07-10

## Regression Risk Assessment

| Module | Risk | Reason |
|--------|------|--------|
| Vehicle CRUD | None | No existing vehicle queries modified |
| Job Cards | None | No existing job card logic changed |
| Estimates | None | No existing estimate logic changed |
| Invoices | None | No existing invoice logic changed |
| Repair Orders | None | No existing repair order logic changed |
| Repair Cases | None | Read-only queries; no writes to repair_cases |
| Parts Orders | None | Read-only; no writes to parts_order_items |
| Command Center | Low | Additive: one extra async load, guarded by two flags |
| Vehicles View | Low | Panel is conditionally rendered; error-bounded; flags off by default |
| Auth | None | No auth changes |
| Billing | None | No billing changes |
| Shop switching | None | No shopStore changes |

## Protected Code — Confirmed Unchanged

- `vehicles` table: no ALTER TABLE
- `job_cards` table: no ALTER TABLE
- `estimates` table: no ALTER TABLE
- `invoices` table: no ALTER TABLE
- `repair_orders` table: no ALTER TABLE
- `repair_cases` table: no ALTER TABLE
- `parts_order_items` table: no ALTER TABLE
- `feature_flags` table: no ALTER TABLE
- All existing API routes: not modified
- All existing services: not modified

## New Production Code Risk

| File | Risk | Mitigation |
|------|------|-----------|
| `VehicleIntelligenceEngine.ts` | Low | All extractors catch individually; safe fallback on total failure |
| `VehicleEventHooks.ts` | None | 100% fire-and-forget; never called from existing code yet |
| `VehiclesView.tsx` | Low | Panel guarded by dual flags; error-bounded; no change to existing drawer logic |
| `CommandCenterView.tsx` | Low | `loadVehicleIntelligence` is fire-and-forget; `vehicleHighRiskCount` only renders if non-null and >0 |
| API routes | None | All auth-gated; return `disabled:true` when flags off |

## Test Coverage Added

- `vehicle-intelligence-engine.spec.ts` — health score calculations
- `vehicle-intelligence-api.spec.ts` — API endpoint contracts
- `vehicle-intelligence-isolation.spec.ts` — rule isolation, no-throw guarantees

## Rollback Procedure

1. Set all 4 feature flags to `false` in Supabase:
   ```sql
   UPDATE feature_flags
   SET enabled = false
   WHERE flag_key IN (
     'vehicle_intelligence_engine',
     'vehicle_intelligence_panel',
     'vehicle_intelligence_command_center',
     'vehicle_intelligence_auto_refresh'
   );
   ```
2. Vehicle pages revert to previous state immediately — no redeploy required
3. New tables (`vehicle_intelligence_profiles`, `vehicle_intelligence_events`, `vehicle_intelligence_signals`) can remain without impact

## Pre-merge Checklist

- [x] tsc --noEmit passes
- [x] next build passes
- [x] All feature flags default OFF
- [x] No existing table modified
- [x] No existing service modified
- [x] Error boundary on all new UI
- [x] Fire-and-forget on all hooks
- [x] PII excluded (no VIN, customer name, address, payment data in new tables)
- [x] VIN remains shop-private (not stored in intelligence tables)
