import { NextRequest, NextResponse } from 'next/server';
import { Resend } from 'resend';
import { getAdminDb } from '@/lib/supabaseServer';
import { mailFrom, usingSandboxSender } from '@/lib/mail/sender';

/**
 * What happened to the notification, as three distinct outcomes.
 *
 * This was a boolean, and `false` meant either "no recipient is configured"
 * or "Resend threw" — two problems with completely different fixes. Verifying
 * the funnel in production cost two round trips precisely because the
 * response could not say which one had occurred. The lead is stored either
 * way; this only describes the email.
 */
export type NotifyState = 'sent' | 'skipped' | 'failed';

/**
 * Book a Shop Audit — inbound lead capture.
 *
 * Stores first, notifies second, and reports success on the store. The
 * existing /api/contact-sales route only sends an email: when Resend is down
 * or the recipient bounces, the lead is gone with no record it ever arrived.
 * Here the row is the deliverable and the email is a convenience, so a failed
 * notification is logged and the submission still succeeds.
 *
 * Anonymous by design — a shop owner should not need an account to ask for an
 * audit — so everything the browser sends is treated as hostile: rate-limited
 * per IP, length-capped per field, numbers coerced and bounded, and written
 * with the service role into a table whose RLS denies anon every command
 * (see supabase/migrations/2026-09-13_shop_audit_leads.sql).
 */

// Same idiom as /api/auth/check-email: in-memory, per-IP, resets on cold
// start. Not a distributed limiter — it raises the cost of casual abuse
// without adding infrastructure this app does not otherwise run.
const attempts = new Map<string, { count: number; resetAt: number }>();

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const entry = attempts.get(ip);
  if (!entry || now > entry.resetAt) {
    attempts.set(ip, { count: 1, resetAt: now + 60_000 });
    return false;
  }
  entry.count++;
  return entry.count > 5;
}

/** Trim, coerce to string, and cap. Length caps are the cheapest defence
 *  against someone pasting a megabyte into a textarea. */
function text(value: unknown, max: number): string {
  return String(value ?? '').trim().slice(0, max);
}

/** Non-negative integer within a sane ceiling, or null. Anything unparseable
 *  becomes null rather than 0 — "not answered" and "zero" are different. */
function count(value: unknown, max: number): number | null {
  const raw = String(value ?? '').trim();
  if (!raw) return null;
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n) || n < 0 || n > max) return null;
  return n;
}

/** Deliberately permissive: rejects obvious nonsense without turning into an
 *  RFC-5322 parser that refuses somebody's real address. */
function looksLikeEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) && value.length <= 254;
}

const CONTACT_METHODS = new Set(['email', 'phone', 'whatsapp']);

/** How the owner's notification names each form that posts here, keyed by
 *  `source`. Anything unrecognised is described as a shop audit, which is
 *  what this endpoint was built for. */
const REQUEST_KINDS: Record<string, { subject: string; heading: string }> = {
  'shop-audit': { subject: 'Shop audit request', heading: 'shop audit request' },
  'shop-owner-demo': { subject: 'Walkthrough request', heading: 'walkthrough request (from /shop-owner-demo)' },
};

const ESCAPES: Record<string, string> = {
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
};

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, c => ESCAPES[c] ?? c);
}

