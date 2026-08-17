/**
 * What the domain layer must guarantee, exercised against a fake database.
 *
 * A fake rather than a mock of Supabase: these tests care about the query that
 * gets built (which shops it asks for, which key it filters on) and about the
 * audit row that follows, not about the client's internals. The fake records
 * every call so both can be asserted.
 */
import { createDomainContext, createSystemContext, DomainContextError } from '../context';
import { createCustomerDomain } from '../customers';
import { createInvoiceDomain } from '../invoices';
import { createPaymentDomain, LedgerError, netAmount, liveEntries } from '../payments';
import { redactSnapshot, AuditWriteError, writeAuditEvent } from '../audit';
import type { DomainDb } from '../db';

interface Recorded {
  table: string;
  op: string;
  filters: Record<string, unknown>;
  payload?: unknown;
}

/** A Supabase-shaped stub that records what was asked of it. */
function fakeDb(rows: Record<string, unknown>[] = [{ id: 'X-1', number: 'INV-1', name: 'A' }]) {
  const calls: Recorded[] = [];
  const rpcCalls: { fn: string; args: Record<string, unknown> }[] = [];
  let rpcFails = false;

  function builder(table: string, op: string) {
    const rec: Recorded = { table, op, filters: {} };
    calls.push(rec);
    const chain: Record<string, unknown> = {};
    const self = () => chain;
    for (const m of ['select', 'order', 'eq', 'in', 'is', 'maybeSingle', 'single']) {
      chain[m] = (...args: unknown[]) => {
        if (m === 'eq' || m === 'in' || m === 'is') rec.filters[String(args[0])] = args[1];
        if (m === 'maybeSingle' || m === 'single') {
          return Promise.resolve({ data: rows[0] ?? null, error: null });
        }
        return self();
      };
    }
    // Awaiting the chain without a terminal call resolves to the list.
    chain.then = (resolve: (v: unknown) => unknown) =>
      Promise.resolve({ data: rows, error: null }).then(resolve);
    return chain;
  }

  const db = {
    from(table: string) {
      return {
        select: (..._a: unknown[]) => builder(table, 'select'),
        insert: (payload: unknown) => { const b = builder(table, 'insert'); calls[calls.length - 1].payload = payload; return b; },
        update: (payload: unknown) => { const b = builder(table, 'update'); calls[calls.length - 1].payload = payload; return b; },
        delete: () => builder(table, 'delete'),
      };
    },
    rpc(fn: string, args: Record<string, unknown>) {
      rpcCalls.push({ fn, args });
      return Promise.resolve(rpcFails ? { data: null, error: { message: 'nope' } } : { data: 'audit-1', error: null });
    },
  } as unknown as DomainDb;

  return { db, calls, rpcCalls, failAudit: () => { rpcFails = true; } };
}

const ctx = createDomainContext({
  organizationId: 'org-1',
  shopId: 'shop-A',
  shopIds: ['shop-A', 'shop-B'],
  actor: { type: 'user', userId: 'user-1', role: 'owner' },
});

describe('the domain context', () => {
  it('refuses to be built without a shop', () => {
    // A defaulted tenant reads or writes somebody else's shop. An error is the
    // better failure.
    expect(() => createDomainContext({ shopId: '', actor: { type: 'user', userId: 'u', role: null } }))
      .toThrow(DomainContextError);
  });

  it('refuses an unknown actor type', () => {
    expect(() => createDomainContext({
      shopId: 's',
      // @ts-expect-error deliberately invalid
      actor: { type: 'anonymous', userId: null, role: null },
    })).toThrow(DomainContextError);
  });

  it('always includes the write shop in the read scope', () => {
    const c = createDomainContext({ shopId: 'A', shopIds: ['B'], actor: { type: 'system', userId: null, role: null } });
    expect(c.shopIds).toEqual(['A', 'B']);
  });

  it('does not repeat a shop id', () => {
    // `.in()` handed the same id twice is harmless but signals confusion.
    const c = createDomainContext({ shopId: 'A', shopIds: ['A', 'A'], actor: { type: 'system', userId: null, role: null } });
    expect(c.shopIds).toEqual(['A']);
  });

  it('keeps system actors distinguishable from users', () => {
    expect(createSystemContext('A').actor.type).toBe('system');
  });
});

