const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');

const doc = new PDFDocument({ margin: 50, size: 'LETTER' });
const outputPath = path.join(__dirname, '..', 'D1-Imports-Test-Procedures.pdf');
doc.pipe(fs.createWriteStream(outputPath));

// ─── Colors ───────────────────────────────────────────────────────
const RED    = '#CC0000';
const DARK   = '#111111';
const MUTED  = '#666666';
const LIGHT  = '#F5F5F5';
const GREEN  = '#2E7D32';
const BLUE   = '#1565C0';
const BORDER = '#DDDDDD';

// ─── Helpers ──────────────────────────────────────────────────────
function pageHeader() {
  doc.rect(0, 0, doc.page.width, 52).fill(RED);
  doc.fillColor('#fff').fontSize(16).font('Helvetica-Bold')
     .text('D1 IMPORTS  —  Test Procedures', 50, 18);
  doc.fillColor('#fff').fontSize(9).font('Helvetica')
     .text('Portal QA · redlined1.com', doc.page.width - 200, 22, { width: 150, align: 'right' });
  doc.moveDown(0);
  doc.y = 70;
  doc.fillColor(DARK);
}

function sectionTitle(title, subtitle) {
  if (doc.y > 650) doc.addPage();
  doc.rect(50, doc.y, doc.page.width - 100, 32).fill(RED);
  doc.fillColor('#fff').fontSize(13).font('Helvetica-Bold')
     .text(title, 62, doc.y - 26);
  doc.fillColor(DARK);
  doc.y += 10;
  if (subtitle) {
    doc.fillColor(MUTED).fontSize(9).font('Helvetica').text(subtitle, 50, doc.y);
    doc.y += 14;
  }
  doc.moveDown(0.3);
}

function testCase(num, title, role, steps, expected) {
  if (doc.y > 600) { doc.addPage(); pageHeader(); }
  const startY = doc.y;

  // Card border
  const cardHeight = 20 + (steps.length * 14) + 30;
  doc.rect(50, startY, doc.page.width - 100, cardHeight + 14).lineWidth(1).strokeColor(BORDER).stroke();
  doc.rect(50, startY, 4, cardHeight + 14).fill(RED);

  // Test number + title
  doc.fillColor(RED).fontSize(9).font('Helvetica-Bold')
     .text(`TC-${String(num).padStart(3,'0')}`, 62, startY + 6);
  doc.fillColor(DARK).fontSize(11).font('Helvetica-Bold')
     .text(title, 100, startY + 5, { width: doc.page.width - 220 });

  // Role badge
  doc.rect(doc.page.width - 120, startY + 4, 65, 14).fill(BLUE);
  doc.fillColor('#fff').fontSize(7.5).font('Helvetica-Bold')
     .text(role.toUpperCase(), doc.page.width - 117, startY + 7, { width: 60, align: 'center' });

  doc.y = startY + 22;

  // Steps
  steps.forEach((step, i) => {
    if (doc.y > 700) { doc.addPage(); pageHeader(); }
    doc.fillColor(MUTED).fontSize(8).font('Helvetica-Bold')
       .text(`${i + 1}.`, 62, doc.y, { width: 14 });
    doc.fillColor(DARK).fontSize(8.5).font('Helvetica')
       .text(step, 78, doc.y, { width: doc.page.width - 140 });
    doc.y += 13;
  });

  // Expected result
  doc.rect(56, doc.y + 2, doc.page.width - 112, 14).fill('#E8F5E9');
  doc.fillColor(GREEN).fontSize(8).font('Helvetica-Bold')
     .text('✓  Expected: ', 60, doc.y + 5, { continued: true });
  doc.fillColor(GREEN).font('Helvetica').text(expected, { width: doc.page.width - 150 });
  doc.y += 22;
  doc.moveDown(0.5);
}

function passFailRow() {
  doc.rect(50, doc.y, doc.page.width - 100, 18).fill(LIGHT);
  doc.fillColor(MUTED).fontSize(8).font('Helvetica')
     .text('Tester:', 60, doc.y + 5)
     .text('Date:', 180, doc.y + 5)
     .text('Pass  ☐    Fail  ☐    Notes:', 280, doc.y + 5);
  doc.y += 26;
}

// ══════════════════════════════════════════════════════════════════
//  COVER PAGE
// ══════════════════════════════════════════════════════════════════
doc.rect(0, 0, doc.page.width, doc.page.height).fill('#0D0D10');
doc.rect(0, 0, doc.page.width, 8).fill(RED);
doc.rect(0, doc.page.height - 8, doc.page.width, 8).fill(RED);

