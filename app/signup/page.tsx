'use client';

import { useState, useEffect, useRef } from 'react';
import { RedlineD1Logo } from '@/components/brand/RedlineD1Logo';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';

const VALID_PLANS = new Set(['free', 'solo', 'starter', 'professional', 'business']);
const VALID_PERIODS = new Set(['monthly', 'annual']);

const PLAN_META: Record<string, { name: string; price: string; annualPrice: string; color: string }> = {
  free:         { name: 'Free Forever',  price: 'Free',            annualPrice: 'Free',             color: '#22d3a0' },
  solo:         { name: 'Solo',          price: '$24/mo',          annualPrice: '$240/yr',          color: '#60a5fa' },
  starter:      { name: 'Starter',       price: '$49/mo',          annualPrice: '$490/yr',          color: '#a78bfa' },
  professional: { name: 'Professional',  price: '$99/mo',          annualPrice: '$990/yr',          color: '#cc0000' },
  business:     { name: 'Business',      price: '$179/mo',         annualPrice: '$1,790/yr',        color: '#f59e0b' },
};

export default function SignupPage() {
  const router = useRouter();
  const [name, setName]           = useState('');
  const [shopName, setShopName]   = useState('');
  const [email, setEmail]         = useState('');
  const [password, setPassword]   = useState('');
  const [error, setError]         = useState('');
  const [loading, setLoading]     = useState(false);
  const [success, setSuccess]     = useState(false);
  const [selectedPlan, setSelectedPlan] = useState<string>('free');
  const [period, setPeriod]       = useState<string>('monthly');
  const [consented, setConsented] = useState(false);

  // Resend confirmation state
  const [resending, setResending]       = useState(false);
  const [resendMsg, setResendMsg]       = useState('');
  const [resendCooldown, setResendCooldown] = useState(0);
  const cooldownRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);

    const emailParam = params.get('email');
    if (emailParam) setEmail(decodeURIComponent(emailParam));

    // Accept both ?plan= and ?intent= for plan selection
    const planParam = params.get('plan');
    if (planParam && VALID_PLANS.has(planParam)) setSelectedPlan(planParam);

    // Accept both ?period= and legacy ?billing= for interval
    const periodParam = params.get('period') ?? params.get('billing');
    if (periodParam && VALID_PERIODS.has(periodParam)) setPeriod(periodParam);

    // ?intent=trial or ?intent=free both land on Free Forever
    const intent = params.get('intent');
    if ((intent === 'trial' || intent === 'free') && !planParam) setSelectedPlan('free');
  }, []);

  // Cooldown ticker
  useEffect(() => {
    return () => { if (cooldownRef.current) clearInterval(cooldownRef.current); };
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!consented) { setError('Please accept the Terms and Privacy Policy to continue.'); return; }
    setError('');
    setLoading(true);
    try {
      const { data, error: signUpError } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: { full_name: name, shop_name: shopName },
          emailRedirectTo: selectedPlan !== 'free'
          ? `${window.location.origin}/auth/callback?next=/?plan=${selectedPlan}&period=${period}`
          : `${window.location.origin}/auth/callback`,
        },
      });
      if (signUpError) throw signUpError;
      if (data.user) {
        // Store commercial signup intent in localStorage for recovery after email verification
        const intent: Record<string, string> = {
          intent:    selectedPlan === 'free' ? 'free' : 'paid',
          plan:      selectedPlan,
          period,
          createdAt: new Date().toISOString(),
          expiresAt: new Date(Date.now() + 48 * 3600000).toISOString(),
        };
        try {
          localStorage.setItem('rd1_signup_intent', JSON.stringify(intent));
        } catch { /* unavailable */ }

        // For paid plans: also store pending checkout key (picked up by auth/callback and AppShell)
        if (selectedPlan !== 'free') {
          try {
            localStorage.setItem(
              'rd1_pending_checkout',
              JSON.stringify({ planId: selectedPlan, billingInterval: period }),
            );
          } catch { /* unavailable */ }
        }

        fetch('/api/signup-notify', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name, shopName, email, plan: selectedPlan, period }),
        }).catch(() => {});
      }
      setSuccess(true);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Sign up failed');
    } finally {
      setLoading(false);
    }
  }

  async function handleResend() {
    if (resendCooldown > 0 || resending) return;
    setResending(true);
    setResendMsg('');
    try {
      const { error: resendErr } = await supabase.auth.resend({ type: 'signup', email });
      if (resendErr) throw resendErr;
      setResendMsg('Confirmation email resent. Check your inbox (and spam folder).');
      setResendCooldown(60);
      cooldownRef.current = setInterval(() => {
        setResendCooldown(n => {
          if (n <= 1) { clearInterval(cooldownRef.current!); return 0; }
          return n - 1;
        });
      }, 1000);
    } catch (err: unknown) {
      setResendMsg(err instanceof Error ? err.message : 'Could not resend. Try again shortly.');
    } finally {
      setResending(false);
    }
  }

  const isPaidPlan  = selectedPlan && selectedPlan !== 'free' && PLAN_META[selectedPlan];
  const planMeta    = PLAN_META[selectedPlan] ?? PLAN_META['trial'];
  const displayPrice = period === 'annual' ? planMeta.annualPrice : planMeta.price;

  // ── Confirmation screen ──────────────────────────────────────────────────────
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
          position: 'relative', width: '100%', maxWidth: 500, margin: '0 24px',
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

          {/* Status badge — EMAIL VERIFICATION REQUIRED (not "account activated") */}
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            background: 'rgba(234,179,8,0.12)', border: '1px solid rgba(234,179,8,0.3)',
            borderRadius: 100, padding: '4px 14px', marginBottom: 24,
          }}>
            <div style={{ width: 7, height: 7, borderRadius: '50%', background: '#eab308', boxShadow: '0 0 8px #eab308' }} />
            <span style={{ fontSize: 12, color: '#eab308', fontWeight: 600, letterSpacing: 0.5 }}>EMAIL VERIFICATION REQUIRED</span>
          </div>

          <h1 style={{ fontSize: 26, fontWeight: 800, color: '#fff', margin: '0 0 8px', letterSpacing: '-0.5px' }}>
            Welcome to RedlineD1
          </h1>
          <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: 14, margin: '0 0 24px', lineHeight: 1.6 }}>
            Your account has been created. Confirm your email to activate your account and continue setting up your shop.
          </p>

          {/* Selected plan badge */}
          {isPaidPlan && (
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              padding: '10px 16px', borderRadius: 10, marginBottom: 20,
              background: `${planMeta.color}14`, border: `1px solid ${planMeta.color}44`,
            }}>
              <div style={{ width: 7, height: 7, borderRadius: '50%', background: planMeta.color }} />
              <span style={{ fontSize: 13, fontWeight: 600, color: planMeta.color }}>Selected plan: {planMeta.name}</span>
              <span style={{ fontSize: 13, fontWeight: 800, color: '#fff' }}>{displayPrice}</span>
            </div>
          )}

          {/* Steps */}
          {[
            { n: '1', label: 'Check your inbox', sub: `We sent a confirmation link to ${email || 'your email'}` },
            { n: '2', label: 'Click the confirmation link', sub: 'This verifies your email and activates your account' },
            {
              n: '3',
              label: isPaidPlan ? 'Complete payment' : 'Sign in and explore',
              sub: isPaidPlan
                ? `You'll be redirected to pay for the ${planMeta.name} plan (${displayPrice})`
                : 'Start using RedlineD1 — no credit card required',
            },
          ].map((step, i) => (
            <div key={i} style={{
              display: 'flex', alignItems: 'flex-start', gap: 14,
              textAlign: 'left', marginBottom: 10,
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

          {/* Sign In CTA */}
          <button
            onClick={() => router.push('/login')}
            style={{
              width: '100%', marginTop: 16,
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

          {/* Resend confirmation */}
          <div style={{ marginTop: 20, textAlign: 'center' }}>
            {resendMsg && (
              <p style={{ fontSize: 12, color: resendMsg.startsWith('Confirmation') ? '#22c55e' : '#f87171', marginBottom: 8 }}>
                {resendMsg}
              </p>
            )}
            <button
              onClick={handleResend}
              disabled={resending || resendCooldown > 0}
              style={{
                background: 'none', border: 'none', cursor: resendCooldown > 0 ? 'default' : 'pointer',
                fontSize: 12, color: resendCooldown > 0 ? 'rgba(255,255,255,0.2)' : 'rgba(204,0,0,0.8)',
                textDecoration: 'underline', padding: 0,
              }}
            >
              {resending
                ? 'Sending…'
                : resendCooldown > 0
                  ? `Resend available in ${resendCooldown}s`
                  : "Didn't receive the email? Resend confirmation"}
            </button>
            <p style={{ marginTop: 8, fontSize: 11, color: 'rgba(255,255,255,0.2)' }}>
              Also check your spam or junk folder.
            </p>
          </div>
        </div>
      </div>
    );
  }

  // ── Signup form ──────────────────────────────────────────────────────────────
  return (
    <div className="login-page">
      <div className="login-card">
        <div className="login-logo">
          <a href="/" aria-label="RedlineD1 home" style={{ display: 'inline-block', textDecoration: 'none' }}>
            <RedlineD1Logo height={56} background="dark" animated={true} />
          </a>
          <span className="login-logo-sub">
            {isPaidPlan
              ? `Get ${planMeta.name} — ${displayPrice}`
              : 'Start Free — No Credit Card'}
          </span>
        </div>

        {/* Selected plan indicator */}
        {isPaidPlan && (
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '10px 16px', marginBottom: 20, borderRadius: 10,
            background: `${planMeta.color}14`,
            border: `1px solid ${planMeta.color}44`,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ width: 8, height: 8, borderRadius: '50%', background: planMeta.color, boxShadow: `0 0 8px ${planMeta.color}` }} />
              <span style={{ fontSize: 13, fontWeight: 700, color: planMeta.color }}>
                {planMeta.name} — {period === 'annual' ? 'Annual' : 'Monthly'}
              </span>
            </div>
            <span style={{ fontSize: 13, fontWeight: 800, color: '#fff' }}>
              {displayPrice}
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

          {/* Terms + Privacy consent — required */}
          <label style={{
            display: 'flex', alignItems: 'flex-start', gap: 10, cursor: 'pointer',
            fontSize: 12, color: '#999', lineHeight: 1.5, marginBottom: 8,
          }}>
            <input
              type="checkbox"
              checked={consented}
              onChange={e => setConsented(e.target.checked)}
              style={{ marginTop: 2, accentColor: '#cc0000', flexShrink: 0, width: 14, height: 14 }}
            />
            <span>
              I agree to the{' '}
              <a href="/terms" style={{ color: '#cc0000', textDecoration: 'underline' }} target="_blank" rel="noopener">Terms of Service</a>,{' '}
              <a href="/privacy" style={{ color: '#cc0000', textDecoration: 'underline' }} target="_blank" rel="noopener">Privacy Policy</a>, and{' '}
              <a href="/refund-policy" style={{ color: '#cc0000', textDecoration: 'underline' }} target="_blank" rel="noopener">Refund Policy</a>.
            </span>
          </label>

          {error && <p className="login-error">{error}</p>}

          <button type="submit" className="login-btn" disabled={loading || !consented}>
            {loading
              ? 'Creating account…'
              : isPaidPlan
                ? `Get ${planMeta.name} — ${displayPrice}`
                : 'Start Free'}
          </button>

          <p style={{ textAlign: 'center', fontSize: 12, color: '#999', marginTop: 12 }}>
            {isPaidPlan
              ? 'After creating your account, confirm your email to proceed to payment.'
              : 'Free Forever — core features included. No credit card required.'}
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
