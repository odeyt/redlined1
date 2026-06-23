'use client';

import { useEffect, useRef, useState } from 'react';
import { useAppState, useAppDispatch } from '@/lib/store';
import { moduleTitles } from '@/lib/mock-data';
import { Icon } from './Icon';
import { signOut } from '@/lib/auth';
import { useRouter } from 'next/navigation';
import { useShop } from '@/lib/useShop';
import { globalSearch, type SearchResult, type SearchResultType } from '@/services/globalSearchService';

const TYPE_ICON: Record<SearchResultType, string> = {
  vehicle:      '🚗',
  customer:     '👤',
  job_card:     '🔧',
  repair_order: '📋',
  invoice:      '🧾',
};

const TYPE_LABEL: Record<SearchResultType, string> = {
  vehicle:      'Vehicle',
  customer:     'Customer',
  job_card:     'Job Card',
  repair_order: 'Repair Order',
  invoice:      'Invoice',
};

function statusColor(status?: string) {
  if (!status) return '#999';
  const s = status.toLowerCase();
  if (s.includes('complet') || s.includes('paid') || s.includes('closed')) return '#16a34a';
  if (s.includes('progress') || s.includes('active') || s.includes('open')) return '#2563eb';
  if (s.includes('pending') || s.includes('draft')) return '#d97706';
  return '#6b7280';
}

function highlight(text: string, query: string) {
  if (!query.trim()) return text;
  const idx = text.toLowerCase().indexOf(query.toLowerCase());
  if (idx === -1) return text;
  return (
    <>
      {text.slice(0, idx)}
      <mark style={{ background: 'rgba(204,0,0,0.15)', color: 'var(--accent,#cc0000)', borderRadius: 3, padding: '0 2px', fontWeight: 700 }}>
        {text.slice(idx, idx + query.length)}
      </mark>
      {text.slice(idx + query.length)}
    </>
  );
}

