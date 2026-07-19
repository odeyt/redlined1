# Coordinated Messaging Security Release — Deployment Sequence

This release closes three related gaps in one coordinated change:
1. Twilio/LINE/Telegram credentials moved out of the browser-readable
   `shop_settings.messaging_settings` jsonb column into a server-only,
   default-deny table (`shop_messaging_secrets`).
2. `send-message` no longer accepts a caller-supplied destination —
   recipients are resolved server-side from shop-scoped DB records.
3. A new read-only, enabled-flags-only status endpoint
   (`/api/messaging-channels-status`) lets non-owner roles see which
   channels are usable without any credential-management privilege.

Branch: `feat/coordinated-messaging-security`, built from `origin/main` with
`fix/job-id-hotfix` folded in (see step 1). **Committed (`efb94f5`) and
pushed to origin. Not merged, not deployed, no SQL executed, no credentials
rotated.**

Do not skip steps or reorder them. Steps 3 and 7 in particular are
irreversible-in-spirit (Phase A/B of the SQL migration) and are gated on the
step before them succeeding.

## Note on ordering: Vercel preview vs. Phase A

A Vercel preview deployment for the PR can build and go live at any time —
it doesn't require Phase A to have run first, and building it early is
useful for code review. But the messaging routes in that preview
(`send-message`, `/api/shop-messaging-secrets`,
`/api/messaging-channels-status`) will not actually **function** until
`shop_messaging_secrets` exists — they all query that table, and a missing
table means every call fails at the database layer, not silently. This is
expected and safe: it means Phase A is additive and non-destructive enough
to run at any point relative to the preview build, but functional testing
of the messaging routes (step 4 below) can only happen after Phase A has
run. Settings, dashboard, and every other unrelated screen work normally in
the preview with or without Phase A having run, since nothing else in this
change touches unrelated tables.

---

## 1. Merge/deploy the job-ID hotfix

