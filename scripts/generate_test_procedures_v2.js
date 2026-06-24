const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');

const OUT = 'C:\\Users\\wallyd1\\Desktop\\Redline_Test_Procedures_v2.pdf';
const doc = new PDFDocument({ size: 'LETTER', margins: { top: 55, bottom: 55, left: 60, right: 60 }, bufferPages: true });
doc.pipe(fs.createWriteStream(OUT));

// ── Colours & helpers ────────────────────────────────────────────────────────
const RED    = '#CC0000';
const DARK   = '#111111';
const MUTED  = '#666666';
const LIGHT  = '#F5F5F5';
const GREEN  = '#2E7D32';
const BLUE   = '#1565C0';
const ORANGE = '#E65100';
const LINE   = '#DDDDDD';
const W = doc.page.width - 120; // usable width

function addPageNum() {
  const range = doc.bufferedPageRange();
  for (let i = range.start; i < range.start + range.count; i++) {
    doc.switchToPage(i);
    const saved = doc.y;
    doc.fontSize(9).fillColor(MUTED)
      .text(`Redline D1 — QA Test Procedures v2  |  Page ${i + 1}`, 60, doc.page.height - 38, { width: W, align: 'center' });
    doc.y = saved;
  }
}

function hRule(y, color = LINE) {
  doc.moveTo(60, y).lineTo(60 + W, y).strokeColor(color).lineWidth(0.5).stroke();
}

function checkboxRow(label) {
  const cx = 60, cy = doc.y;
  doc.rect(cx, cy, 11, 11).strokeColor('#999').lineWidth(0.8).stroke();
  doc.fillColor(DARK).fontSize(11).text('  ' + label, cx + 16, cy, { width: W - 16 });
  doc.moveDown(0.3);
}

function sectionHeader(num, title, color = RED) {
  if (doc.y > doc.page.height - 120) doc.addPage();
  doc.moveDown(0.6);
  doc.rect(60, doc.y, W, 30).fill(color);
  doc.fillColor('#FFFFFF').fontSize(13).font('Helvetica-Bold')
    .text(`SECTION ${num}  —  ${title}`, 68, doc.y - 24, { width: W - 16 });
  doc.moveDown(1.6);
}

function testHeader(id, title) {
  if (doc.y > doc.page.height - 150) doc.addPage();
  doc.moveDown(0.5);
  const ty = doc.y;
  doc.rect(60, ty, W, 22).fill('#EEEEEE');
  doc.fillColor(DARK).fontSize(11).font('Helvetica-Bold')
    .text(`TEST ${id}  —  ${title}`, 66, ty + 5, { width: W - 12 });
  doc.moveDown(1.5);
}

function step(num, text) {
  const sy = doc.y;
  doc.fillColor(RED).fontSize(10).font('Helvetica-Bold').text(`${num}.`, 60, sy, { width: 18 });
  doc.fillColor(DARK).fontSize(10).font('Helvetica').text(text, 80, sy, { width: W - 20 });
  doc.moveDown(0.35);
}

function expected(text) {
  const ey = doc.y;
  doc.rect(60, ey, W, 1).fill(); // invisible spacer
  doc.fillColor(GREEN).fontSize(9).font('Helvetica-Bold').text('Expected:', 60, doc.y, { continued: true });
  doc.fillColor('#2E5017').fontSize(9).font('Helvetica').text('  ' + text, { width: W });
  doc.moveDown(0.5);
}

function note(text) {
  doc.fillColor(ORANGE).fontSize(9).font('Helvetica-Oblique').text('Note: ' + text, 60, doc.y, { width: W });
  doc.moveDown(0.4);
}

