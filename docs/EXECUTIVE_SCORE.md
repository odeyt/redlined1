# Executive Score

## What it is

A 0–100 composite score representing the overall health of the shop across five dimensions. Shown in Command Center when `executive_dashboard` feature flag is enabled.

## Composition

| Component | Weight | Source |
|-----------|--------|--------|
| Revenue Health | 25 pts | Revenue today vs. unpaid invoices |
| Efficiency | 25 pts | Jobs completed vs. stuck/stale |
| Risk Control | 20 pts | Overdue invoices, stuck orders |
| Cash Flow | 20 pts | Payments today vs. unpaid total |
| Knowledge Growth | 10 pts | Repair cases, knowledge captured |

**Total: 100 pts**

## Color Coding

| Score | Color | Label |
|-------|-------|-------|
| ≥75 | Green | Strong |
| ≥50 | Amber | Fair |
| <50 | Red | Needs Work |

## Trend

`up` / `down` / `stable` — currently based on signal comparison. Future: compare against prior day's stored score.

## API

`GET /api/intelligence/executive-score`

Returns:
```json
{
  "score": {
    "overall": 72,
    "revenueHealth": 18,
    "efficiency": 20,
    "riskControl": 14,
    "cashFlow": 15,
    "knowledgeGrowth": 5,
    "trend": "stable"
  },
  "calculatedAt": "2026-07-09T..."
}
```

## Key Files

- `app/api/intelligence/executive-score/route.ts`
- `intelligence/decision/DecisionEngine.ts` → `calculateExecutiveScore()`
- `features/command-center/CommandCenterView.tsx` → `ExecScoreBadge`
