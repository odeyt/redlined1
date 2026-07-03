# RedlineD1 — Repair Intelligence Privacy Rules
## Data Governance for the Automotive Knowledge Graph

---

## Purpose

The Automotive Knowledge Graph learns from real repair cases performed on real vehicles for real customers. This document defines the rules that govern what data enters the graph, how it is stored, and under what conditions it may be shared beyond the originating shop.

These rules protect customer privacy, shop competitive intelligence, and technician identity while still allowing the network to build shared automotive knowledge.

---

## Rule 1 — Customer Identity Never Enters the Graph

Customer names, display names, phone numbers, email addresses, and physical addresses **must never** become graph nodes or be stored in graph metadata.

The graph is about vehicles, failures, and repairs — not people.

✅ Allowed: vehicle make, model, year, engine, mileage range  
✅ Allowed: DTC codes, symptoms, tests, parts, repair procedures  
✅ Allowed: anonymized customer segment (fleet, individual, dealer)  
❌ Not allowed: customer name  
❌ Not allowed: customer phone or email  
❌ Not allowed: customer address or location below country/region level  

---

## Rule 2 — VIN Is Shop-Private

Vehicle Identification Numbers (VINs) are shop-specific and must not be shared globally.

VINs can be used to normalize make/model/year/engine within a shop's private graph. The decoded information (make, model, year) may be shared globally, but the VIN itself must not.

✅ Allowed in shop-private graph: VIN as source reference  
✅ Allowed globally: decoded make/model/year/engine from VIN  
❌ Not allowed globally: raw VIN string  

---

## Rule 3 — Technician Identity Is Shop-Private

Technician nodes (`node_type = 'technician'`) are shop-private and must never be included in global graph data.

Technician performance data (fix rates, comeback rates) may be aggregated and shared at the shop level for internal coaching purposes, but technician names must not appear in any global node or edge.

✅ Allowed: technician coaching data within own shop  
✅ Allowed: aggregated technician performance metrics (anonymous) internally  
❌ Not allowed globally: technician names or IDs  
❌ Not allowed globally: per-technician fix rates or diagnostic patterns  

---

## Rule 4 — Cost and Pricing Data Is Not Shared

Parts cost, labor rate, invoice totals, discount amounts, and any financial data must not enter the global graph unless the shop explicitly consents to aggregated market pricing participation (a future feature).

✅ Allowed in shop-private graph: cost data for internal analysis  
❌ Not allowed globally: any pricing, cost, or revenue data without explicit opt-in  

---

## Rule 5 — Global Rows Require Dual Flags

Any row in any graph table that is intended to be readable by other shops must have both:
- `is_global = true`
- `is_anonymized = true`

Both flags must be set. A row with `is_global = true` and `is_anonymized = false` must be treated as a configuration error and must not be served to other shops.

---

## Rule 6 — Network Sharing Is Opt-In

No shop's repair data will be contributed to the global graph unless the shop has explicitly opted in. The default state for all data is shop-private (`is_global = false`).

When a shop opts in, only the following fields may be contributed:
- Vehicle make, model, year, platform, engine, transmission, fuel type
- DTC codes
- Symptom descriptions (normalized and reviewed)
- Repair procedures (normalized)
- Test names
- Part categories (not specific part numbers or supplier names)
- Outcome (resolved/comeback — no financial data)

---

## Rule 7 — Anonymization Before Global Use

Before any record is marked `is_global = true`, it must pass an anonymization check:

1. No customer identifiers present in any field
2. No VIN in any field
3. No technician name in any field
4. No shop name in any field
5. No pricing or financial data in any field
6. No geographic data below country/region level

A future anonymization service will enforce this programmatically. Until then, no data should be marked `is_global = true`.

---

## Rule 8 — Shop Graph Data Is Completely Private

Each shop's private graph data (rows where `shop_id` matches the shop and `is_global = false`) is:

- Not readable by any other shop
- Not accessible via any API endpoint that does not authenticate as that shop
- Not included in any aggregated report visible to other shops
- Protected by Row-Level Security at the database level

---

## Rule 9 — Lessons Are Private by Default

Structured lessons (`automotive_graph_lessons`) contain technician insights, diagnostic mistakes, and shop-specific knowledge. These are shop-private and must not be shared globally without explicit review and anonymization.

In the future, a "publish lesson to network" feature may allow curated lessons to be shared after scrubbing all identifying information.

---

## Rule 10 — Audit Trail

All graph writes should record `created_by` (the authenticated user's UUID). This enables audit trails showing who created or modified graph data. This field is for internal compliance only and is never exposed globally.

---

## Compliance Summary Table

| Data Type | Shop Private | Global Allowed | Requires Opt-In |
|-----------|-------------|----------------|-----------------|
| Customer name | ✅ | ❌ | N/A |
| Customer contact | ✅ | ❌ | N/A |
| VIN | ✅ | ❌ | N/A |
| Make/Model/Year | ✅ | ✅ | No (anonymized) |
| Engine/Transmission | ✅ | ✅ | No (anonymized) |
| DTC codes | ✅ | ✅ | No (anonymized) |
| Symptoms (normalized) | ✅ | ✅ | Shop opt-in |
| Repair procedures | ✅ | ✅ | Shop opt-in |
| Technician name | ✅ | ❌ | N/A |
| Technician performance | ✅ | ❌ | N/A |
| Parts (specific P/N) | ✅ | ❌ | N/A |
| Parts (category) | ✅ | ✅ | Shop opt-in |
| Pricing/cost data | ✅ | ❌ | N/A |
| Lessons learned | ✅ | ❌ | Future: curated opt-in |
| Outcome (resolved/comeback) | ✅ | ✅ | Shop opt-in |

---

*Document version: Sprint 4 | Created: 2026-07-03 | Status: Policy — Pending Legal Review*
