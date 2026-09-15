# Marketing capture: "How to Know What Every Car in Your Repair Shop Is Waiting For"

A Playwright recording of the first RedlineD1 walkthrough, made against
**production** inside one dedicated demo tenant. This is not a test suite: it
changes records (in the demo shop only) and produces a video.

## Safety model in one paragraph

The capture refuses to start unless every gate in `lib/marketing-capture/gates.ts`
passes, using read-only production queries. The gates check that the target is
exactly `https://www.redlined1.com`, that the shop is the approved, `is_synthetic`
demo shop, and that the session user owns that shop and no other. The shop must
have exactly one member, zero push subscriptions and every alert muted. Jordan
Blake, DEMO-330 and Alex Morgan must each exist once, only in the demo shop, with
no contact details. The demo repair order must already carry its demo invoice, so
QA sign-off never takes a number from the shared invoice sequence. The shop must
have no Sapelee outbox rows. After the run, the same facts are re-read to confirm
nothing crossed the tenant boundary or left the platform.

## One-time setup (owner-approved steps, in order)

1. **Migration.** Run `supabase/migrations/2026-09-15_shops_is_synthetic.sql`
   in the SQL Editor one block at a time, each result reviewed before the next.
   STEP 1 must show matching fingerprints; if it does not, stop. Every
   owner-reviewed block (STEP 1, 2, 3, 3b, 4, the POST-ROLLBACK CHECK and the
   PRE-CHECK) is pinned by SHA-256 in
   `lib/marketing-capture/__tests__/captureIsolation.test.ts`. Blocks added after
   review are appended at the end of the file, so the line ranges of earlier
   blocks never move; the file's order is therefore not the run order below.

   | Order | Block | Writes | Notes |
   |---|---|---|---|
   | 1 | STEP 1 preflight | none | both fingerprints must match; column absent |
   | 2 | STEP 2 change | one transaction | the only committed change |
   | 3 | PRE-CHECK (read-only; the last block in the migration file) | none | user triggers and rewrite rules on `shops` / `shop_settings`, what `create_shop_settings_for_new_shop` writes, NOT NULL columns without defaults, sequence-backed defaults, baselines (14 shops, 0 synthetic, 0 probes, `shop_settings` rows, `shop_settings_id_seq`), and the STEP 3b role capabilities, privileges and policies. **Stop before STEP 3** unless rows 10-15 and 17-19 are PASS; **stop before STEP 3b** unless rows 30-32 are PASS; record rows 16, 20 and 21 for the POST-ROLLBACK CHECK. |
   | 4 | STEP 3 probe | 2 probe shops + 2 blank settings rows, **rolled back** | `shop_settings_id_seq` advances by 2 |
   | 5 | POST-ROLLBACK CHECK | none | appended to the migration file |
   | 6 | ~~STEP 3b guard-role probe~~ | — | **DO NOT RUN in production.** See "STEP 3b is blocked" below |
   | 7 | ~~POST-ROLLBACK CHECK again~~ | — | not needed; 3b did not run |
   | 8 | STEP 4 verification | none | |

   Recorded outcome on 2026-09-16: STEP 1, 2, PRE-CHECK, 3, POST-ROLLBACK CHECK and
   4 passed. After STEP 3, `shop_settings` rows were 10 (the baseline) and
   `shop_settings_id_seq` was 27 (+2). STEP 4 showed 14 shops, 0 synthetic,
   14/14 growth counts, 1 guard trigger, 0 probe leftovers, and all three growth
   functions granted only to `postgres` and `sapelee_growth_reader`.

   > **STEP 3b is blocked. Do not run it against this production database.**
   >
   > The PRE-CHECK (rows 30-32) showed that `authenticated` and `anon` have **no
   > INSERT privilege on `public.shops`**. 3b's ordinary-role cases need that
   > privilege to reach the `is_synthetic` guard trigger. Without it, PostgreSQL
   > refuses the insert with `42501 permission denied` before any trigger runs. 3b
   > treats a refusal that is not the guard's own as a stop, so it cannot pass
   > here. It could only be made to pass by granting INSERT on `shops` to those
   > roles, which would widen access to the tenant table for every browser user.
   > **Do not grant, and do not weaken any privilege, to make 3b runnable.**
   >
   > This missing privilege is itself the stronger protection. An ordinary role
   > cannot create a shop at all, synthetic or not, so the guard is a second
   > layer behind it. STEP 3 already proved the `postgres` path. The seed's
   > `service_role` path is proven when the seed reads the demo shop back and
   > requires `is_synthetic = true` before its first record write. The 3b block
   > stays in the migration file, pinned by hash, for a database where those
   > privileges exist. Its presence is not an instruction to run it.

   **STEP 3b** is appended after the rollback notes so STEPS 1-4 keep their
   reviewed line numbers and hashes. STEP 3 proves synthetic shops leave the
   growth figures and that `postgres` may set the flag; 3b proves the other
   roles, inside a transaction it rolls back:
   - `service_role` (the seed's path) may insert a synthetic shop and change the
     flag (exactly one row updated, read back `false`);
   - `authenticated` and `anon` may not insert one, and the refusal must carry the
     guard's own message, `shops.is_synthetic is platform-managed`. A refusal
     for any other reason stops the probe instead of passing it.

   An ordinary role *changing* the flag cannot be exercised: `shops` exposes no
   row for an ordinary role to update, so RLS refuses first; the guard's update
   branch is covered by its reviewed body. Run 3b only when the pre-check shows
   `postgres` may `SET ROLE` to all three roles, `service_role` alone has
   `BYPASSRLS`, and the INSERT/UPDATE privileges are present. It writes nothing
   outside `shops` and the blank settings row that `shops_create_settings` adds,
   so no auth user, profile, membership, alert, notification, HTTP request,
   invoice, payment or Sapelee event can result.

   The rest of this section describes 3b for reference only (see the block
   notice above).

   **Stop conditions for 3b:** any error, especially `GUARD FAILURE: … inserted
   a synthetic shop` (critical), `… was refused, but not by the guard: …`,
   `service_role flag change affected N rows` / `did not apply`, or `role was not
   restored`. **Recovery:** run `ROLLBACK;` on its own, then the POST-ROLLBACK
   CHECK, and report both. 3b contains no commit statement, so an error cannot
   leave a probe row behind. After the check, `shop_settings` rows must equal the
   pre-check baseline and `shop_settings_id_seq` must be exactly +2 after STEP 3
   and +1 more after 3b; anything else is a stop.
2. **Seed the demo tenant.**
   ```powershell
   $env:ALLOW_PRODUCTION_MARKETING_SEED = 'true'
   npm run capture:marketing:seed
   ```
   Prints the new demo shop id, one progress line per record it creates (the
   table name only, e.g. `[seed-demo] created customers`), and a closing summary.
   A refusal prints its reason. It never prints the password, session tokens,
   the service-role key, or any customer contact details. The generated password
   goes to `%USERPROFILE%\.redlined1-marketing\demo-owner.json`, readable by your
   account only. No email is sent. Before writing any demo record, the seed reads
   the shop back from the database and refuses unless `is_synthetic` is `true`.

   Before its FIRST write, the seed reads the live schema (PostgREST's OpenAPI
   description, GET only) and refuses if any column it writes is missing or an
   insert would omit a NOT NULL column without a default. Every payload comes
   from `lib/marketing-capture/demoRecords.ts`. The draft invoice `INV-DEMO-330`
   is written with object lines (`{ note, description, qty, rate }`, the shape
   the Invoices view and Command Center read) and an explicit `owner_id` (its
   `auth.uid()` default is NULL under the service role). After writing, the seed
   reads the invoice back and refuses unless it totals exactly USD 275.00.
3. **Save the session** (off camera, no video):
   ```powershell
   $env:MARKETING_DEMO_SHOP_ID = '<DEMO_SHOP_ID>'
   npm run capture:marketing:prepare
   ```
   Writes `tests/.auth/marketing-demo.json` (gitignored).

## Recording

```powershell
$env:ALLOW_PRODUCTION_MARKETING_CAPTURE = 'true'
$env:MARKETING_DEMO_SHOP_ID = '<DEMO_SHOP_ID>'
npm run capture:marketing
npm run capture:marketing:convert
```

Outputs, all gitignored:

- `marketing-output/redlined1-first-workflow.webm` (1920×1080)
- `marketing-output/redlined1-first-workflow-<date>.webm` (a copy, so a second take never overwrites the first)
- `marketing-output/redlined1-first-workflow.mp4` (H.264, CRF 18, yuv420p, faststart, no audio). If ffmpeg is missing, the convert step prints the exact command instead of failing.

`npm run capture:marketing:list` shows what would run without running it.

## What the walkthrough does

| Step | Screen | Change (demo shop only) |
|---|---|---|
| 1 | App shell | none. Confirms the demo shop name and that no real shop is shown |
| 2 | Customers → Jordan Blake | none |
| 3 | Vehicles → DEMO-330 | none |
| 4 | Job Cards | assigns Alex Morgan through Edit → Save |
| 5 | Job Cards | Approve → `Approved` |
| 6 | Repair Orders → RO-DEMO-330 | none. Shows concern, cause (diagnostic finding), correction (recommended repair), part, labor |
| 7 | Repair Orders | `Open` → `In Progress` → `Pending Parts` → `In Progress` → `Pending Approval` |
| 8 | Repair Orders | QA Sign-Off → `Complete` (drafts nothing; the invoice already exists) |
| 9 | Command Center | none. Held for about 3.5 seconds |

Suggested narration for steps 6 to 8: *the repair order holds the technical
findings and the parts; the job card runs the workshop flow.*

### Deliberately not shown

- **Job card `In Progress` / `Complete`.** No control in the product sets them.
  The reducer actions that would are never dispatched.
- **Repair-stage tracker (`ready`).** Its columns do not exist in production;
  the feature is broken and tracked separately.
- **Close / Close Job.** `closeJob()` drafts an invoice from the shared sequence
  and queues a Sapelee `repair.completed` event. `press()` refuses it.

## Re-running

Re-runs start from wherever the last take left the records. Before another take,
reset the demo job card and repair order to `Booked` / `Open`. That reset is a
production write and needs its own approval; it is not automated here.
