'use client';

import { useEffect, useState, useCallback } from 'react';
import { Panel } from '@/components/Panel';
import {
  listRepairCases,
  fetchRepairCaseWithDetails,
  updateVerificationStatus,
  type RepairCase,
  type RepairCaseWithDetails,
  VERIFICATION_LABELS,
  VERIFICATION_NEXT,
  VERIFICATION_COLORS,
} from '@/services/repairCaseService';
import { useShop } from '@/lib/useShop';

const fmt = (d?: string) => d ? new Date(d).toLocaleDateString() : '—';

// ─── Completeness Score ───────────────────────────────────────────────────────

function completenessScore(rc: RepairCaseWithDetails): number {
  const checks = [
    !!rc.complaint,
    !!rc.finalFix,
    (rc.symptoms?.length ?? 0) > 0,
    (rc.dtcs?.length ?? 0) > 0,
    (rc.tests?.length ?? 0) > 0,
    (rc.parts?.length ?? 0) > 0,
    (rc.outcomes?.length ?? 0) > 0,
    !!rc.lessonLearned,
    rc.confidenceScore != null,
  ];
  const filled = checks.filter(Boolean).length;
  return Math.round((filled / checks.length) * 100);
}

function scoreColor(pct: number): string {
  if (pct >= 80) return '#4caf50';
  if (pct >= 50) return '#ff9800';
  return '#f44336';
}

// ─── Verification Badge ───────────────────────────────────────────────────────

function VerificationBadge({ status }: { status: string }) {
  const color = VERIFICATION_COLORS[status as keyof typeof VERIFICATION_COLORS] ?? '#9e9e9e';
  const label = VERIFICATION_LABELS[status as keyof typeof VERIFICATION_LABELS] ?? status;
  return (
    <span style={{ display: 'inline-block', padding: '2px 8px', borderRadius: 12, fontSize: 11, fontWeight: 700, background: `${color}22`, color, border: `1px solid ${color}44` }}>
      {label}
    </span>
  );
}

// ─── Completeness Badge ───────────────────────────────────────────────────────

function CompletenessBadge({ pct }: { pct: number }) {
  const color = scoreColor(pct);
  return (
    <span style={{ display: 'inline-block', padding: '2px 8px', borderRadius: 12, fontSize: 11, fontWeight: 700, background: `${color}22`, color, border: `1px solid ${color}44` }}>
      {pct}% complete
    </span>
  );
}

// ─── Score for list (partial type) ───────────────────────────────────────────

function listScore(rc: RepairCase): number {
  const checks = [!!rc.complaint, !!rc.finalFix, !!rc.lessonLearned, rc.confidenceScore != null];
  return Math.round((checks.filter(Boolean).length / checks.length) * 100);
}

// ─── Repair Timeline ──────────────────────────────────────────────────────────

function RepairTimeline({ rc }: { rc: RepairCase }) {
  const steps = [
    { label: 'Vehicle Arrived', done: true },
    { label: 'Inspection', done: true },
    { label: 'Estimate', done: true },
    { label: 'Approval', done: true },
    { label: 'Repair', done: !!rc.finalFix },
    { label: 'Invoice', done: rc.verificationStatus !== 'pending' || !!rc.lessonLearned },
    { label: 'Repair Intelligence Created', done: true },
  ];
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 0, overflowX: 'auto', paddingBottom: 4 }}>
      {steps.map((step, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center' }}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, minWidth: 80 }}>
            <div style={{
              width: 28, height: 28, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: step.done ? '#4caf50' : 'var(--bg-tertiary)',
              border: `2px solid ${step.done ? '#4caf50' : 'var(--border)'}`,
              color: step.done ? '#fff' : 'var(--text-muted)',
              fontSize: 13, fontWeight: 700,
            }}>
              {step.done ? '✓' : i + 1}
            </div>
            <span style={{ fontSize: 10, color: step.done ? 'var(--text-primary)' : 'var(--text-muted)', textAlign: 'center', lineHeight: 1.2 }}>{step.label}</span>
          </div>
          {i < steps.length - 1 && (
            <div style={{ width: 32, height: 2, background: step.done ? '#4caf50' : 'var(--border)', flexShrink: 0 }} />
          )}
        </div>
      ))}
    </div>
  );
}

// ─── Owner Dashboard Widgets ──────────────────────────────────────────────────

