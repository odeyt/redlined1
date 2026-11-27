# Customer portal — rollout runbook

Status (2026-10-13, after rollout): **Deployed; signed-out checks verified;
test-customer walkthrough pending.** The portal is not marked complete. See the
rollout record at the end of this file.

**Update (2026-10-14):** the valid-link failure is fixed in production by #87
(`b6fba37`), and the test-customer walkthrough passed its functional checks —
see the 2026-10-14 entries below. **Not yet complete:** the vehicle heading is
blank for vehicles named only in `label`; fix PR #88, not yet merged or
deployed. Production project: `redlined1` / `ldjrlvjkmzrcdqhetqoh`;
production Vercel project: `redlined1` under `redlined1-s-projects` (the
`d1-imports` project is a duplicate — do not deploy there).

The production security hold (`docs/security-hold-remediation-plan.md`) is
**still open**. This rollout does not touch `net`/pg_net or push dispatch, but
whether it may proceed while the hold is open is the owner's decision.

## Why the portal has never worked

1. `public.customers` has no `portal_token` column (API schema, information_schema
   and pg_attribute all agree). Every portal link resolved to nothing, and the
   staff "Portal Link" button never rendered.
2. `proxy.ts` session-gated `/portal/*` and `/api/portal/*`, so a signed-out
   customer was redirected to `/login` before the page ran.

## Order

Each step is safe to stop after. Do them in this order.

| # | Step | Customer-visible effect |
|---|------|-------------------------|
| 1 | Apply `2026-10-13_customer_portal_tokens.sql` | none (tokens exist; portal still gated) |
| 2 | Verify (queries below) | none |
| 3 | Apply `2026-10-13_revoke_client_truncate_customers_estimates.sql` | none |
| 4 | Verify (queries below) | none |
| 5 | Merge the PR → Vercel production deploy (`redlined1-s-projects/redlined1`) | portal links open signed out; staff see the Portal Link button |
| 6 | Signed-out checks against redlined1.com | — |

Do **not** deploy (step 5) before step 1: with the code live and no token table,
every portal link shows "Portal Not Found" and the server logs
`portal schema missing — apply 2026-10-13_customer_portal_tokens.sql`. Nothing
breaks for staff, but the Portal Link button returns an error.

Do **not** run `supabase/rls_phase7.sql` or install its `customers_portal_read` /
`estimates_portal_update` policies. The portal never needs anon table access.

## Step 1–2: token table

Pre-check (expect `customers_id_type = text`, `token_table = null`):

```sql
select format_type(a.atttypid, a.atttypmod) as customers_id_type,
       to_regclass('public.customer_portal_tokens') as token_table
  from pg_attribute a
 where a.attrelid = 'public.customers'::regclass and a.attname = 'id';
```

Apply: paste `supabase/migrations/2026-10-13_customer_portal_tokens.sql` into
the SQL editor and run it once. It is one transaction; on any error nothing is
changed. Re-running it is harmless and keeps existing tokens.

Verify (no token values are selected):

```sql
-- every customer has exactly one well-formed token; none shared
select (select count(*) from public.customers)                                         as customers,
       (select count(*) from public.customer_portal_tokens)                            as tokens,
       (select count(*) from public.customers c
          left join public.customer_portal_tokens t on t.customer_id = c.id
         where t.customer_id is null)                                                  as missing,
       (select count(*) from public.customer_portal_tokens where token !~ '^[0-9a-f]{64}$') as malformed,
       (select count(*) - count(distinct token) from public.customer_portal_tokens)    as duplicates;
-- expect: customers = tokens, missing = 0, malformed = 0, duplicates = 0

-- client roles hold nothing on the token table (catalog, not information_schema)
select g.role, a.privilege_type
  from pg_class c, lateral aclexplode(c.relacl) a,
       lateral (select case when a.grantee = 0 then 'PUBLIC' else a.grantee::regrole::text end as role) g
 where c.oid = 'public.customer_portal_tokens'::regclass
   and g.role in ('PUBLIC', 'anon', 'authenticated');
-- expect: 0 rows

select relrowsecurity,
       (select count(*) from pg_policies where tablename = 'customer_portal_tokens') as policies,
       (select count(*) from pg_trigger where tgname = 'customers_provision_portal_token') as trigger
  from pg_class where oid = 'public.customer_portal_tokens'::regclass;
-- expect: t, 0, 1
```

## Step 3–4: TRUNCATE

Pre-check — record the output; it is what the rollback restores:

```sql
select c.relname, g.role, a.privilege_type
  from pg_class c, lateral aclexplode(c.relacl) a,
       lateral (select case when a.grantee = 0 then 'PUBLIC' else a.grantee::regrole::text end as role) g
 where c.oid in ('public.customers'::regclass, 'public.estimates'::regclass)
   and g.role in ('PUBLIC', 'anon', 'authenticated') and a.privilege_type = 'TRUNCATE';
```

