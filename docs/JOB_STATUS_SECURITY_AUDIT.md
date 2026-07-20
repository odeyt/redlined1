# `/api/job-status` Security Hardening

Companion to [`docs/LIVE_RLS_VERIFICATION.md`](LIVE_RLS_VERIFICATION.md) (Phase A of the
same task). This document covers Phase B: state-machine validation,
idempotency, shop validation, audit logging, and a normalized error contract
for `app/api/job-status/route.ts`.

## Current architecture (as read, before any change)

`app/api/job-status/route.ts` exposes three methods:

- **`PUT`** — shop-staff-authenticated. Generates (or returns the existing)
  public status-tracking `status_token` for a job, and initializes
  `repair_stage`/`stage_history` if this is the first call.
- **`POST`** — shop-staff-authenticated. Advances `repair_stage` to a
  client-specified value and appends a `stage_history` entry.
- **`GET`** — intentionally public. Fetches job status by the opaque
  `status_token` (the customer-facing tracker link) — no shop auth, by
  design; the token itself is the credential.

Authorization for `PUT`/`POST` already went through `requireShopRole()`
(`lib/serverAuth.ts`): verifies the bearer token server-side via
`admin.auth.getUser()`, looks up the caller's own `shop_users` row for the
body's `shopId`, and rejects with 403 if no membership exists — the client's
`shopId` was already treated as a resource identifier only, never trusted as
proof of membership. Every `job_cards` query was already scoped with both
`.eq('id', jobId)` and `.eq('shop_id', shopId)`, so a caller could not act on
another shop's job by id-guessing. This part of the design was already sound
and is preserved unchanged.

**What was missing, confirmed by reading the code before any edit:**

