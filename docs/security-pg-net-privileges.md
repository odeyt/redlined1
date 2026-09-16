# pg_net privileges: finding, audit, remediation plan and drift

**Status: SECURITY HOLD.** The marketing capture is stopped. Nothing is seeded,
no session is created, nothing is recorded, and no privilege has been changed.

## What was found

OWNER START SQL (`scripts/marketing/sql/owner-start.sql`) was run read-only
against production on 2026-09-16. Its demo-tenant rows (10-23) were run with the
placeholder still in place and mean nothing. Its infrastructure rows (30-61) are
valid findings, and they are these:

| Finding | Why it matters |
|---|---|
| PUBLIC, `anon` and `authenticated` hold **effective full table privileges** on `net.http_request_queue` and `net._http_response` | Every role inherits PUBLIC. Whoever holds those privileges can read, write and empty the database's outbound HTTP queue |
| They can **select the queue's `headers` and `body`**, and the response `headers` and `content` | The queue's headers carry `x-push-secret`. Reading them discloses the push secret |
| They hold **privileges on the request-id sequence** | The sequence is what the capture's correlation counts on, and what pg_net uses to number requests |
| They can **execute the request, response and worker-control functions** in `net` | Queueing a request makes the database send outbound HTTP; worker control affects delivery for everyone |
| `extensions.grant_pg_net_access` exists | Supabase re-applies these grants from an event trigger, so a revoke can be silently undone |
| Live trigger and function definitions **differ from the repository** | The five-alert expectation is derived from repository source; if live differs, it is unproven |
| `job_cards.trg_free_tier_limit` is **absent** | Either a migration was never applied here, or something was dropped outside the repository |

**What this does not tell us.** Whether anyone actually read the secret. The
queue holds a row only until the worker sends it, and pg_net keeps responses for
`pg_net.ttl`; there is no access log for either. Treat the current push secret as
potentially disclosed (Phase C) and prove the privileges are gone first.

## Measured result — Phase A, run 2026-09-16

The audit has now been run, read-only, against production. Verdict: **5 EXPOSED,
15 REVIEW.**

### What holds the privileges

The grant is on **PUBLIC**, not on `anon` and `authenticated` individually:

```
net.http_request_queue   {supabase_admin=arwdDxtm/supabase_admin,=arwdDxtm/supabase_admin}
net._http_response       {supabase_admin=arwdDxtm/supabase_admin,=arwdDxtm/supabase_admin}
..._id_seq               {supabase_admin=rwU/supabase_admin,=rwU/supabase_admin}
schema net               {supabase_admin=UC/...,=U/...,+ explicit USAGE to anon, authenticated,
                          service_role, postgres, supabase_functions_admin}
```

The empty grantee is PUBLIC, so every role inherits it. All twelve `net`
functions sit at the default **PUBLIC EXECUTE**, and at 0.20.3 none is SECURITY
DEFINER — they run with the caller's rights, which PUBLIC's table grants supply.

**Who can use it in practice:** ten login roles with passwords set, including
`sapelee_growth_reader` (the reporting login created for Sapelee) and
`cli_login_postgres` (expired 2026-09-08, still present). Row 42: **70 requests
have passed through the queue**, and one row was live in it during the audit.

### The blocker: this cannot be remediated from the SQL Editor

`postgres` is **not a member of `supabase_admin`**, which owns every one of these
objects. Reproduced against a real PostgreSQL (owner role, PUBLIC granted by the
owner, a second role with schema USAGE but no membership):

```
is the revoking role a member of the owner? false
REVOKE attempted by the non-member role -> no error
  did anything change? {objowner=arwdDxtm/objowner,=arwdDxtm/objowner}
```

**A REVOKE run as `postgres` raises no error and changes nothing.** It is a
silent no-op, which is worse than a failure: it looks like the fix landed.
Remediation requires `supabase_admin` — a Supabase support action.

### Supabase support request

| | |
|---|---|
| Reference | **SU-476058** |
| Submitted | 2026-09-16, by the owner |
| Status | Acknowledged; substantive response pending |
| Scope | The pg_net privilege remediation designed in Phase B below; correspondence is not reproduced here |

Until the substantive response arrives, nothing in this document is run against
production: no pg_net privilege change, no role change, no push-secret rotation,
no HMAC implementation, and no demo tenant, session or capture. The order after
it arrives is fixed:

