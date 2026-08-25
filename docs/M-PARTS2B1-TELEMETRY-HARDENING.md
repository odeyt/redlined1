# M-PARTS2B.1 — Provider usage telemetry hardening

M-PARTS2B recorded **7** provider calls and made **10**.

## The reported cause was not the whole cause

The condition was written up as "ad-hoc probe scripts used the provider client
without usage context". True, and incomplete. The audit found that
**`oem_search` — the lookup every technician triggers — passed no context
either.** So did `oem_applicability` and both cross-reference calls.

Ordinary application traffic was invisible in the monthly figure. A number that
silently excludes the main path is worse than no number, because it reads as
complete.

## The fix is structural, not procedural

`autoPartsApiRequest` now takes a **required** `UsageContext`. The parameter was
optional; the calls that omitted it vanished. Requiring it turns *remember to
pass a context* into *will not compile* — the only version that stays true as
the codebase grows.

The compiler then found every offender:

```
lib/parts/providers/autopartsapi/provider.ts:95    oem_search        application
lib/parts/providers/autopartsapi/provider.ts:108   oem_applicability application
lib/parts/providers/autopartsapi/provider.ts:190   cross_reference   application
lib/parts/providers/autopartsapi/provider.ts:191   cross_reference   application
lib/parts/providers/autopartsapi/client.ts:269     reference         application
scripts/qa-autopartsapi-connectivity.ts            reference/oem     qa
scripts/qa-autopartsapi-shape.ts                   reference/oem     manual_probe
scripts/qa-parts2b-live-proof.ts                   4 categories      qa
```

## Call contexts

```
application    a technician's search, through the app
qa             a repeatable QA/verification script
migration      one-off data work
maintenance    scheduled or operational
manual_probe   exploratory, run by hand
```

## An untenanted call is still a call

`recordUsage` began with `if (!record.shopId) return;`. QA scripts, probes and
maintenance have no tenant, so every one of their calls was dropped — the
second half of the 7-vs-10 gap.

`shop_id` is now nullable and those rows land. `usageSummary(null)` reports
across every context; `usageSummary(shopId)` scopes to one shop.

## Three outcomes, never one counter

| | spends quota | meaning |
|---|---|---|
| `external` | **yes** | a real request left this process |
| `cache_hit` | no | our cache answered |
| `coalesced` | no | an identical request was already in flight; this caller waited |

`cache_hit` as a boolean could not tell the last two apart. They are different:
a coalesced waiter stored nothing, two callers shared one journey. Collapsing
them makes the cache look more effective than it is.

**A failed call is still `external`.** It spent a request. Counting only
successes understates the month in the direction that hides a problem.

## What is stored, and what is not

```
stored      shop_id (nullable) · provider · endpoint_category · call_context
            outcome · success · failure_kind · status_class · latency_ms
never       API key · authorization header · raw URL · OEM query
            search query · full VIN · customer PII
```

A URL carries the part a shop is looking up. A table of them becomes a record
of what that shop is quoting, and quota accounting does not need it. An
endpoint **category** answers "where did the month go" without becoming search
history.

## The diagnostic never claims a balance

```
Today          external 6 · cache hits 19 · coalesced 2
This month     application 31 · qa 8 · manual probes 3 · total 42
Nominal free-plan allowance: 100 calls/month
Locally recorded calls. Provider-side usage is authoritative.
```

AutoPartsAPI does not report remaining quota, so nothing here is presented as
one. A test asserts no `remaining:` field and no computed
`allowance − used` exists.

Thresholds over the local count, configurable:

```
< 70%    NORMAL
70–89%   WARNING
>= 90%   CRITICAL
```

CRITICAL does not block manual estimating, and never blocks Parts Intelligence
merely because local telemetry is imperfect — it is a floor, not a balance.

## Migration

`2026-08-25_m_parts2b1_usage_context.sql` — additive. `shop_id` becomes
nullable; `call_context`, `outcome`, `status_class` and `latency_ms` are added
with CHECK constraints; existing rows are backfilled from the old `cache_hit`
boolean and assumed `application`. The verification block raises if `shop_id`
is still NOT NULL, if any column is missing, if the backfill left nulls, or if
`authenticated` has gained INSERT.

## No live calls in CI

A test enumerates `scripts/*autoparts*` and `scripts/*parts2b*` and fails if any
provider-calling script omits `callContext`. Another asserts `jest.config.ts`
does not include `scripts/`. A live provider call in CI is a quota that
disappears by the 12th.
