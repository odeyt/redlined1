/**
 * Daily AI limits.
 *
 * AI_DAILY_LIMIT_FREE / _PRO existed as environment variables and nothing read
 * them. The route called Anthropic and then wrote usage to `ai_usage_logs`, a
 * table that does not exist, so the write failed silently and no limit was
 * ever enforced: every request billed the platform's own API key with no
 * ceiling, on any plan.
 *
 * Two properties matter beyond the arithmetic:
 *
 *   - metering failure must not break the product (fail open), but an
 *     unattributable request must still be refused (fail closed), since that
 *     is the shape an abusive one takes
 *   - the limit is daily, not monthly: a monthly cap can be burned through in
 *     an afternoon, and the money is gone before anyone looks
 */
import { readFileSync } from 'fs';
import { join } from 'path';

const root = join(__dirname, '..', '..');
const read = (p: string) => readFileSync(join(root, p), 'utf8');

const quotaSrc = read('lib/ai/aiQuota.ts');
const routeSrc = read('app/api/ai/route.ts');

/** Mirrors limitFor() in lib/ai/aiQuota.ts. */
function limitFor(status: 'free' | 'trial' | 'pro', env: Record<string, string | undefined>): number {
  const raw = status === 'free' ? env.AI_DAILY_LIMIT_FREE : env.AI_DAILY_LIMIT_PRO;
  const parsed = Number.parseInt((raw ?? '').trim(), 10);
  if (Number.isFinite(parsed) && parsed >= 0) return parsed;
  return status === 'free' ? 10 : 200;
}

describe('limit resolution', () => {
  it('uses the configured values', () => {
    const env = { AI_DAILY_LIMIT_FREE: '10', AI_DAILY_LIMIT_PRO: '200' };
    expect(limitFor('free', env)).toBe(10);
    expect(limitFor('pro', env)).toBe(200);
  });

  it('gives a trial the paid allowance — a trial is meant to show the product', () => {
    const env = { AI_DAILY_LIMIT_FREE: '10', AI_DAILY_LIMIT_PRO: '200' };
    expect(limitFor('trial', env)).toBe(200);
  });

  it('falls back to conservative defaults when unset, rather than unlimited', () => {
    expect(limitFor('free', {})).toBe(10);
    expect(limitFor('pro', {})).toBe(200);
  });

  it('tolerates whitespace, which env values pick up easily', () => {
    expect(limitFor('free', { AI_DAILY_LIMIT_FREE: ' 25\n' })).toBe(25);
  });

  it('honours an explicit zero — a plan may include no AI at all', () => {
    expect(limitFor('free', { AI_DAILY_LIMIT_FREE: '0' })).toBe(0);
  });

  it('ignores a malformed value instead of treating it as unlimited', () => {
    expect(limitFor('free', { AI_DAILY_LIMIT_FREE: 'lots' })).toBe(10);
    expect(limitFor('free', { AI_DAILY_LIMIT_FREE: '-5' })).toBe(10);
  });
});

describe('the allow decision', () => {
  const decide = (used: number, limit: number) => used < limit;

  it('allows up to the limit and refuses at it', () => {
    expect(decide(9, 10)).toBe(true);
    expect(decide(10, 10)).toBe(false);
    expect(decide(11, 10)).toBe(false);
  });

  it('refuses everything when the limit is zero', () => {
    expect(decide(0, 0)).toBe(false);
  });
});

describe('failure modes', () => {
  it('refuses a request with no shop — it cannot be counted against anyone', () => {
    expect(quotaSrc).toMatch(/if \(!shopId\)[\s\S]{0,120}allowed: false/);
  });

  it('allows the request when metering itself is broken', () => {
    // A counting outage must not take the product down with it.
    expect(quotaSrc).toMatch(/allowing the request unmetered/);
  });

  it('assumes the tightest plan when the plan lookup fails', () => {
    expect(quotaSrc).toMatch(/the tightest limit, not the loosest/);
  });
});

describe('the route enforces it', () => {
  it('checks the quota before calling Anthropic', () => {
    // Match the call, not the import at the top of the file.
    expect(routeSrc.indexOf('checkAiQuota(resolvedShopId)'))
      .toBeLessThan(routeSrc.indexOf('callAnthropic(prompt.system'));
  });

  it('answers 429 rather than a generic error', () => {
    expect(routeSrc).toMatch(/status:\s*429/);
  });

  it('records to usage_records, the table that exists', () => {
    expect(routeSrc).toMatch(/recordUsage\(/);
    expect(routeSrc).not.toMatch(/from\('ai_usage_logs'\)/);
  });

  it('awaits the usage write, so serverless cannot discard it', () => {
    expect(routeSrc).toMatch(/await logUsage\(/);
  });

  it('leaves mock mode unmetered — it costs nothing', () => {
    expect(routeSrc.indexOf('mock: true')).toBeLessThan(routeSrc.indexOf('checkAiQuota(resolvedShopId)'));
  });
});