doc.fillColor(RED).fontSize(36).font('Helvetica-Bold')
   .text('D1 IMPORTS', 50, 180, { align: 'center' });
doc.fillColor('#fff').fontSize(18).font('Helvetica')
   .text('Portal QA — Test Procedures', 50, 228, { align: 'center' });

doc.rect(150, 270, doc.page.width - 300, 1).fill('#CC0000');

doc.fillColor('#aaa').fontSize(11).font('Helvetica')
   .text('Features Released — June 2026', 50, 284, { align: 'center' });

const features = [
  'DVI — Email Report, Share Link, Job Card Integration',
  'DVI — Technician Dropdown, Custom Template',
  'Role Permissions (Owner-Configurable)',
  'Technician Financial Data Restrictions',
  'Parts Module — Cost/Profit Hidden for Technicians',
  'Team Members Panel & Invite Flow',
  'Password Change Flow (All Roles)',
  'Sidebar Badge Counts — Live DB Queries',
  'Job Card — Customer Dropdown Fallback',
  'Closed Jobs shop_id Migration',
];
doc.y = 330;
features.forEach(f => {
  doc.fillColor('#ccc').fontSize(10).font('Helvetica')
     .text(`•  ${f}`, 80, doc.y, { align: 'left' });
  doc.y += 16;
});

doc.fillColor('#555').fontSize(9).font('Helvetica')
   .text('redlined1.com  ·  Confidential  ·  Internal Use Only', 50, doc.page.height - 40, { align: 'center' });

// ══════════════════════════════════════════════════════════════════
//  PAGE 2 — SECTION 1: DVI FEATURES
// ══════════════════════════════════════════════════════════════════
doc.addPage();
pageHeader();

sectionTitle('1. Digital Vehicle Inspection (DVI)', 'Test all 5 new DVI capabilities');

testCase(1, 'Email Inspection Report to Customer', 'Owner / Manager', [
  'Log in as owner at redlined1.com',
  'Navigate to Inspections in the sidebar',
  'Open any existing completed inspection that has a customer email on file',
  'Click the "✉️ Email Report" button in the action bar',
  'Wait for the button to show "…Sending" then return to normal',
], 'Toast notification: "Report sent to [email]". Customer receives branded HTML email with Pass/Attention/Fail checklist, summary badges, and shop logo.');

passFailRow();

testCase(2, 'Email Report — No Email on File', 'Owner / Manager', [
  'Open an inspection where Customer Email field is empty',
  'Observe the "✉️ Email Report" button',
], 'Button appears grayed out (45% opacity) and is disabled. Hovering shows tooltip: "No customer email on file".');

passFailRow();

testCase(3, 'Generate Shareable Customer Link', 'Owner / Manager', [
  'Open any inspection in the detail view',
  'Click "🔗 Share Link" in the action bar',
  'Observe the URL bar that appears below the action bar',
  'Click "Copy" button',
  'Open a new browser tab (or private/incognito window — no login)',
  'Paste the URL and press Enter',
], 'Public inspection page loads without login. Shows vehicle info, summary badges (Fail/Attention/Pass counts), full checklist with color dots, and a Print button. Photos display as thumbnails.');

passFailRow();

testCase(4, 'Share Link — Same Inspection Returns Same URL', 'Owner / Manager', [
  'Click "🔗 Share Link" on the same inspection a second time',
  'Compare the generated URL to the first one',
], 'Identical URL returned both times (token persists in DB, not regenerated).');

passFailRow();

testCase(5, 'Start DVI from Job Card', 'Owner / Manager', [
  'Navigate to Job Cards',
  'Click on any active job card to open its detail panel',
  'Click "🔍 Start DVI →" button',
  'Observe the Inspections form that opens',
], 'Inspections module opens with a new DVI form pre-filled: Customer Name from the job card, Vehicle from the job card, Job Card ID in the jobCardId field, and a new inspection number auto-generated.');

passFailRow();

testCase(6, 'Technician Dropdown in DVI Form', 'Owner / Manager', [
  'Go to Inspections → click "+ New DVI"',
  'Observe the Technician field',
], 'If the shop has team members (technician/advisor/manager roles), the field shows a dropdown listing their emails and roles. If no members exist, it shows a plain text input.');

passFailRow();

testCase(7, 'Custom Inspection Template — Add Item', 'Owner', [
  'Go to Settings → scroll to "DVI Inspection Template" panel',
  'Type "Exhaust" in the Category field and "Exhaust pipe condition" in the Item Name field',
  'Click "+ Add Item"',
  'Click "Save Template"',
  'Navigate to Inspections → click "+ New DVI"',
  'Scroll to the Exhaust category in the checklist',
], 'New item "Exhaust pipe condition" appears under an "Exhaust" category in the DVI checklist form.');

