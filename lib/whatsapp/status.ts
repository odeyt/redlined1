/**
 * The connection summary the Settings page and the Send buttons read.
 * Pure: takes rows, returns JSON. Never includes a token, and never a full
 * phone number other than the shop's own business number.
 */
import { evaluateEligibility, readyToConnect, type OwnerAttestations } from './eligibility';
import { TEMPLATES, TEMPLATE_LANGUAGES } from './templates';
import { maskPhone } from './phone';
import { liveBlocker, type ConnectionRow } from './sendService';

export interface FullConnectionRow extends ConnectionRow {
  quality_rating: string | null;
  messaging_limit_tier: string | null;
  code_verification_status: string | null;
  name_status: string | null;
  business_phone_digits: string | null;
  attestations: OwnerAttestations | null;
  attested_at: string | null;
  webhook_verified_at: string | null;
  last_verified_at: string | null;
  last_account_event: string | null;
  last_account_event_at: string | null;
  connected_at: string | null;
}

export const FULL_CONNECTION_COLUMNS =
  'shop_id, status, mode, onboarding_type, enabled, automations_enabled, automation_settings, waba_id, phone_number_id, display_phone_number, verified_name, is_on_biz_app, platform_type, sandbox_recipients, live_approved_at, live_approved_by, quality_rating, messaging_limit_tier, code_verification_status, name_status, business_phone_digits, attestations, attested_at, webhook_verified_at, last_verified_at, last_account_event, last_account_event_at, connected_at';

export interface TemplateRow { name: string; language: string; status: string; rejected_reason: string | null; last_synced_at: string | null }

export function sendBlocker(c: ConnectionRow | null, liveEnv: boolean): string | null {
  if (!c || c.status !== 'connected' || !c.phone_number_id) return 'WhatsApp Business is not connected.';
  if (!c.enabled) return 'WhatsApp Business is switched off in Settings → Integrations.';
  return liveBlocker(c, liveEnv);
}

export function buildStatus(input: {
  role: string;
  row: FullConnectionRow | null;
  templates: TemplateRow[];
  tokenExpiresAt: string | null;
  hasToken: boolean;
  sandboxTestPassed: boolean;
  server: { appId: boolean; embeddedSignupConfigId: boolean; appSecret: boolean; webhookVerifyToken: boolean; tokenEncryptionKey: boolean; liveSendingEnv: boolean; transport: 'cloud' | 'mock' };
  publicConfig: { appId: string; configId: string; graphVersion: string };
}) {
  const { row: c } = input;
  const blocker = sendBlocker(c, input.server.liveSendingEnv);
  const base = {
    available: true,
    canSend: !blocker,
    sendBlocker: blocker,
    mode: c?.mode ?? 'sandbox',
    status: c?.status ?? 'not_connected',
    enabled: !!c?.enabled,
  };
  if (input.role !== 'owner') return base;

  const eligibility = evaluateEligibility({
    businessPhoneDigits: c?.business_phone_digits ?? null,
    attestations: c?.attestations ?? {},
    server: input.server,
    phoneStatus: c?.onboarding_type === 'coexistence'
      ? { isOnBizApp: c.is_on_biz_app, platformType: c.platform_type, codeVerificationStatus: c.code_verification_status, nameStatus: c.name_status }
      : undefined,
    webhookVerified: !!c?.webhook_verified_at,
  });

  const byKey = new Map(input.templates.map(t => [`${t.name}|${t.language}`, t]));
  const templates = Object.values(TEMPLATES).flatMap(def => TEMPLATE_LANGUAGES.map(lang => {
    const t = byKey.get(`${def.name}|${lang}`);
    return {
      kind: def.kind, name: def.name, language: lang, category: def.category,
      status: t?.status ?? 'NOT_SUBMITTED', rejectedReason: t?.rejected_reason ?? null, lastSyncedAt: t?.last_synced_at ?? null,
      body: def.body[lang],
    };
  }));

  return {
    ...base,
    connection: c ? {
      onboardingType: c.onboarding_type,
      automationsEnabled: c.automations_enabled,
      automationSettings: c.automation_settings ?? {},
      wabaId: c.waba_id,
      phoneNumberId: c.phone_number_id,
      displayPhoneNumber: c.display_phone_number,
      verifiedName: c.verified_name,
      qualityRating: c.quality_rating,
      messagingLimitTier: c.messaging_limit_tier,
      isOnBizApp: c.is_on_biz_app,
      platformType: c.platform_type,
      codeVerificationStatus: c.code_verification_status,
      nameStatus: c.name_status,
      businessPhoneDigits: c.business_phone_digits,
      attestations: c.attestations ?? {},
      attestedAt: c.attested_at,
      sandboxRecipients: (c.sandbox_recipients ?? []).map(maskPhone),
      liveApproved: !!c.live_approved_at,
      liveApprovedAt: c.live_approved_at,
      webhookVerifiedAt: c.webhook_verified_at,
      lastVerifiedAt: c.last_verified_at,
      lastAccountEvent: c.last_account_event,
      lastAccountEventAt: c.last_account_event_at,
      connectedAt: c.connected_at,
      hasToken: input.hasToken,
      tokenExpiresAt: input.tokenExpiresAt,
    } : null,
    eligibility,
    readyToConnect: readyToConnect(eligibility),
    sandboxTestPassed: input.sandboxTestPassed,
    templates,
    server: input.server,
    embeddedSignup: input.publicConfig,
  };
}
