# Intelligence Rollout Plan

## Epic SI-1 — Intelligence Foundation (DONE)
Provider abstraction, mock provider, event publisher, IntelligenceService, feature flags.

## Epic SI-2 — Intelligence Bus + Recommendation Engine (DONE)
DB tables, bus persistence, signal extractor, 10 deterministic rules, recommendation API.

## Epic SI-3 — Command Center UI (NEXT)
Owner dashboard panel displaying open recommendations, health score, revenue signals.
Flag: `command_center`
No AI. Reads from SI-2 API routes.

## Epic SI-4 — Real Data Enrichment
Populate DailySummary from live DB (invoices, ROs, estimates, inventory).
Add inactive customer signal (customer table query).
Add revenue opportunity sum from estimates.
Flag: `daily_summary`

## Epic SI-5 — Sapelee Provider
Implement `SapeleeIntelligenceProvider`.
Wire via `INTELLIGENCE_PROVIDER=sapelee`.
Mock remains default. Sapelee is additive — never required.
Flag: `intelligence_foundation` must already be ON.

## Epic SI-6 — AI Recommendations
AI-powered recommendations supplement (NOT replace) deterministic rules.
Deterministic rules always run first. AI results are layered on top.
Privacy: no PII, no VIN in prompts.

## Feature Flag Rollout Order

1. `intelligence_bus` → ON first (just persists events, no user-visible change)
2. `recommendation_engine` → ON for owner accounts only
3. `command_center` → ON after SI-3 UI ships
4. `daily_summary` → ON after SI-4 data enrichment
5. `morning_briefing` → ON with SI-6 or standalone briefing feature

## Privacy Rules (Permanent)

- Customer PII never leaves the shop context
- VIN is shop-private; never shared
- Event payloads must not contain: name, phone, email, address, VIN
- Invoice amounts may appear as aggregates only (not per-customer)
- `share_to_network` stays `false` until explicitly reviewed
- Technicians cannot see owner recommendations or intelligence data

## Rollback Plan

All flags default OFF. To roll back any epic: set the relevant flag to `false` in `feature_flags` table. No code changes required. Production continues normally.
