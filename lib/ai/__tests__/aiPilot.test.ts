import {
  prepareForTranslation, cleanTranslation, translationDirection, hasLao,
  translationSystemPrompt, MAX_TRANSLATE_CHARS,
} from '../translation';
import {
  budgetState, costToRecord, estimateCostUsd, monthStartUtc, monthlyBudgetUsd,
  readMonthUsage, DEFAULT_MONTHLY_BUDGET_USD,
} from '../budget';
import { parseXaiResponse, USD_TICKS, DEFAULT_XAI_MODEL } from '../text/xaiProvider';
import { getTextProvider } from '../text/providerFactory';

describe('prepareForTranslation (what may be sent to the provider)', () => {
  it('passes part and service text through, trimmed', () => {
    expect(prepareForTranslation('  Brake pads  ')).toEqual({ ok: true, text: 'Brake pads' });
    expect(prepareForTranslation('Replace MAF sensor')).toEqual({ ok: true, text: 'Replace MAF sensor' });
    expect(prepareForTranslation('Oil 5W-30 4L')).toEqual({ ok: true, text: 'Oil 5W-30 4L' });
  });

  it('strips a VIN and refuses contact details', () => {
    expect(prepareForTranslation('Brake pads MR0FZ29G601234567')).toEqual({ ok: true, text: 'Brake pads' });
    expect(prepareForTranslation('Call 020 5555 1234 when ready')).toEqual({ ok: false, reason: 'contact_details' });
    expect(prepareForTranslation('send to somchai@example.com')).toEqual({ ok: false, reason: 'contact_details' });
  });

  it('refuses empty, non-text and over-long input', () => {
    expect(prepareForTranslation('   ')).toEqual({ ok: false, reason: 'empty' });
    expect(prepareForTranslation(42)).toEqual({ ok: false, reason: 'empty' });
    expect(prepareForTranslation('x'.repeat(MAX_TRANSLATE_CHARS + 1))).toEqual({ ok: false, reason: 'too_long' });
  });
});

describe('translation wording', () => {
  it('detects Lao script', () => {
    expect(hasLao('ຜ້າເບກ')).toBe(true);
    expect(hasLao('Brake pads')).toBe(false);
  });

  it('cleans a model reply to one bare line', () => {
    expect(cleanTranslation('"ຜ້າເບກ"\n\nNote: common term')).toBe('ຜ້າເບກ');
    expect(cleanTranslation('Translation: Brake pads')).toBe('Brake pads');
    expect(cleanTranslation('  \n  ')).toBe('');
  });

  it('asks for the target language and to keep part numbers', () => {
    expect(translationSystemPrompt('lo')).toContain('Lao');
    expect(translationSystemPrompt('en')).toContain('into English');
    expect(translationSystemPrompt('lo')).toContain('part numbers');
  });

  it('translates whichever side has text', () => {
    expect(translationDirection('Brake pads', '')).toEqual({ from: 'Brake pads', to: 'lo' });
    expect(translationDirection('Brake pads', 'old')).toEqual({ from: 'Brake pads', to: 'lo' });
    expect(translationDirection('', 'ຜ້າເບກ')).toEqual({ from: 'ຜ້າເບກ', to: 'en' });
    expect(translationDirection('ຜ້າເບກ', '')).toEqual({ from: 'ຜ້າເບກ', to: 'en' });
    expect(translationDirection(' ', ' ')).toBeNull();
  });
});

