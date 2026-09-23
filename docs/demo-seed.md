# Demo seed: Summit Auto & Fleet Service

Fictional, connected records that make the marketing demo shop look like a busy
independent US repair business, **counted by the Command Center's own queries**.
No dashboard number is written anywhere.

- Data: `lib/demo-seed/summitDataset.ts` (pure, relative to the run time)
- Safety gates: `lib/demo-seed/guards.ts`
- Idempotency and schema checks: `lib/demo-seed/plan.ts`
- CLI: `scripts/demo/seed-summit-demo.ts` (`npm run demo:seed -- <mode>`)
- Proof: `lib/demo-seed/__tests__/reconciliation.test.ts` loads the dataset into
  memory and runs it through the real `MetricsBuilder` and `RuleRegistry` at five
  different run times.

> **Nothing here has been run against any database.** This machine is only
> configured for production. Every command below is for the owner to review and
> run.

> **Check the security hold first.** `docs/marketing-capture.md` on
> `feat/marketing-capture-harness` says *"SECURITY HOLD, 2026-09-16. Do not seed,
> create a session, or capture"*. This seed is insert-only, so it does not fire
> the `AFTER UPDATE` alert and pg_net triggers that caused the hold. It is still
> a production write, so don't run it until the owner lifts the hold.

## What a freshly seeded shop shows

| Command Center | Value | From |
|---|---|---|
| Revenue Today | **$3,860.00** | 3 invoices paid at pickup today |
| Payments Today (tile) | **6** (total $5,240) | those 3 plus 3 parts deposits |
| Open Jobs | **8** | Booked 2, Approved 2, In Progress 3, Pending Parts 1 |
| High Priority | **2** | rules: unpaid invoices (4, more than 3) and completed-not-invoiced |
| Critical | **0** | no rule computes one |
| Open Recs | **5** | + stale estimates, low inventory, stuck repair order (all medium) |
| Overdue Invoices | **2** ($1,480) | Sent, 12 and 5 days past due |
| Unpaid invoices | 4 ($2,890) | 2 overdue + 2 Sent, not yet due |
| Stale estimates | 3 ($4,250) | Sent 5, 8 and 12 days ago |
| Completed, not invoiced | 2 ($2,180 at $140/h) | job cards marked Completed, no invoice |
| Total Opportunity | **$7,140.00** | unpaid + stale, the existing formula |
| Stuck repair orders | 1 | Pending Parts since 5 days ago (alternator backorder) |
| Low inventory | 4 | parts at or below threshold |
| Repair cases today | 5 | one per completed job |
| Shop health | **40, "At Risk"** | see below |

Also 16 customers (3 of them fleets), 20 vehicles, 4 technicians plus an
owner/service manager, 12 parts, 5 jobs completed this month (in `closed_jobs`,
as the app archives them), 9 repair orders and 4 estimates.

### Two results differ from the brief

These come from the existing rules. They were not tuned to hit a number.

- **Open recommendations: 5, not 4.** Every problem the brief asked for fires its
  own rule: overdue/unpaid, stale, stuck, low stock and not invoiced. The only
  way to get 4 is to drop one of those conditions.
- **Shop health: 40 ("At Risk").** `calculateShopHealthScore` takes 10–15 points
  off for each problem type, whatever its size: overdue −10, stale −10, stuck −15,
  not invoiced −15, low stock −10. Dropping the stuck job and the not-invoiced
  jobs would give 70 ("Needs Attention"). That's a content decision for the
  owner; the seed doesn't hide it.

## Fictional by construction

Phones are in `555-0100…0199` and emails are at `example.com`. VINs start
`DEMOVIN`: a real VIN can never contain I or O. Plates and parts use `DEMO-`,
documents use `SAF-`, and every customer is tagged `demo-seed`. Repair cases
have no VIN and `share_to_network = false`. A test fails if any D1 identifier
appears in the dataset.

