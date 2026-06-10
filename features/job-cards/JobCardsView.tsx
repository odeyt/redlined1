'use client';

import { useEffect, useState } from 'react';
import { Panel } from '@/components/Panel';
import { Badge } from '@/components/Badge';
import { Workflow } from '@/components/Workflow';
import { Icon } from '@/components/Icon';
import { StatCard } from '@/components/StatCard';
import {
  fetchJobCards, fetchClosedJobs, createJobCard,
  updateJobCard, closeJob, deleteJobCard, type JobCardFull,
} from '@/services/jobCardService';
import { fetchCustomerNames } from '@/services/vehicleService';
import { fetchTechnicians, createTechnician, deleteTechnician, type Technician } from '@/services/technicianService';

const fmt = (iso: string | null) => iso ? new Date(iso).toLocaleDateString() : '—';

export function JobCardsView() {
  const [tab, setTab] = useState<'active' | 'closed' | 'techs'>('active');
  const [jobs, setJobs] = useState<JobCardFull[]>([]);
  const [closedJobs, setClosedJobs] = useState<JobCardFull[]>([]);
  const [customers, setCustomers] = useState<{ id: string; name: string }[]>([]);
  const [techs, setTechs] = useState<Technician[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [toast, setToast] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editFields, setEditFields] = useState<Partial<JobCardFull>>({});

  // Create form
  const [fCustomer, setFCustomer] = useState('');
  const [fVehicle, setFVehicle] = useState('');
  const [fWorkType, setFWorkType] = useState('Mobile service');
  const [fPriority, setFPriority] = useState('Normal');
  const [fRoute, setFRoute] = useState('Mobile Route 1');
  const [fServiceLoc, setFServiceLoc] = useState('');
  const [fTechs, setFTechs] = useState<string[]>([]);
  const [fApproval, setFApproval] = useState('');
  const [creating, setCreating] = useState(false);

  // Add tech form
  const [newTechName, setNewTechName] = useState('');
  const [newTechRole, setNewTechRole] = useState('Technician');
  const [newTechPhone, setNewTechPhone] = useState('');
  const [newTechEmail, setNewTechEmail] = useState('');

  useEffect(() => {
    Promise.all([fetchJobCards(), fetchClosedJobs(), fetchCustomerNames(), fetchTechnicians()])
      .then(([j, c, custs, t]) => {
        setJobs(j); setClosedJobs(c); setCustomers(custs); setTechs(t);
        if (custs[0]) setFCustomer(custs[0].name);
      })
      .catch(err => setError('Load error: ' + (err?.message || err)))
      .finally(() => setLoading(false));
  }, []);

  function notify(msg: string) { setToast(msg); setTimeout(() => setToast(''), 4000); }

  function toggleFTech(name: string) {
    setFTechs(prev => prev.includes(name) ? prev.filter(t => t !== name) : [...prev, name]);
  }

  async function handleCreate() {
    if (!fCustomer) return setError('Select a customer.');
    setError(''); setCreating(true);
    try {
      const channel = fWorkType.includes('Mobile') ? 'Mobile mechanic' : fWorkType.includes('Fleet') ? 'Fleet service' : 'Shop bay';
      const job = await createJobCard({ customer: fCustomer, vehicle: fVehicle, serviceType: fWorkType, channel, location: fServiceLoc, technicians: fTechs, priority: fPriority, approvalCode: fApproval });
      setJobs(prev => [job, ...prev]);
      setFVehicle(''); setFServiceLoc(''); setFApproval(''); setFTechs([]);
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
      notify(`${job.id} closed and archived.`);
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
                      <tr key={job.id}>
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
                <select value={fCustomer} onChange={e => setFCustomer(e.target.value)}>
                  {customers.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
                </select>
              </div>
              <div className="field">
                <label>Vehicle / VIN</label>
                <input value={fVehicle} onChange={e => setFVehicle(e.target.value)} placeholder="2023 Ford F-150" />
              </div>
              <div className="field">
                <label>Work Type</label>
                <select value={fWorkType} onChange={e => setFWorkType(e.target.value)}>
                  <option>Mobile service</option><option>Shop repair</option><option>Fleet PM</option><option>Parts install</option><option>Diagnostic only</option>
                </select>
              </div>
              <div className="field">
                <label>Priority</label>
                <select value={fPriority} onChange={e => setFPriority(e.target.value)}>
                  <option>Normal</option><option>High</option><option>Roadside</option><option>Fleet SLA</option>
                </select>
              </div>
            </div>
            <div className="form-row">
              <div className="field">
                <label>Branch / Route</label>
                <select value={fRoute} onChange={e => setFRoute(e.target.value)}>
                  <option>Mobile Route 1</option><option>Downtown Branch</option><option>North Branch</option><option>Enterprise Depot</option>
                </select>
              </div>
              <div className="field">
                <label>Service Location</label>
                <input value={fServiceLoc} onChange={e => setFServiceLoc(e.target.value)} placeholder="Bay, driveway, depot" />
              </div>
              <div className="field">
                <label>PO / Approval Code</label>
                <input value={fApproval} onChange={e => setFApproval(e.target.value)} placeholder="PO or SMS approval" />
              </div>
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
