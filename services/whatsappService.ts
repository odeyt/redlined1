'use client';

/**
 * Client wrappers for /api/whatsapp/*. No direct Supabase query: every
 * WhatsApp table is service-role only. Nothing here ever sends a phone number
 * or message text — only document ids, a language and a per-dialog request id.
 */
import { authedFetch, readJsonBody, apiErrorMessage } from '@/lib/apiClient';
import { isWhatsAppPilotShop } from '@/lib/whatsapp/config';

export type WaResourceType = 'estimate' | 'invoice' | 'job';
export type WaLanguage = 'en' | 'lo';

export interface WaEligibilityItem { key: string; label: string; status: 'pass' | 'fail' | 'confirm' | 'pending'; detail: string }
export interface WaTemplateStatus { kind: string; name: string; language: WaLanguage; category: string; status: string; rejectedReason: string | null; lastSyncedAt: string | null; body: string }

export interface WaConnectionStatus {
  available: boolean;
  canSend: boolean;
  sendBlocker: string | null;
  mode: 'sandbox' | 'live';
  status: 'not_connected' | 'connected' | 'needs_attention' | 'disconnected';
  enabled: boolean;
  // Owner only:
  connection?: null | {
    onboardingType: 'coexistence' | 'sandbox_test_number' | null;
    automationsEnabled: boolean;
    automationSettings: { jobReadyForPickup?: boolean; language?: WaLanguage };
    wabaId: string | null;
    phoneNumberId: string | null;
    displayPhoneNumber: string | null;
    verifiedName: string | null;
    qualityRating: string | null;
    messagingLimitTier: string | null;
    isOnBizApp: boolean | null;
    platformType: string | null;
    businessPhoneDigits: string | null;
    attestations: Record<string, boolean | undefined>;
    attestedAt: string | null;
    sandboxRecipients: string[];
    liveApproved: boolean;
    liveApprovedAt: string | null;
    webhookVerifiedAt: string | null;
    lastVerifiedAt: string | null;
    lastAccountEvent: string | null;
    connectedAt: string | null;
    hasToken: boolean;
    tokenExpiresAt: string | null;
  };
  eligibility?: WaEligibilityItem[];
  readyToConnect?: boolean;
  sandboxTestPassed?: boolean;
  templates?: WaTemplateStatus[];
  server?: { appId: boolean; embeddedSignupConfigId: boolean; appSecret: boolean; webhookVerifyToken: boolean; tokenEncryptionKey: boolean; liveSendingEnv: boolean; transport: 'cloud' | 'mock' };
  embeddedSignup?: { appId: string; configId: string; graphVersion: string };
}

export interface WaDialogState {
  canSend: boolean;
  sendBlocker: string | null;
  mode: 'sandbox' | 'live';
  sandboxBlocked: boolean;
  recipient: { masked: string; name: string } | null;
  consent: null | { status: 'opted_in' | 'opted_out'; source: string; optedInAt: string | null; optedOutAt: string | null };
  template: { name: string; language: WaLanguage; status: string };
  preview: string;
  buttonLabel: string | null;
  linkIssue: string | null;
  duplicate: null | { status: string; sentAt: string | null };
  history: Array<{ id: string; status: string; mode: string; trigger: string; language: string; toMasked: string; createdAt: string; sentAt: string | null; deliveredAt: string | null; readAt: string | null; failedAt: string | null; error: string | null }>;
}

export class WaApiError extends Error {
  constructor(message: string, public readonly status: number, public readonly code?: string, public readonly duplicate?: { status: string; sentAt: string | null }) {
    super(message);
  }
}

async function call<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await authedFetch(url, init);
  if (!res.ok) {
    const body = await readJsonBody<{ error?: string; code?: string; duplicate?: { status: string; sentAt: string | null } }>(res.clone());
    throw new WaApiError(body?.error || await apiErrorMessage(res), res.status, body?.code, body?.duplicate);
  }
  return (await readJsonBody<T>(res)) as T;
}

const jsonInit = (method: string, body: unknown): RequestInit => ({ method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

export const fetchWhatsAppStatus = (shopId: string) =>
  call<WaConnectionStatus>(`/api/whatsapp/connection?shopId=${encodeURIComponent(shopId)}`);

export const updateWhatsAppSettings = (shopId: string, update: Record<string, unknown>) =>
  call<{ success: true }>('/api/whatsapp/connection', jsonInit('PUT', { shopId, ...update }));

export const disconnectWhatsApp = (shopId: string) =>
  call<{ success: true }>(`/api/whatsapp/connection?shopId=${encodeURIComponent(shopId)}`, { method: 'DELETE' });

export const connectSandbox = (shopId: string, body: { phoneNumberId: string; wabaId: string; accessToken: string; tokenKind: 'sandbox_temporary' | 'system_user' }) =>
  call<{ success: true; displayPhoneNumber: string | null }>('/api/whatsapp/sandbox', jsonInit('POST', { shopId, ...body }));

export const finishEmbeddedSignup = (shopId: string, body: { code: string; event: string; wabaId: string; phoneNumberId: string; businessId?: string }) =>
  call<{ success: true; displayPhoneNumber: string | null }>('/api/whatsapp/embedded-signup', jsonInit('POST', { shopId, ...body }));

export const verifyWhatsApp = (shopId: string) =>
  call<{ success: true; coexistenceLost: boolean; templatesSynced: number }>('/api/whatsapp/verify', jsonInit('POST', { shopId }));

export const templatesAction = (shopId: string, action: 'sync' | 'submit', languages?: WaLanguage[]) =>
  call<{ success: true; synced?: number; submitted?: Array<{ name: string; language: string; status: string; error?: string }> }>('/api/whatsapp/templates', jsonInit('POST', { shopId, action, ...(languages ? { languages } : {}) }));

export const fetchDialogState = (shopId: string, resourceType: WaResourceType, resourceId: string, language: WaLanguage) =>
  call<WaDialogState>(`/api/whatsapp/messages?shopId=${encodeURIComponent(shopId)}&resourceType=${resourceType}&resourceId=${encodeURIComponent(resourceId)}&language=${language}`);

export const sendWhatsApp = (shopId: string, body: { resourceType: WaResourceType; resourceId: string; language: WaLanguage; clientRequestId: string; confirmResend?: boolean; recordConsent?: { source: 'staff_verbal' | 'staff_written'; note?: string } }) =>
  call<{ success: true; message: { id: string; status: string; mode: string; toMasked: string }; replay: boolean }>('/api/whatsapp/send', jsonInit('POST', { shopId, ...body }));

export const recordWhatsAppConsent = (shopId: string, body: { resourceType: WaResourceType; resourceId: string; status: 'opted_in' | 'opted_out'; source: 'staff_verbal' | 'staff_written' | 'customer_form' | 'staff_opt_out'; note?: string }) =>
  call<{ success: true }>('/api/whatsapp/consent', jsonInit('POST', { shopId, ...body }));

/** Fire-and-forget: the job card screen calls this after a stage change has saved. Never throws. */
export function notifyJobStageForWhatsApp(shopId: string, jobId: string): void {
  // Every other shop: no request at all.
  if (!isWhatsAppPilotShop(shopId)) return;
  try {
    void authedFetch('/api/whatsapp/automation', jsonInit('POST', { shopId, event: 'job_stage_changed', jobId })).catch(() => {});
  } catch { /* automations must never affect the job card workflow */ }
}
