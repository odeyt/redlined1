# Customer portal — rollout runbook

Status at time of writing (2026-10-13): **not live.** The code, migrations and
tests are in the PR that adds this file. Nothing below has been run against
production or staging. Production project: `redlined1` / `ldjrlvjkmzrcdqhetqoh`;
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
