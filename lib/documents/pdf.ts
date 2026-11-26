/**
 * Estimate and invoice PDFs (A4, pdf-lib, pure JS: works on Vercel serverless).
 *
 * Moved verbatim out of app/api/send-document/route.ts so API v1 can render
 * the same layout without importing the email route (docs/api/PLAN.md
 * phase 5). The email route imports it from here; its output is unchanged.
 * lib/documents/__tests__/pdf.test.ts pins that.
 *
 * One addition, off unless asked for: `draftWatermark` stamps DRAFT across
 * the page and a "not issued" line under the header, for API v1 drafts. When
 * it is absent or false, not a single drawing call differs.
 */
import { PDFDocument, StandardFonts, rgb, degrees } from 'pdf-lib';

export function money(amount: number, currency: string) {
  try {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency, minimumFractionDigits: 2 }).format(amount);
  } catch {
    return `${currency} ${amount.toFixed(2)}`;
  }
}

export async function buildPdf(doc: {
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
  /** API v1 drafts only. Absent/false draws nothing extra. */
  draftWatermark?: boolean;
}): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.create();
  const pageWidth = 595;  // A4
  const pageHeight = 842;
  const page = pdfDoc.addPage([pageWidth, pageHeight]);

  const fontReg  = await pdfDoc.embedStandardFont(StandardFonts.Helvetica);
  const fontBold = await pdfDoc.embedStandardFont(StandardFonts.HelveticaBold);

  const RED   = rgb(0.80, 0.00, 0.00);
  const WHITE = rgb(1, 1, 1);
  const DARK  = rgb(0.07, 0.07, 0.07);
  const GRAY  = rgb(0.40, 0.40, 0.40);
  const LIGHT = rgb(0.96, 0.96, 0.96);
  const LINE  = rgb(0.90, 0.90, 0.90);

  // ── Header bar ──
  page.drawRectangle({ x: 0, y: pageHeight - 72, width: pageWidth, height: 72, color: RED });
  page.drawText(doc.shopName.slice(0, 40), { x: 40, y: pageHeight - 28, font: fontBold, size: 16, color: WHITE });
  const subLine = [doc.shopAddress, doc.shopPhone, doc.shopEmail].filter(Boolean).join(' · ');
  if (subLine) page.drawText(subLine.slice(0, 80), { x: 40, y: pageHeight - 48, font: fontReg, size: 8, color: rgb(1, 0.85, 0.85) });

  const typeLabel = doc.type === 'estimate' ? 'ESTIMATE' : 'INVOICE';
  const numW = fontBold.widthOfTextAtSize(doc.number, 16);
  const typW = fontBold.widthOfTextAtSize(typeLabel, 9);
  page.drawText(typeLabel, { x: pageWidth - 40 - typW, y: pageHeight - 26, font: fontBold, size: 9, color: rgb(1, 0.85, 0.85) });
  page.drawText(doc.number, { x: pageWidth - 40 - numW, y: pageHeight - 44, font: fontBold, size: 16, color: WHITE });

  // ── Bill to / doc info ──
  let y = pageHeight - 92;
  page.drawText('BILL TO', { x: 40, y, font: fontBold, size: 8, color: GRAY });
  y -= 14;
  page.drawText(doc.customerName.slice(0, 50), { x: 40, y, font: fontBold, size: 11, color: DARK });
  if (doc.vehicle) { y -= 12; page.drawText(doc.vehicle.slice(0, 50), { x: 40, y, font: fontReg, size: 9, color: GRAY }); }

  const infoY = pageHeight - 92;
  page.drawText('DATE', { x: 360, y: infoY, font: fontBold, size: 8, color: GRAY });
  page.drawText(doc.date, { x: 360, y: infoY - 14, font: fontReg, size: 10, color: DARK });
  if (doc.validUntil) {
    page.drawText('VALID UNTIL', { x: 360, y: infoY - 32, font: fontBold, size: 8, color: GRAY });
    page.drawText(doc.validUntil, { x: 360, y: infoY - 44, font: fontReg, size: 10, color: DARK });
  }

  y -= 22;
  page.drawLine({ start: { x: 40, y }, end: { x: pageWidth - 40, y }, thickness: 0.5, color: LINE });
  y -= 14;

  // ── Table header ──
  page.drawRectangle({ x: 40, y: y - 4, width: pageWidth - 80, height: 20, color: LIGHT });
  page.drawText('DESCRIPTION', { x: 44, y: y + 3, font: fontBold, size: 8, color: GRAY });
  page.drawText('QTY',    { x: 356, y: y + 3, font: fontBold, size: 8, color: GRAY });
  page.drawText('RATE',   { x: 406, y: y + 3, font: fontBold, size: 8, color: GRAY });
  page.drawText('AMOUNT', { x: 480, y: y + 3, font: fontBold, size: 8, color: GRAY });
  y -= 20;

  // ── Line items ──
  for (let i = 0; i < doc.lines.length; i++) {
    const line = doc.lines[i];
    const rowH = 20;
    const bg = i % 2 === 0 ? WHITE : rgb(0.98, 0.98, 0.98);
    page.drawRectangle({ x: 40, y: y - 4, width: pageWidth - 80, height: rowH, color: bg });
    const desc = (line.description || '—').slice(0, 55);
    page.drawText(desc, { x: 44, y: y + 3, font: fontReg, size: 9.5, color: DARK });
    page.drawText(String(line.qty), { x: 360, y: y + 3, font: fontReg, size: 9.5, color: DARK });
    page.drawText(money(line.rate, line.currency || doc.currency), { x: 406, y: y + 3, font: fontReg, size: 9.5, color: DARK });
    page.drawText(money(line.qty * line.rate, line.currency || doc.currency), { x: 480, y: y + 3, font: fontReg, size: 9.5, color: DARK });
    y -= rowH;
    if (y < 120) break; // safety: don't overflow page
  }

  y -= 8;
  page.drawLine({ start: { x: 40, y }, end: { x: pageWidth - 40, y }, thickness: 0.5, color: LINE });
  y -= 14;

  // ── Totals ──
  function addTotalRow(label: string, val: string, bold = false) {
    const font = bold ? fontBold : fontReg;
    page.drawText(label, { x: 360, y, font, size: bold ? 11 : 9, color: bold ? DARK : GRAY });
    const vW = font.widthOfTextAtSize(val, bold ? 11 : 9);
    page.drawText(val, { x: pageWidth - 40 - vW, y, font, size: bold ? 11 : 9, color: bold ? DARK : GRAY });
    y -= bold ? 18 : 14;
  }
  addTotalRow('Subtotal', money(doc.subtotal, doc.currency));
  if (doc.discount > 0) addTotalRow('Discount', `-${money(doc.discount, doc.currency)}`);
  if (doc.tax > 0)      addTotalRow('Tax', money(doc.tax, doc.currency));
  page.drawLine({ start: { x: 360, y: y + 6 }, end: { x: pageWidth - 40, y: y + 6 }, thickness: 0.5, color: LINE });
  y -= 4;
  addTotalRow('TOTAL', money(doc.total, doc.currency), true);

  // ── Notes ──
  if (doc.notes) {
    y -= 10;
    page.drawText('NOTES', { x: 40, y, font: fontBold, size: 8, color: GRAY });
    y -= 13;
    page.drawText(doc.notes.slice(0, 120), { x: 40, y, font: fontReg, size: 9, color: DARK, maxWidth: pageWidth - 80 });
  }

  // ── Watermark ──
  if (doc.isWatermarked) {
    page.drawText('REDLINED1', {
      x: 140, y: 320,
      font: fontBold, size: 72,
      color: rgb(0.80, 0.00, 0.00),
      opacity: 0.06,
      rotate: degrees(-45),
    });
  }

  // ── Draft stamp (API v1) ──
  // Large enough that a draft cannot pass for an issued document if a bot
  // forwards it, light enough that the lines stay readable for review.
  if (doc.draftWatermark) {
    page.drawText('DRAFT', {
      x: 150, y: 260,
      font: fontBold, size: 120,
      color: rgb(0.80, 0.00, 0.00),
      opacity: 0.12,
      rotate: degrees(45),
    });
    page.drawText('DRAFT: not issued. Not valid for payment.', {
      x: 40, y: pageHeight - 82, font: fontBold, size: 8, color: RED,
    });
  }

  // ── Footer ──
  page.drawLine({ start: { x: 40, y: 36 }, end: { x: pageWidth - 40, y: 36 }, thickness: 0.5, color: LINE });
  const footer = `${doc.shopName} · ${doc.number} · Powered by RedlineD1`;
  const ftW = fontReg.widthOfTextAtSize(footer, 7.5);
  page.drawText(footer, { x: (pageWidth - ftW) / 2, y: 22, font: fontReg, size: 7.5, color: GRAY });

  return pdfDoc.save();
}
