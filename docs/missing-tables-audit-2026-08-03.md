# Tables referenced in code that do not exist — 3 Aug 2026

Found while auditing `service_role` grants. Of 103 tables the codebase reaches
via `.from('...')`, **28 do not exist in the database**. PostgREST answers
`PGRST205: Could not find the table 'public.<name>' in the schema cache`.

This is not a permissions problem and the grant migration does not address it.
Every code path touching these tables fails at runtime.

## What is missing

**Diagnostics (16)** — the largest cluster, and it is the whole feature:

`diagnostic_sessions`, `diagnostic_dtcs`, `diagnostic_evidence`,
`diagnostic_feedback`, `diagnostic_freeze_frames`, `diagnostic_hypotheses`,
`diagnostic_modules`, `diagnostic_reasoning_runs`,
`diagnostic_repair_verifications`, `diagnostic_reviews`,
`diagnostic_test_plans`, `diagnostic_test_results`,
`diagnostic_bridge_pairings`, `dtc_records`, `vehicle_health_scores`,
`business_memory`

**Recommendation / learning (4)**

`recommendation_feedback`, `recommendation_learning_events`,
`recommendation_learning_profiles`, `recommendation_value_attribution`

**Line-item detail tables (5)**

`estimate_lines`, `estimate_declined_items`, `inspection_findings`,
`job_card_parts`, `parts_order_items`

**Other (3)**

`ai_usage_logs`, `inventory_items`, `dashboard_layouts`

## Why it has not been noticed

Diagnostics and AI Copilot are paid-plan modules, and no shop has ever held a
paid plan — the first successful purchase was the sandbox test on 2 Aug. So
these paths have never run for a real customer.

That changes the moment someone pays. `AI Copilot`, `Diagnostics` and
`Repair Intelligence` all appear on the Professional and Business plan cards.

## What to decide

Three options, and the choice differs per cluster:

1. **Create the tables.** Correct if the features are meant to ship. Needs real
   schema design, RLS policies and shop scoping — not a mechanical task, and
   the RLS work is the larger half.
2. **Remove the code.** Correct if these were speculative. Same reasoning as
   `onboarding_sessions`, removed on 2 Aug: code writing to a table nobody
   created is not a feature.
3. **Gate the modules off** until the tables exist, so customers cannot buy a
   plan advertising features that cannot work.

Option 3 is the one that matters before taking money. A Professional
subscriber at $99/mo currently gets three advertised modules that fail on
first use.

## How this was found

```
grep -rhoE "\.from\('[a-z_]+'\)" --include="*.ts" --include="*.tsx" \
  app lib services commercial features components intelligence \
  | sed -E "s/\.from\('(.*)'\)/\1/" | sort -u
```

then probing each with a `select('*').limit(1)` as `service_role` and grouping
by error code: `42501` = missing grant, `PGRST205` = table absent.

Worth re-running after any migration that adds tables.
