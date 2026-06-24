const PDFDocument = require('pdfkit');
const fs = require('fs');

const OUT = 'C:\\Users\\wallyd1\\Desktop\\Redline_Remaining_Tests_v1.pdf';
const doc = new PDFDocument({ size: 'LETTER', margins: { top: 55, bottom: 55, left: 60, right: 60 }, bufferPages: true });
doc.pipe(fs.createWriteStream(OUT));

const RED = '#CC0000', DARK = '#111111', MUTED = '#666666', GREEN = '#2E7D32';
const BLUE = '#1565C0', ORANGE = '#E65100', AMBER = '#F57F17';
const LINE = '#DDDDDD', W = doc.page.width - 120;

function addPageNums() {
  const r = doc.bufferedPageRange();
  for (let i = r.start; i < r.start + r.count; i++) {
    doc.switchToPage(i);
    doc.fontSize(9).fillColor(MUTED)
      .text(`Redline D1 — Remaining Tests & Pre-Flight  |  Page ${i + 1}`, 60, doc.page.height - 38, { width: W, align: 'center' });
  }
}

function hRule(color = LINE) { doc.moveTo(60, doc.y).lineTo(60 + W, doc.y).strokeColor(color).lineWidth(0.5).stroke(); doc.moveDown(0.4); }

function sectionHeader(num, title, color = RED) {
  if (doc.y > doc.page.height - 130) doc.addPage();
  doc.moveDown(0.8);
  doc.rect(60, doc.y, W, 32).fill(color);
  doc.fillColor('#fff').fontSize(13).font('Helvetica-Bold')
    .text(`${num}  —  ${title}`, 70, doc.y - 26, { width: W - 16 });
  doc.moveDown(2);
}

function testHeader(id, title, badge, badgeColor) {
  if (doc.y > doc.page.height - 160) doc.addPage();
  doc.moveDown(0.5);
  const ty = doc.y;
  doc.rect(60, ty, W, 24).fill('#EEEEEE');
  doc.fillColor(DARK).fontSize(11).font('Helvetica-Bold')
    .text(`TEST ${id}  —  ${title}`, 66, ty + 6, { width: W - 100 });
  if (badge) {
    doc.rect(60 + W - 95, ty + 4, 88, 16).fill(badgeColor || AMBER);
    doc.fillColor('#fff').fontSize(8).font('Helvetica-Bold')
      .text(badge, 60 + W - 92, ty + 8, { width: 82, align: 'center' });
  }
  doc.moveDown(1.6);
}

function step(num, text) {
  const sy = doc.y;
  doc.fillColor(RED).fontSize(10).font('Helvetica-Bold').text(`${num}.`, 60, sy, { width: 18 });
  doc.fillColor(DARK).fontSize(10).font('Helvetica').text(text, 80, sy, { width: W - 20 });
  doc.moveDown(0.38);
}

function expected(text) {
  doc.fillColor(GREEN).fontSize(9).font('Helvetica-Bold').text('Expected:', 60, doc.y, { continued: true });
  doc.fillColor('#2E5017').fontSize(9).font('Helvetica').text('  ' + text, { width: W });
  doc.moveDown(0.5);
}

function warn(text) {
  doc.rect(60, doc.y, W, 1).fill();
  const wy = doc.y;
  doc.rect(60, wy, W, 30).fill('#FFF8E1').strokeColor('#FFE082').lineWidth(0.5).stroke();
  doc.fillColor(AMBER).fontSize(9).font('Helvetica-Bold').text('⚠ ' + text, 68, wy + 9, { width: W - 16 });
  doc.moveDown(1.8);
}

function infoBox(text) {
  const iy = doc.y;
  doc.rect(60, iy, W, 1).fill();
  doc.rect(60, doc.y, W, 32).fill('#E3F2FD').strokeColor('#90CAF9').lineWidth(0.5).stroke();
  doc.fillColor(BLUE).fontSize(9).font('Helvetica-Bold').text('ℹ  ' + text, 68, doc.y + 10, { width: W - 16 });
  doc.moveDown(2.2);
}

function codeBlock(lines) {
  const cy = doc.y;
  const lineH = 14, pad = 10;
  const h = lines.length * lineH + pad * 2;
  doc.rect(60, cy, W, h).fill('#1E1E1E');
  lines.forEach((line, i) => {
    doc.fillColor('#D4D4D4').fontSize(9).font('Courier').text(line, 70, cy + pad + i * lineH, { width: W - 20 });
  });
  doc.y = cy + h + 8;
  doc.moveDown(0.4);
}

