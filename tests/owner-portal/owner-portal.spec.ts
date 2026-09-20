/**
 * Authenticated end-to-end checks for the owner portal, against the STAGING Supabase project only.
 *
 * What it proves, with real sign-ins and the real service-role/RLS boundary:
 *   - the platform owner can open every owner page and every read API;
 *   - the owner can mark a synthetic ticket real / test / spam, each marking is attributed and
 *     appended, and the ticket itself is never changed;
 *   - marking changes the support counts the way the portal says it does;
 *   - an ordinary shop user is turned away from every owner page and every /api/admin/* route
 *     (including the marking POST), and cannot read or write the marker table or another shop's tickets;
 *   - billing reconciliation, activation and profile diagnostics render without changing any
 *     commercial record.
 *
 * Safety: refuses to run unless the Supabase URL is the ref named in STAGING_PROJECT_REF and that
 * ref is not production. Creates only `.invalid` synthetic users and `[E2E]` shops and removes them.
 *
 * Run: npx playwright test --project=owner-portal
 */
import { test, expect, type Browser, type BrowserContext, type Page } from '@playwright/test';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { randomUUID } from 'crypto';
import { createSyntheticShop, destroySyntheticShop, type SyntheticShop } from '../helpers/synthetic-shop';
import { cleanupSyntheticRun } from '../helpers/e2e-cleanup';
import { PRODUCTION_REF, currentProjectRef } from '../helpers/db-target';
import { syntheticName, syntheticPassword, isSyntheticEmail } from '../helpers/synthetic-data';

const OWNER_EMAIL = (process.env.PLATFORM_OWNER_EMAIL ?? '').trim().toLowerCase();
const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '';
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';

const OWNER_PAGES = ['/admin', '/admin/accounts', '/admin/support', '/admin/billing-health'];
const OWNER_GET_APIS = [
  '/api/admin/overview',
  '/api/admin/accounts',
  '/api/admin/reconciliation',
  '/api/admin/profile-diagnostics',
  '/api/admin/support',
];

let admin: SupabaseClient;
let ownerShop: SyntheticShop;   // the platform owner's own (synthetic) account
let shopUser: SyntheticShop;    // an ordinary shop owner: NOT on PLATFORM_OWNER_EMAIL
let otherShop: SyntheticShop;   // a different tenant, for cross-shop checks
let ticketA = '';               // shopUser's tickets
let ticketB = '';
let ticketOther = '';           // belongs to otherShop
let ownerCtx: BrowserContext;
let userCtx: BrowserContext;

// - helpers -

async function signIn(browser: Browser, email: string, password: string): Promise<BrowserContext> {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.goto('/login');
  await expect(page.locator('input[type="email"]')).toBeVisible({ timeout: 20_000 });
  await page.fill('input[type="email"]', email);
  await page.fill('input[type="password"]', password);
  await page.click('button[type="submit"]');
  await page.waitForURL(u => !u.toString().includes('/login'), { timeout: 120_000, waitUntil: 'commit' });
  await page.close();
  return ctx;
}

/** Compile every route the spec uses once, so no assertion below is racing a cold `next dev` compile. */
async function warmUp(baseURL: string): Promise<void> {
  for (const path of ['/login', '/', ...OWNER_PAGES, ...OWNER_GET_APIS, '/api/admin/support/triage']) {
    try { await fetch(new URL(path, baseURL), { redirect: 'manual', signal: AbortSignal.timeout(90_000) }); } catch { /* warming only */ }
  }
}

async function makeTicket(shopId: string, createdBy: string, subject: string, daysAgo: number): Promise<string> {
  const id = randomUUID();
  const at = new Date(Date.now() - daysAgo * 86_400_000).toISOString();
  const t = await admin.from('support_tickets').insert({
    id, shop_id: shopId, created_by: createdBy, kind: 'chat', subject, status: 'open', created_at: at, updated_at: at,
  });
  if (t.error) throw new Error(`ticket insert: ${t.error.message}`);
  const m = await admin.from('support_messages').insert({
    ticket_id: id, shop_id: shopId, author_id: createdBy, author_role: 'customer', body: '[E2E] synthetic question', created_at: at,
  });
  if (m.error) throw new Error(`message insert: ${m.error.message}`);
  return id;
}

async function ticketRow(id: string) {
  const r = await admin.from('support_tickets').select('*').eq('id', id).single();
  if (r.error) throw new Error(r.error.message);
  return r.data;
}

