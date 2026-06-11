'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useRouter } from 'next/navigation';

export default function AuthCallbackPage() {
  const router = useRouter();
  const [status, setStatus] = useState<'verifying' | 'error'>('verifying');

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get('code');
    const next = params.get('next') || '/reset-password';
    const tokenHash = params.get('token_hash');
    const type = params.get('type') as 'recovery' | 'email' | 'signup' | null;

    // Also handle hash fragment (implicit flow fallback: #access_token=...&type=recovery)
    const hash = window.location.hash.slice(1);
    const hashParams = new URLSearchParams(hash);
    const hashType = hashParams.get('type');
    const accessToken = hashParams.get('access_token');
    const refreshToken = hashParams.get('refresh_token');

    async function exchange() {
      try {
        if (accessToken && refreshToken && hashType === 'recovery') {
          // Implicit flow — set session directly from hash tokens
          const { error } = await supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken });
          if (error) throw error;
          router.replace('/reset-password');
          return;
        }

        if (tokenHash && type) {
          const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type });
          if (error) throw error;
          router.replace(next);
          return;
        }

        if (code) {
          const { error } = await supabase.auth.exchangeCodeForSession(code);
          if (error) throw error;
          router.replace(next);
          return;
        }

        // Check if we already have a session (e.g., Supabase set it via cookie before redirect)
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

  if (status === 'error') {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#0a0a0a' }}>
        <div style={{ textAlign: 'center', padding: 32 }}>
          <div style={{ fontSize: 40, marginBottom: 16 }}>⚠️</div>
          <p style={{ color: '#888', marginBottom: 16 }}>This reset link has expired or is invalid.</p>
          <a href="/forgot-password" style={{ color: '#cc0000', fontWeight: 600 }}>Request a new link →</a>
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#0a0a0a' }}>
      <div style={{ textAlign: 'center', padding: 32 }}>
        <div style={{ fontSize: 40, marginBottom: 16 }}>🔐</div>
        <p style={{ color: '#777', fontSize: 14 }}>Verifying your reset link…</p>
      </div>
    </div>
  );
}
