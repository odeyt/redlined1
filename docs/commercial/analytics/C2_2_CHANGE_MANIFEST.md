# C-2.2 Change Manifest — Billing Health & Revenue Operations Dashboard

## Branch
`feature/billing-health-dashboard`

## Tables Read (Read-only access only)
| Table | Purpose |
|---|---|
| `shop_subscriptions` | Subscription status, plan, trial dates, cancellation dates |
| `billing_events` | Webhook event log, processing status, latency |
| `profiles` | Trial end dates (secondary reference) |
| `commercial_acquisition_costs` | Manual CAC spend entries (NEW — see migration) |
| `billing_metric_snapshots` | Daily snapshots (NEW — see migration) |

## Tables Written (New tables only)
| Table | Written By |
|---|---|
| `commercial_acquisition_costs` | POST /api/admin/billing-health/acquisition (owner only) |
| `billing_metric_snapshots` | Future: daily snapshot job (manual trigger for now) |

## No existing tables modified.

## Metrics Planned
MRR, ARR, ARPA, Active Paid Shops, Active Trials, Expired Trials, Past Due,
Cancelled, Refunds, Webhook Failures, Webhook Latency (median/P95/P99),
Failed Renewals, Trial Conversion Rate, Logo Churn, Revenue Churn, LTV, CAC,
LTV:CAC, Payback Period, Billing Health Score, Data Quality Issues

## Formulas
- **MRR** = Σ(normalized_monthly_price) for active non-internal subscriptions
- **Annual normalization** = annual_price / 12
- **ARR** = MRR × 12 (run-rate, not booked)
- **ARPA** = MRR / active_paid_shops
- **Conversion Rate** = converted_trials / (converted + expired_unconverted) × 100
- **Logo Churn** = cancelled_in_period / active_at_period_start × 100
- **Revenue Churn** = lost_mrr_in_period / starting_mrr × 100
- **LTV** = ARPA / monthly_churn_rate (returns null if churn=0 or insufficient data)
- **CAC** = total_spend / attributed_paid_shops (returns null if not configured)
- **Webhook Latency** = processed_at − created_at

## Permissions
| Role | Access |
|---|---|
| Platform Owner (PLATFORM_OWNER_EMAIL) | Full read + acquisition cost write |
| Normal shop owner | None — redirected to /login |
| Technician | None — redirected to /login |
| Unauthenticated | None — redirected to /login |

Authorization: server-side only via `verifyPlatformOwner()`. No client-side auth.

## Missing Data / Limitations
| Metric | Limitation |
|---|---|
| Webhook received_at | Not a separate column — `created_at` used as proxy |
| CAC | No acquisition spend table pre-exists — requires manual entry |
| Onboarding funnel steps | No event tracking for first-customer/first-job milestones |
| MRR trend chart | No historical snapshots before this epic — starts from now |
| Cancellation reasons | Not collected — shown as "not tracked" |
| Gross-margin LTV | Cost data not available — uses simple ARPA/churn formula |
| Reactivations | Not tracked in current schema |
| SMS/campaign spend | No marketing cost data in system |

## Proposed Migrations
`supabase/migration_billing_analytics.sql`:
- `commercial_acquisition_costs` (new)
- `billing_metric_snapshots` (new)
- Analytics indexes on `billing_events`, `shop_subscriptions`

## Feature Flags (all OFF by default)
- `billing_health_dashboard`
- `billing_revenue_metrics`
- `billing_trial_funnel`
- `billing_churn_analytics`
- `billing_webhook_health`
- `billing_renewal_health`
- `billing_ltv_cac`
- `billing_metric_snapshots`

## UI Routes
- `/admin/billing-health` — main dashboard (server-gated, no-index)

## API Routes
- GET `/api/admin/billing-health/overview`
- GET `/api/admin/billing-health/subscriptions`
- GET `/api/admin/billing-health/revenue`
- GET `/api/admin/billing-health/trials`
- GET `/api/admin/billing-health/churn`
- GET `/api/admin/billing-health/webhooks`
- GET `/api/admin/billing-health/renewals`
- GET `/api/admin/billing-health/acquisition`
- POST `/api/admin/billing-health/acquisition`

## Tests
- `tests/commercial/billing-analytics-service.spec.ts`
- `tests/commercial/billing-health-access.spec.ts`
- `tests/commercial/internal-shop-exclusion.spec.ts`

## Rollback
1. Delete branch `feature/billing-health-dashboard`
2. Run SQL rollback in migration file comments
3. Remove `PLATFORM_OWNER_EMAIL` from env if desired
4. No existing functionality affected — all code is additive

## Production Risk
**Low.** All new code. No existing tables or APIs modified. Billing remains off.
Dashboard requires env var `PLATFORM_OWNER_EMAIL` to be set — without it, the
route is inaccessible to everyone. No customer data exposed.
