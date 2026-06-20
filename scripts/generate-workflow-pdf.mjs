/**
 * Generates Redlined1-Shop-Workflow.pdf
 * Run: node scripts/generate-workflow-pdf.mjs
 */
import { writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));

/* ── PDF primitives ── */
const objects = [];
let oid = 0;
const obj = c => { const id = ++oid; objects.push({ id, content: c }); return id; };
const ps  = s => s.replace(/\\/g,'\\\\').replace(/\(/g,'\\(').replace(/\)/g,'\\)');

const fontId    = obj(`<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica       /Encoding /WinAnsiEncoding >>`);
const fontBId   = obj(`<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold   /Encoding /WinAnsiEncoding >>`);
const fontOId   = obj(`<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Oblique /Encoding /WinAnsiEncoding >>`);
const resId     = obj(`<< /Font << /F1 ${fontId} 0 R /F2 ${fontBId} 0 R /F3 ${fontOId} 0 R >> >>`);

const W = 612, H = 792, M = 50, CW = W - M * 2;

/* ── Workflow data ── */
const STEPS = [
  {
    num: '01', phase: 'INTAKE',
    title: 'Customer Arrives / Appointment Check-In',
    color: '#1e40af', bg: '#eff6ff',
    role: 'Service Advisor',
    module: 'Appointments',
    actions: [
      'Greet customer and pull up their appointment in the Appointments module',
      'Verify customer name, contact details, and vehicle',
      'Click "Check In" on their appointment row to mark arrival',
      'Confirm the complaint or service requested by the customer',
    ],
    tip: 'Walk-in? Create the appointment on the spot first, then check in.',
  },
  {
    num: '02', phase: 'INTAKE',
    title: 'Confirm Customer & Vehicle Record',
    color: '#1e40af', bg: '#eff6ff',
    role: 'Service Advisor',
    role: 'Service Advisor',
    module: 'Customers → Vehicles',
    actions: [
      'Go to Customers — search for the customer by name or phone',
      'If new customer, click "+ Add Customer" and fill in name, phone, email',
      'Open the customer profile and confirm their vehicle is listed',
      'If new vehicle, click "+ Add Vehicle" — enter Year/Make/Model, VIN (17 chars), plate, mileage',
      'Use VIN Decode (sidebar) to auto-fill vehicle spec from the VIN',
    ],
    tip: 'Record the odometer reading every visit for accurate mileage history.',
  },
  {
    num: '03', phase: 'JOB SETUP',
    title: 'Create a Job Card',
    color: '#7c3aed', bg: '#f5f3ff',
    role: 'Service Advisor',
    module: 'Job Cards',
    actions: [
      'Click "+ New Job Card" (top header or from customer profile)',
      'Customer and vehicle will pre-fill from context',
      'Describe the complaint / work requested in the description field',
      'Assign a technician and set the Promised By date',
      'Set status to "In Progress" and save',
      'Share the Status Tracker link with the customer (from job card detail drawer)',
    ],
    tip: 'The job card is the anchor for every other step — inspection, RO, invoice all link back here.',
  },
  {
    num: '04', phase: 'JOB SETUP',
    title: 'Send Live Status Tracker to Customer',
    color: '#7c3aed', bg: '#f5f3ff',
    role: 'Service Advisor',
    module: 'Job Cards → Status Tracker',
    actions: [
      'Open the job card detail drawer and click "Status Tracker"',
      'Copy the unique customer link and send via SMS or WhatsApp',
      'Set stage to "Checked In" — customer sees this on their link instantly',
      'As the job progresses, advance stages with optional SMS/email notification',
    ],
    tip: 'This eliminates "where is my car?" calls. Customers track it themselves.',
  },
  {
    num: '05', phase: 'INSPECTION',
    title: 'Run the Digital Vehicle Inspection',
    color: '#065f46', bg: '#ecfdf5',
    role: 'Technician',
    module: 'Inspections',
    actions: [
      'From the job card, click "Inspection →" to open a new inspection pre-linked to this job',
      'Work through the checklist: Brakes, Tyres, Engine, Electrical, Fluids, Body, Lights',
      'Mark each item: Green (Pass), Yellow (Attention), Red (Fail)',
      'Attach photos to any Fail or Attention item from your phone camera',
      'Advance Status Tracker to "Being Inspected"',
    ],
    tip: 'Photos build trust and protect you from disputes. Take them on every fail item.',
  },
  {
    num: '06', phase: 'INSPECTION',
    title: 'Share Report & Get Customer Approval',
    color: '#065f46', bg: '#ecfdf5',
    role: 'Service Advisor',
    module: 'Inspections → Share Link',
    actions: [
      'Click "Share Link" in the inspection panel — copy the customer-facing URL',
      'Send the link via SMS, WhatsApp, or email to the customer',
      'Customer opens a branded page showing colour-coded inspection results and photos',
      'Customer approves or declines each repair item individually',
      'Customer types their name as a digital signature and submits',
      'Check the admin panel — their exact decisions and signature are recorded permanently',
    ],
    tip: 'Per-item approval increases authorised work value vs. blanket approve/decline.',
  },
  {
    num: '07', phase: 'ESTIMATE',
    title: 'Build & Send the Estimate',
    color: '#92400e', bg: '#fffbeb',
    role: 'Service Advisor',
    module: 'Estimates',
    actions: [
      'From the inspection, click "Create Estimate →" to open a pre-filled estimate',
      'Add labour lines for each approved repair with hours and rate',
      'Add parts lines with description and sell price',
      'Review subtotal, tax, and total — adjust if needed',
      'Send the estimate — customer receives a professional PDF with Approve/Decline buttons',
    ],
    tip: 'Only include items the customer approved on the inspection. Declined items stay off.',
  },
  {
    num: '08', phase: 'PARTS',
    title: 'Source & Order Required Parts',
    color: '#7f1d1d', bg: '#fef2f2',
    role: 'Service Advisor',
    module: 'Parts → Parts Orders',
    actions: [
      'Go to Parts → Inventory tab — check if parts are already in stock',
      'For in-stock parts, note the bin location and set aside for the job',
      'For parts to order, go to "Parts Orders" → "+ New Parts Order"',
      'Select customer and vehicle from dropdowns, choose vendor, enter cost and deposit',
      'Set ETR (Expected Time of Receipt) date and Order Status to "Ordered"',
      'Update job card status to "Waiting for Parts" — dashboard flags the job as paused',
      'When parts arrive, update order status to "Received" and resume the job',
    ],
    tip: 'Link each parts order to the Job Card # for full traceability.',
  },
  {
    num: '09', phase: 'REPAIR',
    title: 'Technician Clocks In & Opens Repair Order',
    color: '#134e4a', bg: '#f0fdfa',
    role: 'Technician',
    module: 'Time Tracking + Repair Orders',
    actions: [
      'Go to Time Tracking → select the technician → enter Job Card # → click "Clock In"',
      'Active session appears with a live elapsed timer',
      'Open Repair Orders → create a new RO linked to this job card',
      'List each repair task with parts used and labour time',
      'Advance Status Tracker to "In Repair" — customer is notified',
    ],
    tip: 'Accurate clock-in/out data feeds payroll reporting and labour billing.',
  },
  {
    num: '10', phase: 'REPAIR',
    title: 'Complete Repairs & Quality Check',
    color: '#134e4a', bg: '#f0fdfa',
    role: 'Tech + Advisor',
    module: 'Time Tracking → Job Cards',
    actions: [
      'Technician clicks "Clock Out" when work is complete',
      'Service advisor performs a quality check on the finished vehicle',
      'Advance Status Tracker to "Quality Check"',
      'Update job card status to "Complete"',
      'Add any internal notes about work performed (not visible to customer)',
    ],
    tip: 'Never skip the quality check step — it catches mistakes before the customer does.',
  },
  {
    num: '11', phase: 'BILLING',
    title: 'Create & Send Invoice',
    color: '#1e3a5f', bg: '#f0f4ff',
    role: 'Owner / Manager',
    module: 'Invoicing',
    actions: [
      'From the job card, click "Create Invoice →" — labour and parts pre-fill from the RO',
      'Review all line items, adjust quantities or prices if needed',
      'Add tax (auto-applied from your Settings → Tax rate)',
      'Set the due date and click "Send" — customer receives a branded PDF with a Pay Now link',
      'Advance Status Tracker to "Ready for Pickup" — page turns green for customer',
    ],
    tip: 'Sending the invoice and the Ready notification at the same time = fewer phone calls.',
  },
  {
    num: '12', phase: 'PAYMENT',
    title: 'Collect Payment & Close the Job',
    color: '#064e3b', bg: '#ecfdf5',
    role: 'Owner / Manager',
    module: 'Payments',
    actions: [
      'If paying online via the invoice link — payment auto-records and invoice marks Paid',
      'For in-person payment, go to Payments → "Record Payment"',
      'Select the customer, amount, payment method (cash, card, Zelle, etc.), and link invoice #',
      'Save — the invoice Balance Due updates to "PAID IN FULL" automatically',
      'Job card status should be set to "Invoiced" if not already updated automatically',
      'File digital records — every document is saved permanently in the customer profile',
    ],
    tip: 'For fleet customers, use "Fleet Account / Net 30" as the method and follow up at month-end.',
  },
];

