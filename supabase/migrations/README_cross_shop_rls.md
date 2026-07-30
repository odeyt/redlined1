# Cross-shop RLS fix — applied 2026-07-30

## The leak

Any signed-in user could read `parts`, `repair_orders`, `invoices` and
`shop_settings` rows belonging to **any** shop, regardless of membership.
Reported as a trial user seeing D1's branding and sidebar counts
(158 parts, 24 repair orders, 19 invoices).

Cause: each of those four tables carried a blanket policy —
`auth_all_parts`, `auth_all_repair_orders`, `auth_all_invoices`,
`auth_all_shop_settings` — granting access to the whole `authenticated` role.
Permissive policies are OR'd, so these defeated the correct
`*_shop_scoped` / `owner_isolation` policies sitting alongside them.
`customers`, `vehicles` and `job_cards` never had an `auth_all_*` policy,
which is why they were unaffected.

## The fix (applied manually in the Supabase SQL editor)

```sql
DROP POLICY auth_all_parts         ON public.parts;
DROP POLICY auth_all_repair_orders ON public.repair_orders;
DROP POLICY auth_all_invoices      ON public.invoices;
DROP POLICY auth_all_shop_settings ON public.shop_settings;
```

The pre-existing `*_shop_scoped` and `owner_isolation` policies were left in
place — they already enforce membership correctly, so no replacement policies
were needed and there was no window without a read policy.

## Verification

`tests/audit/rls-cross-shop.spec.ts` failed before the drops and passes after.
It signs in as a real account with no D1 membership and asserts zero readable
rows across all tenant tables. Own-shop access confirmed intact
(own 1/1/1 rows readable, D1 0/0/0).

## Watch for

Any new tenant table must **not** get an `auth_all_*` style policy. Scope on
shop membership. Re-run the check after adding tables:

```bash
npx playwright test tests/audit/rls-cross-shop.spec.ts --project=audit
```

Add the new table to `TENANT_TABLES` in that spec.
