'use client';

/**
 * Reminders — the shop's internal to-do list.
 *
 * Who needs to do what, and by when. Grouped by when it is due in the
 * viewer's own day: overdue, today, upcoming, and a history of what was
 * completed or cancelled. Owners and managers see the whole shop; everyone
 * else sees what they created or what is assigned to them (the database
 * decides that, not this screen).
 *
 * Nothing here contacts a customer. A reminder is internal work only.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Panel } from '@/components/Panel';
import { useAppDispatch } from '@/lib/store';
import {
  fetchReminders, fetchReminderLinkLabels, fetchReminderHistory,
  completeReminder, reopenReminder, cancelReminder, ReminderError,
  type Reminder, type ReminderEvent,
} from '@/services/reminderService';
import { classifyDue, dueCounts, viewerTimeZone, calendarDate, type DueBucket } from '@/lib/reminders/dueClassification';
import { useReminderSetup, type ReminderSetup } from './useReminderSetup';
import { ReminderFormDialog } from './ReminderFormDialog';

type Tab = DueBucket | 'closed';

const TABS: { id: Tab; label: string }[] = [
  { id: 'overdue', label: 'Overdue' },
  { id: 'today', label: 'Due today' },
  { id: 'upcoming', label: 'Upcoming' },
  { id: 'closed', label: 'Completed' },
];

const EMPTY: Record<Tab, string> = {
  overdue: 'Nothing overdue. Nice work.',
  today: 'Nothing else due today.',
  upcoming: 'Nothing scheduled after today.',
  closed: 'Completed and cancelled reminders will appear here.',
};

// Colour is never the only cue: every state also carries a word and a symbol.
const BUCKET_BADGE: Record<Tab, { text: string; symbol: string; color: string }> = {
  overdue:  { text: 'Overdue',   symbol: '!', color: '#dc2626' },
  today:    { text: 'Today',     symbol: '●', color: '#d97706' },
  upcoming: { text: 'Upcoming',  symbol: '○', color: '#2563eb' },
  closed:   { text: 'Done',      symbol: '✓', color: '#059669' },
};
const PRIORITY_TEXT = { low: 'Low', normal: '', high: 'High priority' } as const;

const EVENT_TEXT: Record<ReminderEvent['action'], string> = {
  created: 'Created', updated: 'Edited', assigned: 'Reassigned',
  completed: 'Completed', reopened: 'Reopened', cancelled: 'Cancelled',
};

const LINK_MODULE = { customer: 'customers', vehicle: 'vehicles', job_card: 'job-cards' } as const;
const LINK_WORD = { customer: 'Customer', vehicle: 'Vehicle', job_card: 'Job' } as const;

function formatDue(iso: string, now: Date, timeZone: string): string {
  const due = new Date(iso);
  const time = new Intl.DateTimeFormat(undefined, { timeZone, hour: 'numeric', minute: '2-digit' }).format(due);
  const today = calendarDate(now, timeZone);
  const tomorrow = calendarDate(new Date(now.getTime() + 86_400_000), timeZone);
  const yesterday = calendarDate(new Date(now.getTime() - 86_400_000), timeZone);
  const day = calendarDate(due, timeZone);
  if (day === today) return `Today, ${time}`;
  if (day === tomorrow) return `Tomorrow, ${time}`;
  if (day === yesterday) return `Yesterday, ${time}`;
  const date = new Intl.DateTimeFormat(undefined, { timeZone, weekday: 'short', day: 'numeric', month: 'short' }).format(due);
  return `${date}, ${time}`;
}

export function RemindersView() {
  const dispatch = useAppDispatch();
  const setup = useReminderSetup();
  const timeZone = useMemo(() => viewerTimeZone(), []);

  const [open, setOpen] = useState<Reminder[]>([]);
  const [closed, setClosed] = useState<Reminder[]>([]);
  const [labels, setLabels] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [tab, setTab] = useState<Tab>('overdue');
  const [mineOnly, setMineOnly] = useState(false);
  const [now, setNow] = useState(() => new Date());
  const [editing, setEditing] = useState<Reminder | null>(null);
  const [creating, setCreating] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [historyFor, setHistoryFor] = useState<string | null>(null);
  const [history, setHistory] = useState<ReminderEvent[] | null>(null);
  const [upgradeHint, setUpgradeHint] = useState(false);
  // The first load picks the first tab with something in it; later reloads
  // leave the person where they are, and so does a tab they chose while the
  // first load was still in flight.
  const autoTabbed = useRef(false);

  // Fetch, then apply — state is only ever set once the data (or the failure)
  // has arrived, never synchronously on the way in.
  const load = useCallback((): Promise<void> => Promise.all([
    fetchReminders({ state: 'open' }),
    fetchReminders({ state: 'closed', limit: 100 }),
  ]).then(([o, c]) => {
    const loadedAt = new Date();
    setError('');
    setOpen(o);
    setClosed(c);
    setNow(loadedAt);
    if (!autoTabbed.current) {
      autoTabbed.current = true;
      const first = dueCounts(o, loadedAt, timeZone);
      setTab(first.overdue > 0 ? 'overdue' : first.today > 0 ? 'today' : first.upcoming > 0 ? 'upcoming' : 'overdue');
    }
    fetchReminderLinkLabels([...o, ...c]).then(setLabels).catch(() => {});
  }, (e: unknown) => {
    setError(e instanceof Error ? e.message : 'Reminders could not be loaded.');
  }).finally(() => {
    setLoading(false);
  }), [timeZone]);

  useEffect(() => {
    load();
  }, [load]);
  // Keep the buckets honest while the screen sits open: something due at
  // 14:00 must move to Overdue at 14:00 without a reload.
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(t);
  }, []);

  const mine = (r: Reminder) => r.assignedTo === setup.userId || (!r.assignedTo && r.createdBy === setup.userId);
  const visibleOpen = mineOnly ? open.filter(mine) : open;
  const visibleClosed = mineOnly ? closed.filter(mine) : closed;
  const counts = dueCounts(visibleOpen, now, timeZone);

  const rows = tab === 'closed'
    ? visibleClosed
    : visibleOpen.filter(r => classifyDue(r.dueAt, now, timeZone) === tab);

  function flash(message: string) {
    setNotice(message);
    setTimeout(() => setNotice(''), 4000);
  }

  async function act(r: Reminder, action: 'complete' | 'reopen' | 'cancel') {
    if (action === 'cancel' && !confirm(`Cancel "${r.title}"? It will move to history and can be reopened later.`)) return;
    setBusyId(r.id);
    setError('');
    try {
      if (action === 'complete') await completeReminder(r.id);
      if (action === 'reopen') await reopenReminder(r.id);
      if (action === 'cancel') await cancelReminder(r.id);
      await load();
      flash(action === 'complete' ? 'Marked done.' : action === 'reopen' ? 'Reopened.' : 'Cancelled.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'That change was not saved.');
      if (e instanceof ReminderError && e.upgrade) setUpgradeHint(true);
    } finally {
      setBusyId(null);
    }
  }

  async function toggleHistory(id: string) {
    if (historyFor === id) { setHistoryFor(null); return; }
    setHistoryFor(id);
    setHistory(null);
    try { setHistory(await fetchReminderHistory(id)); } catch { setHistory([]); }
  }

  function linkChips(r: Reminder) {
    const links: { kind: keyof typeof LINK_MODULE; id: string }[] = [];
    if (r.customerId) links.push({ kind: 'customer', id: r.customerId });
    if (r.vehicleId) links.push({ kind: 'vehicle', id: r.vehicleId });
    if (r.jobCardId) links.push({ kind: 'job_card', id: r.jobCardId });
    return links.map(l => (
      <button key={l.kind} type="button" className="mini-btn"
        onClick={() => dispatch({ type: 'SET_MODULE', module: LINK_MODULE[l.kind] })}
        title={`Open ${LINK_WORD[l.kind].toLowerCase()}s`}
        style={{ fontSize: 12 }}>
        {LINK_WORD[l.kind]}: {labels[`${l.kind}:${l.id}`] ?? '…'}
      </button>
    ));
  }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>Reminders</h1>
          <p style={{ margin: '2px 0 0', fontSize: 13, color: 'var(--muted)' }}>
            Internal to-dos for the shop team. Customers never see these.
          </p>
        </div>
        <button className="btn btn-primary" style={{ marginLeft: 'auto', minHeight: 44 }} onClick={() => setCreating(true)}>
          + New reminder
        </button>
      </div>

      {error && (
        <div role="alert" style={{ padding: 12, marginBottom: 12, borderRadius: 8, background: 'rgba(220,38,38,0.1)', color: '#dc2626', fontSize: 13, display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <span style={{ flex: 1 }}>{error}</span>
          {upgradeHint && (
            <button type="button" className="btn" style={{ fontSize: 12 }}
              onClick={() => dispatch({ type: 'SET_MODULE', module: 'subscriptions' })}>See plans</button>
          )}
          <button type="button" className="btn" style={{ fontSize: 12 }} onClick={() => { setUpgradeHint(false); void load(); }}>
            Retry
          </button>
        </div>
      )}
      <div aria-live="polite" style={notice ? { padding: 12, marginBottom: 12, borderRadius: 8, background: 'rgba(5,150,105,0.1)', color: '#059669', fontSize: 13 } : undefined}>
        {notice}
      </div>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 12 }}>
        <div role="tablist" aria-label="Reminder groups" style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {TABS.map(t => {
            const n = t.id === 'closed' ? null : counts[t.id];
            const selected = tab === t.id;
            return (
              <button key={t.id} role="tab" aria-selected={selected} aria-controls="reminders-panel"
                id={`reminders-tab-${t.id}`} type="button"
                className={selected ? 'btn btn-primary' : 'btn'}
                style={{ minHeight: 40, fontSize: 13 }}
                onClick={() => { autoTabbed.current = true; setTab(t.id); }}>
                {t.label}{n !== null ? ` (${n})` : ''}
              </button>
            );
          })}
        </div>
        {setup.isManager && (
          <label style={{ marginLeft: 'auto', fontSize: 13, display: 'flex', gap: 6, alignItems: 'center', minHeight: 40 }}>
            <input type="checkbox" checked={mineOnly} onChange={e => setMineOnly(e.target.checked)} />
            Only mine
          </label>
        )}
      </div>

      <div id="reminders-panel" role="tabpanel" aria-labelledby={`reminders-tab-${tab}`}>
        <Panel title={TABS.find(t => t.id === tab)!.label}>
          {loading ? (
            <div style={{ color: 'var(--muted)', fontSize: 13 }}>Loading reminders…</div>
          ) : rows.length === 0 && !error ? (
            <div style={{ color: 'var(--muted)', fontSize: 13 }}>{EMPTY[tab]}</div>
          ) : (
            <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
              {rows.map(r => {
                const bucket: Tab = r.status === 'open' ? classifyDue(r.dueAt, now, timeZone) : 'closed';
                const badge = r.status === 'cancelled'
                  ? { text: 'Cancelled', symbol: '–', color: '#64748b' }
                  : BUCKET_BADGE[bucket];
                return (
                  <li key={r.id} style={{ padding: '10px 12px', borderRadius: 8, border: '1px solid var(--border)', borderLeft: `4px solid ${badge.color}` }}>
                    <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', flexWrap: 'wrap' }}>
                      <div style={{ flex: '1 1 240px', minWidth: 0 }}>
                        <div style={{ fontWeight: 600, textDecoration: r.status === 'completed' ? 'line-through' : undefined, overflowWrap: 'anywhere' }}>
                          {r.title}
                        </div>
                        <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                          <span style={{ color: badge.color, fontWeight: 600 }}>
                            <span aria-hidden="true">{badge.symbol} </span>{badge.text}
                          </span>
                          <span>{r.status === 'completed' && r.completedAt ? `Done ${formatDue(r.completedAt, now, timeZone)}` : `Due ${formatDue(r.dueAt, now, timeZone)}`}</span>
                          <span>· {setup.nameFor(r.assignedTo)}</span>
                          {PRIORITY_TEXT[r.priority] && <span style={{ fontWeight: 600 }}>· {PRIORITY_TEXT[r.priority]}</span>}
                        </div>
                        {r.notes && (
                          <div style={{ fontSize: 13, marginTop: 6, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{r.notes}</div>
                        )}
                        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 6 }}>{linkChips(r)}</div>
                      </div>
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                        {r.status === 'open' ? (
                          <>
                            <button type="button" className="btn btn-success" disabled={busyId === r.id}
                              style={{ fontSize: 12, minHeight: 40 }} onClick={() => act(r, 'complete')}
                              aria-label={`Mark "${r.title}" done`}>✓ Done</button>
                            <button type="button" className="btn" disabled={busyId === r.id}
                              style={{ fontSize: 12, minHeight: 40 }} onClick={() => setEditing(r)}
                              aria-label={`Edit "${r.title}"`}>Edit</button>
                            <button type="button" className="btn" disabled={busyId === r.id}
                              style={{ fontSize: 12, minHeight: 40 }} onClick={() => act(r, 'cancel')}
                              aria-label={`Cancel "${r.title}"`}>Cancel</button>
                          </>
                        ) : (
                          <button type="button" className="btn" disabled={busyId === r.id}
                            style={{ fontSize: 12, minHeight: 40 }} onClick={() => act(r, 'reopen')}
                            aria-label={`Reopen "${r.title}"`}>Reopen</button>
                        )}
                        <button type="button" className="btn" style={{ fontSize: 12, minHeight: 40 }}
                          aria-expanded={historyFor === r.id} onClick={() => toggleHistory(r.id)}>
                          History
                        </button>
                      </div>
                    </div>
                    {historyFor === r.id && (
                      <ReminderHistory events={history} setup={setup} now={now} timeZone={timeZone} />
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </Panel>
      </div>

      {(creating || editing) && (
        <ReminderFormDialog
          setup={setup}
          reminder={editing ?? undefined}
          onClose={() => { setCreating(false); setEditing(null); }}
          onSaved={() => {
            const wasEdit = !!editing;
            setCreating(false);
            setEditing(null);
            void load();
            flash(wasEdit ? 'Reminder updated.' : 'Reminder added.');
          }}
        />
      )}
    </div>
  );
}

function ReminderHistory({ events, setup, now, timeZone }: {
  events: ReminderEvent[] | null; setup: ReminderSetup; now: Date; timeZone: string;
}) {
  if (events === null) return <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 8 }}>Loading history…</div>;
  if (events.length === 0) return <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 8 }}>No history recorded.</div>;
  return (
    <ol style={{ margin: '8px 0 0', paddingLeft: 18, fontSize: 12, color: 'var(--muted)' }}>
      {events.map(e => (
        <li key={e.id}>
          {EVENT_TEXT[e.action]}
          {e.action === 'assigned' ? ` to ${setup.nameFor(e.assignedTo)}` : ''}
          {e.action === 'updated' && e.changedFields.length > 0 ? ` (${e.changedFields.map(f => f.replace(/_id$/, '').replace('_', ' ')).join(', ')})` : ''}
          {' by '}{setup.nameFor(e.actorId)} · {formatDue(e.createdAt, now, timeZone)}
        </li>
      ))}
    </ol>
  );
}