## Safety model

The seed writes only when **every** check below passes (`guards.ts`). Each fact
is read live, and a fact that can't be read counts as a failure:

1. `DEMO_SHOP_ID` names the shop. The seed never looks a shop up by name.
2. The database reads that shop back with `shops.is_synthetic = true`.
3. It isn't a D1 internal shop, and it has no `shop_mirrors` rows. A mirrored
   shop would show fictional customers to a real one.
4. It has exactly one member, the owner, and the owner's plan isn't `'free'`.
5. `ALLOW_DEMO_SEED=true`, plus `ALLOW_PRODUCTION_DEMO_SEED=true` when the target
   is production.
6. The live schema (PostgREST OpenAPI) accepts every column it will write.
7. `TZ=UTC` (the npm script sets it), and it isn't the evening gap (see Timing).

On top of the gates:

- **Scoped:** every read and write carries `.eq('shop_id', DEMO_SHOP_ID)`.
- **Insert-only:** it never updates a job card, repair order, estimate or
  invoice. Those updates fire alert triggers and pg_net pushes; inserts don't.
- **Idempotent:** every row has a stable key, so a second run the same day
  inserts nothing. Dated keys carry the day (`SAF-JC-260923-03`).
- **Uses no shared sequences:** invoice numbers are `SAF-INV-…`, not drawn from
  `invoice_number_seq`.
- **No messages:** it sends no email, SMS or push, and queues no Sapelee events.
- **Changes no permissions:** it changes no grant, policy or function.

## Timing

Revenue Today is counted in the browser, from Chicago midnight. Payments today,
repair cases and stuck jobs are counted on the server, from UTC midnight.
"Today" records go in the overlap, so `apply` refuses **between about 18:00 and
01:00 America/Chicago**, when UTC is already tomorrow.

The same split affects viewing. After about 19:00 Chicago the server's day rolls
over and its "today" figures return to 0 until the next day's run. That's
existing app behaviour: the server has no shop time zone.

## Owner plan

This is a decision for the owner. The seed won't change it.

A demo owner on `profiles.plan = 'free'` can't hold this dataset:

- `enforce_free_tier_count_limit` is a `BEFORE INSERT` trigger that applies to
  every role, including the service role. It caps customers and vehicles at 10
  and job cards at 5 a month. It checks `plan = 'free'` only, so a trial date
  doesn't lift the cap.
- Payments, Parts and Reports are paid modules (`lib/planGate.ts`). The detail
  screens behind "Payments Today" and "Low Inventory" would be locked.

The least-privilege fix is to change **one row**, the demo owner's profile. It
needs no grant, policy or trigger change. Only run it after the shop is marked
synthetic, and only if you accept that the owner portal will list this owner
with a paid plan and no subscription:

```sql
-- Review, then run in the Supabase SQL editor. Expect exactly one row.
UPDATE public.profiles p
SET plan = 'pro'
WHERE p.id = (
  SELECT su.user_id FROM public.shop_users su
  JOIN public.shops s ON s.id = su.shop_id
  WHERE s.id = '<DEMO_SHOP_ID>' AND s.is_synthetic AND su.role = 'owner'
)
RETURNING p.id, p.plan;
```

The alternative would be a migration exempting `is_synthetic` shops from the
free-tier trigger. It isn't included: that changes the enforcement code for
everyone to benefit one account, and Payments, Parts and Reports would still be
locked.

## Applying it: exact steps

**0. Identify the "My Shop" tenant (read-only).** Use the email you sign in
with for demos:

