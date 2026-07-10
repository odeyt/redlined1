# SI-13 Customer Lifetime Intelligence — Rollback Guide

## Instant Rollback (no code change needed)

Disable all SI-13 flags in Supabase:
```sql
UPDATE feature_flags
SET enabled = false
WHERE flag_key IN (
  'customer_lifetime_intelligence',
  'customer_intelligence_panel',
  'customer_segmentation',
  'customer_retention_risk',
  'customer_revenue_opportunities',
  'customer_intelligence_command_center',
  'customer_intelligence_morning_brief',
  'customer_intelligence_outcome_tracking',
  'customer_intelligence_auto_refresh',
  'customer_sapelee_enhancement'
);
```

Result: All customer pages return to normal immediately. No customer data is affected.

## Code Rollback

If a code rollback is needed:
```bash
git revert <commit-sha>
```
Or revert the branch merge in GitHub.

## Database

The 5 additive tables (`customer_lifetime_profiles`, `customer_segments`, `customer_intelligence_signals`, `customer_intelligence_events`, `customer_opportunity_outcomes`) can remain — they contain no operational data and do not affect core workflow.

If a full database cleanup is needed:
```sql
DROP TABLE IF EXISTS customer_opportunity_outcomes CASCADE;
DROP TABLE IF EXISTS customer_intelligence_events CASCADE;
DROP TABLE IF EXISTS customer_intelligence_signals CASCADE;
DROP TABLE IF EXISTS customer_segments CASCADE;
DROP TABLE IF EXISTS customer_lifetime_profiles CASCADE;
```

**This is not required for rollback — flag disable is sufficient.**

## Protected Systems

Rollback does NOT affect:
- Customers, vehicles, appointments, job cards, estimates, invoices, payments
- SI-11 (Intelligence Learning Engine)
- SI-12 (Intelligent Service Advisor)
- Command Center, Morning Brief, Vehicle Intelligence
- Any existing shop data
