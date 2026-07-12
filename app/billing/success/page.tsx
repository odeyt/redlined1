'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';

type SubscriptionStatus = 'active' | 'trialing' | 'pending' | 'unknown';

interface BillingStatusResponse {
  status?: SubscriptionStatus;
  planId?: string;
  error?: string;
}

const MAX_POLLS = 12;        // up to 12 attempts
const POLL_INTERVAL_MS = 2500; // every 2.5 s = 30 s total

export default function BillingSuccessPage() {
  const [status, setStatus] = useState<'polling' | 'confirmed' | 'timeout'>('polling');
  const [planId, setPlanId] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  const pollStatus = useCallback(async () => {
    try {
      const res = await fetch('/api/billing/status');
      if (!res.ok) return false;
      const data: BillingStatusResponse = await res.json();
      if (data.status === 'active' || data.status === 'trialing') {
        setPlanId(data.planId ?? null);
        return true;
      }
      return false;
    } catch {
      return false;
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    let count = 0;

    async function tick() {
      if (cancelled) return;
      count++;
      setAttempt(count);

      const confirmed = await pollStatus();
      if (confirmed) {
        setStatus('confirmed');
        return;
      }
      if (count >= MAX_POLLS) {
        setStatus('timeout');
        return;
      }
      setTimeout(tick, POLL_INTERVAL_MS);
    }

    tick();
    return () => { cancelled = true; };
  }, [pollStatus]);

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: '#f9fafb',
      padding: '24px',
    }}>
      <div style={{
        background: '#ffffff',
        border: '1px solid #e5e7eb',
        borderRadius: '16px',
        padding: '48px 40px',
        maxWidth: '480px',
        width: '100%',
        textAlign: 'center',
        boxShadow: '0 4px 24px rgba(0,0,0,0.06)',
      }}>
        {status === 'polling' && (
          <>
            <div style={{ fontSize: '40px', marginBottom: '16px' }}>⏳</div>
            <h1 style={{ fontSize: '22px', fontWeight: 700, color: '#111', margin: '0 0 8px' }}>
              Activating your plan…
            </h1>
            <p style={{ color: '#6b7280', fontSize: '14px', lineHeight: 1.6 }}>
              Payment confirmed. We&apos;re waiting for Creem to activate your subscription.
              This usually takes a few seconds.
            </p>
            <div style={{
              marginTop: '24px',
              height: '4px',
              background: '#f3f4f6',
              borderRadius: '9999px',
              overflow: 'hidden',
            }}>
              <div style={{
                height: '100%',
                background: '#cc0000',
                borderRadius: '9999px',
                width: `${Math.min((attempt / MAX_POLLS) * 100, 95)}%`,
                transition: 'width 0.5s ease',
              }} />
            </div>
            <p style={{ color: '#9ca3af', fontSize: '12px', marginTop: '8px' }}>
              Check {attempt} of {MAX_POLLS}
            </p>
          </>
        )}

        {status === 'confirmed' && (
          <>
            <div style={{ fontSize: '48px', marginBottom: '16px' }}>✅</div>
            <h1 style={{ fontSize: '24px', fontWeight: 700, color: '#111', margin: '0 0 8px' }}>
              You&apos;re all set!
            </h1>
            <p style={{ color: '#6b7280', fontSize: '15px', lineHeight: 1.6, marginBottom: '24px' }}>
              {planId
                ? `Your ${planId.replace('_', ' ')} plan is now active.`
                : 'Your subscription is now active.'}
              {' '}Welcome to Redlined1.
            </p>
            <Link
              href="/"
              style={{
                display: 'inline-block',
                background: '#cc0000',
                color: '#fff',
                fontWeight: 600,
                fontSize: '15px',
                padding: '12px 28px',
                borderRadius: '8px',
                textDecoration: 'none',
              }}
            >
              Go to Dashboard
            </Link>
          </>
        )}

        {status === 'timeout' && (
          <>
            <div style={{ fontSize: '40px', marginBottom: '16px' }}>⚠️</div>
            <h1 style={{ fontSize: '22px', fontWeight: 700, color: '#111', margin: '0 0 8px' }}>
              Still activating…
            </h1>
            <p style={{ color: '#6b7280', fontSize: '14px', lineHeight: 1.6, marginBottom: '24px' }}>
              Your payment was received but the subscription is still processing.
              It may take a minute longer. Check your dashboard or email{' '}
              <a href="mailto:admin@redlined1.com" style={{ color: '#cc0000' }}>admin@redlined1.com</a>{' '}
              if this persists.
            </p>
            <div style={{ display: 'flex', gap: '12px', justifyContent: 'center', flexWrap: 'wrap' }}>
              <Link
                href="/"
                style={{
                  display: 'inline-block',
                  background: '#cc0000',
                  color: '#fff',
                  fontWeight: 600,
                  fontSize: '14px',
                  padding: '10px 20px',
                  borderRadius: '8px',
                  textDecoration: 'none',
                }}
              >
                Go to Dashboard
              </Link>
              <button
                onClick={() => { setStatus('polling'); setAttempt(0); }}
                style={{
                  background: 'none',
                  border: '1px solid #e5e7eb',
                  borderRadius: '8px',
                  padding: '10px 20px',
                  fontSize: '14px',
                  cursor: 'pointer',
                  color: '#374151',
                  fontWeight: 500,
                }}
              >
                Check again
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
