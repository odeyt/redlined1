'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useRouter } from 'next/navigation';

type Status = 'verifying' | 'error' | 'expired-recovery' | 'expired-invite';

export default function AuthCallbackPage() {
  const router = useRouter();
  const [status, setStatus] = useState<Status>('verifying');

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);

    // Supabase forwards auth errors as query params — handle them before any exchange.
    const errorCode = params.get('error_code');
    const nextParam = params.get('next');
    if (errorCode === 'otp_expired' || params.get('error') === 'access_denied') {
      setStatus(nextParam === '/reset-password' ? 'expired-recovery' : 'expired-invite');
      return;
    }

    const code = params.get('code');
    const next = nextParam || '/reset-password';
    const tokenHash = params.get('token_hash');
    const type = params.get('type') as 'recovery' | 'email' | 'signup' | 'invite' | null;

    // Also handle hash fragment (implicit flow fallback: #access_token=...&type=recovery)
    const hash = window.location.hash.slice(1);
    const hashParams = new URLSearchParams(hash);
    const hashType = hashParams.get('type');
    const accessToken = hashParams.get('access_token');
    const refreshToken = hashParams.get('refresh_token');

    async function exchange() {
      try {
        if (accessToken && refreshToken && (hashType === 'recovery' || hashType === 'invite')) {
          const { error } = await supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken });
          if (error) throw error;
          router.replace('/reset-password');
          return;
        }

        if (tokenHash && type) {
          const verifyType = type === 'invite' ? 'email' : type;
          const { error } = await supabase.auth.verifyOtp({
            token_hash: tokenHash,
            type: verifyType as 'recovery' | 'email' | 'signup',
          });
          if (error) throw error;
          if (type === 'invite') { router.replace('/reset-password'); return; }
          // Signup/email confirmation: go to login so SSR cookies are set cleanly
          if (type === 'signup' || type === 'email') { router.replace('/login?verified=1'); return; }
          router.replace(next);
          return;
        }

        if (code) {
          const { error } = await supabase.auth.exchangeCodeForSession(code);
          if (error) throw error;
          // Determine destination: prefer explicit ?next= param, then fall back to
          // the rd1_auth_intent cookie (set by forgot-password before sending email,
          // in case Supabase strips extra query params from redirectTo).
          if (nextParam) {
            router.replace(next);
          } else {
            const intentCookie = document.cookie.split('; ').find(r => r.startsWith('rd1_auth_intent='));
            const intent = intentCookie?.split('=')[1];
            if (intent) document.cookie = 'rd1_auth_intent=; path=/; max-age=0';
            if (intent === 'recovery') {
              router.replace('/reset-password');
            } else {
              router.replace('/login?verified=1');
            }
          }
          return;
        }

        // Check if we already have a session
        const { data: { session } } = await supabase.auth.getSession();
        if (session) {
          router.replace(next);
          return;
        }

        setStatus('error');
      } catch {
        setStatus('error');
      }
    }

    exchange();
  }, [router]);

  if (status === 'expired-recovery') {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#0a0a0a' }}>
        <div style={{ textAlign: 'center', padding: 32, maxWidth: 360 }}>
          <div style={{ fontSize: 40, marginBottom: 16 }}>⏱️</div>
          <p style={{ color: '#fff', fontWeight: 700, fontSize: 16, marginBottom: 8 }}>Reset link expired</p>
          <p style={{ color: '#888', fontSize: 14, marginBottom: 24, lineHeight: 1.6 }}>
            Password reset links expire after 1 hour. Request a new one below — it only takes a second.
          </p>
          <a href="/forgot-password" style={{ display: 'inline-block', background: '#cc0000', color: '#fff', padding: '11px 24px', borderRadius: 8, fontWeight: 700, fontSize: 14, textDecoration: 'none' }}>
            Request New Reset Link
          </a>
        </div>
      </div>
    );
  }

  if (status === 'error' || status === 'expired-invite') {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#0a0a0a' }}>
        <div style={{ textAlign: 'center', padding: 32 }}>
          <div style={{ fontSize: 40, marginBottom: 16 }}>⚠️</div>
          <p style={{ color: '#888', marginBottom: 16 }}>This link has expired or is invalid.</p>
          <p style={{ color: '#666', fontSize: 13, marginBottom: 16 }}>Ask your shop owner to resend the invite.</p>
          <a href="/login" style={{ color: '#cc0000', fontWeight: 600 }}>Go to Login →</a>
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#0a0a0a' }}>
      <div style={{ textAlign: 'center', padding: 32 }}>
        <div style={{ fontSize: 40, marginBottom: 16 }}>🔐</div>
        <p style={{ color: '#777', fontSize: 14 }}>Verifying your invite link…</p>
      </div>
    </div>
  );
}
