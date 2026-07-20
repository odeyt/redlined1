/**
 * Provisions a self-contained set of shops/users/data for the security
 * integration suite and tears it all down afterward — no manual staging
 * seeding required beyond having a staging Supabase project to point at.
 * Every account/row created here is prefixed `sectest-` for easy manual
 * cleanup if a run is ever interrupted before teardown completes.
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { TestCredentials } from './guard';

export type ShopRole = 'owner' | 'manager' | 'advisor' | 'technician';

export type TestUser = {
  email: string;
  password: string;
  userId: string;
  client: SupabaseClient;
};

export type TestEnvironment = {
  shopA: { id: string; customerId: string; vehicleId: string; jobCardId: string };
  shopB: { id: string; customerId: string; vehicleId: string; jobCardId: string };
  users: {
    shopAOwner: TestUser;
    shopAManager: TestUser;
    shopAAdvisor: TestUser;
    shopATechnician: TestUser;
    shopBOwner: TestUser;
    shopBTechnician: TestUser;
    noShopUser: TestUser;
    disabledUser: TestUser;
  };
  admin: SupabaseClient;
  teardown: () => Promise<void>;
};

const RUN_ID = `sectest-${Date.now()}`;
const PASSWORD = 'RedlinedSecTest!2026';

async function createTestUser(admin: SupabaseClient, creds: TestCredentials, label: string): Promise<TestUser> {
  const email = `${RUN_ID}-${label}@example.invalid`;
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: PASSWORD,
    email_confirm: true,
  });
  if (error || !data.user) throw new Error(`Failed to create test user ${label}: ${error?.message}`);

  const client = createClient(creds.url, creds.anonKey);
  const { error: signInError } = await client.auth.signInWithPassword({ email, password: PASSWORD });
  if (signInError) throw new Error(`Failed to sign in test user ${label}: ${signInError.message}`);

  return { email, password: PASSWORD, userId: data.user.id, client };
}

async function addMembership(admin: SupabaseClient, shopId: string, userId: string, role: ShopRole): Promise<void> {
  const { error } = await admin.from('shop_users').insert({ shop_id: shopId, user_id: userId, role });
  if (error) throw new Error(`Failed to add shop_users membership: ${error.message}`);
}

async function createShop(admin: SupabaseClient, label: string): Promise<string> {
  const { data, error } = await admin.from('shops').insert({ name: `${RUN_ID}-${label}`, slug: `${RUN_ID}-${label}` }).select('id').single();
  if (error || !data) throw new Error(`Failed to create test shop ${label}: ${error?.message}`);
  return data.id as string;
}

async function seedShopData(admin: SupabaseClient, shopId: string) {
  const { data: customer, error: custErr } = await admin
    .from('customers')
    .insert({ id: `${RUN_ID}-cust-${shopId}`, shop_id: shopId, name: `${RUN_ID} Customer` })
    .select('id').single();
  if (custErr || !customer) throw new Error(`Failed to seed test customer: ${custErr?.message}`);

  const { data: vehicle, error: vehErr } = await admin
    .from('vehicles')
    .insert({ id: `${RUN_ID}-veh-${shopId}`, shop_id: shopId, customer_id: customer.id, make: 'Test', model: 'Vehicle' })
    .select('id').single();
  if (vehErr || !vehicle) throw new Error(`Failed to seed test vehicle: ${vehErr?.message}`);

  const { data: jobCard, error: jobErr } = await admin
    .from('job_cards')
    .insert({ id: `${RUN_ID}-JC-${shopId}`, shop_id: shopId, customer: customer.id, vehicle: vehicle.id, repair_stage: 'checked_in' })
    .select('id').single();
  if (jobErr || !jobCard) throw new Error(`Failed to seed test job card: ${jobErr?.message}`);

  return { customerId: customer.id as string, vehicleId: vehicle.id as string, jobCardId: jobCard.id as string };
}

/**
 * "Disabled user" is modeled as `profiles.status = 'Inactive'` (the column
 * rls_phase7.sql defines, defaulting to 'Active') — the most directly
 * testable representation of "disabled" found in this schema during this
 * task's code review. This was never independently confirmed against a
 * live app (no staging/production access this session) — if the deployed
 * app actually uses a different mechanism (e.g. Supabase auth ban, a
 * different column), update this helper to match before trusting the
 * "disabled user" test results.
 */
async function markDisabled(admin: SupabaseClient, userId: string): Promise<void> {
  const { error } = await admin.from('profiles').update({ status: 'Inactive' }).eq('id', userId);
  if (error) throw new Error(`Failed to mark test user disabled: ${error.message}`);
}

export async function setupTestEnvironment(creds: TestCredentials): Promise<TestEnvironment> {
  const admin = createClient(creds.url, creds.serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });

  const shopAId = await createShop(admin, 'shopA');
  const shopBId = await createShop(admin, 'shopB');

  const shopAOwner = await createTestUser(admin, creds, 'shopA-owner');
  const shopAManager = await createTestUser(admin, creds, 'shopA-manager');
  const shopAAdvisor = await createTestUser(admin, creds, 'shopA-advisor');
  const shopATechnician = await createTestUser(admin, creds, 'shopA-technician');
  const shopBOwner = await createTestUser(admin, creds, 'shopB-owner');
  const shopBTechnician = await createTestUser(admin, creds, 'shopB-technician');
  const noShopUser = await createTestUser(admin, creds, 'no-shop');
  const disabledUser = await createTestUser(admin, creds, 'disabled');

  await addMembership(admin, shopAId, shopAOwner.userId, 'owner');
  await addMembership(admin, shopAId, shopAManager.userId, 'manager');
  await addMembership(admin, shopAId, shopAAdvisor.userId, 'advisor');
  await addMembership(admin, shopAId, shopATechnician.userId, 'technician');
  await addMembership(admin, shopBId, shopBOwner.userId, 'owner');
  await addMembership(admin, shopBId, shopBTechnician.userId, 'technician');
  // disabledUser and noShopUser intentionally get no shop_users row of
  // their own beyond what's set below — disabledUser is additionally
  // given Shop A technician membership so tests can confirm the disabled
  // flag (not absence of membership) is what blocks them.
  await addMembership(admin, shopAId, disabledUser.userId, 'technician');
  await markDisabled(admin, disabledUser.userId);

  const shopAData = await seedShopData(admin, shopAId);
  const shopBData = await seedShopData(admin, shopBId);

  const teardown = async () => {
    const allUserIds = [
      shopAOwner.userId, shopAManager.userId, shopAAdvisor.userId, shopATechnician.userId,
      shopBOwner.userId, shopBTechnician.userId, noShopUser.userId, disabledUser.userId,
    ];
    // Delete data before shops (FK dependencies), then memberships, then
    // shops, then auth users — reverse of creation order.
    await admin.from('job_cards').delete().in('shop_id', [shopAId, shopBId]);
    await admin.from('vehicles').delete().in('shop_id', [shopAId, shopBId]);
    await admin.from('customers').delete().in('shop_id', [shopAId, shopBId]);
    await admin.from('shop_users').delete().in('shop_id', [shopAId, shopBId]);
    await admin.from('shops').delete().in('id', [shopAId, shopBId]);
    for (const userId of allUserIds) {
      await admin.auth.admin.deleteUser(userId).catch(() => {});
    }
  };

  return {
    shopA: { id: shopAId, ...shopAData },
    shopB: { id: shopBId, ...shopBData },
    users: { shopAOwner, shopAManager, shopAAdvisor, shopATechnician, shopBOwner, shopBTechnician, noShopUser, disabledUser },
    admin,
    teardown,
  };
}
