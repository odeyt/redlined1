/**
 * Who outbound mail is from.
 *
 * Four routes hardcoded `onboarding@resend.dev` — Resend's shared sandbox
 * sender. Mail from it is accepted for delivery and then filed as spam often
 * enough to be unreliable, because the domain is shared with every other
 * account trying Resend out. It carries none of this shop's reputation.
 *
 * Two other routes already send from `@redlined1.com` (invite, chat), so the
 * codebase disagreed with itself about who RedlineD1 is.
 *
 * This resolves the address from configuration instead, with the sandbox as
 * the fallback. That ordering is deliberate: switching the default to
 * `@redlined1.com` before the domain is verified in Resend would turn a
 * deliverability problem into a hard send failure, which is worse. Verify the
 * domain, set MAIL_FROM_ADDRESS, redeploy — no code change, and nothing
 * breaks in the meantime.
 */

/** Resend's shared sandbox sender. Works without any domain setup, which is
 *  why it is the fallback — and why it should not stay the answer. */
export const SANDBOX_SENDER = 'onboarding@resend.dev';

/** True when mail is still going out over the shared sandbox domain. Exposed
 *  so a caller can report it rather than leaving it invisible. */
export function usingSandboxSender(): boolean {
  return !process.env.MAIL_FROM_ADDRESS?.trim();
}

/**
 * A `From` header: `Label <address>`.
 *
 * The label is sanitised rather than trusted — a newline in it would let a
 * caller inject additional headers into the message.
 */
export function mailFrom(label: string): string {
  const address = process.env.MAIL_FROM_ADDRESS?.trim() || SANDBOX_SENDER;
  const safeLabel = label.replace(/[\r\n<>]/g, '').trim() || 'RedlineD1';
  return `${safeLabel} <${address}>`;
}
