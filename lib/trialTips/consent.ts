/**
 * Recording, reading and withdrawing trial-tips consent — server-side only,
 * always through the database functions in
 * supabase/migrations/2026-09-30_trial_tips_email.sql.
 */
import { KNOWN_CONSENT_VERSIONS, TRIAL_TIPS_CONSENT_VERSION } from './config';
import type { TrialTipsDb } from './runner';

export type ConsentResult = 'recorded' | 'already' | 'unverified' | 'suppressed' | 'not_requested';

interface SignupUser {
  id: string;
  created_at?: string | null;
  user_metadata?: Record<string, unknown> | null;
}

/**
 * At email verification (/auth/callback): record the consent the person gave
 * at signup, if they gave it.
 *
 * The checkbox answer travels in user_metadata. It is only a request: it
 * becomes consent here, on the server, after the address is proven, with the
 * server's own timestamp. An unknown consent-text version is not trusted.
 * Existing accounts never have the flag, so nobody is enrolled by this
 * shipping.
 */
export async function recordSignupConsent(db: TrialTipsDb, user: SignupUser): Promise<ConsentResult> {
  const meta = user.user_metadata ?? {};
  const version = typeof meta.trial_tips_consent_version === 'string' ? meta.trial_tips_consent_version : '';
  if (meta.trial_tips_opt_in !== true || !KNOWN_CONSENT_VERSIONS.has(version)) return 'not_requested';

  const { data, error } = await db.rpc('trial_tips_record_consent', {
    p_user: user.id,
    p_version: version,
    p_source: 'signup',
    p_requested_at: user.created_at ?? null,
  });
  if (error) throw new Error(`trial_tips_record_consent failed: ${error.message}`);
  return data as ConsentResult;
}

/** Settings: switch on. Uses the current consent wording. */
export async function subscribeFromSettings(db: TrialTipsDb, userId: string): Promise<ConsentResult> {
  const { data, error } = await db.rpc('trial_tips_record_consent', {
    p_user: userId,
    p_version: TRIAL_TIPS_CONSENT_VERSION,
    p_source: 'settings',
    p_requested_at: new Date().toISOString(),
  });
  if (error) throw new Error(`trial_tips_record_consent failed: ${error.message}`);
  return data as ConsentResult;
}

export type UnsubscribeSource = 'link' | 'one_click' | 'settings';

export async function unsubscribe(db: TrialTipsDb, userId: string, source: UnsubscribeSource): Promise<string> {
  const { data, error } = await db.rpc('trial_tips_unsubscribe', { p_user: userId, p_source: source });
  if (error) throw new Error(`trial_tips_unsubscribe failed: ${error.message}`);
  return data as string;
}
