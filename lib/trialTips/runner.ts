/**
 * One pass of the trial-tips job: find who is due, and send each of them at
 * most ONE email — the step they are due for now.
 *
 * Run by .github/workflows/trial-tips.yml (the single scheduler) through
 * scripts/run-trial-tips.ts. Running it more often, twice at once, or again
 * after a crash is safe. For each due person, in order:
 *
 *   1. audience   canary mode (the default) skips anyone not on the canary
 *                 list — before anything is claimed.
 *   2. claim      trial_tips_claim re-checks eligibility and reserves the send
 *                 atomically; of two overlapping runs, one wins.
 *   3. render     the email, with a signed unsubscribe link.
 *   4. confirm    immediately before contacting Resend: audience again, then
 *                 trial_tips_confirm (still subscribed, verified, in trial, not
 *                 paid, not suppressed, claim still ours). If not, withdraw.
 *   5. send       with idempotency key trial-tips/<user>/<step>.
 *   6. record     sent | failed (definitely not sent) | uncertain (may have
 *                 been sent — retried only while Resend still deduplicates
 *                 the key; see the migration).
 *
 * What is left between 4 and 5 is one HTTPS request: an unsubscribe or paid
 * conversion landing inside it is not seen, and that one email goes out. The
 * next step is never sent, because every later claim checks again.
 *
 * Unless every launch gate passes (readTrialTipsConfig) this is a DRY RUN: it
 * reports who is due and claims, sends and records nothing.
 *
 * Nothing personal is logged: reports carry steps, outcomes and shortened ids,
 * never an email address.
 */
import { createHash } from 'crypto';
import type { TrialTipsConfig, TrialTipStep } from './config';
import { TRIAL_TIPS_REPLY_TO, recipientAllowed } from './config';
import { renderTrialTipEmail } from './emails';
import { unsubscribeUrl } from './unsubscribeToken';

export interface TrialTipsDb {
  rpc(fn: string, args: Record<string, unknown>): PromiseLike<{ data: unknown; error: { message: string } | null }>;
}

export interface OutboundEmail {
  from: string;
  to: string;
  replyTo: string;
  subject: string;
  html: string;
  text: string;
  headers: Record<string, string>;
  tags: { name: string; value: string }[];
}

export type SendResult =
  | { ok: true; id: string }
  | { ok: false; certainty: 'rejected' | 'uncertain'; message: string };

/** Sends one email and says whether it was sent, definitely not, or unknown. */
export interface MailTransport {
  send(message: OutboundEmail, idempotencyKey: string): Promise<SendResult>;
}

export type SendOutcome =
  | 'sent' | 'failed' | 'uncertain' | 'withdrawn' | 'not_claimed'
  | 'not_canary' | 'would_send' | 'record_failed';

export interface TrialTipsReport {
  mode: 'live' | 'dry-run';
  audience: 'canary' | 'everyone';
  blockers: string[];
  due: number;
  outcomes: Record<SendOutcome, number>;
  byStep: Record<TrialTipStep, number>;
  items: { user: string; step: TrialTipStep; outcome: SendOutcome }[];
  /** Sends that might have gone out and can no longer be retried safely. */
  needsReview: { user: string; step: string; status: string }[];
  /**
   * A short hash of the unsubscribe secret, so the job's value can be matched
   * against the web app's without either being printed.
   */
  unsubscribeSecretFingerprint: string | null;
}

interface DueRow { user_id: string; step: TrialTipStep; email: string | null; shop_name: string | null }

export function idempotencyKey(userId: string, step: TrialTipStep): string {
  return `trial-tips/${userId}/${step}`;
}

export function secretFingerprint(secret: string | null): string | null {
  if (!secret) return null;
  return createHash('sha256').update('trial-tips-unsubscribe-fingerprint:' + secret).digest('hex').slice(0, 12);
}

/** Enough of an id to find a row in a log; not enough to identify anyone. */
function shortId(userId: string): string {
  return userId.slice(0, 8);
}

