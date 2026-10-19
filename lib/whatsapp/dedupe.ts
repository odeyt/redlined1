/**
 * Duplicate prevention for WhatsApp sends.
 *
 * Two independent guards, both enforced by unique indexes in the database
 * (2026-10-19_whatsapp_business.sql), so two browser tabs or a double-click
 * cannot race past them:
 *
 *   1. client_request_id — one id per opened Send dialog. A retried request
 *      (network blip, double-click) returns the first attempt's result instead
 *      of sending again.
 *   2. dedupe_key — sha256 of (shop, document, template, recipient, content
 *      fingerprint). The same unchanged estimate cannot be sent to the same
 *      number twice. When the document changes (new total, new status, new
 *      repair stage), the fingerprint changes and a new send is allowed. A
 *      failed send frees its key. A deliberate resend of unchanged content
 *      needs staff to confirm it, and gets a one-off key.
 *
 * Language is not part of the key: the same invoice in English and then Lao
 * is the same message to the customer.
 */
import { createHash } from 'node:crypto';

export function dedupeKey(parts: {
  shopId: string;
  resourceType: string;
  resourceId: string;
  templateName: string;
  phoneDigits: string;
  fingerprint: string;
}): string {
  const base = [parts.shopId, parts.resourceType, parts.resourceId, parts.templateName, parts.phoneDigits, parts.fingerprint].join('|');
  return createHash('sha256').update(base, 'utf8').digest('hex');
}

/** A confirmed resend: unique per request, so it never collides with the original. */
export function resendKey(original: string, clientRequestId: string): string {
  return createHash('sha256').update(`${original}|resend|${clientRequestId}`, 'utf8').digest('hex');
}

/** A pending row older than this is treated as a crashed attempt and failed. */
export const STALE_PENDING_MS = 2 * 60 * 1000;
