'use client';

import { useEffect, useState } from 'react';
import { useAppDispatch, useAppState } from '@/lib/store';
import { Panel } from '@/components/Panel';
import {
  fetchRepairOrders, createRepairOrder, updateRepairOrder,
  closeRepairOrder, deleteRepairOrder, nextRONumber, calcROTotal,
  RO_STATUSES, type RepairOrder,
} from '@/services/repairOrderService';
import { createInvoice, formatMoney, CURRENCIES, nextInvoiceNumber } from '@/services/invoiceService';
import { fetchCustomerNames, fetchVehicles } from '@/services/vehicleService';
import { fetchTechnicians, type Technician } from '@/services/technicianService';
import { fetchShopSettings, type ShopSettings } from '@/services/shopSettingsService';
import { useShop } from '@/lib/useShop';
import { OwnerInsights } from '@/components/OwnerInsights';
import { seedLaborGuide } from '@/services/laborGuideService';

const fmt = (d: string) => d ? new Date(d).toLocaleDateString() : '—';

// ── Smart QA checklist generator ────────────────────────────────
interface QAItem { id: string; label: string; passed: boolean | null; }

function generateChecklist(concern: string, cause: string, correction: string): QAItem[] {
  const text = [concern, cause, correction].join(' ').toLowerCase();
  const items: { id: string; label: string }[] = [];

  // Always-present base items
  items.push(
    { id: 'clean', label: 'Vehicle returned clean — no grease or fingerprints on interior/exterior' },
    { id: 'personal', label: 'Customer personal items returned and undisturbed' },
    { id: 'paperwork', label: 'All paperwork and keys ready for customer' },
  );

  // Fluid / leak checks
  if (/oil|leak|drip|seal|gasket|pan|sump/.test(text))
    items.push(
      { id: 'oil_leak', label: 'No oil leaks visible — check under vehicle with white paper' },
      { id: 'oil_level', label: 'Engine oil level correct on dipstick' },
    );

  if (/coolant|radiator|overheat|water pump|thermostat|hose/.test(text))
    items.push(
      { id: 'coolant_level', label: 'Coolant level correct in reservoir and radiator' },
      { id: 'coolant_leak', label: 'No coolant leaks at hoses, radiator, or water pump' },
      { id: 'temp', label: 'Engine temperature gauge reads normal after warm-up' },
    );

  if (/transmission|gearbox|gear|shift/.test(text))
    items.push(
      { id: 'trans_fluid', label: 'Transmission fluid level correct' },
      { id: 'shift', label: 'All gears engage smoothly — no slipping or hesitation' },
    );

  if (/brake|caliper|rotor|pad|disc|stop/.test(text))
    items.push(
      { id: 'brake_feel', label: 'Brake pedal firm — no sponginess' },
      { id: 'brake_noise', label: 'No squealing or grinding noise during braking' },
      { id: 'brake_straight', label: 'Vehicle stops straight — no pull to either side' },
      { id: 'brake_fluid', label: 'Brake fluid level correct' },
    );

  if (/a\/c|ac |air.con|aircon|refrigerant|freon|compressor|blower|hvac/.test(text))
    items.push(
      { id: 'ac_cold', label: 'A/C blows cold — outlet temperature below 10°C / 50°F' },
      { id: 'ac_noise', label: 'No A/C compressor noise or rattling' },
      { id: 'ac_leak', label: 'No refrigerant leaks at connections' },
    );

  if (/engine light|check engine|ecu|obd|code|dtc|scanner/.test(text))
    items.push(
      { id: 'no_light', label: 'No warning lights on dashboard after engine warm-up' },
      { id: 'scan_clear', label: 'OBD scan shows no stored or pending fault codes' },
    );

  if (/engine|misfire|idle|knock|timing|spark|ignition/.test(text))
    items.push(
      { id: 'idle', label: 'Engine idles smoothly — no rough idle or misfires' },
      { id: 'start', label: 'Engine starts cleanly on first crank' },
      { id: 'rev', label: 'Engine revs freely — no hesitation or stumble' },
    );

  if (/suspension|shock|strut|spring|bushing|noise|rattle|clunk/.test(text))
    items.push(
      { id: 'susp_noise', label: 'No clunking or rattling over bumps' },
      { id: 'susp_straight', label: 'Vehicle tracks straight — no wandering' },
    );

  if (/steering|power steering|alignment|wheel|tie rod/.test(text))
    items.push(
      { id: 'steer_straight', label: 'Steering wheel centered — no pull on straight road' },
      { id: 'steer_smooth', label: 'Steering smooth — no stiffness or noise on full lock' },
    );

  if (/tyre|tire|wheel|rotation|balance/.test(text))
    items.push(
      { id: 'tyre_pres', label: 'All tyre pressures set to spec' },
      { id: 'torque', label: 'Wheel lug nuts torqued to spec' },
    );

  if (/battery|alternator|electrical|wiring|fuse|starter|charge/.test(text))
    items.push(
      { id: 'battery', label: 'Battery voltage above 12.4V (engine off)' },
      { id: 'charge', label: 'Alternator charging — voltage 13.5–14.5V at idle' },
    );

  if (/exhaust|muffler|cat|catalytic|emission|smoke/.test(text))
    items.push(
      { id: 'exhaust_leak', label: 'No exhaust leaks — no ticking or soot marks at joints' },
      { id: 'smoke', label: 'No blue, white, or black smoke from exhaust' },
    );

  if (/sensor|abs|traction|stability|esc|esp/.test(text))
    items.push(
      { id: 'abs_light', label: 'ABS / traction / stability warning lights off' },
    );

  // Road test (always present for any mechanical work)
  items.push({ id: 'road_test', label: 'Road test completed — concern resolved and no new issues found' });

  // Dedup by id
  const seen = new Set<string>();
  return items
    .filter(i => { if (seen.has(i.id)) return false; seen.add(i.id); return true; })
    .map(i => ({ ...i, passed: null }));
}

// ── Misc items that SA must confirm are not left in the vehicle ──
const MISC_ITEMS: { id: string; label: string }[] = [
  { id: 'misc_tools',   label: 'No shop tools or equipment left in vehicle (ratchets, sockets, pliers, etc.)' },
  { id: 'misc_bolts',   label: 'No loose bolts, nuts, or hardware left inside vehicle or engine bay' },
  { id: 'misc_caps',    label: 'All caps and covers reinstalled (oil cap, air filter cover, fuse box lid, etc.)' },
  { id: 'misc_install', label: 'All parts that were removed and are to be reinstalled have been reinstalled' },
  { id: 'misc_drain',   label: 'All drain plugs and fill plugs properly torqued and sealed' },
  { id: 'misc_rags',    label: 'No shop rags, funnels, or catch pans left in or under the vehicle' },
  { id: 'misc_mats',    label: "Customer's floor mats, seat covers, and personal items returned to original position" },
];

