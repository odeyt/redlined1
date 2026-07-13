# Billing Health Score — Definition and Thresholds

Score range: 0–100. Higher is better.
Score is transparent: every dimension is documented here.

## Dimensions

| Dimension | Max Points | How Scored |
|---|---|---|
| Webhook Reliability | 25 | 25 − (failure_rate_pct × 0.25) − 5 if P95 > 5000ms |
| Subscription Reconciliation | 20 | 20 if any subscriptions exist and no unknown plan keys; null if no data |
| Renewal Success | 20 | 20 × (1 − past_due / (active + past_due)); null if no subscriptions |
| Trial Conversion | 15 | 15 × min(conversion_rate / 30%, 1); null if no eligible trials |
| Churn Health | 10 | 10 × max(0, 1 − logo_churn_rate / 5%); null if insufficient sample |
| Refund Health | 10 | 10 − (refund_count × 2), min 0 |

## Total Score
If any dimension is null (insufficient data), the score is computed over available dimensions only.
The overall score is normalized to 0–100 based on available maximum points.

## Thresholds for Labels
| Score | Label |
|---|---|
| ≥ 80 | Healthy |
| 60–79 | Needs Attention |
| < 60 | Action Required |

## Webhook Reliability Thresholds
- Failure rate > 5% → warning in dashboard
- P95 latency > 5000ms → −5 points
- P99 latency > 10000ms → additional dashboard warning

## Trial Conversion Threshold
- 30% conversion = full 15 points
- 0% conversion = 0 points

## Churn Health Threshold
- 0% monthly logo churn = full 10 points
- 5% monthly logo churn = 0 points
- Minimum sample: 5 shops at period start

## Refund Health
- 0 refunds = 10 points
- Each refund = −2 points
- Floor at 0 points

## Insufficient Data Handling
Each dimension independently marks itself as "Insufficient Data" when:
- Webhook: no events received in period
- Reconciliation: no subscriptions exist
- Renewal: no subscriptions exist
- Trial: no eligible completed trials
- Churn: fewer than 5 shops at period start
- Refunds: always scored (0 refunds = 10 points; no minimum required)
