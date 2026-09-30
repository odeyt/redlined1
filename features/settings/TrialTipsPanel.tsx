'use client';

/**
 * Settings → Email preferences: switch trial tips on or off for yourself.
 *
 * Switching on here is a fresh, explicit consent (recorded server-side with
 * the current wording). Switching off takes effect before the next send.
 * Account and billing emails are not affected either way.
 *
 * Hidden unless the `trial_tips` feature flag is on. The panel needs the
 * trial-tips tables (supabase/migrations/2026-09-30_trial_tips_email.sql);
 * until they exist in a shop's database it could only show a load error. With
 * the flag off it renders nothing and makes no request.
 */
import { useEffect, useState } from 'react';
import { Panel } from '@/components/Panel';
import { useFeatureFlag } from '@/components/featureFlags/FeatureFlagProvider';
import { authedFetch } from '@/lib/apiClient';
import { TRIAL_TIPS_CONSENT_TEXT } from '@/lib/trialTips/config';

type Status = 'subscribed' | 'unsubscribed' | 'suppressed' | 'none';

export function TrialTipsPanel() {
  const enabled = useFeatureFlag('trial_tips');
  if (!enabled) return null;
  return <TrialTipsPreference />;
}

function TrialTipsPreference() {
  const [status, setStatus] = useState<Status | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState('');

  useEffect(() => {
    let cancelled = false;
    authedFetch('/api/trial-tips/preference')
      .then(async r => {
        const json = await r.json().catch(() => ({}));
        if (cancelled) return;
        if (!r.ok) { setError(json.error ?? 'Could not load your email preference.'); return; }
        setStatus(json.status as Status);
      })
      .catch(() => { if (!cancelled) setError('Could not load your email preference.'); });
    return () => { cancelled = true; };
  }, []);

  async function change(subscribed: boolean) {
    setBusy(true);
    setError('');
    setSaved('');
    try {
      const r = await authedFetch('/api/trial-tips/preference', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subscribed }),
      });
      const json = await r.json().catch(() => ({}));
      if (json.status) setStatus(json.status as Status);
      if (!r.ok) { setError(json.error ?? 'Could not save your email preference.'); return; }
      setSaved(subscribed ? 'Trial tips switched on.' : 'Trial tips switched off.');
    } catch {
      setError('Could not save your email preference.');
    } finally {
      setBusy(false);
    }
  }

  const on = status === 'subscribed';

  return (
    <Panel title="Email preferences" hint="Optional emails from RedlineD1. Account and billing emails are always sent.">
      {status === null && !error && <p style={{ fontSize: 13, color: 'var(--muted)' }}>Loading…</p>}
      {status !== null && (
        <label style={{ display: 'flex', gap: 10, alignItems: 'flex-start', fontSize: 14, lineHeight: 1.5, cursor: status === 'suppressed' ? 'default' : 'pointer' }}>
          <input
            type="checkbox"
            checked={on}
            disabled={busy || status === 'suppressed'}
            onChange={e => change(e.target.checked)}
            style={{ marginTop: 3, width: 16, height: 16, accentColor: '#cc0000' }}
          />
          <span>
            {TRIAL_TIPS_CONSENT_TEXT}
            <span style={{ display: 'block', fontSize: 12, color: 'var(--muted)' }}>
              {status === 'suppressed'
                ? 'Off: emails to your address bounced or were reported as spam.'
                : on ? 'On.' : 'Off.'}
            </span>
          </span>
        </label>
      )}
      <div aria-live="polite" style={{ fontSize: 13, marginTop: 8 }}>
        {error && <span style={{ color: '#dc2626' }}>{error}</span>}
        {saved && <span style={{ color: '#059669' }}>{saved}</span>}
      </div>
    </Panel>
  );
}
