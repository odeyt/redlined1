# INFRA BUG 001: intelligence_events RLS Grant Missing

## Root Cause

`migration_intelligence_bus.sql` creates three tables — `recommendations`, `intelligence_signals`, and `intelligence_events` — and enables RLS on all three. However, the GRANT block at line 189 only includes:

```sql
GRANT ALL ON TABLE recommendations TO service_role, authenticated, anon;
GRANT ALL ON TABLE intelligence_signals TO service_role, authenticated, anon;
```

`intelligence_events` was simply omitted. PostgreSQL enforces table-level GRANTs **before** RLS policies are evaluated. When the `authenticated` role lacks a table-level GRANT, PostgreSQL returns error `42501` (`insufficient_privilege`) regardless of any RLS policies that might otherwise permit access.

## Previous Behavior

Any query from an `authenticated` session against `intelligence_events` returned:
```
ERROR 42501: permission denied for table intelligence_events
```

RLS policies were never reached. The service-role was unaffected because `service_role` bypasses RLS entirely and had been granted via an earlier catch-all.

## Corrected Policy

File: `supabase/migrations/fix_intelligence_events_rls.sql`

Two policies are applied:

1. **`owner_manager_intelligence_events_select`** — Allows `SELECT` from the `authenticated` role scoped to the user's shop (via `shop_users` join). Uses `IN` rather than `=` subquery for robustness when a user belongs to multiple shops.

2. **`service_intelligence_events_all`** — Allows `ALL` operations for `service_role`. Technically redundant since service_role bypasses RLS, but makes policy intent explicit and ensures compatibility if bypass is ever revoked.

GRANTs:
- `SELECT` to `authenticated` (minimum needed; write operations go through API routes using service_role)
- `ALL` to `service_role`

## Security Implications

- Authenticated users can only **read** events — no INSERT/UPDATE/DELETE via authenticated role.
- All writes are performed by server-side API routes using the service role key.
- RLS scopes reads to events belonging to the user's shop, so cross-shop data leakage is prevented.
- No customer PII is stored in `intelligence_events.payload` per architecture contract.

## Verification SQL

Run after applying migration to confirm access is restored:

```sql
-- As authenticated user (replace with real user JWT in production test)
SELECT COUNT(*) FROM intelligence_events WHERE shop_id = '<your-shop-id>';

-- Confirm policies exist
SELECT policyname, cmd, roles
FROM pg_policies
WHERE tablename = 'intelligence_events';

-- Confirm grant exists
SELECT grantee, privilege_type
FROM information_schema.role_table_grants
WHERE table_name = 'intelligence_events';
```

Expected: `authenticated` shows `SELECT`, `service_role` shows `SELECT`, `INSERT`, `UPDATE`, `DELETE`, `TRUNCATE`, `REFERENCES`, `TRIGGER`.

## Rollback SQL

```sql
-- Remove the fix policies
DROP POLICY IF EXISTS "owner_manager_intelligence_events_select" ON intelligence_events;
DROP POLICY IF EXISTS "service_intelligence_events_all" ON intelligence_events;

-- Revoke the grants
REVOKE SELECT ON TABLE intelligence_events FROM authenticated;
```

Note: rolling back restores the broken state. Only roll back if the migration itself caused an unexpected issue; the pre-rollback state means authenticated users cannot query intelligence_events at all.
