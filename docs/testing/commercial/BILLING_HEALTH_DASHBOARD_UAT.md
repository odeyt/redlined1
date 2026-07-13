# Billing Health Dashboard — UAT

Route: `/admin/billing-health`

## Pre-conditions
- `PLATFORM_OWNER_EMAIL` set in .env.local to owner's email
- Migration `supabase/migration_billing_analytics.sql` applied
- `NEXT_PUBLIC_BILLING_ENABLED=false` (unchanged)

---

## 1. Access Test

| # | Step | Expected |
|---|---|---|
| 1.1 | Open /admin/billing-health while not logged in | Redirected to /login |
| 1.2 | Log in as a normal shop owner → visit /admin/billing-health | Redirected to /login (403 then redirect) |
| 1.3 | Log in as platform owner (email matches PLATFORM_OWNER_EMAIL) → visit /admin/billing-health | Dashboard renders |
| 1.4 | Unset PLATFORM_OWNER_EMAIL → visit as any user | Redirected to /login |

---

## 2. Empty State Test

| # | Step | Expected |
|---|---|---|
| 2.1 | No subscriptions in DB → load dashboard | All metrics show 0 or "Insufficient Data", no errors |
| 2.2 | No billing_events → load dashboard | Webhook section shows "No webhook data in range" |
| 2.3 | CAC not configured → check LTV & CAC section | Shows "Not Configured" for CAC |
| 2.4 | Churn sample < 5 shops → check Churn section | Shows "Insufficient Data" with explanation |

---

## 3. Monthly Subscription Scenario

| # | Step | Expected |
|---|---|---|
| 3.1 | Insert 1 active shop_subscription: plan=professional, status=active, metadata.billing_interval=monthly | MRR = $59 |
| 3.2 | Verify ARR | $59 × 12 = $708 |
| 3.3 | Verify ARPA | $59 (1 active paid shop) |

---

## 4. Annual Subscription Scenario

| # | Step | Expected |
|---|---|---|
| 4.1 | Insert 1 active shop_subscription: plan=professional, status=active, metadata.billing_interval=annual | MRR = $590/12 ≈ $49.17 |
| 4.2 | Verify ARR label says "run-rate" | Yes |

---

## 5. Trial Scenario

| # | Step | Expected |
|---|---|---|
| 5.1 | Insert shop_subscription: status=trialing, trial_end = future | MRR = $0, Active Trials count = 1 |
| 5.2 | Set trial_end to within 24h | "Expiring in 24h" counter = 1, warning shown |
| 5.3 | Expired trial with no active subscription | Expired Unconverted count increments |

---

## 6. Conversion Scenario

| # | Step | Expected |
|---|---|---|
| 6.1 | Trial converted (status changed to active, had trial_start set) | Converted count increments, conversion rate updates |
| 6.2 | Active trials NOT counted in conversion denominator | Confirmed in cohort note |

---

## 7. Cancellation Scenario

| # | Step | Expected |
|---|---|---|
| 7.1 | Insert cancelled subscription with cancelled_at in range | Cancelled count increments |
| 7.2 | Insert active subscription with cancel_at_period_end=true | Scheduled Cancel increments, revenue at risk shows value |

---

## 8. Past Due Scenario

| # | Step | Expected |
|---|---|---|
| 8.1 | Insert subscription with status=past_due | Past Due count increments, MRR at risk shows amount |
| 8.2 | Warning alert appears | Yes — "X subscription(s) currently past due" |

---

## 9. Failed Renewal Scenario

| # | Step | Expected |
|---|---|---|
| 9.1 | Insert billing_event: event_type=payment.failed, processed=false, error set | Failed Renewals count increments |
| 9.2 | Checkout failure event (checkout.completed) | NOT counted in Failed Renewals |

---

## 10. Refund Scenario

| # | Step | Expected |
|---|---|---|
| 10.1 | Insert billing_event: event_type=refund.created, payload.amount=5900 (cents) | Refund count=1, total=$59 |
| 10.2 | Refund from internal shop | Not counted (excluded by internal shop filter) |

---

## 11. Failed Webhook Scenario

| # | Step | Expected |
|---|---|---|
| 11.1 | Insert billing_event with error set, processed=false | Webhook Failed count increments |
| 11.2 | Failure rate > 5% | Warning shown |
| 11.3 | Duplicate billing_event (same provider_event_id rejected at insert) | Duplicate not counted |

---

## 12. LTV — Insufficient Data State

| # | Step | Expected |
|---|---|---|
| 12.1 | Logo churn = 0 | LTV shows "Insufficient Data", reason visible |
| 12.2 | < 5 active shops at period start | Churn shows "Insufficient Data", LTV also null |

---

## 13. CAC — Unconfigured State

| # | Step | Expected |
|---|---|---|
| 13.1 | No commercial_acquisition_costs rows | CAC shows "Not Configured" |
| 13.2 | POST /api/admin/billing-health/acquisition with valid body | Row inserted, CAC shows value on next refresh |

---

## 14. Date Range Controls

| # | Step | Expected |
|---|---|---|
| 14.1 | Click "Last 7 days" | Range changes, metrics update |
| 14.2 | Click "Last 90 days" | Range changes, trial funnel uses 90-day cohort |
| 14.3 | API with custom range > 366 days | Range clamped to 366 days |

---

## 15. Internal Shop Exclusion

| # | Step | Expected |
|---|---|---|
| 15.1 | D1 shops are active | Not counted in MRR, Active Shops, or Trial counts |
| 15.2 | Internal shop count shown separately | "Internal Protected Shops: 2" |

---

## 16. Billing Remains Disabled

| # | Step | Expected |
|---|---|---|
| 16.1 | NEXT_PUBLIC_BILLING_ENABLED | Still false |
| 16.2 | Load dashboard | No checkout initiated, no Creem calls |
| 16.3 | Existing shop workflows | Unaffected — job cards, invoices, estimates work normally |
