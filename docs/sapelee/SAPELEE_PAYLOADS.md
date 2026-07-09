# Sapelee Payload Reference (SI-8)

All payloads sent to Sapelee are constructed by `SapeleePayloadBuilder.ts`.
No raw DB rows or application objects are ever sent directly.

## Metrics Payload (`SapeleeMetricsPayload`)

Sent to: `/api/external/events` (when `sapelee_event_sync` flag ON)

```typescript
{
  shopId: string;
  metricDate: string;          // YYYY-MM-DD
  revenueToday: number;        // USD cents
  revenueYesterday: number;
  revenueOpportunityTotal: number;
  unpaidInvoiceCount: number;
  overdueInvoiceCount: number;
  openEstimateCount: number;
  staleEstimateCount: number;
  completedNotInvoicedCount: number;
  openJobCount: number;
  stuckJobCount: number;
  lowInventoryCount: number;
  repairCasesToday: number;
  technicianActiveCount: number;
  technicianIdleCount: number;
  shopHealthScore: number;
  calculatedAt: string;        // ISO 8601
}
```

**Excluded**: per-invoice amounts, customer data, VINs, payment details.

## Morning Brief Payload (`Sapelee_MorningBriefPayload`)

Sent to: `/api/external/morning-brief/enhance` (when `sapelee_morning_brief_enhancement` flag ON)

```typescript
{
  shopId: string;
  briefDate: string;
  shopHealthScore: number;
  executiveScore: number;
  cashCollection: { unpaidCount, unpaidTotal, overdueCount, overdueTotal, urgency }
  revenueOpportunities: Array<{ key, label, count, urgency }>  // NO per-item totals
  operationalRisks: Array<{ key, label, count, severity }>
  todayPriorities: Array<{ rank, title, category, recommendationKey, decisionScore, estimatedTimeMinutes }>
  // estimatedRevenue excluded per priority
  technicianSummary: { activeCount, idleCount, bottlenecks }
  inventorySummary: { lowCount, reorderUrgency }
  recommendedFocus: string;
  generatedAt: string;
}
```

## Event Payload (`SapeleeEventPayload`)

```typescript
{
  eventType: string;
  shopId: string;
  entityType: string;
  entityIdHash: string;   // one-way hash of real UUID — cannot be reversed
  timestamp: string;
  payload: Record<string, unknown>;  // PII-redacted
}
```

Entity IDs are hashed with a simple non-reversible function. Sapelee cannot join back to real records.

## Expected Enhancement Response (`SapeleeBriefEnhancement`)

```typescript
{
  executiveSummary: string;
  strategicAdvice: string;
  revenueFocus: string;
  riskFocus: string;
  ownerCoaching: string;
  confidence: number;      // 0.0–1.0
  generatedAt: string;
  mockMode: boolean;       // true = Sapelee in demo mode, treat as no-op
}
```

Stored in `morning_briefs.metadata.sapelee_enhancement`. Never replaces any local brief field.
