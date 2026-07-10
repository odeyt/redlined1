# SI-12 Rollback Plan — Intelligent Service Advisor

## Immediate Rollback (< 60 seconds)

Run in Supabase SQL Editor:

```sql
UPDATE feature_flags SET enabled = false WHERE flag_key IN (
  'intelligent_service_advisor',
  'service_advisor_estimate_panel',
  'service_advisor_customer_explanations',
  'service_advisor_related_services',
  'service_advisor_follow_up',
  'service_advisor_command_center',
  'service_advisor_outcome_tracking',
  'service_advisor_sapelee_enhancement'
);
```

**Effect:** All SI-12 UI immediately disappears. Estimate, Job Card, and Command Center
pages continue working exactly as before SI-12.

**No database restore required.**  
**No Vercel redeployment required.**  
**No staff action required.**

---

## Code Rollback (if needed)

```bash
git revert <si-12-commit-sha>
git push origin main
```

Vercel redeploys from main automatically.

---

## Data Tables

The 4 additive tables (`service_advisor_sessions`, `service_advisor_suggestions`,
`service_advisor_outcomes`, `advisor_templates`) remain in the database.
They are safe to leave — all flagged OFF and RLS-protected.
They can be dropped manually if desired after confirming no data is needed.

---

## Rollback Does NOT Affect

- Estimates and estimate lines
- Job Cards
- Invoices and payments
- Repair Orders
- Customers and vehicles
- Appointments
- Vehicle Intelligence
- Command Center (existing sections)
- Morning Brief
- Any SI-1 through SI-11 functionality