passFailRow();

testCase(8, 'Custom Template — Remove Item', 'Owner', [
  'Go to Settings → DVI Inspection Template',
  'Click "Remove" next to any existing item (e.g. "Wiper blades")',
  'Click "Save Template"',
  'Create a new DVI and verify the removed item is gone',
], 'Removed item no longer appears in new DVI checklists. Existing saved inspections are unaffected.');

passFailRow();

testCase(9, 'Custom Template — Reset to Default', 'Owner', [
  'Go to Settings → DVI Inspection Template',
  'Click "Reset to Default"',
  'Click "Save Template"',
], 'Template reverts to the original 26-item checklist across 6 categories (Brakes, Tires, Fluids, Lights, Under Hood, Suspension).');

passFailRow();

// ══════════════════════════════════════════════════════════════════
//  PAGE 3 — SECTION 2: ROLE PERMISSIONS
// ══════════════════════════════════════════════════════════════════
doc.addPage();
pageHeader();

sectionTitle('2. Role Permissions (Owner-Configurable)', 'Verify owner can restrict module access per role');

testCase(10, 'Configure Manager Role Permissions', 'Owner', [
  'Go to Settings → "Role Permissions" panel',
  'Select the Manager tab',
  'Uncheck "Payments" and "Reports"',
  'Click "Save Role Permissions"',
  'Log out, log in as a Manager account',
], 'Manager sidebar does NOT show Payments or Reports modules. All other allowed modules are visible.');

passFailRow();

testCase(11, 'Configure Technician Role Permissions', 'Owner', [
  'Settings → Role Permissions → Technician tab',
  'Verify only: Dashboard, Job Cards, Inspections, Repair Orders, Parts are checked',
  'Save Role Permissions',
  'Log in as technician role',
], 'Technician sees exactly: Dashboard, Job Cards, Inspections, Repair Orders, Parts, Help & Manual, Sign Out. No other modules visible.');

passFailRow();

testCase(12, 'Reset Role to Default', 'Owner', [
  'Settings → Role Permissions → any role tab',
  'Click "Reset to Default"',
], 'Checkboxes revert to the default module set for that role without saving. User must still click Save to persist.');

passFailRow();

// ══════════════════════════════════════════════════════════════════
//  SECTION 3: TECHNICIAN FINANCIAL RESTRICTIONS
// ══════════════════════════════════════════════════════════════════
sectionTitle('3. Technician Financial Data Restrictions', 'Verify financial data is hidden from technician role');

testCase(13, 'Dashboard — No Revenue Data', 'Technician', [
  'Log in as a technician-role account',
  'Navigate to Dashboard',
], 'Revenue KPI row is hidden (Total Revenue, Outstanding, Today\'s Revenue, Draft Invoices). Revenue chart and Invoice Status panels are hidden. Recent Invoices section is hidden.');

passFailRow();

testCase(14, 'Repair Orders — No Dollar Amounts', 'Technician', [
  'Log in as technician, navigate to Repair Orders',
  'Open any repair order',
], 'No dollar amounts visible anywhere: no labor cost, no parts cost, no total. "Create Invoice" button is absent. Charges section is hidden in both detail view and print preview.');

passFailRow();

testCase(15, 'Header — No Invoice Buttons', 'Technician', [
  'Log in as technician',
  'Check the top header area',
], '"New Job Card" and "Create Invoice" buttons are not present in the header for technician role.');

passFailRow();

testCase(16, 'Parts — No Cost/Retail/Margin', 'Technician', [
  'Log in as technician, navigate to Parts',
  'View the stats bar, parts table, and part detail panel',
  'Open the Add/Edit form',
], 'Cost Value, Retail Value, and Margin stat cards are hidden. Cost and Retail columns absent from table. Detail panel shows no Cost/Retail/Margin fields. Form has no Cost or Retail inputs. Margin preview is hidden. Reorder value total is hidden.');

passFailRow();

// ══════════════════════════════════════════════════════════════════
//  PAGE 4 — SECTION 4: TEAM MEMBERS & INVITE
// ══════════════════════════════════════════════════════════════════
doc.addPage();
pageHeader();

sectionTitle('4. Team Members & Invite Flow', 'Verify staff management and multi-location invite');

testCase(17, 'Team Members Panel Shows Real Data', 'Owner', [
  'Go to Settings → Login & Roles (or Access module)',
  'Scroll to "Team Members" panel',
], 'All shop_users for the active location are listed with correct email and role. No "Shop ID:" debug text visible in the panel hint.');

passFailRow();

