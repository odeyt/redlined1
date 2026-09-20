/**
 * With PLATFORM_OWNER_EMAIL unset on the SERVER, nobody is the platform owner: every owner page and
 * API must refuse, even a signed-in user whose email would be the owner's if it were configured.
 *
 * This needs a second dev server whose environment lacks the variable, so it only runs when pointed at one:
 *
 *   $env:PLATFORM_OWNER_EMAIL=''; npx next dev -p 3100        (in one shell, staging env otherwise)
 *   $env:OWNER_PORTAL_FAIL_CLOSED_URL='http://localhost:3100'
 *   npx playwright test --project=owner-portal tests/owner-portal/fail-closed.spec.ts
 *
 * Staging only, same guard as owner-portal.spec.ts.
 */
import { test, expect } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { PRODUCTION_REF, currentProjectRef } from '../helpers/db-target';
import { syntheticPassword, isSyntheticEmail } from '../helpers/synthetic-data';
import { cleanupSyntheticRun } from '../helpers/e2e-cleanup';

const TARGET = process.env.OWNER_PORTAL_FAIL_CLOSED_URL ?? '';
// The account that WOULD be the owner if the variable were set (the client side of the test still has it).
const WOULD_BE_OWNER = (process.env.PLATFORM_OWNER_EMAIL ?? '').trim().toLowerCase();

test.skip(!TARGET, 'set OWNER_PORTAL_FAIL_CLOSED_URL to a dev server started without PLATFORM_OWNER_EMAIL');
test.use({ baseURL: TARGET || 'http://localhost:3100' });
test.setTimeout(240_000);

test('unset PLATFORM_OWNER_EMAIL: a signed-in user is refused everywhere on the owner surface', async ({ browser }) => {
  const ref = currentProjectRef();
  if (!process.env.STAGING_PROJECT_REF || ref !== process.env.STAGING_PROJECT_REF || ref === PRODUCTION_REF) {
    throw new Error(`[fail-closed] refusing to run against ${ref || '(none)'}`);
  }
  expect(isSyntheticEmail(WOULD_BE_OWNER), 'client-side owner address must be synthetic').toBe(true);

  const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { autoRefreshToken: false, persistSession: false } });
  const password = syntheticPassword();
  const created = await admin.auth.admin.createUser({ email: WOULD_BE_OWNER, password, email_confirm: true });
  if (created.error || !created.data.user) throw new Error(`create: ${created.error?.message}`);
  const userId = created.data.user.id;
  try {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    await page.goto('/login');
    await page.fill('input[type="email"]', WOULD_BE_OWNER);
    await page.fill('input[type="password"]', password);
    await page.click('button[type="submit"]');
    await page.waitForURL(u => !u.toString().includes('/login'), { timeout: 120_000, waitUntil: 'commit' });

    for (const path of ['/api/admin/overview', '/api/admin/accounts', '/api/admin/reconciliation', '/api/admin/profile-diagnostics', '/api/admin/support']) {
      const res = await ctx.request.get(path);
      expect([401, 403], `${path} must refuse`).toContain(res.status());
      expect(JSON.stringify(await res.json())).not.toMatch(/"items"|"overview"|"accounts"/);
    }
    const post = await ctx.request.post('/api/admin/support/triage', { data: { ticketId: '00000000-0000-4000-8000-000000000000', triage: 'spam' } });
    expect([401, 403]).toContain(post.status());

    for (const path of ['/admin', '/admin/accounts', '/admin/support', '/admin/billing-health']) {
      const hop = await ctx.request.get(path, { maxRedirects: 0 });
      expect([302, 303, 307, 308], `${path} first hop`).toContain(hop.status());
      expect(new URL(hop.headers()['location'] ?? '', 'http://x').pathname).toBe('/login');
    }
    await ctx.close();
  } finally {
    const r = await cleanupSyntheticRun([], [userId]);
    console.log(`[fail-closed] teardown users:${r.usersDeleted}${r.errors.length ? ' errors: ' + r.errors.join('; ') : ''}`);
  }
});
