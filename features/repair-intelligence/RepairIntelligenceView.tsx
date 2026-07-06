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
import {
  getGraphStatus,
  findSimilarRepairCases,
  getLessonsByRepairCase,
  computeComebackRisk,
  type GraphStatus,
  type SimilarRepairMatch,
  type AutomotiveGraphLesson,
  type TechnicianLearningSignal,
} from '@/services/knowledgeGraphService';
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

function CompletenessBadge({ pct }: { pct: number }) {
  const color = scoreColor(pct);
  return (
    <span style={{ display: 'inline-block', padding: '2px 8px', borderRadius: 12, fontSize: 11, fontWeight: 700, background: `${color}22`, color, border: `1px solid ${color}44` }}>
      {pct}% complete
    </span>
  );
}

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
              background: step.done ? '#4caf50' : 'var(--surface-soft)',
              border: `2px solid ${step.done ? '#4caf50' : 'var(--line)'}`,
              color: step.done ? '#fff' : 'var(--muted)',
              fontSize: 13, fontWeight: 700,
            }}>
              {step.done ? '✓' : i + 1}
            </div>
            <span style={{ fontSize: 10, color: step.done ? 'var(--text)' : 'var(--muted)', textAlign: 'center', lineHeight: 1.2 }}>{step.label}</span>
          </div>
          {i < steps.length - 1 && (
            <div style={{ width: 32, height: 2, background: step.done ? '#4caf50' : 'var(--line)', flexShrink: 0 }} />
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
        <div key={w.label} style={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 10, padding: '14px 16px' }}>
          <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--text)' }}>{w.value}</div>
          <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>{w.label}</div>
        </div>
      ))}
    </div>
  );
}

// ─── Graph Status Widget ──────────────────────────────────────────────────────

function GraphStatusWidget({ status, error }: { status: GraphStatus | null; error: string }) {
  if (error && (error.includes('42P01') || error.includes('does not exist'))) {
    return (
      <div style={{ background: '#ff980011', border: '1px solid #ff980044', borderRadius: 10, padding: '12px 16px', marginBottom: 20, fontSize: 13, color: '#ff9800' }}>
        Knowledge Graph tables not yet active. Run <code>automotive_knowledge_graph_sprint5_patch.sql</code> in Supabase SQL Editor.
      </div>
    );
  }

  const health = status
    ? (status.nodeCount === 0 ? 'Empty' : status.nodeCount < 20 ? 'Building' : 'Healthy')
    : null;

  const healthColor = health === 'Healthy' ? '#4caf50' : health === 'Building' ? '#ff9800' : '#9e9e9e';

  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 10, padding: '12px 16px', marginBottom: 20 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <span style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--muted)' }}>Knowledge Graph</span>
        {health && (
          <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 12, background: `${healthColor}22`, color: healthColor, border: `1px solid ${healthColor}44` }}>
            {health}
          </span>
        )}
      </div>
      {status ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(100px, 1fr))', gap: 8 }}>
          {[
            { label: 'Nodes', value: status.nodeCount },
            { label: 'Edges', value: status.edgeCount },
            { label: 'Observations', value: status.observationCount },
            { label: 'Lessons', value: status.lessonCount },
            { label: 'Last Mapped', value: status.lastUpdated ? new Date(status.lastUpdated).toLocaleDateString() : '—' },
          ].map(w => (
            <div key={w.label}>
              <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--text)' }}>{w.value}</div>
              <div style={{ fontSize: 11, color: 'var(--muted)' }}>{w.label}</div>
            </div>
          ))}
        </div>
      ) : (
        <div style={{ fontSize: 13, color: 'var(--muted)' }}>{error || 'Loading…'}</div>
      )}
    </div>
  );
}

// ─── Intelligence Card ────────────────────────────────────────────────────────

