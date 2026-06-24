const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');

const OUT = path.join(__dirname, 'Test_Recent_Features.pdf');
const doc = new PDFDocument({ margin: 55, size: 'LETTER' });
doc.pipe(fs.createWriteStream(OUT));

const RED    = '#cc0000';
const DARK   = '#111111';
const MUTED  = '#666666';
const GREEN  = '#1a7a1a';
const BLUE   = '#0055cc';
const LGRAY  = '#dddddd';
const BGCODE = '#f5f5f5';
const ORANGE = '#c05a00';

function rule(color = LGRAY) {
  doc.moveTo(55, doc.y).lineTo(557, doc.y).strokeColor(color).lineWidth(color === RED ? 2 : 0.75).stroke();
  doc.moveDown(0.4);
}
function h1(text) {
  doc.fontSize(20).fillColor(RED).font('Helvetica-Bold').text(text, { continued: false });
}
function h2(text, color = DARK) {
  doc.moveDown(0.5);
  doc.fontSize(13).fillColor(color).font('Helvetica-Bold').text(text);
  doc.moveDown(0.25);
}
function h3(text) {
  doc.moveDown(0.3);
  doc.fontSize(11).fillColor(BLUE).font('Helvetica-Bold').text(text);
  doc.moveDown(0.2);
}
function body(text, indent = 0) {
  doc.fontSize(10).fillColor(DARK).font('Helvetica').text(text, 55 + indent, doc.y, { width: 502 - indent });
}
function muted(text, indent = 0) {
  doc.fontSize(9).fillColor(MUTED).font('Helvetica').text(text, 55 + indent, doc.y, { width: 502 - indent });
}
function check(text, indent = 0) {
  doc.fontSize(10).fillColor(DARK).font('Helvetica')
    .text('☐  ' + text, 55 + indent, doc.y, { width: 502 - indent });
}
function code(text) {
  const x = 55, w = 502, pad = 8;
  const lines = text.split('\n');
  const lineH = 13;
  const blockH = lines.length * lineH + pad * 2;
  doc.rect(x, doc.y, w, blockH).fill(BGCODE);
  const ty = doc.y + pad;
  doc.fontSize(8.5).fillColor(DARK).font('Courier').text(text, x + pad, ty, { width: w - pad * 2, lineGap: 2 });
  doc.moveDown(0.5);
}
function expect(text) {
  doc.fontSize(9).fillColor(GREEN).font('Helvetica-Bold').text('Expected: ', 55, doc.y, { continued: true });
  doc.font('Helvetica').fillColor(DARK).text(text, { width: 490 });
}
function signOff() {
  rule(RED);
  h2('Pass / Fail Sign-Off');
  const soY = doc.y;
  doc.fontSize(10).fillColor(DARK).font('Helvetica-Bold').text('Tester:', 55, soY);
  doc.font('Helvetica').text('_______________________________', 110, soY);
  doc.font('Helvetica-Bold').text('Date:', 370, soY);
  doc.font('Helvetica').text('________________', 400, soY);
  doc.moveDown(0.8);
  doc.font('Helvetica-Bold').text('Result:', 55, doc.y);
  doc.font('Helvetica').text('☐  PASS        ☐  FAIL', 110, doc.y);
  doc.moveDown(0.8);
  doc.font('Helvetica-Bold').text('Notes:', 55, doc.y);
  doc.font('Helvetica').text('_______________________________________________________________________', 100, doc.y);
}

// ── COVER ──────────────────────────────────────────────────────────
h1('Recent Features — Test Procedures');
doc.fontSize(15).fillColor(DARK).font('Helvetica-Bold').text('Redlined1 Auto Repair SaaS');
doc.fontSize(10).fillColor(MUTED).font('Helvetica').text('Version 1.0  |  Date: 2026-06-19  |  Covers 6 feature areas');
doc.moveDown(0.5);
rule(RED);

h2('Features Covered in This Document');
const features = [
  '1. Time Tracking — clock in/out, sessions, stat cards, CSV export',
  '2. Payment Stat Card Hover Tooltips — Collected, Void, Refunded, Today',
  '3. Payment Date & Time — local timezone (not UTC)',
  '4. Invoice Payment Reflection — Amount Received / Balance Due display',
  '5. Parts Inventory — decimal input, leading zeros, save error messages',
  '6. Inspection Share Link — modal popup, copy to clipboard',
];
features.forEach(f => body(f, 14));
doc.moveDown(0.5);
muted('Each section below is a self-contained test. Run them in any order. Each has its own Pass/Fail sign-off.');
rule();

