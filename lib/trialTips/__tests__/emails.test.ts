/**
 * The four emails as they are sent: subject, HTML and plain text, and the
 * footer every commercial email must carry.
 */
import { renderTrialTipEmail, TrialTipRenderError } from '../emails';
import { TRIAL_TIP_STEPS } from '../config';
import { unsubscribeUrl, unsubscribeToken, verifyUnsubscribeToken } from '../unsubscribeToken';

const SECRET = 's'.repeat(40);
const USER = '10000000-0000-4000-8000-000000000001';
const input = {
  shopName: 'Somchai Auto',
  appUrl: 'https://redlined1.com',
  unsubscribeUrl: unsubscribeUrl('https://redlined1.com', USER, SECRET),
  postalAddress: 'PO Box 123, Example City, ST 00000',
};

describe.each(TRIAL_TIP_STEPS.map(s => [s]))('%s', step => {
  const email = renderTrialTipEmail(step, input);

  it('has a subject, HTML and a plain-text version', () => {
    expect(email.subject.length).toBeGreaterThan(10);
    expect(email.html).toMatch(/^<!doctype html>/);
    expect(email.text.length).toBeGreaterThan(100);
  });

  it('carries the unsubscribe link and postal address in BOTH versions', () => {
    for (const body of [email.html, email.text]) {
      expect(body).toContain('PO Box 123, Example City, ST 00000');
      expect(body).toContain('Unsubscribe from trial tips');
    }
    expect(email.text).toContain(input.unsubscribeUrl);
    expect(email.html).toContain(input.unsubscribeUrl.replace(/&/g, '&amp;'));
  });

  it('says why the person is receiving it', () => {
    expect(email.text).toMatch(/you asked for RedlineD1 trial tips/);
  });

  it('links only to the app\'s own origin', () => {
    const links = [...email.html.matchAll(/href="([^"]+)"/g)].map(m => m[1].replace(/&amp;/g, '&'));
    for (const l of links) expect(new URL(l).origin).toBe('https://redlined1.com');
  });
});

describe('safety', () => {
  it('escapes a shop name that contains markup', () => {
    const email = renderTrialTipEmail('first_job', { ...input, shopName: '<script>alert(1)</script> & "Co"' });
    expect(email.html).not.toContain('<script>');
    expect(email.html).toContain('&lt;script&gt;');
  });

  it('keeps a multi-line shop name on one line', () => {
    const email = renderTrialTipEmail('first_job', { ...input, shopName: 'A\nBcc: x@y.test' });
    expect(email.subject).not.toContain('\n');
    expect(email.text).toContain('A Bcc: x@y.test');
  });

  it('renders without a shop name', () => {
    expect(() => renderTrialTipEmail('setup_help', { ...input, shopName: null })).not.toThrow();
  });

  it('refuses to render without a postal address', () => {
    expect(() => renderTrialTipEmail('first_job', { ...input, postalAddress: '  ' })).toThrow(TrialTipRenderError);
  });

  it('refuses to render without an unsubscribe link', () => {
    expect(() => renderTrialTipEmail('first_job', { ...input, unsubscribeUrl: '' })).toThrow(TrialTipRenderError);
  });

  it('the Feedback email invites a reply, since replies reach a person', () => {
    expect(renderTrialTipEmail('feedback', input).text).toMatch(/reply to this email/i);
  });
});

describe('unsubscribe tokens', () => {
  it('verifies its own signature', () => {
    expect(verifyUnsubscribeToken(USER, unsubscribeToken(USER, SECRET), SECRET)).toBe(true);
  });

  it('rejects another person\'s id with this token', () => {
    const other = '10000000-0000-4000-8000-000000000002';
    expect(verifyUnsubscribeToken(other, unsubscribeToken(USER, SECRET), SECRET)).toBe(false);
  });

  it('rejects a token made with another secret', () => {
    expect(verifyUnsubscribeToken(USER, unsubscribeToken(USER, 'o'.repeat(40)), SECRET)).toBe(false);
  });

  it('rejects malformed input', () => {
    for (const [u, t] of [['', 'x'], ['not-a-uuid', 'x'], [USER, ''], [USER, 'x'.repeat(500)]]) {
      expect(verifyUnsubscribeToken(u, t, SECRET)).toBe(false);
    }
  });

  it('the URL points at the unsubscribe endpoint and contains nothing but the id and signature', () => {
    const url = new URL(input.unsubscribeUrl);
    expect(url.pathname).toBe('/api/trial-tips/unsubscribe');
    expect([...url.searchParams.keys()].sort()).toEqual(['t', 'u']);
    expect(url.toString()).not.toMatch(/@/);
  });
});
