# M-PARTS1 — Parts Intelligence, Phase 1

Search real parts suppliers from inside an estimate, compare them on what they
actually cost to land, and add one to the estimate at a price that never moves
again.

## Provider status — as proven, not as hoped

| Provider | Status | Why |
|---|---|---|
| **eBay** | **IMPLEMENTED — DISABLED** | Official Browse API adapter is complete. `EBAY_CLIENT_ID` / `EBAY_CLIENT_SECRET` are not configured, so it reports `missing_credentials` and returns nothing. **It has never returned a live result and is not claimed to work.** |
| **Amazon** | SCAFFOLD — DISABLED | Creators API credentials and eligibility not configured. Adapter shape only; no request code. |
| **Catalog / OEM (AutoPartsAPI)** | CLIENT BUILT — DISABLED | `AUTOPARTS_API_KEY` not configured, **and** the catalogue search endpoint is not documented to this codebase. Connectivity has **never been proven**. See the AutoPartsAPI section below. |
| RockAuto | PENDING AUTHORIZED ACCESS | No public parts API. Needs an authorised feed or partner agreement. |
| PartsGeek | PENDING AUTHORIZED ACCESS | No public parts API. |
| SSG Asia | PENDING AUTHORIZED ACCESS | Regional supplier; needs a supplier data agreement. |
| PartsTech | FUTURE | Aggregator API; needs a commercial account. |
| NAPA | FUTURE | Needs a NAPA commercial account. |
| Local supplier | FUTURE | Needs a supplier price-list data model first. |

**Nothing here is scraped.** RockAuto, PartsGeek, SSG and NAPA have no API this
shop can call, so they are registry entries that are off and say why. Scraping
them would be unauthorised, would break without notice, and would put invented
fitment in front of a technician.

## Architecture

```
Estimate form
  └── "Search Parts"  ──▶  PartsSearchModal (client)
                              │  POST /api/parts/search
                              ▼
                           route.ts   auth + shop membership + zod + rate limit
                              ▼
                           partsService.searchAllProviders   Promise.allSettled
                              ├── providerRegistry  ─── ebay | amazon | catalog
                              ├── cache             ─── in-process, short TTL
                              ▼
                           normalize.ts  ──▶  NormalizedPartResult
                              ▼
                           recommendation.ts  ──▶  score + label + reasons
                              ▼
                        technician picks part, qty, markup
                              ▼
                           snapshot.ts  ──▶  one EstimateLine + frozen source
```

| File | Job |
|---|---|
| `lib/parts/types.ts` | Canonical shapes. No provider payload crosses this line. |
| `lib/parts/fitment.ts` | The safety boundary. Decides `verified` / `likely` / `unverified` / `incompatible`. |
| `lib/parts/normalize.ts` | Flattens a provider response; treats all text and URLs as untrusted. |
| `lib/parts/landedCost.ts` | Item + shipping + known tax + known duty. Unknown stays `null`. |
| `lib/parts/recommendation.ts` | Deterministic scoring. Reads no affiliate field. |
| `lib/parts/providerRegistry.ts` | The only place providers are constructed. |
| `lib/parts/partsService.ts` | Concurrent search, per-provider failure isolation. |
| `lib/parts/cache.ts` | Short-lived, in-process. Never caches credentials. |
| `lib/parts/snapshot.ts` | Freezes the price into an estimate line. |
| `app/api/parts/search/route.ts` | The only path from browser to provider. |
| `features/estimates/PartsSearchModal.tsx` | The UI, inside the estimate. |

## Fitment rules

`verified` requires a provider to state compatibility **with the vehicle that
was asked about**. Nothing else produces it:

- a keyword match in the title → `unverified`
- the word "compatible" in free text → `unverified`
- `UNDETERMINED` / `unknown` / `possible` → `unverified`
- an MPN cross-reference with no vehicle → `likely`
- `COMPATIBLE` returned for a search that carried **no vehicle** → `unverified`
- an LLM's opinion → never consulted; the module is pure and takes no AI input

`incompatible` results are scored **0** and can never receive a
recommendation label, at any price.

Every non-verified result displays **"Verify fitment before ordering."**

## Recommendation rules

```
score = fitment(40) + price(25) + quality(12) + delivery(12) + seller(8) + warranty(3)
```

