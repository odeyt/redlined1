# Vehicle data quality — structured identity vs display label

Recorded 2026-08-25 during M-PARTS2C staging validation. **No customer data was
changed.** This is a description of a problem, not a fix.

## What was found

The estimate `EST-0018` names a Mercedes-Benz **C 200**. It resolves to a
`vehicles` row whose fields disagree with each other:

| field | value |
|---|---|
| `year` | 2014 |
| `make` | Mercedes-Benz |
| `model` | **S-Class** |
| `label` | **"Mercedes Benz C 200 #1112 2014"** |

The label says C 200. The structured model says S-Class. These are different
cars, and one of them is wrong.

## Why it matters to parts

Provider resolution reads the **structured** fields. So a parts search on that
estimate resolves an S-Class, and any fitment claim would be about an S-Class,
while the technician is looking at an estimate headed "C 200".

The safety property that saved this case is that the Search Parts dialog shows
the *structured* identity — it displayed `2014 MERCEDES-BENZ S-CLASS`. What
will be searched is what is on screen, so a technician who reads the dialog can
see the disagreement. That is the only thing standing between this record and a
silently wrong fitment claim.

## Why the label is not parsed to repair it

Deliberately not done:

- The label is free text. Across this shop's 115 vehicles it holds customer
  names, plate fragments, shop nicknames ("BIG BROTHER"), and notes
  ("RECALLED"). Parsing it into `make`/`model` would import that noise into the
  fields that decide fitment.
- The label being free text is *normal* and not itself a defect. Only a label
  that contradicts a structured claim about the same car is.
- Overwriting structured fields from a label would be guessing which of two
  disagreeing sources is right, and then recording the guess as fact.

**Structured canonical fields remain authoritative for provider resolution.**

## Scope of the problem

Of 115 vehicle rows, 95 carry a `transmission` or `fuel_type`, and only 2 have
a label that is exactly what the structured fields would render. The vast
majority of the remaining labels are ordinary free text and are fine. The
subset worth flagging is narrower: labels that *name a different model* than
the `model` column.

That subset was not enumerated. Doing so needs a model-name comparison that
tolerates free text without producing false alarms, which is real work.

## Proposed follow-up — M-PARTS2C.4

1. Detect rows where the label names a model contradicting the `model` column.
2. Surface it on the vehicle record, not mid-estimate: a technician fixing a
   car's identity should not be doing it while pricing a job.
3. Offer a repair workflow where the technician chooses which source is right.
   Never auto-resolve.

Until then the dialog's display of the structured identity is the mitigation,
and it is a real one — but it depends on someone reading it.

---

## Update — M-PARTS2C.4 (2026-08-26)

This document described the problem. It is now also handled in code.

**What exists now:** a single analyzer (`lib/vehicles/quality.ts`), a
catalogue comparison that spends no provider call
(`lib/vehicles/catalogComparison.ts`), a technician-approved enrichment path
with a write allowlist and server-derived values (`lib/vehicles/enrichment.ts`),
and a read-only fleet audit
(`scripts/qa-vehicle-data-quality-audit.ts`). See
[M-PARTS2C4-VEHICLE-DATA-QUALITY.md](M-PARTS2C4-VEHICLE-DATA-QUALITY.md).

**The C 200 / S-Class record is still untouched**, exactly as this document
said it should be. It is now *detected* rather than merely known: the analyzer
flags it as the single display-vs-structured conflict in the fleet, and the
panel shows both sides and offers no way to apply either over the other.

**The prediction in this document held.** It warned that parsing the label
into `make`/`model` "would import that noise into the fields that decide
fitment", and that only a narrow subset — labels naming a *different* model —
is worth flagging. Measured against the real fleet, a naive rule flagged 10 of
116 vehicles with a 90% false-positive rate. The calibrated rule flags 1.

**Structured canonical fields remain authoritative for provider resolution.**
Unchanged, and now enforced by the allowlist: `make` and `model` are not
catalogue-enrichable, and `vin` never is.

**Still open:** the repair workflow this document proposed — surfacing the
contradiction on the vehicle record and letting a technician choose which
source is right — is not built. The conflict is reported; resolving it remains
a manual edit.
