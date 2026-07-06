/**
 * GET /api/health
 *
 * Lightweight health check. Returns system status without exposing secrets.
 * Used by System Health view, uptime monitors, and release checklists.
 */

import { NextResponse } from 'next/server';
import { getAdminDb } from '@/lib/supabaseServer';
import { getAppEnvironment, getAppUrl } from '@/lib/environment';

const APP_VERSION = process.env.npm_package_version ?? '0.1.0';

async function checkSupabase(): Promise<boolean> {
  try {
    const db = getAdminDb();
    // Lightest possible query — counts nothing, just validates connection
    const { error } = await db.from('profiles').select('id').limit(1);
    return !error;
  } catch {
    return false;
  }
}

async function checkFeatureFlags(): Promise<boolean> {
  try {
    const db = getAdminDb();
    const { error } = await db.from('feature_flags').select('id').limit(1);
    return !error;
  } catch {
    return false;
  }
}

export async function GET() {
  const start = Date.now();

  const [supabaseOk, featureFlagsOk] = await Promise.all([
    checkSupabase(),
    checkFeatureFlags(),
  ]);

  const emailConfigured   = !!process.env.RESEND_API_KEY;
  const smsConfigured     = !!(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN);
  const aiConfigured      = !!process.env.ANTHROPIC_API_KEY;
  const sentryConfigured  = !!(process.env.SENTRY_DSN ?? process.env.NEXT_PUBLIC_SENTRY_DSN);
  const paymentConfigured = !!process.env.CREEM_API_KEY;

  const checks = {
    app:           true,
    supabase:      supabaseOk,
    feature_flags: featureFlagsOk,
    email:         emailConfigured ? 'configured' : 'missing',
    sms:           smsConfigured   ? 'configured' : 'missing',
    ai:            aiConfigured    ? 'configured' : 'missing',
    sentry:        sentryConfigured ? 'configured' : 'missing',
    payments:      paymentConfigured ? 'configured' : 'missing',
  };

  const status =
    !supabaseOk                     ? 'unhealthy' :
    !featureFlagsOk                 ? 'degraded'  :
    (!emailConfigured || !aiConfigured) ? 'degraded' :
    'healthy';

  return NextResponse.json({
    status,
    environment: getAppEnvironment(),
    app_url:     getAppUrl(),
    version:     APP_VERSION,
    timestamp:   new Date().toISOString(),
    response_ms: Date.now() - start,
    checks,
  });
}