1. Supabase remediates the pg_net privileges, preserving `postgres`'s minimum push access.
2. The ACLs are verified independently, by re-running the Phase A audit.
3. A database-originated push request is verified to still succeed with `sent: 0`.
4. The push secret is rotated, and the old secret is verified to be rejected.
5. The alert-definition drift results are reviewed.
6. Demo seeding is authorized.
7. OWNER START runs with the resulting real demo-shop id.
8. The session is created, and capture is authorized separately.

### What the measurements changed in the plan

- **The worker is safe.** `pg_net.username` is empty and the worker runs as
  `supabase_admin`, the owner. A revoke from PUBLIC cannot starve it.
- **Our push path is not.** `notify_push_on_alert` is owned by **`postgres`** and
  is SECURITY DEFINER, but pg_net's functions at 0.20.3 are SECURITY *INVOKER*.
  When PUBLIC loses the table and sequence privileges, `postgres` loses them too
  and alerts stop queuing their request. The revoke must be paired with explicit
  grants to `postgres`: EXECUTE on `net.http_post`, INSERT on the queue, USAGE on
  the sequence, and `SELECT (id)` if the 0.20.3 body uses `INSERT … RETURNING id`.
- **The re-grant vector is not the event trigger.** `grant_pg_net_access` grants
  only schema USAGE; its SECURITY DEFINER and revoke branch applies solely to
  versions `0.2 … 0.11.0`. At 0.20.3 that branch never runs. The table, sequence
  and function grants therefore come from pg_net's own install script, so an
  extension **upgrade or reinstall** re-applies them. Row 10 records the version,
  which is how a change becomes visible.

### Corrections this measurement forced in the audit itself

1. **False positive, fixed.** Every role row listed
   `extensions.grant_pg_net_access` under "functions outside net". PUBLIC does
   hold EXECUTE on it, but PostgreSQL refuses a direct call of any function
   returning `trigger` or `event_trigger`. Both return types are now excluded.
2. **Verdict narrowed.** The default-ACL row flagged Supabase's platform defaults
   in `auth`, `graphql`, `public` and `storage` as EXPOSED. Only schema `net` can
   recreate this exposure, and **no default ACL exists for `net`**. Row 50 is now
   scoped to `net`; row 51 reports broad defaults elsewhere as REVIEW; row 52
   records the rest as INFO. One of those deserves its own look:
   `public tables by supabase_admin: anon=arwdDxtm` means any table
   `supabase_admin` creates in `public` grants `anon` everything.

**Known defect, not yet corrected:** `scripts/marketing/sql/owner-start.sql` has
the same event-trigger false positive in its row 40. It is a pinned,
owner-reviewed artefact, and errs toward stopping the capture, so it is left for
a separate approval rather than amended here.

## Phase A — the read-only audit (built; run 2026-09-16)

`scripts/security/sql/pg-net-privilege-audit.sql`. One read-only transaction,
rolled back, with nothing to edit. It answers, for the whole database:

1. **Effective privileges** — schema, table, column, sequence and function — for
   PUBLIC, `anon`, `authenticated`, `service_role`, `authenticator`, `postgres`,
   `supabase_admin`, `supabase_functions_admin`, `sapelee_growth_reader`, **and
   every other role that can log in**. One row per role, with what it holds.
2. **Ownership** of the `net` schema, the pg_net extension, both tables, the
   request-id sequence, every `net` function, and `public.notify_push_on_alert`
   — with the raw ACLs, because remediation must not revoke from the owner.
3. **`extensions.grant_pg_net_access`**: its owner, security, fingerprint, the
   event triggers that run it, on which event and under which command tags, and
   its source — so you can see exactly when it re-grants and to whom.
4. **What the worker needs**: every `pg_net.*` setting (including
   `pg_net.username`, the role the background worker connects as) and any pg_net
   worker backend currently connected, by role and database.
5. **Default privileges** (`pg_default_acl`) that would recreate access on the
   next object created.
6. **Credentials**: every login role, whether it is superuser or BYPASSRLS, its
   valid-until, what it is a member of, and — only if `pg_authid` is readable —
   whether a password is set. It never reads a password hash.

**What it never reads:** no queued header, no request body, no response header
or content, no Vault value, no password hash, no `pg_stat_activity` query text.
Queue and response *volumes* come from catalog statistics, so the audit does not
read a single row of either table. Column names appear only as arguments to
`has_column_privilege`, which returns a boolean. The one function source it
prints — `grant_pg_net_access` — is withheld and replaced by its md5 if it
matches a secret-shaped pattern.

