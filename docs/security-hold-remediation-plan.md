# Production security hold — remediation plan

**Status: hold OPEN. This is a plan, not a record of changes.** Nothing in it
has been carried out: no secret rotated, no grant changed, nothing deployed, hold
not lifted. The 2026-10-07 completion-date exception
(`docs/completion-date-stamps-rollout.md`) covered only that rollout.

**Revised 2026-10-08.** Supabase documents the pg_net grants as a platform
constraint: it does not support changing them for one project, and removing
PUBLIC's grants breaks pg_net. So the earlier aim, "Supabase revokes the grants,
then we rotate the secret", is replaced by containment. The hold clears when
four measurable checks pass (see [Exit criteria](#exit-criteria)):
1. no API exposure of `net`;
2. no indirect route to pg_net from the API roles;
3. no reusable credential in the pg_net queue;
4. Supabase's answer on the ticket recorded.

Do not run blanket `REVOKE` commands on `net` and do not drop pg_net: the push
workflow uses it.

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
these objects belong to the extension's owner (`supabase_admin`). Supabase's
troubleshooting guides ("Revoking access to pg_net objects has no effect";
"Database roles can read request headers queued by pg_net") say these grants
are how `postgres` reaches the queue, that removing them breaks pg_net, and
that per-project changes are not supported. Their recommended containment:
- keep `net` out of the API's exposed schemas;
- give LOGIN only to roles trusted to send HTTP requests;
- treat any header sent through pg_net as readable by every role that can
  connect.

Supabase support ticket **SU-476058** was opened for the grants.

The live `public.notify_push_on_alert()` reads its secret from Vault. The
repository migration has a placeholder inline instead, so the live function
differs from the repository.

**Why it matters:**

- **Read.** Each push is queued in `net.http_request_queue` with the secret in
  the `x-push-secret` request header. pg_net normally deletes a queue row once
  the request is sent, so each push exposes the secret only briefly, but one
  successful read leaks it for good. Rows stay longer if the worker falls behind.
  Vault does not help here: the decrypted value is what gets queued. With the
  secret, anyone can send notifications with any text to the shop's phones
  through `/api/push/send`, because the route pushes the title and body it is
  sent.
- **Write.** PUBLIC can also INSERT, UPDATE and DELETE in the queue. A queued
  row is an HTTP request that Supabase's server sends, so this would let a caller
  make the server send arbitrary requests, or drop and alter pushes.
- **Reachability.** The public anon key reaches these tables through the REST
  API only if `net` is one of the API's exposed schemas (Project Settings → Data
  API → Exposed schemas). The `authenticator` role has no `pgrst.db_schemas`
  entry (owner's check, 2026-10-08), so the dashboard setting is the source of
  truth, and it has not been read yet. Even with `net` unexposed, an API-callable
  function or view that reaches pg_net would be an indirect route (step 2), and
  any role that can log in keeps the grants.

**From the repository (read in the closeout, current as of `main` 3b6b69b):**

| Part | Where | Role |
|---|---|---|
| Trigger `alert_events_push` | `public.alert_events`, AFTER INSERT | Calls `notify_push_on_alert()` for every alert |
| `public.notify_push_on_alert()` | `supabase/migrations/2026-08-16_push_on_alert_webhook.sql` (placeholder secret); live version reads Vault | `net.http_post` to `https://www.redlined1.com/api/push/send` with header `x-push-secret` |
| `/api/push/send` | `app/api/push/send/route.ts` | Rejects with 401 unless `x-push-secret` equals Vercel env `PUSH_WEBHOOK_SECRET`; 503 if push keys are missing |
| `PUSH_WEBHOOK_SECRET` | Vercel project `redlined1-s-projects/redlined1` (production) | The value the route compares against |
| Alert writers | AFTER triggers on `job_cards`, `repair_orders` and others that insert `alert_events` | Every alert produces one push request |

## Order of work

Contain first, then remove the credential from the queue. Each step needs the
owner's go-ahead at the time.

### 1. Confirm the current state (read-only, owner runs)

**Do not use `information_schema.role_table_grants` or `role_routine_grants`
for this.** They returned 0 / 0 on 2026-10-08 while the grants above were in
place, so they would report the problem fixed when it is not. Read the catalogs
instead. Baseline values are in the tables above. Because the grants are a
platform constraint, these counts are tracked for change, not required to reach 0.

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

API exposure is read in the dashboard (step 2). The `authenticator` role's
settings had no `pgrst.db_schemas` entry on 2026-10-08, so the database cannot
answer it.

### 2. API exposure (owner, in the dashboard)

- Open production's Data API settings
  (`https://supabase.com/dashboard/project/ldjrlvjkmzrcdqhetqoh/settings/api`) and
  read **Exposed schemas**. If `net` is listed, remove only `net` and save.
  Change nothing else. The app never calls `net` through the API.
- **Measurable check** (owner, from a terminal). It uses the public anon key,
  which is already in the site's browser bundle; still, keep it out of chat and
  files. `select=id&limit=0` returns no rows, so the check reads no headers.

  ```bash
  curl -s -o /dev/null -w "%{http_code}\n" "https://ldjrlvjkmzrcdqhetqoh.supabase.co/rest/v1/http_request_queue?select=id&limit=0" -H "apikey: $SUPABASE_ANON_KEY" -H "Authorization: Bearer $SUPABASE_ANON_KEY" -H "Accept-Profile: net"
  ```

  **Pass: 406** (PostgREST refuses a schema that isn't exposed). A 200 means
  `net` is exposed.

### 3. Indirect access (read-only audit; owner runs, Claude reviews)

Keeping `net` unexposed blocks direct REST access. It does not show that no
API-callable function, view or trigger reaches pg_net. The repository has one
pg_net caller (`notify_push_on_alert()`), but production may have objects made
in the dashboard.

```sql
-- Indirect access to pg_net: read-only. One row per finding; review each.
WITH fn AS (
  SELECT p.oid,
         n.nspname,
         p.proname,
         pg_get_function_identity_arguments(p.oid)                        AS args,
         p.prosecdef                                                      AS security_definer,
         p.prorettype IN ('trigger'::regtype, 'event_trigger'::regtype)    AS is_trigger,
         pg_get_functiondef(p.oid)                                        AS def,
         has_schema_privilege('anon', n.oid, 'USAGE')
           AND has_function_privilege('anon', p.oid, 'EXECUTE')           AS anon_exec,
         has_schema_privilege('authenticated', n.oid, 'USAGE')
           AND has_function_privilege('authenticated', p.oid, 'EXECUTE')  AS authenticated_exec
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE p.prokind = 'f'
    AND n.nspname NOT IN ('pg_catalog', 'information_schema', 'net')
    AND n.nspname NOT LIKE 'pg\_%'
)
-- A. Any function outside net that calls pg_net.
SELECT 'A. calls pg_net'                                                  AS finding,
       nspname || '.' || proname || '(' || args || ')'                    AS object,
       concat_ws(', ',
         CASE WHEN is_trigger THEN 'trigger function (not API-callable)' ELSE 'callable function' END,
         CASE WHEN security_definer THEN 'SECURITY DEFINER' END)          AS detail,
       anon_exec                                                          AS anon_can,
       authenticated_exec                                                 AS authenticated_can
FROM fn
WHERE def ~* '\mnet\.(http_|_http)'
UNION ALL
-- B. Callable SECURITY DEFINER functions with dynamic SQL or URL/header/SQL arguments.
SELECT 'B. callable definer: dynamic SQL or URL/header/SQL argument',
       nspname || '.' || proname || '(' || args || ')',
       concat_ws(', ',
         CASE WHEN def ~* '\mEXECUTE\M' THEN 'uses EXECUTE' END,
         CASE WHEN args ~* '(url|header|sql|query|stmt|command)' THEN 'suspicious argument name' END),
       anon_exec,
       authenticated_exec
FROM fn
WHERE security_definer
  AND NOT is_trigger
  AND (anon_exec OR authenticated_exec)
  AND (def ~* '\mEXECUTE\M' OR args ~* '(url|header|sql|query|stmt|command)')
UNION ALL
-- C. Views outside net that read net tables.
SELECT DISTINCT 'C. view over net',
       vn.nspname || '.' || v.relname,
       'reads net.' || t.relname,
       has_schema_privilege('anon', vn.oid, 'USAGE')
         AND has_table_privilege('anon', v.oid, 'SELECT'),
       has_schema_privilege('authenticated', vn.oid, 'USAGE')
         AND has_table_privilege('authenticated', v.oid, 'SELECT')
FROM pg_depend d
JOIN pg_rewrite r    ON r.oid = d.objid
JOIN pg_class v      ON v.oid = r.ev_class
JOIN pg_namespace vn ON vn.oid = v.relnamespace
JOIN pg_class t      ON t.oid = d.refobjid
JOIN pg_namespace tn ON tn.oid = t.relnamespace
WHERE d.classid = 'pg_rewrite'::regclass
  AND d.refclassid = 'pg_class'::regclass
  AND tn.nspname = 'net'
  AND vn.nspname <> 'net'
UNION ALL
-- D. Triggers whose function calls pg_net, and whether the API roles can write that table.
SELECT 'D. trigger that calls pg_net',
       tn.nspname || '.' || c.relname,
       tg.tgname || ' -> ' || fn.nspname || '.' || fn.proname || ' (enabled=' || tg.tgenabled::text
         || ', RLS ' || CASE WHEN c.relrowsecurity THEN 'on' ELSE 'OFF' END
         || ', write policies=' || (SELECT count(*) FROM pg_policy pol
                                      WHERE pol.polrelid = c.oid AND pol.polcmd IN ('a', 'w', 'd', '*'))::text || ')',
       has_table_privilege('anon', c.oid, 'INSERT, UPDATE, DELETE'),
       has_table_privilege('authenticated', c.oid, 'INSERT, UPDATE, DELETE')
FROM pg_trigger tg
JOIN pg_class c      ON c.oid = tg.tgrelid
JOIN pg_namespace tn ON tn.oid = c.relnamespace
JOIN fn              ON fn.oid = tg.tgfoid
WHERE NOT tg.tgisinternal
  AND fn.def ~* '\mnet\.(http_|_http)'
UNION ALL
-- E. Roles that can log in (Supabase: give LOGIN only to roles you trust to send HTTP requests).
SELECT 'E. role that can log in',
       rolname,
       concat_ws(', ',
         CASE WHEN rolsuper THEN 'superuser' END,
         CASE WHEN rolbypassrls THEN 'bypasses RLS' END),
       NULL,
       NULL
FROM pg_roles
WHERE rolcanlogin
ORDER BY 1, 2;
```

**Pass:**

| Finding | Pass when |
|---|---|
| A | Only rows marked "trigger function (not API-callable)", such as `public.notify_push_on_alert()` and Supabase's event trigger `extensions.grant_pg_net_access()`. Trigger functions show `anon_can = true` through PUBLIC's default EXECUTE, but cannot be called through the API. Any "callable function" row must be justified. |
| B | Every row is reviewed and recorded: none reaches pg_net, or runs SQL, URLs or headers that the caller supplies. |
| C | No rows. |
| D | Only `alert_events_push` on `public.alert_events`, with `RLS on`. Supabase's default privileges can make `anon_can` / `authenticated_can` true; that is fine when `write policies=0`, because RLS then refuses every API write. Any write policy must be reviewed. The repository defines a SELECT policy only. |
| E | Only Supabase-managed roles (`postgres`, `authenticator`, `supabase_admin`, `supabase_*_admin`, `pgbouncer` and similar). A custom login role can read the queue and must be justified or removed. |

### 4. Take the credential out of the queue (design; each step approved)

Rotating the push secret while keeping the mechanism would leak the new value
the same way: Vault protects it at rest, but pg_net queues the decrypted header.
So the secret is **retired, not rotated**. The trigger will send only the alert
id, and the route will load and atomically claim the alert, then push only what
the database holds. Full design, rollout order (receiver and sender changed
together, staging first) and rollback: `docs/push-dispatch-redesign.md`.

### 5. Update ticket SU-476058 (owner sends)

Draft, with no secrets in it:

> Follow-up on SU-476058, project `ldjrlvjkmzrcdqhetqoh`. We have read your
> guides "Revoking access to pg_net objects has no effect" and "Database roles
> can read request headers queued by pg_net", and understand that per-project
> grant changes are not supported. Current state (2026-10-08, pg_net 0.20.3):
> PUBLIC holds every privilege, including INSERT, UPDATE, DELETE and TRUNCATE,
> on `net.http_request_queue` and `net._http_response`; SELECT, UPDATE and USAGE
> on `net.http_request_queue_id_seq`; and EXECUTE on 12 `net` functions. `anon`
> and `authenticated` have USAGE on `net`.
>
> 1. Please confirm the supported containment is: `net` not in the exposed
>    schemas, LOGIN only for trusted roles, and no credentials in pg_net
>    headers. Is anything else recommended?
> 2. With `net` not exposed, can `anon` or `authenticated` reach `net` by any
>    other route, such as GraphQL, Realtime or the pooler?
> 3. Is there a supported way to keep the queue's write privileges (INSERT,
>    UPDATE, DELETE, TRUNCATE) away from roles other than `postgres` without
>    breaking pg_net?
> 4. Is a change to these PUBLIC grants planned for a later pg_net release?

Record the answer below when it arrives.

| Date | Supabase's answer |
|---|---|
| _pending_ | |

### 6. Exit criteria

The hold clears only when all of these pass and the owner says so. The grant
counts from step 1 are tracked for change, but **reaching 0 is not a criterion**,
because Supabase does not support it.

| # | Check | How it is measured | Pass |
|---|---|---|---|
| 1 | API exposure | Dashboard Exposed schemas, plus the step 2 `curl` | `net` not listed; `curl` returns 406 |
| 2 | Indirect access | Step 3 audit, rows reviewed and recorded here | All findings pass as in the step 3 table |
| 3 | Secret handling | After step 4: (a) `SELECT pg_get_functiondef('public.notify_push_on_alert'::regproc) ILIKE '%push_webhook_secret%' OR pg_get_functiondef('public.notify_push_on_alert'::regproc) ILIKE '%x-push-secret%';` (b) `SELECT count(*) FROM net.http_request_queue WHERE headers ? 'x-push-secret';` right after causing an alert (c) a POST to `/api/push/send` with a random UUID, and one with an old-style `{record}` body with made-up text | (a) false (b) 0 (c) `sent: 0`, and the made-up text is never pushed; Vercel `PUSH_WEBHOOK_SECRET` and the Vault entry are deleted |
| 4 | Push still works | Cause one alert | `net._http_response` 200 with `sent >= 1`, the phone receives it, and the row's `push_dispatched_at` is set |
| 5 | Supabase's answer | Ticket SU-476058 | Recorded in step 5, with nothing in it contradicting checks 1 to 3 |

### 7. Rollback

- **Exposed schemas:** nothing in the app uses `net` through the API, so there
  is nothing to restore. If something unexpected breaks, re-add `net` and
  investigate.
- **Push redesign:** as in `docs/push-dispatch-redesign.md`. Before the old
  route path is removed, restoring the previous function definition is enough.
- **Emergency stop of push only:**
  `DROP TRIGGER IF EXISTS alert_events_push ON public.alert_events;`
  (in the original migration's rollback). Alerts still record.

### 8. Lift the hold

Only when step 6 passes and the owner says so. Then update the project notes,
including the hold note, and re-check the demo-seeding plan
(`docs/demo-seed.md`), which waits on this hold.

## Out of scope here

No secret values, no settings changes, no grant changes, no deploys and no route
changes are made by this plan. Each step above needs the owner's go-ahead at
the time.
