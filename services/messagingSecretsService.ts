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
 *     (owner only; used by Settings — full configured/fromNumber detail,
 *     write access)
 *   - fetchMessagingChannelsStatus → /api/messaging-channels-status
 *     (owner/manager/advisor; used by Invoices/Estimates send modals —
 *     enabled flags ONLY, no configured/fromNumber/secret detail)
 */
import { authedFetch, AuthSessionError } from '@/lib/apiClient';

export type MessagingChannelStatus = { configured: boolean; enabled: boolean };
export interface MessagingStatus {
  sms: MessagingChannelStatus & { fromNumber: string | null };
  whatsapp: MessagingChannelStatus;
  line: MessagingChannelStatus;
  telegram: MessagingChannelStatus;
}

export interface MessagingChannelsEnabled {
  sms: boolean;
  whatsapp: boolean;
  line: boolean;
  telegram: boolean;
}

/** Only fields the caller wants to CHANGE — omit a key to leave it as-is, send '' to clear it. */
export interface MessagingSecretsUpdate {
  twilioSid?: string;
  twilioToken?: string;
  twilioFrom?: string;
  smsEnabled?: boolean;
  whatsappEnabled?: boolean;
  lineToken?: string;
  lineEnabled?: boolean;
  telegramBotToken?: string;
  telegramEnabled?: boolean;
}

export { AuthSessionError };

export async function fetchMessagingStatus(shopId: string): Promise<MessagingStatus> {
  const res = await authedFetch(`/api/shop-messaging-secrets?shopId=${encodeURIComponent(shopId)}`);
  const json = await res.json();
  if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
  return json as MessagingStatus;
}

export async function updateMessagingSecrets(shopId: string, update: MessagingSecretsUpdate): Promise<void> {
  const res = await authedFetch('/api/shop-messaging-secrets', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ shopId, ...update }),
  });
  if (!res.ok) {
    const json = await res.json().catch(() => ({}));
    throw new Error(json.error ?? `HTTP ${res.status}`);
  }
}

/** Enabled-only channel status for any owner/manager/advisor — never a secret or configured flag. */
export async function fetchMessagingChannelsStatus(shopId: string): Promise<MessagingChannelsEnabled> {
  const res = await authedFetch(`/api/messaging-channels-status?shopId=${encodeURIComponent(shopId)}`);
  const json = await res.json();
  if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
  return (json as { enabled: MessagingChannelsEnabled }).enabled;
}
