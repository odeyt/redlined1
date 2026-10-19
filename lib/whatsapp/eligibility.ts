/**
 * WhatsApp Business App coexistence — eligibility checklist.
 *
 * Coexistence lets one number stay on the WhatsApp Business App (the owner's
 * phone, with its chats, contacts and history) AND be reachable through the
 * Cloud API. It is the only onboarding RedlineD1 accepts for D1 Imports,
 * because the other Embedded Signup outcomes either register the number on
 * Cloud API alone — which takes it off the app — or add a new number.
 *
 * This module turns what we know into a pass / fail / to-confirm list. Some
 * items only the owner can confirm (the app version on their phone); those are
 * owner attestations, recorded with who and when. Others are read from Meta
 * after connecting (is_on_biz_app, platform_type). Nothing here calls Meta.
 *
 * Sources (read 2026-10-19): developers.facebook.com/docs/whatsapp/
 * embedded-signup/custom-flows/onboarding-business-app-users and
 * /embedded-signup/versions. Embedded Signup v2/v3 were deprecated on
 * 2026-10-15; v4 is the only version this integration launches.
 */
import { callingCode } from './phone';

export type CheckStatus = 'pass' | 'fail' | 'confirm' | 'pending';

export interface EligibilityItem {
  key: string;
  label: string;
  status: CheckStatus;
  detail: string;
}

/** Minimum WhatsApp Business App version for coexistence (Meta, 2026-10). */
export const MIN_BUSINESS_APP_VERSION = '2.24.17';

/**
 * Calling codes reported as excluded from coexistence. Meta's page does not
 * publish a country list; third-party partner documentation (2026) reports
 * Nigeria and South Africa as the remaining exclusions. Laos (+856) is not
 * reported as excluded — the Embedded Signup screen is the authority: if it
 * does not offer "Connect your existing WhatsApp Business App", the number is
 * not eligible.
 */
export const REPORTED_EXCLUDED_CODES: Record<string, string> = { '234': 'Nigeria', '27': 'South Africa' };

export interface OwnerAttestations {
  appVersionOk?: boolean;
  /** The number has been in active use on the WhatsApp Business App (not personal WhatsApp). */
  onBusinessApp?: boolean;
  /** Owner read the coexistence limitations (broadcast lists, disappearing messages, companions...). */
  limitationsAccepted?: boolean;
  /** Owner will open the Business App at least every 14 days (Meta disconnects after ~14 days idle). */
  keepAppActive?: boolean;
  /** A payment method is on the WhatsApp Business account in WhatsApp Manager. */
  paymentMethodAdded?: boolean;
}

export interface EligibilityInput {
  businessPhoneDigits: string | null;
  attestations: OwnerAttestations;
  server: {
    appId: boolean;
    embeddedSignupConfigId: boolean;
    appSecret: boolean;
    webhookVerifyToken: boolean;
    tokenEncryptionKey: boolean;
  };
  /** Read from Meta after connecting; undefined before. */
  phoneStatus?: {
    isOnBizApp: boolean | null;
    platformType: string | null;
    codeVerificationStatus?: string | null;
    nameStatus?: string | null;
  };
  webhookVerified: boolean;
}

export function compareVersions(a: string, b: string): number {
  const pa = a.split('.').map(n => parseInt(n, 10) || 0);
  const pb = b.split('.').map(n => parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d) return d < 0 ? -1 : 1;
  }
  return 0;
}

function attest(v: boolean | undefined): CheckStatus {
  return v === true ? 'pass' : v === false ? 'fail' : 'confirm';
}

