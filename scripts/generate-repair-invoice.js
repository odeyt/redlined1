/**
 * Repair Invoice & Quotation generator — D1 Imports bilingual format
 * Usage: node scripts/generate-repair-invoice.js
 */
const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');

// ── Invoice data ────────────────────────────────────────────────────────────
const INVOICE = {
  vehicle: 'Toyota Vigo (Engine Size: 2.5)',
  vehicleLao: 'ໂຕໂຍຕ້າ ວີໂກ (ຂະໜາດເຄື່ອງຈັກ: 2.5)',
  plateNumber: '1003',
  date: 'June 16, 2026',
  dateLao: 'ວັນທີ 16 ມິຖຸນາ 2026',
  exchangeRate: 32.81,
  lines: [
    { en: 'Used Engine (Engine Size 2.5)', lo: 'ເຄື່ອງຈັກມືສອງ (ຂະໜາດ 2.5)', usd: 2800.00 },
    { en: 'Shipping Cost', lo: 'ຄ່າສົ່ງເຄື່ອງ', usd: 300.00 },
    { en: 'Engine Oil and Filter', lo: 'ນ້ຳມັນເຄື່ອງ ແລະ ຕາກັນຕອງ', usd: 30.00 },
    { en: 'Add Coolant (5 Liters)', lo: 'ເຕີມນ້ຳຢາຫຼ່ວຽນລະບົບຄວາມເຢັນ (5 ລິດ)', usd: 20.00 },
    { en: 'Bleed Coolant System', lo: 'ໄລ່ລົມລະບົບນ້ຳຢາຫຼ່ວຽນຄວາມເຢັນ', usd: 0.00 },
    { en: 'Add Freon / AC Gas Refill', lo: 'ເຕີມນ້ຳຢາແອ', usd: 30.00 },
    { en: 'Flush & Add Power Steering Fluid', lo: 'ລ້າງ ແລະ ເຕີມນ້ຳມັນພວງມາໄລ', usd: 20.00 },
    { en: 'Engine Air Filter', lo: 'ໝໍ້ອາຍຫາດເຄື່ອງຈັກ', usd: 20.00 },
    { en: 'Rent Lift to Install & Remove Engine (3 Days @ $50/day)', lo: 'ເຊົ່າເຄື່ອງຍົກເພື່ອຕິດຕັ້ງ ແລະ ຖອດເຄື່ອງຈັກ (3 ວັນ @ $50/ວັນ)', usd: 150.00 },
    { en: 'Diesel Oil for Testing', lo: 'ນ້ຳມັນກາຊວນສຳລັບທົດລອງເຄື່ອງ', usd: 20.00 },
  ],
};

const WARRANTY = [
  {
    en: '6 Months Extended Warranty on the replaced used engine.',
    lo: 'ຮັບປະກັນຕໍ່ເວລາໃຫ້ອີກ 6 ເດືອນ ສຳລັບເຄື່ອງຈັກມືສອງທີ່ປ່ຽນໃໝ່.',
  },
  {
    en: 'Guaranteed no oil/fluid leaks and optimal engine pressure status.',
    lo: 'ຮັບປະກັນບໍ່ມີການຮົ່ວໄຫຼຂອງນ້ຳມັນ/ນ້ຳຢາ ແລະ ລະດັບແຮງດັນເຄື່ອງຈັກດີເປັນປົກກະຕິ.',
  },
  {
    en: 'Guaranteed healthy operation with absolutely no internal knocking noises.',
    lo: 'ຮັບປະກັນການເຮັດວຽກທີ່ສົມບູນ ແລະ ບໍ່ມີສຽງດັງ​ເຈາະ (Knocking) ພາຍໃນເຄື່ອງຈັກຢ່າງເດັດຂາດ.',
  },
];

// ── Colours & metrics ───────────────────────────────────────────────────────
const RED   = '#CC0000';
const DARK  = '#1a1a1a';
const GREY  = '#555555';
const LGREY = '#f5f5f5';
const WHITE = '#ffffff';

const PW = 595.28;   // A4 width  (pt)
const PH = 841.89;  // A4 height (pt)
const ML = 40;      // margin left
const MR = PW - 40; // margin right
const TW = MR - ML; // total content width

// Column widths for line-item table
const COL = { num: 28, desc: TW - 28 - 110 - 110, usd: 110, thb: 110 };

// ── Helpers ─────────────────────────────────────────────────────────────────
function money(val, prefix = '$') {
  return prefix + val.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}
function thb(usd, rate) {
  const v = (usd * rate).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return v + ' ฿';
}

// ── Build PDF ───────────────────────────────────────────────────────────────
const doc = new PDFDocument({ size: 'A4', margin: 0, info: { Title: 'Repair Invoice & Quotation — D1 Imports' } });
const out = path.join(__dirname, '..', 'D1-Repair-Invoice.pdf');
doc.pipe(fs.createWriteStream(out));

let y = 36;

