'use client';

import { useState } from 'react';

interface Props {
  /** Label shown on the button. */
  label?: string;
  variant?: 'primary' | 'secondary';
  returnUrl?: string;
}

/**
 * Opens the billing portal in a new tab.
 * Calls /api/billing/portal — no direct Creem or Stripe dependency.
 */
export function BillingPortalButton({
  label = 'Manage Billing',
  variant = 'secondary',
  returnUrl,
}: Props) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function openPortal() {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/billing/portal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ returnUrl }),
      });
      const data = await res.json() as { url?: string; error?: string };
      if (!res.ok || !data.url) {
        throw new Error(data.error ?? 'Failed to open billing portal');
      }
      window.open(data.url, '_blank', 'noopener,noreferrer');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong');
    } finally {
      setLoading(false);
    }
  }

  const isPrimary = variant === 'primary';

  return (
    <div>
      <button
        onClick={openPortal}
        disabled={loading}
        style={{
          background: isPrimary ? '#cc0000' : 'transparent',
          color: isPrimary ? '#fff' : 'var(--text)',
          border: isPrimary ? 'none' : '1px solid var(--line)',
          borderRadius: 8, padding: '9px 20px',
          fontWeight: 700, fontSize: 13,
          cursor: loading ? 'not-allowed' : 'pointer',
          opacity: loading ? 0.7 : 1,
          transition: 'all 0.15s',
        }}
      >
        {loading ? 'Opening…' : label}
      </button>
      {error && (
        <div style={{ marginTop: 6, fontSize: 12, color: '#ef4444' }}>{error}</div>
      )}
    </div>
  );
}
