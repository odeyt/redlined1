# Intelligence Foundation Roadmap

## Epic SI-1: Intelligence Foundation (DONE)
- Provider abstraction + MockIntelligenceProvider
- IntelligenceProviderFactory (env-var-based)
- IntelligenceEvent model + 17 event types
- EventPublisher (fire-and-forget, never blocks)
- DailySummary model (deterministic, no AI)
- Owner Command Center types + API contract (docs only)
- IntelligenceService façade
- Feature flags: `intelligence_foundation`, `command_center`, `daily_summary`, `morning_briefing` — all OFF
- Non-blocking hooks: InvoicePaid, EstimateApproved, JobCardCreated, RepairOrderCompleted
- Health check endpoint: `GET /api/health/intelligence`
- Documentation: architecture, event catalog, provider guide, command center plan, event publishing

## Epic SI-2: Real Data Aggregation (Future)
- Populate `DailySummary` fields from DB queries (invoices, ROs, estimates, inventory)
- Enable `daily_summary` flag
- Add remaining 13 event hooks

## Epic SI-3: Sapelee Provider (Future)
- Implement `SapeleeIntelligenceProvider`
- Wire via `INTELLIGENCE_PROVIDER=sapelee`
- Keep mock as fallback

## Epic SI-4: Owner Command Center UI (Future)
- Build dashboard using `DailySummaryData` API
- Enable `command_center` flag
- Morning briefing delivery (email/push)

## Constraints (Permanent)
- RedlineD1 must NEVER depend on a single AI platform
- Intelligence must NEVER block production workflows
- All intelligence features default OFF
- No PII or VIN data in event payloads
- No AI/LLM calls in SI-1 or SI-2
