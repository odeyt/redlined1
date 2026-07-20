/**
 * Staging-only. Confirms RLS — not the client-side .eq('shop_id', ...)
 * filter — is what actually prevents Shop A from reading/mutating Shop B's
 * data. Every query here deliberately omits or contradicts the shop filter
 * a well-behaved client would normally send, exactly simulating a
 * compromised/modified client (including a decompiled mobile app binary
 * using the same anon key).
 */
import { describeIntegration } from './helpers/guard';
import { setupTestEnvironment, type TestEnvironment } from './helpers/testEnvironment';

describeIntegration('Tenant isolation', (creds) => {
  let env: TestEnvironment;

  beforeAll(async () => { env = await setupTestEnvironment(creds); }, 60_000);
  afterAll(async () => { await env.teardown(); }, 60_000);

  it('Shop A cannot read Shop B customers', async () => {
    const { data, error } = await env.users.shopAOwner.client
      .from('customers').select('id, shop_id').eq('id', env.shopB.customerId);
    expect(error).toBeNull();
    expect(data).toEqual([]);
  });

  it('Shop A cannot read Shop B vehicles', async () => {
    const { data } = await env.users.shopAOwner.client
      .from('vehicles').select('id, shop_id').eq('id', env.shopB.vehicleId);
    expect(data).toEqual([]);
  });

  it('Shop A cannot read Shop B job cards', async () => {
    const { data } = await env.users.shopAOwner.client
      .from('job_cards').select('id, shop_id').eq('id', env.shopB.jobCardId);
    expect(data).toEqual([]);
  });

  it('Shop A cannot read Shop B repair orders', async () => {
    const { data } = await env.users.shopAOwner.client
      .from('repair_orders').select('id, shop_id').eq('shop_id', env.shopB.id);
    expect(data).toEqual([]);
  });

  it('Shop A cannot mutate Shop B data (update a Shop B customer)', async () => {
    const { error, data } = await env.users.shopAOwner.client
      .from('customers').update({ name: 'hijacked' }).eq('id', env.shopB.customerId).select();
    // RLS should either error (WITH CHECK violation) or, more commonly for
    // an UPDATE whose USING clause excludes the row, silently affect zero
    // rows. Either outcome is acceptable; a non-empty successful update to
    // Shop B's row is the only failure condition.
    expect(data ?? []).toEqual([]);
    void error; // present for debugging, not asserted on directly
  });

  it('Shop A cannot mutate Shop B data (delete a Shop B vehicle)', async () => {
    const { data } = await env.users.shopAOwner.client
      .from('vehicles').delete().eq('id', env.shopB.vehicleId).select();
    expect(data ?? []).toEqual([]);
    // Confirm the row still exists via the admin (service-role) client.
    const { data: stillThere } = await env.admin.from('vehicles').select('id').eq('id', env.shopB.vehicleId).maybeSingle();
    expect(stillThere).not.toBeNull();
  });

  it('removing the client-side shop filter does not expose Shop B (no .eq shop_id at all)', async () => {
    const { data } = await env.users.shopAOwner.client
      .from('customers').select('id, shop_id');
    const shopIds = new Set((data ?? []).map((r: { shop_id: string }) => r.shop_id));
    expect(shopIds.has(env.shopB.id)).toBe(false);
    // Every row returned, unfiltered, must belong to Shop A only —
    // confirms RLS (not the client) is doing the scoping.
    for (const shopId of shopIds) expect(shopId).toBe(env.shopA.id);
  });

  it('the job-status API denies a cross-shop request (Shop A token, Shop B job)', async () => {
    const { data: sessionData } = await env.users.shopAOwner.client.auth.getSession();
    const token = sessionData.session?.access_token;
    const res = await fetch(`${process.env.REDLINED1_API_BASE_URL ?? ''}/api/job-status`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ jobId: env.shopB.jobCardId, shopId: env.shopB.id, stage: 'inspecting' }),
    });
    // requireShopRole() rejects before job_cards is even touched, since
    // shopAOwner has no shop_users row for Shop B.
    expect(res.status).toBe(403);
  });
});
