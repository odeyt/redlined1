'use client';

import { useState, useEffect } from 'react';
import { RedlineD1Logo } from '@/components/brand/RedlineD1Logo';
import { supabase } from '@/lib/supabase';

type Step = 'form' | 'not-found' | 'sent';

export default function ForgotPasswordPage() {
  const [email, setEmail]         = useState('');
  const [step, setStep]           = useState<Step>('form');
  const [error, setError]         = useState('');
  const [loading, setLoading]     = useState(false);
  const [linkExpired, setLinkExpired] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('error') === 'link_expired') setLinkExpired(true);
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      // Check if email exists — fail open so a missing service key never blocks the form
      let emailExists: boolean | null = null;
      try {
        const res = await fetch('/api/auth/check-email', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email }),
        });
        if (res.status === 429) {
          setError('Too many attempts. Please wait a minute and try again.');
          return;
        }
        if (res.ok) {
          const data = await res.json();
          emailExists = data.exists ?? null;
        }
      } catch {
        // API unavailable — proceed to send so the user isn't blocked
        emailExists = null;
      }

      if (emailExists === false) {
        setStep('not-found');
        return;
      }

      // Set a cookie so /auth/callback knows this is a recovery flow even if
      // Supabase strips extra query params from redirectTo.
      document.cookie = 'rd1_auth_intent=recovery; path=/; max-age=600; SameSite=Lax';
      const redirectTo = `${window.location.origin}/auth/callback?next=/reset-password`;
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, { redirectTo });
      if (resetError) throw resetError;
      setStep('sent');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to send reset email');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="login-logo">
          <RedlineD1Logo height={56} background="dark" animated={true} />
          <span className="login-logo-sub">Shop Operations</span>
        </div>

        {linkExpired && step === 'form' && (
          <div style={{ background: 'rgba(204,0,0,0.12)', border: '1px solid rgba(204,0,0,0.3)', borderRadius: 8, padding: '10px 14px', marginBottom: 16, fontSize: 13, color: '#ff8080', textAlign: 'center' }}>
            ⚠️ That link has expired. Request a new one below.
          </div>
        )}

        {step === 'sent' && (
          <div style={{ textAlign: 'center', padding: '10px 0 20px' }}>
            <div style={{ fontSize: 44, marginBottom: 16 }}>📧</div>
            <p style={{ color: '#888', fontSize: 14, lineHeight: 1.6, marginBottom: 20 }}>
              Reset link sent to <strong style={{ color: '#fff' }}>{email}</strong>.<br />
              Click the link in that email to set a new password.
            </p>
            <a href="/login" style={{ color: '#cc0000', fontSize: 13, textDecoration: 'none', fontWeight: 600 }}>← Back to Sign In</a>
          </div>
        )}

        {step === 'not-found' && (
          <div style={{ textAlign: 'center', padding: '10px 0 20px' }}>
            <div style={{ fontSize: 44, marginBottom: 16 }}>🔍</div>
            <h2 style={{ fontSize: 17, fontWeight: 800, marginBottom: 10, color: '#fff' }}>No account found</h2>
            <p style={{ color: '#888', fontSize: 14, lineHeight: 1.6, marginBottom: 8 }}>
              <strong style={{ color: '#fff' }}>{email}</strong> is not registered.
            </p>
            <p style={{ color: '#777', fontSize: 13, lineHeight: 1.6, marginBottom: 24 }}>
              Want to get started? Sign up for a free 7-day trial — no credit card required.
            </p>
            <a
              href={`/signup?email=${encodeURIComponent(email)}`}
              style={{
                display: 'block', background: '#cc0000', color: '#fff',
                padding: '12px 0', borderRadius: 8, fontWeight: 700,
                fontSize: 14, textDecoration: 'none', marginBottom: 14,
              }}
            >
              Start Free 7-Day Trial
            </a>
            <button
              onClick={() => { setStep('form'); setError(''); }}
              style={{ background: 'none', border: 'none', color: '#666', fontSize: 13, cursor: 'pointer' }}
            >
              ← Try a different email
            </button>
          </div>
        )}

        {step === 'form' && (
          <>
            <div style={{ textAlign: 'center', marginBottom: 24 }}>
              <h2 style={{ fontSize: 18, fontWeight: 800, marginBottom: 8 }}>Reset your password</h2>
              <p style={{ color: '#777', fontSize: 13, lineHeight: 1.6 }}>
                Enter your account email and we'll send a reset link.
              </p>
            </div>

            <form onSubmit={handleSubmit} className="login-form">
              <div className="login-field">
                <label htmlFor="email">Email Address</label>
                <input
                  id="email" type="email" autoComplete="email" required
                  value={email} onChange={e => setEmail(e.target.value)}
                  placeholder="you@yourshop.com"
                />
              </div>
              {error && <p className="login-error">{error}</p>}
              <button type="submit" className="login-btn" disabled={loading}>
                {loading ? 'Checking…' : 'Send Reset Link'}
              </button>
            </form>

            <p style={{ textAlign: 'center', fontSize: 13, color: '#888', marginTop: 16 }}>
              Remember it?{' '}
              <a href="/login" style={{ color: '#cc0000', fontWeight: 600 }}>Back to Sign In</a>
            </p>
          </>
        )}
      </div>
    </div>
  );
}