function passFailBar() {
  const py = doc.y + 2;
  doc.rect(60, py, 60, 18).strokeColor('#4CAF50').lineWidth(0.8).stroke();
  doc.fillColor('#4CAF50').fontSize(9).font('Helvetica-Bold').text('PASS', 60, py + 4, { width: 60, align: 'center' });
  doc.rect(132, py, 60, 18).strokeColor('#F44336').lineWidth(0.8).stroke();
  doc.fillColor('#F44336').fontSize(9).font('Helvetica-Bold').text('FAIL', 132, py + 4, { width: 60, align: 'center' });
  doc.rect(204, py, W - 144, 18).strokeColor('#BBBBBB').lineWidth(0.5).stroke();
  doc.fillColor(MUTED).fontSize(8).font('Helvetica').text('Notes:', 208, py + 5);
  doc.moveDown(1.6);
}

// ═══════════════════════════════════════════════════════════════
// COVER PAGE
// ═══════════════════════════════════════════════════════════════
doc.rect(0, 0, doc.page.width, 200).fill(RED);
doc.fillColor('#fff').fontSize(28).font('Helvetica-Bold').text('REDLINE D1', 60, 55);
doc.fontSize(17).font('Helvetica').text('Remaining Tests, Pre-Flight Checks & Setup', 60, 95);
doc.fontSize(11).fillColor('rgba(255,255,255,0.75)').text('Run these BEFORE signing off the release', 60, 122);

doc.fillColor(DARK).fontSize(11).font('Helvetica')
  .text('Date: June 17, 2026', 60, 230)
  .text('Scope: Items not covered in Test Procedures v2', 60, 248);

hRule();
doc.moveDown(0.5);
doc.fontSize(12).font('Helvetica-Bold').fillColor(DARK).text('WHY THIS DOCUMENT EXISTS', 60, doc.y);
doc.moveDown(0.4);
doc.fontSize(10).font('Helvetica').fillColor(MUTED).text(
  'Test Procedures v2 covers feature behaviour. This document covers the infrastructure and deployment layer — things that must be confirmed true in production before any feature test can pass. If a database column is missing or an environment variable is unset, the feature will silently fail even if the code is correct.',
  60, doc.y, { width: W }
);
doc.moveDown(1);
hRule();
doc.moveDown(0.5);

doc.fontSize(11).font('Helvetica-Bold').fillColor(DARK).text('SECTIONS IN THIS DOCUMENT');
doc.moveDown(0.5);
const sections = [
  ['Section 1', 'Supabase Database Migrations', '2 checks — MUST run before any feature test'],
  ['Section 2', 'Vercel Environment Variables', '3 checks — required for SMS notifications'],
  ['Section 3', 'Production Deployment Verification', '4 checks — confirm latest code is live'],
  ['Section 4', 'Payment Fixes Live Verification', '3 checks — confirm the two payment bugs are fixed'],
  ['Section 5', 'Help Page Verification', '4 checks — confirm new sections render correctly'],
  ['Section 6', 'Hard Refresh Protocol', 'Browser cache clearing steps'],
];
sections.forEach(([num, title, note]) => {
  doc.fillColor(RED).fontSize(10).font('Helvetica-Bold').text(num + '  ', 60, doc.y, { continued: true });
  doc.fillColor(DARK).font('Helvetica').text(title + '   ', { continued: true });
  doc.fillColor(MUTED).fontSize(9).text(note);
  doc.moveDown(0.45);
});

doc.moveDown(1);
doc.rect(60, doc.y, W, 52).fill('#FFF3E0').strokeColor('#FFCC02').lineWidth(0.8).stroke();
const bx = doc.y + 10;
doc.fillColor(AMBER).fontSize(11).font('Helvetica-Bold').text('RECOMMENDED ORDER', 70, bx);
doc.fillColor('#5D4037').fontSize(9).font('Helvetica')
  .text('Complete Section 1 (migrations) and Section 2 (env vars) FIRST. Then do Section 3 (deployment check). Then Sections 4 and 5. Do not test features until Sections 1-3 pass — a missing DB column will make all feature tests fail.', 70, bx + 18, { width: W - 20 });