Apply `supabase/migrations/2026-10-13_revoke_client_truncate_customers_estimates.sql`,
then re-run the pre-check: expect 0 rows. Never test with an actual `TRUNCATE`
on production tables.

## Step 6: signed-out checks (after deploy)

Use a synthetic, never-issued token — do not enumerate real customer links.

```bash
curl -s -o /dev/null -D - https://www.redlined1.com/portal/0000000000000000000000000000000000000000000000000000000000000000 | grep -iE "^HTTP|cache-control|referrer-policy|x-robots-tag"
```
Expect `200`, `private, no-store`, `no-referrer`, `noindex, nofollow`, body "Portal Not Found" (not a redirect to /login).

```bash
curl -s -X POST -H "content-type: application/json" -d '{"token":"0000000000000000000000000000000000000000000000000000000000000000","estimateId":"11111111-1111-4111-8111-111111111111","action":"approve"}' https://www.redlined1.com/api/portal/estimate-action
```
Expect `404 {"error":"Estimate not found."}` (a 500 means the token table is missing — see the server log).

```bash
curl -s -o /dev/null -w "%{http_code} %{redirect_url}\n" https://www.redlined1.com/status/x
```
Expect `307 …/login` — `/status`, `/inspection`, `/api/portal/*` other than estimate-action, and all staff pages stay gated.

Then, signed in as staff, open a **test** customer (create one if needed), click
**Portal Link**, open the copied link in a private window, and check that the
customer's own invoices/estimates/totals show and an estimate can be approved
once. Don't message a real customer until this passes.

## Rollback

| Undo | How | Effect |
|------|-----|--------|
| Portal access only | Revert the `proxy.ts` change and redeploy | Links redirect to /login again; tokens kept, so links work again on re-enable |
| TRUNCATE revoke | `2026-10-13_revoke_client_truncate_customers_estimates_rollback.sql` | Reopens anon/authenticated TRUNCATE (the hole). Only if a real dependency appears |
| Token table | `2026-10-13_customer_portal_tokens_rollback.sql` | Deletes every token: every shared link dies, and re-applying issues **new** ones. Only before links are in use |

Do not rotate all customer tokens as a rollback.

## Known limits

- No rate limit on the public routes. The only limiter (`api_rate_limit_hit`)
  is keyed to API keys. Tokens carry 244 random bits, so guessing is not viable.
- The token is in the URL path, so it appears in Vercel request logs and the
  customer's browser history. `Referrer-Policy: no-referrer` stops it leaking
  to other sites.
- `getAdminDb()` falls back to the anon key if `SUPABASE_SERVICE_ROLE_KEY` is
  unset. With this design that fails closed (anon cannot read the token table).
- Wider anon/authenticated grant issues beyond TRUNCATE on these two tables are
  not changed here.
- `/status/[token]` and `/inspection/[token]` share links have the same
  login-redirect problem and stay gated: their handlers need review first
  (e.g. `inspection-share` returns `select('*')`, which may include VIN).

## Rollout record (2026-10-13)

Observed evidence only. Staging was skipped on the owner's instruction. This
was a scoped exception for #85; it does **not** clear the wider production
security hold (pg_net / push secret), which is unchanged.

**Database** — both migrations were applied in production by the owner
(Claude Code was not permitted production database access).

- *Direct production verification (ChatGPT, as reported by the owner):* both
  migrations were verified directly against production — backup confirmed,
  pre-check, Verify 1 (token migration) and Verify 2 (TRUNCATE revoke) passed.
  The raw query output was not provided to Claude Code and is not reproduced
  here.
- *Verification SQL:* the pre-check / Verify 1 / Verify 2 queries handed over
  for this rollout were first run against the exact migration files from
  `529ee55` in a throwaway local container. Both verifications passed there,
  and a negative control (a deliberate PUBLIC grant on the token table,
  generator and `customers` TRUNCATE) was caught by both.
- *Independent read-only re-check by Claude Code, from the API, after rollout:*

| Check | Result |
|-------|--------|
| `customers` / `customer_portal_tokens` row counts (HEAD count only) | 185 / 185 |
| Token table and generator visible in the **anon** API schema | no / no |
| anon `GET /rest/v1/customer_portal_tokens` | 401, Postgres 42501 (permission denied) |
| anon `POST /rest/v1/rpc/new_customer_portal_token` | 401 |

**Code** — PR #85 merged by the owner 2026-10-13T06:51:00Z, merge
`68a1209b0d3b5cab66ebede494307f3c8129ea14`. `main`'s tree is identical to the
reviewed head `529ee55b7f6a156f312042f6df4f7582c6f06f85`.

**Deploy** — `redlined1-s-projects/redlined1` production deployment
`redlined1-i9g6hny5i`, built from `githubCommitSha=68a1209…`, Ready, aliased to
`www.redlined1.com` and `redlined1.com`. `d1-imports` not touched.

**Signed-out checks on www.redlined1.com** (synthetic tokens only):

