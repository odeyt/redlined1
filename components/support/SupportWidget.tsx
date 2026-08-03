'use client';

import { useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';
import {
  createTicket, postMessage, fetchTickets, fetchMessages, captureContext,
  type SupportTicket, type SupportMessage,
} from '@/services/supportService';

/**
 * The in-app support surface: Ask AI, Message Support, Report a Bug.
 *
 * One launcher rather than three, because they are one need at three levels of
 * escalation — a customer with a problem should not have to decide which of
 * three buttons their problem belongs to. Every AI answer offers a handover to
 * a human, and the bug form is one tab away throughout.
 *
 * Styling uses the app's CSS custom properties (--surface, --accent, --line)
 * so it inherits both themes rather than hardcoding a palette that breaks in
 * light mode.
 */

type Tab = 'ai' | 'chat' | 'bug';

interface ChatTurn { role: 'user' | 'assistant'; text: string }

const SEVERITIES = [
  { key: 'blocking', label: 'Blocking',  hint: 'I cannot work',            color: '#e03030' },
  { key: 'major',    label: 'Major',     hint: 'A feature is broken',      color: '#f59e0b' },
  { key: 'minor',    label: 'Minor',     hint: 'Wrong or awkward',         color: '#60a5fa' },
] as const;

export function SupportWidget() {
  const [open, setOpen]   = useState(false);
  const [tab, setTab]     = useState<Tab>('ai');
  const [signedIn, setSignedIn] = useState(false);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setSignedIn(!!data.user));
  }, []);

  // Close on Escape — a panel that traps you feels broken.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  // Only for signed-in users: every path here needs a shop to attach to.
  if (!signedIn) return null;

  return (
    <>
      <style>{`
        @keyframes rd1-support-in {
          from { opacity: 0; transform: translateY(12px) scale(.98); }
          to   { opacity: 1; transform: none; }
        }
        @keyframes rd1-dot {
          0%, 80%, 100% { opacity: .25; transform: translateY(0); }
          40%           { opacity: 1;   transform: translateY(-3px); }
        }
        .rd1-support-panel { animation: rd1-support-in .18s cubic-bezier(.2,.8,.2,1); }
        .rd1-support-tab { transition: color .15s, background .15s; }
        .rd1-support-launch { transition: transform .15s cubic-bezier(.2,.8,.2,1), box-shadow .15s; }
        .rd1-support-launch:hover { transform: translateY(-2px); box-shadow: 0 12px 32px rgba(224,48,48,.42); }
        @media (prefers-reduced-motion: reduce) {
          .rd1-support-panel, .rd1-support-launch { animation: none; transition: none; }
        }
      `}</style>

      {open && (
        <div
          role="dialog"
          aria-label="Support"
          className="rd1-support-panel"
          style={{
            position: 'fixed', bottom: 88, right: 20, zIndex: 1000,
            width: 'min(400px, calc(100vw - 32px))',
            height: 'min(560px, calc(100vh - 140px))',
            display: 'flex', flexDirection: 'column',
            background: 'var(--surface)',
            border: '1px solid var(--line)',
            borderRadius: 18,
            boxShadow: '0 24px 60px rgba(0,0,0,.5)',
            overflow: 'hidden',
          }}
        >
          <Header onClose={() => setOpen(false)} />
          <Tabs tab={tab} setTab={setTab} />
          <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
            {tab === 'ai'   && <AskAi onEscalate={() => setTab('chat')} />}
            {tab === 'chat' && <ChatPanel />}
            {tab === 'bug'  && <BugPanel onDone={() => setTab('chat')} />}
          </div>
        </div>
      )}

      <button
        onClick={() => setOpen(o => !o)}
        aria-label={open ? 'Close support' : 'Get help'}
        aria-expanded={open}
        className="rd1-support-launch"
        style={{
          position: 'fixed', bottom: 20, right: 20, zIndex: 1000,
          height: 52, paddingInline: open ? 0 : 20, width: open ? 52 : 'auto',
          display: 'flex', alignItems: 'center', gap: 9, justifyContent: 'center',
          borderRadius: 999, cursor: 'pointer',
          background: 'linear-gradient(135deg, var(--accent), var(--accent-2))',
          color: '#fff', border: 'none',
          fontWeight: 700, fontSize: 14, letterSpacing: .2,
          boxShadow: '0 8px 24px rgba(224,48,48,.32)',
        }}
      >
        {open ? <span style={{ fontSize: 20, lineHeight: 1 }}>×</span> : <><span style={{ fontSize: 17 }}>💬</span><span>Help</span></>}
      </button>
    </>
  );
}

