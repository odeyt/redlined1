# SI-4: Live Intelligence Pipeline

## What it is

Transforms real operational shop data into intelligence metrics that feed the Command Center.

No AI. No external calls. Deterministic queries against existing Supabase tables.

## Data flow

```
Supabase Tables (invoices, estimates, job_cards, payments, etc.)
  ↓  MetricsBuilder.calculateShopMetrics()
shop_intelligence_metrics  (one row per shop per day, upserted)
  ↓  extractSignalsFromMetrics()
SignalMap  (flat key→value)
  ↓  RecommendationEngine.generateRecommendations()
recommendations table
  ↓  GET /api/intelligence/recommendations + /signals + /metrics
Command Center UI
```

## Tables

| Table | Purpose |
|---|---|
| `shop_intelligence_metrics` | Computed metrics row per shop per day |
| `recommendations` | Recommendation rows generated from signals |
| `intelligence_signals` | Raw signal snapshot (legacy fallback) |
| `intelligence_events` | Event log from EventPublisher |

## Feature flags

| Flag | Default | Effect |
|---|---|---|
| `live_intelligence_pipeline` | OFF | Gates metrics API route |
| `shop_metrics` | OFF | Reserved for per-shop granular flag |
| `command_center_live_data` | OFF | Reserved for UI-level live data toggle |

Flags in `feature_flags` table. Enable via Supabase SQL:
```sql
UPDATE feature_flags SET enabled = true
WHERE flag_key IN ('live_intelligence_pipeline', 'recommendation_engine', 'intelligence_bus');
```

## Refresh triggers

Metrics are recalculated:
1. When owner/manager clicks **Refresh Intelligence** in Command Center (calls POST /api/intelligence/metrics then POST /api/intelligence/recommendations)
2. Fire-and-forget after high-value events: `InvoicePaid`, `EstimateApproved`, `EstimateDeclined`, `JobCardCreated`, `RepairOrderCompleted`, `RepairCaseCreated`, `PaymentRecorded`
3. Manually via the backfill script

## Production safety

- MetricsBuilder wraps every sub-query in try/catch — partial failure is logged as a warning, not an error
- EventPublisher metric refresh is fire-and-forget; failure has no effect on the original action
- If `shop_intelligence_metrics` table doesn't exist, Command Center falls back to raw signal extraction
- Feature flags default OFF — no impact until explicitly enabled per shop

## Rollout plan

1. Run `migration_live_intelligence_pipeline.sql` in Supabase
2. Enable `live_intelligence_pipeline` flag for owner's shop only
3. Run `npm run intelligence:recalculate -- --shop-id=<uuid> --dry-run` to verify
4. Run without `--dry-run` to populate first row
5. Open Command Center → click Refresh Intelligence
6. Verify metrics match what you see in invoices/estimates/jobs manually
7. Enable for second internal shop
8. Monitor for warnings in Vercel Logs