// ═══════════════════════════════════════════════════════════════════
// SECTION 1 — TIME TRACKING
// ═══════════════════════════════════════════════════════════════════
doc.addPage();
h2('TEST 1 — Time Tracking', RED);
rule(RED);

h3('Pre-conditions');
check('You have at least one technician in the Technicians module');
check('Settings → Feature Toggles → Time Tracking is ON');
check('At least one Job Card exists (e.g. JC-0001)');
doc.moveDown(0.3);

h3('Step 1.1 — Stat Cards (no entries yet)');
body('Navigate to the Time Tracking module in the left sidebar.', 14);
body('Observe the four stat cards at the top of the page.', 14);
expect('Hours Today = 0, Hours This Week = 0, Active Now = 0, Total Entries = 0');
doc.moveDown(0.3);

h3('Step 1.2 — Clock In');
body('In the Clock In form, select a technician from the dropdown.', 14);
body('Enter a Job Card number (e.g. JC-0001).', 14);
body('Add a note: "Test session A".', 14);
body('Click Clock In.', 14);
expect('Session appears in Active Sessions with a green Clock Out button and a live timer counting up.');
check('Active Now stat card increments to 1', 14);
check('Total Entries increments to 1', 14);
doc.moveDown(0.3);

h3('Step 1.3 — Clock Out');
body('Click the green "Clock Out" button on the active session.', 14);
expect('Session moves from Active Sessions to the Time Log table with a calculated duration (e.g. 0h 2m).');
check('Active Now returns to 0', 14);
check('Hours Today increments to reflect the logged duration', 14);
doc.moveDown(0.3);

h3('Step 1.4 — Date Filters');
body('Click "Today" filter. Verify the just-logged entry appears.', 14);
body('Click "This Week" filter. Verify the entry still appears.', 14);
body('Click "All Time". Verify all entries appear.', 14);
check('Footer total hours updates correctly for each filter', 14);
doc.moveDown(0.3);

h3('Step 1.5 — Delete an Entry');
body('Click the trash/delete icon on the test entry in the Time Log.', 14);
expect('Entry is removed from the table. Total Entries decrements.');
doc.moveDown(0.3);

h3('Step 1.6 — CSV Export');
body('Log at least 2 time entries (clock in + out twice).', 14);
body('Click "Export CSV" at the top of the module.', 14);
expect('A .csv file is downloaded. Open it — verify columns: Technician, Job Card, Clock In, Clock Out, Duration (minutes), Notes.');
check('All logged entries appear in the CSV', 14);
check('Duration column contains numbers (minutes)', 14);

signOff();

// ═══════════════════════════════════════════════════════════════════
// SECTION 2 — PAYMENT HOVER TOOLTIPS
// ═══════════════════════════════════════════════════════════════════
doc.addPage();
h2('TEST 2 — Payment Stat Card Hover Tooltips', RED);
rule(RED);

h3('Pre-conditions');
check('At least 3 payments exist with status: Collected');
check('At least 1 payment exists with status: Void');
check('At least 1 payment exists with status: Refunded');
doc.moveDown(0.3);
muted('If you do not have these, create them using the Record Payment form before running this test.');
doc.moveDown(0.3);

h3('Step 2.1 — Total Collected Hover');
body('Navigate to Payments module.', 14);
body('Hover the mouse over the "Total Collected" stat card.', 14);
expect('A dropdown popup appears below the card listing each collected payment with: customer name, date & time, invoice number, method, reference, and amount.');
check('Dollar amounts in the popup sum to the value shown on the card', 14);
check('Void and Refunded payments are NOT in this list', 14);
doc.moveDown(0.3);

h3('Step 2.2 — Voided Hover');
body('Hover over the "Voided" stat card.', 14);
expect('Dropdown shows only Voided payments. Each row shows: customer, date/time, invoice#, method, reference, amount.');
check('Count matches the number shown on the card', 14);
doc.moveDown(0.3);

