'use client';

import { useEffect, useState } from 'react';
import { Panel } from '@/components/Panel';
import type { FeatureFlag } from '@/lib/featureFlags/types';

interface FlagRow extends FeatureFlag {
  _toggling?: boolean;
}

function scopeBadge(scope: string) {
  const cfg: Record<string, { label: string; color: string; bg: string }> = {
    global:      { label: 'Global',      color: '#3b82f6', bg: 'rgba(59,130,246,0.12)' },
    shop:        { label: 'Shop',        color: '#8b5cf6', bg: 'rgba(139,92,246,0.12)' },
    role:        { label: 'Role',        color: '#f59e0b', bg: 'rgba(245,158,11,0.12)' },
    user:        { label: 'User',        color: '#ec4899', bg: 'rgba(236,72,153,0.12)' },
    environment: { label: 'Env',         color: '#10b981', bg: 'rgba(16,185,129,0.12)' },
  };
  const c = cfg[scope] ?? { label: scope, color: '#6b7280', bg: 'rgba(107,114,128,0.12)' };
  return (
    <span style={{
      fontSize: 10, fontWeight: 800, padding: '2px 8px', borderRadius: 20,
      background: c.bg, color: c.color, border: `1px solid ${c.color}`,
      letterSpacing: '0.05em', textTransform: 'uppercase',
    }}>
      {c.label}
    </span>
  );
}

export function FeatureFlagsPanel() {
  const [rows, setRows] = useState<FlagRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [error, setError] = useState('');

  async function loadFlags() {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/feature-flags', { credentials: 'include' });
      if (!res.ok) { setError('Failed to load flags'); return; }
      const data = await res.json() as { rows?: FeatureFlag[] };
      if (!data.rows) { setError('Owner access required'); return; }
      setRows(data.rows);
    } catch {
      setError('Failed to load feature flags');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadFlags(); }, []);

  async function toggle(row: FlagRow) {
    setRows(prev => prev.map(r =>
      r.id === row.id ? { ...r, _toggling: true } : r
    ));

    try {
      const res = await fetch(`/api/feature-flags/${encodeURIComponent(row.flag_key)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          enabled:     !row.enabled,
          scope:       row.scope,
          shop_id:     row.shop_id,
          user_id:     row.user_id,
          role:        row.role,
          environment: row.environment,
        }),
      });

      if (res.ok) {
        setRows(prev => prev.map(r =>
          r.id === row.id ? { ...r, enabled: !row.enabled, _toggling: false } : r
        ));
      } else {
        setRows(prev => prev.map(r => r.id === row.id ? { ...r, _toggling: false } : r));
        setError('Toggle failed');
      }
    } catch {
      setRows(prev => prev.map(r => r.id === row.id ? { ...r, _toggling: false } : r));
      setError('Toggle failed');
    }
  }

  // Deduplicate: show one row per flag_key (global scope preferred for display)
  const dedupedKeys = [...new Set(rows.map(r => r.flag_key))];
  const primaryRows = dedupedKeys.map(key => {
    return rows.find(r => r.flag_key === key && r.scope === 'global') ?? rows.find(r => r.flag_key === key)!;
  });

  const filtered = primaryRows.filter(r =>
    !search ||
    r.flag_key.toLowerCase().includes(search.toLowerCase()) ||
    r.display_name.toLowerCase().includes(search.toLowerCase()) ||
    r.description.toLowerCase().includes(search.toLowerCase())
  );

  const enabledCount = primaryRows.filter(r => r.enabled).length;

  return (
    <Panel
      title="Feature Flags"
      hint={`${enabledCount} of ${primaryRows.length} flags enabled — owner only`}
    >
      {/* Search bar */}
      <div style={{ marginBottom: 16 }}>
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search flags…"
          style={{
            width: '100%', padding: '8px 12px', borderRadius: 8,
            border: '1px solid var(--line)', background: 'var(--surface)',
            color: 'var(--text)', fontSize: 13, boxSizing: 'border-box',
          }}
        />
      </div>

      {error && (
        <div style={{ marginBottom: 12, padding: '8px 12px', background: 'rgba(239,68,68,0.08)', borderRadius: 8, color: '#ef4444', fontSize: 13 }}>
          {error}
        </div>
      )}

      {loading ? (
        <div style={{ color: 'var(--muted)', fontSize: 13, padding: '20px 0', textAlign: 'center' }}>Loading flags…</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
          {/* Table header */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: '1fr 2fr 80px 90px 140px',
            gap: 12, padding: '8px 12px',
            fontSize: 11, fontWeight: 700, color: 'var(--muted)',
            textTransform: 'uppercase', letterSpacing: '0.06em',
            borderBottom: '1px solid var(--line)',
          }}>
            <div>Flag</div>
            <div>Description</div>
            <div>Scope</div>
            <div style={{ textAlign: 'center' }}>Status</div>
            <div>Last Updated</div>
          </div>

          {filtered.length === 0 && (
            <div style={{ color: 'var(--muted)', fontSize: 13, padding: '20px 12px', textAlign: 'center' }}>
              No flags match your search.
            </div>
          )}

          {filtered.map(row => {
            const updated = new Date(row.updated_at).toLocaleDateString('en-US', {
              month: 'short', day: 'numeric', year: 'numeric',
            });
            return (
              <div
                key={row.id}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 2fr 80px 90px 140px',
                  gap: 12, padding: '12px 12px',
                  borderBottom: '1px solid var(--line)',
                  alignItems: 'center',
                  background: row.enabled ? 'rgba(34,197,94,0.03)' : 'transparent',
                  transition: 'background 0.15s',
                }}
              >
                {/* Flag key + display name */}
                <div>
                  <div style={{ fontWeight: 700, fontSize: 13 }}>{row.display_name || row.flag_key}</div>
                  <div style={{ fontSize: 11, color: 'var(--muted)', fontFamily: 'monospace', marginTop: 2 }}>{row.flag_key}</div>
                </div>

                {/* Description */}
                <div style={{ fontSize: 12, color: 'var(--muted)' }}>
                  {row.description || '—'}
                </div>

                {/* Scope badge */}
                <div>{scopeBadge(row.scope)}</div>

                {/* Toggle */}
                <div style={{ display: 'flex', justifyContent: 'center' }}>
                  <button
                    onClick={() => toggle(row)}
                    disabled={row._toggling}
                    title={row.enabled ? 'Click to disable' : 'Click to enable'}
                    style={{
                      width: 44, height: 24, borderRadius: 12, border: 'none',
                      cursor: row._toggling ? 'not-allowed' : 'pointer',
                      background: row.enabled ? '#22c55e' : 'var(--surface-soft)',
                      position: 'relative', transition: 'background 0.2s',
                      opacity: row._toggling ? 0.6 : 1,
                    }}
                  >
                    <div style={{
                      width: 18, height: 18, borderRadius: '50%', background: '#fff',
                      position: 'absolute', top: 3,
                      left: row.enabled ? 23 : 3,
                      transition: 'left 0.2s',
                      boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
                    }} />
                  </button>
                </div>

                {/* Last updated */}
                <div style={{ fontSize: 12, color: 'var(--muted)' }}>{updated}</div>
              </div>
            );
          })}
        </div>
      )}
    </Panel>
  );
}
