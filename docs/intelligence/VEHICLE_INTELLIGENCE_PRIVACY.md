# Vehicle Intelligence Privacy (SI-10)

## What is stored

Vehicle intelligence tables store only operational repair data:
- Vehicle ID (internal UUID — not VIN)
- Shop ID
- Counts: visits, repairs, comebacks, unpaid invoices
- Aggregated patterns: concern categories, DTC codes, part names
- Revenue totals (not per-invoice breakdowns)
- Signal titles and descriptions (no customer names)

## What is NOT stored

- Customer name, phone, email, address
- VIN (stored only in the `vehicles` table; not copied to intelligence tables)
- Invoice line items or payment method
- Individual invoice amounts (only aggregate totals)
- Technician names (only technician IDs, used for familiarity scoring)

## Data isolation

- All rows include `shop_id` — no cross-shop data
- RLS policies enforce shop membership — staff can only read their own shop's intelligence
- `service_role` key used only for background extraction (server-side only)

## Sharing

Vehicle intelligence data is **never** shared to the network or any external system. `share_to_network` remains `false` for all intelligence entities.

## VIN policy

VIN remains stored only in the `vehicles` table under existing access controls. It is not extracted into any intelligence profile or event log.
