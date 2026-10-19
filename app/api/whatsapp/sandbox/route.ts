/**
 * POST /api/whatsapp/sandbox — connect Meta's TEST phone number (App
 * Dashboard → WhatsApp → API Setup) so the whole pipeline — templates, sends,
 * delivery webhooks, consent, duplicates — can be proven before the shop's
 * real number is touched.
 *
 * Owner only. Meta is asked about the number before anything is stored; a
 * number Meta reports as on the WhatsApp Business App (is_on_biz_app) is
 * REFUSED here — the shop's real number may only be connected through
 * coexistence onboarding, never pasted in as a "test" number.
 *
 * Subscribes this app to the test account's webhooks so delivery statuses
 * arrive. Never calls /register.
 */
import { NextRequest, NextResponse } from 'next/server';
import { parseJsonBody, sanitizeError, isRateLimited } from '@/lib/apiHelpers';
import { requireWhatsAppAccess, adminDb, transport, NO_STORE } from '@/lib/whatsapp/server';
import { SandboxConnectSchema } from '@/lib/whatsapp/schemas';
import { saveConnection } from '@/lib/whatsapp/connect';
import { TokenKeyMissingError } from '@/lib/whatsapp/tokenCrypto';

export const dynamic = 'force-dynamic';
const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: NO_STORE });

export async function POST(req: NextRequest) {
  const parsed = await parseJsonBody(req, SandboxConnectSchema);
  if (!parsed.ok) return parsed.response;
  const { shopId, phoneNumberId, wabaId, accessToken, tokenKind } = parsed.data;
  const access = await requireWhatsAppAccess(req, shopId, ['owner']);
  if (!access.ok) return access.response;
  if (isRateLimited(`wa-connect:${shopId}`, 10, 60_000)) return json({ error: 'Too many attempts. Wait a minute.' }, 429);

  const t = transport();
  const phone = await t.getPhoneNumber({ token: accessToken, phoneNumberId });
  if (!phone.ok) return json({ error: `Meta rejected the test credentials: ${phone.error.title}` }, 400);
  if (phone.data.isOnBizApp === true) {
    return json({
      error: 'This number is on the WhatsApp Business App. Connect it with "Connect existing WhatsApp Business App" (coexistence) instead — RedlineD1 never treats the shop number as a test number.',
    }, 409);
  }

  const sub = await t.subscribeApp({ token: accessToken, wabaId });
  if (!sub.ok) return json({ error: `Could not subscribe to the test account's webhooks: ${sub.error.title}` }, 400);

  try {
    const saved = await saveConnection(adminDb(), {
      shopId, userId: access.context.userId, wabaId, phone: phone.data,
      onboardingType: 'sandbox_test_number', token: accessToken, tokenKind,
    });
    if (!saved.ok) throw saved.error;
    return json({ success: true, displayPhoneNumber: phone.data.displayPhoneNumber });
  } catch (e) {
    if (e instanceof TokenKeyMissingError) return json({ error: e.message }, 500);
    return json({ error: sanitizeError(e, 'whatsapp/sandbox:POST', 'Could not save the test connection') }, 500);
  }
}