doc.y = bx + 52;

doc.addPage();

// ═══════════════════════════════════════════════════════════════
// SECTION 1 — DATABASE MIGRATIONS
// ═══════════════════════════════════════════════════════════════
sectionHeader('SECTION 1', 'SUPABASE DATABASE MIGRATIONS', '#5D1A1A');
infoBox('Both migrations below must be run exactly once in your Supabase SQL Editor. They are idempotent (safe to re-run — use IF NOT EXISTS). If they have already been run, the column checks in Tests 1.1 and 1.2 will confirm that.');

testHeader('1.1', 'Customer Approval Column on Inspections Table', 'REQUIRED', '#5D1A1A');
warn('If this column is missing, the customer digital approval feature will silently fail — submissions will appear to work but nothing will be stored.');
step(1, 'Log in to your Supabase dashboard at supabase.com');
step(2, 'Click "SQL Editor" in the left sidebar');
step(3, 'Paste and run the following migration:');
codeBlock([
  '-- migration_customer_approval.sql',
  'ALTER TABLE inspections',
  '  ADD COLUMN IF NOT EXISTS customer_approval JSONB;',
]);
step(4, 'After running, verify by going to Table Editor → inspections → Columns');
expected('A column named "customer_approval" of type JSONB exists in the inspections table. The migration completes with no errors.');
step(5, 'Alternatively, run this verification query in SQL Editor:');
codeBlock([
  'SELECT column_name, data_type',
  'FROM information_schema.columns',
  "WHERE table_name = 'inspections'",
  "  AND column_name = 'customer_approval';",
]);
expected('Query returns 1 row: customer_approval | jsonb');
passFailBar();

testHeader('1.2', 'Repair Stage Columns on Job Cards Table', 'REQUIRED', '#5D1A1A');
warn('If these columns are missing, the Status Tracker will fail to initialize — clicking the Status Tracker button will produce an error or generate a URL that never loads.');
step(1, 'In the Supabase SQL Editor, paste and run the following migration:');
codeBlock([
  '-- migration_repair_stages.sql',
  'ALTER TABLE job_cards ADD COLUMN IF NOT EXISTS status_token TEXT UNIQUE;',
  'ALTER TABLE job_cards ADD COLUMN IF NOT EXISTS repair_stage TEXT DEFAULT \'checked_in\';',
  'ALTER TABLE job_cards ADD COLUMN IF NOT EXISTS stage_history JSONB DEFAULT \'[]\';',
  'ALTER TABLE job_cards ADD COLUMN IF NOT EXISTS customer_phone TEXT;',
  'ALTER TABLE job_cards ADD COLUMN IF NOT EXISTS customer_email TEXT;',
  '',
  'CREATE INDEX IF NOT EXISTS idx_job_cards_status_token',
  '  ON job_cards (status_token);',
]);
step(2, 'After running, verify with this query:');
codeBlock([
  'SELECT column_name, data_type, column_default',
  'FROM information_schema.columns',
  "WHERE table_name = 'job_cards'",
  "  AND column_name IN ('status_token','repair_stage','stage_history',",
  "                      'customer_phone','customer_email')",
  'ORDER BY column_name;',
]);
expected('Query returns exactly 5 rows — one for each column. repair_stage has default "checked_in", stage_history has default "[]".');
passFailBar();

doc.addPage();

// ═══════════════════════════════════════════════════════════════
// SECTION 2 — ENVIRONMENT VARIABLES
// ═══════════════════════════════════════════════════════════════
sectionHeader('SECTION 2', 'VERCEL ENVIRONMENT VARIABLES', BLUE);
infoBox('These env vars are required for SMS notifications in the Status Tracker. The feature works fine without them (SMS is optional), but without them the SMS checkbox will always return "Twilio not configured". Set them once in Vercel and redeploy.');

