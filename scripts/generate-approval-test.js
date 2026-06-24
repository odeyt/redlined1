/**
 * Customer Digital Approval — Test Procedures PDF
 * node scripts/generate-approval-test.js
 */
const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');

const doc = new PDFDocument({ size: 'A4', margin: 0, info: { Title: 'Customer Digital Approval — Test Procedures' } });
const out = path.join(__dirname, '..', 'Approval-Test-Procedures.pdf');
doc.pipe(fs.createWriteStream(out));

const RED = '#CC0000', DARK = '#1a1a1a', GREY = '#555', WHITE = '#ffffff';
const GREEN = '#2e7d32', ORANGE = '#e65100', BLUE = '#1565c0', PURPLE = '#6a1b9a';
const PW = 595.28, ML = 48, MR = PW - 48, TW = MR - ML;

let y = 0, pageNum = 0, stepNum = 0;

function newPage() {
  if (pageNum > 0) doc.addPage({ size: 'A4', margin: 0 });
  pageNum++;
  doc.rect(0, 0, PW, 36).fillColor(RED).fill();
  doc.fontSize(11).fillColor(WHITE).font('Helvetica-Bold')
     .text('D1 Imports — Customer Digital Approval Test Procedures', ML, 12, { width: TW - 80 });
  doc.fontSize(9).fillColor(WHITE).font('Helvetica')
     .text(`Page ${pageNum}`, MR - 40, 14, { width: 40, align: 'right' });
  y = 52;
}

function checkY(h) { if (y + h > 810) newPage(); }

function sectionHeader(title, sub) {
  checkY(44);
  doc.rect(ML, y, TW, 26).fillColor('#f0f0f0').fill();
  doc.rect(ML, y, 4, 26).fillColor(RED).fill();
  doc.fontSize(12).fillColor(RED).font('Helvetica-Bold').text(title, ML + 12, y + 7, { width: TW - 180 });
  if (sub) doc.fontSize(8.5).fillColor(GREY).font('Helvetica').text(sub, MR - 170, y + 9, { width: 166, align: 'right' });
  y += 32;
}

function subHeader(text, color) {
  checkY(20);
  doc.fontSize(9.5).fillColor(color || BLUE).font('Helvetica-Bold').text(text, ML, y);
  y += 15;
}

function step(action, expected, note, role) {
  stepNum++;
  const noteH = note ? 14 : 0;
  const roleH = role ? 12 : 0;
  const rowH = Math.max(44, noteH + roleH + 34);
  checkY(rowH + 4);

  const bg = stepNum % 2 === 0 ? '#fafafa' : WHITE;
  doc.rect(ML, y, TW, rowH).fillColor(bg).fill();
  doc.rect(ML, y, TW, rowH).lineWidth(0.4).strokeColor('#e0e0e0').stroke();
  doc.rect(ML, y, 26, rowH).fillColor(RED + '18').fill();
  doc.fontSize(9).fillColor(RED).font('Helvetica-Bold')
     .text(String(stepNum), ML, y + rowH / 2 - 5, { width: 26, align: 'center' });

  if (role) {
    const roleColor = role === 'SHOP' ? BLUE : role === 'CUSTOMER' ? GREEN : PURPLE;
    const roleLabel = role === 'SHOP' ? '🏪 SHOP' : role === 'CUSTOMER' ? '📱 CUSTOMER' : '🔍 VERIFY';
    doc.fontSize(7).fillColor(roleColor).font('Helvetica-Bold')
       .text(roleLabel, ML + 30, y + 4, { width: TW - 56 });
  }

  const textY = y + (role ? 14 : 6);
  const colW = (TW - 30) / 2;
  doc.fontSize(8.5).fillColor(DARK).font('Helvetica-Bold').text('ACTION', ML + 30, textY, { width: colW - 4 });
  doc.fontSize(8.5).fillColor(DARK).font('Helvetica').text(action, ML + 30, textY + 10, { width: colW - 8 });
  doc.fontSize(8.5).fillColor(DARK).font('Helvetica-Bold').text('EXPECTED', ML + 30 + colW, textY, { width: colW - 4 });
  doc.fontSize(8.5).fillColor(GREEN).font('Helvetica').text(expected, ML + 30 + colW, textY + 10, { width: colW - 8 });

  if (note) {
    doc.fontSize(7.5).fillColor(ORANGE).font('Helvetica-Oblique')
       .text('⚠ ' + note, ML + 30, y + rowH - 12, { width: TW - 56 });
  }

  doc.rect(MR - 14, y + rowH / 2 - 5, 11, 11).lineWidth(1).strokeColor('#bbb').stroke();
  y += rowH + 3;
}

