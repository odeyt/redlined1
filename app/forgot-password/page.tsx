'use client';

import { useState } from 'react';
import { LOGO_SRC } from '@/lib/logo';
import { supabase } from '@/lib/supabase';

export default function ForgotPasswordPage() {
  const [email, setEmail]     = useState('');
  const [sent, setSent]       = useState(false);
  const [error, setError]     = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || window.location.origin;
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${siteUrl}/auth/callback?next=/reset-password`,
      });
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

        {sent ? (
          <div style={{ textAlign: 'center', padding: '10px 0 20px' }}>
            <div style={{ fontSize: 44, marginBottom: 16 }}>📧</div>
            <h2 style={{ fontSize: 18, fontWeight: 800, marginBottom: 10 }}>Check your inbox</h2>
            <p style={{ color: '#888', fontSize: 14, lineHeight: 1.6, marginBottom: 24 }}>
              We sent a password reset link to<br />
              <strong style={{ color: '#fff' }}>{email}</strong>.<br />
              Click the link in that email to set a new password.
            </p>
            <a href="/login" style={{ color: '#cc0000', fontSize: 13, textDecoration: 'none', fontWeight: 600 }}>← Back to Sign In</a>
          </div>
        ) : (
          <>
            <div style={{ textAlign: 'center', marginBottom: 24 }}>
              <h2 style={{ fontSize: 18, fontWeight: 800, marginBottom: 8 }}>Reset your password</h2>
              <p style={{ color: '#777', fontSize: 13, lineHeight: 1.6 }}>
                Enter the email address on your account and we'll send you a reset link.
              </p>
            </div>

            <form onSubmit={handleSubmit} className="login-form">
              <div className="login-field">
                <label htmlFor="email">Email Address</label>
                <input
                  id="email"
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={e => setEmail(e.target.value)}
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
