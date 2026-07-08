# Intelligence Foundation Architecture

## Overview

The Intelligence Foundation provides a **provider abstraction layer** for plugging in AI/analytics services without coupling the application to any specific vendor. RedlineD1 must never depend on a single AI platform.

All intelligence features are disabled by default via feature flags. The system fails safely — if every provider is offline, the core application continues working without interruption.

---

## Guiding Principles

1. **Provider-agnostic**: Application code calls `IntelligenceService`, never a vendor SDK directly.
2. **Fail-safe**: Every publish is fire-and-forget wrapped in try/catch. No production workflow is ever blocked.
3. **Feature-flag-gated**: All intelligence features default to `false`. Nothing activates without an explicit flag enable.
4. **No AI/LLM in this epic**: This foundation is infrastructure only. The mock provider returns deterministic fake responses. No real AI is wired up here.
5. **Replaceable**: Any provider can be swapped by changing the `INTELLIGENCE_PROVIDER` env var.

---

## Directory Layout

```
intelligence/
├── types/
│   └── index.ts              # IntelligenceProvider interface, IntelligenceEvent, etc.
├── provider/
│   └── factory.ts            # IntelligenceProviderFactory
├── mock/
│   └── MockIntelligenceProvider.ts
├── events/
│   ├── eventTypes.ts         # 17 canonical event type constants
│   └── EventPublisher.ts     # fire-and-forget publisher
├── summary/
│   └── DailySummary.ts       # deterministic daily summary builder
└── IntelligenceService.ts    # public façade — use this everywhere
```

---

## Provider Interface

```
IntelligenceProvider
  publishEvent(event)         → void (fire-and-forget)
  generateDailySummary(shopId, date) → DailySummaryData
  generateMorningBriefing(shopId)    → MorningBriefingData
  getRecommendations(shopId)         → Recommendation[]
  health()                           → HealthStatus
```

The factory selects a concrete implementation based on the `INTELLIGENCE_PROVIDER` environment variable:

| Value    | Implementation              |
|----------|-----------------------------|
| `mock`   | MockIntelligenceProvider    |
| `sapelee`| (future — not built yet)    |
| `openai` | (future — not built yet)    |
| `claude` | (future — not built yet)    |
| `gemini` | (future — not built yet)    |

Default: `mock`

---

## Event Flow

```
App code
  └─▶ IntelligenceService.publishEvent(eventType, payload)
        └─▶ EventPublisher.publish(event)          ← try/catch, never throws
              └─▶ provider.publishEvent(event)      ← no-op in mock mode
```

Events carry: `eventId`, `eventType`, `shopId`, `userId`, `timestamp`, `source`, `entityType`, `entityId`, `payload`, `metadata`.

The 17 registered event types are defined in `intelligence/events/eventTypes.ts`.

---

## Feature Flags

All flags default `false`. They are checked before any intelligence path executes.

| Flag Key                  | Purpose                              |
|---------------------------|--------------------------------------|
| `intelligence_foundation` | Master gate — enables event publishing |
| `command_center`          | Owner Command Center data API        |
| `daily_summary`           | Daily summary generation             |
| `morning_briefing`        | Morning briefing generation          |

---

## Non-Blocking Hook Pattern

Hooks added to existing workflows follow this pattern:

```typescript
// After the real work is done:
try {
  void IntelligenceService.publishEvent('InvoicePaid', { invoiceId, amount });
} catch {
  // never propagate — intelligence is non-critical
}
```

Hooks are added only to:
- Invoice Paid → `InvoicePaid`
- Estimate Approved → `EstimateApproved`
- Job Card Created → `JobCardCreated`
- RO Completed → `RepairOrderCompleted`

---

## Security Constraints

- VIN data must not appear in shared or network-visible payloads
- Customer PII (name, phone, email, address) must not appear in event payloads
- Invoice amounts and payment data must not appear in graph/network mappings
- `share_to_network` must remain `false`
- No secrets in source code
