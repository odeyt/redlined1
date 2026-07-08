import { NextRequest, NextResponse } from 'next/server';
import { Resend } from 'resend';
import { getServerDb } from '@/lib/supabaseServer';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { type, customerId, email, customerName, shopId, extra } = body as {
      type: 'followup' | 'reminder';
      customerId: string;
      email: string;
      customerName: string;
      shopId: string;
      extra?: {
        serviceType?: string;
        vehicle?: string;
        dueText?: string;
        nextDueDate?: string;
        note?: string;
      };
    };

    if (!email || !customerId || !shopId) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const jwt = (req.headers.get('authorization') ?? '').replace('Bearer ', '').trim();
    const db = await getServerDb(jwt || undefined);

    const { data: shop } = await db.from('shops').select('name').eq('id', shopId).single();
    const { data: settings } = await db.from('shop_settings').select('*').eq('shop_id', shopId).single();
    const shopName: string = shop?.name ?? 'D1 Imports';
    const shopPhone: string = settings?.phone ?? '';
    const shopAddress: string = settings?.address ?? '';
    const shopEmail: string = settings?.email ?? '';

    const firstName = customerName.split(' ')[0];

    let subject: string;
    let html: string;

    if (type === 'followup') {
      const note = extra?.note ?? '';
      subject = `A message from ${shopName}`;
      html = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f4f4f4;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif">
<div style="max-width:600px;margin:24px auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,0.08)">
  <div style="background:#cc0000;padding:22px 32px">
    <div style="font-size:20px;font-weight:900;color:#fff">${shopName}</div>
    <div style="font-size:12px;color:rgba(255,255,255,0.75);margin-top:2px">Follow-up from your auto shop</div>
  </div>
  <div style="padding:28px 32px">
    <p style="font-size:15px;color:#111;margin:0 0 16px">Hi ${firstName},</p>
    <p style="font-size:14px;color:#333;line-height:1.7;margin:0 0 16px">
      ${note || `Thank you for choosing ${shopName}. We wanted to reach out and check in. Please don't hesitate to contact us if you have any questions about your recent service.`}
    </p>
    <p style="font-size:14px;color:#333;line-height:1.7;margin:0">
      We appreciate your business and look forward to serving you again.
    </p>
  </div>
  <div style="background:#f8f8f8;border-top:1px solid #eee;padding:16px 32px;text-align:center">
    <div style="font-size:12px;color:#888">${shopName}${shopPhone ? ` · ${shopPhone}` : ''}${shopAddress ? ` · ${shopAddress}` : ''}${shopEmail ? ` · ${shopEmail}` : ''}</div>
    <div style="font-size:11px;color:#bbb;margin-top:4px">Powered by Redlined1</div>
  </div>
</div>
</body></html>`;
    } else {
      // reminder
      const serviceType = extra?.serviceType ?? 'Service';
      const vehicle = extra?.vehicle ?? '';
      const dueText = extra?.dueText ?? '';
      const nextDueDate = extra?.nextDueDate ? new Date(extra.nextDueDate).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }) : '';
      subject = `Maintenance Reminder — ${serviceType} ${dueText ? `(${dueText})` : ''}`;
      html = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f4f4f4;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif">
<div style="max-width:600px;margin:24px auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,0.08)">
  <div style="background:#cc0000;padding:22px 32px">
    <div style="font-size:20px;font-weight:900;color:#fff">${shopName}</div>
    <div style="font-size:12px;color:rgba(255,255,255,0.75);margin-top:2px">Maintenance Reminder</div>
  </div>
  <div style="padding:28px 32px">
    <p style="font-size:15px;color:#111;margin:0 0 16px">Hi ${firstName},</p>
    <div style="background:#fff8f0;border:1px solid #fde68a;border-radius:10px;padding:16px 20px;margin-bottom:20px">
      <div style="font-size:11px;font-weight:700;color:#92400e;text-transform:uppercase;letter-spacing:0.06em;margin-bottom:6px">Service Due</div>
      <div style="font-size:18px;font-weight:800;color:#111">${serviceType}</div>
      ${vehicle ? `<div style="font-size:13px;color:#555;margin-top:4px">${vehicle}</div>` : ''}
      ${dueText ? `<div style="font-size:13px;font-weight:700;color:#d97706;margin-top:8px">${dueText}${nextDueDate ? ` — ${nextDueDate}` : ''}</div>` : ''}
    </div>
    <p style="font-size:14px;color:#333;line-height:1.7;margin:0 0 16px">
      This is a friendly reminder that your ${serviceType.toLowerCase()} is coming up${dueText ? ` and is currently ${dueText.toLowerCase()}` : ''}. Please contact us to schedule your appointment at your earliest convenience.
    </p>
    <p style="font-size:14px;color:#333;line-height:1.7;margin:0">
      We look forward to keeping your vehicle in top condition.
    </p>
  </div>
  <div style="background:#f8f8f8;border-top:1px solid #eee;padding:16px 32px;text-align:center">
    <div style="font-size:12px;color:#888">${shopName}${shopPhone ? ` · ${shopPhone}` : ''}${shopAddress ? ` · ${shopAddress}` : ''}${shopEmail ? ` · ${shopEmail}` : ''}</div>
    <div style="font-size:11px;color:#bbb;margin-top:4px">Powered by Redlined1</div>
  </div>
</div>
</body></html>`;
    }

    const resend = new Resend(process.env.RESEND_API_KEY);
    const { error: emailErr } = await resend.emails.send({
      from: `${shopName} <noreply@redlined1.com>`,
      to: email,
      subject,
      html,
    });

    if (emailErr) return NextResponse.json({ error: (emailErr as { message?: string }).message ?? 'Send failed' }, { status: 500 });

    // Update follow-up timestamp in DB
    if (type === 'followup') {
      await db.from('customers').update({ follow_up: 'Follow-up sent just now' }).eq('id', customerId).eq('shop_id', shopId);
    }

    return NextResponse.json({ success: true, sentTo: email });
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Unknown error' }, { status: 500 });
  }
}
