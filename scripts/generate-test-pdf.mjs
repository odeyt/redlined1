/**
 * Generates Redlined1-Test-Procedures.pdf using only Node built-ins.
 * Run: node scripts/generate-test-pdf.mjs
 * Output: D1-Imports-Test-Procedures.pdf  →  scripts/Redlined1-Test-Procedures.pdf
 */

import { writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));

/* ── PDF primitive helpers ── */
const objects = [];
let oid = 0;
function obj(content) {
  const id = ++oid;
  objects.push({ id, content });
  return id;
}

function pdfStr(s) {
  return s.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
}

/* ── Content ── */
const RED = '0.8 0 0';
const DARK = '0.05 0.05 0.05';
const GREY = '0.45 0.45 0.45';
const LINE = '0.88 0.88 0.88';

const SECTIONS = [
  {
    title: 'Parts Orders',
    icon: '🛒',
    steps: [
      { id: 'PO-01', desc: 'Navigate to Parts Orders in sidebar', expected: 'Parts Orders page loads with stats bar and empty table' },
      { id: 'PO-02', desc: 'Click "+ New Parts Order"', expected: 'New Parts Order modal opens with all form sections visible' },
      { id: 'PO-03', desc: 'Enter Part Name "Front Brake Rotor" and Part Number "BR-1234"', expected: 'Fields accept input; Part Name marked with *' },
      { id: 'PO-04', desc: 'Select Condition = "New", Quantity = 2', expected: 'Dropdowns and number field respond correctly' },
      { id: 'PO-05', desc: 'Select a Customer from dropdown', expected: 'Customer list populates from live DB; selection is retained' },
      { id: 'PO-06', desc: 'Select a Vehicle for the chosen customer', expected: 'Vehicle dropdown filters to only that customer\'s vehicles' },
      { id: 'PO-07', desc: 'Click "+ Add" next to Vendor and create vendor "AutoZone Pro"', expected: 'Vendor modal opens; vendor saved; vendor name, phone, email auto-fill' },
      { id: 'PO-08', desc: 'Select Currency = "CAD"', expected: 'Currency changes to CAD; all price fields show CA$ symbol' },
      { id: 'PO-09', desc: 'Enter Unit Cost = 85.00, Core Charge = 20.00, Deposit Paid = 50.00', expected: 'Total = CA$170.00, Balance = CA$140.00, Status = Partial (auto-calculated)' },
      { id: 'PO-10', desc: 'Set Order Status = "Ordered", ETR date to next week', expected: 'Fields accept values; date picker works' },
      { id: 'PO-11', desc: 'Enter Job Card # "JC-1001"', expected: 'Text field accepts input' },
      { id: 'PO-12', desc: 'Click "Review & Save"', expected: 'Confirmation modal appears with full order summary showing all entered values' },
      { id: 'PO-13', desc: 'Verify confirmation modal shows correct Part, Customer, Vehicle, Currency, Total, Balance', expected: 'All values match what was entered in the form' },
      { id: 'PO-14', desc: 'Click "← Back to Edit"', expected: 'Returns to form with all values preserved; nothing saved yet' },
      { id: 'PO-15', desc: 'Click "Review & Save" again then "✓ Confirm & Save"', expected: 'Modal closes; toast "Front Brake Rotor order saved" appears; order appears in table' },
      { id: 'PO-16', desc: 'Verify stats bar updates: On Order = 1', expected: 'Stats cards reflect the new order' },
      { id: 'PO-17', desc: 'Click the order row', expected: 'Detail drawer opens showing all order fields, pricing breakdown, vendor info, dates, linked records' },
      { id: 'PO-18', desc: 'Click "✏ Edit" in drawer', expected: 'Edit form opens pre-filled with order data' },
      { id: 'PO-19', desc: 'Change status to "Received" and click "Review & Update" → "✓ Confirm Update"', expected: 'Order updated; status badge changes to green "Received"' },
      { id: 'PO-20', desc: 'Click Remove on the order row and confirm', expected: 'Order removed from table; toast confirms; stats update' },
    ],
  },
  {
    title: 'Vendor Management',
    icon: '🏭',
    steps: [
      { id: 'VM-01', desc: 'Open New Parts Order form', expected: 'Form loads' },
      { id: 'VM-02', desc: 'Click "+ Add" next to Vendor Name', expected: 'Add Vendor modal opens' },
      { id: 'VM-03', desc: 'Fill: Name="NAPA Auto", Phone="555-111-2222", Email="parts@napa.com", Website="napa.com", Notes="Account #8821"', expected: 'All fields accept input' },
      { id: 'VM-04', desc: 'Click "Add Vendor"', expected: 'Modal closes; vendor appears in Vendor Name dropdown; phone and email auto-fill on the order form' },
      { id: 'VM-05', desc: 'Select the vendor from the dropdown on a new order', expected: 'Phone and email fields populate automatically from saved vendor data' },
      { id: 'VM-06', desc: 'Try saving vendor with blank name', expected: 'Form does not submit; Name field is required' },
    ],
  },
  {
    title: 'Customer Edit',
    icon: '✏️',
    steps: [
      { id: 'CE-01', desc: 'Go to Customers in sidebar', expected: 'Customer list loads' },
      { id: 'CE-02', desc: 'Click any customer row', expected: 'Detail drawer opens on right side with customer info' },
      { id: 'CE-03', desc: 'Click "✏ Edit" button in drawer header', expected: 'Drawer switches to inline edit form pre-filled with customer data' },
      { id: 'CE-04', desc: 'Change phone number and email', expected: 'Fields are editable; new values typed correctly' },
      { id: 'CE-05', desc: 'Click "Save Changes"', expected: 'Drawer returns to view mode; updated phone and email displayed; customer list row also reflects change' },
      { id: 'CE-06', desc: 'Open the same customer, click Edit, change name, then click Cancel', expected: 'Drawer returns to view mode; original name unchanged; no DB write occurred' },
      { id: 'CE-07', desc: 'Edit customer — change type to "Business"', expected: 'Type field updates; tag and follow-up fields also editable' },
    ],
  },
  {
    title: 'Appointments — Edit & Remove',
    icon: '📅',
    steps: [
      { id: 'AP-01', desc: 'Go to Appointments in sidebar', expected: 'Appointments table loads with booking list' },
      { id: 'AP-02', desc: 'Click "+ Book Appointment"', expected: 'Booking modal opens with time, customer, vehicle, service, bay, technician, reminder fields' },
      { id: 'AP-03', desc: 'Fill all required fields and click "Book Appointment"', expected: 'Modal closes; new row appears in table with all entered data' },
      { id: 'AP-04', desc: 'Click "Edit" on the new appointment row', expected: 'Booking modal opens pre-filled with appointment data; header reads "Edit Appointment"' },
      { id: 'AP-05', desc: 'Change the service type and bay, click "Update Appointment"', expected: 'Modal closes; row updates immediately with new service and bay values' },
      { id: 'AP-06', desc: 'Verify Job Card # is preserved after edit', expected: 'Original job card number still shows in the Job Card column' },
      { id: 'AP-07', desc: 'Click "Check In" on an appointment', expected: 'Job card status updates; check-in recorded; row reflects checked-in state' },
      { id: 'AP-08', desc: 'Click "Remove" on an appointment', expected: 'Confirmation dialog appears: "Remove this appointment?"' },
      { id: 'AP-09', desc: 'Confirm removal', expected: 'Row removed from table; toast "Appointment removed" appears' },
      { id: 'AP-10', desc: 'Click "Remove" and click Cancel on the confirmation', expected: 'Appointment remains in the list; nothing deleted' },
    ],
  },
  {
    title: 'Parts Bulk Import (CSV & Excel)',
    icon: '📥',
    steps: [
      { id: 'BI-01', desc: 'Go to Parts → Bulk Import tab', expected: 'Bulk Import panel shows CSV/Excel upload area' },
      { id: 'BI-02', desc: 'Drag and drop a .csv file onto the upload area', expected: 'File is accepted; preview table appears with parsed rows' },
      { id: 'BI-03', desc: 'Drag and drop a .xlsx Excel file onto the upload area', expected: 'File is accepted; Excel rows parsed with headers normalised to snake_case; preview renders correctly' },
      { id: 'BI-04', desc: 'Click the upload area to browse and select a .csv file', expected: 'File picker opens; file selected; preview renders' },
      { id: 'BI-05', desc: 'Click "Import X Parts"', expected: 'All valid rows import; success count shown; parts appear in Inventory tab' },
      { id: 'BI-06', desc: 'Upload a file with invalid columns', expected: 'Error shown identifying unrecognised columns; import blocked or skips bad rows' },
    ],
  },
  {
    title: 'Time Tracking',
    icon: '⏰',
    steps: [
      { id: 'TT-01', desc: 'Enable Time Tracking in Settings → Feature Toggles', expected: 'Time Tracking appears in sidebar' },
      { id: 'TT-02', desc: 'Go to Time Tracking', expected: 'Module loads with 4 stat cards and Clock In form' },
      { id: 'TT-03', desc: 'Select a technician, enter Job Card # "JC-1001", click "Clock In"', expected: 'Session appears in Active Sessions panel with live elapsed timer' },
      { id: 'TT-04', desc: 'Click "Clock Out" on the active session', expected: 'Session ends; entry moves to Time Log table with correct duration' },
      { id: 'TT-05', desc: 'Clock in without selecting a technician', expected: 'Error displayed; clock-in blocked' },
      { id: 'TT-06', desc: 'Check stat cards after clocking out', expected: 'Hours Today and Total Entries update correctly' },
      { id: 'TT-07', desc: 'Click "Export CSV"', expected: 'CSV downloads with technician, job card, clock in, clock out, duration, notes columns' },
    ],
  },
  {
    title: 'Digital Inspection — Share & Approval',
    icon: '🔍',
    steps: [
      { id: 'IN-01', desc: 'Create an inspection from a job card', expected: 'Inspection form opens pre-linked to job' },
      { id: 'IN-02', desc: 'Mark 2 items Fail, 1 item Attention, rest Pass; attach a photo to one Fail item', expected: 'Items save with correct status; photo uploads and displays' },
      { id: 'IN-03', desc: 'Click "🔗 Share Link" in the inspection panel', expected: 'Modal appears with full share URL and "📋 Copy Link" button' },
      { id: 'IN-04', desc: 'Click "📋 Copy Link"', expected: 'Button turns green with "✓ Copied to clipboard!" confirmation' },
      { id: 'IN-05', desc: 'Open the share link in a private browser window (no login)', expected: 'Customer-facing page loads with shop logo, inspection summary, per-item cards' },
      { id: 'IN-06', desc: 'Click "✓ Approve Repair" on Fail items, "✗ Not Now" on Attention item', expected: 'Buttons highlight green/red; decisions tracked per item' },
      { id: 'IN-07', desc: 'Type name in digital signature field and click Submit', expected: 'Confirmation screen shown; submission locked (cannot re-submit)' },
      { id: 'IN-08', desc: 'Return to admin panel; open the inspection', expected: 'Status badge updates to "Partially Approved"; customer name and timestamp shown; per-item decisions visible' },
    ],
  },
  {
    title: 'Customer Facing — Repair Status Tracker',
    icon: '📍',
    steps: [
      { id: 'ST-01', desc: 'Open an active job card; click "📍 Status Tracker"', expected: 'Tracker initialises at "Checked In"; customer share URL generated' },
      { id: 'ST-02', desc: 'Open the share URL in another browser (no login)', expected: 'Customer status page loads showing Stage 1 active with progress bar' },
      { id: 'ST-03', desc: 'In admin, advance stage to "Being Inspected"', expected: 'Customer page updates within 30 seconds showing new stage' },
      { id: 'ST-04', desc: 'Advance to "Ready for Pickup" with email notification', expected: 'Stage updates; customer page turns green; "📞 Call Us" button appears; notification email sent' },
    ],
  },
];

