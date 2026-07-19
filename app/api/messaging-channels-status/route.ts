import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/supabase-server';
import { requireShopRole } from '@/lib/serverAuth';
import { sanitizeError } from '@/lib/apiHelpers';
import { MessagingChannelsStatusQuerySchema } from '@/lib/schemas';

/**
 * GET /api/messaging-channels-status — the SAFE, low-detail counterpart to
 *   /api/shop-messaging-secrets, for roles that need to know "can I send on
 *   this channel right now" without any credential-management privilege.
 *
 * Caller: bearer-authenticated shop member with role owner, manager, or
 *   advisor — the same population allowed to call send-message itself.
 *   Technician gets 403. A caller authorized for a different shop gets 403
 *   for this shopId (requireShopRole checks membership in THIS shopId only,
 *   never inferred via co-ownership of another shop).
 *
 * Response is deliberately the SMALLEST possible surface:
 *   `{ enabled: { sms: boolean, whatsapp: boolean, line: boolean, telegram: boolean } }`
 *   — no `configured` flag (which would reveal whether credentials exist,
 *   independent of whether they're enabled — not needed by send UI), no
 *   `fromNumber`, no SIDs/tokens/bot ids.
 *
 * `sms`/`whatsapp` are true ONLY when BOTH the stored enabled flag is true
 *   AND the Twilio configuration is complete (SID, auth token, and
 *   from-number all present) — never the raw enabled flag alone. In normal
 *   operation these can never diverge, since PUT /api/shop-messaging-secrets
 *   enforces the same completeness invariant before allowing either flag to
 *   be set true. This is nonetheless re-checked here, independently,
 *   because this endpoint is what UI actually gates "show the send button"
 *   on — it must report the true, EFFECTIVELY USABLE state even if the
 *   stored row were ever reached through some other path (a manual DB edit,
 *   a future migration, a bug elsewhere) with an enabled flag set but an
 *   incomplete configuration behind it.
 *
 * LINE and Telegram are hardcoded to `false` regardless of the stored
 *   `line_enabled`/`telegram_enabled` columns, because send-message refuses
 *   both channels unconditionally (no trusted per-customer contact mapping
 *   exists yet — see docs/SEND_MESSAGE_RECIPIENT_RESOLUTION.md), and
 *   because the credential-management API no longer even accepts writes to
 *   those columns (see lib/schemas.ts ShopMessagingSecretsUpdateSchema).
 *   Reporting them as "enabled" here would let a client show a button that
 *   always fails.
 *
 * Never logs a credential value — sanitizeError() only logs the Postgres
 *   error object, never row contents.
 */
export async function GET(req: NextRequest) {
  const shopIdRaw = req.nextUrl.searchParams.get('shopId');
  const check = MessagingChannelsStatusQuerySchema.safeParse({ shopId: shopIdRaw });
  if (!check.success) return NextResponse.json({ error: 'Missing or invalid shopId' }, { status: 400 });
  const { shopId } = check.data;

  const auth = await requireShopRole(req, shopId, ['owner', 'manager', 'advisor']);
  if (!auth.ok) return auth.response;

  const admin = createServerSupabase();
  const { data, error } = await admin
    .from('shop_messaging_secrets')
    .select('twilio_sid, twilio_token, twilio_from, sms_enabled, whatsapp_enabled')
    .eq('shop_id', shopId)
    .maybeSingle();

  if (error) {
    return NextResponse.json(
      { error: sanitizeError(error, 'messaging-channels-status:GET', 'Unable to load channel status') },
      { status: 500 },
    );
  }

  const twilioComplete = !!data?.twilio_sid && !!data?.twilio_token && !!data?.twilio_from;

  return NextResponse.json({
    enabled: {
      sms: !!data?.sms_enabled && twilioComplete,
      whatsapp: !!data?.whatsapp_enabled && twilioComplete,
      // Unconditionally false — see doc comment above.
      line: false,
      telegram: false,
    },
  });
}
