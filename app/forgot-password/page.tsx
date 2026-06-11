'use client';

import { useState, useEffect } from 'react';
import { LOGO_SRC } from '@/lib/logo';
import { supabase } from '@/lib/supabase';

export default function ForgotPasswordPage() {
  const [email, setEmail]         = useState('');
  const [sent, setSent]           = useState(false);
  const [redirectUsed, setRedirectUsed] = useState('');
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
      const redirectTo = `${window.location.origin}/auth/callback?next=/reset-password`;
      setRedirectUsed(redirectTo);
      const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo });
      if (error) throw error;
      setSent(true);
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
          <img src={LOGO_SRC} alt="Redlined1" style={{ height: 110, width: 'auto', objectFit: 'contain' }} />
          <span className="login-logo-sub">Shop Operations</span>
        </div>

        {linkExpired && !sent && (
          <div style={{ background: 'rgba(204,0,0,0.12)', border: '1px solid rgba(204,0,0,0.3)', borderRadius: 8, padding: '10px 14px', marginBottom: 16, fontSize: 13, color: '#ff8080', textAlign: 'center' }}>
            ⚠️ That link has expired. Request a new one below.
          </div>
        )}

        {sent ? (
          <div style={{ textAlign: 'center', padding: '10px 0 20px' }}>
            <div style={{ fontSize: 44, marginBottom: 16 }}>📧</div>
            <h2 style={{ fontSize: 18, fontWeight: 800, marginBottom: 10 }}>Check your inbox</h2>
            <p style={{ color: '#888', fontSize: 14, lineHeight: 1.6, marginBottom: 16 }}>
              Reset link sent to <strong style={{ color: '#fff' }}>{email}</strong>.<br />
              Click the link in that email to set a new password.
            </p>
            {/* Debug: show redirect URL so Supabase allowlist can be verified */}
            <div style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8, padding: '10px 12px', marginBottom: 20, textAlign: 'left' }}>
              <div style={{ fontSize: 10, color: '#555', marginBottom: 4, textTransform: 'uppercase', letterSpacing: 1 }}>Redirect URL sent to Supabase</div>
              <div style={{ fontSize: 11, color: '#888', wordBreak: 'break-all' }}>{redirectUsed}</div>
            </div>
            <a href="/login" style={{ color: '#cc0000', fontSize: 13, textDecoration: 'none', fontWeight: 600 }}>← Back to Sign In</a>
          </div>
        ) : (
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
                {loading ? 'Sending…' : 'Send Reset Link'}
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
