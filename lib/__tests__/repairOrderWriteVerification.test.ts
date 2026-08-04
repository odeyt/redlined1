/**
 * A save that writes nothing must not report success.
 *
 * RO-00019 was taken through QA sign-off in production. The modal closed
 * cleanly, no error appeared, and the database did not change: still
 * In Progress, no closed_date, no invoice. ro_status_events — whose trigger is
 * attached and working — held zero rows, confirming no status UPDATE has ever
 * succeeded against repair_orders since that trigger was created.
 *
 * The cause is that PostgREST returns no error for an UPDATE matching zero
 * rows. RLS filtering, or an order belonging to a shop outside getShopIds(),
 * both produce exactly that. `if (error) throw error` cannot see either.
 *
 * This is the same defect found in the billing webhook, the shops INSERT and
 * shop_settings earlier: the write was never checked, so the failure was
 * invisible rather than loud.
 */
import { readFileSync } from 'fs';
import { join } from 'path';

const src = readFileSync(join(__dirname, '..', '..', 'services/repairOrderService.ts'), 'utf8');

const fn = (name: string) => {
  const start = src.indexOf(`export async function ${name}`);
  const next = src.indexOf('\nexport ', start + 1);
  return src.slice(start, next === -1 ? undefined : next);
};

describe('updateRepairOrder proves the row was written', () => {
  const update = fn('updateRepairOrder');

  it('asks for the affected row count', () => {
    expect(update).toMatch(/\.update\(payload, \{ count: 'exact' \}\)/);
  });

  it('treats zero rows as a failure', () => {
    expect(update).toMatch(/if \(count === 0\)/);
    expect(update).toMatch(/throw new Error\(/);
  });

  it('checks the error first, so a real error surfaces as itself', () => {
    // With an error, count is null — reversing these would report "not found"
    // for what is actually a connection or permission error.
    expect(update.indexOf('if (error) throw error')).toBeLessThan(update.indexOf('if (count === 0)'));
  });

  it('names both plausible causes, since the operator cannot tell them apart', () => {
    expect(update).toMatch(/different shop/);
    expect(update).toMatch(/permission/);
  });
});

describe('closeRepairOrder does the same', () => {
  const close = fn('closeRepairOrder');

  it('counts, rather than trusting the absence of an error', () => {
    expect(close).toMatch(/count: 'exact'/);
    expect(close).toMatch(/if \(count === 0\)/);
  });

  it('checks the error first', () => {
    expect(close.indexOf('if (error) throw error')).toBeLessThan(close.indexOf('if (count === 0)'));
  });
});

describe('no write in this service reports success without evidence', () => {
  it('every update in the file requests a count', () => {
    const updates = src.match(/\.update\(/g) ?? [];
    const counted = src.match(/count: 'exact'/g) ?? [];
    expect(counted.length).toBe(updates.length);
  });
});
