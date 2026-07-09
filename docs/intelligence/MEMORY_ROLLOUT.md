# Business Memory Rollout Plan (SI-9)

All flags default `false`. Enable incrementally — each phase is independently rollback-safe.

## Prerequisites

- [ ] Run `migration_business_memory_engine.sql` in Supabase SQL Editor
- [ ] Verify 3 feature flags inserted with `enabled=false`
- [ ] Confirm `business_memory_items`, `business_memory_links`, `business_memory_snapshots` tables exist

## Phase 1 — Initial Backfill (dry run)
No flags needed. Run the script in dry-run mode first:
```bash
npm run memory:rebuild -- --shop-id=<your-shop-uuid> --dry-run
```
Verify output shows expected counts without writing data.

## Phase 2 — Enable Memory Engine
```sql
UPDATE feature_flags SET enabled = true WHERE flag_key = 'business_memory_engine';
```
Run the backfill for real:
```bash
npm run memory:rebuild -- --shop-id=<your-shop-uuid>
```
Check `business_memory_items` table in Supabase — should have rows.

## Phase 3 — Enable Command Center Section
```sql
UPDATE feature_flags SET enabled = true WHERE flag_key = 'business_memory_command_center';
```
Open Command Center → Business Memory section appears with critical/high items.

## Phase 4 — Enable Entity Panels
```sql
UPDATE feature_flags SET enabled = true WHERE flag_key = 'entity_memory_panels';
```
Open a customer or vehicle detail page → memory panel appears.
**Note**: EntityMemoryPanel components are created but not yet mounted in detail pages.
Mount `<CustomerMemoryPanel>`, `<VehicleMemoryPanel>`, `<RepairCaseMemoryPanel>` when ready.

## Rollback

Any phase: set flag to `false`. No code deployment required.
```sql
UPDATE feature_flags SET enabled = false WHERE flag_key = 'business_memory_engine';
```

## Ongoing

Event hooks automatically refresh memory after:
- Invoice paid
- Estimate declined or approved
- Job card created
- Repair order completed
- Repair case created
- Payment recorded

These hooks are flag-gated — they only run when `business_memory_engine` is `true`.

## Future Enhancements (not built yet)

- **AI agent usage**: Pass `MemorySummary` as context to future AI workflows
- **Sapelee integration**: Send anonymized memory summaries as context for executive advice
- **Scheduled rebuild**: Daily cron job to refresh memory across all shops
- **Memory decay**: Reduce confidence of items not seen in >60 days
- **Cross-entity linking**: Link vehicle memory to customer memory automatically
