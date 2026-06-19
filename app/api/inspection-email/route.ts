import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';
import { Resend } from 'resend';

const SUPA_URL  = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPA_ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const SUPA_SVC  = process.env.SUPABASE_SERVICE_ROLE_KEY;

function getDb(jwt?: string) {
  if (SUPA_SVC) return createClient(SUPA_URL, SUPA_SVC);
  const client = createClient(SUPA_URL, SUPA_ANON);
  if (jwt) client.auth.setSession({ access_token: jwt, refresh_token: '' });
  return client;
}

const STATUS_COLOR: Record<string, string> = {
  Pass: '#4caf50',
  Attention: '#ff9800',
  Fail: '#f44336',
  'N/A': '#888888',
};

const STATUS_BG: Record<string, string> = {
  Pass: '#f0fdf4',
  Attention: '#fffbeb',
  Fail: '#fff5f5',
  'N/A': '#f5f5f5',
};

export async function POST(req: NextRequest) {
  try {
    const { inspectionId, shopId } = await req.json();
    if (!inspectionId || !shopId) {
      return NextResponse.json({ error: 'Missing inspectionId or shopId' }, { status: 400 });
    }

    const jwt = (req.headers.get('authorization') ?? '').replace('Bearer ', '').trim();
    const admin = getDb(jwt);

    // Fetch inspection
    const { data: ins, error: insErr } = await admin
      .from('inspections')
      .select('*')
      .eq('id', inspectionId)
      .eq('shop_id', shopId)
      .single();
    if (insErr || !ins) return NextResponse.json({ error: 'Inspection not found' }, { status: 404 });

    const customerEmail = ins.customer_email as string;
    if (!customerEmail) return NextResponse.json({ error: 'No customer email on file' }, { status: 400 });

    // Fetch shop settings for branding
    const { data: shop } = await admin.from('shops').select('name').eq('id', shopId).single();
    const { data: settings } = await admin.from('shop_settings').select('*').eq('shop_id', shopId).single();
    const shopName = shop?.name ?? 'D1 Imports';
    const phone = settings?.phone ?? '';
    const address = settings?.address ?? '';
    const logoUrl = settings?.logo_url ?? '';

    // Parse items
    let items: Array<{ id: string; category: string; name: string; status: string; notes: string; photoUrl: string }> = [];
    try {
      const raw = ins.items;
      items = Array.isArray(raw) ? raw : JSON.parse(raw ?? '[]');
    } catch { items = []; }

    const failCount = items.filter(i => i.status === 'Fail').length;
    const attnCount = items.filter(i => i.status === 'Attention').length;
    const passCount = items.filter(i => i.status === 'Pass').length;

    // Group by category
    const categories = [...new Set(items.map(i => i.category))];

    const categoryHtml = categories.map(cat => {
      const catItems = items.filter(i => i.category === cat);
      const rows = catItems.map(item => `
        <tr style="border-bottom:1px solid #f0f0f0">
          <td style="padding:8px 10px;display:flex;align-items:center;gap:8px">
            <span style="width:8px;height:8px;border-radius:50%;background:${STATUS_COLOR[item.status] ?? '#888'};flex-shrink:0;display:inline-block"></span>
            <span style="font-size:13px;color:#333">${item.name}</span>
            ${item.notes ? `<span style="font-size:11px;color:#888;margin-left:4px">— ${item.notes}</span>` : ''}
          </td>
          <td style="padding:8px 10px;text-align:right;font-size:12px;font-weight:700;color:${STATUS_COLOR[item.status] ?? '#888'};white-space:nowrap">
            ${item.status}
          </td>
        </tr>
      `).join('');
      return `
        <div style="margin-bottom:18px">
          <div style="font-size:11px;font-weight:800;color:#666;text-transform:uppercase;letter-spacing:0.08em;padding:6px 0;border-bottom:2px solid #eee;margin-bottom:4px">${cat}</div>
          <table style="width:100%;border-collapse:collapse">${rows}</table>
        </div>
      `;
    }).join('');

    const mileageStr = ins.mileage ? `${Number(ins.mileage).toLocaleString()} mi` : '';
    const dateStr = new Date(ins.created_at).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });

    const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f4f4f4;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif">
