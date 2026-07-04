'use client';

import { useEffect, useState, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { Panel } from '@/components/Panel';
import { fetchShopSettings } from '@/services/shopSettingsService';
import { getShopId } from '@/lib/shopStore';
import { useShop, type Shop } from '@/lib/useShop';

// ── Technician + Job Completion types ──────────────────────────
interface TechRow {
  name: string;
  activeJobs: number;
  completedJobs: number;
  totalHoursLogged: number;
  avgHoursPerJob: number;
  jobs: { customer: string; vehicle: string; status: string; checkIn: string; closed: string | null }[];
}

interface JobCompletionRow {
  id: string;
  customer: string;
  vehicle: string;
  technicians: string[];
  status: string;
  checkIn: string;
  closed: string | null;
  daysOpen: number;
  laborHours: number;
}

interface ReportData {
  // Revenue
  totalRevenuePaid: number;
  totalOutstanding: number;
  totalVoid: number;
  avgInvoiceValue: number;
  invoiceCount: number;
  paidCount: number;
  sentCount: number;
  // Payments
  totalPayments: number;
  paymentCount: number;
  methodBreakdown: { method: string; total: number; count: number }[];
  // Repair Orders
  totalROValue: number;
  totalLaborValue: number;
  totalPartsValue: number;
  roCount: number;
  completedROCount: number;
  avgLaborHours: number;
  // Customers
  totalCustomers: number;
  totalVehicles: number;
  // Estimates
  totalEstimates: number;
  approvedEstimates: number;
  declinedEstimates: number;
  convertedEstimates: number;
  estimateConvertRate: number;
  // Monthly revenue (last 6 months)
  monthlyRevenue: { month: string; revenue: number; payments: number }[];
  // Top customers
  topCustomers: { name: string; invoiceCount: number; totalSpend: number }[];
}

function fmtMoney(n: number) {
  return '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtPct(n: number) {
  return n.toFixed(1) + '%';
}

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTH_NAMES_FULL = ['January','February','March','April','May','June','July','August','September','October','November','December'];

// ── Print Report types ──────────────────────────────────────────
interface PrintPart { partName: string; partNumber?: string; qty?: number; cost?: number; total?: number; }
interface PrintRow {
  jobId: string;
  jobNumber?: string;
  customer: string;
  vehicle: string;
  vin?: string;
  technicians: string[];
  concern: string;
  cause: string;
  correction: string;
  parts: PrintPart[];
  laborHours: number;
  laborRate: number;
  partsTotal: number;
  closedDate: string;
  status: string;
  flatRateHours?: number; // from labor_guide if available
}

// ── WorkshopPrintModal ──────────────────────────────────────────
function WorkshopPrintModal({
  shopId, month, year, periodLabel, shopName, onClose,
}: {
  shopId: string; month: number; year: number; periodLabel: string; shopName: string; onClose: () => void;
}) {
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<PrintRow[]>([]);
  const [reportNotes, setReportNotes] = useState('');
  const printRef = useRef<HTMLDivElement>(null);

  useEffect(() => { fetchData(); }, [shopId, month, year]); // eslint-disable-line

  async function fetchData() {
    setLoading(true);
    try {
      const vSelect = 'id, customer_id, label, make, model, year, vin, plate, status, assigned_tech, date_received, issues, parts_exchanged, flat_rate_lak';
      const baseQ = () => supabase.from('vehicles').select(vSelect).eq('shop_id', shopId).ilike('status', '%complet%');

      // No date filter — completion report shows ALL completed vehicles regardless of received date.
      // date_received is when the vehicle arrived, not when work was completed, so filtering by it
      // would exclude vehicles received in one month but finished in another.
      const [{ data: allCompleted }, { data: custData }] = await Promise.all([
        baseQ().order('date_received', { ascending: false }),
        supabase.from('customers').select('id, name').eq('shop_id', shopId),
      ]);

      const vehicles = (allCompleted ?? []) as Record<string, unknown>[];
      const custMap: Record<string, string> = {};
      for (const c of (custData ?? []) as { id: string; name: string }[]) custMap[c.id] = c.name;

      const built: PrintRow[] = vehicles.map(v => {
        const partsStr = (v.parts_exchanged as string) ?? '';
        const parts: PrintPart[] = partsStr
          ? partsStr.split(/[,\n]+/).map(p => ({ partName: p.trim() })).filter(p => p.partName)
          : [];
        const correction = partsStr || '';
        return {
          jobId: v.id as string,
          customer: custMap[v.customer_id as string] ?? '—',
          vehicle: `${v.year ?? ''} ${v.make ?? ''} ${v.model ?? ''}`.trim() || (v.label as string) || '—',
          technicians: (v.assigned_tech as string) ? [(v.assigned_tech as string)] : [],
          concern: (v.issues as string) ?? '',
          cause: '',
          correction,
          parts,
          laborHours: 0,
          laborRate: 0,
          partsTotal: 0,
          closedDate: (v.date_received as string) ?? '',
          status: (v.status as string) ?? '',
          flatRateHours: v.flat_rate_lak ? Number(v.flat_rate_lak) / 1000 : undefined,
        };
      });

      setRows(built);
    } catch (e) {
      console.error('Print data fetch failed', e);
    } finally {
      setLoading(false);
    }
  }

  function doPrint() {
    const el = document.getElementById('workshop-print-report');
    if (!el) return;

    // Inject report HTML directly into body (above React root) so print CSS can target it cleanly
    const printDiv = document.createElement('div');
    printDiv.id = 'redline-print-portal';
    printDiv.innerHTML = el.innerHTML;
    document.body.appendChild(printDiv);

    const styleTag = document.createElement('style');
    styleTag.id = 'redline-print-styles';
    styleTag.innerHTML = `
      @media print {
        body > *:not(#redline-print-portal) { display: none !important; }
        #redline-print-portal {
          display: block !important;
          font-family: Arial, sans-serif;
          font-size: 12px;
          color: #000;
          padding: 10mm;
        }
        @page { size: A4 landscape; margin: 12mm 10mm; }
        table { border-collapse: collapse; width: 100%; }
        [contenteditable] { outline: none; }
      }
      #redline-print-portal { display: none; }
    `;
    document.head.appendChild(styleTag);

    // Small delay ensures browser applies styles before opening print dialog.
    // Cleanup runs after dialog closes (window.print blocks on most browsers,
    // but the timeout is a safety net for Chrome on Windows).
    setTimeout(() => {
      window.print();
      setTimeout(() => {
        if (document.body.contains(printDiv)) document.body.removeChild(printDiv);
        if (document.head.contains(styleTag)) document.head.removeChild(styleTag);
      }, 500);
    }, 100);
  }

  const totalLaborValue = rows.reduce((s, r) => s + r.laborHours * r.laborRate, 0);
  const totalPartsValue = rows.reduce((s, r) => s + r.partsTotal, 0);
  const totalHours = rows.reduce((s, r) => s + r.laborHours, 0);
  const grandTotal = totalLaborValue + totalPartsValue;

  return (
    <>
      {/* Backdrop */}
      <div className="no-print" onClick={onClose}
        style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 3000 }} />

      {/* Modal shell */}
      <div className="no-print" onClick={e => e.stopPropagation()}
        style={{ position: 'fixed', inset: '2vh 2vw', zIndex: 3001, background: 'var(--surface)', borderRadius: 12, display: 'flex', flexDirection: 'column', overflow: 'hidden', boxShadow: '0 32px 80px rgba(0,0,0,0.5)' }}>

        {/* Modal header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 20px', borderBottom: '1px solid var(--line)', flexShrink: 0 }}>
          <div>
            <div style={{ fontWeight: 800, fontSize: 16 }}>🖨 Completion Report — {shopName}</div>
            <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>{periodLabel} · {rows.length} completed job{rows.length !== 1 ? 's' : ''} · Click any cell to edit before printing</div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={doPrint}
              style={{ padding: '9px 20px', background: '#cc0000', color: '#fff', border: 'none', borderRadius: 8, fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>
              🖨 Print / Save PDF
            </button>
            <button onClick={onClose}
              style={{ padding: '9px 16px', background: 'var(--surface-soft)', border: '1px solid var(--line)', borderRadius: 8, fontSize: 13, cursor: 'pointer' }}>
              ✕ Close
            </button>
          </div>
        </div>

        {/* Scrollable body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px' }}>
          {loading ? (
            <div style={{ padding: 60, textAlign: 'center', color: 'var(--muted)' }}>Loading report data…</div>
          ) : rows.length === 0 ? (
            <div style={{ padding: 60, textAlign: 'center', color: 'var(--muted)', fontSize: 14 }}>
              No completed jobs found for {periodLabel}.
            </div>
          ) : (
            /* ── Printable area ── */
            <div ref={printRef} id="workshop-print-report">

              {/* Report header */}
              <div style={{ marginBottom: 20, paddingBottom: 14, borderBottom: '2px solid #cc0000' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div>
                    <div style={{ fontSize: 22, fontWeight: 800, color: '#cc0000' }}>{shopName}</div>
                    <div style={{ fontSize: 15, fontWeight: 700, marginTop: 2 }}>COMPLETION REPORT — {periodLabel.toUpperCase()}</div>
                    <div style={{ fontSize: 11, color: '#666', marginTop: 2 }}>
                      Generated: {new Date().toLocaleString()} · {rows.length} completed job{rows.length !== 1 ? 's' : ''}
                    </div>
                  </div>
                  <div style={{ textAlign: 'right', fontSize: 12 }}>
                    <div style={{ fontWeight: 700 }}>SUMMARY</div>
                    <div>Total Jobs: <strong>{rows.length}</strong></div>
                    <div>Total Hours: <strong>{totalHours.toFixed(1)} h</strong></div>
                    <div>Labor Value: <strong>{fmtMoney(totalLaborValue)}</strong></div>
                    <div>Parts Value: <strong>{fmtMoney(totalPartsValue)}</strong></div>
                    <div style={{ color: '#cc0000', fontWeight: 800 }}>Grand Total: {fmtMoney(grandTotal)}</div>
                  </div>
                </div>
                {/* Editable report notes */}
                <div style={{ marginTop: 12 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: '#888', marginBottom: 4 }}>REPORT NOTES (editable):</div>
                  <div
                    contentEditable suppressContentEditableWarning
                    onInput={e => setReportNotes((e.target as HTMLElement).innerText)}
                    style={{ minHeight: 32, border: '1px dashed #ccc', borderRadius: 4, padding: '6px 8px', fontSize: 12, color: '#333', outline: 'none' }}
                    data-placeholder="Click to add report notes…"
                  >
                    {reportNotes || ''}
                  </div>
                </div>
              </div>

              {/* Job rows */}
              {rows.map((row, idx) => (
                <div key={row.jobId} style={{ marginBottom: 20, padding: 14, border: '1px solid #ddd', borderRadius: 8, pageBreakInside: 'avoid' }}>
                  {/* Row header */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10, paddingBottom: 8, borderBottom: '1px solid #eee' }}>
                    <div>
                      <span style={{ fontSize: 11, background: '#cc0000', color: '#fff', borderRadius: 4, padding: '2px 7px', fontWeight: 700, marginRight: 8 }}>
                        #{idx + 1}{row.jobNumber ? ` · ${row.jobNumber}` : ''}
                      </span>
                      <span style={{ fontWeight: 800, fontSize: 14 }}>{row.customer}</span>
                      <span style={{ color: '#666', marginLeft: 8, fontSize: 13 }}>{row.vehicle}</span>
                    </div>
                    <div style={{ textAlign: 'right', fontSize: 12 }}>
                      <div style={{ color: '#4caf50', fontWeight: 700 }}>{row.status}</div>
                      <div style={{ color: '#666' }}>Closed: {row.closedDate ? new Date(row.closedDate).toLocaleDateString() : '—'}</div>
                    </div>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                    {/* Left: 3C + tech */}
                    <div>
                      <Field label="ASSIGNED TECHNICIAN(S)">
                        <div
                          contentEditable suppressContentEditableWarning
                          style={{ minHeight: 20, outline: 'none', borderBottom: '1px dashed #ccc', padding: '2px 0' }}>
                          {row.technicians.length > 0 ? row.technicians.join(', ') : 'Unassigned'}
                        </div>
                      </Field>
                      <Field label="CONCERN (Customer Complaint)">
                        <div
                          contentEditable suppressContentEditableWarning
                          style={{ minHeight: 24, outline: 'none', borderBottom: '1px dashed #ccc', padding: '2px 0' }}>
                          {row.concern || '—'}
                        </div>
                      </Field>
                      <Field label="CAUSE (Diagnosis)">
                        <div
                          contentEditable suppressContentEditableWarning
                          style={{ minHeight: 24, outline: 'none', borderBottom: '1px dashed #ccc', padding: '2px 0' }}>
                          {row.cause || '—'}
                        </div>
                      </Field>
                      <Field label="CORRECTION (Work Performed)">
                        <div
                          contentEditable suppressContentEditableWarning
                          style={{ minHeight: 32, outline: 'none', borderBottom: '1px dashed #ccc', padding: '2px 0' }}>
                          {row.correction || '—'}
                        </div>
                      </Field>
                    </div>

                    {/* Right: parts + labor */}
                    <div>
                      <Field label="PARTS REPLACED">
                        {row.parts.length > 0 ? (
                          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11, marginTop: 2 }}>
                            <thead>
                              <tr style={{ borderBottom: '1px solid #ddd' }}>
                                {['Part Name', 'Part #', 'Qty', 'Cost', 'Total'].map(h => (
                                  <th key={h} style={{ textAlign: 'left', padding: '2px 4px', color: '#888', fontWeight: 600 }}>{h}</th>
                                ))}
                              </tr>
                            </thead>
                            <tbody>
                              {row.parts.map((p, i) => (
                                <tr key={i} style={{ borderBottom: '1px solid #f0f0f0' }}>
                                  <td style={{ padding: '3px 4px', fontWeight: 600 }}>{p.partName || '—'}</td>
                                  <td style={{ padding: '3px 4px', color: '#666' }}>{p.partNumber || '—'}</td>
                                  <td style={{ padding: '3px 4px' }}>{p.qty ?? 1}</td>
                                  <td style={{ padding: '3px 4px' }}>{p.cost != null ? fmtMoney(p.cost) : '—'}</td>
                                  <td style={{ padding: '3px 4px', fontWeight: 600 }}>{p.total != null ? fmtMoney(p.total) : '—'}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        ) : (
                          <div style={{ color: '#999', fontSize: 12, borderBottom: '1px dashed #ccc', padding: '2px 0', minHeight: 20 }}
                            contentEditable suppressContentEditableWarning>
                            No parts recorded
                          </div>
                        )}
                      </Field>

                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginTop: 10 }}>
                        <ValueBox
                          label="Labor Hours (Recorded)"
                          value={row.laborHours > 0 ? `${row.laborHours.toFixed(1)} h` : '—'}
                          color="#2196f3"
                        />
                        <ValueBox
                          label="Est. Flat Rate (Guide)"
                          value={row.flatRateHours != null ? `${row.flatRateHours.toFixed(1)} h` : 'N/A'}
                          color={row.flatRateHours != null ? '#ff9800' : '#999'}
                          small
                        />
                        <ValueBox
                          label="Parts Total"
                          value={row.partsTotal > 0 ? fmtMoney(row.partsTotal) : '—'}
                          color="#4caf50"
                        />
                      </div>

                      <div style={{ marginTop: 8, padding: '8px 10px', background: '#f9f9f9', borderRadius: 6, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: 11, color: '#666', fontWeight: 700 }}>JOB TOTAL (Labor + Parts)</span>
                        <span style={{ fontSize: 16, fontWeight: 800, color: '#cc0000' }}>
                          {fmtMoney(row.laborHours * row.laborRate + row.partsTotal)}
                        </span>
                      </div>

                      <Field label="ADDITIONAL NOTES (editable)">
                        <div
                          contentEditable suppressContentEditableWarning
                          style={{ minHeight: 28, outline: 'none', border: '1px dashed #ccc', borderRadius: 4, padding: '4px 6px', fontSize: 11, color: '#333' }}>
                        </div>
                      </Field>
                    </div>
                  </div>
                </div>
              ))}

              {/* Footer */}
              <div style={{ marginTop: 16, paddingTop: 14, borderTop: '2px solid #eee', display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#666' }}>
                <div>
                  <strong>{shopName}</strong> · {periodLabel} Completion Report · Page 1
                </div>
                <div>
                  Confidential — For internal use only
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

// ── Field / ValueBox helpers (print only) ───────────────────────
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 8 }}>
      <div style={{ fontSize: 9, fontWeight: 700, color: '#888', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 2 }}>{label}</div>
      {children}
    </div>
  );
}
function ValueBox({ label, value, color, small }: { label: string; value: string; color: string; small?: boolean }) {
  return (
    <div style={{ padding: '6px 8px', background: '#f5f5f5', borderRadius: 6, border: '1px solid #e0e0e0' }}>
      <div style={{ fontSize: 9, color: '#888', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 2 }}>{label}</div>
      <div style={{ fontSize: small ? 12 : 15, fontWeight: 800, color }}>{value}</div>
    </div>
  );
}

