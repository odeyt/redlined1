/**
 * Morning-brief emails: the launch gates.
 *
 * The same discipline as trial-tips (lib/trialTips/config.ts): everything
 * is OFF unless every gate passes, and a missing setting never falls back
 * to something that sends. Anything short of fully configured runs as a
 * dry run that reports who WOULD be emailed and sends nothing.
 *
 * This is a product email — the shop's own brief, to the shop's owner,
 * about the shop's own records — not marketing. It therefore has no
 * unsubscribe secret and no postal-address gate; the gates that remain are
 * the ones that stop it sending from the wrong address, to the wrong
 * audience, or by accident.
 */
import { RESEND_SANDBOX_SENDER, VERIFIED_SENDER_DOMAIN } from '@/lib/trialTips/config';

/** Replies go to a person, not a no-reply box. Same inbox as trial-tips. */
export const MORNING_BRIEF_REPLY_TO = 'admin@redlined1.com';

/**
 * Who may receive a live email.
 *
 *   canary    (the default) ONLY addresses in MORNING_BRIEF_CANARY_RECIPIENTS.
 *   everyone  every eligible shop. Must be set explicitly, after a canary
 *             has been verified.
 */
export type MorningBriefAudience = 'canary' | 'everyone';

export interface MorningBriefConfig {
  /** Every gate passed: real emails may be sent (to `audience`). */
  live: boolean;
  audience: MorningBriefAudience;
  /** Lower-cased canary addresses; only consulted when audience is 'canary'. */
  canaryRecipients: ReadonlySet<string>;
  /** Why not, in words, when `live` is false. */
  blockers: string[];
  fromAddress: string | null;
  appUrl: string | null;
  resendApiKey: string | null;
  /**
   * Optional operator copy: the single address in MORNING_BRIEF_COPY_TO,
   * or null when unset/invalid. Copies are best-effort extras — they are
   * never a launch gate and never block or fail an owner's own brief.
   */
  copyTo: string | null;
  /**
   * Lower-cased owner addresses in MORNING_BRIEF_COPY_OWNER_EMAILS — the
   * operator's OWN shops. Only briefs for shops whose owner is on this
   * list are ever copied; a customer shop's brief is never copied.
   */
  copyOwnerEmails: ReadonlySet<string>;
}

type Env = Record<string, string | undefined>;

function trimmed(value: string | undefined): string | null {
  const v = value?.trim();
  return v ? v : null;
}

function appUrlFrom(raw: string | null): string | null {
  if (!raw) return null;
  try {
    const url = new URL(raw);
    const local = url.protocol === 'http:' && (url.hostname === 'localhost' || url.hostname === '127.0.0.1');
    if (url.protocol !== 'https:' && !local) return null;
    return url.origin;
  } catch {
    return null;
  }
}

/** Whether this shop owner may be emailed under the configured audience. */
export function recipientAllowed(
  config: Pick<MorningBriefConfig, 'audience' | 'canaryRecipients'>,
  email: string | null,
): boolean {
  if (!email) return false;
  if (config.audience === 'everyone') return true;
  return config.canaryRecipients.has(email.trim().toLowerCase());
}

const EMAIL_RE = /^[^\s@<>,]+@[^\s@<>,]+\.[^\s@<>,]+$/;

function parseEmailList(raw: string | undefined): Set<string> {
  return new Set(
    (raw ?? '')
      .split(',')
      .map(s => s.trim().toLowerCase())
      .filter(s => EMAIL_RE.test(s)),
  );
}

/**
 * The operator-copy decision for one brief: returns the address a copy
 * should go to, or null for no copy. A copy is due only when ALL of:
 *
 *   - MORNING_BRIEF_COPY_TO is set (a valid bare address), and
 *   - the shop's owner (the resolved recipient) is listed in
 *     MORNING_BRIEF_COPY_OWNER_EMAILS — i.e. it is one of the operator's
 *     own internal shops, never a customer's, and
 *   - the copy address is not the recipient themselves.
 */
export function copyRecipientFor(
  config: Pick<MorningBriefConfig, 'copyTo' | 'copyOwnerEmails'>,
  recipientEmail: string | null,
): string | null {
  if (!config.copyTo || !recipientEmail) return null;
  const recipient = recipientEmail.trim().toLowerCase();
  if (!config.copyOwnerEmails.has(recipient)) return null;
  if (config.copyTo.trim().toLowerCase() === recipient) return null;
  return config.copyTo;
}

/**
 * Reads the configuration and decides whether sending is allowed.
 *
 *   MORNING_BRIEF_SENDING_ENABLED   must be exactly "true"
 *   MORNING_BRIEF_FROM_ADDRESS      a bare address at the verified domain;
 *                                   never the Resend sandbox sender
 *   NEXT_PUBLIC_SITE_URL            https origin for the panel link
 *   RESEND_API_KEY
 *
 * and, separately, who may receive it:
 *   MORNING_BRIEF_AUDIENCE            "everyone", or anything else = canary only
 *   MORNING_BRIEF_CANARY_RECIPIENTS   comma-separated owner addresses
 *
 * Optional, never a gate (copies are off unless BOTH are set):
 *   MORNING_BRIEF_COPY_TO             one address to receive copies of
 *                                     internal-shop briefs
 *   MORNING_BRIEF_COPY_OWNER_EMAILS   comma-separated owner addresses
 *                                     identifying the operator's own shops
 */
export function readMorningBriefConfig(env: Env = process.env): MorningBriefConfig {
  const blockers: string[] = [];

  const enabled = env.MORNING_BRIEF_SENDING_ENABLED === 'true';
  if (!enabled) blockers.push('MORNING_BRIEF_SENDING_ENABLED is not "true" (sending is off by default)');

  const from = trimmed(env.MORNING_BRIEF_FROM_ADDRESS);
  const fromOk = !!from
    && /^[^\s@<>]+@[^\s@<>]+$/.test(from)
    && from.toLowerCase().endsWith('@' + VERIFIED_SENDER_DOMAIN)
    && from.toLowerCase() !== RESEND_SANDBOX_SENDER;
  if (!fromOk) blockers.push(`MORNING_BRIEF_FROM_ADDRESS must be a bare address at @${VERIFIED_SENDER_DOMAIN} (the sandbox sender is never used)`);

  const appUrl = appUrlFrom(trimmed(env.NEXT_PUBLIC_SITE_URL));
  if (!appUrl) blockers.push('NEXT_PUBLIC_SITE_URL must be an https origin');

  const key = trimmed(env.RESEND_API_KEY);
  if (!key) blockers.push('RESEND_API_KEY is not set');

  // Anything other than the exact word "everyone" is canary. A typo narrows
  // the audience; it can never widen it.
  const audience: MorningBriefAudience = env.MORNING_BRIEF_AUDIENCE === 'everyone' ? 'everyone' : 'canary';
  const canaryRecipients = parseEmailList(env.MORNING_BRIEF_CANARY_RECIPIENTS);

  // Operator copies: optional extras, never blockers. An invalid
  // MORNING_BRIEF_COPY_TO simply means no copies, exactly like unset.
  const copyToRaw = trimmed(env.MORNING_BRIEF_COPY_TO);
  const copyTo = copyToRaw && EMAIL_RE.test(copyToRaw) ? copyToRaw : null;
  const copyOwnerEmails = parseEmailList(env.MORNING_BRIEF_COPY_OWNER_EMAILS);

  return {
    live: blockers.length === 0,
    audience,
    canaryRecipients,
    blockers,
    fromAddress: fromOk ? from : null,
    appUrl,
    resendApiKey: key,
    copyTo,
    copyOwnerEmails,
  };
}