testHeader('2.1', 'Twilio Environment Variables in Vercel', 'FOR SMS', BLUE);
step(1, 'Log in to your Vercel dashboard at vercel.com');
step(2, 'Open your Redlined1 project → Settings → Environment Variables');
step(3, 'Add the following three variables (all environments: Production, Preview, Development):');
doc.moveDown(0.3);
const vars = [
  ['TWILIO_ACCOUNT_SID', 'Your Twilio Account SID — starts with "AC"', 'Found in Twilio Console → Account Info'],
  ['TWILIO_AUTH_TOKEN', 'Your Twilio Auth Token', 'Found in Twilio Console → Account Info'],
  ['TWILIO_PHONE_NUMBER', 'Your Twilio phone number in E.164 format', 'e.g. +15550001234'],
];
vars.forEach(([name, desc, source]) => {
  const vy = doc.y;
  doc.rect(60, vy, W, 38).fill('#F0F4FF').strokeColor('#90CAF9').lineWidth(0.5).stroke();
  doc.fillColor(BLUE).fontSize(10).font('Courier').text(name, 68, vy + 6, { width: W - 16 });
  doc.fillColor(DARK).fontSize(9).font('Helvetica').text(desc, 68, vy + 19, { width: W / 2 });
  doc.fillColor(MUTED).fontSize(9).font('Helvetica-Oblique').text(source, 68 + W / 2, vy + 19, { width: W / 2 - 16 });
  doc.y = vy + 46;
});
doc.moveDown(0.5);
step(4, 'After adding all three, click "Save" then go to Deployments → Redeploy (or push a new commit to trigger a deploy)');
expected('After redeployment, opening the Status Tracker and advancing a stage with SMS checked shows "SMS sent ✓" for a real phone number, instead of "Twilio not configured".');
passFailBar();

testHeader('2.2', 'Resend Email API Key (Already Configured)', 'VERIFY', GREEN);
infoBox('RESEND_API_KEY should already be set from a previous session. This test confirms it is still present and working.');
step(1, 'In Vercel → Settings → Environment Variables, confirm RESEND_API_KEY exists');
step(2, 'Open the Status Tracker for a job, advance a stage with Email checked, enter a real email address');
expected('Email arrives in inbox within 60 seconds with shop branding, stage name, and "Track Your Repair Live" button. No "Resend not configured" error in notification result.');
passFailBar();

testHeader('2.3', 'No Missing Required Variables', 'VERIFY', BLUE);
step(1, 'In Vercel → Settings → Environment Variables, confirm the following are present:');
const requiredVars = [
  'NEXT_PUBLIC_SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_ANON_KEY',
  'SUPABASE_SERVICE_ROLE_KEY',
  'RESEND_API_KEY',
  'NEXT_PUBLIC_SITE_URL  (should be https://redlined1.com)',
];
requiredVars.forEach((v, i) => {
  const ry = doc.y;
  doc.rect(60, ry, 14, 14).strokeColor('#999').lineWidth(0.7).stroke();
  doc.fillColor(DARK).fontSize(10).font('Courier').text(v, 82, ry + 1, { width: W - 22 });
  doc.moveDown(0.5);
});
doc.moveDown(0.3);
expected('All 5 variables are present. None are blank or show a placeholder value like "your-key-here".');
passFailBar();

doc.addPage();

// ═══════════════════════════════════════════════════════════════
// SECTION 3 — DEPLOYMENT VERIFICATION
// ═══════════════════════════════════════════════════════════════
sectionHeader('SECTION 3', 'PRODUCTION DEPLOYMENT VERIFICATION', '#1B5E20');
infoBox('Three separate deployments were pushed in this session. This section confirms all three are live in production and the browser is not serving a cached older version.');

testHeader('3.1', 'Confirm Latest Deployment Is Live', 'CRITICAL', '#1B5E20');
step(1, 'Go to your Vercel dashboard → Deployments tab');
step(2, 'Confirm the most recent deployment shows status "Ready" (green)');
step(3, 'Check the commit message of the latest deployment');
expected('Latest deployment commit message reads: "Update Help page with Customer Digital Approval and Status Tracker docs". Status is Ready, not Building or Error.');
passFailBar();

testHeader('3.2', 'Hard Refresh on All Affected Pages', 'REQUIRED', '#1B5E20');
warn('Browsers cache JavaScript aggressively. After any deployment, always hard refresh before testing. Without this, you are testing the old version.');
step(1, 'Open redlined1.com in Chrome or Edge');
step(2, 'Press Ctrl + Shift + R (Windows) or Cmd + Shift + R (Mac) — this is a hard refresh that bypasses cache');
step(3, 'Navigate to Payments module, then hard refresh again on that page');
step(4, 'Navigate to Help page, then hard refresh');
step(5, 'Open the customer status page (any /status/[token] URL) and hard refresh');
step(6, 'Open the customer inspection share page (any /inspection/[token] URL) and hard refresh');
expected('All pages load without JavaScript errors in the browser console (press F12 → Console to check). No "Failed to load chunk" or "Unexpected token" errors.');
passFailBar();

