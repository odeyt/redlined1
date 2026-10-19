/**
 * POST /api/whatsapp/send — staff send one estimate, invoice or repair update
 * to the document's customer as an approved WhatsApp template.
 *
 * Owner/manager/advisor of the merged D1 Imports shop. Body names only the
 * document (resourceType, resourceId), the language and a per-dialog
 * clientRequestId; recipient, content and link are resolved server-side
 * (lib/whatsapp/sendService.ts lists every gate). `.strict()`: a `to` or
 * `text` field is a 400.
 */
import { NextRequest, NextResponse } from 'next/server';
import { parseJsonBody, sanitizeError, isRateLimited } from '@/lib/apiHelpers';
import { requireWhatsAppAccess, sendDeps, NO_STORE } from '@/lib/whatsapp/server';
import { SendSchema } from '@/lib/whatsapp/schemas';
import { sendDocumentMessage } from '@/lib/whatsapp/sendService';

export const dynamic = 'force-dynamic';
const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: NO_STORE });

export async function POST(req: NextRequest) {
  const parsed = await parseJsonBody(req, SendSchema);
  if (!parsed.ok) return parsed.response;
  const b = parsed.data;
  const access = await requireWhatsAppAccess(req, b.shopId, ['owner', 'manager', 'advisor']);
  if (!access.ok) return access.response;
  if (isRateLimited(`wa-send:${b.shopId}`, 30, 60_000)) return json({ error: 'Too many messages. Try again in a minute.' }, 429);

  try {
    const out = await sendDocumentMessage(sendDeps(), {
      shopId: access.shopId,
      userId: access.context.userId,
      resourceType: b.resourceType,
      resourceId: b.resourceId,
      language: b.language,
      clientRequestId: b.clientRequestId,
      confirmResend: b.confirmResend,
      trigger: 'manual',
      recordConsent: b.recordConsent,
    });
    if (!out.ok) return json({ error: out.error, code: out.code, duplicate: out.duplicate }, out.httpStatus);
    return json({ success: true, message: out.message, replay: !!out.replay });
  } catch (e) {
    return json({ error: sanitizeError(e, 'whatsapp/send:POST', 'Could not send the WhatsApp message') }, 500);
  }
}
