import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/supabase-server';
import { requireShopRole } from '@/lib/serverAuth';
import { parseJsonBody, sanitizeError, isRateLimited } from '@/lib/apiHelpers';
import { SendMessageSchema } from '@/lib/schemas';

/**
 * POST /api/send-message — send an invoice/estimate notification via
 *   SMS, WhatsApp, LINE, or Telegram, using the shop's own configured
 *   channel credentials (Settings → Messaging).
 *
 * Caller: must be authenticated via a valid Supabase bearer token AND a
 *   member of the target shop (`shopId`) with role owner, manager, or
 *   advisor — same population as job-notify.
 * Resource authorized: `shopId` in the body, resolved to the caller's own
 *   shop_users membership.
 * Recipient is NEVER taken from the request body. The client sends only
 *   `resourceType` ('job' | 'customer' | 'estimate' | 'invoice') and
 *   `resourceId` — pure resource identifiers, scoped to `shopId` on every
 *   query. `SendMessageSchema` is `.strict()`, so a caller that still sends
 *   a `to` field (or any other unrecognized field) gets an explicit 400 —
 *   it is REJECTED, not silently stripped. The server resolves the
 *   phone/email server-side:
 *     - job      → job_cards.customer_phone / customer_email (row scoped by
 *                  id + shop_id)
 *     - customer → customers.phone / email (row scoped by id + shop_id)
 *     - estimate → estimates.customer_id → customers.phone/email (both hops
 *                  scoped to shop_id; customer_id can be null for
 *                  never-linked estimates, which is treated as "no trusted
 *                  recipient", not an error to fall back from)
 *     - invoice  → invoices.customer_id → customers.phone/email, same as
 *                  estimate
 *   If resolution comes back empty for the requested channel, the request
 *   is rejected — there is no fallback to any caller-supplied value, ever.
 * LINE and Telegram are DISABLED (400) regardless of caller/role: no table
 *   anywhere in this schema maps a customer to a LINE Notify token or a
 *   Telegram chat ID (confirmed by a repo-wide grep — see
 *   docs/SEND_MESSAGE_RECIPIENT_RESOLUTION.md for the migration this needs
 *   before those channels can ship). Shipping them today would mean either
 *   trusting a caller-supplied destination (the vulnerability this route
 *   fixes) or silently failing — neither is acceptable, so they're refused
 *   with a clear error instead.
 * Provider credentials (Twilio SID/token/from) are read EXCLUSIVELY from
 *   public.shop_messaging_secrets (see docs/MESSAGING_SECRETS_MIGRATION.sql)
 *   — a server-only table with no anon/authenticated grants and no RLS
 *   policies at all. This route's service-role client is the only path to
 *   it; the old shop_settings.messaging_settings jsonb column is never read
 *   here, and its secret keys are removed entirely once Phase B of that
 *   migration runs (see the migration doc for the exact sequence).
 * Cross-shop / not-found: a resourceId that doesn't resolve within the
 *   caller's shopId returns the same generic 404 whether it belongs to
 *   another shop or doesn't exist at all — no enumeration signal either way.
 * Rate limiting: capped per shop per minute. This is a BEST-EFFORT,
 *   in-process mitigation (see lib/apiHelpers.ts) — NOT a security control
 *   and not a hard guarantee against abuse. A durable, globally-consistent
 *   limit (Upstash Redis / Vercel KV, keyed per shop and per destination)
 *   is a real prerequisite before this endpoint sees production message
 *   volume at scale; tracked in docs/SEND_MESSAGE_RECIPIENT_RESOLUTION.md.
 * Message CONTENT (`doc.*`: type, number, vehicle, total, status, shopName,
 *   shopPhone) is still ENTIRELY caller-supplied — only the RECIPIENT and
 *   the PROVIDER CREDENTIALS are server-resolved. `doc` values come from
 *   data the client already loaded through its own RLS-protected reads, so
 *   this isn't a cross-tenant leak, but it does mean a stale or buggy
 *   client screen could send a customer a message with an incorrect
 *   `total`/`status` (e.g. showing "Paid" when the invoice was since
 *   reopened). `total` and `status` are the two fields most worth moving to
 *   a server-side lookup by resourceId in a follow-up —
 *   `type`/`vehicle`/`shopName`/`shopPhone` are lower-risk descriptive
 *   fields. Not done in this pass; tracked in
 *   docs/SEND_MESSAGE_RECIPIENT_RESOLUTION.md.
 * Never logs a credential value or a raw provider response — sanitizeError()
 *   logs only the caught error object server-side and returns a generic
 *   message to the client; provider (Twilio) error text returned to the
 *   caller never includes the account SID/auth token, since those are only
 *   ever sent as the outbound Authorization header, never echoed back.
 */
type Channel = 'sms' | 'whatsapp' | 'line' | 'telegram';
type ResourceType = 'job' | 'customer' | 'estimate' | 'invoice';

