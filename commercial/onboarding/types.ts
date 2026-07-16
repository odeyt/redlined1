/**
 * commercial/onboarding/types.ts
 * Typed models for the commercial signup and onboarding flow.
 */

export type SignupIntent = 'trial' | 'paid';
export type CommercialPlanKey = 'solo' | 'starter' | 'professional' | 'business' | null;
export type BillingPeriod = 'monthly' | 'annual' | null;

/**
 * CommercialSignupIntent — stored in localStorage and optionally in the
 * onboarding_sessions table to survive the email-verification round trip.
 * Only the server may trust `userId` — the client-stored copy is advisory only.
 */
export interface CommercialSignupIntent {
  userId?: string;
  intent: SignupIntent;
  plan: CommercialPlanKey;
  period: BillingPeriod;
  source: string | null;
  campaign: string | null;
  createdAt: string;   // ISO-8601
  expiresAt: string;   // ISO-8601 (48 h from creation)
  consumedAt: string | null;
}

export const VALID_PLAN_KEYS: CommercialPlanKey[] = ['solo', 'starter', 'professional', 'business'];
export const VALID_PERIODS: BillingPeriod[] = ['monthly', 'annual'];

/** Returns true if the intent has not expired. */
export function intentIsValid(intent: CommercialSignupIntent): boolean {
  return new Date(intent.expiresAt) > new Date() && intent.consumedAt === null;
}

/** Parses and validates a raw localStorage string. Returns null on any failure. */
export function parseStoredIntent(raw: string | null): CommercialSignupIntent | null {
  if (!raw) return null;
  try {
    const obj = JSON.parse(raw) as CommercialSignupIntent;
    if (!obj.intent || !obj.createdAt || !obj.expiresAt) return null;
    if (!intentIsValid(obj)) return null;
    return obj;
  } catch {
    return null;
  }
}
