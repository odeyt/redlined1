import { NextRequest, NextResponse } from 'next/server';
import { requireShopRole } from '@/lib/serverAuth';
import { createServerSupabase } from '@/lib/supabase-server';
import { parseJsonBody, sanitizeError, escapeHtml, isRateLimited, wasRecentlyPerformed, getTrustedSiteUrl } from '@/lib/apiHelpers';
import { JobNotifySchema, RepairStageSchema } from '@/lib/schemas';

/**
 * POST /api/job-notify — send an SMS/email repair-status update to a customer.
 *
 * Caller: must be authenticated via a valid Supabase bearer token AND a
 *   member of the target shop (`shopId`) with role owner, manager, or
 *   advisor — technicians do not trigger customer-facing notifications.
 *   ASSUMPTION (not confirmed against a documented business rule — flag if
 *   wrong): notifications are customer-facing/front-of-house work, same
 *   population as who can already see the member roster's "advisor" role.
 * Resource authorized: `shopId` in the body, resolved to the caller's own
 *   shop_users membership.
 * Recipient/content are NEVER taken from the request body — `jobId` and
 *   `shopId` are the only accepted fields, used purely as resource
 *   identifiers to look up the job. customerPhone, customerEmail, the
 *   current stage, and the tracking URL are all read from the job_cards row
 *   itself (via `.eq('id', jobId).eq('shop_id', shopId)`), so a caller can
 *   never redirect a notification to an arbitrary phone/email or claim a
 *   fake stage (see CRITICAL 3 in the security review this fixes).
 * Cross-shop access prevention: requireShopRole() + the shop_id-scoped
 *   job_cards lookup together mean a caller can never notify about, or
 *   consume the Twilio/Resend credentials of, a shop they aren't a member
 *   of — a job lookup miss returns the same generic 404 whether the jobId
 *   belongs to another shop or doesn't exist at all.
 * Rate limiting / idempotency: capped per shop per minute, and deduplicated
 *   per (shop, job, stage) for 5 minutes so retries/double-clicks don't
 *   trigger repeated SMS/email sends (and charges). This is a BEST-EFFORT,
 *   in-process mitigation only (see lib/apiHelpers.ts) — NOT a security
 *   control and not a hard guarantee against abuse.
 * notifySms/notifyEmail (optional booleans, default true): which channel(s)
 *   to send on this call, for the legitimate case where staff want to skip
 *   SMS or email for one notification. These are toggles only — they never
 *   carry a phone number or address; the actual recipient always comes from
 *   the job_cards row.
 */
const STAGE_MESSAGES: Record<string, { short: string; body: string }> = {
  checked_in:    { short: 'Checked In',       body: 'Your vehicle has been checked in and is in our queue.' },
  inspecting:    { short: 'Being Inspected',   body: 'Our technician is now performing a full vehicle inspection.' },
  waiting_parts: { short: 'Waiting for Parts', body: 'Parts have been ordered and are on their way to us.' },
  in_repair:     { short: 'In Repair',         body: 'Great news — your vehicle is currently being repaired.' },
  quality_check: { short: 'Quality Check',     body: 'Repairs are done! We\'re doing a final quality check now.' },
  ready:         { short: 'Ready for Pickup',  body: 'Your vehicle is ready! You can come pick it up anytime.' },
};