function OwnerDashboard({ cases }: { cases: RepairCase[] }) {
  const thisMonth = new Date();
  thisMonth.setDate(1);
  const monthCases = cases.filter(c => new Date(c.createdAt) >= thisMonth);

  const verCounts: Record<string, number> = {};
  let totalConf = 0; let confCount = 0;

  cases.forEach(c => {
    verCounts[c.verificationStatus] = (verCounts[c.verificationStatus] ?? 0) + 1;
    if (c.confidenceScore != null) { totalConf += c.confidenceScore; confCount++; }
  });

  const avgConf = confCount > 0 ? Math.round(totalConf / confCount) : null;

  const widgets = [
    { label: 'Total Cases', value: cases.length },
    { label: 'This Month', value: monthCases.length },
    { label: 'Avg Confidence', value: avgConf != null ? `${avgConf}%` : '—' },
    { label: 'Gold Verified', value: verCounts['gold_verified'] ?? 0 },
    { label: 'Tech Verified', value: verCounts['tech_verified'] ?? 0 },
    { label: 'Pending', value: verCounts['pending'] ?? 0 },
  ];

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 12, marginBottom: 20 }}>
      {widgets.map(w => (
        <div key={w.label} style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 10, padding: '14px 16px' }}>
          <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--text-primary)' }}>{w.value}</div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>{w.label}</div>
        </div>
      ))}
    </div>
  );
}

// ─── Case Detail Panel ────────────────────────────────────────────────────────

