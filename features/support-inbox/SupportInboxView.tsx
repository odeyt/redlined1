'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { Panel } from '@/components/Panel';

/**
 * Operator support inbox — where customer messages and bug reports are read
 * and answered.
 *
 * Built to answer one question on sight: which threads are waiting on us. A
 * support inbox that requires reading every row to find the unanswered ones
 * stops being read, and an unanswered beta customer is worse than no support
 * channel at all.
 *
 * Platform-owner only, gated in the sidebar and enforced by the API.
 */

interface Ticket {
  id: string;
  shop_id: string;
  shopName: string;
  kind: 'chat' | 'bug';
  subject: string;
  status: 'open' | 'answered' | 'closed';
  severity: string | null;
  context: Record<string, unknown> | null;
  created_at: string;
  awaitingUs: boolean;
}

interface Message {
  id: string;
  author_role: 'customer' | 'support' | 'ai';
  body: string;
  created_at: string;
}

const SEVERITY_COLOR: Record<string, string> = {
  blocking: '#e03030',
  major:    '#f59e0b',
  minor:    '#60a5fa',
};

async function authHeaders(): Promise<Record<string, string>> {
  const { data: { session } } = await supabase.auth.getSession();
  return {
    'Content-Type': 'application/json',
    ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
  };
}

/** Reads the body as text first — an error page is not JSON. */
async function readJson(res: Response): Promise<Record<string, unknown>> {
  const raw = await res.text();
  try {
    return raw ? JSON.parse(raw) as Record<string, unknown> : {};
  } catch {
    throw new Error(`Unexpected response (HTTP ${res.status})`);
  }
}