async function markers(ticketId: string) {
  const r = await admin.from('support_ticket_triage_events').select('id, ticket_id, triage, set_by, created_at').eq('ticket_id', ticketId).order('id');
  if (r.error) throw new Error(r.error.message);
  return r.data ?? [];
}

async function statValue(page: Page, testId: string): Promise<number> {
  const text = await page.getByTestId(testId).innerText();
  const m = text.match(/\n?\s*(\d+)\s*(\n|$)/);
  const nums = text.split('\n').map(s => s.trim()).filter(s => /^\d+$/.test(s));
  return Number(nums[0] ?? m?.[1] ?? NaN);
}

/** Every commercial record the owner pages read. Compared before and after the run. */
async function commercialSnapshot(): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  for (const [table, order] of [['profiles', 'id'], ['shop_subscriptions', 'id'], ['billing_events', 'id'], ['shops', 'id']] as const) {
    const r = await admin.from(table).select('*').order(order);
    out[table] = r.error ? `ERR:${r.error.code}` : JSON.stringify(r.data);
  }
  return out;
}

// - setup / teardown -

test.describe.configure({ mode: 'serial' });
// `next dev` compiles each route on first request; the first sign-in and first visit to each owner
// page are slow on a cold server. This is a budget for that, not a wait for flaky behaviour.
test.setTimeout(120_000);

test.beforeAll(async ({ browser, baseURL }) => {
  test.setTimeout(420_000);
  await warmUp(baseURL ?? 'http://localhost:3000');
  // Refuse to run anywhere but the named staging project.
  const ref = currentProjectRef();
  const staging = process.env.STAGING_PROJECT_REF ?? '';
  if (!staging || ref !== staging || ref === PRODUCTION_REF) {
    throw new Error(`[owner-portal] refusing to run: target ${ref || '(none)'} is not STAGING_PROJECT_REF ${staging || '(unset)'}`);
  }
  if (!OWNER_EMAIL || !isSyntheticEmail(OWNER_EMAIL)) {
    throw new Error('[owner-portal] PLATFORM_OWNER_EMAIL must be set to a synthetic .invalid address for this run');
  }
  admin = createClient(URL_, SERVICE, { auth: { autoRefreshToken: false, persistSession: false } });

  // The owner: the account whose email is PLATFORM_OWNER_EMAIL. Created by hand (fixed email), then removed.
  const password = syntheticPassword();
  const shopName = syntheticName('OwnerShop');
  const created = await admin.auth.admin.createUser({ email: OWNER_EMAIL, password, email_confirm: true, user_metadata: { shop_name: shopName } });
  if (created.error || !created.data.user) throw new Error(`owner create: ${created.error?.message}`);
  const shopId = randomUUID();
  const s = await admin.from('shops').insert({ id: shopId, name: shopName });
  if (s.error) throw new Error(`owner shop: ${s.error.message}`);
  const mem = await admin.from('shop_users').insert({ user_id: created.data.user.id, shop_id: shopId, role: 'owner' });
  if (mem.error) throw new Error(`owner membership: ${mem.error.message}`);
  ownerShop = { userId: created.data.user.id, shopId, email: OWNER_EMAIL, password, shopName, namedInShell: false };

  shopUser = await createSyntheticShop('shopuser');
  otherShop = await createSyntheticShop('other');

  ticketA = await makeTicket(shopUser.shopId, shopUser.userId, '[E2E] question A (fresh)', 1);
  ticketB = await makeTicket(shopUser.shopId, shopUser.userId, '[E2E] question B (old)', 12);
  ticketOther = await makeTicket(otherShop.shopId, otherShop.userId, '[E2E] other shop ticket', 1);

  ownerCtx = await signIn(browser, ownerShop.email, ownerShop.password);
  userCtx = await signIn(browser, shopUser.email, shopUser.password);
});

test.afterAll(async () => {
  await ownerCtx?.close();
  await userCtx?.close();
  if (!admin) return;
  // Marker rows cascade with their tickets when the shop is purged.
  if (shopUser) await destroySyntheticShop(shopUser);
  if (otherShop) await destroySyntheticShop(otherShop);
  if (ownerShop) {
    const r = await cleanupSyntheticRun([ownerShop.shopId], [ownerShop.userId]);
    console.log(`[owner-portal] owner teardown - shops:${r.shopsDeleted} users:${r.usersDeleted}${r.errors.length ? ' errors: ' + r.errors.join('; ') : ''}`);
  }
});

// - the owner -

