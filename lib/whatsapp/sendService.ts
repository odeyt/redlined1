/**
 * Sends one WhatsApp template message about one document — the single path
 * every manual and automated send goes through.
 *
 * Gates, in order (each one refuses with its own code; nothing is sent):
 *   connection   a connected connection exists for this shop          not_connected
 *   master       the Settings master switch is on                      disabled
 *   automation   automated sends also need automations switched on     automations_disabled
 *   live         live mode needs owner approval + coexistence verified
 *                + WHATSAPP_LIVE_SENDING_ENABLED                       live_not_approved
 *   document     resolves in the merged-shop scope                     not_found
 *   phone        the customer has a usable phone number                no_phone
 *   sandbox      sandbox mode only sends to allow-listed test numbers  sandbox_recipient_not_allowed
 *   consent      the number opted in (staff may record it inline for
 *                a manual send); an opt-out is final                   consent_required / opted_out
 *   template     the template is APPROVED by Meta for that language    template_not_approved
 *   link         a secure portal link exists for the document          portal_link_unavailable
 *   duplicate    the same content was not already sent                 duplicate
 *
 * The pilot allowlist, feature flag, entitlement and caller's role are
 * checked by the route before this runs (they need the request).
 *
 * Nothing in the message is caller-supplied (see resolveDocument.ts). The
 * access token is decrypted only here, only after every gate has passed.
 */
import { normalizePhone, maskPhone } from './phone';
import { TEMPLATES, REPAIR_STAGE_TEXT, buildTemplateMessage, type TemplateKind, type TemplateLanguage } from './templates';
import { resolveDocument, type ResourceType, type ResolvedDocument } from './resolveDocument';
import { dedupeKey, resendKey, STALE_PENDING_MS } from './dedupe';
import type { WhatsAppTransport } from './cloudApi';

/* eslint-disable @typescript-eslint/no-explicit-any */
export type Db = { from(table: string): any };

export const CONNECTION_COLUMNS =
  'shop_id, status, mode, onboarding_type, enabled, automations_enabled, automation_settings, waba_id, phone_number_id, display_phone_number, verified_name, is_on_biz_app, platform_type, sandbox_recipients, live_approved_at, live_approved_by';

export interface ConnectionRow {
  shop_id: string;
  status: string;
  mode: 'sandbox' | 'live';
  onboarding_type: 'coexistence' | 'sandbox_test_number' | null;
  enabled: boolean;
  automations_enabled: boolean;
  automation_settings: Record<string, unknown> | null;
  waba_id: string | null;
  phone_number_id: string | null;
  display_phone_number: string | null;
  verified_name: string | null;
  is_on_biz_app: boolean | null;
  platform_type: string | null;
  sandbox_recipients: string[] | null;
  live_approved_at: string | null;
  live_approved_by: string | null;
}

export interface SendDeps {
  db: Db;
  transport: WhatsAppTransport;
  decryptToken: (enc: string) => string;
  portalToken: (customerId: string) => Promise<string>;
  scope: (shopId: string) => Promise<string[]>;
  shopName: (shopId: string) => Promise<string>;
  liveSendingEnv: boolean;
  now?: () => Date;
}

export interface SendRequest {
  shopId: string;
  userId: string | null;
  resourceType: ResourceType;
  resourceId: string;
  language: TemplateLanguage;
  clientRequestId: string;
  confirmResend?: boolean;
  trigger: 'manual' | 'automated';
  /** Manual sends only: staff record the customer's opt-in at the same time. */
  recordConsent?: { source: 'staff_verbal' | 'staff_written'; note?: string };
}

export type SendErrorCode =
  | 'not_connected' | 'disabled' | 'automations_disabled' | 'live_not_approved'
  | 'not_found' | 'no_phone' | 'sandbox_recipient_not_allowed'
  | 'consent_required' | 'opted_out' | 'template_not_approved'
  | 'portal_link_unavailable' | 'duplicate' | 'token_unavailable'
  | 'send_failed' | 'db_error';

export interface SentMessage {
  id: string;
  status: string;
  wamid: string | null;
  mode: 'sandbox' | 'live';
  toMasked: string;
  createdAt: string;
}

export type SendOutcome =
  | { ok: true; message: SentMessage; replay?: boolean }
  | { ok: false; code: SendErrorCode; httpStatus: number; error: string; duplicate?: { sentAt: string | null; status: string } };

const fail = (code: SendErrorCode, httpStatus: number, error: string, extra: Partial<Extract<SendOutcome, { ok: false }>> = {}): SendOutcome =>
  ({ ok: false, code, httpStatus, error, ...extra });