export function SupportInboxView() {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [active, setActive]   = useState<Ticket | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [reply, setReply]     = useState('');
  const [filter, setFilter]   = useState<'waiting' | 'all' | 'bugs'>('waiting');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy]       = useState(false);
  const [error, setError]     = useState('');
  const endRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    setError('');
    try {
      const res = await fetch('/api/support/inbox', { headers: await authHeaders() });
      const body = await readJson(res);
      if (!res.ok) throw new Error(String(body.error ?? `HTTP ${res.status}`));
      setTickets((body.tickets as Ticket[]) ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load the inbox.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    if (!active) return;
    (async () => {
      try {
        const res = await fetch(`/api/support/inbox?ticketId=${encodeURIComponent(active.id)}`, { headers: await authHeaders() });
        const body = await readJson(res);
        setMessages((body.messages as Message[]) ?? []);
      } catch {
        setMessages([]);
      }
    })();
  }, [active]);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  async function send() {
    const text = reply.trim();
    if (!text || !active || busy) return;
    setBusy(true); setError('');
    try {
      const res = await fetch('/api/support/inbox', {
        method: 'POST',
        headers: await authHeaders(),
        body: JSON.stringify({ ticketId: active.id, body: text }),
      });
      const body = await readJson(res);
      if (!res.ok) throw new Error(String(body.error ?? `HTTP ${res.status}`));
      setMessages(ms => [...ms, body.message as Message]);
      setReply('');
      setTickets(ts => ts.map(t => t.id === active.id ? { ...t, status: 'answered', awaitingUs: false } : t));
    } catch (e) {
      // The draft stays — retyping a considered reply is how threads go unanswered.
      setError(e instanceof Error ? e.message : 'Reply not sent.');
    } finally {
      setBusy(false);
    }
  }

  async function setStatus(status: 'open' | 'closed') {
    if (!active) return;
    try {
      const res = await fetch('/api/support/inbox', {
        method: 'POST',
        headers: await authHeaders(),
        body: JSON.stringify({ ticketId: active.id, status }),
      });
      const body = await readJson(res);
      if (!res.ok) throw new Error(String(body.error ?? `HTTP ${res.status}`));
      setTickets(ts => ts.map(t => t.id === active.id ? { ...t, status } : t));
      setActive(a => a ? { ...a, status } : a);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not change the status.');
    }
  }

  const shown = tickets.filter(t =>
    filter === 'waiting' ? t.awaitingUs :
    filter === 'bugs'    ? t.kind === 'bug' :
    true);

  const waitingCount = tickets.filter(t => t.awaitingUs).length;

  return (
    <Panel
      title="Support Inbox"
      hint={waitingCount > 0 ? `${waitingCount} waiting on a reply` : 'Nothing waiting — all threads answered'}
    >
      {error && (
        <div style={{ marginBottom: 14, padding: '10px 13px', borderRadius: 10, fontSize: 12.5,
          background: 'rgba(224,48,48,.08)', border: '1px solid rgba(224,48,48,.28)', color: '#e03030' }}>
          {error}
        </div>
      )}

      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        {([
          ['waiting', `Waiting on us${waitingCount ? ` (${waitingCount})` : ''}`],
          ['bugs',    'Bug reports'],
          ['all',     'Everything'],
        ] as const).map(([k, label]) => (
          <button key={k} onClick={() => setFilter(k)} style={{
            padding: '7px 14px', borderRadius: 999, cursor: 'pointer', fontSize: 12.5,
            fontWeight: filter === k ? 700 : 600,
            background: filter === k ? 'var(--accent)' : 'transparent',
            color: filter === k ? '#fff' : 'var(--muted)',
            border: `1px solid ${filter === k ? 'var(--accent)' : 'var(--line)'}`,
          }}>{label}</button>
        ))}
        <button onClick={() => void load()} style={{
          padding: '7px 14px', borderRadius: 999, cursor: 'pointer', fontSize: 12.5,
          background: 'transparent', color: 'var(--muted)', border: '1px solid var(--line)', marginLeft: 'auto',
        }}>Refresh</button>
      </div>

      {loading && <div style={{ fontSize: 13, color: 'var(--muted)' }}>Loading…</div>}

      {!loading && shown.length === 0 && (
        <div style={{ padding: '32px 16px', textAlign: 'center', color: 'var(--muted)', fontSize: 13 }}>
          {filter === 'waiting' ? 'Every thread has been answered.' : 'Nothing here yet.'}
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: active ? 'minmax(0,1fr) minmax(0,1.4fr)' : '1fr', gap: 16 }}>
        {/* List */}
        {!loading && shown.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {shown.map(t => {
              const on = active?.id === t.id;
              return (
                <button key={t.id} onClick={() => setActive(t)} style={{
                  textAlign: 'left', padding: '12px 14px', borderRadius: 12, cursor: 'pointer',
                  background: on ? 'var(--surface-soft)' : 'transparent',
                  border: `1px solid ${on ? 'var(--accent)' : 'var(--line)'}`,
                  color: 'var(--text)',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                    {t.kind === 'bug' && (
                      <span style={{
                        fontSize: 9.5, fontWeight: 800, letterSpacing: .5, padding: '2px 7px', borderRadius: 999,
                        color: SEVERITY_COLOR[t.severity ?? 'minor'] ?? 'var(--muted)',
                        background: `${SEVERITY_COLOR[t.severity ?? 'minor'] ?? '#666'}18`,
                      }}>{(t.severity ?? 'BUG').toUpperCase()}</span>
                    )}
                    {t.awaitingUs && (
                      <span style={{ width: 7, height: 7, borderRadius: 999, background: 'var(--accent)' }} />
                    )}
                    <span style={{ fontSize: 11, color: 'var(--muted)' }}>{t.shopName}</span>
                  </div>
                  <div style={{ fontSize: 13, fontWeight: 600, lineHeight: 1.4 }}>{t.subject || 'Conversation'}</div>
                  <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 3 }}>
                    {new Date(t.created_at).toLocaleString()} · {t.status}
                  </div>
                </button>
              );
            })}
          </div>
        )}

        {/* Thread */}
        {active && (
          <div style={{ border: '1px solid var(--line)', borderRadius: 14, display: 'flex', flexDirection: 'column', minHeight: 380 }}>
            <div style={{ padding: '12px 14px', borderBottom: '1px solid var(--line)', display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'flex-start' }}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 700 }}>{active.subject || 'Conversation'}</div>
                <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>{active.shopName} · {active.status}</div>
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                <button onClick={() => setStatus(active.status === 'closed' ? 'open' : 'closed')} style={{
                  padding: '5px 11px', borderRadius: 8, cursor: 'pointer', fontSize: 11.5,
                  background: 'transparent', border: '1px solid var(--line)', color: 'var(--muted)',
                }}>{active.status === 'closed' ? 'Reopen' : 'Close'}</button>
                <button onClick={() => setActive(null)} aria-label="Close thread" style={{
                  background: 'none', border: 'none', color: 'var(--muted)', fontSize: 18, cursor: 'pointer', lineHeight: 1,
                }}>×</button>
              </div>
            </div>

            {/* Diagnostics from a bug report — the reason the form collects them. */}
            {active.kind === 'bug' && active.context && (
              <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--line)', background: 'var(--surface-soft)', fontSize: 11, color: 'var(--muted)', display: 'flex', flexWrap: 'wrap', gap: '4px 14px' }}>
                {['path', 'viewport', 'timezone', 'language'].map(k =>
                  active.context?.[k] ? <span key={k}><b style={{ fontWeight: 600 }}>{k}:</b> {String(active.context[k])}</span> : null)}
                {active.context.userAgent ? (
                  <span style={{ width: '100%', wordBreak: 'break-all' }}><b style={{ fontWeight: 600 }}>browser:</b> {String(active.context.userAgent)}</span>
                ) : null}
              </div>
            )}

            <div style={{ flex: 1, overflowY: 'auto', padding: 14, maxHeight: 380 }}>
              {messages.map(m => (
                <div key={m.id} style={{ marginBottom: 12, display: 'flex', justifyContent: m.author_role === 'support' ? 'flex-end' : 'flex-start' }}>
                  <div style={{
                    maxWidth: '85%', padding: '10px 13px', borderRadius: 14, fontSize: 13, lineHeight: 1.55, whiteSpace: 'pre-wrap',
                    background: m.author_role === 'support' ? 'var(--accent)' : 'var(--surface-soft)',
                    color: m.author_role === 'support' ? '#fff' : 'var(--text)',
                    border: m.author_role === 'support' ? 'none' : '1px solid var(--line)',
                  }}>
                    {m.body}
                    <div style={{ fontSize: 9.5, opacity: .7, marginTop: 5 }}>
                      {m.author_role === 'support' ? 'You' : m.author_role === 'ai' ? 'Assistant' : 'Customer'} ·{' '}
                      {new Date(m.created_at).toLocaleString()}
                    </div>
                  </div>
                </div>
              ))}
              <div ref={endRef} />
            </div>

            <div style={{ padding: 12, borderTop: '1px solid var(--line)', display: 'flex', gap: 8 }}>
              <textarea
                value={reply}
                onChange={e => setReply(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void send(); } }}
                rows={2}
                placeholder="Reply to the customer…"
                style={{
                  flex: 1, padding: '9px 12px', borderRadius: 10, resize: 'none',
                  border: '1px solid var(--line)', background: 'var(--surface-soft)',
                  color: 'var(--text)', fontSize: 13, fontFamily: 'inherit', outline: 'none',
                }}
              />
              <button onClick={() => void send()} disabled={busy || !reply.trim()} style={{
                padding: '0 18px', borderRadius: 10, border: 'none', background: 'var(--accent)', color: '#fff',
                fontWeight: 700, fontSize: 13,
                cursor: busy || !reply.trim() ? 'not-allowed' : 'pointer',
                opacity: busy || !reply.trim() ? .45 : 1,
              }}>{busy ? '…' : 'Send'}</button>
            </div>
          </div>
        )}
      </div>
    </Panel>
  );
}
