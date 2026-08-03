import { NextRequest } from 'next/server';

process.env.ANTHROPIC_API_KEY = 'test-anthropic-key';
process.env.AI_PROVIDER = 'anthropic';

const SHOP_A = '11111111-1111-4111-8111-111111111111';
const SHOP_B = '22222222-2222-4222-8222-222222222222';
const USER_1 = '33333333-3333-4333-8333-333333333333';

type ChainResult = { data?: unknown; error?: unknown };
function makeChain(result: ChainResult) {
  const chain: Record<string, unknown> = {
    select: () => chain,
    eq: () => chain,
    // The daily-quota check filters usage_records by created_at.
    gte: () => chain,
    limit: () => chain,
    insert: () => chain,
    maybeSingle: () => Promise.resolve(result),
    then: (resolve: (v: unknown) => unknown) => resolve(result),
  };
  return chain;
}

let membershipResult: ChainResult;
const mockGetUser = jest.fn();
const mockInsert = jest.fn();

const mockFrom = jest.fn((table: string) => {
  if (table === 'shop_users') return makeChain(membershipResult);
  // Usage is recorded in usage_records, not ai_usage_logs — the latter does
  // not exist in the database, which is why no AI limit was ever enforced.
  // This table serves two callers: the quota check reads it, the recorder
  // writes to it, so it must support both a select chain and an insert.
  if (table === 'usage_records') {
    const chain = makeChain({ data: [], error: null }) as Record<string, unknown>;
    chain.insert = (...args: unknown[]) => { mockInsert(...args); return Promise.resolve({ data: null, error: null }); };
    return chain;
  }
  return makeChain({ data: null, error: null });
});

jest.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    auth: { getUser: (...args: unknown[]) => mockGetUser(...args) },
    from: mockFrom,
  }),
}));

const mockFetch = jest.fn();
global.fetch = mockFetch as unknown as typeof fetch;

import { POST } from '../route';

function makeReq(body: unknown, token = 'tok'): NextRequest {
  return new NextRequest('http://localhost/api/ai', {
    method: 'POST',
    headers: token ? { authorization: `Bearer ${token}`, 'content-type': 'application/json' } : { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

const VALID_BODY = {
  type: 'dtc_explanation',
  context: { year: '2020', make: 'BMW', model: '328i', codes: ['P0171'] },
  shopId: SHOP_A,
};

beforeEach(() => {
  mockGetUser.mockReset();
  mockInsert.mockReset();
  mockFetch.mockReset();
  mockFrom.mockClear();
  membershipResult = { data: null, error: null };
  mockFetch.mockResolvedValue({
    ok: true,
    json: () => Promise.resolve({
      content: [{ text: '{"customerExplanation":"x","technicianNotes":"y","urgency":"soon","commonFixes":[],"disclaimer":"d"}' }],
      usage: { input_tokens: 10, output_tokens: 20 },
    }),
    text: () => Promise.resolve(''),
  });
});

describe('POST /api/ai', () => {
  it('returns 401 for a missing/invalid bearer token', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });
    const res = await POST(makeReq(VALID_BODY, ''));
    expect(res.status).toBe(401);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('does not log usage against a shopId the caller is not a member of (billing misattribution fix)', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: USER_1 } } });
    membershipResult = { data: null, error: null }; // caller has no shop_users row for SHOP_A
    const res = await POST(makeReq(VALID_BODY));
    expect(res.status).toBe(200);
    // logUsage runs un-awaited; give its microtask a tick to complete.
    await new Promise((r) => setTimeout(r, 0));
    expect(mockInsert).not.toHaveBeenCalled();
  });

  it('logs usage when the caller is a verified member of the claimed shopId', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: USER_1 } } });
    membershipResult = { data: { user_id: USER_1 }, error: null };
    const res = await POST(makeReq(VALID_BODY));
    expect(res.status).toBe(200);
    await new Promise((r) => setTimeout(r, 0));
    expect(mockInsert).toHaveBeenCalledTimes(1);
    // usage_records shape: the user id moved into metadata, since usage is
    // metered per shop and billed to the shop.
    expect(mockInsert).toHaveBeenCalledWith(expect.objectContaining({
      shop_id:   SHOP_A,
      usage_key: 'ai_requests',
      metadata:  expect.objectContaining({ user_id: USER_1 }),
    }));
  });

  it('never trusts a forged shopId into logging — membership is checked per-request, not cached', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: USER_1 } } });
    membershipResult = { data: null, error: null };
    await POST(makeReq({ ...VALID_BODY, shopId: SHOP_B }));
    await new Promise((r) => setTimeout(r, 0));
    expect(mockInsert).not.toHaveBeenCalled();
  });
});