export async function POST(req: NextRequest) {
  const parsed = await parseJsonBody(req, JobNotifySchema);
  if (!parsed.ok) return parsed.response;
  const { jobId, shopId, notifySms, notifyEmail } = parsed.data;

  const auth = await requireShopRole(req, shopId, ['owner', 'manager', 'advisor']);
  if (!auth.ok) return auth.response;

  if (isRateLimited(`job-notify:shop:${shopId}`, 30, 60_000)) {
    return NextResponse.json({ error: 'Too many notifications sent. Please try again shortly.' }, { status: 429 });
  }

  const admin = createServerSupabase();
  const { data: job, error: jobError } = await admin
    .from('job_cards')
    .select('id, repair_stage, status_token, customer_phone, customer_email')
    .eq('id', jobId)
    .eq('shop_id', shopId)
    .maybeSingle();
  if (jobError) {
    return NextResponse.json({ error: sanitizeError(jobError, 'job-notify:POST job lookup', 'Unable to send notification') }, { status: 500 });
  }
  if (!job) {
    // Same response whether jobId belongs to another shop or doesn't exist.
    return NextResponse.json({ error: 'Job not found' }, { status: 404 });
  }

  const stageCheck = RepairStageSchema.safeParse(job.repair_stage);
  if (!stageCheck.success) {
    return NextResponse.json({ error: 'Job has no valid repair stage set' }, { status: 400 });
  }
  const stage = stageCheck.data;

  if (wasRecentlyPerformed(`job-notify:${shopId}:${jobId}:${stage}`, 5 * 60_000)) {
    return NextResponse.json({ ok: true, deduped: true });
  }

  const { data: shop, error: shopErr } = await admin.from('shops').select('name').eq('id', shopId).maybeSingle();
  const { data: settings, error: settingsErr } = await admin.from('shop_settings').select('phone, email').eq('shop_id', shopId).maybeSingle();
  if (shopErr) sanitizeError(shopErr, 'job-notify:POST shop lookup');
  if (settingsErr) sanitizeError(settingsErr, 'job-notify:POST settings lookup');

  const shopNameRaw = shop?.name ?? 'Your Auto Shop';
  const shopName = escapeHtml(shopNameRaw);
  const shopPhone = settings?.phone ?? '';
  const shopEmail = settings?.email ?? '';
  const msg = STAGE_MESSAGES[stage];

  // Generated server-side from the stored opaque token and a validated site
  // URL — never trusts a caller-supplied URL or an unvalidated env var.
  const siteUrl = getTrustedSiteUrl();
  if (!siteUrl) {
    return NextResponse.json(
      { error: sanitizeError(new Error('NEXT_PUBLIC_SITE_URL is not a valid trusted URL'), 'job-notify:POST site-url', 'Server misconfiguration — please contact support') },
      { status: 500 },
    );
  }
  const statusUrl = job.status_token ? `${siteUrl}/status/${job.status_token}` : undefined;

  const results: { sms?: string; email?: string; smsError?: string; emailError?: string } = {};

  // ── SMS via Twilio ────────────────────────────────────────────────────
  if (job.customer_phone && notifySms) {
    const sid = process.env.TWILIO_ACCOUNT_SID;
    const token = process.env.TWILIO_AUTH_TOKEN;
    const from = process.env.TWILIO_PHONE_NUMBER;

    if (sid && token && from) {
      const smsBody = `${shopNameRaw}: ${msg.body}${statusUrl ? `\nTrack your repair: ${statusUrl}` : ''}\nQuestions? Call ${shopPhone}`;
      try {
        const res = await fetch(
          `https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`,
          {
            method: 'POST',
            headers: {
              'Authorization': 'Basic ' + Buffer.from(`${sid}:${token}`).toString('base64'),
              'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: new URLSearchParams({ To: job.customer_phone, From: from, Body: smsBody }).toString(),
          }
        );
        const json = await res.json();
        if (res.ok) results.sms = json.sid;
        else results.smsError = sanitizeError(json, 'job-notify:POST twilio', 'SMS failed to send');
      } catch (e) {
        results.smsError = sanitizeError(e, 'job-notify:POST twilio', 'SMS failed to send');
      }
    } else {
      results.smsError = sanitizeError(new Error('Twilio env vars missing'), 'job-notify:POST twilio-config', 'SMS is not configured for this shop');
    }
  }

  // ── Email via Resend ─────────────────────────────────────────────────
  if (job.customer_email && notifyEmail) {
    const apiKey = process.env.RESEND_API_KEY;
    if (apiKey) {
      const html = `
        <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:560px;margin:0 auto;padding:32px 24px">
          <div style="background:#cc0000;border-radius:10px 10px 0 0;padding:20px 24px">
            <div style="font-size:20px;font-weight:900;color:#fff">${shopName}</div>
            <div style="font-size:12px;color:rgba(255,255,255,0.75);margin-top:2px">Repair Status Update</div>
          </div>
          <div style="background:#fff;border:1px solid #eee;border-top:none;border-radius:0 0 10px 10px;padding:28px 24px">
            <div style="font-size:28px;margin-bottom:8px">🔧</div>
            <div style="font-size:22px;font-weight:800;color:#111;margin-bottom:8px">${msg.short}</div>
            <div style="font-size:15px;color:#444;line-height:1.6;margin-bottom:24px">${msg.body}</div>
            ${statusUrl ? `
            <a href="${statusUrl}" style="display:inline-block;background:#cc0000;color:#fff;text-decoration:none;padding:14px 28px;border-radius:8px;font-weight:700;font-size:15px;margin-bottom:24px">
              📍 Track Your Repair Live →
            </a>` : ''}
            <div style="border-top:1px solid #eee;padding-top:16px;font-size:12px;color:#aaa">
              ${shopName}${shopPhone ? ` · ${escapeHtml(shopPhone)}` : ''}${shopEmail ? ` · ${escapeHtml(shopEmail)}` : ''}
            </div>
          </div>
        </div>`;

      try {
        const res = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            from: `${shopNameRaw} <noreply@redlined1.com>`,
            to: [job.customer_email],
            subject: `${msg.short} — ${shopNameRaw}`,
            html,
          }),
        });
        const json = await res.json();
        if (res.ok) results.email = json.id;
        else results.emailError = sanitizeError(json, 'job-notify:POST resend', 'Email failed to send');
      } catch (e) {
        results.emailError = sanitizeError(e, 'job-notify:POST resend', 'Email failed to send');
      }
    } else {
      results.emailError = sanitizeError(new Error('Resend env var missing'), 'job-notify:POST resend-config', 'Email is not configured for this shop');
    }
  }

  return NextResponse.json({ ok: true, ...results });
}
