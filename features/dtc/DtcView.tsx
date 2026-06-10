'use client';

import { useState } from 'react';
import { Panel } from '@/components/Panel';
import {
  lookupDtc, searchDtc, DTC_CATEGORIES, DTC_SYSTEMS,
  type DtcResult,
} from '@/services/dtcLookupService';
import { supabase } from '@/lib/supabase';

const SEVERITY_STYLE: Record<string, { bg: string; color: string; icon: string }> = {
  Critical: { bg: '#f4433622', color: '#f44336', icon: '🚨' },
  High:     { bg: '#ff980022', color: '#ff9800', icon: '⚠️' },
  Medium:   { bg: '#fff59d33', color: '#f59e0b', icon: '🔶' },
  Low:      { bg: '#4caf5022', color: '#4caf50', icon: '🟡' },
  Info:     { bg: '#2196f322', color: '#2196f3', icon: 'ℹ️' },
};

const QUICK_CODES = ['P0300','P0420','P0171','P0442','P0700','C0035','U0100','B0020','P0011','P0562'];

type SaveTarget = 'job-card' | 'repair-order' | 'none';

export function DtcView() {
  const [query, setQuery]       = useState('');
  const [result, setResult]     = useState<DtcResult | null>(null);
  const [searchResults, setSearchResults] = useState<DtcResult[]>([]);
  const [error, setError]       = useState('');
  const [toast, setToast]       = useState('');
  const [catFilter, setCatFilter]  = useState('All');
  const [sysFilter, setSysFilter]  = useState('All');
  const [history, setHistory]   = useState<DtcResult[]>([]);
  const [saveTarget, setSaveTarget] = useState<SaveTarget>('none');
  const [saveId, setSaveId]     = useState('');
  const [saving, setSaving]     = useState(false);
  const [showSearch, setShowSearch] = useState(false);

  function notify(msg: string) { setToast(msg); setTimeout(() => setToast(''), 3500); }

  function handleLookup(code?: string) {
    const q = (code ?? query).trim().toUpperCase();
    if (!q) return setError('Enter a DTC code.');
    setError('');

    const found = lookupDtc(q);
    if (found) {
      setResult(found);
      setSearchResults([]);
      setShowSearch(false);
      setHistory(prev => [found, ...prev.filter(h => h.code !== found.code)].slice(0, 15));
    } else {
      // Try search
      const hits = searchDtc(q);
      if (hits.length > 0) {
        setSearchResults(hits);
        setResult(null);
        setShowSearch(true);
      } else {
        setResult(null);
        setSearchResults([]);
        setError(`Code "${q}" not found in database. Try searching by system or keyword.`);
      }
    }
    setQuery(q);
  }

  function handleSearch() {
    const q = query.trim();
    if (!q) return;
    let hits = searchDtc(q);
    if (catFilter !== 'All') hits = hits.filter(d => d.category === catFilter);
    if (sysFilter !== 'All') hits = hits.filter(d => d.system === sysFilter);
    setSearchResults(hits);
    setResult(null);
    setShowSearch(true);
    if (hits.length === 0) setError('No codes matched your search.');
  }

  async function handleSave() {
    if (!result || !saveId) return setError('Enter a Job Card ID or RO Number to save to.');
    setSaving(true);
    try {
      const noteText = `DTC: ${result.code} — ${result.description}\nSeverity: ${result.severity}\nCauses: ${result.causes.join(', ')}\nRecommendation: ${result.recommendation}`;
      if (saveTarget === 'job-card') {
        const { data: job } = await supabase.from('job_cards').select('notes').eq('id', saveId).single();
        await supabase.from('job_cards').update({ notes: [job?.notes, noteText].filter(Boolean).join('\n\n') }).eq('id', saveId);
        notify(`DTC ${result.code} saved to Job Card ${saveId}.`);
      } else if (saveTarget === 'repair-order') {
        const { data: ro } = await supabase.from('repair_orders').select('notes').eq('ro_number', saveId).single();
        await supabase.from('repair_orders').update({ notes: [ro?.notes, noteText].filter(Boolean).join('\n\n'), cause: result.causes.slice(0, 2).join('; ') }).eq('ro_number', saveId);
        notify(`DTC ${result.code} saved to RO ${saveId}.`);
      }
      setSaveTarget('none'); setSaveId('');
    } catch (e: unknown) { setError('Save failed: ' + (e instanceof Error ? e.message : '')); }
    finally { setSaving(false); }
  }

  return (
    <>
      {toast && <div className="toast toast-visible">{toast}</div>}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 300px', gap: 16, alignItems: 'start' }}>

        {/* ── Left: Main Lookup ── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

          <Panel title="🔧 DTC Code Lookup" hint="200+ codes covering P, B, C, U systems with causes, steps, and repair estimates">

            {/* Search Bar */}
            <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
              <input
                value={query}
                onChange={e => { setQuery(e.target.value.toUpperCase()); setError(''); }}
                onKeyDown={e => e.key === 'Enter' && handleLookup()}
                placeholder="P0420, P0300, misfire, lean…"
                style={{ flex: 1, minWidth: 180, padding: '11px 14px', borderRadius: 10, border: '2px solid var(--line)', background: 'var(--surface)', color: 'var(--text)', fontSize: 15, fontFamily: 'monospace', fontWeight: 600, letterSpacing: '0.06em', outline: 'none' }}
              />
              <button className="btn btn-primary" onClick={() => handleLookup()} style={{ padding: '11px 22px', fontSize: 14, fontWeight: 700 }}>
                🔍 Look Up
              </button>
              <button className="btn" onClick={handleSearch} style={{ padding: '11px 16px', fontSize: 13 }}>
                Search
              </button>
            </div>

            {/* Filters */}
            <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
              <select value={catFilter} onChange={e => setCatFilter(e.target.value)}
                style={{ padding: '7px 10px', borderRadius: 8, border: '1px solid var(--line)', background: 'var(--surface-soft)', color: 'var(--text)', fontSize: 12 }}>
                {DTC_CATEGORIES.map(c => <option key={c}>{c}</option>)}
              </select>
              <select value={sysFilter} onChange={e => setSysFilter(e.target.value)}
                style={{ padding: '7px 10px', borderRadius: 8, border: '1px solid var(--line)', background: 'var(--surface-soft)', color: 'var(--text)', fontSize: 12 }}>
                {DTC_SYSTEMS.map(s => <option key={s}>{s}</option>)}
              </select>
            </div>

            {/* Quick codes */}
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 4 }}>
              <span style={{ fontSize: 11, color: 'var(--muted)', alignSelf: 'center' }}>Quick:</span>
              {QUICK_CODES.map(c => (
                <button key={c} onClick={() => handleLookup(c)}
                  style={{ fontSize: 11, fontFamily: 'monospace', fontWeight: 700, padding: '3px 10px', borderRadius: 8, border: '1px solid var(--line)', background: 'var(--surface-soft)', color: 'var(--muted)', cursor: 'pointer' }}>
                  {c}
                </button>
              ))}
            </div>

            {error && <div style={{ padding: '10px 14px', background: '#fff0f0', borderRadius: 8, color: '#f44336', fontSize: 13, marginTop: 8 }}>⚠ {error}</div>}
          </Panel>

          {/* Search Results */}
          {showSearch && searchResults.length > 0 && (
            <Panel title={`Search Results (${searchResults.length})`}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {searchResults.map(d => {
                  const sty = SEVERITY_STYLE[d.severity] ?? SEVERITY_STYLE.Info;
                  return (
                    <div key={d.code} onClick={() => { setResult(d); setShowSearch(false); setHistory(prev => [d, ...prev.filter(h => h.code !== d.code)].slice(0, 15)); }}
                      style={{ display: 'flex', gap: 12, alignItems: 'flex-start', padding: '10px 14px', borderRadius: 10, cursor: 'pointer', border: '1px solid var(--line)', background: 'var(--surface-soft)' }}>
                      <div style={{ fontFamily: 'monospace', fontWeight: 800, fontSize: 14, color: 'var(--accent)', minWidth: 60 }}>{d.code}</div>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 13, fontWeight: 600 }}>{d.description}</div>
                        <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>{d.category} · {d.system}</div>
                      </div>
                      <span style={{ fontSize: 10, fontWeight: 800, padding: '2px 8px', borderRadius: 10, background: sty.bg, color: sty.color, whiteSpace: 'nowrap' }}>{sty.icon} {d.severity}</span>
                    </div>
                  );
                })}
              </div>
            </Panel>
          )}

          {/* DTC Result */}
          {result && (
            <div style={{ background: 'var(--surface)', border: `2px solid ${SEVERITY_STYLE[result.severity]?.color || '#888'}`, borderRadius: 14, padding: 28 }}>

              {/* Header */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20, paddingBottom: 18, borderBottom: '2px solid var(--line)' }}>
                <div>
                  <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                    <div style={{ fontFamily: 'monospace', fontSize: 32, fontWeight: 900, color: 'var(--accent)' }}>{result.code}</div>
                    <span style={{ fontSize: 12, fontWeight: 800, padding: '4px 14px', borderRadius: 20, background: (SEVERITY_STYLE[result.severity]?.bg ?? '#88888822'), color: (SEVERITY_STYLE[result.severity]?.color ?? '#888'), border: `1px solid ${(SEVERITY_STYLE[result.severity]?.color ?? '#888')}44` }}>
                      {SEVERITY_STYLE[result.severity]?.icon} {result.severity}
                    </span>
                  </div>
                  <div style={{ fontSize: 18, fontWeight: 700, marginTop: 6 }}>{result.description}</div>
                  <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4 }}>{result.category} · {result.system}</div>
                </div>
                <div style={{ textAlign: 'right', background: 'var(--surface-soft)', borderRadius: 10, padding: '12px 16px' }}>
                  <div style={{ fontSize: 11, color: 'var(--muted)', textTransform: 'uppercase', fontWeight: 700 }}>Est. Repair Cost</div>
                  <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--accent)', marginTop: 4 }}>{result.estimatedRepairCost}</div>
                </div>
              </div>

              {/* Customer description */}
              <div style={{ padding: '14px 18px', background: 'rgba(33,150,243,0.07)', border: '1px solid rgba(33,150,243,0.2)', borderRadius: 10, marginBottom: 20 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#2196f3', textTransform: 'uppercase', marginBottom: 6 }}>📋 Customer-Friendly Explanation</div>
                <p style={{ fontSize: 14, lineHeight: 1.7, margin: 0 }}>{result.customerDescription}</p>
              </div>

              {/* Recommendation */}
              <div style={{ padding: '12px 16px', background: (SEVERITY_STYLE[result.severity]?.bg ?? '#88888811'), borderRadius: 10, marginBottom: 20, border: `1px solid ${(SEVERITY_STYLE[result.severity]?.color ?? '#888')}33` }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', marginBottom: 4 }}>Recommended Action</div>
                <div style={{ fontSize: 15, fontWeight: 700 }}>{result.recommendation}</div>
              </div>

              {/* Causes + Steps */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 20 }}>
                <div>
                  <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 10 }}>🔎 Common Causes</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {result.causes.map((cause, i) => (
                      <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'flex-start', fontSize: 13 }}>
                        <span style={{ color: '#f44336', fontWeight: 700, flexShrink: 0, marginTop: 1 }}>•</span>
                        <span>{cause}</span>
                      </div>
                    ))}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 10 }}>🔧 Diagnostic Steps</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {result.steps.map((step, i) => (
                      <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'flex-start', fontSize: 13 }}>
                        <span style={{ background: 'var(--accent)', color: '#fff', borderRadius: '50%', width: 20, height: 20, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 800, flexShrink: 0, marginTop: 1 }}>{i + 1}</span>
                        <span>{step}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Save to CRM */}
              <div style={{ borderTop: '1px solid var(--line)', paddingTop: 16 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', marginBottom: 10 }}>💾 Save to CRM</div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                  <select value={saveTarget} onChange={e => setSaveTarget(e.target.value as SaveTarget)}
                    style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid var(--line)', background: 'var(--surface-soft)', color: 'var(--text)', fontSize: 13 }}>
                    <option value="none">— Save to… —</option>
                    <option value="job-card">Job Card</option>
                    <option value="repair-order">Repair Order</option>
                  </select>
                  {saveTarget !== 'none' && (
                    <>
                      <input value={saveId} onChange={e => setSaveId(e.target.value)} placeholder={saveTarget === 'job-card' ? 'Job Card ID (JC-001)' : 'RO Number (RO-00001)'}
                        style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid var(--line)', background: 'var(--surface)', color: 'var(--text)', fontSize: 13, width: 200 }} />
                      <button className="btn btn-primary" onClick={handleSave} disabled={saving} style={{ fontSize: 13 }}>
                        {saving ? 'Saving…' : '💾 Save'}
                      </button>
                    </>
                  )}
                  <button className="btn" onClick={() => { const t = `DTC: ${result.code} — ${result.description}\nSeverity: ${result.severity}\nCauses: ${result.causes.join(', ')}\nSteps: ${result.steps.join(' → ')}\nEst. Cost: ${result.estimatedRepairCost}`; navigator.clipboard.writeText(t); notify('DTC details copied!'); }} style={{ fontSize: 13 }}>
                    📋 Copy
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* ── Right: History + DTC Guide ── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

          {history.length > 0 && (
            <Panel title="🕐 Lookup History">
              <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                {history.map(h => {
                  const sty = SEVERITY_STYLE[h.severity] ?? SEVERITY_STYLE.Info;
                  return (
                    <div key={h.code} onClick={() => { setResult(h); setShowSearch(false); }}
                      style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '8px 10px', borderRadius: 8, cursor: 'pointer', border: `1px solid ${result?.code === h.code ? 'var(--accent)' : 'var(--line)'}`, background: result?.code === h.code ? 'rgba(204,0,0,0.06)' : 'var(--surface-soft)' }}>
                      <div style={{ fontFamily: 'monospace', fontWeight: 800, fontSize: 13, color: 'var(--accent)', minWidth: 55 }}>{h.code}</div>
                      <div style={{ flex: 1, fontSize: 11, color: 'var(--muted)', lineHeight: 1.3 }}>{h.description.slice(0, 40)}{h.description.length > 40 ? '…' : ''}</div>
                      <span style={{ fontSize: 9, fontWeight: 800, color: sty.color }}>{sty.icon}</span>
                    </div>
                  );
                })}
              </div>
            </Panel>
          )}

          <Panel title="📖 DTC Code Guide">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, fontSize: 12 }}>
              {[
                { prefix: 'P', title: 'Powertrain', desc: 'Engine, transmission, fuel, emissions. Most common codes.', color: '#2196f3' },
                { prefix: 'B', title: 'Body', desc: 'Airbags, windows, seats, BCM, climate. Driver comfort & safety.', color: '#9c27b0' },
                { prefix: 'C', title: 'Chassis', desc: 'ABS, brakes, suspension, steering, traction control.', color: '#ff9800' },
                { prefix: 'U', title: 'Network', desc: 'Module communication faults on CAN, LIN, MOST buses.', color: '#f44336' },
              ].map(({ prefix, title, desc, color }) => (
                <div key={prefix} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', padding: '10px 12px', background: color + '11', borderRadius: 8, border: `1px solid ${color}33` }}>
                  <div style={{ width: 28, height: 28, borderRadius: 6, background: color, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 900, flexShrink: 0, fontFamily: 'monospace' }}>{prefix}</div>
                  <div>
                    <div style={{ fontWeight: 700, color }}>{title}</div>
                    <div style={{ color: 'var(--muted)', marginTop: 2, lineHeight: 1.5 }}>{desc}</div>
                  </div>
                </div>
              ))}
              <div style={{ padding: '10px 12px', background: 'var(--surface-soft)', borderRadius: 8, color: 'var(--muted)', lineHeight: 1.6, marginTop: 4 }}>
                <strong style={{ color: 'var(--text)' }}>Number ranges:</strong><br />
                <code>x0xxx</code> = Generic (SAE)<br />
                <code>x1xxx–x3xxx</code> = Manufacturer-specific<br />
                <code>x0300</code> = Random misfire<br />
                <code>x0420</code> = Catalytic converter
              </div>
            </div>
          </Panel>

          <Panel title="⚡ Severity Guide">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
              {Object.entries(SEVERITY_STYLE).map(([sev, sty]) => (
                <div key={sev} style={{ display: 'flex', gap: 10, alignItems: 'center', fontSize: 12 }}>
                  <span style={{ fontSize: 11, fontWeight: 800, padding: '3px 10px', borderRadius: 10, background: sty.bg, color: sty.color, minWidth: 72, textAlign: 'center' }}>{sty.icon} {sev}</span>
                  <span style={{ color: 'var(--muted)' }}>
                    {sev === 'Critical' && 'Stop driving — tow immediately'}
                    {sev === 'High'     && 'Repair soon — safety or damage risk'}
                    {sev === 'Medium'   && 'Service within 1–2 weeks'}
                    {sev === 'Low'      && 'Minor — monitor and schedule service'}
                    {sev === 'Info'     && 'Informational — no immediate action'}
                  </span>
                </div>
              ))}
            </div>
          </Panel>
        </div>

      </div>
    </>
  );
}
