# Vehicle Health Score (SI-10)

## Score Range

| Score | Status | Meaning |
|-------|--------|---------|
| 80–100 | healthy | Low risk, well-documented history |
| 60–79 | monitor | Worth watching; minor concerns |
| 40–59 | attention | Multiple concerns or repeat issues |
| 0–39 | high_risk | Comebacks, safety-declined work, or major patterns |

## What the score is based on

All inputs are from your shop's own data. No AI. No prediction.

- Job card history
- Repair case count and categories
- Comeback/warranty repair orders
- Declined estimates (safety items weighted higher)
- Invoice payment status
- DTC codes from repair cases
- Parts usage patterns

## What the score is NOT

- Not a mechanical condition assessment
- Not a prediction of future failure
- Not based on OEM maintenance intervals or VIN data
- Not influenced by customer identity or demographics

## Calibration notes

The score is designed to surface vehicles that deserve extra attention — not to replace technician judgment. A score of 40 means "this vehicle has a pattern worth reviewing," not "this vehicle will break."

The score resets on each rebuild based on current data. Historical trends are not factored in (no smoothing or moving average).