type ResolvedRecipient = { phone: string | null; email: string | null; customerName: string | null };

// Distinguishes "the query itself failed" (network/DB error — a 500, and
// worth logging) from "the query succeeded and found nothing" (a genuine
// 404 — the resourceId doesn't exist in this shop). Collapsing these into
// one case would silently mask real DB errors as ordinary not-found
// responses, which is exactly the kind of failure that's invisible until a
// customer complains a message never arrived.
type RecipientLookup =
  | { ok: true; recipient: ResolvedRecipient }
  | { ok: false; reason: 'not_found' }
  | { ok: false; reason: 'db_error'; error: unknown };

async function resolveRecipient(
  admin: ReturnType<typeof createServerSupabase>,
  shopId: string,
  resourceType: ResourceType,
  resourceId: string,
): Promise<RecipientLookup> {
  if (resourceType === 'job') {
    const { data, error } = await admin
      .from('job_cards')
      .select('customer, customer_phone, customer_email')
      .eq('id', resourceId)
      .eq('shop_id', shopId)
      .maybeSingle();
    if (error) return { ok: false, reason: 'db_error', error };
    if (!data) return { ok: false, reason: 'not_found' };
    return { ok: true, recipient: { phone: data.customer_phone ?? null, email: data.customer_email ?? null, customerName: data.customer ?? null } };
  }

  if (resourceType === 'customer') {
    const { data, error } = await admin
      .from('customers')
      .select('name, phone, email')
      .eq('id', resourceId)
      .eq('shop_id', shopId)
      .maybeSingle();
    if (error) return { ok: false, reason: 'db_error', error };
    if (!data) return { ok: false, reason: 'not_found' };
    return { ok: true, recipient: { phone: data.phone ?? null, email: data.email ?? null, customerName: data.name ?? null } };
  }

  if (resourceType === 'estimate' || resourceType === 'invoice') {
    const table = resourceType === 'estimate' ? 'estimates' : 'invoices';
    const idColumn = resourceType === 'estimate' ? 'id' : 'number';
    const nameColumn = resourceType === 'estimate' ? 'customer_name' : 'customer';

    const { data: doc, error: docError } = await admin
      .from(table)
      .select(`customer_id, ${nameColumn}`)
      .eq(idColumn, resourceId)
      .eq('shop_id', shopId)
      .maybeSingle();
    if (docError) return { ok: false, reason: 'db_error', error: docError };
    if (!doc) return { ok: false, reason: 'not_found' };

    const docRecord = doc as Record<string, unknown>;
    const denormalizedName = (docRecord[nameColumn] as string | null) ?? null;

    // Never linked to a customer record — no trusted recipient to resolve.
    // Not a fallback opportunity, not an error about the resource itself.
    if (!docRecord.customer_id) {
      return { ok: true, recipient: { phone: null, email: null, customerName: denormalizedName } };
    }

    const { data: customer, error: customerError } = await admin
      .from('customers')
      .select('name, phone, email')
      .eq('id', docRecord.customer_id as string)
      .eq('shop_id', shopId)
      .maybeSingle();
    if (customerError) return { ok: false, reason: 'db_error', error: customerError };
    if (!customer) return { ok: true, recipient: { phone: null, email: null, customerName: denormalizedName } };

    return { ok: true, recipient: { phone: customer.phone ?? null, email: customer.email ?? null, customerName: customer.name ?? denormalizedName } };
  }

  return { ok: false, reason: 'not_found' };
}

// Reads from public.shop_messaging_secrets — a server-only table with no
// anon/authenticated grants and no RLS policies at all (default deny for
// every role except service_role). See docs/MESSAGING_SECRETS_MIGRATION.sql.
async function getMessagingSettings(
  admin: ReturnType<typeof createServerSupabase>,
  shopId: string,
): Promise<{ ok: true; settings: Record<string, string | boolean> } | { ok: false; error: unknown }> {
  const { data, error } = await admin
    .from('shop_messaging_secrets')
    .select('twilio_sid, twilio_token, twilio_from, sms_enabled, whatsapp_enabled, line_token, line_enabled, telegram_bot_token, telegram_enabled')
    .eq('shop_id', shopId)
    .maybeSingle();
  if (error) return { ok: false, error };
  if (!data) return { ok: true, settings: {} };
  return {
    ok: true,
    settings: {
      twilioSid: data.twilio_sid ?? '',
      twilioToken: data.twilio_token ?? '',
      twilioFrom: data.twilio_from ?? '',
      smsEnabled: !!data.sms_enabled,
      whatsappEnabled: !!data.whatsapp_enabled,
      lineToken: data.line_token ?? '',
      lineEnabled: !!data.line_enabled,
      telegramBotToken: data.telegram_bot_token ?? '',
      telegramEnabled: !!data.telegram_enabled,
    },
  };
}

