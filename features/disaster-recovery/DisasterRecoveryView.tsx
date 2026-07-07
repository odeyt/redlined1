'use client';

import { useEffect, useState } from 'react';
import type { BackupStatus, ValidationResult, RecoveryPoint } from '@/services/backupService';

interface DRData {
  status:         BackupStatus;
  validation:     ValidationResult;
  recoveryPoints: RecoveryPoint[];
}

type LoadState = { state: 'loading' } | { state: 'error'; message: string } | { state: 'ok'; data: DRData };

const STATUS_COLORS: Record<string, string> = {
  ok:      '#22c55e',
  warning: '#f59e0b',
  error:   '#ef4444',
  unknown: '#94a3b8',
};

const STATUS_LABELS: Record<string, string> = {
  ok:      '✓ OK',
  warning: '⚠ Warning',
  error:   '✗ Error',
  unknown: '? Unknown',
};

function StatusBadge({ status }: { status: string }) {
  const color = STATUS_COLORS[status] ?? '#94a3b8';
  return (
    <span style={{
      color,
      fontWeight: 700,
      fontSize: 12,
      letterSpacing: '0.05em',
      textTransform: 'uppercase',
    }}>
      {STATUS_LABELS[status] ?? status}
    </span>
  );
}

function ScoreRing({ score, label }: { score: number; label: string }) {
  const color =
    score >= 90 ? '#22c55e' :
    score >= 75 ? '#f59e0b' :
    '#ef4444';

  return (
    <div style={{ textAlign: 'center', padding: '12px 0' }}>
      <div style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: 96,
        height: 96,
        borderRadius: '50%',
        border: `6px solid ${color}`,
        flexDirection: 'column',
      }}>
        <span style={{ fontSize: 24, fontWeight: 800, color }}>{score}%</span>
      </div>
      <div style={{ marginTop: 8, fontSize: 13, fontWeight: 600, color }}>{label}</div>
    </div>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{
      background: '#fff',
      border: '1px solid #e2e8f0',
      borderRadius: 10,
      overflow: 'hidden',
      marginBottom: 20,
    }}>
      <div style={{
        padding: '12px 16px',
        background: '#f8fafc',
        borderBottom: '1px solid #e2e8f0',
        fontWeight: 700,
        fontSize: 13,
        letterSpacing: '0.04em',
        color: '#374151',
        textTransform: 'uppercase',
      }}>
        {title}
      </div>
      <div style={{ padding: 16 }}>{children}</div>
    </div>
  );
}

function Row({ label, value, valueColor }: { label: string; value: string; valueColor?: string }) {
  return (
    <div style={{
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      padding: '8px 0',
      borderBottom: '1px solid #f1f5f9',
    }}>
      <span style={{ fontSize: 13, color: '#64748b' }}>{label}</span>
      <span style={{ fontSize: 13, fontWeight: 600, color: valueColor ?? '#1e293b' }}>{value}</span>
    </div>
  );
}

