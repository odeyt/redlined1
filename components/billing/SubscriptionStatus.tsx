'use client';

import type { SubscriptionStatus } from '@/lib/payments/types';

interface Props {
  status: SubscriptionStatus | null;
  planName?: string;
  periodEnd?: string | null;
  cancelAtPeriodEnd?: boolean;
  trialEnd?: string | null;
}

const STATUS_CONFIG: Record<SubscriptionStatus, { label: string; color: string; bg: string }> = {
  active:     { label: 'Active',      color: '#22c55e', bg: 'rgba(34,197,94,0.12)' },
  trialing:   { label: 'Trial',       color: '#3b82f6', bg: 'rgba(59,130,246,0.12)' },
  past_due:   { label: 'Past Due',    color: '#f59e0b', bg: 'rgba(245,158,11,0.12)' },
  canceled:   { label: 'Canceled',    color: '#6b7280', bg: 'rgba(107,114,128,0.12)' },
  unpaid:     { label: 'Unpaid',      color: '#ef4444', bg: 'rgba(239,68,68,0.12)' },
  incomplete: { label: 'Incomplete',  color: '#f59e0b', bg: 'rgba(245,158,11,0.12)' },
  expired:    { label: 'Expired',     color: '#6b7280', bg: 'rgba(107,114,128,0.12)' },
  unknown:    { label: 'Unknown',     color: '#6b7280', bg: 'rgba(107,114,128,0.12)' },
};

function fmt(iso: string | null | undefined): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export function SubscriptionStatus({ status, planName, periodEnd, cancelAtPeriodEnd, trialEnd }: Props) {
  const cfg = status ? STATUS_CONFIG[status] : null;

  return (
    <div style={{
      background: 'var(--surface)', border: '1px solid var(--line)',
      borderRadius: 10, padding: '16px 20px', display: 'flex',
      flexDirection: 'column', gap: 10,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <div style={{ fontWeight: 700, fontSize: 14 }}>
            {planName ?? 'No active plan'}
          </div>
          {status === 'trialing' && trialEnd && (
            <div style={{ fontSize: 12, color: '#3b82f6', marginTop: 2 }}>
              Trial ends {fmt(trialEnd)}
            </div>
          )}
          {status === 'active' && periodEnd && (
            <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>
              {cancelAtPeriodEnd
                ? `Cancels ${fmt(periodEnd)}`
                : `Renews ${fmt(periodEnd)}`}
            </div>
          )}
        </div>
        {cfg && (
          <span style={{
            fontSize: 11, fontWeight: 800, padding: '3px 10px', borderRadius: 20,
            background: cfg.bg, color: cfg.color,
            border: `1px solid ${cfg.color}`,
            letterSpacing: '0.05em', textTransform: 'uppercase',
          }}>
            {cfg.label}
          </span>
        )}
      </div>

      {status === 'past_due' && (
        <div style={{
          fontSize: 12, color: '#f59e0b',
          background: 'rgba(245,158,11,0.08)', borderRadius: 7, padding: '8px 12px',
        }}>
          ⚠ Payment past due. Please update your payment method to avoid service interruption.
        </div>
      )}
      {status === 'unpaid' && (
        <div style={{
          fontSize: 12, color: '#ef4444',
          background: 'rgba(239,68,68,0.08)', borderRadius: 7, padding: '8px 12px',
        }}>
          ✕ Subscription unpaid. Access may be restricted. Please update billing.
        </div>
      )}
      {cancelAtPeriodEnd && status === 'active' && (
        <div style={{
          fontSize: 12, color: '#f59e0b',
          background: 'rgba(245,158,11,0.08)', borderRadius: 7, padding: '8px 12px',
        }}>
          Your subscription will cancel on {fmt(periodEnd)}. You can resume anytime before then.
        </div>
      )}
    </div>
  );
}