testHeader('3.3', 'Verify No Console Errors on Dashboard Load', 'VERIFY', '#1B5E20');
step(1, 'Open redlined1.com and sign in');
step(2, 'Press F12 to open DevTools → click the Console tab');
step(3, 'Navigate through: Dashboard → Job Cards → Payments → Inspections');
expected('Console shows no red errors. Yellow warnings are acceptable. Specifically, no errors referencing "amountStr", "STAGES", "stageHistory", or "customerApproval".');
passFailBar();

testHeader('3.4', 'Verify Build Version (Optional)', 'OPTIONAL', MUTED);
step(1, 'In your browser DevTools → Network tab, reload the page');
step(2, 'Filter for "/_next/static" requests — look at the hash in the filename (e.g. _next/static/chunks/app/page-[hash].js)');
step(3, 'Compare the hash to what was visible before today\'s deployment');
expected('The hash has changed from before today\'s deployments, confirming new code is being served.');
passFailBar();

doc.addPage();

// ═══════════════════════════════════════════════════════════════
// SECTION 4 — PAYMENT FIXES LIVE VERIFICATION
// ═══════════════════════════════════════════════════════════════
sectionHeader('SECTION 4', 'PAYMENT FIXES LIVE VERIFICATION', ORANGE);
infoBox('Two payment bugs were fixed and deployed. These tests must be run on the LIVE site (redlined1.com) after a hard refresh — not on localhost. Both bugs were confirmed present in production before the fix.');

testHeader('4.1', 'Amount Field — No Leading Zero (LIVE)', 'DEPLOYED FIX', ORANGE);
warn('This bug was still visible in the last production screenshot taken at 9:40 AM. Run this test after hard refresh to confirm the fix is now live.');
step(1, 'Hard refresh redlined1.com (Ctrl+Shift+R)');
step(2, 'Go to Payments module');
step(3, 'Click "Record Payment" to open the form');
step(4, 'Click into the Amount field — it should appear completely EMPTY (no "0" pre-filled)');
expected('Field is blank with a "0.00" placeholder shown in grey. There is no zero in the field.');
step(5, 'Type the number 55 one digit at a time: press 5, then press 5');
expected('Field shows "55" — NOT "055". No leading zero at any point during typing.');
step(6, 'Clear the field (select all + delete)');
expected('Field returns to empty/placeholder state.');
step(7, 'Try submitting with the field empty (amount = 0)');
expected('Validation error: "Amount must be greater than 0." Form does not submit.');
passFailBar();

testHeader('4.2', 'Digital Payment Methods Showing (LIVE)', 'DEPLOYED FIX', ORANGE);
warn('This bug was confirmed in the last screenshot — PayPal, Cash App, Wise were missing from the Digital group. The fix merged saved shop settings with new defaults.');
step(1, 'Hard refresh redlined1.com');
step(2, 'Go to Payments → Record Payment');
step(3, 'Open the Payment Method dropdown');
step(4, 'Scroll to the "Digital" group');
expected('Digital group contains ALL of the following — check each one:');
const methods = ['PayPal', 'Apple Pay', 'Google Pay', 'Venmo', 'Zelle', 'Cash App', 'Wise'];
methods.forEach(m => {
  const my = doc.y;
  doc.rect(60, my, 12, 12).strokeColor('#999').lineWidth(0.7).stroke();
  doc.fillColor(DARK).fontSize(10).font('Helvetica').text(m, 80, my + 1);
  doc.moveDown(0.45);
});
doc.moveDown(0.3);
step(5, 'Scroll to the "Bank" group');
expected('Bank group contains "Bank Transfer / ACH" and "Wire Transfer".');
passFailBar();

testHeader('4.3', 'Record a Payment with a Digital Method End-to-End', 'SMOKE TEST', ORANGE);
step(1, 'In the Record Payment form, select "PayPal" as the payment method');
step(2, 'Select a customer from the dropdown');
step(3, 'Enter amount: 75');
step(4, 'Set status to "Recorded" and click "Record Payment"');
expected('Payment saves successfully. Appears in the register on the right with method shown as "PayPal" and amount "$75.00". The "Collected by Method" panel updates to include a PayPal row.');
passFailBar();

