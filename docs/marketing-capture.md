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
   in the SQL Editor as four separate executions. STEP 1 must show matching
   fingerprints; if it does not, stop.
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
