# D1 Imports → Location 2 shop merge: rollout runbook and status

**Status (2026-10-17): code is in PR #90 and not merged. No SQL has been run against production.**

- Production Supabase project: `redlined1` / `ldjrlvjkmzrcdqhetqoh`.
- Production Vercel project: `redlined1` under `redlined1-s-projects`. The `d1-imports/redlined1` project that reports a "Vercel – redlined1" check on PRs is a duplicate. Its preview passing does not prove that production deployed.

| Shop | UUID | After the merge |
|------|------|-----------------|
| D1 Imports | `38d55fae-741b-4bac-b520-f96eed65bf38` | closed, archived, history kept |
| D1 Imports — Location 2 | `90b72748-bf01-4456-999f-f4ba48091606` | the one shop staff use |

## What the merge is

No business row moves. Every job card, estimate, RO, invoice, payment, customer and vehicle keeps its `shop_id`. Location 2 reads D1 Imports' records through the existing `shop_mirrors` link (Location 2 → D1 Imports) and edits them through services that scope updates with `getShopIds()`. New records go to Location 2.

The SQL makes two changes, in one transaction:

1. **Memberships.** Every member of either shop becomes a member of the other, with the role they already hold. RLS and the mirror policy only show a shop's rows to its members, so without this, Location 2-only staff would see none of D1 Imports' history. Staff who belong only to D1 Imports would also stay in the archived shop, because the app never hides someone's only shop.
2. **Archive.** `shops.archived_at` is set on D1 Imports, unless it is already archived. The location picker and the ⇄ mirror toggle then disappear. Anyone whose active shop was D1 Imports lands in Location 2 on their next page load.

Each row the merge writes is recorded in `public.shop_merge_ledger` with its row version (`xmin`) and a snapshot. The ledger has RLS on and no policies.

## What changes when

| When | Visible effect |
|------|----------------|
| PR #90 deployed | The dashboard numbers, the Command Center live metrics, and the Recent Customers and Recent Vehicles widgets include mirrored shops' records. The invoice vehicle picker lists a mirrored customer's cars. A D1 Imports payment can be reversed from Location 2 (before this, the database refused it). Reports do not change yet. |
| Merge SQL applied | The switcher disappears and everyone lands in Location 2. Former single-location staff see both histories. Reports for Location 2 include D1 Imports' history; reports fold in only mirrored shops that are archived, so a second location that is still open keeps its own report. |

## Order

1. `supabase/migrations/2026-10-16_shop_merge_preflight.sql`: read-only. Run Q0–Q9 one at a time and keep every grid as the baseline. Review Q5–Q8, the live triggers, `shop_users` constraints and RLS policies, before going on.
2. Merge PR #90 and confirm the production deployment on `redlined1-s-projects/redlined1`.
3. `supabase/migrations/2026-10-16_shop_merge.sql`: run once, as one execution.
4. Run that file's verify queries V1–V6 one at a time, then check in the browser.

`supabase/migrations/2026-10-16_shop_merge_rollback.sql` is **emergency recovery only**. It is not a rollout step, and it is never run to test production. It refuses to run until its `set_config` line is uncommented. On any failure: stop further writes, collect evidence, and only then decide whether to use it.

## Emergency rollback: what it guarantees

- It undoes only rows the ledger recorded, and only when the row's `xmin` and snapshot still match. Two kinds of change count as a conflict:
  - a role change, a re-invite, or even a no-op rewrite of a membership the merge inserted;
  - deleting that membership and recreating it, even with the same role.
- On any conflict, the whole rollback aborts and changes nothing. The error lists each row by ledger id. To keep a row, the owner marks it: `UPDATE public.shop_merge_ledger SET status = 'kept_by_owner', resolved_at = now() WHERE id = <id> AND status = 'applied';`. Then rerun the rollback.
- These are never touched:
  - memberships that existed before the merge;
  - memberships added after it;
  - an archive that predated the merge.
- A ledger row whose membership is already gone ends as `absent_at_rollback`, never `rolled_back`.
- Rerunning it is safe, and the merge can be re-applied after it.

