'use client';

// SI-7: Full Morning Brief Modal
// Owner/manager only. Read-only view. Navigation links only.

import { useAppDispatch } from '@/lib/store';

interface BriefSection {
  key: string;
  label: string;
  count?: number;
  total?: number | null;
  detail?: string | null;
  module?: string | null;
  urgency?: string;
  severity?: string;
}

interface MorningBriefData {
  id: string;
  shopId: string;
  briefDate: string;
  status: string;
  shopHealthScore: number;
  executiveScore: number;
  title: string;
  summary: string;
  recommendedFocus: string;
  generatedAt: string;
  yesterdaySummary: {
    revenueYesterday: number;
    paymentsYesterday: number;
    jobsCompleted: number;
    repairCasesCreated: number;
    invoicesCreated: number;
  };
  todayPriorities: Array<{
    rank: number;
    title: string;
    decisionScore: number;
    estimatedRevenue: number | null;
    estimatedTimeMinutes: number;
    whyItMatters: string;
    module: string | null;
  }>;
  revenueOpportunities: BriefSection[];
  cashCollection: {
    unpaidCount: number;
    unpaidTotal: number;
    overdueCount: number;
    overdueTotal: number;
    collectionUrgency: string;
  };
  operationalRisks: BriefSection[];
  technicianSummary: {
    activeCount: number;
    idleCount: number;
    totalAssigned: number;
    bottlenecks: string[];
  };
  inventorySummary: {
    lowCount: number;
    reorderUrgency: string;
  };
  metadata?: {
    sapelee_enhancement?: {
      executiveSummary: string;
      strategicAdvice: string;
      revenueFocus: string;
      riskFocus: string;
      ownerCoaching: string;
      confidence: number;
      generatedAt: string;
    };
    [key: string]: unknown;
  };
}

const D = {
  red: '#c0392b', gold: '#d97706', green: '#059669', blue: '#2563eb',
  radius: 12, radiusSm: 8,
};