```sql
SELECT s.id, s.name, s.created_at, ss.company_name, ss.default_currency, p.plan,
       (SELECT count(*) FROM public.shop_users x WHERE x.shop_id = s.id)  AS members,
       (SELECT count(*) FROM public.shop_mirrors m WHERE m.shop_id = s.id OR m.mirror_shop_id = s.id) AS mirror_links,
       (SELECT count(*) FROM public.customers c WHERE c.shop_id = s.id)   AS customers,
       (SELECT count(*) FROM public.job_cards j WHERE j.shop_id = s.id)   AS job_cards,
       (SELECT count(*) FROM public.invoices i WHERE i.shop_id = s.id)    AS invoices
FROM auth.users u
JOIN public.shop_users su ON su.user_id = u.id AND su.role = 'owner'
JOIN public.shops s ON s.id = su.shop_id
LEFT JOIN public.shop_settings ss ON ss.shop_id = s.id
LEFT JOIN public.profiles p ON p.id = u.id
WHERE lower(u.email) = lower('<demo login email>');
```

Confirm the result: one shop, one member, no mirror links, and no records that
belong to a real customer.

**1. Apply the `is_synthetic` migration.** It's
`supabase/migrations/2026-09-15_shops_is_synthetic.sql` on
`feat/marketing-capture-harness`. Follow its four-step instructions. It also
removes the demo shop from growth reporting.

**2. Mark the shop synthetic** (runs as `postgres` in the SQL editor; tenants
can't change the flag):

```sql
UPDATE public.shops SET is_synthetic = true
WHERE id = '<DEMO_SHOP_ID>' AND is_synthetic = false
RETURNING id, name;   -- expect exactly one row
```

**3. Owner plan.** See the Owner plan section above.

**4. Name the shop and set USD.** This touches the demo shop's settings row only:

```sql
UPDATE public.shop_settings ss
SET company_name = 'Summit Auto & Fleet Service',
    address = '1200 Summit Ridge Road, Sample City, IL (fictional)',
    phone = '(312) 555-0100', email = 'service@example.com',
    default_currency = 'USD', labor_rate = 140, default_tax_rate = 0
FROM public.shops s
WHERE s.id = ss.shop_id AND s.id = '<DEMO_SHOP_ID>' AND s.is_synthetic
RETURNING ss.shop_id, ss.company_name, ss.default_currency;
```

**5. Dry run.** It reads only and writes nothing. It prints every gate, the
schema check and the per-table insert plan. Run it from the main checkout,
where `.env.local` lives, or set `DOTENV_PATH`:

```powershell
$env:DEMO_SHOP_ID = '<DEMO_SHOP_ID>'
npm run demo:seed -- plan
```

**6. Apply** (after 01:00 and before 18:00 America/Chicago):

```powershell
$env:DEMO_SHOP_ID = '<DEMO_SHOP_ID>'
$env:ALLOW_DEMO_SEED = 'true'
$env:ALLOW_PRODUCTION_DEMO_SEED = 'true'
npm run demo:seed -- apply
```

It inserts the missing rows, recomputes the shop's metrics and recommendations
with the app's own engine, and prints what the Command Center now reads.
Running it again the same day inserts nothing.

**7. On a later day,** clear the earlier day's open records, then apply again:

```powershell
npm run demo:seed -- cleanup
npm run demo:seed -- apply
```

Paid invoices and payments from earlier days stay as history. They don't move
today's figures.

**8. Remove everything the seed created:**

```powershell
npm run demo:seed -- cleanup --all
```

Payments are an append-only ledger, so they are **reversed**, not deleted: one
negative entry per seeded payment, the app's own correction mechanism. Invoices
those payments reference stay, because the foreign key is `ON DELETE RESTRICT`,
and so do the customers they reference. The script lists what it kept.
Technicians are removed only when both the name and the seed's note match.

## Rollback

- **Seed:** `cleanup --all`, as above.
- **Shop settings:** re-run step 4 with the previous values.
- **Plan:** `UPDATE public.profiles SET plan = '<previous>' WHERE id = '<owner id>';`
- **Synthetic flag:** `UPDATE public.shops SET is_synthetic = false WHERE id = '<DEMO_SHOP_ID>';`
  (as `postgres`)