function passFailBar() {
  const py = doc.y + 2;
  // Pass box
  doc.rect(60, py, 60, 18).strokeColor('#4CAF50').lineWidth(0.8).stroke();
  doc.fillColor('#4CAF50').fontSize(9).font('Helvetica-Bold').text('PASS', 60, py + 4, { width: 60, align: 'center' });
  // Fail box
  doc.rect(132, py, 60, 18).strokeColor('#F44336').lineWidth(0.8).stroke();
  doc.fillColor('#F44336').fontSize(9).font('Helvetica-Bold').text('FAIL', 132, py + 4, { width: 60, align: 'center' });
  // Notes field
  doc.rect(204, py, W - 144, 18).strokeColor('#BBBBBB').lineWidth(0.5).stroke();
  doc.fillColor(MUTED).fontSize(8).font('Helvetica').text('Tester notes:', 208, py + 5);
  doc.moveDown(1.5);
}

function overviewBox(text) {
  const oy = doc.y;
  doc.rect(60, oy, W, 1).fill();
  doc.rect(60, doc.y, W, 38).fill('#FFF8F0').strokeColor('#FFCC80').lineWidth(0.6).stroke();
  doc.fillColor('#E65100').fontSize(9).font('Helvetica-Bold').text('Overview:', 68, doc.y + 6, { continued: true });
  doc.fillColor('#5D4037').fontSize(9).font('Helvetica').text('  ' + text, { width: W - 16 });
  doc.moveDown(1.8);
}

// ════════════════════════════════════════════════════════════════════════════
// COVER PAGE
// ════════════════════════════════════════════════════════════════════════════
doc.rect(0, 0, doc.page.width, 200).fill(RED);
doc.fillColor('#FFFFFF').fontSize(28).font('Helvetica-Bold')
  .text('REDLINE D1', 60, 60, { width: W });
doc.fontSize(16).font('Helvetica')
  .text('QA Test Procedures — Version 2', 60, 100, { width: W });
doc.fontSize(11).fillColor('rgba(255,255,255,0.8)')
  .text('Feature Tests & Bug Fix Verification', 60, 128, { width: W });

doc.fillColor(DARK).fontSize(11).font('Helvetica')
  .text('Date: June 17, 2026', 60, 230)
  .text('Prepared for: Redline D1 Development Team', 60, 248)
  .text('Classification: Internal QA', 60, 266);

hRule(295);

doc.fontSize(11).font('Helvetica-Bold').fillColor(DARK).text('DOCUMENT CONTENTS', 60, 310);
doc.moveDown(0.5);

const sections = [
  ['Section 1', 'Customer Digital Approval (Per-Item Approve/Decline)', '8 tests'],
  ['Section 2', 'Live Repair Status Tracker (6 Stages + SMS/Email)', '10 tests'],
  ['Section 3', 'Bug Fix Verification', '10 tests'],
  ['Section 4', 'Regression Check', '5 tests'],
];
sections.forEach(([num, title, count]) => {
  doc.fillColor(RED).fontSize(10).font('Helvetica-Bold').text(num + '  ', 60, doc.y, { continued: true });
  doc.fillColor(DARK).font('Helvetica').text(title + '   ', { continued: true });
  doc.fillColor(MUTED).fontSize(9).text(count);
  doc.moveDown(0.4);
});

hRule(doc.y + 8);
doc.moveDown(1);
doc.fillColor(MUTED).fontSize(9).font('Helvetica')
  .text('Instructions: For each test, circle or highlight PASS or FAIL. Record tester initials and date in the Notes field. All tests must pass before deployment.', 60, doc.y, { width: W });

doc.moveDown(1.5);
doc.rect(60, doc.y, W, 60).fill(LIGHT).strokeColor(LINE).lineWidth(0.5).stroke();
const infoY = doc.y + 10;
doc.fillColor(MUTED).fontSize(9).font('Helvetica-Bold').text('Tester Name:', 70, infoY);
doc.fillColor(DARK).fontSize(9).font('Helvetica').text('_______________________________', 155, infoY);
doc.fillColor(MUTED).fontSize(9).font('Helvetica-Bold').text('Date Tested:', 70, infoY + 20);
doc.fillColor(DARK).fontSize(9).font('Helvetica').text('_______________________________', 155, infoY + 20);
doc.fillColor(MUTED).fontSize(9).font('Helvetica-Bold').text('Build / Version:', 70, infoY + 40);
doc.fillColor(DARK).fontSize(9).font('Helvetica').text('_______________________________', 155, infoY + 40);

