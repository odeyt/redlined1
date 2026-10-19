/**
 * WhatsApp Business (Meta Cloud API) — static configuration and env access.
 *
 * Nothing here is a secret. Secrets (app secret, webhook verify token, the
 * token-encryption key) are read from server env at call time by the
 * functions below and are never returned to a caller or logged.
 *
 * ## Pilot
 *
 * D1 Imports is the only business this integration is switched on for. Since
 * the 2026-10-16 merge, D1 Imports operates as ONE shop: Location 2
 * (90b72748…) is the active shop and the closed D1 Imports shop (38d55fae…)
 * is archived and mirrored into it. The single WhatsApp connection belongs to
 * the active merged shop. Historical D1 documents are reached through
 * lib/shops/mergedScope.ts, never by giving the archived shop a connection of
 * its own.
 *
 * The allowlist is a second gate on top of the `whatsapp_business` feature
 * flag: a mistakenly enabled global flag row still cannot switch the
 * integration on for any other shop.
 */

/** The merged D1 Imports shop (formerly "Location 2"). */
export const D1_MERGED_SHOP_ID = '90b72748-bf01-4456-999f-f4ba48091606';

/** The archived D1 Imports shop, folded into D1_MERGED_SHOP_ID. Never connected itself. */
export const D1_ARCHIVED_SHOP_ID = '38d55fae-741b-4bac-b520-f96eed65bf38';

export const WHATSAPP_PILOT_SHOP_IDS: readonly string[] = [D1_MERGED_SHOP_ID];

export const WHATSAPP_FLAG_KEY = 'whatsapp_business';

export function isWhatsAppPilotShop(shopId: string | null | undefined): boolean {
  return !!shopId && WHATSAPP_PILOT_SHOP_IDS.includes(shopId);
}

/**
 * Graph API version for every Cloud API call. Overridable so a version
 * deprecation can be handled with an env change instead of a deploy.
 */
export function graphApiVersion(): string {
  const v = process.env.WHATSAPP_GRAPH_API_VERSION?.trim();
  return v && /^v\d+\.\d+$/.test(v) ? v : 'v23.0';
}

export const GRAPH_BASE_URL = 'https://graph.facebook.com';

/** Meta App ID. Public by nature (it is in the Embedded Signup page source). */
export function metaAppId(): string {
  return (process.env.NEXT_PUBLIC_WHATSAPP_APP_ID ?? '').trim();
}

/** Facebook Login for Business configuration id for Embedded Signup (v4). Public. */
export function embeddedSignupConfigId(): string {
  return (process.env.NEXT_PUBLIC_WHATSAPP_ES_CONFIG_ID ?? '').trim();
}

/** Server only. Used for the code exchange and to verify webhook signatures. */
export function metaAppSecret(): string {
  return (process.env.WHATSAPP_APP_SECRET ?? '').trim();
}

/** Server only. Echoed check for Meta's webhook verification handshake. */
export function webhookVerifyToken(): string {
  return (process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN ?? '').trim();
}

/**
 * Second, environment-level gate for LIVE customer messages. Even with an
 * owner's in-app approval recorded, nothing is sent from a live (non-sandbox)
 * connection unless the deployment also sets WHATSAPP_LIVE_SENDING_ENABLED=true.
 * Default: off.
 */
export function liveSendingEnvEnabled(): boolean {
  return process.env.WHATSAPP_LIVE_SENDING_ENABLED === 'true';
}

/**
 * `mock` swaps the Cloud API for an in-process fake (no network). For local
 * development and tests only — refused on a production deployment.
 */
export function transportMode(): 'cloud' | 'mock' {
  const wantsMock = process.env.WHATSAPP_TRANSPORT === 'mock';
  if (!wantsMock) return 'cloud';
  const prod = process.env.VERCEL_ENV === 'production' || process.env.NEXT_PUBLIC_APP_ENV === 'production';
  return prod ? 'cloud' : 'mock';
}

/** Public site origin used for secure document links in templates. */
export function siteOrigin(): string {
  return (process.env.NEXT_PUBLIC_SITE_URL ?? 'https://www.redlined1.com').replace(/\/+$/, '');
}

/** Which server-side settings are present — booleans only, never values. */
export function serverConfigPresence() {
  return {
    appId: !!metaAppId(),
    embeddedSignupConfigId: !!embeddedSignupConfigId(),
    appSecret: !!metaAppSecret(),
    webhookVerifyToken: !!webhookVerifyToken(),
    tokenEncryptionKey: !!(process.env.WHATSAPP_TOKEN_ENCRYPTION_KEY ?? '').trim(),
    liveSendingEnv: liveSendingEnvEnabled(),
    transport: transportMode(),
  };
}

/**
 * The Embedded Signup session event for WhatsApp Business App (coexistence)
 * onboarding. The only finish event RedlineD1 accepts for the shop number.
 */
export const COEXISTENCE_EVENT = 'FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING';