// ── QA Sign-Off Panel ────────────────────────────────────────────
function QAPanel({ ro, onApprove, onSendBack }: {
  ro: RepairOrder;
  onApprove: (checklist: QAItem[], miscItems: QAItem[], advisorName: string, notes: string) => void;
  onSendBack: (advisorName: string, notes: string) => void;
}) {
  const [items, setItems] = useState<QAItem[]>(() => generateChecklist(ro.concern, ro.cause, ro.correction));
  const [misc,  setMisc]  = useState<QAItem[]>(() => MISC_ITEMS.map(i => ({ ...i, passed: null })));
  const [advisorName, setAdvisorName] = useState('');
  const [qaNotes, setQaNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const allChecked = items.every(i => i.passed !== null) && misc.every(i => i.passed !== null);
  const allPassed  = items.every(i => i.passed === true) && misc.every(i => i.passed === true);
  const failCount  = [...items, ...misc].filter(i => i.passed === false).length;

  function toggle(id: string, passed: boolean, isMisc = false) {
    const setter = isMisc ? setMisc : setItems;
    setter(prev => prev.map(i => i.id === id ? { ...i, passed: i.passed === passed ? null : passed } : i));
  }

  async function handleApprove() {
    if (!advisorName.trim()) { alert('Please enter your name to sign off.'); return; }
    if (!allChecked) { alert('Please mark every checklist item Pass or Fail before signing off.'); return; }
    if (failCount > 0 && !confirm(`${failCount} item${failCount > 1 ? 's' : ''} marked FAIL. Approve anyway and mark RO Complete?`)) return;
    setSubmitting(true);
    await onApprove(items, misc, advisorName.trim(), qaNotes);
    setSubmitting(false);
  }

  async function handleSendBack() {
    if (!advisorName.trim()) { alert('Please enter your name before returning to technician.'); return; }
    if (!confirm(`Return ${ro.roNumber} to technician for rework?`)) return;
    setSubmitting(true);
    await onSendBack(advisorName.trim(), qaNotes);
    setSubmitting(false);
  }

  const inp: React.CSSProperties = { width: '100%', padding: '8px 10px', borderRadius: 7, border: '1px solid var(--line)', background: 'var(--surface-soft)', color: 'var(--text)', fontSize: 13, boxSizing: 'border-box' };

  function CheckRow({ item, isMisc = false }: { item: QAItem; isMisc?: boolean }) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', borderRadius: 8, background: item.passed === true ? 'rgba(76,175,80,0.07)' : item.passed === false ? 'rgba(244,67,54,0.07)' : 'var(--surface-soft)', border: `1px solid ${item.passed === true ? 'rgba(76,175,80,0.25)' : item.passed === false ? 'rgba(244,67,54,0.25)' : 'var(--line)'}`, transition: 'all .15s' }}>
        <div style={{ display: 'flex', gap: 5, flexShrink: 0 }}>
          <button type="button" onClick={() => toggle(item.id, true, isMisc)} style={{ padding: '3px 10px', borderRadius: 6, border: 'none', fontWeight: 700, fontSize: 11, cursor: 'pointer', background: item.passed === true ? '#4caf50' : '#e0e0e0', color: item.passed === true ? '#fff' : '#555', transition: 'all .1s' }}>✓ PASS</button>
          <button type="button" onClick={() => toggle(item.id, false, isMisc)} style={{ padding: '3px 10px', borderRadius: 6, border: 'none', fontWeight: 700, fontSize: 11, cursor: 'pointer', background: item.passed === false ? '#f44336' : '#e0e0e0', color: item.passed === false ? '#fff' : '#555', transition: 'all .1s' }}>✗ FAIL</button>
        </div>
        <span style={{ fontSize: 13, flex: 1, color: item.passed === false ? '#f44336' : 'var(--text)', fontWeight: item.passed === false ? 600 : 400 }}>{item.label}</span>
      </div>
    );
  }

  return (
    <div style={{ border: '2px solid #f59e0b', borderRadius: 14, background: 'rgba(245,158,11,0.04)', overflow: 'hidden', marginTop: 16 }}>
      <div style={{ background: '#f59e0b', color: '#fff', padding: '10px 20px', display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{ fontSize: 18 }}>🔍</span>
        <div>
          <div style={{ fontWeight: 800, fontSize: 14 }}>SA QA Inspection — Awaiting Sign-Off</div>
          <div style={{ fontSize: 12, opacity: 0.9 }}>Technician submitted work. Complete all checks before marking the RO Complete.</div>
        </div>
      </div>

      <div style={{ padding: '16px 20px' }}>
        {/* 3C summary */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 16 }}>
          {[
            { color: '#f44336', label: '🔴 Concern', text: ro.concern },
            { color: '#ff9800', label: '🟡 Cause', text: ro.cause },
            { color: '#4caf50', label: '🟢 Correction', text: ro.correction },
          ].map(({ label, text, color }) => (
            <div key={label} style={{ fontSize: 13, padding: '7px 12px', borderRadius: 7, background: 'var(--surface-soft)', border: '1px solid var(--line)' }}>
              <span style={{ fontWeight: 700, color }}>{label}: </span>
              {text || <em style={{ color: 'var(--muted)' }}>Not recorded</em>}
            </div>
          ))}
        </div>

        {/* Repair-specific checklist */}
        <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 8 }}>
          Step 1 — Repair Verification ({items.length} items)
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 18 }}>
          {items.map(item => <CheckRow key={item.id} item={item} />)}
        </div>

        {/* Misc items */}
        <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 8 }}>
          Step 2 — Vehicle Walk-Around & Misc Items ({misc.length} items)
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 18 }}>
          {misc.map(item => <CheckRow key={item.id} item={item} isMisc />)}
        </div>

        {/* Notes + Signature */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 14 }}>
          <div>
            <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: 4 }}>QA Notes (optional)</label>
            <textarea value={qaNotes} onChange={e => setQaNotes(e.target.value)} placeholder="Observations, follow-up items, or customer instructions…" style={{ ...inp, minHeight: 70, resize: 'vertical' }} />
          </div>
          <div>
            <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: 4 }}>Service Advisor Signature *</label>
            <input value={advisorName} onChange={e => setAdvisorName(e.target.value)} placeholder="Type your full name to sign off…" style={inp} />
            <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4 }}>By signing, you confirm the vehicle passed inspection and is ready for the customer.</div>
          </div>
        </div>

        {!allChecked && (
          <div style={{ background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.4)', borderRadius: 8, padding: '8px 14px', fontSize: 12, color: '#b45309', marginBottom: 12 }}>
            ⚠ Mark every item Pass or Fail to enable sign-off. ({[...items, ...misc].filter(i => i.passed === null).length} remaining)
          </div>
        )}

        <div style={{ display: 'flex', gap: 10, borderTop: '1px solid var(--line)', paddingTop: 14 }}>
          <button type="button" onClick={handleSendBack} disabled={submitting} style={{ flex: 1, padding: '10px', borderRadius: 8, border: '1px solid rgba(244,67,54,0.4)', background: 'rgba(244,67,54,0.07)', color: '#f44336', fontWeight: 700, fontSize: 13, cursor: submitting ? 'not-allowed' : 'pointer' }}>
            ↩ Send Back to Technician
          </button>
          <button type="button" onClick={handleApprove} disabled={submitting || !allChecked || !advisorName.trim()} style={{ flex: 2, padding: '10px', borderRadius: 8, border: 'none', background: allChecked && advisorName.trim() ? (allPassed ? '#4caf50' : '#f59e0b') : '#aaa', color: '#fff', fontWeight: 800, fontSize: 13, cursor: (submitting || !allChecked || !advisorName.trim()) ? 'not-allowed' : 'pointer', opacity: submitting ? 0.7 : 1 }}>
            {submitting ? 'Processing…' : allChecked && advisorName.trim() ? (allPassed ? '✓ Approve — Mark Complete' : '⚠ Approve with Fails — Mark Complete') : 'Complete all checks + sign to approve'}
          </button>
        </div>
      </div>
    </div>
  );
}

const STATUS_COLORS: Record<string, string> = {
  'Open': '#2196f3',
  'In Progress': '#ff9800',
  'Pending Parts': '#9c27b0',
  'Pending Approval': '#f59e0b',
  'Complete': '#4caf50',
  'Closed': '#888',
  'Void': '#f44336',
};