describe('budget', () => {
  it('defaults the cap to $20 and accepts an override', () => {
    expect(DEFAULT_MONTHLY_BUDGET_USD).toBe(20);
    expect(monthlyBudgetUsd({} as NodeJS.ProcessEnv)).toBe(20);
    expect(monthlyBudgetUsd({ AI_MONTHLY_BUDGET_USD: '5' } as unknown as NodeJS.ProcessEnv)).toBe(5);
    expect(monthlyBudgetUsd({ AI_MONTHLY_BUDGET_USD: 'abc' } as unknown as NodeJS.ProcessEnv)).toBe(20);
  });

  it('stops at the cap', () => {
    expect(budgetState(19.99, 20)).toMatchObject({ allowed: true, remainingUsd: expect.closeTo(0.01, 5) });
    expect(budgetState(20, 20)).toMatchObject({ allowed: false, remainingUsd: 0, percentUsed: 100 });
    expect(budgetState(25, 20).percentUsed).toBe(100);
    expect(budgetState(5, 20).percentUsed).toBe(25);
  });

  it('prefers the provider-reported cost, else estimates from tokens', () => {
    const price = { input: 1.25, output: 2.5 };
    expect(estimateCostUsd(1_000_000, 0, price)).toBe(1.25);
    expect(costToRecord(0.0002, 100, 20, price)).toBe(0.0002);
    expect(costToRecord(null, 100, 20, price)).toBeCloseTo((100 * 1.25 + 20 * 2.5) / 1e6, 12);
  });

  it('counts the month from the first day, UTC', () => {
    expect(monthStartUtc(new Date('2026-11-27T22:00:00Z'))).toBe('2026-11-01T00:00:00.000Z');
  });

  it('sums this month from ai_usage_events and throws on a read error', async () => {
    const rows = [{ cost_usd: '0.0005' }, { cost_usd: 0.001 }, { cost_usd: null }];
    const okDb = { from: () => ({ select: () => ({ gte: async () => ({ data: rows, error: null }) }) }) };
    await expect(readMonthUsage(okDb)).resolves.toEqual({ spentUsd: 0.0015, requests: 3 });

    const badDb = { from: () => ({ select: () => ({ gte: async () => ({ data: null, error: { message: 'no table' } }) }) }) };
    await expect(readMonthUsage(badDb)).rejects.toThrow('no table');
  });
});

describe('xAI adapter', () => {
  it('reads text, tokens and the exact cost from a Responses API body', () => {
    const parsed = parseXaiResponse({
      output: [{ type: 'message', content: [{ type: 'output_text', text: 'ຜ້າເບກ' }] }],
      usage: { input_tokens: 90, output_tokens: 6, cost_in_usd_ticks: 1_500_000 },
    });
    expect(parsed).toEqual({ text: 'ຜ້າເບກ', inputTokens: 90, outputTokens: 6, reportedCostUsd: 1_500_000 / USD_TICKS });
  });

  it('has no cost when xAI reports none, and nothing for an empty reply', () => {
    expect(parseXaiResponse({ output_text: 'Brake pads', usage: { input_tokens: 5, output_tokens: 2 } })?.reportedCostUsd).toBeNull();
    expect(parseXaiResponse({ output: [] })).toBeNull();
    expect(parseXaiResponse(null)).toBeNull();
  });
});

describe('provider factory', () => {
  const env = (e: Record<string, string>) => e as unknown as NodeJS.ProcessEnv;

  it('is off without a key', () => {
    expect(getTextProvider(env({}))).toBeNull();
    expect(getTextProvider(env({ AI_TEXT_PROVIDER: 'xai' }))).toBeNull();
  });

  it('uses Grok when the key is set, unless switched off', () => {
    const p = getTextProvider(env({ XAI_API_KEY: 'test-key' }));
    expect(p?.id).toBe('xai');
    expect(p?.model).toBe(DEFAULT_XAI_MODEL);
    expect(getTextProvider(env({ XAI_API_KEY: 'test-key', XAI_MODEL: 'grok-x' }))?.model).toBe('grok-x');
    expect(getTextProvider(env({ XAI_API_KEY: 'test-key', AI_TEXT_PROVIDER: 'off' }))).toBeNull();
    expect(getTextProvider(env({ XAI_API_KEY: 'test-key', AI_TEXT_PROVIDER: 'unknown' }))).toBeNull();
  });
});
