# Production security hold — remediation plan

**Status: hold OPEN. This is a plan, not a record of changes.** Nothing in it
has been carried out: no secret rotated, no grant changed, nothing deployed, hold
not lifted. The 2026-10-07 completion-date exception
(`docs/completion-date-stamps-rollout.md`) covered only that rollout.

Production: `redlined1` (`ldjrlvjkmzrcdqhetqoh`).

## What is known, and how well

**Owner-verified on 2026-09-24 (production SQL editor), not re-checked since.**
The closeout session that wrote this plan (Claude Code, 2026-10-07) had no
database access, so none of this was re-verified, and **no current security audit
has been completed.**

- PUBLIC holds grants on 19 `net` tables and EXECUTE on 12 `net` functions. Both
  should be 0. A `REVOKE` run as `postgres` is a silent no-op, because those
  objects belong to the extension's owner. Supabase support ticket **SU-476058**
  was opened for it.
- The live `public.notify_push_on_alert()` reads its secret from the Vault entry
  `push_webhook_secret`. The repository migration has a placeholder inline
  instead, so the live function differs from the repository.
- That Vault entry was last updated 2026-09-14, so it was **not rotated** after
  the 2026-09-16 finding. Its pre-rotation md5 begins `c924c0d1` (a prefix of a
  hash, not the secret).

**Why it matters:** each push is queued by pg_net with the secret in the
`x-push-secret` request header. With PUBLIC able to read pg_net's tables, anyone
holding the public anon key may be able to read that header and send arbitrary
notifications to the shop's phones through `/api/push/send`.

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

```sql
-- Expect both 0 after remediation; record today's values first.
SELECT
  (SELECT count(*) FROM information_schema.role_table_grants
     WHERE table_schema = 'net' AND grantee = 'PUBLIC') AS public_table_grants,
  (SELECT count(*) FROM information_schema.role_routine_grants
     WHERE routine_schema = 'net' AND grantee = 'PUBLIC') AS public_function_grants;

-- Vault entry: when it was last changed (no secret value is shown).
SELECT name, updated_at FROM vault.secrets WHERE name = 'push_webhook_secret';
```

Also confirm on 2026-10-07 or later that the live function still reads Vault and
has no inline secret, using `pg_get_functiondef('public.notify_push_on_alert'::regproc)`.
Check it on screen only; do not paste its output anywhere if it contains a value.

### 2. Least-privilege pg_net (with Supabase)

- Follow up ticket SU-476058. Ask Supabase to revoke PUBLIC's grants on the `net`
  schema's tables and functions, keeping only what the extension and the
  `postgres`/`service_role` roles need. The app never calls pg_net from the
  browser, so `anon` and `authenticated` need nothing in `net`.
- **Validate:** the step 1 grant counts are 0. An anon-key REST read of the `net`
  schema is refused. A new alert still produces a push (see step 4).
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
- Rerun the step 1 grant query: both counts are 0.

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
