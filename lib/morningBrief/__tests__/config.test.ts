/**
 * Morning-brief launch gates: nothing sends unless everything is
 * configured, mirroring the trial-tips discipline.
 */
import { readMorningBriefConfig, recipientAllowed } from '../config';

const FULL = {
  MORNING_BRIEF_SENDING_ENABLED: 'true',
  MORNING_BRIEF_FROM_ADDRESS: 'brief@redlined1.com',
  NEXT_PUBLIC_SITE_URL: 'https://www.redlined1.com',
  RESEND_API_KEY: 're_test_key',
};

describe('readMorningBriefConfig', () => {
  it('is live only when every gate passes', () => {
    const c = readMorningBriefConfig(FULL);
    expect(c.live).toBe(true);
    expect(c.blockers).toEqual([]);
    expect(c.audience).toBe('canary');
  });

  it('is OFF by default — an empty environment sends nothing', () => {
    const c = readMorningBriefConfig({});
    expect(c.live).toBe(false);
    expect(c.blockers.length).toBeGreaterThanOrEqual(4);
  });

  it.each([
    ['MORNING_BRIEF_SENDING_ENABLED', 'false'],
    ['MORNING_BRIEF_SENDING_ENABLED', 'TRUE'],
    ['MORNING_BRIEF_FROM_ADDRESS', ''],
    ['MORNING_BRIEF_FROM_ADDRESS', 'onboarding@resend.dev'],
    ['MORNING_BRIEF_FROM_ADDRESS', 'brief@example.com'],
    ['MORNING_BRIEF_FROM_ADDRESS', 'RedlineD1 <brief@redlined1.com>'],
    ['NEXT_PUBLIC_SITE_URL', 'http://redlined1.com'],
    ['NEXT_PUBLIC_SITE_URL', 'not a url'],
    ['RESEND_API_KEY', ''],
  ])('%s = %j blocks live sending', (key, value) => {
    const c = readMorningBriefConfig({ ...FULL, [key]: value });
    expect(c.live).toBe(false);
    expect(c.blockers.length).toBeGreaterThan(0);
  });

  it('audience is canary unless exactly "everyone"', () => {
    expect(readMorningBriefConfig({ ...FULL, MORNING_BRIEF_AUDIENCE: 'everyone' }).audience).toBe('everyone');
    expect(readMorningBriefConfig({ ...FULL, MORNING_BRIEF_AUDIENCE: 'Everyone' }).audience).toBe('canary');
    expect(readMorningBriefConfig({ ...FULL, MORNING_BRIEF_AUDIENCE: 'all' }).audience).toBe('canary');
  });

  it('canary recipients are parsed and lower-cased', () => {
    const c = readMorningBriefConfig({ ...FULL, MORNING_BRIEF_CANARY_RECIPIENTS: ' Owner@Example.com , two@example.com, junk' });
    expect([...c.canaryRecipients].sort()).toEqual(['owner@example.com', 'two@example.com']);
  });
});

describe('recipientAllowed', () => {
  const canary = readMorningBriefConfig({ ...FULL, MORNING_BRIEF_CANARY_RECIPIENTS: 'owner@example.com' });
  const everyone = readMorningBriefConfig({ ...FULL, MORNING_BRIEF_AUDIENCE: 'everyone' });

  it('canary allows only listed addresses, case-insensitively', () => {
    expect(recipientAllowed(canary, 'Owner@Example.com')).toBe(true);
    expect(recipientAllowed(canary, 'other@example.com')).toBe(false);
    expect(recipientAllowed(canary, null)).toBe(false);
  });

  it('everyone allows any address but never a missing one', () => {
    expect(recipientAllowed(everyone, 'any@example.com')).toBe(true);
    expect(recipientAllowed(everyone, null)).toBe(false);
    expect(recipientAllowed(everyone, '')).toBe(false);
  });
});
