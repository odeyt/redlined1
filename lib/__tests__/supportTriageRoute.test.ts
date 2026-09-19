/**
 * POST /api/admin/support/triage — the platform owner's only way to mark a ticket.
 * Proves who may call it, what it accepts, what it writes (one attributed row in the
 * marker table, nothing else), and that it degrades cleanly before the migration.
 *
 * The database is a recording stub; identities and ids are synthetic.
 */
import { NextRequest } from 'next/server';

const verify = jest.fn();
jest.mock('@/lib/adminAuth', () => {
  const { NextResponse } = jest.requireActual('next/server');
  return {
    verifyPlatformOwner: (...a: unknown[]) => verify(...a),
    forbidden: (reason: string) => NextResponse.json({ error: 'Forbidden', detail: reason }, { status: 403 }),
  };
});
jest.mock('@/lib/apiHelpers', () => ({ sanitizeError: () => 'Something went wrong' }));

interface Call { table: string; op: string; args: unknown[] }
const calls: Call[] = [];
const stub = {
  tickets: [{ id: 'a0000001-0000-4000-8000-000000000001' }] as Array<{ id: string }>,
  events: [] as Array<{ ticket_id: string; triage: string }>,
  ticketError: null as null | { code: string },
  eventsReadError: null as null | { code: string },
  insertError: null as null | { code: string },
};

function builder(table: string) {
  let filterId: string | null = null;
  const q = {
    select: (...args: unknown[]) => { calls.push({ table, op: 'select', args }); return q; },
    eq: (col: string, val: string) => { calls.push({ table, op: 'eq', args: [col, val] }); filterId = val; return q; },
    order: (...args: unknown[]) => { calls.push({ table, op: 'order', args }); return q; },
    limit: (...args: unknown[]) => { calls.push({ table, op: 'limit', args }); return q; },
    maybeSingle: async () => {
      if (table === 'support_tickets') {
        return stub.ticketError ? { data: null, error: stub.ticketError } : { data: stub.tickets.find(t => t.id === filterId) ?? null, error: null };
      }
      return { data: null, error: null };
    },
    insert: async (row: unknown) => { calls.push({ table, op: 'insert', args: [row] }); return { error: stub.insertError }; },
    update: () => { throw new Error('the triage route must never update anything'); },
    delete: () => { throw new Error('the triage route must never delete anything'); },
    upsert: () => { throw new Error('the triage route must never upsert anything'); },
    then: (resolve: (v: unknown) => unknown) => {
      // awaiting a select chain on the events table (the "latest marking" read)
      if (table === 'support_ticket_triage_events') {
        const rows = stub.events.filter(e => e.ticket_id === filterId).slice().reverse().slice(0, 1);
        return Promise.resolve(stub.eventsReadError ? { data: null, error: stub.eventsReadError } : { data: rows, error: null }).then(resolve);
      }
      return Promise.resolve({ data: [], error: null }).then(resolve);
    },
  };
  return q;
}
jest.mock('@/lib/supabaseServer', () => ({ getAdminDb: () => ({ from: (t: string) => builder(t) }) }));

import { POST } from '@/app/api/admin/support/triage/route';

const TICKET = 'a0000001-0000-4000-8000-000000000001';
const OWNER = { authorized: true, email: 'owner@example-test.invalid', reason: 'OK' };
const SIGNED_OUT = { authorized: false, email: null, reason: 'Not authenticated' };
const SHOP_USER = { authorized: false, email: 'mechanic@example-test.invalid', reason: 'Not authorized as platform owner' };

const post = (body: unknown, headers: Record<string, string> = { 'content-type': 'application/json' }) =>
  POST(new NextRequest('http://localhost/api/admin/support/triage', {
    method: 'POST', headers, body: typeof body === 'string' ? body : JSON.stringify(body),
  }));

const inserts = () => calls.filter(c => c.op === 'insert');
const touchedTables = () => new Set(calls.map(c => c.table));