function IntelligenceCard({
  rc,
  similarCount,
  comebackRisk,
}: {
  rc: RepairCaseWithDetails;
  similarCount: number;
  comebackRisk: string;
}) {
  const pct = completenessScore(rc);
  const riskColor = comebackRisk === 'High' ? '#f44336' : comebackRisk === 'Medium' ? '#ff9800' : comebackRisk === 'Low' ? '#4caf50' : '#9e9e9e';
  const mainDtc = rc.dtcs?.[0]?.code;
  const mainSymptom = rc.symptoms?.[0]?.symptom;

  return (
    <div style={{ background: 'var(--surface-soft)', border: '1px solid var(--line)', borderRadius: 10, padding: '14px 16px', marginBottom: 16 }}>
      <div style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--muted)', marginBottom: 10 }}>Intelligence Card</div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px 16px', fontSize: 13 }}>
        {mainDtc && <KV k="Main DTC" v={mainDtc} />}
        {mainSymptom && <KV k="Key Symptom" v={mainSymptom} />}
        {rc.finalFix && <KV k="Final Repair" v={rc.finalFix.length > 60 ? rc.finalFix.slice(0, 57) + '…' : rc.finalFix} />}
        <KV k="Confidence" v={rc.confidenceScore != null ? `${rc.confidenceScore}%` : '—'} />
        <KV k="Verification" v={VERIFICATION_LABELS[rc.verificationStatus as keyof typeof VERIFICATION_LABELS] ?? rc.verificationStatus} />
        <KV k="Completeness" v={`${pct}%`} />
        <KV k="Similar Repairs" v={`${similarCount} found`} />
        <div style={{ fontSize: 13 }}>
          <span style={{ color: 'var(--muted)', marginRight: 4 }}>Comeback Risk:</span>
          <span style={{ fontWeight: 700, color: riskColor }}>{comebackRisk}</span>
        </div>
      </div>
    </div>
  );
}

// ─── Similar Repairs Panel ────────────────────────────────────────────────────

