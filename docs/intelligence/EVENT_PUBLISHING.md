# Event Publishing Guide

## How to Publish Events

Always use `IntelligenceService.publishEvent()`. Never call `EventPublisher` directly from feature code.

```typescript
import { publishEvent } from '@/intelligence/IntelligenceService';

// After the real work is done — never before, never blocking:
try {
  publishEvent('InvoicePaid', shopId, userId, 'invoice', invoiceId);
} catch { /* never propagate */ }
```

Or using a dynamic import to avoid bundling intelligence into every module:

```typescript
try {
  const { publishEvent } = await import('@/intelligence/IntelligenceService');
  publishEvent('JobCardCreated', getShopId(), '', 'job_card', id);
} catch { /* intelligence must never affect production */ }
```

## Rules

1. **Always after the real work**: publish the event only after the DB write succeeds.
2. **Never block**: do not `await` the publish result in production code. Use `void` or dynamic import.
3. **Always in try/catch**: the catch block must be empty or log-only — never rethrow.
4. **No PII in payload**: omit customer names, phone numbers, emails, addresses, VINs, invoice amounts.

## Adding a New Hook

1. Find the service function that does the real work.
2. After `if (error) throw error;`, add the fire-and-forget block above.
3. Use the appropriate `EventType` from `intelligence/events/eventTypes.ts`.
4. Add the event to the "Hook Status: Active" column in `EVENT_CATALOG.md`.
