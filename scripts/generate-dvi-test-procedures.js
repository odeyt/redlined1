/**
 * DVI / Digital Vehicle Inspection — Test Procedures PDF
 * node scripts/generate-dvi-test-procedures.js
 */
const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');

const doc = new PDFDocument({ size: 'A4', margin: 0, info: { Title: 'DVI Test Procedures — D1 Imports' } });
const out = path.join(__dirname, '..', 'DVI-Test-Procedures.pdf');
doc.pipe(fs.createWriteStream(out));

// ── Design tokens ─────────────────────────────────────────────────────────
const RED    = '#CC0000';
const DARK   = '#1a1a1a';
const GREY   = '#555555';
const LGREY  = '#f5f5f5';
const GREEN  = '#2e7d32';
const ORANGE = '#e65100';
const BLUE   = '#1565c0';
const WHITE  = '#ffffff';
const PW = 595.28;
const ML = 48, MR = PW - 48, TW = MR - ML;

let y = 0;
let pageNum = 0;
const totalPages = 3; // estimated; updated in footer

// ── Helpers ───────────────────────────────────────────────────────────────
function newPage() {
  if (pageNum > 0) doc.addPage({ size: 'A4', margin: 0 });
  pageNum++;
  // Header bar
  doc.rect(0, 0, PW, 36).fillColor(RED).fill();
  doc.fontSize(11).fillColor(WHITE).font('Helvetica-Bold')
     .text('D1 Imports — Digital Vehicle Inspection (DVI) Test Procedures', ML, 12, { width: TW - 80 });
  doc.fontSize(9).fillColor(WHITE).font('Helvetica')
     .text(`Page ${pageNum}`, MR - 40, 14, { width: 40, align: 'right' });
  y = 52;
}

function checkY(needed) {
  if (y + needed > 810) newPage();
}

function sectionHeader(title, subtitle) {
  checkY(44);
  doc.rect(ML, y, TW, 26).fillColor('#f0f0f0').fill();
  doc.rect(ML, y, 4, 26).fillColor(RED).fill();
  doc.fontSize(12).fillColor(RED).font('Helvetica-Bold')
     .text(title, ML + 12, y + 7, { width: TW - 60 });
  if (subtitle) {
    doc.fontSize(8.5).fillColor(GREY).font('Helvetica')
       .text(subtitle, MR - 200, y + 9, { width: 196, align: 'right' });
  }
  y += 32;
}

function subHeader(text) {
  checkY(22);
  doc.fontSize(9.5).fillColor(BLUE).font('Helvetica-Bold').text(text, ML, y);
  y += 14;
}

let stepCounter = 0;
function step(action, expected, notes) {
  checkY(notes ? 46 : 36);
  stepCounter++;
  const numW = 24;
  const colW = (TW - numW - 14) / 2;

  const bg = stepCounter % 2 === 0 ? '#fafafa' : WHITE;
  const estimatedH = notes ? 52 : 40;
  doc.rect(ML, y, TW, estimatedH).fillColor(bg).fill();
  doc.rect(ML, y, TW, estimatedH).lineWidth(0.4).strokeColor('#e0e0e0').stroke();

  // Step number
  doc.rect(ML, y, numW, estimatedH).fillColor(RED + '18').fill();
  doc.fontSize(9).fillColor(RED).font('Helvetica-Bold')
     .text(String(stepCounter), ML, y + (estimatedH / 2) - 5, { width: numW, align: 'center' });

  // Action column
  doc.fontSize(8.5).fillColor(DARK).font('Helvetica-Bold')
     .text('ACTION', ML + numW + 6, y + 4, { width: colW - 6 });
  doc.fontSize(8.5).fillColor(DARK).font('Helvetica')
     .text(action, ML + numW + 6, y + 14, { width: colW - 10 });

  // Expected column
  doc.fontSize(8.5).fillColor(DARK).font('Helvetica-Bold')
     .text('EXPECTED RESULT', ML + numW + colW + 12, y + 4, { width: colW - 6 });
  doc.fontSize(8.5).fillColor(GREEN).font('Helvetica')
     .text(expected, ML + numW + colW + 12, y + 14, { width: colW - 10 });

  if (notes) {
    doc.fontSize(7.5).fillColor(ORANGE).font('Helvetica-Oblique')
       .text('⚠ ' + notes, ML + numW + 6, y + 38, { width: TW - numW - 12 });
  }

  // Checkbox
  const cbX = MR - 14, cbY = y + (estimatedH / 2) - 5;
  doc.rect(cbX, cbY, 11, 11).lineWidth(1).strokeColor('#999').stroke();

  y += estimatedH + 3;
}