<div style="max-width:680px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden;margin-top:24px;margin-bottom:24px;box-shadow:0 2px 12px rgba(0,0,0,0.08)">

  <!-- Header -->
  <div style="background:#cc0000;padding:22px 32px;display:flex;align-items:center;gap:16px">
    ${logoUrl ? `<img src="${logoUrl}" alt="Logo" style="height:44px;object-fit:contain;border-radius:6px">` : ''}
    <div>
      <div style="font-size:22px;font-weight:900;color:#fff;letter-spacing:-0.5px">${shopName}</div>
      <div style="font-size:12px;color:rgba(255,255,255,0.75);margin-top:2px">Digital Vehicle Inspection Report</div>
    </div>
  </div>

  <div style="padding:28px 32px">
    <!-- Inspection info -->
    <div style="background:#fafafa;border:1px solid #eee;border-radius:10px;padding:18px 22px;margin-bottom:24px">
      <div style="display:flex;justify-content:space-between;flex-wrap:wrap;gap:12px">
        <div>
          <div style="font-size:11px;color:#999;text-transform:uppercase;letter-spacing:0.06em;margin-bottom:4px">Inspection</div>
          <div style="font-size:20px;font-weight:900;color:#111">${ins.inspection_number}</div>
        </div>
        <div>
          <div style="font-size:11px;color:#999;text-transform:uppercase;letter-spacing:0.06em;margin-bottom:4px">Vehicle</div>
          <div style="font-size:14px;font-weight:700;color:#333">${ins.vehicle}</div>
          ${ins.vin ? `<div style="font-size:11px;color:#888">VIN: ${ins.vin}</div>` : ''}
        </div>
        <div>
          <div style="font-size:11px;color:#999;text-transform:uppercase;letter-spacing:0.06em;margin-bottom:4px">Date</div>
          <div style="font-size:13px;font-weight:600;color:#333">${dateStr}</div>
          ${mileageStr ? `<div style="font-size:11px;color:#888">${mileageStr}</div>` : ''}
        </div>
        ${ins.technician ? `
        <div>
          <div style="font-size:11px;color:#999;text-transform:uppercase;letter-spacing:0.06em;margin-bottom:4px">Technician</div>
          <div style="font-size:13px;font-weight:600;color:#333">${ins.technician}</div>
        </div>` : ''}
      </div>
    </div>

    <!-- Summary badges -->
    <div style="display:flex;gap:10px;margin-bottom:28px">
      <div style="flex:1;text-align:center;background:#fff5f5;border:1px solid #fecaca;border-radius:10px;padding:16px 8px">
        <div style="font-size:28px;font-weight:900;color:#f44336">${failCount}</div>
        <div style="font-size:10px;font-weight:800;color:#f44336;text-transform:uppercase;letter-spacing:0.1em">Fail</div>
      </div>
      <div style="flex:1;text-align:center;background:#fffbeb;border:1px solid #fde68a;border-radius:10px;padding:16px 8px">
        <div style="font-size:28px;font-weight:900;color:#ff9800">${attnCount}</div>
        <div style="font-size:10px;font-weight:800;color:#ff9800;text-transform:uppercase;letter-spacing:0.1em">Attention</div>
      </div>
      <div style="flex:1;text-align:center;background:#f0fdf4;border:1px solid #bbf7d0;border-radius:10px;padding:16px 8px">
        <div style="font-size:28px;font-weight:900;color:#4caf50">${passCount}</div>
        <div style="font-size:10px;font-weight:800;color:#4caf50;text-transform:uppercase;letter-spacing:0.1em">Pass</div>
      </div>
    </div>

    ${(failCount > 0 || attnCount > 0) ? `
    <div style="background:#fffbeb;border:1px solid #fde68a;border-radius:8px;padding:14px 18px;margin-bottom:24px">
      <div style="font-size:13px;font-weight:700;color:#92400e;margin-bottom:4px">⚠️ Items Requiring Attention</div>
      <div style="font-size:12px;color:#78350f">
        ${items.filter(i => i.status === 'Fail' || i.status === 'Attention').map(i =>
          `<div style="padding:3px 0">• <strong>${i.name}</strong> — <span style="color:${STATUS_COLOR[i.status]}">${i.status}</span>${i.notes ? `: ${i.notes}` : ''}</div>`
        ).join('')}
      </div>
    </div>` : ''}

    <!-- Checklist -->
    <div style="font-size:14px;font-weight:800;color:#111;margin-bottom:16px;text-transform:uppercase;letter-spacing:0.05em">Full Inspection Results</div>
    ${categoryHtml}

    ${ins.notes ? `
    <div style="margin-top:20px;padding:14px 18px;background:#f8f8f8;border-radius:8px">
      <div style="font-size:11px;font-weight:700;color:#999;text-transform:uppercase;letter-spacing:0.06em;margin-bottom:6px">Technician Notes</div>
      <div style="font-size:13px;color:#444">${ins.notes}</div>
    </div>` : ''}
  </div>

  <!-- Footer -->
  <div style="background:#f8f8f8;border-top:1px solid #eee;padding:16px 32px;text-align:center">
    <div style="font-size:12px;color:#888">
      ${shopName}${phone ? ` &middot; ${phone}` : ''}${address ? ` &middot; ${address}` : ''}
    </div>
    <div style="font-size:11px;color:#bbb;margin-top:4px">Powered by Redlined1</div>
  </div>
</div>
</body>
</html>
    `.trim();

    const resend = new Resend(process.env.RESEND_API_KEY);
    const { error: emailErr } = await resend.emails.send({
      from: `${shopName} <noreply@redlined1.com>`,
      to: customerEmail,
      subject: `Your Vehicle Inspection Report — ${ins.inspection_number} (${ins.vehicle})`,
      html,
    });

    if (emailErr) return NextResponse.json({ error: emailErr.message }, { status: 500 });

    return NextResponse.json({ success: true, sentTo: customerEmail });
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Unknown error' }, { status: 500 });
  }
}