// ── Header ──────────────────────────────────────────────────────────────────
// Left: title
doc.fontSize(22).fillColor(RED).font('Helvetica-Bold')
   .text('REPAIR INVOICE &', ML, y, { lineGap: 2 });
y += 28;
doc.text('QUOTATION', ML, y);
y += 26;
doc.fontSize(9).fillColor(GREY).font('Helvetica')
   .text('ໃບສະເໜີລາຄາ ແລະ ໃບບິນເກັບເງິນຄ່າສ້ອມແປງ', ML, y + 2);

// Right: company block
const companyX = MR - 160;
doc.fontSize(18).fillColor(RED).font('Helvetica-Bold')
   .text('D1 Imports', companyX, 36, { width: 160, align: 'right' });
doc.fontSize(9).fillColor(DARK).font('Helvetica')
   .text('Ban Saphan Muk, Saithani, Laos PDR', companyX, 60, { width: 160, align: 'right' })
   .text('ບ້ານ ສະພານໝັກ, ເມືອງ ໄຊທານີ, ສປປ ລາວ', companyX, 72, { width: 160, align: 'right', characterSpacing: -0.2 });
doc.fontSize(9).fillColor(DARK).font('Helvetica-Bold')
   .text('Tel: +856 20 96789988', companyX, 84, { width: 160, align: 'right' });

y = 108;

// Divider
doc.moveTo(ML, y).lineTo(MR, y).lineWidth(1.5).strokeColor(RED).stroke();
y += 14;

// ── Vehicle / date fields ────────────────────────────────────────────────────
function labelRow(label, laoLabel, value, yPos) {
  doc.fontSize(9).fillColor(RED).font('Helvetica-Bold')
     .text(label + ' / ', ML, yPos, { continued: true })
     .fillColor(RED)
     .text(laoLabel + ':', { continued: true })
     .fillColor(DARK).font('Helvetica')
     .text('  ' + value);
}

labelRow('Vehicle', 'ຍານພາຫານະ', INVOICE.vehicle, y);
y += 16;
labelRow('Plate Number', 'ທະບຽນລົດ', INVOICE.plateNumber, y);
y += 16;
labelRow('Date', 'ວັນທີ', `${INVOICE.date} / ${INVOICE.dateLao}`, y);
y += 22;

// ── Warranty box ─────────────────────────────────────────────────────────────
const boxX = ML;
const boxW = TW;

// Measure warranty box height first
let warrantyH = 30; // header
WARRANTY.forEach(() => { warrantyH += 28; });
warrantyH += 10;

// Draw box
doc.rect(boxX, y, boxW, warrantyH).lineWidth(1.5).strokeColor(RED).stroke();
// Light red fill
doc.rect(boxX, y, boxW, warrantyH).fillColor('#fff5f5').fill();

// Box header
doc.rect(boxX, y, boxW, 22).fillColor('#ffeeee').fill();
doc.fontSize(9).fillColor(RED).font('Helvetica-Bold')
   .text('ENGINE WARRANTY TERMS / ຂໍ້ກຳນົດການຮັບປະກັນເຄື່ອງຈັກ', boxX + 8, y + 7);

let wy = y + 28;
WARRANTY.forEach(w => {
  doc.fontSize(8.5).fillColor(DARK).font('Helvetica-Bold')
     .text('• ' + w.en, boxX + 8, wy, { width: boxW - 16 });
  wy += 11;
  doc.fontSize(8).fillColor(GREY).font('Helvetica')
     .text('• ' + w.lo, boxX + 8, wy, { width: boxW - 16 });
  wy += 14;
});

y += warrantyH + 16;

// ── Line items table ─────────────────────────────────────────────────────────
function tableHeader(yPos) {
  doc.rect(ML, yPos, TW, 20).fillColor(RED).fill();
  const cols = [ML + 4, ML + COL.num + 4, MR - COL.thb - COL.usd + 4, MR - COL.thb + 4];
  doc.fontSize(8.5).fillColor(WHITE).font('Helvetica-Bold');
  doc.text('#', cols[0], yPos + 6, { width: COL.num - 4 });
  doc.text('Description', cols[1], yPos + 5, { width: COL.desc - 8 });
  doc.text('ລາຍການ', cols[1], yPos + 13, { width: COL.desc - 8, fontSize: 7 });
  // right-align price headers
  doc.text('Price (USD)', MR - COL.thb - COL.usd, yPos + 5, { width: COL.usd - 4, align: 'right' });
  doc.text('ລາຄາ ($)', MR - COL.thb - COL.usd, yPos + 13, { width: COL.usd - 4, align: 'right' });
  doc.text('Price (THB)', MR - COL.thb, yPos + 5, { width: COL.thb - 4, align: 'right' });
  doc.text('ລາຄາ (฿)', MR - COL.thb, yPos + 13, { width: COL.thb - 4, align: 'right' });
  return yPos + 20;
}

y = tableHeader(y);

