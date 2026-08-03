import { NextRequest } from 'next/server';

process.env.ANTHROPIC_API_KEY = 'test-anthropic-key';

const SHOP_A = '11111111-1111-4111-8111-111111111111';
const USER_1 = '22222222-2222-4222-8222-222222222222';

type ChainResult = { data?: unknown; error?: unknown };
function makeChain(result: ChainResult) {
  const chain: Record<string, unknown> = {
    select: () => chain,
    eq: () => chain,
    gte: () => chain,
    lte: () => chain,
    limit: () => chain,
    insert: () => chain,
    maybeSingle: () => Promise.resolve(result),
    then: (resolve: (v: unknown) => unknown) => resolve(result),
  };
  return chain;
}

let membershipResult: ChainResult;
let usageRecordsResult: ChainResult;
const mockGetUser = jest.fn();
const mockInsert = jest.fn();

const mockFrom = jest.fn((table: string) => {
  if (table === 'shop_users') return makeChain(membershipResult);
  if (table === 'usage_records') {
    const chain = makeChain(usageRecordsResult) as Record<string, unknown>;
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
  return new NextRequest('http://localhost/api/support/assistant', {
    method: 'POST',
    headers: token ? { authorization: `Bearer ${token}`, 'content-type': 'application/json' } : { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  mockGetUser.mockReset();
  mockGetUser.mockResolvedValue({ data: { user: { id: USER_1 } } });
  mockInsert.mockReset();
  mockFetch.mockReset();
  mockFrom.mockClear();
  membershipResult = { data: { shop_id: SHOP_A }, error: null };
  usageRecordsResult = { data: [], error: null };
  mockFetch.mockResolvedValue({
    ok: true,
    json: () => Promise.resolve({
      content: [{ text: 'Click New Job Card, fill it in, and Save.' }],
      usage: { input_tokens: 12, output_tokens: 8 },
    }),
  });
});

describe('POST /api/support/assistant — usage metering', () => {
  it('records usage under its own key, not the /api/ai key', async () => {
    const res = await POST(makeReq({ question: 'How do I create a job card?' }));
    expect(res.status).toBe(200);
    expect(mockInsert).toHaveBeenCalledTimes(1);
    const inserted = mockInsert.mock.calls[0][0] as { usage_key: string; shop_id: string };
    expect(inserted.usage_key).toBe('support_ai_requests');
    expect(inserted.usage_key).not.toBe('ai_requests');
    expect(inserted.shop_id).toBe(SHOP_A);
  });

  it('checks its own daily threshold against support_ai_requests usage, not ai_requests', async () => {
    // 60 * 30 = 1800 is the route's own threshold — this exceeds it.
    usageRecordsResult = { data: [{ quantity: 2000 }], error: null };
    const res = await POST(makeReq({ question: 'How do I create a job card?' }));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.answer).toBeNull();
    expect(body.fallback).toMatch(/Message Support/);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('a heavy support conversation does not touch the ai_requests counter /api/ai reads', async () => {
    await POST(makeReq({ question: 'How do I create a job card?' }));
    const insertedKeys = mockInsert.mock.calls.map(c => (c[0] as { usage_key: string }).usage_key);
    expect(insertedKeys).not.toContain('ai_requests');
  });
});