/* ── Build PDF ── */

// Font (we use built-in Helvetica family)
const fontId = obj(`<<
  /Type /Font
  /Subtype /Type1
  /BaseFont /Helvetica
  /Encoding /WinAnsiEncoding
>>`);
const fontBoldId = obj(`<<
  /Type /Font
  /Subtype /Type1
  /BaseFont /Helvetica-Bold
  /Encoding /WinAnsiEncoding
>>`);
const fontObliqueId = obj(`<<
  /Type /Font
  /Subtype /Type1
  /BaseFont /Helvetica-Oblique
  /Encoding /WinAnsiEncoding
>>`);

const resourcesId = obj(`<<
  /Font <<
    /F1 ${fontId} 0 R
    /F2 ${fontBoldId} 0 R
    /F3 ${fontObliqueId} 0 R
  >>
>>`);

const PAGE_W = 612;
const PAGE_H = 792;
const MARGIN = 54;
const CONTENT_W = PAGE_W - MARGIN * 2;

// Helper: wrap text into lines of max width (approx, 0.5pt per char at given size)
function wrapText(text, maxW, fontSize) {
  const charW = fontSize * 0.52;
  const maxChars = Math.floor(maxW / charW);
  const words = text.split(' ');
  const lines = [];
  let cur = '';
  for (const w of words) {
    if ((cur + ' ' + w).trim().length > maxChars) {
      if (cur) lines.push(cur.trim());
      cur = w;
    } else {
      cur = (cur + ' ' + w).trim();
    }
  }
  if (cur) lines.push(cur.trim());
  return lines;
}