function fmtMoney(v: number): string {
  return `$${v.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

function SectionHead({ icon, label }: { icon: string; label: string }) {
  return (
    <div className="section-label" style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
      <span>{icon}</span><span>{label}</span>
      <div style={{ flex: 1, height: 1, background: 'var(--line)', marginLeft: 4 }} />
    </div>
  );
}

function urgencyColor(u?: string): string {
  switch (u) {
    case 'critical': return D.red;
    case 'high':     return '#ea580c';
    case 'medium':   return D.gold;
    default:         return D.green;
  }
}

export function MorningBriefModal({
  brief,
  onClose,
  onDismiss,
}: {
  brief: MorningBriefData;
  onClose: () => void;
  onDismiss: (id: string) => void;
}) {
  const dispatch = useAppDispatch();
  function nav(module: string) {
    dispatch({ type: 'SET_MODULE', module });
    onClose();
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9999,
      background: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'flex-start',
      justifyContent: 'center', padding: '40px 16px', overflowY: 'auto',
    }} onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{
        background: 'var(--surface)', borderRadius: D.radius,
        maxWidth: 760, width: '100%', boxShadow: '0 24px 80px rgba(0,0,0,0.3)',
        overflow: 'hidden',
      }}>
        {/* Header */}
        <div style={{
          background: 'linear-gradient(135deg,#0f0f14,#1a0a0a,#2a0e0e)',
          padding: '20px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
        }}>
          <div>
            <div style={{ fontSize: 18, fontWeight: 900, color: '#fff', marginBottom: 4 }}>⚡ {brief.title}</div>
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.45)' }}>
              {brief.briefDate} · Generated {new Date(brief.generatedAt).toLocaleTimeString()}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <button onClick={() => onDismiss(brief.id)} style={{
              fontSize: 11, padding: '6px 14px', borderRadius: 999,
              border: '1px solid rgba(255,255,255,0.2)', background: 'transparent',
              color: 'rgba(255,255,255,0.6)', cursor: 'pointer',
            }}>Dismiss</button>
            <button onClick={onClose} style={{
              fontSize: 18, background: 'transparent', border: 'none',
              color: 'rgba(255,255,255,0.5)', cursor: 'pointer', lineHeight: 1, padding: '2px 4px',
            }}>×</button>
          </div>
        </div>

        <div style={{ padding: '22px 24px', display: 'flex', flexDirection: 'column', gap: 22 }}>
          {/* Scores */}
          <div style={{ display: 'flex', gap: 12 }}>
            {[
              { label: 'Shop Health', value: brief.shopHealthScore, color: brief.shopHealthScore >= 75 ? D.green : brief.shopHealthScore >= 50 ? D.gold : D.red },
              { label: 'Executive Score', value: brief.executiveScore, color: brief.executiveScore >= 75 ? D.green : brief.executiveScore >= 50 ? D.gold : D.red },
            ].map(s => (
              <div key={s.label} style={{
                flex: 1, padding: '14px 18px',
                background: `${s.color}08`, border: `1.5px solid ${s.color}30`, borderRadius: D.radiusSm,
                display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'center',
              }}>
                <div style={{ fontSize: 30, fontWeight: 900, color: s.color }}>{s.value}</div>
                <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{s.label}</div>
              </div>
            ))}
          </div>

          {/* Recommended focus */}
          <div style={{
            background: 'linear-gradient(135deg,#fff7ed,#ffedd5)', border: '1.5px solid #fdba74',
            borderLeft: `4px solid ${D.gold}`, borderRadius: D.radiusSm, padding: '14px 16px',
          }}>
            <div style={{ fontSize: 10, fontWeight: 800, color: D.gold, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 }}>⭐ Recommended Focus</div>
            <div style={{ fontSize: 13, color: 'var(--text)', lineHeight: 1.6 }}>{brief.recommendedFocus}</div>
          </div>

          {/* Yesterday */}
          <div>
            <SectionHead icon="📅" label="Yesterday's Performance" />
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(120px,1fr))', gap: 10 }}>
              {[
                { label: 'Revenue', value: fmtMoney(brief.yesterdaySummary.revenueYesterday), onClick: () => nav('payments') },
                { label: 'Jobs Completed', value: String(brief.yesterdaySummary.jobsCompleted), onClick: () => nav('job-cards') },
                { label: 'Repair Cases', value: String(brief.yesterdaySummary.repairCasesCreated), onClick: () => nav('repair-intelligence') },
              ].map(item => (
                <div key={item.label} onClick={item.onClick} style={{
                  background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: D.radiusSm,
                  padding: '12px 14px', cursor: 'pointer',
                  display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'center',
                }}>
                  <div style={{ fontSize: 18, fontWeight: 900, color: 'var(--text)' }}>{item.value}</div>
                  <div style={{ fontSize: 10, color: 'var(--muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{item.label}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Today's Top Priorities */}
          {brief.todayPriorities.length > 0 && (
            <div>
              <SectionHead icon="🎯" label="Today's Top Priorities" />
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {brief.todayPriorities.map((p) => {
                  const scoreColor = p.decisionScore >= 700 ? D.red : p.decisionScore >= 450 ? D.gold : D.blue;
                  return (
                    <div key={p.rank} style={{
                      background: 'var(--surface)', border: '1.5px solid var(--line)',
                      borderLeft: `4px solid ${scoreColor}`, borderRadius: D.radiusSm,
                      padding: '12px 14px', display: 'flex', gap: 12, alignItems: 'flex-start',
                    }}>
                      <span style={{
                        width: 22, height: 22, borderRadius: '50%', background: scoreColor,
                        color: '#fff', fontSize: 11, fontWeight: 900,
                        display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                      }}>{p.rank}</span>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', marginBottom: 3 }}>{p.title}</div>
                        {p.whyItMatters && <div style={{ fontSize: 11, color: 'var(--muted)', lineHeight: 1.5 }}>{p.whyItMatters}</div>}
                        <div style={{ display: 'flex', gap: 8, marginTop: 6, flexWrap: 'wrap' }}>
                          <span style={{ fontSize: 11, color: 'var(--muted)', background: 'rgba(0,0,0,0.05)', borderRadius: 5, padding: '2px 7px' }}>⏱ {p.estimatedTimeMinutes}m</span>
                          {p.estimatedRevenue != null && p.estimatedRevenue > 0 && (
                            <span style={{ fontSize: 11, color: D.green, background: 'rgba(5,150,105,0.1)', borderRadius: 5, padding: '2px 7px', fontWeight: 700 }}>💵 {fmtMoney(p.estimatedRevenue)}</span>
                          )}
                          {p.module && (
                            <button onClick={() => nav(p.module!)}
                              onMouseEnter={e => { e.currentTarget.style.background = scoreColor; e.currentTarget.style.color = '#fff'; }}
                              onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = scoreColor; }}
                              style={{
                              fontSize: 11, padding: '2px 10px', borderRadius: 999, cursor: 'pointer',
                              border: `1.5px solid ${scoreColor}60`, background: 'transparent',
                              color: scoreColor, fontWeight: 700, transition: 'background 0.15s, color 0.15s',
                            }}>Open →</button>
                          )}
                        </div>
                      </div>
                      <span style={{ fontSize: 12, fontWeight: 900, color: scoreColor, background: `${scoreColor}14`, borderRadius: 7, padding: '3px 9px' }}>{p.decisionScore}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Revenue Opportunities */}
          {brief.revenueOpportunities.length > 0 && (
            <div>
              <SectionHead icon="💵" label="Revenue Opportunities" />
              <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                {brief.revenueOpportunities.map(op => {
                  const c = urgencyColor(op.urgency);
                  return (
                    <div key={op.key} onClick={() => op.module && nav(op.module)} style={{
                      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                      padding: '9px 8px', borderBottom: '1px solid var(--line)', fontSize: 13,
                      cursor: op.module ? 'pointer' : 'default',
                    }}>
                      <span style={{ color: 'var(--text)', fontWeight: 500 }}>{op.label}</span>
                      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                        {op.total != null && op.total > 0 && <span style={{ fontSize: 12, fontWeight: 700, color: D.green }}>{fmtMoney(op.total)}</span>}
                        <span style={{ fontSize: 12, fontWeight: 700, color: c, background: `${c}14`, borderRadius: 20, padding: '2px 9px' }}>{op.count}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Cash Collection */}
          {(brief.cashCollection.unpaidCount > 0 || brief.cashCollection.overdueCount > 0) && (
            <div>
              <SectionHead icon="💳" label="Cash Collection" />
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                {[
                  { label: 'Unpaid Invoices', count: brief.cashCollection.unpaidCount, total: brief.cashCollection.unpaidTotal, module: 'invoices', color: '#ea580c' },
                  { label: 'Overdue Invoices', count: brief.cashCollection.overdueCount, total: brief.cashCollection.overdueTotal, module: 'invoices', color: D.red },
                ].map(c => (
                  <div key={c.label} onClick={() => nav(c.module)} style={{
                    padding: '14px 16px', background: `${c.color}08`,
                    border: `1.5px solid ${c.color}30`, borderRadius: D.radiusSm,
                    cursor: 'pointer',
                  }}>
                    <div style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>{c.label}</div>
                    <div style={{ fontSize: 22, fontWeight: 900, color: c.color }}>{c.count}</div>
                    {c.total > 0 && <div style={{ fontSize: 13, fontWeight: 700, color: D.green, marginTop: 3 }}>{fmtMoney(c.total)}</div>}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Operational Risks */}
          {brief.operationalRisks.length > 0 && (
            <div>
              <SectionHead icon="⚠️" label="Operational Risks" />
              <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                {brief.operationalRisks.map(r => {
                  const c = urgencyColor(r.severity);
                  return (
                    <div key={r.key} onClick={() => r.module && nav(r.module)} style={{
                      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                      padding: '9px 8px', borderBottom: '1px solid var(--line)', fontSize: 13,
                      cursor: r.module ? 'pointer' : 'default',
                    }}>
                      <div>
                        <span style={{ color: 'var(--text)', fontWeight: 500 }}>{r.label}</span>
                        {r.detail && <span style={{ fontSize: 11, color: 'var(--muted)', marginLeft: 8 }}>{r.detail}</span>}
                      </div>
                      {(r.count ?? 0) > 0 && <span style={{ fontSize: 12, fontWeight: 700, color: c, background: `${c}14`, borderRadius: 20, padding: '2px 9px' }}>{r.count}</span>}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Technician Summary */}
          {brief.technicianSummary.totalAssigned > 0 && (
            <div>
              <SectionHead icon="🧑‍🔧" label="Technician Summary" />
              <div style={{ display: 'flex', gap: 10 }}>
                {[
                  { label: 'Active', value: brief.technicianSummary.activeCount, color: D.green },
                  { label: 'Idle', value: brief.technicianSummary.idleCount, color: brief.technicianSummary.idleCount > 0 ? D.gold : 'var(--muted)' },
                ].map(t => (
                  <div key={t.label} style={{
                    flex: 1, padding: '12px 14px', background: 'var(--surface)',
                    border: '1px solid var(--line)', borderRadius: D.radiusSm, textAlign: 'center',
                  }}>
                    <div style={{ fontSize: 22, fontWeight: 900, color: t.color }}>{t.value}</div>
                    <div style={{ fontSize: 10, color: 'var(--muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', marginTop: 3 }}>{t.label}</div>
                  </div>
                ))}
              </div>
              {brief.technicianSummary.bottlenecks.map((b, i) => (
                <div key={i} style={{ fontSize: 12, color: D.gold, marginTop: 8 }}>⚠ {b}</div>
              ))}
            </div>
          )}

          {/* Inventory */}
          {brief.inventorySummary.lowCount > 0 && (
            <div>
              <SectionHead icon="📦" label="Inventory Alerts" />
              <div onClick={() => nav('parts')} style={{
                padding: '14px 16px', background: '#fff7ed', border: '1.5px solid #fdba74',
                borderRadius: D.radiusSm, cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              }}>
                <span style={{ fontSize: 13, color: 'var(--text)', fontWeight: 500 }}>Low inventory items</span>
                <span style={{ fontSize: 18, fontWeight: 900, color: D.gold }}>{brief.inventorySummary.lowCount}</span>
              </div>
            </div>
          )}

          {/* Sapelee Executive Insight (SI-8) */}
          {brief.metadata?.sapelee_enhancement ? (
            <div>
              <SectionHead icon="🔮" label="Sapelee Executive Insight" />
              <div style={{
                background: 'linear-gradient(135deg,#0a0a18,#0f0f2a)',
                border: '1.5px solid #4338ca60', borderRadius: D.radiusSm, padding: '16px 18px',
                display: 'flex', flexDirection: 'column', gap: 12,
              }}>
                {brief.metadata.sapelee_enhancement.executiveSummary && (
                  <div>
                    <div style={{ fontSize: 10, fontWeight: 800, color: '#818cf8', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 5 }}>Executive Summary</div>
                    <div style={{ fontSize: 13, color: '#e0e7ff', lineHeight: 1.6 }}>{brief.metadata.sapelee_enhancement.executiveSummary}</div>
                  </div>
                )}
                {brief.metadata.sapelee_enhancement.strategicAdvice && (
                  <div>
                    <div style={{ fontSize: 10, fontWeight: 800, color: '#818cf8', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 5 }}>Strategic Advice</div>
                    <div style={{ fontSize: 13, color: '#e0e7ff', lineHeight: 1.6 }}>{brief.metadata.sapelee_enhancement.strategicAdvice}</div>
                  </div>
                )}
                {brief.metadata.sapelee_enhancement.ownerCoaching && (
                  <div>
                    <div style={{ fontSize: 10, fontWeight: 800, color: '#818cf8', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 5 }}>Owner Coaching</div>
                    <div style={{ fontSize: 13, color: '#e0e7ff', lineHeight: 1.6 }}>{brief.metadata.sapelee_enhancement.ownerCoaching}</div>
                  </div>
                )}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: 4, borderTop: '1px solid rgba(99,102,241,0.2)' }}>
                  <span style={{ fontSize: 10, color: 'rgba(165,180,252,0.5)' }}>Confidence: {Math.round((brief.metadata.sapelee_enhancement.confidence ?? 0) * 100)}%</span>
                  <span style={{ fontSize: 10, color: 'rgba(165,180,252,0.4)' }}>Powered by Sapelee</span>
                </div>
              </div>
            </div>
          ) : process.env.NEXT_PUBLIC_SAPELEE_ENABLED === 'true' ? (
            <div style={{
              fontSize: 11, color: 'var(--muted)', textAlign: 'center',
              padding: '10px 0', borderTop: '1px solid var(--line)',
            }}>
              🔌 Sapelee not connected — local intelligence only
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
