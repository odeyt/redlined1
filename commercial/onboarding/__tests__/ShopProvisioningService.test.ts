jest.mock('@/lib/supabaseServer', () => ({
  getAdminDb: jest.fn(),
}));

import { getAdminDb } from '@/lib/supabaseServer';
import { ensureTrialSubscription } from '../ShopProvisioningService';

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

describe('ensureTrialSubscription', () => {
  const userId = 'user-1';
  const shopId = 'shop-1';

  it('creates the trial subscription AND syncs profiles.plan/trial_ends_at (the bug: usePlan() only reads profiles)', async () => {
    const updateCalls: Array<{ table: string; payload: unknown }> = [];
    const fromMock = jest.fn((table: string) => {
      const builder = makeBuilder(
        table === 'subscriptions'
          ? (fromMock.mock.calls.filter(c => c[0] === 'subscriptions').length === 1
              ? { data: null, error: null } // existing-trial check: none found
              : { data: { id: 'trial-123' }, error: null }) // insert result
          : { data: null, error: null },
      );
      const originalUpdate = builder.update as jest.Mock;
      builder.update = jest.fn((payload: unknown) => {
        updateCalls.push({ table, payload });
        return originalUpdate(payload);
      });
      return builder;
    });

    (getAdminDb as jest.Mock).mockReturnValue({ from: fromMock });

    const result = await ensureTrialSubscription(userId, shopId, null);

    expect(result).toEqual({ trialId: 'trial-123', created: true });

    const profilesUpdate = updateCalls.find(c => c.table === 'profiles');
    expect(profilesUpdate).toBeDefined();
    expect(profilesUpdate?.payload).toMatchObject({ plan: 'trial' });
    expect((profilesUpdate?.payload as { trial_ends_at: string }).trial_ends_at).toEqual(expect.any(String));

    // Sanity: the synced trial_ends_at should be ~7 days out, matching the
    // subscriptions row so the two tables never silently disagree.
    const trialEndsAt = new Date((profilesUpdate?.payload as { trial_ends_at: string }).trial_ends_at);
    const daysOut = (trialEndsAt.getTime() - Date.now()) / 86_400_000;
    expect(daysOut).toBeGreaterThan(6.9);
    expect(daysOut).toBeLessThan(7.1);
  });

  it('is idempotent — does not touch profiles when a subscription already exists', async () => {
    const fromMock = jest.fn(() => makeBuilder({ data: { id: 'existing-trial' }, error: null }));
    (getAdminDb as jest.Mock).mockReturnValue({ from: fromMock });

    const result = await ensureTrialSubscription(userId, shopId, null);

    expect(result).toEqual({ trialId: 'existing-trial', created: false });
    expect(fromMock).toHaveBeenCalledWith('subscriptions');
    expect(fromMock).not.toHaveBeenCalledWith('profiles');
  });
});