Normalised to 0–100. Fitment dominates deliberately: the wrong part means a
return, a second job, and a customer who was told a date.

Price is scored against the cheapest **landed** cost in the set, never the
cheapest item price — `$61 + $18 shipping` loses to `$67 free`.

**Affiliate neutrality:** `recommendation.ts` does not read `affiliateUrl`, and
a test asserts two otherwise identical results — one with an affiliate link,
one without — produce byte-identical scores and reasons. Enforced by a test,
because a comment does not fail CI.

Reasons are derived from real fields only, so the explanation cannot drift from
the score. The incomplete landed cost is disclosed as a reason, not buried.

## Landed cost

```
landed = item + shipping + known tax + known import duty
```

An unknown component stays `null` and the total is labelled `partial`. Treating
unknown duty as `0` would produce a number that looks authoritative and is
wrong **low** — the worst direction for a figure a shop quotes from.

Free shipping (`0`) and absent shipping (`undefined`) are deliberately
different: one makes the total more complete, the other does not.

Money uses plain numbers rounded once at the end, matching
`calculateEstimateTotals` and the estimate form's own `.toFixed(2)`. The project
has no Decimal or minor-units helper; introducing one here would create a second
money model that disagrees with the canonical totals.

## Snapshot — why an issued estimate never moves

An estimate is a promise. When a marketplace result is added it stops being a
live listing and becomes a record of what it cost **then**.

- The snapshot lives in `estimates.lines` JSONB under `partsSource`.
  **No migration, no new table, no new RLS policy** — the existing `estimates`
  shop_id policy already covers it, and existing rows simply have no
  `partsSource`.
- `calculateEstimateTotals` reads `qty × rate` and never reads `partsSource`.
  A test asserts the function body contains neither `partsSource` nor
  `landedCost`. That is why a marketplace price change **cannot** move an
  issued estimate.
- `compareToSnapshot` is the only refresh path and it **returns a comparison,
  the module exports no writer**. A test asserts no exported name matches
  `apply|update|save|sync|refresh`. Applying a new price is a separate,
  deliberate technician action.

## Markup

Reused, not rebuilt. The estimate form already derives
`rate = cost × fx × (1 + markup/100)`, and a marketplace line writes the same
`cost` and `markup` fields, so it behaves identically to a hand-typed line.

Three modes: `percentage`, `fixed`, `manual` (the technician types the customer
price outright and it wins).

**There is no default markup.** No shop-level default exists in settings, and
inventing one would price a customer's job on a number nobody chose. The Add
button stays disabled until a markup is entered.

## Security model

- Provider secrets are server-only. `ebay.ts`, `amazon.ts`, `catalog.ts`,
  `providerRegistry.ts`, `partsService.ts` and `cache.ts` all begin with
  `import 'server-only'`, so a client import is a **build error**, not a
  runtime leak.
- The browser never receives a client secret; it talks to
  `/api/parts/search`.
- The route requires an authenticated user **and** membership of the shop id in
  the request, checked against `shop_users`. A valid session for another shop
  is refused.
- Query length is bounded (2–120) and the whole body is `.strict()` zod, so an
  unknown field is rejected rather than ignored.
- Marketplace titles and descriptions are treated as untrusted: control
  characters and bidi overrides stripped, length bounded.
- Provider URLs are **allow-listed** (https only, no embedded credentials),
  not sanitised. A URL we cannot vouch for is dropped.
- No SSRF path: providers are chosen from a fixed registry and no user-supplied
  URL is ever fetched. Images are referenced directly with `referrerPolicy="no-referrer"`
  and are **not** proxied server-side.
- Provider errors are reduced to fixed phrases before reaching the client — a
  raw error can echo a URL, and a URL can carry a token. A test asserts a
  secret in an error message does not survive into the response.
- Rate limit: 30 searches/user/minute. Honest about its limits — it is
  per-instance, so a brake rather than a global quota. The public API's
  `api_rate_limit_hit` RPC is keyed on an `api_keys` row and does not apply to
  a cookie session.

## Permissions

Source cost, shipping, landed cost and markup are wholesale figures. The role
comes back **from the server** with the results, never from client state.
Owners, admins and managers see cost; other roles see only the sell price, in
line with the existing model where costs are hidden from technicians.

