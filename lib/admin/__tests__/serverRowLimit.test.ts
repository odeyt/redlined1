/**
 * The owner portal against a database that, like hosted Supabase, never returns
 * more than SERVER rows from one read and does not say it cut anything
 * (fakeAdminDb serverMaxRows). Every figure must then be reported as truncated,
 * unknown or failed. A silently partial number is the one outcome not allowed.
 * All ids are synthetic.
 */
import { listAccounts, getOwnerOverview, getCommercialOverview, MAX_SCAN_ROWS } from '../accountsData';
import { getProfileDiagnostics } from '../profileDiagnostics';
import { allSettledLimited } from '../concurrency';
import { createFakeAdminDb, type Row } from './fakeAdminDb';

const SERVER = 1000;
const NOW = new Date().toISOString();
const id = (prefix: string, n: number) => `${prefix}${String(n).padStart(7, '0')}-0000-4000-8000-000000000000`;

const fake = createFakeAdminDb();

jest.mock('@/lib/supabaseServer', () => ({ getAdminDb: () => fake.db }));
jest.mock('@/lib/adminAuth', () => ({ getInternalShopIds: () => new Set<string>() }));
jest.mock('@/commercial/usage/usageService', () => ({ getMonthlyUsage: async () => ({ usage: {} }) }));

/** n shops, each with one owner membership and profile. */
function seed(n: number) {
  const shops: Row[] = [], shop_users: Row[] = [], profiles: Row[] = [];
  for (let i = 0; i < n; i++) {
    const shopId = id('a', i), userId = id('b', i);
    shops.push({ id: shopId, name: `Shop ${i}`, created_at: NOW, archived_at: null });
    shop_users.push({ shop_id: shopId, user_id: userId, role: 'owner' });
    profiles.push({ id: userId, email: `owner${i}@example-test.invalid`, role: 'Owner', plan: 'free', trial_ends_at: null, shop_name: null, shop_id: shopId, billing_status: null });
  }
  fake.state.tables = { shops, shop_users, profiles, shop_subscriptions: [], billing_events: [] };
}

beforeEach(() => {
  fake.state.failTables.clear();
  fake.state.serverMaxRows = SERVER;
  seed(3);
});

describe('the scan cap is the server row limit', () => {
  it('is not above what the server will return, so reaching it can be detected', () => {
    expect(MAX_SCAN_ROWS).toBeLessThanOrEqual(SERVER);
  });

  it('reports a directory of more shops than the server returns as truncated', async () => {
    seed(SERVER + 200);
    // Keep memberships under the limit so this isolates the shops scan itself.
    fake.state.tables.shop_users = fake.state.tables.shop_users.slice(0, 10);
    const r = await listAccounts({});
    expect(r.truncated).toBe(true);
    expect(r.total).toBeLessThanOrEqual(SERVER);
  });

  it('a small directory is not reported as truncated', async () => {
    expect((await listAccounts({})).truncated).toBe(false);
  });
});

describe('reads with no cap of their own fail loudly rather than misclassify', () => {
  it('rejects when the scanned shops have more memberships than one read returns', async () => {
    const extra: Row[] = Array.from({ length: SERVER }, (_, i) => ({ shop_id: id('a', 0), user_id: id('c', i), role: 'staff' }));
    fake.state.tables.shop_users.push(...extra);
    await expect(listAccounts({})).rejects.toThrow(/shop_users scan returned \d+ rows, the server's row limit/);
  });

  it('rejects when the scanned shops have more subscription rows than one read returns', async () => {
    fake.state.tables.shop_subscriptions = Array.from({ length: SERVER }, () => ({
      shop_id: id('a', 1), status: 'cancelled', plan_key: 'solo', billing_provider: 'creem', provider_customer_id: null,
      provider_subscription_id: null, trial_start: null, trial_end: null, current_period_start: NOW, current_period_end: NOW,
      cancel_at_period_end: false, cancelled_at: NOW, past_due_at: null, metadata: {}, created_at: NOW,
    }));
    await expect(getCommercialOverview()).rejects.toThrow(/shop_subscriptions scan returned/);
  });
});

describe('portfolio counts become unknown at the limit, never partial', () => {
  it('orphan subscriptions and unattributed billing events are null when those reads reach the limit', async () => {
    fake.state.tables.billing_events = Array.from({ length: SERVER + 5 }, (_, i) => ({ id: `e${i}`, shop_id: null, created_at: NOW }));
    const c = await getCommercialOverview();
    expect(c.unattributedBillingEvents).toBeNull();
    expect(c.orphanSubscriptions).toBe(0);
  });

  it('profiles without membership is null when profiles reach the limit', async () => {
    const more: Row[] = Array.from({ length: SERVER }, (_, i) => ({
      id: id('d', i), email: `x${i}@example-test.invalid`, role: 'Staff', plan: null, trial_ends_at: null, shop_name: null, shop_id: null, billing_status: null,
    }));
    fake.state.tables.profiles.push(...more);
    expect((await getOwnerOverview()).profilesWithoutMembership).toBeNull();
  });

  it('profile diagnostics say "too many to diagnose" instead of counting from a partial list', async () => {
    fake.state.tables.shop_users.push(...Array.from({ length: SERVER }, (_, i) => ({ shop_id: id('a', 0), user_id: id('e', i), role: 'staff' })));
    const { summary, items } = await getProfileDiagnostics();
    expect(summary.available).toBe(false);
    expect(summary.reason).toMatch(/Too many rows/);
    expect(items).toEqual([]);
  });
});

describe('allSettledLimited', () => {
  it('keeps input order and Promise.allSettled result shapes, including rejections', async () => {
    const r = await allSettledLimited([3, 1, 2, 4], 2, async n => {
      await new Promise(res => setTimeout(res, n));
      if (n === 2) throw new Error('two');
      return n * 10;
    });
    expect(r.map(x => x.status)).toEqual(['fulfilled', 'fulfilled', 'rejected', 'fulfilled']);
    expect(r.filter(x => x.status === 'fulfilled').map(x => (x as PromiseFulfilledResult<number>).value)).toEqual([30, 10, 40]);
    expect((r[2] as PromiseRejectedResult).reason).toEqual(new Error('two'));
  });

  it('never has more calls in flight than the limit', async () => {
    let inFlight = 0, peak = 0;
    await allSettledLimited(Array.from({ length: 25 }, (_, i) => i), 4, async () => {
      inFlight++; peak = Math.max(peak, inFlight);
      await new Promise(res => setTimeout(res, 1));
      inFlight--;
    });
    expect(peak).toBe(4);
  });

  it('handles an empty list', async () => {
    expect(await allSettledLimited([], 8, async () => 1)).toEqual([]);
  });
});
