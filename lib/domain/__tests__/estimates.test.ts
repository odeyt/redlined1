/**
 * Estimates, ported from the browser service to lib/domain.
 *
 * The staff screens now call these through the browser adapter, and API v1
 * will call them directly. What the port must keep: the same columns written,
 * every query scoped to the caller's shops, an audit row per change, and an
 * audit failure that never turns a saved estimate into an error. What it adds:
 * a capability check on writes, and `estimate.approved` in the event outbox.
 */
import { createEstimateDomain, estimateUpdatePayload, mapEstimateRow } from '../estimates';
import { createDomainContext } from '../context';
import { formatDocumentNumber, allocateDocumentNumber } from '../documentNumbers';
import { NotPermittedError } from '../context';

const SHOP = '11111111-1111-4111-8111-111111111111';
const MIRROR = '33333333-3333-4333-8333-333333333333';
const ORG = '22222222-2222-4222-8222-222222222222';

interface Call { table: string; op: string; payload?: unknown; filters: Record<string, unknown> }

/**
 * A chainable fake that records each query and answers with `row`.
 * `rpc` answers the audit call, or fails it when `auditFails` is set.
 */
function fakeDb(opts: { row?: Record<string, unknown> | null; auditFails?: boolean } = {}) {
  const calls: Call[] = [];
  const rpcs: { fn: string; args: Record<string, unknown> }[] = [];
  const row = opts.row === undefined ? { id: 'e1', estimate_number: 'EST-0001', customer_id: 'c1', currency: 'THB', status: 'Draft' } : opts.row;

  const builder = (table: string) => {
    const call: Call = { table, op: 'select', filters: {} };
    calls.push(call);
    const result = { data: row, error: null };
    const chain: Record<string, unknown> = {
      select: () => chain,
      insert: (p: unknown) => { call.op = 'insert'; call.payload = p; return chain; },
      update: (p: unknown) => { call.op = 'update'; call.payload = p; return chain; },
      delete: () => { call.op = 'delete'; return chain; },
      eq: (k: string, v: unknown) => { call.filters['eq:' + k] = v; return chain; },
      in: (k: string, v: unknown) => { call.filters['in:' + k] = v; return chain; },
      order: () => chain,
      single: () => Promise.resolve(result),
      maybeSingle: () => Promise.resolve(result),
      then: (resolve: (v: unknown) => unknown) =>
        resolve({ data: call.op === 'select' ? (row ? [row] : []) : row, error: null }),
    };
    return chain;
  };

  const db = {
    from: builder,
    rpc: (fn: string, args: Record<string, unknown>) => {
      rpcs.push({ fn, args });
      if (fn === 'record_audit_event' && opts.auditFails) return Promise.resolve({ error: { message: 'audit down' } });
      if (fn === 'next_document_number') return Promise.resolve({ data: 42, error: null });
      return Promise.resolve({ error: null });
    },
  };
  return { db, calls, rpcs };
}

function context(capabilities: string[] | null, type: 'user' | 'api' = 'user') {
  return createDomainContext({
    organizationId: ORG,
    shopId: SHOP,
    shopIds: [SHOP, MIRROR],
    actor: { userId: type === 'user' ? 'u1' : null, type, role: type === 'user' ? 'advisor' : 'api_key' },
    capabilities,
  });
}

const INPUT = {
  estimateNumber: 'EST-0001', customerName: 'Somchai', customerId: 'c1', vehicle: 'Toyota Hilux 2019',
  jobCardId: '', status: 'Draft', lines: [{ note: '', description: 'Brake pads', qty: 2, rate: 1500, currency: 'THB' }],
  discount: 0, shopSupplies: 0, taxRate: 0, notes: '', validUntil: '', approvedDate: null, currency: 'THB',
};

beforeEach(() => { jest.spyOn(console, 'error').mockImplementation(() => {}); });
afterEach(() => { jest.restoreAllMocks(); });

describe('reading estimates', () => {
  it('lists across every shop the caller may read, not just the active one', async () => {
    const { db, calls } = fakeDb();
    const list = await createEstimateDomain({ db: db as never, context: context(['estimates.read']) }).list();
    expect(list).toHaveLength(1);
    expect(calls[0].filters['in:shop_id']).toEqual([SHOP, MIRROR]);
  });

  it('gets one estimate only within the caller\'s shops', async () => {
    const { db, calls } = fakeDb();
    await createEstimateDomain({ db: db as never, context: context(['estimates.read']) }).get('e1');
    expect(calls[0].filters).toEqual({ 'eq:id': 'e1', 'in:shop_id': [SHOP, MIRROR] });
  });

  it('maps a row exactly as the browser service did', () => {
    const e = mapEstimateRow({ id: 'e1', estimate_number: 'EST-0009', status: null, tax_rate: null, currency: null });
    expect(e).toMatchObject({ estimateNumber: 'EST-0009', status: 'Draft', taxRate: 0, currency: 'USD', lines: [] });
  });
});