h3('Step 2.3 — Refunded Hover');
body('Hover over the "Refunded" stat card.', 14);
expect('Dropdown shows only Refunded payments. Same columns as above.');
check('Count matches the card value', 14);
doc.moveDown(0.3);

h3('Step 2.4 — Today Hover');
body('Hover over the "Today" stat card.', 14);
expect('Dropdown shows payments recorded today only (any status except Void/Refunded).');
check('All listed payments have today\'s date', 14);
doc.moveDown(0.3);

h3('Step 2.5 — Cards With No Data');
body('If the Voided or Refunded card shows 0, hover over it.', 14);
expect('No dropdown appears (or an empty state is shown) — the card does not crash or show blank rows.');

signOff();

// ═══════════════════════════════════════════════════════════════════
// SECTION 3 — PAYMENT DATE LOCAL TIMEZONE
// ═══════════════════════════════════════════════════════════════════
doc.addPage();
h2('TEST 3 — Payment Date & Time (Local Timezone)', RED);
rule(RED);

h3('Pre-conditions');
check('You know your local timezone (e.g. Asia/Bangkok = UTC+7)');
check('You can see the clock on your computer');
doc.moveDown(0.3);

h3('Step 3.1 — New Payment Date Defaults to Local Time');
body('Navigate to Payments module.', 14);
body('Click "Record Payment" to open the payment form.', 14);
body('Look at the date/time field.', 14);
expect('The date/time field shows the current local time, NOT UTC time. Example: if it is 10:00 AM in Bangkok (UTC+7), the field should show 10:00 — NOT 03:00.');
check('Hour matches your local clock', 14);
check('Date matches today\'s local date', 14);
doc.moveDown(0.3);

h3('Step 3.2 — Close and Reopen');
body('Close the payment form without saving.', 14);
body('Wait 2 minutes.', 14);
body('Open the form again.', 14);
expect('Date/time field shows the NEW current time — not the time from before (frozen time bug is fixed).');
doc.moveDown(0.3);

h3('Step 3.3 — Edit Existing Payment');
body('Click Edit on any existing payment.', 14);
body('Check the date/time field in the edit form.', 14);
expect('The field shows the payment\'s original time in local timezone. If payment was recorded at 10:00 AM local time, field should show 10:00 — NOT 03:00 (UTC offset).');
check('Displayed time matches when you remember recording the payment', 14);

signOff();

// ═══════════════════════════════════════════════════════════════════
// SECTION 4 — INVOICE PAYMENT REFLECTION
// ═══════════════════════════════════════════════════════════════════
doc.addPage();
h2('TEST 4 — Invoice Payment Reflection', RED);
rule(RED);

h3('Pre-conditions');
check('At least 1 invoice exists (e.g. INV-0005) with a known total (e.g. $200.00)');
check('No payments are recorded for that invoice yet');
doc.moveDown(0.3);

h3('Step 4.1 — Invoice Shows No Payment Row Before Recording');
body('Navigate to Invoicing module.', 14);
body('Click on the test invoice (e.g. INV-0005).', 14);
body('Scroll to the bottom of the invoice detail panel.', 14);
expect('Only the Total row is visible. No "Amount Received" or "Balance Due" rows appear.');
doc.moveDown(0.3);

h3('Step 4.2 — Record a Partial Payment');
body('Navigate to Payments module.', 14);
body('Click Record Payment.', 14);
body('Enter amount: $100.00 (half the invoice total).', 14);
body('Set Invoice Number to INV-0005.', 14);
body('Set status to Collected. Save.', 14);
doc.moveDown(0.3);

h3('Step 4.3 — Verify Invoice Shows Partial Balance');
body('Return to Invoicing module.', 14);
body('Click INV-0005.', 14);
expect('"Amount Received: -$100.00" appears below Total. "Balance Due: $100.00" appears below that.');
check('Amount Received is negative (shown as deduction)', 14);
check('Balance Due = invoice total minus payment amount', 14);
doc.moveDown(0.3);

