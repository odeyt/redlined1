'use client';

/**
 * Settings → API Keys (docs/api/PLAN.md phase 6).
 *
 * Lets the shop OWNER issue and revoke keys for bots and integrations, and
 * see what each key did recently. Renders nothing unless the owner is signed
 * in and the `api_v1_documents` flag is on, and makes no request until then.
 *
 * The secret is shown once, right after issuing, and never again: only a
 * hash is stored. Keys are always limited to this shop.
 */
import { useCallback, useEffect, useState } from 'react';
import { Panel } from '@/components/Panel';
import { useFeatureFlag } from '@/components/featureFlags/FeatureFlagProvider';
import { authedFetch, apiErrorMessage } from '@/lib/apiClient';
import { API_SCOPES } from '@/lib/api/scopes';
// keyCatalog, not keys: the latter issues secrets with Node crypto and is server-only.
import { SCOPE_PRESETS, type ApiKeyView } from '@/lib/api/keyCatalog';

/** Plain-language labels for each permission. */
export const SCOPE_LABELS: Record<string, string> = {
  'customers:read': 'Read customers',
  'customers:write': 'Add customers',
  'vehicles:read': 'Read vehicles',
  'vehicles:write': 'Add and edit vehicles',
  'appointments:read': 'Read appointments',
  'appointments:write': 'Book and change appointments',
  'estimates:read': 'Read estimates',
  'estimates:write': 'Create and edit DRAFT estimates; convert approved ones',
  'invoices:read': 'Read invoices and what has been paid',
  'invoices:write': 'Create and edit DRAFT invoices',
  'pdf:read': 'Download estimate and invoice PDFs',
};

const ACTION_LABELS: Record<string, string> = {
  'estimate.created': 'created estimate',
  'estimate.updated': 'edited estimate',
  'invoice.created': 'created invoice',
  'invoice.updated': 'edited invoice',
  'customer.created': 'added customer',
  'vehicle.created': 'added vehicle',
  'vehicle.updated': 'edited vehicle',
};

const muted = { fontSize: 12, color: 'var(--muted)' } as const;
const chip = { display: 'inline-block', padding: '2px 8px', borderRadius: 8, fontSize: 10, fontWeight: 800, letterSpacing: '0.04em' } as const;
const input = { width: '100%', padding: '8px 10px', borderRadius: 6, border: '1px solid var(--line)', background: 'var(--surface)', color: 'var(--text)', fontSize: 13, boxSizing: 'border-box' as const };

function when(iso: string | null): string {
  if (!iso) return 'never';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleString();
}

export function ApiKeysPanel({ shopId, role }: { shopId: string; role: string }) {
  const enabled = useFeatureFlag('api_v1_documents');
  if (!enabled || role !== 'owner' || !shopId) return null;
  return <ApiKeys shopId={shopId} />;
}

