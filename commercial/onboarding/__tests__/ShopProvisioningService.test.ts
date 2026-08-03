jest.mock('@/lib/supabaseServer', () => ({
  getAdminDb: jest.fn(),
}));

import { getAdminDb } from '@/lib/supabaseServer';
import { ensureInitialPlan, TRIAL_DAYS } from '../ShopProvisioningService';

/**
 * Plan settlement on signup and on every later auth callback.
 *
 * A new account gets a TRIAL_DAYS trial with every module unlocked, lapsing to
 * Free Forever with its data intact. Chosen on 2026-08-03: under
 * free-from-signup a customer never saw Vehicle Intake, Parts, Reports,
 * Employees or AI Copilot, so the Upgrade button asked them to pay for things
 * they had never used.
 *
 * The two rules that matter most are the ones that stop this running away:
 *
 *   - an ACTIVE trial is never re-granted, or a password reset would restart
 *     the clock and the trial would never end
 *   - a user who has already spent a trial (plan 'free', no end date) never
 *     gets another by signing in again
 */

type Result = { data: unknown; error: unknown };

// Minimal chainable query-builder mock: every method returns itself so any
// call sequence works, and it resolves via `then` regardless of where the
// real code stops chaining (mirrors supabase-js's thenable builder).
function makeBuilder(result: Result) {
  const builder: Record<string, unknown> = {};
  const chain = () => builder;
  builder.select = jest.fn(chain);
  builder.insert = jest.fn(chain);
  builder.update = jest.fn(chain);
  builder.upsert = jest.fn(chain);
  builder.eq = jest.fn(chain);
  builder.in = jest.fn(chain);
  builder.maybeSingle = jest.fn(() => Promise.resolve(result));
  builder.single = jest.fn(() => Promise.resolve(result));
  builder.then = (resolve: (r: Result) => unknown) => Promise.resolve(result).then(resolve);
  return builder;
}

const userId = 'user-1';
const shopId = 'shop-1';
const daysFromNow = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString();

/** Runs ensureInitialPlan against a given existing profile row. */
async function run(profile: Record<string, unknown> | null) {
  const updates: unknown[] = [];
  const tables: string[] = [];
  const fromMock = jest.fn((table: string) => {
    tables.push(table);
    const builder = makeBuilder({ data: profile, error: null });
    const original = builder.update as jest.Mock;
    builder.update = jest.fn((payload: unknown) => { updates.push(payload); return original(payload); });
    return builder;
  });
  (getAdminDb as jest.Mock).mockReturnValue({ from: fromMock });
  const result = await ensureInitialPlan(userId, shopId, null);
  return { result, updates, tables };
}

describe('a brand-new account', () => {
  it('is granted a trial', async () => {
    const { result, updates } = await run(null);
    expect(result).toEqual({ plan: 'trial' });
    expect(updates[0]).toMatchObject({ plan: 'trial' });
  });

  it('gets exactly TRIAL_DAYS to evaluate', async () => {
    const { updates } = await run(null);
    const ends = new Date((updates[0] as { trial_ends_at: string }).trial_ends_at);
    const days = (ends.getTime() - Date.now()) / 86_400_000;
    expect(days).toBeGreaterThan(TRIAL_DAYS - 0.01);
    expect(days).toBeLessThan(TRIAL_DAYS + 0.01);
  });

  it('never touches the subscriptions table — that is for real provider records', async () => {
    const { tables } = await run(null);
    expect(tables).not.toContain('subscriptions');
  });
});

describe('an account partway through its trial', () => {
  it('is left alone, so a password reset cannot restart the clock', async () => {
    const { result, updates } = await run({ plan: 'trial', trial_ends_at: daysFromNow(3) });
    expect(result).toEqual({ plan: 'unchanged' });
    expect(updates).toHaveLength(0);
  });
});

describe('an account whose trial has run out', () => {
  it('drops to Free Forever and the end date is cleared', async () => {
    const { result, updates } = await run({ plan: 'trial', trial_ends_at: daysFromNow(-1) });
    expect(result).toEqual({ plan: 'free' });
    expect(updates[0]).toEqual({ plan: 'free', trial_ends_at: null });
  });

  it('does not get a second trial on the next sign-in', async () => {
    // The cleared end date from the step above is what makes this hold.
    const { result, updates } = await run({ plan: 'free', trial_ends_at: null });
    expect(result).toEqual({ plan: 'unchanged' });
    expect(updates).toHaveLength(0);
  });

  it('is also settled when the legacy trial had no end date at all', async () => {
    const { result } = await run({ plan: 'trial', trial_ends_at: null });
    expect(result).toEqual({ plan: 'free' });
  });
});

describe('the contradictory row a database trigger writes on signup', () => {
  // plan 'free' with a future trial date, which the app ignored entirely —
  // that is why August signups lost the features July signups had.
  it('is promoted to a trial', async () => {
    const ends = daysFromNow(5);
    const { result, updates } = await run({ plan: 'free', trial_ends_at: ends });
    expect(result).toEqual({ plan: 'trial' });
    expect(updates[0]).toEqual({ plan: 'trial', trial_ends_at: new Date(ends).toISOString() });
  });

  it('honours the original end date rather than starting a fresh week', async () => {
    const ends = daysFromNow(2);
    const { updates } = await run({ plan: 'free', trial_ends_at: ends });
    expect((updates[0] as { trial_ends_at: string }).trial_ends_at).toBe(new Date(ends).toISOString());
  });
});

describe('a paying customer', () => {
  it.each(['solo', 'starter', 'professional', 'business', 'enterprise', 'pro'])(
    'on %s is never downgraded', async plan => {
      const { result, updates } = await run({ plan, trial_ends_at: null });
      expect(result).toEqual({ plan: 'unchanged' });
      expect(updates).toHaveLength(0);
    });

  it('is not downgraded even with a stale trial date attached', async () => {
    const { result } = await run({ plan: 'starter', trial_ends_at: daysFromNow(-30) });
    expect(result).toEqual({ plan: 'unchanged' });
  });
});