doc.addPage();

// ════════════════════════════════════════════════════════════════════════════
// SECTION 1 — CUSTOMER DIGITAL APPROVAL
// ════════════════════════════════════════════════════════════════════════════
sectionHeader('1', 'CUSTOMER DIGITAL APPROVAL (Per-Item Approve/Decline)', RED);
overviewBox('Customers receive a share link to review their DVI inspection and approve or decline each individual repair item. Each decision is independently tracked and a timestamped digital signature is recorded before submission.');

// 1.1
testHeader('1.1', 'Share Link Generation');
step(1, 'Go to the Inspections module in the admin dashboard.');
step(2, 'Open any completed inspection that has at least one Fail or Attention item.');
step(3, 'Click the Share button (copy link icon) in the inspection detail panel.');
step(4, 'Confirm a share URL is generated in the format: https://[domain]/inspection/[token]');
step(5, 'Copy the link and open it in a private/incognito browser window (not logged in).');
expected('Page loads without requiring login. Shows shop logo, inspection number, vehicle info, customer name, and summary badge counts (Fail / Attention / Pass).');
passFailBar();

// 1.2
testHeader('1.2', 'Per-Item Decision Buttons');
step(1, 'On the public share page, scroll to the red-bordered "Action Required" section.');
step(2, 'Confirm each Fail and Attention item has exactly two buttons: "Approve Repair" and "Not Now".');
step(3, 'Click "Approve Repair" on one item — button should turn solid green.');
step(4, 'Click "Not Now" on a different item — button should turn solid red.');
step(5, 'Click the other button on an already-decided item — color should switch.');
expected('Each item tracks its own decision independently. Changing one item does not affect any other item\'s decision state.');
passFailBar();

// 1.3
testHeader('1.3', 'Validation Before Submit');
step(1, 'Leave at least one item undecided (neither button clicked).');
step(2, 'Click "Submit My Decision" button.');
expected('Error message shown: "Please approve or decline every highlighted item before submitting."');
step(3, 'Now decide all items, but clear the Name/Signature field completely.');
step(4, 'Click Submit again.');
expected('Error message shown: "Please enter your name to confirm your decision."');
passFailBar();

// 1.4
testHeader('1.4', 'Successful Submission — All Approved');
step(1, 'Click "Approve Repair" on ALL action items.');
step(2, 'Type your full name in the signature field (e.g. "Test Customer").');
step(3, 'Optionally type a message in the "Message to Shop" field.');
step(4, 'Click "Submit My Decision".');
expected('Confirmation banner appears immediately (no page reload required) with: green border/icon, "All repairs approved", your name, timestamp of submission, and the full list of approved items.');
passFailBar();

// 1.5
testHeader('1.5', 'Successful Submission — Partial Approval');
step(1, 'Open a fresh share link (use a different inspection or clear DB entry).');
step(2, 'Approve some items and decline others (mix of decisions).');
step(3, 'Enter name and click Submit.');
expected('Confirmation shows "Some repairs approved" with orange/partial color. Approved items listed in green, declined items listed in red.');
passFailBar();

// 1.6
testHeader('1.6', 'Successful Submission — All Declined');
step(1, 'Click "Not Now" on ALL action items.');
step(2, 'Enter name and click Submit.');
expected('Confirmation shows "All repairs declined" with red border.');
passFailBar();

