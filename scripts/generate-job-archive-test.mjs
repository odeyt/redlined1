import { writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));

const objects = [];
let oid = 0;
function obj(content) {
  const id = ++oid;
  objects.push({ id, content });
  return id;
}

function pdfStr(s) {
  return s
    .replace(/\\/g, '\\\\')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)')
    .replace(/\r/g, '\\r')
    .replace(/\n/g, '\\n');
}

function buildPDF(pages) {
  objects.length = 0; oid = 0;

  const catalogId   = obj('');
  const pagesId     = obj('');
  const fontBoldId  = obj('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>');
  const fontRegId   = obj('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>');

  const pageIds = pages.map(cmds => {
    const stream = cmds.join('\n');
    const contentId = obj(`<< /Length ${Buffer.byteLength(stream, 'latin1')} >>\nstream\n${stream}\nendstream`);
    return obj(
      `<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 612 792] ` +
      `/Contents ${contentId} 0 R ` +
      `/Resources << /Font << /F1 ${fontBoldId} 0 R /F2 ${fontRegId} 0 R >> >> >>`
    );
  });

  objects[pagesId - 1].content =
    `<< /Type /Pages /Kids [${pageIds.map(id => `${id} 0 R`).join(' ')}] /Count ${pageIds.length} >>`;
  objects[catalogId - 1].content =
    `<< /Type /Catalog /Pages ${pagesId} 0 R >>`;

  let out = '%PDF-1.4\n';
  const offsets = [];
  objects.forEach(o => {
    offsets.push(Buffer.byteLength(out, 'latin1'));
    out += `${o.id} 0 obj\n${o.content}\nendobj\n`;
  });

  const xrefOffset = Buffer.byteLength(out, 'latin1');
  out += `xref\n0 ${oid + 1}\n0000000000 65535 f \n`;
  offsets.forEach(off => { out += String(off).padStart(10, '0') + ' 00000 n \n'; });
  out += `trailer\n<< /Size ${oid + 1} /Root ${catalogId} 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;
  return Buffer.from(out, 'latin1');
}

const W = 612, H = 792;
const ML = 50, MR = 50, MT = 50;
const CW = W - ML - MR;

const RED    = '0.8 0.0 0.0';
const DARK   = '0.10 0.10 0.10';
const MUTED  = '0.45 0.45 0.45';
const LINE   = '0.82 0.82 0.82';
const PASSG  = '0.91 0.97 0.87';
const PASSGT = '0.22 0.55 0.13';
const PASSR  = '0.99 0.92 0.92';
const PASSRT = '0.64 0.17 0.17';
const PASSS  = '0.94 0.94 0.94';
const PASSST = '0.37 0.37 0.37';
const ROWALT = '0.97 0.97 0.97';

function setColor(r,g,b) { return `${r} ${g} ${b} rg`; }
function setStroke(r,g,b){ return `${r} ${g} ${b} RG`; }
function setRGB(c){ return `${c} rg`; }
function setRGBs(c){ return `${c} RG`; }

function text(t, x, y, size, bold=false, colorStr=DARK) {
  return [
    `BT`,
    `${colorStr} rg`,
    `/${bold?'F1':'F2'} ${size} Tf`,
    `${x} ${y} Td`,
    `(${pdfStr(t)}) Tj`,
    `ET`,
  ].join('\n');
}

function rect(x,y,w,h,fillColor,strokeColor=null,lw=0.5){
  const ops = [`${lw} w`, `${fillColor} rg`];
  if(strokeColor){ ops.push(`${strokeColor} RG`); }
  ops.push(`${x} ${y} ${w} ${h} re`);
  ops.push(strokeColor ? 'B' : 'f');
  return ops.join('\n');
}

function hline(x1,y,x2,colorStr=LINE,lw=0.5){
  return [`${lw} w`, `${colorStr} RG`, `${x1} ${y} m`, `${x2} ${y} l`, `S`].join('\n');
}

function wrapText(str, maxChars) {
  const words = str.split(' ');
  const lines = [];
  let cur = '';
  words.forEach(w => {
    if ((cur + ' ' + w).trim().length <= maxChars) {
      cur = (cur + ' ' + w).trim();
    } else {
      if (cur) lines.push(cur);
      cur = w;
    }
  });
  if (cur) lines.push(cur);
  return lines;
}

function pageHeader(cmds, title, subtitle, pageNum, totalPages) {
  cmds.push(rect(0, H - 52, W, 52, '0.80 0.00 0.00'));
  cmds.push(text('Redlined1  |  D1 Imports', ML, H - 20, 8, false, '1 0.6 0.6'));
  cmds.push(text(title, ML, H - 38, 16, true, '1 1 1'));
  cmds.push(text(subtitle, ML + 240, H - 38, 9, false, '1 0.8 0.8'));
  cmds.push(text(`Page ${pageNum} of ${totalPages}`, W - MR - 40, H - 38, 9, false, '1 0.8 0.8'));
}

function coverPage() {
  const cmds = [];
  cmds.push(rect(0, H - 120, W, 120, '0.80 0.00 0.00'));
  cmds.push(text('Job Archive', ML, H - 55, 28, true, '1 1 1'));
  cmds.push(text('Staff Test Procedures', ML, H - 82, 16, false, '1 0.75 0.75'));
  cmds.push(text('Redlined1  |  D1 Imports  |  June 20, 2026', ML, H - 108, 10, false, '1 0.65 0.65'));

  let y = H - 160;
  cmds.push(rect(ML, y - 4, CW, 52, '0.96 0.96 0.96'));
  cmds.push(text('Prerequisites', ML + 10, y + 30, 10, true, DARK));
  cmds.push(text('1.  Log in as Owner or Manager — Technician accounts do not see Job Archive.', ML + 10, y + 14, 9, false, MUTED));
  cmds.push(text('2.  At least one Job Card must have status: Complete, Closed, or Invoiced.', ML + 10, y + 2, 9, false, MUTED));

  y -= 80;
  const tests = [
    ['01', 'Page loads without error'],
    ['02', 'Jobs appear in the archive'],
    ['03', 'Period filter works'],
    ['04', 'Search filters correctly'],
    ['05', 'Row expand shows full details'],
    ['06', 'Export CSV downloads correctly'],
  ];
  cmds.push(text('Tests in this document', ML, y, 11, true, DARK));
  y -= 18;
  tests.forEach(([num, title]) => {
    cmds.push(rect(ML, y - 3, CW, 22, ROWALT));
    cmds.push(rect(ML, y - 3, 28, 22, '0.93 0.20 0.20'));
    cmds.push(text(num, ML + 7, y + 4, 9, true, '1 1 1'));
    cmds.push(text(title, ML + 36, y + 4, 10, false, DARK));
    y -= 26;
  });

  y -= 20;
  cmds.push(hline(ML, y, ML + CW, MUTED));
  y -= 16;
  cmds.push(text('Result key', ML, y, 9, true, MUTED));
  y -= 14;
  [['PASS','green',PASSG,PASSGT],['FAIL','red',PASSR,PASSRT],['SKIP','grey',PASSS,PASSST]].forEach(([label,,bg,fg]) => {
    cmds.push(rect(ML, y - 3, 40, 14, bg));
    cmds.push(text(label, ML + 5, y + 1, 8, true, fg));
    cmds.push(text(label==='PASS'?'All steps completed correctly':label==='FAIL'?'One or more steps did not produce expected result':'Test not applicable or skipped', ML + 48, y + 1, 8, false, MUTED));
    y -= 18;
  });

  return cmds;
}

const TESTS = [
  {
    num: '01',
    title: 'Page loads without error',
    pass: 'No red error text visible. All 4 stat cards show.',
    steps: [
      { action: 'Click Job Archive in the sidebar', expected: 'Page loads — no red error text visible' },
      { action: 'Check the page header', expected: 'Shows "Job Archive" with subtitle about completed / closed / invoiced jobs' },
      { action: 'Count the stat cards at the top', expected: '4 cards: Archived Jobs, Avg Days to Close, Total Labor Hours, Total Parts Value' },
    ],
    note: 'If red text says "column does not exist" — report to admin immediately.',
  },
  {
    num: '02',
    title: 'Jobs appear in the archive',
    pass: 'Job appears in table after status change. All columns present.',
    steps: [
      { action: 'Go to Job Cards and open any active job', expected: 'Job card opens successfully' },
      { action: 'Change the status to Complete or Closed and save', expected: 'Status badge updates on the card' },
      { action: 'Click Job Archive in the sidebar', expected: 'That job now appears in the archive table' },
      { action: 'Verify all columns are present', expected: 'Customer, Vehicle, Technician(s), Status, Check-In, Closed, Days, Labor h, RO/Invoice' },
    ],
    note: 'Jobs only appear here once status is Complete, Closed, or Invoiced.',
  },
  {
    num: '03',
    title: 'Period filter works',
    pass: 'Job count changes correctly with each period pill. Counter updates.',
    steps: [
      { action: 'Click the This Month pill', expected: 'Only jobs closed this calendar month shown' },
      { action: 'Click This Quarter', expected: 'Jobs from current quarter (Jan-Mar, Apr-Jun, Jul-Sep, or Oct-Dec)' },
      { action: 'Click This Year', expected: 'All jobs closed in the current year shown' },
      { action: 'Click All Time', expected: 'All archived jobs regardless of date shown' },
      { action: 'Watch the "X of Y jobs" counter while switching', expected: 'Number updates correctly with each filter selection' },
    ],
  },
  {
    num: '04',
    title: 'Search filters correctly',
    pass: 'Each search field filters correctly. Gibberish shows "no match" message.',
    steps: [
      { action: 'Type a customer name in the search box', expected: 'Only rows with that customer shown' },
      { action: 'Clear and type a vehicle name', expected: 'Only matching vehicles shown' },
      { action: 'Clear and type a technician name', expected: 'Rows with that technician shown' },
      { action: 'Clear and type a RO number (e.g. RO-001)', expected: 'Matching row shown' },
      { action: 'Type random gibberish (e.g. zzzzz)', expected: '"No jobs match your current filter" message appears' },
    ],
  },
  {
    num: '05',
    title: 'Row expand shows full details',
    pass: 'Expand/collapse works. All 3 panels visible. No missing data.',
    steps: [
      { action: 'Click any row in the archive table', expected: 'Row expands — arrow changes from down to up' },
      { action: 'Check the 3 sections in the expanded panel', expected: 'Job Details, Timeline, Financials & References all visible' },
      { action: 'Verify Job Details section', expected: 'Customer name, vehicle, service type, notes (if any)' },
      { action: 'Verify Timeline section', expected: 'Check-in date, closed date, total days, technicians listed' },
      { action: 'Verify Financials section', expected: 'Labor hours, parts total, RO number, invoice number, status badge' },
      { action: 'Click the same row again', expected: 'Row collapses back to single line' },
    ],
    note: 'If a field shows a dash (--) that should have data, it may not have been filled in on the original job card.',
  },
  {
    num: '06',
    title: 'Export CSV downloads correctly',
    pass: 'File downloads. 12 columns correct. Row count matches screen. Filter respected.',
    steps: [
      { action: 'With jobs visible on screen, click Export CSV button', expected: 'File downloads immediately to Downloads folder' },
      { action: 'Open the file in Excel or Google Sheets', expected: '12 columns: Customer, Vehicle, Technicians, Status, Service Type, Check-In, Closed, Days, Labor h, Parts $, RO #, Invoice #' },
      { action: 'Count the data rows in the CSV', expected: 'Row count matches the number of jobs shown on screen' },
      { action: 'Switch to This Month filter, export again', expected: 'CSV contains only this months jobs — fewer rows than All Time' },
      { action: 'When 0 jobs are showing, check the Export button', expected: 'Button is greyed out and cannot be clicked' },
    ],
  },
];

function testPage(t, pageNum, totalPages) {
  const cmds = [];
  pageHeader(cmds, 'Job Archive — Staff Test', `Test ${t.num} of 06`, pageNum, totalPages);

  let y = H - 74;

  // Test title bar
  cmds.push(rect(ML, y - 6, CW, 26, '0.96 0.96 0.96'));
  cmds.push(rect(ML, y - 6, 36, 26, '0.93 0.20 0.20'));
  cmds.push(text(t.num, ML + 8, y + 4, 11, true, '1 1 1'));
  cmds.push(text(t.title, ML + 44, y + 4, 12, true, DARK));
  y -= 36;

  // Column headers
  const C1 = ML, C2 = ML + 22, C3 = ML + 260, C4 = ML + 460;
  const colW1 = 22, colW2 = 236, colW3 = 198, colW4 = 80;

  cmds.push(rect(ML, y - 4, CW, 18, '0.25 0.25 0.25'));
  cmds.push(text('#', C1 + 4, y + 2, 8, true, '1 1 1'));
  cmds.push(text('Action', C2 + 4, y + 2, 8, true, '1 1 1'));
  cmds.push(text('Expected result', C3 + 4, y + 2, 8, true, '1 1 1'));
  cmds.push(text('Result', C4 + 16, y + 2, 8, true, '1 1 1'));
  y -= 22;

  t.steps.forEach((step, i) => {
    const actionLines  = wrapText(step.action,   38);
    const expectLines  = wrapText(step.expected, 33);
    const rowH = Math.max(actionLines.length, expectLines.length) * 12 + 10;
    const bg = i % 2 === 0 ? '1 1 1' : ROWALT;

    cmds.push(rect(ML, y - rowH + 12, CW, rowH, bg));
    cmds.push(hline(ML, y - rowH + 12, ML + CW, LINE));

    cmds.push(text(String(i + 1), C1 + 6, y, 9, true, MUTED));
    actionLines.forEach((ln, li) => {
      cmds.push(text(ln, C2 + 4, y - li * 12, 8, false, DARK));
    });
    expectLines.forEach((ln, li) => {
      cmds.push(text(ln, C3 + 4, y - li * 12, 8, false, MUTED));
    });

    // Pass / Fail / Skip boxes
    [[PASSG, PASSGT, 'PASS'], [PASSR, PASSRT, 'FAIL'], [PASSS, PASSST, 'SKIP']].forEach(([bg2, fg, lbl], bi) => {
      const bx = C4 + bi * 27;
      const by = y - 2;
      cmds.push(rect(bx, by, 24, 14, bg2));
      cmds.push(text(lbl, bx + 2, by + 3, 6, true, fg));
    });

    y -= rowH;
  });

  // Pass criteria
  y -= 12;
  cmds.push(rect(ML, y - 6, CW, 22, '0.94 0.98 0.91'));
  cmds.push(rect(ML, y - 6, 4, 22, '0.40 0.78 0.25'));
  cmds.push(text('Pass criteria:', ML + 12, y + 4, 8, true, PASSGT));
  const pcLines = wrapText(t.pass, 85);
  cmds.push(text(pcLines[0] || '', ML + 92, y + 4, 8, false, PASSGT));
  y -= 28;

  // Note
  if (t.note) {
    cmds.push(rect(ML, y - 6, CW, 22, '0.99 0.97 0.90'));
    cmds.push(rect(ML, y - 6, 4, 22, '0.93 0.70 0.13'));
    cmds.push(text('Note:', ML + 12, y + 4, 8, true, '0.63 0.44 0.05'));
    const noteLines = wrapText(t.note, 85);
    cmds.push(text(noteLines[0] || '', ML + 52, y + 4, 8, false, '0.63 0.44 0.05'));
    y -= 28;
  }

  // Tester sign-off block
  y -= 10;
  cmds.push(rect(ML, y - 36, CW, 46, '0.97 0.97 0.97'));
  cmds.push(text('Tester name:', ML + 10, y + 2, 8, false, MUTED));
  cmds.push(hline(ML + 80, y + 1, ML + 240, MUTED, 0.4));
  cmds.push(text('Date:', ML + 260, y + 2, 8, false, MUTED));
  cmds.push(hline(ML + 288, y + 1, ML + 380, MUTED, 0.4));
  cmds.push(text('Overall result:', ML + 400, y + 2, 8, false, MUTED));
  [[PASSG, PASSGT, 'PASS'], [PASSR, PASSRT, 'FAIL'], [PASSS, PASSST, 'SKIP']].forEach(([bg2, fg, lbl], bi) => {
    const bx = ML + 480 + bi * 28;
    cmds.push(rect(bx, y - 2, 26, 14, bg2));
    cmds.push(text(lbl, bx + 3, y + 2, 7, true, fg));
  });
  cmds.push(text('Notes / issues found:', ML + 10, y - 18, 8, false, MUTED));
  cmds.push(hline(ML + 110, y - 19, ML + CW - 10, MUTED, 0.4));

  return cmds;
}

function summaryPage(pageNum, totalPages) {
  const cmds = [];
  pageHeader(cmds, 'Job Archive — Staff Test', 'Results Summary', pageNum, totalPages);

  let y = H - 80;
  cmds.push(text('Test results summary', ML, y, 13, true, DARK));
  y -= 24;

  const cols = [ML, ML + 30, ML + 240, ML + 370, ML + 430, ML + 460, ML + 490];
  cmds.push(rect(ML, y - 4, CW, 18, '0.25 0.25 0.25'));
  ['#', 'Test name', 'Tester', 'Date', 'PASS', 'FAIL', 'SKIP'].forEach((h, i) => {
    cmds.push(text(h, cols[i] + 3, y + 2, 8, true, '1 1 1'));
  });
  y -= 22;

  TESTS.forEach((t, i) => {
    const bg = i % 2 === 0 ? '1 1 1' : ROWALT;
    cmds.push(rect(ML, y - 6, CW, 20, bg));
    cmds.push(hline(ML, y - 6, ML + CW, LINE));
    cmds.push(text(t.num, cols[0] + 3, y, 8, false, MUTED));
    cmds.push(text(t.title, cols[1] + 3, y, 8, false, DARK));
    [[PASSG, PASSGT], [PASSR, PASSRT], [PASSS, PASSST]].forEach(([bg2, fg], bi) => {
      const bx = cols[4 + bi];
      cmds.push(rect(bx, y - 4, 24, 14, bg2));
      cmds.push(text(['PASS','FAIL','SKIP'][bi], bx + 2, y, 6, true, fg));
    });
    y -= 22;
  });

  y -= 20;
  cmds.push(rect(ML, y - 10, CW, 60, '0.97 0.97 0.97'));
  cmds.push(text('Final sign-off', ML + 10, y + 40, 9, true, DARK));
  cmds.push(text('Tested by:', ML + 10, y + 22, 8, false, MUTED));
  cmds.push(hline(ML + 65, y + 21, ML + 240, MUTED, 0.4));
  cmds.push(text('Date:', ML + 260, y + 22, 8, false, MUTED));
  cmds.push(hline(ML + 288, y + 21, ML + 380, MUTED, 0.4));
  cmds.push(text('Approved by:', ML + 400, y + 22, 8, false, MUTED));
  cmds.push(hline(ML + 472, y + 21, ML + CW - 10, MUTED, 0.4));
  cmds.push(text('Overall pass / fail / notes:', ML + 10, y + 4, 8, false, MUTED));
  cmds.push(hline(ML + 145, y + 3, ML + CW - 10, MUTED, 0.4));

  y -= 90;
  cmds.push(hline(ML, y, ML + CW, LINE));
  y -= 14;
  cmds.push(text('Generated by Redlined1  |  redlined1.com  |  June 20, 2026', ML, y, 8, false, MUTED));

  return cmds;
}

const totalPages = TESTS.length + 2;
const allPages = [
  coverPage(),
  ...TESTS.map((t, i) => testPage(t, i + 2, totalPages)),
  summaryPage(totalPages, totalPages),
];

const pdf = buildPDF(allPages);
const outPath = join(__dirname, 'Test_Job_Archive.pdf');
writeFileSync(outPath, pdf);
console.log('PDF written to', outPath);
