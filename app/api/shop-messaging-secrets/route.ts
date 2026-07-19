import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/supabase-server';
import { requireShopRole } from '@/lib/serverAuth';
import { parseJsonBody, sanitizeError } from '@/lib/apiHelpers';
import { ShopMessagingSecretsQuerySchema, ShopMessagingSecretsUpdateSchema } from '@/lib/schemas';

/**
 * GET /api/shop-messaging-secrets — return REDACTED configuration status
 *   for the shop's Twilio/WhatsApp/LINE/Telegram credentials.
 * PUT /api/shop-messaging-secrets — set/update/clear those credentials.
 *
 * Caller: must be authenticated via a valid Supabase bearer token AND hold
 *   role OWNER in the target shop (`shopId`) — stricter than send-message's
 *   owner/manager/advisor and stricter than the read-only
 *   /api/messaging-channels-status (owner/manager/advisor), because this
 *   route can both read configuration status and write live provider
 *   credentials. Provider billing/API access is an owner-level concern,
 *   same tier as invite/member-management.
 * Resource authorized: `shopId`, resolved to the caller's own shop_users
 *   membership via requireShopRole — a manager or advisor gets 403, not a
 *   redacted response; only an owner of the correct shop can reach either
 *   handler at all.
 * Storage: public.shop_messaging_secrets (see
 *   docs/MESSAGING_SECRETS_MIGRATION.sql) — a table with NO anon or
 *   authenticated grants and NO RLS policies at all (default deny). Only
 *   this route's service-role client (createServerSupabase) can reach it;
 *   there is no client-side Supabase query anywhere that could read it,
 *   by construction of the table's grants, not just app-code discipline.
 * GET NEVER returns a secret value. The response shape is
 *   `{ sms: { configured, enabled, fromNumber }, whatsapp: { configured, enabled },
 *      line: { configured, enabled }, telegram: { configured, enabled } }`
 *   — `configured` is a boolean derived from "is the token column
 *   non-null", never the token itself. `fromNumber` is a phone number
 *   (the shop's own Twilio sender number), not a bearer credential — safe
 *   to display so staff can recognize which number is configured.
 * PUT is a PARTIAL update: a field OMITTED from the body means "leave
 *   unchanged"; a field present as an empty string means "clear this
 *   credential" (sets it to NULL). The existing value is NEVER echoed back
 *   in the PUT response, and PUT never returns the value it just set,
 *   either — the response is `{ success: true }` only. This is the
 *   write-only pattern: the browser never receives a live secret from this
 *   route under any circumstance.
 * Never logs a submitted or stored credential value — sanitizeError() logs
 *   only the Postgres error object (column/constraint names at most), never
 *   the request body or row contents.
 */
type SecretsRow = {
  twilio_sid: string | null;
  twilio_token: string | null;
  twilio_from: string | null;
  sms_enabled: boolean;
  whatsapp_enabled: boolean;
  line_token: string | null;
  line_enabled: boolean;
  telegram_bot_token: string | null;
  telegram_enabled: boolean;
};

function toStatus(row: SecretsRow | null) {
  return {
    sms: {
      configured: !!row?.twilio_token,
      enabled: !!row?.sms_enabled,
      fromNumber: row?.twilio_from ?? null,
    },
    whatsapp: {
      // WhatsApp uses the same Twilio credentials as SMS, just a separate enabled flag.
      configured: !!row?.twilio_token,
      enabled: !!row?.whatsapp_enabled,
    },
    line: {
      configured: !!row?.line_token,
      enabled: !!row?.line_enabled,
    },
    telegram: {
      configured: !!row?.telegram_bot_token,
      enabled: !!row?.telegram_enabled,
    },
  };
}

export async function GET(req: NextRequest) {
  const shopIdRaw = req.nextUrl.searchParams.get('shopId');
  const check = ShopMessagingSecretsQuerySchema.safeParse({ shopId: shopIdRaw });
  if (!check.success) return NextResponse.json({ error: 'Missing or invalid shopId' }, { status: 400 });
  const { shopId } = check.data;

  const auth = await requireShopRole(req, shopId, ['owner']);
  if (!auth.ok) return auth.response;

  const admin = createServerSupabase();
  const { data, error } = await admin
    .from('shop_messaging_secrets')
    .select('twilio_sid, twilio_token, twilio_from, sms_enabled, whatsapp_enabled, line_token, line_enabled, telegram_bot_token, telegram_enabled')
    .eq('shop_id', shopId)
    .maybeSingle();

  if (error) {
    return NextResponse.json(
      { error: sanitizeError(error, 'shop-messaging-secrets:GET', 'Unable to load messaging status') },
      { status: 500 },
    );
  }

  return NextResponse.json(toStatus(data as SecretsRow | null));
}

export async function PUT(req: NextRequest) {
  const parsed = await parseJsonBody(req, ShopMessagingSecretsUpdateSchema);
  if (!parsed.ok) return parsed.response;
  const { shopId, ...fields } = parsed.data;

  const auth = await requireShopRole(req, shopId, ['owner']);
  if (!auth.ok) return auth.response;

  // Presence in the parsed body is the signal: a key that's `undefined`
  // (never sent) is left alone; a key sent as `''` clears the credential;
  // any other value replaces it. Never trusts the CALLER'S identity from
  // this body — `shopId` is only a resource identifier, already verified
  // against the caller's own membership by requireShopRole above.
  const update: Record<string, unknown> = { updated_at: new Date().toISOString(), updated_by: auth.context.userId };
  if (fields.twilioSid !== undefined) update.twilio_sid = fields.twilioSid || null;
  if (fields.twilioToken !== undefined) update.twilio_token = fields.twilioToken || null;
  if (fields.twilioFrom !== undefined) update.twilio_from = fields.twilioFrom || null;
  if (fields.smsEnabled !== undefined) update.sms_enabled = fields.smsEnabled;
  if (fields.whatsappEnabled !== undefined) update.whatsapp_enabled = fields.whatsappEnabled;
  if (fields.lineToken !== undefined) update.line_token = fields.lineToken || null;
  if (fields.lineEnabled !== undefined) update.line_enabled = fields.lineEnabled;
  if (fields.telegramBotToken !== undefined) update.telegram_bot_token = fields.telegramBotToken || null;
  if (fields.telegramEnabled !== undefined) update.telegram_enabled = fields.telegramEnabled;

  const admin = createServerSupabase();
  const { error } = await admin
    .from('shop_messaging_secrets')
    .upsert({ shop_id: shopId, ...update }, { onConflict: 'shop_id' });

  if (error) {
    return NextResponse.json(
      { error: sanitizeError(error, 'shop-messaging-secrets:PUT', 'Unable to save messaging settings') },
      { status: 500 },
    );
  }

  return NextResponse.json({ success: true });
}