beforeEach(() => {
  verify.mockReset();
  calls.length = 0;
  stub.tickets = [{ id: TICKET }];
  stub.events = [];
  stub.ticketError = stub.eventsReadError = stub.insertError = null;
});

describe('who may mark a ticket', () => {
  it('refuses a signed-out caller with 401 and touches no data', async () => {
    verify.mockResolvedValue(SIGNED_OUT);
    const res = await post({ ticketId: TICKET, triage: 'spam' });
    expect(res.status).toBe(401);
    expect(calls).toEqual([]);
  });

  it('refuses an ordinary signed-in shop user with 403 and touches no data', async () => {
    verify.mockResolvedValue(SHOP_USER);
    const res = await post({ ticketId: TICKET, triage: 'spam' });
    expect(res.status).toBe(403);
    expect(calls).toEqual([]);
    expect(JSON.stringify(await res.json())).not.toContain('mechanic@example-test.invalid');
  });

  it('authorizes before it reads the body, so an anonymous caller learns nothing about validation', async () => {
    verify.mockResolvedValue(SIGNED_OUT);
    const res = await post('not json at all', { 'content-type': 'text/plain' });
    expect(res.status).toBe(401);
  });

  it('never trusts an identity supplied in the request', async () => {
    verify.mockResolvedValue(SHOP_USER);
    const res = await post({ ticketId: TICKET, triage: 'spam', set_by: 'owner@example-test.invalid', role: 'owner' });
    expect(res.status).toBe(403);
    expect(inserts()).toEqual([]);
  });
});

describe('what it accepts', () => {
  beforeEach(() => verify.mockResolvedValue(OWNER));

  it.each(['real', 'test', 'spam', 'unreviewed'])('accepts %s', async value => {
    if (value === 'unreviewed') stub.events = [{ ticket_id: TICKET, triage: 'spam' }];
    const res = await post({ ticketId: TICKET, triage: value });
    expect(res.status).toBe(200);
  });

  it.each([
    ['an unknown value', { ticketId: TICKET, triage: 'probably-spam' }],
    ['a missing value', { ticketId: TICKET }],
    ['a missing ticket', { triage: 'spam' }],
    ['a malformed ticket id', { ticketId: 'not-a-uuid', triage: 'spam' }],
    ['a SQL-looking ticket id', { ticketId: `${TICKET}' OR 1=1 --`, triage: 'spam' }],
    ['extra fields', { ticketId: TICKET, triage: 'spam', status: 'closed' }],
    ['a non-string value', { ticketId: TICKET, triage: 7 }],
    ['an array body', [TICKET, 'spam']],
  ])('rejects %s with 400 and writes nothing', async (_name, body) => {
    const res = await post(body);
    expect(res.status).toBe(400);
    expect(inserts()).toEqual([]);
    expect(calls).toEqual([]); // rejected before any database access
  });

  it('rejects malformed JSON with 400', async () => {
    expect((await post('{nope')).status).toBe(400);
  });

  it('requires a JSON content type, which a cross-site HTML form cannot send', async () => {
    for (const type of ['application/x-www-form-urlencoded', 'text/plain', 'multipart/form-data']) {
      const res = await post({ ticketId: TICKET, triage: 'spam' }, { 'content-type': type });
      expect(res.status).toBe(415);
    }
    expect(calls).toEqual([]);
  });

  it('does not echo the rejected input back', async () => {
    const res = await post({ ticketId: '<script>alert(1)</script>', triage: 'spam' });
    expect(JSON.stringify(await res.json())).not.toContain('script');
  });
});

