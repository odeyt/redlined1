import { NextRequest, NextResponse } from 'next/server';
import { Resend } from 'resend';
import PDFDocument from 'pdfkit';
import { getServerDb } from '@/lib/supabaseServer';

function money(amount: number, currency: string) {
  try {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency, minimumFractionDigits: 2 }).format(amount);
  } catch {
    return `${currency} ${amount.toFixed(2)}`;
  }
}

function buildPdf(doc: {
  type: 'estimate' | 'invoice';
  number: string;
  customerName: string;
  vehicle: string;
  date: string;
  lines: Array<{ description: string; qty: number; rate: number; currency: string; note?: string }>;
  subtotal: number;
  discount: number;
  tax: number;
  total: number;
  currency: string;
  notes?: string;
  shopName: string;
  shopAddress?: string;
  shopPhone?: string;
  shopEmail?: string;
  validUntil?: string;
  isWatermarked: boolean;
}): Buffer {
  return new Promise<Buffer>((resolve) => {
    const pdf = new PDFDocument({ margin: 40, size: 'A4' });
    const chunks: Buffer[] = [];
    pdf.on('data', (c: Buffer) => chunks.push(c));
    pdf.on('end', () => resolve(Buffer.concat(chunks)));

    const RED = '#CC0000';
    const GRAY = '#666666';
    const LIGHT = '#f5f5f5';

    // ── Header ──
    pdf.rect(0, 0, pdf.page.width, 72).fill(RED);
    pdf.fillColor('#fff').fontSize(20).font('Helvetica-Bold').text(doc.shopName, 40, 20);
    if (doc.shopAddress) pdf.fillColor('rgba(255,255,255,0.8)').fontSize(9).font('Helvetica').text(doc.shopAddress, 40, 44);
    if (doc.shopPhone || doc.shopEmail) {
      pdf.text([doc.shopPhone, doc.shopEmail].filter(Boolean).join(' · '), 40, 56);
    }

    // Doc type + number top right
    const typeLabel = doc.type === 'estimate' ? 'ESTIMATE' : 'INVOICE';
    pdf.fillColor('#fff').fontSize(10).font('Helvetica-Bold').text(typeLabel, 0, 20, { align: 'right', width: pdf.page.width - 40 });
    pdf.fontSize(18).text(doc.number, 0, 34, { align: 'right', width: pdf.page.width - 40 });

    let y = 90;

    // ── Bill to / doc info ──
    pdf.fillColor('#111').fontSize(9).font('Helvetica-Bold').text('BILL TO', 40, y);
    pdf.font('Helvetica').fillColor('#333').fontSize(11).text(doc.customerName, 40, y + 12);
    if (doc.vehicle) pdf.fillColor(GRAY).fontSize(9).text(doc.vehicle, 40, y + 26);

    pdf.fillColor(GRAY).fontSize(9).font('Helvetica-Bold').text('DATE', 350, y);
    pdf.font('Helvetica').fillColor('#333').fontSize(10).text(doc.date, 350, y + 12);
    if (doc.validUntil) {
      pdf.fillColor(GRAY).fontSize(9).font('Helvetica-Bold').text('VALID UNTIL', 350, y + 28);
      pdf.font('Helvetica').fillColor('#333').fontSize(10).text(doc.validUntil, 350, y + 40);
    }

    y += 60;
    pdf.moveTo(40, y).lineTo(pdf.page.width - 40, y).strokeColor('#eee').stroke();
    y += 12;

    // ── Table header ──
    pdf.rect(40, y, pdf.page.width - 80, 20).fill(LIGHT);
    pdf.fillColor(GRAY).fontSize(8).font('Helvetica-Bold');
    pdf.text('DESCRIPTION', 44, y + 6);
    pdf.text('QTY', 360, y + 6, { width: 40, align: 'right' });
    pdf.text('RATE', 406, y + 6, { width: 70, align: 'right' });
    pdf.text('AMOUNT', 480, y + 6, { width: pdf.page.width - 520, align: 'right' });
    y += 20;

    // ── Line items ──
    doc.lines.forEach((line, i) => {
      const bg = i % 2 === 0 ? '#fff' : '#fafafa';
      const rowH = 22;
      pdf.rect(40, y, pdf.page.width - 80, rowH).fill(bg);
      pdf.fillColor('#111').fontSize(10).font('Helvetica').text(line.description || '—', 44, y + 6, { width: 310 });
      pdf.text(String(line.qty), 360, y + 6, { width: 40, align: 'right' });
      pdf.text(money(line.rate, line.currency || doc.currency), 406, y + 6, { width: 70, align: 'right' });
      pdf.text(money(line.qty * line.rate, line.currency || doc.currency), 480, y + 6, { width: pdf.page.width - 520, align: 'right' });
      y += rowH;
    });

    y += 10;
    pdf.moveTo(40, y).lineTo(pdf.page.width - 40, y).strokeColor('#eee').stroke();
    y += 10;

    // ── Totals ──
    const totalsX = 350;
    const totalsW = pdf.page.width - totalsX - 40;
    const addRow = (label: string, val: string, bold = false) => {
      pdf.fillColor(GRAY).fontSize(9).font(bold ? 'Helvetica-Bold' : 'Helvetica').text(label, totalsX, y);
      pdf.fillColor(bold ? '#111' : '#333').text(val, totalsX, y, { width: totalsW, align: 'right' });
      y += 16;
    };
    addRow('Subtotal', money(doc.subtotal, doc.currency));
    if (doc.discount > 0) addRow('Discount', `-${money(doc.discount, doc.currency)}`);
    if (doc.tax > 0) addRow('Tax', money(doc.tax, doc.currency));
    pdf.moveTo(totalsX, y).lineTo(pdf.page.width - 40, y).strokeColor('#ddd').stroke();
    y += 6;
    addRow('TOTAL', money(doc.total, doc.currency), true);

    // ── Notes ──
    if (doc.notes) {
      y += 16;
      pdf.fillColor(GRAY).fontSize(8).font('Helvetica-Bold').text('NOTES', 40, y);
      y += 12;
      pdf.fillColor('#444').fontSize(9).font('Helvetica').text(doc.notes, 40, y, { width: pdf.page.width - 80 });
    }

    // ── Watermark ──
    if (doc.isWatermarked) {
      pdf.save();
      pdf.translate(pdf.page.width / 2, pdf.page.height / 2);
      pdf.rotate(-45);
      pdf.fillColor('#cc0000').opacity(0.08).fontSize(80).font('Helvetica-Bold')
        .text('REDLINED1', -160, -40, { lineBreak: false });
      pdf.restore();
    }

    // ── Footer ──
    pdf.fillColor('#aaa').fontSize(8).font('Helvetica')
      .text(`Powered by Redlined1 · ${doc.number}`, 40, pdf.page.height - 30, { align: 'center', width: pdf.page.width - 80 });

    pdf.end();
  }) as unknown as Buffer;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { type, documentId, shopId, email, isWatermarked } = body as {
      type: 'estimate' | 'invoice';
      documentId: string;
      shopId: string;
      email: string;
      isWatermarked: boolean;
    };

    if (!type || !documentId || !shopId || !email) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const jwt = (req.headers.get('authorization') ?? '').replace('Bearer ', '').trim();
    const db = await getServerDb(jwt || undefined);

    // Fetch shop
    const { data: shop } = await db.from('shops').select('name').eq('id', shopId).single();
    const { data: settings } = await db.from('shop_settings').select('*').eq('shop_id', shopId).single();
    const shopName: string = shop?.name ?? 'D1 Imports';
    const shopAddress: string = settings?.address ?? '';
    const shopPhone: string = settings?.phone ?? '';
    const shopEmail: string = settings?.email ?? '';

    type LineRow = { description: string; qty: number; rate: number; currency: string; note?: string; laoDescription?: string };

    let docData: {
      number: string; customerName: string; vehicle: string; date: string;
      lines: LineRow[]; subtotal: number; discount: number; tax: number; total: number;
      currency: string; notes?: string; validUntil?: string; status: string;
    };

    if (type === 'estimate') {
      const { data, error } = await db.from('estimates').select('*').eq('id', documentId).eq('shop_id', shopId).single();
      if (error || !data) return NextResponse.json({ error: 'Estimate not found' }, { status: 404 });
      const lines: LineRow[] = (data.lines ?? []).map((l: Record<string, unknown>) => ({
        description: (l.description as string) || '',
        qty: Number(l.qty ?? 1),
        rate: Number(l.rate ?? 0),
        currency: (l.currency as string) || data.currency || 'USD',
        note: (l.note as string) || '',
      }));
      const subtotal = lines.reduce((s, l) => s + l.qty * l.rate, 0);
      const discount = Number(data.discount ?? 0);
      const shopSupplies = Number(data.shop_supplies ?? 0);
      const taxRate = Number(data.tax_rate ?? 0);
      const tax = (subtotal - discount + shopSupplies) * taxRate / 100;
      docData = {
        number: data.estimate_number, customerName: data.customer_name,
        vehicle: data.vehicle, date: new Date(data.created_at).toLocaleDateString(),
        lines, subtotal, discount, tax, total: subtotal - discount + shopSupplies + tax,
        currency: data.currency || 'USD', notes: data.notes || '',
        validUntil: data.valid_until ? new Date(data.valid_until).toLocaleDateString() : '',
        status: data.status,
      };
    } else {
      // inv.id maps to the 'number' column (invoice number string, e.g. "INV-0008")
      const { data, error } = await db.from('invoices').select('*').eq('number', documentId).eq('shop_id', shopId).single();
      if (error || !data) return NextResponse.json({ error: 'Invoice not found' }, { status: 404 });
      const lines: LineRow[] = (data.lines ?? []).map((l: Record<string, unknown>) => ({
        description: (l.description as string) || '',
        qty: Number(l.qty ?? 1),
        rate: Number(l.rate ?? 0),
        currency: (l.currency as string) || data.currency || 'USD',
        note: (l.note as string) || '',
      }));
      const subtotal = lines.reduce((s, l) => s + l.qty * l.rate, 0);
      const discount = Number(data.discount ?? 0);
      const shopSupplies = Number(data.shop_supplies ?? 0);
      const taxRate = Number(data.tax_rate ?? 0);
      const tax = (subtotal - discount + shopSupplies) * taxRate / 100;
      docData = {
        number: data.number, customerName: data.customer,
        vehicle: data.vehicle, date: new Date(data.created_at).toLocaleDateString(),
        lines, subtotal, discount, tax, total: subtotal - discount + shopSupplies + tax,
        currency: data.currency || 'USD', notes: data.notes || '',
        status: data.status,
      };
    }

    // Generate PDF
    const pdfBuffer = await buildPdf({
      type, ...docData, shopName, shopAddress, shopPhone, shopEmail, isWatermarked,
    });

    // Build HTML email body
    const typeLabel = type === 'estimate' ? 'Estimate' : 'Invoice';
    const lineRows = docData.lines.map(l => `
      <tr style="border-bottom:1px solid #f5f5f5">
        <td style="padding:8px 12px;font-size:13px;color:#333">${l.description || '—'}</td>
        <td style="padding:8px 12px;font-size:13px;color:#333;text-align:center">${l.qty}</td>
        <td style="padding:8px 12px;font-size:13px;color:#333;text-align:right">${money(l.rate, l.currency || docData.currency)}</td>
        <td style="padding:8px 12px;font-size:13px;font-weight:600;color:#111;text-align:right">${money(l.qty * l.rate, l.currency || docData.currency)}</td>
      </tr>`).join('');

    const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f4f4f4;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif">
<div style="max-width:680px;margin:24px auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,0.08)">
  <div style="background:#cc0000;padding:22px 32px">
    <div style="font-size:22px;font-weight:900;color:#fff">${shopName}</div>
    <div style="font-size:12px;color:rgba(255,255,255,0.75);margin-top:2px">${typeLabel} · ${docData.number}</div>
  </div>
  <div style="padding:28px 32px">
    <div style="background:#fafafa;border:1px solid #eee;border-radius:10px;padding:18px 22px;margin-bottom:24px;display:flex;justify-content:space-between;flex-wrap:wrap;gap:12px">
      <div>
        <div style="font-size:11px;color:#999;text-transform:uppercase;letter-spacing:0.06em;margin-bottom:4px">${typeLabel}</div>
        <div style="font-size:20px;font-weight:900;color:#111">${docData.number}</div>
      </div>
      <div>
        <div style="font-size:11px;color:#999;text-transform:uppercase;letter-spacing:0.06em;margin-bottom:4px">Prepared For</div>
        <div style="font-size:14px;font-weight:700;color:#333">${docData.customerName}</div>
        ${docData.vehicle ? `<div style="font-size:11px;color:#888">${docData.vehicle}</div>` : ''}
      </div>
      <div>
        <div style="font-size:11px;color:#999;text-transform:uppercase;letter-spacing:0.06em;margin-bottom:4px">Date</div>
        <div style="font-size:13px;font-weight:600;color:#333">${docData.date}</div>
        ${docData.validUntil ? `<div style="font-size:11px;color:#888">Valid until ${docData.validUntil}</div>` : ''}
      </div>
    </div>
    <table style="width:100%;border-collapse:collapse;margin-bottom:20px">
      <thead>
        <tr style="background:#f5f5f5">
          <th style="padding:8px 12px;font-size:10px;text-transform:uppercase;letter-spacing:0.07em;color:#666;text-align:left">Description</th>
          <th style="padding:8px 12px;font-size:10px;text-transform:uppercase;letter-spacing:0.07em;color:#666;text-align:center">Qty</th>
          <th style="padding:8px 12px;font-size:10px;text-transform:uppercase;letter-spacing:0.07em;color:#666;text-align:right">Rate</th>
          <th style="padding:8px 12px;font-size:10px;text-transform:uppercase;letter-spacing:0.07em;color:#666;text-align:right">Amount</th>
        </tr>
      </thead>
      <tbody>${lineRows}</tbody>
    </table>
    <div style="border-top:2px solid #eee;padding-top:14px;text-align:right">
      ${docData.discount > 0 ? `<div style="font-size:12px;color:#666;margin-bottom:4px">Discount: -${money(docData.discount, docData.currency)}</div>` : ''}
      ${docData.tax > 0 ? `<div style="font-size:12px;color:#666;margin-bottom:4px">Tax: ${money(docData.tax, docData.currency)}</div>` : ''}
      <div style="font-size:18px;font-weight:900;color:#111">Total: ${money(docData.total, docData.currency)}</div>
    </div>
    ${docData.notes ? `<div style="margin-top:20px;padding:14px 18px;background:#f8f8f8;border-radius:8px"><div style="font-size:11px;font-weight:700;color:#999;text-transform:uppercase;letter-spacing:0.06em;margin-bottom:6px">Notes</div><div style="font-size:13px;color:#444">${docData.notes}</div></div>` : ''}
    ${isWatermarked ? `<div style="margin-top:20px;padding:10px 16px;background:#fff8f8;border:1px solid #fecaca;border-radius:8px;font-size:12px;color:#991b1b;text-align:center">Trial version — Powered by Redlined1</div>` : ''}
  </div>
  <div style="background:#f8f8f8;border-top:1px solid #eee;padding:16px 32px;text-align:center">
    <div style="font-size:12px;color:#888">${shopName}${shopPhone ? ` · ${shopPhone}` : ''}${shopAddress ? ` · ${shopAddress}` : ''}</div>
    <div style="font-size:11px;color:#bbb;margin-top:4px">Powered by Redlined1</div>
  </div>
</div>
</body></html>`;

    const resend = new Resend(process.env.RESEND_API_KEY);
    const { error: emailErr } = await resend.emails.send({
      from: `${shopName} <noreply@redlined1.com>`,
      to: email,
      subject: `Your ${typeLabel} — ${docData.number} (${docData.vehicle || docData.customerName})`,
      html,
      attachments: [{
        filename: `${docData.number}.pdf`,
        content: pdfBuffer.toString('base64'),
      }],
    });

    if (emailErr) return NextResponse.json({ error: (emailErr as { message?: string }).message ?? 'Email send failed' }, { status: 500 });
    return NextResponse.json({ success: true, sentTo: email });
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Unknown error' }, { status: 500 });
  }
}
