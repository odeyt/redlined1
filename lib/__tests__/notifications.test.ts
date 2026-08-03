/**
 * Repair-order status notifications.
 *
 * The panel read "No notifications yet" permanently. Three causes, and the
 * fix removes all three rather than any one:
 *
 * 1. The feed was a module-level array in the browser, empty on every page
 *    load. Only a change made while that tab was open ever appeared, and a
 *    reload erased it.
 * 2. It relied on Realtime delivering payload.old, which carries the previous
 *    status only under REPLICA IDENTITY FULL — otherwise "Open → Complete"
 *    arrives as "→ Complete".
 * 3. There was nothing to fall back on: no audit table, and repair_orders has
 *    no updated_at, so recent changes could not be reconstructed at all.
 *
 * A trigger writes ro_status_events with both statuses, and the hook reads that
 * table. Realtime becomes an optimisation rather than the mechanism.
 */
import { readFileSync } from 'fs';
import { join } from 'path';

const root = join(__dirname, '..', '..');
const read = (p: string) => readFileSync(join(root, p), 'utf8');

const hook      = read('lib/useNotifications.ts');
const migration = read('supabase/migrations/2026-08-03_ro_status_events.sql');
const roView    = read('features/repair-orders/RepairOrdersView.tsx');

describe('notifications survive a page load', () => {
  it('reads from a table rather than an in-memory array', () => {
    expect(hook).toMatch(/from\('ro_status_events'\)/);
    expect(hook).not.toMatch(/let _notifications/);
  });

  it('loads history on mount, not only live events', () => {
    expect(hook).toMatch(/void load\(\);/);
  });

  it('looks back over a window, so yesterday\'s changes are still there', () => {
    expect(hook).toMatch(/LOOKBACK_DAYS/);
    expect(hook).toMatch(/\.gte\('created_at', since\)/);
  });

  it('remembers what was read and dismissed across reloads', () => {
    expect(hook).toMatch(/localStorage\.setItem/);
    expect(hook).toMatch(/rd1_notif_read/);
    expect(hook).toMatch(/rd1_notif_dismissed/);
  });

  it('bounds what it stores — a UI marker must not grow forever', () => {
    expect(hook).toMatch(/\.slice\(-500\)/);
  });
});

describe('it does not depend on Realtime being configured', () => {
  it('polls as well as subscribing', () => {
    expect(hook).toMatch(/setInterval/);
    expect(hook).toMatch(/POLL_MS/);
  });

  it('refreshes when the tab regains focus', () => {
    // Someone returning after an hour away expects to see what happened.
    expect(hook).toMatch(/addEventListener\('focus'/);
  });

  it('cleans up its timer, listener and channel', () => {
    expect(hook).toMatch(/clearInterval\(timer\)/);
    expect(hook).toMatch(/removeEventListener\('focus'/);
    expect(hook).toMatch(/removeChannel/);
  });

  it('logs a failed read instead of failing silently', () => {
    // Invisible failure is what made the original impossible to diagnose.
    expect(hook).toMatch(/\[notifications\] could not load status events/);
  });
});

describe('both statuses are recorded, which Realtime could not guarantee', () => {
  it('a trigger writes the row, so OLD and NEW are always available', () => {
    expect(migration).toMatch(/OLD\.status, NEW\.status/);
    expect(migration).toMatch(/AFTER UPDATE ON public\.repair_orders/);
  });

  it('records only actual changes', () => {
    expect(migration).toMatch(/NEW\.status IS DISTINCT FROM OLD\.status/);
  });

  it('denormalises the order details, so history is not rewritten later', () => {
    // Joining back would change what a past notification said when a customer
    // is renamed, and break entirely if the order is deleted.
    expect(migration).toMatch(/NEW\.ro_number, NEW\.customer_name, NEW\.vehicle/);
  });
});

describe('every path that changes a status is covered', () => {
  it('the repair-orders view no longer announces changes itself', () => {
    // It covered one code path; the QA modal returns before reaching it, so
    // completing or closing an order produced no notification at all.
    expect(roView).not.toMatch(/addNotification\(/);
    expect(hook).not.toMatch(/export function addNotification/);
  });

  it('the reason is recorded where the call used to be', () => {
    expect(roView).toMatch(/recorded by a trigger on repair_orders/);
  });
});

describe('tenant isolation', () => {
  it('scopes reads through shop_users', () => {
    expect(migration).toMatch(/shop_id IN \(SELECT shop_id FROM public\.shop_users WHERE user_id = auth\.uid\(\)\)/);
  });

  it('scopes the client query to the active shop and its mirrors', () => {
    expect(hook).toMatch(/\.in\('shop_id', shopIds\)/);
  });

  it('gives customers no way to write or edit history', () => {
    expect(migration).not.toMatch(/FOR INSERT TO authenticated/);
    expect(migration).not.toMatch(/FOR UPDATE TO authenticated/);
    expect(migration).not.toMatch(/FOR DELETE TO authenticated/);
    expect(migration).toMatch(/GRANT SELECT ON public\.ro_status_events TO authenticated/);
  });

  it('asserts RLS actually enabled rather than assuming it', () => {
    expect(migration).toMatch(/RAISE EXCEPTION 'RLS did not enable on ro_status_events'/);
  });

  it('grants anon nothing', () => {
    expect(migration).not.toMatch(/TO anon/);
  });
});
