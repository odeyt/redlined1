/**
 * GET /api/billing/env-check
 *
 * Returns a safe environment diagnostic for the current billing configuration.
 * Platform owner only — no values exposed, only presence flags.
 *
 * Used during sandbox UAT and canary deployment verification.
 * Response is safe to log — contains no secret values.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const PAID_PLAN_VARS = [
  'CREEM_SOLO_MONTHLY_PRODUCT_ID',       'CREEM_SOLO_ANNUAL_PRODUCT_ID',
  'CREEM_STARTER_MONTHLY_PRODUCT_ID',    'CREEM_STARTER_ANNUAL_PRODUCT_ID',
  'CREEM_PROFESSIONAL_MONTHLY_PRODUCT_ID', 'CREEM_PROFESSIONAL_ANNUAL_PRODUCT_ID',
  'CREEM_BUSINESS_MONTHLY_PRODUCT_ID',   'CREEM_BUSINESS_ANNUAL_PRODUCT_ID',
];

const OWNER_EMAILS = (process.env.PLATFORM_OWNER_EMAIL ?? 'admin@redlined1.com')
  .split(',')
  .map(e => e.trim().toLowerCase())
  .filter(Boolean);

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization') ?? '';
  if (!authHeader.startsWith('Bearer ')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const token = authHeader.slice(7);
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const svcKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !svcKey) {
    return NextResponse.json({ error: 'Server misconfigured' }, { status: 500 });
  }

  const admin = createClient(url, svcKey, { auth: { autoRefreshToken: false, persistSession: false } });
  const { data: { user }, error } = await admin.auth.getUser(token);

  if (error || !user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (!OWNER_EMAILS.includes(user.email.toLowerCase())) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const missing = PAID_PLAN_VARS.filter(k => !process.env[k]);
  const present = PAID_PLAN_VARS.filter(k => !!process.env[k]);
  const apiKey = process.env.CREEM_API_KEY ?? '';

  const diagnostic = {
    environment:                  apiKey.startsWith('creem_test_') ? 'test' : apiKey ? 'production' : 'unknown',
    apiKeyConfigured:             !!apiKey,
    apiKeyIsTestKey:              apiKey.startsWith('creem_test_'),
    webhookSecretConfigured:      !!process.env.CREEM_WEBHOOK_SECRET,
    productMappingsConfigured:    present.length,
    productMappingsMissing:       missing,
    billingEnabled:               process.env.NEXT_PUBLIC_BILLING_ENABLED === 'true',
    paymentProvider:              process.env.PAYMENT_PROVIDER ?? process.env.BILLING_PROVIDER ?? '(not set)',
    successUrlConfigured:         !!process.env.CREEM_SUCCESS_URL,
    cancelUrlConfigured:          !!process.env.CREEM_CANCEL_URL,
    ready:                        false, // only true after explicit canary approval — never auto-set
  };

  return NextResponse.json(diagnostic);
}
