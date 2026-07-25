jest.mock('@/lib/supabaseServer', () => ({
  getAdminDb: jest.fn(),
}));

import { getAdminDb } from '@/lib/supabaseServer';
import { ensureFreeSubscription } from '../ShopProvisioningService';

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

describe('ensureFreeSubscription', () => {
  const userId = 'user-1';
  const shopId = 'shop-1';

  it('sets profiles.plan = free (no subscriptions insert — that table is payment-provider-only in production)', async () => {
    const updateCalls: Array<{ table: string; payload: unknown }> = [];
    const fromMock = jest.fn((table: string) => {
      const builder = makeBuilder(
        table === 'profiles' ? { data: null, error: null } : { data: null, error: null },
      );
      const originalUpdate = builder.update as jest.Mock;
      builder.update = jest.fn((payload: unknown) => {
        updateCalls.push({ table, payload });
        return originalUpdate(payload);
      });
      return builder;
    });

    (getAdminDb as jest.Mock).mockReturnValue({ from: fromMock });

    const result = await ensureFreeSubscription(userId, shopId, null);

    expect(result).toEqual({ created: true });
    expect(fromMock).not.toHaveBeenCalledWith('subscriptions');

    const profilesUpdate = updateCalls.find(c => c.table === 'profiles');
    expect(profilesUpdate).toBeDefined();
    expect(profilesUpdate?.payload).toEqual({ plan: 'free', trial_ends_at: null });
  });

  it('is idempotent — does not overwrite an existing plan', async () => {
    const fromMock = jest.fn(() => makeBuilder({ data: { plan: 'professional' }, error: null }));
    (getAdminDb as jest.Mock).mockReturnValue({ from: fromMock });

    const result = await ensureFreeSubscription(userId, shopId, null);

    expect(result).toEqual({ created: false });
  });
});