function note(text) {
  checkY(22);
  doc.fontSize(8).fillColor(GREY).font('Helvetica-Oblique')
     .text('📌 ' + text, ML + 6, y, { width: TW - 12 });
  y += 14;
}

function gap(h) { y += h ?? 8; }

function legend() {
  checkY(28);
  doc.rect(ML, y, TW, 22).fillColor('#fff8e1').fill();
  doc.rect(ML, y, TW, 22).lineWidth(0.4).strokeColor('#ffe082').stroke();
  doc.fontSize(8).fillColor(ORANGE).font('Helvetica-Bold')
     .text('LEGEND:  ', ML + 8, y + 7, { continued: true })
     .font('Helvetica').fillColor(DARK)
     .text('Each step has an ACTION (what to do), EXPECTED RESULT (what should happen), and a checkbox □ for the tester to mark pass/fail.  ', { continued: true })
     .fillColor(ORANGE).font('Helvetica-Bold').text('⚠ = important caveat or prerequisite.');
  y += 28;
}

// ═══════════════════════════════════════════════════════════════════════════
// PAGE 1
// ═══════════════════════════════════════════════════════════════════════════
newPage();

// Title block
doc.fontSize(22).fillColor(RED).font('Helvetica-Bold').text('Digital Vehicle Inspection', ML, y);
y += 26;
doc.fontSize(14).fillColor(DARK).font('Helvetica').text('Test Procedures — Tester\'s Copy', ML, y);
y += 16;
doc.fontSize(9).fillColor(GREY).font('Helvetica')
   .text(`System: D1 Imports CRM (redlined1.com)   |   Feature: Digital Inspections (DVI)   |   Date: June 2026`, ML, y);
y += 18;
doc.moveTo(ML, y).lineTo(MR, y).lineWidth(1.5).strokeColor(RED).stroke();
y += 12;

legend();
gap(6);

// ─── SECTION 1 ───────────────────────────────────────────────────────────
sectionHeader('SECTION 1 — Prerequisites & Navigation', 'Verify access and initial state');

subHeader('1.1  Login & Navigate');
step('Log in as Owner role at redlined1.com', 'Dashboard loads. Sidebar visible with all modules.');
step('Click "Inspections" in the left sidebar', '"Digital Inspections" module opens. Header reads "Digital Vehicle Inspections".');
step('Check the 4 stat cards at the top of the page', 'Cards show: Total Inspections, In Progress, Completed, Needs Approval — all with numeric values (0 or real counts).');

subHeader('1.2  Empty State');
step('If no inspections exist, observe the list panel', 'Message reads "No inspections yet." — no crash or blank white area.');

gap();

// ─── SECTION 2 ───────────────────────────────────────────────────────────
sectionHeader('SECTION 2 — Create New Inspection', 'Test full form creation flow');

subHeader('2.1  Open New DVI Form');
step('Click the "+ New DVI" button', 'Form panel slides in on the right. Inspection # auto-assigned (e.g. DVI-0001). Status defaults to "In Progress".');
step('Verify the Inspection # format', 'Number follows DVI-XXXX pattern. No collision with existing records.', 'If inspections were previously deleted, number must still be higher than any existing DVI number.');