describe('tenancy is explicit on every operation', () => {
  it('customer reads are scoped to the context shops', async () => {
    const { db, calls } = fakeDb();
    await createCustomerDomain({ db, context: ctx }).list();
    expect(calls[0].filters.shop_id).toEqual(['shop-A', 'shop-B']);
  });

  it('customer writes land in the single write shop, not the read scope', async () => {
    // The distinction that stops a two-location owner writing to the wrong one.
    const { db, calls } = fakeDb();
    await createCustomerDomain({ db, context: ctx }).create({
      name: 'A', type: '', phone: '', email: '', address: '', tags: [], followUp: '',
    });
    expect((calls[0].payload as Record<string, unknown>).shop_id).toBe('shop-A');
  });

  it('invoice reads are scoped, and key on number rather than id', async () => {
    // invoices has no id column. Keying on the wrong one has already caused a
    // three-day production outage.
    const { db, calls } = fakeDb();
    await createInvoiceDomain({ db, context: ctx }).get('INV-1');
    expect(calls[0].filters.number).toBe('INV-1');
    expect(calls[0].filters).not.toHaveProperty('id');
    expect(calls[0].filters.shop_id).toEqual(['shop-A', 'shop-B']);
  });

  it('payment reads are scoped', async () => {
    const { db, calls } = fakeDb();
    await createPaymentDomain({ db, context: ctx }).list();
    expect(calls[0].filters.shop_id).toEqual(['shop-A', 'shop-B']);
  });

  it('a context for shop A never asks for shop C', async () => {
    const onlyA = createDomainContext({ shopId: 'shop-A', actor: { type: 'user', userId: 'u', role: 'owner' } });
    const { db, calls } = fakeDb();
    await createCustomerDomain({ db, context: onlyA }).list();
    await createInvoiceDomain({ db, context: onlyA }).list();
    await createPaymentDomain({ db, context: onlyA }).list();
    for (const call of calls) expect(call.filters.shop_id).toEqual(['shop-A']);
  });
});

describe('the database client is injected, never imported', () => {
  it('uses whichever client it was handed', async () => {
    const first = fakeDb();
    const second = fakeDb();
    await createCustomerDomain({ db: first.db, context: ctx }).list();
    expect(first.calls).toHaveLength(1);
    expect(second.calls).toHaveLength(0);
  });
});

