'use client';

/**
 * Redline AI (prototype) — read-only chat panel.
 *
 * Asks /api/redline-ai one of five questions about the signed-in user's own
 * shop: morning brief, stale estimates, who owes money, vehicle history, and
 * follow-up drafts. Drafts are shown with a copy button — this view has no
 * way to send anything, and the API behind it is read-only.
 *
 * The module only appears when the `redline_ai` feature flag is on for the
 * shop (see lib/featureFlags/flaggedModules.ts); the API enforces the same
 * gate server-side.
 */
import { useCallback, useEffect, useState } from 'react';
import { Panel } from '@/components/Panel';
import { getShopId } from '@/lib/shopStore';
import type {
  CustomerOwes,
  EstimateFact,
  FollowUpDraft,
  HistoryEvent,
  VehicleFact,
} from '@/lib/redline-ai/types';

interface AnswerState {
  text: string;
  llmUsed: boolean;
}

async function callApi(body: Record<string, unknown>): Promise<Record<string, unknown>> {
  const res = await fetch('/api/redline-ai', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-shop-id': getShopId() },
    body: JSON.stringify(body),
  });
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) throw new Error(String(json.error ?? `Request failed (${res.status})`));
  if (json.disabled) throw new Error('Redline AI is not enabled for this shop.');
  return json;
}

const QUICK_QUESTIONS: { label: string; job: string; question: string }[] = [
  { label: 'Morning brief', job: 'morning_brief', question: 'Give me this morning\'s brief.' },
  { label: 'Stale estimates', job: 'stale_estimates', question: 'Which estimates are waiting on a reply?' },
  { label: 'Who owes us money?', job: 'who_owes', question: 'Who owes us money?' },
];

/** Tiny keyword router so the free-text box feels like a chat panel. */
function routeQuestion(q: string): string | null {
  const s = q.toLowerCase();
  if (/morning|brief|today|start/.test(s)) return 'morning_brief';
  if (/stale|estimate|quote|no reply|waiting/.test(s)) return 'stale_estimates';
  if (/owe|owed|owing|unpaid|overdue|money|invoice|balance/.test(s)) return 'who_owes';
  return null;
}

