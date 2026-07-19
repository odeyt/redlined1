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
 *   `fromNumber`, no SIDs/tokens/bot ids. LINE and Telegram are hardcoded to
 *   `false` regardless of the stored `line_enabled`/`telegram_enabled`
 *   columns, because send-message refuses both channels unconditionally
 *   (no trusted per-customer contact mapping exists yet — see
 *   docs/SEND_MESSAGE_RECIPIENT_RESOLUTION.md). Reporting them as "enabled"
 *   here would let a client show a button that always fails.
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
    .select('sms_enabled, whatsapp_enabled')
    .eq('shop_id', shopId)
    .maybeSingle();

  if (error) {
    return NextResponse.json(
      { error: sanitizeError(error, 'messaging-channels-status:GET', 'Unable to load channel status') },
      { status: 500 },
    );
  }

  return NextResponse.json({
    enabled: {
      sms: !!data?.sms_enabled,
      whatsapp: !!data?.whatsapp_enabled,
      // Unconditionally false — see doc comment above.
      line: false,
      telegram: false,
    },
  });
}