describe('what it writes', () => {
  beforeEach(() => verify.mockResolvedValue(OWNER));

  it('appends exactly one marker row, attributed to the signed-in owner, and nothing else', async () => {
    const res = await post({ ticketId: TICKET, triage: 'spam' });
    expect(await res.json()).toEqual({ ok: true, ticketId: TICKET, triage: 'spam', changed: true });
    expect(inserts()).toEqual([{ table: 'support_ticket_triage_events', op: 'insert', args: [{ ticket_id: TICKET, triage: 'spam', set_by: 'owner@example-test.invalid' }] }]);
  });

  it('only ever reads support_tickets and never writes to it or to the messages', async () => {
    await post({ ticketId: TICKET, triage: 'test' });
    expect([...touchedTables()].sort()).toEqual(['support_ticket_triage_events', 'support_tickets']);
    expect(calls.filter(c => c.table === 'support_tickets' && c.op !== 'select' && c.op !== 'eq')).toEqual([]);
    expect(calls.some(c => c.table === 'support_messages')).toBe(false);
  });

  it('records the actor from the server session, not from anything the caller sent', async () => {
    await post({ ticketId: TICKET, triage: 'real' });
    expect((inserts()[0].args[0] as { set_by: string }).set_by).toBe('owner@example-test.invalid');
  });

  it('returns 404 for a ticket that does not exist and writes nothing', async () => {
    const res = await post({ ticketId: 'a0000009-0000-4000-8000-000000000009', triage: 'spam' });
    expect(res.status).toBe(404);
    expect(inserts()).toEqual([]);
  });

  it('does not add an audit row when the ticket already has that marking', async () => {
    stub.events = [{ ticket_id: TICKET, triage: 'spam' }];
    const res = await post({ ticketId: TICKET, triage: 'spam' });
    expect(await res.json()).toEqual({ ok: true, ticketId: TICKET, triage: 'spam', changed: false });
    expect(inserts()).toEqual([]);
  });

  it('treats a ticket with no marking as already "unreviewed"', async () => {
    const res = await post({ ticketId: TICKET, triage: 'unreviewed' });
    expect((await res.json()).changed).toBe(false);
    expect(inserts()).toEqual([]);
  });

  it('clearing a marking is a new row, not an edit', async () => {
    stub.events = [{ ticket_id: TICKET, triage: 'spam' }];
    await post({ ticketId: TICKET, triage: 'unreviewed' });
    expect(inserts()).toHaveLength(1);
    expect((inserts()[0].args[0] as { triage: string }).triage).toBe('unreviewed');
  });

  it('reads the newest marking to decide, so the current value is what the last row says', async () => {
    stub.events = [{ ticket_id: TICKET, triage: 'spam' }, { ticket_id: TICKET, triage: 'real' }]; // newest last
    const res = await post({ ticketId: TICKET, triage: 'real' });
    expect((await res.json()).changed).toBe(false);
  });
});

describe('when the marker table does not exist yet (migration not applied)', () => {
  beforeEach(() => verify.mockResolvedValue(OWNER));

  it.each(['PGRST205', '42P01'])('returns 503 "not available" for %s and writes nothing', async code => {
    stub.eventsReadError = { code };
    const res = await post({ ticketId: TICKET, triage: 'spam' });
    expect(res.status).toBe(503);
    expect((await res.json()).error).toMatch(/not available yet/);
    expect(inserts()).toEqual([]);
  });

  it('any other database error is a generic 500 that leaks nothing', async () => {
    stub.eventsReadError = { code: 'XX000' };
    const res = await post({ ticketId: TICKET, triage: 'spam' });
    expect(res.status).toBe(500);
    expect(JSON.stringify(await res.json())).not.toMatch(/XX000|support_ticket/);
  });

  it('a failed write is a generic 500 and does not report success', async () => {
    stub.insertError = { code: '23514' };
    const res = await post({ ticketId: TICKET, triage: 'spam' });
    expect(res.status).toBe(500);
    expect((await res.json()).ok).toBeUndefined();
  });

  it('a failed ticket lookup is a generic 500', async () => {
    stub.ticketError = { code: 'XX000' };
    expect((await post({ ticketId: TICKET, triage: 'spam' })).status).toBe(500);
    expect(inserts()).toEqual([]);
  });
});
