/**
 * Cloud API webhook: signature check and payload reading. Pure apart from
 * node:crypto, so the route stays thin and this is unit-tested directly.
 *
 * What RedlineD1 takes from a webhook, and nothing more:
 *   - delivery statuses (sent / delivered / read / failed) for messages it sent;
 *   - opt-out and opt-in keywords from inbound customer messages.
 *
 * Inbound message TEXT is never stored. With coexistence the WhatsApp
 * Business App on the shop's phone remains where conversations happen; the
 * app-mirroring fields Meta adds for coexistence (smb_message_echoes,
 * history, smb_app_state_sync) are acknowledged and counted, not persisted.
 */
import { createHmac, timingSafeEqual } from 'node:crypto';

/** Verifies X-Hub-Signature-256 ("sha256=<hex>") over the raw request body. */
export function verifySignature(rawBody: string, header: string | null, appSecret: string): boolean {
  if (!appSecret || !header || !header.startsWith('sha256=')) return false;
  const given = header.slice(7).trim();
  if (!/^[0-9a-f]{64}$/i.test(given)) return false;
  const expected = createHmac('sha256', appSecret).update(rawBody, 'utf8').digest('hex');
  const a = Buffer.from(given.toLowerCase(), 'hex');
  const b = Buffer.from(expected, 'hex');
  return a.length === b.length && timingSafeEqual(a, b);
}

export type DeliveryStatus = 'pending' | 'sent' | 'delivered' | 'read' | 'failed';

export interface StatusEvent {
  phoneNumberId: string;
  wamid: string;
  status: Exclude<DeliveryStatus, 'pending'>;
  at: string;
  errorCode: string | null;
  errorTitle: string | null;
}

export interface KeywordEvent {
  phoneNumberId: string;
  fromDigits: string;
  keyword: 'opt_out' | 'opt_in';
  at: string;
}

export interface AccountEvent {
  wabaId: string;
  event: string;
}

export interface ParsedWebhook {
  statuses: StatusEvent[];
  keywords: KeywordEvent[];
  accountEvents: AccountEvent[];
  /** Fields seen but deliberately not persisted, for logging counts only. */
  ignored: Record<string, number>;
}

const STATUS_VALUES = new Set(['sent', 'delivered', 'read', 'failed']);

// Exact-match keywords (after trimming, case-insensitive). Short and exact on
// purpose: "stop by tomorrow?" must not opt anyone out.
const OPT_OUT = new Set(['stop', 'unsubscribe', 'stop all', 'opt out', 'optout', 'ຢຸດ', 'ຍົກເລີກ']);
const OPT_IN = new Set(['start', 'subscribe', 'opt in', 'optin', 'ເລີ່ມ']);

export function detectKeyword(text: unknown): 'opt_out' | 'opt_in' | null {
  if (typeof text !== 'string') return null;
  const t = text.trim().toLowerCase().replace(/[.!]+$/, '');
  if (OPT_OUT.has(t)) return 'opt_out';
  if (OPT_IN.has(t)) return 'opt_in';
  return null;
}

function iso(ts: unknown): string {
  const n = Number(ts);
  return Number.isFinite(n) && n > 0 ? new Date(n * 1000).toISOString() : new Date().toISOString();
}

/* eslint-disable @typescript-eslint/no-explicit-any */
export function parseWebhook(payload: any): ParsedWebhook {
  const out: ParsedWebhook = { statuses: [], keywords: [], accountEvents: [], ignored: {} };
  if (!payload || payload.object !== 'whatsapp_business_account' || !Array.isArray(payload.entry)) return out;

  for (const entry of payload.entry) {
    for (const change of Array.isArray(entry?.changes) ? entry.changes : []) {
      const field = String(change?.field ?? '');
      const value = change?.value ?? {};

      if (field === 'messages') {
        const phoneNumberId = String(value?.metadata?.phone_number_id ?? '');
        for (const s of Array.isArray(value.statuses) ? value.statuses : []) {
          if (!s?.id || !STATUS_VALUES.has(s.status)) continue;
          const err = Array.isArray(s.errors) ? s.errors[0] : null;
          out.statuses.push({
            phoneNumberId,
            wamid: String(s.id),
            status: s.status,
            at: iso(s.timestamp),
            errorCode: err?.code != null ? String(err.code) : null,
            errorTitle: err?.title ? String(err.title).slice(0, 200) : null,
          });
        }
        for (const m of Array.isArray(value.messages) ? value.messages : []) {
          const body = m?.type === 'text' ? m?.text?.body : m?.type === 'button' ? m?.button?.text : null;
          const keyword = detectKeyword(body);
          if (keyword && m?.from) {
            out.keywords.push({ phoneNumberId, fromDigits: String(m.from).replace(/\D/g, ''), keyword, at: iso(m.timestamp) });
          }
        }
        continue;
      }

      if (field === 'account_update') {
        out.accountEvents.push({ wabaId: String(entry?.id ?? ''), event: String(value?.event ?? 'unknown').slice(0, 80) });
        continue;
      }

      out.ignored[field || 'unknown'] = (out.ignored[field || 'unknown'] ?? 0) + 1;
    }
  }
  return out;
}
/* eslint-enable @typescript-eslint/no-explicit-any */

const RANK: Record<DeliveryStatus, number> = { pending: 0, sent: 1, delivered: 2, read: 3, failed: 1.5 };

/**
 * Whether a status update may replace the stored one. Webhooks arrive out of
 * order and are retried: "delivered" after "read" must not move a message
 * backwards. "failed" can follow "sent" (Meta accepted it, then could not
 * deliver), but never undoes "delivered" or "read".
 */
export function shouldApplyStatus(current: DeliveryStatus, next: DeliveryStatus): boolean {
  if (current === next) return false;
  if (next === 'failed') return current === 'pending' || current === 'sent';
  if (current === 'failed') return false;
  return RANK[next] > RANK[current];
}
