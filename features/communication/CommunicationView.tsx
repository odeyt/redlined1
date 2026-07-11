'use client';

import { useEffect, useState } from 'react';
import { Panel } from '@/components/Panel';
import {
  fetchCampaigns, createCampaign, updateCampaign, deleteCampaign,
  fetchFollowups, createFollowup, markFollowupSent, deleteFollowup,
  CAMPAIGN_TYPES, CAMPAIGN_CHANNELS, REACTIVATION_TEMPLATES,
  type Campaign, type EstimateFollowup,
} from '@/services/campaignService';
import { fetchEstimates } from '@/services/estimateService';
import { fetchShopSettings } from '@/services/shopSettingsService';

type Tab = 'followups' | 'campaigns' | 'receptionist';

const CHANNEL_EMOJI: Record<string, string> = { Email: '✉️', SMS: '📱', Both: '📡' };

export function CommunicationView() {
  const [tab, setTab] = useState<Tab>('followups');
  const [toast, setToast] = useState('');
  const [error, setError] = useState('');

  // Follow-ups
  const [followups, setFollowups] = useState<EstimateFollowup[]>([]);
  const [loadingFollowups, setLoadingFollowups] = useState(false);
  const [showFollowupForm, setShowFollowupForm] = useState(false);
  const [fuForm, setFuForm] = useState({ estimateNumber: '', customerName: '', customerEmail: '', customerPhone: '', channel: 'SMS', message: '' });
  const [pendingEstimates, setPendingEstimates] = useState<{ number: string; customerName: string; sentDate: string }[]>([]);
  const [shopName, setShopName] = useState('');
  const [shopPhone, setShopPhone] = useState('');

  // Campaigns
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loadingCampaigns, setLoadingCampaigns] = useState(false);
  const [showCampaignForm, setShowCampaignForm] = useState(false);
  const [editingCampaignId, setEditingCampaignId] = useState<string | null>(null);
  const [campForm, setCampForm] = useState({ name: '', type: 'Reactivation', subject: '', messageTemplate: '', targetDaysSinceService: 180, channel: 'Email', status: 'Draft' });

  // AI Receptionist
  const [intakeForm, setIntakeForm] = useState({ customerName: '', phone: '', email: '', vehicle: '', complaint: '', preferredDate: '', channel: 'SMS' });
  const [generatedMessage, setGeneratedMessage] = useState('');
  const [intakeSaving, setIntakeSaving] = useState(false);

  useEffect(() => {
    if (tab === 'followups') loadFollowups();
    if (tab === 'campaigns') loadCampaigns();
  }, [tab]);

  useEffect(() => {
    fetchShopSettings().then(s => { setShopName(s.companyName); setShopPhone(s.phone); }).catch(() => {});
    // Load sent estimates for follow-up suggestions
    fetchEstimates().then(ests => {
      const sent = ests
        .filter(e => e.status === 'Sent')
        .map(e => ({ number: e.estimateNumber, customerName: e.customerName, sentDate: e.createdAt }));
      setPendingEstimates(sent);
    }).catch(() => {});
  }, []);

  function notify(msg: string) { setToast(msg); setTimeout(() => setToast(''), 3500); }

  async function loadFollowups() {
    setLoadingFollowups(true);
    try { setFollowups(await fetchFollowups()); } catch (e: unknown) { setError(e instanceof Error ? e.message : ''); }
    finally { setLoadingFollowups(false); }
  }

  async function loadCampaigns() {
    setLoadingCampaigns(true);
    try { setCampaigns(await fetchCampaigns()); } catch (e: unknown) { setError(e instanceof Error ? e.message : ''); }
    finally { setLoadingCampaigns(false); }
  }

  async function handleCreateFollowup(e: React.FormEvent) {
    e.preventDefault();
    if (!fuForm.estimateNumber || !fuForm.customerName || !fuForm.message) return setError('Estimate #, customer, and message are required.');
    try {
      const saved = await createFollowup({ ...fuForm, status: 'Queued' });
      setFollowups(prev => [saved, ...prev]);
      setFuForm({ estimateNumber: '', customerName: '', customerEmail: '', customerPhone: '', channel: 'SMS', message: '' });
      setShowFollowupForm(false);
      notify('Follow-up queued.');
    } catch (e: unknown) { setError(e instanceof Error ? e.message : ''); }
  }

  async function handleMarkSent(fu: EstimateFollowup) {
    try {
      await markFollowupSent(fu.id);
      setFollowups(prev => prev.map(f => f.id === fu.id ? { ...f, status: 'Sent', sentAt: new Date().toISOString() } : f));
      notify('Marked as sent.');
    } catch (e: unknown) { setError(e instanceof Error ? e.message : ''); }
  }

  async function handleDeleteFollowup(fu: EstimateFollowup) {
    if (!confirm(`Delete follow-up for ${fu.customerName}?`)) return;
    try {
      await deleteFollowup(fu.id);
      setFollowups(prev => prev.filter(f => f.id !== fu.id));
      notify('Deleted.');
    } catch (e: unknown) { setError(e instanceof Error ? e.message : ''); }
  }

  function loadTemplate(t: typeof REACTIVATION_TEMPLATES[0]) {
    setCampForm(f => ({ ...f, name: t.name, type: t.type, subject: t.subject, messageTemplate: t.template, status: 'Draft' }));
  }

  async function handleSaveCampaign(e: React.FormEvent) {
    e.preventDefault();
    if (!campForm.name || !campForm.messageTemplate) return setError('Name and message are required.');
    try {
      if (editingCampaignId) {
        await updateCampaign(editingCampaignId, campForm);
        setCampaigns(prev => prev.map(c => c.id === editingCampaignId ? { ...c, ...campForm } : c));
        notify('Campaign updated.');
      } else {
        const saved = await createCampaign(campForm);
        setCampaigns(prev => [saved, ...prev]);
        notify('Campaign created.');
      }
      setShowCampaignForm(false); setEditingCampaignId(null);
      setCampForm({ name: '', type: 'Reactivation', subject: '', messageTemplate: '', targetDaysSinceService: 180, channel: 'Email', status: 'Draft' });
    } catch (e: unknown) { setError(e instanceof Error ? e.message : ''); }
  }

  async function handleActivateCampaign(c: Campaign) {
    const newStatus = c.status === 'Active' ? 'Paused' : 'Active';
    try {
      await updateCampaign(c.id, { status: newStatus });
      setCampaigns(prev => prev.map(cam => cam.id === c.id ? { ...cam, status: newStatus } : cam));
      notify(`Campaign ${newStatus === 'Active' ? 'activated' : 'paused'}.`);
    } catch (e: unknown) { setError(e instanceof Error ? e.message : ''); }
  }

  async function handleDeleteCampaign(c: Campaign) {
    if (!confirm(`Delete "${c.name}"?`)) return;
    try {
      await deleteCampaign(c.id);
      setCampaigns(prev => prev.filter(cam => cam.id !== c.id));
      notify('Campaign deleted.');
    } catch (e: unknown) { setError(e instanceof Error ? e.message : ''); }
  }

  function generateReceptionistMessage() {
    if (!intakeForm.customerName || !intakeForm.vehicle) return setError('Customer name and vehicle required.');
    const shop = shopName || 'our shop';
    const lines = [
      `Hi ${intakeForm.customerName}! Thanks for reaching out to ${shop}.`,
      '',
      `We received your request for your **${intakeForm.vehicle}**${intakeForm.complaint ? ` regarding: "${intakeForm.complaint}"` : ''}.`,
      '',
      intakeForm.preferredDate ? `We have availability around ${intakeForm.preferredDate}. We'll confirm your slot shortly.` : `We'll reach out to confirm your appointment time shortly.`,
      '',
      `To speed things up, please have your vehicle ready and let us know if you have any questions.`,
      '',
      `— ${shop}${shopPhone ? ` · ${shopPhone}` : ''}`,
    ];
    setGeneratedMessage(lines.join('\n'));
  }

  async function handleCreateJobFromIntake() {
    if (!generatedMessage) return;
    setIntakeSaving(true);
    try {
      // Create job card via supabase directly
      const { supabase } = await import('@/lib/supabase');
      await supabase.from('job_cards').insert({
        customer: intakeForm.customerName,
        vehicle: intakeForm.vehicle,
        service_type: intakeForm.complaint || 'General Service',
        status: 'New',
        channel: 'Web / Phone',
        notes: `Received via AI Receptionist intake.\nPhone: ${intakeForm.phone}\nEmail: ${intakeForm.email}\nPreferred date: ${intakeForm.preferredDate}`,
      });
      notify(`Job card created for ${intakeForm.customerName}. Go to Job Cards to view it.`);
      setIntakeForm({ customerName: '', phone: '', email: '', vehicle: '', complaint: '', preferredDate: '', channel: 'SMS' });
      setGeneratedMessage('');
    } catch (e: unknown) { setError(e instanceof Error ? e.message : ''); }
    finally { setIntakeSaving(false); }
  }

  const queuedFu = followups.filter(f => f.status === 'Queued').length;
  const activeCampaigns = campaigns.filter(c => c.status === 'Active').length;

  return (
    <>
      {toast && <div className="toast toast-visible">{toast}</div>}

      {/* Stats */}
      <div className="grid cols-4" style={{ marginBottom: 16 }}>
        <div className="card" style={{ padding: 16 }}>
          <div style={{ fontSize: 11, color: 'var(--muted)', textTransform: 'uppercase', fontWeight: 700 }}>Pending Estimates</div>
          <div style={{ fontSize: 28, fontWeight: 700, color: pendingEstimates.length > 0 ? '#f59e0b' : 'var(--text)' }}>{pendingEstimates.length}</div>
          <div style={{ fontSize: 12, color: 'var(--muted)' }}>No response yet</div>
        </div>
        <div className="card" style={{ padding: 16 }}>
          <div style={{ fontSize: 11, color: 'var(--muted)', textTransform: 'uppercase', fontWeight: 700 }}>Queued Follow-ups</div>
          <div style={{ fontSize: 28, fontWeight: 700, color: queuedFu > 0 ? '#2196f3' : 'var(--text)' }}>{queuedFu}</div>
          <div style={{ fontSize: 12, color: 'var(--muted)' }}>Ready to send</div>
        </div>
        <div className="card" style={{ padding: 16 }}>
          <div style={{ fontSize: 11, color: 'var(--muted)', textTransform: 'uppercase', fontWeight: 700 }}>Active Campaigns</div>
          <div style={{ fontSize: 28, fontWeight: 700, color: activeCampaigns > 0 ? '#4caf50' : 'var(--text)' }}>{activeCampaigns}</div>
          <div style={{ fontSize: 12, color: 'var(--muted)' }}>Running now</div>
        </div>
        <div className="card" style={{ padding: 16 }}>
          <div style={{ fontSize: 11, color: 'var(--muted)', textTransform: 'uppercase', fontWeight: 700 }}>Sent Messages</div>
          <div style={{ fontSize: 28, fontWeight: 700 }}>{followups.filter(f => f.status === 'Sent').length}</div>
          <div style={{ fontSize: 12, color: 'var(--muted)' }}>Logged</div>
        </div>
      </div>

      {error && <p style={{ color: 'var(--danger)', padding: '10px 14px', background: '#fff0f0', borderRadius: 6, marginBottom: 12 }}>{error} <button onClick={() => setError('')} style={{ background: 'none', border: 'none', cursor: 'pointer', marginLeft: 8 }}>✕</button></p>}

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 18 }}>
        {([['followups', '📩 Follow-up Automation'], ['campaigns', '📣 Reactivation Campaigns'], ['receptionist', '🤖 AI Receptionist']] as [Tab, string][]).map(([id, label]) => (
          <button key={id} onClick={() => setTab(id)}
            style={{ padding: '8px 18px', borderRadius: 8, border: '1px solid var(--line)', background: tab === id ? 'var(--accent)' : 'var(--surface-soft)', color: tab === id ? '#fff' : 'var(--text)', fontWeight: 600, fontSize: 13, cursor: 'pointer' }}>
            {label}
          </button>
        ))}
      </div>

      {/* ── FOLLOW-UP AUTOMATION ── */}
      {tab === 'followups' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, alignItems: 'start' }}>
          {/* Pending estimates that need follow-up */}
          <Panel title="📩 Estimates Needing Follow-up" hint="Sent estimates with no response">
            {pendingEstimates.length === 0 ? (
              <p style={{ color: 'var(--muted)', fontSize: 13, padding: '8px 0' }}>No pending estimates waiting for response.</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {pendingEstimates.map(est => (
                  <div key={est.number} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 14px', background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.25)', borderRadius: 10 }}>
                    <div>
                      <div style={{ fontWeight: 700 }}>{est.number}</div>
                      <div style={{ fontSize: 12, color: 'var(--muted)' }}>{est.customerName}</div>
                      <div style={{ fontSize: 11, color: 'var(--muted)' }}>Sent {est.sentDate ? new Date(est.sentDate).toLocaleDateString() : '—'}</div>
                    </div>
                    <button className="btn btn-primary" style={{ fontSize: 12, padding: '6px 12px' }}
                      onClick={() => {
                        setFuForm(f => ({
                          ...f,
                          estimateNumber: est.number,
                          customerName: est.customerName,
                          message: `Hi ${est.customerName}, we're following up on estimate ${est.number}. Have you had a chance to review it? We'd love to get your vehicle taken care of. — ${shopName}`,
                        }));
                        setShowFollowupForm(true);
                      }}>
                      📩 Create Follow-up
                    </button>
                  </div>
                ))}
              </div>
            )}

            <div style={{ marginTop: 14, paddingTop: 14, borderTop: '1px solid var(--line)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 13, color: 'var(--muted)' }}>Or create a custom follow-up</span>
              <button className="btn btn-primary" onClick={() => setShowFollowupForm(v => !v)}>+ Custom Follow-up</button>
            </div>

            {showFollowupForm && (
              <form onSubmit={handleCreateFollowup} style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div className="login-field">
                  <label>Estimate #</label>
                  <input value={fuForm.estimateNumber} onChange={e => setFuForm(f => ({ ...f, estimateNumber: e.target.value }))} required placeholder="EST-0001" />
                </div>
                <div className="login-field">
                  <label>Customer Name</label>
                  <input value={fuForm.customerName} onChange={e => setFuForm(f => ({ ...f, customerName: e.target.value }))} required />
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                  <div className="login-field">
                    <label>Email</label>
                    <input type="email" value={fuForm.customerEmail} onChange={e => setFuForm(f => ({ ...f, customerEmail: e.target.value }))} />
                  </div>
                  <div className="login-field">
                    <label>Phone</label>
                    <input type="tel" value={fuForm.customerPhone} onChange={e => setFuForm(f => ({ ...f, customerPhone: e.target.value }))} />
                  </div>
                </div>
                <div className="login-field">
                  <label>Channel</label>
                  <select value={fuForm.channel} onChange={e => setFuForm(f => ({ ...f, channel: e.target.value }))}
                    style={{ border: '1px solid var(--line)', borderRadius: 8, padding: '10px 12px', background: 'var(--surface)', color: 'var(--text)' }}>
                    <option>SMS</option><option>Email</option><option>Both</option>
                  </select>
                </div>
                <div className="login-field">
                  <label>Message</label>
                  <textarea value={fuForm.message} onChange={e => setFuForm(f => ({ ...f, message: e.target.value }))} rows={3} required
                    style={{ border: '1px solid var(--line)', borderRadius: 8, padding: '10px 12px', background: 'var(--surface)', color: 'var(--text)', fontSize: 13, width: '100%', resize: 'vertical' }} />
                </div>
                <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                  <button type="button" className="btn" onClick={() => setShowFollowupForm(false)}>Cancel</button>
                  <button type="submit" className="btn btn-primary">Queue Follow-up</button>
                </div>
              </form>
            )}
          </Panel>

          {/* Follow-up Queue */}
          <Panel title="Follow-up Queue">
            {loadingFollowups && <p style={{ color: 'var(--muted)' }}>Loading…</p>}
            {!loadingFollowups && followups.length === 0 && <p style={{ color: 'var(--muted)', fontSize: 13 }}>No follow-ups queued yet.</p>}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {followups.map(fu => (
                <div key={fu.id} style={{ padding: '12px 14px', background: 'var(--surface-soft)', borderRadius: 10, border: '1px solid var(--line)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
                    <div>
                      <span style={{ fontWeight: 700 }}>{fu.estimateNumber}</span>
                      <span style={{ fontSize: 12, color: 'var(--muted)', marginLeft: 8 }}>{fu.customerName}</span>
                    </div>
                    <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                      <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 10, background: fu.status === 'Sent' ? '#4caf5022' : '#2196f322', color: fu.status === 'Sent' ? '#4caf50' : '#2196f3' }}>{CHANNEL_EMOJI[fu.channel]} {fu.status}</span>
                    </div>
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 8, lineHeight: 1.5 }}>{fu.message.slice(0, 120)}{fu.message.length > 120 ? '…' : ''}</div>
                  <div style={{ display: 'flex', gap: 6 }}>
                    {fu.status !== 'Sent' && <button className="btn" style={{ fontSize: 11, padding: '4px 10px', background: 'rgba(76,175,80,0.1)', color: '#4caf50', border: '1px solid #4caf5044' }} onClick={() => handleMarkSent(fu)}>✓ Mark Sent</button>}
                    <button className="btn" style={{ fontSize: 11, padding: '4px 10px', color: 'var(--danger)' }} onClick={() => handleDeleteFollowup(fu)}>Delete</button>
                  </div>
                </div>
              ))}
            </div>
          </Panel>
        </div>
      )}

      {/* ── REACTIVATION CAMPAIGNS ── */}
      {tab === 'campaigns' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.2fr', gap: 16, alignItems: 'start' }}>
          <Panel title="📣 Campaigns" hint="Customer reactivation, service reminders, follow-ups">
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
              <button className="btn btn-primary" onClick={() => { setShowCampaignForm(v => !v); setEditingCampaignId(null); setCampForm({ name: '', type: 'Reactivation', subject: '', messageTemplate: '', targetDaysSinceService: 180, channel: 'Email', status: 'Draft' }); }}>+ New Campaign</button>
            </div>

            {showCampaignForm && (
              <form onSubmit={handleSaveCampaign} style={{ background: 'var(--surface-soft)', border: '1px solid var(--line)', borderRadius: 10, padding: 16, marginBottom: 14 }}>
                <h3 style={{ margin: '0 0 12px', fontSize: 15 }}>{editingCampaignId ? 'Edit Campaign' : 'New Campaign'}</h3>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
                  <div className="login-field" style={{ gridColumn: '1 / -1' }}>
                    <label>Campaign Name</label>
                    <input value={campForm.name} onChange={e => setCampForm(f => ({ ...f, name: e.target.value }))} required />
                  </div>
                  <div className="login-field">
                    <label>Type</label>
                    <select value={campForm.type} onChange={e => setCampForm(f => ({ ...f, type: e.target.value }))}
                      style={{ border: '1px solid var(--line)', borderRadius: 8, padding: '10px 12px', background: 'var(--surface)', color: 'var(--text)' }}>
                      {CAMPAIGN_TYPES.map(t => <option key={t}>{t}</option>)}
                    </select>
                  </div>
                  <div className="login-field">
                    <label>Channel</label>
                    <select value={campForm.channel} onChange={e => setCampForm(f => ({ ...f, channel: e.target.value }))}
                      style={{ border: '1px solid var(--line)', borderRadius: 8, padding: '10px 12px', background: 'var(--surface)', color: 'var(--text)' }}>
                      {CAMPAIGN_CHANNELS.map(c => <option key={c}>{c}</option>)}
                    </select>
                  </div>
                  <div className="login-field" style={{ gridColumn: '1 / -1' }}>
                    <label>Subject (Email)</label>
                    <input value={campForm.subject} onChange={e => setCampForm(f => ({ ...f, subject: e.target.value }))} placeholder="e.g. You're due for service, {customer}!" />
                  </div>
                  <div className="login-field">
                    <label>Trigger: Days since last service</label>
                    <input type="number" value={campForm.targetDaysSinceService} onChange={e => setCampForm(f => ({ ...f, targetDaysSinceService: Number(e.target.value) }))} min={1} />
                  </div>
                  <div className="login-field">
                    <label>Status</label>
                    <select value={campForm.status} onChange={e => setCampForm(f => ({ ...f, status: e.target.value }))}
                      style={{ border: '1px solid var(--line)', borderRadius: 8, padding: '10px 12px', background: 'var(--surface)', color: 'var(--text)' }}>
                      <option>Draft</option><option>Active</option><option>Paused</option>
                    </select>
                  </div>
                  <div className="login-field" style={{ gridColumn: '1 / -1' }}>
                    <label>Message Template</label>
                    <textarea value={campForm.messageTemplate} onChange={e => setCampForm(f => ({ ...f, messageTemplate: e.target.value }))} rows={5} required
                      placeholder="Use {customer}, {vehicle}, {shop_name}, {shop_phone} as variables"
                      style={{ border: '1px solid var(--line)', borderRadius: 8, padding: '10px 12px', background: 'var(--surface)', color: 'var(--text)', fontSize: 13, width: '100%', resize: 'vertical' }} />
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                  <button type="button" className="btn" onClick={() => { setShowCampaignForm(false); setEditingCampaignId(null); }}>Cancel</button>
                  <button type="submit" className="btn btn-primary">{editingCampaignId ? 'Save Changes' : 'Create Campaign'}</button>
                </div>
              </form>
            )}

            {loadingCampaigns && <p style={{ color: 'var(--muted)' }}>Loading…</p>}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {campaigns.map(c => (
                <div key={c.id} style={{ padding: '12px 14px', background: 'var(--surface-soft)', borderRadius: 10, border: `1px solid ${c.status === 'Active' ? '#4caf5044' : 'var(--line)'}` }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 4 }}>
                    <div>
                      <strong style={{ fontSize: 14 }}>{c.name}</strong>
                      <span style={{ fontSize: 11, color: 'var(--muted)', marginLeft: 8 }}>{c.type} · {CHANNEL_EMOJI[c.channel]} {c.channel}</span>
                    </div>
                    <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 10, background: c.status === 'Active' ? '#4caf5022' : c.status === 'Paused' ? '#ff980022' : '#88888822', color: c.status === 'Active' ? '#4caf50' : c.status === 'Paused' ? '#ff9800' : '#888' }}>{c.status}</span>
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 6 }}>Triggers after {c.targetDaysSinceService} days · {c.sentCount} sent</div>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button className="btn" style={{ fontSize: 11, padding: '4px 10px' }} onClick={() => { setCampForm({ name: c.name, type: c.type, subject: c.subject, messageTemplate: c.messageTemplate, targetDaysSinceService: c.targetDaysSinceService, channel: c.channel, status: c.status }); setEditingCampaignId(c.id); setShowCampaignForm(true); }}>✏️</button>
                    <button className="btn" style={{ fontSize: 11, padding: '4px 10px', background: c.status === 'Active' ? 'rgba(255,152,0,0.1)' : 'rgba(76,175,80,0.1)', color: c.status === 'Active' ? '#ff9800' : '#4caf50', border: `1px solid ${c.status === 'Active' ? '#ff980044' : '#4caf5044'}` }} onClick={() => handleActivateCampaign(c)}>{c.status === 'Active' ? '⏸ Pause' : '▶ Activate'}</button>
                    <button className="btn" style={{ fontSize: 11, padding: '4px 10px', color: 'var(--danger)' }} onClick={() => handleDeleteCampaign(c)}>Delete</button>
                  </div>
                </div>
              ))}
              {!loadingCampaigns && campaigns.length === 0 && <p style={{ color: 'var(--muted)', fontSize: 13 }}>No campaigns yet.</p>}
            </div>
          </Panel>

          {/* Templates */}
          <Panel title="📋 Quick Templates" hint="One click to load a pre-written campaign">
            <p style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 14 }}>Click a template to pre-fill the campaign form. Variables: <code>&#123;customer&#125;</code> <code>&#123;vehicle&#125;</code> <code>&#123;shop_name&#125;</code> <code>&#123;shop_phone&#125;</code></p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {REACTIVATION_TEMPLATES.map(t => (
                <div key={t.name} style={{ padding: '12px 14px', background: 'var(--surface-soft)', borderRadius: 10, border: '1px solid var(--line)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
                    <div>
                      <strong style={{ fontSize: 13 }}>{t.name}</strong>
                      <span style={{ fontSize: 11, color: 'var(--muted)', marginLeft: 8 }}>{t.type}</span>
                    </div>
                    <button className="btn btn-primary" style={{ fontSize: 11, padding: '4px 12px' }}
                      onClick={() => { loadTemplate(t); setShowCampaignForm(true); setEditingCampaignId(null); }}>
                      Use Template
                    </button>
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--muted)', fontStyle: 'italic' }}>{t.subject}</div>
                  <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4, whiteSpace: 'pre-line', maxHeight: 60, overflow: 'hidden' }}>{t.template.slice(0, 120)}…</div>
                </div>
              ))}
            </div>
          </Panel>
        </div>
      )}

      {/* ── AI RECEPTIONIST ── */}
      {tab === 'receptionist' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, alignItems: 'start' }}>
          <Panel title="🤖 AI Receptionist Intake" hint="Collect customer info and auto-generate a welcome message + job card">
            <p style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 16 }}>Fill in the customer details below. The AI Receptionist will generate a confirmation message and create a job card automatically.</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div className="login-field">
                  <label>Customer Name *</label>
                  <input value={intakeForm.customerName} onChange={e => setIntakeForm(f => ({ ...f, customerName: e.target.value }))} required />
                </div>
                <div className="login-field">
                  <label>Phone</label>
                  <input type="tel" value={intakeForm.phone} onChange={e => setIntakeForm(f => ({ ...f, phone: e.target.value }))} />
                </div>
                <div className="login-field">
                  <label>Email</label>
                  <input type="email" value={intakeForm.email} onChange={e => setIntakeForm(f => ({ ...f, email: e.target.value }))} />
                </div>
                <div className="login-field">
                  <label>Vehicle *</label>
                  <input value={intakeForm.vehicle} onChange={e => setIntakeForm(f => ({ ...f, vehicle: e.target.value }))} placeholder="2020 Toyota Camry" required />
                </div>
              </div>
              <div className="login-field">
                <label>Complaint / Service Requested</label>
                <textarea value={intakeForm.complaint} onChange={e => setIntakeForm(f => ({ ...f, complaint: e.target.value }))} rows={2}
                  placeholder="e.g. Check engine light on, oil change, brakes squeaking…"
                  style={{ border: '1px solid var(--line)', borderRadius: 8, padding: '10px 12px', background: 'var(--surface)', color: 'var(--text)', fontSize: 13, width: '100%', resize: 'vertical' }} />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div className="login-field">
                  <label>Preferred Date / Time</label>
                  <input value={intakeForm.preferredDate} onChange={e => setIntakeForm(f => ({ ...f, preferredDate: e.target.value }))} placeholder="Mon 9am, or 12/15" />
                </div>
                <div className="login-field">
                  <label>Send Response Via</label>
                  <select value={intakeForm.channel} onChange={e => setIntakeForm(f => ({ ...f, channel: e.target.value }))}
                    style={{ border: '1px solid var(--line)', borderRadius: 8, padding: '10px 12px', background: 'var(--surface)', color: 'var(--text)' }}>
                    <option>SMS</option><option>Email</option><option>Both</option>
                  </select>
                </div>
              </div>
              <button type="button" className="btn btn-primary" onClick={generateReceptionistMessage} style={{ marginTop: 4 }}>
                ✨ Generate Welcome Message
              </button>
            </div>
          </Panel>

          <Panel title="📨 Generated Message + Actions" hint="Review, copy, or create a job card">
            {!generatedMessage ? (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '40px 20px', color: 'var(--muted)', gap: 10 }}>
                <div style={{ fontSize: 36 }}>🤖</div>
                <p style={{ fontSize: 14, textAlign: 'center', margin: 0 }}>Fill in the intake form and click "Generate Welcome Message"</p>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div style={{ background: 'var(--surface-soft)', border: '1px solid var(--line)', borderRadius: 10, padding: 16 }}>
                  <div className="section-label" style={{ marginBottom: 8 }}>Preview ({intakeForm.channel})</div>
                  <pre style={{ fontSize: 13, lineHeight: 1.7, whiteSpace: 'pre-wrap', margin: 0 }}>{generatedMessage}</pre>
                </div>
                <textarea value={generatedMessage} onChange={e => setGeneratedMessage(e.target.value)} rows={8}
                  style={{ border: '1px solid var(--line)', borderRadius: 8, padding: '10px 12px', background: 'var(--surface)', color: 'var(--text)', fontSize: 13, resize: 'vertical' }} />
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <button className="btn" onClick={() => { navigator.clipboard.writeText(generatedMessage); notify('Copied to clipboard!'); }}>📋 Copy</button>
                  <button className="btn btn-primary" onClick={handleCreateJobFromIntake} disabled={intakeSaving}>{intakeSaving ? 'Creating…' : '⚡ Create Job Card'}</button>
                  <button className="btn" style={{ color: 'var(--muted)' }} onClick={() => setGeneratedMessage('')}>✕ Clear</button>
                </div>
                <div style={{ fontSize: 12, color: 'var(--muted)', padding: '8px 12px', background: 'var(--surface-soft)', borderRadius: 8 }}>
                  💡 After creating the job card, copy the message and send it via your preferred channel (SMS app, email client, etc.)
                </div>
              </div>
            )}
          </Panel>
        </div>
      )}
    </>
  );
}
