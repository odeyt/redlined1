/**
 * A customer's Approve / Decline from the portal. The server must check the
 * token, that the estimate is theirs AND in their shop, and that it is still
 * awaiting an answer.
 */
import fs from 'node:fs';
import path from 'node:path';
import { applyEstimateAction, type EstimateActionStore, type PortalEstimateRecord } from '../estimateAction';

const EST_A = '11111111-1111-4111-8111-111111111111';
const EST_B = '22222222-2222-4222-8222-222222222222';
const EST_X = '44444444-4444-4444-8444-444444444444'; // alice's id, wrong shop
const NOW = new Date('2026-10-13T12:00:00Z');
const TOK_ALICE = 'a'.repeat(64);
const TOK_BOB = 'b'.repeat(64);

function memoryStore(opts: { auditFails?: boolean } = {}) {
  const customers: Record<string, { id: string; shopId: string }> = {
    [TOK_ALICE]: { id: 'alice', shopId: 'shop-1' },
    [TOK_BOB]: { id: 'bob', shopId: 'shop-1' },
  };
  const estimates: Record<string, PortalEstimateRecord & Record<string, unknown>> = {
    [EST_A]: { id: EST_A, shopId: 'shop-1', customerId: 'alice', status: 'Sent', estimateNumber: 'EST-1' },
    [EST_B]: { id: EST_B, shopId: 'shop-1', customerId: 'bob', status: 'Sent', estimateNumber: 'EST-2' },
    [EST_X]: { id: EST_X, shopId: 'shop-2', customerId: 'alice', status: 'Sent', estimateNumber: 'EST-9' },
  };
  const audits: unknown[] = [];
  const lookups: string[] = [];
  const store: EstimateActionStore = {
    async findCustomerByToken(t: string) { lookups.push(t); return customers[t] ?? null; },
    async findEstimate(id: string) { return estimates[id] ? { ...estimates[id] } : null; },
    async updateIfStatus(scope, from, patch) {
      const e = estimates[scope.id];
      if (!e || e.customerId !== scope.customerId || e.shopId !== scope.shopId || !from.includes(e.status)) return 0;
      Object.assign(e, patch);
      return 1;
    },
    async audit(entry) {
      if (opts.auditFails) throw new Error('audit down');
      audits.push(entry);
    },
  };
  return { store, estimates, audits, lookups };
}

describe('applyEstimateAction', () => {
  it('approves the customer’s own estimate, stamps approved_date, and audits it', async () => {
    const { store, estimates, audits } = memoryStore();
    const r = await applyEstimateAction(store, { token: TOK_ALICE, estimateId: EST_A, action: 'approve' }, NOW);
    expect(r).toEqual({ status: 200, body: { ok: true, status: 'Approved' } });
    expect(estimates[EST_A].status).toBe('Approved');
    expect(estimates[EST_A].approved_date).toBe(NOW.toISOString());
    expect(audits).toEqual([expect.objectContaining({
      shopId: 'shop-1', action: 'estimate.approved', estimateId: EST_A, before: { status: 'Sent' },
    })]);
  });

  it('declines without an approval date', async () => {
    const { store, estimates } = memoryStore();
    const r = await applyEstimateAction(store, { token: TOK_ALICE, estimateId: EST_A, action: 'decline' }, NOW);
    expect(r.status).toBe(200);
    expect(estimates[EST_A].status).toBe('Declined');
    expect(estimates[EST_A].approved_date).toBeUndefined();
  });

  it('answers foreign, missing, unknown-token and malformed requests identically', async () => {
    const { store, estimates } = memoryStore();
    const results = await Promise.all([
      applyEstimateAction(store, { token: TOK_ALICE, estimateId: EST_B, action: 'approve' }),        // bob's
      applyEstimateAction(store, { token: TOK_ALICE, estimateId: EST_X, action: 'approve' }),        // alice's id, other shop
      applyEstimateAction(store, { token: TOK_ALICE, estimateId: '33333333-3333-4333-8333-333333333333', action: 'approve' }),
      applyEstimateAction(store, { token: 'c'.repeat(64), estimateId: EST_A, action: 'approve' }),   // unknown token
      applyEstimateAction(store, { token: 'not-a-token', estimateId: EST_A, action: 'approve' }),    // malformed token
      applyEstimateAction(store, { token: TOK_ALICE, estimateId: "1' or 1=1", action: 'approve' }), // malformed id
      applyEstimateAction(store, { estimateId: EST_A, action: 'approve' }),                          // no token
    ]);
    for (const r of results) expect(r).toEqual(results[0]);
    expect(results[0].status).toBe(404);
    expect(estimates[EST_B].status).toBe('Sent');
    expect(estimates[EST_X].status).toBe('Sent');
  });

  it('does not query the database for a malformed token', async () => {
    const { store, lookups } = memoryStore();
    await applyEstimateAction(store, { token: 'x'.repeat(500), estimateId: EST_A, action: 'approve' });
    await applyEstimateAction(store, { token: 'A'.repeat(64), estimateId: EST_A, action: 'approve' });
    expect(lookups).toEqual([]);
  });

  it('rejects an unknown action with 400', async () => {
    const { store } = memoryStore();
    for (const bad of [null, 'x', { token: TOK_ALICE, estimateId: EST_A, action: 'delete' }]) {
      expect((await applyEstimateAction(store, bad)).status).toBe(400);
    }
  });

  it('will not change an estimate that is no longer awaiting an answer (replay)', async () => {
    const { store, estimates } = memoryStore();
    const first = await applyEstimateAction(store, { token: TOK_ALICE, estimateId: EST_A, action: 'approve' });
    const replay = await applyEstimateAction(store, { token: TOK_ALICE, estimateId: EST_A, action: 'decline' });
    expect(first.status).toBe(200);
    expect(replay).toEqual({ status: 409, body: { error: expect.any(String), status: 'Approved' } });
    expect(estimates[EST_A].status).toBe('Approved');
  });

  it('lets only the first of two concurrent clicks win', async () => {
    const { store } = memoryStore();
    const body = { token: TOK_ALICE, estimateId: EST_A };
    const [a, b] = await Promise.all([
      applyEstimateAction(store, { ...body, action: 'approve' }),
      applyEstimateAction(store, { ...body, action: 'decline' }),
    ]);
    expect([a.status, b.status].sort()).toEqual([200, 409]);
  });

  it('keeps the customer’s answer when the audit write fails', async () => {
    const { store, estimates } = memoryStore({ auditFails: true });
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const r = await applyEstimateAction(store, { token: TOK_ALICE, estimateId: EST_A, action: 'approve' });
    expect(r.status).toBe(200);
    expect(estimates[EST_A].status).toBe('Approved');
    expect(spy).toHaveBeenCalled();
    expect(JSON.stringify(spy.mock.calls)).not.toContain(TOK_ALICE);
    spy.mockRestore();
  });
});

describe('portal client', () => {
  it('no longer writes estimates through the browser anon client, and does not ship the token in page data', () => {
    const client = fs.readFileSync(path.join(process.cwd(), 'app/portal/[token]/PortalClient.tsx'), 'utf8');
    const service = fs.readFileSync(path.join(process.cwd(), 'services/portalService.ts'), 'utf8');
    expect(client).toMatch(/fetch\('\/api\/portal\/estimate-action'/);
    expect(client).toMatch(/token: params\.token/);
    expect(client).not.toMatch(/customer\.portalToken/);
    expect(service).not.toMatch(/\.update\(|from '@\/lib\/supabase'|portalToken/);
  });
});