export function Header() {
  const { activeModule } = useAppState();
  const dispatch = useAppDispatch();
  const router = useRouter();
  const { role } = useShop();
  const [title, subtitle] = moduleTitles[activeModule] || ['Dashboard', ''];
  const isTech = role === 'technician';

  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [open, setOpen] = useState(false);
  const [activeIdx, setActiveIdx] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const dropRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Debounced search
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!query.trim() || query.length < 2) {
      setResults([]);
      setOpen(false);
      setSearching(false);
      return;
    }
    setSearching(true);
    debounceRef.current = setTimeout(async () => {
      try {
        const res = await globalSearch(query);
        setResults(res);
        setOpen(true);
        setActiveIdx(-1);
      } catch {
        setResults([]);
      } finally {
        setSearching(false);
      }
    }, 280);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [query]);

  // Close on outside click
  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (inputRef.current?.contains(e.target as Node)) return;
      if (dropRef.current?.contains(e.target as Node)) return;
      setOpen(false);
    }
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, []);

  function handleTopCreateInvoice() {
    dispatch({ type: 'SET_MODULE', module: 'invoices' });
    dispatch({ type: 'SET_PREFILL', prefill: { openNewForm: true } as never });
  }

  async function handleLogout() {
    await signOut();
    router.push('/login');
    router.refresh();
  }

  function navigateTo(result: SearchResult) {
    setOpen(false);
    setQuery('');
    setResults([]);
    dispatch({ type: 'SET_MODULE', module: result.module });
    // Fire a deep-link event so the target module opens the specific record
    const eventMap: Partial<Record<SearchResultType, string>> = {
      vehicle:      'open-vehicle',
      customer:     'open-customer',
      job_card:     'open-job-card',
      repair_order: 'open-ro',
    };
    const eventName = eventMap[result.type];
    if (eventName) {
      setTimeout(() => window.dispatchEvent(new CustomEvent(eventName, {
        detail: {
          vehicleId:      result.id,
          customerId:     result.id,
          jobCardId:      result.id,
          repairOrderId:  result.id,
        },
      })), 80);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!open || results.length === 0) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); setActiveIdx(i => Math.min(i + 1, results.length - 1)); }
    if (e.key === 'ArrowUp')   { e.preventDefault(); setActiveIdx(i => Math.max(i - 1, 0)); }
    if (e.key === 'Enter' && activeIdx >= 0) { e.preventDefault(); navigateTo(results[activeIdx]); }
    if (e.key === 'Escape') { setOpen(false); inputRef.current?.blur(); }
  }

  // Group results by type for display
  const groups: Partial<Record<SearchResultType, SearchResult[]>> = {};
  results.forEach(r => { (groups[r.type] ??= []).push(r); });
  const orderedTypes: SearchResultType[] = ['vehicle', 'customer', 'job_card', 'repair_order', 'invoice'];
  let flatIdx = 0;

  return (
    <header className="topbar">
      <div>
        <h1>{title}</h1>
        <p>{subtitle}</p>
      </div>
      <div className="actions">

        {/* ── Global Search ── */}
        <div style={{ position: 'relative' }}>
          <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
            <span style={{ position: 'absolute', left: 10, color: 'var(--muted)', fontSize: 14, pointerEvents: 'none' }}>
              {searching ? '⏳' : '🔍'}
            </span>
            <input
              ref={inputRef}
              className="search"
              placeholder="Search VINs, customers, job cards…"
              value={query}
              onChange={e => setQuery(e.target.value)}
              onFocus={() => { if (results.length > 0) setOpen(true); }}
              onKeyDown={handleKeyDown}
              style={{ paddingLeft: 32, paddingRight: query ? 30 : undefined }}
              autoComplete="off"
            />
            {query && (
              <button
                onClick={() => { setQuery(''); setResults([]); setOpen(false); inputRef.current?.focus(); }}
                style={{ position: 'absolute', right: 8, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', fontSize: 16, lineHeight: 1 }}
              >×</button>
            )}
          </div>

          {/* ── Dropdown ── */}
          {open && (
            <div
              ref={dropRef}
              style={{
                position: 'absolute', top: 'calc(100% + 6px)', left: 0, right: 0,
                background: 'var(--surface)', border: '1px solid var(--line)',
                borderRadius: 12, boxShadow: '0 8px 32px rgba(0,0,0,0.18)',
                zIndex: 9999, maxHeight: 460, overflowY: 'auto', minWidth: 380,
              }}
            >
              {results.length === 0 && !searching ? (
                <div style={{ padding: '18px 16px', color: 'var(--muted)', fontSize: 13, textAlign: 'center' }}>
                  No results for <strong>"{query}"</strong>
                </div>
              ) : (
                <>
                  {/* VIN / Plate search banner */}
                  {/^[A-Z0-9]{3,}$/i.test(query.trim()) && (
                    <div style={{ padding: '8px 14px', background: 'rgba(204,0,0,0.06)', borderBottom: '1px solid var(--line)', fontSize: 12, color: 'var(--accent,#cc0000)', fontWeight: 600 }}>
                      🔍 Searching by VIN &amp; Plate number across all records
                    </div>
                  )}

                  {orderedTypes.map(type => {
                    const group = groups[type];
                    if (!group?.length) return null;
                    return (
                      <div key={type}>
                        <div style={{ padding: '8px 14px 4px', fontSize: 10, fontWeight: 800, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.08em', borderBottom: '1px solid var(--line)' }}>
                          {TYPE_ICON[type]} {TYPE_LABEL[type]}s
                        </div>
                        {group.map(result => {
                          const idx = flatIdx++;
                          const isActive = idx === activeIdx;
                          return (
                            <div
                              key={result.id}
                              onMouseEnter={() => setActiveIdx(idx)}
                              onMouseDown={() => navigateTo(result)}
                              style={{
                                display: 'flex', alignItems: 'center', gap: 12,
                                padding: '10px 14px', cursor: 'pointer',
                                background: isActive ? 'rgba(204,0,0,0.07)' : 'transparent',
                                borderLeft: isActive ? '3px solid var(--accent,#cc0000)' : '3px solid transparent',
                                transition: 'background .1s',
                              }}
                            >
                              <span style={{ fontSize: 18, flexShrink: 0 }}>{TYPE_ICON[result.type]}</span>
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ fontWeight: 600, fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                  {highlight(result.title, query)}
                                </div>
                                {result.subtitle && (
                                  <div style={{ fontSize: 11, color: 'var(--muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginTop: 1 }}>
                                    {highlight(result.subtitle, query)}
                                  </div>
                                )}
                              </div>
                              {result.badge && (
                                <span style={{ fontSize: 10, fontWeight: 700, color: statusColor(result.badge), background: `${statusColor(result.badge)}18`, border: `1px solid ${statusColor(result.badge)}40`, borderRadius: 20, padding: '2px 8px', whiteSpace: 'nowrap', flexShrink: 0 }}>
                                  {result.badge}
                                </span>
                              )}
                              <span style={{ fontSize: 10, color: 'var(--muted)', flexShrink: 0 }}>→</span>
                            </div>
                          );
                        })}
                      </div>
                    );
                  })}

                  <div style={{ padding: '8px 14px', borderTop: '1px solid var(--line)', fontSize: 11, color: 'var(--muted)', display: 'flex', justifyContent: 'space-between' }}>
                    <span>{results.length} result{results.length !== 1 ? 's' : ''}</span>
                    <span>↑↓ navigate · Enter to open · Esc to close</span>
                  </div>
                </>
              )}
            </div>
          )}
        </div>

        {!isTech && (
          <button className="btn" onClick={() => dispatch({ type: 'OPEN_NEW_JOB_CARD' })}>
            <Icon name="add" /> New Job Card
          </button>
        )}
        {!isTech && (
          <button className="btn primary" onClick={handleTopCreateInvoice}>
            <Icon name="invoice" /> Create Invoice
          </button>
        )}
        <button className="btn" onClick={handleLogout} title="Sign out">
          Sign Out
        </button>
      </div>
    </header>
  );
}
