# Bot API rollout runbook

How to take the bot API (`docs/api/PLAN.md`) from code to the two Grok bots,
in the order the owner approved on 2026-11-24:

1. The flag stays **off in production** until a **read-only** key has passed
   on a preview deploy.
2. Then write access goes to the **RedlineD1 CRM** key only.
3. **Wally Bot stays read-only.**

Every step can be undone. The off switch is always the `api_v1_documents`
flag, and it takes effect on the next request.

> **Previews share the production database.** There is no staging database
> (owner decision Q6). A test on a preview reads and writes the real shop's
> records. The read-only test changes nothing. The write test creates one real
> draft estimate, which you delete afterwards.

---

## 1. Review and merge the code (flag off)

The branch is `claude/machine-api-v1-plan-f45a1d`. Open a PR, let CI run
(type check, unit tests, Playwright smoke on the preview), and review it.

**Before merging, check the staff Estimates screen on the PR's preview.**
Phase 1 moved the estimate rules into `lib/domain/estimates.ts`. The screen
should behave exactly as before. On the preview:

- [ ] Create an estimate. Its number is the next `EST-` in sequence.
- [ ] Edit it, approve it, and convert it to an invoice. The invoice opens as a draft.
- [ ] Email one estimate to yourself. The PDF looks the same as before, and
      totals match the screen ([odeyt/redlined1#113](https://github.com/odeyt/redlined1/pull/113)
      fixed mixed-currency totals).
- [ ] Delete the test estimate and the test invoice.

Merging with the flag off changes nothing for bots: every new endpoint returns
404, and the Settings → API Keys panel is hidden.

## 2. Apply the migration (flag still off)

In the Supabase SQL editor, run
`supabase/migrations/2026-11-25_api_v1_documents.sql`. It only adds things:
new nullable columns, an API-only numbering function, and the flag row,
which is seeded off. The check at the end must print `ok` on all five rows.

Rollback: `supabase/migrations/2026-11-25_api_v1_documents_rollback.sql`. It
refuses to run once any API-made document exists, so it cannot lose that
record.

## 3. Switch the API on for previews only

Previews report themselves as `staging` to feature flags (`VERCEL_ENV=preview`,
see `lib/environment.ts`). So one environment row turns the API on for preview
deploys and leaves production off:

```sql
INSERT INTO feature_flags (flag_key, display_name, description, enabled, scope, environment)
VALUES ('api_v1_documents', 'API v1 documents', 'Bot API, previews only (rollout step 3)', true, 'environment', 'staging')
ON CONFLICT DO NOTHING;
```

If the preview still answers 404 at step 5, the preview deployment has
`NEXT_PUBLIC_APP_ENV` or `NEXT_PUBLIC_FEATURE_FLAGS_ENV` set to something
other than staging. Check them in Vercel → Settings → Environment Variables
(Preview).

## 4. Issue a read-only test key

Open the **preview**, sign in as the owner, and go to **Settings → API Keys**.
The panel appears because the flag is on for previews.

- Name it `Smoke test (delete me)` and choose **Read only**.
- Copy the secret. It is shown once. Don't paste it into chat.

## 5. Run the smoke test (read only)

This machine cannot reach `*.vercel.app` (it is blocked on this network), so
run it from a computer that can. It needs Node and a checkout of the repo.

```powershell
$env:BASE = "https://<preview-host>/api/v1"
$env:KEY  = "<the test key>"
npx tsx scripts/api-smoke.ts
```

Every line should say `PASS`. It checks:
- no key and bad keys are refused
- `/me` shows the right shop and scopes
- customers, estimates and invoices list, with no cost or markup
- bad filters and `updated_since` are refused
- the read-only key cannot write
- there is no approve, send, pay, finalize or delete endpoint

The test changes nothing in the database.

## 6. Optional: the write test

This creates **one real draft estimate** in the shop and uses up the next
estimate number. Pick a customer you use for testing, and copy its id from the
customer's page.

1. Issue a second key on the preview with **Read + write drafts**.
2. Run:

   ```powershell
   $env:KEY = "<the draft key>"
   npx tsx scripts/api-smoke.ts --write --customer <customer id>
   ```

   It creates a draft and checks that:
   - a status in the body is refused
   - a POST without an `Idempotency-Key` is refused
   - a retry replays instead of duplicating
   - reusing a key with a different body is a conflict
   - the draft can be edited
   - converting an unapproved draft is refused
   - the draft PDF is stamped DRAFT
3. Optional: approve that draft **in the app**, then run
   `npx tsx scripts/api-smoke.ts --convert <estimate id>` to see it become a
   draft invoice. This uses up an **invoice number**, and invoice numbers are one
   global sequence, so it leaves a gap if you then delete the invoice. Skip it
   if a gap matters.
4. In the app, delete the test draft (and the test invoice).

Also optional: `--rate-limit` sends 125 requests and expects some 429s.

## 7. Check by hand

- [ ] Nothing was emailed or messaged to anyone, and no payment was recorded.
- [ ] Settings → API Keys shows each test key's actions under it.
- [ ] In the Estimates list, the test draft shows **CREATED BY API**.
- [ ] Revoke both test keys. Running the smoke test again fails at `GET /me`
      with 401.

## 8. Production

Once steps 5 to 7 pass:

1. Turn the flag on for the D1 shop only, rather than globally:

   ```sql
   INSERT INTO feature_flags (flag_key, display_name, description, enabled, scope, shop_id)
   VALUES ('api_v1_documents', 'API v1 documents', 'Bot API for D1 Imports', true, 'shop',
           '90b72748-bf01-4456-999f-f4ba48091606')
   ON CONFLICT DO NOTHING;
   ```

2. On **redlined1.com**, go to Settings → API Keys and issue:
   - **Wally Bot**: **Read only**.
   - **RedlineD1 CRM**: **Read + write drafts**.
3. Give each secret to its bot through Grok Bot's secure form or vault,
   never in chat. Each bot's first call is `GET /me` to confirm its key.
4. Optional: delete the previews-only row from step 3.

## Off switches

| To stop | Do |
|---|---|
| Every bot, at once | Settings → Feature Flags → `api_v1_documents` off, or `UPDATE feature_flags SET enabled = false WHERE flag_key = 'api_v1_documents';` |
| One bot | Settings → API Keys → Revoke. Its next request gets 401 |
| Remove the schema | The rollback file (step 2). Only once no API-made document exists |

## Known limits, recorded for later

- **`updated_since` is not supported** (owner decision 2026-11-25). Bots use
  `created_since` and re-read a document by id to see changes.
- **The duplicate-request table (`api_idempotency`) grows without limit.**
  Cleaning it up means deleting old rows on production, which needs the
  owner's approval (CLAUDE.md rule 7), so it isn't built.
- **Deferred:** finalize, outbound webhooks and the MCP connector.
- **`invoice.issued`** is also queued when a bot creates a draft invoice, which
  is the same as the app's behaviour. Nothing subscribes to it today.
- **The key name isn't shown on the badge**, because the browser can't read
  the keys table. Owners see key names in Settings.