export function RedlineAiView() {
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState<AnswerState | null>(null);
  const [estimates, setEstimates] = useState<EstimateFact[]>([]);
  const [owed, setOwed] = useState<CustomerOwes[]>([]);
  const [vehicles, setVehicles] = useState<VehicleFact[]>([]);
  const [vehicleQuery, setVehicleQuery] = useState('');
  const [historyVehicle, setHistoryVehicle] = useState<VehicleFact | null>(null);
  const [events, setEvents] = useState<HistoryEvent[]>([]);
  const [draft, setDraft] = useState<FollowUpDraft | null>(null);
  const [copied, setCopied] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    fetch('/api/redline-ai', { headers: { 'x-shop-id': getShopId() } })
      .then(r => r.json())
      .then(j => setEnabled(!!j.enabled))
      .catch(() => setEnabled(false));
  }, []);

  const run = useCallback(async (body: Record<string, unknown>) => {
    setLoading(true);
    setError('');
    setCopied(false);
    try {
      const json = await callApi(body);
      setAnswer({ text: String(json.answer ?? ''), llmUsed: !!json.llmUsed });
      const data = (json.data ?? {}) as Record<string, unknown>;
      if (Array.isArray(data.estimates)) setEstimates(data.estimates as EstimateFact[]);
      if (Array.isArray(data.customers)) setOwed(data.customers as CustomerOwes[]);
      if (Array.isArray(data.vehicles)) setVehicles(data.vehicles as VehicleFact[]);
      if (Array.isArray(data.events)) setEvents(data.events as HistoryEvent[]);
      if (data.vehicle) setHistoryVehicle(data.vehicle as VehicleFact);
      if (data.draft) setDraft(data.draft as FollowUpDraft);
      return json;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Redline AI request failed');
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  const ask = useCallback((job: string, extra: Record<string, unknown> = {}) => {
    setDraft(null);
    void run({ job, ...extra });
  }, [run]);

  const handleAsk = () => {
    const job = routeQuestion(question);
    if (!job) {
      setError('Try: "morning brief", "which estimates are stale?", "who owes us money?" — or search a vehicle below for its history.');
      return;
    }
    setAnswer(null);
    ask(job);
  };

  const makeDraft = (kind: 'estimate' | 'invoice', id: string) => {
    void run({ job: 'draft_follow_up', draftKind: kind, draftId: id });
  };

  const copyDraft = async () => {
    if (!draft) return;
    try {
      await navigator.clipboard.writeText(draft.draft);
      setCopied(true);
    } catch { /* clipboard blocked — the text is on screen to copy manually */ }
  };

  if (enabled === null) {
    return <Panel title="Redline AI" hint="Checking availability…"><p style={{ color: 'var(--muted)', fontSize: 13 }}>Loading…</p></Panel>;
  }
  if (!enabled) {
    return (
      <Panel title="Redline AI" hint="Read-only assistant for your shop">
        <p style={{ color: 'var(--muted)', fontSize: 13 }}>
          Redline AI is not enabled for this shop yet. It answers five questions from your own
          data — morning brief, stale estimates, who owes money, vehicle history, and follow-up
          drafts — and never sends or changes anything.
        </p>
      </Panel>
    );
  }

  return (
    <>
      <Panel title="Redline AI" hint="Read-only — answers come from your shop's records, with the document numbers cited. Drafts are never sent for you.">
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
          {QUICK_QUESTIONS.map(q => (
            <button
              key={q.job}
              className="btn"
              style={{ fontSize: 12 }}
              disabled={loading}
              onClick={() => { setQuestion(q.question); setAnswer(null); ask(q.job); }}
            >
              {q.label}
            </button>
          ))}
        </div>

        <div className="field" style={{ marginBottom: 12 }}>
          <label>Ask about your shop</label>
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              value={question}
              onChange={e => setQuestion(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleAsk(); }}
              placeholder="e.g. Who owes us money?"
              style={{ flex: 1 }}
            />
            <button className="btn primary" onClick={handleAsk} disabled={loading} style={{ minWidth: 110 }}>
              {loading ? '⏳ Working…' : 'Ask'}
            </button>
          </div>
        </div>

        <div className="field" style={{ marginBottom: 4 }}>
          <label>Vehicle history — search by name or plate</label>
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              value={vehicleQuery}
              onChange={e => setVehicleQuery(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') ask('vehicle_search', { vehicleQuery }); }}
              placeholder="e.g. Civic or กท-1234"
              style={{ flex: 1 }}
            />
            <button className="btn" onClick={() => ask('vehicle_search', { vehicleQuery })} disabled={loading}>
              Search vehicles
            </button>
          </div>
        </div>

        {vehicles.length > 0 && (
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', margin: '10px 0' }}>
            {vehicles.map(v => (
              <button
                key={v.id}
                className="btn"
                style={{ fontSize: 12 }}
                disabled={loading}
                onClick={() => { setVehicles([]); ask('vehicle_history', { vehicleId: v.id }); }}
              >
                {v.label || v.id}{v.plate ? ` · ${v.plate}` : ''}
              </button>
            ))}
          </div>
        )}

        {error && (
          <div style={{ marginTop: 12, padding: '10px 14px', background: 'rgba(204,0,0,0.08)', border: '1px solid rgba(204,0,0,0.3)', borderRadius: 8, color: '#cc0000', fontSize: 13 }}>
            {error}
          </div>
        )}

        {answer && (
          <div style={{ marginTop: 14, padding: '12px 14px', background: 'var(--surface-soft)', border: '1px solid var(--line)', borderRadius: 8 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <strong style={{ fontSize: 13 }}>Answer</strong>
              <span style={{ fontSize: 11, color: 'var(--muted)', border: '1px solid var(--line)', borderRadius: 20, padding: '3px 10px' }}>
                {answer.llmUsed ? '🤖 AI-polished — figures from your records' : '📋 Straight from your records'}
              </span>
            </div>
            <pre style={{ whiteSpace: 'pre-wrap', fontFamily: 'inherit', fontSize: 13, lineHeight: 1.55, margin: 0 }}>{answer.text}</pre>
          </div>
        )}
      </Panel>

      {draft && (
        <Panel title={`Draft follow-up — ${draft.kind} ${draft.reference}`} hint="Draft only. Copy it and send it yourself when you're happy with it.">
          <p style={{ fontSize: 13, lineHeight: 1.55, margin: '0 0 12px' }}>{draft.draft}</p>
          <button className="btn primary" onClick={copyDraft} style={{ fontSize: 12 }}>
            {copied ? '✓ Copied' : 'Copy draft'}
          </button>
        </Panel>
      )}

      {estimates.length > 0 && (
        <Panel title="Estimates waiting on a reply" hint="Oldest first — draft a follow-up for any of them">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {estimates.map(e => (
              <div key={e.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, fontSize: 13 }}>
                <span>
                  <strong>{e.number}</strong> — {e.customerName || 'unknown customer'}
                  {e.vehicleLabel ? ` (${e.vehicleLabel})` : ''} · {e.ageDays}d ago{e.stale ? ' · stale' : ''}
                </span>
                <button className="btn" style={{ fontSize: 12 }} disabled={loading} onClick={() => makeDraft('estimate', e.id)}>
                  Draft follow-up
                </button>
              </div>
            ))}
          </div>
        </Panel>
      )}

      {owed.length > 0 && (
        <Panel title="Who owes us money" hint="Oldest debt first — balances are per invoice, from your records">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {owed.map(g => (
              <div key={g.customerName} style={{ fontSize: 13 }}>
                <strong>{g.customerName}</strong>
                {g.invoices.map(inv => (
                  <div key={inv.invoiceNumber} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, marginTop: 4 }}>
                    <span>
                      Invoice {inv.invoiceNumber} — {inv.currency} {inv.balance.toFixed(2)}
                      {inv.daysOverdue > 0 ? ` · ${inv.daysOverdue}d overdue` : inv.dueDate ? ` · due ${inv.dueDate}` : ''}
                    </span>
                    <button className="btn" style={{ fontSize: 12 }} disabled={loading} onClick={() => makeDraft('invoice', inv.invoiceNumber)}>
                      Draft reminder
                    </button>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </Panel>
      )}

      {historyVehicle && events.length > 0 && (
        <Panel title={`History — ${historyVehicle.label || historyVehicle.id}`} hint={historyVehicle.customerName || undefined}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 13 }}>
            {events.map((ev, i) => (
              <div key={`${ev.reference}-${i}`}>
                <span style={{ color: 'var(--muted)' }}>{ev.date.slice(0, 10)}</span>
                {' — '}{ev.summary} <span style={{ color: 'var(--muted)' }}>[{ev.reference}{ev.status ? `, ${ev.status}` : ''}]</span>
              </div>
            ))}
          </div>
        </Panel>
      )}
    </>
  );
}
