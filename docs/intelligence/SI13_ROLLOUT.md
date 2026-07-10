# SI-13 Customer Lifetime Intelligence — Rollout Guide

## Pre-Deployment

1. Run SQL migration in Supabase SQL Editor:
   - File: `supabase/migrations/migration_customer_lifetime_intelligence.sql`
   - Confirm: "Success. No rows returned."

2. Deploy code (merge to main, Vercel auto-deploys).

3. Verify TypeScript build passed in CI.

## Enabling Features (staged)

All 10 flags default OFF. Enable in order:

### Stage 1 — Core Intelligence (internal only)
```
customer_lifetime_intelligence → true
```
This enables profile building and API routes. Nothing visible to staff yet.

### Stage 2 — Panel Display
```
customer_intelligence_panel → true
```
CustomerLifetimePanel now appears on customer pages.

### Stage 3 — Segmentation
```
customer_segmentation → true
```
Segments card appears. Confirm price_sensitive does NOT appear in panel.

### Stage 4 — Revenue Opportunities
```
customer_revenue_opportunities → true
```
Opportunities card appears with disclaimer text visible.

### Stage 5 — Optional (owner/manager only)
```
customer_retention_risk → true
customer_intelligence_command_center → true
customer_intelligence_morning_brief → true
customer_intelligence_outcome_tracking → true
```

## DO NOT ENABLE
- `customer_intelligence_auto_refresh` — keep OFF permanently initially
- `customer_sapelee_enhancement` — keep OFF permanently

## Rebuild After Deploy
```bash
npm run intelligence:customers
```
Dry-run by default. Set `REBUILD=true` to persist:
```bash
REBUILD=true npm run intelligence:customers
```

## Validation
- Customer pages load normally
- Panel appears below customer info when flag is ON
- Panel absent when flag is OFF
- No console errors related to customer intelligence