test.describe('platform owner', () => {
  test('opens every owner page', async () => {
    for (const path of OWNER_PAGES) {
      const page = await ownerCtx.newPage();
      const res = await page.goto(path, { waitUntil: 'domcontentloaded' });
      expect(res?.status(), path).toBeLessThan(400);
      expect(new URL(page.url()).pathname, `${path} redirected`).toBe(path);
      await expect(page.locator('body')).not.toContainText(/application error|something went wrong/i);
      await page.close();
    }
  });

  test('every owner read API answers 200 with JSON and no error', async () => {
    for (const path of OWNER_GET_APIS) {
      const res = await ownerCtx.request.get(path);
      expect(res.status(), path).toBe(200);
      const body = await res.json();
      expect(body, path).not.toHaveProperty('error');
    }
  });

  test('overview renders Today\'s actions, activation and profile diagnostics', async () => {
    const page = await ownerCtx.newPage();
    await page.goto('/admin', { waitUntil: 'domcontentloaded' });
    await expect(page.getByTestId('todays-actions')).toBeVisible();
    await expect(page.getByTestId('activation-panel').or(page.getByTestId('activation-unavailable'))).toBeVisible();
    await expect(page.getByTestId('profile-diagnostics').or(page.getByTestId('diagnostics-unavailable'))).toBeVisible();
    await expect(page.getByTestId('billing-review')).toBeVisible();
    await page.close();
  });

  test('the support page sees the synthetic tickets and offers the marking control', async () => {
    const page = await ownerCtx.newPage();
    await page.goto('/admin/support', { waitUntil: 'domcontentloaded' });
    await expect(page.getByTestId('triage-unsupported')).toHaveCount(0);     // table exists on staging
    await expect(page.getByTestId('triage-help')).toBeVisible();
    await expect(page.getByTestId(`triage-control-${ticketA}`)).toBeVisible();
    await expect(page.getByTestId(`triage-control-${ticketB}`)).toBeVisible();
    await page.close();
  });

  test('marks a synthetic ticket spam: attributed, appended, ticket untouched, counts move as documented', async () => {
    const before = await ticketRow(ticketB);
    expect(await markers(ticketB)).toHaveLength(0);

    const page = await ownerCtx.newPage();
    page.on('dialog', d => void d.accept());
    await page.goto('/admin/support', { waitUntil: 'domcontentloaded' });
    const openBefore = await statValue(page, 'stat-open-tickets');
    const noiseBefore = await statValue(page, 'stat-noise');
    const unreviewedBefore = await statValue(page, 'stat-unreviewed');

    await page.getByTestId(`triage-control-${ticketB}`).getByRole('button', { name: 'Spam' }).click();
    await expect(page.getByTestId(`triage-control-${ticketB}`).getByRole('button', { name: 'Spam' })).toHaveAttribute('aria-pressed', 'true', { timeout: 15_000 });

    const rows = await markers(ticketB);
    expect(rows).toHaveLength(1);
    expect(rows[0].triage).toBe('spam');
    expect(rows[0].set_by).toBe(OWNER_EMAIL);           // attributed to the signed-in owner, from the server session
    expect(await ticketRow(ticketB)).toEqual(before);   // the ticket itself is byte-identical

    expect(await statValue(page, 'stat-noise')).toBe(noiseBefore + 1);
    expect(await statValue(page, 'stat-open-tickets')).toBe(openBefore - 1);
    expect(await statValue(page, 'stat-unreviewed')).toBe(unreviewedBefore - 1);
    await page.close();
  });

  test('re-marking with the same value adds nothing; changing it appends; clearing appends "unreviewed"', async () => {
    const api = (triage: string) => ownerCtx.request.post('/api/admin/support/triage', { data: { ticketId: ticketB, triage } });

    const same = await api('spam');
    expect(same.status()).toBe(200);
    expect((await same.json()).changed).toBe(false);
    expect(await markers(ticketB)).toHaveLength(1);

    expect((await (await api('test')).json()).changed).toBe(true);
    expect((await (await api('unreviewed')).json()).changed).toBe(true);
    const rows = await markers(ticketB);
    expect(rows.map(r => r.triage)).toEqual(['spam', 'test', 'unreviewed']);   // full history kept, newest last
    expect(new Set(rows.map(r => r.set_by))).toEqual(new Set([OWNER_EMAIL]));

    const list = await (await ownerCtx.request.get('/api/admin/support')).json();
    expect(list.items.find((i: { id: string }) => i.id === ticketB).triage).toBe('unreviewed');
  });

  test('validates input: unknown ticket 404, bad value 400, wrong content type 415, extra field 400', async () => {
    const post = (data: unknown, headers?: Record<string, string>) => ownerCtx.request.post('/api/admin/support/triage', { data, headers });
    expect((await post({ ticketId: randomUUID(), triage: 'real' })).status()).toBe(404);
    expect((await post({ ticketId: ticketA, triage: 'urgent' })).status()).toBe(400);
    expect((await post({ ticketId: 'not-a-uuid', triage: 'real' })).status()).toBe(400);
    expect((await post({ ticketId: ticketA, triage: 'real', extra: 1 })).status()).toBe(400);
    const form = await ownerCtx.request.post('/api/admin/support/triage', { form: { ticketId: ticketA, triage: 'real' } });
    expect(form.status()).toBe(415);
    expect(await markers(ticketA)).toHaveLength(0);
  });

  test('the overdue ticket is counted as overdue until it is marked, and A is not overdue', async () => {
    const list = await (await ownerCtx.request.get('/api/admin/support')).json();
    const byId = (id: string) => list.items.find((i: { id: string }) => i.id === id);
    expect(byId(ticketB).overdue).toBe(true);
    expect(byId(ticketA).overdue).toBe(false);
    const mark = await ownerCtx.request.post('/api/admin/support/triage', { data: { ticketId: ticketB, triage: 'test' } });
    expect(mark.status()).toBe(200);
    const after = await (await ownerCtx.request.get('/api/admin/support')).json();
    expect(after.items.find((i: { id: string }) => i.id === ticketB).overdue).toBe(false);   // confirmed test leaves the overdue count
    expect(after.items.find((i: { id: string }) => i.id === ticketB).triage).toBe('test');
    expect(await ticketRow(ticketB)).toMatchObject({ status: 'open' });                        // ...and the ticket is still open and kept
  });
});

