# Memory Extraction Rules (SI-9)

All rules are deterministic pure functions in `intelligence/memory/MemoryRules.ts`.
No AI. No external calls. Inputs from Supabase queries only.

## Rule 1 — Customer Last Visit
**Source**: `job_cards` table, most recent `completed_at` for customer  
**Output**: `customer_memory` item  
**Importance**: `high` if >365 days, `medium` if >180 days, `low` otherwise

## Rule 2 — Customer Average Spend
**Source**: `invoices` table, paid invoices for customer  
**Output**: `customer_memory` item  
**Importance**: `high` if avg ≥$500, `medium` if ≥$200, `low` otherwise

## Rule 3 — Customer Unpaid Balance
**Source**: `invoices` table, unpaid invoices for customer  
**Output**: `invoice_memory` item  
**Importance**: `critical` if ≥$500, `high` if ≥$200, `medium` otherwise

## Rule 4 — Declined Work
**Source**: `estimates` table, status='declined' for customer  
**Output**: one `declined_work_memory` item per declined estimate  
**Importance**: `high` if estimate ≥$500, `medium` otherwise

## Rule 5 — Vehicle Repeat Concern
**Source**: `repair_cases` table, grouped by `concern_category` for vehicle  
**Output**: one `vehicle_memory` item per category with count ≥2  
**Importance**: `high` if count ≥4, `medium` otherwise

## Rule 6 — Vehicle Repair History
**Source**: `job_cards` + `repair_cases` count for vehicle  
**Output**: `vehicle_memory` summary item  
**Importance**: `high` if ≥5 jobs, `medium` otherwise

## Rule 7 — Comeback Risk
**Source**: `repair_orders` with `is_warranty=true` for vehicle  
**Output**: `comeback_memory` item  
**Importance**: `critical` if ≥2 comebacks, `high` if 1

## Rule 8 — Technician Strengths
**Source**: `repair_cases` with `status=resolved` grouped by category per technician  
**Output**: one `technician_memory` item per category with ≥3 verified repairs  
**Importance**: `high` if ≥10, `medium` otherwise

## Rule 9 — Parts Pattern
**Source**: `parts_order_items` grouped by part  
**Output**: one `parts_memory` item per part used ≥3 times  
**Importance**: `high` if ≥10 uses, `medium` otherwise

## Rule 10 — Missing Repair Intelligence
**Source**: `job_cards` with status='complete' and no `repair_case_id` (last 30 days)  
**Output**: one `repair_memory` item per job  
**Importance**: `medium`

## Rule 11 — Revenue Opportunity
**Source**: stale `estimates` (>14d), uninvoiced completed jobs, overdue invoices  
**Output**: single `revenue_memory` item for shop  
**Importance**: `critical` if total ≥$1000, `high` if ≥$500, `medium` otherwise

## Rule 12 — Shop Pattern
**Source**: `repair_cases` grouped by `concern_category` across vehicles (last 90 days)  
**Output**: one `shop_pattern_memory` item per category across ≥2 vehicles  
**Importance**: `high` if ≥5 vehicles, `medium` otherwise