// We'll build pages as arrays of stream commands
const pageIds = [];

function buildPages() {
  const allPages = []; // each element = { streams: string[] }

  function newPage() {
    const p = { streams: [] };
    allPages.push(p);
    return p;
  }

  function text(page, x, y, str, { font = 'F1', size = 10, r = 0, g = 0, b = 0 } = {}) {
    page.streams.push(
      `BT /${font} ${size} Tf ${r} ${g} ${b} rg ${x} ${y} Td (${pdfStr(str)}) Tj ET`
    );
  }

  function rect(page, x, y, w, h, { r = 0, g = 0, b = 0, fill = true } = {}) {
    page.streams.push(
      `${r} ${g} ${b} ${fill ? 'rg' : 'RG'} ${x} ${y} ${w} ${h} re ${fill ? 'f' : 'S'}`
    );
  }

  function line(page, x1, y1, x2, y2, { r = 0.8, g = 0.8, b = 0.8, lw = 0.5 } = {}) {
    page.streams.push(
      `${lw} w ${r} ${g} ${b} RG ${x1} ${y1} m ${x2} ${y2} l S`
    );
  }

  /* ── Cover page ── */
  const cover = newPage();
  // Red header band
  rect(cover, 0, PAGE_H - 120, PAGE_W, 120, { r: 0.8, g: 0, b: 0 });
  text(cover, MARGIN, PAGE_H - 52, 'REDLINED1', { font: 'F2', size: 28, r: 1, g: 1, b: 1 });
  text(cover, MARGIN, PAGE_H - 76, 'Auto Repair Shop Management', { font: 'F1', size: 13, r: 1, g: 0.7, b: 0.7 });
  text(cover, MARGIN, PAGE_H - 100, 'Software Platform', { font: 'F1', size: 13, r: 1, g: 0.7, b: 0.7 });

  // Title block
  text(cover, MARGIN, PAGE_H - 170, 'Test Procedures & Acceptance Criteria', { font: 'F2', size: 22 });
  text(cover, MARGIN, PAGE_H - 200, 'New Features — June 2026 Release', { font: 'F1', size: 13, r: 0.4, g: 0.4, b: 0.4 });

  // Meta box
  rect(cover, MARGIN, PAGE_H - 320, CONTENT_W, 90, { r: 0.97, g: 0.97, b: 0.97 });
  const meta = [
    ['Document',  'Redlined1-Test-Procedures-June2026'],
    ['Version',   '1.0'],
    ['Prepared',  'Engineering / QA'],
    ['Date',      'June 20, 2026'],
    ['Scope',     'Parts Orders, Vendor Mgmt, Customer Edit, Appointments, Bulk Import, Time Tracking, Inspections, Status Tracker'],
  ];
  meta.forEach(([k, v], i) => {
    text(cover, MARGIN + 10, PAGE_H - 245 - i * 16, `${k}:`, { font: 'F2', size: 10 });
    text(cover, MARGIN + 100, PAGE_H - 245 - i * 16, v, { font: 'F1', size: 10, r: 0.3, g: 0.3, b: 0.3 });
  });

  // Section index
  text(cover, MARGIN, PAGE_H - 350, 'Sections in This Document', { font: 'F2', size: 12 });
  line(cover, MARGIN, PAGE_H - 356, MARGIN + CONTENT_W, PAGE_H - 356);
  SECTIONS.forEach((s, i) => {
    text(cover, MARGIN + 10, PAGE_H - 375 - i * 18, `${i + 1}.  ${s.title}`, { font: 'F1', size: 11 });
    text(cover, MARGIN + CONTENT_W - 40, PAGE_H - 375 - i * 18, `${s.steps.length} tests`, { font: 'F3', size: 10, r: 0.5, g: 0.5, b: 0.5 });
  });

  // Footer
  text(cover, MARGIN, 36, 'CONFIDENTIAL — Internal use only', { font: 'F3', size: 9, r: 0.6, g: 0.6, b: 0.6 });
  text(cover, PAGE_W - MARGIN - 80, 36, 'redlined1.com', { font: 'F1', size: 9, r: 0.6, g: 0.6, b: 0.6 });

  /* ── Section pages ── */
  for (const section of SECTIONS) {
    let page = newPage();
    let y = PAGE_H - MARGIN;

    // Section header band
    rect(page, 0, y - 44, PAGE_W, 44, { r: 0.12, g: 0.12, b: 0.14 });
    text(page, MARGIN, y - 28, section.title, { font: 'F2', size: 18, r: 1, g: 1, b: 1 });
    text(page, PAGE_W - MARGIN - 80, y - 28, `${section.steps.length} test cases`, { font: 'F1', size: 10, r: 0.6, g: 0.6, b: 0.6 });
    y -= 60;

    // Column headers
    const COL = { id: MARGIN, desc: MARGIN + 56, expected: MARGIN + 230, result: MARGIN + CONTENT_W - 54, notes: MARGIN + CONTENT_W - 10 };
    rect(page, MARGIN, y - 18, CONTENT_W, 18, { r: 0.93, g: 0.93, b: 0.95 });
    text(page, COL.id,       y - 12, 'ID',       { font: 'F2', size: 8.5 });
    text(page, COL.desc,     y - 12, 'Test Step / Action',    { font: 'F2', size: 8.5 });
    text(page, COL.expected, y - 12, 'Expected Result',       { font: 'F2', size: 8.5 });
    text(page, COL.result,   y - 12, 'Pass/Fail', { font: 'F2', size: 8.5 });
    y -= 22;

    for (const step of section.steps) {
      const descLines = wrapText(step.desc, 165, 8.5);
      const expLines  = wrapText(step.expected, 175, 8.5);
      const rowH = Math.max(descLines.length, expLines.length) * 12 + 10;

      // Page break
      if (y - rowH < 60) {
        // footer
        text(page, MARGIN, 36, section.title + ' (continued)', { font: 'F3', size: 9, r: 0.6, g: 0.6, b: 0.6 });
        page = newPage();
        y = PAGE_H - MARGIN;
        // repeat header band
        rect(page, 0, y - 44, PAGE_W, 44, { r: 0.12, g: 0.12, b: 0.14 });
        text(page, MARGIN, y - 28, section.title + ' (continued)', { font: 'F2', size: 16, r: 1, g: 1, b: 1 });
        y -= 60;
        rect(page, MARGIN, y - 18, CONTENT_W, 18, { r: 0.93, g: 0.93, b: 0.95 });
        text(page, COL.id,       y - 12, 'ID',            { font: 'F2', size: 8.5 });
        text(page, COL.desc,     y - 12, 'Test Step / Action',    { font: 'F2', size: 8.5 });
        text(page, COL.expected, y - 12, 'Expected Result',       { font: 'F2', size: 8.5 });
        text(page, COL.result,   y - 12, 'Pass/Fail', { font: 'F2', size: 8.5 });
        y -= 22;
      }

      // alternating row bg
      const rowIdx = section.steps.indexOf(step);
      if (rowIdx % 2 === 0) {
        rect(page, MARGIN, y - rowH, CONTENT_W, rowH, { r: 0.985, g: 0.985, b: 0.99 });
      }

      // ID chip
      rect(page, COL.id, y - rowH + 4, 46, rowH - 8, { r: 0.8, g: 0, b: 0 });
      text(page, COL.id + 3, y - rowH + (rowH - 8) / 2 - 2, step.id, { font: 'F2', size: 7.5, r: 1, g: 1, b: 1 });

      // Desc
      descLines.forEach((l, li) => {
        text(page, COL.desc, y - 11 - li * 12, l, { font: 'F1', size: 8.5 });
      });

      // Expected
      expLines.forEach((l, li) => {
        text(page, COL.expected, y - 11 - li * 12, l, { font: 'F1', size: 8.5, r: 0.2, g: 0.35, b: 0.2 });
      });

      // Pass/Fail box
      rect(page, COL.result, y - rowH + 6, 48, rowH - 12, { r: 1, g: 1, b: 1 });
      page.streams.push(`0.75 0.75 0.75 RG 0.5 w ${COL.result} ${y - rowH + 6} 48 ${rowH - 12} re S`);
      text(page, COL.result + 8, y - rowH + (rowH - 12) / 2 - 2, '☐  Pass  ☐  Fail', { font: 'F1', size: 7 });

      // bottom rule
      line(page, MARGIN, y - rowH, MARGIN + CONTENT_W, y - rowH);
      y -= rowH + 2;
    }

    // Notes row at bottom of section
    if (y > 100) {
      y -= 10;
      text(page, MARGIN, y, 'Tester Notes:', { font: 'F2', size: 9 });
      y -= 16;
      for (let n = 0; n < 3; n++) {
        line(page, MARGIN, y, MARGIN + CONTENT_W, y, { r: 0.7, g: 0.7, b: 0.7 });
        y -= 20;
      }
      y -= 8;
      text(page, MARGIN, y, 'Tester:_______________________________   Date:_______________   Sign-off:_______________________________', { font: 'F1', size: 9, r: 0.4, g: 0.4, b: 0.4 });
    }

    // Footer
    text(page, MARGIN, 36, `Section: ${section.title}`, { font: 'F3', size: 9, r: 0.6, g: 0.6, b: 0.6 });
    text(page, PAGE_W - MARGIN - 80, 36, 'Redlined1 QA', { font: 'F1', size: 9, r: 0.6, g: 0.6, b: 0.6 });
  }

  return allPages;
}

