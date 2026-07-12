import { NextRequest, NextResponse } from 'next/server';
import { Resend } from 'resend';

export async function POST(req: NextRequest) {
  try {
    const { name, email, message } = await req.json();
    if (!name || !message) {
      return NextResponse.json({ error: 'Name and message required' }, { status: 400 });
    }

    const resend = new Resend(process.env.RESEND_API_KEY);
    await resend.emails.send({
      from: 'Redlined1 Chat <chat@redlined1.com>',
      to: 'admin@redlined1.com',
      replyTo: email || undefined,
      subject: `💬 New Chat Message from ${name}`,
      html: `
        <div style="font-family:sans-serif;max-width:520px;margin:0 auto;background:#0d0d10;color:#eee;border-radius:12px;overflow:hidden">
          <div style="background:#cc0000;padding:18px 24px;display:flex;align-items:center;gap:12px">
            <img src="https://redlined1.com/logo.png" style="height:32px" />
            <span style="font-size:18px;font-weight:800;color:#fff">New Chat Message</span>
          </div>
          <div style="padding:24px">
            <p style="margin:0 0 8px"><strong>From:</strong> ${name}</p>
            <p style="margin:0 0 8px"><strong>Email:</strong> ${email || 'Not provided'}</p>
            <p style="margin:0 0 16px"><strong>Message:</strong></p>
            <div style="background:rgba(255,255,255,0.06);border-left:3px solid #cc0000;padding:14px 16px;border-radius:6px;line-height:1.6">
              ${message.replace(/\n/g, '<br/>')}
            </div>
            <p style="margin-top:24px;font-size:12px;color:#666">Sent from Redlined1 live chat widget</p>
          </div>
        </div>
      `,
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('Chat email error:', err);
    return NextResponse.json({ error: 'Failed to send' }, { status: 500 });
  }
}