## Evidence

- `npm run test:db:shop-merge` runs 54 behavioural checks against the Supabase Postgres 17.6 image, with real `authenticated` sessions through RLS.
- They cover:
  - the preflight is read-only;
  - the memberships and roles the merge adds;
  - the archive;
  - before and after visibility for each kind of user;
  - business rows unchanged;
  - re-applying the merge;
  - refusal without the mirror, or when Location 2 is archived;
  - the rollback lock;
  - an exact restore (including `created_at`);
  - rolling back twice;
  - re-applying after a rollback;
  - role changes, delete and recreate, no-op rewrites and already-removed memberships;
  - memberships added later;
  - a pre-merge archive and archive edits after the merge;
  - session time zones.
- Not proven: compatibility with the full production schema, which the repo cannot rebuild locally. The preflight's Q5–Q8 read the live triggers, constraints and policies so they can be reviewed first.

## Known, out of scope

- Command Center recommendations and customer lifetime intelligence still compute for the active shop only.
- `/api/billing/status` and `/api/billing/usage` return 403 for a user with two owner or manager memberships. This is already true for the owner, and billing is off.
- An RO created at Location 2 from a D1 Imports job card does not sync technicians, because the sync triggers require the same shop. They skip the sync rather than fail.

## Preflight results (production, run by the owner, 2026-10-17)

- **Q0:** the editor showed `d1group / redlined1 / main PRODUCTION`. Both shop ids resolve to "D1 Imports" and "D1 Imports - Location 2".
- **Q1 baseline:** `shop_users` 7 / 4 and `shop_mirrors` 1 / 1. Business rows (D1 Imports / Location 2):

  | Table | D1 Imports | Location 2 |
  |-------|-----------:|-----------:|
  | customers | 54 | 89 |
  | vehicles | 81 | 90 |
  | job_cards | 44 | 47 |
  | closed_jobs | 9 | 9 |
  | repair_orders | 34 | 54 |
  | estimates | 27 | 21 |
  | invoices | 52 | 41 |
  | payments | 14 | 12 |
  | parts | 10 | 170 |
  | audit_events | 560 | 619 |

- **Q2:** owner ×2, manager and advisor belong to both shops with the same role. Three technicians belong to D1 Imports only (aenoysabo@…, bonmiswswang72@…, sabouathonehatsady9@…). The merge adds exactly 3 rows, all to Location 2, all `technician`.
- **Q3:** both mirror directions are present, and both shops are active.
- **Q4:** D1 Imports still holds open work, which staff will finish from Location 2:
  - 44 job cards (40 Booked, 4 Approved);
  - 26 open ROs;
  - 17 open estimates;
  - 41 draft and 1 sent invoices;
  - 1 draft intake.

  Closing one of those job cards now keeps its archive row under D1 Imports. The draft intake will not be listed at Location 2 (intake reads the active shop only). Finish or discard it before the merge.
- **Q7:** columns `shop_id`, `user_id`, `role` (NOT NULL, default `'owner'`) and `created_at` (default `now()`). The primary key is `(shop_id, user_id)`, plus the two foreign keys. No other unique index. This matches the tested stub.
- **Q8:** `shop_users_own` (own rows), `shops_member_view` (`my_shop_ids()`), and the `shop_mirrors` select/insert/delete policies, which check membership of both shops.
- **Q9:** `NULL`. No merge has been applied yet.
- **Q5/Q6 (triggers on `shop_users`/`shops`): not yet received.** Do not run the merge until they are reviewed.
- Seen in Q1, not blocking:
  - `shop_messaging_secrets` 1 / 0: messaging channels are configured only on D1 Imports.
  - `push_subscriptions` 2 / 0: those devices must re-enable push while working in Location 2.

## Closeout log

Fill in as each step happens.

| Step | Date | By | Result |
|------|------|----|--------|
| Preflight run, baseline saved | | | |
| PR #90 merged, production deploy confirmed | | | |
| Merge SQL applied | | | |
| V1–V6 checked against the baseline | | | |
| Browser checks (owner, staff) | | | |
