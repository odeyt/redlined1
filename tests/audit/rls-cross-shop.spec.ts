/**
 * Security: row-level security must prevent a signed-in user from reading rows
 * belonging to a shop they are not a member of — regardless of what the client
 * sends. This is the authoritative control; client-side shop scoping is only a
 * convenience filter and must never be the thing standing between tenants.
 */
import { test, expect } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';

const D1_SHOPS = [
  '38d55fae-741b-4bac-b520-f96eed65bf38',
  '90b72748-bf01-4456-999f-f4ba48091606',
];

const TENANT_TABLES = ['parts', 'repair_orders', 'invoices', 'customers', 'vehicles', 'job_cards', 'shop_settings'];

test('audit user cannot read any D1 shop rows via the API', async () => {
  const url     = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  const email   = process.env.E2E_TRIAL_USER_EMAIL!;
  const password= process.env.E2E_TRIAL_USER_PASSWORD!;

  const db = createClient(url, anonKey);
  const { error: authErr } = await db.auth.signInWithPassword({ email, password });
  expect(authErr, 'audit user sign-in should succeed').toBeNull();

  const leaks: string[] = [];
  for (const table of TENANT_TABLES) {
    const { data, error } = await db.from(table).select('shop_id').in('shop_id', D1_SHOPS).limit(5);
    if (error) continue; // table absent / not selectable is not a leak
    if ((data ?? []).length > 0) leaks.push(`${table} (${data!.length}+ rows)`);
  }

  expect(leaks, `cross-shop read leak in: ${leaks.join(', ')}`).toHaveLength(0);
});
