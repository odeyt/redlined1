import { NextRequest, NextResponse } from 'next/server';

const SHOP_A = '11111111-1111-4111-8111-111111111111';
const SHOP_B = '22222222-2222-4222-8222-222222222222';
const JOB_1 = '33333333-3333-4333-8333-333333333333';

const mockRequireShopRole = jest.fn();
jest.mock('@/lib/serverAuth', () => ({
  requireShopRole: (...args: unknown[]) => mockRequireShopRole(...args),
}));

type ChainResult = { data?: unknown; error?: unknown };
function makeChain(result: ChainResult) {
  const chain: Record<string, unknown> = {
    select: () => chain,
    eq: () => chain,
    update: () => chain,
    maybeSingle: () => Promise.resolve(result),
    then: (resolve: (v: unknown) => unknown) => resolve(result),
  };
  return chain;
}

let jobCardResult: ChainResult;
let shopResult: ChainResult;
let settingsResult: ChainResult;

const mockFrom = jest.fn((table: string) => {
  if (table === 'job_cards') return makeChain(jobCardResult);
  if (table === 'shops') return makeChain(shopResult);
  if (table === 'shop_settings') return makeChain(settingsResult);
  return makeChain({ data: null, error: null });
});

jest.mock('@/lib/supabase-server', () => ({
  createServerSupabase: () => ({ from: mockFrom }),
}));

import { PUT, POST, GET } from '../route';

function makeReq(method: string, body?: unknown, token = 'tok', url = 'http://localhost/api/job-status'): NextRequest {
  return new NextRequest(url, {
    method,
    headers: token ? { authorization: `Bearer ${token}`, 'content-type': 'application/json' } : { 'content-type': 'application/json' },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

function forbidden() {
  return { ok: false as const, response: NextResponse.json({ error: 'Not a member of this shop' }, { status: 403 }) };
}
function unauthorized() {
  return { ok: false as const, response: NextResponse.json({ error: 'Missing bearer token' }, { status: 401 }) };
}

beforeEach(() => {
  mockRequireShopRole.mockReset();
  jobCardResult = { data: { id: JOB_1, status_token: null, repair_stage: 'checked_in', stage_history: [] }, error: null };
  shopResult = { data: { name: 'Test Shop' }, error: null };
  settingsResult = { data: { phone: '555-1234' }, error: null };
});

describe('PUT /api/job-status (generate tracking token — requires shop staff auth)', () => {
  it('returns 400 for a non-UUID jobId, without checking authorization', async () => {
    const res = await PUT(makeReq('PUT', { jobId: 'not-a-uuid', shopId: SHOP_A }));
    expect(res.status).toBe(400);
    expect(mockRequireShopRole).not.toHaveBeenCalled();
  });

  it('rejects an unauthenticated caller with 401', async () => {
    mockRequireShopRole.mockResolvedValue(unauthorized());
    const res = await PUT(makeReq('PUT', { jobId: JOB_1, shopId: SHOP_A }));
    expect(res.status).toBe(401);
  });

  it('rejects a caller who is not a member of the target shop with 403 (cross-shop block)', async () => {
    mockRequireShopRole.mockResolvedValue(forbidden());
    const res = await PUT(makeReq('PUT', { jobId: JOB_1, shopId: SHOP_B }));
    expect(res.status).toBe(403);
  });

  it('authorizes against only the explicit body shopId', async () => {
    mockRequireShopRole.mockResolvedValue(forbidden());
    await PUT(makeReq('PUT', { jobId: JOB_1, shopId: SHOP_B }));
    expect(mockRequireShopRole).toHaveBeenCalledWith(expect.anything(), SHOP_B);
  });

  it('succeeds for an authorized shop member', async () => {
    mockRequireShopRole.mockResolvedValue({ ok: true, context: { userId: 'u1', role: 'technician' } });
    const res = await PUT(makeReq('PUT', { jobId: JOB_1, shopId: SHOP_A }));
    expect(res.status).toBe(200);
  });

  it('returns 404 for a job not found in this shop', async () => {
    mockRequireShopRole.mockResolvedValue({ ok: true, context: { userId: 'u1', role: 'technician' } });
    jobCardResult = { data: null, error: null };
    const res = await PUT(makeReq('PUT', { jobId: JOB_1, shopId: SHOP_A }));
    expect(res.status).toBe(404);
  });
});

describe('POST /api/job-status (advance repair stage — requires shop staff auth)', () => {
  it('rejects an unauthorized caller with 403 before touching job_cards', async () => {
    mockRequireShopRole.mockResolvedValue(forbidden());
    const res = await POST(makeReq('POST', { jobId: JOB_1, shopId: SHOP_A, stage: 'ready' }));
    expect(res.status).toBe(403);
  });

  it('succeeds for an authorized shop member advancing a valid stage', async () => {
    mockRequireShopRole.mockResolvedValue({ ok: true, context: { userId: 'u1', role: 'advisor' } });
    const res = await POST(makeReq('POST', { jobId: JOB_1, shopId: SHOP_A, stage: 'ready' }));
    expect(res.status).toBe(200);
  });

  it('rejects an invalid stage value with 400, before checking authorization', async () => {
    const res = await POST(makeReq('POST', { jobId: JOB_1, shopId: SHOP_A, stage: 'not_a_real_stage' }));
    expect(res.status).toBe(400);
    expect(mockRequireShopRole).not.toHaveBeenCalled();
  });
});

describe('GET /api/job-status (intentionally public — token-gated, not shop-auth-gated)', () => {
  it('does not call requireShopRole at all', async () => {
    jobCardResult = {
      data: {
        id: JOB_1, customer: 'Jane', vehicle: 'Civic', service_type: 'oil change',
        repair_stage: 'ready', stage_history: [], shop_id: SHOP_A, check_in_date: '2026-07-01',
      },
      error: null,
    };
    const res = await GET(makeReq('GET', undefined, '', 'http://localhost/api/job-status?token=abc123'));
    expect(res.status).toBe(200);
    expect(mockRequireShopRole).not.toHaveBeenCalled();
  });

  it('returns 400 when no token is supplied', async () => {
    const res = await GET(makeReq('GET', undefined, '', 'http://localhost/api/job-status'));
    expect(res.status).toBe(400);
  });

  it('returns 404 for an unknown/guessed token, not job data', async () => {
    jobCardResult = { data: null, error: null };
    const res = await GET(makeReq('GET', undefined, '', 'http://localhost/api/job-status?token=AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA'));
    expect(res.status).toBe(404);
  });
});