function infoBox(text, color, bg) {
  checkY(28);
  doc.rect(ML, y, TW, 22).fillColor(bg || '#fff8e1').fill();
  doc.rect(ML, y, TW, 22).lineWidth(0.4).strokeColor(color || '#ffe082').stroke();
  doc.fontSize(8.5).fillColor(color || ORANGE).font('Helvetica').text(text, ML + 10, y + 7, { width: TW - 20 });
  y += 28;
}

function gap(h) { y += h || 8; }

// ════════════════════════════════════════════════════════
newPage();

// Title
doc.fontSize(22).fillColor(RED).font('Helvetica-Bold').text('Customer Digital Approval', ML, y);
y += 26;
doc.fontSize(13).fillColor(DARK).font('Helvetica').text('Feature Test Procedures — Tester\'s Copy', ML, y);
y += 16;
doc.fontSize(9).fillColor(GREY).font('Helvetica')
   .text('System: D1 Imports CRM (redlined1.com)   |   Feature: Customer Approval via Share Link   |   Date: June 2026', ML, y);
y += 16;
doc.moveTo(ML, y).lineTo(MR, y).lineWidth(1.5).strokeColor(RED).stroke();
y += 12;

infoBox('ROLES:  🏪 SHOP = actions taken inside the CRM (logged-in owner/staff)   |   📱 CUSTOMER = actions on the public share link (no login)   |   🔍 VERIFY = check the result in both views', DARK, '#f5f5f5');
infoBox('PREREQUISITE: Run SQL migration before testing — ALTER TABLE inspections ADD COLUMN IF NOT EXISTS customer_approval JSONB;', ORANGE, '#fff8e1');
gap(4);

// ── SECTION 1 ────────────────────────────────────────────
sectionHeader('SECTION 1 — Setup: Create a Testable Inspection', 'Must have at least 1 Fail or Attention item');

subHeader('1.1  Log In & Create Inspection', BLUE);
step('Log in as Owner at redlined1.com. Navigate to Inspections → click "+ New DVI".',
     'New DVI form opens. Inspection number auto-assigned (e.g. DVI-0001).', null, 'SHOP');
step('Fill in: Customer Name = "Test Customer", Vehicle = "2020 Toyota Camry", Customer Email = your test email.',
     'Fields accept input. No validation errors.', null, 'SHOP');
step('In the checklist, set Front brake pads → Fail, add note "Metal on metal".',
     'Button highlights red. Notes field appears and accepts text.', null, 'SHOP');
step('Set Rear brake pads → Attention, add note "~2mm remaining".',
     'Button highlights orange. Notes field appears.', null, 'SHOP');
step('Set all remaining items → Pass or N/A.',
     'Checklist fully filled. No items left unset.', null, 'SHOP');
step('Click "Create Inspection".',
     'Form closes. New inspection appears in list with status "In Progress". Detail panel shows 1 Fail, 1 Attention badges.', null, 'SHOP');

gap();

// ── SECTION 2 ────────────────────────────────────────────
sectionHeader('SECTION 2 — Generate Share Link', 'Shop sends link to customer');

subHeader('2.1  Generate & Copy Link', BLUE);
step('With the inspection selected, click "🔗 Share Link" in the action bar.',
     'Button shows "…" briefly. A purple URL bar appears below the action bar showing the full share URL.', null, 'SHOP');
step('Verify the URL format in the purple bar.',
     'URL matches pattern: https://redlined1.com/inspection/[32-character-token]', null, 'VERIFY');
step('Click the "Copy" button in the URL bar.',
     'Button changes to "✓ Copied!" for 3 seconds. URL is copied to clipboard.', null, 'SHOP');
step('Click "🔗 Share Link" a second time on the same inspection.',
     'Same URL returned — no new token generated. Existing link reused.', 'Token is permanent once created. Customer can reopen the same link anytime.', 'VERIFY');

gap();

// ── SECTION 3 ────────────────────────────────────────────
sectionHeader('SECTION 3 — Customer Views the Share Page', 'Open link on phone or incognito browser');

subHeader('3.1  Public Page Load', GREEN);
step('Paste the share URL into a new browser tab or incognito window (simulates customer phone).',
     'Page loads WITHOUT any login prompt. Shows shop logo/name in red header bar.', 'Test in incognito to confirm no session cookie is used.', 'CUSTOMER');
step('Verify the inspection info card at the top of the page.',
     'Shows: Inspection number, customer name, vehicle, date, and technician name correctly.', null, 'CUSTOMER');
step('Check the 3 summary badges (Fail / Attention / Pass).',
     'Fail = 1 (red), Attention = 1 (orange), Pass count matches items set to Pass. Numbers are correct.', null, 'CUSTOMER');

