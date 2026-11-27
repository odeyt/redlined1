import { NextRequest } from 'next/server';

const mockGate = jest.fn();
jest.mock('@/lib/ai/requestGate', () => ({ aiGate: (...a: unknown[]) => mockGate(...a) }));

const mockComplete = jest.fn();
let mockProvider: unknown = null;
jest.mock('@/lib/ai/text/providerFactory', () => ({ getTextProvider: () => mockProvider }));

let mockSpendRows: { cost_usd: number }[] | null = [];
const mockInsert = jest.fn(async () => ({ error: null }));
jest.mock('@/lib/supabaseServer', () => ({
  getAdminDb: () => ({
    from: () => ({
      select: () => ({
        gte: async () => (mockSpendRows === null
          ? { data: null, error: { message: 'relation does not exist' } }
          : { data: mockSpendRows, error: null }),
      }),
      insert: mockInsert,
    }),
  }),
}));

import { POST } from '../route';

const SHOP = '90b72748-bf01-4456-999f-f4ba48091606';

function req(body: unknown) {
  return new NextRequest('http://localhost/api/ai/translate', {
    method: 'POST', body: JSON.stringify(body), headers: { 'content-type': 'application/json' },
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  mockGate.mockResolvedValue({ ok: true, userId: 'u1', shopId: SHOP, role: 'manager' });
  mockProvider = { id: 'xai', model: 'grok-test', pricePerMTok: { input: 1.25, output: 2.5 }, complete: mockComplete };
  mockComplete.mockResolvedValue({
    text: '"ຜ້າເບກ"', provider: 'xai', model: 'grok-test', inputTokens: 80, outputTokens: 5, reportedCostUsd: 0.00011,
  });
  mockSpendRows = [];
});

describe('POST /api/ai/translate', () => {
  it('translates, cleans the reply and records the call with the reported cost', async () => {
    const res = await POST(req({ text: 'Brake pads', to: 'lo' }));
    expect(await res.json()).toEqual({ text: 'ຜ້າເບກ', source: 'ai', provider: 'xai', model: 'grok-test' });
    expect(mockComplete).toHaveBeenCalledWith(expect.objectContaining({ user: 'Brake pads', maxOutputTokens: 120 }));
    expect(mockInsert).toHaveBeenCalledWith(expect.objectContaining({
      shop_id: SHOP, user_id: 'u1', feature: 'translate_line', provider: 'xai',
      input_tokens: 80, output_tokens: 5, cost_usd: 0.00011, cost_reported: true,
    }));
  });

  it('returns no text when the gate says no (flag off, other tenant, signed out)', async () => {
    mockGate.mockResolvedValueOnce({ ok: false, status: 200, reason: 'flag_off' });
    expect(await (await POST(req({ text: 'Brake pads', to: 'lo' }))).json()).toMatchObject({ text: null, reason: 'flag_off' });

    mockGate.mockResolvedValueOnce({ ok: false, status: 403, reason: 'not_internal' });
    const other = await POST(req({ text: 'Brake pads', to: 'lo' }));
    expect(other.status).toBe(403);
    expect(mockComplete).not.toHaveBeenCalled();
  });

  it('never sends contact details to the provider', async () => {
    const res = await POST(req({ text: 'call 020 5555 1234', to: 'lo' }));
    expect(await res.json()).toMatchObject({ text: null, reason: 'contact_details' });
    expect(mockComplete).not.toHaveBeenCalled();
  });

  it('stops at the monthly cap', async () => {
    mockSpendRows = [{ cost_usd: 12 }, { cost_usd: 8 }];
    expect(await (await POST(req({ text: 'Brake pads', to: 'lo' }))).json()).toMatchObject({ text: null, reason: 'over_budget' });
    expect(mockComplete).not.toHaveBeenCalled();
  });

  it('fails closed when the spend cannot be read', async () => {
    mockSpendRows = null;
    expect(await (await POST(req({ text: 'Brake pads', to: 'lo' }))).json()).toMatchObject({ text: null, reason: 'budget_unavailable' });
    expect(mockComplete).not.toHaveBeenCalled();
  });

  it('falls back quietly without a provider or when it fails', async () => {
    mockProvider = null;
    expect(await (await POST(req({ text: 'Brake pads', to: 'lo' }))).json()).toMatchObject({ text: null, reason: 'no_provider' });

    mockProvider = { id: 'xai', model: 'grok-test', pricePerMTok: { input: 1, output: 1 }, complete: mockComplete };
    mockComplete.mockResolvedValueOnce(null);
    const res = await POST(req({ text: 'Brake pads', to: 'lo' }));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ text: null, reason: 'provider_failed' });
    expect(mockInsert).not.toHaveBeenCalled();
  });

  it('rejects an unknown target language', async () => {
    const res = await POST(req({ text: 'Brake pads', to: 'fr' }));
    expect(res.status).toBe(400);
  });
});
