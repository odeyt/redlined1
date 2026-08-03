# Missing tables — classification for launch

3 August 2026. Twenty-eight tables are referenced in code and absent from the
database (`PGRST205`). Each is classified by whether a **visible production
workflow** reaches it, traced from the table to its callers to the UI that
mounts them.

**Headline: the "no visible workflow depends on these" condition does NOT
hold.** Command Center — the default landing page for every owner and manager,
and free-tier since 3 August — reaches five of them.

---

## 1. Critical — a visible workflow depends on them

| Table | Reached from |
|---|---|
| `parts_order_items` | Command Center → `/api/intelligence/memory` → BusinessMemoryEngine |
| `recommendation_learning_events` | Command Center → LearningDashboardSection → `/api/intelligence/learning/summary` |
| `recommendation_learning_profiles` | as above |
| `recommendation_feedback` | as above |
| `recommendation_value_attribution` | as above, plus `/api/intelligence/learning/outcome` |

`components/AppShell.tsx` redirects owners and managers from `dashboard` to
`command-center` on load, so this is the first screen almost every customer
sees.

**These do not crash.** Both routes wrap their work in `try/catch`, and
BusinessMemoryEngine holds sixteen catch blocks, so a missing table surfaces as
an empty result. The panels render "ALL CLEAR ✓" and "NO MORNING BRIEF
GENERATED".

That is the actual problem. **The dashboard reports health it has not
measured.** A shop with genuine overdue invoices or stale jobs is told
everything is clear, because the query failed rather than returned nothing. A
customer cannot tell the difference, and neither can you.

### `dashboard_layouts` — critical only if a flag is on

`features/dashboard/DashboardView.tsx` renders `NewDashboardView` when the
`personal_dashboard` feature flag is enabled, and that view calls
`dashboardLayoutService`, which reads this table. With the flag off, the legacy
dashboard renders and nothing touches it.

**Check the flag before launch.** If it is on for anyone, saving a dashboard
layout fails silently.

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

1. **Decide the five Critical tables** before taking payment. Either create them
   with proper shop scoping and RLS, or make Command Center's panels show
   "unavailable" rather than "all clear". The second is far cheaper and removes
   the dishonesty, which is the real risk.
2. **Check the `personal_dashboard` flag.** If off, `dashboard_layouts` drops to
   deferrable.
3. **Keep Diagnostics hidden** until its thirteen tables exist. The gate is one
   line in `lib/moduleAvailability.ts`.
4. **Defer the rest.** Nothing mounted reaches them.

## The pattern worth noting

Every table here fails the same way: a query errors, a catch swallows it, and
the UI renders an empty state that reads as good news. It is the same fault
that let a broken shop INSERT run unnoticed for weeks and a billing webhook
return 200 while writing nothing. An empty result and a failed query must not
look alike.

## How to re-run this

```
grep -rhoE "\.from\('[a-z_]+'\)" --include="*.ts" --include="*.tsx" \
  app lib services commercial features components intelligence \
  | sed -E "s/\.from\('(.*)'\)/\1/" | sort -u
```

Probe each as `service_role`: `42501` = missing grant, `PGRST205` = table absent.
