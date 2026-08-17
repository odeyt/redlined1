/**
 * The one function in the system that can delete append-only rows.
 *
 * It exists because M1 and M2 made the E2E harness unable to tear down its own
 * throwaway shops: payments and audit_events became append-only while keeping
 * foreign keys to shops, so any run that recorded a payment — or merely edited
 * a customer — left a tenant that could never be removed.
 *
 * Append-only is worth keeping, so the exemption is narrow and these tests are
 * about the narrowness, not the feature.
 */
import { readFileSync } from 'fs';
import { join } from 'path';

const SQL = readFileSync(
  join(process.cwd(), 'supabase/migrations/2026-08-17_m6_purge_synthetic_shop.sql'),
  'utf8',
);
const CODE = SQL.replace(/^\s*--.*$/gm, '');

describe('the purge refuses anything that is not synthetic', () => {
  it('checks the shop name against the E2E marker', () => {
    // The only line in the function that protects production data.
    expect(CODE).toMatch(/IF v_name NOT LIKE '\[E2E\]%' THEN/);
    expect(CODE).toMatch(/Refusing to purge %: not a synthetic E2E shop/);
  });

  it('checks before touching anything', () => {
    // Scoped to the purge function: the trigger bodies above it mention the
    // same flag, and comparing against those would measure nothing.
    const body = CODE.slice(CODE.indexOf('CREATE OR REPLACE FUNCTION public.purge_synthetic_shop'));
    const guardAt = body.indexOf("NOT LIKE '[E2E]%'");
    const flagAt = body.indexOf('set_config');
    const deleteAt = body.indexOf('DELETE FROM');
    expect(guardAt).toBeGreaterThan(-1);
    expect(guardAt).toBeLessThan(flagAt);
    expect(guardAt).toBeLessThan(deleteAt);
  });

  it('refuses a shop that does not exist rather than silently succeeding', () => {
    expect(CODE).toMatch(/IF v_name IS NULL THEN\s*\n\s*RAISE EXCEPTION 'No such shop'/);
  });
});

describe('who can call it', () => {
  it('is granted to service_role only', () => {
    // The harness runs with the service key. No signed-in user should be able
    // to reach a function whose whole purpose is deleting a tenant.
    expect(CODE).toMatch(/GRANT EXECUTE ON FUNCTION public\.purge_synthetic_shop\(UUID\) TO service_role/);
  });

  it('is explicitly revoked from PUBLIC and from app roles', () => {
    // Postgres grants EXECUTE to PUBLIC by default.
    expect(CODE).toMatch(/REVOKE ALL ON FUNCTION public\.purge_synthetic_shop\(UUID\) FROM PUBLIC/);
    expect(CODE).toMatch(/REVOKE ALL ON FUNCTION public\.purge_synthetic_shop\(UUID\) FROM authenticated, anon/);
  });

  it('never grants it to authenticated', () => {
    expect(CODE).not.toMatch(/GRANT EXECUTE ON FUNCTION public\.purge_synthetic_shop[^;]*authenticated/);
  });
});

describe('append-only survives everywhere else', () => {
  it('exempts deletion only while the purge flag is set', () => {
    const guard = /current_setting\('redlined1\.purging_synthetic_shop', true\) = 'on'/;
    expect(CODE.match(guard)?.length).toBeTruthy();
    // Both triggers, not just one.
    expect(CODE).toMatch(/audit_events_are_append_only[\s\S]*?purging_synthetic_shop/);
    expect(CODE).toMatch(/payments_are_append_only[\s\S]*?purging_synthetic_shop/);
  });

  it('sets the flag transaction-locally, so it cannot leak between sessions', () => {
    // set_config(..., true) is the LOCAL form: it ends with the transaction.
    expect(CODE).toMatch(/set_config\('redlined1\.purging_synthetic_shop', 'on', true\)/);
  });

  it('still raises for every ordinary delete', () => {
    expect(CODE).toMatch(/audit_events is append-only/);
    expect(CODE).toMatch(/payments is an append-only ledger/);
  });
});

describe('it finds tables without being told about them', () => {
  it('discovers shop-scoped tables from the catalogue', () => {
    // A hand-maintained list is exactly what left payments and
    // maintenance_schedules behind.
    expect(CODE).toMatch(/FROM information_schema\.columns c/);
    expect(CODE).toMatch(/c\.column_name = 'shop_id'/);
    expect(CODE).toMatch(/t\.table_type = 'BASE TABLE'/);
  });

  it('copes with foreign keys by retrying rather than encoding an order', () => {
    // A dependency graph written by hand would go stale the same way the table
    // list did.
    expect(CODE).toMatch(/WHEN foreign_key_violation THEN/);
    expect(CODE).toMatch(/FOR v_pass IN 1\.\.6 LOOP/);
  });

  it('clears employees, which hang off the organization not the shop', () => {
    expect(CODE).toMatch(/DELETE FROM public\.employees WHERE organization_id = v_org/);
  });

  it('removes an organization only once its last shop is gone', () => {
    expect(CODE).toMatch(/NOT EXISTS \(\s*SELECT 1 FROM public\.shops WHERE organization_id = v_org/);
  });
});

describe('the harness uses it', () => {
  const CLEANUP = readFileSync(join(process.cwd(), 'tests/helpers/e2e-cleanup.ts'), 'utf8');

  it('purges instead of deleting table by table', () => {
    expect(CLEANUP).toMatch(/rpc\('purge_synthetic_shop', \{ p_shop_id: shopId \}\)/);
    expect(CLEANUP).not.toMatch(/const SHOP_SCOPED_TABLES/);
  });

  it('reports a failed purge rather than swallowing it', () => {
    // A shop that cannot be purged is a tenant left behind in a real database.
    expect(CLEANUP).toMatch(/result\.errors\.push\(`purge \$\{shopId\}/);
  });

  it('still refuses to delete a non-synthetic user', () => {
    expect(CLEANUP).toMatch(/REFUSED to delete non-synthetic user/);
  });
});