testCase(18, 'Invite New Staff Member', 'Owner', [
  'Access module → Invite User panel',
  'Enter a new staff email, select role "Technician", click "Send Invite"',
  'Check the invited email inbox',
], 'Email received with D1 Imports branding, temp password in monospace box, login URL, and role label. Staff added to ALL shop locations owned by the same owner (check shop_users in Supabase).');

passFailRow();

testCase(19, 'Invited Staff Login & Access', 'New Staff', [
  'Use credentials from invite email to log in at redlined1.com',
  'Observe which modules are visible in the sidebar',
], 'Staff member logs in and sees modules matching their assigned role permissions. Dashboard is always visible.');

passFailRow();

// ══════════════════════════════════════════════════════════════════
//  SECTION 5: PASSWORD CHANGE
// ══════════════════════════════════════════════════════════════════
sectionTitle('5. Password Change Flow', 'All roles — verify in-portal password update');

testCase(20, 'Change Password — Success Flow', 'All Roles', [
  'Log in with any account (owner, manager, advisor, or technician)',
  'Go to Settings',
  'Scroll to the "Change Password" panel (first panel on the page)',
  'Enter the current password in "Current Password"',
  'Enter a new password (8+ chars) in "New Password"',
  'Repeat it in "Confirm New Password"',
  'Click "Update Password"',
  'Log out and log back in with the new password',
], 'Success confirmation (green banner) appears. Old password no longer works. New password logs in successfully.');

passFailRow();

testCase(21, 'Change Password — Wrong Current Password', 'All Roles', [
  'Go to Settings → Change Password',
  'Type an incorrect current password',
  'Fill in valid new + confirm passwords',
  'Click "Update Password"',
], 'Red error message: "Current password is incorrect." Password is NOT changed.');

passFailRow();

testCase(22, 'Change Password — Mismatch', 'All Roles', [
  'Go to Settings → Change Password',
  'Fill current password correctly',
  'Type different values in New Password and Confirm New Password fields',
  'Observe the Confirm field border color',
  'Click "Update Password"',
], 'Confirm field shows a red border while values differ. On submit: error "Passwords do not match." Password unchanged.');

passFailRow();

testCase(23, 'Change Password — Too Short', 'All Roles', [
  'Go to Settings → Change Password',
  'Enter a new password shorter than 8 characters',
  'Click "Update Password"',
], 'Error: "Password must be at least 8 characters." Blocked before any API call.');

passFailRow();

// ══════════════════════════════════════════════════════════════════
//  PAGE 5 — SECTION 6: SIDEBAR & NAVIGATION
// ══════════════════════════════════════════════════════════════════
doc.addPage();
pageHeader();

sectionTitle('6. Sidebar Badge Counts', 'Verify all counts reflect real DB data per location');

testCase(24, 'Appointments Badge Reflects Real Count', 'Owner', [
  'Note the number badge next to "Appointments" in the sidebar',
  'Navigate to Appointments and count the rows displayed',
], 'Sidebar badge matches the actual number of appointment records for the active shop location. No longer shows hardcoded "9".');

passFailRow();

testCase(25, 'Technicians Badge Reflects Real Count', 'Owner', [
  'Note the number next to "Technicians" in the sidebar',
  'Navigate to Technicians → Roster tab and count active technicians',
], 'Sidebar badge matches roster count for the active location. No longer shows hardcoded "3".');

passFailRow();

testCase(26, 'Location Switch Updates All Badges', 'Owner', [
  'Note badge counts at Location 1',
  'Switch to Location 2 using the shop switcher dropdown',
  'Observe badge numbers across the sidebar',
], 'All badge counts update to reflect Location 2\'s data. Different locations show different counts.');

passFailRow();

testCase(27, 'Dashboard/Diagnostics/AI — No Fake Count', 'Owner', [
  'Check the sidebar badges for Dashboard, Diagnostics, and AI Copilot',
], 'These items show no badge number (previously showed hardcoded 12, 3, 4 respectively).');

passFailRow();

// ══════════════════════════════════════════════════════════════════
//  SECTION 7: JOB CARDS
// ══════════════════════════════════════════════════════════════════
sectionTitle('7. Job Cards — Customer Dropdown & Closed Jobs', 'Verify customer field and closed jobs load');

testCase(28, 'Customer Dropdown — With Customers', 'Owner / Manager', [
  'Switch to a location that has customers (e.g. Location 1)',
  'Click "+ New Job Card" or open the Create Job Card form',
  'Observe the Customer field',
], 'Customer field shows a dropdown with "— select customer —" and all registered customers listed alphabetically.');

passFailRow();