/* ── Build pages ── */
const pages = [];
const newPage = () => { const p = { s: [] }; pages.push(p); return p; };

const t  = (p, x, y, str, { f='F1', sz=10, r=0,g=0,b=0 }={}) =>
  p.s.push(`BT /${f} ${sz} Tf ${r} ${g} ${b} rg ${x} ${y} Td (${ps(str)}) Tj ET`);
const rx = (p, x, y, w, h, { r=0,g=0,b=0 }={}) =>
  p.s.push(`${r} ${g} ${b} rg ${x} ${y} ${w} ${h} re f`);
const ln = (p, x1,y1,x2,y2, { r=0.8,g=0.8,b=0.8,lw=0.5 }={}) =>
  p.s.push(`${lw} w ${r} ${g} ${b} RG ${x1} ${y1} m ${x2} ${y2} l S`);

function hexToRgb(hex) {
  const n = parseInt(hex.replace('#',''), 16);
  return [(n>>16)/255, ((n>>8)&0xff)/255, (n&0xff)/255];
}

function wrap(text, maxW, sz) {
  const cw = sz * 0.52;
  const mc = Math.floor(maxW / cw);
  const words = text.split(' ');
  const lines = [];
  let cur = '';
  for (const w of words) {
    if ((cur + ' ' + w).trim().length > mc) { if (cur) lines.push(cur.trim()); cur = w; }
    else cur = (cur + ' ' + w).trim();
  }
  if (cur) lines.push(cur.trim());
  return lines;
}

