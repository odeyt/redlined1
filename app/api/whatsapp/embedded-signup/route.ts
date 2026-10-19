/**
 * POST /api/whatsapp/embedded-signup — finish WhatsApp Business App
 * COEXISTENCE onboarding (Embedded Signup v4) for the shop's existing number.
 *
 * Owner only. The browser runs Meta's Embedded Signup popup; the owner
 * confirms on their phone in the WhatsApp Business App; the popup posts back
 * a one-time code (valid ~30 seconds) and the WABA / phone number ids. This
 * route:
 *
 *   1. accepts ONLY the coexistence finish event
 *      (FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING). Any other outcome — a
 *      Cloud-API-only registration, a new number, a migration — is refused
 *      and nothing is stored: those would move the number off the app or
 *      onboard something the owner did not ask for;
 *   2. requires the eligibility checklist to be complete and a successful
 *      sandbox test delivery first;
 *   3. exchanges the code for a business token (server to server);
 *   4. asks Meta about the number and requires is_on_biz_app=true and
 *      platform_type=CLOUD_API — proof the number is in coexistence;
 *   5. subscribes this app to the account's webhooks;
 *   6. stores the connection SWITCHED OFF, in SANDBOX mode.
 *
 * It never calls /register (the number is already registered by the app —
 * Meta's coexistence guide says to skip it) and never /deregister.
 */
import { NextRequest, NextResponse } from 'next/server';
import { parseJsonBody, sanitizeError, isRateLimited } from '@/lib/apiHelpers';
import { requireWhatsAppAccess, adminDb, transport, NO_STORE } from '@/lib/whatsapp/server';
import { EmbeddedSignupSchema } from '@/lib/whatsapp/schemas';
import { saveConnection } from '@/lib/whatsapp/connect';
import { evaluateEligibility, readyToConnect } from '@/lib/whatsapp/eligibility';
import { serverConfigPresence, COEXISTENCE_EVENT } from '@/lib/whatsapp/config';
import { TokenKeyMissingError } from '@/lib/whatsapp/tokenCrypto';

export const dynamic = 'force-dynamic';
const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: NO_STORE });


export async function POST(req: NextRequest) {
  const parsed = await parseJsonBody(req, EmbeddedSignupSchema);
  if (!parsed.ok) return parsed.response;
  const { shopId, code, event, wabaId, phoneNumberId, businessId } = parsed.data;
  const access = await requireWhatsAppAccess(req, shopId, ['owner']);
  if (!access.ok) return access.response;
  if (isRateLimited(`wa-connect:${shopId}`, 10, 60_000)) return json({ error: 'Too many attempts. Wait a minute.' }, 429);

  if (event !== COEXISTENCE_EVENT) {
    return json({
      error: `Embedded Signup finished with "${event}", not the WhatsApp Business App coexistence flow. Nothing was connected. In the popup, choose "Connect your existing WhatsApp Business App".`,
    }, 409);
  }

  const db = adminDb();
  try {
    const { data: c, error } = await db.from('whatsapp_connections')
      .select('business_phone_digits, attestations, webhook_verified_at').eq('shop_id', shopId).maybeSingle();
    if (error) throw error;
    const items = evaluateEligibility({
      businessPhoneDigits: c?.business_phone_digits ?? null,
      attestations: c?.attestations ?? {},
      server: serverConfigPresence(),
      webhookVerified: !!c?.webhook_verified_at,
    });
    if (!readyToConnect(items)) return json({ error: 'Complete the eligibility checklist before connecting the shop number.' }, 409);

    const { data: passed, error: pErr } = await db.from('whatsapp_messages').select('id')
      .eq('shop_id', shopId).eq('mode', 'sandbox').in('status', ['delivered', 'read']).limit(1);
    if (pErr) throw pErr;
    if (!(passed ?? []).length) return json({ error: 'Send and receive one sandbox test message before connecting the shop number.' }, 409);
  } catch (e) {
    return json({ error: sanitizeError(e, 'whatsapp/embedded-signup:precheck', 'Could not check readiness') }, 500);
  }

  const t = transport();
  const exchanged = await t.exchangeCode({ code });
  if (!exchanged.ok) return json({ error: `Meta did not accept the signup code (it expires after about 30 seconds): ${exchanged.error.title}` }, 400);
  const token = exchanged.data.accessToken;

  const phone = await t.getPhoneNumber({ token, phoneNumberId });
  if (!phone.ok) return json({ error: `Could not read the phone number from Meta: ${phone.error.title}` }, 400);
  if (phone.data.isOnBizApp !== true || phone.data.platformType !== 'CLOUD_API') {
    return json({
      error: `Meta reports is_on_biz_app=${String(phone.data.isOnBizApp)}, platform_type=${phone.data.platformType ?? 'unknown'}. That is not coexistence, so RedlineD1 did not store the connection. Check the WhatsApp Business App on the shop phone before trying again.`,
    }, 409);
  }

  const sub = await t.subscribeApp({ token, wabaId });
  if (!sub.ok) return json({ error: `Could not subscribe to the account's webhooks: ${sub.error.title}` }, 400);

  try {
    const saved = await saveConnection(db, {
      shopId, userId: access.context.userId, wabaId, businessId, phone: phone.data,
      onboardingType: 'coexistence', token, tokenKind: 'business_token',
    });
    if (!saved.ok) throw saved.error;
    return json({ success: true, displayPhoneNumber: phone.data.displayPhoneNumber, isOnBizApp: true });
  } catch (e) {
    if (e instanceof TokenKeyMissingError) return json({ error: e.message }, 500);
    return json({ error: sanitizeError(e, 'whatsapp/embedded-signup:save', 'Could not save the connection') }, 500);
  }
}