subHeader('2.2  Customer & Vehicle Fields');
step('Click the Customer dropdown and select an existing customer', 'Customer Name field auto-fills with selected customer\'s name.');
step('Observe the Vehicle field after selecting a customer with registered vehicles', 'Vehicle field becomes a dropdown listing that customer\'s registered vehicles.');
step('Select a vehicle from the dropdown', 'VIN field auto-populates if the vehicle has a VIN on record.');
step('Clear the customer selection, then type manually in Customer Name and Vehicle fields', 'Both free-text inputs accept typing. Form remains valid.');

subHeader('2.3  Other Header Fields');
step('Enter a VIN number manually (e.g. 1HGCM82633A123456)', 'VIN field accepts input. No validation error on valid format.');
step('Enter a mileage value (e.g. 75000)', 'Mileage field accepts numeric input only.');
step('Click the Technician dropdown', 'Dropdown lists team members from the Members list (name formatted from email). Option "— select technician —" shown at top.', 'If no members have been added, field falls back to a free-text input instead.');
step('Select a technician from the dropdown', 'Selected technician name appears in the field.');
step('Enter a customer email address (e.g. customer@test.com)', 'Email field accepts the value with no error.');
step('Enter a customer phone number', 'Phone field accepts the value.');

subHeader('2.4  Inspection Checklist');
step('Scroll down to the checklist items under the form fields', 'Items are grouped by category: BRAKES, TIRES, FLUIDS, LIGHTS, UNDER HOOD, SUSPENSION.');
step('Click "Pass" on the Front brake pads item', 'Button highlights green. Item status changes to Pass.');
step('Click "Attention" on Rear brake pads', 'Button highlights orange. A "Notes…" text field appears for that item.');
step('Type "Worn, ~2mm remaining" in the notes field', 'Text saves in the field. Notes box visible only for Attention/Fail items.');
step('Click "Fail" on Front rotors', 'Button highlights red. Notes field appears. Pass/Attention buttons deselect.');
step('Click "N/A" on Tire pressure', 'Button highlights grey. Notes field disappears.');
step('Leave several items as N/A (default)', 'No error on save for N/A items.');

subHeader('2.5  Save the Inspection');
step('Leave Customer Name or Vehicle blank, click "Create Inspection"', 'Error message: "Customer and vehicle are required." Form does not submit.');
step('Fill in required fields and click "Create Inspection"', 'Spinner shows briefly. Form closes. New inspection appears in the list panel on the left.');
step('Check the stat card for "Total Inspections"', 'Count increments by 1.');
note('The newly created inspection should be selected automatically in the list and shown in the detail panel.');

gap();

// ─── SECTION 3 ───────────────────────────────────────────────────────────
sectionHeader('SECTION 3 — View Inspection Detail', 'Verify detail panel and summary badges');

step('Click on the newly created inspection in the list', 'Right panel shows the full inspection detail: number, customer, vehicle, technician, mileage.');
step('Observe the 4 coloured summary badges (Fail / Attention / Pass / N/A)', 'Counts match the statuses set during creation. Colours: red=Fail, orange=Attention, green=Pass, grey=N/A.');
step('Scroll through the detail checklist', 'Items grouped by category. Each shows a coloured dot, item name, status label. Notes visible where entered.');
step('Verify items marked "Fail" show red label and dot', 'Visual is clearly red. No orange or green shown for Fail items.');

// ═══════════════════════════════════════════════════════════════════════════
// PAGE 2
// ═══════════════════════════════════════════════════════════════════════════
newPage();
stepCounter = stepCounter; // continue numbering

// ─── SECTION 4 ───────────────────────────────────────────────────────────
sectionHeader('SECTION 4 — Edit Existing Inspection', 'Verify edits are persisted correctly');

