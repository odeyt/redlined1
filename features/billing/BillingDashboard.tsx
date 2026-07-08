'use client';

import { useEffect, useState } from 'react';
import type { CommercialDashboardData } from '@/commercial/shared/types';

const BILLING_ENABLED = process.env.NEXT_PUBLIC_BILLING_ENABLED === 'true';

export function BillingDashboard() {
  const [data, setData] = useState<CommercialDashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!BILLING_ENABLED) { setLoading(false); return; }
    fetch('/api/billing/status')
      .then(r => r.json())
      .then(d => { setData(d); setLoading(false); })
      .catch(() => { setError('Failed to load billing status'); setLoading(false); });
  }, []);

  if (!BILLING_ENABLED) {
    return (
      <div className="card" style={{ padding: 32, textAlign: 'center', maxWidth: 560, margin: '40px auto' }}>
        <div style={{ fontSize: 32, marginBottom: 12 }}>💳</div>
        <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}>Billing &amp; Subscription</h2>
        <p style={{ color: 'var(--muted)', fontSize: 14 }}>
          Billing is not enabled in this environment.<br />
          Set <code style={{ background: 'var(--surface-soft)', padding: '2px 6px', borderRadius: 4 }}>NEXT_PUBLIC_BILLING_ENABLED=true</code> and configure Creem to activate.
        </p>
      </div>
    );
  }

  if (loading) {
    return <div style={{ padding: 32, color: 'var(--muted)', textAlign: 'center' }}>Loading billing status…</div>;
  }

  if (error || !data) {
    return (
      <div className="card" style={{ padding: 32, textAlign: 'center', color: '#ef4444' }}>
        {error ?? 'Unable to load billing data.'}
      </div>
    );
  }

  const { subscription: sub, plan, usage, trialDaysLeft, isActive, isPastDue } = data;

  return (
    <div style={{ maxWidth: 780, margin: '0 auto' }}>
      <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 4 }}>Billing &amp; Subscription</h1>
      <p style={{ color: 'var(--muted)', fontSize: 13, marginBottom: 24 }}>Manage your plan, usage, and payment details.</p>

      {/* Status banners */}
      {isPastDue && (
        <div style={{ background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.4)', borderRadius: 8, padding: '12px 16px', marginBottom: 16, color: '#ef4444', fontWeight: 600, fontSize: 13 }}>
          ⚠️ Your payment is past due. Please update your payment method to avoid service interruption.
        </div>
      )}
      {sub?.cancelAtPeriodEnd && (
        <div style={{ background: 'rgba(245,158,11,0.12)', border: '1px solid rgba(245,158,11,0.4)', borderRadius: 8, padding: '12px 16px', marginBottom: 16, color: '#f59e0b', fontWeight: 600, fontSize: 13 }}>
          ⏳ Your subscription will cancel at the end of the current billing period.
        </div>
      )}
      {trialDaysLeft !== null && trialDaysLeft <= 3 && (
        <div style={{ background: 'rgba(245,158,11,0.12)', border: '1px solid rgba(245,158,11,0.4)', borderRadius: 8, padding: '12px 16px', marginBottom: 16, color: '#f59e0b', fontWeight: 600, fontSize: 13 }}>
          ⏳ {trialDaysLeft} day{trialDaysLeft !== 1 ? 's' : ''} left in your free trial.
        </div>
      )}

      {/* Plan card */}
      <div className="card" style={{ padding: 24, marginBottom: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12 }}>
          <div>
            <div style={{ fontSize: 11, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>Current Plan</div>
            <div style={{ fontSize: 24, fontWeight: 800 }}>{plan?.name ?? 'Unknown'}</div>
            <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 4 }}>{plan?.description}</div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <StatusBadge status={sub?.status ?? 'unknown'} />
            {trialDaysLeft !== null && (
              <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 6 }}>{trialDaysLeft} days left in trial</div>
            )}
            {sub?.currentPeriodEnd && sub.status === 'active' && (
              <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 6 }}>
                Renews {new Date(sub.currentPeriodEnd).toLocaleDateString()}
              </div>
            )}
          </div>
        </div>

        <div style={{ borderTop: '1px solid var(--line)', marginTop: 20, paddingTop: 16, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          {isActive && (
            <button
              onClick={() => alert('Upgrade flow — configure Creem product IDs to enable')}
              style={{ padding: '9px 20px', background: '#cc0000', color: '#fff', border: 'none', borderRadius: 8, fontWeight: 700, fontSize: 13, cursor: 'pointer' }}
            >
              ↑ Upgrade Plan
            </button>
          )}
          <button
            onClick={() => fetch('/api/billing/portal', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ returnUrl: window.location.href }) }).then(r => r.json()).then(d => { if (d.portalUrl) window.location.href = d.portalUrl; else alert('Billing portal not configured'); })}
            style={{ padding: '9px 20px', background: 'transparent', color: 'var(--text)', border: '1px solid var(--line)', borderRadius: 8, fontWeight: 600, fontSize: 13, cursor: 'pointer' }}
          >
            Manage Billing
          </button>
        </div>
      </div>

      {/* Plan limits */}
      {plan && (
        <div className="card" style={{ padding: 24, marginBottom: 16 }}>
          <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 14, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Plan Limits</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 12 }}>
            <LimitRow label="Users"            limit={plan.limits.maxUsers} />
            <LimitRow label="Locations"        limit={plan.limits.maxLocations} />
            <LimitRow label="AI Credits/mo"    limit={plan.limits.aiCreditsPerMonth} />
            <LimitRow label="Storage"          limit={plan.limits.storageGb} suffix=" GB" />
          </div>
        </div>
      )}

      {/* Usage */}
      {usage && (
        <div className="card" style={{ padding: 24, marginBottom: 16 }}>
          <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 14, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            This Month&apos;s Usage
            <span style={{ fontSize: 11, fontWeight: 400, marginLeft: 8 }}>
              ({new Date(usage.period.start).toLocaleDateString()} – {new Date(usage.period.end).toLocaleDateString()})
            </span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 10 }}>
            {Object.entries(usage.usage).map(([key, val]) => (
              <div key={key} style={{ padding: '10px 12px', background: 'var(--surface-soft)', borderRadius: 8 }}>
                <div style={{ fontSize: 10, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{key.replace(/_/g, ' ')}</div>
                <div style={{ fontSize: 20, fontWeight: 700, marginTop: 2 }}>{val}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Provider info */}
      <div style={{ fontSize: 11, color: 'var(--muted)', textAlign: 'center', marginTop: 8 }}>
        Billing provider: {sub?.billingProvider ?? 'creem'} · Provider ID: {sub?.providerSubscriptionId ?? 'not yet linked'}
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, { bg: string; color: string }> = {
    active:   { bg: 'rgba(74,222,128,0.15)', color: '#4ade80' },
    trialing: { bg: 'rgba(96,165,250,0.15)', color: '#60a5fa' },
    past_due: { bg: 'rgba(239,68,68,0.15)',  color: '#ef4444' },
    cancelled:{ bg: 'rgba(107,114,128,0.15)',color: '#9ca3af' },
    expired:  { bg: 'rgba(107,114,128,0.15)',color: '#9ca3af' },
  };
  const c = colors[status] ?? { bg: 'rgba(156,163,175,0.15)', color: '#9ca3af' };
  return (
    <span style={{ ...c, padding: '4px 10px', borderRadius: 20, fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
      {status}
    </span>
  );
}

function LimitRow({ label, limit, suffix = '' }: { label: string; limit: number | null; suffix?: string }) {
  return (
    <div style={{ padding: '10px 12px', background: 'var(--surface-soft)', borderRadius: 8 }}>
      <div style={{ fontSize: 10, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{label}</div>
      <div style={{ fontSize: 18, fontWeight: 700, marginTop: 2 }}>
        {limit === null ? '∞' : `${limit}${suffix}`}
      </div>
    </div>
  );
}