// 1.7
testHeader('1.7', 'No Re-Submission Possible');
step(1, 'After submitting an approval, reload the public page (F5 or Ctrl+R).');
step(2, 'Observe the page state after reload.');
expected('Confirmation banner re-appears immediately (data pre-loaded from database). The approve/decline form is NOT shown. Cannot submit again.');
passFailBar();

// 1.8
testHeader('1.8', 'Approval Status Visible in Admin Panel');
step(1, 'After customer submits approval, go to Inspections module in admin dashboard.');
step(2, 'Open the same inspection that was just approved.');
step(3, 'Look at the approval banner in the detail panel.');
expected('Green/orange/red banner shows: decision label, signer name, timestamp, and approved/declined item list. Inspection status chip updated to "Customer Approved", "Partially Approved", or "Customer Declined" accordingly.');
passFailBar();

doc.addPage();

// ════════════════════════════════════════════════════════════════════════════
// SECTION 2 — LIVE REPAIR STATUS TRACKER
// ════════════════════════════════════════════════════════════════════════════
sectionHeader('2', 'LIVE REPAIR STATUS TRACKER (6 Stages + SMS / Email Notifications)', BLUE);
overviewBox('Each job card can have a public status tracker link shared with the customer. Shop staff advance through 6 stages in order. Customers see live updates and can receive SMS/email notifications at each stage advance. Page auto-refreshes every 30 seconds.');

// 2.1
testHeader('2.1', 'Initialize Status Tracker');
step(1, 'Go to Job Cards module.');
step(2, 'Click on any active job card row to open the detail drawer on the right.');
step(3, 'Click the "Status Tracker" button (orange, in the action buttons at the bottom).');
expected('Status Tracker panel opens. A customer share URL is generated immediately. Stage progress shows "Checked In" as the active current stage with an orange circle indicator.');
passFailBar();

// 2.2
testHeader('2.2', 'Share URL Copy');
step(1, 'In the tracker panel, click "Copy Link" button.');
expected('Button changes to "Copied!" for ~2.5 seconds then reverts. URL is in clipboard.');
step(2, 'Paste the URL and open it in a new browser tab (no login).');
expected('Public status page loads with: red shop header, vehicle/customer info card, current stage hero card with icon, and 6-step progress tracker.');
passFailBar();

// 2.3
testHeader('2.3', 'Customer Page — Stage Display Accuracy');
step(1, 'On the public status page, check the hero card shows the correct stage icon and label.');
step(2, 'Confirm the plain-English stage description appears below the label.');
step(3, 'Check the progress bar shows correct completion percentage (e.g. 1 of 6 = ~16%).');
step(4, 'Confirm the active stage row in the tracker list shows the "NOW" badge.');
expected('All stage information on the customer page matches exactly what is set in admin panel.');
passFailBar();

// 2.4
testHeader('2.4', 'Advance Stage (Without Notifications)');
step(1, 'In the admin tracker panel, leave SMS and Email checkboxes unchecked.');
step(2, 'Click the Advance button to move to "Being Inspected".');
expected('Stage progress in the admin panel updates immediately — "Being Inspected" is now active (orange), previous stage shows green checkmark and timestamp.');
step(3, 'Reload the public customer page.');
expected('Customer page now shows "Being Inspected" as the current stage. Hero card and progress bar updated.');
passFailBar();

// 2.5
testHeader('2.5', 'Stage Notification via SMS');
step(1, 'In the tracker panel, check the "SMS" checkbox.');
step(2, 'Enter a phone number in E.164 format (e.g. +1 555 000 0000).');
step(3, 'Click Advance to the next stage.');
expected('If Twilio env vars are configured: notification result shows "SMS sent" with checkmark. Customer receives SMS with shop name, stage description, and tracker link.\nIf Twilio is not yet configured: shows "Twilio not configured (missing env vars)". No crash or error thrown.');
passFailBar();

