# Learning Scoring Formulas (SI-11)

All formulas are in `intelligence/learning/LearningScoring.ts`.

## Correctness Rate

```
correctnessRate = (correct + 0.5 × partially_correct)
                 ─────────────────────────────────────
                 max(1, correct + partially_correct + incorrect)
```

Range: [0, 1]. Partial credit = 0.5. Denominator floored at 1 to avoid division by zero.

## Action Rate

```
actionRate = acted_upon / max(1, total_recommendations)
```

Range: [0, 1]. Measures what fraction of recommendations staff acted on.

## Success Rate

```
successRate = successful / max(1, successful + failed)
```

Range: [0, 1]. Only counts outcomes where staff recorded a result status of `successful` or `unsuccessful`.

## Dismiss Rate

```
dismissRate = dismissed / max(1, total_recommendations)
```

Range: [0, 1]. High dismiss rate is a negative signal.

## Sample Weight

Used to ramp adjustments from 0 at the minimum sample threshold to 1.0 at 100 samples:

```
sampleWeight = min(1, (sampleSize - 20) / 80)
```

This prevents large adjustments from small samples even after the minimum threshold is reached.

## Confidence Adjustment

Bounds: [-10, +10]

```
signal = (correctnessRate × 0.5) + ((averageAccuracy / 5) × 0.3) + (successRate × 0.2)
raw    = (signal - 0.5) × 2          // maps 0.5 neutral → 0, full range → ±1
adj    = raw × 10 × sampleWeight
result = clamp(round(adj, 1), -10, +10)
```

Below minimum sample: always 0.

## Ranking Adjustment

Bounds: [-100, +100]

```
positiveSignal = (actionRate × 0.3)
               + (successRate × 0.3)
               + ((averageUsefulness / 5) × 0.25)
               + (min(1, totalRevenue / 100000) × 0.15)

dismissPenalty = dismissRate × 0.4

net = positiveSignal - dismissPenalty
raw = (net - 0.3) × 2               // center at 0.3 as neutral
adj = raw × 100 × sampleWeight
result = clamp(round(adj), -100, +100)
```

Below minimum sample: always 0.

## Rule Status

After computing adjustments, a rule is classified as:

| Status | Condition |
|---|---|
| `collecting_data` | sampleSize < 20 |
| `trusted` | confidenceAdj >= 5 OR actionRate >= 0.7 |
| `low_performing` | confidenceAdj <= -5 OR dismissRate >= 0.6 |
| `active` | otherwise (sample >= 20, neither trusted nor low) |
