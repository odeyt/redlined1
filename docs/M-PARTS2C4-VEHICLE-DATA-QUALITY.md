# M-PARTS2C.4 — Vehicle data quality and catalogue-assisted enrichment

Turns "some vehicle records are thin or contradictory" into something a
technician can see and act on, one vehicle at a time, with the catalogue as
evidence rather than authority.

**No AutoPartsAPI calls were spent building or validating this milestone.**

---

## Quality states

Two independent axes. Folding them together would let "the catalogue agreed"
imply "this record is correct", which it does not.

| `qualityStatus` | meaning |
|---|---|
| `COMPLETE` | every fitment field present, no contradiction |
| `INCOMPLETE` | usable, but cannot pin a variant precisely |
| `CONFLICT` | the record disagrees with itself — review before ordering |

`identityConfidence` — `UNCONFIRMED` / `CATALOG_MATCHED` /
`TECHNICIAN_CONFIRMED` — is about *provenance of the match*, not completeness.

**INCOMPLETE is never INVALID.** A 2019 Tacoma with no engine recorded can be
booked, invoiced and driven. Nothing in this milestone blocks ordinary work,
and `qualitySummary()` says "incomplete for precise parts matching", never
"invalid".

## Significant fields

Audited against the real schema. `vehicles` holds 31 columns.

**CORE_IDENTITY** — `year`, `make`, `model`. Without all three there is
nothing to look up. A vehicle missing one is INCOMPLETE and `resolvable:
false`, regardless of how much enrichment it carries.

**FITMENT_ENRICHMENT** — `engine`, `engine_code`, `displacement_l`,
`cylinders`, `fuel_type`, `transmission`, `trim`. Absence degrades precision;
it never blocks.

**NON_FITMENT** — `plate`, `mileage`, `status`, `label`. Carry no penalty.

**VIN is special.** High coverage in practice, but its absence must not mark a
vehicle unusable, and it is never writable from a catalogue.

### Three columns added

`engine_code`, `displacement_l`, `cylinders` did not exist. The provider
supplies exactly these (`engineCodes`, `capacityLt`, `numberOfCylinders`) and
notably supplies **no transmission**, so without them enrichment would have
reduced to `fuel_type` alone.

They are **deliberately not part of the vehicle fingerprint**. They describe a
vehicle in more detail; they do not change *which* vehicle it is. Including
them would mean accepting an engine code offered *by* a confirmed variant
immediately invalidated the mapping that supplied it.

## Conflict rules

Deterministic. Never fuzzy similarity.

- **Related marques are never equivalent.** Toyota ≠ Lexus, Honda ≠ Acura,
  Volkswagen ≠ Audi, Nissan ≠ Infiniti, Hyundai ≠ Kia, Ford ≠ Lincoln.
- **Internal contradictions** are only the impossible ones — displacement
  outside 0.5–12 L, cylinders outside 2–16, an implausible year. A 1.0L
  three-cylinder is an ordinary car and is left alone.
- **A conflict outranks incompleteness.** Filling in detail about possibly the
  wrong car is the wrong first move.

### Display-label safety

**A label is not identity.** Across this fleet, labels hold customer names,
plate fragments, shop nicknames ("BIG BROTHER") and notes ("RECALLED"). Labels
are never parsed back over structured fields, in either direction.

A label may raise a **review**, never a correction. The rule was calibrated
against the real fleet, and that mattered: the first version flagged **10 of
116** vehicles and only **one** was genuine. A warning firing on nine good
records buries the tenth.

Cleared as *the same model written differently* — each a real case:

| structured | label | why it is not a conflict |
|---|---|---|
| `RX350` | "LEXUS RX 350" | spacing |
| `Land Cruiser prado` | "TOYOTA PRADO" | label is shorthand |
| `Land Cruiser` | "LANDCRUISER LC 300" | no space in label |
| `Accent RB series` | "ACCENT BLUE" | model carries a trim |
| `Triton/L200/Strada` | "TRITON" | label picks one alias |
| `7 Series` | "BMW 750 Li" | a 750Li **is** a 7 Series |
| `C-Class` | "MERCEDES C 200" | designation matches the series |

Still flagged, correctly: `S-Class` against a label reading "C 200" — no
shared token, and the designation letters differ. **1 of 116.**

## Catalogue comparison

Reuses the confirmed provider mapping. Resolution is never reimplemented.

Facts come from the **persistent reference cache** (M-PARTS2C.3), keyed by the
mapping's model id — so a comparison costs **zero provider calls**. If nothing
is cached the answer is "no catalogue information available", never a silent
fetch.

| result | meaning |
|---|---|
| `MATCH` | agree — no action offered |
| `CONFLICT` | disagree — review, never preselected |
| `MISSING_LOCAL` | catalogue has it, record does not |
| `UNKNOWN` | provider supplied nothing — **not** a match, **not** a conflict |

A mapping whose fingerprint no longer matches is refused
(`fingerprint_stale`), so a panel cannot present evidence about a vehicle as
it used to be.

## Provenance

Every suggestion carries `source`, `providerVehicleId`, `mappingFingerprint`
and `observedAt` through to the audit row. Nothing is reduced to a bare value
before approval.

## Write allowlist

```
CATALOG_ENRICHABLE_FIELDS = [engineCode, displacementL, cylinders, fuelType]
```

Everything else is refused, each for its own reason:

- `vin` — a shop read it off the car; a catalogue lookup cannot know it
- `make`, `model` — a catalogue disagreeing here is a **review**, not a rewrite
- `plate`, `mileage`, `status`, `notes` — not fitment data
- `shop_id`, `customer_id`, `owner_id` — ownership. Never.
- `engine` — free text a human wrote; `engine_code` is the structured form
- `transmission` — the provider does not supply it at all

## Server-side value validation

**The browser chooses field names. The server chooses values.**

A request says "apply engineCode"; it never says what engineCode is. The
server rebuilds the comparison for the *current* fingerprint and takes values
from there. A forged body cannot write a value no catalogue offered — and a
vehicle's engine feeds fitment, so forging one would forge a parts
recommendation.

## Fingerprint and mapping behaviour

| situation | mapping |
|---|---|
| non-fingerprint field enriched (`engineCode`, `displacementL`, `cylinders`) | `unchanged` |
| fingerprint field filled from the mapped variant itself | `rebound`, **no provider call** |
| conflicting fingerprint value replaced | `invalidated` — re-resolve |
| no mapping exists | `unchanged` |

The safe rebind holds *only* because every value came from the server-built
comparison derived from that exact variant. If a value could come from
anywhere else the reasoning would be unsound.

## Audit trail

One row per enrichment, via the existing `record_audit_event`: shop, actor,
entity, before/after per column, and metadata carrying provider, provider
vehicle id, modification description, both fingerprints and the mapping
outcome. Never a raw provider response, never a credential.

## Security

Enrichment is a write, and proves in order: authenticated → shop membership →
vehicle belongs to that shop → fingerprint current → field allowlist →
server-derived value. `service_role` bypasses RLS, so every query carries an
explicit `shop_id` predicate — that predicate *is* the boundary.

## Provider-call policy

Opening a vehicle page, an estimate, the parts modal or the quality panel
spends **nothing**. A cosmetic quality badge is the worst possible reason to
burn quota. Live refresh, if ever added, must be an explicit technician
action.

## No mass auto-fix

There is no "Fix All Vehicles" and no bulk write. Every canonical change
requires explicit per-vehicle approval. A batch-review workflow would be a
separate milestone.