// 2.6
testHeader('2.6', 'Stage Notification via Email');
step(1, 'Check the "Email" checkbox.');
step(2, 'Enter a valid email address.');
step(3, 'Advance to the next stage.');
expected('Notification result shows "Email sent" with checkmark. Customer receives HTML-formatted email with shop branding (red header), stage name, plain-English description, and a "Track Your Repair Live" button linking to the public status page.');
passFailBar();

// 2.7
testHeader('2.7', 'Notification State Resets Between Jobs');
step(1, 'Open tracker for Job A. Check the SMS checkbox and enter a phone number.');
step(2, 'Close the tracker panel (X button).');
step(3, 'Open a different Job B\'s tracker.');
expected('SMS and Email checkboxes are unchecked. Phone and email fields show Job B\'s customer contact info (or blank if none) — NOT Job A\'s values.');
passFailBar();

// 2.8
testHeader('2.8', 'Auto-Refresh on Customer Page');
step(1, 'Open the public customer status page in a browser tab.');
step(2, 'In the admin panel, advance the stage for that job.');
step(3, 'Watch the customer page without manually refreshing. Wait up to 30 seconds.');
expected('Page automatically updates to show the new stage. Hero card briefly pulses/scales to indicate the change. "Updated [time]" timestamp in the header refreshes.');
passFailBar();

// 2.9
testHeader('2.9', 'Ready for Pickup — Final Stage');
step(1, 'Advance through all stages until "Ready for Pickup" is selected.');
expected('On the customer page: header bar turns green (from red). Hero card shows green gradient. "Call [Shop Name]" phone button appears. Progress bar is 100% filled. "NOW" badge is on the last stage. Stage icon shows celebration emoji.');
passFailBar();

// 2.10
testHeader('2.10', 'Stage History with Timestamps');
step(1, 'After advancing through multiple stages (with and without notifications), open the tracker panel.');
step(2, 'Inspect the Current Progress timeline.');
expected('Each completed stage shows its exact timestamp. Stages where SMS was sent show a phone icon. Stages where email was sent show an envelope icon. History persists after panel close and reopen.');
passFailBar();

doc.addPage();

// ════════════════════════════════════════════════════════════════════════════
// SECTION 3 — BUG FIX VERIFICATION
// ════════════════════════════════════════════════════════════════════════════
sectionHeader('3', 'BUG FIX VERIFICATION', '#5D1A1A');
overviewBox('These tests confirm that specific bugs previously identified in production are fully resolved. Each test maps directly to a reported defect. All 10 must pass before the build is considered stable.');

// 3.1
testHeader('3.1', 'DVI Technician Dropdown Shows Names (Not Emails)');
step(1, 'Go to Inspections module.');
step(2, 'Click "New Inspection" or open an existing one for editing.');
step(3, 'Click the Technician dropdown to open it.');
expected('Names are displayed in Title Case (e.g. "John Smith") NOT raw email addresses (NOT "john.smith@shop.com"). If no dedicated name exists, email prefix is formatted to title case automatically.');
passFailBar();

// 3.2
testHeader('3.2', 'Invoice Save Succeeds at Any Location');
step(1, 'Sign in as a user at a non-primary location (e.g. Location 2).');
step(2, 'Go to Invoicing module and click Create Invoice.');
step(3, 'Fill in customer, vehicle, and at least one line item.');
step(4, 'Click Save.');
expected('Invoice saves successfully. Invoice number is unique and continues the global sequence (e.g. INV-0003, not INV-0001). No "Save failed" error appears.');
note('Previously, Location 2 users always got INV-0001 due to a shop_id scoping bug in nextInvoiceNumber().');
passFailBar();

// 3.3
testHeader('3.3', 'DVI Inspection Number Uses MAX Not COUNT');
step(1, 'Note the current highest inspection number shown in the list (e.g. DVI-0005).');
step(2, 'Delete any inspection that is NOT the highest-numbered one.');
step(3, 'Click "New Inspection" to create a new one.');
expected('New inspection receives number DVI-0006 (highest existing + 1). It does NOT reuse or lower the number based on current record count.');
note('Bug: Previously used COUNT(*) which caused number regression after any deletion.');
passFailBar();

