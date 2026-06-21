'use client';

import { useEffect, useState } from 'react';
import { useAppState, useAppDispatch } from '@/lib/store';
import { useShop } from '@/lib/useShop';
import { Panel } from '@/components/Panel';
import { Badge } from '@/components/Badge';
import { Workflow } from '@/components/Workflow';
import { Icon } from '@/components/Icon';
import { StatCard } from '@/components/StatCard';
import {
  fetchJobCards, fetchClosedJobs, createJobCard,
  updateJobCard, closeJob, deleteJobCard, type JobCardFull,
} from '@/services/jobCardService';
import { fetchCustomerNames, fetchVehicles } from '@/services/vehicleService';
import type { Vehicle } from '@/lib/types';
import { fetchTechnicians, createTechnician, deleteTechnician, type Technician } from '@/services/technicianService';
import { createMaintenanceSchedule } from '@/services/maintenanceService';
import { fetchShopSettings } from '@/services/shopSettingsService';

// OEM-based service intervals: [miles, days]
const SERVICE_INTERVALS: Record<string, [number, number]> = {
  'oil change':            [8000,   180],
  'tire rotation':         [10000,  180],
  'brake inspection':      [20000,  365],
  'air filter':            [20000,  365],
  'cabin filter':          [20000,  365],
  'transmission service':  [50000,  730],
  'coolant flush':         [50000,  730],
  'brake fluid flush':     [40000,  730],
  'spark plugs':           [50000,  730],
  'timing belt':           [100000, 1460],
  'wheel alignment':       [20000,  365],
  'battery test':          [20000,  365],
  'ac service':            [40000,  730],
  'full inspection':       [16000,  365],
  'state inspection':      [0,      365],
  '60k':                   [60000,  0],
  '30k':                   [30000,  0],
  '90k':                   [90000,  0],
  'fleet pm':              [10000,  180],
  'mobile service':        [8000,   180],
};

function getIntervals(serviceType: string): [number, number] {
  const key = serviceType.toLowerCase();
  for (const [pattern, intervals] of Object.entries(SERVICE_INTERVALS)) {
    if (key.includes(pattern)) return intervals;
  }
  return [16000, 365]; // default: 16k km / 1 year
}

function addDays(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().split('T')[0];
}

const fmt = (iso: string | null) => iso ? new Date(iso).toLocaleDateString() : '—';

const STAGES = [
  { id: 'checked_in',    label: 'Checked In',       icon: '📋' },
  { id: 'inspecting',    label: 'Being Inspected',   icon: '🔍' },
  { id: 'waiting_parts', label: 'Waiting for Parts', icon: '📦' },
  { id: 'in_repair',     label: 'In Repair',         icon: '🔧' },
  { id: 'quality_check', label: 'Quality Check',     icon: '✅' },
  { id: 'ready',         label: 'Ready for Pickup',  icon: '🎉' },
];

