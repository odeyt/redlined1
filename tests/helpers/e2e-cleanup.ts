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

/**
 * Shop teardown is done by purge_synthetic_shop(), not by a list here.
 *
 * A hand-maintained list is what broke this: payments and audit_events became
 * append-only in M1/M2 — DELETE revoked and blocked by a trigger — while both
 * kept a foreign key to shops. Any run that recorded a payment, or merely
 * edited a customer, left a shop that could never be removed. payments and
 * maintenance_schedules were never in the list at all.
 *
 * The function discovers every table carrying a shop_id from the catalogue, so
 * a table added later is covered without anyone remembering, and it refuses
 * outright unless the shop's name starts with the synthetic marker. See
 * supabase/migrations/2026-08-17_m6_purge_synthetic_shop.sql.
 */

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
 *
 * Shops go through purge_synthetic_shop(), which refuses anything not named
 * with the synthetic marker. Users are deleted only after their synthetic
 * email is re-verified against the auth record — two independent guards, so a
 * wrong id passed in here cannot take a real tenant with it.
 */
export async function cleanupSyntheticRun(
  shopIds: string[],
  userIds: string[],
): Promise<CleanupResult> {
  const admin = adminClient();
  const result: CleanupResult = { ran: false, shopsDeleted: 0, usersDeleted: 0, errors: [] };
  if (!admin) return result;
  result.ran = true;

  for (const shopId of shopIds) {
    const { error } = await admin.rpc('purge_synthetic_shop', { p_shop_id: shopId });
    if (error) {
      // Reported rather than swallowed: a shop that cannot be purged is a
      // tenant left behind in a real database, which is exactly what this
      // harness exists to avoid.
      result.errors.push(`purge ${shopId}: ${error.message}`);
    } else {
      result.shopsDeleted += 1;
    }
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
