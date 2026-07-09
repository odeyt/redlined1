# Business Memory Engine (SI-9)

RedlineD1 remembers operational patterns about customers, vehicles, repairs, revenue, and technicians.
**Deterministic only. No AI. No embeddings. No external calls.**

## What it remembers

| Memory Type | What it captures |
|------------|-----------------|
| `customer_memory` | Last visit date, average spend |
| `invoice_memory` | Unpaid/overdue balances |
| `declined_work_memory` | Estimates customer declined |
| `vehicle_memory` | Repair history, repeat concerns |
| `comeback_memory` | Warranty returns and comebacks |
| `technician_memory` | Category strengths from resolved cases |
| `parts_memory` | Frequently used parts patterns |
| `repair_memory` | Jobs missing repair intelligence |
| `revenue_memory` | Stale estimates, uninvoiced jobs, overdue invoices |
| `shop_pattern_memory` | Concerns repeated across multiple vehicles |

## Architecture

```
Event (invoice paid / estimate declined / job complete)
        │
  MemoryEventHooks (fire-and-forget, flag-gated)
        │
  BusinessMemoryEngine (deterministic extraction)
        │
  MemoryRules (12 individual rules, pure functions)
        │
  business_memory_items table (Supabase, RLS)
        │
  /api/intelligence/memory (REST API, auth-gated)
        │
  CommandCenterView + EntityMemoryPanel (UI, flag-gated)
```

## Files

| File | Purpose |
|------|---------|
| `intelligence/memory/types.ts` | All type definitions |
| `intelligence/memory/MemoryRules.ts` | 12 deterministic extraction rules |
| `intelligence/memory/BusinessMemoryEngine.ts` | Extraction, upsert, query, snapshot |
| `intelligence/memory/MemoryEventHooks.ts` | Fire-and-forget event hooks |
| `services/businessMemoryService.ts` | Client-facing service |
| `features/memory/EntityMemoryPanel.tsx` | Customer/vehicle/repair panels |
| `app/api/intelligence/memory/route.ts` | GET + POST |
| `app/api/intelligence/memory/[id]/route.ts` | GET + PATCH by ID |
| `scripts/rebuild-business-memory.ts` | Backfill CLI |
| `supabase/migrations/migration_business_memory_engine.sql` | Tables + flags |

## Feature Flags

All default `false`.

| Flag | Effect |
|------|--------|
| `business_memory_engine` | Enable memory extraction and API |
| `business_memory_command_center` | Show Business Memory section in Command Center |
| `entity_memory_panels` | Show memory panels on detail pages |

## Safety

- Memory extraction never blocks any workflow.
- All hooks are fire-and-forget, wrapped in try/catch.
- If the migration hasn't been run, APIs return `{ disabled: true, migrationRequired: true }`.
- Memory is additive — disabling any flag leaves production unchanged.