function CaseDetail({
  rc,
  onVerify,
  onClose,
}: {
  rc: RepairCaseWithDetails;
  onVerify: (status: string) => void;
  onClose: () => void;
}) {
  const pct = completenessScore(rc);
  const nextStatus = VERIFICATION_NEXT[rc.verificationStatus];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 4 }}>
            <VerificationBadge status={rc.verificationStatus} />
            <CompletenessBadge pct={pct} />
          </div>
          <h3 style={{ margin: 0, fontSize: 16 }}>
            {rc.year} {rc.make} {rc.model}
          </h3>
          {rc.vin && <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>VIN: {rc.vin}</div>}
        </div>
        <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: 20 }}>×</button>
      </div>

      {/* Verification workflow */}
      {nextStatus && (
        <div style={{ background: 'var(--bg-tertiary)', border: '1px solid var(--border)', borderRadius: 8, padding: '12px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: 13 }}>Advance verification to: <strong>{VERIFICATION_LABELS[nextStatus]}</strong></span>
          <button
            onClick={() => onVerify(nextStatus)}
            style={{ background: VERIFICATION_COLORS[nextStatus], color: '#fff', border: 'none', borderRadius: 6, padding: '6px 14px', cursor: 'pointer', fontWeight: 600, fontSize: 13 }}
          >
            Mark {VERIFICATION_LABELS[nextStatus]}
          </button>
        </div>
      )}
      {!nextStatus && (
        <div style={{ background: '#4caf5011', border: '1px solid #4caf5044', borderRadius: 8, padding: '10px 14px', fontSize: 13, color: '#4caf50', fontWeight: 600 }}>
          Gold Verified ⭐ — Highest trust level
        </div>
      )}

      {/* Timeline */}
      <section>
        <SectionTitle>Repair Timeline</SectionTitle>
        <RepairTimeline rc={rc} />
      </section>

      {/* Vehicle */}
      <section>
        <SectionTitle>Vehicle</SectionTitle>
        <Grid2>
          <KV k="Engine" v={rc.engine} />
          <KV k="Transmission" v={rc.transmission} />
          <KV k="Mileage" v={rc.mileage != null ? `${rc.mileage.toLocaleString()} mi` : undefined} />
          <KV k="RO Number" v={rc.roNumber} />
          <KV k="Created" v={fmt(rc.createdAt)} />
          <KV k="Labor Hours" v={rc.laborHours != null ? `${rc.laborHours}h` : undefined} />
        </Grid2>
      </section>

      {/* Complaint */}
      {rc.complaint && (
        <section>
          <SectionTitle>Customer Complaint</SectionTitle>
          <p style={{ margin: 0, fontSize: 14, lineHeight: 1.6 }}>{rc.complaint}</p>
        </section>
      )}

      {/* Symptoms */}
      {rc.symptoms?.length > 0 && (
        <section>
          <SectionTitle>Symptoms</SectionTitle>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {rc.symptoms.map(s => (
              <span key={s.id} style={{ padding: '3px 10px', background: 'var(--bg-tertiary)', border: '1px solid var(--border)', borderRadius: 12, fontSize: 13 }}>{s.symptom}</span>
            ))}
          </div>
        </section>
      )}

      {/* DTCs */}
      {rc.dtcs?.length > 0 && (
        <section>
          <SectionTitle>DTCs</SectionTitle>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {rc.dtcs.map(d => (
              <span key={d.id} style={{ padding: '3px 10px', background: 'rgba(33,150,243,0.1)', border: '1px solid rgba(33,150,243,0.3)', borderRadius: 12, fontSize: 13, fontFamily: 'monospace', color: '#2196f3' }}>{d.code}</span>
            ))}
          </div>
        </section>
      )}

      {/* Tests */}
      {rc.tests?.length > 0 && (
        <section>
          <SectionTitle>Diagnostic Tests Performed</SectionTitle>
          <ul style={{ margin: 0, paddingLeft: 18, fontSize: 14 }}>
            {rc.tests.map(t => <li key={t.id}>{t.testName}</li>)}
          </ul>
        </section>
      )}

      {/* Final Fix */}
      {rc.finalFix && (
        <section>
          <SectionTitle>Final Fix / Correction</SectionTitle>
          <p style={{ margin: 0, fontSize: 14, lineHeight: 1.6 }}>{rc.finalFix}</p>
        </section>
      )}

      {/* Parts */}
      {rc.parts?.length > 0 && (
        <section>
          <SectionTitle>Parts Replaced</SectionTitle>
          <ul style={{ margin: 0, paddingLeft: 18, fontSize: 14 }}>
            {rc.parts.map(p => <li key={p.id}>{p.partName}{p.partNumber ? ` (${p.partNumber})` : ''}</li>)}
          </ul>
        </section>
      )}

      {/* Outcome */}
      {rc.outcomes?.length > 0 && (
        <section>
          <SectionTitle>Outcome</SectionTitle>
          {rc.outcomes.map(o => (
            <div key={o.id} style={{ fontSize: 14 }}>
              <Grid2>
                <KV k="Result" v={o.outcome} />
                <KV k="Comeback" v={o.comeback ? 'Yes' : 'No'} />
                <KV k="Warranty Claim" v={o.warrantyClaim ? 'Yes' : 'No'} />
                <KV k="Confidence" v={rc.confidenceScore != null ? `${rc.confidenceScore}%` : undefined} />
              </Grid2>
            </div>
          ))}
        </section>
      )}

      {/* Lesson Learned */}
      {rc.lessonLearned && (
        <section>
          <SectionTitle>Lesson Learned</SectionTitle>
          <p style={{ margin: 0, fontSize: 14, lineHeight: 1.7, background: 'var(--bg-tertiary)', border: '1px solid var(--border)', borderRadius: 8, padding: '12px 14px' }}>
            {rc.lessonLearned}
          </p>
        </section>
      )}
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h4 style={{ margin: '0 0 8px', fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-muted)' }}>{children}</h4>;
}
function Grid2({ children }: { children: React.ReactNode }) {
  return <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px 16px' }}>{children}</div>;
}
function KV({ k, v }: { k: string; v?: string | number | null }) {
  if (!v && v !== 0) return null;
  return (
    <div style={{ fontSize: 13 }}>
      <span style={{ color: 'var(--text-muted)', marginRight: 4 }}>{k}:</span>
      <span>{v}</span>
    </div>
  );
}

// ─── Main View ────────────────────────────────────────────────────────────────

export function RepairIntelligenceView() {
  const { role } = useShop();
  const [cases, setCases] = useState<RepairCase[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [toast, setToast] = useState('');
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<RepairCaseWithDetails | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  function notify(msg: string) { setToast(msg); setTimeout(() => setToast(''), 3000); }

  useEffect(() => {
    void listRepairCases()
      .then(setCases)
      .catch(e => setError(e instanceof Error ? e.message : 'Failed to load repair cases'))
      .finally(() => setLoading(false));
  }, []);

  const loadDetail = useCallback(async (id: string) => {
    setDetailLoading(true);
    try {
      const d = await fetchRepairCaseWithDetails(id);
      setDetail(d);
    } finally {
      setDetailLoading(false);
    }
  }, []);

  useEffect(() => {
    if (selectedId) void loadDetail(selectedId);
    else setDetail(null);
  }, [selectedId, loadDetail]);

  const q = search.trim().toLowerCase();
  const filtered = q
    ? cases.filter(c =>
        [c.vin, c.complaint, c.finalFix, c.lessonLearned, c.engine, c.make, c.model, c.year, c.roNumber]
          .some(f => f?.toLowerCase().includes(q))
      )
    : cases;

  async function handleVerify(id: string, status: string) {
    try {
      const updated = await updateVerificationStatus(id, status as Parameters<typeof updateVerificationStatus>[1]);
      setCases(prev => prev.map(c => c.id === id ? { ...c, verificationStatus: updated.verificationStatus } : c));
      if (detail && detail.id === id) setDetail({ ...detail, verificationStatus: updated.verificationStatus });
      notify(`Verification updated to: ${VERIFICATION_LABELS[updated.verificationStatus]}`);
    } catch (e) {
      notify('Failed to update verification.');
    }
  }

  return (
    <Panel title="Repair Intelligence">
      {toast && (
        <div style={{ position: 'fixed', bottom: 24, right: 24, background: 'var(--accent)', color: '#fff', padding: '10px 18px', borderRadius: 8, zIndex: 999, fontSize: 14, fontWeight: 600 }}>
          {toast}
        </div>
      )}

      {/* Owner widgets */}
      {role === 'owner' && cases.length > 0 && <OwnerDashboard cases={cases} />}


      {/* Search */}
      <div style={{ marginBottom: 16 }}>
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search by VIN, complaint, repair, DTC, engine, symptoms…"
          style={{ width: '100%', padding: '10px 14px', border: '1px solid var(--border)', borderRadius: 8, background: 'var(--bg-secondary)', color: 'var(--text-primary)', fontSize: 14, boxSizing: 'border-box' }}
        />
      </div>

      {loading && <p style={{ color: 'var(--text-muted)' }}>Loading…</p>}
      {error && <p style={{ color: 'var(--danger)' }}>{error}</p>}

      {!loading && !error && (
        <div style={{ display: 'grid', gridTemplateColumns: selectedId ? '340px 1fr' : '1fr', gap: 20 }}>
          {/* List */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {filtered.length === 0 && (
              <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)', fontSize: 14 }}>
                {search ? 'No cases match your search.' : 'No repair intelligence cases yet. Complete a repair order to create your first case.'}
              </div>
            )}
            {filtered.map(rc => {
              const pct = listScore(rc);
              const isSelected = rc.id === selectedId;
              return (
                <div
                  key={rc.id}
                  onClick={() => setSelectedId(isSelected ? null : rc.id)}
                  style={{
                    padding: '14px 16px', borderRadius: 10, cursor: 'pointer',
                    border: `1px solid ${isSelected ? 'var(--accent)' : 'var(--border)'}`,
                    background: isSelected ? 'var(--accent-bg)' : 'var(--bg-secondary)',
                    transition: 'border-color 0.15s',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
                    <div style={{ fontWeight: 600, fontSize: 14 }}>
                      {[rc.year, rc.make, rc.model].filter(Boolean).join(' ') || 'Unknown Vehicle'}
                    </div>
                    <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                      <CompletenessBadge pct={pct} />
                      <VerificationBadge status={rc.verificationStatus} />
                    </div>
                  </div>
                  {rc.complaint && (
                    <div style={{ fontSize: 13, color: 'var(--text-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '90%' }}>
                      {rc.complaint}
                    </div>
                  )}
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>
                    {fmt(rc.createdAt)}{rc.vin ? ` · ${rc.vin}` : ''}{rc.roNumber ? ` · RO #${rc.roNumber}` : ''}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Detail pane */}
          {selectedId && (
            <div style={{ border: '1px solid var(--border)', borderRadius: 12, padding: '20px 24px', background: 'var(--bg-secondary)', overflowY: 'auto', maxHeight: '80vh' }}>
              {detailLoading && <p style={{ color: 'var(--text-muted)' }}>Loading details…</p>}
              {!detailLoading && detail && (
                <CaseDetail
                  rc={detail}
                  onVerify={(status) => { void handleVerify(detail.id, status); }}
                  onClose={() => setSelectedId(null)}
                />
              )}
            </div>
          )}
        </div>
      )}
    </Panel>
  );
}