step('With an inspection selected, click "✏️ Fill Out / Edit"', 'Form opens pre-filled with all existing values: customer, vehicle, VIN, mileage, technician, checklist items, notes.');
step('Change the vehicle field to a different value', 'Field accepts new input.');
step('Change the status of 2 checklist items', 'Buttons update visually. Notes fields appear/disappear as expected.');
step('Add text in the Overall Notes field', 'Textarea accepts the text.');
step('Click "Save Changes"', 'Form closes. Detail panel refreshes showing updated vehicle, notes, and checklist statuses.');
step('Re-open the inspection (click it in the list, then Edit)', 'All changes from the previous save are persisted — vehicle, notes, and item statuses all show the edited values.', 'This verifies Bug Fix #2: vehicle/VIN/customer fields now correctly save to the database.');

gap();

// ─── SECTION 5 ───────────────────────────────────────────────────────────
sectionHeader('SECTION 5 — Photo Upload', 'Requires an existing (saved) inspection in Edit mode');

step('Open an existing inspection in Edit mode (✏️ Fill Out / Edit)', 'Form loads. Camera icons 📷 visible on each checklist item row.');
step('Click the 📷 icon on any checklist item', 'OS file picker opens. Select any image file (JPG, PNG).');
step('Select an image and confirm', '"…" spinner shows briefly on that item. Then icon changes to "📷✓" indicating upload success.');
step('Click "Save Changes"', 'Inspection saves with photo attached.');
step('Return to detail view and click the 📷 link on that item', 'Image opens in a new browser tab. Correct photo displayed.', 'Photo upload only works when editing an existing inspection (not on brand-new unsaved forms).');

gap();

// ─── SECTION 6 ───────────────────────────────────────────────────────────
sectionHeader('SECTION 6 — Mark Complete', 'Test status workflow transition');

step('Select an "In Progress" inspection from the list', 'Detail panel shows. "✓ Mark Complete" green button visible in action bar.');
step('Click "✓ Mark Complete"', 'Status changes to "Completed". Badge in list panel turns green. "Mark Complete" button disappears from action bar.');
step('Verify a "📋 Create Estimate →" button now appears', 'Blue button "Create Estimate →" replaces the "Mark Complete" button for completed inspections.');
step('Check the Completed stat card at the top', 'Count increments by 1. In Progress count decrements by 1.');

gap();

// ─── SECTION 7 ───────────────────────────────────────────────────────────
sectionHeader('SECTION 7 — Customer Report Preview', 'Test the print/preview modal');

step('Select any inspection and click "👁 Customer Report"', 'Full-screen modal opens with branded print layout: logo (if set), company name, inspection number.');
step('Verify the 3 summary badges in the modal (FAIL / ATTENTION / PASS)', 'Counts match what is shown in the detail panel. Colours correct.');
step('Scroll through the modal checklist', 'Items grouped by category. Photo thumbnails (40×40px) shown where photos were uploaded. Notes shown in grey text.');
step('Click "🖨 Print"', 'Browser print dialog opens. Modal closes. Print preview shows the report cleanly formatted.');
step('Click "✕ Close"', 'Modal closes. Underlying page visible.');

gap();

// ─── SECTION 8 ───────────────────────────────────────────────────────────
sectionHeader('SECTION 8 — Email Report', 'Requires RESEND_API_KEY configured and customer email on record');

step('Select an inspection that has a customer email address', '"✉️ Email Report" button in action bar appears fully opaque (not greyed out).');
step('Select an inspection with NO customer email', '"✉️ Email Report" button is greyed out / disabled with tooltip "No customer email on file".');
step('Click "✉️ Email Report" on an inspection with a valid email', 'Button shows "…Sending" briefly. Toast notification: "Report sent to [email]".');
step('Check the recipient\'s inbox', 'Email arrives from noreply@redlined1.com. Subject contains the inspection number and shop name. Body shows categorised checklist with Pass/Attention/Fail items highlighted.', 'Email delivery may take up to 2 minutes. Check spam folder if not received.');