The customer-facing estimate shows the shop's sell price. Affiliate information
is never shown to a customer.

## Cache

Key: `provider :: query :: vehicle :: oem :: mpn :: country :: currency`.

Vehicle is part of the key deliberately — reusing one vehicle's answer for
another would hand it the wrong fitment verdict.

TTL defaults to 5 minutes (`PARTS_CACHE_TTL_MS`), capped at 200 entries.
In-process rather than a table: marketplace data is licensed and mirroring it
into Postgres is a licensing decision, not a performance one. Results display
**"Checked 4 minutes ago"** and never imply live pricing.

Tokens and credentials are never cached here.

## Environment variables

```
EBAY_CLIENT_ID
EBAY_CLIENT_SECRET
EBAY_ENVIRONMENT           production | sandbox   (default production)
EBAY_MARKETPLACE_ID        default EBAY_US
EBAY_CAMPAIGN_ID           optional; enables affiliate URLs when enrolled

AMAZON_CREATORS_API_KEY
AMAZON_CREATORS_API_SECRET
AMAZON_PARTNER_TAG
AMAZON_MARKETPLACE

PARTS_CATALOG_API_KEY
PARTS_CATALOG_BASE_URL

PARTS_CACHE_TTL_MS         optional, default 300000
```

Presence is reported as `PRESENT` / `MISSING`. Values are never printed.

## Adding another provider

1. Write `lib/parts/providers/<id>.ts` exporting a `PartsProvider`. Start it
   with `import 'server-only'`.
2. Add the id to `PartsProviderId` in `types.ts`.
3. Add the provider to `IMPLEMENTED_PROVIDERS`, or a `ProviderHealth` entry to
   `PENDING_PROVIDERS` if there is no authorised access yet.
4. Map its response in `normalize.ts` through `safeText` / `safeHttpsUrl`.
5. Map its compatibility answer through `fitment.ts`. **Do not** invent a
   `verified`.

Nothing in the route, the ranking or the UI needs to change.

## Entitlements — the decision, written down

Feature key: **`parts_intelligence`**.

It is **not** added to `config/plans.ts`. That registry is the paid-plan
promise, and adding a key there silently changes what each tier includes —
a product and pricing decision that has not been made. Phase 1 is therefore
platform-enabled for every authenticated shop member, gated only by
authentication, shop membership and role.

When a plan decision exists, add `parts_intelligence` to `PlanFeatures` in
`config/plans.ts` and gate the route with the existing
`lib/api/entitlements.requireFeature`, which already takes a feature key rather
than a plan name. No duplicate registry was created.

## Observability

Events via the existing `logger`: `parts_search_started`,
`parts_search_completed`, `parts_search_failed`, `parts_provider_unavailable`.

No secrets, no tokens, no customer PII. **The VIN is masked** to its last four
characters — this codebase had no VIN-masking convention, so one is defined in
the route and the full VIN is never logged.

## Error states

Every one keeps the estimate writable:

| State | What the technician sees |
|---|---|
| Provider unavailable | `eBay: temporarily unavailable. You can still add the part manually.` |
| No provider configured | `No parts provider is configured yet. Add the part manually for now.` |
| No results | `No results. Try a different description, or add the part manually.` |
| Invalid credentials | `The provider rejected our credentials.` |
| Rate limited | `Rate limited — try again shortly.` |
| Timeout | `Timed out.` |
| Network failure | `Could not reach the parts service. You can still add the part manually.` |

**Manual entry is never removed.** "Search Parts" sits beside "+ Add Line", it
does not replace it.

---

# AutoPartsAPI (M-PARTS2A §37–48)

## Request contract

```
Base URL   https://auto-parts-catalog.apiprofile.com/api   (server-side constant)
Auth       x-apiprofile-key: <AUTOPARTS_API_KEY>           (header, never a URL)
Reference  GET /languages/list                             (documented)
Example    GET /countries/get-country/lang-id/{id}/country-filter-id/{id}
```

The base URL is a **constant**, not an environment variable. A settable base
URL is an SSRF lever — anything that can influence it can point our
authenticated, key-bearing request at a host of its choosing. An override via
`AUTOPARTS_API_BASE_URL` is honoured only for an `https` host inside
`.apiprofile.com`, which keeps a sandbox possible without opening that door.