// 3.4
testHeader('3.4', 'DVI Multi-Photo Upload Saves All Photos');
step(1, 'Open any DVI inspection and navigate to a checklist item.');
step(2, 'Upload a photo for Item A. Wait for upload to complete.');
step(3, 'Without navigating away, upload a different photo for Item B.');
step(4, 'Save the inspection.');
step(5, 'Close and reopen the inspection.');
expected('Both photos are visible and associated with their correct items. Uploading the second photo did NOT overwrite or remove the first photo.');
note('Bug: stale closure in photo upload handler caused the first photo to be lost when a second was uploaded.');
passFailBar();

// 3.5
testHeader('3.5', 'DVI Edit Saves Vehicle and VIN Fields');
step(1, 'Open an existing DVI inspection.');
step(2, 'Edit the Vehicle field (e.g. change "2020 Honda Civic" to "2021 Toyota Camry").');
step(3, 'Edit the VIN field.');
step(4, 'Click Save.');
step(5, 'Close the panel and reopen the same inspection.');
expected('Vehicle and VIN fields reflect the new values. Changes are NOT reverted to pre-edit data. Customer name and other fields are also unchanged.');
passFailBar();

// 3.6
testHeader('3.6', 'Delete Inspection — Detail Panel Updates Correctly');
step(1, 'With at least 3 inspections in the list, click to select the 2nd or 3rd one in the list.');
step(2, 'Click the Delete button and confirm.');
expected('The detail panel either: (a) closes cleanly, OR (b) shows an adjacent inspection from the remaining list. The panel does NOT remain open showing stale data from the deleted inspection.');
passFailBar();

// 3.7
testHeader('3.7', 'Approval Confirmation Shows Correct Signer Immediately');
step(1, 'Open a fresh DVI inspection share link in an incognito window.');
step(2, 'Approve or decline all items.');
step(3, 'In the Name/Signature field, type exactly: Test Customer');
step(4, 'Click Submit.');
expected('Immediately after submit (NO page reload): confirmation banner shows "Submitted by Test Customer" and a valid timestamp (not "undefined", not blank, not a future or past date).');
note('Bug: After fresh submit, existingApproval was null so the banner showed "Submitted by undefined". Fixed by storing localApproval state on submit.');
passFailBar();

// 3.8
testHeader('3.8', 'Payment Amount Field — No Leading Zero');
step(1, 'Go to Payments module.');
step(2, 'Click "Record Payment" to open the form.');
step(3, 'Click into the Amount field. It should be empty with a "0.00" placeholder.');
step(4, 'Type the number: 55');
expected('Field shows "55" — NOT "055". No leading zero is prepended before typed digits.');
step(5, 'Clear the field completely.');
expected('Field shows empty or placeholder. Attempting to submit at $0 still triggers validation error.');
passFailBar();

// 3.9
testHeader('3.9', 'Payment Methods — All Digital Wallets Available');
step(1, 'Go to Payments → click Record Payment to open the form.');
step(2, 'Open the Payment Method dropdown.');
step(3, 'Scroll through all options and verify the following are present in the Digital group:');
checkboxRow('PayPal');
checkboxRow('Apple Pay');
checkboxRow('Google Pay');
checkboxRow('Venmo');
checkboxRow('Zelle');
checkboxRow('Cash App');
checkboxRow('Wise');
step(4, 'Also confirm Bank Transfer / ACH is present in the Bank group.');
expected('All 7 digital wallet methods visible without enabling anything in settings. Bank Transfer also visible.');
passFailBar();