doc.addPage();

// ═══════════════════════════════════════════════════════════════
// SECTION 5 — HELP PAGE VERIFICATION
// ═══════════════════════════════════════════════════════════════
sectionHeader('SECTION 5', 'HELP PAGE VERIFICATION', BLUE);
infoBox('The Help page was updated with two new sections, updated existing sections, and new FAQs. This section confirms all new content renders correctly and sidebar navigation works.');

testHeader('5.1', 'New Sidebar Items Are Visible', 'NEW CONTENT', BLUE);
step(1, 'Navigate to redlined1.com/help (hard refresh first)');
step(2, 'Look at the left sidebar under "Pro Guides"');
expected('Two new sidebar items are visible: "✍️ Customer Digital Approval" and "📍 Live Repair Status Tracker"');
step(3, 'Confirm existing items are still present: Vehicles, Job Cards & Repair Orders, Digital Vehicle Inspections, Estimates, Parts & Inventory, Technicians, Appointments & Maintenance, Payments, Mobile Mechanic, Settings');
expected('No existing items are missing. The sidebar did not break.');
passFailBar();

testHeader('5.2', 'Customer Digital Approval Section Content', 'NEW CONTENT', BLUE);
step(1, 'Click "✍️ Customer Digital Approval" in the sidebar');
expected('Section loads with the heading "Customer Digital Approval" and 5 subsections:');
const approvalSubs = [
  '1. What Is Per-Item Digital Approval?',
  '2. Generating the Customer Approval Link',
  '3. What the Customer Sees',
  '4. The Digital Signature',
  '5. Reading Results & Acting on Them',
];
approvalSubs.forEach(s => {
  doc.fillColor(DARK).fontSize(10).font('Helvetica').text('  • ' + s, 68, doc.y, { width: W - 16 });
  doc.moveDown(0.35);
});
doc.moveDown(0.3);
expected('All 5 subsections display with readable content. No "[object Object]" or blank cards. Content references per-item approve/decline, digital signature, and admin panel results.');
passFailBar();

testHeader('5.3', 'Live Repair Status Tracker Section Content', 'NEW CONTENT', BLUE);
step(1, 'Click "📍 Live Repair Status Tracker" in the sidebar');
expected('Section loads with 6 subsections:');
const trackerSubs = [
  '1. What Is the Status Tracker?',
  '2. The 6 Repair Stages',
  '3. Setting Up a Tracker for a Job',
  '4. Advancing Stages & Notifying the Customer',
  '5. The Customer Status Page',
  '6. Stage History & Audit Trail',
];
trackerSubs.forEach(s => {
  doc.fillColor(DARK).fontSize(10).font('Helvetica').text('  • ' + s, 68, doc.y, { width: W - 16 });
  doc.moveDown(0.35);
});
doc.moveDown(0.3);
expected('All 6 subsections display correctly. Content describes the 6 stages by name, SMS/email options, and the auto-refresh customer page.');
passFailBar();

testHeader('5.4', 'Updated FAQ Entries', 'NEW CONTENT', BLUE);
step(1, 'Click "FAQ" in the sidebar');
step(2, 'Scroll through and confirm the following new questions are present:');
const newFaqs = [
  'Can customers approve repairs individually instead of all at once?',
  'Can customers track their repair in real time?',
  'What digital payment methods does Redlined1 support?',
];
newFaqs.forEach(q => {
  const fy = doc.y;
  doc.rect(60, fy, 12, 12).strokeColor('#999').lineWidth(0.7).stroke();
  doc.fillColor(DARK).fontSize(10).font('Helvetica').text(q, 80, fy + 1, { width: W - 22 });
  doc.moveDown(0.5);
});
doc.moveDown(0.3);
step(3, 'Click each new FAQ to expand it and read the answer');
expected('Each FAQ expands to show a relevant answer. The DVI FAQ now mentions per-item approval (not "one tap"). The tracking FAQ mentions 30-second auto-refresh. The payments FAQ lists PayPal, Cash App, Wise etc.');
passFailBar();

doc.addPage();