// ── Chrome ────────────────────────────────────────────────────────────────

function Header({ onClose }: { onClose: () => void }) {
  return (
    <div style={{
      padding: '16px 18px 14px',
      background: 'linear-gradient(135deg, rgba(224,48,48,.16), transparent 70%)',
      borderBottom: '1px solid var(--line)',
      display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12,
    }}>
      <div>
        <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--text)', letterSpacing: -.2 }}>How can we help?</div>
        <div style={{ fontSize: 11.5, color: 'var(--muted)', marginTop: 3 }}>
          Answers in seconds · a human when you need one
        </div>
      </div>
      <button onClick={onClose} aria-label="Close" style={{
        background: 'none', border: 'none', color: 'var(--muted)',
        fontSize: 20, lineHeight: 1, cursor: 'pointer', padding: 2,
      }}>×</button>
    </div>
  );
}

function Tabs({ tab, setTab }: { tab: Tab; setTab: (t: Tab) => void }) {
  const items: Array<{ key: Tab; label: string; icon: string }> = [
    { key: 'ai',   label: 'Ask AI',   icon: '✦' },
    { key: 'chat', label: 'Message',  icon: '💬' },
    { key: 'bug',  label: 'Report',   icon: '⚑' },
  ];
  return (
    <div role="tablist" style={{ display: 'flex', borderBottom: '1px solid var(--line)', background: 'var(--surface-soft)' }}>
      {items.map(i => {
        const active = tab === i.key;
        return (
          <button
            key={i.key}
            role="tab"
            aria-selected={active}
            onClick={() => setTab(i.key)}
            className="rd1-support-tab"
            style={{
              flex: 1, padding: '11px 8px', border: 'none', cursor: 'pointer',
              background: active ? 'var(--surface)' : 'transparent',
              color: active ? 'var(--accent)' : 'var(--muted)',
              fontWeight: active ? 700 : 600, fontSize: 12.5,
              borderBottom: active ? '2px solid var(--accent)' : '2px solid transparent',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
            }}
          >
            <span aria-hidden style={{ fontSize: 12 }}>{i.icon}</span>{i.label}
          </button>
        );
      })}
    </div>
  );
}

const scrollArea: React.CSSProperties = { flex: 1, minHeight: 0, overflowY: 'auto', padding: '14px 16px' };

const inputBase: React.CSSProperties = {
  width: '100%', padding: '10px 12px', borderRadius: 10,
  border: '1px solid var(--line)', background: 'var(--surface-soft)',
  color: 'var(--text)', fontSize: 13, fontFamily: 'inherit', outline: 'none',
};

const primaryBtn: React.CSSProperties = {
  padding: '10px 16px', borderRadius: 10, border: 'none', cursor: 'pointer',
  background: 'var(--accent)', color: '#fff', fontWeight: 700, fontSize: 13,
};

function Notice({ kind, children }: { kind: 'error' | 'ok'; children: React.ReactNode }) {
  const c = kind === 'error' ? '#e03030' : '#22c55e';
  return (
    <div style={{
      margin: '0 16px 12px', padding: '9px 12px', borderRadius: 10, fontSize: 12,
      background: `${c}14`, border: `1px solid ${c}40`, color: c,
    }}>{children}</div>
  );
}

// ── Ask AI ────────────────────────────────────────────────────────────────