Verdicts: **EXPOSED** (PUBLIC/anon/authenticated hold something), **REVIEW**
(another role holds something that needs a judgement), **RECORD**, **INFO**,
**PASS**. Row 999 counts the exposures.

## Phase B — remediation design (designed; deliberately NOT in this repository)

The remediation SQL is **not committed**. It is held out until the Phase A
result is in, because the exact grants to revoke, the roles to preserve and the
owner to leave untouched must come from measurement, not assumption. The design
it will follow:

- **Revoke** every table and column privilege on `net.http_request_queue` and
  `net._http_response`, and every sequence privilege on the request-id sequence,
  from PUBLIC, `anon` and `authenticated`.
- **Revoke** EXECUTE on the request, response and worker-control functions in
  `net` from those same roles.
- **Preserve** exactly what pg_net's worker and `public.notify_push_on_alert`
  need: the owner of the objects, and the role named by `pg_net.username`.
  `notify_push_on_alert` is SECURITY DEFINER, so it runs with its owner's
  rights; nothing in the app calls `net.*` as `anon` or `authenticated`.
- **Survive the event trigger**: a revoke can be undone the next time
  `grant_pg_net_access` runs. The design therefore pairs the revoke with a
  detection: re-running the Phase A audit after any extension change, and
  (separately approved) a scheduled check that alerts if PUBLIC regains access.
- **Guards**: one transaction, preconditions asserted before any revoke (the
  expected owner, the expected worker role, nothing else depending on the
  grants), verification inside the same transaction, and an explicit rollback
  path. It must never interrupt an alert insert or a production push.

**Risks to weigh before running it, in order:**

1. **Breaking push for every shop.** If the worker connects as a role that loses
   access, alerts are still written but no notification is sent. Mitigated by
   reading `pg_net.username` first (Phase A row 40) and preserving that role.
2. **Breaking an unknown caller.** Phase A row 21-24 lists every role that holds
   access today; anything unexpected there must be explained before revoking.
3. **Silent re-grant.** The event trigger fires on `CREATE EXTENSION`; an
   extension upgrade can restore every grant. Verification must be repeated
   after any platform or extension change.
4. **Supabase support expectations.** These are platform-managed objects. The
   revoke is supportable but should be recorded, so a future platform action
   that re-grants is recognised rather than re-diagnosed.

## Phase C — the push secret

Assume the **current** push secret may have been readable through the queue by
anything holding PUBLIC. It was rotated once already (into Vault) during Phase
1.5; that rotation does not help if the queue was readable afterwards, because
the secret rides in the header of every queued request.

**Plan, in this order:**

1. Fix the privileges (Phase B) and verify with Phase A that zero EXPOSED rows
   remain.