/* ── Cover ── */
const cover = newPage();
rx(cover, 0, H-100, W, 100, { r:0.8,g:0,b:0 });
t(cover, M, H-42, 'REDLINED1  AUTO REPAIR MANAGEMENT', { f:'F2', sz:20, r:1,g:1,b:1 });
t(cover, M, H-68, 'redlined1.com', { f:'F1', sz:11, r:1,g:0.65,b:0.65 });

t(cover, M, H-136, 'Complete Shop Workflow', { f:'F2', sz:28 });
t(cover, M, H-166, 'From Vehicle Arrival to Final Payment', { f:'F1', sz:15, r:0.35,g:0.35,b:0.35 });

// Meta box
rx(cover, M, H-290, CW, 90, { r:0.96,g:0.96,b:0.97 });
const meta = [
  ['Document', 'Redlined1-Shop-Workflow'],
  ['Version', '1.0  —  June 2026'],
  ['Audience', 'Service Advisors, Technicians, Shop Owners'],
  ['Steps', '12 steps across 6 phases: Intake → Job Setup → Inspection → Parts → Repair → Billing'],
];
meta.forEach(([k,v],i) => {
  t(cover, M+12, H-225-i*18, k+':', { f:'F2', sz:10 });
  t(cover, M+100, H-225-i*18, v, { f:'F1', sz:10, r:0.3,g:0.3,b:0.3 });
});

// Phase legend
t(cover, M, H-316, 'Phases at a Glance', { f:'F2', sz:12 });
ln(cover, M, H-322, M+CW, H-322);
const phases = [
  { label:'INTAKE',     color:'#1e40af', steps:'Steps 1–2' },
  { label:'JOB SETUP',  color:'#7c3aed', steps:'Steps 3–4' },
  { label:'INSPECTION', color:'#065f46', steps:'Steps 5–6' },
  { label:'ESTIMATE',   color:'#92400e', steps:'Step 7'    },
  { label:'PARTS',      color:'#7f1d1d', steps:'Step 8'    },
  { label:'REPAIR',     color:'#134e4a', steps:'Steps 9–10'},
  { label:'BILLING',    color:'#1e3a5f', steps:'Step 11'   },
  { label:'PAYMENT',    color:'#064e3b', steps:'Step 12'   },
];
phases.forEach((ph, i) => {
  const row = Math.floor(i/2), col = i%2;
  const px = M + col*(CW/2), py = H-342-row*36;
  const [r,g,b] = hexToRgb(ph.color);
  rx(cover, px, py-14, 10, 14, { r,g,b });
  t(cover, px+14, py-10, ph.label, { f:'F2', sz:10, r,g,b });
  t(cover, px+110, py-10, ph.steps, { f:'F1', sz:10, r:0.5,g:0.5,b:0.5 });
});

