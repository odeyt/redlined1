import { translateLineTexts } from '../translateLine';

const fetchMock = jest.fn();
beforeEach(() => {
  fetchMock.mockReset();
  (global as unknown as { fetch: typeof fetch }).fetch = fetchMock as unknown as typeof fetch;
});

const json = (body: unknown, ok = true) => Promise.resolve({ ok, json: () => Promise.resolve(body) });
const urls = () => fetchMock.mock.calls.map(c => String(c[0]));

describe('🌐 button with the flag OFF (every shop today)', () => {
  it('works exactly as before: English → Lao via MyMemory, never the AI route', async () => {
    fetchMock.mockReturnValueOnce(json({ responseData: { translatedText: 'ຜ້າເບກ' } }));
    expect(await translateLineTexts({ description: 'Brake pads', laoDescription: '' }, false)).toEqual({ laoDescription: 'ຜ້າເບກ' });
    expect(urls()).toEqual([expect.stringContaining('api.mymemory.translated.net')]);
    expect(urls()[0]).toContain('langpair=en|lo');
  });

  it('does nothing without an English description, as before', async () => {
    expect(await translateLineTexts({ description: '', laoDescription: 'ຜ້າເບກ' }, false)).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('🌐 button with the flag ON', () => {
  it('uses the AI route and does not call MyMemory when it answers', async () => {
    fetchMock.mockReturnValueOnce(json({ text: 'ຜ້າເບກ', source: 'ai' }));
    expect(await translateLineTexts({ description: 'Brake pads', laoDescription: '' }, true)).toEqual({ laoDescription: 'ຜ້າເບກ' });
    expect(urls()).toEqual(['/api/ai/translate']);
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ text: 'Brake pads', to: 'lo' });
  });

  it('translates Lao → English when only the Lao box is filled', async () => {
    fetchMock.mockReturnValueOnce(json({ text: 'Brake pads', source: 'ai' }));
    expect(await translateLineTexts({ description: '', laoDescription: 'ຜ້າເບກ' }, true)).toEqual({ description: 'Brake pads' });
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ text: 'ຜ້າເບກ', to: 'en' });
  });

  it('falls back to MyMemory when the AI gives nothing (over budget, provider down)', async () => {
    fetchMock
      .mockReturnValueOnce(json({ text: null, reason: 'over_budget' }))
      .mockReturnValueOnce(json({ responseData: { translatedText: 'ຜ້າເບກ' } }));
    expect(await translateLineTexts({ description: 'Brake pads', laoDescription: '' }, true)).toEqual({ laoDescription: 'ຜ້າເບກ' });
    expect(urls()[1]).toContain('api.mymemory.translated.net');
  });
});
