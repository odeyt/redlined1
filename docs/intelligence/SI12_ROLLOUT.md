# SI-12 Rollout Plan — Intelligent Service Advisor

## Recommended Rollout Sequence

### Step 1 — Deploy (flags OFF)
- Merge `feature/si-12-intelligent-service-advisor` to `main`
- Vercel auto-deploys
- All 8 SI-12 flags remain OFF
- Zero user-visible change

### Step 2 — Run Migration
In Supabase SQL Editor, run:
```
supabase/migrations/migration_intelligent_service_advisor.sql
```

### Step 3 — Local + Staging Test
- Enable `intelligent_service_advisor` in local/staging only
- Enable `service_advisor_estimate_panel` in local/staging only
- Test all 10 UAT scenarios
- Confirm no estimate regressions

### Step 4 — Run Dry-Run Analysis
```
npm run intelligence:service-advisor -- --all-open-estimates --dry-run
```
Review output for false positives before enabling for users.

### Step 5 — Enable for Shop 2 (Odey) First
In Supabase:
```sql
UPDATE feature_flags SET enabled = true WHERE flag_key = 'intelligent_service_advisor';
UPDATE feature_flags SET enabled = true WHERE flag_key = 'service_advisor_estimate_panel';
```

### Step 6 — Monitor (minimum 20 estimates)
- Watch for false suggestions
- Check estimate quality scores
- Confirm panel failure isolation is working
- Review UAT feedback from staff

### Step 7 — Enable Customer Explanations (optional)
```sql
UPDATE feature_flags SET enabled = true WHERE flag_key = 'service_advisor_customer_explanations';
```

### Step 8 — Enable Outcome Tracking
```sql
UPDATE feature_flags SET enabled = true WHERE flag_key = 'service_advisor_outcome_tracking';
```

### Step 9 — Enable Shop 1 (after Shop 2 approval)
No additional migration needed. Flags are global scope — apply to both shops.

### Step 10 — Enable Related Services (after validation)
```sql
UPDATE feature_flags SET enabled = true WHERE flag_key = 'service_advisor_related_services';
```

### Step 11 — Enable Follow-Up Intelligence
```sql
UPDATE feature_flags SET enabled = true WHERE flag_key = 'service_advisor_follow_up';
```

### Step 12 — Enable Command Center Section (owner/manager only)
```sql
UPDATE feature_flags SET enabled = true WHERE flag_key = 'service_advisor_command_center';
```

---

## Success Metrics to Track

- Estimate quality score average (target: > 75)
- Suggestions accepted rate (target: > 30%)
- False suggestion rate (target: < 15%)
- Explanation copy usage rate
- Estimate approval rate before vs. after
- Follow-up completion rate

---

## Do NOT Enable

- `service_advisor_sapelee_enhancement` — not implemented, keep OFF permanently until Sapelee is connected