testCase(29, 'Customer Field — No Customers (Fallback)', 'Owner / Manager', [
  'Switch to a location with no customers (e.g. Location 2)',
  'Open the New Job Card form',
  'Observe the Customer field',
], 'Customer field shows a free-text input with placeholder "Customer name". User can type any name to create the job card.');

passFailRow();

testCase(30, 'Closed Jobs Tab Loads Without Error', 'Owner / Manager', [
  'Navigate to Job Cards',
  'Click the "Closed Jobs (n)" tab',
], 'Closed Jobs tab loads cleanly. No red error banner "Load error: column closed_jobs.shop_id does not exist". Closed jobs for the active location are listed (or "no closed jobs" if none).');

passFailRow();

// ══════════════════════════════════════════════════════════════════
//  SIGN-OFF PAGE
// ══════════════════════════════════════════════════════════════════
doc.addPage();
pageHeader();

sectionTitle('8. Sign-Off & Summary', 'Complete all test cases before marking release as QA-passed');

// Summary table
const tableTop = doc.y + 5;
const cols = [55, 140, 340, 420, 490];
const headers = ['TC#', 'Feature Area', 'Test Title', 'Pass/Fail', 'Initials'];
const colWidths = [80, 195, 80, 65, 60];

// Header row
doc.rect(50, tableTop, doc.page.width - 100, 18).fill(RED);
headers.forEach((h, i) => {
  doc.fillColor('#fff').fontSize(8).font('Helvetica-Bold')
     .text(h, cols[i], tableTop + 5, { width: colWidths[i] });
});

const rows = [
  ['TC-001–009', 'DVI Features', '9 test cases'],
  ['TC-010–012', 'Role Permissions', '3 test cases'],
  ['TC-013–016', 'Tech Restrictions', '4 test cases'],
  ['TC-017–019', 'Team Members / Invite', '3 test cases'],
  ['TC-020–023', 'Password Change', '4 test cases'],
  ['TC-024–027', 'Sidebar Badges', '4 test cases'],
  ['TC-028–030', 'Job Cards', '3 test cases'],
];

rows.forEach((row, idx) => {
  const y = tableTop + 18 + idx * 18;
  doc.rect(50, y, doc.page.width - 100, 18).fill(idx % 2 === 0 ? LIGHT : '#fff');
  doc.fillColor(DARK).fontSize(8).font('Helvetica')
     .text(row[0], cols[0], y + 5, { width: colWidths[0] })
     .text(row[1], cols[1], y + 5, { width: colWidths[1] })
     .text(row[2], cols[2], y + 5, { width: colWidths[2] });
  // Pass/Fail boxes
  doc.rect(cols[3] + 2, y + 3, 28, 12).lineWidth(0.5).strokeColor(BORDER).stroke();
  doc.rect(cols[3] + 35, y + 3, 28, 12).lineWidth(0.5).strokeColor(BORDER).stroke();
  doc.fillColor(GREEN).fontSize(7).font('Helvetica').text('PASS', cols[3] + 8, y + 6);
  doc.fillColor(RED).fontSize(7).font('Helvetica').text('FAIL', cols[3] + 41, y + 6);
  // Initials box
  doc.rect(cols[4] + 2, y + 3, 48, 12).lineWidth(0.5).strokeColor(BORDER).stroke();
  doc.fillColor(DARK);
});

doc.y = tableTop + 18 + rows.length * 18 + 20;

// Sign-off block
doc.rect(50, doc.y, doc.page.width - 100, 90).lineWidth(1).strokeColor(BORDER).stroke();
doc.fillColor(MUTED).fontSize(9).font('Helvetica-Bold').text('QA SIGN-OFF', 62, doc.y + 10);
const soY = doc.y + 28;
[['QA Tester:', 62], ['Approved by:', 260], ['Date:', 430]].forEach(([label, x]) => {
  doc.fillColor(MUTED).fontSize(8).font('Helvetica').text(label, x, soY);
  doc.rect(x, soY + 12, 150, 1).fill(DARK);
});
doc.fillColor(MUTED).fontSize(8).font('Helvetica')
   .text('Notes / Issues Found:', 62, soY + 30);
doc.rect(62, soY + 42, doc.page.width - 124, 1).fill(BORDER);
doc.rect(62, soY + 54, doc.page.width - 124, 1).fill(BORDER);

doc.y += 110;
doc.fillColor(MUTED).fontSize(8).font('Helvetica')
   .text('D1 Imports  ·  redlined1.com  ·  Powered by Redlined1  ·  Confidential', 50, doc.page.height - 40, { align: 'center' });

doc.end();
console.log('PDF generated:', outputPath);
