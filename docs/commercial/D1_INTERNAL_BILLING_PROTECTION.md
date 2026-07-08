# D1 Internal Shop Billing Protection

Ensures D1 internal/demo shops are never blocked, charged, or expired by the subscription enforcement system.

---

## Why This Exists

When `subscription_enforcement` is enabled, shops without an active subscription are blocked from creating records. D1 internal shops must be permanently exempt — they exist for testing, demos, and internal operations.

This script creates a `trialing` subscription for each D1 internal shop with a trial end date far in the future. `licenseService` treats `trialing` as fully active.

---

## Identifying D1 Internal Shops

D1 internal shops are identified by `shop_name` containing `D1` (case-insensitive) OR by having `owner_email` matching the D1 admin email domain.

Run this query first to **verify** which shops will be protected before executing the insert:

```sql
-- REVIEW ONLY — runs no changes
SELECT id, shop_name, owner_email, created_at
FROM shops
WHERE
  LOWER(shop_name) LIKE '%d1%'
  OR owner_email ILIKE '%@redlined1.com'
ORDER BY created_at;
```

Confirm the list looks correct. If a shop is listed that should NOT be protected, add an exclusion by `id` to the insert below.

---

## Protection SQL

> **Safe to run**: Uses `INSERT ... ON CONFLICT DO NOTHING`. Running twice produces no duplicate rows and no errors.

```sql
-- D1 Internal Shop Billing Protection
-- Inserts trialing subscription for all D1 internal shops.
-- ON CONFLICT DO NOTHING — safe to re-run.

INSERT INTO shop_subscriptions (
  shop_id,
  provider,
  provider_subscription_id,
  status,
  plan_key,
  current_period_start,
  current_period_end,
  trial_end,
  cancel_at_period_end,
  metadata
)
SELECT
  s.id                            AS shop_id,
  'internal'                      AS provider,
  'internal-' || s.id             AS provider_subscription_id,
  'trialing'                      AS status,
  'professional'                  AS plan_key,
  NOW()                           AS current_period_start,
  '2099-12-31 00:00:00+00'        AS current_period_end,
  '2099-12-31 00:00:00+00'        AS trial_end,
  false                           AS cancel_at_period_end,
  jsonb_build_object(
    'note', 'D1 internal shop — billing exempt',
    'protected_at', NOW()::text
  )                               AS metadata
FROM shops s
WHERE
  LOWER(s.shop_name) LIKE '%d1%'
  OR s.owner_email ILIKE '%@redlined1.com'
ON CONFLICT (shop_id) DO NOTHING;
```

> **Note**: `ON CONFLICT (shop_id)` requires a unique constraint on `shop_subscriptions(shop_id)`. If the table allows multiple rows per shop, change the conflict clause to `ON CONFLICT (shop_id, provider)` or use a different unique key that matches the actual schema.

---

## Verification

After running the insert, verify the rows were created:

```sql
SELECT
  ss.shop_id,
  s.shop_name,
  ss.status,
  ss.plan_key,
  ss.trial_end,
  ss.metadata->>'note' AS note
FROM shop_subscriptions ss
JOIN shops s ON s.id = ss.shop_id
WHERE ss.provider = 'internal'
ORDER BY s.shop_name;
```

Expected output: one row per D1 internal shop, `status = trialing`, `trial_end = 2099-12-31`.

---

## When to Run

1. **Before** enabling `subscription_enforcement` in any environment
2. **After** any database restore or migration that truncates `shop_subscriptions`
3. If a new D1 internal shop is created, re-run (the `ON CONFLICT DO NOTHING` makes it safe)

---

## What NOT To Do

- DO NOT set `status = 'active'` with a real `provider_subscription_id` — this creates false billing records
- DO NOT delete existing `shop_subscriptions` rows before re-running
- DO NOT run this on production until production billing is officially enabled
- DO NOT use this pattern for real customer shops