// - an ordinary shop user -

test.describe('shop user (not the platform owner)', () => {
  test('is turned away from every owner page', async () => {
    for (const path of OWNER_PAGES) {
      // The guard's own answer, before any redirect is followed: send them to /login, render nothing.
      const hop = await userCtx.request.get(path, { maxRedirects: 0 });
      expect([307, 308, 302, 303], `${path} first hop`).toContain(hop.status());
      expect(new URL(hop.headers()['location'] ?? '', 'http://x').pathname, `${path} redirect target`).toBe('/login');
      // (Next streams the page's static <title> before the redirect is raised; that is a page name, not data.
      // What must never appear is anything the page reads: figures, tickets, controls. Boolean, so a failure
      // does not print the whole HTML.)
      const leaked = /\[E2E\]|todays-actions|support-summary|triage-control|stat-open-tickets|Owner Overview|Internal admin/i.test(await hop.text());
      expect(leaked, `${path} redirect body carries owner page content`).toBe(false);

      // And in a browser the shop user ends up somewhere that is not an owner page and shows no owner content.
      const page = await userCtx.newPage();
      await page.goto(path, { waitUntil: 'domcontentloaded' });
      await page.waitForURL(u => !new URL(u.toString()).pathname.startsWith('/admin'), { timeout: 30_000 });
      await expect(page.locator('body')).not.toContainText(/Internal admin|Platform owner only/i);
      await page.close();
    }
  });

  test('gets 403 from every /api/admin read route, and 401 with no session', async ({ playwright, baseURL }) => {
    const anonymous = await playwright.request.newContext({ baseURL });
    for (const path of [...OWNER_GET_APIS, '/api/admin/billing-health/overview']) {
      const asUser = await userCtx.request.get(path);
      expect(asUser.status(), `${path} as shop user`).toBe(403);
      expect(JSON.stringify(await asUser.json())).not.toMatch(/\bitems\b|\boverview\b|accounts/i);   // no data in the refusal
      expect((await anonymous.get(path)).status(), `${path} anonymous`).toBe(401);
    }
    await anonymous.dispose();
  });

  test('cannot mark a ticket: 403, and no marker row appears', async ({ playwright, baseURL }) => {
    const before = await markers(ticketA);
    const res = await userCtx.request.post('/api/admin/support/triage', { data: { ticketId: ticketA, triage: 'spam' } });
    expect(res.status()).toBe(403);
    const anonymous = await playwright.request.newContext({ baseURL });
    expect((await anonymous.post('/api/admin/support/triage', { data: { ticketId: ticketA, triage: 'spam' } })).status()).toBe(401);
    await anonymous.dispose();
    expect(await markers(ticketA)).toEqual(before);
  });

  test('a shop user\'s Bearer token grants nothing on the owner routes either', async ({ playwright, baseURL }) => {
    const db = createClient(URL_, ANON, { auth: { persistSession: false } });
    const { data, error } = await db.auth.signInWithPassword({ email: shopUser.email, password: shopUser.password });
    expect(error).toBeNull();
    const token = data.session!.access_token;
    const bare = await playwright.request.newContext({ baseURL, extraHTTPHeaders: { Authorization: `Bearer ${token}` } });
    // A Bearer token with no cookie session never reaches the owner check: proxy.ts answers 401 to every
    // cookie-less /api/* request. Either way (401 there, or 403 from the owner check) it is refused.
    const get = await bare.get('/api/admin/support');
    expect([401, 403], 'bearer GET').toContain(get.status());
    expect(JSON.stringify(await get.json())).not.toMatch(/"items"/);
    const post = await bare.post('/api/admin/support/triage', { data: { ticketId: ticketA, triage: 'spam' } });
    expect([401, 403], 'bearer POST').toContain(post.status());
    await bare.dispose();
    expect(await markers(ticketA)).toHaveLength(0);
  });

  test('cannot read or write the marker table, or another shop\'s tickets, straight through the database API', async () => {
    const db = createClient(URL_, ANON, { auth: { persistSession: false } });
    const { error: signErr } = await db.auth.signInWithPassword({ email: shopUser.email, password: shopUser.password });
    expect(signErr).toBeNull();

    // The marker table: no privilege at all for authenticated, so both are refused (42501), not merely empty.
    const read = await db.from('support_ticket_triage_events').select('*');
    expect(read.error, 'marker read must be refused').not.toBeNull();
    expect(read.data ?? []).toHaveLength(0);
    const write = await db.from('support_ticket_triage_events').insert({ ticket_id: ticketA, triage: 'spam', set_by: 'attacker' });
    expect(write.error, 'marker insert must be refused').not.toBeNull();
    const upd = await db.from('support_ticket_triage_events').update({ triage: 'spam' }).eq('ticket_id', ticketA);
    expect(upd.error, 'marker update must be refused').not.toBeNull();
    expect(await markers(ticketA)).toHaveLength(0);

    // Own tickets: visible, and carry no marker field even though ticketB has been marked by the owner.
    const own = await db.from('support_tickets').select('*').eq('shop_id', shopUser.shopId);
    expect(own.error).toBeNull();
    expect((own.data ?? []).map(t => t.id).sort()).toEqual([ticketA, ticketB].sort());
    for (const t of own.data ?? []) expect(Object.keys(t).join(',')).not.toMatch(/triage|spam|marker/i);

    // Another shop's ticket: invisible, and cannot be read by id.
    const foreign = await db.from('support_tickets').select('id').eq('id', ticketOther);
    expect(foreign.error).toBeNull();
    expect(foreign.data ?? []).toHaveLength(0);
    const all = await db.from('support_tickets').select('id');
    expect((all.data ?? []).map(t => t.id)).not.toContain(ticketOther);
    const foreignMsgs = await db.from('support_messages').select('id').eq('ticket_id', ticketOther);
    expect(foreignMsgs.data ?? []).toHaveLength(0);
  });
});

