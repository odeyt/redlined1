# Migration Registry — RedlineD1

**Version:** 1.0  
**Last Updated:** 2026-07-07

This registry documents every database migration applied to production.
Do not alter existing migrations — append only.

---

## Applied Migrations

| # | Migration File | Applied | Date Applied | Rollback Available | Dependencies | Notes |
|---|---------------|---------|--------------|-------------------|--------------|-------|
| 1 | migration_billing.sql | ✓ Yes | 2026 | Partial | None | Billing tables: subscriptions, payment_events |
| 2 | migration_feature_flags.sql | ✓ Yes | 2026 | ✓ Full | None | feature_flags table + 10 seed flags |
| 3 | migration_observability_logs.sql | ✓ Yes | 2026 | ✓ Full | None | observability_logs table |

---

## Migration Details

### migration_billing.sql
- **Tables created:** `subscriptions`, `payment_events` (or similar billing tables)
- **RLS policies:** Shop-scoped via `public.my_shop_ids()`
- **Rollback:** Drop billing tables — WARNING: loses all billing history
- **Reverse SQL:**
  ```sql
  -- Run only if explicitly rolling back billing migration
  -- DROP TABLE IF EXISTS payment_events;
  -- DROP TABLE IF EXISTS subscriptions;
  ```

### migration_feature_flags.sql
- **Tables created:** `feature_flags`
- **Seeds:** 10 default flags, all disabled
- **Rollback:** Full — drop table, re-run to reset
- **Reverse SQL:**
  ```sql
  DROP TABLE IF EXISTS feature_flags;
  -- Re-run migration_feature_flags.sql to recreate with defaults
  ```

### migration_observability_logs.sql
- **Tables created:** `observability_logs`
- **Rollback:** Full — logs are non-critical, safe to drop and recreate
- **Reverse SQL:**
  ```sql
  DROP TABLE IF EXISTS observability_logs;
  -- Re-run migration_observability_logs.sql to recreate
  ```

---

## Migration Application Procedure

When applying a new migration to production:

```
1. Test migration on staging first
2. Verify staging app works after migration
3. Create a release snapshot (docs/releases/)
4. Apply migration in Supabase production SQL Editor
5. Verify /api/health → feature_flags and supabase: OK
6. Update this registry with migration details
7. Commit registry update to git
```

---

## Migration Template

When adding a new migration entry:

```markdown
### migration_<name>.sql
- **Tables created/altered:** 
- **RLS policies:** 
- **Rollback:** Available / Partial / Not available
- **Reverse SQL:**
  ```sql
  -- Rollback SQL here
  ```
- **Dependencies:** 
- **Notes:** 
```

---

## Checking Applied Migrations

In Supabase SQL Editor, verify migration results:

```sql
-- Check all expected tables exist
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public'
ORDER BY table_name;
```
