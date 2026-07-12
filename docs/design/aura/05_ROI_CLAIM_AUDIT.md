# Part 5 — Time-Savings and ROI Claim Audit

## Finding: no ROI/time-savings calculator section exists in DESIGN.md

As with Part 4, `docs/design/aura/DESIGN.md` contains no calculator, no ROI
copy, no input/output field list, and no disclaimer language of any kind.
The document's only quantitative marketing-style content is the single
"$12,450 Stale Estimates" mockup figure flagged in Part 3 (a UI mockup
label, not a calculator output). There is nothing resembling the required
inputs (technicians, jobs per day, minutes saved per job, etc.) or outputs
(hours saved per week/month/year, revenue opportunity) anywhere in the 126
lines.

This is reported honestly rather than inventing calculator content the
source document does not contain.

## What the mission requires (for reference, not yet satisfied)

- Editable inputs: technicians, jobs/day, minutes saved/job, days/week,
  weeks/year, avg invoice value, estimates/month, approval-rate improvement,
  missed invoices/month — **absent**
- Outputs: hours saved (week/month/year), equivalent working days,
  illustrative revenue opportunity, annual illustrative opportunity —
  **absent**
- "Illustrative estimate only" disclaimer — **absent**
- Editable-assumptions requirement, shown math, no guarantee language —
  **absent** (nothing to check for guarantee-language violations, since no
  ROI copy exists to violate the rule)

## Recommendation

If/when a time-savings or ROI section is authored for the real page, it must
be built to the mission's exact safeguards from day one:

- Every input field editable, with clearly reasonable (not aggressive)
  defaults — e.g. minutes-saved-per-job defaults should be modest (5-10
  minutes), not a large round number designed to inflate the headline output.
- Every output labeled "Estimated" and shown with its formula/math visible
  (e.g. "3 techs × 8 jobs/day × 6 min saved × 5 days × 50 weeks ÷ 60 = X
  hours/year").
- A persistent, non-dismissable disclaimer: *"Illustrative estimate only.
  Actual results depend on shop workflow, usage, staffing, and data
  quality."*
- No fabricated benchmark citations (e.g. no "shops like yours save N
  hours" without a named, sourced study).

## Classification

**BLOCKER for "ROI credibility" readiness** — not because existing content is
wrong, but because there is no content yet to be credible or not. Part 11
will explicitly mark this as a gap rather than fabricate calculator copy, and
Part 13's readiness score for "ROI credibility" reflects this absence (score
reflects "not yet built," not "built badly").
