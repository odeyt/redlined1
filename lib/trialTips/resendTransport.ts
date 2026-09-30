/**
 * The real mail transport: Resend, server-side only.
 *
 * Only built by scripts/run-trial-tips.ts, after every launch gate has passed.
 * Not marked `server-only` because that package throws outside Next's server
 * runtime, and the scheduled job is a plain Node script; instead
 * lib/trialTips/__tests__ fails if any client file imports it.
 *
 * The Resend SDK does not throw: every failure comes back as `error`, and a
 * network failure has no status code. Each outcome is classified so the job
 * never re-sends something that may already have been delivered — see
 * classifyResendError.
 */
import { Resend } from 'resend';
import type { MailTransport, SendResult } from './runner';

interface ResendError { name?: string; statusCode?: number | null; message?: string }

/**
 * Was anything sent?
 *
 *   rejected   definitely not: a 4xx that Resend returned after refusing the
 *              request (validation, auth, rate limit…). Safe to retry.
 *   uncertain  maybe: no status (the request may or may not have arrived), a
 *              5xx, 408, or 409 concurrent_idempotent_requests (another request
 *              with this key is still in progress), or 409
 *              invalid_idempotent_request (this key was already used — with a
 *              different payload, so something was sent under it before).
 *
 * Resend's documented idempotency behaviour: keys are kept 24 hours; a repeat
 * with the same key and payload returns the original response without
 * sending again.
 */
export function classifyResendError(error: ResendError): 'rejected' | 'uncertain' {
  const status = typeof error.statusCode === 'number' ? error.statusCode : null;
  if (status === null) return 'uncertain';
  if (status >= 500 || status === 408 || status === 409) return 'uncertain';
  if (status >= 400) return 'rejected';
  return 'uncertain';
}

export function resendTransport(apiKey: string): MailTransport {
  const resend = new Resend(apiKey);
  return {
    async send(message, idempotencyKey): Promise<SendResult> {
      const { data, error } = await resend.emails.send({
        from: message.from,
        to: [message.to],
        replyTo: message.replyTo,
        subject: message.subject,
        html: message.html,
        text: message.text,
        headers: message.headers,
        tags: message.tags,
      }, { idempotencyKey });
      if (!error && data?.id) return { ok: true, id: data.id };
      const e = (error ?? {}) as ResendError;
      return {
        ok: false,
        certainty: error ? classifyResendError(e) : 'uncertain',
        message: `${e.name ?? 'unknown'} (${e.statusCode ?? 'no status'}): ${e.message ?? 'no id returned'}`,
      };
    },
  };
}
