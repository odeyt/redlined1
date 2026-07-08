# Owner Command Center — Contract

> **Status**: Types defined. API routes built. No UI yet. Planned for SI-3.

## Purpose

A single-screen summary for shop owners: health score, revenue, open recommendations, risks, and signals.

## Data Contract

`CommandCenterSummary` (see `intelligence/command-center/types.ts`):

```typescript
{
  shopHealthScore:            number;        // 0–100
  revenueToday:               number;
  revenueOpportunity:         number;        // sum of estimated_revenue on open recs
  criticalRecommendations:    number;
  highPriorityRecommendations:number;
  openRecommendations:        Recommendation[];
  risks:                      CommandCenterRisk[];
  signals:                    IntelligenceSignal[];
  lastUpdated:                string;        // ISO 8601
}
```

## Planned API

| Endpoint | Method | Notes |
|---|---|---|
| `/api/intelligence/recommendations` | GET | Already built in SI-2 |
| `/api/intelligence/signals` | GET | Already built in SI-2 |
| `/api/intelligence/command-center` | GET | Planned SI-3 — returns CommandCenterSummary |

## Feature Flag

`command_center` — default OFF. No UI is shown while this flag is OFF.

## Access Control

Owner only. Managers may view signals but not the full Command Center (TBD in SI-3).

## Health Score Algorithm (Planned)

Start at 100. Deduct points for:
- Each critical recommendation: −15
- Each high-priority recommendation: −8
- Each stuck repair order: −5
- Each overdue invoice: −3
- Low inventory items: −2 each (max −10)

Floor at 0. This is deterministic — no AI scoring.