// ═══════════════════════════════════════════════════════════════
// SECTION 6 — HARD REFRESH PROTOCOL
// ═══════════════════════════════════════════════════════════════
sectionHeader('SECTION 6', 'HARD REFRESH & CACHE CLEARING PROTOCOL', '#4A148C');
infoBox('Browsers cache JavaScript, CSS, and fonts aggressively. After any Vercel deployment, run through this protocol before testing — otherwise you may be testing the old version and get false failures.');

doc.moveDown(0.3);
doc.fontSize(12).font('Helvetica-Bold').fillColor(DARK).text('On Windows (Chrome / Edge / Firefox)');
doc.moveDown(0.4);
[
  'Press Ctrl + Shift + R on the page you want to test',
  'OR open DevTools (F12) → right-click the Reload button → "Empty Cache and Hard Reload"',
  'OR press Ctrl + Shift + Delete → check "Cached images and files" → Clear data → then reload',
].forEach((t, i) => {
  doc.fillColor(RED).fontSize(10).font('Helvetica-Bold').text(`${i + 1}.`, 60, doc.y, { width: 18 });
  doc.fillColor(DARK).fontSize(10).font('Helvetica').text(t, 80, doc.y - 12, { width: W - 20 });
  doc.moveDown(0.5);
});

doc.moveDown(0.5);
doc.fontSize(12).font('Helvetica-Bold').fillColor(DARK).text('On Mobile (iOS Safari or Android Chrome)');
doc.moveDown(0.4);
[
  'iOS Safari: Settings app → Safari → Clear History and Website Data',
  'Android Chrome: tap the three-dot menu → Settings → Privacy → Clear browsing data → check Cached images → Clear data',
  'After clearing, re-open redlined1.com and sign in again',
].forEach((t, i) => {
  doc.fillColor(RED).fontSize(10).font('Helvetica-Bold').text(`${i + 1}.`, 60, doc.y, { width: 18 });
  doc.fillColor(DARK).fontSize(10).font('Helvetica').text(t, 80, doc.y - 12, { width: W - 20 });
  doc.moveDown(0.5);
});

doc.moveDown(1);
hRule('#cc0000');
doc.moveDown(0.6);

doc.fontSize(13).font('Helvetica-Bold').fillColor(DARK).text('OVERALL SIGN-OFF CHECKLIST');
doc.moveDown(0.6);

const signoff = [
  ['Section 1.1', 'customer_approval column confirmed in Supabase inspections table'],
  ['Section 1.2', 'repair_stage / stage_history / status_token columns confirmed in job_cards table'],
  ['Section 2.1', 'TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_PHONE_NUMBER set in Vercel'],
  ['Section 2.2', 'RESEND_API_KEY confirmed present and working'],
  ['Section 3.1', 'Latest Vercel deployment shows status "Ready"'],
  ['Section 3.2', 'Hard refresh completed on all test pages'],
  ['Section 3.3', 'No console errors on dashboard load'],
  ['Section 4.1', 'Amount field starts blank — no leading zero'],
  ['Section 4.2', 'PayPal, Cash App, Wise visible in Digital payment methods group'],
  ['Section 4.3', 'End-to-end payment with PayPal method saves correctly'],
  ['Section 5.1', 'Two new Help sidebar items visible'],
  ['Section 5.2', 'Customer Digital Approval section — 5 subsections render'],
  ['Section 5.3', 'Status Tracker section — 6 subsections render'],
  ['Section 5.4', 'Three new FAQs present and expandable'],
];

signoff.forEach(([id, desc], i) => {
  const sy = doc.y;
  const bg = i % 2 === 0 ? '#FFFFFF' : '#F9F9F9';
  doc.rect(60, sy, W, 18).fill(bg);
  doc.rect(60, sy, 14, 14).strokeColor('#999').lineWidth(0.7).stroke().fillColor(bg);
  doc.fillColor(RED).fontSize(9).font('Helvetica-Bold').text(id, 80, sy + 3, { width: 70 });
  doc.fillColor(DARK).fontSize(9).font('Helvetica').text(desc, 158, sy + 3, { width: W - 102 });
  doc.y = sy + 20;
});

doc.moveDown(1.5);
hRule();
doc.moveDown(0.5);
doc.fontSize(9).font('Helvetica').fillColor(MUTED)
  .text('Once all 14 items above are checked, the release is complete. Combine this sign-off with the Test Procedures v2 sign-off page for a full QA record.', 60, doc.y, { width: W });

addPageNums();
doc.end();
console.log('PDF written to:', OUT);