function AskAi({ onEscalate }: { onEscalate: () => void }) {
  const [turns, setTurns] = useState<ChatTurn[]>([]);
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [turns, busy]);

  async function ask(question: string) {
    if (!question.trim() || busy) return;
    const history = turns.slice(-6);
    setTurns(t => [...t, { role: 'user', text: question }]);
    setQ('');
    setBusy(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch('/api/support/assistant', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
        },
        body: JSON.stringify({ question, history }),
      });
      // Read as text first: an error page is not JSON, and res.json() on one
      // throws "Unexpected end of JSON input", which tells the customer nothing.
      const raw = await res.text();
      let payload: { answer?: string | null; fallback?: string; error?: string } = {};
      try { payload = raw ? JSON.parse(raw) : {}; } catch { /* handled below */ }

      const text = payload.answer
        || payload.fallback
        || payload.error
        || `Something went wrong (HTTP ${res.status}). Try the Message tab and a human will reply.`;
      setTurns(t => [...t, { role: 'assistant', text }]);
    } catch {
      setTurns(t => [...t, { role: 'assistant', text: 'I could not reach the assistant. Use the Message tab and a human will reply.' }]);
    } finally {
      setBusy(false);
    }
  }

  const suggestions = [
    'How do I create an invoice?',
    'How do I add a technician?',
    "What's included in the free plan?",
  ];

  return (
    <>
      <div style={scrollArea}>
        {turns.length === 0 && (
          <div>
            <div style={{
              padding: '14px 16px', borderRadius: 14, marginBottom: 14,
              background: 'var(--surface-soft)', border: '1px solid var(--line)',
            }}>
              <div style={{ fontSize: 13, color: 'var(--text)', lineHeight: 1.55 }}>
                Ask me anything about using RedlineD1 — I answer instantly. If I can&rsquo;t help,
                I&rsquo;ll hand you to the team.
              </div>
            </div>
            <div style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--muted)', letterSpacing: .6, marginBottom: 8 }}>
              COMMON QUESTIONS
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
              {suggestions.map(s => (
                <button key={s} onClick={() => ask(s)} style={{
                  textAlign: 'left', padding: '10px 12px', borderRadius: 10, cursor: 'pointer',
                  background: 'transparent', border: '1px solid var(--line)',
                  color: 'var(--text)', fontSize: 12.5,
                }}>{s}</button>
              ))}
            </div>
          </div>
        )}

        {turns.map((t, i) => (
          <div key={i} style={{ marginBottom: 12, display: 'flex', justifyContent: t.role === 'user' ? 'flex-end' : 'flex-start' }}>
            <div style={{
              maxWidth: '86%', padding: '10px 13px', borderRadius: 14, fontSize: 13, lineHeight: 1.55,
              whiteSpace: 'pre-wrap',
              background: t.role === 'user' ? 'var(--accent)' : 'var(--surface-soft)',
              color: t.role === 'user' ? '#fff' : 'var(--text)',
              border: t.role === 'user' ? 'none' : '1px solid var(--line)',
              borderBottomRightRadius: t.role === 'user' ? 4 : 14,
              borderBottomLeftRadius:  t.role === 'user' ? 14 : 4,
            }}>{t.text}</div>
          </div>
        ))}

        {busy && (
          <div style={{ display: 'flex', gap: 4, padding: '10px 13px' }}>
            {[0, 1, 2].map(i => (
              <span key={i} style={{
                width: 6, height: 6, borderRadius: 999, background: 'var(--muted)',
                animation: `rd1-dot 1.2s ${i * 0.15}s infinite ease-in-out`,
              }} />
            ))}
          </div>
        )}

        {turns.length > 0 && !busy && (
          <button onClick={onEscalate} style={{
            width: '100%', marginTop: 4, padding: '9px 12px', borderRadius: 10, cursor: 'pointer',
            background: 'transparent', border: '1px dashed var(--line)', color: 'var(--muted)', fontSize: 12,
          }}>
            Didn&rsquo;t answer it? Message a human →
          </button>
        )}
        <div ref={endRef} />
      </div>

      <Composer
        value={q}
        onChange={setQ}
        onSend={() => ask(q)}
        disabled={busy}
        placeholder="Ask a question…"
      />
    </>
  );
}

// ── Message support ───────────────────────────────────────────────────────

