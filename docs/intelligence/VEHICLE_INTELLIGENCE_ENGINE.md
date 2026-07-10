# Vehicle Intelligence Engine (SI-10)

Deterministic, per-vehicle intelligence built from existing shop data. No AI. No external calls.

## What it builds

For each vehicle, the engine extracts and stores:
- **Health score** (0–100) and **health status** (healthy / monitor / attention / high_risk)
- **Risk signals** from 10 deterministic rules
- **Recommended checks** based on declined work, repeat concerns, and unresolved DTCs
- **Repair patterns** — repeat concerns, repeat DTCs, repeated parts
- **Repair lessons** — verified successful resolutions by technician
- **Declined work** — estimates the customer declined (with safety-level severity)
- **Comeback pattern** — warranty/return repairs

## Tables

| Table | Purpose |
|-------|---------|
| `vehicle_intelligence_profiles` | One row per vehicle per shop. UNIQUE on shop_id+vehicle_id. |
| `vehicle_intelligence_events` | Append-only log of intelligence events (builds, hooks). |
| `vehicle_intelligence_signals` | Active signals for each vehicle. Reset on each rebuild. |

## Feature Flags

All default OFF. Enable via Supabase feature_flags table.

| Flag | Purpose |
|------|---------|
| `vehicle_intelligence_engine` | Enable extraction and API |
| `vehicle_intelligence_panel` | Show panel in vehicle drawer |
| `vehicle_intelligence_command_center` | Show high-risk summary in Command Center |
| `vehicle_intelligence_auto_refresh` | Auto-rebuild on vehicle update |

## Rules

1. `ruleRepeatConcern` — same concern category ≥2 visits → medium/high signal
2. `ruleRepeatDtc` — same DTC code ≥2 times → info (resolved) or high (unresolved)
3. `ruleUnresolvedDeclinedWork` — any declined estimate → medium; safety items → high
4. `ruleComebackPattern` — comeback/warranty repairs → medium/high
5. `ruleMissingRepairIntelligence` — completed jobs without repair cases → info/medium
6. `ruleMaintenanceCandidate` — not serviced in 180+ days → info/medium
7. `ruleHighValueVehicle` — total revenue ≥ $5,000 → info
8. `ruleLowDataConfidence` — fewer than 3 visits or 2 jobs → info
9. `rulePartsPattern` — same part used ≥2 times → info
10. `ruleTechnicianFamiliarity` — tech with ≥2 verified repairs → info

## Health Score Formula

Start at 100. Deductions:
- Comeback(s) recorded: −20
- Same concern category ≥2 times: −15
- Repeat unresolved DTC: −10
- Declined safety work (brake/tire/steering): −20
- Unpaid invoices: −5
- Incomplete history (no completed job or no repair case): −5
- Multiple open estimates: −5
- Two or more comebacks: additional −15

Additions:
- ≥3 verified successful repairs: +min(5, count)
- Zero comebacks + ≥3 completed jobs: +5

Clamped 0–100.

## CLI Rebuild

```bash
npm run intelligence:vehicles -- --shop-id <id>
npm run intelligence:vehicles -- --all-shops
npm run intelligence:vehicles -- --shop-id <id> --vehicle-id <id> --dry-run
```