// - read-only diagnostics -

test.describe('billing reconciliation, activation and profile diagnostics', () => {
  test('render and change no commercial record', async () => {
    const before = await commercialSnapshot();

    const page = await ownerCtx.newPage();
    for (const path of ['/admin', '/admin/accounts', '/admin/billing-health', '/admin/support']) {
      await page.goto(path, { waitUntil: 'domcontentloaded' });
      await expect(page.locator('body')).not.toContainText(/application error|something went wrong/i);
    }
    await page.close();

    const recon = await ownerCtx.request.get('/api/admin/reconciliation');
    expect(recon.status()).toBe(200);
    const diag = await ownerCtx.request.get('/api/admin/profile-diagnostics');
    expect(diag.status()).toBe(200);
    const diagBody = JSON.stringify(await diag.json());
    expect(diagBody, 'diagnostics must not expose emails').not.toMatch(/@[a-z0-9-]+\.[a-z]+/i);
    const reconBody = JSON.stringify(await recon.json());
    expect(reconBody, 'reconciliation must not expose emails').not.toMatch(/@[a-z0-9-]+\.[a-z]+/i);
    expect((await ownerCtx.request.get('/api/admin/reconciliation?pageSize=100000')).status()).toBe(200);   // clamped, not unbounded

    // Nothing the read paths touch has changed. (Rows created or removed by this run's own setup are
    // outside the window: setup finished before `before` was taken.)
    expect(await commercialSnapshot()).toEqual(before);
  });
});