// 3.10
testHeader('3.10', 'Status Tracker Stage History Icon Field');
step(1, 'Open a job card that has NEVER had a status tracker opened before (statusToken is null).');
step(2, 'Click "Status Tracker" to initialize it for the first time.');
step(3, 'In the stage history timeline in the tracker panel, locate the "Checked In" entry.');
expected('The "Checked In" history entry shows the clipboard icon (emoji) correctly. The icon field is NOT missing, undefined, or blank.');
note('Bug: PUT initialization route created the first history entry without an icon field, causing a mismatch with the StageHistoryEntry interface.');
passFailBar();

doc.addPage();

// ════════════════════════════════════════════════════════════════════════════
// SECTION 4 — REGRESSION CHECK
// ════════════════════════════════════════════════════════════════════════════
sectionHeader('4', 'REGRESSION CHECK', '#1B5E20');
overviewBox('These tests verify that the new features and bug fixes did not break existing functionality. Run after all Section 1–3 tests pass. Focus on core workflows that interact with modified code paths.');

// 4.1
testHeader('4.1', 'Job Card Create and Approve Flow');
step(1, 'Go to Job Cards → Create Job Card.');
step(2, 'Fill in Customer, Vehicle, Service Type, and at least one Technician.');
step(3, 'Click "Create Job Card".');
expected('Job card created and appears in the Active Jobs list with a unique ID.');
step(4, 'Click the new job card row, then click "Approve" in the action buttons.');
expected('Status changes to "Approved". Workflow bar updates. No errors.');
passFailBar();

// 4.2
testHeader('4.2', 'Invoice Create and Save — Primary Location');
step(1, 'Sign in as the primary/first location user.');
step(2, 'Go to Invoicing → Create Invoice.');
step(3, 'Add customer, vehicle, and at least one line item with qty and rate.');
step(4, 'Click Save.');
expected('Invoice saves without error. Gets a sequential invoice number. Appears in the invoice list.');
passFailBar();

// 4.3
testHeader('4.3', 'Full DVI Round Trip: Create → Share → Approve → Admin View');
step(1, 'Create a new DVI inspection with at least one Fail item. Mark it Complete.');
step(2, 'Generate the share link.');
step(3, 'Open the share link in incognito. Submit an approval decision.');
step(4, 'Return to admin dashboard and open the inspection.');
expected('Approval banner is visible in the inspection detail. Status chip shows "Customer Approved" or "Partially Approved". Signer name and timestamp are correct.');
passFailBar();

// 4.4
testHeader('4.4', 'Payments — Edit and Delete');
step(1, 'Open an existing payment record and click Edit.');
step(2, 'Change the amount to a new value. Click Save Changes.');
expected('Updated amount is shown in the register. Subtotal updates accordingly.');
step(3, 'Delete a payment record.');
expected('Payment is removed from the list. Running subtotal decreases by the deleted amount.');
passFailBar();

// 4.5
testHeader('4.5', 'Status Tracker Does Not Corrupt Job Card Data');
step(1, 'Open a job card and note its Customer, Vehicle, Service Type, Technicians, and Approval status.');
step(2, 'Open the Status Tracker for that job card. Advance 2 stages.');
step(3, 'Close the tracker panel.');
step(4, 'Reopen the same job card detail drawer.');
expected('Customer, Vehicle, Service Type, Technicians, and Approval status are ALL unchanged. The stage tracker only modified repair_stage, stage_history, and status_token — no other job card data was affected.');
passFailBar();

// ── Summary table ─────────────────────────────────────────────────────────
doc.addPage();
doc.fontSize(14).font('Helvetica-Bold').fillColor(DARK).text('TEST SUMMARY SIGN-OFF', 60, 60);
hRule(82);
doc.moveDown(1);

const tableHeaders = ['Test ID', 'Description', 'P', 'F', 'Initials'];
const tableWidths  = [58, W - 180, 36, 36, 50];
const tableX       = 60;
let ty = doc.y;

