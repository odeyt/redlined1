import { NextRequest, NextResponse } from 'next/server';

const SHOP_A = '11111111-1111-4111-8111-111111111111';
const SHOP_B = '22222222-2222-4222-8222-222222222222';
const JOB_1 = '33333333-3333-4333-8333-333333333333';

const mockRequireShopRole = jest.fn();
jest.mock('@/lib/serverAuth', () => ({
  requireShopRole: (...args: unknown[]) => mockRequireShopRole(...args),
}));

type ChainResult = { data?: unknown; error?: unknown };

// job_cards is queried multiple times within a single POST (initial read,
// the CAS update, and sometimes a post-race recheck read) — each test
// queues the exact sequence of results it expects, in call order, so the
// mock can simulate a real race window instead of returning one fixed
// value for every call.
let jobCardsQueue: ChainResult[];
let shopResult: ChainResult;
let settingsResult: ChainResult;
let transitionInsertResult: { error?: unknown };
let insertedTransitions: Array<Record<string, unknown>>;

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

const mockFrom = jest.fn((table: string) => {
  if (table === 'job_cards') {
    const next = jobCardsQueue.shift() ?? { data: null, error: null };
    return makeChain(next);
  }
  if (table === 'shops') return makeChain(shopResult);
  if (table === 'shop_settings') return makeChain(settingsResult);
  if (table === 'job_status_transitions') {
    return {
      insert: (payload: Record<string, unknown>) => {
        insertedTransitions.push(payload);
        return Promise.resolve(transitionInsertResult);
      },
    };
  }
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
function authorized(role: string) {
  return { ok: true as const, context: { userId: 'u1', role } };
}

function emptyHistoryJob(stage: string) {
  return { data: { id: JOB_1, repair_stage: stage, stage_history: [] }, error: null };
}

beforeEach(() => {
  mockRequireShopRole.mockReset();
  mockFrom.mockClear();
  jobCardsQueue = [];
  shopResult = { data: { name: 'Test Shop' }, error: null };
  settingsResult = { data: { phone: '555-1234' }, error: null };
  transitionInsertResult = { error: null };
  insertedTransitions = [];
});

async function readJson(res: Response) {
  return res.json();
}

describe('PUT /api/job-status (generate tracking token — requires shop staff auth)', () => {
  it('returns a structured 400 for an empty jobId, without checking authorization', async () => {
    const res = await PUT(makeReq('PUT', { jobId: '', shopId: SHOP_A }));
    expect(res.status).toBe(400);
    const body = await readJson(res);
    expect(body).toMatchObject({ code: 'INVALID_REQUEST', retryable: false });
    expect(mockRequireShopRole).not.toHaveBeenCalled();
  });

  it('accepts a real job_cards.id shape (job_cards.id is text, not a UUID — e.g. "JC-<timestamp>")', async () => {
    mockRequireShopRole.mockResolvedValue(authorized('technician'));
    jobCardsQueue = [{ data: { id: 'JC-1737158234567', status_token: null, repair_stage: 'checked_in', stage_history: [] }, error: null }];
    const res = await PUT(makeReq('PUT', { jobId: 'JC-1737158234567', shopId: SHOP_A }));
    expect(res.status).toBe(200);
  });

  it('rejects an unauthenticated caller with structured 401', async () => {
    mockRequireShopRole.mockResolvedValue(unauthorized());
    const res = await PUT(makeReq('PUT', { jobId: JOB_1, shopId: SHOP_A }));
    expect(res.status).toBe(401);
    const body = await readJson(res);
    expect(body.code).toBe('UNAUTHENTICATED');
  });

  it('rejects a caller who is not a member of the target shop with structured NOT_MEMBER_OF_SHOP (cross-shop block)', async () => {
    mockRequireShopRole.mockResolvedValue(forbidden());
    const res = await PUT(makeReq('PUT', { jobId: JOB_1, shopId: SHOP_B }));
    expect(res.status).toBe(403);
    const body = await readJson(res);
    expect(body.code).toBe('NOT_MEMBER_OF_SHOP');
  });

  it('succeeds for an authorized shop member and generates a token', async () => {
    mockRequireShopRole.mockResolvedValue(authorized('technician'));
    jobCardsQueue = [
      { data: { id: JOB_1, status_token: null, repair_stage: 'checked_in', stage_history: [] }, error: null },
      { data: null, error: null }, // update result (no select chained on PUT)
    ];
    const res = await PUT(makeReq('PUT', { jobId: JOB_1, shopId: SHOP_A }));
    expect(res.status).toBe(200);
    const body = await readJson(res);
    expect(body.token).toBeTruthy();
  });

  it('returns a structured JOB_NOT_FOUND for a job not found in this shop', async () => {
    mockRequireShopRole.mockResolvedValue(authorized('technician'));
    jobCardsQueue = [{ data: null, error: null }];
    const res = await PUT(makeReq('PUT', { jobId: JOB_1, shopId: SHOP_A }));
    expect(res.status).toBe(404);
    const body = await readJson(res);
    expect(body.code).toBe('JOB_NOT_FOUND');
  });
});

describe('POST /api/job-status (advance repair stage — state machine, idempotency, shop validation)', () => {
  it('rejects an unauthorized caller with structured NOT_MEMBER_OF_SHOP before touching job_cards', async () => {
    mockRequireShopRole.mockResolvedValue(forbidden());
    const res = await POST(makeReq('POST', { jobId: JOB_1, shopId: SHOP_A, stage: 'ready' }));
    expect(res.status).toBe(403);
    const body = await readJson(res);
    expect(body.code).toBe('NOT_MEMBER_OF_SHOP');
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it('rejects an invalid stage value with structured INVALID_REQUEST, before checking authorization', async () => {
    const res = await POST(makeReq('POST', { jobId: JOB_1, shopId: SHOP_A, stage: 'not_a_real_stage' }));
    expect(res.status).toBe(400);
    const body = await readJson(res);
    expect(body.code).toBe('INVALID_REQUEST');
    expect(mockRequireShopRole).not.toHaveBeenCalled();
  });

  // ── State machine ────────────────────────────────────────────────────
  it('Waiting -> Diagnosing: checked_in -> inspecting succeeds (the one legal next step)', async () => {
    mockRequireShopRole.mockResolvedValue(authorized('advisor'));
    jobCardsQueue = [
      emptyHistoryJob('checked_in'),
      { data: { id: JOB_1, repair_stage: 'inspecting', stage_history: [{ stage: 'inspecting' }] }, error: null },
    ];
    const res = await POST(makeReq('POST', { jobId: JOB_1, shopId: SHOP_A, stage: 'inspecting' }));
    expect(res.status).toBe(200);
    const body = await readJson(res);
    expect(body).toMatchObject({ ok: true, stage: 'inspecting' });
    expect(insertedTransitions).toHaveLength(1);
    expect(insertedTransitions[0]).toMatchObject({
      job_id: JOB_1, shop_id: SHOP_A, user_id: 'u1', from_stage: 'checked_in', to_stage: 'inspecting',
    });
    expect(insertedTransitions[0].request_id).toBeTruthy();
  });

  it('Diagnosing -> Waiting (fail): inspecting -> checked_in is rejected as INVALID_JOB_TRANSITION (backward)', async () => {
    mockRequireShopRole.mockResolvedValue(authorized('advisor'));
    jobCardsQueue = [emptyHistoryJob('inspecting')];
    const res = await POST(makeReq('POST', { jobId: JOB_1, shopId: SHOP_A, stage: 'checked_in' }));
    expect(res.status).toBe(400);
    const body = await readJson(res);
    expect(body.code).toBe('INVALID_JOB_TRANSITION');
    expect(body.retryable).toBe(false);
    expect(insertedTransitions).toHaveLength(0);
  });

  it('Completed -> Repair (fail): ready -> in_repair is rejected as INVALID_JOB_TRANSITION (backward from terminal)', async () => {
    mockRequireShopRole.mockResolvedValue(authorized('advisor'));
    jobCardsQueue = [emptyHistoryJob('ready')];
    const res = await POST(makeReq('POST', { jobId: JOB_1, shopId: SHOP_A, stage: 'in_repair' }));
    expect(res.status).toBe(400);
    const body = await readJson(res);
    expect(body.code).toBe('INVALID_JOB_TRANSITION');
  });

  it('rejects a skip-ahead transition (checked_in -> waiting_parts, skipping inspecting) as INVALID_JOB_TRANSITION', async () => {
    mockRequireShopRole.mockResolvedValue(authorized('advisor'));
    jobCardsQueue = [emptyHistoryJob('checked_in')];
    const res = await POST(makeReq('POST', { jobId: JOB_1, shopId: SHOP_A, stage: 'waiting_parts' }));
    expect(res.status).toBe(400);
    const body = await readJson(res);
    expect(body.code).toBe('INVALID_JOB_TRANSITION');
  });

  // ── Idempotency ──────────────────────────────────────────────────────
  it('duplicate request: job already at the requested target stage returns success without a second transition', async () => {
    mockRequireShopRole.mockResolvedValue(authorized('advisor'));
    jobCardsQueue = [emptyHistoryJob('inspecting')]; // already at the "target"
    const res = await POST(makeReq('POST', { jobId: JOB_1, shopId: SHOP_A, stage: 'inspecting' }));
    expect(res.status).toBe(200);
    const body = await readJson(res);
    expect(body).toMatchObject({ ok: true, stage: 'inspecting' });
    // No DB write and no audit row for a no-op replay.
    expect(insertedTransitions).toHaveLength(0);
  });

  it('replay request: a concurrent identical request already won the CAS race — the loser still gets success, not an error', async () => {
    mockRequireShopRole.mockResolvedValue(authorized('advisor'));
    jobCardsQueue = [
      emptyHistoryJob('checked_in'),          // initial read: still at checked_in
      { data: null, error: null },             // CAS update: 0 rows — someone else already moved it
      { data: { repair_stage: 'inspecting', stage_history: [{ stage: 'inspecting' }] }, error: null }, // recheck: target was reached
    ];
    const res = await POST(makeReq('POST', { jobId: JOB_1, shopId: SHOP_A, stage: 'inspecting' }));
    expect(res.status).toBe(200);
    const body = await readJson(res);
    expect(body).toMatchObject({ ok: true, stage: 'inspecting' });
    expect(insertedTransitions).toHaveLength(0); // the winner's request recorded it, not this one
  });

  it('duplicate HTTP request never advances the job twice even under a genuine race', async () => {
    mockRequireShopRole.mockResolvedValue(authorized('advisor'));
    jobCardsQueue = [
      emptyHistoryJob('checked_in'),
      { data: null, error: null }, // lost the CAS race
      { data: { repair_stage: 'inspecting', stage_history: [{ stage: 'inspecting' }] }, error: null },
    ];
    const res = await POST(makeReq('POST', { jobId: JOB_1, shopId: SHOP_A, stage: 'inspecting' }));
    const body = await readJson(res);
    expect(body.ok).toBe(true);
    // Only ONE transition was ever recorded across this "duplicate" attempt.
    expect(insertedTransitions.length).toBeLessThanOrEqual(1);
  });

  // ── Conflict handling ────────────────────────────────────────────────
  it('conflict handling: CAS loses the race and the job landed somewhere unexpected — returns CONFLICT, retryable', async () => {
    mockRequireShopRole.mockResolvedValue(authorized('advisor'));
    jobCardsQueue = [
      emptyHistoryJob('checked_in'),
      { data: null, error: null }, // lost the race
      { data: { repair_stage: 'checked_in', stage_history: [] }, error: null }, // recheck shows neither target nor "after" target — genuine anomaly
    ];
    const res = await POST(makeReq('POST', { jobId: JOB_1, shopId: SHOP_A, stage: 'inspecting' }));
    expect(res.status).toBe(409);
    const body = await readJson(res);
    expect(body.code).toBe('CONFLICT');
    expect(body.retryable).toBe(true);
  });

  it('JOB_ALREADY_UPDATED: the job moved past the requested target while this request was in flight', async () => {
    mockRequireShopRole.mockResolvedValue(authorized('advisor'));
    jobCardsQueue = [
      emptyHistoryJob('checked_in'),
      { data: null, error: null },
      { data: { repair_stage: 'in_repair', stage_history: [] }, error: null }, // further along than the requested "inspecting"
    ];
    const res = await POST(makeReq('POST', { jobId: JOB_1, shopId: SHOP_A, stage: 'inspecting' }));
    expect(res.status).toBe(409);
    const body = await readJson(res);
    expect(body.code).toBe('JOB_ALREADY_UPDATED');
    expect(body.retryable).toBe(false);
  });

  // ── Shop validation / cross-shop ─────────────────────────────────────
  it('cross-shop request: a job that does not belong to the caller-authorized shop resolves as JOB_NOT_FOUND, not a distinct "forbidden"', async () => {
    mockRequireShopRole.mockResolvedValue(authorized('technician'));
    jobCardsQueue = [{ data: null, error: null }]; // shop-scoped lookup finds nothing for shop B's job under shop A's authorization
    const res = await POST(makeReq('POST', { jobId: JOB_1, shopId: SHOP_A, stage: 'inspecting' }));
    expect(res.status).toBe(404);
    const body = await readJson(res);
    expect(body.code).toBe('JOB_NOT_FOUND');
  });

  it('technician unauthorized: a technician who is not a member of the target shop is rejected before any job_cards read', async () => {
    mockRequireShopRole.mockResolvedValue(forbidden());
    const res = await POST(makeReq('POST', { jobId: JOB_1, shopId: SHOP_B, stage: 'inspecting' }));
    expect(res.status).toBe(403);
    const body = await readJson(res);
    expect(body.code).toBe('NOT_MEMBER_OF_SHOP');
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it('owner authorized: an owner who is a member of the shop can advance a job', async () => {
    mockRequireShopRole.mockResolvedValue(authorized('owner'));
    jobCardsQueue = [emptyHistoryJob('checked_in'), { data: { id: JOB_1, repair_stage: 'inspecting', stage_history: [] }, error: null }];
    const res = await POST(makeReq('POST', { jobId: JOB_1, shopId: SHOP_A, stage: 'inspecting' }));
    expect(res.status).toBe(200);
  });

  it('manager authorized: a manager who is a member of the shop can advance a job', async () => {
    mockRequireShopRole.mockResolvedValue(authorized('manager'));
    jobCardsQueue = [emptyHistoryJob('checked_in'), { data: { id: JOB_1, repair_stage: 'inspecting', stage_history: [] }, error: null }];
    const res = await POST(makeReq('POST', { jobId: JOB_1, shopId: SHOP_A, stage: 'inspecting' }));
    expect(res.status).toBe(200);
  });

  it('returns structured JOB_NOT_FOUND when the job genuinely does not exist', async () => {
    mockRequireShopRole.mockResolvedValue(authorized('advisor'));
    jobCardsQueue = [{ data: null, error: null }];
    const res = await POST(makeReq('POST', { jobId: JOB_1, shopId: SHOP_A, stage: 'inspecting' }));
    expect(res.status).toBe(404);
    const body = await readJson(res);
    expect(body.code).toBe('JOB_NOT_FOUND');
  });

  it('an audit-log insert failure never blocks or reverses an already-successful transition', async () => {
    mockRequireShopRole.mockResolvedValue(authorized('advisor'));
    jobCardsQueue = [emptyHistoryJob('checked_in'), { data: { id: JOB_1, repair_stage: 'inspecting', stage_history: [] }, error: null }];
    transitionInsertResult = { error: { message: 'relation "job_status_transitions" does not exist' } };
    const res = await POST(makeReq('POST', { jobId: JOB_1, shopId: SHOP_A, stage: 'inspecting' }));
    expect(res.status).toBe(200);
    const body = await readJson(res);
    expect(body.ok).toBe(true);
  });
});

describe('GET /api/job-status (intentionally public — token-gated, not shop-auth-gated)', () => {
  it('does not call requireShopRole at all', async () => {
    jobCardsQueue = [{
      data: {
        id: JOB_1, customer: 'Jane', vehicle: 'Civic', service_type: 'oil change',
        repair_stage: 'ready', stage_history: [], shop_id: SHOP_A, check_in_date: '2026-07-01',
      },
      error: null,
    }];
    const res = await GET(makeReq('GET', undefined, '', 'http://localhost/api/job-status?token=abc123'));
    expect(res.status).toBe(200);
    expect(mockRequireShopRole).not.toHaveBeenCalled();
  });

  it('returns structured INVALID_REQUEST when no token is supplied', async () => {
    const res = await GET(makeReq('GET', undefined, '', 'http://localhost/api/job-status'));
    expect(res.status).toBe(400);
    const body = await readJson(res);
    expect(body.code).toBe('INVALID_REQUEST');
  });

  it('returns structured JOB_NOT_FOUND for an unknown/guessed token, not job data', async () => {
    jobCardsQueue = [{ data: null, error: null }];
    const res = await GET(makeReq('GET', undefined, '', 'http://localhost/api/job-status?token=AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA'));
    expect(res.status).toBe(404);
    const body = await readJson(res);
    expect(body.code).toBe('JOB_NOT_FOUND');
  });
});