const RATE = INVOICE.exchangeRate;
let subtotal = 0;
let rowNum = 0;
const ITEMS_PER_PAGE = 18;
let itemsOnPage = 0;

INVOICE.lines.forEach((line, i) => {
  // New page if needed
  if (itemsOnPage > 0 && itemsOnPage % ITEMS_PER_PAGE === 0) {
    // Page number at bottom
    doc.fontSize(8).fillColor(GREY).font('Helvetica')
       .text(`Page ${doc.bufferedPageRange().start + 1} of 2`, ML, PH - 30, { width: TW, align: 'right' });
    doc.addPage({ size: 'A4', margin: 0 });
    y = 36;
    y = tableHeader(y);
    itemsOnPage = 0;
  }

  rowNum++;
  const bg = rowNum % 2 === 0 ? LGREY : WHITE;
  const usdVal = line.usd;
  subtotal += usdVal;

  // Estimate row height (desc may wrap)
  const enLines = Math.ceil(doc.widthOfString(line.en) / (COL.desc - 10));
  const rowH = Math.max(26, 14 + (enLines > 1 ? (enLines - 1) * 11 : 0));

  doc.rect(ML, y, TW, rowH).fillColor(bg).fill();

  // Left border stripe on even rows
  if (rowNum % 2 === 0) {
    doc.rect(ML, y, 3, rowH).fillColor('#e8e8e8').fill();
  }

  const descX = ML + COL.num + 4;
  doc.fontSize(8.5).fillColor(DARK).font('Helvetica-Bold')
     .text(String(rowNum), ML + 4, y + 6, { width: COL.num - 4 });
  doc.fontSize(8.5).fillColor(DARK).font('Helvetica-Bold')
     .text(line.en, descX, y + 5, { width: COL.desc - 8 });
  doc.fontSize(7.5).fillColor(GREY).font('Helvetica')
     .text(line.lo, descX, y + 16, { width: COL.desc - 8 });

  const priceY = y + (rowH > 26 ? (rowH - 10) / 2 : 7);
  doc.fontSize(8.5).fillColor(DARK).font('Helvetica-Bold')
     .text(money(usdVal), MR - COL.thb - COL.usd, priceY, { width: COL.usd - 4, align: 'right' });
  doc.fontSize(8.5).fillColor(DARK).font('Helvetica')
     .text(thb(usdVal, RATE), MR - COL.thb, priceY, { width: COL.thb - 4, align: 'right' });

  // Row bottom border
  doc.moveTo(ML, y + rowH).lineTo(MR, y + rowH).lineWidth(0.3).strokeColor('#dddddd').stroke();

  y += rowH;
  itemsOnPage++;
});

y += 10;

// ── Totals block ─────────────────────────────────────────────────────────────
const totalThb = subtotal * RATE;

// Subtotal row
doc.fontSize(8.5).fillColor(DARK).font('Helvetica-Bold')
   .text('Subtotal (USD):', ML, y, { width: TW - 140, align: 'right' });
doc.fontSize(8.5).fillColor(DARK).font('Helvetica-Bold')
   .text(money(subtotal), MR - 136, y, { width: 136, align: 'right' });
y += 14;

// Exchange rate
doc.fontSize(8).fillColor(GREY).font('Helvetica')
   .text('Exchange Rate / ອັດຕາແລກປ່ຽນ:', ML, y, { width: TW - 140, align: 'right' });
doc.fontSize(8).fillColor(GREY).font('Helvetica')
   .text(`1 USD = ${RATE.toFixed(2)} THB`, MR - 136, y, { width: 136, align: 'right' });
y += 18;

// Grand total box
doc.rect(ML, y, TW, 44).fillColor(DARK).fill();
doc.fontSize(10).fillColor(WHITE).font('Helvetica-Bold')
   .text('Total / ຍອດລວມທັງໝົດ:', ML + 8, y + 6, { width: TW - 16, align: 'right' });
doc.fontSize(18).fillColor(WHITE).font('Helvetica-Bold')
   .text(`${totalThb.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} THB`, ML + 8, y + 18, { width: TW - 16, align: 'right' });
y += 44;
doc.fontSize(8.5).fillColor(GREY).font('Helvetica')
   .text(`(Equivalent to ${money(subtotal)} USD)`, ML, y + 4, { width: TW, align: 'right' });
y += 20;

// Bottom divider
doc.moveTo(ML, y).lineTo(MR, y).lineWidth(0.5).strokeColor('#cccccc').stroke();
y += 10;
doc.fontSize(7.5).fillColor(GREY).font('Helvetica')
   .text('D1 Imports · Ban Saphan Muk, Saithani, Laos PDR · Tel: +856 20 96789988', ML, y, { width: TW, align: 'center' });

// Page number on last page
doc.fontSize(8).fillColor(GREY).font('Helvetica')
   .text(`Page 1 of 1`, ML, PH - 30, { width: TW, align: 'right' });

doc.end();
console.log('Generated:', out);