export async function POST(req: NextRequest) {
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0].trim() ?? 'unknown';
  if (isRateLimited(ip)) {
    return NextResponse.json({ error: 'Too many requests. Please try again in a minute.' }, { status: 429 });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  }

  // Honeypot. Forms that send `website` render it off-screen and hidden from
  // assistive technology, so a person never fills it in and a form-filling bot
  // usually does. Answer exactly as a success would, so the bot learns nothing
  // — but store nothing and email nobody.
  if (text(body.website, 200)) {
    return NextResponse.json({ ok: true, id: null, notified: 'skipped' }, { status: 201 });
  }

  const fullName = text(body.fullName, 120);
  const email = text(body.email, 254).toLowerCase();

  if (!fullName) {
    return NextResponse.json({ error: 'Your name is required.', field: 'fullName' }, { status: 400 });
  }
  if (!looksLikeEmail(email)) {
    return NextResponse.json({ error: 'Enter a valid work email address.', field: 'email' }, { status: 400 });
  }

  const preferred = text(body.preferredContactMethod, 20).toLowerCase();

  const lead = {
    full_name: fullName,
    email,
    phone: text(body.phone, 40) || null,
    shop_name: text(body.shopName, 160) || null,
    country: text(body.country, 80) || null,
    location_count: count(body.locationCount, 10_000),
    technician_count: count(body.technicianCount, 10_000),
    monthly_vehicle_volume: count(body.monthlyVehicleVolume, 1_000_000),
    current_software: text(body.currentSoftware, 160) || null,
    biggest_challenge: text(body.biggestChallenge, 2000) || null,
    preferred_contact_method: CONTACT_METHODS.has(preferred) ? preferred : null,
    preferred_time: text(body.preferredTime, 160) || null,
    source: text(body.source, 80) || 'shop-audit',
    utm_source: text(body.utmSource, 120) || null,
    utm_medium: text(body.utmMedium, 120) || null,
    utm_campaign: text(body.utmCampaign, 120) || null,
  };

  // The row is the deliverable. If this fails the caller must be told, because
  // nothing else is holding the lead.
  let leadId: string | null = null;
  try {
    const db = getAdminDb();
    const { data, error } = await db.from('shop_audit_leads').insert(lead).select('id').single();
    if (error) throw new Error(error.message);
    leadId = (data?.id as string) ?? null;
  } catch (e) {
    try {
      const { logger } = await import('@/lib/logger');
      logger.error('shopAudit.store failed', e, { ip });
    } catch { /* reporting must not mask the original failure */ }
    return NextResponse.json(
      { error: 'We could not record your request. Please try again, or contact us directly.' },
      { status: 500 },
    );
  }

  // Same table, different ask: say which one arrived, so the owner knows
  // whether to plan an audit conversation or a product walkthrough.
  const kind = REQUEST_KINDS[lead.source] ?? REQUEST_KINDS['shop-audit'];

  // Notification is best-effort from here. The lead is already safe.
  //
  // 'skipped' is the honest answer when there is nothing to send with or
  // nobody to send to — it is a configuration gap, not a delivery failure,
  // and reporting it as a failure sends whoever is diagnosing to the wrong
  // place.
  let notified: NotifyState = 'skipped';
  let notifyError: string | null = null;
  const to = process.env.SALES_NOTIFY_EMAIL?.trim() || process.env.CONTACT_SALES_EMAIL?.trim();
  if (process.env.RESEND_API_KEY?.trim() && to) {
    try {
      const resend = new Resend(process.env.RESEND_API_KEY);
      const row = (label: string, value: string | number | null) =>
        value === null || value === ''
          ? ''
          : `<tr><td style="padding:4px 10px 4px 0;color:#888">${label}</td><td style="padding:4px 0"><strong>${escapeHtml(String(value))}</strong></td></tr>`;
      await resend.emails.send({
        from: mailFrom('RedlineD1'),
        to,
        replyTo: email,
        subject: `${kind.subject} — ${fullName}${lead.shop_name ? ` (${lead.shop_name})` : ''}`,
        html: [
          `<h2 style="font-family:system-ui">New ${kind.heading}</h2>`,
          '<table style="font-family:system-ui;font-size:14px;border-collapse:collapse">',
          row('Name', fullName),
          row('Email', email),
          row('Phone', lead.phone),
          row('Shop', lead.shop_name),
          row('Country', lead.country),
          row('Locations', lead.location_count),
          row('Technicians', lead.technician_count),
          row('Vehicles / month', lead.monthly_vehicle_volume),
          row('Current software', lead.current_software),
          row('Preferred contact', lead.preferred_contact_method),
          row('Preferred time', lead.preferred_time),
          row('Source', lead.source),
          '</table>',
          lead.biggest_challenge
            ? `<p style="font-family:system-ui;font-size:14px"><strong>Biggest challenge</strong><br/>${escapeHtml(lead.biggest_challenge)}</p>`
            : '',
          `<p style="font-family:system-ui;font-size:12px;color:#888">Lead ${leadId ?? 'unknown'} — stored in shop_audit_leads.</p>`,
        ].join(''),
      });
      notified = 'sent';
    } catch (e) {
      notified = 'failed';
      notifyError = e instanceof Error ? e.message : 'unknown error';
      try {
        const { logger } = await import('@/lib/logger');
        logger.error('shopAudit.notify failed', e, { leadId, sandboxSender: usingSandboxSender() });
      } catch { /* the lead is stored; a logging failure changes nothing */ }
    }
  }

  // notifyError is the provider's own message (a rejected recipient, an
  // unverified sending domain). It describes configuration, never the
  // submitted form, so it is safe to return — and it is what turns a failed
  // notification into something diagnosable without digging through logs.
  return NextResponse.json(
    { ok: true, id: leadId, notified, ...(notifyError ? { notifyError } : {}) },
    { status: 201 },
  );
}