export function JobCardsView() {
  const { openNewJobCard, prefill } = useAppState();
  const dispatch = useAppDispatch();
  const { shopId } = useShop();

  // Status tracker state
  const [trackerJob, setTrackerJob] = useState<typeof selectedJob>(null);
  const [statusToken, setStatusToken] = useState('');
  const [statusUrl, setStatusUrl] = useState('');
  const [copiedStatus, setCopiedStatus] = useState(false);
  const [repairStage, setRepairStage] = useState('checked_in');
  const [stageHistory, setStageHistory] = useState<{ stage: string; label: string; icon: string; advancedAt: string; notifiedSms: boolean; notifiedEmail: boolean }[]>([]);
  const [advancingStage, setAdvancingStage] = useState(false);
  const [notifySms, setNotifySms] = useState(false);
  const [notifyEmail, setNotifyEmail] = useState(false);
  const [notifyPhone, setNotifyPhone] = useState('');
  const [notifyEmailAddr, setNotifyEmailAddr] = useState('');
  const [notifyResult, setNotifyResult] = useState('');

  async function openTracker(job: JobCardFull) {
    setTrackerJob(job);
    setRepairStage(job.repairStage || 'checked_in');
    setStageHistory(job.stageHistory || []);
    setNotifyPhone(job.customerPhone || '');
    setNotifyEmailAddr(job.customerEmail || '');
    setNotifyResult('');
    setNotifySms(false);
    setNotifyEmail(false);
    if (job.statusToken) {
      setStatusToken(job.statusToken);
      setStatusUrl(`${window.location.origin}/status/${job.statusToken}`);
    } else {
      try {
        const res = await fetch('/api/job-status', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ jobId: job.id, shopId }),
        });
        const json = await res.json();
        if (json.token) {
          setStatusToken(json.token);
          setStatusUrl(`${window.location.origin}/status/${json.token}`);
          setRepairStage(json.stage);
          setStageHistory(json.history ?? []);
          setJobs(prev => prev.map(j => j.id === job.id ? { ...j, statusToken: json.token, repairStage: json.stage, stageHistory: json.history ?? [] } : j));
        }
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : 'Failed to initialize status tracker');
      }
    }
  }

  async function advanceStage(nextStage: string) {
    if (!trackerJob) return;
    setAdvancingStage(true); setNotifyResult('');
    try {
      const res = await fetch('/api/job-status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jobId: trackerJob.id, shopId, stage: nextStage, notifiedSms: notifySms && !!notifyPhone, notifiedEmail: notifyEmail && !!notifyEmailAddr }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      setRepairStage(json.stage);
      setStageHistory(json.history);
      setJobs(prev => prev.map(j => j.id === trackerJob!.id ? { ...j, repairStage: json.stage, stageHistory: json.history } : j));

      if ((notifySms && notifyPhone) || (notifyEmail && notifyEmailAddr)) {
        const nRes = await fetch('/api/job-notify', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ jobId: trackerJob.id, shopId, stage: nextStage, statusUrl, customerPhone: notifySms ? notifyPhone : null, customerEmail: notifyEmail ? notifyEmailAddr : null }),
        });
        const nJson = await nRes.json();
        const parts = [];
        if (nJson.sms) parts.push('SMS sent ✓');
        if (nJson.smsError) parts.push(`SMS: ${nJson.smsError}`);
        if (nJson.email) parts.push('Email sent ✓');
        if (nJson.emailError) parts.push(`Email: ${nJson.emailError}`);
        setNotifyResult(parts.join(' · '));
      }
    } catch (e: unknown) { setError(e instanceof Error ? e.message : 'Failed'); }
    finally { setAdvancingStage(false); }
  }
  const [tab, setTab] = useState<'active' | 'closed' | 'techs'>('active');
  const [showCreateModal, setShowCreateModal] = useState(false);

  useEffect(() => {
    if (openNewJobCard) {
      setShowCreateModal(true);
      // Apply any prefilled data from navigation
      if (prefill?.customerName) {
        setFCustomer(prefill.customerName);
        const cust = customers.find(c => c.name === prefill.customerName);
        if (cust) {
          const veh = allVehicles.filter(v => v.customerId === cust.id);
          setCustomerVehicles(veh);
          if (!prefill?.vehicle && veh.length === 1) {
            setFVehicle(veh[0].label);
            setSelectedVehicleEngine(veh[0].engine ?? '');
          }
        }
      }
      if (prefill?.vehicle) setFVehicle(prefill.vehicle);
      dispatch({ type: 'CLOSE_NEW_JOB_CARD' });
    }
  }, [openNewJobCard]);
  const [jobs, setJobs] = useState<JobCardFull[]>([]);
  const [closedJobs, setClosedJobs] = useState<JobCardFull[]>([]);
  const [customers, setCustomers] = useState<{ id: string; name: string }[]>([]);
  const [allVehicles, setAllVehicles] = useState<(Vehicle & { id: string })[]>([]);
  const [customerVehicles, setCustomerVehicles] = useState<(Vehicle & { id: string })[]>([]);
  const [techs, setTechs] = useState<Technician[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [toast, setToast] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editFields, setEditFields] = useState<Partial<JobCardFull>>({});
  const [selectedJob, setSelectedJob] = useState<JobCardFull | null>(null);

  // Create form
  const [fCustomer, setFCustomer] = useState('');
  const [fVehicle, setFVehicle] = useState('');
  const [fServiceTypes, setFServiceTypes] = useState<string[]>(['Oil Change']);
  const [fSubTypes, setFSubTypes] = useState<Record<string, string>>({});
  const [fWorkType, setFWorkType] = useState('Mobile service');
  const [fPriority, setFPriority] = useState('Normal');
  const [serviceTypeOptions, setServiceTypeOptions] = useState<string[]>([
    'Oil Change','Brakes','Tires','Alignment','Engine','Transmission',
    'Electrical','AC/Heat','Diagnostics','Inspection','Detailing','Custom',
  ]);
  const [fRoute, setFRoute] = useState('Mobile Route 1');
  const [fServiceLoc, setFServiceLoc] = useState('');
  const [fTechs, setFTechs] = useState<string[]>([]);
  const [fApproval, setFApproval] = useState('');
  const [creating, setCreating] = useState(false);

  // Job card field toggles
  const [enableJobCardSubType, setEnableJobCardSubType] = useState(true);
  const [serviceSubTypes, setServiceSubTypes] = useState<Record<string, string[]>>({});
  const [enableJobCardPriority, setEnableJobCardPriority] = useState(true);
  const [enableJobCardBranchRoute, setEnableJobCardBranchRoute] = useState(true);
  const [enableJobCardServiceLocation, setEnableJobCardServiceLocation] = useState(true);
  const [enableJobCardApprovalCode, setEnableJobCardApprovalCode] = useState(true);

  // Add tech form
  const [newTechName, setNewTechName] = useState('');
  const [newTechRole, setNewTechRole] = useState('Technician');
  const [newTechPhone, setNewTechPhone] = useState('');
  const [newTechEmail, setNewTechEmail] = useState('');

  useEffect(() => {
    Promise.all([fetchJobCards(), fetchClosedJobs(), fetchCustomerNames(), fetchTechnicians(), fetchShopSettings(), fetchVehicles()])
      .then(([j, c, custs, t, settings, v]) => {
        setJobs(j); setClosedJobs(c); setCustomers(custs); setTechs(t);
        setAllVehicles(v as (Vehicle & { id: string })[]);
        if (settings.serviceTypes) {
          const opts = settings.serviceTypes.split(',').map((s: string) => s.trim()).filter(Boolean);
          if (opts.length > 0) { setServiceTypeOptions(opts); setFServiceType(opts[0]); }
        }
        setEnableJobCardSubType(settings.enableJobCardSubType ?? true);
        setServiceSubTypes(settings.serviceSubTypes ?? {});
        setEnableJobCardPriority(settings.enableJobCardPriority ?? true);
        setEnableJobCardBranchRoute(settings.enableJobCardBranchRoute ?? true);
        setEnableJobCardServiceLocation(settings.enableJobCardServiceLocation ?? true);
        setEnableJobCardApprovalCode(settings.enableJobCardApprovalCode ?? true);
      })
      .catch(err => setError('Load error: ' + (err?.message || err)))
      .finally(() => setLoading(false));

    function onSettingsUpdate(e: Event) {
      const d = (e as CustomEvent).detail ?? {};
      if (d.enableJobCardSubType !== undefined) setEnableJobCardSubType(d.enableJobCardSubType);
      if (d.serviceSubTypes !== undefined) setServiceSubTypes(d.serviceSubTypes);
      if (d.enableJobCardPriority !== undefined) setEnableJobCardPriority(d.enableJobCardPriority);
      if (d.enableJobCardBranchRoute !== undefined) setEnableJobCardBranchRoute(d.enableJobCardBranchRoute);
      if (d.enableJobCardServiceLocation !== undefined) setEnableJobCardServiceLocation(d.enableJobCardServiceLocation);
      if (d.enableJobCardApprovalCode !== undefined) setEnableJobCardApprovalCode(d.enableJobCardApprovalCode);
    }
    window.addEventListener('shop-settings-updated', onSettingsUpdate);
    return () => window.removeEventListener('shop-settings-updated', onSettingsUpdate);
  }, []);

  const [selectedVehicleEngine, setSelectedVehicleEngine] = useState('');
  const [oilSuggestion, setOilSuggestion] = useState('');

  function inferOilWeight(engine: string): string {
    const e = engine.toLowerCase();
    if (/diesel|tdi|cdi|duramax|powerstroke|cummins|6\.7|6\.6|3\.0.*diesel/.test(e)) return '15W-40';
    if (/hybrid|electric/.test(e)) return '0W-20';
    if (/turbo|tfsi|tsi|sti|wrx|boost/.test(e)) return '5W-40';
    const liters = parseFloat(e.match(/(\d+\.\d+)\s*l/)?.[1] ?? '0');
    if (liters > 0) {
      if (liters <= 1.6) return '0W-20';
      if (liters <= 2.4) return '0W-20';
      if (liters <= 3.0) return '5W-30';
      if (liters <= 4.0) return '5W-30';
      return '10W-30';
    }
    if (/v8|v10|v12/.test(e)) return '5W-30';
    if (/v6/.test(e)) return '5W-30';
    if (/4.?cyl|4-?cyl|inline.?4|i4/.test(e)) return '0W-20';
    return '';
  }

  function notify(msg: string) { setToast(msg); setTimeout(() => setToast(''), 4000); }

  function toggleFTech(name: string) {
    setFTechs(prev => prev.includes(name) ? prev.filter(t => t !== name) : [...prev, name]);
  }

  function applyOilSuggestion(engine: string, serviceTypes: string[], subTypes: Record<string, string[]>) {
    if (!serviceTypes.includes('Oil Change')) { setOilSuggestion(''); return; }
    const suggested = inferOilWeight(engine);
    if (!suggested) { setOilSuggestion(''); return; }
    setOilSuggestion(suggested);
    const match = (subTypes['Oil Change'] ?? []).find(o => o.includes(suggested));
    if (match) setFSubTypes(prev => ({ ...prev, 'Oil Change': match }));
  }

  function handleCustomerChange(name: string) {
    setFCustomer(name);
    const cust = customers.find(c => c.name === name);
    const veh = cust ? allVehicles.filter(v => v.customerId === cust.id) : [];
    setCustomerVehicles(veh);
    if (veh.length === 1) {
      setFVehicle(veh[0].label);
      const engine = veh[0].engine ?? '';
      setSelectedVehicleEngine(engine);
      applyOilSuggestion(engine, fServiceTypes, serviceSubTypes);
    } else {
      setFVehicle('');
      setSelectedVehicleEngine('');
      setOilSuggestion('');
    }
  }

  function handleVehicleSelect(label: string) {
    setFVehicle(label);
    const veh = customerVehicles.find(v => v.label === label);
    const engine = veh?.engine ?? '';
    setSelectedVehicleEngine(engine);
    applyOilSuggestion(engine, fServiceTypes, serviceSubTypes);
  }

  function toggleServiceType(svc: string) {
    setFServiceTypes(prev => {
      const next = prev.includes(svc) ? prev.filter(s => s !== svc) : [...prev, svc];
      if (!next.includes('Oil Change')) { setOilSuggestion(''); setFSubTypes(p => { const n = { ...p }; delete n['Oil Change']; return n; }); }
      else applyOilSuggestion(selectedVehicleEngine, next, serviceSubTypes);
      if (prev.includes(svc)) setFSubTypes(p => { const n = { ...p }; delete n[svc]; return n; });
      return next;
    });
  }

  async function handleCreate() {
    if (!fCustomer) return setError('Select a customer.');
    setError(''); setCreating(true);
    try {
      const channel = fWorkType.includes('Mobile') ? 'Mobile mechanic' : fWorkType.includes('Fleet') ? 'Fleet service' : 'Shop bay';
      const fullServiceType = fServiceTypes.map(s => fSubTypes[s] ? `${s} — ${fSubTypes[s]}` : s).join(' + ');
      const job = await createJobCard({ customer: fCustomer, vehicle: fVehicle, serviceType: fullServiceType || 'General Service', channel, location: fServiceLoc, technicians: fTechs, priority: fPriority, approvalCode: fApproval });
      setJobs(prev => [job, ...prev]);
      setFVehicle(''); setFServiceLoc(''); setFApproval(''); setFTechs([]); setCustomerVehicles([]);
      setFServiceTypes([serviceTypeOptions[0] ?? 'Oil Change']); setFSubTypes({});
      setSelectedVehicleEngine(''); setOilSuggestion('');
      notify(`${job.id} created.`);
    } catch (err: unknown) { setError('Create failed: ' + (err instanceof Error ? err.message : JSON.stringify(err))); }
    finally { setCreating(false); }
  }

  function startEdit(job: JobCardFull) {
    setEditingId(job.id);
    setEditFields({ vehicle: job.vehicle, serviceType: job.serviceType, priority: job.priority, location: job.location, laborHours: job.laborHours, partsTotal: job.partsTotal, technicians: [...job.technicians] });
  }

  async function saveEdit(job: JobCardFull) {
    try {
      await updateJobCard(job.id, editFields);
      setJobs(prev => prev.map(j => j.id === job.id ? { ...j, ...editFields } : j));
      setEditingId(null);
      notify(`${job.id} updated.`);
    } catch (err: unknown) { setError('Save failed: ' + (err instanceof Error ? err.message : '')); }
  }

  function toggleEditTech(name: string) {
    setEditFields(prev => {
      const t = prev.technicians ?? [];
      return { ...prev, technicians: t.includes(name) ? t.filter(x => x !== name) : [...t, name] };
    });
  }

  async function handleApprove(job: JobCardFull) {
    try {
      const workflow = job.workflow.includes('Approved') ? job.workflow : [...job.workflow, 'Approved'];
      await updateJobCard(job.id, { status: 'Approved', approval: 'Approved', workflow, nextAction: 'Convert to repair order' });
      setJobs(prev => prev.map(j => j.id === job.id ? { ...j, status: 'Approved', approval: 'Approved', workflow, nextAction: 'Convert to repair order' } : j));
      notify(`${job.id} approved.`);
    } catch (err: unknown) { setError('Approve failed: ' + (err instanceof Error ? err.message : '')); }
  }

  async function handleClose(job: JobCardFull) {
    if (!confirm(`Close ${job.id} and move to closed archive?`)) return;
    try {
      await closeJob(job);
      setJobs(prev => prev.filter(j => j.id !== job.id));
      setClosedJobs(prev => [{ ...job, status: 'Closed', closedDate: new Date().toISOString() }, ...prev]);

      // Auto-create maintenance schedule based on OEM intervals
      const [intervalMiles, intervalDays] = getIntervals(job.serviceType);
      const today = new Date().toISOString().split('T')[0];
      const nextDueDate = intervalDays > 0 ? addDays(intervalDays) : null;
      try {
        await createMaintenanceSchedule({
          vehicle: job.vehicle,
          vin: '',
          customerName: job.customer,
          customerId: '',
          customerEmail: '',
          customerPhone: '',
          serviceType: job.serviceType,
          intervalMiles,
          intervalDays,
          lastServiceDate: today,
          lastServiceMiles: 0,
          nextDueDate,
          nextDueMiles: intervalMiles,
          notes: `Auto-created from job card ${job.id} on ${today}`,
          status: 'Active',
        });
        const dueLine = nextDueDate ? ` Next due: ${nextDueDate}.` : '';
        notify(`${job.id} closed. Maintenance schedule created for ${job.customer}.${dueLine}`);
      } catch {
        notify(`${job.id} closed and archived. (Maintenance schedule skipped — check Supabase.)`);
      }
    } catch (err: unknown) { setError('Close failed: ' + (err instanceof Error ? err.message : '')); }
  }

  async function handleDelete(id: string) {
    if (!confirm(`Delete ${id}?`)) return;
    try {
      await deleteJobCard(id);
      setJobs(prev => prev.filter(j => j.id !== id));
      notify(`${id} deleted.`);
    } catch (err: unknown) { setError('Delete failed: ' + (err instanceof Error ? err.message : '')); }
  }

  async function handleAddTech(e: React.FormEvent) {
    e.preventDefault();
    try {
      const t = await createTechnician({ name: newTechName, role: newTechRole, phone: newTechPhone, email: newTechEmail, specialty: '', certifications: '', payType: 'Hourly', payRate: 25, hireDate: null, status: 'Active', notes: '' });
      setTechs(prev => [...prev, t]);
      setNewTechName(''); setNewTechPhone(''); setNewTechEmail('');
      notify(`${t.name} added.`);
    } catch (err: unknown) { setError('Add tech failed: ' + (err instanceof Error ? err.message : '')); }
  }

  async function handleDeleteTech(id: string, name: string) {
    if (!confirm(`Remove ${name}?`)) return;
    try {
      await deleteTechnician(id);
      setTechs(prev => prev.filter(t => t.id !== id));
      notify(`${name} removed.`);
    } catch (err: unknown) { setError('Remove failed: ' + (err instanceof Error ? err.message : '')); }
  }

  const tabBtn = (key: typeof tab, label: string, count?: number) => (
    <button onClick={() => setTab(key)} style={{ padding: '8px 18px', borderRadius: 8, border: 'none', cursor: 'pointer', fontWeight: tab === key ? 700 : 400, background: tab === key ? 'var(--accent)' : 'var(--surface-soft)', color: tab === key ? '#fff' : 'var(--text)', fontSize: 13 }}>
      {label}{count !== undefined ? ` (${count})` : ''}
    </button>
  );

  return (
    <>
      {toast && <div className="toast toast-visible">{toast}</div>}
      {error && <p style={{ color: 'var(--danger)', padding: '10px 14px', background: '#fff0f0', borderRadius: 6, marginBottom: 12 }}>{error} <button onClick={() => setError('')} style={{ marginLeft: 8, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--danger)' }}>✕</button></p>}

      <div className="grid cols-4" style={{ marginBottom: 16 }}>
        <StatCard label="Active Jobs" value={String(jobs.length)} subtext="In queue" />
        <StatCard label="Approved" value={String(jobs.filter(j => j.approval === 'Approved').length)} subtext="Ready to work" />
        <StatCard label="Closed This Month" value={String(closedJobs.length)} subtext="Archived" />
        <StatCard label="Technicians" value={String(techs.length)} subtext="Active staff" />
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        {tabBtn('active', 'Active Jobs', jobs.length)}
        {tabBtn('closed', 'Closed Jobs', closedJobs.length)}
        {tabBtn('techs', 'Manage Technicians', techs.length)}
      </div>

      {/* ── ACTIVE JOBS ── */}
      {tab === 'active' && (
        <>
          <Panel title="Job Card Queue" hint="Active jobs — click Edit to modify any field">
            {loading && <p style={{ color: 'var(--muted)' }}>Loading…</p>}
            {!loading && jobs.length === 0 && <p style={{ color: 'var(--muted)' }}>No active jobs. Create one below.</p>}
            {jobs.length > 0 && (
              <table>
                <thead>
                  <tr><th>Job Card</th><th>Customer / Vehicle</th><th>Service</th><th>Techs</th><th>Dates</th><th>Workflow</th><th>Actions</th></tr>
                </thead>
                <tbody>
                  {jobs.map(job => (
                    editingId === job.id ? (
                      <tr key={job.id} style={{ background: 'var(--surface-soft)' }}>
                        <td><strong>{job.id}</strong></td>
                        <td>
                          <input value={editFields.vehicle ?? ''} onChange={e => setEditFields(f => ({ ...f, vehicle: e.target.value }))} style={{ width: '100%', fontSize: 12, padding: '4px 8px', borderRadius: 6, border: '1px solid var(--line)' }} placeholder="Vehicle" />
                        </td>
                        <td>
                          <select value={editFields.priority ?? ''} onChange={e => setEditFields(f => ({ ...f, priority: e.target.value }))} style={{ fontSize: 12, padding: '4px 8px', borderRadius: 6, border: '1px solid var(--line)', marginBottom: 4, width: '100%' }}>
                            <option>Normal</option><option>High</option><option>Roadside</option><option>Fleet SLA</option>
                          </select>
                          <input value={editFields.serviceType ?? ''} onChange={e => setEditFields(f => ({ ...f, serviceType: e.target.value }))} style={{ width: '100%', fontSize: 12, padding: '4px 8px', borderRadius: 6, border: '1px solid var(--line)' }} placeholder="Service type" />
                        </td>
                        <td>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                            {techs.map(t => (
                              <label key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, cursor: 'pointer' }}>
                                <input type="checkbox" checked={(editFields.technicians ?? []).includes(t.name)} onChange={() => toggleEditTech(t.name)} />
                                {t.name}
                              </label>
                            ))}
                          </div>
                        </td>
                        <td>
                          <div style={{ fontSize: 11, color: 'var(--muted)' }}>In: {fmt(job.checkInDate)}</div>
                        </td>
                        <td>
                          <input value={String(editFields.laborHours ?? '')} onChange={e => setEditFields(f => ({ ...f, laborHours: Number(e.target.value) }))} style={{ width: 60, fontSize: 12, padding: '4px 6px', borderRadius: 6, border: '1px solid var(--line)' }} placeholder="hrs" />
                          <span style={{ fontSize: 11, color: 'var(--muted)', marginLeft: 4 }}>hrs</span>
                        </td>
                        <td>
                          <div className="row-actions">
                            <button className="mini-btn primary" onClick={() => saveEdit(job)}>Save</button>
                            <button className="mini-btn" onClick={() => setEditingId(null)}>Cancel</button>
                          </div>
                        </td>
                      </tr>
                    ) : (
                      <tr key={job.id} style={{ cursor: 'pointer' }} onClick={e => { if ((e.target as HTMLElement).closest('button')) return; setSelectedJob(job); }}>
                        <td>
                          <strong>{job.id}</strong>
                          <div className="meta">{job.ro ?? '—'} → {job.invoice ?? 'Invoice pending'}</div>
                        </td>
                        <td>
                          {job.customer}
                          <div className="meta">{job.vehicle}</div>
                          <div className="meta">{job.location}</div>
                        </td>
                        <td>
                          {job.serviceType}
                          <div className="meta"><Badge text={job.priority} /> <Badge text={job.approval} /></div>
                        </td>
                        <td>
                          {job.technicians.length > 0
                            ? job.technicians.map((t, i) => <div key={i} style={{ fontSize: 12 }}>{t}</div>)
                            : <span style={{ color: 'var(--muted)', fontSize: 12 }}>Unassigned</span>}
                        </td>
                        <td>
                          <div style={{ fontSize: 11 }}>In: {fmt(job.checkInDate)}</div>
                        </td>
                        <td><Workflow steps={job.workflow} /></td>
                        <td>
                          <div className="row-actions">
                            <button className="mini-btn" onClick={() => startEdit(job)}>Edit</button>
                            <button className="mini-btn" onClick={() => handleApprove(job)}>Approve</button>
                            <button className="mini-btn" style={{ color: 'var(--accent-2)' }} onClick={() => handleClose(job)}>Close</button>
                            <button className="mini-btn" style={{ color: 'var(--danger)' }} onClick={() => handleDelete(job.id)}>Delete</button>
                          </div>
                        </td>
                      </tr>
                    )
                  ))}
                </tbody>
              </table>
            )}
          </Panel>

          <Panel title="Create Job Card" hint="Fill in details and assign one or more technicians">
            <div className="form-row">
              <div className="field">
                <label>Customer</label>
                {customers.length > 0 ? (
                  <select value={fCustomer} onChange={e => handleCustomerChange(e.target.value)}>
                    <option value="">— select customer —</option>
                    {customers.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
                  </select>
                ) : (
                  <input value={fCustomer} onChange={e => handleCustomerChange(e.target.value)} placeholder="Customer name" />
                )}
              </div>
              <div className="field">
                <label>Vehicle / VIN</label>
                {customerVehicles.length > 1 ? (
                  <select value={fVehicle} onChange={e => handleVehicleSelect(e.target.value)}>
                    <option value="">— select vehicle —</option>
                    {customerVehicles.map(v => (
                      <option key={v.id} value={v.label}>{v.label}{v.plate ? ` · ${v.plate}` : ''}</option>
                    ))}
                  </select>
                ) : (
                  <input value={fVehicle} onChange={e => setFVehicle(e.target.value)} placeholder="2023 Ford F-150" />
                )}
              </div>
              <div className="field" style={{ minWidth: '100%' }}>
                <label>Service Type <span style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 400 }}>— select one or more</span></label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 4 }}>
                  {serviceTypeOptions.map(s => {
                    const active = fServiceTypes.includes(s);
                    return (
                      <button key={s} type="button" onClick={() => toggleServiceType(s)}
                        style={{ padding: '5px 12px', borderRadius: 20, fontSize: 13, cursor: 'pointer', border: `1px solid ${active ? 'var(--accent)' : 'var(--line)'}`, background: active ? 'rgba(204,0,0,0.08)' : 'var(--surface-soft)', color: active ? 'var(--accent)' : 'var(--text)', fontWeight: active ? 700 : 400, transition: 'all 0.15s' }}>
                        {s}
                      </button>
                    );
                  })}
                </div>
                {fServiceTypes.length === 0 && <div style={{ fontSize: 12, color: 'var(--red,#cc0000)', marginTop: 4 }}>Select at least one service type</div>}
              </div>
              {enableJobCardSubType && fServiceTypes.filter(s => (serviceSubTypes[s] ?? []).length > 0).map(svc => (
                <div key={svc} className="field">
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    {svc} — Sub-Type
                    {oilSuggestion && svc === 'Oil Change' && (
                      <span style={{ fontSize: 10, fontWeight: 600, padding: '2px 7px', borderRadius: 10, background: 'rgba(0,160,80,0.12)', color: '#00a050', border: '1px solid rgba(0,160,80,0.25)' }}>
                        ✓ Suggested from engine
                      </span>
                    )}
                  </label>
                  <select value={fSubTypes[svc] ?? ''} onChange={e => { setFSubTypes(prev => ({ ...prev, [svc]: e.target.value })); if (svc === 'Oil Change') setOilSuggestion(''); }}>
                    <option value="">— select sub-type —</option>
                    {(serviceSubTypes[svc] ?? []).map(s => (
                      <option key={s} value={s}>{s}{oilSuggestion && svc === 'Oil Change' && s.includes(oilSuggestion) ? ' ← recommended' : ''}</option>
                    ))}
                  </select>
                  {selectedVehicleEngine && svc === 'Oil Change' && (
                    <div style={{ marginTop: 4, fontSize: 11, color: 'var(--muted)' }}>Engine: {selectedVehicleEngine}</div>
                  )}
                </div>
              ))}
              <div className="field">
                <label>Work Type</label>
                <select value={fWorkType} onChange={e => setFWorkType(e.target.value)}>
                  <option>Mobile service</option><option>Shop repair</option><option>Fleet PM</option><option>Parts install</option><option>Diagnostic only</option>
                </select>
              </div>
              {enableJobCardPriority && (
                <div className="field">
                  <label>Priority</label>
                  <select value={fPriority} onChange={e => setFPriority(e.target.value)}>
                    <option>Normal</option><option>High</option><option>Roadside</option><option>Fleet SLA</option>
                  </select>
                </div>
              )}
            </div>
            <div className="form-row">
              {enableJobCardBranchRoute && (
                <div className="field">
                  <label>Branch / Route</label>
                  <select value={fRoute} onChange={e => setFRoute(e.target.value)}>
                    <option>Mobile Route 1</option><option>Downtown Branch</option><option>North Branch</option><option>Enterprise Depot</option>
                  </select>
                </div>
              )}
              {enableJobCardServiceLocation && (
                <div className="field">
                  <label>Service Location</label>
                  <input value={fServiceLoc} onChange={e => setFServiceLoc(e.target.value)} placeholder="Bay, driveway, depot" />
                </div>
              )}
              {enableJobCardApprovalCode && (
                <div className="field">
                  <label>PO / Approval Code</label>
                  <input value={fApproval} onChange={e => setFApproval(e.target.value)} placeholder="PO or SMS approval" />
                </div>
              )}
            </div>
            <div style={{ marginBottom: 14 }}>
              <label style={{ fontSize: 13, fontWeight: 600, display: 'block', marginBottom: 8 }}>Assign Technicians</label>
              {techs.length === 0 && <p style={{ color: 'var(--muted)', fontSize: 13 }}>No technicians yet — add them in the Manage Technicians tab.</p>}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
                {techs.map(t => (
                  <label key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, cursor: 'pointer', padding: '6px 12px', borderRadius: 8, border: `1px solid ${fTechs.includes(t.name) ? 'var(--accent)' : 'var(--line)'}`, background: fTechs.includes(t.name) ? 'rgba(204,0,0,0.06)' : 'var(--surface-soft)' }}>
                    <input type="checkbox" checked={fTechs.includes(t.name)} onChange={() => toggleFTech(t.name)} style={{ accentColor: 'var(--accent)' }} />
                    {t.name} <span style={{ color: 'var(--muted)', fontSize: 11 }}>({t.role})</span>
                  </label>
                ))}
              </div>
            </div>
            <div className="actions" style={{ justifyContent: 'flex-start' }}>
              <button className="btn primary" onClick={handleCreate} disabled={creating}>
                <Icon name="add" /> {creating ? 'Creating…' : 'Create Job Card'}
              </button>
            </div>
          </Panel>
        </>
      )}

      {/* ── CLOSED JOBS ── */}
      {tab === 'closed' && (
        <Panel title="Closed Jobs Archive" hint="Completed and closed job cards — read only">
          {closedJobs.length === 0 && <p style={{ color: 'var(--muted)' }}>No closed jobs yet.</p>}
          {closedJobs.length > 0 && (
            <table>
              <thead>
                <tr><th>Job Card</th><th>Customer / Vehicle</th><th>Service</th><th>Technicians</th><th>Check-In</th><th>Closed</th><th>Status</th></tr>
              </thead>
              <tbody>
                {closedJobs.map(job => (
                  <tr key={job.id}>
                    <td><strong>{job.id}</strong><div className="meta">{job.invoice ?? '—'}</div></td>
                    <td>{job.customer}<div className="meta">{job.vehicle}</div></td>
                    <td>{job.serviceType}<div className="meta"><Badge text={job.priority} /></div></td>
                    <td>{job.technicians.join(', ') || '—'}</td>
                    <td style={{ fontSize: 12 }}>{fmt(job.checkInDate)}</td>
                    <td style={{ fontSize: 12 }}>{fmt(job.closedDate)}</td>
                    <td><Badge text="Closed" /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Panel>
      )}

      {/* ── NEW JOB CARD MODAL ── */}
      {showCreateModal && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 60, background: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={() => setShowCreateModal(false)}>
          <div style={{ background: 'var(--surface)', borderRadius: 12, padding: 28, width: 640, maxWidth: '95vw', maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 20px 60px rgba(0,0,0,0.4)' }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
              <h2 style={{ fontSize: 18, fontWeight: 700, margin: 0 }}>New Job Card</h2>
              <button className="mini-btn" onClick={() => setShowCreateModal(false)} style={{ fontSize: 18, lineHeight: 1, padding: '4px 10px' }}>✕</button>
            </div>
            <div className="form-row">
              <div className="field">
                <label>Customer</label>
                {customers.length > 0 ? (
                  <select value={fCustomer} onChange={e => handleCustomerChange(e.target.value)}>
                    <option value="">— select customer —</option>
                    {customers.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
                  </select>
                ) : (
                  <input value={fCustomer} onChange={e => handleCustomerChange(e.target.value)} placeholder="Customer name" />
                )}
              </div>
              <div className="field">
                <label>Vehicle / VIN</label>
                {customerVehicles.length > 1 ? (
                  <select value={fVehicle} onChange={e => handleVehicleSelect(e.target.value)}>
                    <option value="">— select vehicle —</option>
                    {customerVehicles.map(v => (
                      <option key={v.id} value={v.label}>{v.label}{v.plate ? ` · ${v.plate}` : ''}</option>
                    ))}
                  </select>
                ) : (
                  <input value={fVehicle} onChange={e => setFVehicle(e.target.value)} placeholder="2023 Ford F-150" />
                )}
              </div>
            </div>
            <div className="form-row">
              <div className="field" style={{ minWidth: '100%' }}>
                <label>Service Type <span style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 400 }}>— select one or more</span></label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 4 }}>
                  {serviceTypeOptions.map(s => {
                    const active = fServiceTypes.includes(s);
                    return (
                      <button key={s} type="button" onClick={() => toggleServiceType(s)}
                        style={{ padding: '5px 12px', borderRadius: 20, fontSize: 13, cursor: 'pointer', border: `1px solid ${active ? 'var(--accent)' : 'var(--line)'}`, background: active ? 'rgba(204,0,0,0.08)' : 'var(--surface-soft)', color: active ? 'var(--accent)' : 'var(--text)', fontWeight: active ? 700 : 400, transition: 'all 0.15s' }}>
                        {s}
                      </button>
                    );
                  })}
                </div>
                {fServiceTypes.length === 0 && <div style={{ fontSize: 12, color: 'var(--red,#cc0000)', marginTop: 4 }}>Select at least one service type</div>}
              </div>
              {enableJobCardSubType && fServiceTypes.filter(s => (serviceSubTypes[s] ?? []).length > 0).map(svc => (
                <div key={svc} className="field">
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    {svc} — Sub-Type
                    {oilSuggestion && svc === 'Oil Change' && (
                      <span style={{ fontSize: 10, fontWeight: 600, padding: '2px 7px', borderRadius: 10, background: 'rgba(0,160,80,0.12)', color: '#00a050', border: '1px solid rgba(0,160,80,0.25)' }}>
                        ✓ Suggested from engine
                      </span>
                    )}
                  </label>
                  <select value={fSubTypes[svc] ?? ''} onChange={e => { setFSubTypes(prev => ({ ...prev, [svc]: e.target.value })); if (svc === 'Oil Change') setOilSuggestion(''); }}>
                    <option value="">— select sub-type —</option>
                    {(serviceSubTypes[svc] ?? []).map(s => (
                      <option key={s} value={s}>{s}{oilSuggestion && svc === 'Oil Change' && s.includes(oilSuggestion) ? ' ← recommended' : ''}</option>
                    ))}
                  </select>
                  {selectedVehicleEngine && svc === 'Oil Change' && (
                    <div style={{ marginTop: 4, fontSize: 11, color: 'var(--muted)' }}>Engine: {selectedVehicleEngine}</div>
                  )}
                </div>
              ))}
              <div className="field">
                <label>Work Type</label>
                <select value={fWorkType} onChange={e => setFWorkType(e.target.value)}>
                  <option>Mobile service</option><option>Shop repair</option><option>Fleet PM</option><option>Parts install</option><option>Diagnostic only</option>
                </select>
              </div>
              {enableJobCardPriority && (
                <div className="field">
                  <label>Priority</label>
                  <select value={fPriority} onChange={e => setFPriority(e.target.value)}>
                    <option>Normal</option><option>High</option><option>Roadside</option><option>Fleet SLA</option>
                  </select>
                </div>
              )}
            </div>
            <div className="form-row">
              {enableJobCardBranchRoute && (
                <div className="field">
                  <label>Branch / Route</label>
                  <select value={fRoute} onChange={e => setFRoute(e.target.value)}>
                    <option>Mobile Route 1</option><option>Downtown Branch</option><option>North Branch</option><option>Enterprise Depot</option>
                  </select>
                </div>
              )}
              {enableJobCardServiceLocation && (
                <div className="field">
                  <label>Service Location</label>
                  <input value={fServiceLoc} onChange={e => setFServiceLoc(e.target.value)} placeholder="Bay, driveway, depot" />
                </div>
              )}
              {enableJobCardApprovalCode && (
                <div className="field">
                  <label>PO / Approval Code</label>
                  <input value={fApproval} onChange={e => setFApproval(e.target.value)} placeholder="PO or SMS approval" />
                </div>
              )}
            </div>
            <div style={{ marginBottom: 14 }}>
              <label style={{ fontSize: 13, fontWeight: 600, display: 'block', marginBottom: 8 }}>Assign Technicians</label>
              {techs.length === 0 && <p style={{ color: 'var(--muted)', fontSize: 13 }}>No technicians yet — add them in the Manage Technicians tab.</p>}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
                {techs.map(t => (
                  <label key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, cursor: 'pointer', padding: '6px 12px', borderRadius: 8, border: `1px solid ${fTechs.includes(t.name) ? 'var(--accent)' : 'var(--line)'}`, background: fTechs.includes(t.name) ? 'rgba(204,0,0,0.06)' : 'var(--surface-soft)' }}>
                    <input type="checkbox" checked={fTechs.includes(t.name)} onChange={() => toggleFTech(t.name)} style={{ accentColor: 'var(--accent)' }} />
                    {t.name} <span style={{ color: 'var(--muted)', fontSize: 11 }}>({t.role})</span>
                  </label>
                ))}
              </div>
            </div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', paddingTop: 8, borderTop: '1px solid var(--line)' }}>
              <button className="btn" onClick={() => { setShowCreateModal(false); setCustomerVehicles([]); setFServiceTypes([serviceTypeOptions[0] ?? 'Oil Change']); setFSubTypes({}); setSelectedVehicleEngine(''); setOilSuggestion(''); }}>Cancel</button>
              <button className="btn primary" onClick={async () => { await handleCreate(); setShowCreateModal(false); }} disabled={creating}>
                <Icon name="add" /> {creating ? 'Creating…' : 'Create Job Card'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── JOB DETAIL DRAWER ── */}
      {selectedJob && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 50, display: 'flex', alignItems: 'flex-start', justifyContent: 'flex-end' }} onClick={() => setSelectedJob(null)}>
          <div style={{ width: 420, height: '100vh', background: 'var(--surface)', borderLeft: '1px solid var(--line)', padding: 28, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 20, boxShadow: '-8px 0 40px rgba(0,0,0,0.3)' }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <h2 style={{ fontSize: 18, fontWeight: 700, margin: 0 }}>{selectedJob.id}</h2>
                <div className="meta" style={{ marginTop: 4 }}>{selectedJob.channel ?? 'Job Card'}</div>
              </div>
              <button className="mini-btn" onClick={() => setSelectedJob(null)} style={{ fontSize: 18, lineHeight: 1, padding: '4px 10px' }}>✕</button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div><div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 3 }}>CUSTOMER</div><strong>{selectedJob.customer}</strong></div>
              <div><div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 3 }}>VEHICLE</div><span>{selectedJob.vehicle || '—'}</span></div>
              <div><div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 3 }}>SERVICE TYPE</div><span>{selectedJob.serviceType}</span></div>
              <div><div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 3 }}>PRIORITY</div><Badge text={selectedJob.priority} /></div>
              <div><div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 3 }}>APPROVAL</div><Badge text={selectedJob.approval} /></div>
              <div><div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 3 }}>STATUS</div><Badge text={selectedJob.status} /></div>
              <div><div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 3 }}>CHECK-IN</div><span style={{ fontSize: 13 }}>{fmt(selectedJob.checkInDate)}</span></div>
              <div><div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 3 }}>LOCATION</div><span style={{ fontSize: 13 }}>{selectedJob.location || '—'}</span></div>
              {selectedJob.ro && <div><div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 3 }}>REPAIR ORDER</div><span style={{ fontSize: 13 }}>{selectedJob.ro}</span></div>}
              {selectedJob.invoice && <div><div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 3 }}>INVOICE</div><span style={{ fontSize: 13 }}>{selectedJob.invoice}</span></div>}
              {selectedJob.laborHours != null && <div><div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 3 }}>LABOR HRS</div><span style={{ fontSize: 13 }}>{selectedJob.laborHours}</span></div>}
              {selectedJob.partsTotal != null && <div><div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 3 }}>PARTS TOTAL</div><span style={{ fontSize: 13 }}>${selectedJob.partsTotal}</span></div>}
            </div>

            <div>
              <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 6 }}>TECHNICIANS</div>
              {selectedJob.technicians.length > 0
                ? <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>{selectedJob.technicians.map((t, i) => <span key={i} style={{ padding: '4px 10px', borderRadius: 6, background: 'var(--surface-soft)', fontSize: 13, border: '1px solid var(--line)' }}>{t}</span>)}</div>
                : <span style={{ color: 'var(--muted)', fontSize: 13 }}>Unassigned</span>}
            </div>

            <div>
              <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 6 }}>WORKFLOW</div>
              <Workflow steps={selectedJob.workflow} />
            </div>

            {selectedJob.nextAction && (
              <div style={{ padding: '12px 16px', borderRadius: 8, background: 'rgba(204,0,0,0.07)', border: '1px solid rgba(204,0,0,0.2)', fontSize: 13 }}>
                <strong>Next action:</strong> {selectedJob.nextAction}
              </div>
            )}

            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', paddingTop: 8, borderTop: '1px solid var(--line)', marginTop: 'auto' }}>
              <button className="mini-btn" onClick={() => { setSelectedJob(null); startEdit(selectedJob); }}>Edit</button>
              <button className="mini-btn" onClick={() => { handleApprove(selectedJob); setSelectedJob(null); }}>Approve</button>
              <button className="mini-btn" style={{ background: 'rgba(33,150,243,0.1)', color: '#2196f3', border: '1px solid #2196f344' }}
                onClick={() => {
                  dispatch({ type: 'SET_PREFILL', prefill: { customerName: selectedJob.customer, vehicle: selectedJob.vehicle, jobCardId: selectedJob.id } });
                  dispatch({ type: 'SET_MODULE', module: 'inspections' });
                  setSelectedJob(null);
                }}>🔍 Start DVI →</button>
              <button className="mini-btn" style={{ background: 'rgba(255,152,0,0.1)', color: '#e65100', border: '1px solid #ff980044' }}
                onClick={() => { openTracker(selectedJob); setSelectedJob(null); }}>
                📍 Status Tracker
              </button>
              <button className="mini-btn" style={{ background: 'rgba(76,175,80,0.1)', color: '#4caf50', border: '1px solid #4caf5044' }}
                onClick={() => {
                  dispatch({ type: 'SET_PREFILL', prefill: { customerName: selectedJob.customer } });
                  dispatch({ type: 'SET_MODULE', module: 'repair-orders' });
                  setSelectedJob(null);
                }}>🔧 Repair Order →</button>
              <button className="mini-btn" style={{ background: 'rgba(156,39,176,0.1)', color: '#9c27b0', border: '1px solid #9c27b033' }}
                onClick={() => {
                  dispatch({ type: 'SET_PREFILL', prefill: { customerName: selectedJob.customer, vehicle: selectedJob.vehicle } });
                  dispatch({ type: 'SET_MODULE', module: 'invoices' });
                  setSelectedJob(null);
                }}>🧾 Invoice →</button>
              <button className="mini-btn" style={{ color: 'var(--accent-2)' }} onClick={() => { handleClose(selectedJob); setSelectedJob(null); }}>Close Job</button>
              <button className="mini-btn" style={{ color: 'var(--danger)' }} onClick={() => { handleDelete(selectedJob.id); setSelectedJob(null); }}>Delete</button>
            </div>
          </div>
        </div>
      )}

      {/* ── STATUS TRACKER MODAL ── */}
      {trackerJob && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 60, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'flex-start', justifyContent: 'flex-end' }} onClick={() => setTrackerJob(null)}>
          <div style={{ width: 460, height: '100vh', background: 'var(--surface)', borderLeft: '1px solid var(--line)', padding: 24, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 16, boxShadow: '-8px 0 40px rgba(0,0,0,0.35)' }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <h2 style={{ fontSize: 17, fontWeight: 700, margin: 0 }}>📍 Status Tracker</h2>
                <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>{trackerJob.customer} · {trackerJob.vehicle}</div>
              </div>
              <button className="mini-btn" onClick={() => setTrackerJob(null)} style={{ fontSize: 18, padding: '4px 10px' }}>✕</button>
            </div>

            {/* Share URL */}
            {statusUrl && (
              <div style={{ background: 'rgba(230,81,0,0.07)', border: '1px solid #ff980044', borderRadius: 10, padding: '12px 14px' }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#e65100', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>Customer Link</div>
                <div style={{ fontSize: 12, fontFamily: 'monospace', color: 'var(--muted)', wordBreak: 'break-all', marginBottom: 8 }}>{statusUrl}</div>
                <button onClick={() => { navigator.clipboard.writeText(statusUrl); setCopiedStatus(true); setTimeout(() => setCopiedStatus(false), 2500); }}
                  style={{ padding: '5px 14px', borderRadius: 6, border: '1px solid #ff980044', background: copiedStatus ? 'rgba(46,125,50,0.1)' : 'rgba(230,81,0,0.1)', color: copiedStatus ? '#2e7d32' : '#e65100', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                  {copiedStatus ? '✓ Copied!' : '📋 Copy Link'}
                </button>
              </div>
            )}

            {/* Stage progress */}
            <div style={{ background: 'var(--surface-soft)', border: '1px solid var(--line)', borderRadius: 10, padding: '14px 16px' }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', marginBottom: 12 }}>Current Progress</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {STAGES.map((stage, idx) => {
                  const currentIdx = STAGES.findIndex(s => s.id === repairStage);
                  const done = idx < currentIdx;
                  const active = idx === currentIdx;
                  const hist = stageHistory.find(h => h.stage === stage.id);
                  return (
                    <div key={stage.id} style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                      <div style={{ width: 28, height: 28, borderRadius: '50%', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13,
                        background: done ? '#2e7d32' : active ? '#e65100' : 'var(--surface)', border: `2px solid ${done ? '#2e7d32' : active ? '#e65100' : 'var(--line)'}` }}>
                        {done ? <span style={{ color: '#fff', fontWeight: 900 }}>✓</span> : <span>{stage.icon}</span>}
                      </div>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 13, fontWeight: active ? 700 : done ? 500 : 400, color: active ? 'var(--text)' : done ? 'var(--text)' : 'var(--muted)' }}>{stage.label}</div>
                        {hist && <div style={{ fontSize: 10, color: 'var(--muted)' }}>{new Date(hist.advancedAt).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}{hist.notifiedSms ? ' 📱' : ''}{hist.notifiedEmail ? ' ✉️' : ''}</div>}
                      </div>
                      {active && <span style={{ fontSize: 10, fontWeight: 700, color: '#e65100', background: 'rgba(230,81,0,0.1)', padding: '2px 8px', borderRadius: 8 }}>NOW</span>}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Advance stage */}
            {(() => {
              const currentIdx = STAGES.findIndex(s => s.id === repairStage);
              const nextStage = STAGES[currentIdx + 1];
              if (!nextStage) return (
                <div style={{ textAlign: 'center', padding: '16px 0', fontSize: 14, fontWeight: 700, color: '#2e7d32' }}>🎉 Vehicle is Ready for Pickup</div>
              );
              return (
                <div style={{ background: 'var(--surface-soft)', border: '1px solid var(--line)', borderRadius: 10, padding: '14px 16px' }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', marginBottom: 12 }}>Advance Stage</div>

                  {/* Notification options */}
                  <div style={{ marginBottom: 14 }}>
                    <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 8 }}>Notify customer when advancing:</div>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, fontSize: 13, cursor: 'pointer' }}>
                      <input type="checkbox" checked={notifySms} onChange={e => setNotifySms(e.target.checked)} style={{ accentColor: '#e65100' }} />
                      📱 SMS
                    </label>
                    {notifySms && (
                      <input value={notifyPhone} onChange={e => setNotifyPhone(e.target.value)} placeholder="+1 555 000 0000" style={{ width: '100%', padding: '8px 10px', borderRadius: 6, border: '1px solid var(--line)', background: 'var(--surface)', color: 'var(--text)', fontSize: 13, marginBottom: 8, boxSizing: 'border-box' as const }} />
                    )}
                    <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, fontSize: 13, cursor: 'pointer' }}>
                      <input type="checkbox" checked={notifyEmail} onChange={e => setNotifyEmail(e.target.checked)} style={{ accentColor: '#e65100' }} />
                      ✉️ Email
                    </label>
                    {notifyEmail && (
                      <input type="email" value={notifyEmailAddr} onChange={e => setNotifyEmailAddr(e.target.value)} placeholder="customer@email.com" style={{ width: '100%', padding: '8px 10px', borderRadius: 6, border: '1px solid var(--line)', background: 'var(--surface)', color: 'var(--text)', fontSize: 13, boxSizing: 'border-box' as const }} />
                    )}
                  </div>

                  <button onClick={() => advanceStage(nextStage.id)} disabled={advancingStage}
                    style={{ width: '100%', padding: '12px 0', borderRadius: 8, background: advancingStage ? '#999' : '#e65100', color: '#fff', fontWeight: 700, fontSize: 14, border: 'none', cursor: advancingStage ? 'not-allowed' : 'pointer' }}>
                    {advancingStage ? 'Advancing…' : `${nextStage.icon} Advance to "${nextStage.label}"`}
                  </button>

                  {notifyResult && (
                    <div style={{ marginTop: 8, fontSize: 12, color: notifyResult.includes('✓') ? '#2e7d32' : '#e65100', textAlign: 'center' }}>{notifyResult}</div>
                  )}
                </div>
              );
            })()}
          </div>
        </div>
      )}

      {/* ── MANAGE TECHS ── */}
      {tab === 'techs' && (
        <>
          <Panel title="Add Technician" hint="Add staff who can be assigned to job cards">
            <form onSubmit={handleAddTech} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 12, alignItems: 'end' }}>
              <div className="login-field">
                <label>Name *</label>
                <input required value={newTechName} onChange={e => setNewTechName(e.target.value)} placeholder="Full name" />
              </div>
              <div className="login-field">
                <label>Role</label>
                <select value={newTechRole} onChange={e => setNewTechRole(e.target.value)} style={{ border: '1px solid var(--line)', borderRadius: 8, padding: '10px 12px', background: 'var(--surface-soft)', color: 'var(--text)' }}>
                  <option>Technician</option><option>Lead Technician</option><option>Service Advisor</option><option>Mobile Mechanic</option><option>Apprentice</option>
                </select>
              </div>
              <div className="login-field">
                <label>Phone</label>
                <input value={newTechPhone} onChange={e => setNewTechPhone(e.target.value)} placeholder="(555) 000-0000" />
              </div>
              <div className="login-field">
                <label>Email</label>
                <input type="email" value={newTechEmail} onChange={e => setNewTechEmail(e.target.value)} placeholder="tech@shop.com" />
              </div>
              <div style={{ gridColumn: '1 / -1' }}>
                <button type="submit" className="btn btn-primary">Add Technician</button>
              </div>
            </form>
          </Panel>

          <Panel title="Technician Roster" hint="All active technicians available for job assignment">
            {techs.length === 0 && <p style={{ color: 'var(--muted)' }}>No technicians added yet.</p>}
            {techs.length > 0 && (
              <table>
                <thead><tr><th>Name</th><th>Role</th><th>Phone</th><th>Email</th><th>Action</th></tr></thead>
                <tbody>
                  {techs.map(t => (
                    <tr key={t.id}>
                      <td><strong>{t.name}</strong></td>
                      <td><Badge text={t.role} /></td>
                      <td>{t.phone || '—'}</td>
                      <td>{t.email || '—'}</td>
                      <td><button className="mini-btn" style={{ color: 'var(--danger)' }} onClick={() => handleDeleteTech(t.id, t.name)}>Remove</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Panel>
        </>
      )}
    </>
  );
}