// Header row
doc.rect(tableX, ty, W, 20).fill('#CC0000');
let tx = tableX;
tableHeaders.forEach((h, i) => {
  doc.fillColor('#FFFFFF').fontSize(9).font('Helvetica-Bold').text(h, tx + 4, ty + 5, { width: tableWidths[i] - 4 });
  tx += tableWidths[i];
});
ty += 20;

const allTests = [
  ['1.1', 'Share Link Generation'],
  ['1.2', 'Per-Item Decision Buttons'],
  ['1.3', 'Validation Before Submit'],
  ['1.4', 'Submission — All Approved'],
  ['1.5', 'Submission — Partial Approval'],
  ['1.6', 'Submission — All Declined'],
  ['1.7', 'No Re-Submission Possible'],
  ['1.8', 'Approval Status in Admin Panel'],
  ['2.1', 'Initialize Status Tracker'],
  ['2.2', 'Share URL Copy'],
  ['2.3', 'Customer Page Stage Display'],
  ['2.4', 'Advance Stage (No Notification)'],
  ['2.5', 'SMS Notification'],
  ['2.6', 'Email Notification'],
  ['2.7', 'Notification State Resets Between Jobs'],
  ['2.8', 'Auto-Refresh on Customer Page'],
  ['2.9', 'Ready for Pickup — Final Stage'],
  ['2.10', 'Stage History with Timestamps'],
  ['3.1', 'DVI Tech Dropdown Shows Names'],
  ['3.2', 'Invoice Save at Any Location'],
  ['3.3', 'DVI Number Uses MAX Not COUNT'],
  ['3.4', 'Multi-Photo Upload Saves All Photos'],
  ['3.5', 'DVI Edit Saves Vehicle / VIN'],
  ['3.6', 'Delete — Detail Panel Updates'],
  ['3.7', 'Approval Confirmation Shows Correct Signer'],
  ['3.8', 'Payment Amount No Leading Zero'],
  ['3.9', 'All Digital Payment Methods Present'],
  ['3.10', 'Stage History Icon Field Present'],
  ['4.1', 'Job Card Create & Approve Flow'],
  ['4.2', 'Invoice Create & Save — Primary Location'],
  ['4.3', 'Full DVI Round Trip'],
  ['4.4', 'Payments — Edit and Delete'],
  ['4.5', 'Status Tracker Does Not Corrupt Job Card'],
];

allTests.forEach((row, i) => {
  const rowBg = i % 2 === 0 ? '#FFFFFF' : '#F9F9F9';
  doc.rect(tableX, ty, W, 16).fill(rowBg);
  tx = tableX;
  [row[0], row[1], '', '', ''].forEach((cell, ci) => {
    if (ci >= 2) {
      doc.rect(tx + 6, ty + 3, 22, 10).strokeColor('#BBBBBB').lineWidth(0.4).stroke();
    } else {
      doc.fillColor(ci === 0 ? RED : DARK).fontSize(8)
        .font(ci === 0 ? 'Helvetica-Bold' : 'Helvetica')
        .text(cell, tx + 4, ty + 4, { width: tableWidths[ci] - 6 });
    }
    tx += tableWidths[ci];
  });
  ty += 16;
  if (ty > doc.page.height - 80 && i < allTests.length - 1) {
    doc.addPage();
    ty = 60;
  }
});

// Bottom sign-off
doc.moveDown(2);
const soY = doc.y + 10;
hRule(soY);
doc.fillColor(DARK).fontSize(10).font('Helvetica-Bold').text('Final Sign-Off', 60, soY + 12);
doc.fontSize(9).font('Helvetica').fillColor(MUTED);
doc.text('QA Lead: ________________________________   Date: ______________   Signature: ________________________', 60, soY + 30, { width: W });
doc.text('Dev Lead: _______________________________   Date: ______________   Signature: ________________________', 60, soY + 50, { width: W });

// ── Page numbers ─────────────────────────────────────────────────────────
addPageNum();

doc.end();
console.log('PDF written to:', OUT);
