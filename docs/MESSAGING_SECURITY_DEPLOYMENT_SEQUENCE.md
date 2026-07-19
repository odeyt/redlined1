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
`fix/job-id-hotfix` folded in (see step 1). **Not committed, pushed, or
deployed as part of producing this branch** — this document is the plan for
doing so, to be executed after your review.

Do not skip steps or reorder them. Steps 2 and 5 in particular are
irreversible-in-spirit (Phase A/B of the SQL migration) and are gated on the
step before them succeeding.

---

## 1. Merge/deploy the job-ID hotfix

Merge `fix/job-id-hotfix` (commit `95a3988`, "fix: accept real job card
identifiers") into `main` and deploy. This branch already has that fix's
`JobIdSchema` change folded in (cherry-picked as this branch's base), so
there is no merge-order dependency for the code itself — but deploying the
hotfix first keeps production job-status/job-notify working correctly
throughout the rest of this sequence, independent of when the messaging
work ships.

## 2. Run the Phase A migration

Run **Phase A only** of `docs/MESSAGING_SECRETS_MIGRATION.sql` in the
Supabase SQL editor against production:
- Creates `shop_messaging_secrets` (RLS enabled + forced, zero policies,
  `REVOKE ALL ... FROM PUBLIC, anon, authenticated`, `GRANT ALL ... TO
  service_role`).
- Backfills existing credentials from `shop_settings.messaging_settings`,
  using `COALESCE(existing, new)` per secret column — never an
  unconditional overwrite, safe to re-run.
- Does **not** touch `shop_settings.messaging_settings` in any way.

Run every query in the "A5. Post-apply verification" block. In particular:
run the **coverage-check query** and confirm it returns zero rows — any row
returned there means a credential did not migrate and must be investigated
before continuing.

## 3. Deploy the coordinated messaging integration branch

Deploy `feat/coordinated-messaging-security` (after code review and your
approval). This is the branch that:
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

At this point in the sequence, `shop_settings.messaging_settings` still
holds the old (now-unused) data — that's expected and safe; nothing reads
it anymore, and Phase B (step 5) removes it once this deployment is
verified.

## 4. Verify in production

Before proceeding to Phase B, confirm all of the following against the live
deployment:
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

Do not proceed to step 5 until every item above passes.

## 5. Run the Phase B migration

Run **Phase B only** of `docs/MESSAGING_SECRETS_MIGRATION.sql`:
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

## 6. Verify direct anon/authenticated reads cannot expose credentials

Run the "B6" read-only checks from the migration doc: as `anon` and as
`authenticated` (via `SET LOCAL ROLE`), attempt `SELECT * FROM
shop_messaging_secrets` — both must fail with a permission-denied error, not
return a row. Also run "B4" and confirm zero `shop_settings` rows still
carry any of the removed keys.

## 7. Rotate all previously exposed provider credentials

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

## 8. Verify messaging again, post-rotation

Re-run the send checks from step 4 (SMS/WhatsApp to a real recipient) using
the newly rotated credentials, to confirm the rotation didn't silently
break delivery. This closes the loop: credentials are stored server-only,
the old exposure surface is removed, previously-exposed values are rotated,
and the rotated values are confirmed working.
