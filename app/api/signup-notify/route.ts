import { NextRequest, NextResponse } from 'next/server';
import { Resend } from 'resend';
import { getAdminDb } from '@/lib/supabaseServer';

/**
 * Owner alert for a new trial signup — one email to admin@redlined1.com.
 *
 * Why this was rewritten (2026-09-25): production never sent one of these.
 * The signup page calls this route straight after supabase.auth.signUp(),
 * while the visitor is still unconfirmed and has no session, and proxy.ts
 * answered every call with 401 before this handler ran — all five production
 * signups between 2026-09-13 and 2026-09-24 show `POST /api/signup-notify 401`
 * from the middleware and nothing else. Behind that were two more faults
 * that would have failed it anyway: the sandbox sender (onboarding@resend.dev
 * delivers only to the Resend account owner), and a send whose returned
 * `{ error }` was never read, so a refusal looked like success.
 *
 * The route is now public in proxy.ts, so it is authenticated differently:
 * it trusts nothing in the request except which account to look up.
 *
 *   - The caller sends the new user's id and email. The account is read with
 *     the service role, the email must match, and it must have been created
 *     within FRESH_WINDOW_MS — an old or unknown account gets no email. That
 *     is what stops this becoming a way to email the owner at will.
 *   - Name and shop come from the account's own signup metadata and are
 *     HTML-escaped; the request body never reaches the email.
 *   - One alert per account: Resend's idempotency key is derived from the
 *     user id and the payload is deterministic (no "now" in it), so a retry,
 *     a double submit or a repeated callback returns the original send
 *     instead of a second email. The key outlives the freshness window, so
 *     no later call can produce a second alert either.
 *
 * Never blocks signup: the page fires this without awaiting it. Failures are
 * reported in the response and through logger.error (Vercel logs + Sentry).
 */

const SIGNUP_ALERT_TO = 'admin@redlined1.com';

/** The verified-domain sender that production already delivers from — the
 *  same address send-document and invite use. MAIL_FROM_ADDRESS overrides it
 *  when set, as it does for every configurable sender. */
const DEFAULT_SENDER = 'noreply@redlined1.com';

/** How long after account creation an alert may still be sent. Long enough
 *  for a slow network or a retry; short enough that an old account id is
 *  useless to anyone replaying this endpoint. */
const FRESH_WINDOW_MS = 30 * 60 * 1000;

type SignupAlertState = 'sent' | 'duplicate' | 'failed' | 'skipped';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Resend's answer when an idempotency key is replayed with a different
 *  payload, or while the first request is still in flight. Either way an
 *  alert for this account is already on its way — not a failure. */
const IDEMPOTENT_REPLAY = new Set(['invalid_idempotent_request', 'concurrent_idempotent_requests']);

// Same in-memory per-IP idiom as /api/shop-audit.
const attempts = new Map<string, { count: number; resetAt: number }>();
function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const entry = attempts.get(ip);
  if (!entry || now > entry.resetAt) {
    attempts.set(ip, { count: 1, resetAt: now + 60_000 });
    return false;
  }
  entry.count++;
  return entry.count > 10;
}

const ESCAPES: Record<string, string> = {
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
};
function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, c => ESCAPES[c] ?? c);
}

function metaText(value: unknown, max: number): string {
  return String(value ?? '').trim().slice(0, max);
}

async function logFailure(reason: string, cause: unknown, userId: string) {
  try {
    const { logger } = await import('@/lib/logger');
    // The user id, never the email: enough to find the account, nothing more.
    logger.error('signupAlert.failed', cause, { userId, reason });
  } catch { /* the signup is unaffected either way */ }
}