export function templateKindFor(resourceType: ResourceType): TemplateKind {
  return resourceType === 'estimate' ? 'estimate_ready' : resourceType === 'invoice' ? 'invoice_ready' : 'repair_update';
}

/** Why live mode cannot send right now, or null when it can. */
export function liveBlocker(c: ConnectionRow, liveSendingEnv: boolean): string | null {
  if (c.mode !== 'live') return null;
  if (!c.live_approved_at || !c.live_approved_by) return 'The owner has not approved live customer messages.';
  if (c.onboarding_type !== 'coexistence') return 'Live mode needs a coexistence connection to the shop number.';
  if (c.is_on_biz_app !== true || c.platform_type !== 'CLOUD_API') return 'Meta does not report the number in coexistence. Run Verify connection.';
  if (!liveSendingEnv) return 'Live sending is switched off for this deployment (WHATSAPP_LIVE_SENDING_ENABLED).';
  return null;
}

export async function loadConnection(db: Db, shopId: string): Promise<{ ok: true; row: ConnectionRow | null } | { ok: false; error: unknown }> {
  const { data, error } = await db.from('whatsapp_connections').select(CONNECTION_COLUMNS).eq('shop_id', shopId).maybeSingle();
  if (error) return { ok: false, error };
  return { ok: true, row: (data as ConnectionRow | null) ?? null };
}

function templateParams(kind: TemplateKind, lang: TemplateLanguage, doc: ResolvedDocument, shopName: string): string[] {
  const name = doc.customerName || (lang === 'lo' ? 'ລູກຄ້າ' : 'Customer');
  const vehicle = doc.vehicle || (lang === 'lo' ? 'ລົດຂອງທ່ານ' : 'your vehicle');
  if (kind === 'repair_update') {
    const stage = REPAIR_STAGE_TEXT[doc.repairStage ?? ''] ?? REPAIR_STAGE_TEXT.checked_in;
    return [name, vehicle, shopName, stage[lang]];
  }
  return [name, doc.number, shopName, vehicle, doc.totalText ?? '-'];
}

/** Builds the exact parameters a send would use — for the dialog preview. Same code path as sending. */
export async function previewParams(deps: SendDeps, shopId: string, resourceType: ResourceType, resourceId: string, lang: TemplateLanguage) {
  const scope = await deps.scope(shopId);
  const res = await resolveDocument(deps.db, scope, resourceType, resourceId);
  if (!res.ok) return res;
  const kind = templateKindFor(resourceType);
  return { ok: true as const, doc: res.doc, kind, params: templateParams(kind, lang, res.doc, await deps.shopName(shopId)) };
}

function toSent(row: any): SentMessage {
  return {
    id: row.id, status: row.status, wamid: row.wamid ?? null, mode: row.mode,
    toMasked: maskPhone(row.to_phone_digits ?? ''), createdAt: row.created_at,
  };
}

const MESSAGE_COLUMNS = 'id, status, wamid, mode, to_phone_digits, created_at, sent_at, client_request_id';

