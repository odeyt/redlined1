/**
 * Provisions a throwaway owner + shop for a test run, and tears it down.
 *
 * This is what makes local E2E safe against a real Supabase project: nothing
 * touches an existing shop's data — the run creates its own tenant, works
 * inside it, and deletes it afterwards.
 */

import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'crypto';
import { syntheticEmail, syntheticName, syntheticPassword } from './synthetic-data';
import { cleanupSyntheticRun } from './e2e-cleanup';

export interface SyntheticShop {
  /** True when shop_settings was seeded, so the shell shows shopName not "My Shop". */
  namedInShell: boolean;
  userId: string;
  shopId: string;
  email: string;
  password: string;
  shopName: string;
}

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`[synthetic-shop] ${name} is required but not set`);
  return v;
}

/**
 * Creates a confirmed owner account with its own shop, on the Free Forever plan.
 * Uses the admin API so no email round-trip is needed.
 */
export async function createSyntheticShop(label = 'owner'): Promise<SyntheticShop> {
  const url = requireEnv('NEXT_PUBLIC_SUPABASE_URL');
  const serviceKey = requireEnv('SUPABASE_SERVICE_ROLE_KEY');
  const anonKey = requireEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY');

  const admin = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const email = syntheticEmail(label);
  const password = syntheticPassword();
  const shopName = syntheticName('Shop');

  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: syntheticName('Owner'), shop_name: shopName },
  });
  if (createErr || !created?.user) {
    throw new Error(`[synthetic-shop] createUser failed: ${createErr?.message}`);
  }
  const userId = created.user.id;

  // Provision through the service role, exactly as the app does: real signup
  // runs commercial/onboarding/ShopProvisioningService via getAdminDb(). The
  // `shops` table denies INSERT to the authenticated role, so a user-scoped
  // client cannot create its own shop and must not be used here.
  const shopId = randomUUID();
  const { error: shopErr } = await admin.from('shops').insert({ id: shopId, name: shopName });
  if (shopErr) throw new Error(`[synthetic-shop] shop insert failed: ${shopErr.message}`);

  const { error: memberErr } = await admin
    .from('shop_users')
    .insert({ user_id: userId, shop_id: shopId, role: 'owner' });
  if (memberErr) throw new Error(`[synthetic-shop] membership failed: ${memberErr.message}`);

  // Best-effort: the local `sb_secret_` key does not carry table GRANTs on
  // shop_settings (same restriction as profiles/customers). Without this row the
  // shell falls back to the generic "My Shop" name, which is cosmetic — the
  // tenant is still fully isolated. Reported rather than swallowed so it is
  // never mistaken for the fixture having set a name it did not.
  const { error: settingsErr } = await admin
    .from('shop_settings')
    .insert({ shop_id: shopId, company_name: shopName });
  const namedInShell = !settingsErr;
  if (settingsErr) {
    console.warn(`[synthetic-shop] shop_settings not seeded (${settingsErr.message}) — shell will show "My Shop"`);
  }

  // Verify the account can actually sign in before handing it to a test.
  const asUser = createClient(url, anonKey);
  const { error: signInErr } = await asUser.auth.signInWithPassword({ email, password });
  if (signInErr) throw new Error(`[synthetic-shop] sign-in failed: ${signInErr.message}`);

  // Free Forever, matching what a real signup now provisions.
  await admin.from('profiles').update({ plan: 'free', trial_ends_at: null }).eq('id', userId);

  return { userId, shopId, email, password, shopName, namedInShell };
}

export async function destroySyntheticShop(shop: SyntheticShop): Promise<void> {
  const result = await cleanupSyntheticRun([shop.shopId], [shop.userId]);
  // Always reported: a teardown that quietly half-completes leaves synthetic
  // tenants accumulating in a real project, which is exactly what this harness
  // exists to prevent.
  console.log(
    `[synthetic-shop] teardown — shops:${result.shopsDeleted} users:${result.usersDeleted}` +
      (result.errors.length ? ` errors: ${result.errors.join('; ')}` : ''),
  );
  if (result.usersDeleted === 0 || result.shopsDeleted === 0) {
    console.warn(`[synthetic-shop] INCOMPLETE teardown for ${shop.email} — run "npm run test:sweep"`);
  }
}
