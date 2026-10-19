/**
 * POST /api/whatsapp/consent — staff record that a document's customer opted
 * in to, or out of, WhatsApp messages. Owner/manager/advisor.
 *
 * The number is resolved from the document server-side (never sent by the
 * client). Every change is appended to whatsapp_consent_events, which cannot
 * be edited or deleted. Opting a customer back in after they opted out needs
 * a note saying how they asked (Meta requires opt-in to be explicit).
 */
import { NextRequest, NextResponse } from 'next/server';
import { parseJsonBody, sanitizeError } from '@/lib/apiHelpers';
import { requireWhatsAppAccess, sendDeps, NO_STORE } from '@/lib/whatsapp/server';
import { ConsentSchema } from '@/lib/whatsapp/schemas';
import { recordConsent } from '@/lib/whatsapp/sendService';
import { resolveDocument } from '@/lib/whatsapp/resolveDocument';
import { normalizePhone, maskPhone } from '@/lib/whatsapp/phone';

export const dynamic = 'force-dynamic';
const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: NO_STORE });

export async function POST(req: NextRequest) {
  const parsed = await parseJsonBody(req, ConsentSchema);
  if (!parsed.ok) return parsed.response;
  const b = parsed.data;
  const access = await requireWhatsAppAccess(req, b.shopId, ['owner', 'manager', 'advisor']);
  if (!access.ok) return access.response;
  if (b.status === 'opted_out' && b.source !== 'staff_opt_out') return json({ error: 'Use source staff_opt_out for an opt-out.' }, 400);
  if (b.status === 'opted_in' && b.source === 'staff_opt_out') return json({ error: 'Choose how the customer agreed.' }, 400);

  const deps = sendDeps();
  try {
    const scope = await deps.scope(access.shopId);
    const res = await resolveDocument(deps.db, scope, b.resourceType, b.resourceId);
    if (!res.ok) return res.reason === 'not_found' ? json({ error: 'Document not found.' }, 404) : json({ error: 'Could not load the document.' }, 500);
    const phone = normalizePhone(res.doc.phoneRaw);
    if (!phone) return json({ error: 'No usable mobile number on file for this customer.' }, 422);

    const { data: current, error } = await deps.db.from('whatsapp_consents').select('status').eq('shop_id', access.shopId).eq('phone_digits', phone.e164Digits).maybeSingle();
    if (error) throw error;
    if (b.status === 'opted_in' && current?.status === 'opted_out' && !b.note) {
      return json({ error: 'This customer opted out before. Add a note saying how they asked to receive WhatsApp messages again.' }, 400);
    }

    const rec = await recordConsent(deps.db, {
      shopId: access.shopId, phoneDigits: phone.e164Digits, customerId: res.doc.customerId,
      status: b.status, source: b.source, note: b.note ?? null, recordedBy: access.context.userId, at: new Date(),
    });
    if (!rec.ok) return json({ error: 'Could not record consent.' }, 500);
    return json({ success: true, status: b.status, recipient: maskPhone(phone.e164Digits) });
  } catch (e) {
    return json({ error: sanitizeError(e, 'whatsapp/consent:POST', 'Could not record consent') }, 500);
  }
}
