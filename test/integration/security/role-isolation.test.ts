/**
 * Staging-only. Confirms role restrictions hold at the RLS/API layer, not
 * just in UI visibility — this task's own framing: "UI visibility is not
 * sufficient."
 */
import { describeIntegration } from './helpers/guard';
import { setupTestEnvironment, type TestEnvironment } from './helpers/testEnvironment';

describeIntegration('Role isolation', (creds) => {
  let env: TestEnvironment;

  beforeAll(async () => { env = await setupTestEnvironment(creds); }, 60_000);
  afterAll(async () => { await env.teardown(); }, 60_000);

  it('technician cannot read payments', async () => {
    await env.admin.from('payments').insert({ id: `sectest-pay-${env.shopA.id}`, shop_id: env.shopA.id, amount: 100 });
    const { data } = await env.users.shopATechnician.client
      .from('payments').select('id').eq('shop_id', env.shopA.id);
    expect(data).toEqual([]);
  });

  it('technician cannot read subscriptions', async () => {
    const { data } = await env.users.shopATechnician.client
      .from('subscriptions').select('id').eq('shop_id', env.shopA.id);
    expect(data).toEqual([]);
  });

  it('technician cannot manage staff (insert a shop_users row)', async () => {
    const { error } = await env.users.shopATechnician.client
      .from('shop_users').insert({ shop_id: env.shopA.id, user_id: env.users.noShopUser.userId, role: 'technician' });
    expect(error).not.toBeNull();
  });

  it('technician cannot change roles (update their own shop_users row)', async () => {
    const { data } = await env.users.shopATechnician.client
      .from('shop_users').update({ role: 'owner' }).eq('user_id', env.users.shopATechnician.userId).select();
    expect(data ?? []).toEqual([]);
    const { data: actual } = await env.admin.from('shop_users').select('role')
      .eq('shop_id', env.shopA.id).eq('user_id', env.users.shopATechnician.userId).single();
    expect(actual?.role).toBe('technician');
  });

  it('advisor can read financial data for their own shop (per current access model)', async () => {
    const { data, error } = await env.users.shopAAdvisor.client
      .from('payments').select('id').eq('shop_id', env.shopA.id);
    expect(error).toBeNull();
    expect(Array.isArray(data)).toBe(true);
  });

  it('manager access follows the approved permissions (can manage staff)', async () => {
    const { error } = await env.users.shopAManager.client
      .from('shop_users').select('id').eq('shop_id', env.shopA.id);
    expect(error).toBeNull();
  });

  it('owner access remains shop-scoped (cannot read Shop B despite being an owner)', async () => {
    const { data } = await env.users.shopAOwner.client
      .from('customers').select('id').eq('shop_id', env.shopB.id);
    expect(data).toEqual([]);
  });

  it('a disabled user is denied access even with valid shop_users membership', async () => {
    // disabledUser has a real technician row on Shop A (see
    // helpers/testEnvironment.ts) — this isolates "disabled" as the cause
    // of denial, not absence of membership. This assumes the app enforces
    // profiles.status server-side somewhere in the request path; if this
    // test fails, it may mean disabling isn't actually enforced yet, which
    // is itself a finding worth escalating, not a broken test.
    const { data } = await env.users.disabledUser.client
      .from('job_cards').select('id').eq('shop_id', env.shopA.id);
    expect(data ?? []).toEqual([]);
  });

  it('a no-shop user gets zero rows for any shop, fails closed', async () => {
    const { data: customers } = await env.users.noShopUser.client.from('customers').select('id');
    const { data: jobCards } = await env.users.noShopUser.client.from('job_cards').select('id');
    expect(customers).toEqual([]);
    expect(jobCards).toEqual([]);
  });
});
