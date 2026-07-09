# Daily CEO Brief — Design Philosophy

## Purpose

The D1 daily brief is not a report. It is a decision aid.

Every section answers a specific question the owner would naturally ask at the start of the day:

| Section | Question answered |
|---------|-----------------|
| Recommended Focus | What is the single most important thing I do today? |
| Yesterday Summary | How did yesterday go? |
| Today Priorities | What are the ranked things I must do? |
| Revenue Opportunities | Where is money sitting uncollected? |
| Cash Collection | What is owed and how urgent? |
| Operational Risks | What could block the shop today? |
| Technician Summary | Are my people working or stuck? |
| Inventory Summary | What parts are we short on? |

## Design Constraints

1. **Deterministic** — same inputs always produce the same output
2. **No AI today** — all text is template-based with slot filling
3. **Fail-safe** — if any data is missing, show limited-data message, never crash
4. **Read-only** — never auto-modifies shop data
5. **Additive** — Command Center works identically when feature flag is OFF

## Recommended Focus Priority Order

1. Overdue cash > threshold → collect now
2. Completed jobs not invoiced → invoice today
3. High unpaid total → follow up
4. Stale estimates > threshold → reach out
5. Approved estimates not scheduled → book work
6. Stuck repair orders → unblock
7. Low inventory > threshold → restock
8. No repair cases → capture knowledge
9. All clear → maintain momentum

## Future AI Enhancement

When Sapelee or another provider is connected, the brief can be enhanced with:
- Natural language summaries per section
- Contextual recommendations based on history
- Customer-specific follow-up suggestions
- Revenue trend analysis

The infrastructure (types, delivery service, DB tables) is already in place.
AI text replaces template text — the structure does not change.

## Rollout Path

See `MORNING_BRIEF_ROLLOUT.md` for step-by-step activation.
