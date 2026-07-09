# Sapelee Privacy Rules (SI-8)

RedlineD1 applies strict PII rules before any data leaves the system.

## What is NEVER sent to Sapelee

| Category | Fields |
|----------|--------|
| Contact | phone, phone_number, mobile, cell, email, email_address |
| Location | address, street, city, zip, postal_code, state, country |
| Vehicle | vin, vehicle_vin, vin_number, license_plate |
| Financial | payment, card, credit_card, bank, account_number, invoice_amount, payment_amount, total_amount, balance_due |
| Identity | ssn, tax_id, customer_name, first_name, last_name, full_name |
| Internal | notes, private_notes, technician_notes, internal_notes |

## How PII is removed

The `redactPII(obj)` function in `SapeleePayloadBuilder.ts` recursively traverses every object and array.
Any key matching the PII field blocklist is silently dropped before the payload is serialized.

## Entity ID hashing

Real database UUIDs are never sent. Instead, a one-way hash is applied:

```
entityIdHash = "h_" + abs(djb2-variant(uuid)).toString(36)
```

This is non-reversible: Sapelee cannot reconstruct the original UUID or join it to any external dataset.

## What IS sent

Only aggregated counts and shop-level scores:

- Total counts (number of unpaid invoices, number of open jobs, etc.)
- Score values (shop health score, executive score, decision scores)
- Non-identifying labels (recommendation keys, risk category labels)
- Anonymized technician metrics (active count, idle count — no names)

## Per-job and per-invoice amounts

Revenue opportunities include total amounts at the category level (e.g., total unpaid = $X),
but **per-invoice amounts are excluded** from `revenueOpportunities` and **per-job estimated revenue is excluded** from `todayPriorities`.
This prevents Sapelee from reconstructing individual transaction values.

## Enforcement point

`SapeleePayloadBuilder.ts` is the single enforcement point. All Sapelee payloads must be constructed
through this module — never from raw application objects.
