# Shop Health Score

## Overview

A 0–100 deterministic score that summarizes shop operational health.  
Computed by `MetricsBuilder.calculateShopHealthScore()`. No AI.

## Formula

Start at **100**. Subtract for each risk condition present:

| Condition | Deduction |
|---|---|
| Overdue invoices > 0 | −10 |
| Stale estimates > 0 | −10 |
| Stuck repair orders > 0 | −15 |
| Completed jobs not invoiced > 0 | −15 |
| Low inventory items > 0 | −10 |
| Revenue today = $0 AND open job cards exist | −10 |
| No repair cases created AND completed jobs today > 0 | −5 |

**Clamp**: result is clamped to [0, 100].

## Status bands

| Score | Status | Color |
|---|---|---|
| 80–100 | Healthy | Green |
| 60–79 | Warning | Amber |
| 0–59 | Critical | Red |

## Where it appears

- Command Center → health score widget (top-left number)
- `shop_intelligence_metrics.shop_health_score` column
- `shop_health_score` signal in SignalMap (SI-4 pipeline)

## Design decisions

- **No AI involvement** — score is 100% deterministic from DB counts
- **Deductions are additive** — each risk is independent
- **Conservative penalties** — stuck jobs and uninvoiced completed work are penalized most heavily as they represent direct revenue risk
- **Revenue dip is contextual** — zero revenue only penalizes when open jobs exist (implies jobs aren't being invoiced, not that the shop is closed)