export async function POST(req: NextRequest) {
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0].trim() ?? 'unknown';
  if (isRateLimited(ip)) {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  }
  const userId = metaText(body.userId, 64);
  const email = metaText(body.email, 254).toLowerCase();
  if (!UUID_RE.test(userId) || !email) {
    return NextResponse.json({ error: 'Missing fields' }, { status: 400 });
  }

  // The account is the only source of truth. Unknown id, mismatched email and
  // lookup failure all answer the same way, so this cannot be used to probe
  // which accounts exist.
  let user: { id: string; email?: string; created_at: string; user_metadata?: Record<string, unknown> } | null = null;
  try {
    const { data, error } = await getAdminDb().auth.admin.getUserById(userId);
    if (!error) user = data.user;
  } catch { /* treated as not found */ }
  if (!user || (user.email ?? '').toLowerCase() !== email) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const createdAt = new Date(user.created_at);
  if (!(Date.now() - createdAt.getTime() <= FRESH_WINDOW_MS)) {
    return NextResponse.json({ ok: true, notified: 'skipped' satisfies SignupAlertState, reason: 'not a new signup' });
  }

  if (!process.env.RESEND_API_KEY?.trim()) {
    await logFailure('RESEND_API_KEY not configured', null, user.id);
    return NextResponse.json({ ok: true, notified: 'skipped' satisfies SignupAlertState, reason: 'email not configured' });
  }

  const name = metaText(user.user_metadata?.full_name, 120) || '—';
  const shopName = metaText(user.user_metadata?.shop_name, 160);
  // Deterministic: from the account, not the clock, so a retry sends an
  // identical payload and Resend's idempotency key matches it.
  const signedUp = createdAt.toUTCString();
  const from = `Redlined1 <${process.env.MAIL_FROM_ADDRESS?.trim() || DEFAULT_SENDER}>`;

  let state: SignupAlertState;
  let messageId: string | null = null;
  let reason: string | null = null;
  try {
    const { data, error } = await new Resend(process.env.RESEND_API_KEY).emails.send(
      {
        from,
        to: SIGNUP_ALERT_TO,
        replyTo: user.email,
        subject: `🆕 New Trial Signup — ${shopName || name}`,
        html: `
        <div style="font-family:sans-serif;max-width:560px;margin:0 auto;background:#0d0d10;color:#eee;border-radius:12px;overflow:hidden">
          <div style="background:#cc0000;padding:20px 28px">
            <div style="font-size:22px;font-weight:900;color:#fff;letter-spacing:-0.5px">REDLINED<span style="color:#ffcccc">1</span> <span style="font-size:15px;font-weight:600;color:rgba(255,255,255,0.85)">New Trial Signup</span></div>
          </div>
          <div style="padding:28px">
            <table style="width:100%;border-collapse:collapse;font-size:14px">
              <tr><td style="padding:7px 0;color:#888;width:120px">Name</td><td style="padding:7px 0;font-weight:700;color:#fff">${escapeHtml(name)}</td></tr>
              <tr><td style="padding:7px 0;color:#888">Shop Name</td><td style="padding:7px 0;font-weight:700;color:#fff">${escapeHtml(shopName || '—')}</td></tr>
              <tr><td style="padding:7px 0;color:#888">Email</td><td style="padding:7px 0;font-weight:700;color:#cc6666">${escapeHtml(user.email ?? '')}</td></tr>
              <tr><td style="padding:7px 0;color:#888">Plan</td><td style="padding:7px 0;font-weight:700;color:#4caf50">7-Day Free Trial</td></tr>
              <tr><td style="padding:7px 0;color:#888">Signed up</td><td style="padding:7px 0;color:#aaa">${escapeHtml(signedUp)}</td></tr>
            </table>
            <p style="font-size:13px;color:#666;line-height:1.6;margin:20px 0 0">
              Reply to this email to reach the new customer directly. The account may not have confirmed its email yet.
            </p>
          </div>
        </div>`,
      },
      { idempotencyKey: `signup-alert/${user.id}` },
    );
    if (error) {
      if (IDEMPOTENT_REPLAY.has(error.name)) {
        state = 'duplicate';
      } else {
        state = 'failed';
        reason = `${error.name}${error.statusCode ? ` (${error.statusCode})` : ''}: ${error.message}`;
        await logFailure(reason, error, user.id);
      }
    } else if (!data?.id) {
      state = 'failed';
      reason = 'Resend returned no message id';
      await logFailure(reason, null, user.id);
    } else {
      state = 'sent';
      messageId = data.id;
      try {
        const { logger } = await import('@/lib/logger');
        logger.info('signupAlert.sent', { userId: user.id, messageId });
      } catch { /* logging only */ }
    }
  } catch (e) {
    state = 'failed';
    reason = e instanceof Error ? e.message : 'unknown error';
    await logFailure(reason, e, user.id);
  }

  // 200 whatever happened to the email: the signup already succeeded, and
  // `notified` says what became of the alert.
  return NextResponse.json({
    ok: true,
    notified: state,
    ...(messageId ? { messageId } : {}),
    ...(reason ? { reason } : {}),
  });
}
