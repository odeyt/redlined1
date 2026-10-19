/**
 * Meta WhatsApp Cloud API webhook — /api/webhooks/whatsapp
 *
 * GET  Meta's verification handshake: hub.mode=subscribe and hub.verify_token
 *      equal to WHATSAPP_WEBHOOK_VERIFY_TOKEN → echo hub.challenge. Records
 *      that the webhook was verified (shown on the Settings checklist).
 * POST Signed events. X-Hub-Signature-256 is checked against
 *      WHATSAPP_APP_SECRET over the raw body before anything is parsed; an
 *      unsigned or mis-signed request is 401 and changes nothing.
 *
 * What is applied (lib/whatsapp/webhook.ts):
 *   - delivery statuses for RedlineD1's own messages, matched by wamid, never
 *     moving a message backwards;
 *   - STOP / START keywords → opt-out / opt-in, recorded in the consent log;
 *   - account_update events → stored on the connection; a removal or
 *     disconnection switches sending off.
 * Inbound message text, coexistence echoes (smb_message_echoes), chat history
 * and contact sync are acknowledged and NOT stored: conversations stay in the
 * WhatsApp Business App.
 *
 * Always answers 200 to a correctly signed request, even when one item fails
 * (logged), so Meta does not retry a whole batch for one bad row.
 */
import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/supabase-server';
import { metaAppSecret, webhookVerifyToken } from '@/lib/whatsapp/config';
import { parseWebhook, shouldApplyStatus, verifySignature, type DeliveryStatus } from '@/lib/whatsapp/webhook';
import { recordConsent } from '@/lib/whatsapp/sendService';
import { timingSafeEqual } from 'node:crypto';

export const dynamic = 'force-dynamic';

function sameSecret(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const expected = webhookVerifyToken();
  const mode = sp.get('hub.mode');
  const token = sp.get('hub.verify_token') ?? '';
  const challenge = sp.get('hub.challenge') ?? '';
  if (!expected || mode !== 'subscribe' || !sameSecret(token, expected) || !/^[A-Za-z0-9_-]{1,200}$/.test(challenge)) {
    return new NextResponse('Forbidden', { status: 403 });
  }
  try {
    // One webhook serves the app; every connection shares it.
    await createServerSupabase().from('whatsapp_connections').update({ webhook_verified_at: new Date().toISOString() }).not('shop_id', 'is', null);
  } catch { /* the handshake must still succeed */ }
  return new NextResponse(challenge, { status: 200, headers: { 'Content-Type': 'text/plain' } });
}

const TS_COLUMN: Record<string, string> = { sent: 'sent_at', delivered: 'delivered_at', read: 'read_at', failed: 'failed_at' };
const DISCONNECT_EVENT = /REMOVED|DELETED|DISCONNECT|OFFBOARD|BANNED|DISABLED|RESTRICT/i;

export async function POST(req: NextRequest) {
  const raw = await req.text();
  if (!verifySignature(raw, req.headers.get('x-hub-signature-256'), metaAppSecret())) {
    return NextResponse.json({ error: 'invalid signature' }, { status: 401 });
  }
  let payload: unknown;
  try { payload = JSON.parse(raw); } catch { return NextResponse.json({ ok: true }); }

  const parsed = parseWebhook(payload);
  const db = createServerSupabase();
  let applied = 0;
  let failed = 0;

  for (const s of parsed.statuses) {
    try {
      const { data: row } = await db.from('whatsapp_messages').select('id, status').eq('wamid', s.wamid).maybeSingle();
      if (!row || !shouldApplyStatus(row.status as DeliveryStatus, s.status)) continue;
      const update: Record<string, unknown> = { status: s.status, [TS_COLUMN[s.status]]: s.at, updated_at: new Date().toISOString() };
      if (s.status === 'failed') { update.error_code = s.errorCode; update.error_title = s.errorTitle; }
      // Conditional on the status we read, so two concurrent webhooks cannot regress it.
      const { error } = await db.from('whatsapp_messages').update(update).eq('id', row.id).eq('status', row.status);
      if (error) throw error;
      applied++;
    } catch { failed++; }
  }

  if (parsed.keywords.length) {
    for (const k of parsed.keywords) {
      try {
        const { data: conn } = await db.from('whatsapp_connections').select('shop_id').eq('phone_number_id', k.phoneNumberId).maybeSingle();
        if (!conn?.shop_id || !/^[1-9]\d{7,14}$/.test(k.fromDigits)) continue;
        const rec = await recordConsent(db, {
          shopId: conn.shop_id, phoneDigits: k.fromDigits, customerId: null,
          status: k.keyword === 'opt_out' ? 'opted_out' : 'opted_in', source: 'inbound_keyword',
          note: k.keyword === 'opt_out' ? 'Customer replied STOP' : 'Customer replied START', recordedBy: null, at: new Date(k.at),
        });
        if (rec.ok) applied++; else failed++;
      } catch { failed++; }
    }
  }

  for (const a of parsed.accountEvents) {
    try {
      const now = new Date().toISOString();
      const off = DISCONNECT_EVENT.test(a.event) ? { status: 'needs_attention', enabled: false, automations_enabled: false } : {};
      await db.from('whatsapp_connections').update({ last_account_event: a.event, last_account_event_at: now, updated_at: now, ...off }).eq('waba_id', a.wabaId);
      applied++;
    } catch { failed++; }
  }

  if (failed) console.error('[whatsapp webhook] items failed', { failed, applied });
  return NextResponse.json({ ok: true });
}
