'use client';

import { useState } from 'react';
import { LOGO_SRC } from '@/lib/logo';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';

export default function SignupPage() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [shopName, setShopName] = useState('');
  const [email, setEmail] = useState('');
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
        options: { data: { full_name: name, shop_name: shopName } },
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
        // Notify sales team — fire and forget, don't block signup on failure
        fetch('/api/signup-notify', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name, shopName, email }),
        }).catch(() => {});
      }
      setSuccess(true);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Sign up failed');
    } finally {
      setLoading(false);
    }
  }

  if (success) {
    return (
      <div className="login-page">
        <div className="login-card" style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>🎉</div>
          <h2 style={{ fontWeight: 800, fontSize: 20, marginBottom: 8 }}>Account Created!</h2>
          <p style={{ color: '#666', fontSize: 14, marginBottom: 8 }}>
            You have <strong>7 days of full access</strong> to explore Redlined1.
          </p>
          <p style={{ color: '#999', fontSize: 13, marginBottom: 24 }}>
            Check your email to confirm your account, then sign in.
          </p>
          <button className="login-btn" onClick={() => router.push('/login')}>
            Go to Sign In
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="login-logo">
          <img src={LOGO_SRC} alt="Redlined1" style={{ height: 110, width: 'auto', objectFit: 'contain' }} />
          <span className="login-logo-sub">Start your free 7-day trial</span>
        </div>

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
            {loading ? 'Creating account…' : 'Start Free Trial'}
          </button>

          <p style={{ textAlign: 'center', fontSize: 12, color: '#999', marginTop: 16 }}>
            After 7 days, free plan continues with core features.{' '}
            <br />No credit card required.
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
