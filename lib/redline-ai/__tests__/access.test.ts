/**
 * Redline AI access — the flag OR the plan, one decision.
 *
 * The priority under test (lib/redline-ai/access.ts): user > role > shop
 * flag row > PLAN > environment > global > false. The cases that matter
 * most are the two directions of the shop-row rule — a pilot shop stays
 * on, a deliberately disabled shop stays off — and the plan outranking
 * the global `false` row that exists in production, without which the
 * plan gate could never turn anything on.
 */
import {
  evaluateRedlineAiAccess,
  evaluateRedlineAiForShop,
  fetchShopOwnerPlan,
} from '../access';
import type { FeatureFlag, FlagEvaluationContext } from '@/lib/featureFlags/types';

function flag(partial: Partial<FeatureFlag>): FeatureFlag {
  return {
    id: 'f1',
    flag_key: 'redline_ai',
    display_name: 'Redline AI',
    description: '',
    enabled: false,
    scope: 'global',
    shop_id: null,
    user_id: null,
    role: null,
    environment: null,
    created_at: '',
    updated_at: '',
    ...partial,
  };
}

const ctx: FlagEvaluationContext = {
  userId: 'user-1',
  shopId: 'shop-1',
  role: 'owner',
  environment: 'production',
};

describe('evaluateRedlineAiAccess — flag only (the prototype behaviour)', () => {
  it('is false with no rows and no plan', () => {
    expect(evaluateRedlineAiAccess([], ctx, null)).toBe(false);
  });

  it('is true when the global row is on', () => {
    expect(evaluateRedlineAiAccess([flag({ enabled: true })], ctx, null)).toBe(true);
  });

  it('is true when a shop row is on (the D1 Imports pilot shape)', () => {
    const flags = [
      flag({ enabled: false, scope: 'global' }),
      flag({ enabled: true, scope: 'shop', shop_id: 'shop-1' }),
    ];
    expect(evaluateRedlineAiAccess(flags, ctx, null)).toBe(true);
  });

  it('ignores rows for other shops and other keys', () => {
    const flags = [
      flag({ enabled: true, scope: 'shop', shop_id: 'someone-else' }),
      flag({ enabled: true, scope: 'global', flag_key: 'internal_reminders' }),
    ];
    expect(evaluateRedlineAiAccess(flags, ctx, null)).toBe(false);
  });
});

describe('evaluateRedlineAiAccess — the plan gate', () => {
  it.each(['professional', 'business', 'enterprise'])(
    'turns access on for the %s plan with no flag rows',
    plan => {
      expect(evaluateRedlineAiAccess([], ctx, plan)).toBe(true);
    },
  );

  it.each(['solo', 'starter', 'free', 'pro', null])(
    'does not turn access on for plan %j',
    plan => {
      expect(evaluateRedlineAiAccess([], ctx, plan)).toBe(false);
    },
  );

  it('outranks the production global false row', () => {
    const flags = [flag({ enabled: false, scope: 'global' })];
    expect(evaluateRedlineAiAccess(flags, ctx, 'professional')).toBe(true);
    expect(evaluateRedlineAiAccess(flags, ctx, 'solo')).toBe(false);
  });

  it('an explicit shop-scoped OFF wins over a qualifying plan', () => {
    const flags = [flag({ enabled: false, scope: 'shop', shop_id: 'shop-1' })];
    expect(evaluateRedlineAiAccess(flags, ctx, 'business')).toBe(false);
  });

  it('an explicit shop-scoped ON wins over a non-qualifying plan', () => {
    const flags = [flag({ enabled: true, scope: 'shop', shop_id: 'shop-1' })];
    expect(evaluateRedlineAiAccess(flags, ctx, 'free')).toBe(true);
  });

  it('user- and role-scoped OFF rows still outrank the plan', () => {
    const userOff = [flag({ enabled: false, scope: 'user', user_id: 'user-1' })];
    expect(evaluateRedlineAiAccess(userOff, ctx, 'professional')).toBe(false);
    const roleOff = [flag({ enabled: false, scope: 'role', role: 'owner' })];
    expect(evaluateRedlineAiAccess(roleOff, ctx, 'professional')).toBe(false);
  });

  it('a user-scoped ON row grants access without any plan', () => {
    const userOn = [flag({ enabled: true, scope: 'user', user_id: 'user-1' })];
    expect(evaluateRedlineAiAccess(userOn, ctx, null)).toBe(true);
  });
});

describe('evaluateRedlineAiForShop — the job-shaped decision (no user)', () => {
  it('matches on shop row and plan only', () => {
    expect(evaluateRedlineAiForShop([], 'shop-1', 'professional')).toBe(true);
    expect(evaluateRedlineAiForShop([], 'shop-1', 'starter')).toBe(false);
    const pilot = [flag({ enabled: true, scope: 'shop', shop_id: 'shop-1' })];
    expect(evaluateRedlineAiForShop(pilot, 'shop-1', null)).toBe(true);
    const off = [flag({ enabled: false, scope: 'shop', shop_id: 'shop-1' })];
    expect(evaluateRedlineAiForShop(off, 'shop-1', 'business')).toBe(false);
  });

  it('a user-scoped row never leaks into another user\'s shop decision', () => {
    const userOn = [flag({ enabled: true, scope: 'user', user_id: 'user-1' })];
    expect(evaluateRedlineAiForShop(userOn, 'shop-1', null)).toBe(false);
  });
});

describe('fetchShopOwnerPlan — the plan source of truth', () => {
  function stubDb(tables: Record<string, Record<string, unknown>[]>) {
    return {
      from(table: string) {
        const filters: [string, unknown][] = [];
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const chain: any = {
          select: () => chain,
          eq: (col: string, val: unknown) => { filters.push([col, val]); return chain; },
          limit: () => chain,
          maybeSingle: async () => ({
            data: (tables[table] ?? []).find(r => filters.every(([c, v]) => r[c] === v)) ?? null,
            error: null,
          }),
        };
        return chain;
      },
    };
  }

  it('reads profiles.plan through the shop_users owner row', async () => {
    const db = stubDb({
      shop_users: [{ shop_id: 'shop-1', user_id: 'owner-1', role: 'owner' }],
      profiles: [{ id: 'owner-1', plan: 'professional' }],
    });
    await expect(fetchShopOwnerPlan(db, 'shop-1')).resolves.toBe('professional');
  });

  it('is null when the shop has no owner row', async () => {
    const db = stubDb({ shop_users: [], profiles: [] });
    await expect(fetchShopOwnerPlan(db, 'shop-1')).resolves.toBeNull();
  });

  it('is null when the owner profile carries no plan', async () => {
    const db = stubDb({
      shop_users: [{ shop_id: 'shop-1', user_id: 'owner-1', role: 'owner' }],
      profiles: [{ id: 'owner-1', plan: null }],
    });
    await expect(fetchShopOwnerPlan(db, 'shop-1')).resolves.toBeNull();
  });
});
