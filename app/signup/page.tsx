'use client';

import { useState, useEffect } from 'react';
import { RedlineD1Logo } from '@/components/brand/RedlineD1Logo';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';

const PLAN_META: Record<string, { name: string; price: string; color: string }> = {
  trial:        { name: 'Free Trial',    price: 'Free for 7 days', color: '#22d3a0' },
  solo:         { name: 'Solo',          price: '$24/mo',          color: '#60a5fa' },
  starter:      { name: 'Starter',       price: '$49/mo',          color: '#a78bfa' },
  professional: { name: 'Professional',  price: '$99/mo',          color: '#cc0000' },
  business:     { name: 'Business',      price: '$179/mo',         color: '#f59e0b' },
  enterprise:   { name: 'Enterprise',    price: 'Custom',          color: '#e74c3c' },
};

export default function SignupPage() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [shopName, setShopName] = useState('');
  const [email, setEmail] = useState('');
  const [selectedPlan, setSelectedPlan] = useState<string>('trial');

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const prefill = params.get('email');
    if (prefill) setEmail(decodeURIComponent(prefill));
    const plan = params.get('plan');
    if (plan && PLAN_META[plan]) setSelectedPlan(plan);
  }, []);

  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const { data, error: signUpError } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: { full_name: name, shop_name: shopName },
          emailRedirectTo: `${window.location.origin}/auth/callback`,
        },
      });
      if (signUpError) throw signUpError;
      if (data.user) {
        await supabase.from('profiles').upsert({
          id: data.user.id,
          email,
          plan: 'trial',
          trial_ends_at: new Date(Date.now() + 7 * 86400000).toISOString(),
          shop_name: shopName,
        });

        fetch('/api/signup-notify', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name, shopName, email, plan: selectedPlan }),
        }).catch(() => {});

        // For paid plans: store the pending checkout so auth/callback fires
        // it immediately after the user clicks the confirmation email link.
        const isPaid = selectedPlan && selectedPlan !== 'trial';
        if (isPaid) {
          const urlParams = new URLSearchParams(window.location.search);
          const billingInterval = urlParams.get('billing') || 'monthly';
          try {
            localStorage.setItem('rd1_pending_checkout', JSON.stringify({ planId: selectedPlan, billingInterval }));
          } catch { /* localStorage unavailable */ }
        }
      }
      setSuccess(true);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Sign up failed');
    } finally {
      setLoading(false);
    }
  }

  const isPaidPlan = selectedPlan && selectedPlan !== 'trial' && PLAN_META[selectedPlan];

  if (success) {
    return (
      <div style={{
        minHeight: '100vh', background: '#000',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontFamily: "'Inter', system-ui, sans-serif",
        overflow: 'hidden', position: 'relative',
      }}>
        <div style={{
          position: 'absolute', inset: 0,
          backgroundImage: 'linear-gradient(rgba(204,0,0,0.07) 1px, transparent 1px), linear-gradient(90deg, rgba(204,0,0,0.07) 1px, transparent 1px)',
          backgroundSize: '40px 40px',
          maskImage: 'radial-gradient(ellipse 80% 80% at 50% 50%, black 40%, transparent 100%)',
        }} />
        <div style={{
          position: 'absolute', top: '30%', left: '50%',
          transform: 'translate(-50%, -50%)',
          width: 600, height: 600,
          background: 'radial-gradient(circle, rgba(204,0,0,0.18) 0%, transparent 70%)',
          pointerEvents: 'none',
        }} />

        <div style={{
          position: 'relative', width: '100%', maxWidth: 480, margin: '0 24px',
          background: 'rgba(255,255,255,0.03)',
          border: '1px solid rgba(204,0,0,0.3)', borderRadius: 20,
          padding: '48px 40px', backdropFilter: 'blur(20px)',
          boxShadow: '0 0 60px rgba(204,0,0,0.15), 0 0 0 1px rgba(255,255,255,0.05) inset',
          textAlign: 'center',
        }}>
          <div style={{
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            width: 64, height: 64, borderRadius: 16,
            background: 'linear-gradient(135deg, #cc0000, #ff3333)',
            marginBottom: 28, boxShadow: '0 8px 32px rgba(204,0,0,0.4)',
          }}>
            <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
              <path d="M6 8h12a6 6 0 010 12H6V8z" fill="white" fillOpacity="0.9"/>
              <circle cx="22" cy="22" r="4" fill="white" fillOpacity="0.5"/>
            </svg>
          </div>

          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            background: 'rgba(34,197,94,0.12)', border: '1px solid rgba(34,197,94,0.3)',
            borderRadius: 100, padding: '4px 14px', marginBottom: 24,
          }}>
            <div style={{ width: 7, height: 7, borderRadius: '50%', background: '#22c55e', boxShadow: '0 0 8px #22c55e' }} />
            <span style={{ fontSize: 12, color: '#22c55e', fontWeight: 600, letterSpacing: 0.5 }}>ACCOUNT CREATED</span>
          </div>

          <h1 style={{ fontSize: 28, fontWeight: 800, color: '#fff', margin: '0 0 8px', letterSpacing: '-0.5px' }}>
            Welcome to RedlineD1
          </h1>
          <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: 14, margin: '0 0 32px', lineHeight: 1.6 }}>
            {isPaidPlan
              ? `One step left — confirm your email and you'll be taken directly to payment for the ${PLAN_META[selectedPlan].name} plan.`
              : 'Your 7-day full-access trial is ready. One step left — confirm your email to unlock the platform.'}
          </p>

          {[
            {
              n: '1', label: 'Check your inbox',
              sub: `We sent a confirmation link to ${email || 'your email'}`,
            },
            {
              n: '2', label: 'Click the confirmation link',
              sub: 'This verifies your email address',
            },
            {
              n: '3',
              label: isPaidPlan ? 'Complete payment' : 'Sign in & explore',
              sub: isPaidPlan
                ? `You'll be redirected to pay for the ${PLAN_META[selectedPlan].name} plan`
                : 'Full access to all features for 7 days',
            },
          ].map((step, i) => (
            <div key={i} style={{
              display: 'flex', alignItems: 'flex-start', gap: 14,
              textAlign: 'left', marginBottom: 12,
              padding: '14px 16px',
              background: 'rgba(255,255,255,0.03)',
              border: '1px solid rgba(255,255,255,0.06)', borderRadius: 12,
            }}>
              <div style={{
                width: 28, height: 28, borderRadius: '50%', flexShrink: 0,
                background: 'rgba(204,0,0,0.2)', border: '1px solid rgba(204,0,0,0.5)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 12, fontWeight: 700, color: '#ff4444',
              }}>{step.n}</div>
              <div>
                <div style={{ fontSize: 14, fontWeight: 600, color: '#fff', marginBottom: 2 }}>{step.label}</div>
                <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)' }}>{step.sub}</div>
              </div>
            </div>
          ))}

          {!isPaidPlan && (
            <button
              onClick={() => router.push('/login')}
              style={{
                width: '100%', marginTop: 8,
                padding: '15px 24px',
                background: 'linear-gradient(135deg, #cc0000, #ff2222)',
                border: 'none', borderRadius: 12,
                color: '#fff', fontSize: 15, fontWeight: 700,
                cursor: 'pointer',
                boxShadow: '0 4px 24px rgba(204,0,0,0.4)',
              }}
            >
              Go to Sign In →
            </button>
          )}

          <p style={{ marginTop: 20, fontSize: 12, color: 'rgba(255,255,255,0.25)' }}>
            Didn&apos;t receive the email? Check your spam folder or{' '}
            <a href="/signup" style={{ color: 'rgba(204,0,0,0.8)', textDecoration: 'none' }}>try again</a>.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="login-logo">
          <a href="/landing-preview" aria-label="RedlineD1 home" style={{ display: 'inline-block', textDecoration: 'none' }}>
            <RedlineD1Logo height={56} background="dark" animated={true} />
          </a>
          <span className="login-logo-sub">
            {isPaidPlan ? `Get ${PLAN_META[selectedPlan].name} — ${PLAN_META[selectedPlan].price}` : 'Start Your Free 7-Day Trial'}
          </span>
        </div>

        {isPaidPlan && (
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '10px 16px', marginBottom: 20, borderRadius: 10,
            background: `${PLAN_META[selectedPlan].color}14`,
            border: `1px solid ${PLAN_META[selectedPlan].color}44`,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ width: 8, height: 8, borderRadius: '50%', background: PLAN_META[selectedPlan].color, boxShadow: `0 0 8px ${PLAN_META[selectedPlan].color}` }} />
              <span style={{ fontSize: 13, fontWeight: 700, color: PLAN_META[selectedPlan].color }}>
                {PLAN_META[selectedPlan].name} Plan
              </span>
            </div>
            <span style={{ fontSize: 13, fontWeight: 800, color: '#fff' }}>
              {PLAN_META[selectedPlan].price}
            </span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="login-form">
          <div className="login-field">
            <label htmlFor="name">Your Name</label>
            <input id="name" type="text" required value={name}
              onChange={e => setName(e.target.value)} placeholder="Jane Smith" />
          </div>
          <div className="login-field">
            <label htmlFor="shop">Shop Name</label>
            <input id="shop" type="text" required value={shopName}
              onChange={e => setShopName(e.target.value)} placeholder="Smith Auto Repair" />
          </div>
          <div className="login-field">
            <label htmlFor="email">Email</label>
            <input id="email" type="email" autoComplete="email" required value={email}
              onChange={e => setEmail(e.target.value)} placeholder="you@yourshop.com" />
          </div>
          <div className="login-field">
            <label htmlFor="password">Password</label>
            <input id="password" type="password" autoComplete="new-password" required
              minLength={6} value={password}
              onChange={e => setPassword(e.target.value)} placeholder="Min. 6 characters" />
          </div>

          {error && <p className="login-error">{error}</p>}

          <button type="submit" className="login-btn" disabled={loading}>
            {loading
              ? 'Creating account…'
              : isPaidPlan
                ? `Get ${PLAN_META[selectedPlan].name} — ${PLAN_META[selectedPlan].price}`
                : 'Start Free Trial'}
          </button>

          <p style={{ textAlign: 'center', fontSize: 12, color: '#999', marginTop: 16 }}>
            {isPaidPlan
              ? 'After creating your account, confirm your email to proceed to payment.'
              : 'After 7 days, free plan continues with core features. No credit card required.'}
          </p>

          <p style={{ textAlign: 'center', fontSize: 11, color: '#777', marginTop: 12, lineHeight: 1.6 }}>
            By continuing, you agree to our{' '}
            <a href="/terms" style={{ color: '#999', textDecoration: 'underline' }}>Terms</a>,{' '}
            <a href="/privacy" style={{ color: '#999', textDecoration: 'underline' }}>Privacy Policy</a>, and{' '}
            <a href="/refund-policy" style={{ color: '#999', textDecoration: 'underline' }}>Refund Policy</a>.
          </p>
        </form>

        <p style={{ textAlign: 'center', fontSize: 13, color: '#888', marginTop: 16 }}>
          Already have an account?{' '}
          <a href="/login" style={{ color: '#cc0000', fontWeight: 600 }}>Sign in</a>
        </p>
      </div>
    </div>
  );
}
