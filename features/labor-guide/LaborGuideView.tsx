'use client';

import { useEffect, useState, useCallback } from 'react';
import { useShop } from '@/lib/useShop';
import { Panel } from '@/components/Panel';
import { StatCard } from '@/components/StatCard';

interface GuideEntry {
  id: string;
  make: string;
  model: string;
  year: number | null;
  job_description_raw: string;
  job_description_slug: string;
  suggested_hours: number;
  flat_rate_cost: number;
  labor_rate: number;
  times_performed: number;
  source: string;
  created_at: string;
  updated_at: string;
}

export function LaborGuideView() {
  const { role } = useShop();
  const [entries, setEntries] = useState<GuideEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({ suggestedHours: '', laborRate: '', jobDescriptionRaw: '' });
  const [toast, setToast] = useState('');
  const [saving, setSaving] = useState(false);

  if (role !== 'owner') return (
    <div style={{ padding: 40, textAlign: 'center', color: 'var(--muted)' }}>
      🔒 Owner access only
    </div>
  );

  const notify = (msg: string) => { setToast(msg); setTimeout(() => setToast(''), 3000); };

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/labor-guide${search ? `?q=${encodeURIComponent(search)}` : ''}`);
      const json = await res.json();
      setEntries(json.data ?? []);
    } finally { setLoading(false); }
  }, [search]);

  useEffect(() => { load(); }, [load]);

  function openEdit(e: GuideEntry) {
    setEditing(e.id);
    setEditForm({
      suggestedHours: String(e.suggested_hours),
      laborRate: String(e.labor_rate),
      jobDescriptionRaw: e.job_description_raw,
    });
  }

  async function handleSave(id: string) {
    setSaving(true);
    try {
      const res = await fetch('/api/labor-guide', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id,
          suggestedHours: parseFloat(editForm.suggestedHours),
          laborRate: parseFloat(editForm.laborRate),
          jobDescriptionRaw: editForm.jobDescriptionRaw,
        }),
      });
      if (!res.ok) throw new Error('Save failed');
      notify('Updated successfully');
      setEditing(null);
      load();
    } catch { notify('Save failed'); }
    finally { setSaving(false); }
  }

  async function handleDelete(id: string, label: string) {
    if (!confirm(`Delete "${label}"? This cannot be undone.`)) return;
    const res = await fetch('/api/labor-guide', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    });
    if (res.ok) { notify('Deleted'); load(); }
  }

  const totalJobs = entries.reduce((s, e) => s + e.times_performed, 0);
  const avgHours = entries.length ? (entries.reduce((s, e) => s + Number(e.suggested_hours), 0) / entries.length).toFixed(1) : '—';

  return (
    <>
      {toast && <div className="toast toast-visible">{toast}</div>}

      <div className="grid cols-4" style={{ marginBottom: 16 }}>
        <StatCard label="Unique operations" value={entries.length} subtext="In your guide" />
        <StatCard label="Total jobs recorded" value={totalJobs} subtext="Times performed" />
        <StatCard label="Avg standard hours" value={avgHours} subtext="Across all operations" />
        <StatCard label="Access" value="Owner Only" subtext="Confidential" />
      </div>

      <Panel
        title="🔒 Historical Labor Rate Guide"
        hint="Self-builds as you close repair orders. Edit or delete any entry to correct mistakes."
      >
        <div style={{ display: 'flex', gap: 10, marginBottom: 14 }}>
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search by job, make, model…"
            className="search"
            style={{ flex: 1 }}
          />
          <button className="btn" onClick={load}>Refresh</button>
        </div>

        {loading && <p style={{ color: 'var(--muted)', fontSize: 13 }}>Loading…</p>}

        {!loading && entries.length === 0 && (
          <p style={{ color: 'var(--muted)', fontSize: 13, padding: '20px 0', textAlign: 'center' }}>
            No entries yet. Close a Repair Order to start building your historical guide.
          </p>
        )}

        {!loading && entries.length > 0 && (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: '2px solid var(--line)', textAlign: 'left' }}>
                  <th style={{ padding: '8px 10px', color: 'var(--muted)', fontWeight: 600, textTransform: 'uppercase', fontSize: 11, letterSpacing: '0.06em' }}>Vehicle</th>
                  <th style={{ padding: '8px 10px', color: 'var(--muted)', fontWeight: 600, textTransform: 'uppercase', fontSize: 11, letterSpacing: '0.06em' }}>Job Description</th>
                  <th style={{ padding: '8px 10px', color: 'var(--muted)', fontWeight: 600, textTransform: 'uppercase', fontSize: 11, letterSpacing: '0.06em' }}>Std Hours</th>
                  <th style={{ padding: '8px 10px', color: 'var(--muted)', fontWeight: 600, textTransform: 'uppercase', fontSize: 11, letterSpacing: '0.06em' }}>Flat Rate</th>
                  <th style={{ padding: '8px 10px', color: 'var(--muted)', fontWeight: 600, textTransform: 'uppercase', fontSize: 11, letterSpacing: '0.06em' }}>Rate/hr</th>
                  <th style={{ padding: '8px 10px', color: 'var(--muted)', fontWeight: 600, textTransform: 'uppercase', fontSize: 11, letterSpacing: '0.06em' }}>Times</th>
                  <th style={{ padding: '8px 10px', color: 'var(--muted)', fontWeight: 600, textTransform: 'uppercase', fontSize: 11, letterSpacing: '0.06em' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {entries.map(e => (
                  <tr key={e.id} style={{ borderBottom: '1px solid var(--line)', background: editing === e.id ? 'rgba(204,0,0,0.04)' : 'transparent' }}>
                    {editing === e.id ? (
                      <>
                        <td style={{ padding: '10px 10px' }}>
                          <span style={{ fontSize: 12, color: 'var(--muted)' }}>
                            {e.year ? `${e.year} ` : ''}{e.make} {e.model}
                          </span>
                        </td>
                        <td style={{ padding: '6px 10px' }}>
                          <input
                            value={editForm.jobDescriptionRaw}
                            onChange={ev => setEditForm(f => ({ ...f, jobDescriptionRaw: ev.target.value }))}
                            style={{ width: '100%', padding: '6px 8px', border: '1px solid var(--line)', borderRadius: 6, background: 'var(--surface)', color: 'var(--text)', fontSize: 13 }}
                          />
                        </td>
                        <td style={{ padding: '6px 10px' }}>
                          <input
                            type="number"
                            value={editForm.suggestedHours}
                            onChange={ev => setEditForm(f => ({ ...f, suggestedHours: ev.target.value }))}
                            step="0.5" min="0" max="99"
                            style={{ width: 70, padding: '6px 8px', border: '1px solid var(--accent)', borderRadius: 6, background: 'var(--surface)', color: 'var(--text)', fontSize: 13, fontWeight: 700 }}
                          />
                        </td>
                        <td style={{ padding: '6px 10px', color: 'var(--muted)', fontSize: 12 }}>
                          ${(parseFloat(editForm.suggestedHours || '0') * parseFloat(editForm.laborRate || '145')).toFixed(2)}
                        </td>
                        <td style={{ padding: '6px 10px' }}>
                          <input
                            type="number"
                            value={editForm.laborRate}
                            onChange={ev => setEditForm(f => ({ ...f, laborRate: ev.target.value }))}
                            step="5" min="0"
                            style={{ width: 70, padding: '6px 8px', border: '1px solid var(--line)', borderRadius: 6, background: 'var(--surface)', color: 'var(--text)', fontSize: 13 }}
                          />
                        </td>
                        <td style={{ padding: '6px 10px', color: 'var(--muted)' }}>{e.times_performed}×</td>
                        <td style={{ padding: '6px 10px' }}>
                          <div style={{ display: 'flex', gap: 6 }}>
                            <button
                              onClick={() => handleSave(e.id)}
                              disabled={saving}
                              style={{ padding: '5px 12px', background: '#cc0000', color: '#fff', border: 'none', borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}
                            >
                              {saving ? '…' : 'Save'}
                            </button>
                            <button
                              onClick={() => setEditing(null)}
                              style={{ padding: '5px 10px', background: 'transparent', color: 'var(--muted)', border: '1px solid var(--line)', borderRadius: 6, fontSize: 12, cursor: 'pointer' }}
                            >
                              Cancel
                            </button>
                          </div>
                        </td>
                      </>
                    ) : (
                      <>
                        <td style={{ padding: '10px 10px', color: 'var(--muted)', fontSize: 12 }}>
                          {e.year ? `${e.year} ` : ''}{e.make !== '*' ? e.make : '—'} {e.model !== '*' ? e.model : ''}
                        </td>
                        <td style={{ padding: '10px 10px' }}>
                          <div style={{ fontWeight: 500 }}>{e.job_description_raw}</div>
                          <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>slug: {e.job_description_slug}</div>
                        </td>
                        <td style={{ padding: '10px 10px', fontWeight: 700, fontSize: 15 }}>{e.suggested_hours}h</td>
                        <td style={{ padding: '10px 10px', fontWeight: 600, color: '#cc0000' }}>${Number(e.flat_rate_cost).toFixed(2)}</td>
                        <td style={{ padding: '10px 10px', color: 'var(--muted)' }}>${Number(e.labor_rate)}/hr</td>
                        <td style={{ padding: '10px 10px' }}>
                          <span style={{
                            display: 'inline-block', minWidth: 28, textAlign: 'center',
                            padding: '2px 8px', borderRadius: 20,
                            background: e.times_performed >= 3 ? 'rgba(76,175,80,0.15)' : 'rgba(255,152,0,0.12)',
                            color: e.times_performed >= 3 ? '#4caf50' : '#ff9800',
                            fontWeight: 700, fontSize: 12,
                          }}>
                            {e.times_performed}×
                          </span>
                        </td>
                        <td style={{ padding: '10px 10px' }}>
                          <div style={{ display: 'flex', gap: 6 }}>
                            <button
                              onClick={() => openEdit(e)}
                              style={{ padding: '5px 10px', background: 'rgba(33,150,243,0.1)', color: '#2196f3', border: '1px solid #2196f344', borderRadius: 6, fontSize: 12, cursor: 'pointer' }}
                            >
                              Edit
                            </button>
                            <button
                              onClick={() => handleDelete(e.id, e.job_description_raw)}
                              style={{ padding: '5px 10px', background: 'rgba(244,67,54,0.08)', color: '#f44336', border: '1px solid #f4433622', borderRadius: 6, fontSize: 12, cursor: 'pointer' }}
                            >
                              Delete
                            </button>
                          </div>
                        </td>
                      </>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </>
  );
}
