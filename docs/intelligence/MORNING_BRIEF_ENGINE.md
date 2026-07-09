# Morning Brief Engine (SI-7)

## What it is

A deterministic daily executive briefing delivered to shop owners and managers before the shop opens. Answers: **"What should I focus on today to make more money, reduce risk, and keep the shop moving?"**

No AI. No LLM calls. No automatic customer messages. No automatic data changes.

## Architecture

```
SI-4 Metrics (shop_intelligence_metrics)
SI-6 Decision Rankings (decision_rankings)
          │
          ▼
  MorningBriefEngine.ts        ← generates brief, reads/writes DB
          │
  BriefContentBuilder.ts       ← builds each section from signals
          │
  FocusRules.ts                ← deterministic focus text (priority order)
          │
  morning_briefs (DB table)    ← one row per shop per day
          │
  BriefDeliveryService.ts      ← logs delivery (dashboard only for now)
```

## Feature Flags (all default OFF)

| Flag key | Controls |
|----------|---------|
| `morning_brief_engine` | Generate brief via API |
| `morning_brief_dashboard` | Show panel in Command Center |
| `morning_brief_delivery` | Delivery infrastructure |

## Sections

1. **Title** — contextual greeting based on health score
2. **Shop Health + Executive Score** — from SI-4 + SI-6
3. **Yesterday Summary** — revenue, jobs, repair cases
4. **Today Priorities** — top 5 from SI-6 decision rankings
5. **Revenue Opportunities** — stale estimates, completed not invoiced, unpaid invoices
6. **Cash Collection** — unpaid/overdue counts and totals
7. **Operational Risks** — stuck orders, low inventory, overdue
8. **Technician Summary** — active/idle, bottlenecks
9. **Inventory Summary** — low count, reorder urgency
10. **Recommended Focus** — single-sentence deterministic directive

## Access Control

- Owner / Manager: full access (read, generate, dismiss)
- Technician: blocked (403)
- Unauthenticated: blocked (401)

## Key Files

| File | Purpose |
|------|---------|
| `supabase/migrations/migration_morning_brief_engine.sql` | DB tables + flags |
| `intelligence/morning-brief/types.ts` | All types |
| `intelligence/morning-brief/MorningBriefEngine.ts` | Core engine |
| `intelligence/morning-brief/BriefContentBuilder.ts` | Section builders |
| `intelligence/morning-brief/FocusRules.ts` | Focus priority logic |
| `intelligence/morning-brief/BriefDeliveryService.ts` | Delivery infrastructure |
| `app/api/intelligence/morning-brief/route.ts` | API (GET/POST/PATCH) |
| `features/command-center/CommandCenterView.tsx` | Summary panel + modal trigger |
| `features/command-center/MorningBriefModal.tsx` | Full brief modal |
