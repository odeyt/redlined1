/**
 * A customer's Approve / Decline from the portal. The server must check the
 * token, that the estimate is theirs, and that it is still awaiting an answer.
 */
import fs from 'node:fs';
import path from 'node:path';
import { applyEstimateAction, type EstimateActionStore, type PortalEstimateRecord } from '../estimateAction';

const EST_A = '11111111-1111-4111-8111-111111111111';
const EST_B = '22222222-2222-4222-8222-222222222222';
const NOW = new Date('2026-10-13T12:00:00Z');

function memoryStore(opts: { auditFails?: boolean } = {}) {
  const customers: Record<string, string> = { 'tok-alice': 'alice', 'tok-bob': 'bob' };
  const estimates: Record<string, PortalEstimateRecord & Record<string, unknown>> = {
    [EST_A]: { id: EST_A, shopId: 'shop-1', customerId: 'alice', status: 'Sent', estimateNumber: 'EST-1' },
    [EST_B]: { id: EST_B, shopId: 'shop-1', customerId: 'bob', status: 'Sent', estimateNumber: 'EST-2' },
  };
  const audits: unknown[] = [];
  const store: EstimateActionStore = {
    async findCustomerIdByToken(t) { return customers[t] ?? null; },
    async findEstimate(id) { return estimates[id] ? { ...estimates[id] } : null; },
    async updateIfStatus(id, from, patch) {
      const e = estimates[id];
      if (!e || !from.includes(e.status)) return 0;
      Object.assign(e, patch);
      return 1;
    },
    async audit(entry) {
      if (opts.auditFails) throw new Error('audit down');
      audits.push(entry);
    },
  };
  return { store, estimates, audits };
}

describe('applyEstimateAction', () => {
  it('approves the customer’s own estimate, stamps approved_date, and audits it', async () => {
    const { store, estimates, audits } = memoryStore();
    const r = await applyEstimateAction(store, { token: 'tok-alice', estimateId: EST_A, action: 'approve' }, NOW);
    expect(r).toEqual({ status: 200, body: { ok: true, status: 'Approved' } });
    expect(estimates[EST_A].status).toBe('Approved');
    expect(estimates[EST_A].approved_date).toBe(NOW.toISOString());
    expect(audits).toEqual([expect.objectContaining({
      shopId: 'shop-1', action: 'estimate.approved', estimateId: EST_A,
      before: { status: 'Sent' },
    })]);
  });

  it('declines without an approval date', async () => {
    const { store, estimates } = memoryStore();
    const r = await applyEstimateAction(store, { token: 'tok-alice', estimateId: EST_A, action: 'decline' }, NOW);
    expect(r.status).toBe(200);
    expect(estimates[EST_A].status).toBe('Declined');
    expect(estimates[EST_A].approved_date).toBeUndefined();
  });

  it('refuses another customer’s estimate with the same 404 as a missing one', async () => {
    const { store, estimates } = memoryStore();
    const theirs = await applyEstimateAction(store, { token: 'tok-alice', estimateId: EST_B, action: 'approve' });
    const missing = await applyEstimateAction(store, { token: 'tok-alice', estimateId: '33333333-3333-4333-8333-333333333333', action: 'approve' });
    expect(theirs).toEqual(missing);
    expect(theirs.status).toBe(404);
    expect(estimates[EST_B].status).toBe('Sent');
  });

  it('refuses an unknown token', async () => {
    const { store } = memoryStore();
    const r = await applyEstimateAction(store, { token: 'nope', estimateId: EST_A, action: 'approve' });
    expect(r.status).toBe(404);
  });

  it('will not change an estimate that is no longer awaiting an answer', async () => {
    const { store, estimates } = memoryStore();
    estimates[EST_A].status = 'Approved';
    const r = await applyEstimateAction(store, { token: 'tok-alice', estimateId: EST_A, action: 'decline' });
    expect(r).toEqual({ status: 409, body: { error: expect.any(String), status: 'Approved' } });
    expect(estimates[EST_A].status).toBe('Approved');
  });

  it('lets only the first of two clicks win', async () => {
    const { store } = memoryStore();
    const body = { token: 'tok-alice', estimateId: EST_A };
    const [a, b] = await Promise.all([
      applyEstimateAction(store, { ...body, action: 'approve' }),
      applyEstimateAction(store, { ...body, action: 'decline' }),
    ]);
    expect([a.status, b.status].sort()).toEqual([200, 409]);
  });

  it('rejects malformed requests', async () => {
    const { store } = memoryStore();
    for (const bad of [
      null,
      { token: 'tok-alice', estimateId: EST_A, action: 'delete' },
      { token: 'tok-alice', estimateId: "1' or 1=1", action: 'approve' },
      { token: '', estimateId: EST_A, action: 'approve' },
      { token: 'x'.repeat(201), estimateId: EST_A, action: 'approve' },
    ]) {
      expect((await applyEstimateAction(store, bad)).status).toBe(400);
    }
  });

  it('keeps the customer’s answer when the audit write fails', async () => {
    const { store, estimates } = memoryStore({ auditFails: true });
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const r = await applyEstimateAction(store, { token: 'tok-alice', estimateId: EST_A, action: 'approve' });
    expect(r.status).toBe(200);
    expect(estimates[EST_A].status).toBe('Approved');
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });
});

describe('portal client', () => {
  it('no longer writes estimates through the browser anon client', () => {
    const client = fs.readFileSync(path.join(process.cwd(), 'app/portal/[token]/PortalClient.tsx'), 'utf8');
    const service = fs.readFileSync(path.join(process.cwd(), 'services/portalService.ts'), 'utf8');
    expect(client).toMatch(/fetch\('\/api\/portal\/estimate-action'/);
    expect(client).not.toMatch(/customerApproveEstimate|customerDeclineEstimate/);
    expect(service).not.toMatch(/\.update\(|from '@\/lib\/supabase'/);
  });
});
