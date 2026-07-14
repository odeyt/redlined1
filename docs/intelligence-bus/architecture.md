# Redline Intelligence Bus — Architecture

## Overview

The Redline Intelligence Bus (RIB) is the central nervous system of RedlineD1. Every AI module communicates through events rather than direct function calls, keeping all modules independently testable and deployable.

```
Vehicle
  │
  ▼
Scan Tool / J2534 Bridge
  │
  ▼
Diagnostic Session
  │  publishes ──────────────────────────────────────────────────┐
  ▼                                                              │
RibEventBus                                                      │
  ├── middleware pipeline                                        │
  │     1. correlationMiddleware  (stamps correlationId)         │
  │     2. validationMiddleware   (Zod schema check)             │
  │     3. loggingMiddleware      (structured log + timing)      │
  ▼                                                              │
RibEventDispatcher (fan-out, Promise.allSettled)                 │
  │                                                              │
  ├── Diagnostic Orchestrator ◄──────────────────────────────────┘
  ├── AI Copilot
  ├── Fleet Intelligence
  ├── Predictive Failure
  ├── Vehicle Health Score
  ├── Technician Intelligence
  ├── Revenue Intelligence
  ├── Parts Intelligence (future)
  ├── Customer Intelligence (future)
  ├── Notification Engine (future)
  ├── Reporting Engine (future)
  └── Analytics Engine (future)
```

## AI Orchestration Flow

No AI provider calls another provider directly. Each step publishes an event, and the next step subscribes to it.

```
diagnostic.reasoning.requested
  │
  ▼
OpenAI Handler
  │ publishes
  ▼
diagnostic.reasoning.completed
  │
  ▼
Claude Review Handler
  │ publishes
  ▼
diagnostic.claude_review.completed
  │
  ▼
Diagnostic Orchestrator
  │ publishes
  ▼
diagnostic.hypothesis.updated
```

## Key Design Principles

**Decoupled**: Modules never import each other. They only import from `lib/intelligence-bus`.

**Isolated**: Handler errors are caught per-handler. One bad handler never prevents others from receiving an event.

**Auditable**: Every event is written to `rib_events` (append-only) before handlers process it. The audit trail is immutable.

**Replayable**: Any window of events can be replayed via `POST /api/rib/replay`. New engines can be backfilled with historical data without re-running the original workflows.

**Future-ready**: V1 is in-process synchronous. The dispatcher interface is the only thing that changes when migrating to Trigger.dev, Inngest, or AWS Lambda — all publish/subscribe call sites remain unchanged.

## File Structure

```
lib/intelligence-bus/
├── event-types.ts          All 31 typed event interfaces + RibEvent union
├── schemas.ts              Zod v4 schemas for every event type
├── bus.ts                  RibEventBus class + intelligenceBus singleton
├── publisher.ts            publish() helper + createPublisher() factory
├── subscriber.ts           RibHandler, RibSubscription, RibSubscriberInfo types
├── event-dispatcher.ts     RibEventDispatcher — fan-out with error isolation
├── index.ts                Public API surface (import from here only)
├── middleware/
│   ├── index.ts            Default pipeline: correlation → validation → logging
│   ├── correlation.ts      Stamps correlationId on events that lack one
│   ├── validation.ts       Zod validation — throws RibValidationError on failure
│   └── logging.ts          Structured event log with timing
├── handlers/
│   ├── index.ts            initializeRibHandlers() — registers all enabled handlers
│   ├── diagnostic-orchestrator.handler.ts
│   ├── ai-copilot.handler.ts
│   ├── fleet-intelligence.handler.ts
│   ├── predictive-failure.handler.ts
│   ├── vehicle-health.handler.ts
│   ├── technician-intelligence.handler.ts
│   └── revenue-intelligence.handler.ts
└── __tests__/
    ├── bus.test.ts
    ├── event-types.test.ts
    └── middleware.test.ts
```

## Feature Flag

The entire bus is gated by the `intelligence_bus` feature flag (defaults OFF).

Individual handlers are also gated by their module flags:
- `diagnostic_orchestrator_enabled`
- `fleet_intelligence_enabled`
- `predictive_failure_enabled`
- `vehicle_health_score_enabled`
- `technician_performance_enabled`
- `revenue_intelligence_enabled`

## Database

`rib_events` — append-only event log (PostgreSQL).
- INSERT only. UPDATE and DELETE are blocked by DB rules.
- RLS: shop members can only read their own shop's events.
- Indexed by: shop_id, event_type, vehicle_id, diagnostic_session_id, correlation_id, timestamp.

## API Routes

| Route | Method | Purpose |
|---|---|---|
| `/api/rib/publish` | POST | Publish a typed event (internal use) |
| `/api/rib/replay` | POST | Replay historical events (owner only) |

## Adding a New Handler

1. Create `lib/intelligence-bus/handlers/my-module.handler.ts`
2. Export `registerMyModuleHandler(bus: RibEventBus): RibSubscription`
3. Add the feature flag to `KnownFlagKey` in `lib/featureFlags/types.ts`
4. Import and register in `lib/intelligence-bus/handlers/index.ts`
5. Add a DB migration seed for the new flag

No other files need to change.

## Migration to Background Workers (Future)

To move to Trigger.dev or Inngest:

1. Replace `RibEventDispatcher.dispatch()` with a queue publish
2. Create worker files that import individual handlers
3. Worker files call `handler(event)` when the queue delivers the event

The `publish()` call sites and all handlers remain unchanged.