export async function sendDocumentMessage(deps: SendDeps, req: SendRequest): Promise<SendOutcome> {
  const { db } = deps;
  const now = deps.now ?? (() => new Date());

  // ── connection gates ──────────────────────────────────────────────────
  const conn = await loadConnection(db, req.shopId);
  if (!conn.ok) return fail('db_error', 500, 'Could not load the WhatsApp connection.');
  const c = conn.row;
  if (!c || c.status !== 'connected' || !c.phone_number_id) return fail('not_connected', 409, 'WhatsApp Business is not connected. Connect it in Settings → Integrations.');
  if (!c.enabled) return fail('disabled', 409, 'WhatsApp Business is switched off in Settings → Integrations.');
  if (req.trigger === 'automated' && !c.automations_enabled) return fail('automations_disabled', 409, 'Automated WhatsApp notifications are not activated.');
  const blocker = liveBlocker(c, deps.liveSendingEnv);
  if (blocker) return fail('live_not_approved', 409, blocker);

  // ── idempotent replay of the same dialog request ──────────────────────
  {
    const { data, error } = await db.from('whatsapp_messages').select(MESSAGE_COLUMNS)
      .eq('shop_id', req.shopId).eq('client_request_id', req.clientRequestId).maybeSingle();
    if (error) return fail('db_error', 500, 'Could not check for an earlier attempt.');
    if (data && data.status !== 'failed') return { ok: true, message: toSent(data), replay: true };
    // The dialog issues a fresh id after a failure; reusing a failed one is a stale retry.
    if (data) return fail('send_failed', 409, 'That attempt already failed. Close the dialog and try again.');
  }

  // ── document + recipient ──────────────────────────────────────────────
  const scope = await deps.scope(req.shopId);
  const resolved = await resolveDocument(db, scope, req.resourceType, req.resourceId);
  if (!resolved.ok) {
    return resolved.reason === 'not_found'
      ? fail('not_found', 404, 'Document not found.')
      : fail('db_error', 500, 'Could not load the document.');
  }
  const doc = resolved.doc;
  const phone = normalizePhone(doc.phoneRaw);
  if (!phone) return fail('no_phone', 422, 'No usable mobile number on file for this customer. Add one with the country code (e.g. +856 20 …).');
  const to = phone.e164Digits;

  if (c.mode === 'sandbox' && !(c.sandbox_recipients ?? []).includes(to)) {
    return fail('sandbox_recipient_not_allowed', 409, `Sandbox mode only sends to the test numbers listed in Settings (this customer: ${maskPhone(to)}).`);
  }

  // ── consent ───────────────────────────────────────────────────────────
  const { data: consent, error: consentErr } = await db.from('whatsapp_consents').select('status, opted_out_at')
    .eq('shop_id', req.shopId).eq('phone_digits', to).maybeSingle();
  if (consentErr) return fail('db_error', 500, 'Could not check consent.');
  if (consent?.status === 'opted_out') return fail('opted_out', 409, 'This customer opted out of WhatsApp messages. Record a new opt-in from the customer before messaging them.');
  if (consent?.status !== 'opted_in') {
    if (req.trigger !== 'manual' || !req.recordConsent) {
      return fail('consent_required', 409, 'The customer has not agreed to WhatsApp messages yet. Confirm their consent in the Send dialog.');
    }
    const rec = await recordConsent(db, {
      shopId: req.shopId, phoneDigits: to, customerId: doc.customerId, status: 'opted_in',
      source: req.recordConsent.source, note: req.recordConsent.note ?? null, recordedBy: req.userId, at: now(),
    });
    if (!rec.ok) return fail('db_error', 500, 'Could not record consent.');
  }

  // ── template ──────────────────────────────────────────────────────────
  const kind = templateKindFor(req.resourceType);
  const def = TEMPLATES[kind];
  const { data: tpl, error: tplErr } = await db.from('whatsapp_templates').select('status')
    .eq('shop_id', req.shopId).eq('name', def.name).eq('language', req.language).maybeSingle();
  if (tplErr) return fail('db_error', 500, 'Could not check the template.');
  if (tpl?.status !== 'APPROVED') {
    return fail('template_not_approved', 409, `Template ${def.name} (${req.language}) is ${tpl?.status ? tpl.status.toLowerCase() : 'not submitted'} — Meta must approve it before it can be sent.`);
  }

  // ── secure link ───────────────────────────────────────────────────────
  let linkSuffix: string | undefined;
  if (def.button) {
    // The portal lists a customer's documents in the customer's own shop.
    // A document in another shop of the merge (e.g. a new invoice for a
    // customer created before the merge) would not be on that page, so the
    // link would not show it. Refuse rather than send a link that misleads.
    if (!doc.customerId) return fail('portal_link_unavailable', 409, 'Link this document to a customer record before sending it.');
    if (doc.customerShopId !== doc.resourceShopId) {
      return fail('portal_link_unavailable', 409, 'This document is not visible in the customer\'s portal yet (it belongs to a different location than the customer record). Send it by email for now.');
    }
    try {
      linkSuffix = await deps.portalToken(doc.customerId);
    } catch {
      return fail('portal_link_unavailable', 500, 'Could not create the secure link.');
    }
  }

  const shopName = await deps.shopName(req.shopId);
  const params = templateParams(kind, req.language, doc, shopName);
  const template = buildTemplateMessage(kind, req.language, params, linkSuffix);

  // ── duplicate prevention ──────────────────────────────────────────────
  const baseKey = dedupeKey({
    shopId: req.shopId, resourceType: req.resourceType, resourceId: req.resourceId,
    templateName: def.name, phoneDigits: to, fingerprint: doc.fingerprint,
  });
  const key = req.confirmResend ? resendKey(baseKey, req.clientRequestId) : baseKey;

  // A pending row this old is a crashed attempt; fail it so it stops blocking.
  await db.from('whatsapp_messages').update({ status: 'failed', error_code: 'stale_pending', error_title: 'Attempt did not complete', failed_at: now().toISOString(), updated_at: now().toISOString() })
    .eq('shop_id', req.shopId).eq('dedupe_key', key).eq('status', 'pending')
    .lt('created_at', new Date(now().getTime() - STALE_PENDING_MS).toISOString());

  const insert = await db.from('whatsapp_messages').insert({
    shop_id: req.shopId,
    resource_type: req.resourceType,
    resource_id: req.resourceId,
    resource_shop_id: doc.resourceShopId,
    customer_id: doc.customerId,
    to_phone_digits: to,
    template_name: def.name,
    template_language: req.language,
    trigger: req.trigger,
    mode: c.mode,
    status: 'pending',
    client_request_id: req.clientRequestId,
    dedupe_key: key,
    sent_by: req.userId,
  }).select(MESSAGE_COLUMNS).single();

  if (insert.error) {
    if (insert.error.code === '23505') {
      const { data: prior } = await db.from('whatsapp_messages').select(MESSAGE_COLUMNS)
        .eq('shop_id', req.shopId).eq('dedupe_key', key).neq('status', 'failed').maybeSingle();
      if (prior && prior.client_request_id === req.clientRequestId) return { ok: true, message: toSent(prior), replay: true };
      return fail('duplicate', 409, 'This message was already sent to this customer. Confirm to send it again.', {
        duplicate: { sentAt: prior?.sent_at ?? prior?.created_at ?? null, status: prior?.status ?? 'sent' },
      });
    }
    return fail('db_error', 500, 'Could not record the message.');
  }
  const row = insert.data;

  const markFailed = async (code: string, title: string) => {
    await db.from('whatsapp_messages').update({ status: 'failed', error_code: code, error_title: title.slice(0, 200), failed_at: now().toISOString(), updated_at: now().toISOString() }).eq('id', row.id);
  };

  // ── token (decrypted only now) ────────────────────────────────────────
  const { data: secret, error: secretErr } = await db.from('whatsapp_connection_secrets').select('access_token_enc, token_expires_at').eq('shop_id', req.shopId).maybeSingle();
  let token = '';
  try {
    if (secretErr || !secret?.access_token_enc) throw new Error('missing');
    if (secret.token_expires_at && new Date(secret.token_expires_at) <= now()) throw new Error('expired');
    token = deps.decryptToken(secret.access_token_enc);
  } catch {
    await markFailed('token_unavailable', 'Access token missing or expired');
    return fail('token_unavailable', 409, 'The WhatsApp access token is missing or expired. Reconnect in Settings → Integrations.');
  }

  // ── send ──────────────────────────────────────────────────────────────
  const sent = await deps.transport.sendTemplate({ token, phoneNumberId: c.phone_number_id, to, template });
  if (!sent.ok) {
    await markFailed(sent.error.code ?? `http_${sent.error.status}`, sent.error.title);
    return fail('send_failed', 502, `Meta did not accept the message: ${sent.error.title}${sent.error.code ? ` (${sent.error.code})` : ''}`);
  }

  const at = now().toISOString();
  const { data: updated } = await db.from('whatsapp_messages')
    .update({ status: 'sent', wamid: sent.data.wamid, sent_at: at, updated_at: at })
    .eq('id', row.id).eq('status', 'pending').select(MESSAGE_COLUMNS).maybeSingle();

  return { ok: true, message: toSent(updated ?? { ...row, status: 'sent', wamid: sent.data.wamid }) };
}

export async function recordConsent(db: Db, c: {
  shopId: string; phoneDigits: string; customerId: string | null; status: 'opted_in' | 'opted_out';
  source: 'staff_verbal' | 'staff_written' | 'customer_form' | 'inbound_keyword' | 'staff_opt_out';
  note: string | null; recordedBy: string | null; at: Date;
}): Promise<{ ok: boolean }> {
  const at = c.at.toISOString();
  const ev = await db.from('whatsapp_consent_events').insert({
    shop_id: c.shopId, phone_digits: c.phoneDigits, customer_id: c.customerId, status: c.status,
    source: c.source, note: c.note, recorded_by: c.recordedBy, created_at: at,
  });
  if (ev.error) return { ok: false };
  const up = await db.from('whatsapp_consents').upsert({
    shop_id: c.shopId, phone_digits: c.phoneDigits, customer_id: c.customerId, status: c.status,
    source: c.source, note: c.note, recorded_by: c.recordedBy, updated_at: at,
    ...(c.status === 'opted_in' ? { opted_in_at: at } : { opted_out_at: at }),
  }, { onConflict: 'shop_id,phone_digits' });
  return { ok: !up.error };
}
/* eslint-enable @typescript-eslint/no-explicit-any */
