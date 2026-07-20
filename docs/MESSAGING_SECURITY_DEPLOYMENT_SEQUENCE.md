# Coordinated Messaging Security Release — Deployment Sequence

This release closes three related gaps in one coordinated change:
1. Server-only, default-deny credential storage (`shop_messaging_secrets`)
   for Twilio/LINE/Telegram — the first real, correctly-secured storage
   location for these credentials (see the corrected-finding note below).
2. `send-message` no longer accepts a caller-supplied destination —
   recipients are resolved server-side from shop-scoped DB records.
3. A new read-only, enabled-flags-only status endpoint
   (`/api/messaging-channels-status`) lets non-owner roles see which
   channels are usable without any credential-management privilege.

Branch: `feat/coordinated-messaging-security`. **Not merged, not deployed,
no SQL executed, no credentials configured or rotated.**

## Corrected finding — no prior credential exposure

An earlier pass of this work assumed `shop_settings.messaging_settings`
was a live jsonb column holding Twilio/LINE/Telegram credentials, readable
by the browser anon-key client, and framed this release as relocating an
already-exposed secret. **Direct production schema inspection disproved
that**:
- `public.shop_settings` has no `messaging_settings` column.
- No Twilio/LINE/Telegram/WhatsApp or other messaging-provider credential
  column exists anywhere in the production database.
- A database-wide search for messaging-related column names found only
  ordinary message/log columns — no provider credentials.
- An earlier attempt at a backfill migration against the assumed column
  failed at the database layer (nonexistent column) and rolled back
  cleanly, with no partial writes.

**Accurate finding**: the repository code (`services/shopSettingsService.ts`,
`app/api/send-message`) referenced a column that does not exist in
production. Messaging configuration was therefore nonfunctional or had
schema-drifted from whatever it was originally built against — a "broken
feature" finding, not a "credential exposure" finding. No database-stored
provider token was found anywhere. There is nothing to migrate or scrub,
and **no credential rotation is required on this basis** — rotation would
only become relevant if a genuinely exposed storage location is found
elsewhere, which this investigation did not find.

`docs/MESSAGING_SECRETS_MIGRATION.sql` is therefore a single, purely
additive migration: it creates `shop_messaging_secrets` empty, with no
backfill and no scrub step against any other table.

## Note on ordering: Vercel preview vs. the migration

A Vercel preview deployment for the PR can build and go live at any time —
it doesn't require the migration to have run first, and building it early
is useful for code review. But the messaging routes in that preview
(`send-message`, `/api/shop-messaging-secrets`,
`/api/messaging-channels-status`) will not actually **function** until
`shop_messaging_secrets` exists — they all query that table, and a missing
table means every call fails at the database layer, not silently. This is
expected and safe: the migration is purely additive and has no effect on
any other table, so it's safe to run at any point relative to the preview
build. Settings, dashboard, and every other unrelated screen work normally
in the preview with or without the migration having run.

---

## 1. Merge/deploy the job-ID hotfix

**Status: done.** `fix/job-id-hotfix` merged via PR #5 (`de5a8c7`) and is
now part of `origin/main`. This branch is rebased on top of it.

## 2. Review the coordinated PR

Review `feat/coordinated-messaging-security` (PR #6). A Vercel preview can
build for this PR at this point — see the ordering note above for what
will and won't work in it before the migration runs.

## 3. Apply the additive table migration

Run `docs/MESSAGING_SECRETS_MIGRATION.sql` in the Supabase SQL editor
against production. Safe to run before this branch is merged/deployed — it
only creates a new, empty table; it does not touch `shop_settings` or any
other existing table, so it has no effect on current production traffic.

## 4. Verify table security

Run every query in the migration's "Post-apply verification" block:
- RLS enabled + forced (`rls_enabled = true`, `rls_forced = true`).
- Zero rows in `pg_policies` for this table.
- Only `service_role` in `information_schema.role_table_grants`.
- `has_table_privilege('anon'/'authenticated', ..., 'SELECT')` both `false`.
- The combined `fully_locked_down` summary is `true`.
- `SELECT count(*)` on the new table returns `0` (nothing was backfilled).

Do not proceed until every check above passes.

## 5. Test the preview with the empty/unconfigured state

With the table created and the PR's Vercel preview live, exercise the
messaging routes against the preview: Settings → Messaging should show
every channel as "Not configured" and disabled (this is the correct,
expected empty state — not a bug), cross-shop denial and role denial
should behave correctly even with no data present, and `send-message`
should correctly reject a send attempt with "not enabled" for any channel
(since none are configured yet).

## 6. Configure test credentials through the owner-only API, if available

If you have test/sandbox Twilio credentials, use the new Settings →
Messaging panel (or `PUT /api/shop-messaging-secrets` directly) against
the preview or a staging shop to configure SMS and confirm the write-only
flow works end-to-end: the credential is accepted, `GET` afterward shows
`configured: true` but never echoes the value back, and the panel's
"leave blank to keep" behavior works on a second partial update. This step
is optional if no test credentials are available yet — steps 7 onward can
proceed once you have any real or sandbox credential to test with, at any
point after step 4.

## 7. Test messaging

With a configured channel (test or real), send an actual SMS/WhatsApp
message to a real recipient with a phone number on file, and confirm:
- **Settings**: status loads/saves correctly, the value is never visible
  again in the browser afterward (check the Network tab — the PUT response
  is `{success:true}` only).
- **SMS/WhatsApp send**: an owner/manager/advisor can send an invoice or
  estimate via SMS or WhatsApp, and the message actually arrives.
- **Cross-shop denial**: a user authorized for shop A gets `403` when
  calling any of the three routes with shop B's `shopId`, and a
  `resourceId` belonging to shop B returns `404` when called with shop A's
  `shopId`.
- **Role denial**: a technician gets `403` from `send-message`,
  `/api/shop-messaging-secrets`, and `/api/messaging-channels-status`. A
  manager/advisor gets `403` from `/api/shop-messaging-secrets`
  (owner-only) but succeeds against `send-message` and
  `/api/messaging-channels-status`.
- **LINE/Telegram**: confirm both are never offered as send-modal buttons
  (channel-status always reports them `false`) and that a direct API call
  with `channel: 'line'|'telegram'` returns `400` regardless of role.

## 8. Merge/deploy

Once steps 5–7 pass, merge `feat/coordinated-messaging-security` to `main`
and deploy to production. Production `shop_messaging_secrets` remains
empty until a real shop owner configures a channel through the new
write-only API — there is no cutover step, since there was no prior data
to switch away from.