const EMPTY_FORM = {
  roNumber: '',
  jobCardId: '',
  invoiceNumber: '',
  customerName: '',
  customerId: '',
  vehicle: '',
  status: 'Open',
  concern: '',
  cause: '',
  correction: '',
  technician: '',
  laborHours: 0,
  partsTotal: 0,
  laborRate: 145,
  notes: '',
  currency: 'USD',
  openedDate: new Date().toISOString(),
  closedDate: null as string | null,
  suggestedHours: null as number | null,
  flatRateCost: null as number | null,
  laborSource: null as string | null,
  laborLookupAt: null as string | null,
};

export function RepairOrdersView() {
  const { prefill } = useAppState();
  const dispatch = useAppDispatch();
  const { role } = useShop();
  const isTech = role === 'technician';
  const [orders, setOrders] = useState<RepairOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [toast, setToast] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [saving, setSaving] = useState(false);
  const [selected, setSelected] = useState<RepairOrder | null>(null);
  const [customers, setCustomers] = useState<{ id: string; name: string }[]>([]);
  const [allVehicles, setAllVehicles] = useState<{ id: string; customerId: string; label: string }[]>([]);
  const [technicians, setTechnicians] = useState<Technician[]>([]);
  const [filterStatus, setFilterStatus] = useState('All');
  const [search, setSearch] = useState('');
  const [shopSettings, setShopSettings] = useState<ShopSettings | null>(null);
  const [showPreview, setShowPreview] = useState(false);
  const [qaTarget, setQaTarget] = useState<RepairOrder | null>(null); // RO awaiting QA modal

  useEffect(() => {
    load();
    fetchCustomerNames().then(setCustomers).catch(() => {});
    fetchVehicles().then(vs => setAllVehicles(vs.map(v => ({ id: v.id, customerId: v.customerId, label: v.label })))).catch(() => {});
    fetchTechnicians().then(setTechnicians).catch(() => {});
    fetchShopSettings().then(setShopSettings).catch(() => {});
  }, []);

  // Deep-link: open a specific RO when notification "Open RO →" is clicked
  useEffect(() => {
    function handleOpenRO(e: Event) {
      const { roId, roNumber } = (e as CustomEvent).detail ?? {};
      if (!roId && !roNumber) return;
      setOrders(current => {
        const found = current.find(o => o.id === roId || o.roNumber === roNumber);
        if (found) { setSelected(found); setShowForm(false); }
        return current;
      });
    }
    window.addEventListener('open-ro', handleOpenRO);
    return () => window.removeEventListener('open-ro', handleOpenRO);
  }, []);

  // Open new form pre-filled when navigated from Job Card → Repair Order
  useEffect(() => {
    if (!prefill?.customerName) return;
    nextRONumber().then(num => {
      setForm(f => ({ ...f, roNumber: num, customerName: prefill.customerName ?? '', customerId: prefill.customerId ?? '', vehicle: prefill.vehicle ?? '' }));
      setEditingId(null);
      setShowForm(true);
      setSelected(null);
      dispatch({ type: 'CLEAR_PREFILL' });
    }).catch(() => {});
  }, [prefill]);

  async function load() {
    setLoading(true);
    try {
      const data = await fetchRepairOrders();
      setOrders(data);
      if (data.length > 0) setSelected(data[0]);
    } catch (e: unknown) {
      setError('Load error: ' + (e instanceof Error ? e.message : ''));
    } finally { setLoading(false); }
  }

  function notify(msg: string) { setToast(msg); setTimeout(() => setToast(''), 3500); }

  async function openNew() {
    const num = await nextRONumber();
    setForm({ ...EMPTY_FORM, roNumber: num, laborRate: shopSettings?.laborRate ?? 145, openedDate: new Date().toISOString() });
    setEditingId(null);
    setShowForm(true);
    setSelected(null);
  }

  function openEdit(ro: RepairOrder) {
    setForm({
      roNumber: ro.roNumber,
      jobCardId: ro.jobCardId,
      invoiceNumber: ro.invoiceNumber,
      customerName: ro.customerName,
      customerId: ro.customerId,
      vehicle: ro.vehicle,
      status: ro.status,
      concern: ro.concern,
      cause: ro.cause,
      correction: ro.correction,
      technician: ro.technician,
      laborHours: ro.laborHours,
      partsTotal: ro.partsTotal,
      laborRate: ro.laborRate,
      notes: ro.notes,
      currency: ro.currency,
      openedDate: ro.openedDate,
      closedDate: ro.closedDate,
      suggestedHours: ro.suggestedHours ?? null,
      flatRateCost: ro.flatRateCost ?? null,
      laborSource: ro.laborSource ?? null,
      laborLookupAt: ro.laborLookupAt ?? null,
    });
    setEditingId(ro.id);
    setShowForm(true);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!form.customerName) return setError('Customer name is required.');
    if (form.status === 'Complete' || form.status === 'Closed') return setError('Cannot set status to Complete or Closed directly — complete the QA sign-off process.');
    setSaving(true); setError('');
    try {
      if (editingId) {
        await updateRepairOrder(editingId, { ...form });
        const updated: RepairOrder = { ...selected!, ...form, id: editingId, createdAt: selected?.createdAt ?? '' };
        setOrders(prev => prev.map(r => r.id === editingId ? updated : r));
        setSelected(updated);
        notify(`${form.roNumber} updated.`);
      } else {
        const saved = await createRepairOrder(form);
        setOrders(prev => [saved, ...prev]);
        setSelected(saved);
        notify(`${saved.roNumber} created.`);
      }
      setShowForm(false); setEditingId(null);
    } catch (e: unknown) {
      setError('Save failed: ' + (e instanceof Error ? e.message : ''));
    } finally { setSaving(false); }
  }

  async function handleStatusChange(ro: RepairOrder, status: string) {
    // Complete and Closed only reachable through QA modal
    if (status === 'Closed' || status === 'Complete') return;
    try {
      await updateRepairOrder(ro.id, { status });
      const updated = { ...ro, status };
      setOrders(prev => prev.map(r => r.id === ro.id ? updated : r));
      setSelected(updated);
      notify(`Status updated to ${status}.`);
    } catch (e: unknown) { setError((e instanceof Error ? e.message : '')); }
  }

  function handleClose(ro: RepairOrder) {
    // Always route through QA — never use browser confirm()
    setQaTarget(ro);
  }

  async function handleQAApprove(ro: RepairOrder, checklist: QAItem[], miscItems: QAItem[], advisorName: string, qaNotes: string) {
    const now = new Date().toLocaleString();
    const allItems = [...checklist, ...miscItems];
    const passed = allItems.filter(i => i.passed === true).length;
    const failed = allItems.filter(i => i.passed === false).length;
    const repairText = checklist.map(i => `  [${i.passed ? '✓' : '✗'}] ${i.label}`).join('\n');
    const miscText   = miscItems.map(i => `  [${i.passed ? '✓' : '✗'}] ${i.label}`).join('\n');
    const signOff = `\n\n--- QA SIGN-OFF ---\nApproved by: ${advisorName}\nDate: ${now}\nResult: ${passed} passed / ${failed} failed\nRepair Verification:\n${repairText}\nVehicle Walk-Around:\n${miscText}${qaNotes ? `\nNotes: ${qaNotes}` : ''}`;
    try {
      await updateRepairOrder(ro.id, { status: 'Complete', notes: (ro.notes || '') + signOff });
      if (ro.correction || ro.concern) {
        seedLaborGuide({ vehicle: ro.vehicle, jobDescription: ro.correction || ro.concern, laborHours: ro.laborHours, laborRate: ro.laborRate });
      }
      const updated = { ...ro, status: 'Complete', notes: (ro.notes || '') + signOff };
      setOrders(prev => prev.map(r => r.id === ro.id ? updated : r));
      setSelected(updated);
      notify(`✓ QA signed off by ${advisorName}. ${ro.roNumber} marked Complete — ready for invoicing.`);
    } catch (e: unknown) { setError((e instanceof Error ? e.message : '')); }
  }

  async function handleQASendBack(ro: RepairOrder, advisorName: string, qaNotes: string) {
    const now = new Date().toLocaleString();
    const signOff = `\n\n--- QA RETURNED TO TECH ---\nReviewed by: ${advisorName}\nDate: ${now}${qaNotes ? `\nReason: ${qaNotes}` : ''}`;
    try {
      await updateRepairOrder(ro.id, { status: 'In Progress', notes: (ro.notes || '') + signOff });
      const updated = { ...ro, status: 'In Progress', notes: (ro.notes || '') + signOff };
      setOrders(prev => prev.map(r => r.id === ro.id ? updated : r));
      setSelected(updated);
      notify(`↩ ${ro.roNumber} returned to technician.`);
    } catch (e: unknown) { setError((e instanceof Error ? e.message : '')); }
  }

  async function handleConvertToInvoice(ro: RepairOrder) {
    if (!confirm(`Convert ${ro.roNumber} to an invoice?`)) return;
    try {
      const invNumber = await nextInvoiceNumber();
      const total = calcROTotal(ro);
      await createInvoice({
        invoiceNumber: invNumber,
        customerName: ro.customerName,
        customerId: ro.customerId,
        vehicle: ro.vehicle,
        jobCardId: ro.jobCardId,
        status: 'Draft',
        lines: [
          { note: ro.roNumber, description: `Labor — ${ro.correction || ro.concern}`, qty: ro.laborHours, rate: ro.laborRate },
          ...(ro.partsTotal > 0 ? [{ note: '', description: 'Parts', qty: 1, rate: ro.partsTotal }] : []),
        ],
        discount: 0,
        shopSupplies: 0,
        taxRate: (shopSettings?.defaultTaxRate ?? 0.08),
        notes: `Converted from ${ro.roNumber}. ${ro.notes}`.trim(),
        dueDate: '',
        paidDate: null,
        currency: ro.currency,
      });
      await updateRepairOrder(ro.id, { status: 'Complete', invoiceNumber: invNumber });
      const updated = { ...ro, status: 'Complete', invoiceNumber: invNumber };
      setOrders(prev => prev.map(r => r.id === ro.id ? updated : r));
      setSelected(updated);
      notify(`${ro.roNumber} → ${invNumber} created. Opening Invoices…`);
      setTimeout(() => dispatch({ type: 'SET_MODULE', module: 'invoices' }), 800);
    } catch (e: unknown) { setError('Convert failed: ' + (e instanceof Error ? e.message : '')); }
  }

  async function handleApplyFlatRate(ro: RepairOrder, hours: number) {
    try {
      await updateRepairOrder(ro.id, {
        laborHours: hours,
        suggestedHours: hours,
        laborLookupAt: new Date().toISOString(),
        laborSource: 'internal',
      });
      const updated = { ...ro, laborHours: hours, suggestedHours: hours };
      setOrders(prev => prev.map(r => r.id === ro.id ? updated : r));
      setSelected(updated);
      notify(`Labor hours updated to ${hours} (industry standard).`);
    } catch (e: unknown) { setError('Apply failed: ' + (e instanceof Error ? e.message : '')); }
  }

  async function handleDelete(ro: RepairOrder) {
    if (!confirm(`Delete ${ro.roNumber}?`)) return;
    try {
      await deleteRepairOrder(ro.id);
      setOrders(prev => prev.filter(r => r.id !== ro.id));
      setSelected(orders.find(r => r.id !== ro.id) ?? null);
      notify(`${ro.roNumber} deleted.`);
    } catch (e: unknown) { setError((e instanceof Error ? e.message : '')); }
  }

  const filtered = orders.filter(ro => {
    const matchStatus = filterStatus === 'All' || ro.status === filterStatus;
    const matchSearch = !search || [ro.roNumber, ro.customerName, ro.vehicle, ro.technician]
      .some(v => v.toLowerCase().includes(search.toLowerCase()));
    return matchStatus && matchSearch;
  });

  const openCount = orders.filter(r => r.status === 'Open' || r.status === 'In Progress').length;
  const pendingCount = orders.filter(r => r.status === 'Pending Parts' || r.status === 'Pending Approval').length;
  const completeCount = orders.filter(r => r.status === 'Complete' || r.status === 'Closed').length;
  const totalLabor = orders.filter(r => r.status !== 'Void').reduce((s, r) => s + r.laborHours * r.laborRate, 0);

  return (
    <>
      {toast && <div className="toast toast-visible">{toast}</div>}

      {/* Stats */}
      <div className="grid cols-4" style={{ marginBottom: 16 }}>
        <div className="card" style={{ padding: 16 }}>
          <div style={{ fontSize: 11, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Open / In Progress</div>
          <div style={{ fontSize: 28, fontWeight: 700, color: '#2196f3' }}>{openCount}</div>
        </div>
        <div className="card" style={{ padding: 16 }}>
          <div style={{ fontSize: 11, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Pending</div>
          <div style={{ fontSize: 28, fontWeight: 700, color: '#f59e0b' }}>{pendingCount}</div>
        </div>
        <div className="card" style={{ padding: 16 }}>
          <div style={{ fontSize: 11, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Complete / Closed</div>
          <div style={{ fontSize: 28, fontWeight: 700, color: '#4caf50' }}>{completeCount}</div>
        </div>
        {!isTech && (
          <div className="card" style={{ padding: 16 }}>
            <div style={{ fontSize: 11, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Total Labor Value</div>
            <div style={{ fontSize: 20, fontWeight: 700 }}>${totalLabor.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
          </div>
        )}
      </div>

      {error && (
        <p style={{ color: 'var(--danger)', padding: '10px 14px', background: '#fff0f0', borderRadius: 6, marginBottom: 12 }}>
          {error} <button onClick={() => setError('')} style={{ marginLeft: 8, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--danger)' }}>✕</button>
        </p>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.5fr', gap: 16, alignItems: 'start' }}>

        {/* ── Left: RO List ── */}
        <Panel title="Repair Orders" hint="Click an RO to view the full 3C worksheet">
          {/* Most Recent */}
          {orders.length > 0 && (
            <div onClick={() => { setSelected(orders[0]); setShowForm(false); }}
              style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 14px', borderRadius: 10, background: 'rgba(204,0,0,0.07)', border: '1px solid rgba(204,0,0,0.25)', marginBottom: 12, cursor: 'pointer' }}>
              <div>
                <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--accent)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>⚡ Most Recent</span>
                <div style={{ fontSize: 14, fontWeight: 600, marginTop: 2 }}>{orders[0].roNumber} — {orders[0].customerName}</div>
                <div style={{ fontSize: 12, color: 'var(--muted)' }}>{orders[0].vehicle} · {orders[0].technician || 'Unassigned'}</div>
              </div>
              <div style={{ textAlign: 'right' }}>
                {!isTech && <div style={{ fontWeight: 700 }}>{formatMoney(calcROTotal(orders[0]), orders[0].currency)}</div>}
                <span style={{ fontSize: 11, fontWeight: 700, color: STATUS_COLORS[orders[0].status] || '#888' }}>{orders[0].status}</span>
              </div>
            </div>
          )}

          <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search RO, customer, vehicle…" className="search" style={{ flex: 1, minWidth: 120 }} />
            <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
              style={{ padding: '8px 10px', borderRadius: 8, border: '1px solid var(--line)', background: 'var(--surface-soft)', color: 'var(--text)', fontSize: 13 }}>
              <option value="All">All Status</option>
              {RO_STATUSES.map(s => <option key={s}>{s}</option>)}
            </select>
            <button className="btn btn-primary" onClick={openNew}>+ New RO</button>
          </div>

          {/* New / Edit Form */}
          {showForm && (
            <form onSubmit={handleSave} style={{ background: 'var(--surface-soft)', border: '1px solid var(--line)', borderRadius: 10, padding: 18, marginBottom: 14 }}>
              <h3 style={{ margin: '0 0 14px', fontSize: 15 }}>{editingId ? `✏️ Edit ${form.roNumber}` : 'New Repair Order'}</h3>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
                <div className="login-field">
                  <label>RO Number</label>
                  <input value={form.roNumber} onChange={e => setForm(f => ({ ...f, roNumber: e.target.value }))} required readOnly={!!editingId} style={editingId ? { opacity: 0.6 } : {}} />
                </div>
                <div className="login-field">
                  <label>Status</label>
                  <select value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value }))}
                    style={{ border: '1px solid var(--line)', borderRadius: 8, padding: '10px 12px', background: 'var(--surface)', color: 'var(--text)' }}>
                    {isTech
                      ? ['Open', 'In Progress', 'Pending Parts'].map(s => <option key={s}>{s}</option>)
                      : RO_STATUSES.filter(s => s !== 'Complete' && s !== 'Closed').map(s => <option key={s}>{s}</option>)
                    }
                    {/* Show read-only display for locked statuses */}
                    {(form.status === 'Complete' || form.status === 'Closed') && <option value={form.status}>{form.status}</option>}
                  </select>
                </div>
                <div className="login-field" style={{ gridColumn: '1 / -1' }}>
                  <label>Customer</label>
                  <select value={form.customerId} onChange={e => {
                    const c = customers.find(c => c.id === e.target.value);
                    const cvs = allVehicles.filter(v => v.customerId === e.target.value);
                    const autoVehicle = cvs.length === 1 ? cvs[0].label : '';
                    setForm(f => ({ ...f, customerId: e.target.value, customerName: c?.name ?? f.customerName, vehicle: autoVehicle }));
                  }} style={{ border: '1px solid var(--line)', borderRadius: 8, padding: '10px 12px', background: 'var(--surface)', color: 'var(--text)', width: '100%' }}>
                    <option value="">— select customer —</option>
                    {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
                <div className="login-field">
                  <label>Customer Name</label>
                  <input value={form.customerName} onChange={e => setForm(f => ({ ...f, customerName: e.target.value }))} required />
                </div>
                <div className="login-field">
                  <label>Vehicle</label>
                  {(() => {
                    const cvs = allVehicles.filter(v => v.customerId === form.customerId);
                    return cvs.length > 0 ? (
                      <select value={form.vehicle} onChange={e => setForm(f => ({ ...f, vehicle: e.target.value }))}
                        style={{ border: '1px solid var(--line)', borderRadius: 8, padding: '10px 12px', background: 'var(--surface)', color: 'var(--text)', width: '100%' }}>
                        <option value="">— select vehicle —</option>
                        {cvs.map(v => <option key={v.id} value={v.label}>{v.label}</option>)}
                      </select>
                    ) : (
                      <input value={form.vehicle} onChange={e => setForm(f => ({ ...f, vehicle: e.target.value }))} placeholder="2022 Ford F-150" />
                    );
                  })()}
                </div>
                <div className="login-field">
                  <label>Technician</label>
                  <select value={form.technician} onChange={e => setForm(f => ({ ...f, technician: e.target.value }))}
                    style={{ border: '1px solid var(--line)', borderRadius: 8, padding: '10px 12px', background: 'var(--surface)', color: 'var(--text)', width: '100%' }}>
                    <option value="">— Unassigned —</option>
                    {technicians.map(t => <option key={t.id} value={t.name}>{t.name} ({t.role})</option>)}
                  </select>
                </div>
                <div className="login-field">
                  <label>Job Card ID</label>
                  <input value={form.jobCardId} onChange={e => setForm(f => ({ ...f, jobCardId: e.target.value }))} placeholder="JC-001" />
                </div>
              </div>

              {/* 3C Fields */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 10 }}>
                <div className="login-field">
                  <label>🔴 Concern (Customer Complaint)</label>
                  <textarea value={form.concern} onChange={e => setForm(f => ({ ...f, concern: e.target.value }))} rows={2} placeholder="What the customer reports…" style={{ border: '1px solid var(--line)', borderRadius: 8, padding: '10px 12px', background: 'var(--surface)', color: 'var(--text)', fontSize: 13, width: '100%', resize: 'vertical' }} />
                </div>
                <div className="login-field">
                  <label>🟡 Cause (Technician Finding)</label>
                  <textarea value={form.cause} onChange={e => setForm(f => ({ ...f, cause: e.target.value }))} rows={2} placeholder="Root cause found…" style={{ border: '1px solid var(--line)', borderRadius: 8, padding: '10px 12px', background: 'var(--surface)', color: 'var(--text)', fontSize: 13, width: '100%', resize: 'vertical' }} />
                </div>
                <div className="login-field">
                  <label>🟢 Correction (Work Performed)</label>
                  <textarea value={form.correction} onChange={e => setForm(f => ({ ...f, correction: e.target.value }))} rows={2} placeholder="Work performed to correct…" style={{ border: '1px solid var(--line)', borderRadius: 8, padding: '10px 12px', background: 'var(--surface)', color: 'var(--text)', fontSize: 13, width: '100%', resize: 'vertical' }} />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 10, marginBottom: 10 }}>
                <div className="login-field">
                  <label>Labor Hours</label>
                  <input type="number" value={form.laborHours} onChange={e => setForm(f => ({ ...f, laborHours: Number(e.target.value) }))} min="0" step="0.5" />
                </div>
                <div className="login-field">
                  <label>Labor Rate ($/hr)</label>
                  <input type="number" value={form.laborRate} onChange={e => setForm(f => ({ ...f, laborRate: Number(e.target.value) }))} min="0" step="5" />
                </div>
                <div className="login-field">
                  <label>Parts Total ($)</label>
                  <input type="number" value={form.partsTotal} onChange={e => setForm(f => ({ ...f, partsTotal: Number(e.target.value) }))} min="0" step="0.01" />
                </div>
                <div className="login-field">
                  <label>Currency</label>
                  <select value={form.currency} onChange={e => setForm(f => ({ ...f, currency: e.target.value }))}
                    style={{ border: '1px solid var(--line)', borderRadius: 8, padding: '10px 12px', background: 'var(--surface)', color: 'var(--text)' }}>
                    {CURRENCIES.map(c => <option key={c.code} value={c.code}>{c.code} — {c.symbol}</option>)}
                  </select>
                </div>
              </div>

              <div className="login-field" style={{ marginBottom: 12 }}>
                <label>Internal Notes</label>
                <textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} rows={2} placeholder="Internal notes, parts ordered, warranty info…" style={{ border: '1px solid var(--line)', borderRadius: 8, padding: '10px 12px', background: 'var(--surface)', color: 'var(--text)', fontSize: 13, width: '100%', resize: 'vertical' }} />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                <button type="button" className="btn" onClick={() => { setShowForm(false); setEditingId(null); }}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Saving…' : editingId ? 'Save Changes' : 'Create RO'}</button>
              </div>
            </form>
          )}

          {loading && <p style={{ color: 'var(--muted)' }}>Loading repair orders…</p>}
          {!loading && filtered.length === 0 && (
            <p style={{ color: 'var(--muted)', textAlign: 'center', padding: 20 }}>
              {orders.length === 0 ? 'No repair orders yet. Create your first one.' : 'No ROs match your filter.'}
            </p>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {filtered.map(ro => {
              const isSelected = selected?.id === ro.id;
              const isLatest = ro.id === orders[0]?.id;
              return (
                <div key={ro.id} onClick={() => { setSelected(ro); setShowForm(false); }}
                  style={{ padding: '12px 14px', borderRadius: 10, cursor: 'pointer', border: `1px solid ${isSelected ? 'var(--accent)' : 'var(--line)'}`, background: isSelected ? 'rgba(204,0,0,0.06)' : 'var(--surface-soft)', transition: 'all 0.15s' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div>
                      <strong style={{ fontSize: 14 }}>{ro.roNumber}</strong>
                      <span style={{ marginLeft: 8, fontSize: 11, fontWeight: 700, color: STATUS_COLORS[ro.status] || '#888', textTransform: 'uppercase' }}>{ro.status}</span>
                      {isLatest && <span style={{ marginLeft: 6, fontSize: 10, fontWeight: 700, color: 'var(--accent)', background: 'rgba(204,0,0,0.1)', padding: '1px 6px', borderRadius: 10 }}>LATEST</span>}
                      <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 2 }}>{ro.customerName}</div>
                      <div style={{ fontSize: 12, color: 'var(--muted)' }}>{ro.vehicle} {ro.technician ? `· ${ro.technician}` : ''}</div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      {!isTech && <div style={{ fontWeight: 700, fontSize: 14 }}>{formatMoney(calcROTotal(ro), ro.currency)}</div>}
                      <div style={{ fontSize: 11, color: 'var(--muted)' }}>{fmt(ro.openedDate)}</div>
                    </div>
                  </div>
                  {ro.concern && <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 6, borderTop: '1px solid var(--line)', paddingTop: 6 }}>🔴 {ro.concern.slice(0, 80)}{ro.concern.length > 80 ? '…' : ''}</div>}
                </div>
              );
            })}
          </div>
        </Panel>

        {/* ── Right: RO Detail ── */}
        {selected && !showForm && (
          <div>
            {/* Action bar — role-based */}
            <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap', alignItems: 'center' }}>

              {/* Status display / dropdown — techs see read-only badge; others get limited dropdown */}
              {isTech ? (
                <span style={{ padding: '8px 14px', borderRadius: 8, border: '1px solid var(--line)', background: 'var(--surface-soft)', fontWeight: 700, fontSize: 13, color: STATUS_COLORS[selected.status] || '#888' }}>
                  {selected.status}
                </span>
              ) : (
                <select value={selected.status} onChange={e => handleStatusChange(selected, e.target.value)}
                  style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid var(--line)', background: 'var(--surface-soft)', color: 'var(--text)', fontWeight: 600 }}>
                  {/* SA/Manager/Owner: can set any status except Complete/Closed (those go through QA) */}
                  {RO_STATUSES.filter(s => s !== 'Complete' && s !== 'Closed').map(s => <option key={s}>{s}</option>)}
                  {(selected.status === 'Complete' || selected.status === 'Closed') && <option value={selected.status}>{selected.status}</option>}
                </select>
              )}

              <button className="btn btn-primary" onClick={() => openEdit(selected)}>✏️ Edit</button>
              <button className="btn" onClick={() => setShowPreview(true)}>👁 Preview</button>

              {/* TECH: Submit work done → Pending Approval */}
              {isTech && ['Open', 'In Progress', 'Pending Parts'].includes(selected.status) && (
                <button className="btn" style={{ background: 'rgba(245,158,11,0.12)', color: '#b45309', border: '1px solid #f59e0b', fontWeight: 700 }}
                  onClick={async () => {
                    try {
                      await updateRepairOrder(selected.id, { status: 'Pending Approval' });
                      const updated = { ...selected, status: 'Pending Approval' };
                      setOrders(prev => prev.map(r => r.id === selected.id ? updated : r));
                      setSelected(updated);
                      notify(`${selected.roNumber} submitted for SA review.`);
                    } catch (e: unknown) { setError((e instanceof Error ? e.message : '')); }
                  }}>
                  ✓ Submit for SA Review
                </button>
              )}

              {/* SA / MANAGER / OWNER: QA Sign-Off when Pending Approval */}
              {!isTech && selected.status === 'Pending Approval' && (
                <button className="btn" style={{ background: 'rgba(245,158,11,0.12)', color: '#b45309', border: '2px solid #f59e0b', fontWeight: 800, fontSize: 13 }}
                  onClick={() => setQaTarget(selected)}>
                  🔍 QA Sign-Off
                </button>
              )}

              {/* SA / MANAGER / OWNER: re-open QA if Complete but no sign-off recorded */}
              {!isTech && selected.status === 'Complete' && !selected.notes?.includes('QA SIGN-OFF') && (
                <button className="btn" style={{ background: 'rgba(245,158,11,0.1)', color: '#b45309', border: '1px solid rgba(245,158,11,0.4)', fontWeight: 700 }}
                  onClick={() => setQaTarget(selected)}>
                  ⚠ Complete QA Sign-Off
                </button>
              )}

              {/* OWNER ONLY: Create Invoice from Complete ROs */}
              {role === 'owner' && selected.status === 'Complete' && !selected.invoiceNumber && (
                <button className="btn" style={{ background: 'rgba(33,150,243,0.1)', color: '#2196f3', border: '1px solid #2196f344', fontWeight: 700 }}
                  onClick={() => handleConvertToInvoice(selected)}>
                  ⚡ Create Invoice
                </button>
              )}

              {/* Return Job — shown to non-tech on closed/complete */}
              {!isTech && (selected.status === 'Closed' || selected.status === 'Complete') && (
                <button className="btn" style={{ background: 'rgba(245,158,11,0.08)', color: '#b45309', border: '1px solid #f59e0b', fontWeight: 700 }}
                  onClick={() => dispatch({ type: 'OPEN_NEW_JOB_CARD', prefill: { customerName: selected.customerName, vehicle: selected.vehicle, notes: `↩ RETURN JOB — Original: ${selected.roNumber}. Original issue: ${selected.concern || selected.correction || ''}`.trim() } })}>
                  ↩ Return Job
                </button>
              )}

              <button className="btn" style={{ color: 'var(--danger)', marginLeft: 'auto' }} onClick={() => handleDelete(selected)}>Delete</button>
            </div>

            {/* RO Detail Card — 3C Worksheet */}
            <div style={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 14, padding: 28 }}>
              {/* Header */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24, paddingBottom: 20, borderBottom: '2px solid var(--accent)' }}>
                <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }}>
                  {shopSettings?.logoUrl && <img src={shopSettings.logoUrl} alt="Logo" style={{ height: 48, maxWidth: 110, objectFit: 'contain', borderRadius: 6 }} />}
                  <div>
                    <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--accent)' }}>{shopSettings?.companyName || 'Redlined1'}</div>
                    {shopSettings?.address && <div style={{ fontSize: 11, color: 'var(--muted)', whiteSpace: 'pre-line' }}>{shopSettings.address}</div>}
                    {shopSettings?.phone && <div style={{ fontSize: 11, color: 'var(--muted)' }}>📞 {shopSettings.phone}</div>}
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: 11, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 700 }}>Repair Order</div>
                  <div style={{ fontSize: 22, fontWeight: 800 }}>{selected.roNumber}</div>
                  <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 20, background: (STATUS_COLORS[selected.status] || '#888') + '22', color: STATUS_COLORS[selected.status] || '#888' }}>{selected.status.toUpperCase()}</span>
                  <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 6, lineHeight: 1.7 }}>
                    Opened: {fmt(selected.openedDate)}<br />
                    {selected.closedDate && <span style={{ color: '#4caf50' }}>Closed: {fmt(selected.closedDate)}</span>}
                  </div>
                </div>
              </div>

              {/* Customer + Vehicle */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16, marginBottom: 24 }}>
                <div style={{ background: 'var(--surface-soft)', borderRadius: 10, padding: '12px 16px' }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 }}>Customer</div>
                  <div style={{ fontWeight: 600 }}>{selected.customerName}</div>
                </div>
                <div style={{ background: 'var(--surface-soft)', borderRadius: 10, padding: '12px 16px' }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 }}>Vehicle</div>
                  <div style={{ fontWeight: 600 }}>{selected.vehicle || '—'}</div>
                </div>
                <div style={{ background: 'var(--surface-soft)', borderRadius: 10, padding: '12px 16px' }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 }}>Technician</div>
                  <div style={{ fontWeight: 600 }}>{selected.technician || '—'}</div>
                  {selected.jobCardId && <div style={{ fontSize: 11, color: 'var(--muted)' }}>JC: {selected.jobCardId}</div>}
                </div>
              </div>

              {/* 3C Worksheet */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 24 }}>
                {[
                  { color: '#f44336', label: '🔴 Concern', text: selected.concern, bg: 'rgba(244,67,54,0.05)', border: 'rgba(244,67,54,0.2)' },
                  { color: '#ff9800', label: '🟡 Cause', text: selected.cause, bg: 'rgba(255,152,0,0.05)', border: 'rgba(255,152,0,0.2)' },
                  { color: '#4caf50', label: '🟢 Correction', text: selected.correction, bg: 'rgba(76,175,80,0.05)', border: 'rgba(76,175,80,0.2)' },
                ].map(({ label, text, bg, border }) => (
                  <div key={label} style={{ background: bg, border: `1px solid ${border}`, borderRadius: 10, padding: '14px 16px' }}>
                    <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6, color: 'var(--muted)' }}>{label}</div>
                    <div style={{ fontSize: 14, lineHeight: 1.6 }}>{text || <span style={{ color: 'var(--muted)', fontStyle: 'italic' }}>Not recorded</span>}</div>
                  </div>
                ))}
              </div>

              {/* QA sign-off summary — shown after sign-off is complete */}
              {selected.notes?.includes('QA SIGN-OFF') && (
                <div style={{ border: '1px solid rgba(76,175,80,0.4)', borderRadius: 10, background: 'rgba(76,175,80,0.06)', padding: '12px 16px', marginTop: 16 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: '#4caf50', marginBottom: 4 }}>✓ QA Sign-Off Recorded</div>
                  <div style={{ fontSize: 11, color: 'var(--muted)', whiteSpace: 'pre-wrap' }}>{selected.notes.split('--- QA').slice(1).map(s => '--- QA' + s).join('\n')}</div>
                </div>
              )}

              {/* Labor + Parts — hidden for technicians */}
              {!isTech && (
                <div style={{ background: 'var(--surface-soft)', borderRadius: 10, padding: '16px 20px', marginBottom: 16 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 12 }}>Charges</div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16 }}>
                    <div>
                      <div style={{ fontSize: 12, color: 'var(--muted)' }}>Labor</div>
                      <div style={{ fontWeight: 600 }}>{selected.laborHours} hrs × {formatMoney(selected.laborRate, selected.currency)}</div>
                      <div style={{ fontWeight: 700, fontSize: 15 }}>{formatMoney(selected.laborHours * selected.laborRate, selected.currency)}</div>
                    </div>
                    <div>
                      <div style={{ fontSize: 12, color: 'var(--muted)' }}>Parts</div>
                      <div style={{ fontWeight: 700, fontSize: 15 }}>{formatMoney(selected.partsTotal, selected.currency)}</div>
                    </div>
                    <div style={{ borderLeft: '2px solid var(--accent)', paddingLeft: 16 }}>
                      <div style={{ fontSize: 12, color: 'var(--muted)' }}>Total</div>
                      <div style={{ fontWeight: 800, fontSize: 20, color: 'var(--accent)' }}>{formatMoney(calcROTotal(selected), selected.currency)}</div>
                      {selected.invoiceNumber && <div style={{ fontSize: 11, color: '#4caf50', marginTop: 4 }}>→ {selected.invoiceNumber}</div>}
                    </div>
                  </div>
                </div>
              )}

              {selected.notes && (
                <div style={{ paddingTop: 14, borderTop: '1px solid var(--line)' }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>Internal Notes</div>
                  <p style={{ fontSize: 13, color: 'var(--muted)', margin: 0 }}>{selected.notes}</p>
                </div>
              )}

              {/* Owner-only flat-rate comparison — invisible to all other roles */}
              <OwnerInsights
                serviceType={selected.correction || selected.concern || selected.cause}
                vehicle={selected.vehicle}
                currentHours={selected.laborHours}
                onApply={(hours) => handleApplyFlatRate(selected, hours)}
              />
            </div>
          </div>
        )}

        {!selected && !showForm && !loading && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 300, color: 'var(--muted)', fontSize: 14 }}>
            Select a repair order to view the worksheet
          </div>
        )}
      </div>

      {/* ── Preview Modal ── */}
      {showPreview && selected && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', zIndex: 1000, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '40px 20px', overflowY: 'auto' }}>
          <div style={{ background: '#fff', color: '#111', borderRadius: 14, width: '100%', maxWidth: 720, padding: 48, position: 'relative', boxShadow: '0 24px 80px rgba(0,0,0,0.4)' }}>
            <button onClick={() => setShowPreview(false)} style={{ position: 'absolute', top: 16, right: 16, background: '#f0f0f0', border: 'none', borderRadius: 8, padding: '6px 14px', cursor: 'pointer', fontSize: 15 }}>✕ Close</button>
            <button onClick={() => { setShowPreview(false); window.print(); }} style={{ position: 'absolute', top: 16, right: 100, background: '#cc0000', border: 'none', borderRadius: 8, padding: '6px 14px', cursor: 'pointer', fontSize: 13, color: '#fff', fontWeight: 600 }}>🖨 Print</button>

            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 32, paddingBottom: 24, borderBottom: '3px solid #cc0000' }}>
              <div style={{ display: 'flex', gap: 16 }}>
                {shopSettings?.logoUrl && <img src={shopSettings.logoUrl} alt="Logo" style={{ height: 56, maxWidth: 130, objectFit: 'contain' }} />}
                <div>
                  <div style={{ fontSize: 24, fontWeight: 900, color: '#cc0000' }}>{shopSettings?.companyName || 'Redlined1'}</div>
                  {shopSettings?.address && <div style={{ fontSize: 12, color: '#555', whiteSpace: 'pre-line', marginTop: 4 }}>{shopSettings.address}</div>}
                  {shopSettings?.phone && <div style={{ fontSize: 12, color: '#555' }}>📞 {shopSettings.phone}</div>}
                  {shopSettings?.email && <div style={{ fontSize: 12, color: '#555' }}>✉️ {shopSettings.email}</div>}
                </div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: 11, color: '#888', textTransform: 'uppercase', fontWeight: 700 }}>Repair Order</div>
                <div style={{ fontSize: 28, fontWeight: 900 }}>{selected.roNumber}</div>
                <span style={{ fontSize: 12, fontWeight: 700, padding: '3px 12px', borderRadius: 20, background: (STATUS_COLORS[selected.status] || '#888') + '22', color: STATUS_COLORS[selected.status] || '#888' }}>{selected.status}</span>
                <div style={{ fontSize: 12, color: '#666', marginTop: 8 }}>
                  Opened: {fmt(selected.openedDate)}<br />
                  {selected.closedDate && <>Closed: {fmt(selected.closedDate)}</>}
                </div>
              </div>
            </div>

            {/* Customer / Vehicle / Tech */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16, marginBottom: 28 }}>
              {[['Customer', selected.customerName], ['Vehicle', selected.vehicle], ['Technician', selected.technician || '—']].map(([label, val]) => (
                <div key={label} style={{ background: '#f8f8f8', borderRadius: 10, padding: '12px 16px' }}>
                  <div style={{ fontSize: 10, fontWeight: 800, color: '#888', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 6 }}>{label}</div>
                  <div style={{ fontWeight: 600 }}>{val}</div>
                </div>
              ))}
            </div>

            {/* 3C */}
            {[
              { label: '🔴 Concern (Customer Complaint)', text: selected.concern, bg: '#fff5f5', border: '#fecaca' },
              { label: '🟡 Cause (Technician Finding)', text: selected.cause, bg: '#fffbeb', border: '#fde68a' },
              { label: '🟢 Correction (Work Performed)', text: selected.correction, bg: '#f0fdf4', border: '#bbf7d0' },
            ].map(({ label, text, bg, border }) => (
              <div key={label} style={{ background: bg, border: `1px solid ${border}`, borderRadius: 10, padding: '14px 18px', marginBottom: 12 }}>
                <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#555', marginBottom: 8 }}>{label}</div>
                <div style={{ fontSize: 14, lineHeight: 1.7, color: text ? '#111' : '#999', fontStyle: text ? 'normal' : 'italic' }}>{text || 'Not recorded'}</div>
              </div>
            ))}

            {/* Charges — hidden for technicians */}
            {!isTech && (
              <div style={{ background: '#f8f8f8', borderRadius: 10, padding: '16px 20px', marginTop: 16 }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16 }}>
                  <div>
                    <div style={{ fontSize: 11, color: '#888', textTransform: 'uppercase', fontWeight: 700 }}>Labor</div>
                    <div style={{ fontSize: 13 }}>{selected.laborHours} hrs × {formatMoney(selected.laborRate, selected.currency)}</div>
                    <div style={{ fontWeight: 700, fontSize: 16 }}>{formatMoney(selected.laborHours * selected.laborRate, selected.currency)}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: 11, color: '#888', textTransform: 'uppercase', fontWeight: 700 }}>Parts</div>
                    <div style={{ fontWeight: 700, fontSize: 16 }}>{formatMoney(selected.partsTotal, selected.currency)}</div>
                  </div>
                  <div style={{ borderLeft: '3px solid #cc0000', paddingLeft: 16 }}>
                    <div style={{ fontSize: 11, color: '#888', textTransform: 'uppercase', fontWeight: 700 }}>Total</div>
                    <div style={{ fontWeight: 900, fontSize: 22, color: '#cc0000' }}>{formatMoney(calcROTotal(selected), selected.currency)}</div>
                  </div>
                </div>
              </div>
            )}

            {selected.notes && (
              <div style={{ marginTop: 20, paddingTop: 16, borderTop: '1px solid #eee' }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#888', textTransform: 'uppercase', marginBottom: 6 }}>Notes</div>
                <p style={{ fontSize: 13, color: '#555', margin: 0 }}>{selected.notes}</p>
              </div>
            )}

            <div style={{ marginTop: 32, textAlign: 'center', fontSize: 11, color: '#aaa', borderTop: '1px solid #eee', paddingTop: 14 }}>
              {shopSettings?.companyName || 'Redlined1'}{shopSettings?.phone ? ` · ${shopSettings.phone}` : ''}{shopSettings?.email ? ` · ${shopSettings.email}` : ''}
            </div>
          </div>
        </div>
      )}

      {/* ── Mandatory QA Modal ── */}
      {qaTarget && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.82)', zIndex: 2000, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '32px 20px', overflowY: 'auto' }}>
          <div style={{ background: 'var(--surface)', borderRadius: 16, width: '100%', maxWidth: 760, position: 'relative', boxShadow: '0 32px 100px rgba(0,0,0,0.6)', border: '2px solid #f59e0b' }}>
            {/* Modal Header */}
            <div style={{ background: 'linear-gradient(135deg, #f59e0b, #d97706)', color: '#fff', padding: '20px 28px', borderRadius: '14px 14px 0 0', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <div style={{ fontSize: 18, fontWeight: 800 }}>🔍 QA Inspection — {qaTarget.roNumber}</div>
                <div style={{ fontSize: 13, opacity: 0.9, marginTop: 3 }}>Complete all checks before the vehicle is returned to the customer</div>
              </div>
              <button onClick={() => setQaTarget(null)} style={{ background: 'rgba(255,255,255,0.2)', border: 'none', borderRadius: 8, color: '#fff', fontSize: 18, cursor: 'pointer', padding: '4px 10px', lineHeight: 1 }}>✕</button>
            </div>

            <div style={{ padding: '20px 28px' }}>
              {/* RO Summary */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 18 }}>
                <div style={{ background: 'var(--surface-soft)', borderRadius: 9, padding: '10px 14px' }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 4 }}>Customer · Vehicle</div>
                  <div style={{ fontWeight: 600, fontSize: 14 }}>{qaTarget.customerName}</div>
                  <div style={{ fontSize: 13, color: 'var(--muted)' }}>{qaTarget.vehicle || '—'}</div>
                </div>
                <div style={{ background: 'var(--surface-soft)', borderRadius: 9, padding: '10px 14px' }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 4 }}>Technician · Job Card</div>
                  <div style={{ fontWeight: 600, fontSize: 14 }}>{qaTarget.technician || '—'}</div>
                  {qaTarget.jobCardId && <div style={{ fontSize: 11, color: '#2196f3' }}>🔗 {qaTarget.jobCardId}</div>}
                </div>
              </div>

              {/* 3C Quick View */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 7, marginBottom: 18 }}>
                {[
                  { emoji: '🔴', label: 'Concern', text: qaTarget.concern, bg: 'rgba(244,67,54,0.06)', border: 'rgba(244,67,54,0.2)' },
                  { emoji: '🟡', label: 'Cause', text: qaTarget.cause, bg: 'rgba(255,152,0,0.06)', border: 'rgba(255,152,0,0.2)' },
                  { emoji: '🟢', label: 'Correction', text: qaTarget.correction, bg: 'rgba(76,175,80,0.06)', border: 'rgba(76,175,80,0.2)' },
                ].map(({ emoji, label, text, bg, border }) => (
                  <div key={label} style={{ background: bg, border: `1px solid ${border}`, borderRadius: 8, padding: '9px 14px', fontSize: 13 }}>
                    <span style={{ fontWeight: 700 }}>{emoji} {label}: </span>
                    {text || <em style={{ color: 'var(--muted)' }}>Not recorded</em>}
                  </div>
                ))}
              </div>

              {/* The actual QA checklist + sign-off */}
              <QAPanel
                ro={qaTarget}
                onApprove={async (checklist, miscItems, advisorName, notes) => {
                  await handleQAApprove(qaTarget, checklist, miscItems, advisorName, notes);
                  setQaTarget(null);
                }}
                onSendBack={async (advisorName, notes) => {
                  await handleQASendBack(qaTarget, advisorName, notes);
                  setQaTarget(null);
                }}
              />
            </div>
          </div>
        </div>
      )}
    </>
  );
}
