/**
 * One status mapping for the commercial billing layer, replacing two that both defaulted to 'active':
 *   creemProvider.ts  mapCreemStatus     `map[s] ?? 'active'`, called as mapCreemStatus(String(data.status ?? 'active'))
 *   billingService.ts mapProviderStatus  fall-through `return 'active'`
 *
 * Also pins a regression introduced one commit earlier: getSubscription began accepting 'unpaid' and 'paused'
 * from its own list, and mapProviderStatus — which listed neither — turned both into 'active'.
 *
 * Nothing here reaches Creem or Supabase. Every id and value is synthetic.
 */
import { createHmac } from 'crypto';
import { mapRemoteStatus } from '../BillingProvider';

const realFetch = global.fetch;
afterEach(() => { global.fetch = realFetch; jest.resetModules(); });

// ── the mapping itself ──────────────────────────────────────────────────────────────────────────────────────
describe('mapRemoteStatus', () => {
  it.each([
    ['active', 'active'], ['trialing', 'trialing'],
    ['past_due', 'past_due'], ['unpaid', 'past_due'],
    ['cancelled', 'cancelled'], ['canceled', 'cancelled'],
    ['expired', 'expired'],
    ['suspended', 'suspended'], ['paused', 'suspended'],
  ])('%s -> %s', (raw, expected) => {
    expect(mapRemoteStatus(raw)).toBe(expected);
  });

  it.each([
    ['undefined', undefined], ['null', null], ['empty', ''], ['whitespace', '   '],
    ['incomplete', 'incomplete'], ['a typo', 'actve'], ['nonsense', 'whatever'],
    ['a number', 42], ['an object', { status: 'active' }],
  ])('%s is null — never a guess, never active', (_label, raw) => {
    expect(mapRemoteStatus(raw)).toBeNull();
  });

  it('never returns active for anything but active', () => {
    const inputs = ['', 'trialing', 'past_due', 'unpaid', 'cancelled', 'expired', 'suspended', 'paused', 'x', 'incomplete'];
    for (const s of inputs) expect(mapRemoteStatus(s)).not.toBe('active');
  });

  it('normalises case and surrounding whitespace', () => {
    expect(mapRemoteStatus('  ACTIVE ')).toBe('active');
    expect(mapRemoteStatus('Past_Due')).toBe('past_due');
  });

  it('does not map "manual", which is internal and never comes from a provider', () => {
    expect(mapRemoteStatus('manual')).toBeNull();
  });
});

// ── getSubscription -> syncSubscriptionFromProvider ─────────────────────────────────────────────────────────
describe('syncSubscriptionFromProvider', () => {
  async function load(status: unknown) {
    const updates: unknown[][] = [];
    jest.doMock('@/commercial/subscriptions/subscriptionService', () => ({
      updateSubscriptionStatus: async (...a: unknown[]) => { updates.push(a); },
      activateSubscription: async () => {},
    }));
    process.env.CREEM_API_KEY = 'creem_test_key_for_unit_tests';
    process.env.BILLING_PROVIDER = 'creem';
    let calls = 0;
    global.fetch = (async () => {
      calls++;
      return { ok: true, status: 200, json: async () => ({ id: 'sub_1', status, customer: 'cus_1' }) } as unknown as Response;
    }) as unknown as typeof fetch;
    const { syncSubscriptionFromProvider } = await import('@/commercial/billing/billingService');
    return { syncSubscriptionFromProvider, updates, calls: () => calls };
  }

  it.each([
    ['unpaid', 'past_due'],
    ['paused', 'suspended'],
  ])('REGRESSION: %s is written as %s, not active', async (raw, expected) => {
    const { syncSubscriptionFromProvider, updates } = await load(raw);
    await expect(syncSubscriptionFromProvider('shop-1', 'sub_1')).resolves.toBe(true);
    expect(updates).toHaveLength(1);
    expect(updates[0][1]).toBe(expected);
  });

  it('writes a genuine status unchanged', async () => {
    const { syncSubscriptionFromProvider, updates } = await load('cancelled');
    await syncSubscriptionFromProvider('shop-1', 'sub_1');
    expect(updates[0][1]).toBe('cancelled');
  });

  it('refuses an unknown status: nothing written, and the provider WAS asked', async () => {
    const { syncSubscriptionFromProvider, updates, calls } = await load('incomplete');
    await expect(syncSubscriptionFromProvider('shop-1', 'sub_1')).resolves.toBe(false);
    expect(calls()).toBe(1);
    expect(updates).toHaveLength(0);
  });
});