## Environment

```
AUTOPARTS_API_KEY=              # server-only. Never NEXT_PUBLIC_*.
AUTOPARTS_API_BASE_URL=         # optional; only *.apiprofile.com over https
AUTOPARTS_SEARCH_PATH=          # set once the search endpoint is documented
AUTOPARTS_API_TIMEOUT_MS=8000
AUTOPARTS_REFERENCE_TTL_MS=86400000
```

**Rotate the provider secret** if the key visible in the dashboard screenshot
is the live production key. It is not in this repository, and
`lib/parts/__tests__/secretHygiene.test.ts` fails CI if one ever appears.

## URL construction safety

`buildProviderUrl` refuses a scheme, a protocol-relative prefix, a backslash,
`..` (raw or percent-encoded), a query or a fragment, and any segment outside
`[A-Za-z0-9._~-]`. The resolved URL is then re-checked for `https` and the
allowed host. A technician's search text can never decide the upstream host.

## Error classification

| | |
|---|---|
| 401 / 403 | `unauthorized` |
| 404 | `not_found` |
| 429 | `rate_limited` |
| 5xx | `provider_error` |
| abort | `timeout` |
| 2xx, unparseable | `malformed` |
| other 4xx | `bad_request` |

Raw provider errors never reach a technician — the parts service maps every
one to *"Parts catalog is temporarily unavailable. You can still add the part
manually."* A test asserts a secret inside an error does not survive into the
response.

## Free-tier quota protection

The plan allows few calls per month, so an accidental request is not a
performance problem — it is a broken feature at month end.

- Reference data (`/languages/list`) cached **24h** in process
- Identical in-flight requests **deduplicated** — a double-click costs one call
- **Nothing fires on render**; a catalogue call happens only on explicit submit
- No per-keystroke search
- Reopening an estimate with a snapshotted part makes **no** provider call
- CI uses fixtures; the connectivity script is never part of a test suite

## Locale — not assumed from an example

The dashboard example showed `lang-id/4` and `country-filter-id/63`. **Neither
is hard-coded.** An id in an example is not documentation, and guessing that 4
means English produces a catalogue in the wrong language with nobody noticing.

`languageId` is resolved at runtime by matching the language **name** against
`/languages/list`, then cached. If English is absent the resolver **refuses**
rather than defaulting to the first row.

`countryFilterId` is **unset in Phase 1**. A country filter silently narrows
which parts exist, and filtering by a guessed country is worse than not
filtering at all.

## Connectivity proof

```bash
npx tsx --conditions=react-server scripts/qa-autopartsapi-connectivity.ts
```

Exit `0` proven · `1` a check failed · `2` could not run. The `--conditions`
flag is required because the client is `server-only`; needing it is the guard
working.

**Current result — run 2026-08-24, LIVE:**

```
Base URL:           https://auto-parts-catalog.apiprofile.com/api
AUTOPARTS_API_KEY:  PRESENT
  PASS    URL construction
  PASS    hostile paths refused (SSRF guard)
  PASS    authentication (x-apiprofile-key) accepted
  PASS    GET /languages/list -> 42 records
  PASS    locale resolved by NAME -> languageId 4
  PASS    no country filter assumed in Phase 1
  PASS    GET /articles-oem/search-by-article-oem-no -> array(277)
  PASS    normalisation -> 277 articles
```

## Documented endpoints in use

| Purpose | Path |
|---|---|
| Reference / connectivity gate | `GET /languages/list` |
| **Primary OEM search** | `GET /articles-oem/search-by-article-oem-no?langId=&articleOemNo=` |
| Equal OEM references | `GET /articles-oem/search-all-equal-oem-no/lang-id/{}/article-oem-no/{}` |
| Vehicle applicability | `GET /articles-oem/selecting-a-list-of-cars-for-oem-part-number/type-id/{}/lang-id/{}/country-filter-id/{}/manufacturer-id/{}/article-oem-no/{}` |
| OEM parts for a known vehicle | `GET /articles-oem/selecting-oem-parts-vehicle-modification-description-product-group/…` — **not wired**, needs a provider `vehicle-id` |
| Aftermarket cross-references | `GET /artlookup/search-for-the-oem-cross-references-through-aftermarket-parts-references/article-oem-no/{}` |
| Analogues | `GET /artlookup/search-for-analogue-of-spare-parts-by-oem-number/article-oem-no/{}` |
| Article cross-references | `GET /artlookup/select-article-cross-references/article-id/{}/lang-id/{}` |
| Article by number | `GET /artlookup/search-articles-by-article-no?articleNo=&langId=` |
| Partial match | `GET /artlookup/select-article-cross-references-partial-match?articleNo=&langId=` — **discovery only** |

