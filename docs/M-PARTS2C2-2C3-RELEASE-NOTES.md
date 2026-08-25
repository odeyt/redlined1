# M-PARTS2C.2 and M-PARTS2C.3 — release notes

Two separate milestones, shipped together. They are unrelated in purpose and
are documented apart on purpose.

---

## M-PARTS2C.2 — Model-series resolution

### The problem

A 2009 Mercedes-Benz S-Class matches **two** catalogue series: `S-CLASS (W221,
V221)` (2005–2013) and `S-CLASS Coupe (C216)` (2006–2013). Ambiguity at the
*model* step produces no *modification* candidates, so the existing variant
chooser had nothing to offer and could not render. The resolver counted the
model candidates into its evidence and then discarded them. The technician saw
"No matching parts found" — the catalogue blamed for a question Redlined1 could
not answer.

### What changed

- The resolver returns `ModelSeriesCandidate[]` when the model step is
  ambiguous, and only when more than one survived. One candidate is not a
  decision.
- `POST /api/parts/vehicle-resolution/select-model` accepts a chosen series.
  Same auth, shop-ownership and fingerprint checks as the variant route.
- Choosing a series is **not** a resolution — it narrows which variants exist.
  The endpoint continues resolution and answers either `RESOLVED` (mapping
  written) or `VARIANT_REQUIRED` (**nothing** written; the variant chooser
  takes over). A series stored alone would be a half-mapping that later reads
  as authoritative.
- `VehicleModelSelector` preselects nothing and ranks nothing.

### Security

`chosenModelId` arrives from a browser and is untrusted. The resolver validates
it against the candidate list **it derives itself**; the check lives in the
resolver, not at the call site, so no caller can skip it by forgetting a
helper. Same reasoning as `candidateWasOffered` on the variant route: a
confirmed mapping is the strongest evidence in the fitment chain, so forging
one forges VERIFIED FIT.

### Found during live validation

The variant confirmation re-derives candidates server-side, and that
re-derivation *is* the validation. Without the chosen series it re-ran model
matching, went ambiguous again, produced no modification candidates, and
rejected a variant the technician had just been shown. The series now travels
with the confirm request — untrusted, validated the same way, and optional
because most vehicles resolve a series without ever asking.

### Proven live

2009 S-Class, 4 provider calls: chooser → series → variant chooser (3 S 500s,
all `MATCHES RECORDED ENGINE` after the 5.5L 8-cylinder evidence) → confirmed →
held search resumed → 434 OEM references.

---

## M-PARTS2C.3 — Persistent reference cache

### The problem

The reference cache was an in-process `Map`. Every deployment and every cold
start emptied it, so resolving one vehicle re-paid three provider calls:
manufacturers, models, vehicle_variants. Measured, not theorised — during
M-PARTS2C.2 validation a mid-run redeploy consumed the entire remaining call
budget.

### What changed

Two tiers: memory, then Postgres (`parts_provider_reference_cache`). A durable
hit is promoted into memory so the next call in that instance is free.

### It is a cache, not a mirror

This is the condition the production approval rests on.

- Every row carries `provider`, `cache_key`, `fetched_at`, `expires_at`,
  `source_host`, `category`.
- An expired row is **never served**, and is **deleted on encounter** — no
  sweeper to forget to run, no accumulation.
- Only reference categories may persist. `isPersistable` is an **allow-list**,
  so an endpoint added later is non-persistable until someone decides
  otherwise, which is the safe direction to fail.
- It inspects the **path** as well as the category, because the realistic
  failure is a caller labelling a search path with a reference category. A
  path carrying `search-param/brake%20pads` is refused even when mislabelled
  `manufacturers`.
- **AutoPartsAPI remains the source of truth.** No crawling, no bulk import,
  no article or OEM warehouse, no mirroring of supplier or media assets.

### TTL and invalidation

| category | TTL | invalidation |
|---|---|---|
| `manufacturers` | 7 days | expiry; deleted on encounter when stale |
| `models` | 24 hours | expiry; deleted on encounter when stale |
| `vehicle_variants` | 24 hours | expiry; deleted on encounter when stale |
| `vehicle_detail` | 24 hours | expiry; deleted on encounter when stale |
| `applicability` | 1 hour | expiry; not persisted — memory only |

There is no manual invalidation path and none is needed: the only way a row
leaves is by expiring. `bypassCache` on a search skips both tiers and refetches.

### Isolation

The table holds catalogue data, not tenant data: **no `shop_id`** — the same
manufacturer list answers every shop. RLS is enabled with **no policy**, and
the `service_role` grant is restated after `REVOKE ... FROM PUBLIC`, which also
strips inherited privileges.

### Call accounting

`persistent_hit` is a distinct usage outcome from `cache_hit`. Folding them
together would make this milestone unobservable in the very numbers meant to
show it works.

`externalCalls` means **actual upstream requests only**. A persistent hit is 0.
A memory hit is 0. This was wrong on arrival — the resolver incremented after
every lookup regardless of which tier answered — and the cold-start proof
caught it by reporting "2 upstream steps" while spending nothing.

### Proven from cold

A fresh Node process, whose in-process Map is empty by construction:

```
in-process cache entries at start: 0
durable cache rows available     : 3
manufacturers  persistent_hit
models         persistent_hit
EXTERNAL CALLS SPENT             : 0
```

Guaranteed permanently by `lib/parts/__tests__/coldStartCacheRegression.test.ts`,
which fails if anything reaches the provider, and also asserts that an expired
row is *not* served — the other half of "cache, not mirror".