// Footer
t(cover, M, 36, 'Confidential — For internal staff use', { f:'F3', sz:9, r:0.6,g:0.6,b:0.6 });
t(cover, W-M-60, 36, 'June 2026', { f:'F1', sz:9, r:0.6,g:0.6,b:0.6 });

/* ── Step pages (2 per page) ── */
let page = null;
let pageSlot = 0; // 0 = top half, 1 = bottom half

for (const step of STEPS) {
  if (pageSlot === 0) { page = newPage(); }
  const [cr,cg,cb] = hexToRgb(step.color);
  const [br,bg_,bb] = hexToRgb(step.bg);

  const TOP_Y = pageSlot === 0 ? H - M : H/2 - 10;
  const BLOCK_H = H/2 - M - 10;
  const y = TOP_Y;

  // Background panel
  rx(page, M, y - BLOCK_H, CW, BLOCK_H, { r:br, g:bg_, b:bb });

  // Left accent bar
  rx(page, M, y - BLOCK_H, 6, BLOCK_H, { r:cr, g:cg, b:cb });

  // Step number circle
  rx(page, M+14, y-38, 36, 36, { r:cr, g:cg, b:cb });
  t(page, M+16, y-26, step.num, { f:'F2', sz:14, r:1,g:1,b:1 });

  // Phase badge
  t(page, M+56, y-16, step.phase, { f:'F2', sz:8, r:cr,g:cg,b:cb });

  // Title
  t(page, M+56, y-30, step.title, { f:'F2', sz:13 });

  // Module + Role tags on same line
  t(page, M+56, y-44, 'Module: ' + step.module, { f:'F3', sz:9, r:0.4,g:0.4,b:0.4 });
  if (step.role) {
    const roleLabel = 'Role: ' + step.role;
    t(page, M+CW-8 - roleLabel.length*5.2, y-44, roleLabel, { f:'F2', sz:9, r:cr,g:cg,b:cb });
  }

  // Divider
  ln(page, M+14, y-52, M+CW-8, y-52, { r:cr,g:cg,b:cb, lw:0.4 });

  // Actions
  let ay = y - 68;
  for (const action of step.actions) {
    const lines = wrap(action, CW - 80, 9.5);
    // bullet
    rx(page, M+20, ay - 3, 5, 5, { r:cr,g:cg,b:cb });
    lines.forEach((l, li) => {
      t(page, M+32, ay - li*13, l, { f: li===0?'F1':'F1', sz:9.5 });
    });
    ay -= lines.length * 13 + 4;
  }

  // Tip box
  if (step.tip) {
    const tipLines = wrap('💡 Pro Tip: ' + step.tip, CW - 70, 9);
    const tipH = tipLines.length * 12 + 10;
    const tipY = y - BLOCK_H + 12;
    rx(page, M+14, tipY, CW-22, tipH, { r:cr*0.15+0.85, g:cg*0.15+0.85, b:cb*0.15+0.85 });
    tipLines.forEach((l,i) => {
      t(page, M+20, tipY + tipH - 14 - i*12, l, { f:'F3', sz:9, r:cr*0.6,g:cg*0.6,b:cb*0.6 });
    });
  }

  // Divider between slots
  if (pageSlot === 0) {
    ln(page, M, H/2-5, M+CW, H/2-5, { r:0.85,g:0.85,b:0.85, lw:1 });
  }

  // Page footer
  if (pageSlot === 1 || STEPS.indexOf(step) === STEPS.length - 1) {
    t(page, M, 30, 'Redlined1 — Shop Workflow', { f:'F3', sz:8, r:0.6,g:0.6,b:0.6 });
    t(page, W-M-80, 30, `Page ${pages.length} of ${Math.ceil(STEPS.length/2)+1}`, { f:'F1', sz:8, r:0.6,g:0.6,b:0.6 });
  }

  pageSlot = pageSlot === 0 ? 1 : 0;
}