// ── handleWebhook ───────────────────────────────────────────────────────────────────────────────────────────
describe('creemProvider.handleWebhook subscription.updated', () => {
  async function handle(data: Record<string, unknown>) {
    delete process.env.CREEM_WEBHOOK_SECRET;       // signature check skipped when no secret is configured
    const { creemProvider } = await import('../creemProvider');
    const body = JSON.stringify({ type: 'subscription.updated', id: 'evt_1', data: { metadata: { shop_id: 'shop-1' }, ...data } });
    return creemProvider.handleWebhook(body, '');
  }

  it('maps a genuine status into the update', async () => {
    const r = await handle({ id: 'sub_1', status: 'past_due' });
    expect(r.valid).toBe(true);
    expect(r.error).toBeUndefined();
    expect(r.subscriptionUpdate?.status).toBe('past_due');
  });

  it.each([
    ['absent', {}],
    ['empty', { status: '' }],
    ['unknown', { status: 'incomplete' }],
  ])('an %s status produces NO update and says why — it used to be active', async (_label, extra) => {
    const r = await handle({ id: 'sub_1', ...extra });
    expect(r.valid).toBe(true);
    expect(r.subscriptionUpdate).toBeUndefined();
    expect(r.error).toMatch(/status/);
  });
});

// ── processWebhook: an unreadable event is kept visible, not marked done ────────────────────────────────────
describe('processWebhook', () => {
  function fakeDb() {
    const writes: Array<{ op: string; values: Record<string, unknown> }> = [];
    const builder = () => {
      const q: Record<string, unknown> = {};
      let op = 'select';
      let values: Record<string, unknown> = {};
      q.select = () => q;
      q.eq = () => q;
      q.insert = (v: Record<string, unknown>) => { op = 'insert'; values = v; return q; };
      q.update = (v: Record<string, unknown>) => { op = 'update'; values = v; writes.push({ op, values }); return q; };
      q.maybeSingle = async () => ({ data: null, error: null });
      q.single = async () => {
        if (op === 'insert') { writes.push({ op, values }); return { data: { id: 'row-1' }, error: null }; }
        return { data: null, error: null };
      };
      q.then = (res: (v: unknown) => void) => res({ data: null, error: null });
      return q;
    };
    return { db: { from: () => builder() }, writes };
  }

  async function run(status: unknown) {
    const { db, writes } = fakeDb();
    const statusUpdates: unknown[][] = [];
    jest.doMock('@/lib/supabaseServer', () => ({ getAdminDb: () => db }));
    jest.doMock('@/commercial/subscriptions/subscriptionService', () => ({
      updateSubscriptionStatus: async (...a: unknown[]) => { statusUpdates.push(a); },
      activateSubscription: async () => {},
    }));
    delete process.env.CREEM_WEBHOOK_SECRET;
    const { processWebhook } = await import('@/commercial/billing/billingService');
    const data: Record<string, unknown> = { id: 'sub_1', metadata: { shop_id: 'shop-1' } };
    if (status !== undefined) data.status = status;
    const body = JSON.stringify({ type: 'subscription.updated', id: 'evt_1', data });
    const result = await processWebhook(body, createHmac('sha256', 'unused').update(body).digest('hex'), 'creem');
    return { result, writes, statusUpdates };
  }

  it('an unrecognised status is recorded on the event and left UNPROCESSED, nothing applied', async () => {
    const { result, writes, statusUpdates } = await run('incomplete');

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/unrecognised subscription status: incomplete/);
    expect(statusUpdates).toHaveLength(0);
    // The error reaches the row, and it is never marked processed.
    expect(writes.some(w => w.op === 'update' && String(w.values.error ?? '').includes('incomplete'))).toBe(true);
    expect(writes.some(w => w.op === 'update' && w.values.processed === true)).toBe(false);
  });

  it('an absent status is handled the same way', async () => {
    const { result, statusUpdates } = await run(undefined);
    expect(result.success).toBe(false);
    expect(statusUpdates).toHaveLength(0);
  });

  it('CONTROL: a genuine status applies and the event is marked processed', async () => {
    const { result, writes, statusUpdates } = await run('past_due');

    expect(result.success).toBe(true);
    expect(statusUpdates).toHaveLength(1);
    expect(statusUpdates[0][1]).toBe('past_due');
    expect(writes.some(w => w.op === 'update' && w.values.processed === true)).toBe(true);
  });
});
