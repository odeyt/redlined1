'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { RedlineD1Logo } from '@/components/brand/RedlineD1Logo';
import { signIn } from '@/lib/auth';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

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
          <RedlineD1Logo height={56} background="dark" animated={true} />
          <span className="login-logo-sub">Shop Operations</span>
        </div>

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
          <a href="/signup" style={{ color: '#cc0000', fontWeight: 600 }}>Start free 7-day trial</a>
        </p>
      </div>
    </div>
  );
}
