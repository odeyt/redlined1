/**
 * The owner-only list of unresolved billing events: authorization, what it returns, and what it never returns.
 * The database is a stub that can only READ; identities and payload values are synthetic.
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
jest.mock('@/lib/apiHelpers', () => ({ sanitizeError: () => 'error' }));

interface Result { data: unknown; error: { message: string } | null }
let stubResult: Result = { data: [], error: null };
const getAdminDb = jest.fn();
const calls: Array<[string, unknown[]]> = [];
function chain(): Record<string, unknown> {
  const c: Record<string, unknown> = {};
  for (const m of ['select', 'eq', 'like', 'order', 'limit']) c[m] = (...a: unknown[]) => { calls.push([m, a]); return c; };
  c.then = (resolve: (r: Result) => unknown) => Promise.resolve(stubResult).then(resolve);
  return c;   // no insert / update / delete / upsert / rpc exist on this object
}
jest.mock('@/lib/supabaseServer', () => ({ getAdminDb: (...a: unknown[]) => { getAdminDb(...a); return { from: () => chain() }; } }));

import { GET } from '../../app/api/admin/billing-health/unresolved/route';
import { maskEventRef, UNRESOLVED_LIST_LIMIT } from '../billing/unresolvedEvents';

const req = () => new NextRequest('http://localhost/api/admin/billing-health/unresolved');
const OWNER = { authorized: true, email: 'owner@example-test.invalid', reason: 'OK' };
const SHOP_USER = { authorized: false, email: 'mechanic@example-test.invalid', reason: 'Not authorized as platform owner' };
const SIGNED_OUT = { authorized: false, email: null, reason: 'Not authenticated' };

const row = (n: number, o: Record<string, unknown> = {}) => ({
  id: `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`,
  event_type: 'subscription.paid',
  provider_event_id: `evt_secretive_${n}_ABCDEFGH`,
  created_at: `2026-09-${String(10 + (n % 15)).padStart(2, '0')}T00:00:00.000Z`,
  error: 'UNRESOLVED:no_shop_metadata',
  payload: {
    id: `evt_secretive_${n}_ABCDEFGH`, eventType: 'subscription.paid',
    object: { object: 'subscription', id: 'sub_secret_123', customer: { id: 'cus_secret_456', email: 'customer.person@example-test.invalid', name: 'Pat Customer' } },
  },
  ...o,
});

beforeEach(() => {
  verify.mockReset(); getAdminDb.mockClear(); calls.length = 0;
  stubResult = { data: [], error: null };
  jest.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => jest.restoreAllMocks());

describe('GET /api/admin/billing-health/unresolved: authorization', () => {
  it.each([['signed out', SIGNED_OUT], ['a shop user', SHOP_USER]])('%s is refused before any data is read', async (_n, identity) => {
    verify.mockResolvedValue(identity);
    const res = await GET(req());
    expect(res.status).toBe(403);
    expect(getAdminDb).not.toHaveBeenCalled();
    expect(JSON.stringify(await res.json())).not.toMatch(/events|evt_|UNRESOLVED/);
  });

  it('the platform owner gets the list', async () => {
    verify.mockResolvedValue(OWNER);
    stubResult = { data: [row(1)], error: null };
    const res = await GET(req());
    expect(res.status).toBe(200);
    expect((await res.json()).count).toBe(1);
  });
});

describe('what it returns', () => {
  beforeEach(() => verify.mockResolvedValue(OWNER));

  it('lists only unresolved events: ordinary failures and lookalikes are left out', async () => {
    stubResult = { data: [
      row(1),
      row(2, { error: 'shop_subscriptions insert failed: boom' }),
      row(3, { error: 'UNRESOLVED:made_up_reason' }),
      row(4, { error: 'UNRESOLVED:ambiguous_membership' }),
      row(5, { error: 'UNRESOLVED_SHOP:no_shop_metadata' }),   // the earlier prefix is not this list's business
    ], error: null };
    const body = await (await GET(req())).json();
    expect(body.events.map((e: { reason: string }) => e.reason)).toEqual(['no_shop_metadata', 'ambiguous_membership']);
    expect(body.count).toBe(2);
  });

  it('lists every kind of held event, not only shop-linking failures, each with its own explanation', async () => {
    const refund = { id: 'x', eventType: 'refund.created', object: { object: 'refund' } };
    stubResult = { data: [
      row(1, { error: 'UNRESOLVED:buyer_not_eligible' }),
      row(2, { error: 'UNRESOLVED:plan_missing' }),
      row(3, { error: 'UNRESOLVED:refund_or_dispute', event_type: 'refund.created', payload: refund }),
      row(4, { error: 'UNRESOLVED:unhandled_subscription_event', event_type: 'subscription.update' }),
      row(5, { error: 'UNRESOLVED:missing_event_id', provider_event_id: null }),
    ], error: null };
    const body = await (await GET(req())).json();
    expect(body.events.map((e: { reason: string }) => e.reason)).toEqual(['buyer_not_eligible', 'plan_missing', 'refund_or_dispute', 'unhandled_subscription_event', 'missing_event_id']);
    expect(body.events[2].classification).toBe('refund_or_dispute');
    expect(body.events[4].eventRef).toBe('(none)');
    expect(body.events.every((e: { reasonText: string }) => e.reasonText.length > 10)).toBe(true);
  });

  it('an event whose two metadata sources conflict reports no shop or user, rather than picking one', async () => {
    const conflicting = { id: 'x', eventType: 'checkout.completed', object: { metadata: { shop_id: 's-1', user_id: 'u-1' }, subscription: { metadata: { shop_id: 's-2', user_id: 'u-1' } } } };
    stubResult = { data: [row(1, { error: 'UNRESOLVED:conflicting_metadata', event_type: 'checkout.completed', payload: conflicting })], error: null };
    const [e] = (await (await GET(req())).json()).events;
    expect(e).toMatchObject({ reason: 'conflicting_metadata', carriesShopId: false, carriesUserId: false, classification: 'redlined_subscription' });
  });

  it('gives the owner what is needed to investigate: row id, type, time, reason, classification, masked reference, and what it carried', async () => {
    stubResult = { data: [row(7, { payload: { id: 'x', eventType: 'subscription.paid', object: { object: 'subscription', metadata: { user_id: 'u-1' } } } })], error: null };
    const [e] = (await (await GET(req())).json()).events;
    expect(e).toEqual({
      id: '00000000-0000-4000-8000-000000000007',
      eventType: 'subscription.paid',
      receivedAt: '2026-09-17T00:00:00.000Z',
      reason: 'no_shop_metadata',
      reasonText: expect.stringMatching(/no shop or user/i),
      classification: 'redlined_subscription',
      eventRef: 'evt_…EFGH',
      carriesShopId: false,
      carriesUserId: true,
    });
  });

  it('NEVER returns the payload, an email, a name, a customer or subscription id, or a full event id', async () => {
    stubResult = { data: [row(1), row(2)], error: null };
    const body = await (await GET(req())).json();
    const text = JSON.stringify(body);
    // The values: none of the secrets in the stored payload appears anywhere in the response.
    for (const secret of ['sub_secret_123', 'cus_secret_456', 'customer.person@', 'Pat Customer', 'evt_secretive_1_ABCDEFGH']) {
      expect(text).not.toContain(secret);
    }
    expect(text).not.toMatch(/@/);
    // The shape: each event has exactly these keys, so there is no payload, customer or metadata field to leak.
    for (const e of body.events) {
      expect(Object.keys(e).sort()).toEqual(['carriesShopId', 'carriesUserId', 'classification', 'eventRef', 'eventType', 'id', 'reason', 'reasonText', 'receivedAt']);
    }
  });

  it('says when more exist than are listed', async () => {
    stubResult = { data: Array.from({ length: UNRESOLVED_LIST_LIMIT + 3 }, (_v, i) => row(i + 1)), error: null };
    const body = await (await GET(req())).json();
    expect(body.events).toHaveLength(UNRESOLVED_LIST_LIMIT);
    expect(body.truncated).toBe(true);
    expect(body.limit).toBe(UNRESOLVED_LIST_LIMIT);
  });

  it('explains how to investigate, and does not pretend anything is applied automatically', async () => {
    stubResult = { data: [row(1)], error: null };
    const { howToInvestigate } = await (await GET(req())).json();
    expect(howToInvestigate.join(' ')).toMatch(/billing_events/);
    expect(howToInvestigate.join(' ')).toMatch(/Nothing is applied automatically/);
    // The no_shop_metadata runbook is documented, and it edits no stored payload.
    expect(howToInvestigate.join(' ')).toMatch(/no_shop_metadata[\s\S]*docs\/billing-webhook-idempotency\.md/);
    expect(howToInvestigate.join(' ')).not.toMatch(/edit the payload|update the payload/i);
  });
});

describe('it only reads', () => {
  it('uses select, eq, like, order and limit against billing_events, and nothing that writes', async () => {
    verify.mockResolvedValue(OWNER);
    await GET(req());
    expect(new Set(calls.map(c => c[0]))).toEqual(new Set(['select', 'eq', 'like', 'order', 'limit']));
    expect(calls.find(c => c[0] === 'eq')![1]).toEqual(['processed', false]);
  });

  it('a database failure answers 500 with no detail', async () => {
    verify.mockResolvedValue(OWNER);
    stubResult = { data: null, error: { message: 'relation "billing_events" does not exist' } };
    const res = await GET(req());
    expect(res.status).toBe(500);
    expect(JSON.stringify(await res.json())).not.toMatch(/relation|billing_events/);
  });
});

describe('maskEventRef', () => {
  it.each([['evt_abcdefghijkl', 'evt_…ijkl'], ['short', '…rt'], ['', '(none)'], [null, '(none)'], [undefined, '(none)']] as const)('%p -> %p', (input, out) => {
    expect(maskEventRef(input as string | null | undefined)).toBe(out);
  });
});