describe('creating an estimate', () => {
  it('writes into the active shop with the same columns as before, then audits', async () => {
    const { db, calls, rpcs } = fakeDb();
    await createEstimateDomain({ db: db as never, context: context(['estimates.manage']) }).create(INPUT);
    const insert = calls.find(c => c.op === 'insert')!;
    expect(insert.table).toBe('estimates');
    expect(insert.payload).toMatchObject({
      shop_id: SHOP, estimate_number: 'EST-0001', customer_name: 'Somchai', customer_id: 'c1',
      vehicle: 'Toyota Hilux 2019', job_card_id: null, status: 'Draft', currency: 'THB', valid_until: null,
    });
    expect(rpcs.map(r => r.fn)).toContain('record_audit_event');
    expect(rpcs.find(r => r.fn === 'record_audit_event')!.args.p_action).toBe('estimate.created');
  });

  it('refuses a machine caller without estimates.manage', async () => {
    const { db, calls } = fakeDb();
    const domain = createEstimateDomain({ db: db as never, context: context(['estimates.read'], 'api') });
    await expect(domain.create(INPUT)).rejects.toBeInstanceOf(NotPermittedError);
    expect(calls.some(c => c.op === 'insert')).toBe(false);
  });

  it('defers a person whose permissions could not be read to the database, as before', async () => {
    const { db, calls } = fakeDb();
    await createEstimateDomain({ db: db as never, context: context(null, 'user') }).create(INPUT);
    expect(calls.some(c => c.op === 'insert')).toBe(true);
  });

  it('does not report a saved estimate as failed when the audit write fails', async () => {
    const { db } = fakeDb({ auditFails: true });
    const created = await createEstimateDomain({ db: db as never, context: context(['estimates.manage']) }).create(INPUT);
    expect(created.id).toBe('e1');
    expect(console.error).toHaveBeenCalled();
  });
});

describe('updating, approving and deleting', () => {
  it('only writes the fields the caller set, scoped to the caller\'s shops', async () => {
    const { db, calls } = fakeDb();
    await createEstimateDomain({ db: db as never, context: context(['estimates.manage']) }).update('e1', { status: 'Sent' });
    const upd = calls.find(c => c.op === 'update')!;
    expect(upd.payload).toEqual({ status: 'Sent' });
    expect(upd.filters).toEqual({ 'eq:id': 'e1', 'in:shop_id': [SHOP, MIRROR] });
  });

  it('maps every editable field to its column', () => {
    expect(estimateUpdatePayload({ customerId: '', jobCardId: '', validUntil: '', approvedDate: null, shopSupplies: 5 }))
      .toEqual({ customer_id: null, job_card_id: null, valid_until: null, approved_date: null, shop_supplies: 5 });
  });

  it('approves, queues estimate.approved once per estimate, and audits the approval', async () => {
    const { db, calls, rpcs } = fakeDb();
    await createEstimateDomain({ db: db as never, context: context(['estimates.manage']) }).approve('e1');
    const upd = calls.find(c => c.table === 'estimates' && c.op === 'update')!;
    expect(upd.payload).toMatchObject({ status: 'Approved' });
    const outbox = calls.find(c => c.table === 'domain_event_outbox')!;
    expect(outbox.op).toBe('insert');
    expect(outbox.payload).toMatchObject({ event_type: 'estimate.approved', idempotency_key: 'estimate.approved:e1' });
    expect(rpcs.find(r => r.fn === 'record_audit_event')!.args.p_action).toBe('estimate.approved');
  });

  it('queues no event when the estimate is not in the caller\'s shops', async () => {
    const { db, calls } = fakeDb({ row: null });
    await createEstimateDomain({ db: db as never, context: context(['estimates.manage']) }).approve('nope');
    expect(calls.some(c => c.table === 'domain_event_outbox')).toBe(false);
  });

  it('reads what a deletion removes before removing it', async () => {
    const { db, calls } = fakeDb();
    await createEstimateDomain({ db: db as never, context: context(['estimates.manage']) }).remove('e1');
    const ops = calls.filter(c => c.table === 'estimates').map(c => c.op);
    expect(ops).toEqual(['select', 'delete']);
  });
});

describe('document numbers', () => {
  it('formats as the screens always have', () => {
    expect(formatDocumentNumber('estimate', 7)).toBe('EST-0007');
    expect(formatDocumentNumber('invoice', 1234)).toBe('INV-1234');
    expect(formatDocumentNumber('repair_order', 13)).toBe('RO-00013');
  });

  it('allocates from the database for the given shop', async () => {
    const { db, rpcs } = fakeDb();
    expect(await allocateDocumentNumber(db as never, SHOP, 'estimate')).toBe('EST-0042');
    expect(rpcs[0]).toEqual({ fn: 'next_document_number', args: { p_shop_id: SHOP, p_doc_type: 'estimate' } });
  });

  it('refuses to guess when there is no shop', async () => {
    const { db } = fakeDb();
    await expect(allocateDocumentNumber(db as never, '', 'estimate')).rejects.toThrow(/No active shop/);
  });
});