subHeader('3.2  Action Required Card', GREEN);
step('Observe the red-bordered "⚠️ Action Required" card below the summary badges.',
     'Card is visible. Heading reads "Action Required". Short description tells customer to review and approve/decline each repair.', null, 'CUSTOMER');
step('Verify only Fail and Attention items appear in the approval card (not Pass or N/A items).',
     'Exactly 2 items shown: "Front brake pads" (Fail) and "Rear brake pads" (Attention). Pass items not listed.', null, 'CUSTOMER');
step('Check each item card shows: item name, status label (colour-coded), technician notes, and photo if uploaded.',
     'Front brake pads shows red "FAIL" label and note "Metal on metal". Rear shows orange "ATTENTION" and note "~2mm remaining".', null, 'CUSTOMER');
step('Confirm each item has two buttons: "✓ Approve Repair" and "✗ Not Now".',
     'Both buttons visible per item. No button is pre-selected (neither highlighted).', null, 'CUSTOMER');

gap();

// ── SECTION 4 ────────────────────────────────────────────
sectionHeader('SECTION 4 — Customer Makes Decisions (Per Item)', 'Test all 3 decision scenarios');

subHeader('4.1  Approve All', GREEN);
step('Click "✓ Approve Repair" on Front brake pads.',
     'Button turns solid green. Card background shifts to light green. "✗ Not Now" deselects.', null, 'CUSTOMER');
step('Click "✓ Approve Repair" on Rear brake pads.',
     'Same green highlight. Both items now approved.', null, 'CUSTOMER');
step('Enter "John Smith" in the "Your Full Name" field.',
     'Text appears in the serif font field. Label reads "(serves as your digital signature)".', null, 'CUSTOMER');
step('Optionally type a message: "Please call me before starting."',
     'Message textarea accepts input.', null, 'CUSTOMER');
step('Click "Submit My Decision →".',
     'Button shows "Submitting…" briefly. Page transitions to a green confirmation banner showing: "✅ All repairs approved ✓", signer name "John Smith", timestamp, and list of approved items.', null, 'CUSTOMER');

subHeader('4.2  Verify Confirmation State', GREEN);
step('Reload the share URL in the browser.',
     'Confirmation banner still shown — not the approval form. Page remembers the decision was already submitted.', 'Reloading must not allow re-submission.', 'CUSTOMER');
step('Attempt to submit again by reloading and looking for the form.',
     'Approval form is gone. Only the confirmation banner with the original signer and timestamp is shown.', null, 'CUSTOMER');

gap();
newPage();

subHeader('4.3  Partial Approval (New Inspection Required)', GREEN);
step('Back in CRM: create a second test inspection (DVI-0002) with at least 2 Fail/Attention items. Generate its share link.',
     'New share link generated. Copy to clipboard.', null, 'SHOP');
step('Open the new share link. Click "✓ Approve Repair" on item 1. Click "✗ Not Now" on item 2.',
     'Item 1 card turns green. Item 2 card turns red. Both have clear visual state.', null, 'CUSTOMER');
step('Enter name "Jane Doe" and submit.',
     'Confirmation shows: "⚡ Some repairs approved" in orange. Approved items listed in green. Declined items listed in red.', null, 'CUSTOMER');

subHeader('4.4  Decline All (New Inspection Required)', GREEN);
step('Create a third test inspection (DVI-0003). Generate its share link.',
     'New share link available.', null, 'SHOP');
step('Open link. Click "✗ Not Now" on ALL items. Enter name "Bob Jones" and submit.',
     'Confirmation shows: "🚫 All repairs declined" in red. Signer name and timestamp recorded.', null, 'CUSTOMER');

subHeader('4.5  Validation — Missing Name', GREEN);
step('Create a 4th inspection share link. Open it. Approve/decline items but leave the Name field blank. Click "Submit My Decision →".',
     'Error message appears: "Please enter your name to confirm your decision." Form does NOT submit.', null, 'CUSTOMER');
step('Leave name filled but leave 1 item undecided (no approve or decline selected). Click submit.',
     'Error: "Please approve or decline every highlighted item before submitting." Form does not submit.', null, 'CUSTOMER');

gap();

// ── SECTION 5 ────────────────────────────────────────────
sectionHeader('SECTION 5 — Shop Sees Approval in CRM', 'Verify the approval panel in the DVI detail view');

subHeader('5.1  Approve All Result (DVI-0001)', BLUE);
step('In the CRM, navigate to Inspections. Click on DVI-0001 in the list.',
     'Detail panel loads. Status in the list badge now reads "Customer Approved" in green.', null, 'SHOP');
step('Scroll to the approval banner in the detail panel (below the summary badges).',
     'Green banner shows: "✅ Customer Approved All Repairs". Below it: "Signed by John Smith · [date and time]".', null, 'VERIFY');
