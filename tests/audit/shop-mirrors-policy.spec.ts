/**
 * Security regression: mirror links must only ever join two shops the caller
 * belongs to.
 *
 * A one-sided policy (checking shop_id but not mirror_shop_id) let a user link
 * their own shop to any tenant — found 2026-07-31 after granting the table to
 * `authenticated`, which activated pre-existing loose policies. See
 * supabase/migrations/2026-07-31_shop_mirrors_drop_one_sided_policies.sql
 *
 * Cleans up after itself so a failure cannot leave a stray link behind.
 */
import { test, expect } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';

const FOREIGN_SHOP = '38d55fae-741b-4bac-b520-f96eed65bf38'; // D1 — audit user is not a member

test('a user cannot link their shop to one they do not belong to', async () => {
  const db = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
  const { data: auth, error: authErr } = await db.auth.signInWithPassword({
    email: process.env.E2E_TRIAL_USER_EMAIL!,
    password: process.env.E2E_TRIAL_USER_PASSWORD!,
  });
  expect(authErr).toBeNull();

  const { data: memberships } = await db
    .from('shop_users')
    .select('shop_id')
    .eq('user_id', auth.user!.id);
  const ownShop = (memberships ?? [])[0]?.shop_id as string | undefined;
  expect(ownShop, 'audit user should belong to a shop').toBeTruthy();

  const { error } = await db
    .from('shop_mirrors')
    .insert({ shop_id: ownShop, mirror_shop_id: FOREIGN_SHOP });

  try {
    expect(
      error,
      'inserting a mirror link to a non-member shop must be rejected',
    ).not.toBeNull();
  } finally {
    // Remove it if the policy let it through, so a failing run leaves nothing.
    await db.from('shop_mirrors').delete()
      .eq('shop_id', ownShop!)
      .eq('mirror_shop_id', FOREIGN_SHOP);
  }
});

test('a user cannot read mirror links belonging to another tenant', async () => {
  const db = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
  await db.auth.signInWithPassword({
    email: process.env.E2E_TRIAL_USER_EMAIL!,
    password: process.env.E2E_TRIAL_USER_PASSWORD!,
  });

  const { data, error } = await db
    .from('shop_mirrors')
    .select('shop_id,mirror_shop_id');

  expect(error, 'reading shop_mirrors should be permitted, just scoped').toBeNull();
  const foreign = (data ?? []).filter(
    r => r.shop_id === FOREIGN_SHOP || r.mirror_shop_id === FOREIGN_SHOP,
  );
  expect(foreign, 'no other tenant\'s mirror links may be visible').toHaveLength(0);
});
