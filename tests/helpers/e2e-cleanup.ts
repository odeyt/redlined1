/**
 * Deletes only the synthetic records a specific E2E run created.
 *
 * Safety rules this file must always obey:
 *   - Never delete by table-wide predicate. Every delete is scoped to shop ids
 *     or user ids this run created.
 *   - Never delete a user whose email is not a synthetic `.invalid` address.
 *   - Silently no-op when service credentials are absent, so deterministic
 *     tests can run without them rather than failing.
 *
 * Requires NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (loaded from
 * .env.local by playwright.config.ts).
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { isSyntheticEmail } from './synthetic-data';

// Deleted in FK order — children before the shop row they hang off.
const SHOP_SCOPED_TABLES = [
  'invoices',
  'estimates',
  'repair_orders',
  'job_cards',
  'inspections',
  'appointments',
  'parts',
  'vehicles',
  'customers',
  'shop_settings',
  'shop_users',
];

function adminClient(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export interface CleanupResult {
  ran: boolean;
  shopsDeleted: number;
  usersDeleted: number;
  errors: string[];
}

/**
 * Removes the given synthetic shops and users.
 * Shop rows are deleted child-first; users are deleted only after their
 * synthetic email is re-verified against the auth record.
 */
export async function cleanupSyntheticRun(
  shopIds: string[],
  userIds: string[],
): Promise<CleanupResult> {
  const admin = adminClient();
  const result: CleanupResult = { ran: false, shopsDeleted: 0, usersDeleted: 0, errors: [] };
  if (!admin) return result;
  result.ran = true;

  for (const table of SHOP_SCOPED_TABLES) {
    if (shopIds.length === 0) break;
    const { error } = await admin.from(table).delete().in('shop_id', shopIds);
    // A missing table, or one this key has no GRANT on, must not abort cleanup —
    // the remaining tables and the shop/user rows still need removing.
    if (error && !/does not exist|permission denied/i.test(error.message)) {
      result.errors.push(`${table}: ${error.message}`);
    }
  }

  if (shopIds.length > 0) {
    const { error } = await admin.from('shops').delete().in('id', shopIds);
    if (error) result.errors.push(`shops: ${error.message}`);
    else result.shopsDeleted = shopIds.length;
  }

  for (const userId of userIds) {
    // Re-read the account and refuse to delete anything that is not synthetic —
    // a wrong id passed in here must never remove a real user.
    const { data, error: readErr } = await admin.auth.admin.getUserById(userId);
    if (readErr || !data?.user) {
      result.errors.push(`user ${userId}: ${readErr?.message ?? 'not found'}`);
      continue;
    }
    if (!isSyntheticEmail(data.user.email)) {
      result.errors.push(`REFUSED to delete non-synthetic user ${data.user.email}`);
      continue;
    }
    await admin.from('profiles').delete().eq('id', userId);
    const { error } = await admin.auth.admin.deleteUser(userId);
    if (error) result.errors.push(`user ${userId}: ${error.message}`);
    else result.usersDeleted++;
  }

  return result;
}

/**
 * Sweeps synthetic accounts left behind by earlier runs that crashed before
 * cleanup. Matches only the reserved `.invalid` domain, so it can never touch a
 * real account. Intended for occasional manual use, not per-run teardown.
 */
export async function sweepAbandonedSyntheticUsers(): Promise<CleanupResult> {
  const admin = adminClient();
  const result: CleanupResult = { ran: false, shopsDeleted: 0, usersDeleted: 0, errors: [] };
  if (!admin) return result;
  result.ran = true;

  const { data, error } = await admin.auth.admin.listUsers({ perPage: 1000 });
  if (error) {
    result.errors.push(error.message);
    return result;
  }

  const synthetic = data.users.filter(u => isSyntheticEmail(u.email));
  for (const u of synthetic) {
    const { data: memberships } = await admin
      .from('shop_users')
      .select('shop_id')
      .eq('user_id', u.id);
    const shopIds = (memberships ?? []).map(m => m.shop_id as string).filter(Boolean);
    const r = await cleanupSyntheticRun(shopIds, [u.id]);
    result.shopsDeleted += r.shopsDeleted;
    result.usersDeleted += r.usersDeleted;
    result.errors.push(...r.errors);
  }

  return result;
}
