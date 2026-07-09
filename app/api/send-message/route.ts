import { NextRequest, NextResponse } from 'next/server';
import { getAdminDb } from '@/lib/supabaseServer';

type Channel = 'sms' | 'whatsapp' | 'line' | 'telegram';

async function getMessagingSettings(shopId: string) {
  const adminDb = getAdminDb();
  const { data } = await adminDb.from('shop_settings').select('messaging_settings').eq('shop_id', shopId).single();
  return (data?.messaging_settings ?? {}) as Record<string, string | boolean>;
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
    return err.message ?? `Twilio error ${res.status}`;
  }
  return null;
}

async function sendLine(to: string, body: string, cfg: Record<string, string | boolean>): Promise<string | null> {
  // to = customer's LINE Notify token
  const token = to || (cfg.lineToken as string);
  if (!token) return 'LINE Notify token is required.';
  const res = await fetch('https://notify-api.line.me/api/notify', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({ message: body }).toString(),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({})) as { message?: string };
    return err.message ?? `LINE error ${res.status}`;
  }
  return null;
}

async function sendTelegram(to: string, body: string, cfg: Record<string, string | boolean>): Promise<string | null> {
  const botToken = cfg.telegramBotToken as string;
  if (!botToken) return 'Telegram Bot Token not configured in Settings → Messaging.';
  if (!to) return 'Telegram Chat ID is required.';
  const url = `https://api.telegram.org/bot${botToken}/sendMessage`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: to, text: body, parse_mode: 'HTML' }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({})) as { description?: string };
    return err.description ?? `Telegram error ${res.status}`;
  }
  return null;
}

function buildMessage(doc: {
  type: string; number: string; customerName: string; vehicle: string;
  total: string; status: string; shopName: string; shopPhone?: string;
}): string {
  const label = doc.type === 'estimate' ? 'Estimate' : 'Invoice';
  return [
    `📋 ${label} ${doc.number} from ${doc.shopName}`,
    `Customer: ${doc.customerName}`,
    `Vehicle: ${doc.vehicle}`,
    `Total: ${doc.total}`,
    `Status: ${doc.status}`,
    doc.shopPhone ? `Contact: ${doc.shopPhone}` : '',
    `\nPlease contact us if you have any questions.`,
  ].filter(Boolean).join('\n');
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as {
      channel: Channel;
      to: string;
      shopId: string;
      doc: {
        type: string; number: string; customerName: string; vehicle: string;
        total: string; status: string; shopName: string; shopPhone?: string;
      };
    };
    const { channel, to, shopId, doc } = body;

    if (!channel || !to || !shopId || !doc) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const cfg = await getMessagingSettings(shopId);

    const enabledKey = `${channel}Enabled` as keyof typeof cfg;
    if (!cfg[enabledKey]) {
      return NextResponse.json({ error: `${channel.toUpperCase()} is not enabled. Enable it in Settings → Messaging.` }, { status: 400 });
    }

    const message = buildMessage(doc);
    let err: string | null = null;

    if (channel === 'sms')       err = await sendSms(to, message, cfg, false);
    else if (channel === 'whatsapp') err = await sendSms(to, message, cfg, true);
    else if (channel === 'line')     err = await sendLine(to, message, cfg);
    else if (channel === 'telegram') err = await sendTelegram(to, message, cfg);
    else return NextResponse.json({ error: 'Unknown channel' }, { status: 400 });

    if (err) return NextResponse.json({ error: err }, { status: 502 });
    return NextResponse.json({ success: true, channel, sentTo: to });
  } catch (e: unknown) {
    console.error('[send-message]', e);
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Unknown error' }, { status: 500 });
  }
}
