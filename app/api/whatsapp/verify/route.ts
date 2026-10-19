/**
 * POST /api/whatsapp/verify — re-read the connected number from Meta and
 * refresh template approval statuses. Owner only. Read-only towards Meta.
 *
 * If a coexistence connection no longer reports is_on_biz_app=true /
 * platform_type=CLOUD_API (the owner disconnected in the app, or Meta
 * disconnected it after ~14 days of phone inactivity), the connection is
 * marked needs_attention and switched OFF, so nothing more is sent.
 */
import { NextRequest, NextResponse } from 'next/server';
import { parseJsonBody, sanitizeError, isRateLimited } from '@/lib/apiHelpers';
import { requireWhatsAppAccess, adminDb, transport, NO_STORE } from '@/lib/whatsapp/server';
import { ConnectionQuerySchema } from '@/lib/whatsapp/schemas';
import { syncTemplateStatuses } from '@/lib/whatsapp/connect';
import { decryptToken } from '@/lib/whatsapp/tokenCrypto';
import { TEMPLATE_NAMES } from '@/lib/whatsapp/templates';

export const dynamic = 'force-dynamic';
const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: NO_STORE });

export async function POST(req: NextRequest) {
  const parsed = await parseJsonBody(req, ConnectionQuerySchema.strict());
  if (!parsed.ok) return parsed.response;
  const access = await requireWhatsAppAccess(req, parsed.data.shopId, ['owner']);
  if (!access.ok) return access.response;
  const { shopId } = access;
  if (isRateLimited(`wa-verify:${shopId}`, 10, 60_000)) return json({ error: 'Too many attempts. Wait a minute.' }, 429);
  const db = adminDb();

  try {
    const [{ data: c, error }, { data: s, error: sErr }] = await Promise.all([
      db.from('whatsapp_connections').select('phone_number_id, waba_id, onboarding_type, status').eq('shop_id', shopId).maybeSingle(),
      db.from('whatsapp_connection_secrets').select('access_token_enc').eq('shop_id', shopId).maybeSingle(),
    ]);
    if (error || sErr) throw error ?? sErr;
    if (!c?.phone_number_id || !s?.access_token_enc) return json({ error: 'Not connected.' }, 409);

    const token = decryptToken(s.access_token_enc);
    const t = transport();
    const phone = await t.getPhoneNumber({ token, phoneNumberId: c.phone_number_id });
    const now = new Date().toISOString();
    if (!phone.ok) {
      await db.from('whatsapp_connections').update({ status: 'needs_attention', enabled: false, automations_enabled: false, last_verified_at: now, updated_at: now }).eq('shop_id', shopId);
      return json({ error: `Meta could not confirm the number: ${phone.error.title}. WhatsApp sending was switched off.` }, 502);
    }

    const coexistenceLost = c.onboarding_type === 'coexistence' && (phone.data.isOnBizApp !== true || phone.data.platformType !== 'CLOUD_API');
    const update: Record<string, unknown> = {
      display_phone_number: phone.data.displayPhoneNumber,
      verified_name: phone.data.verifiedName,
      quality_rating: phone.data.qualityRating,
      messaging_limit_tier: phone.data.messagingLimitTier,
      platform_type: phone.data.platformType,
      is_on_biz_app: phone.data.isOnBizApp,
      code_verification_status: phone.data.codeVerificationStatus,
      name_status: phone.data.nameStatus,
      last_verified_at: now,
      updated_at: now,
      ...(coexistenceLost ? { status: 'needs_attention', enabled: false, automations_enabled: false, mode: 'sandbox', live_approved_at: null, live_approved_by: null } : {}),
    };
    const { error: upErr } = await db.from('whatsapp_connections').update(update).eq('shop_id', shopId);
    if (upErr) throw upErr;

    let templatesSynced = 0;
    if (c.waba_id) {
      const list = await t.listTemplates({ token, wabaId: c.waba_id });
      if (list.ok) {
        const synced = await syncTemplateStatuses(db, shopId, list.data, TEMPLATE_NAMES);
        if (synced.ok) templatesSynced = synced.count;
      }
    }

    return json({
      success: true,
      coexistenceLost,
      isOnBizApp: phone.data.isOnBizApp,
      platformType: phone.data.platformType,
      qualityRating: phone.data.qualityRating,
      messagingLimitTier: phone.data.messagingLimitTier,
      templatesSynced,
    });
  } catch (e) {
    return json({ error: sanitizeError(e, 'whatsapp/verify:POST', 'Could not verify the connection') }, 500);
  }
}
