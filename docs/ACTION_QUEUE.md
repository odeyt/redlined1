# Today's Action Queue

## What it is

A ranked list of the top 5 things the shop owner should do today, ordered by Decision Score (0–1000).

## UI

Shown at the top of Command Center when `action_queue` feature flag is enabled. Each card shows:

- **Rank** (1–5)
- **Title** — recommendation title
- **Score** — decision score badge (color-coded: red ≥700, amber ≥450, blue otherwise)
- **Time estimate** — how long the action takes
- **Confidence** — scoring confidence %
- **Revenue opportunity** — if applicable
- **Quick action buttons** — navigation only, never data mutations
- **"Why" expandable** — why it matters + rationale + expected impact

## Quick Actions

Quick actions are navigation-only. They open the relevant module (invoices, estimates, job-cards, etc.) and never automatically create, send, or modify data.

| Action type | Navigates to |
|-------------|-------------|
| `open_invoice` | invoices |
| `open_estimate` | estimates |
| `open_job` / `open_repair_order` | job-cards / repair-orders |
| `open_inventory` | parts |
| `open_customer` | customers |
| `view_evidence` | expands evidence panel |

## Caching

The queue is cached in `decision_rankings` (one row per shop per day). The API serves cached data on GET and regenerates on POST. Cache is bypassed when force-refreshing intelligence.

## Access Control

- Owner / Manager: full access
- Technician: blocked (403)
- Unauthenticated: blocked (401)

## Key Files

- `app/api/intelligence/action-queue/route.ts`
- `intelligence/decision/DecisionEngine.ts` → `buildActionQueue()`
- `features/command-center/CommandCenterView.tsx` → `ActionQueueCard`
