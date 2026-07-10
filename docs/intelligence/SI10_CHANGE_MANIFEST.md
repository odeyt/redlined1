# SI-10 Change Manifest — Vehicle Intelligence Engine

Branch: `feature/si-10-vehicle-intelligence`
Date: 2026-07-10

## Files Planned (New)

### Infrastructure
- `supabase/migrations/migration_vehicle_intelligence_engine.sql`
- `intelligence/vehicle/types.ts`
- `intelligence/vehicle/VehicleIntelligenceEngine.ts`
- `intelligence/vehicle/VehicleIntelligenceRules.ts`
- `intelligence/vehicle/VehicleEventHooks.ts`

### Service
- `services/vehicleIntelligenceService.ts`

### API
- `app/api/intelligence/vehicle/[vehicleId]/route.ts`
- `app/api/intelligence/vehicle/[vehicleId]/timeline/route.ts`

### UI (isolated, not mounted by default)
- `features/vehicle-intelligence/VehicleIntelligencePanel.tsx`
- `features/vehicle-intelligence/VehicleHealthCard.tsx`
- `features/vehicle-intelligence/VehiclePatternsCard.tsx`
- `features/vehicle-intelligence/VehicleRiskSignals.tsx`
- `features/vehicle-intelligence/VehicleHistoryTimeline.tsx`
- `features/vehicle-intelligence/VehicleRecommendedChecks.tsx`
- `features/vehicle-intelligence/VehicleIntelligenceErrorBoundary.tsx`

### Scripts
- `scripts/rebuild-vehicle-intelligence.ts`

### Tests
- `tests/intelligence/vehicle-intelligence-engine.spec.ts`
- `tests/intelligence/vehicle-intelligence-api.spec.ts`
- `tests/intelligence/vehicle-intelligence-isolation.spec.ts`

### Docs
- `docs/intelligence/VEHICLE_INTELLIGENCE_ENGINE.md`
- `docs/intelligence/VEHICLE_HEALTH_SCORE.md`
- `docs/intelligence/VEHICLE_INTELLIGENCE_PRIVACY.md`
- `docs/intelligence/VEHICLE_INTELLIGENCE_ROLLOUT.md`
- `docs/intelligence/SI10_ROLLBACK_PLAN.md`
- `docs/intelligence/SI10_REGRESSION_REPORT.md`
- `docs/intelligence/SI10_CHANGE_MANIFEST.md` (this file)

## Files Modified

- `features/vehicles/VehiclesView.tsx` — additive only: mount VehicleIntelligencePanel inside vehicle detail, guarded by dual flags + error boundary
- `package.json` — add `intelligence:vehicles` script

## Database Changes

### New Tables (additive only)
- `vehicle_intelligence_profiles` — unique on shop_id + vehicle_id
- `vehicle_intelligence_events` — append-only log
- `vehicle_intelligence_signals` — per-vehicle signals

### No changes to existing tables
- No ALTER TABLE on vehicles, job_cards, estimates, invoices, repair_cases, repair_orders
- No DROP, RENAME, TRUNCATE

## Feature Flags Added (all default OFF)

| Flag | Purpose |
|------|---------|
| `vehicle_intelligence_engine` | Enable intelligence extraction |
| `vehicle_intelligence_panel` | Show panel on vehicle detail page |
| `vehicle_intelligence_command_center` | Show signals in Command Center |
| `vehicle_intelligence_auto_refresh` | Auto-refresh on events |

## Rollback Method

1. `UPDATE feature_flags SET enabled = false WHERE flag_key IN ('vehicle_intelligence_engine','vehicle_intelligence_panel','vehicle_intelligence_command_center','vehicle_intelligence_auto_refresh');`
2. Vehicle pages revert immediately — no code change required
3. New tables can remain (additive, no production dependency)
4. If needed: `git revert` or `git checkout main` and redeploy

## Protected Modules — NOT Modified

- Authentication
- Shop switching / shopStore
- Customers CRUD
- Vehicles CRUD (existing queries untouched)
- Appointments
- Job Cards (no existing logic changed)
- Estimates (no existing logic changed)
- Repair Orders
- Invoices
- Payments
- Time Tracking
- Inventory / Parts
- Repair Intelligence (read-only from engine)
- Command Center (additive only)
- Morning Brief
- Billing
- Feature Flags table
- Observability
- Testing Dashboard
- Disaster Recovery
