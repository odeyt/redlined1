'use client';

/**
 * Client-side wrappers for the two messaging-credential API surfaces.
 * There is deliberately no direct Supabase query here (unlike most other
 * services/*.ts files): public.shop_messaging_secrets has no anon/
 * authenticated RLS grants at all, so a direct client query would just get
 * zero rows / a permission error. Everything goes through these owner- or
 * owner/manager/advisor-gated API routes instead.
 *
 *   - fetchMessagingStatus / updateMessagingSecrets → /api/shop-messaging-secrets
 *     (owner only; used by Settings — full configured/fromNumber/complete
 *     detail, write access)
 *   - fetchMessagingChannelsStatus → /api/messaging-channels-status
 *     (owner/manager/advisor; used by Invoices/Estimates send modals —
 *     enabled flags ONLY, no configured/fromNumber/secret detail)
 *
 * Every function here uses readJsonBody/apiErrorMessage (lib/apiClient.ts)
 * instead of a bare `res.json()` — an empty or non-JSON error response
 * (an infra-level failure, a proxy error page) must produce a useful
 * message derived from the HTTP status, not throw an unrelated parse error.
 */
import { authedFetch, AuthSessionError, readJsonBody, apiErrorMessage } from '@/lib/apiClient';

export type MessagingChannelStatus = { configured: boolean; enabled: boolean };
export interface MessagingStatus {
  // `complete` = SID, auth token, and from-number are all present — the
  // precondition for `enabled` to actually be usable. A shop can have
  // `configured: true, complete: false` if only some Twilio fields were
  // ever entered.
  sms: MessagingChannelStatus & { fromNumber: string | null; complete: boolean };
  whatsapp: MessagingChannelStatus & { complete: boolean };
  // LINE/Telegram are always { configured: false, enabled: false } — see
  // app/api/shop-messaging-secrets/route.ts for why.
  line: MessagingChannelStatus;
  telegram: MessagingChannelStatus;
}

export interface MessagingChannelsEnabled {
  sms: boolean;
  whatsapp: boolean;
  line: boolean;
  telegram: boolean;
}

/**
 * Only fields the caller wants to CHANGE — omit a key to leave it as-is,
 * send '' to clear it. LINE/Telegram fields are deliberately absent: the
 * API route's schema rejects them outright (400), so there is no point
 * offering them in this type — see lib/schemas.ts
 * ShopMessagingSecretsUpdateSchema for the full rationale.
 */
export interface MessagingSecretsUpdate {
  twilioSid?: string;
  twilioToken?: string;
  twilioFrom?: string;
  smsEnabled?: boolean;
  whatsappEnabled?: boolean;
}

export { AuthSessionError };

export async function fetchMessagingStatus(shopId: string): Promise<MessagingStatus> {
  const res = await authedFetch(`/api/shop-messaging-secrets?shopId=${encodeURIComponent(shopId)}`);
  if (!res.ok) throw new Error(await apiErrorMessage(res, 'Unable to load messaging status'));
  const json = await readJsonBody<MessagingStatus>(res);
  if (!json) throw new Error('Unable to load messaging status: empty response');
  return json;
}

export async function updateMessagingSecrets(shopId: string, update: MessagingSecretsUpdate): Promise<void> {
  const res = await authedFetch('/api/shop-messaging-secrets', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ shopId, ...update }),
  });
  if (!res.ok) throw new Error(await apiErrorMessage(res, 'Unable to save messaging settings'));
}

/** Enabled-only channel status for any owner/manager/advisor — never a secret or configured flag. */
export async function fetchMessagingChannelsStatus(shopId: string): Promise<MessagingChannelsEnabled> {
  const res = await authedFetch(`/api/messaging-channels-status?shopId=${encodeURIComponent(shopId)}`);
  if (!res.ok) throw new Error(await apiErrorMessage(res, 'Unable to load channel status'));
  const json = await readJsonBody<{ enabled: MessagingChannelsEnabled }>(res);
  if (!json) throw new Error('Unable to load channel status: empty response');
  return json.enabled;
}
