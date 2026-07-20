'use client';

import { useEffect, useState } from 'react';
import { FREE_LIMITS, FREE_LIMIT_LABELS } from '@/lib/freeLimits';
import type { FreeLimitKey } from '@/lib/freeLimits';

interface UsageData {
  plan: string;
  resetDate: string;
  limits: typeof FREE_LIMITS | null;
  usage: Record<string, number>;
}

interface UpgradeModalProps {
  limitKey: FreeLimitKey;
  onClose: () => void;
  onUpgrade?: () => void;
}

function UsageBar({ used, limit }: { used: number; limit: number }) {
  const pct = Math.min(100, Math.round((used / limit) * 100));
  const color = pct >= 100 ? '#ef4444' : pct >= 80 ? '#f59e0b' : '#22d3a0';
  return (
    <div style={{ marginTop: 4 }}>
      <div style={{ height: 4, background: 'var(--surface-soft)', borderRadius: 2, overflow: 'hidden' }}>
        <div style={{ width: `${pct}%`, height: '100%', background: color, borderRadius: 2, transition: 'width 0.3s' }} />
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 3, fontSize: 11, color: 'var(--muted)' }}>
        <span style={{ color }}>{used} used</span>
        <span>{limit} limit</span>
      </div>
    </div>
  );
}

export function UpgradeModal({ limitKey, onClose, onUpgrade }: UpgradeModalProps) {
  const [usageData, setUsageData] = useState<UsageData | null>(null);

  useEffect(() => {
    fetch('/api/billing/usage')
      .then(r => r.json())
      .then(d => setUsageData(d))
      .catch(() => {});
  }, []);

  const limit = FREE_LIMITS[limitKey];
  const used = usageData?.usage?.[limitKey] ?? 0;
  const resetDate = usageData?.resetDate;

  const SOLO_BENEFITS = [
    'Unlimited customers & vehicles',
    '200 completed jobs / mo',
    '50 AI cases / mo',
    '20 VIN lookups / mo',
    'Unlimited appointments',
    '20 digital inspections / mo',
    '5 GB storage',
    '1 technician',
  ];

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)',
          backdropFilter: 'blur(4px)', zIndex: 1000,
        }}
      />

      {/* Modal */}
      <div style={{
        position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)',
        zIndex: 1001, width: '100%', maxWidth: 480, margin: '0 16px',
        background: 'var(--surface)', border: '1px solid var(--line)',
        borderRadius: 16, overflow: 'hidden',
        boxShadow: '0 24px 64px rgba(0,0,0,0.5)',
      }}>
        {/* Header */}
        <div style={{
          background: 'linear-gradient(135deg, #cc0000 0%, #7c0000 100%)',
          padding: '20px 24px',
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.6)', letterSpacing: '0.08em', marginBottom: 4 }}>FREE PLAN LIMIT REACHED</div>
              <div style={{ fontSize: 20, fontWeight: 800, color: '#fff' }}>
                {FREE_LIMIT_LABELS[limitKey]} Limit
              </div>
            </div>
            <button
              onClick={onClose}
              style={{
                background: 'rgba(255,255,255,0.15)', border: 'none', borderRadius: 8,
                width: 32, height: 32, cursor: 'pointer', color: '#fff', fontSize: 16,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}
            >
              ✕
            </button>
          </div>
        </div>

        <div style={{ padding: '20px 24px' }}>
          {/* Current usage */}
          <div style={{
            background: 'var(--surface-soft)', borderRadius: 10,
            padding: '14px 16px', marginBottom: 20,
          }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text)', marginBottom: 8 }}>
              Your current usage
            </div>
            <UsageBar used={used} limit={limit} />
            {resetDate && (
              <div style={{ marginTop: 8, fontSize: 11, color: 'var(--muted)' }}>
                Monthly counters reset on {new Date(resetDate).toLocaleDateString('en-US', { month: 'long', day: 'numeric' })}
              </div>
            )}
          </div>

          {/* Solo plan benefits */}
          <div style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--muted)', letterSpacing: '0.06em', marginBottom: 10 }}>
              UPGRADE TO SOLO — $24/MO
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px 12px' }}>
              {SOLO_BENEFITS.map(b => (
                <div key={b} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
                  <span style={{ color: '#22c55e', fontWeight: 700, flexShrink: 0 }}>✓</span>
                  <span style={{ color: 'var(--muted)' }}>{b}</span>
                </div>
              ))}
            </div>
          </div>

          <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 16 }}>
            Your existing records are safe — upgrading or staying free never deletes data.
          </div>

          {/* CTAs */}
          <div style={{ display: 'flex', gap: 10 }}>
            <button
              onClick={onClose}
              style={{
                flex: 1, padding: '11px 0', background: 'none',
                border: '1px solid var(--line)', borderRadius: 10,
                color: 'var(--muted)', fontSize: 13, fontWeight: 600, cursor: 'pointer',
              }}
            >
              Maybe later
            </button>
            <button
              onClick={() => {
                if (onUpgrade) { onUpgrade(); return; }
                window.location.href = '/subscriptions';
              }}
              style={{
                flex: 2, padding: '11px 0',
                background: 'linear-gradient(135deg, #cc0000, #ff2222)',
                border: 'none', borderRadius: 10, color: '#fff',
                fontSize: 13, fontWeight: 700, cursor: 'pointer',
                boxShadow: '0 4px 16px rgba(204,0,0,0.4)',
              }}
            >
              Upgrade to Solo →
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
