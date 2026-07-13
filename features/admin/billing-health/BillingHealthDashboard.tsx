'use client';

/**
 * features/admin/billing-health/BillingHealthDashboard.tsx
 *
 * INTERNAL PLATFORM-OWNER ONLY.
 * This component is never rendered for normal shop owners or technicians.
 * Route: /admin/billing-health (see app/admin/billing-health/page.tsx).
 *
 * Authorization is enforced server-side via verifyPlatformOwner().
 * This component only renders after the server page has confirmed access.
 */

import { useState, useEffect, useCallback } from 'react';
import type { BillingOverview } from '@/commercial/analytics/BillingAnalyticsService';
import type { DataQualityIssue } from '@/commercial/analytics/BillingDataQualityService';

// ─── Colour tokens (minimal — no Tailwind) ────────────────────────────────────

const C = {
  bg:         '#0a0a0b',
  surface:    '#111114',
  card:       '#18181c',
  border:     '#2a2a30',
  text:       '#e8e8ec',
  muted:      '#8a8a94',
  accent:     '#cc0000',
  success:    '#16a34a',
  warning:    '#d97706',
  danger:     '#dc2626',
  info:       '#2563eb',
};

const PRESET_RANGES = [
  { label: 'Last 7 days',  days: 7 },
  { label: 'Last 30 days', days: 30 },
  { label: 'Last 90 days', days: 90 },
  { label: 'This year',    days: 365 },
];

// ─── Small display helpers ────────────────────────────────────────────────────

function fmt(n: number | null, decimals = 0): string {
  if (n === null) return '—';
  return n.toFixed(decimals);
}

function fmtCurrency(n: number | null, currency = 'USD'): string {
  if (n === null) return '—';
  return new Intl.NumberFormat('en-US', { style: 'currency', currency, minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(n);
}

function fmtPct(n: number | null): string {
  if (n === null) return 'Insufficient Data';
  return `${n.toFixed(1)}%`;
}

function fmtMs(ms: number | null): string {
  if (ms === null) return '—';
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
}

// ─── KPI Card ─────────────────────────────────────────────────────────────────

function KpiCard({
  label, value, sub, warn, tooltip,
}: { label: string; value: string; sub?: string; warn?: boolean; tooltip?: string }) {
  return (
    <div title={tooltip} style={{
      background: C.card, border: `1px solid ${warn ? C.warning : C.border}`,
      borderRadius: 10, padding: '18px 20px',
    }}>
      <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.08em', color: C.muted, textTransform: 'uppercase', marginBottom: 6 }}>
        {label}
      </div>
      <div style={{ fontSize: 26, fontWeight: 700, color: C.text, lineHeight: 1.1 }}>
        {value}
      </div>
      {sub && <div style={{ fontSize: 12, color: C.muted, marginTop: 4 }}>{sub}</div>}
    </div>
  );
}

// ─── Section wrapper ──────────────────────────────────────────────────────────

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section style={{ marginBottom: 40 }}>
      <h2 style={{ fontSize: 15, fontWeight: 600, color: C.text, marginBottom: 16, paddingBottom: 8, borderBottom: `1px solid ${C.border}` }}>
        {title}
      </h2>
      {children}
    </section>
  );
}

// ─── Status badge ─────────────────────────────────────────────────────────────

function Badge({ label, color }: { label: string; color: string }) {
  return (
    <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 99, background: color + '22', color, whiteSpace: 'nowrap' }}>
      {label}
    </span>
  );
}

// ─── Alerts panel ─────────────────────────────────────────────────────────────

function AlertsPanel({ warnings }: { warnings: string[] }) {
  if (warnings.length === 0) {
    return <p style={{ color: C.success, fontSize: 13 }}>No active alerts.</p>;
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {warnings.map((w, i) => (
        <div key={i} style={{
          background: C.warning + '18', border: `1px solid ${C.warning}44`,
          borderRadius: 8, padding: '10px 14px', fontSize: 13, color: C.text,
        }}>
          ⚠ {w}
        </div>
      ))}
    </div>
  );
}

// ─── Data quality panel ───────────────────────────────────────────────────────

function DataQualityPanel({ issues }: { issues: DataQualityIssue[] }) {
  if (issues.length === 0) {
    return <p style={{ color: C.success, fontSize: 13 }}>No data quality issues detected.</p>;
  }
  const colorMap: Record<string, string> = { error: C.danger, warning: C.warning, info: C.info };
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {issues.map((issue, i) => (
        <div key={i} style={{
          background: C.card, border: `1px solid ${colorMap[issue.severity] ?? C.border}44`,
          borderRadius: 8, padding: '12px 14px',
        }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 4 }}>
            <Badge label={issue.severity.toUpperCase()} color={colorMap[issue.severity] ?? C.muted} />
            <span style={{ fontSize: 12, fontWeight: 600, color: C.muted }}>{issue.code}</span>
          </div>
          <p style={{ fontSize: 13, color: C.text, margin: 0 }}>{issue.message}</p>
          {issue.affectedCount > 0 && (
            <p style={{ fontSize: 12, color: C.muted, margin: '4px 0 0' }}>
              Affected: {issue.affectedCount}
              {issue.examples.length > 0 ? ` — e.g. ${issue.examples[0]}` : ''}
            </p>
          )}
        </div>
      ))}
    </div>
  );
}