async function sendSms(to: string, body: string, cfg: Record<string, string | boolean>, whatsapp = false): Promise<string | null> {
  const sid   = cfg.twilioSid   as string;
  const token = cfg.twilioToken as string;
  const from  = cfg.twilioFrom  as string;
  if (!sid || !token || !from) return 'Twilio credentials not configured in Settings → Messaging.';
  const fromNum = whatsapp ? `whatsapp:${from}` : from;
  const toNum   = whatsapp ? `whatsapp:${to}`   : to;
  const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
    method: 'POST',
    headers: {
      Authorization: 'Basic ' + Buffer.from(`${sid}:${token}`).toString('base64'),
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({ From: fromNum, To: toNum, Body: body }).toString(),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({})) as { message?: string };
    // Twilio's error body never contains the SID/token (those are only ever
    // sent by us, in the outbound Authorization header) — still routed
    // through sanitizeError so nothing unexpected in a provider response
    // body can leak, and so the failure is logged server-side either way.
    return sanitizeError(err.message ?? `Twilio error ${res.status}`, 'send-message:twilio', 'SMS failed to send');
  }
  return null;
}

function buildMessage(doc: {
  type: string; number: string; customerName?: string; vehicle: string;
  total: string; status: string; shopName: string; shopPhone?: string;
}): string {
  const label = doc.type === 'estimate' ? 'Estimate' : 'Invoice';
  return [
    `📋 ${label} ${doc.number} from ${doc.shopName}`,
    doc.customerName ? `Customer: ${doc.customerName}` : '',
    `Vehicle: ${doc.vehicle}`,
    `Total: ${doc.total}`,
    `Status: ${doc.status}`,
    doc.shopPhone ? `Contact: ${doc.shopPhone}` : '',
    `\nPlease contact us if you have any questions.`,
  ].filter(Boolean).join('\n');
}

export async function POST(req: NextRequest) {
  const parsed = await parseJsonBody(req, SendMessageSchema);
  if (!parsed.ok) return parsed.response;
  const { channel, shopId, resourceType, resourceId, doc } = parsed.data;
  const ch: Channel = channel;

  const auth = await requireShopRole(req, shopId, ['owner', 'manager', 'advisor']);
  if (!auth.ok) return auth.response;

  // LINE/Telegram refused unconditionally — no trusted per-customer mapping
  // exists for either channel in this schema. See docs/SEND_MESSAGE_RECIPIENT_RESOLUTION.md.
  if (ch === 'line' || ch === 'telegram') {
    return NextResponse.json(
      { error: `${ch === 'line' ? 'LINE' : 'Telegram'} sending is not available yet — no verified per-customer contact channel exists for this channel.` },
      { status: 400 },
    );
  }

  if (isRateLimited(`send-message:shop:${shopId}`, 30, 60_000)) {
    return NextResponse.json({ error: 'Too many messages sent. Please try again shortly.' }, { status: 429 });
  }

  const admin = createServerSupabase();

  try {
    const lookup = await resolveRecipient(admin, shopId, resourceType, resourceId);
    if (!lookup.ok) {
      if (lookup.reason === 'db_error') {
        return NextResponse.json(
          { error: sanitizeError(lookup.error, 'send-message:POST resolveRecipient', 'Unable to look up recipient') },
          { status: 500 },
        );
      }
      // Genuine not-found — same response whether resourceId belongs to
      // another shop or doesn't exist at all, no enumeration signal either way.
      return NextResponse.json({ error: 'Resource not found' }, { status: 404 });
    }
    const { recipient } = lookup;

    if (!recipient.phone) {
      return NextResponse.json(
        { error: 'No phone number on file for this customer. Add one before sending SMS/WhatsApp.' },
        { status: 400 },
      );
    }

    const settingsLookup = await getMessagingSettings(admin, shopId);
    if (!settingsLookup.ok) {
      return NextResponse.json(
        { error: sanitizeError(settingsLookup.error, 'send-message:POST getMessagingSettings', 'Unable to load messaging settings') },
        { status: 500 },
      );
    }
    const cfg = settingsLookup.settings;
    const enabledKey = `${ch}Enabled` as keyof typeof cfg;
    if (!cfg[enabledKey]) {
      return NextResponse.json({ error: `${ch.toUpperCase()} is not enabled. Enable it in Settings → Messaging.` }, { status: 400 });
    }

    // Message CONTENT (doc.*) is still caller-supplied — see the doc block
    // above the route for exactly what's trusted vs. not, and
    // docs/SEND_MESSAGE_RECIPIENT_RESOLUTION.md for which fields should
    // eventually move to server-derived values.
    const message = buildMessage({ ...doc, customerName: doc.customerName ?? recipient.customerName ?? undefined });
    const err = await sendSms(recipient.phone, message, cfg, ch === 'whatsapp');

    if (err) return NextResponse.json({ error: err }, { status: 502 });
    return NextResponse.json({ success: true, channel: ch });
  } catch (e: unknown) {
    return NextResponse.json({ error: sanitizeError(e, 'send-message:POST', 'Unable to send message') }, { status: 500 });
  }
}