const pages = buildPages();

// Register page stream objects
const pageStreamIds = pages.map(p => {
  const stream = p.streams.join('\n');
  const len = stream.length;
  return obj(`<<\n  /Length ${len}\n>>\nstream\n${stream}\nendstream`);
});

// Register page objects
const pageObjIds = pageStreamIds.map((sid, i) => {
  return obj(`<<
  /Type /Page
  /MediaBox [0 0 ${PAGE_W} ${PAGE_H}]
  /Resources ${resourcesId} 0 R
  /Contents ${sid} 0 R
  /Parent PAGES_REF
>>`);
});

// Pages tree
const pagesId = obj(`<<
  /Type /Pages
  /Kids [${pageObjIds.map(id => `${id} 0 R`).join(' ')}]
  /Count ${pageObjIds.length}
>>`);

// Fix up Parent refs
objects.forEach(o => {
  o.content = o.content.replace(/PAGES_REF/g, `${pagesId} 0 R`);
});

// Catalog
const catalogId = obj(`<<
  /Type /Catalog
  /Pages ${pagesId} 0 R
>>`);

/* ── Assemble PDF bytes ── */
let pdf = '%PDF-1.4\n';
const offsets = [];

for (const o of objects) {
  offsets.push(pdf.length);
  pdf += `${o.id} 0 obj\n${o.content}\nendobj\n`;
}

const xrefPos = pdf.length;
pdf += `xref\n0 ${objects.length + 1}\n`;
pdf += `0000000000 65535 f \n`;
for (const off of offsets) {
  pdf += String(off).padStart(10, '0') + ' 00000 n \n';
}
pdf += `trailer\n<<\n  /Size ${objects.length + 1}\n  /Root ${catalogId} 0 R\n>>\nstartxref\n${xrefPos}\n%%EOF\n`;

const outPath = join(__dirname, 'Redlined1-Test-Procedures.pdf');
writeFileSync(outPath, pdf, 'latin1');
console.log(`✓ PDF written to ${outPath}`);
console.log(`  Pages: ${pages.length}  |  Objects: ${objects.length}`);