function SimilarRepairsPanel({ matches }: { matches: SimilarRepairMatch[] }) {
  if (matches.length === 0) return null;
  return (
    <section>
      <SectionTitle>Similar Repairs ({matches.length})</SectionTitle>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {matches.map((m, i) => (
          <div key={m.repairCaseId ?? i} style={{ background: 'var(--surface-soft)', border: '1px solid var(--line)', borderRadius: 8, padding: '10px 12px', fontSize: 13 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
              <span style={{ fontWeight: 600 }}>
                {[m.year, m.make, m.model].filter(Boolean).join(' ') || 'Unknown Vehicle'}
              </span>
              <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 7px', borderRadius: 12, background: 'var(--accent-bg)', color: 'var(--accent)', border: '1px solid var(--accent)44' }}>
                {m.similarityScore}% match
              </span>
            </div>
            {m.dtcCodes[0] && <div style={{ color: '#2196f3', fontFamily: 'monospace', fontSize: 12, marginBottom: 2 }}>{m.dtcCodes[0]}</div>}
            {m.symptoms[0] && <div style={{ color: 'var(--muted)', marginBottom: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{m.symptoms[0]}</div>}
            {m.finalFix && <div style={{ color: 'var(--text)' }}>Fix: {m.finalFix.length > 80 ? m.finalFix.slice(0, 77) + '…' : m.finalFix}</div>}
            <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
              {m.confidence != null && <span style={{ fontSize: 11, color: 'var(--muted)' }}>{Math.round(m.confidence * 100)}% confidence</span>}
              {m.verificationStatus && <VerificationBadge status={m.verificationStatus} />}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

// ─── Structured Lessons Panel ─────────────────────────────────────────────────

function StructuredLessonsPanel({ lessons }: { lessons: AutomotiveGraphLesson[] }) {
  if (lessons.length === 0) return null;
  return (
    <section>
      <SectionTitle>Structured Lessons ({lessons.length})</SectionTitle>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {lessons.map(l => (
          <div key={l.id} style={{ background: 'var(--surface-soft)', border: '1px solid var(--line)', borderRadius: 8, padding: '12px 14px' }}>
            <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 8 }}>{l.title}</div>
            {l.whatWasWrong && <LessonRow label="What was wrong?" value={l.whatWasWrong} />}
            {l.whatFooledUs && <LessonRow label="What fooled us?" value={l.whatFooledUs} />}
            {l.finalFix && <LessonRow label="What finally fixed it?" value={l.finalFix} />}
            {l.checkFirstNextTime && <LessonRow label="Check first next time?" value={l.checkFirstNextTime} />}
            {l.commonMistake && <LessonRow label="Common mistake to avoid?" value={l.commonMistake} />}
            {l.recommendation && <LessonRow label="Future recommendation?" value={l.recommendation} />}
          </div>
        ))}
      </div>
    </section>
  );
}

function LessonRow({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ marginBottom: 6, fontSize: 13 }}>
      <div style={{ color: 'var(--muted)', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 2 }}>{label}</div>
      <div style={{ lineHeight: 1.5 }}>{value}</div>
    </div>
  );
}

// ─── Technician Signals Panel ─────────────────────────────────────────────────

function TechnicianSignalCard({ signal }: { signal: TechnicianLearningSignal }) {
  return (
    <div style={{ background: 'var(--surface-soft)', border: '1px solid var(--line)', borderRadius: 10, padding: '14px 16px', marginBottom: 12 }}>
      <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 8 }}>{signal.technicianName}</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(110px, 1fr))', gap: 8, marginBottom: 12 }}>
        <div><div style={{ fontSize: 18, fontWeight: 800 }}>{signal.stats.totalRepairs}</div><div style={{ fontSize: 11, color: 'var(--muted)' }}>Total Repairs</div></div>
        <div><div style={{ fontSize: 18, fontWeight: 800 }}>{Math.round(signal.stats.firstTimeFixRate * 100)}%</div><div style={{ fontSize: 11, color: 'var(--muted)' }}>First-Fix Rate</div></div>
        <div><div style={{ fontSize: 18, fontWeight: 800, color: signal.stats.comebackRate > 0.1 ? '#f44336' : 'inherit' }}>{Math.round(signal.stats.comebackRate * 100)}%</div><div style={{ fontSize: 11, color: 'var(--muted)' }}>Comeback Rate</div></div>
      </div>
      {signal.strengths.length > 0 && (
        <div style={{ marginBottom: 8 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#4caf50', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>Strengths</div>
          {signal.strengths.map((s, i) => <div key={i} style={{ fontSize: 13, color: 'var(--text)', marginBottom: 2 }}>{s.description}</div>)}
        </div>
      )}
      {signal.areasForGrowth.length > 0 && (
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#ff9800', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>Areas for Growth</div>
          {signal.areasForGrowth.map((a, i) => <div key={i} style={{ fontSize: 13, color: 'var(--text)', marginBottom: 2 }}>{a.description}</div>)}
        </div>
      )}
    </div>
  );
}

// ─── Case Detail Panel ────────────────────────────────────────────────────────

function CaseDetail({
  rc,
  onVerify,
  onClose,
  similarRepairs,
  structuredLessons,
  comebackRisk,
}: {
  rc: RepairCaseWithDetails;
  onVerify: (status: string) => void;
  onClose: () => void;
  similarRepairs: SimilarRepairMatch[];
  structuredLessons: AutomotiveGraphLesson[];
  comebackRisk: string;
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
          {rc.vin && <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>VIN: {rc.vin}</div>}
        </div>
        <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', fontSize: 20 }}>×</button>
      </div>

      {/* Intelligence Card */}
      <IntelligenceCard rc={rc} similarCount={similarRepairs.length} comebackRisk={comebackRisk} />

      {/* Verification workflow */}
      {nextStatus && (
        <div style={{ background: 'var(--surface-soft)', border: '1px solid var(--line)', borderRadius: 8, padding: '12px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
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
              <span key={s.id} style={{ padding: '3px 10px', background: 'var(--surface-soft)', border: '1px solid var(--line)', borderRadius: 12, fontSize: 13 }}>{s.symptom}</span>
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

      {/* Legacy Lesson Learned */}
      {rc.lessonLearned && (
        <section>
          <SectionTitle>Lesson Learned</SectionTitle>
          <p style={{ margin: 0, fontSize: 14, lineHeight: 1.7, background: 'var(--surface-soft)', border: '1px solid var(--line)', borderRadius: 8, padding: '12px 14px' }}>
            {rc.lessonLearned}
          </p>
        </section>
      )}

      {/* Structured Lessons from Graph */}
      <StructuredLessonsPanel lessons={structuredLessons} />

      {/* Similar Repairs */}
      <SimilarRepairsPanel matches={similarRepairs} />
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h4 style={{ margin: '0 0 8px', fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--muted)' }}>{children}</h4>;
}
function Grid2({ children }: { children: React.ReactNode }) {
  return <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px 16px' }}>{children}</div>;
}
function KV({ k, v }: { k: string; v?: string | number | null }) {
  if (!v && v !== 0) return null;
  return (
    <div style={{ fontSize: 13 }}>
      <span style={{ color: 'var(--muted)', marginRight: 4 }}>{k}:</span>
      <span>{v}</span>
    </div>
  );
}

// ─── Main View ────────────────────────────────────────────────────────────────

export function RepairIntelligenceView() {
  const { role, shopId } = useShop();
  const isOwnerOrManager = role === 'owner' || role === 'manager';

  const [cases, setCases] = useState<RepairCase[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [toast, setToast] = useState('');
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<RepairCaseWithDetails | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const [graphStatus, setGraphStatus] = useState<GraphStatus | null>(null);
  const [graphStatusError, setGraphStatusError] = useState('');
  const [similarRepairs, setSimilarRepairs] = useState<SimilarRepairMatch[]>([]);
  const [structuredLessons, setStructuredLessons] = useState<AutomotiveGraphLesson[]>([]);
  const [comebackRisk, setComebackRisk] = useState<string>('Unknown');
  const [activeTab, setActiveTab] = useState<'cases' | 'signals'>('cases');

  function notify(msg: string) { setToast(msg); setTimeout(() => setToast(''), 3000); }

  useEffect(() => {
    void listRepairCases()
      .then(setCases)
      .catch(e => {
        const msg = e instanceof Error ? e.message : (e as { message?: string })?.message ?? String(e);
        if (msg.includes('42P01') || msg.includes('does not exist')) {
          setError('Repair Intelligence database tables are not set up. Run repair_intelligence_complete.sql in your Supabase SQL Editor.');
        } else {
          setError(msg || 'Failed to load repair cases');
        }
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!isOwnerOrManager || !shopId) return;
    getGraphStatus(shopId)
      .then(setGraphStatus)
      .catch(e => {
        const msg = e instanceof Error ? e.message : (e as { message?: string })?.message ?? String(e);
        setGraphStatusError(msg);
      });
  }, [isOwnerOrManager, shopId]);

  const loadDetail = useCallback(async (id: string) => {
    setDetailLoading(true);
    setSimilarRepairs([]);
    setStructuredLessons([]);
    setComebackRisk('Unknown');
    try {
      const d = await fetchRepairCaseWithDetails(id);
      if (!d) return;
      setDetail(d);

      const dtcCodes = (d.dtcs ?? []).map(x => x.code);
      const symptoms = (d.symptoms ?? []).map(x => x.symptom);

      const [similar, lessons] = await Promise.all([
        findSimilarRepairCases({
          shopId: d.shopId,
          make: d.make ?? undefined,
          model: d.model ?? undefined,
          engine: d.engine ?? undefined,
          dtcCodes,
          symptoms,
        }),
        getLessonsByRepairCase(id, d.shopId),
      ]);

      setSimilarRepairs(similar);
      setStructuredLessons(lessons);

      const risk = await computeComebackRisk(d.shopId, similar.map(s => s.repairCaseId).filter(Boolean) as string[]);
      setComebackRisk(risk);
    } finally {
      setDetailLoading(false);
    }
  }, []);

  useEffect(() => {
    if (selectedId) void loadDetail(selectedId);
    else { setDetail(null); setSimilarRepairs([]); setStructuredLessons([]); setComebackRisk('Unknown'); }
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
    } catch {
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

      {/* Owner/Manager section: tabs for Cases vs Signals */}
      {isOwnerOrManager && (
        <>
          <GraphStatusWidget status={graphStatus} error={graphStatusError} />
          <OwnerDashboard cases={cases} />

          <div style={{ display: 'flex', gap: 8, marginBottom: 20, borderBottom: '1px solid var(--line)' }}>
            {(['cases', 'signals'] as const).map(tab => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                style={{
                  padding: '8px 18px', border: 'none', background: 'none', cursor: 'pointer',
                  fontSize: 14, fontWeight: 600,
                  color: activeTab === tab ? 'var(--accent)' : 'var(--muted)',
                  borderBottom: activeTab === tab ? '2px solid var(--accent)' : '2px solid transparent',
                  marginBottom: -1,
                }}
              >
                {tab === 'cases' ? 'Repair Cases' : 'Technician Signals'}
              </button>
            ))}
          </div>

          {activeTab === 'signals' && (
            <div style={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 12, padding: '16px 20px' }}>
              <SectionTitle>Technician Learning Signals</SectionTitle>
              <div style={{ fontSize: 13, color: 'var(--muted)', padding: '20px 0', textAlign: 'center' }}>
                Technician signals are generated per repair case.<br />
                Open a repair case to view that technician&apos;s learning profile and coaching recommendations.
              </div>
            </div>
          )}
        </>
      )}

      {/* Cases tab (or non-owner view) */}
      {(activeTab === 'cases' || !isOwnerOrManager) && (
        <>
          {/* Search */}
          <div style={{ marginBottom: 16 }}>
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search by VIN, complaint, repair, DTC, engine, symptoms…"
              style={{ width: '100%', padding: '10px 14px', border: '1px solid var(--line)', borderRadius: 8, background: 'var(--surface)', color: 'var(--text)', fontSize: 14, boxSizing: 'border-box' }}
            />
          </div>

          {loading && <p style={{ color: 'var(--muted)' }}>Loading…</p>}
          {error && <p style={{ color: 'var(--danger)' }}>{error}</p>}

          {!loading && !error && (
            <div style={{ display: 'grid', gridTemplateColumns: selectedId ? '340px 1fr' : '1fr', gap: 20 }}>
              {/* List */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {filtered.length === 0 && (
                  search
                    ? <div style={{ padding: 40, textAlign: 'center', color: 'var(--muted)', fontSize: 14 }}>No cases match your search.</div>
                    : (
                      <div style={{ padding: '40px 32px', textAlign: 'center', border: '1px dashed var(--line)', borderRadius: 12, background: 'var(--surface)' }}>
                        <div style={{ fontSize: 36, marginBottom: 12 }}>🔧</div>
                        <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 8, color: 'var(--text)' }}>No repair cases yet</div>
                        <div style={{ fontSize: 14, color: 'var(--muted)', lineHeight: 1.6 }}>
                          Complete your first repair to begin building Repair Intelligence.<br />
                          Cases are automatically created when repair orders are closed.
                        </div>
                      </div>
                    )
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
                        border: `1px solid ${isSelected ? 'var(--accent)' : 'var(--line)'}`,
                        background: isSelected ? 'var(--accent-bg)' : 'var(--surface)',
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
                        <div style={{ fontSize: 13, color: 'var(--muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '90%' }}>
                          {rc.complaint}
                        </div>
                      )}
                      <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4 }}>
                        {fmt(rc.createdAt)}{rc.vin ? ` · ${rc.vin}` : ''}{rc.roNumber ? ` · RO #${rc.roNumber}` : ''}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Detail pane */}
              {selectedId && (
                <div style={{ border: '1px solid var(--line)', borderRadius: 12, padding: '20px 24px', background: 'var(--surface)', overflowY: 'auto', maxHeight: '80vh' }}>
                  {detailLoading && <p style={{ color: 'var(--muted)' }}>Loading details…</p>}
                  {!detailLoading && detail && (
                    <CaseDetail
                      rc={detail}
                      onVerify={(status) => { void handleVerify(detail.id, status); }}
                      onClose={() => setSelectedId(null)}
                      similarRepairs={similarRepairs}
                      structuredLessons={structuredLessons}
                      comebackRisk={comebackRisk}
                    />
                  )}
                </div>
              )}
            </div>
          )}
        </>
      )}
    </Panel>
  );
}
