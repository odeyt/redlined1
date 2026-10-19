/**
 * GET /api/whatsapp/messages?shopId&resourceType&resourceId&language —
 * everything the Send WhatsApp dialog shows for one document, computed by
 * the same code the send uses: who it would go to (masked), consent, template
 * approval, the exact preview text, whether it would be a duplicate, and the
 * delivery history of earlier sends.
 *
 * Owner/manager/advisor. Read-only. Never returns a full customer number or a
 * portal token.
 */
import { NextRequest, NextResponse } from 'next/server';
import { sanitizeError } from '@/lib/apiHelpers';
import { requireWhatsAppAccess, sendDeps, NO_STORE } from '@/lib/whatsapp/server';
import { MessagesQuerySchema } from '@/lib/whatsapp/schemas';
import { loadConnection, previewParams } from '@/lib/whatsapp/sendService';
import { sendBlocker } from '@/lib/whatsapp/status';
import { normalizePhone, maskPhone } from '@/lib/whatsapp/phone';
import { TEMPLATES, renderPreview } from '@/lib/whatsapp/templates';
import { dedupeKey } from '@/lib/whatsapp/dedupe';

export const dynamic = 'force-dynamic';
const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: NO_STORE });

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const check = MessagesQuerySchema.safeParse({
    shopId: sp.get('shopId'), resourceType: sp.get('resourceType'), resourceId: sp.get('resourceId'), language: sp.get('language') ?? undefined,
  });
  if (!check.success) return json({ error: 'Invalid request' }, 400);
  const q = check.data;
  const access = await requireWhatsAppAccess(req, q.shopId, ['owner', 'manager', 'advisor']);
  if (!access.ok) return access.response;
  const deps = sendDeps();
  const { db } = deps;

  try {
    const conn = await loadConnection(db, access.shopId);
    if (!conn.ok) throw conn.error;
    const c = conn.row;

    const pv = await previewParams(deps, access.shopId, q.resourceType, q.resourceId, q.language);
    if (!pv.ok) return pv.reason === 'not_found' ? json({ error: 'Document not found.' }, 404) : json({ error: 'Could not load the document.' }, 500);
    const def = TEMPLATES[pv.kind];
    const phone = normalizePhone(pv.doc.phoneRaw);

    const [consentRes, tplRes, histRes] = await Promise.all([
      phone
        ? db.from('whatsapp_consents').select('status, source, opted_in_at, opted_out_at').eq('shop_id', access.shopId).eq('phone_digits', phone.e164Digits).maybeSingle()
        : Promise.resolve({ data: null, error: null }),
      db.from('whatsapp_templates').select('status').eq('shop_id', access.shopId).eq('name', def.name).eq('language', q.language).maybeSingle(),
      db.from('whatsapp_messages')
        .select('id, status, mode, trigger, template_language, to_phone_digits, created_at, sent_at, delivered_at, read_at, failed_at, error_code, error_title, dedupe_key')
        .eq('shop_id', access.shopId).eq('resource_type', q.resourceType).eq('resource_id', q.resourceId)
        .order('created_at', { ascending: false }).limit(10),
    ]);
    if (consentRes.error || tplRes.error || histRes.error) throw consentRes.error ?? tplRes.error ?? histRes.error;

    const key = phone ? dedupeKey({
      shopId: access.shopId, resourceType: q.resourceType, resourceId: q.resourceId,
      templateName: def.name, phoneDigits: phone.e164Digits, fingerprint: pv.doc.fingerprint,
    }) : null;
    const history = (histRes.data ?? []) as Array<Record<string, string | null>>;
    const dup = key ? history.find(h => h.dedupe_key === key && h.status !== 'failed') : undefined;

    let linkIssue: string | null = null;
    if (def.button) {
      if (!pv.doc.customerId) linkIssue = 'Link this document to a customer record before sending it.';
      else if (pv.doc.customerShopId !== pv.doc.resourceShopId) linkIssue = 'This document is not visible in the customer\'s portal yet (different location than the customer record). Send it by email for now.';
    }

    const sandboxBlocked = !!(c && c.mode === 'sandbox' && phone && !(c.sandbox_recipients ?? []).includes(phone.e164Digits));

    return json({
      canSend: !sendBlocker(c, deps.liveSendingEnv),
      sendBlocker: sendBlocker(c, deps.liveSendingEnv),
      mode: c?.mode ?? 'sandbox',
      sandboxBlocked,
      recipient: phone ? { masked: maskPhone(phone.e164Digits), name: pv.doc.customerName } : null,
      consent: consentRes.data ? { status: consentRes.data.status, source: consentRes.data.source, optedInAt: consentRes.data.opted_in_at, optedOutAt: consentRes.data.opted_out_at } : null,
      template: { name: def.name, language: q.language, status: (tplRes.data?.status as string) ?? 'NOT_SUBMITTED' },
      preview: renderPreview(pv.kind, q.language, pv.params),
      buttonLabel: def.button ? def.button.text[q.language] : null,
      linkIssue,
      duplicate: dup ? { status: dup.status, sentAt: dup.sent_at ?? dup.created_at } : null,
      history: history.map(h => ({
        id: h.id, status: h.status, mode: h.mode, trigger: h.trigger, language: h.template_language,
        toMasked: maskPhone(h.to_phone_digits ?? ''), createdAt: h.created_at, sentAt: h.sent_at,
        deliveredAt: h.delivered_at, readAt: h.read_at, failedAt: h.failed_at,
        error: h.error_title ? `${h.error_title}${h.error_code ? ` (${h.error_code})` : ''}` : null,
      })),
    });
  } catch (e) {
    return json({ error: sanitizeError(e, 'whatsapp/messages:GET', 'Could not load WhatsApp status') }, 500);
  }
}
