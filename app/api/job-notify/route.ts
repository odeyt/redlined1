import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

function getAdmin() { return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { autoRefreshToken: false, persistSession: false } }); }

const STAGE_MESSAGES: Record<string, { short: string; body: string }> = {
  checked_in:    { short: 'Checked In',       body: 'Your vehicle has been checked in and is in our queue.' },
  inspecting:    { short: 'Being Inspected',   body: 'Our technician is now performing a full vehicle inspection.' },
  waiting_parts: { short: 'Waiting for Parts', body: 'Parts have been ordered and are on their way to us.' },
  in_repair:     { short: 'In Repair',         body: 'Great news — your vehicle is currently being repaired.' },
  quality_check: { short: 'Quality Check',     body: 'Repairs are done! We\'re doing a final quality check now.' },
  ready:         { short: 'Ready for Pickup',  body: 'Your vehicle is ready! You can come pick it up anytime.' },
};

export async function POST(req: NextRequest) {
  try {
    const { jobId, shopId, stage, statusUrl, customerPhone, customerEmail } = await req.json();
    if (!jobId || !shopId || !stage) return NextResponse.json({ error: 'Missing fields' }, { status: 400 });

    const { data: shop } = await getAdmin().from('shops').select('name').eq('id', shopId).single();
    const { data: settings } = await getAdmin().from('shop_settings').select('phone, email').eq('shop_id', shopId).single();

    const shopName = shop?.name ?? 'Your Auto Shop';
    const msg = STAGE_MESSAGES[stage] ?? { short: stage, body: 'Your repair status has been updated.' };

    const results: { sms?: string; email?: string; smsError?: string; emailError?: string } = {};

    // ── SMS via Twilio ────────────────────────────────────────────────────
    if (customerPhone) {
      const sid = process.env.TWILIO_ACCOUNT_SID;
      const token = process.env.TWILIO_AUTH_TOKEN;
      const from = process.env.TWILIO_PHONE_NUMBER;

      if (sid && token && from) {
        const smsBody = `${shopName}: ${msg.body}${statusUrl ? `\nTrack your repair: ${statusUrl}` : ''}\nQuestions? Call ${settings?.phone ?? ''}`;
        try {
          const res = await fetch(
            `https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`,
            {
              method: 'POST',
              headers: {
                'Authorization': 'Basic ' + Buffer.from(`${sid}:${token}`).toString('base64'),
                'Content-Type': 'application/x-www-form-urlencoded',
              },
              body: new URLSearchParams({ To: customerPhone, From: from, Body: smsBody }).toString(),
            }
          );
          const json = await res.json();
          if (res.ok) results.sms = json.sid;
          else results.smsError = json.message ?? 'SMS failed';
        } catch (e) {
          results.smsError = e instanceof Error ? e.message : 'SMS error';
        }
      } else {
        results.smsError = 'Twilio not configured (missing env vars)';
      }
    }

    // ── Email via Resend ─────────────────────────────────────────────────
    if (customerEmail) {
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
                ${shopName}${settings?.phone ? ` · ${settings.phone}` : ''}${settings?.email ? ` · ${settings.email}` : ''}
              </div>
            </div>
          </div>`;

        try {
          const res = await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({
              from: `${shopName} <noreply@redlined1.com>`,
              to: [customerEmail],
              subject: `${msg.short} — ${shopName}`,
              html,
            }),
          });
          const json = await res.json();
          if (res.ok) results.email = json.id;
          else results.emailError = json.message ?? 'Email failed';
        } catch (e) {
          results.emailError = e instanceof Error ? e.message : 'Email error';
        }
      } else {
        results.emailError = 'Resend not configured';
      }
    }

    return NextResponse.json({ ok: true, ...results });
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Error' }, { status: 500 });
  }
}
