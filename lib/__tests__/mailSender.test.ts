/**
 * Who outbound mail claims to be from.
 *
 * Four routes hardcoded Resend's shared sandbox sender, which is accepted for
 * delivery and then filed as spam often enough to be unreliable — it carries
 * no domain reputation of this shop's own. The fix has to be switchable by
 * configuration rather than by editing code, because the sending domain
 * cannot be trusted until it is verified in Resend, and verifying it is a DNS
 * change nobody should have to coordinate with a deploy.
 */
import { mailFrom, usingSandboxSender, SANDBOX_SENDER } from '../mail/sender';

const ORIGINAL = process.env.MAIL_FROM_ADDRESS;

afterEach(() => {
  if (ORIGINAL === undefined) delete process.env.MAIL_FROM_ADDRESS;
  else process.env.MAIL_FROM_ADDRESS = ORIGINAL;
});

describe('mailFrom', () => {
  it('falls back to the sandbox sender when nothing is configured', () => {
    // Deliberate: defaulting to @redlined1.com before the domain is verified
    // would turn a deliverability problem into a hard send failure.
    delete process.env.MAIL_FROM_ADDRESS;
    expect(mailFrom('RedlineD1')).toBe(`RedlineD1 <${SANDBOX_SENDER}>`);
    expect(usingSandboxSender()).toBe(true);
  });

  it('uses the configured address once one is set', () => {
    process.env.MAIL_FROM_ADDRESS = 'sales@redlined1.com';
    expect(mailFrom('RedlineD1')).toBe('RedlineD1 <sales@redlined1.com>');
    expect(usingSandboxSender()).toBe(false);
  });

  it('treats whitespace-only configuration as unset', () => {
    process.env.MAIL_FROM_ADDRESS = '   ';
    expect(mailFrom('RedlineD1')).toBe(`RedlineD1 <${SANDBOX_SENDER}>`);
    expect(usingSandboxSender()).toBe(true);
  });

  it('strips characters that would let a label inject a header', () => {
    expect(mailFrom('Evil\r\nBcc: someone@example.com')).not.toMatch(/[\r\n]/);
    expect(mailFrom('Nested <attacker@example.com>')).toBe(
      `Nested attacker@example.com <${SANDBOX_SENDER}>`,
    );
  });

  it('falls back to a sane label rather than emitting a nameless From', () => {
    expect(mailFrom('   ')).toBe(`RedlineD1 <${SANDBOX_SENDER}>`);
  });
});