h3('Step 4.4 — Record Full Payment');
body('Go back to Payments.', 14);
body('Record a second payment of $100.00 linked to INV-0005, status Collected.', 14);
body('Return to INV-0005 in Invoicing.', 14);
expect('"Amount Received: -$200.00" and "Balance Due: PAID IN FULL" (in green text).');
check('"PAID IN FULL" is displayed instead of $0.00', 14);
doc.moveDown(0.3);

h3('Step 4.5 — Void a Payment — Balance Returns');
body('In Payments, change one of the $100.00 payments on INV-0005 to status Void.', 14);
body('Return to INV-0005 in Invoicing.', 14);
expect('"Amount Received: -$100.00" and "Balance Due: $100.00" — the voided payment is excluded from the total.');

signOff();

// ═══════════════════════════════════════════════════════════════════
// SECTION 5 — PARTS INVENTORY
// ═══════════════════════════════════════════════════════════════════
doc.addPage();
h2('TEST 5 — Parts Inventory Improvements', RED);
rule(RED);

h3('5A — Decimal Price Input');
body('Navigate to Parts Inventory. Click "Add Part".', 14);
body('In the Cost field, type: 18.50', 14);
expect('Field shows "18.50" — the period is not eaten/removed while typing.');
check('After tabbing away, field shows 18.5 (trailing zero trimmed is acceptable)', 14);
doc.moveDown(0.3);
body('Clear the field. Type: 0.50', 14);
expect('Field shows "0.50" — leading zero is preserved (it is valid before a decimal).');
doc.moveDown(0.3);
body('Clear the field. Type: 5.00', 14);
expect('Field shows "5.00" during typing. On blur, shows 5.');
doc.moveDown(0.3);

h3('5B — Leading Zeros Removed');
body('In the Quantity field, type: 05', 14);
expect('Display shows "5" — the leading zero is stripped automatically.');
check('Result is not empty — "00" stripping does not blank the field', 14);
doc.moveDown(0.3);
body('In the Cost field, type: 0050', 14);
expect('Field shows "50" after stripping — not "" (empty).');
doc.moveDown(0.3);

h3('5C — Click to Select All');
body('Click inside the Cost or Retail field when it already has a value.', 14);
expect('All text in the field is selected automatically (so you can type a replacement value immediately).');
doc.moveDown(0.3);

h3('5D — Save Error Display');
body('Create two parts with the same Part Number (e.g. PN-TEST-001).', 14);
body('Save the first part successfully.', 14);
body('Try to add a second part with the same Part Number and click Save.', 14);
expect('A red error banner appears at the top of the form with text like: "duplicate key value violates unique constraint…"');
check('Error message is visible and readable — not just "Save failed:" with no detail', 14);
check('Form stays open so you can correct the part number', 14);
doc.moveDown(0.3);

h3('5E — Cost Value & Retail Value Stat Cards');
body('Add a part: Qty=10, Cost=$20.00, Retail=$35.00.', 14);
expect('Cost Value stat card shows $200.00 with sub-label "10 units × avg $20.00".');
expect('Retail Value stat card shows $350.00 with sub-label "10 units × avg $35.00".');
check('Both stat cards reflect the part you just added', 14);

signOff();

// ═══════════════════════════════════════════════════════════════════
// SECTION 6 — INSPECTION SHARE LINK
// ═══════════════════════════════════════════════════════════════════
doc.addPage();
h2('TEST 6 — Inspection Share Link Modal', RED);
rule(RED);

h3('Pre-conditions');
check('At least 1 completed inspection exists');
doc.moveDown(0.3);

h3('Step 6.1 — Open Share Modal');
body('Navigate to Inspections. Click on any completed inspection.', 14);
body('Click the "🔗 Share Link" button in the action bar.', 14);
expect('A centered modal popup appears over the page. It contains: the full URL in a text box, a "📋 Copy Link" button, and a Close button.');
check('Modal is centered on screen regardless of scroll position', 14);
check('Background is darkened (semi-transparent overlay)', 14);
doc.moveDown(0.3);

h3('Step 6.2 — Copy Link');
body('Click the "📋 Copy Link" button inside the modal.', 14);
expect('Button text changes to "✓ Copied to clipboard!" (green). The URL is now in your clipboard.');
body('Open a new browser tab and paste (Ctrl+V). The URL should appear.', 14);
expect('URL format: https://redlined1.com/inspection/[token]  where token is a 32-character string.');
doc.moveDown(0.3);

