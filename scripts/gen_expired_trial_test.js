const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');

const OUT = path.join(__dirname, 'Test_Expired_Trial_Gate.pdf');
const doc = new PDFDocument({ margin: 55, size: 'LETTER' });
doc.pipe(fs.createWriteStream(OUT));

const RED    = '#cc0000';
const DARK   = '#111111';
const MUTED  = '#666666';
const GREEN  = '#1a7a1a';
const LGRAY  = '#dddddd';
const BGCODE = '#f5f5f5';

// ── helpers ──────────────────────────────────────────────────────
function rule(color = LGRAY, y) {
  const yy = y ?? doc.y;
  doc.moveTo(55, yy).lineTo(557, yy).strokeColor(color).lineWidth(color === RED ? 2 : 0.75).stroke();
  doc.moveDown(0.4);
}

function h1(text) {
  doc.fontSize(20).fillColor(RED).font('Helvetica-Bold').text(text, { continued: false });
}
function h2(text) {
  doc.moveDown(0.5);
  doc.fontSize(13).fillColor(DARK).font('Helvetica-Bold').text(text);
  doc.moveDown(0.25);
}
function body(text, indent = 0) {
  doc.fontSize(10).fillColor(DARK).font('Helvetica').text(text, 55 + indent, doc.y, { width: 502 - indent });
}
function muted(text) {
  doc.fontSize(9).fillColor(MUTED).font('Helvetica').text(text, { width: 502 });
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
function check(text, indent = 0) {
  doc.fontSize(10).fillColor(DARK).font('Helvetica')
    .text('☐  ' + text, 55 + indent, doc.y, { width: 502 - indent });
}

// row: [label, value, pass]
function tableRow(cols, widths, bg, isHeader) {
  const x = 55, pad = 6;
  const rowH = 20;
  let cx = x;
  if (bg) {
    doc.rect(x, doc.y, widths.reduce((a,b)=>a+b,0), rowH).fill(bg);
  }
  const ty = doc.y + 5;
  cols.forEach((col, i) => {
    doc.fontSize(9)
       .fillColor(isHeader ? '#ffffff' : DARK)
       .font(isHeader ? 'Helvetica-Bold' : 'Helvetica')
       .text(col, cx + pad, ty, { width: widths[i] - pad * 2, height: rowH });
    cx += widths[i];
  });
  doc.y += rowH;
}
function tableSection(headers, rows, headerBg, oddBg) {
  const w = [180, 262, 60];
  tableRow(headers, w, headerBg, true);
  rows.forEach((r, i) => tableRow(r, w, i % 2 === 0 ? oddBg : '#ffffff', false));
  // border
  const total = w.reduce((a,b)=>a+b,0);
  doc.rect(55, doc.y - rows.length * 20 - 20, total, rows.length * 20 + 20)
     .strokeColor(LGRAY).lineWidth(0.5).stroke();
  doc.moveDown(0.4);
}

// ── PAGE 1 ───────────────────────────────────────────────────────
h1('Expired Trial Plan Gate');
doc.fontSize(15).fillColor(DARK).font('Helvetica-Bold').text('Test Procedure');
doc.fontSize(10).fillColor(MUTED).font('Helvetica').text('Version 1.0  |  Date: 2026-06-17  |  Product: Redlined1');
doc.moveDown(0.5);
rule(RED);

// Objective
h2('Objective');
body('Verify that after a 7-day trial expires, the plan gate locks all modules except Dashboard, Settings, and Plans & Gates. Confirm that an active trial account retains unrestricted full access.');

// Pre-flight
h2('Pre-Flight Checklist');
check('You have access to the Supabase Dashboard SQL Editor');
check('You have a test email address ready (e.g. testexpired@redlined1.com)');
check('redlined1.com is deployed and accessible in a browser');
check('You are NOT logged in as your main owner account during these tests');
doc.moveDown(0.5);

rule();

// Step 1
h2('Step 1 — Create the Test Account  (one-time setup)');
body('1a.  Go to Supabase Dashboard → Authentication → Users → Invite User', 14);
body('1b.  Enter email: testexpired@redlined1.com  and a test password', 14);
body('1c.  Confirm the profile row exists — run in SQL Editor:', 14);
code("SELECT id, plan, trial_ends_at FROM public.profiles\nWHERE id = (SELECT id FROM auth.users\n            WHERE email = 'testexpired@redlined1.com');");
muted('Expected: row exists with plan = \'trial\' and trial_ends_at set ~7 days from signup.');
rule();

// Step 2
h2('Step 2 — Expire the Trial');
body('Run this SQL in Supabase → SQL Editor:');
code("UPDATE public.profiles\nSET plan = 'trial',\n    trial_ends_at = now() - INTERVAL '1 day'\nWHERE id = (\n  SELECT id FROM auth.users\n  WHERE email = 'testexpired@redlined1.com'\n);");
body('Then verify the update:');
code("SELECT u.email, p.plan, p.trial_ends_at\nFROM auth.users u\nJOIN public.profiles p ON p.id = u.id\nWHERE u.email = 'testexpired@redlined1.com';");
muted("Expected: trial_ends_at is in the past (yesterday's date or earlier).");
rule();

// Step 3
h2('Step 3 — Log In as the Expired Test Account');
body('3a.  Open a private / incognito browser window', 14);
body('3b.  Navigate to redlined1.com → Sign In', 14);
body('3c.  Enter credentials for testexpired@redlined1.com', 14);
rule();

// Step 4
h2('Step 4 — Verify Module Lock-Down');
body('Click every sidebar item and mark the result in the tables below.');
doc.moveDown(0.4);

body('SHOULD BE ACCESSIBLE (3 modules):', 0);
doc.fontSize(9).fillColor(GREEN).font('Helvetica-Bold').text('');
doc.moveDown(0.15);
tableSection(
  ['Module', 'Expected Result', 'Pass?'],
  [
    ['Dashboard',     'Opens normally — data is visible',   '[ ]'],
    ['Settings',      'Opens normally — can edit branding', '[ ]'],
    ['Plans & Gates', 'Opens upgrade / subscription page',  '[ ]'],
  ],
  GREEN, '#f0fff4'
);

body('SHOULD BE LOCKED (21 modules — expect upgrade prompt):', 0);
doc.moveDown(0.15);
tableSection(
  ['Module', 'Expected Result', 'Pass?'],
  [
    ['Customers',             'Shows upgrade gate / prompt', '[ ]'],
    ['Vehicles',              'Shows upgrade gate / prompt', '[ ]'],
    ['Appointments',          'Shows upgrade gate / prompt', '[ ]'],
    ['Job Cards',             'Shows upgrade gate / prompt', '[ ]'],
    ['Time Tracking',         'Shows upgrade gate / prompt', '[ ]'],
    ['Maintenance Schedules', 'Shows upgrade gate / prompt', '[ ]'],
    ['Inspections',           'Shows upgrade gate / prompt', '[ ]'],
    ['Estimates',             'Shows upgrade gate / prompt', '[ ]'],
    ['Repair Orders',         'Shows upgrade gate / prompt', '[ ]'],
    ['Technicians',           'Shows upgrade gate / prompt', '[ ]'],
    ['Parts',                 'Shows upgrade gate / prompt', '[ ]'],
    ['Invoicing',             'Shows upgrade gate / prompt', '[ ]'],
    ['Payments',              'Shows upgrade gate / prompt', '[ ]'],
    ['Communication',         'Shows upgrade gate / prompt', '[ ]'],
    ['VIN Decode',            'Shows upgrade gate / prompt', '[ ]'],
    ['DTC Lookup',            'Shows upgrade gate / prompt', '[ ]'],
    ['Diagnostics',           'Shows upgrade gate / prompt', '[ ]'],
    ['AI Copilot',            'Shows upgrade gate / prompt', '[ ]'],
    ['Reports',               'Shows upgrade gate / prompt', '[ ]'],
    ['Labor Guide',           'Shows upgrade gate / prompt', '[ ]'],
    ['Login & Roles',         'Shows upgrade gate / prompt', '[ ]'],
  ],
  RED, '#fff0f0'
);

muted('Pass criteria: All 21 modules above show gate/upgrade prompt. Zero modules bypass the lock.');
rule();

// Step 5
h2('Step 5 — Verify Active Trial Still Has Full Access');
body('5a.  Open a second incognito window', 14);
body('5b.  Log in as your main owner account (active trial or pro)', 14);
body('5c.  Click every sidebar module — all should open normally', 14);
doc.moveDown(0.25);
muted('Pass criteria: No lockouts on the active account. Every module is accessible.');
rule();

// Step 6
h2('Step 6 — Reset the Test Account  (Cleanup)');
body('Restore the test account to an active trial for future test runs:');
code("UPDATE public.profiles\nSET trial_ends_at = now() + INTERVAL '7 days'\nWHERE id = (\n  SELECT id FROM auth.users\n  WHERE email = 'testexpired@redlined1.com'\n);");

// Sign-off
rule(RED);
h2('Pass / Fail Sign-Off');
const soY = doc.y;
doc.fontSize(10).fillColor(DARK).font('Helvetica-Bold').text('Tester Name:', 55, soY);
doc.font('Helvetica').text('___________________________________', 140, soY);
doc.font('Helvetica-Bold').text('Date Tested:', 360, soY);
doc.font('Helvetica').text('________________', 440, soY);
doc.moveDown(0.8);
doc.font('Helvetica-Bold').text('Result:', 55, doc.y);
doc.font('Helvetica').text('☐  PASS        ☐  FAIL', 110, doc.y);
doc.moveDown(0.8);
doc.font('Helvetica-Bold').text('Notes:', 55, doc.y);
doc.font('Helvetica').text('________________________________________________________________________', 100, doc.y);
doc.moveDown(0.6);
doc.fontSize(9).fillColor(RED).font('Helvetica')
  .text('If FAIL — document which modules were incorrectly accessible and file a bug report.');

doc.end();
console.log('PDF written to', OUT);
