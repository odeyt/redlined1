# Memory Privacy Rules (SI-9)

Business Memory stores **patterns and counts only** — never raw PII.

## What is NEVER stored in memory

| Category | Fields |
|----------|--------|
| Contact | phone, email, address |
| Vehicle | VIN (memory references vehicle IDs only — VIN stays in vehicles table) |
| Financial | Individual invoice amounts (counts and totals only in summary memory) |
| Identity | Customer full name (memory references customer IDs only) |
| Private | Technician notes, internal notes |

## What IS stored

- Counts: "3 unpaid invoices", "2 repeat concerns"
- Aggregates: total outstanding (sum, not per-invoice)
- Labels: category names, recommendation keys
- Dates: days since last visit (relative, not absolute per customer)
- Scores: decision scores, confidence values

## Database access

- `business_memory_items`: RLS enforces shop scope
  - Owner/manager: full read on their shop
  - Technician: can read vehicle/job/repair memory only
  - No cross-shop access
- `business_memory_links`: owner/manager read only
- `business_memory_snapshots`: owner/manager read only
- Service role: full access for background extraction only

## Memory content rules

When writing memory `title` and `summary` fields:
- Use entity IDs to reference records, not names
- Use counts and categories, not individual transaction details
- Use day counts, not full datetime strings visible to users

## Future Sapelee integration

If Sapelee enhancement is later enabled for memory, only `MemorySummary` shapes
(counts, scores, types) may be sent — same PII rules as `SapeleePayloadBuilder`.
Individual memory titles containing customer/vehicle specifics must be excluded
from any external payload.