gap();

// ─── SECTION 9 ───────────────────────────────────────────────────────────
sectionHeader('SECTION 9 — Shareable Customer Link', 'Test public share token generation');

step('Select any inspection and click "🔗 Share Link"', 'Button shows "…" briefly. A purple URL bar appears below the action bar.');
step('Verify the URL format in the bar', 'URL is: https://redlined1.com/inspection/[32-char-token]');
step('Click the "Copy" button in the URL bar', 'Button text changes to "✓ Copied!" for 3 seconds. URL copied to clipboard.');
step('Paste the URL in a new browser tab (or incognito window)', 'Public inspection page loads WITHOUT requiring login. Shows customer-friendly layout with shop branding, summary badges, and full checklist.');
step('Verify the public page shows correct data', 'Customer name, vehicle, all checklist items with colour indicators, and any uploaded photos visible.');
step('Click "🔗 Share Link" again on the same inspection', 'Same token returned (not a new one). Same URL shown.');

// ═══════════════════════════════════════════════════════════════════════════
// PAGE 3
// ═══════════════════════════════════════════════════════════════════════════
newPage();

// ─── SECTION 10 ──────────────────────────────────────────────────────────
sectionHeader('SECTION 10 — Create Estimate from Inspection', 'Test cross-module navigation');

step('Mark an inspection as Completed (Section 6 above)', '"📋 Create Estimate →" button appears in action bar.');
step('Click "📋 Create Estimate →"', 'App navigates to Estimates module. New estimate form pre-fills with customer name, customer ID, and inspection reference.');
step('Verify customer name is pre-filled in the estimate form', 'Customer name matches the inspection. No manual re-entry needed.');

gap();

// ─── SECTION 11 ──────────────────────────────────────────────────────────
sectionHeader('SECTION 11 — Job Card → DVI Integration', 'Test prefill from Job Cards module');

step('Navigate to Job Cards module', 'Job Cards list loads.');
step('Create a new job card (or use an existing one)', 'Job card created and visible in list.');
step('Click on a job card to view its detail panel', 'Detail view opens on the right.');
step('Click the "🔍 Start DVI →" button in the job card detail', 'App navigates to Inspections module. New DVI form opens pre-filled with the customer name, vehicle, and Job Card ID from that job card.');
step('Verify the Job Card ID field is populated in the DVI form', 'Field shows the correct job card reference (e.g. JC-xxxxxxxxxx).');
step('Complete and save the DVI', 'Inspection saved. Job Card ID stored and visible in inspection detail.');

gap();

// ─── SECTION 12 ──────────────────────────────────────────────────────────
sectionHeader('SECTION 12 — Search & Filter', 'Test list controls');

step('Type a customer name in the Search field', 'List filters in real time — only inspections matching the name shown.');
step('Type an inspection number (e.g. DVI-0001)', 'Matching inspection shown.');
step('Type a vehicle name (e.g. Toyota)', 'All inspections for Toyota vehicles shown.');
step('Clear search and use the Status dropdown filter — select "Completed"', 'Only completed inspections shown in list.');
step('Select "In Progress" from the filter dropdown', 'Only in-progress inspections shown.');
step('Select "All" to reset', 'Full list restored.');

gap();

// ─── SECTION 13 ──────────────────────────────────────────────────────────
sectionHeader('SECTION 13 — Delete Inspection', 'Verify deletion and list update');

step('Select any inspection in the list', 'Detail panel shows. "Delete" button visible at far right of action bar (red text).');
step('Click "Delete"', 'Browser confirm dialog: "Delete DVI-XXXX?"');
step('Click Cancel in the confirm dialog', 'Nothing happens. Inspection remains.');
step('Click Delete again, then confirm OK', 'Inspection removed from list. Next inspection in list auto-selected (or empty state if none remain).');
step('Create a new DVI after deletion', 'New DVI number is higher than any remaining number — no re-use of the deleted number.', 'This verifies Bug Fix #1: number generation uses MAX not COUNT.');