`AUTOPARTS_SEARCH_PATH` is **removed**. It existed only while the endpoint was
unknown.

## The live response shape, and what it taught us

Captured 2026-08-24. The first normaliser was written against guessed field
names and produced **zero** records from a 277-row response.

```
/languages/list      { lngId: "4", lngIso2: "en", lngDescription: "English (GB)" }
/articles-oem/…      { articleId, articleSearchNo, articleNo, articleProductName,
                       manufacturerId, manufacturerName, supplierId, supplierName,
                       articleMediaType, articleMediaFileName, s3image }
```

Three things were only discoverable by calling it:

1. **`supplierName` is the part brand; `manufacturerName` is the vehicle
   marque.** Reading `manufacturerName` as the brand would print "CHRYSLER" on
   an estimate line for an NPS brake pad.
2. **`lngId` is a string, and English is named "English (GB)".** An equality
   check on `"english"` reported `malformed` against a perfectly good response.
3. **OEM numbers collide across marques.** Searching Toyota's `04465-0K340`
   returns rows under CHRYSLER and FORD as well as TOYOTA. An exact digit match
   is therefore **not** on its own evidence about the vehicle on the estimate —
   a row for the wrong marque is downgraded to `unverified` and says why.

Fixture: `lib/parts/__tests__/fixtures/autopartsapi-oem-search.json` — 3 rows
of 277, media filenames and image paths redacted, no credential.

## Evidence model (§11–13)

Six provider answers, kept distinct:

| Evidence | Weight | Establishes equivalence? |
|---|---|---|
| exact OEM hit | 40 | **yes** |
| cross-reference | 40 (shared) | **yes** |
| vehicle applicability | 30 | no — it answers fitment |
| MPN relation | 15 | no |
| equal OEM | 10 | **yes** |
| analogue | 5 | no |
| partial match | **0** | no |

`exact_oem` and `cross_reference` share one 40-point slot — both say nearly the
same thing and holding both must not total 80. Each **kind** counts once, so a
chatty endpoint cannot manufacture confidence.

There is **no second-provider component**: one catalogue must not score as
though two agreed.

`VERIFIED EQUIVALENT` requires authoritative evidence — exact OEM, equal OEM,
or an explicit cross-reference. **A score threshold can never produce it.**
Partial matches are discovery only and can never independently create a
verified equivalent or a verified fit.

## Fitment from applicability only

`verified` requires make **and** model to match a returned applicability
record, with the estimate's year inside that record's window. A year outside
the window is `likely`, **not** `incompatible` — the provider describes what it
lists, and absence is not a rejection. This endpoint never produces
`incompatible`.

Applicability is fetched only when an OEM search returned articles **and** the
estimate has a vehicle to check against — an applicability list with nothing to
compare it to is a call spent for nothing.

## Catalogue results carry no price

`itemPrice`, `shippingCost` and `landedCost` are all absent;
`landedCostCompleteness` is `unknown`, never a zero that would rank a catalogue
row as the cheapest option. In the estimate the modal shows **"Price
unavailable from this source"**, forces manual pricing, and the technician
enters the sell price through the existing controls.

## Catalogue fitment

A catalogue publishes **identity**, not an offer. Normalised results carry no
price, no shipping and no landed cost — `landedCostCompleteness: 'unknown'`,
never a zero that would rank them as free.

A catalogue match yields **`likely` at best**, and only on a real part-number
or OEM match. It can never yield `verified`: "this article corresponds to that
OEM number" is not "this fits the vehicle in bay three".

## What is NOT proven

- **No live provider call has ever been made.** No credentials exist in this
  environment, so the eBay adapter's request path, token exchange and
  compatibility filter are covered by unit tests against fixtures only.
- Playwright specs for this flow are written but **were not executed** — they
  need an authenticated session this environment does not have.
- No real signed-in browser verification of the modal.
