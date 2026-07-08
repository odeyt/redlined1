# Intelligence Bus

## What It Does

The Intelligence Bus receives operational events fired by the app, stores them in `intelligence_events`, and queues them for processing by the Recommendation Engine.

Every event is already published by `EventPublisher` (SI-1). The Bus adds persistence: on the server side, each `publish()` call also inserts a row into `intelligence_events` via `IntelligenceBus.recordEvent()`.

## Key Behaviors

- **Never blocks production**: every DB call is fire-and-forget inside a try/catch
- **Duplicate-safe**: `event_id` has a UNIQUE constraint; duplicates are silently ignored
- **Failure-safe**: if the DB is unavailable, events are dropped — never crash the caller
- **Gated**: no-op on the client side (browser events don't hit the DB directly)

## Functions

| Function | Description |
|---|---|
| `recordEvent(event)` | Insert into `intelligence_events`. Returns false on failure. |
| `processEvent(eventId)` | Mark event as processed. |
| `processPendingEvents(shopId)` | Process all `received` events for a shop. |
| `getRecentEvents(shopId)` | Last 100 events for a shop. |
| `markEventProcessed(eventId)` | Update status to `processed` or `failed`. |
| `getBusHealth(shopId)` | Reachability + queue stats. |

## Event Status Lifecycle

```
received → processing → processed
                      → failed
```

## Feature Flag

`intelligence_bus` — default OFF. When OFF, the DB insert still attempts (the bus is always "on") but the recommendation engine does not run automatically.

## Table: intelligence_events

See migration: `supabase/migrations/migration_intelligence_bus.sql`
