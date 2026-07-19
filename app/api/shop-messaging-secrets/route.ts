import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/supabase-server';
import { requireShopRole } from '@/lib/serverAuth';
import { parseJsonBody, sanitizeError } from '@/lib/apiHelpers';
import { ShopMessagingSecretsQuerySchema, ShopMessagingSecretsUpdateSchema } from '@/lib/schemas';

/**
 * GET /api/shop-messaging-secrets — return REDACTED configuration status
 *   for the shop's Twilio credentials (SMS/WhatsApp).
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
 *   `{ sms: { configured, enabled, fromNumber, complete }, whatsapp: { configured, enabled, complete },
 *      line: { configured: false, enabled: false }, telegram: { configured: false, enabled: false } }`
 *   — `configured` is a boolean derived from "is the Twilio auth token
 *   column non-null", never the token itself. `complete` is a separate
 *   boolean meaning "SID, token, AND from-number are all present" — the
 *   precondition for `enabled` to actually be usable (see the PUT
 *   completeness invariant below); a shop can have `configured: true,
 *   complete: false` if only some Twilio fields were ever entered.
 *   `fromNumber` is a phone number (the shop's own Twilio sender number),
 *   not a bearer credential — safe to display so staff can recognize which
 *   number is configured. LINE and Telegram are HARDCODED to
 *   `{ configured: false, enabled: false }` regardless of any stored
 *   line_ or telegram_ prefixed column value — see the PUT documentation
 *   below for why those columns can never be activated through this API
 *   today.
 * PUT is a PARTIAL update: a field OMITTED from the body means "leave
 *   unchanged"; a field present as an empty string means "clear this
 *   credential" (sets it to NULL). The existing value is NEVER echoed back
 *   in the PUT response, and PUT never returns the value it just set,
 *   either — the response is `{ success: true }` only. This is the
 *   write-only pattern: the browser never receives a live secret from this
 *   route under any circumstance.
 * `lineToken`, `lineEnabled`, `telegramBotToken`, `telegramEnabled` are
 *   NOT accepted fields on this schema at all — send-message refuses both
 *   channels unconditionally (no verified per-customer contact mapping
 *   exists yet), so this API must not accept or activate them either, even
 *   though the underlying table still reserves those columns for a future
 *   migration. A caller that submits any of those four fields gets the
 *   same `.strict()` 400 as any other unrecognized field.
 * TWILIO COMPLETENESS INVARIANT: SMS/WhatsApp can never be left `enabled`
 *   with an incomplete Twilio configuration. Before applying any update,
 *   this route computes the EFFECTIVE post-update state (existing stored
 *   row, overridden by whatever fields are present in this request) and
 *   rejects the request with 400 if `sms_enabled` or `whatsapp_enabled`
 *   would be true while `twilio_sid`/`twilio_token`/`twilio_from` would not
 *   all be non-empty — whether that incompleteness comes from enabling
 *   without ever having configured credentials, or from clearing a
 *   required field while the channel is still (or newly) enabled. This is
 *   enforced here, server-side, regardless of what the Settings UI does or
 *   doesn't validate client-side.
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
};

function isTwilioComplete(sid: string | null, token: string | null, from: string | null): boolean {
  return !!sid && !!token && !!from;
}

function toStatus(row: SecretsRow | null) {
  const complete = isTwilioComplete(row?.twilio_sid ?? null, row?.twilio_token ?? null, row?.twilio_from ?? null);
  return {
    sms: {
      configured: !!row?.twilio_token,
      enabled: !!row?.sms_enabled,
      fromNumber: row?.twilio_from ?? null,
      complete,
    },
    whatsapp: {
      // WhatsApp uses the same Twilio credentials as SMS, just a separate enabled flag.
      configured: !!row?.twilio_token,
      enabled: !!row?.whatsapp_enabled,
      complete,
    },
    // LINE/Telegram are never activatable through this API today — see the
    // doc comment above. Hardcoded regardless of any stored column value.
    line: { configured: false, enabled: false },
    telegram: { configured: false, enabled: false },
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
    .select('twilio_sid, twilio_token, twilio_from, sms_enabled, whatsapp_enabled')
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

  const admin = createServerSupabase();

  // Fetch the existing row first — the completeness invariant below must be
  // evaluated against the EFFECTIVE post-update state (existing values
  // overridden by whatever this request actually touches), not the request
  // body in isolation. A request that only sends `{ smsEnabled: true }`
  // with no credential fields must still be validated against whatever
  // Twilio fields are already stored.
  const { data: existing, error: fetchError } = await admin
    .from('shop_messaging_secrets')
    .select('twilio_sid, twilio_token, twilio_from, sms_enabled, whatsapp_enabled')
    .eq('shop_id', shopId)
    .maybeSingle();

  if (fetchError) {
    return NextResponse.json(
      { error: sanitizeError(fetchError, 'shop-messaging-secrets:PUT fetch', 'Unable to load current messaging settings') },
      { status: 500 },
    );
  }

  // Presence in the parsed body is the signal: a key that's `undefined`
  // (never sent) is left alone; a key sent as `''` clears the credential;
  // any other value replaces it. Never trusts the CALLER'S identity from
  // this body — `shopId` is only a resource identifier, already verified
  // against the caller's own membership by requireShopRole above.
  const effectiveSid = fields.twilioSid !== undefined ? (fields.twilioSid || null) : (existing?.twilio_sid ?? null);
  const effectiveToken = fields.twilioToken !== undefined ? (fields.twilioToken || null) : (existing?.twilio_token ?? null);
  const effectiveFrom = fields.twilioFrom !== undefined ? (fields.twilioFrom || null) : (existing?.twilio_from ?? null);
  const effectiveSmsEnabled = fields.smsEnabled !== undefined ? fields.smsEnabled : (existing?.sms_enabled ?? false);
  const effectiveWhatsappEnabled = fields.whatsappEnabled !== undefined ? fields.whatsappEnabled : (existing?.whatsapp_enabled ?? false);

  if ((effectiveSmsEnabled || effectiveWhatsappEnabled) && !isTwilioComplete(effectiveSid, effectiveToken, effectiveFrom)) {
    const missing = [
      !effectiveSid && 'Account SID',
      !effectiveToken && 'Auth Token',
      !effectiveFrom && 'From Number',
    ].filter(Boolean).join(', ');
    return NextResponse.json(
      { error: `SMS/WhatsApp cannot be enabled with an incomplete Twilio configuration. Missing: ${missing}.` },
      { status: 400 },
    );
  }

  const update: Record<string, unknown> = { updated_at: new Date().toISOString(), updated_by: auth.context.userId };
  if (fields.twilioSid !== undefined) update.twilio_sid = fields.twilioSid || null;
  if (fields.twilioToken !== undefined) update.twilio_token = fields.twilioToken || null;
  if (fields.twilioFrom !== undefined) update.twilio_from = fields.twilioFrom || null;
  if (fields.smsEnabled !== undefined) update.sms_enabled = fields.smsEnabled;
  if (fields.whatsappEnabled !== undefined) update.whatsapp_enabled = fields.whatsappEnabled;

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
