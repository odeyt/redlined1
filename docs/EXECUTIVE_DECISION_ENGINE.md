# Executive Decision Engine (SI-6)

## Overview

The Executive Decision Engine answers one question for the shop owner: **"What should I do first today?"**

It is a deterministic, AI-free scoring system that ranks open recommendations by expected business impact. No LLM calls, no external dependencies. If every Intelligence Provider is offline, RedlineD1 continues working normally.

## Architecture

```
Recommendations (DB)
        │
        ▼
  ScoringModel.ts          ← pure functions, no DB calls
        │ sub-scores
        ▼
  DecisionEngine.ts        ← ranks, builds queue, saves history
        │
  ┌─────┴──────┐
  │            │
  API routes   DB (decision_*)
```

## Feature Flags

All SI-6 features are disabled by default:

| Flag key            | Controls                    |
|---------------------|-----------------------------|
| `decision_engine`   | Full scoring & rankings API |
| `action_queue`      | Today's Action Queue section|
| `executive_dashboard` | Executive Score panel     |

Enable via Supabase → `feature_flags` table.

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/intelligence/action-queue` | Top 5 ranked actions (cached or live) |
| POST | `/api/intelligence/action-queue` | Force regenerate queue |
| GET | `/api/intelligence/decision-engine` | All scored recommendations |
| POST | `/api/intelligence/decision-engine` | Record action taken |
| GET | `/api/intelligence/executive-score` | 0–100 composite score |

## Database Tables

- `decision_scores` — per-recommendation sub-scores
- `decision_rankings` — cached daily queue per shop
- `decision_history` — actions taken log

## Security

- All endpoints require auth + owner/manager role
- Technicians cannot access any decision engine endpoints
- No automatic mutations — reads and navigation only
- All DB writes are fire-and-forget (never block response)

## Constraints

- Never blocks the production workflow
- Never creates invoices, sends SMS/email, or modifies shop data
- Feature flags default OFF — safe to deploy without user impact
