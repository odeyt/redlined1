/**
 * Storing a connection after Meta has confirmed the phone number — shared by
 * the sandbox (Meta test number) and coexistence (Embedded Signup) paths.
 *
 * A new connection always starts SWITCHED OFF and in SANDBOX mode, whatever
 * the onboarding path. In sandbox mode the send service only messages the
 * owner's allow-listed test numbers, so connecting the real shop number
 * cannot message a customer until the owner both switches it on and approves
 * live mode.
 *
 * Templates are per WhatsApp Business Account: when the WABA changes (sandbox
 * test account → the shop's own account), the old template statuses are
 * dropped so nothing is sent on an approval that belongs to another account.
 */
import 'server-only';
import { encryptToken } from './tokenCrypto';
import type { PhoneNumberInfo } from './cloudApi';
import type { Db } from './sendService';

export async function saveConnection(db: Db, args: {
  shopId: string;
  userId: string;
  wabaId: string;
  businessId?: string | null;
  phone: PhoneNumberInfo;
  onboardingType: 'coexistence' | 'sandbox_test_number';
  token: string;
  tokenKind: 'business_token' | 'system_user' | 'sandbox_temporary';
}): Promise<{ ok: true } | { ok: false; error: unknown }> {
  const now = new Date().toISOString();
  const tokenEnc = encryptToken(args.token);

  const { data: prev, error: prevErr } = await db.from('whatsapp_connections').select('waba_id').eq('shop_id', args.shopId).maybeSingle();
  if (prevErr) return { ok: false, error: prevErr };

  const { error } = await db.from('whatsapp_connections').upsert({
    shop_id: args.shopId,
    status: 'connected',
    mode: 'sandbox',
    onboarding_type: args.onboardingType,
    enabled: false,
    automations_enabled: false,
    live_approved_by: null,
    live_approved_at: null,
    waba_id: args.wabaId,
    business_id: args.businessId ?? null,
    phone_number_id: args.phone.id,
    display_phone_number: args.phone.displayPhoneNumber,
    verified_name: args.phone.verifiedName,
    quality_rating: args.phone.qualityRating,
    messaging_limit_tier: args.phone.messagingLimitTier,
    platform_type: args.phone.platformType,
    is_on_biz_app: args.phone.isOnBizApp,
    code_verification_status: args.phone.codeVerificationStatus,
    name_status: args.phone.nameStatus,
    last_verified_at: now,
    connected_by: args.userId,
    connected_at: now,
    updated_by: args.userId,
    updated_at: now,
  }, { onConflict: 'shop_id' });
  if (error) return { ok: false, error };

  const { error: sErr } = await db.from('whatsapp_connection_secrets').upsert({
    shop_id: args.shopId,
    access_token_enc: tokenEnc,
    token_kind: args.tokenKind,
    // Meta's temporary test tokens last 24 hours.
    token_expires_at: args.tokenKind === 'sandbox_temporary' ? new Date(Date.now() + 23 * 3600_000).toISOString() : null,
    updated_by: args.userId,
    updated_at: now,
  }, { onConflict: 'shop_id' });
  if (sErr) return { ok: false, error: sErr };

  if (prev?.waba_id && prev.waba_id !== args.wabaId) {
    const { error: tErr } = await db.from('whatsapp_templates').delete().eq('shop_id', args.shopId);
    if (tErr) return { ok: false, error: tErr };
  }
  return { ok: true };
}

/** Writes Meta's template list into whatsapp_templates for the names RedlineD1 owns. */
export async function syncTemplateStatuses(db: Db, shopId: string, rows: Array<{ name: string; language: string; status: string; category: string | null; id: string | null; rejectedReason: string | null }>, ownNames: readonly string[]) {
  const now = new Date().toISOString();
  const mine = rows.filter(r => ownNames.includes(r.name));
  if (!mine.length) return { ok: true as const, count: 0 };
  const { error } = await db.from('whatsapp_templates').upsert(mine.map(r => ({
    shop_id: shopId, name: r.name, language: r.language, status: r.status, category: r.category,
    meta_template_id: r.id, rejected_reason: r.rejectedReason, last_synced_at: now,
  })), { onConflict: 'shop_id,name,language' });
  if (error) return { ok: false as const, error };
  return { ok: true as const, count: mine.length };
}