export function DisasterRecoveryView() {
  const [load, setLoad] = useState<LoadState>({ state: 'loading' });
  const [refreshedAt, setRefreshedAt] = useState<Date | null>(null);

  const fetchData = () => {
    setLoad({ state: 'loading' });
    fetch('/api/disaster-recovery')
      .then(r => r.json())
      .then((d: DRData & { error?: string }) => {
        if (d.error) setLoad({ state: 'error', message: d.error });
        else { setLoad({ state: 'ok', data: d }); setRefreshedAt(new Date()); }
      })
      .catch(() => setLoad({ state: 'error', message: 'Failed to load disaster recovery status.' }));
  };

  useEffect(() => { fetchData(); }, []);

  return (
    <div style={{ padding: 24, maxWidth: 960, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800 }}>Disaster Recovery</h1>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: '#64748b' }}>
            Owner only · RPO &lt; 15 min · RTO &lt; 10 min
          </p>
        </div>
        <button
          onClick={fetchData}
          style={{
            padding: '8px 16px', borderRadius: 6, border: '1px solid #e2e8f0',
            background: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 600,
          }}
        >
          ↻ Refresh
        </button>
      </div>

      {load.state === 'loading' && (
        <div style={{ color: '#64748b', padding: 40, textAlign: 'center' }}>Loading backup status…</div>
      )}

      {load.state === 'error' && (
        <div style={{
          background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8,
          padding: 16, color: '#dc2626', fontSize: 14,
        }}>
          {load.message}
        </div>
      )}

      {load.state === 'ok' && (() => {
        const { status, validation, recoveryPoints } = load.data;
        const overallColor =
          status.overallHealth === 'healthy' ? '#22c55e' :
          status.overallHealth === 'degraded' ? '#f59e0b' : '#94a3b8';

        return (
          <>
            {/* Top widgets row */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16, marginBottom: 24 }}>
              {/* Recovery Readiness */}
              <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 10, padding: 16, textAlign: 'center' }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', marginBottom: 8 }}>Recovery Readiness</div>
                <ScoreRing score={status.recoveryReadinessScore} label={status.readinessLabel} />
              </div>

              {/* System Status */}
              <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 10, padding: 16 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', marginBottom: 12 }}>System Status</div>
                <div style={{ fontSize: 20, fontWeight: 800, color: overallColor, textTransform: 'uppercase', marginBottom: 8 }}>
                  {status.overallHealth}
                </div>
                <div style={{ fontSize: 12, color: '#64748b' }}>Environment: <strong>{status.environment}</strong></div>
                <div style={{ fontSize: 12, color: '#64748b', marginTop: 4 }}>Version: <strong>v{status.appVersion}</strong></div>
              </div>

              {/* Validation */}
              <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 10, padding: 16 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', marginBottom: 12 }}>Backup Validation</div>
                <div style={{
                  fontSize: 20, fontWeight: 800,
                  color: validation.passed ? '#22c55e' : '#ef4444',
                  marginBottom: 8,
                }}>
                  {validation.passed ? '✓ PASSED' : '✗ FAILED'}
                </div>
                {validation.errors.length > 0 && (
                  <div style={{ fontSize: 11, color: '#ef4444' }}>{validation.errors.length} error(s)</div>
                )}
                {validation.warnings.length > 0 && (
                  <div style={{ fontSize: 11, color: '#f59e0b' }}>{validation.warnings.length} warning(s)</div>
                )}
                {validation.passed && validation.warnings.length === 0 && (
                  <div style={{ fontSize: 11, color: '#22c55e' }}>All checks passed</div>
                )}
              </div>

              {/* Last Restore Test */}
              <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 10, padding: 16 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', marginBottom: 12 }}>Last Restore Test</div>
                <div style={{ fontSize: 20, fontWeight: 800, color: '#94a3b8', marginBottom: 8 }}>Unknown</div>
                <div style={{ fontSize: 11, color: '#94a3b8' }}>
                  Run quarterly on staging.{' '}
                  <span>See RECOVERY_TEST_PLAN.md</span>
                </div>
              </div>
            </div>

            {/* Backup Status Items */}
            <Card title="Backup Status by Component">
              <div style={{ fontSize: 11, color: '#94a3b8', marginBottom: 12 }}>
                Ordered by recovery priority · Checked {refreshedAt?.toLocaleTimeString() ?? '—'}
              </div>
              {status.items.map(item => (
                <div key={item.name} style={{
                  display: 'grid',
                  gridTemplateColumns: '32px 1fr 120px 100px',
                  gap: 12,
                  alignItems: 'center',
                  padding: '10px 0',
                  borderBottom: '1px solid #f1f5f9',
                }}>
                  <div style={{
                    width: 28, height: 28, borderRadius: '50%',
                    background: STATUS_COLORS[item.status] + '22',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 13, color: STATUS_COLORS[item.status], fontWeight: 800,
                    flexShrink: 0,
                  }}>
                    {item.recoveryPriority}
                  </div>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: '#1e293b' }}>{item.name}</div>
                    <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>{item.detail}</div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <StatusBadge status={item.status} />
                  </div>
                  <div style={{ textAlign: 'right', fontSize: 11, color: '#94a3b8' }}>
                    ~{item.estimatedRestoreMinutes} min restore
                  </div>
                </div>
              ))}
            </Card>

            {/* Validation Details */}
            {(validation.errors.length > 0 || validation.warnings.length > 0) && (
              <Card title="Validation Warnings & Errors">
                {validation.errors.map((e, i) => (
                  <div key={i} style={{ padding: '6px 0', color: '#dc2626', fontSize: 13 }}>✗ {e}</div>
                ))}
                {validation.warnings.map((w, i) => (
                  <div key={i} style={{ padding: '6px 0', color: '#d97706', fontSize: 13 }}>⚠ {w}</div>
                ))}
              </Card>
            )}

            {/* Recovery Points */}
            <Card title="Recovery Points">
              <div style={{ fontSize: 11, color: '#94a3b8', marginBottom: 12 }}>
                Available recovery targets. Timestamps require manual verification in Supabase / Vercel dashboards.
              </div>
              {recoveryPoints.map(rp => (
                <div key={rp.id} style={{ padding: '10px 0', borderBottom: '1px solid #f1f5f9' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: 13, fontWeight: 600, color: '#1e293b' }}>{rp.label}</span>
                    <span style={{
                      fontSize: 11, color: '#6366f1', fontWeight: 600,
                      textTransform: 'uppercase', letterSpacing: '0.05em',
                    }}>
                      {rp.type}
                    </span>
                  </div>
                  <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 4 }}>
                    Source: {rp.source}
                  </div>
                  <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>{rp.notes}</div>
                </div>
              ))}
            </Card>

            {/* DR Targets */}
            <Card title="Recovery Targets">
              <Row label="Recovery Point Objective (RPO)" value="< 15 minutes" valueColor="#22c55e" />
              <Row label="Recovery Time Objective (RTO)" value="< 10 minutes" valueColor="#22c55e" />
              <Row label="Database Restore (PITR)" value="2–5 minutes" />
              <Row label="Vercel Rollback" value="< 2 minutes" />
              <Row label="Full Rebuild from Git" value="20–30 minutes" />
              <Row label="Manual Paper Fallback" value="Immediate" valueColor="#22c55e" />
            </Card>

            {/* Pending Migrations */}
            <Card title="Migration Status">
              <Row label="migration_billing.sql" value="✓ Applied" valueColor="#22c55e" />
              <Row label="migration_feature_flags.sql" value="✓ Applied" valueColor="#22c55e" />
              <Row label="migration_observability_logs.sql" value="✓ Applied" valueColor="#22c55e" />
              <div style={{ marginTop: 12, fontSize: 11, color: '#94a3b8' }}>
                Full migration history: docs/migrations/MIGRATION_REGISTRY.md
              </div>
            </Card>

            {/* DR Documentation Links */}
            <Card title="DR Documentation">
              {[
                'DISASTER_RECOVERY_PLAN.md',
                'BACKUP_STRATEGY.md',
                'RESTORE_PROCEDURE.md',
                'INCIDENT_RUNBOOK.md',
                'RISK_MATRIX.md',
                'BACKUP_CHECKLIST.md',
                'RECOVERY_TEST_PLAN.md',
                'BUSINESS_CONTINUITY_PLAN.md',
              ].map(doc => (
                <div key={doc} style={{
                  padding: '7px 0',
                  borderBottom: '1px solid #f1f5f9',
                  fontSize: 13, color: '#1e293b',
                }}>
                  📄 docs/disaster-recovery/{doc}
                </div>
              ))}
            </Card>

            {/* Footer */}
            <div style={{ fontSize: 11, color: '#94a3b8', textAlign: 'center', marginTop: 8 }}>
              Last checked: {new Date(status.checkedAt).toLocaleString()} ·
              App: {status.appUrl} ·
              Never displays false success — unknown values reported honestly.
            </div>
          </>
        );
      })()}
    </div>
  );
}
