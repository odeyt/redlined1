/**
 * Environment helpers for Redlined1.
 *
 * - NEXT_PUBLIC_* variables are safe for both client and server
 * - Server-only variables (no NEXT_PUBLIC_ prefix) must only be read server-side
 * - getAppEnvironment() is the single source of truth for the current environment
 */

export type AppEnvironment = 'development' | 'staging' | 'production';

// ── Environment detection ─────────────────────────────────────────────────────

/**
 * Returns the current runtime environment.
 * Priority: NEXT_PUBLIC_APP_ENV → NODE_ENV → VERCEL_ENV → 'development'
 */
export function getAppEnvironment(): AppEnvironment {
  const declared = process.env.NEXT_PUBLIC_APP_ENV;
  if (declared === 'production' || declared === 'staging' || declared === 'development') {
    return declared;
  }

  // Vercel preview = staging
  if (process.env.VERCEL_ENV === 'preview') return 'staging';
  if (process.env.VERCEL_ENV === 'production') return 'production';

  // NODE_ENV fallback
  if (process.env.NODE_ENV === 'production') return 'production';

  return 'development';
}

export function isDevelopment(): boolean {
  return getAppEnvironment() === 'development';
}

export function isStaging(): boolean {
  return getAppEnvironment() === 'staging';
}

export function isProduction(): boolean {
  return getAppEnvironment() === 'production';
}

// ── URLs ──────────────────────────────────────────────────────────────────────

export function getAppUrl(): string {
  const declared = process.env.NEXT_PUBLIC_APP_URL;
  if (declared) return declared;

  if (isProduction()) return 'https://redlined1.com';
  if (isStaging()) return 'https://staging.redlined1.com';
  return 'http://localhost:3000';
}

// ── Feature flag environment ──────────────────────────────────────────────────

/**
 * Which environment the feature flag system should use for evaluation.
 * Can be overridden via NEXT_PUBLIC_FEATURE_FLAGS_ENV for special cases.
 */
export function getFeatureFlagEnvironment(): AppEnvironment {
  const declared = process.env.NEXT_PUBLIC_FEATURE_FLAGS_ENV;
  if (declared === 'production' || declared === 'staging' || declared === 'development') {
    return declared;
  }
  return getAppEnvironment();
}

// ── Required env var validation ───────────────────────────────────────────────

const REQUIRED_SERVER_VARS: string[] = [
  'NEXT_PUBLIC_SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_ANON_KEY',
  'SUPABASE_SERVICE_ROLE_KEY',
];

const REQUIRED_PRODUCTION_VARS: string[] = [
  ...REQUIRED_SERVER_VARS,
  'NEXT_PUBLIC_APP_URL',
];

/**
 * Call this in server startup / API route initialization to catch missing vars early.
 * In development: warns to console.
 * In production: throws to prevent a misconfigured deploy from silently failing.
 */
export function assertRequiredEnvVars(): void {
  const env = getAppEnvironment();
  const required = env === 'production' ? REQUIRED_PRODUCTION_VARS : REQUIRED_SERVER_VARS;

  const missing = required.filter(key => !process.env[key]);

  if (missing.length === 0) return;

  const message = `[Redlined1] Missing required environment variables: ${missing.join(', ')}`;

  if (env === 'production') {
    throw new Error(message);
  } else {
    console.warn(message);
  }
}

// ── Debug helper (server only) ────────────────────────────────────────────────

/** Returns a safe summary of environment state — never includes secret values. */
export function getEnvSummary(): Record<string, string> {
  return {
    appEnv:              getAppEnvironment(),
    appUrl:              getAppUrl(),
    featureFlagEnv:      getFeatureFlagEnvironment(),
    nodeEnv:             process.env.NODE_ENV ?? 'unknown',
    vercelEnv:           process.env.VERCEL_ENV ?? 'not-vercel',
    supabaseUrlSet:      !!process.env.NEXT_PUBLIC_SUPABASE_URL ? 'yes' : 'NO',
    serviceRoleKeySet:   !!process.env.SUPABASE_SERVICE_ROLE_KEY ? 'yes' : 'NO',
    anthropicKeySet:     !!process.env.ANTHROPIC_API_KEY ? 'yes' : 'NO',
    paymentProvider:     process.env.PAYMENT_PROVIDER ?? 'not set',
  };
}
