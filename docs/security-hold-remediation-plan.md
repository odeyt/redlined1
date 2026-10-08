# Production security hold — remediation plan

**Status: hold OPEN. This is a plan, not a record of changes.** Nothing in it
has been carried out: no secret rotated, no grant changed, nothing deployed, hold
not lifted. The 2026-10-07 completion-date exception
(`docs/completion-date-stamps-rollout.md`) covered only that rollout.

Production: `redlined1` (`ldjrlvjkmzrcdqhetqoh`).

## What is known, and how well

First found 2026-09-16 and owner-verified on 2026-09-24. **Baseline re-read by
the owner on 2026-10-08** (production SQL editor, read-only; queries in step 1).
This is a read of the current state, **not a complete security audit**.

**Baseline, 2026-10-08:**

| Check | Value |
|---|---|
| `net` tables with any PUBLIC privilege | **3**, holding **19** privileges in total |
| `net` functions PUBLIC can EXECUTE | **12** |
| Same counts via `information_schema.role_*_grants` | 0 / 0 (these views do not list PUBLIC grants; see step 1) |
| Vault `push_webhook_secret` last updated | 2026-09-14 12:05:45 UTC (**not rotated**) |
| Its md5 prefix | `c924c0d1` (a prefix of a hash, not the secret) |
| `notify_push_on_alert()` reads the secret from Vault | true |
| Trigger `alert_events_push` | enabled (`O`) |
| pg_net version | 0.20.3 |
| `net` schema USAGE | PUBLIC, `anon` and `authenticated` all have it |
| `net` in the API's exposed schemas | **not yet read** (cut off in the screenshot) |

| `net` table | PUBLIC privileges | `anon` can SELECT |
|---|---|---|
| `http_request_queue` | all: SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN | yes |
| `_http_response` | all, as above | yes |
| `http_request_queue_id_seq` | SELECT, UPDATE, USAGE | yes |

The 2026-09-24 note's "19 tables" was 19 privileges on these 3 tables; the
exposure is the same. A `REVOKE` run as `postgres` is a silent no-op, because
these objects belong to the extension's owner. Supabase support ticket
**SU-476058** was opened for it.

The live `public.notify_push_on_alert()` reads its secret from Vault. The
repository migration has a placeholder inline instead, so the live function
differs from the repository.

**Why it matters:**

- **Read.** Each push is queued in `net.http_request_queue` with the secret in
  the `x-push-secret` request header. pg_net normally deletes a queue row once
  the request is sent, so each push exposes the secret only briefly, but one
  successful read leaks it for good. With it, anyone can send notifications to
  the shop's phones through `/api/push/send`.
- **Write.** PUBLIC can also INSERT, UPDATE and DELETE in the queue. A queued
  row is an HTTP request that Supabase's server sends, so this would let a caller
  make the server send arbitrary requests, or drop and alter pushes.
- **Reachability.** The public anon key reaches these tables through the REST
  API only if `net` is one of the API's exposed schemas (Project Settings → Data
  API → Exposed schemas, or `pgrst.db_schemas` on the `authenticator` role). That
  has not been read yet. If `net` is not exposed, there is no browser path today,
  but the grants still need closing: any role that can run SQL keeps them.

**From the repository (read in the closeout, current as of `main` 3b6b69b):**

| Part | Where | Role |
|---|---|---|
| Trigger `alert_events_push` | `public.alert_events`, AFTER INSERT | Calls `notify_push_on_alert()` for every alert |
| `public.notify_push_on_alert()` | `supabase/migrations/2026-08-16_push_on_alert_webhook.sql` (placeholder secret); live version reads Vault | `net.http_post` to `https://www.redlined1.com/api/push/send` with header `x-push-secret` |
| `/api/push/send` | `app/api/push/send/route.ts` | Rejects with 401 unless `x-push-secret` equals Vercel env `PUSH_WEBHOOK_SECRET`; 503 if push keys are missing |
| `PUSH_WEBHOOK_SECRET` | Vercel project `redlined1-s-projects/redlined1` (production) | The value the route compares against |
| Alert writers | AFTER triggers on `job_cards`, `repair_orders` and others that insert `alert_events` | Every alert produces one push request |

## Order of work

**Close the read exposure first, then rotate.** Rotating while PUBLIC can still
read the pg_net queue would leak the new secret the same way.

### 1. Confirm the current state (read-only, owner runs)

**Do not use `information_schema.role_table_grants` or `role_routine_grants`
for this.** They returned 0 / 0 on 2026-10-08 while the grants above were in
place, so they would report the problem fixed when it is not. Read the catalogs
instead. Baseline values are in the tables above; after step 2 the first three
columns must all be 0.