function ChatPanel() {
  const [tickets, setTickets]   = useState<SupportTicket[]>([]);
  const [active, setActive]     = useState<SupportTicket | null>(null);
  const [messages, setMessages] = useState<SupportMessage[]>([]);
  const [draft, setDraft]       = useState('');
  const [busy, setBusy]         = useState(false);
  const [error, setError]       = useState('');
  const [loading, setLoading]   = useState(true);

  useEffect(() => {
    fetchTickets()
      .then(t => { setTickets(t.filter(x => x.kind === 'chat')); })
      .catch(e => setError(e instanceof Error ? e.message : 'Could not load your messages.'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!active) return;
    fetchMessages(active.id).then(setMessages).catch(() => setMessages([]));
  }, [active]);

  async function send() {
    const body = draft.trim();
    if (!body || busy) return;
    setBusy(true); setError('');
    try {
      if (active) {
        const m = await postMessage(active.id, body);
        setMessages(ms => [...ms, m]);
      } else {
        const t = await createTicket({
          kind: 'chat',
          subject: body.slice(0, 60),
          body,
          context: captureContext(),
        });
        setTickets(ts => [t, ...ts]);
        setActive(t);
        setMessages([{ id: 'local', ticketId: t.id, authorRole: 'customer', body, createdAt: new Date().toISOString() }]);
      }
      setDraft('');
    } catch (e) {
      // Never clear the draft on failure — losing what someone typed is the
      // fastest way to lose the report entirely.
      setError(e instanceof Error ? e.message : 'Message not sent.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      {error && <Notice kind="error">{error}</Notice>}
      <div style={scrollArea}>
        {loading && <div style={{ fontSize: 12, color: 'var(--muted)' }}>Loading…</div>}

        {!loading && !active && (
          <>
            <div style={{
              padding: '14px 16px', borderRadius: 14, marginBottom: 14,
              background: 'var(--surface-soft)', border: '1px solid var(--line)',
              fontSize: 13, color: 'var(--text)', lineHeight: 1.55,
            }}>
              Send us a message and we&rsquo;ll reply here. During the beta we read every one.
            </div>
            {tickets.length > 0 && (
              <>
                <div style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--muted)', letterSpacing: .6, marginBottom: 8 }}>
                  YOUR CONVERSATIONS
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                  {tickets.map(t => (
                    <button key={t.id} onClick={() => setActive(t)} style={{
                      textAlign: 'left', padding: '11px 12px', borderRadius: 10, cursor: 'pointer',
                      background: 'transparent', border: '1px solid var(--line)', color: 'var(--text)',
                    }}>
                      <div style={{ fontSize: 12.5, fontWeight: 600 }}>{t.subject || 'Conversation'}</div>
                      <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>
                        {t.status === 'answered' ? 'Replied' : 'Waiting for a reply'} ·{' '}
                        {new Date(t.createdAt).toLocaleDateString()}
                      </div>
                    </button>
                  ))}
                </div>
              </>
            )}
          </>
        )}

        {active && (
          <>
            <button onClick={() => setActive(null)} style={{
              background: 'none', border: 'none', color: 'var(--muted)', fontSize: 12,
              cursor: 'pointer', padding: 0, marginBottom: 12,
            }}>← All conversations</button>
            {messages.map(m => (
              <div key={m.id} style={{ marginBottom: 12, display: 'flex', justifyContent: m.authorRole === 'customer' ? 'flex-end' : 'flex-start' }}>
                <div style={{
                  maxWidth: '86%', padding: '10px 13px', borderRadius: 14, fontSize: 13, lineHeight: 1.55,
                  whiteSpace: 'pre-wrap',
                  background: m.authorRole === 'customer' ? 'var(--accent)' : 'var(--surface-soft)',
                  color: m.authorRole === 'customer' ? '#fff' : 'var(--text)',
                  border: m.authorRole === 'customer' ? 'none' : '1px solid var(--line)',
                }}>{m.body}</div>
              </div>
            ))}
          </>
        )}
      </div>

      <Composer
        value={draft}
        onChange={setDraft}
        onSend={send}
        disabled={busy}
        placeholder={active ? 'Reply…' : 'Describe what you need…'}
      />
    </>
  );
}

// ── Report a bug ──────────────────────────────────────────────────────────

function BugPanel({ onDone }: { onDone: () => void }) {
  const [what, setWhat]       = useState('');
  const [expected, setExpected] = useState('');
  const [severity, setSeverity] = useState<string>('major');
  const [busy, setBusy]       = useState(false);
  const [error, setError]     = useState('');
  const [sent, setSent]       = useState(false);

  async function submit() {
    if (!what.trim() || busy) return;
    setBusy(true); setError('');
    try {
      const body = [
        `What happened:\n${what.trim()}`,
        expected.trim() ? `\n\nWhat I expected:\n${expected.trim()}` : '',
      ].join('');

      await createTicket({
        kind: 'bug',
        subject: what.trim().slice(0, 60),
        body,
        severity,
        context: captureContext({ severity }),
      });
      setSent(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Report not sent.');
    } finally {
      setBusy(false);
    }
  }

  if (sent) {
    return (
      <div style={{ ...scrollArea, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', gap: 10 }}>
        <div style={{ fontSize: 34 }}>✓</div>
        <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>Report received</div>
        <div style={{ fontSize: 12.5, color: 'var(--muted)', maxWidth: 280, lineHeight: 1.6 }}>
          We captured the page you were on and your browser details, so you don&rsquo;t need to explain them.
          We&rsquo;ll reply in Messages.
        </div>
        <button onClick={onDone} style={{ ...primaryBtn, marginTop: 6 }}>Go to Messages</button>
      </div>
    );
  }

  return (
    <>
      {error && <Notice kind="error">{error}</Notice>}
      <div style={scrollArea}>
        <div style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--muted)', letterSpacing: .6, marginBottom: 8 }}>
          HOW BAD IS IT?
        </div>
        <div style={{ display: 'flex', gap: 7, marginBottom: 16 }}>
          {SEVERITIES.map(s => {
            const on = severity === s.key;
            return (
              <button key={s.key} onClick={() => setSeverity(s.key)} style={{
                flex: 1, padding: '9px 6px', borderRadius: 10, cursor: 'pointer',
                background: on ? `${s.color}18` : 'transparent',
                border: `1px solid ${on ? s.color : 'var(--line)'}`,
                color: on ? s.color : 'var(--muted)',
                fontSize: 11.5, fontWeight: on ? 700 : 600,
              }}>
                <div>{s.label}</div>
                <div style={{ fontSize: 9.5, opacity: .85, marginTop: 2, fontWeight: 500 }}>{s.hint}</div>
              </button>
            );
          })}
        </div>

        <label style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--muted)', letterSpacing: .6, display: 'block', marginBottom: 6 }}>
          WHAT HAPPENED?
        </label>
        <textarea
          value={what}
          onChange={e => setWhat(e.target.value)}
          rows={4}
          placeholder="I clicked Save on a job card and…"
          style={{ ...inputBase, resize: 'vertical', marginBottom: 14 }}
        />

        <label style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--muted)', letterSpacing: .6, display: 'block', marginBottom: 6 }}>
          WHAT DID YOU EXPECT? <span style={{ fontWeight: 500, textTransform: 'none', letterSpacing: 0 }}>(optional)</span>
        </label>
        <textarea
          value={expected}
          onChange={e => setExpected(e.target.value)}
          rows={2}
          placeholder="It should have saved and closed."
          style={{ ...inputBase, resize: 'vertical', marginBottom: 14 }}
        />

        <div style={{
          padding: '10px 12px', borderRadius: 10, fontSize: 11.5, lineHeight: 1.55,
          background: 'var(--surface-soft)', border: '1px solid var(--line)', color: 'var(--muted)',
        }}>
          We&rsquo;ll automatically include the page you&rsquo;re on, your screen size and browser —
          nothing from your customer records.
        </div>
      </div>

      <div style={{ padding: 14, borderTop: '1px solid var(--line)', background: 'var(--surface-soft)' }}>
        <button onClick={submit} disabled={busy || !what.trim()} style={{
          ...primaryBtn, width: '100%',
          opacity: busy || !what.trim() ? .5 : 1,
          cursor: busy || !what.trim() ? 'not-allowed' : 'pointer',
        }}>
          {busy ? 'Sending…' : 'Send report'}
        </button>
      </div>
    </>
  );
}

// ── Shared composer ───────────────────────────────────────────────────────

function Composer({ value, onChange, onSend, disabled, placeholder }: {
  value: string; onChange: (v: string) => void; onSend: () => void;
  disabled: boolean; placeholder: string;
}) {
  return (
    <div style={{ padding: 12, borderTop: '1px solid var(--line)', background: 'var(--surface-soft)', display: 'flex', gap: 8 }}>
      <textarea
        value={value}
        onChange={e => onChange(e.target.value)}
        onKeyDown={e => {
          // Enter sends; Shift+Enter makes a new line. Matches every chat the
          // customer already uses.
          if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); onSend(); }
        }}
        rows={1}
        placeholder={placeholder}
        style={{ ...inputBase, resize: 'none', maxHeight: 90 }}
      />
      <button
        onClick={onSend}
        disabled={disabled || !value.trim()}
        aria-label="Send"
        style={{
          ...primaryBtn, padding: '0 14px', flexShrink: 0,
          opacity: disabled || !value.trim() ? .45 : 1,
          cursor: disabled || !value.trim() ? 'not-allowed' : 'pointer',
        }}
      >↑</button>
    </div>
  );
}
