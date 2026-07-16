'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useRouter } from 'next/navigation';

type Status = 'verifying' | 'redirecting-checkout' | 'error' | 'expired-recovery' | 'expired-link';

export default function AuthCallbackPage() {
  const router = useRouter();
  const [status, setStatus] = useState<Status>('verifying');
  const [debugMsg, setDebugMsg] = useState<string>('');

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const errorCode = params.get('error_code');
    const nextParam = params.get('next');

    if (errorCode === 'otp_expired' || params.get('error') === 'access_denied') {
      setStatus(nextParam === '/reset-password' ? 'expired-recovery' : 'expired-link');
      return;
    }

    const code = params.get('code');
    const next = nextParam || '/reset-password';
    const tokenHash = params.get('token_hash');
    const type = params.get('type') as 'recovery' | 'email' | 'signup' | 'invite' | null;

    const hash = window.location.hash.slice(1);
    const hashParams = new URLSearchParams(hash);
    const hashType = hashParams.get('type');
    const accessToken = hashParams.get('access_token');
    const refreshToken = hashParams.get('refresh_token');

    // After any signup/email confirmation the session is live — check for
    // a pending paid-plan checkout stored at signup time and redirect to Creem.
    async function handleSignupSuccess() {
      try {
        const raw = localStorage.getItem('rd1_pending_checkout');
        if (raw) {
          localStorage.removeItem('rd1_pending_checkout');

          // Client-side billing exemption guard — skip checkout before hitting the API
          const { data: { user: me } } = await supabase.auth.getUser();
          const myEmail = (me?.email ?? '').toLowerCase();
          const myDomain = myEmail.split('@')[1] ?? '';
          const exemptEmails = new Set(
            (process.env.NEXT_PUBLIC_PLATFORM_OWNER_EMAIL ?? '').split(',').map(e => e.trim().toLowerCase()).filter(Boolean)
          );
          const exemptDomains = new Set(
            (process.env.NEXT_PUBLIC_BILLING_EXEMPT_DOMAINS ?? '').split(',').map(d => d.trim().toLowerCase()).filter(Boolean)
          );
          if (exemptEmails.has(myEmail) || (myDomain && exemptDomains.has(myDomain))) {
            router.replace('/');
            return;
          }

          const { planId, billingInterval } = JSON.parse(raw);
          if (planId && planId !== 'trial') {
            setStatus('redirecting-checkout');
            const res = await fetch('/api/billing/checkout', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ planId, billingInterval: billingInterval || 'monthly' }),
            });
            if (res.ok) {
              const json = await res.json();
              if (json.url) { window.location.href = json.url; return; }
            }
          }
        }
      } catch { /* fall through to app */ }
      router.replace('/');
    }

    async function exchange() {
      try {
        // Implicit flow: hash fragment with access_token + refresh_token
        if (accessToken && refreshToken) {
          const { error } = await supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken });
          if (error) throw error;
          if (hashType === 'recovery' || hashType === 'invite') {
            router.replace('/reset-password');
          } else {
            await handleSignupSuccess();
          }
          return;
        }

        // token_hash flow (PKCE or OTP link)
        if (tokenHash && type) {
          const verifyType = type === 'invite' ? 'email' : type;
          const { error } = await supabase.auth.verifyOtp({
            token_hash: tokenHash,
            type: verifyType as 'recovery' | 'email' | 'signup',
          });
          if (error) throw error;
          if (type === 'invite') { router.replace('/reset-password'); return; }
          if (type === 'signup' || type === 'email') { await handleSignupSuccess(); return; }
          router.replace(next);
          return;
        }

        // PKCE code exchange
        if (code) {
          const { error } = await supabase.auth.exchangeCodeForSession(code);
          if (error) throw error;
          if (nextParam) { router.replace(next); return; }
          const intentCookie = document.cookie.split('; ').find(r => r.startsWith('rd1_auth_intent='));
          const intent = intentCookie?.split('=')[1];
          if (intent) document.cookie = 'rd1_auth_intent=; path=/; max-age=0';
          if (intent === 'recovery') { router.replace('/reset-password'); return; }
          await handleSignupSuccess();
          return;
        }

        // Already have a session
        const { data: { session } } = await supabase.auth.getSession();
        if (session) { router.replace(next); return; }

        setStatus('error');
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error('[auth/callback] exchange error:', msg, err);
        setDebugMsg(msg);
        setStatus('error');
      }
    }

    exchange();
  }, [router]);

  // ── UI states ──────────────────────────────────────────────────────────────

  if (status === 'redirecting-checkout') {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#0a0a0a' }}>
        <div style={{ textAlign: 'center', padding: 32 }}>
          <div style={{ fontSize: 40, marginBottom: 16 }}>💳</div>
          <p style={{ color: '#fff', fontWeight: 700, fontSize: 16, marginBottom: 8 }}>Email confirmed!</p>
          <p style={{ color: '#777', fontSize: 14 }}>Taking you to payment…</p>
        </div>
      </div>
    );
  }

  if (status === 'expired-recovery') {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#0a0a0a' }}>
        <div style={{ textAlign: 'center', padding: 32, maxWidth: 360 }}>
          <div style={{ fontSize: 40, marginBottom: 16 }}>⏱️</div>
          <p style={{ color: '#fff', fontWeight: 700, fontSize: 16, marginBottom: 8 }}>Reset link expired</p>
          <p style={{ color: '#888', fontSize: 14, marginBottom: 24, lineHeight: 1.6 }}>
            Password reset links expire after 1 hour. Request a new one below.
          </p>
          <a href="/forgot-password" style={{ display: 'inline-block', background: '#cc0000', color: '#fff', padding: '11px 24px', borderRadius: 8, fontWeight: 700, fontSize: 14, textDecoration: 'none' }}>
            Request New Reset Link
          </a>
        </div>
      </div>
    );
  }

  if (status === 'expired-link') {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#0a0a0a', fontFamily: "'Inter', system-ui, sans-serif" }}>
        <div style={{ textAlign: 'center', padding: 32, maxWidth: 400 }}>
          <div style={{ fontSize: 44, marginBottom: 16 }}>⏱️</div>
          <p style={{ color: '#fff', fontWeight: 700, fontSize: 17, marginBottom: 10 }}>This link has expired or was already used</p>
          <p style={{ color: '#888', fontSize: 14, lineHeight: 1.6, marginBottom: 28 }}>
            Confirmation links are single-use and expire after 24 hours. If your email is already confirmed, go ahead and sign in.
          </p>
          <a href="/login" style={{ display: 'inline-block', background: '#cc0000', color: '#fff', padding: '12px 28px', borderRadius: 10, fontWeight: 700, fontSize: 14, textDecoration: 'none', marginBottom: 16 }}>
            Sign In →
          </a>
          <br />
          <a href="/signup" style={{ color: '#666', fontSize: 13 }}>Need a new account? Sign up</a>
        </div>
      </div>
    );
  }

  if (status === 'error') {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#0a0a0a', fontFamily: "'Inter', system-ui, sans-serif" }}>
        <div style={{ textAlign: 'center', padding: 32, maxWidth: 400 }}>
          <div style={{ fontSize: 44, marginBottom: 16 }}>⚠️</div>
          <p style={{ color: '#fff', fontWeight: 700, fontSize: 17, marginBottom: 10 }}>Something went wrong</p>
          <p style={{ color: '#888', fontSize: 14, lineHeight: 1.6, marginBottom: debugMsg ? 12 : 28 }}>
            We couldn&apos;t verify this link. Try signing in — if your email is confirmed you&apos;ll be let straight through.
          </p>
          {debugMsg && (
            <p style={{ color: '#ff6666', fontSize: 12, fontFamily: 'monospace', background: '#1a0000', padding: '8px 12px', borderRadius: 6, marginBottom: 28, wordBreak: 'break-all' }}>
              {debugMsg}
            </p>
          )}
          <a href="/login" style={{ display: 'inline-block', background: '#cc0000', color: '#fff', padding: '12px 28px', borderRadius: 10, fontWeight: 700, fontSize: 14, textDecoration: 'none', marginBottom: 16 }}>
            Go to Sign In
          </a>
          <br />
          <a href="/forgot-password" style={{ color: '#666', fontSize: 13 }}>Need a password reset link?</a>
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#0a0a0a' }}>
      <div style={{ textAlign: 'center', padding: 32 }}>
        <div style={{ fontSize: 40, marginBottom: 16 }}>🔐</div>
        <p style={{ color: '#777', fontSize: 14 }}>Verifying your link…</p>
      </div>
    </div>
  );
}