```sql
SELECT
  (SELECT count(DISTINCT c.oid)
     FROM pg_class c
     JOIN pg_namespace n ON n.oid = c.relnamespace
     CROSS JOIN LATERAL aclexplode(coalesce(c.relacl, acldefault('r', c.relowner))) a
    WHERE n.nspname = 'net' AND a.grantee = 0)                          AS public_net_tables,
  (SELECT count(*)
     FROM pg_class c
     JOIN pg_namespace n ON n.oid = c.relnamespace
     CROSS JOIN LATERAL aclexplode(coalesce(c.relacl, acldefault('r', c.relowner))) a
    WHERE n.nspname = 'net' AND a.grantee = 0)                          AS public_net_table_privileges,
  (SELECT count(DISTINCT p.oid)
     FROM pg_proc p
     JOIN pg_namespace n ON n.oid = p.pronamespace
     CROSS JOIN LATERAL aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
    WHERE n.nspname = 'net' AND a.grantee = 0 AND a.privilege_type = 'EXECUTE') AS public_net_functions,
  has_schema_privilege('anon', 'net', 'USAGE')                          AS anon_schema_usage,
  has_table_privilege('anon', 'net.http_request_queue', 'SELECT')       AS anon_queue_select,
  has_table_privilege('anon', 'net.http_request_queue', 'INSERT')       AS anon_queue_insert,
  -- Vault entry: when it last changed, and an 8-character md5 prefix (no value shown).
  (SELECT updated_at FROM vault.secrets WHERE name = 'push_webhook_secret') AS vault_secret_updated_at,
  (SELECT left(md5(decrypted_secret), 8) FROM vault.decrypted_secrets
    WHERE name = 'push_webhook_secret')                                 AS vault_secret_md5_prefix,
  (SELECT pg_get_functiondef(to_regproc('public.notify_push_on_alert')::oid)
          ILIKE '%push_webhook_secret%')                                AS function_reads_vault,
  (SELECT string_agg(t.tgname::text || '=' || t.tgenabled::text, ', ')
     FROM pg_trigger t WHERE t.tgname = 'alert_events_push')            AS push_trigger_state;
```

`tgenabled` is the `"char"` type, so it needs the `::text` cast to concatenate.

Also read whether `net` is exposed by the API: Project Settings → Data API →
Exposed schemas, or
`SELECT array_to_string(rolconfig, '; ') FROM pg_roles WHERE rolname = 'authenticator';`
(look for `pgrst.db_schemas`).

### 2. Least-privilege pg_net (with Supabase)

- Follow up ticket SU-476058. Ask Supabase to revoke PUBLIC's grants on the `net`
  schema's tables and functions, keeping only what the extension and the
  `postgres`/`service_role` roles need. The app never calls pg_net from the
  browser, so `anon` and `authenticated` need nothing in `net`.
- Ask for the queue's write privileges (INSERT, UPDATE, DELETE, TRUNCATE) to be
  closed as well as SELECT; they let a caller make Supabase's server send
  arbitrary HTTP requests.
- **Interim, in the owner's control:** make sure `net` is not in the API's
  exposed schemas. That removes the anon-key REST path while the ticket is open.
  It does not close the grants.
- **Validate:** the step 1 catalog query shows `public_net_tables`,
  `public_net_table_privileges` and `public_net_functions` all 0, and
  `anon_queue_select` / `anon_queue_insert` false. An anon-key REST read of the
  `net` schema is refused. A new alert still produces a push (see step 4).
- **Rollback:** Supabase restores the previous grants. Record the before-state
  from step 1 so it can be stated exactly.

**Fallback, if the grants can't be changed soon:** stop putting the secret in a
readable header. Two options, both needing a code change and their own review:
- Have the trigger send an HMAC of the body and a timestamp instead of the secret,
  and have the route verify the HMAC.
- Replace the pg_net push with a server-side job that reads new `alert_events`
  using the service role.

Either removes the value from the queue. Neither is started.

### 3. Rotate the push secret (only after step 2)

Done as one coordinated change, so pushes are never rejected for long:

1. Generate a new random value on a trusted machine. Never paste it into chat,
   tickets, commits or files in the repository.
2. **Optional, for zero downtime:** first deploy a small route change that accepts
   either `PUSH_WEBHOOK_SECRET` or a temporary `PUSH_WEBHOOK_SECRET_NEXT`. It's
   not written yet, and needs review. Without it, expect a short window where
   pushes are rejected with 401; the alerts themselves are always kept.
3. Set Vercel `PUSH_WEBHOOK_SECRET`, or `_NEXT` if you used step 2, to the new
   value for production, then redeploy so the route reads it.
4. Update the Vault entry `push_webhook_secret` to the same value, in the SQL
   editor: `vault.update_secret(...)` with the entry's id.
5. If step 2 was used, move the new value into `PUSH_WEBHOOK_SECRET`, remove
   `_NEXT`, and redeploy.

### 4. Validate

- Vault `updated_at` is after the rotation, and the md5 of the Vault value no
  longer begins `c924c0d1`. Compare md5s only, never values, between Vault and
  Vercel.
- Cause one alert, for example by marking a test invoice paid. Then check
  `SELECT status_code, created FROM net._http_response ORDER BY created DESC LIMIT 5;`
  shows **200**. A 401 means Vault and Vercel disagree; a 503 means the push keys
  are missing from the deployment.
- A request carrying the old secret is rejected with 401.
- Rerun the step 1 catalog query: the three PUBLIC counts are 0, and the `anon`
  checks are false.

### 5. Rollback

- **Grants:** Supabase restores them, as recorded in step 1.
- **Secret:** if pushes fail after rotation and cannot be fixed quickly, set
  Vault and Vercel to the same new value again. Do not revert to the old,
  exposed one. Alerts keep recording and showing in the app throughout; only
  phone push is affected.
- **Emergency stop of push only:**
  `DROP TRIGGER IF EXISTS alert_events_push ON public.alert_events;`
  (in the original migration's rollback). Alerts still record.

### 6. Lift the hold

Only when step 4 passes and the owner says so. Then update the project notes,
including the hold note, and re-check the demo-seeding plan
(`docs/demo-seed.md`), which waits on this hold.

## Out of scope here

No secret values, no rotation, no grant changes, no deploys and no route changes
are made by this plan. Each step above needs the owner's go-ahead at the time.
