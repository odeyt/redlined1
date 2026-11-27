'use client';

/**
 * Settings → AI usage (pilot meter).
 *
 * Shows this month's AI spend against the $20 cap the owner set on
 * 2026-11-27, how many calls were made, and which provider/model is in use.
 * Owner or manager, D1 shops only, and only while `ai_translation` is on —
 * renders nothing otherwise and makes no request until then.
 */
import { useEffect, useState } from 'react';
import { Panel } from '@/components/Panel';
import { useFeatureFlag } from '@/components/featureFlags/FeatureFlagProvider';
import { flagRequestHeaders } from '@/lib/featureFlags/requestHeaders';

interface Usage {
  enabled: boolean;
  reason?: string;
  error?: string;
  monthStart?: string;
  requests?: number;
  spentUsd?: number;
  capUsd?: number;
  remainingUsd?: number;
  percentUsed?: number;
  allowed?: boolean;
  provider?: string | null;
  model?: string | null;
}

const PROVIDER_NAMES: Record<string, string> = { xai: 'Grok (xAI)' };

/** Small amounts need more than 2 decimals to show anything at all. */
function usd(v: number): string {
  return v > 0 && v < 0.01 ? `$${v.toFixed(4)}` : `$${v.toFixed(2)}`;
}

export function AiUsagePanel({ role }: { role: string }) {
  const enabled = useFeatureFlag('ai_translation');
  if (!enabled || (role !== 'owner' && role !== 'manager')) return null;
  return <AiUsage />;
}

function AiUsage() {
  const [usage, setUsage] = useState<Usage | null>(null);
  const [loadError, setLoadError] = useState('');

  useEffect(() => {
    let cancelled = false;
    fetch('/api/ai/usage', { credentials: 'include', headers: flagRequestHeaders() })
      .then(r => r.json() as Promise<Usage>)
      .then(u => { if (!cancelled) setUsage(u); })
      .catch(() => { if (!cancelled) setLoadError('Could not load AI usage.'); });
    return () => { cancelled = true; };
  }, []);

  const muted = { fontSize: 12, color: 'var(--muted)' } as const;

  return (
    <Panel title="AI usage" hint="AI translation pilot — this month's spend against the monthly cap">
      {loadError && <div style={muted}>{loadError}</div>}
      {!usage && !loadError && <div style={muted}>Loading…</div>}
      {usage && !usage.enabled && (
        <div style={muted}>AI is not available for this shop.</div>
      )}
      {usage?.enabled && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }} data-testid="ai-usage">
          {usage.error ? (
            <div style={{ ...muted, color: '#ef4444' }}>Usage could not be read: {usage.error}</div>
          ) : (
            <>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 22, fontWeight: 900, fontVariantNumeric: 'tabular-nums' }}>{usd(usage.spentUsd ?? 0)}</span>
                <span style={muted}>of {usd(usage.capUsd ?? 0)} this month · {usage.requests ?? 0} call{usage.requests === 1 ? '' : 's'}</span>
              </div>
              <div
                role="meter" aria-label="AI budget used"
                aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(usage.percentUsed ?? 0)}
                style={{ height: 8, borderRadius: 999, background: 'var(--line)', overflow: 'hidden' }}>
                <div style={{
                  width: `${Math.max(usage.percentUsed ?? 0, (usage.spentUsd ?? 0) > 0 ? 1 : 0)}%`, height: '100%',
                  background: (usage.percentUsed ?? 0) >= 90 ? '#ef4444' : (usage.percentUsed ?? 0) >= 70 ? '#f59e0b' : '#22c55e',
                }} />
              </div>
              {!usage.allowed && (
                <div style={{ fontSize: 12, color: '#ef4444', fontWeight: 600 }}>
                  Cap reached. AI is paused until next month; the 🌐 button uses the basic translator meanwhile.
                </div>
              )}
            </>
          )}
          <div style={muted}>
            Provider: {usage.provider ? `${PROVIDER_NAMES[usage.provider] ?? usage.provider}${usage.model ? ` · ${usage.model}` : ''}` : 'not configured (XAI_API_KEY is not set), so the basic translator is used'}
          </div>
        </div>
      )}
    </Panel>
  );
}
