'use client';

import { useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useShop } from '@/lib/useShop';

interface LookupResult {
  suggestedHours: number;
  flatRateCost: number;
  laborRate: number;
  source: string;
  notes: string;
}

interface Props {
  serviceType: string;   // from RO concern/correction field
  vehicle: string;       // "2019 Honda Civic"
  currentHours: number;
  onApply: (hours: number) => void;
}

export function OwnerInsights({ serviceType, vehicle, currentHours, onApply }: Props) {
  const { role, shopId, loading: shopLoading } = useShop();
  const [result, setResult] = useState<LookupResult | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [applied, setApplied] = useState(false);

  // Hard gate: render nothing for non-owners or while shop is still loading
  if (shopLoading || role !== 'owner' || !shopId) return null;

  async function lookup() {
    if (!serviceType.trim()) {
      setError('Add a Concern or Correction description first — it is used to match the labor operation.');
      return;
    }
    setLoading(true);
    setError('');
    setNotFound(false);
    setResult(null);
    setApplied(false);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch('/api/labor-lookup', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session?.access_token ?? ''}`,
        },
        body: JSON.stringify({ shopId, serviceType, vehicle }),
      });

      const json = await res.json();
      if (!res.ok) { setError(json.error ?? 'Lookup failed'); return; }

      if (!json.found) {
        setNotFound(true);
      } else {
        setResult(json);
      }
    } catch {
      setError('Network error — check connection.');
    } finally {
      setLoading(false);
    }
  }

  function handleApply() {
    if (!result) return;
    onApply(result.suggestedHours);
    setApplied(true);
  }

  const variance = result ? currentHours - result.suggestedHours : 0;
  const overBilled = variance > 0;
  const underBilled = variance < 0;

  return (
    <div style={{
      marginTop: 16,
      border: '1.5px solid rgba(204,0,0,0.35)',
      borderRadius: 12,
      background: 'rgba(204,0,0,0.04)',
      overflow: 'hidden',
    }}>
      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '10px 16px',
        background: 'rgba(204,0,0,0.08)',
        borderBottom: '1px solid rgba(204,0,0,0.15)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 14 }}>🔒</span>
          <span style={{ fontWeight: 700, fontSize: 13 }}>Owner Insights</span>
          <span style={{
            fontSize: 10, fontWeight: 700, letterSpacing: '0.07em',
            textTransform: 'uppercase', color: '#cc0000',
            background: 'rgba(204,0,0,0.12)', padding: '2px 8px', borderRadius: 20,
          }}>Confidential</span>
        </div>
        {!result && !loading && (
          <button
            onClick={lookup}
            style={{
              padding: '6px 14px', background: '#cc0000', color: '#fff',
              border: 'none', borderRadius: 8, fontSize: 12, fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Fetch Industry Rate
          </button>
        )}
        {loading && (
          <span style={{ fontSize: 12, color: 'var(--muted)' }}>Looking up…</span>
        )}
        {(result || notFound) && (
          <button
            onClick={lookup}
            style={{
              padding: '4px 10px', background: 'transparent', color: 'var(--muted)',
              border: '1px solid var(--line)', borderRadius: 6, fontSize: 11, cursor: 'pointer',
            }}
          >
            Refresh
          </button>
        )}
      </div>

      {/* Body */}
      <div style={{ padding: '14px 16px' }}>
        {error && (
          <p style={{ fontSize: 12, color: '#cc0000', margin: 0 }}>{error}</p>
        )}

        {!result && !notFound && !error && !loading && (
          <p style={{ fontSize: 12, color: 'var(--muted)', margin: 0 }}>
            Click <strong>Fetch Industry Rate</strong> to compare this job against standard flat-rate times.
            Lookup uses the Concern / Correction description.
          </p>
        )}

        {notFound && (
          <p style={{ fontSize: 12, color: 'var(--muted)', margin: 0 }}>
            No standard flat-rate found for <em>"{serviceType}"</em>.
            Try editing the Concern or Correction field to match a common operation (e.g. "Brake Pads Front", "Oil Change").
          </p>
        )}

        {result && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>

            {/* Main comparison row */}
            <div style={{
              display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12,
              background: 'var(--surface-soft)', borderRadius: 10, padding: '12px 14px',
            }}>
              <div>
                <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 4 }}>Industry Standard</div>
                <div style={{ fontSize: 22, fontWeight: 800, color: '#cc0000' }}>{result.suggestedHours} hrs</div>
                <div style={{ fontSize: 11, color: 'var(--muted)' }}>Flat rate</div>
              </div>
              <div>
                <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 4 }}>Standard Cost</div>
                <div style={{ fontSize: 22, fontWeight: 800 }}>${result.flatRateCost.toFixed(2)}</div>
                <div style={{ fontSize: 11, color: 'var(--muted)' }}>@ ${result.laborRate}/hr</div>
              </div>
              <div>
                <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 4 }}>Your Billed Hours</div>
                <div style={{ fontSize: 22, fontWeight: 800, color: variance === 0 ? '#4caf50' : overBilled ? '#ff9800' : '#2196f3' }}>
                  {currentHours} hrs
                </div>
                <div style={{ fontSize: 11, color: variance === 0 ? '#4caf50' : overBilled ? '#ff9800' : '#2196f3', fontWeight: 600 }}>
                  {variance === 0 && '✓ Matches standard'}
                  {overBilled && `+${variance.toFixed(1)} hrs over standard`}
                  {underBilled && `${variance.toFixed(1)} hrs under standard`}
                </div>
              </div>
            </div>

            {/* Apply button */}
            {variance !== 0 && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <button
                  onClick={handleApply}
                  disabled={applied}
                  style={{
                    padding: '8px 18px',
                    background: applied ? '#4caf50' : '#cc0000',
                    color: '#fff', border: 'none', borderRadius: 8,
                    fontSize: 13, fontWeight: 600, cursor: applied ? 'default' : 'pointer',
                  }}
                >
                  {applied ? '✓ Applied' : `Apply ${result.suggestedHours} hrs to this RO`}
                </button>
                {!applied && (
                  <span style={{ fontSize: 12, color: 'var(--muted)' }}>
                    Overrides billed hours from {currentHours} → {result.suggestedHours}
                  </span>
                )}
              </div>
            )}

            {/* Notes + source */}
            {result.notes && (
              <p style={{ fontSize: 12, color: 'var(--muted)', margin: 0, fontStyle: 'italic' }}>
                {result.notes}
              </p>
            )}
            <p style={{ fontSize: 11, color: '#666', margin: 0 }}>
              Source: {result.source} · Searched for "{serviceType}"
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
