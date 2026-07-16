'use client';

import { useEffect, useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

type ActivationState = 'processing' | 'active' | 'failed' | 'timeout';

const MAX_POLLS = 20;      // 20 × 3 s = 60 s max
const POLL_INTERVAL = 3000; // ms

export default function BillingSuccessPage() {
  const router = useRouter();
  const [state, setState] = useState<ActivationState>('processing');
  const [pollCount, setPollCount] = useState(0);
  const [planName, setPlanName] = useState<string | null>(null);
  const [interval, setIntervalLabel] = useState<string | null>(null);
  const [renewalDate, setRenewalDate] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let count = 0;

    async function poll() {
      try {
        const res = await fetch('/api/billing/status', { credentials: 'include' });
        if (!res.ok) {
          // Not authenticated or shop not found — bail
          if (res.status === 401 || res.status === 403) { setState('failed'); return; }
          schedule();
          return;
        }
        const data = await res.json() as {
          status?: string;
          planKey?: string;
          billingInterval?: string;
          currentPeriodEnd?: string;
        };

        if (data.status === 'active') {
          setPlanName(data.planKey ?? null);
          setIntervalLabel(data.billingInterval ?? null);
          if (data.currentPeriodEnd) {
            setRenewalDate(new Date(data.currentPeriodEnd).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' }));
          }
          setState('active');
          return;
        }

        schedule();
      } catch {
        schedule();
      }
    }

    function schedule() {
      count += 1;
      setPollCount(count);
      if (count >= MAX_POLLS) { setState('timeout'); return; }
      timerRef.current = setTimeout(poll, POLL_INTERVAL);
    }

    // First poll immediately
    void poll();

    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, []);

  // ── Processing state ─────────────────────────────────────────────────────────
  if (state === 'processing') {
    const progress = Math.min(100, Math.round((pollCount / MAX_POLLS) * 100));
    return (
      <div style={s.page}>
        <div style={s.card}>
          <div style={{ ...s.icon, background: '#1d4ed8' }}>
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5">
              <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" strokeLinecap="round"/>
            </svg>
          </div>
          <h1 style={s.h1}>Activating Your Subscription</h1>
          <p style={s.body}>We&apos;re confirming your payment with our billing provider. This usually takes a few seconds.</p>
          <div style={{ width: '100%', background: 'var(--line)', borderRadius: 6, height: 6, margin: '16px 0 8px', overflow: 'hidden' }}>
            <div style={{ width: `${progress}%`, background: '#1d4ed8', height: '100%', borderRadius: 6, transition: 'width 0.5s' }} />
          </div>
          <p style={s.sub}>Checking activation status… ({pollCount}/{MAX_POLLS})</p>
          <p style={{ ...s.sub, marginTop: 8 }}>Do not close this page.</p>
        </div>
      </div>
    );
  }

  // ── Active / success state ───────────────────────────────────────────────────
  if (state === 'active') {
    const planLabel = planName
      ? planName.charAt(0).toUpperCase() + planName.slice(1)
      : 'Your plan';
    return (
      <div style={s.page}>
        <div style={s.card}>
          <div style={{ ...s.icon, background: '#16a34a' }}>
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5">
              <path d="M5 13l4 4L19 7" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </div>
          <h1 style={s.h1}>Subscription Active</h1>
          <p style={s.body}>Your RedlineD1 subscription is active. All features for your plan are unlocked.</p>

          {(planName || interval || renewalDate) && (
            <div style={{ background: 'rgba(22,163,74,0.08)', border: '1px solid rgba(22,163,74,0.2)', borderRadius: 10, padding: '16px', marginTop: 16, textAlign: 'left' }}>
              {planName && (
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                  <span style={{ fontSize: 13, color: 'var(--muted)' }}>Plan</span>
                  <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>{planLabel}</span>
                </div>
              )}
              {interval && (
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                  <span style={{ fontSize: 13, color: 'var(--muted)' }}>Billing</span>
                  <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>{interval === 'annual' ? 'Annual' : 'Monthly'}</span>
                </div>
              )}
              {renewalDate && (
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: 13, color: 'var(--muted)' }}>Next renewal</span>
                  <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>{renewalDate}</span>
                </div>
              )}
            </div>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 24 }}>
            <button
              onClick={() => router.push('/')}
              style={{ padding: '13px 0', background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 8, fontWeight: 700, fontSize: 14, cursor: 'pointer' }}
            >
              Go to Dashboard →
            </button>
            <Link href="/billing" style={{ display: 'block', padding: '11px 0', background: 'transparent', color: 'var(--muted)', border: '1px solid var(--line)', borderRadius: 8, fontWeight: 600, fontSize: 13, textDecoration: 'none', textAlign: 'center' }}>
              Manage Subscription
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // ── Timeout state ────────────────────────────────────────────────────────────
  if (state === 'timeout') {
    return (
      <div style={s.page}>
        <div style={s.card}>
          <div style={{ ...s.icon, background: '#d97706' }}>
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5">
              <path d="M12 8v4l3 3" strokeLinecap="round"/>
              <circle cx="12" cy="12" r="9"/>
            </svg>
          </div>
          <h1 style={s.h1}>Still Activating…</h1>
          <p style={s.body}>Your payment was received but activation is taking longer than expected. Your subscription will be active shortly.</p>
          <p style={s.sub}>If this persists after a few minutes, contact support with your receipt.</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 20 }}>
            <button
              onClick={() => { setState('processing'); setPollCount(0); }}
              style={{ padding: '13px 0', background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 8, fontWeight: 700, fontSize: 14, cursor: 'pointer' }}
            >
              Check Again
            </button>
            <Link href="/" style={{ display: 'block', padding: '11px 0', background: 'transparent', color: 'var(--muted)', border: '1px solid var(--line)', borderRadius: 8, fontWeight: 600, fontSize: 13, textDecoration: 'none', textAlign: 'center' }}>
              Go to Dashboard
            </Link>
            <a href="mailto:support@redlined1.com" style={{ display: 'block', padding: '11px 0', color: 'var(--muted)', fontSize: 12, textDecoration: 'none', textAlign: 'center' }}>
              Contact Support
            </a>
          </div>
        </div>
      </div>
    );
  }

  // ── Failed state ─────────────────────────────────────────────────────────────
  return (
    <div style={s.page}>
      <div style={s.card}>
        <div style={{ ...s.icon, background: '#dc2626' }}>
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5">
            <path d="M18 6L6 18M6 6l12 12" strokeLinecap="round"/>
          </svg>
        </div>
        <h1 style={s.h1}>Activation Issue</h1>
        <p style={s.body}>We could not confirm your subscription status. If you completed payment, please contact support with your receipt.</p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 20 }}>
          <Link href="/billing" style={{ display: 'block', padding: '13px 0', background: 'var(--accent)', color: '#fff', borderRadius: 8, fontWeight: 700, fontSize: 14, textDecoration: 'none', textAlign: 'center' }}>
            View Billing
          </Link>
          <a href="mailto:support@redlined1.com" style={{ display: 'block', padding: '11px 0', color: 'var(--muted)', fontSize: 12, textDecoration: 'none', textAlign: 'center' }}>
            Contact Support
          </a>
        </div>
      </div>
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  page: {
    minHeight: '100vh', background: 'var(--bg)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    padding: '2rem 1rem', fontFamily: 'Inter, ui-sans-serif, system-ui, sans-serif',
  },
  card: {
    background: 'var(--surface)', border: '1px solid var(--line)',
    borderRadius: 14, padding: '3rem 2.5rem',
    maxWidth: 440, width: '100%', textAlign: 'center',
    boxShadow: 'var(--shadow)',
  },
  icon: {
    width: 64, height: 64, borderRadius: '50%',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    margin: '0 auto 1.5rem',
  },
  h1: {
    fontSize: '1.375rem', fontWeight: 800, letterSpacing: '-0.02em',
    margin: '0 0 0.75rem', color: 'var(--text)',
  },
  body: {
    fontSize: '0.9375rem', lineHeight: 1.6, color: 'var(--text)',
    margin: '0 0 0.25rem',
  },
  sub: {
    fontSize: '0.8125rem', color: 'var(--muted)', margin: '0.5rem 0 0',
  },
};