export function ReportsView() {
  const { shops } = useShop();
  const [reportShopId, setReportShopId] = useState<string>(getShopId());

  const [data, setData] = useState<ReportData | null>(null);
  const [techRows, setTechRows] = useState<TechRow[]>([]);
  const [jobRows, setJobRows] = useState<JobCompletionRow[]>([]);
  const [expandedTech, setExpandedTech] = useState<string | null>(null);
  const [jobFilter, setJobFilter] = useState<'all' | 'complete' | 'open' | 'invoiced'>('all');
  const [jobPeriod, setJobPeriod] = useState<'week' | 'month' | 'quarter' | 'year' | 'all' | 'custom'>('month');
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'overview' | 'revenue' | 'repairs' | 'payments' | 'customers' | 'technicians' | 'completion'>('completion');
  const [shopName, setShopName] = useState('Redlined1');
  const [toast, setToast] = useState('');
  const [enableTechnicianReport, setEnableTechnicianReport] = useState(true);
  const [enableJobCompletionReport, setEnableJobCompletionReport] = useState(true);

  // Month/year filter for completion tab
  const now = new Date();
  const [filterYear, setFilterYear] = useState(now.getFullYear());
  const [filterMonth, setFilterMonth] = useState(0); // 0 = all months (default matches unfiltered Vehicle Management view)

  // Print modal
  const [showPrintModal, setShowPrintModal] = useState(false);

  useEffect(() => {
    load(reportShopId);
    fetchShopSettings().then(s => {
      setShopName(s.companyName);
      setEnableTechnicianReport(s.enableTechnicianReport ?? true);
      setEnableJobCompletionReport(s.enableJobCompletionReport ?? true);
    }).catch(() => {});
  }, [reportShopId]); // eslint-disable-line

  function notify(msg: string) { setToast(msg); setTimeout(() => setToast(''), 3000); }

  async function load(sid: string) {
    setLoading(true);
    try {
      const [
        { data: invData },
        { data: payData },
        { data: roData },
        { count: custCount },
        { count: vehCount },
        { data: estData },
        { data: jcData },
        { data: teData },
      ] = await Promise.all([
        supabase.from('invoices').select('number, customer, status, subtotal, tax, discount, shop_supplies, currency, created_at').eq('shop_id', sid),
        supabase.from('payments').select('amount, method, payment_date, currency, status').eq('shop_id', sid),
        supabase.from('repair_orders').select('status, labor_hours, parts_total, labor_rate, customer_name, created_at').eq('shop_id', sid),
        supabase.from('customers').select('*', { count: 'exact', head: true }).eq('shop_id', sid),
        supabase.from('vehicles').select('*', { count: 'exact', head: true }).eq('shop_id', sid),
        supabase.from('estimates').select('status').eq('shop_id', sid),
        supabase.from('job_cards').select('id, customer, vehicle, technicians, status, check_in_date, closed_date, labor_hours').eq('shop_id', sid),
        supabase.from('time_entries').select('technician_name, job_card_number, clock_in, clock_out').eq('shop_id', sid),
      ]);

      const invoices = invData ?? [];
      const pays = payData ?? [];
      const ros = roData ?? [];
      const ests = estData ?? [];

      const calcInvTotal = (i: Record<string, number>) =>
        (i.subtotal || 0) - (i.discount || 0) + (i.tax || 0) + (i.shop_supplies || 0);

      const paidInvs = invoices.filter(i => i.status === 'Paid');
      const sentInvs = invoices.filter(i => i.status === 'Sent');

      // Revenue = actual cash collected — exclude Void and Refunded to match Payments module
      const collectedPays = pays.filter((p: Record<string, unknown>) => p.status !== 'Void' && p.status !== 'Refunded');
      const totalPaymentsCollected = collectedPays.reduce((s: number, p: Record<string, unknown>) => s + Number(p.amount ?? 0), 0);
      // Invoice-based totals (for Revenue tab breakdown)
      const totalInvoicedPaid = paidInvs.reduce((s, i) => s + calcInvTotal(i), 0);
      const totalOutstanding = sentInvs.reduce((s, i) => s + calcInvTotal(i), 0);
      const totalVoid = invoices.filter(i => i.status === 'Void').reduce((s, i) => s + calcInvTotal(i), 0);
      // Avg: use payment average (actual collected transactions)
      const avgInvoiceValue = collectedPays.length > 0 ? totalPaymentsCollected / collectedPays.length
        : paidInvs.length > 0 ? totalInvoicedPaid / paidInvs.length : 0;

      // Payments by method — only collected (exclude Void/Refunded)
      const methodMap: Record<string, { total: number; count: number }> = {};
      for (const p of collectedPays) {
        const m = (p.method as string) || 'Unknown';
        if (!methodMap[m]) methodMap[m] = { total: 0, count: 0 };
        methodMap[m].total += Number(p.amount ?? 0);
        methodMap[m].count += 1;
      }
      const methodBreakdown = Object.entries(methodMap)
        .map(([method, v]) => ({ method, ...v }))
        .sort((a, b) => b.total - a.total);

      // RO stats
      const nonVoidROs = ros.filter(r => r.status !== 'Void');
      const totalLaborValue = nonVoidROs.reduce((s, r) => s + (Number(r.labor_hours ?? 0) * Number(r.labor_rate ?? 0)), 0);
      const totalPartsValue = nonVoidROs.reduce((s, r) => s + Number(r.parts_total ?? 0), 0);
      const avgLaborHours = nonVoidROs.length > 0
        ? nonVoidROs.reduce((s, r) => s + Number(r.labor_hours ?? 0), 0) / nonVoidROs.length
        : 0;

      // Monthly revenue — last 6 months
      const now = new Date();
      const monthlyRevenue: { month: string; revenue: number; payments: number }[] = [];
      for (let i = 5; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const next = new Date(d.getFullYear(), d.getMonth() + 1, 1);
        const label = MONTH_NAMES[d.getMonth()] + ' ' + d.getFullYear().toString().slice(2);
        // Revenue = payments collected in this month (exclude Void/Refunded)
        const rev = collectedPays
          .filter((p: Record<string, unknown>) => p.payment_date && (p.payment_date as string) >= d.toISOString() && (p.payment_date as string) < next.toISOString())
          .reduce((s: number, p: Record<string, unknown>) => s + Number(p.amount ?? 0), 0);
        // Invoiced = paid invoices created this month (secondary view)
        const pymt = paidInvs
          .filter(inv => inv.created_at && inv.created_at >= d.toISOString() && inv.created_at < next.toISOString())
          .reduce((s, inv) => s + calcInvTotal(inv), 0);
        monthlyRevenue.push({ month: label, revenue: rev, payments: pymt });
      }

      // Top customers by total spend
      const custMap: Record<string, { invoiceCount: number; totalSpend: number }> = {};
      for (const inv of invoices.filter(i => i.status === 'Paid')) {
        const name = inv.customer || 'Unknown';
        if (!custMap[name]) custMap[name] = { invoiceCount: 0, totalSpend: 0 };
        custMap[name].invoiceCount += 1;
        custMap[name].totalSpend += calcInvTotal(inv);
      }
      const topCustomers = Object.entries(custMap)
        .map(([name, v]) => ({ name, ...v }))
        .sort((a, b) => b.totalSpend - a.totalSpend)
        .slice(0, 8);

      const convertedEsts = ests.filter(e => e.status === 'Converted').length;
      const approvedEsts = ests.filter(e => e.status === 'Approved').length;
      const declinedEsts = ests.filter(e => e.status === 'Declined').length;
      const convertRate = ests.length > 0 ? (convertedEsts / ests.length) * 100 : 0;

      setData({
        totalRevenuePaid: totalPaymentsCollected,
        totalOutstanding,
        totalVoid,
        avgInvoiceValue,
        invoiceCount: invoices.length,
        paidCount: paidInvs.length,
        sentCount: sentInvs.length,
        totalPayments: totalPaymentsCollected,
        paymentCount: collectedPays.length,
        methodBreakdown,
        totalROValue: totalLaborValue + totalPartsValue,
        totalLaborValue,
        totalPartsValue,
        roCount: ros.length,
        completedROCount: ros.filter(r => r.status === 'Complete' || r.status === 'Closed').length,
        avgLaborHours,
        totalCustomers: custCount ?? 0,
        totalVehicles: vehCount ?? 0,
        totalEstimates: ests.length,
        approvedEstimates: approvedEsts,
        declinedEstimates: declinedEsts,
        convertedEstimates: convertedEsts,
        estimateConvertRate: convertRate,
        monthlyRevenue,
        topCustomers,
      });

      // ── Technician assignment report ──────────────────────────
      const jobCards = (jcData ?? []) as Record<string, unknown>[];
      const timeEntries = (teData ?? []) as Record<string, unknown>[];

      // Hours logged per technician from time_entries
      const techHoursMap: Record<string, number> = {};
      for (const te of timeEntries) {
        const name = (te.technician_name as string) || 'Unknown';
        if (te.clock_in && te.clock_out) {
          const mins = (new Date(te.clock_out as string).getTime() - new Date(te.clock_in as string).getTime()) / 60000;
          techHoursMap[name] = (techHoursMap[name] ?? 0) + mins / 60;
        }
      }

      // Jobs per technician (job_cards.technicians is an array)
      const techMap: Record<string, { active: number; completed: number; jobs: TechRow['jobs'] }> = {};
      for (const jc of jobCards) {
        const techs = (jc.technicians as string[]) ?? [];
        const isComplete = ['Complete', 'Closed', 'Invoiced'].includes(jc.status as string);
        for (const tech of techs.length > 0 ? techs : ['Unassigned']) {
          if (!techMap[tech]) techMap[tech] = { active: 0, completed: 0, jobs: [] };
          if (isComplete) techMap[tech].completed += 1;
          else techMap[tech].active += 1;
          techMap[tech].jobs.push({
            customer: jc.customer as string,
            vehicle: jc.vehicle as string,
            status: jc.status as string,
            checkIn: jc.check_in_date as string,
            closed: jc.closed_date as string | null,
          });
        }
      }

      const builtTechRows: TechRow[] = Object.entries(techMap).map(([name, v]) => {
        const hours = techHoursMap[name] ?? 0;
        const total = v.active + v.completed;
        return {
          name,
          activeJobs: v.active,
          completedJobs: v.completed,
          totalHoursLogged: hours,
          avgHoursPerJob: total > 0 ? hours / total : 0,
          jobs: v.jobs.sort((a, b) => new Date(b.checkIn).getTime() - new Date(a.checkIn).getTime()),
        };
      }).sort((a, b) => (b.activeJobs + b.completedJobs) - (a.activeJobs + a.completedJobs));

      setTechRows(builtTechRows);

      // ── Job completion report ──────────────────────────────────
      const now2 = Date.now();
      const builtJobRows: JobCompletionRow[] = jobCards.map(jc => {
        const checkIn = jc.check_in_date as string;
        const closed = jc.closed_date as string | null;
        const end = closed ? new Date(closed).getTime() : now2;
        const daysOpen = checkIn ? Math.round((end - new Date(checkIn).getTime()) / 86400000) : 0;
        return {
          id: jc.id as string,
          customer: jc.customer as string,
          vehicle: jc.vehicle as string,
          technicians: (jc.technicians as string[]) ?? [],
          status: jc.status as string,
          checkIn,
          closed,
          daysOpen,
          laborHours: Number(jc.labor_hours ?? 0),
        };
      }).sort((a, b) => new Date(b.checkIn).getTime() - new Date(a.checkIn).getTime());

      setJobRows(builtJobRows);

    } catch (e) {
      console.error('Reports load error', e);
    } finally {
      setLoading(false);
    }
  }

  function exportCSV(rows: string[][], filename: string) {
    const csv = rows.map(r => r.map(c => `"${c}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename; a.click();
    URL.revokeObjectURL(url);
    notify(`${filename} downloaded.`);
  }

  function exportRevenueSummary() {
    if (!data) return;
    exportCSV(
      [
        ['Report', 'Value'],
        ['Total Revenue (Paid)', fmtMoney(data.totalRevenuePaid)],
        ['Total Outstanding', fmtMoney(data.totalOutstanding)],
        ['Total Payments Collected', fmtMoney(data.totalPayments)],
        ['Avg Invoice Value', fmtMoney(data.avgInvoiceValue)],
        ['Total Invoices', String(data.invoiceCount)],
        ['Paid Invoices', String(data.paidCount)],
        ['Sent / Unpaid', String(data.sentCount)],
        ['', ''],
        ['Month', 'Revenue (Paid Inv)', 'Payments Recorded'],
        ...data.monthlyRevenue.map(m => [m.month, fmtMoney(m.revenue), fmtMoney(m.payments)]),
      ],
      `${shopName.replace(/\s+/g, '-')}-Revenue-Report-${new Date().toISOString().slice(0, 10)}.csv`
    );
  }

  function exportROReport() {
    if (!data) return;
    exportCSV(
      [
        ['Metric', 'Value'],
        ['Total ROs', String(data.roCount)],
        ['Completed / Closed', String(data.completedROCount)],
        ['Total Labor Value', fmtMoney(data.totalLaborValue)],
        ['Total Parts Value', fmtMoney(data.totalPartsValue)],
        ['Total RO Value', fmtMoney(data.totalROValue)],
        ['Avg Labor Hours / RO', data.avgLaborHours.toFixed(2)],
      ],
      `${shopName.replace(/\s+/g, '-')}-RepairOrders-Report-${new Date().toISOString().slice(0, 10)}.csv`
    );
  }

  function exportCustomerReport() {
    if (!data) return;
    exportCSV(
      [
        ['Customer', 'Paid Invoices', 'Total Spend'],
        ...data.topCustomers.map(c => [c.name, String(c.invoiceCount), fmtMoney(c.totalSpend)]),
      ],
      `${shopName.replace(/\s+/g, '-')}-Customers-Report-${new Date().toISOString().slice(0, 10)}.csv`
    );
  }

  function exportPaymentReport() {
    if (!data) return;
    exportCSV(
      [
        ['Method', 'Count', 'Total'],
        ...data.methodBreakdown.map(m => [m.method, String(m.count), fmtMoney(m.total)]),
      ],
      `${shopName.replace(/\s+/g, '-')}-Payments-Report-${new Date().toISOString().slice(0, 10)}.csv`
    );
  }

  function exportTechReport() {
    const rows: string[][] = [
      ['Technician', 'Active Jobs', 'Completed Jobs', 'Total Jobs', 'Hours Logged', 'Avg Hours/Job'],
      ...techRows.map(t => [
        t.name,
        String(t.activeJobs),
        String(t.completedJobs),
        String(t.activeJobs + t.completedJobs),
        t.totalHoursLogged.toFixed(1),
        t.avgHoursPerJob.toFixed(1),
      ]),
    ];
    exportCSV(rows, `${shopName.replace(/\s+/g, '-')}-Technician-Report-${new Date().toISOString().slice(0, 10)}.csv`);
  }

  function exportJobCompletionReport() {
    const rows: string[][] = [
      ['Customer', 'Vehicle', 'Technicians', 'Status', 'Check-In', 'Closed', 'Days Open', 'Labor Hours'],
      ...filteredJobRows.map(j => [
        j.customer,
        j.vehicle,
        j.technicians.join(', ') || 'Unassigned',
        j.status,
        j.checkIn ? new Date(j.checkIn).toLocaleDateString() : '',
        j.closed ? new Date(j.closed).toLocaleDateString() : 'Open',
        String(j.daysOpen),
        j.laborHours.toFixed(1),
      ]),
    ];
    exportCSV(rows, `${shopName.replace(/\s+/g, '-')}-JobCompletion-Report-${new Date().toISOString().slice(0, 10)}.csv`);
  }

  const periodStart = (() => {
    if (jobPeriod === 'custom') {
      return filterMonth > 0
        ? new Date(filterYear, filterMonth - 1, 1).getTime()
        : new Date(filterYear, 0, 1).getTime();
    }
    const n = new Date();
    if (jobPeriod === 'week')    return new Date(n.getFullYear(), n.getMonth(), n.getDate() - n.getDay()).getTime();
    if (jobPeriod === 'month')   return new Date(n.getFullYear(), n.getMonth(), 1).getTime();
    if (jobPeriod === 'quarter') return new Date(n.getFullYear(), Math.floor(n.getMonth() / 3) * 3, 1).getTime();
    if (jobPeriod === 'year')    return new Date(n.getFullYear(), 0, 1).getTime();
    return 0;
  })();

  const periodEnd = (() => {
    if (jobPeriod === 'custom') {
      return filterMonth > 0
        ? new Date(filterYear, filterMonth, 1).getTime()
        : new Date(filterYear + 1, 0, 1).getTime();
    }
    return Infinity;
  })();

  const filteredJobRows = jobRows.filter(j => {
    if (jobFilter === 'complete') { if (j.status !== 'Complete' && j.status !== 'Closed') return false; }
    else if (jobFilter === 'invoiced') { if (j.status !== 'Invoiced') return false; }
    else if (jobFilter === 'open') { if (j.status === 'Complete' || j.status === 'Closed' || j.status === 'Invoiced') return false; }
    // For custom, filter by closed_date; otherwise filter by checkIn
    const dateField = jobPeriod === 'custom' ? j.closed : j.checkIn;
    if (periodStart > 0 && dateField) {
      const t = new Date(dateField).getTime();
      if (t < periodStart || t >= periodEnd) return false;
    } else if (periodStart > 0 && !dateField) return false;
    return true;
  });

  const TABS: { id: typeof activeTab; label: string }[] = [
    { id: 'overview', label: '📊 Overview' },
    { id: 'revenue', label: '💵 Revenue' },
    { id: 'repairs', label: '🔧 Repair Orders' },
    { id: 'payments', label: '💳 Payments' },
    { id: 'customers', label: '👥 Customers' },
    ...(enableTechnicianReport ? [{ id: 'technicians' as const, label: '👨‍🔧 Technicians' }] : []),
    ...(enableJobCompletionReport ? [{ id: 'completion' as const, label: '✅ Job Completion' }] : []),
  ];

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 300, color: 'var(--muted)' }}>
      Loading reports…
    </div>
  );

  const d = data!;
  const maxMonth = Math.max(...d.monthlyRevenue.map(m => Math.max(m.revenue, m.payments)), 1);
  const maxMethod = Math.max(...d.methodBreakdown.map(m => m.total), 1);
  const maxCust = Math.max(...d.topCustomers.map(c => c.totalSpend), 1);

  return (
    <>
      {toast && <div className="toast toast-visible">{toast}</div>}

      {/* ── Shop + Period selector bar ── */}
      <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', padding: '10px 14px', background: 'var(--surface-soft)', border: '1px solid var(--line)', borderRadius: 10 }}>
        {/* Shop selector */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--muted)', whiteSpace: 'nowrap' }}>🏪 SHOP:</span>
          <select
            value={reportShopId}
            onChange={e => setReportShopId(e.target.value)}
            style={{ padding: '6px 10px', borderRadius: 6, border: '1px solid var(--line)', background: 'var(--surface)', color: 'var(--text)', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
            {shops.map((s: Shop) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
        </div>

        <div style={{ width: 1, height: 28, background: 'var(--line)' }} />

        {/* Month picker */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--muted)', whiteSpace: 'nowrap' }}>📅 PERIOD:</span>
          <select
            value={filterMonth}
            onChange={e => setFilterMonth(Number(e.target.value))}
            style={{ padding: '6px 10px', borderRadius: 6, border: '1px solid var(--line)', background: 'var(--surface)', color: 'var(--text)', fontSize: 13 }}>
            <option value={0}>All months</option>
            {MONTH_NAMES_FULL.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
          </select>
          <select
            value={filterYear}
            onChange={e => setFilterYear(Number(e.target.value))}
            style={{ padding: '6px 10px', borderRadius: 6, border: '1px solid var(--line)', background: 'var(--surface)', color: 'var(--text)', fontSize: 13 }}>
            {Array.from({ length: 5 }, (_, i) => now.getFullYear() - i).map(y => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
        </div>

        <div style={{ marginLeft: 'auto' }}>
          <button
            onClick={() => setShowPrintModal(true)}
            style={{ padding: '8px 18px', background: '#cc0000', color: '#fff', border: 'none', borderRadius: 8, fontWeight: 700, fontSize: 13, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
            🔍 Search
          </button>
        </div>
      </div>

      {/* Tab bar */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 20, flexWrap: 'wrap' }}>
        {TABS.map(t => (
          <button key={t.id} onClick={() => setActiveTab(t.id)}
            style={{ padding: '8px 18px', borderRadius: 8, border: '1px solid var(--line)', background: activeTab === t.id ? 'var(--accent)' : 'var(--surface-soft)', color: activeTab === t.id ? '#fff' : 'var(--text)', fontWeight: 600, fontSize: 13, cursor: 'pointer' }}>
            {t.label}
          </button>
        ))}
      </div>

      {/* ── OVERVIEW ── */}
      {activeTab === 'overview' && (
        <>
          <div className="grid cols-4" style={{ marginBottom: 16 }}>
            {[
              { label: 'Total Revenue', value: fmtMoney(d.totalRevenuePaid), sub: `${d.paymentCount} payment${d.paymentCount !== 1 ? 's' : ''} collected`, color: '#4caf50' },
              { label: 'Outstanding', value: fmtMoney(d.totalOutstanding), sub: `${d.sentCount} unpaid invoice${d.sentCount !== 1 ? 's' : ''}`, color: d.totalOutstanding > 0 ? '#f59e0b' : 'var(--text)' },
              { label: 'Total Invoiced', value: fmtMoney(d.totalOutstanding + d.totalRevenuePaid), sub: `${d.invoiceCount} invoice${d.invoiceCount !== 1 ? 's' : ''} (excl. void)`, color: 'var(--text)' },
              { label: 'Avg per Transaction', value: fmtMoney(d.avgInvoiceValue), sub: d.paymentCount > 0 ? `across ${d.paymentCount} payment${d.paymentCount !== 1 ? 's' : ''}` : 'No payments yet', color: 'var(--text)' },
            ].map(card => (
              <div key={card.label} className="card" style={{ padding: 18 }}>
                <div style={{ fontSize: 11, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.07em', fontWeight: 700 }}>{card.label}</div>
                <div style={{ fontSize: 24, fontWeight: 800, color: card.color, marginTop: 4 }}>{card.value}</div>
                <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4 }}>{card.sub}</div>
              </div>
            ))}
          </div>

          <div className="grid cols-4" style={{ marginBottom: 16 }}>
            {[
              { label: 'Repair Orders', value: String(d.roCount), sub: `${d.completedROCount} completed`, color: 'var(--text)' },
              { label: 'Total RO Value', value: fmtMoney(d.totalROValue), sub: 'Labor + Parts', color: 'var(--text)' },
              { label: 'Customers', value: String(d.totalCustomers), sub: `${d.totalVehicles} vehicles`, color: 'var(--text)' },
              { label: 'Estimate Conversion', value: fmtPct(d.estimateConvertRate), sub: `${d.convertedEstimates} of ${d.totalEstimates}`, color: d.estimateConvertRate > 50 ? '#4caf50' : 'var(--text)' },
            ].map(card => (
              <div key={card.label} className="card" style={{ padding: 18 }}>
                <div style={{ fontSize: 11, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.07em', fontWeight: 700 }}>{card.label}</div>
                <div style={{ fontSize: 24, fontWeight: 800, color: card.color, marginTop: 4 }}>{card.value}</div>
                <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4 }}>{card.sub}</div>
              </div>
            ))}
          </div>

          {/* 6-Month Revenue Chart */}
          <Panel title="Monthly Revenue — Last 6 Months" hint="Paid invoices vs payments recorded per month">
            <div style={{ display: 'flex', gap: 3, alignItems: 'flex-end', height: 140, padding: '8px 4px 0', marginBottom: 8 }}>
              {d.monthlyRevenue.map((m, i) => (
                <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                  <div style={{ width: '100%', display: 'flex', gap: 2, alignItems: 'flex-end', justifyContent: 'center', height: 110 }}>
                    {/* Revenue bar */}
                    <div title={`Revenue: ${fmtMoney(m.revenue)}`}
                      style={{ flex: 1, height: Math.max(3, Math.round((m.revenue / maxMonth) * 100)) + 'px', background: 'var(--accent)', borderRadius: '3px 3px 0 0' }} />
                    {/* Payments bar */}
                    <div title={`Payments: ${fmtMoney(m.payments)}`}
                      style={{ flex: 1, height: Math.max(3, Math.round((m.payments / maxMonth) * 100)) + 'px', background: '#2196f3', borderRadius: '3px 3px 0 0', opacity: 0.7 }} />
                  </div>
                  <div style={{ fontSize: 10, color: 'var(--muted)', textAlign: 'center' }}>{m.month}</div>
                </div>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 16, fontSize: 11, color: 'var(--muted)' }}>
              <span><span style={{ display: 'inline-block', width: 10, height: 10, background: 'var(--accent)', borderRadius: 2, marginRight: 4 }} />Revenue Collected (Payments)</span>
              <span><span style={{ display: 'inline-block', width: 10, height: 10, background: '#2196f3', borderRadius: 2, marginRight: 4, opacity: 0.7 }} />Paid Invoices (Invoice Date)</span>
            </div>
          </Panel>
        </>
      )}

      {/* ── REVENUE ── */}
      {activeTab === 'revenue' && (
        <>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
            <button className="btn btn-primary" onClick={exportRevenueSummary}>⬇ Export CSV</button>
          </div>

          <div className="grid cols-3" style={{ marginBottom: 16 }}>
            {[
              { label: 'Revenue Collected', value: fmtMoney(d.totalRevenuePaid), color: '#4caf50', sub: `${d.paymentCount} payment${d.paymentCount !== 1 ? 's' : ''} recorded` },
              { label: 'Outstanding (Unpaid)', value: fmtMoney(d.totalOutstanding), color: '#f59e0b', sub: `${d.sentCount} sent invoice${d.sentCount !== 1 ? 's' : ''}` },
              { label: 'Voided Invoices', value: fmtMoney(d.totalVoid), color: '#f44336', sub: 'Excluded from revenue' },
            ].map(c => (
              <div key={c.label} className="card" style={{ padding: 18 }}>
                <div style={{ fontSize: 11, color: 'var(--muted)', textTransform: 'uppercase', fontWeight: 700, letterSpacing: '0.07em' }}>{c.label}</div>
                <div style={{ fontSize: 26, fontWeight: 800, color: c.color, marginTop: 6 }}>{c.value}</div>
                <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4 }}>{c.sub}</div>
              </div>
            ))}
          </div>

          <Panel title="Monthly Revenue Breakdown" hint="Last 6 months — paid invoices vs payments recorded">
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: '2px solid var(--line)' }}>
                  <th style={{ textAlign: 'left', padding: '8px 10px', color: 'var(--muted)', fontSize: 11, fontWeight: 700 }}>Month</th>
                  <th style={{ textAlign: 'right', padding: '8px 10px', color: 'var(--muted)', fontSize: 11, fontWeight: 700 }}>Revenue Collected</th>
                  <th style={{ textAlign: 'right', padding: '8px 10px', color: 'var(--muted)', fontSize: 11, fontWeight: 700 }}>Paid Invoices</th>
                  <th style={{ padding: '8px 10px' }} />
                </tr>
              </thead>
              <tbody>
                {d.monthlyRevenue.map((m, i) => (
                  <tr key={i} style={{ borderBottom: '1px solid var(--line)' }}>
                    <td style={{ padding: '10px' }}>{m.month}</td>
                    <td style={{ padding: '10px', textAlign: 'right', fontWeight: 700, color: m.revenue > 0 ? '#4caf50' : 'var(--muted)' }}>{fmtMoney(m.revenue)}</td>
                    <td style={{ padding: '10px', textAlign: 'right', fontWeight: 700, color: m.payments > 0 ? '#2196f3' : 'var(--muted)' }}>{fmtMoney(m.payments)}</td>
                    <td style={{ padding: '10px', width: 160 }}>
                      <div style={{ height: 8, background: 'var(--line)', borderRadius: 4, overflow: 'hidden' }}>
                        <div style={{ height: '100%', width: `${(m.revenue / maxMonth) * 100}%`, background: 'var(--accent)', borderRadius: 4 }} />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Panel>
        </>
      )}

      {/* ── REPAIR ORDERS ── */}
      {activeTab === 'repairs' && (
        <>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
            <button className="btn btn-primary" onClick={exportROReport}>⬇ Export CSV</button>
          </div>

          <div className="grid cols-3" style={{ marginBottom: 16 }}>
            {[
              { label: 'Total RO Value', value: fmtMoney(d.totalROValue), sub: 'Labor + Parts', color: 'var(--text)' },
              { label: 'Total Labor Value', value: fmtMoney(d.totalLaborValue), sub: 'All non-void ROs', color: '#2196f3' },
              { label: 'Total Parts Value', value: fmtMoney(d.totalPartsValue), sub: 'All non-void ROs', color: '#ff9800' },
            ].map(c => (
              <div key={c.label} className="card" style={{ padding: 18 }}>
                <div style={{ fontSize: 11, color: 'var(--muted)', textTransform: 'uppercase', fontWeight: 700, letterSpacing: '0.07em' }}>{c.label}</div>
                <div style={{ fontSize: 24, fontWeight: 800, color: c.color, marginTop: 6 }}>{c.value}</div>
                <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4 }}>{c.sub}</div>
              </div>
            ))}
          </div>

          <div className="grid cols-3" style={{ marginBottom: 16 }}>
            {[
              { label: 'Total Repair Orders', value: String(d.roCount), color: 'var(--text)' },
              { label: 'Completed / Closed', value: String(d.completedROCount), color: '#4caf50' },
              { label: 'Avg Labor Hours / RO', value: d.avgLaborHours.toFixed(1) + ' hrs', color: 'var(--text)' },
            ].map(c => (
              <div key={c.label} className="card" style={{ padding: 18 }}>
                <div style={{ fontSize: 11, color: 'var(--muted)', textTransform: 'uppercase', fontWeight: 700, letterSpacing: '0.07em' }}>{c.label}</div>
                <div style={{ fontSize: 24, fontWeight: 800, color: c.color, marginTop: 6 }}>{c.value}</div>
              </div>
            ))}
          </div>

          <Panel title="Labor vs Parts Split">
            <div style={{ display: 'flex', height: 24, borderRadius: 8, overflow: 'hidden', marginBottom: 10 }}>
              <div style={{ flex: d.totalLaborValue, background: '#2196f3' }} title={`Labor: ${fmtMoney(d.totalLaborValue)}`} />
              <div style={{ flex: d.totalPartsValue, background: '#ff9800' }} title={`Parts: ${fmtMoney(d.totalPartsValue)}`} />
            </div>
            <div style={{ display: 'flex', gap: 20, fontSize: 12 }}>
              <span><span style={{ display: 'inline-block', width: 10, height: 10, background: '#2196f3', borderRadius: 2, marginRight: 4 }} />Labor {fmtMoney(d.totalLaborValue)}</span>
              <span><span style={{ display: 'inline-block', width: 10, height: 10, background: '#ff9800', borderRadius: 2, marginRight: 4 }} />Parts {fmtMoney(d.totalPartsValue)}</span>
            </div>
          </Panel>
        </>
      )}

      {/* ── PAYMENTS ── */}
      {activeTab === 'payments' && (
        <>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
            <button className="btn btn-primary" onClick={exportPaymentReport}>⬇ Export CSV</button>
          </div>

          <div className="grid cols-3" style={{ marginBottom: 16 }}>
            <div className="card" style={{ padding: 18 }}>
              <div style={{ fontSize: 11, color: 'var(--muted)', textTransform: 'uppercase', fontWeight: 700, letterSpacing: '0.07em' }}>Total Collected</div>
              <div style={{ fontSize: 26, fontWeight: 800, color: '#4caf50', marginTop: 6 }}>{fmtMoney(d.totalPayments)}</div>
            </div>
            <div className="card" style={{ padding: 18 }}>
              <div style={{ fontSize: 11, color: 'var(--muted)', textTransform: 'uppercase', fontWeight: 700, letterSpacing: '0.07em' }}>Transactions</div>
              <div style={{ fontSize: 26, fontWeight: 800, marginTop: 6 }}>{d.paymentCount}</div>
            </div>
            <div className="card" style={{ padding: 18 }}>
              <div style={{ fontSize: 11, color: 'var(--muted)', textTransform: 'uppercase', fontWeight: 700, letterSpacing: '0.07em' }}>Payment Methods</div>
              <div style={{ fontSize: 26, fontWeight: 800, marginTop: 6 }}>{d.methodBreakdown.length}</div>
            </div>
          </div>

          <Panel title="Revenue by Payment Method">
            {d.methodBreakdown.length === 0 ? (
              <p style={{ color: 'var(--muted)', fontSize: 13 }}>No payments recorded yet.</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {d.methodBreakdown.map(m => (
                  <div key={m.method}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                      <span style={{ fontSize: 13, fontWeight: 500 }}>{m.method}</span>
                      <div style={{ display: 'flex', gap: 12, fontSize: 13 }}>
                        <span style={{ color: 'var(--muted)' }}>{m.count} txn{m.count !== 1 ? 's' : ''}</span>
                        <span style={{ fontWeight: 700 }}>{fmtMoney(m.total)}</span>
                      </div>
                    </div>
                    <div style={{ height: 10, background: 'var(--line)', borderRadius: 5, overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${(m.total / maxMethod) * 100}%`, background: 'var(--accent)', borderRadius: 5, transition: 'width 0.4s' }} />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Panel>
        </>
      )}

      {/* ── CUSTOMERS ── */}
      {activeTab === 'customers' && (
        <>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
            <button className="btn btn-primary" onClick={exportCustomerReport}>⬇ Export CSV</button>
          </div>

          <div className="grid cols-4" style={{ marginBottom: 16 }}>
            {[
              { label: 'Total Customers', value: String(d.totalCustomers), color: 'var(--text)' },
              { label: 'Total Vehicles', value: String(d.totalVehicles), color: 'var(--text)' },
              { label: 'Estimates', value: String(d.totalEstimates), color: 'var(--text)' },
              { label: 'Convert Rate', value: fmtPct(d.estimateConvertRate), color: d.estimateConvertRate > 50 ? '#4caf50' : 'var(--text)' },
            ].map(c => (
              <div key={c.label} className="card" style={{ padding: 18 }}>
                <div style={{ fontSize: 11, color: 'var(--muted)', textTransform: 'uppercase', fontWeight: 700, letterSpacing: '0.07em' }}>{c.label}</div>
                <div style={{ fontSize: 26, fontWeight: 800, color: c.color, marginTop: 6 }}>{c.value}</div>
              </div>
            ))}
          </div>

          <Panel title="Top Customers by Revenue" hint="Based on paid invoices only">
            {d.topCustomers.length === 0 ? (
              <p style={{ color: 'var(--muted)', fontSize: 13 }}>No paid invoices yet.</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {d.topCustomers.map((c, i) => (
                  <div key={c.name} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div style={{ width: 28, height: 28, borderRadius: '50%', background: i === 0 ? 'var(--accent)' : 'var(--line)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, color: i === 0 ? '#fff' : 'var(--muted)', flexShrink: 0 }}>
                      {i + 1}
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                        <span style={{ fontSize: 13, fontWeight: 600 }}>{c.name}</span>
                        <div style={{ display: 'flex', gap: 12, fontSize: 13 }}>
                          <span style={{ color: 'var(--muted)' }}>{c.invoiceCount} invoice{c.invoiceCount !== 1 ? 's' : ''}</span>
                          <span style={{ fontWeight: 700, color: '#4caf50' }}>{fmtMoney(c.totalSpend)}</span>
                        </div>
                      </div>
                      <div style={{ height: 8, background: 'var(--line)', borderRadius: 4, overflow: 'hidden' }}>
                        <div style={{ height: '100%', width: `${(c.totalSpend / maxCust) * 100}%`, background: i === 0 ? 'var(--accent)' : '#4caf50', borderRadius: 4, opacity: Math.max(0.4, 1 - i * 0.1) }} />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Panel>

          <Panel title="Estimate Pipeline" hint="Approval and conversion funnel">
            <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
              {[
                { label: 'Total Estimates', value: d.totalEstimates, color: '#888' },
                { label: 'Approved', value: d.approvedEstimates, color: '#4caf50' },
                { label: 'Declined', value: d.declinedEstimates, color: '#f44336' },
                { label: 'Converted', value: d.convertedEstimates, color: '#2196f3' },
              ].map(e => (
                <div key={e.label} style={{ flex: 1, minWidth: 100, textAlign: 'center', padding: 16, background: 'var(--surface-soft)', borderRadius: 10, border: '1px solid var(--line)' }}>
                  <div style={{ fontSize: 28, fontWeight: 800, color: e.color }}>{e.value}</div>
                  <div style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', marginTop: 4 }}>{e.label}</div>
                </div>
              ))}
            </div>
          </Panel>
        </>
      )}

      {/* ── TECHNICIANS ── */}
      {activeTab === 'technicians' && (
        <>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
            <button className="btn btn-primary" onClick={exportTechReport}>⬇ Export CSV</button>
          </div>

          {/* Summary stats */}
          <div className="grid cols-4" style={{ marginBottom: 16 }}>
            {[
              { label: 'Technicians', value: String(techRows.filter(t => t.name !== 'Unassigned').length), color: 'var(--text)' },
              { label: 'Active Jobs', value: String(techRows.reduce((s, t) => s + t.activeJobs, 0)), color: '#f59e0b' },
              { label: 'Completed Jobs', value: String(techRows.reduce((s, t) => s + t.completedJobs, 0)), color: '#4caf50' },
              { label: 'Total Hours Logged', value: techRows.reduce((s, t) => s + t.totalHoursLogged, 0).toFixed(1) + ' h', color: '#2196f3' },
            ].map(c => (
              <div key={c.label} className="card" style={{ padding: 18 }}>
                <div style={{ fontSize: 11, color: 'var(--muted)', textTransform: 'uppercase', fontWeight: 700, letterSpacing: '0.07em' }}>{c.label}</div>
                <div style={{ fontSize: 26, fontWeight: 800, color: c.color, marginTop: 6 }}>{c.value}</div>
              </div>
            ))}
          </div>

          {techRows.length === 0 ? (
            <Panel title="Technician Assignments">
              <p style={{ color: 'var(--muted)', fontSize: 13 }}>No job cards found. Create job cards and assign technicians to see this report.</p>
            </Panel>
          ) : (
            <Panel title="Technician Assignments" hint="Click a row to see that technician's jobs">
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ borderBottom: '2px solid var(--line)' }}>
                    {['Technician', 'Active Jobs', 'Completed', 'Total', 'Hours Logged', 'Avg h/Job', 'Completion Rate', ''].map(h => (
                      <th key={h} style={{ textAlign: 'left', padding: '8px 10px', fontSize: 11, color: 'var(--muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {techRows.map(t => {
                    const total = t.activeJobs + t.completedJobs;
                    const rate = total > 0 ? (t.completedJobs / total) * 100 : 0;
                    const isExpanded = expandedTech === t.name;
                    return (
                      <>
                        <tr key={t.name} style={{ borderBottom: '1px solid var(--line)', cursor: 'pointer', background: isExpanded ? 'rgba(204,0,0,0.04)' : undefined }}
                          onClick={() => setExpandedTech(isExpanded ? null : t.name)}>
                          <td style={{ padding: '12px 10px', fontWeight: 700 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                              <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'var(--accent)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 800, flexShrink: 0 }}>
                                {t.name === 'Unassigned' ? '?' : t.name.charAt(0).toUpperCase()}
                              </div>
                              {t.name}
                            </div>
                          </td>
                          <td style={{ padding: '12px 10px' }}>
                            <span style={{ background: t.activeJobs > 0 ? 'rgba(245,158,11,0.12)' : 'var(--surface-soft)', color: t.activeJobs > 0 ? '#f59e0b' : 'var(--muted)', borderRadius: 6, padding: '3px 10px', fontWeight: 700, fontSize: 12 }}>{t.activeJobs}</span>
                          </td>
                          <td style={{ padding: '12px 10px' }}>
                            <span style={{ background: 'rgba(76,175,80,0.1)', color: '#4caf50', borderRadius: 6, padding: '3px 10px', fontWeight: 700, fontSize: 12 }}>{t.completedJobs}</span>
                          </td>
                          <td style={{ padding: '12px 10px', fontWeight: 700 }}>{total}</td>
                          <td style={{ padding: '12px 10px', color: '#2196f3', fontWeight: 600 }}>{t.totalHoursLogged.toFixed(1)} h</td>
                          <td style={{ padding: '12px 10px', color: 'var(--muted)' }}>{t.avgHoursPerJob.toFixed(1)} h</td>
                          <td style={{ padding: '12px 10px', width: 160 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                              <div style={{ flex: 1, height: 8, background: 'var(--line)', borderRadius: 4, overflow: 'hidden' }}>
                                <div style={{ height: '100%', width: `${rate}%`, background: rate >= 70 ? '#4caf50' : rate >= 40 ? '#f59e0b' : 'var(--accent)', borderRadius: 4 }} />
                              </div>
                              <span style={{ fontSize: 11, color: 'var(--muted)', minWidth: 32, textAlign: 'right' }}>{rate.toFixed(0)}%</span>
                            </div>
                          </td>
                          <td style={{ padding: '12px 10px', color: 'var(--muted)', fontSize: 12 }}>{isExpanded ? '▲' : '▼'}</td>
                        </tr>
                        {isExpanded && (
                          <tr key={t.name + '-detail'}>
                            <td colSpan={8} style={{ padding: '0 10px 12px', background: 'var(--surface-soft)' }}>
                              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                                <thead>
                                  <tr style={{ borderBottom: '1px solid var(--line)' }}>
                                    {['Customer', 'Vehicle', 'Status', 'Check-In', 'Closed'].map(h => (
                                      <th key={h} style={{ textAlign: 'left', padding: '6px 8px', color: 'var(--muted)', fontWeight: 600 }}>{h}</th>
                                    ))}
                                  </tr>
                                </thead>
                                <tbody>
                                  {t.jobs.map((j, i) => (
                                    <tr key={i} style={{ borderBottom: '1px solid var(--line)' }}>
                                      <td style={{ padding: '7px 8px', fontWeight: 600 }}>{j.customer || '—'}</td>
                                      <td style={{ padding: '7px 8px', color: 'var(--muted)' }}>{j.vehicle || '—'}</td>
                                      <td style={{ padding: '7px 8px' }}>
                                        <span style={{
                                          padding: '2px 8px', borderRadius: 5, fontSize: 11, fontWeight: 700,
                                          background: j.status === 'Complete' || j.status === 'Closed' ? 'rgba(76,175,80,0.12)' : j.status === 'Invoiced' ? 'rgba(33,150,243,0.12)' : 'rgba(245,158,11,0.12)',
                                          color: j.status === 'Complete' || j.status === 'Closed' ? '#4caf50' : j.status === 'Invoiced' ? '#2196f3' : '#f59e0b',
                                        }}>{j.status || 'Unknown'}</span>
                                      </td>
                                      <td style={{ padding: '7px 8px', color: 'var(--muted)' }}>{j.checkIn ? new Date(j.checkIn).toLocaleDateString() : '—'}</td>
                                      <td style={{ padding: '7px 8px', color: j.closed ? '#4caf50' : 'var(--muted)' }}>{j.closed ? new Date(j.closed).toLocaleDateString() : 'Open'}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </td>
                          </tr>
                        )}
                      </>
                    );
                  })}
                </tbody>
              </table>
            </Panel>
          )}
        </>
      )}

      {/* ── JOB COMPLETION ── */}
      {activeTab === 'completion' && (
        <>
          {/* Period + status filters */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
            {/* Period row */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                {([
                  { id: 'week',    label: 'This Week' },
                  { id: 'month',   label: 'This Month' },
                  { id: 'quarter', label: 'This Quarter' },
                  { id: 'year',    label: 'This Year' },
                  { id: 'all',     label: 'All Time' },
                  { id: 'custom',  label: `${filterMonth > 0 ? MONTH_NAMES_FULL[filterMonth - 1] + ' ' : ''}${filterYear}` },
                ] as { id: typeof jobPeriod; label: string }[]).map(p => (
                  <button key={p.id} onClick={() => setJobPeriod(p.id)}
                    style={{ padding: '6px 14px', borderRadius: 20, border: `1px solid ${jobPeriod === p.id ? 'var(--accent)' : 'var(--line)'}`, cursor: 'pointer', fontSize: 12, fontWeight: jobPeriod === p.id ? 700 : 400, background: jobPeriod === p.id ? 'rgba(204,0,0,0.1)' : 'var(--surface-soft)', color: jobPeriod === p.id ? 'var(--accent)' : 'var(--muted)' }}>
                    {p.id === 'custom' ? `📅 ${p.label}` : p.label}
                  </button>
                ))}
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="btn btn-primary" onClick={exportJobCompletionReport}>⬇ Export CSV</button>
              </div>
            </div>
            {/* Status row */}
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {([
                { id: 'all',      label: 'All Status' },
                { id: 'open',     label: 'Open / In Progress' },
                { id: 'complete', label: 'Complete' },
                { id: 'invoiced', label: 'Invoiced' },
              ] as { id: typeof jobFilter; label: string }[]).map(f => (
                <button key={f.id} onClick={() => setJobFilter(f.id)}
                  style={{ padding: '5px 13px', borderRadius: 20, border: '1px solid var(--line)', cursor: 'pointer', fontSize: 12, fontWeight: jobFilter === f.id ? 700 : 400, background: jobFilter === f.id ? 'var(--accent)' : 'var(--surface-soft)', color: jobFilter === f.id ? '#fff' : 'var(--muted)' }}>
                  {f.label}
                </button>
              ))}
              {(jobPeriod !== 'all' || jobFilter !== 'all') && (
                <span style={{ fontSize: 12, color: 'var(--muted)', alignSelf: 'center', marginLeft: 4 }}>
                  {filteredJobRows.length} job{filteredJobRows.length !== 1 ? 's' : ''} shown
                </span>
              )}
            </div>
          </div>

          {/* Stats row */}
          {(() => {
            const total = jobRows.length;
            const completed = jobRows.filter(j => j.status === 'Complete' || j.status === 'Closed').length;
            const invoiced = jobRows.filter(j => j.status === 'Invoiced').length;
            const open = jobRows.filter(j => j.status !== 'Complete' && j.status !== 'Closed' && j.status !== 'Invoiced').length;
            const closedRows = jobRows.filter(j => j.closed);
            const avgDays = closedRows.length > 0 ? closedRows.reduce((s, j) => s + j.daysOpen, 0) / closedRows.length : 0;
            const completionRate = total > 0 ? ((completed + invoiced) / total) * 100 : 0;
            return (
              <div className="grid cols-4" style={{ marginBottom: 16 }}>
                {[
                  { label: 'Total Job Cards', value: String(total), color: 'var(--text)' },
                  { label: 'Open / In Progress', value: String(open), color: '#f59e0b' },
                  { label: 'Complete + Invoiced', value: String(completed + invoiced), color: '#4caf50' },
                  { label: 'Avg Days to Close', value: avgDays > 0 ? avgDays.toFixed(1) + ' days' : '—', color: avgDays > 7 ? '#f44336' : avgDays > 3 ? '#f59e0b' : '#4caf50' },
                ].map(c => (
                  <div key={c.label} className="card" style={{ padding: 18 }}>
                    <div style={{ fontSize: 11, color: 'var(--muted)', textTransform: 'uppercase', fontWeight: 700, letterSpacing: '0.07em' }}>{c.label}</div>
                    <div style={{ fontSize: 24, fontWeight: 800, color: c.color, marginTop: 6 }}>{c.value}</div>
                    {c.label === 'Complete + Invoiced' && <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4 }}>{completionRate.toFixed(0)}% completion rate</div>}
                  </div>
                ))}
              </div>
            );
          })()}

          {/* Status breakdown bar */}
          {(() => {
            const counts: Record<string, number> = {};
            for (const j of jobRows) counts[j.status] = (counts[j.status] ?? 0) + 1;
            const total = jobRows.length || 1;
            const STATUS_COLORS: Record<string, string> = {
              'Booked': '#64748b', 'In Progress': '#f59e0b', 'Approved': '#3b82f6',
              'Dispatched': '#8b5cf6', 'Waiting for Parts': '#f97316', 'Diagnostic': '#06b6d4',
              'Complete': '#4caf50', 'Closed': '#22c55e', 'Invoiced': '#2196f3',
            };
            const entries = Object.entries(counts).sort((a, b) => b[1] - a[1]);
            return (
              <Panel title="Jobs by Status" hint="Distribution across all job card statuses">
                <div style={{ display: 'flex', height: 28, borderRadius: 8, overflow: 'hidden', marginBottom: 14 }}>
                  {entries.map(([status, count]) => (
                    <div key={status} title={`${status}: ${count}`}
                      style={{ flex: count / total, background: STATUS_COLORS[status] ?? '#888', minWidth: count > 0 ? 3 : 0 }} />
                  ))}
                </div>
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                  {entries.map(([status, count]) => (
                    <span key={status} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, color: 'var(--muted)' }}>
                      <span style={{ width: 10, height: 10, borderRadius: 2, background: STATUS_COLORS[status] ?? '#888', display: 'inline-block' }} />
                      {status} ({count})
                    </span>
                  ))}
                </div>
              </Panel>
            );
          })()}

          {/* Detail table */}
          <Panel title={`Job List${filteredJobRows.length !== jobRows.length ? ` — ${filteredJobRows.length} of ${jobRows.length}` : ` — ${jobRows.length} total`}`}>
            {filteredJobRows.length === 0 ? (
              <p style={{ color: 'var(--muted)', fontSize: 13 }}>No jobs match the selected filter.</p>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                  <thead>
                    <tr style={{ borderBottom: '2px solid var(--line)' }}>
                      {['Customer', 'Vehicle', 'Technician(s)', 'Status', 'Check-In', 'Closed', 'Days', 'Labor h'].map(h => (
                        <th key={h} style={{ textAlign: 'left', padding: '8px 10px', fontSize: 11, color: 'var(--muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', whiteSpace: 'nowrap' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {filteredJobRows.map(j => {
                      const isComplete = j.status === 'Complete' || j.status === 'Closed' || j.status === 'Invoiced';
                      const STATUS_COLORS: Record<string, string> = {
                        'Complete': '#4caf50', 'Closed': '#22c55e', 'Invoiced': '#2196f3',
                        'In Progress': '#f59e0b', 'Waiting for Parts': '#f97316',
                      };
                      const sc = STATUS_COLORS[j.status] ?? '#888';
                      return (
                        <tr key={j.id} style={{ borderBottom: '1px solid var(--line)' }}>
                          <td style={{ padding: '10px', fontWeight: 600, maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{j.customer || '—'}</td>
                          <td style={{ padding: '10px', color: 'var(--muted)', maxWidth: 130, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{j.vehicle || '—'}</td>
                          <td style={{ padding: '10px', maxWidth: 130 }}>
                            {j.technicians.length > 0
                              ? j.technicians.map((t, i) => (
                                  <span key={i} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, background: 'rgba(204,0,0,0.08)', color: 'var(--accent)', borderRadius: 5, padding: '2px 7px', fontSize: 11, fontWeight: 700, marginRight: 3 }}>
                                    {t.charAt(0).toUpperCase()}{t.length > 8 ? t.slice(1, 7) + '…' : t.slice(1)}
                                  </span>
                                ))
                              : <span style={{ color: 'var(--muted)', fontSize: 12 }}>Unassigned</span>
                            }
                          </td>
                          <td style={{ padding: '10px' }}>
                            <span style={{ background: `${sc}18`, color: sc, borderRadius: 5, padding: '3px 9px', fontSize: 11, fontWeight: 700, whiteSpace: 'nowrap' }}>{j.status || '—'}</span>
                          </td>
                          <td style={{ padding: '10px', color: 'var(--muted)', fontSize: 12, whiteSpace: 'nowrap' }}>{j.checkIn ? new Date(j.checkIn).toLocaleDateString() : '—'}</td>
                          <td style={{ padding: '10px', color: isComplete ? '#4caf50' : 'var(--muted)', fontSize: 12, whiteSpace: 'nowrap' }}>{j.closed ? new Date(j.closed).toLocaleDateString() : 'Open'}</td>
                          <td style={{ padding: '10px', fontWeight: 700, color: j.daysOpen > 7 ? '#f44336' : j.daysOpen > 3 ? '#f59e0b' : 'var(--text)' }}>{j.daysOpen}d</td>
                          <td style={{ padding: '10px', color: 'var(--muted)' }}>{j.laborHours > 0 ? j.laborHours.toFixed(1) : '—'}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </Panel>
        </>
      )}

      {showPrintModal && (
        <WorkshopPrintModal
          shopId={reportShopId}
          month={filterMonth}
          year={filterYear}
          periodLabel="All Completed Jobs"
          shopName={shops.find(s => s.id === reportShopId)?.name ?? 'Workshop'}
          onClose={() => setShowPrintModal(false)}
        />
      )}
    </>
  );
}