2. Only then rotate the secret again: new value in Vault, new value in Vercel,
   `notify_push_on_alert` reading it from Vault (it already does — the drift
   audit's marker confirms it is not a literal).
3. Re-run Phase A immediately after the rotation, to prove the new secret has
   never been exposed to a readable queue.

Rotating before the privileges are fixed would put a fresh secret into the same
readable queue. **The secret is never printed, retrieved or echoed by anything
in this repository**, including both audits.

## The interim HMAC design (documented; NOT to be implemented)

On hold while the Supabase support path is active. If support refuses or delays
materially, this comes back as an implementation proposal needing its own
approval. Recorded here so the design is not lost:

- The trigger signs `alert_id | shop_id | issued_at | expires_at` (pipe-joined,
  fixed order, UTC epoch seconds) and sends
  `v1.<issued_at>.<expires_at>.<hex hmac-sha256>` instead of a reusable secret.
- The route re-derives the message from the body's own `record.id` and
  `record.shop_id` rather than trusting header copies, rejects a window wider
  than 60s, rejects expired or future-dated signatures (30s skew allowance), and
  compares with `crypto.timingSafeEqual` on equal-length buffers.
- Replay is bounded by the window plus an in-memory seen-set keyed on alert id.
- The key stays in Vault and in Vercel env. Only the derived signature enters the
  queue, and it is useless after a minute and bound to one alert.
- Signing failure must never abort an alert: the trigger body is wrapped so a
  missing key raises a warning and loses a notification, never the alert row.
- Deployment order: route accepts either scheme -> trigger switches to signing ->
  soak -> route stops accepting the static secret. Each step rolls back alone.
- Unverified prerequisite: whether `pgcrypto` is installed and `hmac()` is
  executable by the trigger's owner.

**What it does not fix:** the request body still carries the alert record into a
world-readable queue. Only the revoke, or removing pg_net from the push path,
closes that.

## Retiring `cli_login_postgres`

`cli_login_postgres` is an expired login role that still exists and still
inherits PUBLIC's access to the queue. It is one of ten such credentials, so
retiring it reduces the exposure without fixing it.

`scripts/security/sql/cli-login-role-audit.sql` (read-only, parameter-free)
reports, before anything is changed: the role's attributes and expiry; whether a
password is set (never the hash); open sessions (never the query text);
membership in both directions and which login roles can `SET ROLE` to it;
everything it owns; every shared dependency; every grant it issued; the default
privileges it created; policies naming it; and database ownership. Row 900 says
whether `NOLOGIN` is safe, row 901 whether `DROP` is, and row 999 combines them.

**Two things the audit exists to make obvious.** `VALID UNTIL` rejects password
authentication only — it does not stop a member from `SET ROLE`, and on this
database `postgres` is a member. And a `DROP` is not reversible in place: the
grants the role issued disappear with it, so they have to be recorded first.

**Disable-first procedure:**

1. Run the audit in every database the role could own something in (row 41 names
   the one it ran in). Record the output; it is the rollback plan.
2. `ALTER ROLE cli_login_postgres NOLOGIN` — one statement, reversible by one
   statement. Soak for a week.
3. Only if nothing breaks, and only if row 901 says so, reassign or drop what it
   owns and then drop the role.
4. Rollback: `ALTER ROLE ... LOGIN` restores step 2 instantly. After step 3 the
   rollback is re-creating the role and re-applying the ownerships and grants the
   audit recorded — which is why step 1 must run first.

## Phase D — production drift (built; not yet run)

`scripts/security/sql/alert-definition-drift.sql`. Read-only, nothing to edit.
For each of `alert_ro_status_changed`, `alert_ro_pending_approval`,
`emit_alert_event`, `record_ro_status_change`, `alert_job_assigned`,
`alert_job_work_added` it reports:

- the live md5 against the repository's, with **WHITESPACE** kept distinct from
  **MATCH**, and **MISSING** / **DUPLICATE** called out separately;
- **semantic markers** — each one a behaviour, several of them dated. A missing
  membership guard in `alert_job_assigned`, or `alert_invoice_paid` still keyed
  on `NEW.id`, dates production *before* 2026-08-16 and says which migration was
  never applied;
- an **age verdict**: MISSING, OLDER (a dated marker is absent), or DIVERGED
  (every marker present but the text differs — something was changed outside the
  repository);
- the live **source** of anything that differs, so it can be diffed by eye —
  except `notify_push_on_alert`, whose source is never printed because it reads
  the push secret, and except any definition that matches a secret-shaped
  pattern, which is withheld and replaced by its md5;
- every trigger on the tables the alert path touches, which of `customers`,
  `vehicles` and `job_cards` is missing `trg_free_tier_limit`, and any trigger
  that exists but is **disabled** (it fires nothing).

**It installs nothing.** No repository definition is written to production from
this audit or from the capture harness. Reconciliation — deciding, per object,
whether production or the repository is right — is separate work needing its own
approval, and until it is done the five-alert expectation stays unproven and the
capture stays stopped.

## How these are tested

`npm run test:sql` executes both audits against a real PostgreSQL, across a
database granted the way production was found and a hardened one:

- every exposure named, with the secret-bearing columns, the sequence, the
  control functions, the re-granting event trigger, the broad default privilege
  and the login role that still holds access;
- zero exposures on a hardened database;
- both audits change nothing (row counts, sequences, catalogs identical after);
- drift detected for an older `alert_job_assigned`, a whitespace-only change, a
  dropped function, a duplicated function, a missing `trg_free_tier_limit` and a
  disabled trigger;
- **and, with a fake secret planted in a queued header, a response body and a
  trigger definition, neither audit's output contains it.**

`lib/security/__tests__/securitySqlStatic.test.ts` additionally holds both files
to being read-only, ASCII, parameterless, and free of any read of a header,
body, content or password.