function ApiKeys({ shopId }: { shopId: string }) {
  const [keys, setKeys] = useState<ApiKeyView[] | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [name, setName] = useState('');
  const [scopes, setScopes] = useState<string[]>([...SCOPE_PRESETS.read_only]);
  const [secret, setSecret] = useState<{ name: string; value: string } | null>(null);
  const [copied, setCopied] = useState(false);

  // Bumped to reload the list after an issue or a revoke.
  const [version, setVersion] = useState(0);
  const load = useCallback(() => setVersion(v => v + 1), []);

  useEffect(() => {
    let cancelled = false;
    authedFetch(`/api/api-keys?shopId=${encodeURIComponent(shopId)}`)
      .then(async res => {
        if (!res.ok) throw new Error(await apiErrorMessage(res, 'Could not load API keys.'));
        const json = await res.json() as { keys: ApiKeyView[] };
        if (!cancelled) { setKeys(json.keys); setError(''); }
      })
      .catch(e => { if (!cancelled) setError(e instanceof Error ? e.message : 'Could not load API keys.'); });
    return () => { cancelled = true; };
  }, [shopId, version]);

  async function issue() {
    setBusy(true); setError(''); setCopied(false);
    try {
      const res = await authedFetch('/api/api-keys', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ shopId, name, scopes }),
      });
      if (!res.ok) { setError(await apiErrorMessage(res, 'Could not issue the key.')); return; }
      const json = await res.json() as { key: ApiKeyView; secret: string };
      setSecret({ name: json.key.name, value: json.secret });
      setName('');
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not issue the key.');
    } finally {
      setBusy(false);
    }
  }

  async function revoke(key: ApiKeyView) {
    if (!confirm(`Revoke "${key.name}"? Anything using it stops working immediately. This cannot be undone.`)) return;
    setBusy(true); setError('');
    try {
      const res = await authedFetch('/api/api-keys', {
        method: 'DELETE',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ shopId, id: key.id }),
      });
      if (!res.ok) { setError(await apiErrorMessage(res, 'Could not revoke the key.')); return; }
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not revoke the key.');
    } finally {
      setBusy(false);
    }
  }

  async function copySecret() {
    if (!secret) return;
    try { await navigator.clipboard.writeText(secret.value); setCopied(true); } catch { /* select it by hand */ }
  }

  const toggle = (s: string) => setScopes(cur => cur.includes(s) ? cur.filter(x => x !== s) : [...cur, s]);
  const active = (keys ?? []).filter(k => !k.revokedAt);
  const revoked = (keys ?? []).filter(k => k.revokedAt);

  return (
    <Panel
      title="API Keys"
      hint="Keys let bots and other systems read this shop's records and write DRAFT estimates and invoices. A key can never send, approve, take payment, void or delete."
    >
      {error && <div role="alert" style={{ color: 'var(--danger)', fontSize: 13, marginBottom: 10 }}>{error}</div>}

      {secret && (
        <div role="status" style={{ border: '2px solid var(--accent)', borderRadius: 8, padding: 12, marginBottom: 14, background: 'rgba(204,0,0,0.05)' }}>
          <div style={{ fontWeight: 800, fontSize: 13, marginBottom: 4 }}>Key for {secret.name}: copy it now</div>
          <div style={{ ...muted, marginBottom: 8 }}>This is the only time it is shown. Store it in the bot&apos;s settings. If it is lost, revoke it and issue a new one.</div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <code data-testid="api-key-secret" style={{ fontSize: 12, padding: '6px 8px', background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 6, wordBreak: 'break-all', flex: '1 1 260px' }}>{secret.value}</code>
            <button className="btn" onClick={copySecret}>{copied ? 'Copied' : 'Copy'}</button>
            <button className="btn" onClick={() => setSecret(null)}>I have stored it</button>
          </div>
        </div>
      )}

      <div style={{ borderBottom: '1px solid var(--line)', paddingBottom: 14, marginBottom: 14 }}>
        <div style={{ fontWeight: 800, fontSize: 14, marginBottom: 8 }}>Issue a key</div>
        <label style={{ display: 'block', fontSize: 12, fontWeight: 700, marginBottom: 4 }} htmlFor="api-key-name">Name</label>
        <input id="api-key-name" style={{ ...input, maxWidth: 360 }} value={name} maxLength={80}
          placeholder="Wally Bot" onChange={e => setName(e.target.value)} />

        <div style={{ display: 'flex', gap: 8, margin: '10px 0 6px', flexWrap: 'wrap' }}>
          <button className="btn" type="button" onClick={() => setScopes([...SCOPE_PRESETS.read_only])}>Read only</button>
          <button className="btn" type="button" onClick={() => setScopes([...SCOPE_PRESETS.draft_writer])}>Read + write drafts</button>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 4 }}>
          {API_SCOPES.map(s => (
            <label key={s} style={{ fontSize: 12, display: 'flex', gap: 6, alignItems: 'flex-start' }}>
              <input type="checkbox" checked={scopes.includes(s)} onChange={() => toggle(s)} />
              <span>{SCOPE_LABELS[s] ?? s}</span>
            </label>
          ))}
        </div>
        <button className="btn btn-primary" style={{ marginTop: 10 }} disabled={busy || !name.trim() || scopes.length === 0} onClick={issue}>
          {busy ? 'Working…' : 'Issue key'}
        </button>
      </div>

      {keys === null && !error && <div style={muted}>Loading…</div>}
      {keys !== null && active.length === 0 && <div style={muted}>No active keys.</div>}

      {active.map(k => (
        <div key={k.id} style={{ border: '1px solid var(--line)', borderRadius: 8, padding: 12, marginBottom: 8 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
            <div>
              <strong style={{ fontSize: 14 }}>{k.name}</strong>{' '}
              <code style={{ fontSize: 11, color: 'var(--muted)' }}>{k.prefix}…</code>
              {k.allShops && <span style={{ ...chip, marginLeft: 6, background: '#fef3c7', color: '#92400e' }}>ALL SHOPS</span>}
              <div style={muted}>Issued {when(k.createdAt)} · Last used {when(k.lastUsedAt)}</div>
            </div>
            {!k.allShops && <button className="btn" disabled={busy} onClick={() => revoke(k)}>Revoke</button>}
          </div>
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 6 }}>
            {k.scopes.map(s => <span key={s} style={{ ...chip, background: 'var(--surface-soft)', color: 'var(--text)', fontWeight: 600 }}>{SCOPE_LABELS[s] ?? s}</span>)}
          </div>
          {k.allShops && <div style={{ ...muted, marginTop: 6 }}>This key reaches every shop in the organization, so it is revoked by a Redlined1 operator, not here.</div>}
          {k.activity.length > 0 && (
            <ul style={{ margin: '8px 0 0', paddingLeft: 18, fontSize: 12 }}>
              {k.activity.map((a, i) => (
                <li key={i}>{ACTION_LABELS[a.action] ?? a.action} {a.entityId} · {when(a.at)}</li>
              ))}
            </ul>
          )}
        </div>
      ))}

      {revoked.length > 0 && (
        <details style={{ marginTop: 8 }}>
          <summary style={{ ...muted, cursor: 'pointer' }}>Revoked keys ({revoked.length})</summary>
          {revoked.map(k => (
            <div key={k.id} style={{ ...muted, padding: '4px 0' }}>{k.name} <code>{k.prefix}…</code> · revoked {when(k.revokedAt)}</div>
          ))}
        </details>
      )}
    </Panel>
  );
}