describe('mutations are audited', () => {
  it('creating a customer records customer.created', async () => {
    const { db, rpcCalls } = fakeDb([{ id: 'C-1', name: 'Ai Peng' }]);
    await createCustomerDomain({ db, context: ctx }).create({
      name: 'Ai Peng', type: '', phone: '', email: '', address: '', tags: [], followUp: '',
    });
    expect(rpcCalls[0].fn).toBe('record_audit_event');
    expect(rpcCalls[0].args.p_action).toBe('customer.created');
    expect(rpcCalls[0].args.p_entity_id).toBe('C-1');
    expect(rpcCalls[0].args.p_shop_id).toBe('shop-A');
  });

  it('updating a customer records both sides of the change', async () => {
    const { db, rpcCalls } = fakeDb([{ id: 'C-1', name: 'Before' }]);
    await createCustomerDomain({ db, context: ctx }).update('C-1', {
      name: 'After', type: '', phone: '', email: '', address: '', tags: [], followUp: '',
    });
    expect(rpcCalls[0].args.p_action).toBe('customer.updated');
    expect(rpcCalls[0].args.p_before).toBeTruthy();
    expect(rpcCalls[0].args.p_after).toBeTruthy();
  });

  it('creating an invoice records invoice.created against its number', async () => {
    const { db, rpcCalls } = fakeDb([{ number: 'INV-9', status: 'Draft', lines: [] }]);
    await createInvoiceDomain({ db, context: ctx }).create({
      invoiceNumber: 'INV-9', customerName: '', customerId: '', vehicle: '', jobCardId: '',
      status: 'Draft', lines: [], discount: 0, shopSupplies: 0, taxRate: 0, notes: '',
      dueDate: '', paidDate: null, currency: 'USD',
    });
    expect(rpcCalls[0].args.p_action).toBe('invoice.created');
    expect(rpcCalls[0].args.p_entity_id).toBe('INV-9');
  });

  it('marking an invoice paid records a status change, not a generic update', async () => {
    // Money moving from Draft to Paid is what a reconciliation searches for.
    const { db, rpcCalls } = fakeDb([{ number: 'INV-9', status: 'Draft', lines: [] }]);
    await createInvoiceDomain({ db, context: ctx }).markPaid('INV-9');
    expect(rpcCalls[0].args.p_action).toBe('invoice.status_changed');
  });

  it('creating a payment records payment.created', async () => {
    const { db, rpcCalls } = fakeDb([{ id: 'P-1', amount: 500, currency: 'THB' }]);
    await createPaymentDomain({ db, context: ctx }).create({
      invoiceNumber: 'INV-1', customerName: 'A', customerId: '', amount: 500,
      method: 'Cash', methodDetail: '', status: 'Recorded', notes: '',
      currency: 'THB', referenceNumber: '', paymentDate: '2026-08-16',
    });
    expect(rpcCalls[0].args.p_action).toBe('payment.created');
  });

  it('reverses by appending the exact opposite, leaving the original alone', async () => {
    const { db, calls } = fakeDb([{
      id: 'P-1', amount: 500, currency: 'THB', method: 'Cash',
      invoice_number: 'INV-1', customer_name: 'Ai Peng',
    }]);
    await createPaymentDomain({ db, context: ctx }).reverse('P-1', 'entered twice');

    // No update, no delete — the ledger only ever grows.
    expect(calls.some(c => c.op === 'update')).toBe(false);
    expect(calls.some(c => c.op === 'delete')).toBe(false);

    const insert = calls.find(c => c.op === 'insert')!.payload as Record<string, unknown>;
    expect(insert.amount).toBe(-500);
    expect(insert.entry_type).toBe('reversal');
    expect(insert.reverses_payment_id).toBe('P-1');
    expect(insert.currency).toBe('THB');
    expect(insert.reason).toBe('entered twice');
  });

  it('refuses a reversal with no reason', async () => {
    // A reversal nobody explained is the thing an auditor asks about months
    // later and no one can answer.
    const { db } = fakeDb([{ id: 'P-1', amount: 500 }]);
    await expect(createPaymentDomain({ db, context: ctx }).reverse('P-1', '   '))
      .rejects.toThrow(LedgerError);
  });

  it('refuses to reverse a reversal', async () => {
    const { db } = fakeDb([{ id: 'R-1', amount: -500, entry_type: 'reversal', reverses_payment_id: 'P-1' }]);
    await expect(createPaymentDomain({ db, context: ctx }).reverse('R-1', 'oops'))
      .rejects.toThrow(/already a reversal/);
  });

  it('refuses to reverse a payment from another shop', async () => {
    const { db } = fakeDb([]);   // the shop-scoped read finds nothing
    await expect(createPaymentDomain({ db, context: ctx }).reverse('P-9', 'x'))
      .rejects.toThrow(/not in this location/);
  });

  it('records a reversal against the ORIGINAL entry, so its history is findable', async () => {
    const { db, rpcCalls } = fakeDb([{ id: 'P-1', amount: 500, currency: 'THB' }]);
    await createPaymentDomain({ db, context: ctx }).reverse('P-1', 'duplicate');
    expect(rpcCalls[0].args.p_action).toBe('payment.reversed');
    expect(rpcCalls[0].args.p_entity_id).toBe('P-1');
    expect(rpcCalls[0].args.p_metadata).toMatchObject({ reason: 'duplicate' });
  });

  it('corrects by reversing FIRST, then recording the replacement', async () => {
    // The order is the safeguard: PostgREST cannot span the two writes in one
    // transaction, so a failure after step one leaves the payment cancelled
    // rather than duplicated. A lost payment can be re-entered; a customer
    // billed twice cannot be un-billed as easily.
    const { db, calls } = fakeDb([{ id: 'P-1', amount: 500, currency: 'THB' }]);
    await createPaymentDomain({ db, context: ctx }).correct(
      'P-1',
      {
        invoiceNumber: 'INV-1', customerName: 'Ai Peng', customerId: '', amount: 450,
        method: 'Cash', methodDetail: '', status: 'Recorded', notes: '',
        currency: 'THB', referenceNumber: '', paymentDate: '2026-08-17',
      },
      'wrong amount',
    );
    const inserts = calls.filter(c => c.op === 'insert').map(c => c.payload as Record<string, unknown>);
    expect(inserts).toHaveLength(2);
    expect(inserts[0].entry_type).toBe('reversal');
    expect(inserts[1].entry_type).toBe('payment');
    expect(inserts[1].amount).toBe(450);
  });

  it('says plainly which half happened if the replacement fails', async () => {
    const f = fakeDb([{ id: 'P-1', amount: 500 }]);
    let inserts = 0;
    const target = f.db as unknown as { from: (t: string) => Record<string, unknown> };
    const realFrom = target.from.bind(f.db);
    target.from = (table: string) => {
      const b = realFrom(table);
      const insert = b.insert as (p: unknown) => unknown;
      b.insert = (payload: unknown) => {
        inserts += 1;
        if (inserts === 2) throw new Error('network died');
        return insert(payload);
      };
      return b;
    };
    await expect(
      createPaymentDomain({ db: f.db, context: ctx }).correct(
        'P-1',
        {
          invoiceNumber: '', customerName: 'x', customerId: '', amount: 450, method: 'Cash',
          methodDetail: '', status: 'Recorded', notes: '', currency: 'USD',
          referenceNumber: '', paymentDate: '',
        },
        'wrong amount',
      ),
    ).rejects.toThrow(/was reversed, but the corrected entry could not be saved/);
  });

  it('a failed audit write is loud, not swallowed', async () => {
    // An unaudited financial write is the state this milestone exists to end.
    const f = fakeDb([{ id: 'P-1' }]);
    f.failAudit();
    await expect(
      createPaymentDomain({ db: f.db, context: ctx }).create({
        invoiceNumber: '', customerName: '', customerId: '', amount: 1, method: 'Cash',
        methodDetail: '', status: 'Recorded', notes: '', currency: 'USD',
        referenceNumber: '', paymentDate: '',
      }),
    ).rejects.toThrow(AuditWriteError);
  });

  it('sends the actor type through so API and AI writes are distinguishable', async () => {
    const aiCtx = createDomainContext({
      shopId: 'shop-A', actor: { type: 'ai', userId: null, role: null },
    });
    const { db, rpcCalls } = fakeDb([{ id: 'C-1', name: 'A' }]);
    await createCustomerDomain({ db, context: aiCtx }).create({
      name: 'A', type: '', phone: '', email: '', address: '', tags: [], followUp: '',
    });
    expect(rpcCalls[0].args.p_actor_type).toBe('ai');
  });
});

