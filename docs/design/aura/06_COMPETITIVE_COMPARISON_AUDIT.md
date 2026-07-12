# Part 6 — Competitive Comparison Audit

## Finding: no competitive comparison section exists in DESIGN.md

`docs/design/aura/DESIGN.md` does not name any competitor, does not contain
a comparison table, and does not use any of the required Standard/Limited/
Available/Advanced/Evidence-based/Planned labeling scheme. No competitor is
referenced by name anywhere in the 126 lines — positively, this means there
is **no violation** of the "never name competitors in negative claims" rule,
because there is no comparison content of any kind to violate it.

This is reported honestly rather than inventing comparison content the
source document does not contain.

## Context: the live production page already has a comparison table

Although outside the scope of DESIGN.md itself, this audit noted (while
verifying product claims in Part 3) that the **current live**
`app/portal/page.tsx` already contains a `COMPETITOR_WINS` table with rows
such as:

```
{ feature: 'Repair Knowledge Graph', us: true, them: false }
{ feature: 'Evidence-Backed Recommendations', us: true, them: false }
{ feature: 'DTC Lookup', us: true, them: true }
```

This is flagged here **only as context for whoever authors the eventual
comparison section from DESIGN.md**, not as part of the DESIGN.md audit
itself (per the mission's rule not to touch runtime code, this was not
modified). Two observations worth carrying forward into future authoring:

1. The existing "them" column uses a generic, unnamed competitor ("them")
   rather than naming a specific product — this is actually the *safe*
   pattern the mission asks for (general category language, no named
   competitor). Good pattern to preserve.
2. However, boolean true/false checkmarks for capabilities like "DTC Lookup"
   (`them: true`) assert specific knowledge of what unnamed competitors do
   or don't have, without a cited source. Per the mission's rule against
   "misleading checkmarks where capability scope differs materially," a
   future revision should move from boolean checkmarks to the requested
   Standard/Limited/Available/Advanced/Evidence-based/Planned labels, which
   convey capability *maturity* rather than a binary yes/no that implies
   verified competitive research.

## Recommendation

When a competitive comparison section is authored against DESIGN.md's visual
system, it should:

- Use "Traditional shop software" as the generic comparison label (never a
  named competitor), consistent with the existing page's approach.
- Replace boolean checkmarks with the mission's maturity labels.
- Avoid the specific absolute claim style found in today's live page
  ("them: false" for six categories) unless each claim is independently
  sourced/verifiable — otherwise soften to "Limited" rather than an absolute
  negative.

## Classification

**BLOCKER for "competitive comparison safety" readiness** — not because
existing content violates the rules (it doesn't; there is none), but because
no comparison content exists yet in DESIGN.md to certify as safe. The
adjacent live-page table is a useful reference pattern but needs the
checkmark-to-label revision described above before reuse. Part 11 will not
fabricate comparison copy; Part 13 reflects this as a build gap.
