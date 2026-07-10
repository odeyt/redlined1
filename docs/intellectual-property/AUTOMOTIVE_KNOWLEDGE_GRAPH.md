# Automotive Knowledge Graph

## What It Is

The RedlineD1 Knowledge Graph is a proprietary, compounding network of relationships between every entity that exists in an automotive business.

It is not a relational database.
It is not a reporting layer.
It is the permanent, growing memory of every shop that uses RedlineD1 —
and the foundation of every intelligent feature the platform will ever build.

---

## Nodes

Every entity in the system is a node in the graph.

| Node | Description |
|------|-------------|
| **Vehicle** | The physical asset. Year, make, model, VIN, history, health score. |
| **Customer** | The relationship owner. Lifetime value, retention risk, visit cadence. |
| **Technician** | The skilled operator. Repair history, strengths, comeback rate, certifications. |
| **Job Card** | The operational record. Status, assigned tech, linked vehicle and customer. |
| **Repair** | The completed work. What was done, by whom, with what parts, on what date. |
| **Repair Case** | The intelligence record. Complaint → DTC → diagnosis → resolution → outcome. |
| **Complaint** | The presenting symptom. Customer-reported or technician-observed. |
| **Inspection** | The vehicle condition snapshot at intake. |
| **Estimate** | The proposed work. Approved, declined, or pending. |
| **Invoice** | The billed work. Paid, unpaid, written off. |
| **Payment** | The financial transaction. Amount, method, date, gateway. |
| **Part** | The component. OEM or aftermarket, supplier, cost, failure rate. |
| **Inventory** | The stock level. Reorder thresholds, supplier lead time, usage rate. |
| **Supplier** | The parts source. Reliability, pricing, lead times. |
| **DTC** | The fault code. Code, description, vehicle context, resolution history. |
| **Symptom** | The pattern. Customer language mapped to technical categories. |
| **Recommendation** | The system suggestion. Evidence-backed, confidence-scored, outcome-tracked. |
| **Business Memory** | The shop-level learned fact. Customer pattern, revenue opportunity, risk signal. |
| **Signal** | The real-time alert. Overdue invoice, comeback risk, stale estimate, low inventory. |

---

## Edges

Edges define relationships between nodes. They carry weight, direction, and confidence.

| Edge | Meaning |
|------|---------|
| Vehicle **HAS** Complaint | This vehicle has presented with this complaint |
| Complaint **GENERATED** DTC | This complaint produced these fault codes |
| DTC **HAS** Resolution | This fault code was resolved by this repair action |
| Repair **FIXED** Complaint | This repair resolved this complaint |
| Technician **COMPLETED** Repair | This technician performed and closed this repair |
| Technician **SPECIALIZES_IN** Category | This technician has verified success in this repair category |
| Repair **USED** Part | This repair consumed this part |
| Part **FAILS_ON** Vehicle | This part has a known failure pattern on this vehicle type |
| Customer **APPROVED** Estimate | This customer accepted this proposed work |
| Customer **DECLINED** Work | This customer rejected this recommended repair |
| Customer **OWNS** Vehicle | This customer is the registered owner of this vehicle |
| Invoice **BILLED** Repair | This invoice represents this completed work |
| BusinessMemory **CREATED** Recommendation | This learned pattern produced this recommendation |
| Recommendation **GENERATED** Revenue | This recommendation was approved and invoiced |
| Repair **CREATED** Knowledge | This completed repair added to the system's knowledge base |
| Supplier **PROVIDED** Part | This supplier was the source for this part on this repair |
| Signal **TRIGGERED** Action | This signal produced an action queue item |

---

## Why This Is RedlineD1's Competitive Moat

**It compounds.**

Every repair adds an edge. Every approval adds weight to a recommendation. Every comeback updates the confidence score of a diagnostic pattern. Every declined estimate becomes a signal for the next advisor interaction.

A shop that has used RedlineD1 for three years has three years of connected knowledge that no competitor can recreate by switching platforms.

**It improves recommendations automatically.**

When the graph shows that a specific DTC on a specific vehicle make/model is resolved by a specific repair 94% of the time, that pattern surfaces automatically in the diagnostic engine — with evidence.

No human had to program that rule. No AI model had to be fine-tuned. The graph derived it from completed repairs.

**It cannot be replicated from a standing start.**

A new competitor can copy the UI. They can copy the pricing. They cannot copy three years of connected repair outcomes, part failure patterns, customer behavior signals, and technician performance data.

The graph is what makes RedlineD1 irreplaceable.

---

## Current State (2026)

The graph exists in distributed form across existing tables:
- `repair_cases` — complaint → DTC → resolution relationships
- `business_memory_items` — learned shop patterns (SI-9)
- `vehicle_intelligence_profiles` — per-vehicle knowledge (SI-10)
- `intelligence_recommendations` — outcome-tracked suggestions

**Next milestone:** SI-14 — a unified, queryable graph layer that traverses these relationships with a single API.

---

## Privacy Constraints

The graph operates under strict PII rules:

- Customer names, phones, emails, addresses are **never** part of graph edges
- Only entity IDs traverse the graph
- VIN remains shop-private and is **never** included in cross-shop graph data
- Invoice amounts and payment data are **never** exposed in graph queries
- `share_to_network` defaults to `false` for all graph entities
