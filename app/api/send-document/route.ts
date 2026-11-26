import { loadShopIdentity } from '@/lib/shops/shopIdentityServer';
import { SHOP_IDENTITY_INCOMPLETE, describeMissing } from '@/lib/shops/shopIdentity';
import { NextRequest, NextResponse } from 'next/server';
import { Resend } from 'resend';
// The PDF layout lives in lib/documents/pdf.ts so API v1 renders the same
// document; moved verbatim, output unchanged.
import { buildPdf, money } from '@/lib/documents/pdf';
import { getServerDb, getAdminDb } from '@/lib/supabaseServer';
// Totals as the staff screens compute them; see lib/documents/emailTotals.ts.
import { estimateEmailTotals, invoiceEmailTotals } from '@/lib/documents/emailTotals';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { type, documentId, shopId, email, isWatermarked, saveEmail, customerId } = body as {
      type: 'estimate' | 'invoice';
      documentId: string;
      shopId: string;
      email: string;
      isWatermarked: boolean;
      saveEmail?: boolean;
      customerId?: string;
    };

    if (!type || !documentId || !shopId || !email) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const jwt = (req.headers.get('authorization') ?? '').replace('Bearer ', '').trim();
    const db = await getServerDb(jwt || undefined);

    /**
     * A document does not leave this shop without the shop's own identity on
     * it.
     *
     * Enforced HERE, not only in the browser, so a direct POST is refused the
     * same way a click is. Reproduced before this was written: a shop with no
     * settings row sent an invoice headed "RedlineD1" — our product name on
     * their customer's document — and this very route answered PGRST116 from
     * the `.single()` below, which told nobody anything.
     *
     * The refusal is machine-readable and names the missing fields, so the UI
     * can offer the exact repair rather than a generic failure.
     */
    const identity = await loadShopIdentity(shopId);
    if (!identity.ready) {
      return NextResponse.json({
        code: SHOP_IDENTITY_INCOMPLETE,
        error: `Add your ${describeMissing(identity.missingFields)} before sending documents to customers.`,
        missingFields: identity.missingFields,
        reasonCode: identity.reasonCode,
      }, { status: 409 });
    }

    // Fetch shop settings. maybeSingle, not single: a missing row is a state
    // this route now refuses above rather than a database error to raise.
    const { data: shop } = await db.from('shops').select('name').eq('id', shopId).single();
    const { data: settings } = await db.from('shop_settings').select('*').eq('shop_id', shopId).maybeSingle();
    const shopName: string = (shop as { name?: string } | null)?.name ?? 'My Shop';
    const shopAddress: string = (settings as Record<string, unknown> | null)?.address as string ?? '';
    const shopPhone: string   = (settings as Record<string, unknown> | null)?.phone as string ?? '';
    const shopEmail: string   = (settings as Record<string, unknown> | null)?.email as string ?? '';

    type LineRow = { description: string; qty: number; rate: number; currency: string; note?: string };

    let docData: {
      number: string; customerName: string; vehicle: string; date: string;
      lines: LineRow[]; subtotal: number; discount: number; tax: number; total: number;
      currency: string; notes?: string; validUntil?: string; status: string;
    };

    if (type === 'estimate') {
      const { data, error } = await db.from('estimates').select('*').eq('id', documentId).eq('shop_id', shopId).single();
      if (error || !data) return NextResponse.json({ error: 'Estimate not found' }, { status: 404 });
      const d = data as Record<string, unknown>;
      const lines: LineRow[] = ((d.lines ?? []) as Record<string, unknown>[]).map(l => ({
        description: (l.description as string) || '',
        qty: Number(l.qty ?? 1), rate: Number(l.rate ?? 0),
        currency: (l.currency as string) || (d.currency as string) || 'USD',
        note: (l.note as string) || '',
      }));
      const { subtotal, discount, tax, total, currency } = estimateEmailTotals(d);
      docData = {
        number: d.estimate_number as string, customerName: d.customer_name as string,
        vehicle: d.vehicle as string, date: new Date(d.created_at as string).toLocaleDateString(),
        lines, subtotal, discount, tax, total,
        currency, notes: (d.notes as string) || '',
        validUntil: d.valid_until ? new Date(d.valid_until as string).toLocaleDateString() : '',
        status: d.status as string,
      };
    } else {
      // invoices PK is the number string (e.g. "INV-0008")
      const { data, error } = await db.from('invoices').select('*').eq('number', documentId).eq('shop_id', shopId).single();
      if (error || !data) return NextResponse.json({ error: 'Invoice not found' }, { status: 404 });
      const d = data as Record<string, unknown>;
      const lines: LineRow[] = ((d.lines ?? []) as Record<string, unknown>[]).map(l => ({
        description: (l.description as string) || '',
        qty: Number(l.qty ?? 1), rate: Number(l.rate ?? 0),
        currency: (l.currency as string) || (d.currency as string) || 'USD',
        note: (l.note as string) || '',
      }));
      const { subtotal, discount, tax, total, currency } = invoiceEmailTotals(d);
      docData = {
        number: d.number as string, customerName: d.customer as string,
        vehicle: d.vehicle as string, date: new Date(d.created_at as string).toLocaleDateString(),
        lines, subtotal, discount, tax, total,
        currency, notes: (d.notes as string) || '',
        status: d.status as string,
      };
    }

    // Optionally save email back to customer record.
    // Use admin client (bypasses RLS) and filter by id only — shop_id on the
    // customers row may differ between parent shop and location sub-shops.
    let actualEmailSaved = false;
    if (saveEmail && customerId) {
      try {
        const adminDb = getAdminDb();
        const { data: updateData, error: saveErr } = await adminDb
          .from('customers')
          .update({ email })
          .eq('id', customerId)
          .select('id');
        if (saveErr) {
          console.error('[send-document] save email error:', saveErr.message);
        } else if (!updateData || updateData.length === 0) {
          console.warn('[send-document] save email: no customer matched id', customerId, '— trying name fallback');
          // Fallback: try matching by customer name from the document
          const name = docData.customerName;
          if (name) {
            const { data: fallback, error: fbErr } = await adminDb
              .from('customers')
              .update({ email })
              .ilike('name', name)
              .select('id');
            if (!fbErr && fallback && fallback.length > 0) {
              actualEmailSaved = true;
              console.log('[send-document] email saved via name fallback for', name);
            } else {
              console.warn('[send-document] name fallback also found no match:', fbErr?.message);
            }
          }
        } else {
          actualEmailSaved = true;
          console.log('[send-document] email saved to customer', customerId);
        }
      } catch (saveEx) {
        console.error('[send-document] save email exception:', saveEx);
      }
    }

    // Generate PDF with pdf-lib (pure JS — works in Vercel serverless)
    const pdfBytes = await buildPdf({
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
    <div style="background:#fafafa;border:1px solid #eee;border-radius:10px;padding:18px 22px;margin-bottom:24px">
      <div style="display:flex;justify-content:space-between;flex-wrap:wrap;gap:12px">
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
    ${isWatermarked ? `<div style="margin-top:20px;padding:10px 16px;background:#fff8f8;border:1px solid #fecaca;border-radius:8px;font-size:12px;color:#991b1b;text-align:center">Trial version — Powered by RedlineD1</div>` : ''}
  </div>
  <div style="background:#f8f8f8;border-top:1px solid #eee;padding:16px 32px;text-align:center">
    <div style="font-size:12px;color:#888">${shopName}${shopPhone ? ` · ${shopPhone}` : ''}${shopAddress ? ` · ${shopAddress}` : ''}</div>
    <div style="font-size:11px;color:#bbb;margin-top:4px">Powered by RedlineD1</div>
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
        content: Buffer.from(pdfBytes).toString('base64'),
      }],
    });

    if (emailErr) return NextResponse.json({ error: (emailErr as { message?: string }).message ?? 'Email send failed' }, { status: 500 });
    return NextResponse.json({ success: true, sentTo: email, emailSaved: actualEmailSaved });
  } catch (e: unknown) {
    console.error('[send-document]', e);
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Unknown error' }, { status: 500 });
  }
}
