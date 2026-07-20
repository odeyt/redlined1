/**
 * Staging-only. Confirms mutations that would cross a tenant/role boundary
 * are rejected at write time, and that /api/job-status's cross-shop
 * denial (already covered by app/api/job-status/__tests__/route.test.ts's
 * mocked unit tests) also holds end-to-end against a real deployment.
 */
import { describeIntegration } from './helpers/guard';
import { setupTestEnvironment, type TestEnvironment } from './helpers/testEnvironment';

describeIntegration('Mutation safety', (creds) => {
  let env: TestEnvironment;

  beforeAll(async () => { env = await setupTestEnvironment(creds); }, 60_000);
  afterAll(async () => { await env.teardown(); }, 60_000);

  it('an insert claiming a shop_id the caller does not belong to is rejected', async () => {
    const { error, data } = await env.users.shopAOwner.client
      .from('customers')
      .insert({ id: 'sectest-invalid-shop-insert', shop_id: env.shopB.id, name: 'Should not exist' })
      .select();
    expect(data ?? []).toEqual([]);
    expect(error).not.toBeNull();
  });

  it('reassigning a row to another shop is rejected', async () => {
    const { data } = await env.users.shopAOwner.client
      .from('customers')
      .update({ shop_id: env.shopB.id })
      .eq('id', env.shopA.customerId)
      .select();
    expect(data ?? []).toEqual([]);
    const { data: actual } = await env.admin.from('customers').select('shop_id').eq('id', env.shopA.customerId).single();
    expect(actual?.shop_id).toBe(env.shopA.id);
  });

  it('self-role escalation is rejected (covered in role-isolation.test.ts; re-asserted here as a mutation-safety concern)', async () => {
    const { data } = await env.users.shopATechnician.client
      .from('shop_users').update({ role: 'owner' }).eq('user_id', env.users.shopATechnician.userId).select();
    expect(data ?? []).toEqual([]);
  });

  it('unauthorized membership deletion is rejected (technician removes the owner)', async () => {
    const { data } = await env.users.shopATechnician.client
      .from('shop_users').delete().eq('shop_id', env.shopA.id).eq('user_id', env.users.shopAOwner.userId).select();
    expect(data ?? []).toEqual([]);
    const { data: stillMember } = await env.admin.from('shop_users').select('user_id')
      .eq('shop_id', env.shopA.id).eq('user_id', env.users.shopAOwner.userId).maybeSingle();
    expect(stillMember).not.toBeNull();
  });

  it('a job-status cross-shop request returns denial end-to-end', async () => {
    const { data: sessionData } = await env.users.shopATechnician.client.auth.getSession();
    const token = sessionData.session?.access_token;
    const res = await fetch(`${process.env.REDLINED1_API_BASE_URL ?? ''}/api/job-status`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ jobId: env.shopB.jobCardId, shopId: env.shopB.id, stage: 'inspecting' }),
    });
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.code).toBe('NOT_MEMBER_OF_SHOP');
  });

  it('a job-status request with a forged shopId the caller is not a member of is rejected, even for a real job in that shop', async () => {
    const { data: sessionData } = await env.users.shopAOwner.client.auth.getSession();
    const token = sessionData.session?.access_token;
    const res = await fetch(`${process.env.REDLINED1_API_BASE_URL ?? ''}/api/job-status`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ jobId: env.shopA.jobCardId, shopId: env.shopB.id, stage: 'inspecting' }),
    });
    expect(res.status).toBe(403);
  });
});
