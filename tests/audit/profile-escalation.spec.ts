/**
 * Security regression: a signed-in user must not be able to grant themselves a
 * paid plan, a privileged role, or another shop by updating their own profile.
 *
 * Confirmed exploitable in production on 2026-07-31 — plan, trial_ends_at, role
 * and shop_id were all writable by a plain authenticated user. Closed the same
 * day by supabase/migrations/2026-07-31_close_profile_self_escalation.sql,
 * after which this suite passes.
 *
 * If this ever fails again, someone has re-granted table-level UPDATE on
 * profiles — a column-level GRANT cannot be carved out of one, so the fix is to
 * revoke the table grant and re-grant only (email, shop_name).
 *
 * This test writes to its own account only, and restores the original values
 * afterwards even when an assertion fails.
 */
import { test, expect } from '@playwright/test';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const D1_INTERNAL_SHOP = '38d55fae-741b-4bac-b520-f96eed65bf38';

async function signedIn(): Promise<{ db: SupabaseClient; userId: string }> {
  const db = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
  const { data, error } = await db.auth.signInWithPassword({
    email: process.env.E2E_TRIAL_USER_EMAIL!,
    password: process.env.E2E_TRIAL_USER_PASSWORD!,
  });
  expect(error, 'audit user sign-in should succeed').toBeNull();
  return { db, userId: data.user!.id };
}

test('a user cannot escalate their own plan, role or shop', async () => {
  const { db, userId } = await signedIn();

  const { data: original } = await db
    .from('profiles')
    .select('plan, trial_ends_at, role, shop_id')
    .eq('id', userId)
    .maybeSingle();
  expect(original, 'profile row should exist').toBeTruthy();

  const escalations: Array<[string, Record<string, unknown>]> = [
    ['plan',          { plan: 'pro' }],
    ['trial_ends_at', { trial_ends_at: '2099-12-31T00:00:00Z' }],
    ['role',          { role: 'owner' }],
    // usePlan() treats a profile pointing at a D1 internal shop as
    // unconditionally 'pro', so this bypasses billing without touching `plan`.
    ['shop_id',       { shop_id: D1_INTERNAL_SHOP }],
  ];

  const writable: string[] = [];

  try {
    for (const [column, patch] of escalations) {
      const { error } = await db.from('profiles').update(patch).eq('id', userId);
      if (!error) {
        // The update may still have been a no-op; confirm it actually landed.
        const { data: after } = await db
          .from('profiles')
          .select(column)
          .eq('id', userId)
          .maybeSingle();
        const applied = (after as Record<string, unknown> | null)?.[column];
        const intended = Object.values(patch)[0];
        // Timestamps come back normalised ("+00:00" rather than "Z"), so a raw
        // string comparison would silently under-report trial_ends_at.
        const landed = column === 'trial_ends_at'
          ? !!applied && new Date(String(applied)).getTime() === new Date(String(intended)).getTime()
          : applied === intended;
        if (landed) writable.push(column);
      }
    }
  } finally {
    // Always restore, so a failure here never leaves the account escalated.
    if (original) {
      await db.from('profiles').update(original).eq('id', userId);
    }
  }

  expect(
    writable,
    `self-escalation possible via profiles column(s): ${writable.join(', ')}`,
  ).toHaveLength(0);
});

test('a user can still edit their own harmless profile fields', async () => {
  // The fix must not over-reach into ordinary self-service edits.
  const { db, userId } = await signedIn();

  const { data: original } = await db
    .from('profiles')
    .select('shop_name')
    .eq('id', userId)
    .maybeSingle();

  const probe = `E2E name probe ${Date.now()}`;
  const { error } = await db.from('profiles').update({ shop_name: probe }).eq('id', userId);

  try {
    expect(error, 'shop_name should remain user-editable').toBeNull();
  } finally {
    await db.from('profiles').update({ shop_name: original?.shop_name ?? null }).eq('id', userId);
  }
});
