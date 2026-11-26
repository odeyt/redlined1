# SI-5 Phase 1 — Actionable Recommendations

Owner approved building Phase 1 on 2026-11-27 (RedlineD1 AI Proposal). Built behind the
`actionable_recommendations` flag, **off by default**. No AI model, no external calls.

## What it does

Each Command Center recommendation card, when opened, answers five questions:

| Question | Where it comes from |
| --- | --- |
| What should I do? | `nextStep`, naming the first records to act on |
| Why does it matter? | The Evidence Engine's "why it matters" text (falls back to the rule's reason) |
| What evidence? | The actual records: invoice/estimate/job card/part number, customer, vehicle, amount, age |
| What is the impact? | Money across all matching records, per currency, never converted (`฿12,000.00 + $340.00`) |
| What can I do next? | Buttons that open the right screen (Money Owed, Invoices, Estimates, Job Cards, Parts …) |

Record-level evidence covers 7 of the 10 rules: unpaid invoices, stale estimates, approved
estimates not booked, finished jobs not invoiced, stuck jobs, declined estimates, low stock.
Inactive customers, missing repair cases and revenue dip keep the summary evidence.

## Rules

Each selector in `lib/intelligence/decisionEvidence.ts` uses exactly the rule
`intelligence/metrics/MetricsBuilder.ts` uses for the count that fired the recommendation, so
"Collect 4 unpaid invoices" lists four invoices. Unpaid balances go through
`receivablesFrom()`, the same rule as the Invoices screen and Money Owed.

Reads cover the shop plus any location merged into it (`mergedShopScope`), so D1 Imports history
is included for Location 2.

Privacy: number, customer name and vehicle only (what list screens already show). No phone,
email or address. Any VIN-shaped token is stripped from vehicle labels. Owner/manager only.

## Files

- `lib/intelligence/decisionEvidence.ts` — pure selectors and wording (unit tested)
- `intelligence/evidence/DecisionEvidenceLoader.ts` — reads rows; returns null on any failure
- `app/api/intelligence/recommendations/[id]/evidence/route.ts` — adds `decision` to the response
- `features/command-center/DecisionPanel.tsx` — the card layout
- `supabase/migrations/2026-11-27_si5_actionable_recommendations.sql` (+ `_rollback.sql`)

## Fixes made on the way

- The evidence route read `getShopIds()`, a browser-side store that is empty on the server, so
  evidence covered Location 2 only. It now uses `resolveRequestShop` + `mergedShopScope` (#92's rule).
- The route read flags with a single-row lookup; it now uses the flag service's per-shop/role evaluation.
- `evidence_engine` was read by code but never seeded; the migration seeds it OFF so it shows in
  Settings. An existing row is left unchanged.

Known gap, not changed here: the summary builder for unpaid invoices selects `invoices.total`,
a column that does not exist (totals come from lines), so its summary evidence is likely empty.
The new decision view does not use it.

## Rollout

1. Apply `2026-11-27_si5_actionable_recommendations.sql` on staging, then production.
   Check query at the end should say `ok` twice.
2. Settings → Feature Flags → turn on `actionable_recommendations` for Location 2 only.
3. Open Command Center → a recommendation → "What to do". Check the record count matches the
   card title and amounts match Money Owed / Estimates.
4. Off switch: the same flag. Rollback SQL removes only the `actionable_recommendations` row.

Not yet: opening a single invoice or estimate directly from a record (only module-level buttons
today; Repair Orders is the only screen with a direct-open hand-off).
