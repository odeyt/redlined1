'use client';

import { useState, useEffect } from 'react';
import { LOGO_SRC } from '@/lib/logo';
import { supabase } from '@/lib/supabase';
import { useRouter } from 'next/navigation';

export default function ResetPasswordPage() {
  const router = useRouter();
  const [password, setPassword]   = useState('');
  const [confirm, setConfirm]     = useState('');
  const [error, setError]         = useState('');
  const [loading, setLoading]     = useState(false);
  const [ready, setReady]         = useState(false);
  const [done, setDone]           = useState(false);

  useEffect(() => {
    // PKCE flow: Supabase sends ?code= in the query string
    const code = new URLSearchParams(window.location.search).get('code');
    if (code) {
      supabase.auth.exchangeCodeForSession(code).then(({ error: err }) => {
        if (err) setError('This reset link is invalid or has expired. Please request a new one.');
        else setReady(true);
      });
      return;
    }
    // Implicit flow fallback: token arrives via PASSWORD_RECOVERY event
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') setReady(true);
    });
    return () => subscription.unsubscribe();
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (password !== confirm) { setError('Passwords do not match'); return; }
    if (password.length < 8)  { setError('Password must be at least 8 characters'); return; }
    setLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      setDone(true);
      setTimeout(() => router.push('/'), 2500);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to update password');
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

        {done ? (
          <div style={{ textAlign: 'center', padding: '10px 0 20px' }}>
            <div style={{ fontSize: 44, marginBottom: 16 }}>✅</div>
            <h2 style={{ fontSize: 18, fontWeight: 800, marginBottom: 10 }}>Password updated!</h2>
            <p style={{ color: '#888', fontSize: 14, lineHeight: 1.6 }}>
              Your new password is set. Redirecting you to the dashboard…
            </p>
          </div>
        ) : !ready ? (
          <div style={{ textAlign: 'center', padding: '20px 0' }}>
            <div style={{ fontSize: 32, marginBottom: 12 }}>🔐</div>
            <p style={{ color: '#777', fontSize: 14 }}>Verifying your reset link…</p>
            <p style={{ color: '#555', fontSize: 12, marginTop: 8 }}>
              If nothing happens, your link may have expired.{' '}
              <a href="/forgot-password" style={{ color: '#cc0000' }}>Request a new one</a>.
            </p>
          </div>
        ) : (
          <>
            <div style={{ textAlign: 'center', marginBottom: 24 }}>
              <h2 style={{ fontSize: 18, fontWeight: 800, marginBottom: 8 }}>Set a new password</h2>
              <p style={{ color: '#777', fontSize: 13 }}>Choose a strong password for your account.</p>
            </div>

            <form onSubmit={handleSubmit} className="login-form">
              <div className="login-field">
                <label htmlFor="password">New Password</label>
                <input
                  id="password"
                  type="password"
                  required
                  minLength={8}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="At least 8 characters"
                />
              </div>
              <div className="login-field">
                <label htmlFor="confirm">Confirm Password</label>
                <input
                  id="confirm"
                  type="password"
                  required
                  value={confirm}
                  onChange={e => setConfirm(e.target.value)}
                  placeholder="Repeat your new password"
                />
              </div>

              {error && <p className="login-error">{error}</p>}

              <button type="submit" className="login-btn" disabled={loading}>
                {loading ? 'Updating…' : 'Update Password'}
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