/* ── Quick-Reference cheat sheet ── */
const cheat = newPage();
rx(cheat, 0, H-60, W, 60, { r:0.1,g:0.1,b:0.12 });
t(cheat, M, H-28, 'Quick Reference — Staff Cheat Sheet', { f:'F2', sz:18, r:1,g:1,b:1 });
t(cheat, M, H-48, 'Print this page and post it at the service desk', { f:'F3', sz:11, r:0.7,g:0.7,b:0.7 });

const QR = [
  { step:'1', text:'Customer arrives → Check In on Appointments',  color:'#1e40af' },
  { step:'2', text:'Confirm Customer + Vehicle record',             color:'#1e40af' },
  { step:'3', text:'Create Job Card → assign tech + promised date', color:'#7c3aed' },
  { step:'4', text:'Send Status Tracker link to customer',          color:'#7c3aed' },
  { step:'5', text:'Run DVI Inspection → mark + photo every item', color:'#065f46' },
  { step:'6', text:'Send share link → customer approves per item', color:'#065f46' },
  { step:'7', text:'Create Estimate for approved work only',        color:'#92400e' },
  { step:'8', text:'Check stock or create Parts Order with ETR',    color:'#7f1d1d' },
  { step:'9', text:'Tech clocks in → create Repair Order',         color:'#134e4a' },
  { step:'10', text:'Tech clocks out → QC check → job Complete',   color:'#134e4a' },
  { step:'11', text:'Create Invoice → send → Status: Ready',       color:'#1e3a5f' },
  { step:'12', text:'Collect payment → mark invoice Paid → close', color:'#064e3b' },
];

QR.forEach((q, i) => {
  const col = i < 6 ? 0 : 1;
  const row = i < 6 ? i : i - 6;
  const px = M + col * (CW/2 + 8);
  const py = H - 90 - row * 52;
  const [r,g,b] = hexToRgb(q.color);

  rx(cheat, px, py-40, CW/2-8, 44, { r:r*0.06+0.94, g:g*0.06+0.94, b:b*0.06+0.94 });
  rx(cheat, px, py-40, 4, 44, { r,g,b });
  rx(cheat, px+10, py-32, 22, 22, { r,g,b });
  t(cheat, px+13, py-24, q.step, { f:'F2', sz:12, r:1,g:1,b:1 });
  const lines = wrap(q.text, CW/2 - 60, 10);
  lines.forEach((l,li) => t(cheat, px+38, py-20-li*13, l, { f: li===0?'F2':'F1', sz:10 }));
});

t(cheat, M, 50, 'RULE: Never skip a step. Every step creates a record that protects you and your customer.', { f:'F2', sz:10, r:0.6,g:0,b:0 });
t(cheat, M, 36, 'Redlined1 — redlined1.com', { f:'F3', sz:9, r:0.6,g:0.6,b:0.6 });

/* ── Assemble PDF ── */
const streamIds = pages.map(p => {
  const s = p.s.join('\n');
  return obj(`<< /Length ${s.length} >>\nstream\n${s}\nendstream`);
});
const pageObjIds = streamIds.map(sid =>
  obj(`<< /Type /Page /MediaBox [0 0 ${W} ${H}] /Resources ${resId} 0 R /Contents ${sid} 0 R /Parent PREF >>`)
);
const pagesId = obj(`<< /Type /Pages /Kids [${pageObjIds.map(id=>`${id} 0 R`).join(' ')}] /Count ${pageObjIds.length} >>`);
objects.forEach(o => { o.content = o.content.replace(/PREF/g, `${pagesId} 0 R`); });
const catId = obj(`<< /Type /Catalog /Pages ${pagesId} 0 R >>`);

let pdf = '%PDF-1.4\n';
const offs = [];
for (const o of objects) { offs.push(pdf.length); pdf += `${o.id} 0 obj\n${o.content}\nendobj\n`; }
const xp = pdf.length;
pdf += `xref\n0 ${objects.length+1}\n0000000000 65535 f \n`;
offs.forEach(off => { pdf += String(off).padStart(10,'0') + ' 00000 n \n'; });
pdf += `trailer\n<< /Size ${objects.length+1} /Root ${catId} 0 R >>\nstartxref\n${xp}\n%%EOF\n`;

const out = join(__dirname, 'Redlined1-Shop-Workflow.pdf');
writeFileSync(out, pdf, 'latin1');
console.log(`✓  ${out}`);
console.log(`   Pages: ${pages.length}  |  Steps: ${STEPS.length}`);
