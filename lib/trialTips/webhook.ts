/**
 * Resend webhooks: bounces, complaints and provider-side suppressions stop
 * all future trial tips to that person.
 *
 * Every request is verified against the signing secret (Standard Webhooks /
 * Svix, via the Resend SDK) before anything is read from it. Each delivery id
 * is processed once, so Resend's retries cannot double-apply anything, and a
 * processing failure answers 500 so Resend retries it.
 */
import { Resend } from 'resend';
import type { TrialTipsDb } from './runner';

export type WebhookResult =
  | { status: 200; outcome: 'suppressed' | 'no_match' | 'ignored' | 'duplicate' }
  | { status: 400 | 401 | 500 | 503; outcome: 'unconfigured' | 'bad_signature' | 'bad_payload' | 'error' };

/**
 * Event names as documented by Resend (resend.com/docs/dashboard/webhooks/
 * event-types, checked 2026-09-30):
 *   email.bounced      "permanently rejected the email" — transient problems
 *                      are the separate email.delivery_delayed, not handled
 *   email.complained   delivered, but marked as spam
 *   email.suppressed   Resend did not send: address on its suppression list
 *   suppression.added  an address was added to the account suppression list
 *                      (payload carries data.email, not data.to)
 */
const SUPPRESSING: Record<string, 'bounce' | 'complaint' | 'provider_suppressed'> = {
  'email.bounced': 'bounce',
  'email.complained': 'complaint',
  'email.suppressed': 'provider_suppressed',
  'suppression.added': 'provider_suppressed',
};

// Verification is local — no API call — so any placeholder key will do.
const verifier = new Resend('re_verify_only');

export async function handleResendWebhook(opts: {
  rawBody: string;
  headers: { get(name: string): string | null };
  secret: string | undefined;
  db: TrialTipsDb;
}): Promise<WebhookResult> {
  if (!opts.secret) return { status: 503, outcome: 'unconfigured' };

  const id = opts.headers.get('svix-id') ?? opts.headers.get('webhook-id');
  const timestamp = opts.headers.get('svix-timestamp') ?? opts.headers.get('webhook-timestamp');
  const signature = opts.headers.get('svix-signature') ?? opts.headers.get('webhook-signature');
  if (!id || !timestamp || !signature) return { status: 401, outcome: 'bad_signature' };

  let event: { type?: string; data?: { email_id?: string; to?: string[]; email?: string } };
  try {
    // Throws on a bad signature or a timestamp outside the tolerance window.
    event = verifier.webhooks.verify({
      payload: opts.rawBody,
      headers: { id, timestamp, signature },
      webhookSecret: opts.secret,
    }) as typeof event;
  } catch {
    return { status: 401, outcome: 'bad_signature' };
  }
  if (!event || typeof event.type !== 'string') return { status: 400, outcome: 'bad_payload' };

  const reason = SUPPRESSING[event.type];
  const emailId = event.data?.email_id ?? null;

  // Claim this delivery first: a retried delivery finds its id already here.
  const claimed = await opts.db.rpc('resend_webhook_claim', {
    p_webhook_id: id, p_event_type: event.type, p_email_id: emailId,
  });
  if (claimed.error) return { status: 500, outcome: 'error' };
  if (claimed.data !== true) return { status: 200, outcome: 'duplicate' };

  if (!reason) {
    await opts.db.rpc('resend_webhook_finish', { p_webhook_id: id, p_outcome: 'ignored' });
    return { status: 200, outcome: 'ignored' };
  }

  const recipient = event.data?.to?.[0] ?? event.data?.email ?? null;
  const suppressed = await opts.db.rpc('trial_tips_suppress', {
    p_email_id: emailId, p_recipient: recipient, p_reason: reason,
  });
  if (suppressed.error) {
    // Release the claim so Resend's retry can process it.
    await opts.db.rpc('resend_webhook_release', { p_webhook_id: id });
    return { status: 500, outcome: 'error' };
  }

  const outcome = (suppressed.data as number) > 0 ? 'suppressed' : 'no_match';
  await opts.db.rpc('resend_webhook_finish', { p_webhook_id: id, p_outcome: outcome });
  return { status: 200, outcome };
}
