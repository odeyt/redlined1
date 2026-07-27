'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { RedlineD1Logo } from '@/components/brand/RedlineD1Logo';
import { signIn } from '@/lib/auth';

export default function LoginPage() {
  const router = useRouter();

  // Implicit flow: Supabase invite/recovery redirects to site root with
  // #access_token=...&type=invite. Middleware strips hash → lands on /login.
  // Detect it here and forward to /auth/callback so the session is exchanged.
  useEffect(() => {
    const hash = window.location.hash.slice(1);
    if (!hash) return;
    const p = new URLSearchParams(hash);
    const type = p.get('type');
    const accessToken = p.get('access_token');
    if (accessToken && (type === 'invite' || type === 'recovery')) {
      router.replace('/auth/callback' + window.location.hash);
    }
  }, [router]);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [verified, setVerified] = useState(false);

  useEffect(() => {
    if (new URLSearchParams(window.location.search).get('verified') === '1') {
      setVerified(true);
    }
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await signIn(email, password);
      router.push('/');
      router.refresh();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Login failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="login-logo">
          <a href="/" aria-label="RedlineD1 home" style={{ display: 'inline-block', textDecoration: 'none' }}>
            <RedlineD1Logo height={56} background="dark" animated={true} />
          </a>
          <span className="login-logo-sub">Shop Operations</span>
        </div>

        {verified && (
          <div style={{ marginBottom: 16, padding: '10px 14px', background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.3)', borderRadius: 8, color: '#22c55e', fontSize: 13, textAlign: 'center' }}>
            Email confirmed! Sign in to access your account.
          </div>
        )}

        <form onSubmit={handleSubmit} className="login-form">
          <div className="login-field">
            <label htmlFor="email">Email</label>
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

          <div className="login-field">
            <label htmlFor="password">Password</label>
            <input
              id="password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="••••••••"
            />
          </div>

          {error && <p className="login-error">{error}</p>}

          <div style={{ textAlign: 'right', marginBottom: 4 }}>
            <a href="/forgot-password" style={{ fontSize: 12, color: '#cc0000', textDecoration: 'none' }}>Forgot password?</a>
          </div>

          <button type="submit" className="login-btn" disabled={loading}>
            {loading ? 'Signing in…' : 'Sign In'}
          </button>
        </form>

        <p style={{ textAlign: 'center', fontSize: 13, color: '#888', marginTop: 16 }}>
          New here?{' '}
          <a href="/signup" style={{ color: '#cc0000', fontWeight: 600 }}>Sign up free</a>
        </p>
      </div>
    </div>
  );
}