export function evaluateEligibility(input: EligibilityInput): EligibilityItem[] {
  const items: EligibilityItem[] = [];
  const { attestations: a, server: s } = input;

  const cc = input.businessPhoneDigits ? callingCode(input.businessPhoneDigits) : null;
  const excluded = cc ? REPORTED_EXCLUDED_CODES[cc] : undefined;
  items.push({
    key: 'country',
    label: 'Business number country is supported',
    status: !cc ? 'confirm' : excluded ? 'fail' : 'pass',
    detail: !cc
      ? 'Enter the business number to check its country code.'
      : excluded
        ? `+${cc} (${excluded}) is reported as excluded from coexistence.`
        : `+${cc} is not on the reported exclusion list. Embedded Signup makes the final call.`,
  });

  items.push({
    key: 'app_version',
    label: `WhatsApp Business App ${MIN_BUSINESS_APP_VERSION} or later on the shop phone`,
    status: attest(a.appVersionOk),
    detail: 'Check in the app: Settings → Help → App info. Update from the app store if older.',
  });
  items.push({
    key: 'business_app',
    label: 'The number is on the WhatsApp Business App (not personal WhatsApp)',
    status: attest(a.onBusinessApp),
    detail: 'Coexistence only connects a number that is already registered in the WhatsApp Business App.',
  });
  items.push({
    key: 'limitations',
    label: 'Owner accepted the coexistence limitations',
    status: attest(a.limitationsAccepted),
    detail: 'Broadcast lists become read-only; disappearing, view-once and live-location messages are turned off; companion devices are unlinked once (Windows and WearOS cannot re-link).',
  });
  items.push({
    key: 'keep_active',
    label: 'The Business App will be opened at least every 14 days',
    status: attest(a.keepAppActive),
    detail: 'Meta disconnects the API side if the primary phone is inactive for about 14 days.',
  });
  items.push({
    key: 'payment_method',
    label: 'Payment method added in WhatsApp Manager',
    status: attest(a.paymentMethodAdded),
    detail: 'Meta requires it before the account is fully onboarded. Messages sent from the app stay free; API messages use Cloud API pricing.',
  });

  const serverOk = s.appId && s.embeddedSignupConfigId && s.appSecret && s.webhookVerifyToken && s.tokenEncryptionKey;
  const missing = [
    !s.appId && 'NEXT_PUBLIC_WHATSAPP_APP_ID',
    !s.embeddedSignupConfigId && 'NEXT_PUBLIC_WHATSAPP_ES_CONFIG_ID',
    !s.appSecret && 'WHATSAPP_APP_SECRET',
    !s.webhookVerifyToken && 'WHATSAPP_WEBHOOK_VERIFY_TOKEN',
    !s.tokenEncryptionKey && 'WHATSAPP_TOKEN_ENCRYPTION_KEY',
  ].filter(Boolean);
  items.push({
    key: 'server_config',
    label: 'RedlineD1 Meta app settings are configured',
    status: serverOk ? 'pass' : 'fail',
    detail: serverOk ? 'App ID, Embedded Signup configuration, app secret, webhook token and encryption key are set.' : `Missing server settings: ${missing.join(', ')}.`,
  });

  items.push({
    key: 'webhook',
    label: 'Webhook verified by Meta',
    status: input.webhookVerified ? 'pass' : 'pending',
    detail: input.webhookVerified ? 'Meta completed the verification handshake.' : 'Set the callback URL and verify token in App Dashboard → WhatsApp → Configuration.',
  });

  const p = input.phoneStatus;
  items.push({
    key: 'coexistence_active',
    label: 'Meta reports the number on both the Business App and Cloud API',
    status: !p ? 'pending' : p.isOnBizApp === true && p.platformType === 'CLOUD_API' ? 'pass' : 'fail',
    detail: !p
      ? 'Checked after connecting.'
      : `is_on_biz_app=${String(p.isOnBizApp)}, platform_type=${p.platformType ?? 'unknown'}${p.isOnBizApp === false ? ' — the number is NOT in coexistence. Stop and review before sending anything.' : ''}`,
  });

  return items;
}

/** True when nothing is failing and everything required before connecting is confirmed. */
export function readyToConnect(items: readonly EligibilityItem[]): boolean {
  const before = ['country', 'app_version', 'business_app', 'limitations', 'keep_active', 'server_config'];
  return items.filter(i => before.includes(i.key)).every(i => i.status === 'pass');
}