h3('Step 6.3 — Customer View');
body('Open the copied URL in a private/incognito window (not logged in).', 14);
expect('The inspection report loads without requiring login. Shows vehicle info, checklist results, tech notes, and photos.');
check('Customer can see Fail / Attention / Pass / N/A results', 14);
check('No admin UI or edit buttons are visible to the customer', 14);
doc.moveDown(0.3);

h3('Step 6.4 — Close Modal (3 methods)');
body('Method A: Click the ✕ button in the top-right of the modal.', 14);
expect('Modal closes. Share Link button returns to normal (not stuck showing "…").');
doc.moveDown(0.2);
body('Open modal again. Method B: Click the "Close" button at the bottom.', 14);
expect('Modal closes. Button is not stuck.');
doc.moveDown(0.2);
body('Open modal again. Method C: Click outside the modal (on the dark overlay).', 14);
expect('Modal closes. Button is not stuck.');
doc.moveDown(0.3);

h3('Step 6.5 — Repeated Clicks Return Same URL');
body('Click Share Link on the same inspection a second time.', 14);
expect('Modal shows the same URL as the first time — the token is not regenerated on each click.');

signOff();

// ── FINAL PAGE ─────────────────────────────────────────────────────
doc.addPage();
h2('Test Summary Sign-Off Sheet', RED);
rule(RED);

body('Use this page for a consolidated sign-off after all 6 tests are complete.');
doc.moveDown(0.5);

const tests = [
  ['TEST 1', 'Time Tracking', ''],
  ['TEST 2', 'Payment Stat Card Hover Tooltips', ''],
  ['TEST 3', 'Payment Date Local Timezone', ''],
  ['TEST 4', 'Invoice Payment Reflection', ''],
  ['TEST 5', 'Parts Inventory Improvements', ''],
  ['TEST 6', 'Inspection Share Link Modal', ''],
];

// header row
const hY = doc.y;
doc.rect(55, hY, 502, 20).fill(RED);
doc.fontSize(9).fillColor('#ffffff').font('Helvetica-Bold');
doc.text('Test', 63, hY + 6, { width: 60 });
doc.text('Feature', 125, hY + 6, { width: 240 });
doc.text('Pass / Fail', 367, hY + 6, { width: 80 });
doc.text('Tester Initials', 449, hY + 6, { width: 100 });
doc.y = hY + 20;

tests.forEach((row, i) => {
  const rY = doc.y;
  const bg = i % 2 === 0 ? '#fff8f8' : '#ffffff';
  doc.rect(55, rY, 502, 22).fill(bg);
  doc.fontSize(9).fillColor(DARK).font('Helvetica-Bold').text(row[0], 63, rY + 7, { width: 60 });
  doc.font('Helvetica').text(row[1], 125, rY + 7, { width: 240 });
  doc.text('☐ PASS  ☐ FAIL', 367, rY + 7, { width: 80 });
  doc.text('___________', 449, rY + 7, { width: 100 });
  doc.y = rY + 22;
});
doc.rect(55, hY, 502, doc.y - hY).strokeColor(LGRAY).lineWidth(0.5).stroke();

doc.moveDown(1);
rule(RED);
h2('Final Sign-Off');
const soY = doc.y;
doc.fontSize(10).fillColor(DARK).font('Helvetica-Bold').text('QA Lead:', 55, soY);
doc.font('Helvetica').text('_______________________________', 115, soY);
doc.font('Helvetica-Bold').text('Date:', 370, soY);
doc.font('Helvetica').text('________________', 400, soY);
doc.moveDown(1.2);
doc.font('Helvetica-Bold').text('Overall Result:', 55, doc.y);
doc.font('Helvetica').text('☐  ALL PASS — ready for production', 155, doc.y);
doc.moveDown(0.7);
doc.font('Helvetica').text('☐  FAIL — see individual sign-off sheets for defect details', 155, doc.y);
doc.moveDown(1);
doc.fontSize(9).fillColor(MUTED).font('Helvetica')
  .text('Generated by Redlined1 test scripts. File a bug report for any FAIL with the test step number, expected result, and actual result observed.', { width: 502 });

doc.end();
console.log('PDF written to', OUT);