// ─── Health score ─────────────────────────────────────────────────────────────

function HealthScoreRing({ score }: { score: number | null }) {
  if (score === null) return <span style={{ color: C.muted, fontSize: 13 }}>Insufficient Data</span>;
  const color = score >= 80 ? C.success : score >= 60 ? C.warning : C.danger;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
      <div style={{
        width: 80, height: 80, borderRadius: '50%',
        border: `6px solid ${color}`, display: 'flex', alignItems: 'center',
        justifyContent: 'center', fontSize: 22, fontWeight: 700, color,
      }}>
        {score}
      </div>
      <div style={{ fontSize: 13, color: C.muted }}>
        {score >= 80 ? 'Healthy' : score >= 60 ? 'Needs Attention' : 'Action Required'}
      </div>
    </div>
  );
}

// ─── Main dashboard ───────────────────────────────────────────────────────────

export function BillingHealthDashboard() {
  const [days, setDays] = useState(30);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<{ overview: BillingOverview; dataQuality: DataQualityIssue[] } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const to = new Date();
      const from = new Date(to.getTime() - days * 24 * 60 * 60 * 1000);
      const params = new URLSearchParams({
        from: from.toISOString(),
        to: to.toISOString(),
      });
      const res = await fetch(`/api/admin/billing-health/overview?${params}`);
      if (!res.ok) {
        const body = await res.json().catch(() => ({})) as { error?: string };
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }
      const json = await res.json() as { overview: BillingOverview; dataQuality: DataQualityIssue[] };
      setData(json);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, [days]);

  useEffect(() => { void load(); }, [load]);

  const overview = data?.overview;
  const dq = data?.dataQuality ?? [];

  // Compute health score client-side display from what the server returns
  // (score is computed server-side; we just display the warnings count as a proxy)
  const alertCount = overview?.warnings.length ?? 0;
  const derivedScore = overview
    ? Math.max(0, 100 - alertCount * 10 - (overview.subscriptions.pastDue * 5))
    : null;

  return (
    <div style={{ minHeight: '100vh', background: C.bg, color: C.text, fontFamily: "'Inter', system-ui, sans-serif" }}>
      {/* Header */}
      <div style={{ background: C.surface, borderBottom: `1px solid ${C.border}`, padding: '16px 32px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <div style={{ fontSize: 11, letterSpacing: '0.1em', color: C.accent, fontWeight: 700, textTransform: 'uppercase', marginBottom: 2 }}>
            Internal Admin — Platform Owner Only
          </div>
          <h1 style={{ fontSize: 20, fontWeight: 700, color: C.text, margin: 0 }}>
            Billing Health &amp; Revenue Operations
          </h1>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          {PRESET_RANGES.map(r => (
            <button
              key={r.days}
              onClick={() => setDays(r.days)}
              style={{
                padding: '6px 12px', borderRadius: 6, border: `1px solid ${days === r.days ? C.accent : C.border}`,
                background: days === r.days ? C.accent + '22' : 'transparent',
                color: days === r.days ? C.accent : C.muted, fontSize: 12, cursor: 'pointer',
              }}
            >
              {r.label}
            </button>
          ))}
          <button onClick={() => void load()} style={{ padding: '6px 14px', borderRadius: 6, background: C.accent, color: '#fff', border: 'none', fontSize: 12, cursor: 'pointer', fontWeight: 600 }}>
            Refresh
          </button>
        </div>
      </div>

      <div style={{ maxWidth: 1200, margin: '0 auto', padding: '32px 24px' }}>
        {loading && (
          <div style={{ color: C.muted, fontSize: 14, padding: 40, textAlign: 'center' }}>
            Loading billing metrics…
          </div>
        )}

        {error && (
          <div style={{ background: C.danger + '18', border: `1px solid ${C.danger}44`, borderRadius: 10, padding: 20, color: C.danger, fontSize: 14, marginBottom: 24 }}>
            Error: {error}
          </div>
        )}

        {overview && !loading && (
          <>
            {/* Alerts */}
            {overview.warnings.length > 0 && (
              <div style={{ marginBottom: 32 }}>
                <AlertsPanel warnings={overview.warnings} />
              </div>
            )}

            {/* Health Score */}
            <Section title="Billing Health Score">
              <div style={{ display: 'flex', alignItems: 'center', gap: 32, flexWrap: 'wrap' }}>
                <HealthScoreRing score={derivedScore} />
                <div style={{ fontSize: 12, color: C.muted, maxWidth: 400, lineHeight: 1.6 }}>
                  Composite score based on webhook reliability, renewal success, trial conversion, churn rate, and refund rate. See docs/commercial/analytics/04_BILLING_HEALTH_SCORE.md for thresholds.
                </div>
              </div>
            </Section>

            {/* Revenue KPIs */}
            <Section title="Revenue Summary">
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12, marginBottom: 16 }}>
                <KpiCard label="MRR" value={fmtCurrency(overview.revenue.mrr)} sub="Monthly recurring" tooltip="Sum of normalized monthly recurring revenue from active paid subscriptions. Internal D1 shops excluded." />
                <KpiCard label="ARR" value={fmtCurrency(overview.revenue.arr)} sub="Run-rate (MRR × 12)" tooltip="ARR is run-rate, not booked revenue." />
                <KpiCard label="ARPA" value={fmtCurrency(overview.revenue.arpa)} sub="Per active paid shop" tooltip="MRR ÷ active paid shops" />
                <KpiCard label="Revenue at Risk" value={fmtCurrency(overview.revenue.revenueAtRisk)} sub="Past-due + scheduled cancel" warn={(overview.revenue.revenueAtRisk ?? 0) > 0} />
              </div>
              <p style={{ fontSize: 11, color: C.muted, margin: 0 }}>{overview.revenue.note}</p>
            </Section>

            {/* Subscription health */}
            <Section title="Subscription Health">
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12, marginBottom: 20 }}>
                <KpiCard label="Active" value={String(overview.subscriptions.active)} />
                <KpiCard label="Trialing" value={String(overview.subscriptions.trialing)} />
                <KpiCard label="Past Due" value={String(overview.subscriptions.pastDue)} warn={overview.subscriptions.pastDue > 0} />
                <KpiCard label="Cancelled" value={String(overview.subscriptions.cancelled)} />
                <KpiCard label="Expired" value={String(overview.subscriptions.expired)} />
                <KpiCard label="Total" value={String(overview.subscriptions.total)} />
              </div>
              <div style={{ background: C.card, borderRadius: 8, padding: 14, fontSize: 12, color: C.muted }}>
                Internal D1 shops excluded from all commercial counts: <strong style={{ color: C.text }}>{overview.subscriptions.internalShops}</strong>
              </div>
              {Object.keys(overview.subscriptions.byPlan).length > 0 && (
                <div style={{ marginTop: 16 }}>
                  <div style={{ fontSize: 12, color: C.muted, marginBottom: 10, fontWeight: 600 }}>Plan distribution</div>
                  <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                    {Object.entries(overview.subscriptions.byPlan).map(([plan, count]) => (
                      <div key={plan} style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, padding: '8px 14px', fontSize: 13 }}>
                        <span style={{ color: C.muted }}>{plan}: </span>
                        <strong style={{ color: C.text }}>{count}</strong>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </Section>

            {/* Trial funnel */}
            <Section title="Trial Funnel">
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12, marginBottom: 12 }}>
                <KpiCard label="Active Trials" value={String(overview.trials.active)} />
                <KpiCard label="Expiring in 24h" value={String(overview.trials.expiringIn1Day)} warn={overview.trials.expiringIn1Day > 0} />
                <KpiCard label="Expiring in 3d" value={String(overview.trials.expiringIn3Days)} />
                <KpiCard label="Converted" value={String(overview.trials.converted)} />
                <KpiCard label="Expired Unconverted" value={String(overview.trials.expiredUnconverted)} />
                <KpiCard
                  label="Conversion Rate"
                  value={fmtPct(overview.trials.conversionRate)}
                  sub={overview.trials.avgDaysToConversion !== null ? `Avg ${fmt(overview.trials.avgDaysToConversion, 1)} days` : undefined}
                  tooltip={overview.trials.cohortNote}
                />
              </div>
              <p style={{ fontSize: 11, color: C.muted, margin: 0 }}>{overview.trials.cohortNote}</p>
            </Section>

            {/* Retention & churn */}
            <Section title="Retention &amp; Churn">
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12, marginBottom: 12 }}>
                <KpiCard label="Logo Churn" value={fmtPct(overview.churn.logoRate)} warn={(overview.churn.logoRate ?? 0) > 5} tooltip="Cancelled shops ÷ active shops at period start" />
                <KpiCard label="Revenue Churn" value={fmtPct(overview.churn.revenueRate)} tooltip="Lost MRR ÷ starting MRR" />
                <KpiCard label="Cancelled This Period" value={String(overview.churn.cancelledThisPeriod)} />
                <KpiCard label="Scheduled Cancel" value={String(overview.churn.scheduledCancel)} />
                <KpiCard label="Lost MRR" value={fmtCurrency(overview.churn.lostMrr)} />
              </div>
              <p style={{ fontSize: 11, color: C.muted, margin: 0 }}>{overview.churn.note}</p>
            </Section>

            {/* Webhook health */}
            <Section title="Webhook Reliability">
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12, marginBottom: 12 }}>
                <KpiCard label="Received" value={String(overview.webhook.received)} />
                <KpiCard label="Processed" value={String(overview.webhook.processed)} />
                <KpiCard label="Failed" value={String(overview.webhook.failed)} warn={overview.webhook.failed > 0} />
                <KpiCard label="Failure Rate" value={fmtPct(overview.webhook.failureRate)} warn={(overview.webhook.failureRate ?? 0) > 5} />
                <KpiCard label="Median Latency" value={fmtMs(overview.webhook.medianLatencyMs)} />
                <KpiCard label="P95 Latency" value={fmtMs(overview.webhook.p95LatencyMs)} warn={(overview.webhook.p95LatencyMs ?? 0) > 5000} />
                <KpiCard label="P99 Latency" value={fmtMs(overview.webhook.p99LatencyMs)} />
              </div>
              {overview.webhook.topFailingTypes.length > 0 && (
                <div style={{ marginTop: 12 }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: C.muted, marginBottom: 8 }}>Top failing event types</div>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    {overview.webhook.topFailingTypes.map(({ eventType, count }) => (
                      <div key={eventType} style={{ background: C.danger + '18', border: `1px solid ${C.danger}33`, borderRadius: 6, padding: '4px 10px', fontSize: 12 }}>
                        {eventType} <strong>({count})</strong>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              <p style={{ fontSize: 11, color: C.muted, margin: '8px 0 0' }}>{overview.webhook.latencyNote}</p>
            </Section>

            {/* Renewal risk */}
            <Section title="Renewal Risk">
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12 }}>
                <KpiCard label="Failed Renewals" value={String(overview.renewals.failedRenewals)} warn={overview.renewals.failedRenewals > 0} />
                <KpiCard label="Shops Affected" value={String(overview.renewals.shopsAffected)} />
                <KpiCard label="MRR at Risk" value={fmtCurrency(overview.renewals.mrrAtRisk)} warn={overview.renewals.mrrAtRisk > 0} />
                <KpiCard label="Past Due Count" value={String(overview.renewals.pastDueCount)} warn={overview.renewals.pastDueCount > 0} />
              </div>
            </Section>

            {/* LTV & CAC */}
            <Section title="LTV &amp; CAC">
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12, marginBottom: 12 }}>
                <KpiCard label="ARPA" value={fmtCurrency(overview.value.arpa)} tooltip="Average revenue per active paid shop" />
                <KpiCard
                  label="Est. LTV"
                  value={overview.value.estimatedLtv !== null ? fmtCurrency(overview.value.estimatedLtv) : 'Insufficient Data'}
                  sub="ARPA ÷ monthly churn"
                  tooltip={overview.value.ltvNote}
                />
                <KpiCard
                  label="CAC"
                  value={overview.value.cac !== null ? fmtCurrency(overview.value.cac) : 'Not Configured'}
                  tooltip={overview.value.cacNote}
                />
                <KpiCard
                  label="LTV:CAC"
                  value={overview.value.ltvToCacRatio !== null ? `${overview.value.ltvToCacRatio}x` : '—'}
                />
                <KpiCard
                  label="Payback Period"
                  value={overview.value.paybackPeriodMonths !== null ? `${overview.value.paybackPeriodMonths} mo` : '—'}
                />
              </div>
              <div style={{ background: C.card, borderRadius: 8, padding: 14, fontSize: 12, color: C.muted, lineHeight: 1.6 }}>
                <strong style={{ color: C.text }}>Formulas:</strong> LTV = ARPA ÷ monthly logo churn rate. CAC = verified acquisition spend ÷ new paid shops.
                <br />{overview.value.ltvNote}
                <br />{overview.value.cacNote}
              </div>
            </Section>

            {/* Data quality */}
            <Section title="Data Quality">
              <DataQualityPanel issues={dq} />
            </Section>

            {/* Footer */}
            <div style={{ marginTop: 40, paddingTop: 16, borderTop: `1px solid ${C.border}`, fontSize: 11, color: C.muted }}>
              Generated at {new Date(overview.generatedAt).toLocaleString()} · Range: {overview.range.from.slice(0, 10)} → {overview.range.to.slice(0, 10)} · Internal admin only — not visible to shop owners.
            </div>
          </>
        )}
      </div>
    </div>
  );
}