gap();

// ─── SECTION 14 ──────────────────────────────────────────────────────────
sectionHeader('SECTION 14 — Customisable Template (Owner Only)', 'Test Settings → DVI Template');

step('Navigate to Settings module', 'Settings page loads.');
step('Scroll to the "DVI Inspection Template" panel', 'Panel shows current checklist items grouped by category. Default 26 items across 6 categories.');
step('Click "＋ Add Item" — enter Category: "Engine" and Name: "Timing belt condition"', 'New item added to the list immediately in the UI.');
step('Click "Save Template"', 'Toast: "Template saved." Success indicator shown.');
step('Navigate back to Inspections and click "+ New DVI"', 'New DVI form checklist includes the custom "Engine / Timing belt condition" item.');
step('Return to Settings → DVI Inspection Template, click "Reset to Default"', 'Confirm dialog shown. On confirm, template reverts to original 26 items. Custom items removed.');
step('Create a new DVI after resetting', 'Checklist uses original default items — no custom items appear.');

gap();

// ─── SECTION 15 ──────────────────────────────────────────────────────────
sectionHeader('SECTION 15 — Role-Based Access', 'Test technician role restrictions');

step('Log out and log back in as a Technician role', 'Technician dashboard loads with limited sidebar modules.');
step('Navigate to Inspections (if accessible)', 'DVI module loads. Technician can view and fill out inspections.');
step('Verify technician cannot see financial data in Parts module', 'Cost, Retail, and Margin columns hidden. No dollar values visible to technician.');
step('Log back in as Owner to restore full access', 'All modules and data visible again.');

gap();

// ─── SECTION 16 ──────────────────────────────────────────────────────────
sectionHeader('SECTION 16 — Multi-Location Isolation', 'Verify inspections are scoped per shop/location');

step('Switch to Location 2 using the shop switcher in the sidebar', 'Sidebar shows Location 2 active. Inspection list reloads.');
step('Verify Location 2 shows only its own inspections', 'Inspections created under Location 1 do not appear. Counts reflect Location 2 data only.');
step('Create a new DVI under Location 2', 'Inspection saved. Only visible when Location 2 is active.');
step('Switch back to Location 1', 'Location 1 inspections return. Location 2 inspection not visible.');

gap();

// ─── Summary ─────────────────────────────────────────────────────────────
checkY(80);
doc.rect(ML, y, TW, 72).fillColor('#f9fafb').fill();
doc.rect(ML, y, TW, 72).lineWidth(0.5).strokeColor('#e0e0e0').stroke();
doc.rect(ML, y, 4, 72).fillColor(GREEN).fill();

doc.fontSize(10).fillColor(GREEN).font('Helvetica-Bold')
   .text('TEST COMPLETION SIGN-OFF', ML + 12, y + 10);
doc.fontSize(8.5).fillColor(DARK).font('Helvetica')
   .text(`Total Steps: ${stepCounter}   |   Sections: 16   |   Estimated Time: 45–60 minutes`, ML + 12, y + 24);
doc.fontSize(8.5).fillColor(GREY).font('Helvetica')
   .text('Tester Name: ___________________________    Date: _________________    Pass / Fail: _________', ML + 12, y + 38);
doc.fontSize(8.5).fillColor(GREY).font('Helvetica')
   .text('Signature:    ___________________________    Notes: ________________________________________________', ML + 12, y + 52);
y += 80;

// Footer
gap(10);
doc.fontSize(7.5).fillColor('#aaa').font('Helvetica')
   .text('D1 Imports CRM · redlined1.com · Generated June 2026 · For internal QA use only', ML, y, { width: TW, align: 'center' });

doc.end();
console.log('Generated:', out);
console.log(`Total test steps: ${stepCounter}`);
