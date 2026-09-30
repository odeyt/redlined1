/**
 * POST /api/webhooks/resend — bounces, complaints and suppressions from
 * Resend. Public in proxy.ts because Resend has no session; it is
 * authenticated instead by the signature, checked against
 * RESEND_WEBHOOK_SECRET before anything in the body is used.
 *
 * All logic is in lib/trialTips/webhook.ts.
 */
import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/supabase-server';
import { handleResendWebhook } from '@/lib/trialTips/webhook';

export async function POST(req: NextRequest) {
  // The exact bytes are what was signed — read before any parsing.
  const rawBody = await req.text();
  let result;
  try {
    result = await handleResendWebhook({
      rawBody,
      headers: req.headers,
      secret: process.env.RESEND_WEBHOOK_SECRET?.trim() || undefined,
      db: createServerSupabase(),
    });
  } catch {
    // 500 makes Resend retry; the delivery id guards against double-applying.
    return NextResponse.json({ ok: false }, { status: 500 });
  }
  return NextResponse.json({ ok: result.status === 200, outcome: result.outcome }, { status: result.status });
}
