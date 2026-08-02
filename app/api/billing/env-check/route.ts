/**
 * GET /api/billing/env-check
 *
 * Platform-owner diagnostic endpoint. Returns presence flags for all required
 * Creem billing env vars — never exposes actual values.
 *
 * Auth: Bearer JWT required. Must be the platform owner email
 * (PLATFORM_OWNER_EMAIL env var).
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

const PAID_PLAN_VARS = [
  'CREEM_SOLO_MONTHLY_PRODUCT_ID',
  'CREEM_SOLO_ANNUAL_PRODUCT_ID',
  'CREEM_STARTER_MONTHLY_PRODUCT_ID',
  'CREEM_STARTER_ANNUAL_PRODUCT_ID',
  'CREEM_PROFESSIONAL_MONTHLY_PRODUCT_ID',
  'CREEM_PROFESSIONAL_ANNUAL_PRODUCT_ID',
  'CREEM_BUSINESS_MONTHLY_PRODUCT_ID',
  'CREEM_BUSINESS_ANNUAL_PRODUCT_ID',
];

async function getAuthenticatedUser(req: NextRequest) {
  // Accept Bearer token from Authorization header OR session cookie
  const authHeader = req.headers.get('authorization') ?? '';
  const bearerToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;

  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll() } },
  );

  if (bearerToken) {
    const { data: { user } } = await supabase.auth.getUser(bearerToken);
    return user;
  }

  const { data: { user } } = await supabase.auth.getUser();
  return user;
}

export async function GET(req: NextRequest) {
  const user = await getAuthenticatedUser(req);
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const ownerEmail = process.env.PLATFORM_OWNER_EMAIL;
  if (!ownerEmail || user.email !== ownerEmail) {
    return NextResponse.json({ error: 'Forbidden — platform owner only' }, { status: 403 });
  }

  const apiKey = process.env.CREEM_API_KEY?.trim() ?? '';

  // Which CLASS of Supabase key the server holds — never the value.
  //
  // "permission denied for table billing_events" is a GRANT failure, not an RLS
  // one (RLS returns zero rows, no error), and the sb_secret_ restricted keys
  // do not carry grants on the billing tables. Distinguishing the two key types
  // is otherwise impossible from outside, and guessing at it cost several
  // deploy-and-retry cycles.
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ?? '';
  const serviceKeyType =
    !serviceKey                     ? 'missing'
    : serviceKey.startsWith('eyJ')  ? 'legacy-service-role-jwt (full access)'
    : serviceKey.startsWith('sb_secret_') ? 'sb_secret restricted (NO access to billing tables)'
    : 'unrecognised';
  const missingVars = PAID_PLAN_VARS.filter(v => !process.env[v]);

  const result = {
    environment: apiKey.startsWith('creem_test_') ? 'test' : apiKey ? 'production' : 'unknown',
    apiKeyConfigured: !!apiKey,
    apiKeyIsTestKey: apiKey.startsWith('creem_test_'),
    webhookSecretConfigured: !!process.env.CREEM_WEBHOOK_SECRET,
    productMappingsConfigured: PAID_PLAN_VARS.length - missingVars.length,
    productMappingsMissing: missingVars,
    billingEnabled: process.env.NEXT_PUBLIC_BILLING_ENABLED === 'true',
    // Test mode and the key must agree. A live key against the sandbox host —
    // or a test key against the live host — fails with an opaque 401, so
    // surface the pair rather than each half separately.
    testMode: process.env.CREEM_TEST_MODE?.trim() === 'true',
    apiBaseUrl: process.env.CREEM_BASE_URL
      ?? (process.env.CREEM_TEST_MODE?.trim() === 'true'
        ? 'https://test-api.creem.io/v1'
        : 'https://api.creem.io/v1'),
    testModeMatchesKey:
      (process.env.CREEM_TEST_MODE?.trim() === 'true') === apiKey.startsWith('creem_test_'),
    serviceKeyType,
    paymentProvider: process.env.PAYMENT_PROVIDER ?? process.env.BILLING_PROVIDER ?? '(not set)',
    successUrlConfigured: !!process.env.CREEM_SUCCESS_URL,
    cancelUrlConfigured: !!process.env.CREEM_CANCEL_URL,
    ready: false, // only true after explicit canary approval — never auto-set
  };

  return NextResponse.json(result);
}
