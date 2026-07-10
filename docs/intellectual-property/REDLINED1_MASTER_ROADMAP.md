# RedlineD1 Master Roadmap

This document is the canonical record of every epic — completed, in progress, and planned.
It is the single source of truth for product scope and strategic sequencing.

---

## PHASE 1 — Commercial Platform Foundation

### ✅ Epic C-1: Core Shop Management
Job cards, vehicles, customers, estimates, invoices, repair orders, payments, technicians, parts, inventory.
The operational backbone. Every module fully functional before intelligence layering begins.

### ✅ Epic C-2: Multi-Shop & Mirror Architecture
`shop_mirrors` table. `getShopIds()` / `getShopId()` pattern. Location 1 and Location 2 fully supported.

### ✅ Epic C-3: Commercial SaaS Infrastructure
Billing foundation (Stripe/Creem), subscription enforcement disabled by default (`NEXT_PUBLIC_BILLING_ENABLED=false`), plan tiers scaffolded. Feature flags for gating.

### ✅ Epic C-4: Observability & Reliability
Full telemetry, flag-event logging, smoke test suite, disaster recovery docs, rollback procedures.

---

## PHASE 2 — Intelligence Platform

### ✅ Epic SI-1: Intelligence Foundation
`intelligence_*` tables, feature flag system, provider abstraction layer (`IntelligenceProvider` interface), `IntelligenceBus`, fire-and-forget publish pattern.

### ✅ Epic SI-2: Recommendation Engine
Deterministic recommendations from shop data. Ranked by urgency. Displayed in Command Center.

### ✅ Epic SI-3: Executive Decision Engine
Action queue scoring, executive score breakdown, priority ranking, ROI estimation.

### ✅ Epic SI-4: Evidence Engine
Transparent reasoning chains. Every recommendation cites its source data and confidence score.

### ✅ Epic SI-5: Command Center
Owner/manager dashboard. Live signals, action queue, executive score, morning brief integration, business memory section.

### ✅ Epic SI-6: Action Intelligence
Ranked action queue with decision scoring and executive advice layer.

### ✅ Epic SI-7: Morning Brief Engine
Daily shop intelligence summary. Deterministic. Cached per shop. Displayed in Command Center modal.

### ✅ Epic SI-8: Sapelee Connector (Provider Abstraction)
External intelligence provider interface. PII redaction layer. Fire-and-forget enhancement pattern. Mock fallback. RedlineD1 never depends on one AI vendor.

### ✅ Epic SI-9: Business Memory Engine
12 extraction rules. `business_memory_items`, `business_memory_links`, `business_memory_snapshots` tables. 7 event hooks. Entity memory panels (not yet mounted). Command Center section.

### ✅ Epic SI-10: Vehicle Intelligence Engine
Per-vehicle intelligence profiles. 10 deterministic rules. Health score (0–100). Risk signals. Recommended checks. Repair lessons. Vehicle drawer panel. Command Center alert. 4 feature flags. CLI backfill script.

---

## PHASE 3 — Deep Intelligence (Planned)

### 🔲 Epic SI-11: Customer Intelligence Engine
Per-customer intelligence profile. Lifetime value scoring. Retention risk signals. Visit patterns. Declined work history. Communication preference patterns. Customer health score.

### 🔲 Epic SI-12: Technician Intelligence Engine
Per-technician performance profile. Repair category strengths. Comeback rate. Time-to-complete benchmarks. Training recommendations. Productivity trends.

### 🔲 Epic SI-13: Parts Intelligence Engine
Parts usage patterns. Failure rate by part/vehicle combination. Supplier reliability scoring. Reorder prediction. Warranty tracking.

### 🔲 Epic SI-14: Knowledge Graph (Queryable)
Fully queryable graph layer over all intelligence data. Relationship traversal. Graph-based recommendations. The foundation for autonomous reasoning.

### 🔲 Epic SI-15: Executive Advisor
Natural language owner briefing. "What should I focus on today?" answered with ranked, evidence-backed priorities. Fully deterministic core with optional provider enhancement.

### 🔲 Epic SI-16: Autonomous Shop Assistant
Background task execution with human approval gates. Drafts estimates, flags overdue invoices, surfaces comeback risks. Never acts without confirmation.

---

## PHASE 4 — Platform Expansion (Planned)

### 🔲 Epic P-1: Public API Platform
RESTful + webhook API. Rate limiting. API key management. Developer documentation.

### 🔲 Epic P-2: SDK
TypeScript SDK for third-party integrations. Partner certification program.

### 🔲 Epic P-3: Mobile Apps
iOS and Android. Technician-first workflows. Job card updates, photo capture, DTC scanning.

### 🔲 Epic P-4: OEM Integrations
OEM repair data, labor guides, TSBs, recall data. Provider-abstracted.

### 🔲 Epic P-5: Voice AI
In-bay voice commands for technicians. Hands-free job card updates, DTC lookup, part requests.

### 🔲 Epic P-6: Marketplace
Third-party extensions. Supplier integrations. Partner apps. Revenue share model.

---

## PHASE 5 — Global Expansion (Planned)

### 🔲 Epic G-1: Localization Engine
Full i18n. Language packs: EN, Lao, TH, ZH, VI, ID. Currency and tax configuration per region.

### 🔲 Epic G-2: Regional Compliance
VAT, GST, local tax filing formats. Receipt and invoice localization. Regulatory reporting.

### 🔲 Epic G-3: Enterprise & Chain Management
Multi-location enterprise accounts. Cross-location reporting. Centralized intelligence.

---

## Architectural Constraints (Permanent)

These constraints apply to every epic, forever:

- All intelligence features are additive — no existing workflow modified
- All new flags default OFF
- No AI embeddings, no OpenAI/Claude direct calls in production code
- Provider abstraction required for all external AI
- PII never leaves the system without explicit redaction
- VIN remains shop-private
- Billing disabled by default
- Fire-and-forget for all background intelligence
- Every feature behind a feature flag
- No migration may drop or alter existing production tables
