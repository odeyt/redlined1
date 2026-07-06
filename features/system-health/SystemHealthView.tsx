'use client';

import { useEffect, useState } from 'react';
import { Panel } from '@/components/Panel';

interface HealthCheck {
  status: 'healthy' | 'degraded' | 'unhealthy';
  environment: string;
  app_url: string;
  version: string;
  timestamp: string;
  response_ms: number;
  checks: Record<string, boolean | string>;
}

interface LogEntry {
  id: string;
  level: string;
  event_type: string;
  message: string;
  route: string | null;
  status_code: number | null;
  duration_ms: number | null;
  environment: string;
  created_at: string;
}

const STATUS_COLOR = {
  healthy:   { color: '#22c55e', bg: 'rgba(34,197,94,0.12)',   label: 'Healthy' },
  degraded:  { color: '#f59e0b', bg: 'rgba(245,158,11,0.12)',  label: 'Degraded' },
  unhealthy: { color: '#ef4444', bg: 'rgba(239,68,68,0.12)',   label: 'Unhealthy' },
};

const LEVEL_COLOR: Record<string, string> = {
  error: '#ef4444',
  warn:  '#f59e0b',
  info:  '#3b82f6',
  debug: '#6b7280',
};

function StatusBadge({ value }: { value: boolean | string }) {
  if (value === true || value === 'configured') {
    return <span style={{ color: '#22c55e', fontWeight: 700, fontSize: 12 }}>✓ OK</span>;
  }
  if (value === false) {
    return <span style={{ color: '#ef4444', fontWeight: 700, fontSize: 12 }}>✗ Fail</span>;
  }
  return <span style={{ color: '#f59e0b', fontWeight: 600, fontSize: 12 }}>{String(value)}</span>;
}

function fmt(iso: string) {
  return new Date(iso).toLocaleString('en-US', {
    month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
  });
}

export function SystemHealthView() {
  const [health, setHealth] = useState<HealthCheck | null>(null);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [loadingHealth, setLoadingHealth] = useState(true);
  const [loadingLogs, setLoadingLogs] = useState(true);
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());

  async function fetchHealth() {
    setLoadingHealth(true);
    try {
      const res = await fetch('/api/health');
      if (res.ok) setHealth(await res.json() as HealthCheck);
    } catch { /* health endpoint unreachable */ }
    finally { setLoadingHealth(false); }
  }

  async function fetchLogs() {
    setLoadingLogs(true);
    try {
      const res = await fetch('/api/observability/logs', { credentials: 'include' });
      if (res.ok) {
        const data = await res.json() as { logs: LogEntry[] };
        setLogs(data.logs ?? []);
      }
    } catch { /* logs table may not exist yet */ }
    finally { setLoadingLogs(false); }
  }

  function refresh() {
    setLastRefresh(new Date());
    fetchHealth();
    fetchLogs();
  }

  useEffect(() => {
    fetchHealth();
    fetchLogs();
  }, []);

  const statusCfg = health ? STATUS_COLOR[health.status] : null;

  return (
    <>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>
            Last refreshed {fmt(lastRefresh.toISOString())}
          </div>
        </div>
        <button
          onClick={refresh}
          style={{
            padding: '7px 16px', borderRadius: 8, border: '1px solid var(--line)',
            background: 'var(--surface)', color: 'var(--text)', fontSize: 12,
            fontWeight: 700, cursor: 'pointer',
          }}
        >
          ↻ Refresh
        </button>
      </div>

      {/* Health Status */}
      <Panel title="Health Check" hint="GET /api/health — real-time system status">
        {loadingHealth ? (
          <div style={{ color: 'var(--muted)', fontSize: 13 }}>Checking health…</div>
        ) : !health ? (
          <div style={{ color: '#ef4444', fontSize: 13 }}>Health check failed — /api/health unreachable</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {/* Overall status */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              <div style={{
                padding: '10px 22px', borderRadius: 30,
                background: statusCfg!.bg, color: statusCfg!.color,
                border: `1px solid ${statusCfg!.color}`,
                fontWeight: 900, fontSize: 15, letterSpacing: '0.06em',
              }}>
                {statusCfg!.label.toUpperCase()}
              </div>
              <div style={{ fontSize: 12, color: 'var(--muted)' }}>
                {health.environment} · v{health.version} · {health.response_ms}ms
              </div>
            </div>

            {/* Checks grid */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
              gap: 10,
            }}>
              {Object.entries(health.checks).map(([key, val]) => (
                <div key={key} style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '10px 14px', background: 'var(--surface-soft)',
                  borderRadius: 10, border: '1px solid var(--line)',
                }}>
                  <span style={{ fontSize: 12, fontWeight: 600, textTransform: 'capitalize' }}>
                    {key.replace(/_/g, ' ')}
                  </span>
                  <StatusBadge value={val} />
                </div>
              ))}
            </div>

            <div style={{ fontSize: 11, color: 'var(--muted)' }}>
              Checked at {fmt(health.timestamp)} · App URL: {health.app_url}
            </div>
          </div>
        )}
      </Panel>

      {/* Recent Logs */}
      <Panel title="Recent Events" hint="From observability_logs — last 50 entries for this shop">
        {loadingLogs ? (
          <div style={{ color: 'var(--muted)', fontSize: 13 }}>Loading logs…</div>
        ) : logs.length === 0 ? (
          <div style={{ color: 'var(--muted)', fontSize: 13, padding: '12px 0' }}>
            No logs yet. Logs will appear here after API activity, feature flag changes, or errors are recorded.
            <div style={{ marginTop: 8, fontSize: 12 }}>
              Make sure <code>migration_observability_logs.sql</code> has been run in Supabase.
            </div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
            {/* Header */}
            <div style={{
              display: 'grid', gridTemplateColumns: '70px 100px 1fr 80px 140px',
              gap: 10, padding: '6px 12px',
              fontSize: 10, fontWeight: 700, color: 'var(--muted)',
              textTransform: 'uppercase', letterSpacing: '0.06em',
              borderBottom: '1px solid var(--line)',
            }}>
              <div>Level</div><div>Type</div><div>Message</div><div>Status</div><div>Time</div>
            </div>
            {logs.slice(0, 50).map(log => (
              <div key={log.id} style={{
                display: 'grid', gridTemplateColumns: '70px 100px 1fr 80px 140px',
                gap: 10, padding: '9px 12px', borderBottom: '1px solid var(--line)',
                alignItems: 'center', fontSize: 12,
              }}>
                <span style={{ color: LEVEL_COLOR[log.level] ?? 'var(--muted)', fontWeight: 700, textTransform: 'uppercase', fontSize: 10 }}>
                  {log.level}
                </span>
                <span style={{ color: 'var(--muted)', fontSize: 11 }}>{log.event_type}</span>
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {log.message}
                </span>
                <span style={{ color: log.status_code && log.status_code >= 400 ? '#ef4444' : 'var(--muted)', fontSize: 11 }}>
                  {log.status_code ?? '—'}
                </span>
                <span style={{ color: 'var(--muted)', fontSize: 11 }}>{fmt(log.created_at)}</span>
              </div>
            ))}
          </div>
        )}
      </Panel>
    </>
  );
}
