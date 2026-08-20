/**
 * An event that cannot be delivered must not be queued.
 *
 * `rib_events.organization_id` is NOT NULL. Before M12.3 a shop with no
 * organization could queue events happily; the relay then claimed each one,
 * burned all eight attempts against a condition that could never change, and
 * marked it dead. The dead row read like a delivery failure when it was really
 * a tenancy gap, and the eight attempts were pure noise.
 *
 * Two shops were in that state, created after M1's back-fill because the shop
 * provisioning path was never updated to create an organization.
 *
 * Refusing at emit is safe because the business record is the source of truth:
 * scripts/reconcile-domain-events.ts rebuilds the event from it once the
 * organization is attached. Nothing is lost by not writing a row that could
 * only die.
 */
import { readFileSync } from 'fs';
import { join } from 'path';
import { emitDomainEvent, routingProblem } from '../events';
import { createDomainContext } from '../context';
import { relayOnce, type OutboxEvent } from '../../events/relay';

const SHOP = '11111111-1111-4111-8111-111111111111';
const ORG = '22222222-2222-4222-8222-222222222222';

const contextWith = (organizationId: string | null) =>
  createDomainContext({
    organizationId,
    shopId: SHOP,
    shopIds: [SHOP],
    actor: { userId: 'u1', type: 'user', role: 'owner' },
    capabilities: ['invoices.manage'],
  });

const INPUT = {
  eventType: 'invoice.issued',
  aggregateType: 'invoice',
  aggregateId: 'INV-1',
  payload: { invoiceNumber: 'INV-1' },
  idempotencyKey: 'invoice.issued:INV-1',
};

/** A db that records whether anything tried to write. */
function spyDb() {
  const inserts: unknown[] = [];
  return {
    inserts,
    from: () => ({ insert: (row: unknown) => { inserts.push(row); return Promise.resolve({ error: null }); } }),
  };
}

describe('routingProblem', () => {
  it('names a missing organization', () => {
    expect(routingProblem(contextWith(null))).toBe('shop has no organization_id');
  });

  it('passes a context that can be delivered', () => {
    expect(routingProblem(contextWith(ORG))).toBeNull();
  });
});

describe('emitDomainEvent fail-fast', () => {
  it('refuses to queue an event whose shop has no organization', async () => {
    const db = spyDb();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const queued = await emitDomainEvent(db as any, contextWith(null), INPUT);

    expect(queued).toBe(false);
    // The point: nothing was written. A dead row is not an acceptable outcome
    // for something known to be undeliverable before it was written.
    expect(db.inserts).toHaveLength(0);
  });

  it('queues normally once the organization is present', async () => {
    const db = spyDb();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const queued = await emitDomainEvent(db as any, contextWith(ORG), INPUT);

    expect(queued).toBe(true);
    expect(db.inserts).toHaveLength(1);
    expect(db.inserts[0]).toMatchObject({
      organization_id: ORG,
      shop_id: SHOP,
      event_type: 'invoice.issued',
      idempotency_key: 'invoice.issued:INV-1',
      status: 'pending',
    });
  });

  it('does not throw, so the business action still completes', async () => {
    const db = spyDb();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await expect(emitDomainEvent(db as any, contextWith(null), INPUT)).resolves.toBe(false);
  });
});

describe('the relay reports which events it settled as failures', () => {
  const event = (over: Partial<OutboxEvent> = {}): OutboxEvent => ({
    id: 'e1', organization_id: ORG, shop_id: SHOP, event_type: 'invoice.issued',
    payload: {}, aggregate_type: 'invoice', aggregate_id: 'INV-1',
    actor_user_id: null, actor_type: 'system', correlation_id: null,
    created_at: '2026-08-20T00:00:00Z', attempts: 0, ...over,
  });

  function relayDb(rows: OutboxEvent[], insertError: { code?: string; message: string } | null) {
    return {
      rpc: (name: string) => (name === 'claim_domain_events'
        ? Promise.resolve({ data: rows, error: null })
        : Promise.resolve({ data: null, error: null })),
      from: () => ({ insert: () => Promise.resolve({ error: insertError }) }),
    };
  }

  it('lists an unroutable event so the caller can alert on it', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const r = await relayOnce(relayDb([event({ organization_id: null })], null) as any);
    expect(r.unroutable).toBe(1);
    expect(r.settledFailures).toEqual(['e1']);
  });

  it('lists a genuine delivery failure', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const r = await relayOnce(relayDb([event()], { message: 'connection reset' }) as any);
    expect(r.failed).toBe(1);
    expect(r.settledFailures).toEqual(['e1']);
  });

  it('lists nothing when delivery succeeds', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const r = await relayOnce(relayDb([event()], null) as any);
    expect(r.written).toBe(1);
    expect(r.settledFailures).toEqual([]);
  });
});

describe('the reconciler rebuilds the same idempotency keys the emitters use', () => {
  // A reconciler that derives a different key would re-emit an event that
  // already exists, which is the one thing it must never do.
  const reconciler = readFileSync(join(process.cwd(), 'scripts', 'reconcile-domain-events.ts'), 'utf8');
  const domainSources = ['invoices', 'payments', 'expenses', 'attendance', 'cashDay', 'payroll']
    .map(f => readFileSync(join(process.cwd(), 'lib', 'domain', f + '.ts'), 'utf8'))
    .join('\n');

  const KEY_PREFIXES = [
    'invoice.issued:', 'payment.recorded:', 'payment.reversed:',
    'expense.approved:', 'leave.approved:', 'cash_day.closed:', 'payroll.finalised:',
  ];

  it.each(KEY_PREFIXES)('%s is built by both the emitter and the reconciler', prefix => {
    expect(domainSources).toContain("'" + prefix + "'");
    expect(reconciler).toContain("'" + prefix + "'");
  });

  it('refuses --execute without a lower bound', () => {
    expect(reconciler).toContain('--execute requires --since');
  });

  it('takes tenancy from the business row, never from an argument', () => {
    expect(reconciler).toContain('Tenant identity comes from the business row');
    expect(reconciler).not.toMatch(/--shop\b/);
  });
});