Merge `fix/job-id-hotfix` (commit `95a3988`, "fix: accept real job card
identifiers") into `main` and deploy. This branch already has that fix's
`JobIdSchema` change folded in (cherry-picked as this branch's base), so
there is no merge-order dependency for the code itself — but deploying the
hotfix first keeps production job-status/job-notify working correctly
throughout the rest of this sequence, independent of when the messaging
work ships. **Status: not yet merged as of this writing** — confirmed via
`git merge-base --is-ancestor 95a3988 origin/main` returning false.

## 2. Review the coordinated PR

Review `feat/coordinated-messaging-security` (PR to be opened from
https://github.com/odeyt/redlined1/compare/main...feat/coordinated-messaging-security?expand=1).
A Vercel preview can build for this PR at this point — see the ordering
note above for what will and won't work in it before Phase A runs.

## 3. Run the Phase A migration

Run **Phase A only** of `docs/MESSAGING_SECRETS_MIGRATION.sql` in the
Supabase SQL editor against production. Safe to run before this branch is
merged/deployed — it only creates a new table and backfills into it; it
never touches `shop_settings.messaging_settings` and nothing in the
currently-deployed `main` reads the new table, so this step has no effect
on production traffic until step 5 ships.
- Creates `shop_messaging_secrets` (RLS enabled + forced, zero policies,
  `REVOKE ALL ... FROM PUBLIC, anon, authenticated`, `GRANT ALL ... TO
  service_role`).
- Backfills existing credentials from `shop_settings.messaging_settings`,
  using `COALESCE(existing, new)` per secret/string column and leaving the
  four `*_enabled` flags untouched on any rerun — never an unconditional
  overwrite, safe to re-run.
- Does **not** touch `shop_settings.messaging_settings` in any way.

Run every query in the "A5. Post-apply verification" block. In particular:
run the **coverage-check query** (compares all 9 operational fields —
`twilioSid`, `twilioToken`, `twilioFrom`, `smsEnabled`, `whatsappEnabled`,
`lineToken`, `lineEnabled`, `telegramBotToken`, `telegramEnabled` — and
returns only `shop_id` + boolean `*_mismatch` columns, never a secret value)
and confirm it returns zero rows before continuing.

## 4. Test the preview

With Phase A run and the PR's Vercel preview live, exercise the messaging
routes specifically against the preview deployment: Settings status
load/save, an SMS/WhatsApp send, cross-shop denial, and role denial (same
checks as step 6, run early against the preview instead of production).
This is the point where the messaging routes first become testable — before
Phase A, they'd fail at the DB layer regardless of code correctness.

## 5. Merge/deploy the coordinated code

Merge `feat/coordinated-messaging-security` to `main` and deploy to
production. This is the branch that:
- Stops reading/writing `shop_settings.messaging_settings` anywhere
  (`services/shopSettingsService.ts` now selects an explicit column
  allowlist).
- Adds `GET/PUT /api/shop-messaging-secrets` (owner-only credential
  management, write-only responses).
- Adds `GET /api/messaging-channels-status` (owner/manager/advisor,
  enabled-flags only).
- Rewrites `send-message` to resolve recipients server-side from
  `job_cards`/`customers`/`estimates`/`invoices` and to read provider
  credentials exclusively from `shop_messaging_secrets`.
- Updates the Settings messaging panel to the write-only credential UI, and
  the Invoices/Estimates send modals to use the new channel-status
  endpoint.

At this point, `shop_settings.messaging_settings` still holds the old
(now-unused) data in production — expected and safe; nothing reads it
anymore, and Phase B (step 7) removes it once this deployment is verified.

## 6. Test production

Repeat the step 4 checks against production itself, plus the full set:
- **Settings**: an owner can load the Messaging panel (status loads,
  `configured`/`fromNumber` display correctly), set/update/clear a
  credential, and the value is never visible again in the browser
  afterward (check the Network tab — the PUT response is `{success:true}`
  only, and the next GET shows `configured` but not the value).
- **SMS/WhatsApp send**: an owner/manager/advisor can send an invoice or
  estimate via SMS or WhatsApp to a customer with a phone number on file,
  and the message actually arrives.
- **Cross-shop denial**: a user authorized for shop A gets `403` (not data)
  when calling any of the three routes with shop B's `shopId`, and a
  `resourceId` belonging to shop B returns `404` (not another shop's data)
  when called with shop A's `shopId`.
- **Role denial**: a technician gets `403` from `send-message`,
  `/api/shop-messaging-secrets`, and `/api/messaging-channels-status`. A
  manager/advisor gets `403` from `/api/shop-messaging-secrets` (owner-only)
  but succeeds against `send-message` and `/api/messaging-channels-status`.
- **LINE/Telegram**: confirm both are never offered as send-modal buttons
  (channel-status always reports them `false`) and that a direct API call
  with `channel: 'line'|'telegram'` returns `400` regardless of role.

Do not proceed to step 7 until every item above passes.

## 7. Run the Phase B migration immediately

As soon as step 6 passes, run **Phase B** of
`docs/MESSAGING_SECRETS_MIGRATION.sql` — don't leave a verified-working
deployment sitting on top of still-exposed source secrets any longer than
necessary:
- Strips the secret/config keys (`twilioSid`, `twilioToken`, `twilioFrom`,
  `smsEnabled`, `whatsappEnabled`, `lineToken`, `lineEnabled`,
  `telegramBotToken`, `telegramEnabled`) from `shop_settings.messaging_settings`,
  scoped to shops that already have a `shop_messaging_secrets` row (never
  touches a shop that somehow wasn't migrated — re-run Phase A's coverage
  check first if you have any doubt).
- Collapses an emptied jsonb object to `NULL`.

Before running the `UPDATE`, complete the manual pre-check in "B1" of the
migration doc — confirm (via a code search of the deployed commit) that no
running code path still reads or writes `messaging_settings`.

## 8. Verify old secrets are gone

Run the "B4" query and confirm zero `shop_settings` rows still carry any of
the removed keys. Then run the "B6" catalog checks (`has_table_privilege`
for `anon`/`authenticated`, `pg_policies`, `information_schema.role_table_grants`)
and confirm the combined `fully_locked_down` result is `true` — `anon`
SELECT = false, `authenticated` SELECT = false, zero RLS policies, and
`service_role` is the only non-owner grantee. The REST-probe checks
documented alongside B6 are optional, for a real over-the-wire confirmation
on top of the catalog-level proof — not required to consider this step
complete.

## 9. Rotate all previously exposed provider credentials

The Twilio auth token, LINE Notify token(s), and Telegram bot token(s) that
were live in `shop_settings.messaging_settings` before this release were
exposed to any authenticated browser session (see the original
`docs/MESSAGING_SECRETS_AUDIT.md` finding). Storage relocation alone does
not un-expose a credential that already leaked. For every shop with a
configured channel:
- Rotate the Twilio auth token in the Twilio console, then re-enter it via
  the new Settings → Messaging panel (write-only — this is the only way to
  update it going forward).
- Rotate/reissue LINE Notify tokens and Telegram bot tokens the same way.

This step is a real operational task across every configured shop — budget
time for it and confirm with each shop owner once done, rather than
treating storage relocation as equivalent to rotation.

## 10. Verify messaging again, post-rotation

Re-run the send checks from step 6 (SMS/WhatsApp to a real recipient) using
the newly rotated credentials, to confirm the rotation didn't silently
break delivery. This closes the loop: credentials are stored server-only,
the old exposure surface is removed, previously-exposed values are rotated,
and the rotated values are confirmed working.