1. **No transition validation at all.** `POST` accepted any of the 6 valid
   `repair_stage` enum values (validated only for *shape* by
   `RepairStageSchema`, not for *legality* given the job's current stage) and
   wrote it directly — a caller could jump `checked_in` straight to `ready`,
   or move a `ready` job back to `checked_in`, in one call.
2. **No idempotency protection.** A double-tap, retried request, or network
   replay would append a second (or third...) identical entry to
   `stage_history` and re-run the update, with no mechanism to detect or
   collapse duplicates.
3. **No audit trail.** Nothing recorded who advanced a job, when, or from
   which stage to which — only the ad hoc `stage_history` array on the job
   row itself, which has no user id, no shop id, and can be edited in place
   by the same update, not appended immutably outside the row.
4. **Unstructured errors.** Failures returned `{ error: string }` with
   varying messages, no machine-readable code, and no `retryable` signal —
   fine for a human reading a browser console, not for the mobile app's
   `AdvanceStageError` kind-matching (`src/services/jobStatusApi.ts` in the
   REDLINE MOBILE repo, not modified by this task) to branch on reliably
   beyond raw HTTP status.
5. **Minor gap, fixed in passing:** `PUT`'s token-generation `UPDATE` was
   missing `.eq('shop_id', shopId)` (only `.eq('id', jobId)`). Since
   `job_cards.id` is a globally unique text primary key, this was not
   actually cross-shop-exploitable — but it broke the "every job_cards query
   is shop-scoped" invariant the rest of the file follows, so it's fixed
   here too.

## Changes made

- **`lib/jobStatusTransitions.ts`** (new) — pure, dependency-free module:
  `isValidTransition(from, to)`, `predecessorOf(stage)`, `isAfter(a, b)`,
  built on `REPAIR_STAGE_ORDER` (re-exported from the existing
  `REPAIR_STAGES` in `lib/schemas.ts` — one source of truth, not a third
  duplicate list).
- **`app/api/job-status/route.ts`** — rewritten `PUT`/`POST`/`GET` handlers:
  state-machine check, idempotent-replay short-circuit, atomic
  compare-and-swap update, best-effort audit-log write, and the new
  structured error contract applied to every response, success or failure.
- **`supabase/migrations/job_status_audit_log.sql`** (new, **not executed**)
  — additive migration for the `job_status_transitions` table (see
  Idempotency strategy and Audit log sections below).
- **`app/api/job-status/__tests__/route.test.ts`** — rewritten with a
  richer mock harness (a per-test queue of sequential `job_cards` results,
  since the new logic reads, then conditionally writes, then sometimes
  re-reads) and all required new scenarios.
- **`lib/__tests__/jobStatusTransitions.test.ts`** (new) — direct unit
  coverage of the state-machine module.

**Not changed:** `lib/serverAuth.ts` (shared by other routes — kept the
existing `{error: string}` contract for those; this route now translates its
result into the new structured shape locally, at the `job-status` boundary
only). No other `app/api/**` route was touched. No `.env*` files, no CI
config, no REDLINE MOBILE repository.

## Transition rules

Stage vocabulary is the **existing** 6-value list
(`checked_in → inspecting → waiting_parts → in_repair → quality_check →
ready`), not the illustrative 8-stage example
(Waiting/Diagnosing/Awaiting Authorization/.../Completed) referenced in this
task's own prompt. That example was explicitly framed as an *"Example:"* of
the ordering property required, not a literal schema to adopt — and this
repo's actual `job_cards.repair_stage` column, the web UI, `lib/schemas.ts`'s
`REPAIR_STAGES`, and the already-shipped REDLINED1 mobile app (a separate
repo this task forbids modifying) all read and write exactly the 6 existing
values. Adopting the 8-stage example vocabulary instead would have silently
broken the mobile app's stage display and validation without touching a
single line of its code. The requirement's actual intent — explicit
server-owned ordering, reject skip-ahead, reject backward, reject a
transition off a terminal stage — is fully satisfied using the real stage
list; see `docs/LIVE_RLS_VERIFICATION.md`'s "Data model note" for the
broader pattern of this schema having accumulated parallel/overlapping
concepts over time.

Rule: a transition from `current` to `target` is legal **only** if `target`
is the single immediate next stage after `current` in
`REPAIR_STAGE_ORDER`. Concretely:

| From → To | Legal? |
|---|---|
| `checked_in → inspecting` | ✅ (and each other adjacent forward pair) |
| `checked_in → waiting_parts` (skip) | ❌ `INVALID_JOB_TRANSITION` |
| `checked_in → ready` (skip) | ❌ `INVALID_JOB_TRANSITION` |
| `inspecting → checked_in` (backward) | ❌ `INVALID_JOB_TRANSITION` |
| `ready → in_repair` (backward from terminal) | ❌ `INVALID_JOB_TRANSITION` |
| `inspecting → inspecting` (no-op as a *new* transition) | Handled as **idempotent replay**, not an error — see below |

The server reads the job's actual `repair_stage` itself and validates
against *that*, never against anything the client claims its current stage
to be — the request body only ever names the desired target.

## Idempotency strategy

Two layers, covering both the common case and the genuine race:

1. **Early no-op check.** If the job's current `repair_stage` already equals
   the requested target, the handler returns the same `{ ok: true, stage,
   history }` success shape immediately — no write, no new `stage_history`
   entry, no audit row. This is the common case for a double-tap or a
   client retry after a dropped response: the first call already succeeded,
   and the retry is recognized as already-satisfied rather than re-run.
2. **Atomic compare-and-swap for the race window.** Between the read above
   and the write, a second, concurrent request could have changed the row.
   The `UPDATE` is issued with `.eq('repair_stage', currentStage)` — the
   value read moments earlier — chained onto the existing `.eq('id',
   jobId).eq('shop_id', shopId)`. Postgres re-evaluates that `WHERE` clause
   against the row's live value at execution time and serializes concurrent
   writers, so **only one** of two racing, identical requests can ever
   match and update the row. The other sees zero rows affected
   (`.maybeSingle()` resolves to `data: null, error: null` for a
   non-matching `UPDATE`, exactly as it does for a non-matching `SELECT`)
   and re-reads the row to reconcile:
   - Actual stage now equals the target → the concurrent request won and
     reached the same place this one wanted → **success**, not an error.
   - Actual stage is further along `REPAIR_STAGE_ORDER` than the target →
     the job has moved past where this request expected → `409
     JOB_ALREADY_UPDATED`, not retryable (retrying won't help; the caller's
     view is stale and it needs to refetch).
   - Anything else (an unexpected intermediate state) → `409 CONFLICT`,
     retryable — the caller can refetch current state and decide whether to
     resubmit.

This guarantees **at most one** actual `job_cards` write and **at most one**
audit-log row per logical transition, regardless of how many duplicate,
retried, or replayed HTTP requests arrive for it — without requiring the
existing (unmodified) mobile or web clients to send any new
idempotency-key header. No client change was needed for this to work.

## Shop validation

Unchanged authorization chain, now explicitly documented in the route's own
comment block: authenticated (bearer token, via `requireShopRole`) →
membership (caller's own `shop_users` row for the body's `shopId`) → job
belongs to that shop (`.eq('shop_id', shopId)` on every `job_cards` query) →
role (trivially satisfied — this route intentionally still allows all 4
shop roles to advance stages, matching its original, documented design; this
hardening pass does not add a new role restriction that wasn't asked for) →
allowed transition (new, this pass) → perform update (new atomic-CAS write,
this pass).

A job that doesn't belong to the caller-authorized shop is indistinguishable
from a job that doesn't exist at all — both resolve as `404
JOB_NOT_FOUND` — deliberately, matching the same enumeration-prevention
pattern `lib/serverAuth.ts` already uses for shop membership itself (see
that file's own doc comment). The client-supplied `shopId` is never trusted
as anything other than a lookup key for the caller's own verified
membership; this was already true before this pass and is unchanged.

## Audit log

New table `job_status_transitions` (migration drafted at
`supabase/migrations/job_status_audit_log.sql`, **not executed against
production** — this task's stop conditions forbid modifying the production
database). Columns: `id, job_id, shop_id, user_id, from_stage, to_stage,
request_id, created_at`. Never stores VIN, customer name, or any other
PII — `job_cards.id` is an opaque `JC-<timestamp>` string, not a VIN, and no
other field is captured.

**Why a new table instead of the existing `public.audit_logs`:** that table
(confirmed by reading `supabase-schema.sql`) has schema `id, action, "user"
text, entity, time, created_at` — no `shop_id`, no structured old/new-value
columns, and `"user"` is free text, not a `uuid` foreign key to
`auth.users`. It cannot represent this route's transition records without a
reshape, so a purpose-built table was drafted instead. RLS is enabled and
forced on it, with a shop-scoped `SELECT` policy for `authenticated`
(depends on `public.my_shop_ids()` — see
`docs/LIVE_RLS_VERIFICATION.md`'s note that this function's own hardening
is a separate, currently-unapplied fix) and **no** `INSERT`/`UPDATE`/`DELETE`
policy or grant for `authenticated`/`anon` at all — only the service-role
client (which the route already uses) can write to it.

The insert is **best-effort**: wrapped so a failure (most likely because the
migration above hasn't been applied yet in a given environment) is logged
server-side via the existing `sanitizeError()` helper and never blocks or
reverses the state transition, which has already committed to `job_cards`
by the time the audit write is attempted. This is deliberate — an audit
trail must never become a hard dependency that breaks the primary business
action (a technician being unable to advance a job because a logging table
is momentarily missing would be a worse outcome than one missing log row).
Covered by test: *"an audit-log insert failure never blocks or reverses an
already-successful transition."*

**Phase 10 re-review (mobile-production-readiness task):** re-read the
migration against that task's more detailed audit-log checklist. One gap
found and fixed: `request_id` had no uniqueness constraint. Added
`UNIQUE (request_id)` — `request_id` is always server-generated via
`crypto.randomUUID()` per request, never client-supplied, so this is a
data-integrity guarantee (one HTTP request can produce at most one audit
row) rather than a defense against a hostile client. Every other item on
that checklist (schema correctness, RLS enabled, clients cannot insert
directly, protected route can insert, read access restricted, no
unnecessary PII, all required fields present, fail-open documented) was
already satisfied by the original design and is unchanged.

## Error contract

Every response from this route — success or failure — is JSON. Every
failure is now `{ code, message, retryable }`:

| Code | HTTP status | retryable | When |
|---|---|---|---|
| `INVALID_REQUEST` | 400 | false | Malformed JSON, schema violation, missing token (`GET`) |
| `UNAUTHENTICATED` | 401 | false | Missing or invalid bearer token |
| `NOT_MEMBER_OF_SHOP` | 403 | false | Caller has no `shop_users` row for the target shop |
| `ROLE_NOT_ALLOWED` | 403 | false | Defined for forward-compatibility; not reachable today — this route calls `requireShopRole` with its default (all 4 roles) allowlist, so a 403 here can currently only mean not-a-member. See "Known risks." |
| `JOB_NOT_FOUND` | 404 | false | No job matches `id` + `shop_id` (includes cross-shop and genuinely-nonexistent, indistinguishably) |
| `INVALID_JOB_TRANSITION` | 400 | false | Requested stage is not the single legal next step from the job's actual current stage |
| `JOB_ALREADY_UPDATED` | 409 | false | The job moved past the requested target while this request was processing |
| `CONFLICT` | 409 | true | The job's state changed unexpectedly during processing, in a way not cleanly explained as already-at-target or already-past-target |
| `INTERNAL_ERROR` | 500 | true | An unexpected Supabase/Postgres error — the raw error is logged server-side via `sanitizeError()` and never included in the response |

No response body from this route ever includes a raw Postgres/Supabase
error object, an exception message, or a stack trace — `sanitizeError()`
remains the only code path allowed to see the real error, and it only ever
writes it to the server console.

## Tests added

`app/api/job-status/__tests__/route.test.ts` (rewritten) and
`lib/__tests__/jobStatusTransitions.test.ts` (new) — 38 tests total for this
route/module, covering every scenario this task listed by name:

- Waiting → Diagnosing (`checked_in → inspecting`, success)
- Diagnosing → Waiting (`inspecting → checked_in`, fail, backward)
- Completed → Repair (`ready → in_repair`, fail, backward from terminal)
- Skip-ahead rejection (`checked_in → waiting_parts`, additional coverage
  beyond the named scenarios)
- Duplicate request (already-at-target early return, no second write)
- Replay request (CAS-race loser reconciled to success, distinct code path
  from the duplicate case above)
- Conflict handling (`409 CONFLICT`, retryable)
- `JOB_ALREADY_UPDATED` (`409`, job moved past target — related to but
  distinct from generic conflict)
- Cross-shop request (`404 JOB_NOT_FOUND`, not a distinguishable 403)
- Technician unauthorized (not a shop member — rejected before any
  `job_cards` read)
- Owner authorized / Manager authorized (shop member, valid transition,
  succeeds)
- Audit-log insert failure never blocks a successful transition
- Full `PUT`/`GET` coverage carried forward and adapted to the new
  structured error shape

Plus direct unit coverage of `isValidTransition`, `predecessorOf`, and
`isAfter` in isolation.

## Security review

- Client-submitted `stage` is now validated for *legality*, not just shape —
  closes the arbitrary-state-selection gap this task's Requirement 1 called
  out.
- Client-submitted `shopId` remains untrusted as anything but a lookup key
  (unchanged, already correct).
- No new attack surface: the new `job_status_transitions` table is
  read-only for `authenticated`/`anon` by construction (RLS forced, no
  write policy, no grant), and the audit write path only exists inside this
  already-service-role-authorized route.
- No secrets, raw errors, or PII newly exposed anywhere in this change.

## Known risks

1. **`ROLE_NOT_ALLOWED` is defined but currently unreachable** for this
   route, since `POST`/`PUT` call `requireShopRole` with its default
   allow-all-4-roles list, matching the route's original, intentional
   design ("advancing repair stages is routine frontline-staff work, not
   owner-only"). If a future requirement narrows which roles may perform a
   *specific* transition (e.g. only owner/manager may mark a job
   `Completed`), this code is now the correct place to add it, but doing so
   here was out of this task's stated scope (harden the existing endpoint,
   not add new role restrictions).
2. **The audit migration is not yet applied to production.** Until
   `supabase/migrations/job_status_audit_log.sql` is run, every transition
   silently produces zero audit rows (the insert fails and is swallowed by
   design) — the state-machine, idempotency, and shop-validation hardening
   all work regardless, but the audit trail itself has a hard dependency on
   this migration being deployed. See Deployment notes.
3. **This route's hardening does not, and cannot, fix the RLS gaps
   documented in `docs/LIVE_RLS_VERIFICATION.md`.** `job_cards` writes here
   go through the service-role client, which bypasses RLS entirely — this
   route was never relying on `job_cards` RLS for its own correctness, and
   still isn't. But a caller that bypasses this API and talks to
   PostgREST/Supabase directly (using the same anon key the mobile app
   ships) is governed entirely by whatever RLS policy is *actually* live on
   `job_cards`, which Phase A left **unverified**. Hardening this one route
   does not substitute for resolving that.
4. **`ROLE_NOT_ALLOWED` aside, the error-code vocabulary is specific to this
   route** — it is not a repo-wide convention (other routes still return
   `{ error: string }`). A future pass standardizing error shape across all
   of `app/api/**` would need to touch `lib/serverAuth.ts` and every
   route, which was explicitly out of scope here (keep changes scoped to
   `app/api/job-status`).

## Deployment notes

1. **Run `supabase/migrations/job_status_audit_log.sql`** against the
   target environment before (or immediately after) deploying this code —
   the route works correctly either way (audit insert fails safe), but the
   audit trail is empty until this runs. This is a production DB write and
   requires separate explicit approval per this task's stop conditions — it
   was **not** executed as part of this work.
2. Resolve `docs/LIVE_RLS_VERIFICATION.md`'s findings, in particular
   `public.my_shop_ids()`'s hardening (search_path pinning, EXECUTE grant
   restriction) — this route's new audit-log `SELECT` policy depends on
   that function, and per the "Known risks" already documented in
   `docs/PRODUCTION_SECURITY_REMEDIATION.sql`, revoking `PUBLIC` execute
   without granting `authenticated` in the same transaction would break
   every shop-scoped table's RLS simultaneously.
3. No environment variable, `.env.example`, or CI configuration changes were
   needed for this pass.