step('Verify the approved items list inside the banner.',
     '"Approved:" line lists both "Front brake pads" and "Rear brake pads".', null, 'VERIFY');
step('Check if the customer message appears in the banner.',
     'Italic block reads: "Please call me before starting."', null, 'VERIFY');

subHeader('5.2  Partial Approval Result (DVI-0002)', BLUE);
step('Click on DVI-0002 in the inspection list.',
     'Status badge shows "Partially Approved" in orange.', null, 'SHOP');
step('View the approval banner in the detail panel.',
     'Orange banner: "⚡ Customer Partially Approved". Approved items in green text. Declined items in red text. Signer "Jane Doe" with timestamp.', null, 'VERIFY');

subHeader('5.3  Decline All Result (DVI-0003)', BLUE);
step('Click on DVI-0003 in the inspection list.',
     'Status badge shows "Customer Declined" in red.', null, 'SHOP');
step('View the approval banner.',
     'Red banner: "🚫 Customer Declined Repairs". No approved items listed. All items shown under Declined.', null, 'VERIFY');

gap();

// ── SECTION 6 ────────────────────────────────────────────
sectionHeader('SECTION 6 — Status Filter & Sidebar Count', 'Verify new statuses integrate with existing filters');

step('In the Inspections list, use the Status dropdown to filter by "Customer Approved".',
     'Only DVI-0001 shown.', null, 'SHOP');
step('Filter by "Partially Approved".',
     'Only DVI-0002 shown.', null, 'SHOP');
step('Filter by "Customer Declined".',
     'Only DVI-0003 shown.', null, 'SHOP');
step('Select "All" to reset the filter.',
     'All inspections visible again.', null, 'SHOP');
step('Check the Inspections sidebar badge count.',
     'Count reflects total number of inspections across all statuses.', null, 'VERIFY');

gap();

// ── SECTION 7 ────────────────────────────────────────────
sectionHeader('SECTION 7 — Full Checklist Still Visible on Share Page', 'Approval card must not hide the rest of the report');

step('Open any share link that has been approved. Scroll past the confirmation banner.',
     '"Full Inspection Results" section is still visible below the banner — all items grouped by category with Pass/Fail/Attention dots.', null, 'CUSTOMER');
step('Verify items marked Pass in the CRM appear as Pass on the share page.',
     'Green dot and "Pass" label shown. No approval buttons on Pass/N/A items.', null, 'CUSTOMER');
step('Click the Print button in the red header bar.',
     'Browser print dialog opens. Report layout prints cleanly — includes checklist and approval confirmation.', null, 'CUSTOMER');

gap();

// ── SECTION 8 ────────────────────────────────────────────
sectionHeader('SECTION 8 — Edge Cases', 'Boundary and error conditions');

step('Open a share link for an inspection that has NO Fail or Attention items (all Pass/N/A).',
     'No "Action Required" card shown. Only the full results checklist visible. No approval form presented.', 'Approval is only shown when actionable items exist.', 'CUSTOMER');
step('Try accessing a share link with an invalid/made-up token (e.g. /inspection/AAABBBCCC).',
     'Page shows error state: "🔍 Inspection Not Found" message. No crash.', null, 'CUSTOMER');
step('Generate a share link, then delete the inspection from the CRM, then open the share link.',
     'Page shows "Inspection Not Found". Deleted records not accessible via share link.', null, 'VERIFY');

gap();

// Sign-off
checkY(80);
doc.rect(ML, y, TW, 72).fillColor('#f9fafb').fill();
doc.rect(ML, y, TW, 72).lineWidth(0.5).strokeColor('#e0e0e0').stroke();
doc.rect(ML, y, 4, 72).fillColor(GREEN).fill();
doc.fontSize(10).fillColor(GREEN).font('Helvetica-Bold').text('TEST COMPLETION SIGN-OFF', ML + 12, y + 10);
doc.fontSize(8.5).fillColor(DARK).font('Helvetica')
   .text(`Total Steps: ${stepNum}   |   Sections: 8   |   Estimated Time: 30–40 minutes`, ML + 12, y + 24);
doc.fontSize(8.5).fillColor(GREY).font('Helvetica')
   .text('Tester Name: ___________________________    Date: _________________    Pass / Fail: _________', ML + 12, y + 38);
doc.fontSize(8.5).fillColor(GREY).font('Helvetica')
   .text('Signature:    ___________________________    Notes: ________________________________________________', ML + 12, y + 52);
y += 80;

gap(10);
doc.fontSize(7.5).fillColor('#aaa').font('Helvetica')
   .text('D1 Imports CRM · redlined1.com · Customer Digital Approval Feature · June 2026', ML, y, { width: TW, align: 'center' });

doc.end();
console.log('Generated:', out);
console.log('Total steps:', stepNum);
