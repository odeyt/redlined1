# Missing tables — classification for launch

3 August 2026. Twenty-eight tables are referenced in code and absent from the
database (`PGRST205`). Each is classified by whether a **visible production
workflow** reaches it, traced from the table to its callers to the UI that
mounts them.

**Headline: the condition holds. Nothing visible depends on them.** All 28 are
behind a disabled feature flag, an unmounted component, or a hidden module.

## 1. Critical — none

An earlier draft of this document put five tables here — `parts_order_items`
and the four `recommendation_*` tables — on the grounds that Command Center
reaches them, and claimed the dashboard was "reporting health it never
measured". **That was wrong, and worth recording rather than quietly
deleting.**

Two things were missed:

**The flags are off.** Both routes check a feature flag and return
`{ disabled: true }` before touching any missing table:

```
intelligence_learning_dashboard   false
business_memory_engine            false
personal_dashboard                no row at all → false
```

**The tiles are fed by tables that exist.** The "0 CRITICAL / ALL CLEAR"
display comes from `shop_intelligence_metrics`, `recommendations`,
`intelligence_signals` and `decision_rankings` — all present. The zeros
observed on 3 August were accurate: that shop genuinely had no data. The claim
that the dashboard was inventing a healthy status was not supported.

**And both panels degrade to absent, not to a false positive.**
`LearningDashboardSection` returns `null` unless `learningEnabled` is true, and
the business memory panel renders only when its counts exceed zero. Neither
shows a reassuring figure derived from nothing.

`dashboard_layouts` is reached only by `NewDashboardView`, which renders only
when `personal_dashboard` is enabled. There is no such flag row, so
`LegacyDashboardView` renders and the table is never touched.

### What was still worth doing

`/api/intelligence/memory` already tried to detect a missing table by matching
`'does not exist'` and `'relation'` in the error text. PostgREST actually
answers with `"Could not find the table 'public.x' in the schema cache"`, so
that check never fired once. It now probes via
`lib/intelligence/tableAvailability.ts` and returns `{ unavailable: true }`,
as does the learning summary route.

This changes nothing today, because the flags short-circuit first. It matters
on the day someone enables one: the difference between a panel quietly showing
nothing and an API stating plainly that the feature is not set up.

---

## 2. Future feature — safe to defer

Reachable only from code that no mounted component calls. The API routes exist;
nothing in the UI requests them.

**Diagnostics (13)** — `diagnostic_sessions`, `diagnostic_dtcs`,
`diagnostic_evidence`, `diagnostic_feedback`, `diagnostic_freeze_frames`,
`diagnostic_hypotheses`, `diagnostic_modules`, `diagnostic_reasoning_runs`,
`diagnostic_repair_verifications`, `diagnostic_reviews`,
`diagnostic_test_plans`, `diagnostic_test_results`,
`diagnostic_bridge_pairings`.

Served by `/api/diagnostics/*`, which backs the Diagnostics module —
withheld from customers on 3 August via `UNAVAILABLE_MODULES`. Deferring is
sound **so long as that module stays hidden**; un-hiding it without these
tables puts a paying customer straight into a broken page.

**Service Advisor context (5)** — `dtc_records`, `estimate_lines`,
`estimate_declined_items`, `inspection_findings`, `business_memory`.

Read by `AdvisorContextBuilder` and `CustomerContextBuilder`, which back
`ServiceAdvisorPanel` and `CustomerLifetimePanel`. Neither component is
imported by any view — they exist but are not mounted. Worth re-checking before
either is wired up.

**Platform engines (3)** — `vehicle_health_scores`, `job_card_parts`,
`inventory_items`.

Read by `VehicleHealthScoreEngine` and `PartsIntelligenceEngine`, exported
through `lib/platform/index.ts`. No route or view calls them. Note
`/api/intelligence/vehicle/health-summary` does **not** use
`VehicleHealthScoreEngine`, despite the similar name.

---

## 3. Dead code — remove the reference

**`ai_usage_logs`** — now has zero references. AI metering moved to
`usage_records` on 3 August, which exists and is working. Nothing to remove;
recorded here so the table is not created out of habit.

Two adapters are also unreferenced and read missing tables:
`ServiceAdvisorLearningAdapter` and `LearningAdjustmentAdapter` have no
importers at all.

---

## Recommended order

1. **Nothing blocks launch.** No visible workflow reaches a missing table.
2. **Keep Diagnostics hidden** until its thirteen tables exist. The gate is one
   line in `lib/moduleAvailability.ts`.
3. **Before enabling `business_memory_engine`, `intelligence_learning_dashboard`
   or `personal_dashboard`,** create the tables that flag needs. Each is
   currently the only thing standing between a customer and a dead feature.
4. **Defer the rest.** Nothing mounted reaches them.

## The check to repeat

The right question was never "which tables are missing" but "which missing
table can a customer reach". Reachability runs table → engine → route → the
component that mounts it, and it broke down at the last step here: routes exist
and are correct, but the flags are off and two panels are never imported.

Worth re-running whenever a feature flag is switched on, since that is exactly
what converts a deferred table into a broken page.

## How to re-run this

```
grep -rhoE "\.from\('[a-z_]+'\)" --include="*.ts" --include="*.tsx" \
  app lib services commercial features components intelligence \
  | sed -E "s/\.from\('(.*)'\)/\1/" | sort -u
```

Probe each as `service_role`: `42501` = missing grant, `PGRST205` = table absent.
