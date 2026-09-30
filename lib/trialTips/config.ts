/**
 * Trial-tips emails: the steps, the consent wording, and the launch gates.
 *
 * Everything is OFF unless every gate passes. A missing setting never falls
 * back to something that sends — not to Resend's sandbox sender, not to an
 * empty postal address, not to an unsigned unsubscribe link. Anything short of
 * fully configured runs as a dry run that reports who WOULD be emailed and
 * sends nothing.
 *
 * The step windows and trial length here must match
 * supabase/migrations/2026-09-30_trial_tips_email.sql; a Jest test compares
 * them.
 */
import { TRIAL_DAYS } from '@/lib/planGate';

export type TrialTipStep = 'first_job' | 'setup_help' | 'status_board' | 'feedback';

/** Days after the trial starts when each step becomes due. */
export const STEP_START_DAYS: Readonly<Record<TrialTipStep, number>> = {
  first_job: 0,
  setup_help: 2,
  status_board: 4,
  feedback: 6,
};

export const TRIAL_TIP_STEPS: readonly TrialTipStep[] = ['first_job', 'setup_help', 'status_board', 'feedback'];

export { TRIAL_DAYS };

/**
 * The consent wording shown beside the checkbox and in Settings. Bump the
 * version whenever the wording changes: every recorded consent carries the
 * version the person actually saw.
 */
export const TRIAL_TIPS_CONSENT_VERSION = 'trial-tips-v1-2026-09-30';
export const TRIAL_TIPS_CONSENT_TEXT =
  'Send me trial tips: four short emails during my 7-day trial on getting set up. Unsubscribe any time.';

/** Versions the server accepts from a signup form. */
export const KNOWN_CONSENT_VERSIONS: ReadonlySet<string> = new Set([TRIAL_TIPS_CONSENT_VERSION]);

/** Replies go to a person, not a no-reply box. */
export const TRIAL_TIPS_REPLY_TO = 'admin@redlined1.com';

/** The only domain live marketing may be sent from — the one verified in Resend. */
export const VERIFIED_SENDER_DOMAIN = 'redlined1.com';

export const RESEND_SANDBOX_SENDER = 'onboarding@resend.dev';

/**
 * Who may receive a live email.
 *
 *   canary    (the default) ONLY addresses in TRIAL_TIPS_CANARY_RECIPIENTS —
 *             everyone else is skipped before anything is claimed, and again
 *             immediately before the provider request. An empty list means
 *             nobody at all.
 *   everyone  every eligible person. Must be set explicitly, after a canary
 *             has been verified.
 */
export type TrialTipsAudience = 'canary' | 'everyone';

export interface TrialTipsConfig {
  /** Every gate passed: real emails may be sent (to `audience`). */
  live: boolean;
  audience: TrialTipsAudience;
  /** Lower-cased canary addresses; only consulted when audience is 'canary'. */
  canaryRecipients: ReadonlySet<string>;
  /** Why not, in words, when `live` is false. */
  blockers: string[];
  fromAddress: string | null;
  postalAddress: string | null;
  appUrl: string | null;
  unsubscribeSecret: string | null;
  resendApiKey: string | null;
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

/** Whether this recipient may be emailed under the configured audience. */
export function recipientAllowed(config: Pick<TrialTipsConfig, 'audience' | 'canaryRecipients'>, email: string | null): boolean {
  if (!email) return false;
  if (config.audience === 'everyone') return true;
  return config.canaryRecipients.has(email.trim().toLowerCase());
}

/**
 * Reads the configuration and decides whether sending is allowed.
 *
 *   TRIAL_TIPS_SENDING_ENABLED     must be exactly "true"
 *   TRIAL_TIPS_FROM_ADDRESS        an address at the verified domain; never the sandbox
 *   TRIAL_TIPS_POSTAL_ADDRESS      the business's mailing address (CAN-SPAM)
 *   TRIAL_TIPS_UNSUBSCRIBE_SECRET  at least 32 characters; signs unsubscribe links
 *   NEXT_PUBLIC_SITE_URL           https origin for links
 *   RESEND_API_KEY
 *
 * and, separately, who may receive it:
 *   TRIAL_TIPS_AUDIENCE            "everyone", or anything else = canary only
 *   TRIAL_TIPS_CANARY_RECIPIENTS   comma-separated addresses for canary mode
 */
export function readTrialTipsConfig(env: Env = process.env): TrialTipsConfig {
  const blockers: string[] = [];

  const enabled = env.TRIAL_TIPS_SENDING_ENABLED === 'true';
  if (!enabled) blockers.push('TRIAL_TIPS_SENDING_ENABLED is not "true" (sending is off by default)');

  const from = trimmed(env.TRIAL_TIPS_FROM_ADDRESS);
  const fromOk = !!from
    && /^[^\s@<>]+@[^\s@<>]+$/.test(from)
    && from.toLowerCase().endsWith('@' + VERIFIED_SENDER_DOMAIN)
    && from.toLowerCase() !== RESEND_SANDBOX_SENDER;
  if (!fromOk) blockers.push(`TRIAL_TIPS_FROM_ADDRESS must be an address at @${VERIFIED_SENDER_DOMAIN} (the sandbox sender is never used for marketing)`);

  const postal = trimmed(env.TRIAL_TIPS_POSTAL_ADDRESS);
  if (!postal) blockers.push('TRIAL_TIPS_POSTAL_ADDRESS is not set (a physical mailing address is legally required)');

  const secret = trimmed(env.TRIAL_TIPS_UNSUBSCRIBE_SECRET);
  const secretOk = !!secret && secret.length >= 32;
  if (!secretOk) blockers.push('TRIAL_TIPS_UNSUBSCRIBE_SECRET must be at least 32 characters');

  const appUrl = appUrlFrom(trimmed(env.NEXT_PUBLIC_SITE_URL));
  if (!appUrl) blockers.push('NEXT_PUBLIC_SITE_URL must be an https origin');

  const key = trimmed(env.RESEND_API_KEY);
  if (!key) blockers.push('RESEND_API_KEY is not set');

  // Anything other than the exact word "everyone" is canary. A typo narrows
  // the audience; it can never widen it.
  const audience: TrialTipsAudience = env.TRIAL_TIPS_AUDIENCE === 'everyone' ? 'everyone' : 'canary';
  const canaryRecipients = new Set(
    (env.TRIAL_TIPS_CANARY_RECIPIENTS ?? '')
      .split(',')
      .map(s => s.trim().toLowerCase())
      .filter(s => /^[^\s@<>,]+@[^\s@<>,]+\.[^\s@<>,]+$/.test(s)),
  );

  return {
    live: blockers.length === 0,
    audience,
    canaryRecipients,
    blockers,
    fromAddress: fromOk ? from : null,
    postalAddress: postal,
    appUrl,
    unsubscribeSecret: secretOk ? secret : null,
    resendApiKey: key,
  };
}