| Request | Result |
|---------|--------|
| `GET /portal/<64 zeroes>`, `GET /portal/not-a-token` | 200 "Portal Not Found"; `private, no-store`; `no-referrer`; `noindex, nofollow` |
| `POST /api/portal/estimate-action` — unknown token; malformed token/id | 404 `Estimate not found.` (identical) |
| same — bad action; non-JSON body | 400 |
| `/portal`, `/portal/a/b`, `/portals/x`, `/status/x`, `/inspection/x`, `/customers`, `/settings`, `/dashboard` | 307 → /login |
| `/api/portal`, `/api/portal/other`, `/api/portal/estimate-action/x`, `POST /api/customers/portal-link`, `POST /api/inspection-approve` | 401 |

**Pending** — authenticated walkthrough with a clearly labeled synthetic test
customer (staff Portal Link → open signed out → own documents and totals →
approve one synthetic estimate → replay refused). Not run: needs a staff
session and writes to production.

## 2026-10-14 — valid links fail on the #85 deployment

**Reported by ChatGPT (direct observation, not repeated by Claude Code):** on
production build `68a1209`, a 64-hex link copied through the staff Portal Link
button for a synthetic customer opened "Portal Not Found" after sign-out; both
synthetic customers have exactly one token; reproducing the portal's vehicles
SELECT in production returned SQLSTATE 42703, `column "license_plate" does not
exist`.

**Observed by Claude Code (read-only API schema metadata, column names only):**
`public.vehicles` has `plate` and no `license_plate` or `color`. Every other
column the portal names explicitly — customers, shops, shop_settings, invoices,
estimates, inspections, repair_orders, payments, customer_portal_tokens —
exists. `inspections.technician_name` is also absent, but is only read from a
`select('*')` row, so it shows blank rather than failing.

**Cause:** #85 replaced the vehicles `select('*')` with an explicit list naming
`license_plate, color`; the query error made the fail-closed loader return
null for every valid link.

**Fix:** PR #87 (`f77eb74`) selects `plate`, drops `color`, and adds a loader
test against production's column names (restoring #85's columns fails it).
Full suite 5,254 tests passing; typecheck, lint and build pass.
**Not yet merged or deployed** as of this entry; the merge could not be run
from Claude Code's session (permission guard), and the test-customer
walkthrough still needs a signed-in staff session.

Status unchanged otherwise: not complete; the pg_net security hold remains open.

## 2026-10-14 — #87 deployed; test-customer walkthrough

**Deploy (observed by Claude Code):** PR #87 merged 2026-10-14T02:04:51Z as
`b6fba37` (tree identical to reviewed `f77eb74`).
`redlined1-s-projects/redlined1` production deployment `redlined1-auxgirx3f`,
built from `b6fba37`, Ready, aliased to `www.redlined1.com` and
`redlined1.com`. Signed-out checks re-run on it: synthetic token → 200 "Portal
Not Found" with `private, no-store` / `no-referrer` / `noindex, nofollow`;
estimate-action 404 for unknown/malformed token, 400 for a bad action;
`/portal`, nested paths, `/status`, `/inspection`, staff pages and the staff
link route still gated. `redlined1.com/portal/…` 308-redirects to `www`.

**Walkthrough** — synthetic fixtures only, shop `38d55fae…` (Location 1):
customer A `C-1791936075575` (vehicle plate QA-A-1014, INV-0201, EST-0041),
customer B `C-1791936259074` (EST-0042).

| Check | Result | Source |
|-------|--------|--------|
| Real link (copied via staff Portal Link) loads signed out | passed — portal GET with a real 64-hex token answered 200 at 03:20:19Z and 03:21:30Z, after the #87 deploy | owner; request log (token masked) |
| INV-0201 total $106.35 | passed | owner (screenshot) |
| B's EST-0042 absent from A's portal | passed; EST-0042 still `Sent` | owner; database |
| EST-0041 approved from the portal | passed — `status = Approved`, `approved_date = 2026-10-14T03:20:54Z`; exactly one `POST /api/portal/estimate-action` → 200 at 03:20:54Z | owner; database; request log |
| Approval audited | `estimate.approved`, actor `system`, role `customer`, metadata `{"source":"customer_portal"}`, 03:20:57Z | audit_events |
| Refresh keeps Approved, no buttons | passed | owner |
| Vehicle heading | **failed (display only)** — plate shows, heading blank; the vehicle's name is in `label`, the portal used empty year/make/model | owner; fix PR #88 |

A repeat approve was not attempted live (no button after refresh); the
server-side repeat/concurrency protection is covered by unit tests and the
local Postgres race test.

An earlier real-token portal request at 01:21:58Z predates the #87 deploy
(02:04:54Z) and does not count toward this walkthrough.

**Status:** not complete until #88 is deployed and the vehicle heading is
confirmed. Fixture cleanup (customers A/B, INV-0201, EST-0041, EST-0042) is
outstanding. The pg_net security hold remains open.