describe('audit snapshots do not carry secrets', () => {
  it('redacts anything that looks like a credential', () => {
    const out = redactSnapshot({
      name: 'Ai Peng', api_key: 'sk-live-123', authToken: 'x', password: 'y', p256dh: 'z',
    });
    expect(out).toMatchObject({ name: 'Ai Peng' });
    for (const k of ['api_key', 'authToken', 'password', 'p256dh']) {
      expect(out?.[k]).toBe('[redacted]');
    }
  });

  it('summarises oversized values rather than storing them', () => {
    const out = redactSnapshot({ notes: 'x'.repeat(5000) });
    expect(String(out?.notes)).toMatch(/chars omitted/);
  });

  it('keeps invoice line arrays, which are the point of the record', () => {
    const lines = [{ description: 'Brake pads', qty: 1, rate: 40 }];
    expect(redactSnapshot({ lines })?.lines).toEqual(lines);
  });

  it('returns null rather than an empty object', () => {
    // `{}` reads as "nothing changed"; null reads as "nothing kept".
    expect(redactSnapshot({})).toBeNull();
    expect(redactSnapshot(null)).toBeNull();
  });
});

describe('the audit writer', () => {
  it('never lets the caller name the actor', async () => {
    // The database stamps auth.uid(). If an actor id were an argument, an
    // audit trail could be written in somebody else's name.
    const { db, rpcCalls } = fakeDb();
    await writeAuditEvent(db, ctx, { action: 'test.ran', entityType: 'test', entityId: 'T-1' });
    expect(Object.keys(rpcCalls[0].args)).not.toContain('p_actor_user_id');
  });
});

describe('ledger arithmetic', () => {
  const entry = (over: Partial<DomainPaymentLike>): DomainPaymentLike => ({
    id: 'P', amount: 0, entryType: 'payment', reversesPaymentId: null, ...over,
  });

  it('nets reversals without subtracting them twice', () => {
    // Reversals are ALREADY negative. Subtracting them again is the arithmetic
    // mistake this shape invites, and netAmount exists so no caller has to
    // remember.
    const entries = [
      entry({ id: 'P-1', amount: 500 }),
      entry({ id: 'R-1', amount: -500, entryType: 'reversal', reversesPaymentId: 'P-1' }),
      entry({ id: 'P-2', amount: 450 }),
    ];
    expect(netAmount(entries as never)).toBe(450);
  });

  it('leaves an unreversed ledger alone', () => {
    expect(netAmount([entry({ amount: 100 }), entry({ amount: 250 })] as never)).toBe(350);
  });

  it('lists the entries still standing', () => {
    const entries = [
      entry({ id: 'P-1', amount: 500 }),
      entry({ id: 'R-1', amount: -500, entryType: 'reversal', reversesPaymentId: 'P-1' }),
      entry({ id: 'P-2', amount: 450 }),
    ];
    expect(liveEntries(entries as never).map(e => e.id)).toEqual(['P-2']);
  });

  it('is empty, not negative, when everything is reversed', () => {
    const entries = [
      entry({ id: 'P-1', amount: 500 }),
      entry({ id: 'R-1', amount: -500, entryType: 'reversal', reversesPaymentId: 'P-1' }),
    ];
    expect(netAmount(entries as never)).toBe(0);
    expect(liveEntries(entries as never)).toEqual([]);
  });
});

interface DomainPaymentLike {
  id: string;
  amount: number;
  entryType: 'payment' | 'reversal';
  reversesPaymentId: string | null;
}
