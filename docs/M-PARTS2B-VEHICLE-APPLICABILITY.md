# M-PARTS2B — Vehicle Applicability and Verified Fit

Status: **IN PROGRESS — blocked on provider documentation for three endpoints.**

## The invariant

```
OEM MATCH SCORE  ≠  VEHICLE FITMENT
```

Two questions, answered separately, never allowed to answer each other:

| | |
|---|---|
| **Part identity** | is this article the part the OEM number names? |
| **Vehicle fitment** | does the provider say this part goes on THIS vehicle? |

`OEM 99/100 + VEHICLE FITMENT UNVERIFIED` is a **correct, expected result**, not a
degraded one. They are separate fields, separate logic, separate UI, and will
be separately persisted on the estimate snapshot.

## Pre-flight audit (2026-08-24)

### Vehicle identity actually held — 114 production vehicles

| field | filled |
|---|---|
| `vin` | 97/114 |
| `make` | 102/114 |
| `model` | 94/114 |
| `year` | 95/114 |
| `fuel_type` | 88/114 |
| `transmission` | 51/114 |
| **`engine`** | **6/114** |
| **`trim`** | **0/114** |

This is the single most important audit result. **Engine is present on 6
vehicles and trim on none**, so the resolver must behave well when all it has
is `2014 Mercedes-Benz S-Class`. Designing for a fully-specified vehicle would
produce a feature that works on 5% of the fleet.

Only 5 vehicles carry VIN + make + model + year + engine. One of those is the
candidate for the single live end-to-end test (§27).

### Persistence

`provider_vehicle_map`, `parts_provider_usage`, `autopartsapi_vehicles` — **none
exist.** Verified with a control table after a `head`-count check returned a
false positive for all three, including a table named
`definitely_not_a_real_table_xyz`.

### Existing architecture reused, not redesigned

```
lib/parts/types.ts            NormalizedPartResult, provider contract
lib/parts/fitment.ts          the four fitment states
lib/parts/recommendation.ts   scoring + badge eligibility
lib/parts/snapshot.ts         frozen estimate line
lib/parts/cache.ts            in-process, short TTL
providers/autopartsapi/       client, endpoints, evidence, normalize, provider
```

Estimate → vehicle linkage already exists: `EstimatesView.searchVehicle`
resolves `form.vehicle` against `allVehicles` and hands make/model/year/engine
to the search. No new canonical vehicle fields are introduced.

## BLOCKER — the endpoints I do not have

Documented and in use from M-PARTS2A:

```
GET /languages/list
GET /articles-oem/search-by-article-oem-no?langId=&articleOemNo=
GET /articles-oem/search-all-equal-oem-no/lang-id/{}/article-oem-no/{}
GET /articles-oem/selecting-a-list-of-cars-for-oem-part-number
      /type-id/{}/lang-id/{}/country-filter-id/{}/manufacturer-id/{}/article-oem-no/{}
GET /articles-oem/selecting-oem-parts-vehicle-modification-description-product-group
      /type-id/{}/vehicle-id/{}/lang-id/{}/search-param/{}
GET /artlookup/...  (cross-reference family)
```

**Not documented to this codebase — and the resolution chain needs all three:**

1. **list manufacturers** for a vehicle type → `manufacturerId`
2. **list models** for a manufacturer → `modelId`
3. **list modifications/vehicles** for a model → `vehicleId`
4. *(optional)* **VIN lookup**, if the provider offers one

The applicability endpoint above **requires `manufacturer-id`**, so the entire
chain is gated on (1).

`https://auto-parts-catalog.apiprofile.com/api/documentation` returns 404 and
apiprofile.com's public site carries no auto-parts documentation — the docs are
behind the provider dashboard. Per §2 these paths are **not guessed**, and per
§26 no live calls have been spent probing for them.

**Live external calls spent this milestone so far: 0.**

## Built and proven without those endpoints

These are pure functions over Redlined1's own data and over provider
*answers* — not provider response *shapes* — so they were settled before
spending a call.

### `vehicleResolution/fingerprint.ts`

A cached provider vehicle id is valid only for the vehicle description it was
resolved from. The fingerprint covers exactly the attributes that steer
resolution:

```
vin · year · make · model · trim · engine · transmission · fuelType
```

Mileage, plate, status, owner and notes are deliberately **excluded** — they
change constantly and none of them changes which parts fit. Including them
would discard a good mapping every time somebody recorded a service.

Punctuation and case are normalised, so `Mercedes-Benz` and `Mercedes Benz` do
not invalidate each other.

### `vehicleResolution/manufacturer.ts`

Exact matching after normalisation, plus a **short, explicit alias table**. No
edit distance, no prefix rule — a prefix rule alone makes `merc` match
`mercury`.

`NEVER_EQUIVALENT` is held as data and asserted in tests:

```
toyota ≠ lexus      honda ≠ acura       nissan ≠ infiniti
volkswagen ≠ audi   mercedesbenz ≠ chrysler
ford ≠ lincoln      hyundai ≠ kia       mazda ≠ ford
```

One company, shared engineering, entirely separate parts catalogues. A fuzzy
matcher will eventually put a Lexus caliper on a Tacoma and give it a high
score.

Ambiguity is **reported, never resolved**: if two catalogue manufacturers
canonicalise to the same make, choosing one silently is a guess wearing a
result's clothes.

### `vehicleResolution/fitmentTruth.ts`

One function decides `VERIFIED FIT`, and needs three affirmatives:

```
part identity established   (verified_equivalent | cross_referenced)
+ vehicle resolved          (exactly one provider modification)
+ applicability confirmed   (provider associates the two)
```

**Cannot produce a verified fit, at any score:** a 100/100 identity match, an
exact OEM number, a confirmed cross-reference, an analogue, a matching marque,
or a resolved vehicle with no applicability answer.

**Absence is not contradiction.** `incompatible` requires an affirmative
exclusion. A part missing from an applicability list is the provider saying
nothing, not saying no — and a red label on correct parts teaches shops to
ignore the label.

An explicit exclusion **overrides everything**, including a perfect part match,
and an excluded part can never be recommended.

Every non-verified verdict names **which of the three inputs was the limit**, so
the technician knows whether they can act on it (choose a variant) or not
(provider has no data).

## Tests

35 new, in `lib/parts/__tests__/vehicleResolution.test.ts`. Total suite 2564 /
154 suites. Typecheck clean, lint at baseline 180/168.

No live provider calls in CI, per §24.

## Still to build, once the endpoints are known

model/year resolution · engine-modification disambiguation · technician
variant selection · `provider_vehicle_map` migration + cache · applicability
call + normalisation · quota telemetry migration + admin view · request
coalescing · estimate snapshot extension · UI split of part identity from
vehicle fitment · mobile · live end-to-end proof (§27, budget ≤10 calls).