/** Provider errors can echo the recipient; keep the message but strip addresses. */
function scrub(message: string): string {
  return message.replace(/[^\s@<>"'()]+@[^\s@<>"'()]+/g, '[address]').slice(0, 300);
}

export async function runTrialTips(opts: {
  db: TrialTipsDb;
  transport: MailTransport | null;
  config: TrialTipsConfig;
  now?: Date;
  /** Upper bound per run, so a backlog cannot turn into a burst. */
  maxSends?: number;
}): Promise<TrialTipsReport> {
  const { db, config } = opts;
  const now = opts.now ?? new Date();
  const nowIso = now.toISOString();
  const maxSends = opts.maxSends ?? 200;
  const live = config.live && !!opts.transport;

  const report: TrialTipsReport = {
    mode: live ? 'live' : 'dry-run',
    audience: config.audience,
    blockers: live ? [] : (config.blockers.length ? config.blockers : ['no mail transport configured']),
    due: 0,
    outcomes: { sent: 0, failed: 0, uncertain: 0, withdrawn: 0, not_claimed: 0, not_canary: 0, would_send: 0, record_failed: 0 },
    byStep: { first_job: 0, setup_help: 0, status_board: 0, feedback: 0 },
    items: [],
    needsReview: [],
    unsubscribeSecretFingerprint: secretFingerprint(config.unsubscribeSecret),
  };

  const { data, error } = await db.rpc('trial_tips_due', { p_now: nowIso });
  if (error) throw new Error(`trial_tips_due failed: ${error.message}`);
  const due = (data ?? []) as DueRow[];
  report.due = due.length;

  const record = (row: DueRow, outcome: SendOutcome) => {
    report.outcomes[outcome] += 1;
    report.byStep[row.step] += 1;
    report.items.push({ user: shortId(row.user_id), step: row.step, outcome });
  };

  for (const row of due.slice(0, maxSends)) {
    // 1. Audience — nothing is claimed for someone who may not be emailed.
    if (!recipientAllowed(config, row.email)) { record(row, 'not_canary'); continue; }
    if (!live) { record(row, 'would_send'); continue; }

    // 2. Claim: the eligibility check and the reservation, atomically.
    const claim = await db.rpc('trial_tips_claim', { p_user: row.user_id, p_step: row.step, p_now: nowIso });
    if (claim.error) throw new Error(`trial_tips_claim failed: ${claim.error.message}`);
    if (claim.data !== true) { record(row, 'not_claimed'); continue; }

    // 3. Render.
    const unsubscribe = unsubscribeUrl(config.appUrl!, row.user_id, config.unsubscribeSecret!);
    let message: OutboundEmail;
    try {
      const rendered = renderTrialTipEmail(row.step, {
        shopName: row.shop_name,
        appUrl: config.appUrl!,
        unsubscribeUrl: unsubscribe,
        postalAddress: config.postalAddress!,
      });
      message = {
        from: `RedlineD1 <${config.fromAddress}>`,
        to: row.email!,
        replyTo: TRIAL_TIPS_REPLY_TO,
        subject: rendered.subject,
        html: rendered.html,
        text: rendered.text,
        headers: {
          // RFC 2369 + RFC 8058: mail clients show their own unsubscribe
          // button and can POST to it without opening a page.
          'List-Unsubscribe': `<${unsubscribe}>`,
          'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
        },
        tags: [{ name: 'campaign', value: 'trial_tips' }, { name: 'step', value: row.step }],
      };
    } catch (e) {
      // Nothing was sent: a definite failure.
      await db.rpc('trial_tips_mark_failed', { p_user: row.user_id, p_step: row.step, p_error: scrub(String((e as Error)?.message ?? e)) });
      record(row, 'failed');
      continue;
    }

    // 4. Final check, immediately before the provider request.
    const confirmed = recipientAllowed(config, message.to)
      ? await db.rpc('trial_tips_confirm', { p_user: row.user_id, p_step: row.step, p_now: new Date().toISOString() })
      : { data: false, error: null };
    if (confirmed.error || confirmed.data !== true) {
      await db.rpc('trial_tips_withdraw', { p_user: row.user_id, p_step: row.step });
      record(row, 'withdrawn');
      continue;
    }

    // 5. Send.
    let result: SendResult;
    try {
      result = await opts.transport!.send(message, idempotencyKey(row.user_id, row.step));
    } catch (e) {
      // An unexpected throw tells us nothing about whether it was sent.
      result = { ok: false, certainty: 'uncertain', message: String((e as Error)?.message ?? e) };
    }

    // 6. Record.
    if (!result.ok) {
      const fn = result.certainty === 'rejected' ? 'trial_tips_mark_failed' : 'trial_tips_mark_uncertain';
      await db.rpc(fn, { p_user: row.user_id, p_step: row.step, p_error: scrub(result.message) });
      record(row, result.certainty === 'rejected' ? 'failed' : 'uncertain');
      continue;
    }
    const marked = await db.rpc('trial_tips_mark_sent', {
      p_user: row.user_id, p_step: row.step, p_email_id: result.id, p_now: nowIso,
    });
    // Sent but not recorded: the claim goes stale and a later run (within 23
    // hours) reclaims it with the same key, and Resend returns this email
    // rather than sending another.
    record(row, marked.error ? 'record_failed' : 'sent');
  }

  const review = await db.rpc('trial_tips_needs_review', { p_now: nowIso });
  if (!review.error) {
    report.needsReview = ((review.data ?? []) as { user_id: string; step: string; status: string }[])
      .map(r => ({ user: shortId(r.user_id), step: r.step, status: r.status }));
  }

  return report;
}
