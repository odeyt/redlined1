'use client';

/**
 * Create or edit one internal reminder.
 *
 * Opened from the Reminders screen, or from a customer, vehicle or job card
 * with that record already linked. The due time is entered as a wall-clock
 * time in the viewer's own timezone and stored as an instant.
 */
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import {
  createReminder, updateReminder, ReminderError,
  type Reminder, type ReminderLink, type ReminderPriority,
} from '@/services/reminderService';
import { useAppDispatch } from '@/lib/store';
import { REMINDER_NOTES_MAX, REMINDER_TITLE_MAX } from '@/lib/reminders/schemas';
import { instantToWallClock, viewerTimeZone, wallClockToInstant } from '@/lib/reminders/dueClassification';
import type { ReminderSetup } from './useReminderSetup';

export interface PresetLink {
  link: ReminderLink;
  /** What the link is called on screen, e.g. the customer's name. */
  label: string;
}

interface Props {
  setup: ReminderSetup;
  /** Present when editing. */
  reminder?: Reminder;
  preset?: PresetLink;
  onClose: () => void;
  onSaved: (reminder: Reminder) => void;
}

const overlay: React.CSSProperties = {
  position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 1100,
  display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 12,
};
const panel: React.CSSProperties = {
  background: 'var(--surface)', color: 'var(--text)', border: '1px solid var(--line)', borderRadius: 14,
  width: '100%', maxWidth: 520, maxHeight: '92vh', overflowY: 'auto', padding: '22px 20px',
  boxShadow: '0 24px 80px rgba(0,0,0,0.35)',
};
const field: React.CSSProperties = { display: 'grid', gap: 6, marginBottom: 14 };
const label: React.CSSProperties = { fontSize: 13, fontWeight: 600 };
const input: React.CSSProperties = {
  width: '100%', minHeight: 44, padding: '10px 12px', fontSize: 16, borderRadius: 8,
  border: '1px solid var(--line)', background: 'var(--surface-soft)', color: 'var(--text)', fontFamily: 'inherit',
};

const PRIORITY_LABEL: Record<ReminderPriority, string> = { low: 'Low', normal: 'Normal', high: 'High' };

/** Tomorrow at 09:00 in the viewer's timezone — a sensible default due time. */
function defaultDue(timeZone: string): string {
  const tomorrow = new Date(Date.now() + 86_400_000);
  return instantToWallClock(tomorrow, timeZone).slice(0, 10) + 'T09:00';
}

function newId(): string | undefined {
  try { return crypto.randomUUID(); } catch { return undefined; }
}

export function ReminderFormDialog({ setup, reminder, preset, onClose, onSaved }: Props) {
  const dispatch = useAppDispatch();
  const timeZone = useMemo(() => viewerTimeZone(), []);
  const titleId = useId();
  const errorId = useId();
  const titleRef = useRef<HTMLInputElement>(null);
  // One id per dialog, so pressing Save twice or retrying after a dropped
  // response never creates two reminders.
  const [createId] = useState(() => newId());

  const [title, setTitle] = useState(reminder?.title ?? '');
  const [notes, setNotes] = useState(reminder?.notes ?? '');
  const [due, setDue] = useState(reminder ? instantToWallClock(new Date(reminder.dueAt), timeZone) : defaultDue(timeZone));
  const [priority, setPriority] = useState<ReminderPriority>(reminder?.priority ?? 'normal');
  const [assignedTo, setAssignedTo] = useState<string>(reminder ? (reminder.assignedTo ?? '') : (setup.userId ?? ''));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [upgrade, setUpgrade] = useState(false);

  useEffect(() => { titleRef.current?.focus(); }, []);
  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape' && !busy) onClose(); }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [busy, onClose]);

  // Who can be chosen. Staff, and plans without team assignment, see only
  // themselves. An existing assignee is always kept in the list, so editing a
  // reminder after a downgrade never silently reassigns it.
  const canAssignOthers = setup.isManager && !!setup.entitlements?.canAssignToOthers;
  const options: { value: string; text: string }[] = [{ value: '', text: 'Unassigned' }];
  if (setup.userId) options.push({ value: setup.userId, text: 'Me' });
  if (canAssignOthers) {
    for (const m of setup.members) {
      if (m.userId !== setup.userId) options.push({ value: m.userId, text: m.email.split('@')[0] + ` (${m.role})` });
    }
  }
  if (reminder?.assignedTo && !options.some(o => o.value === reminder.assignedTo)) {
    options.push({ value: reminder.assignedTo, text: setup.nameFor(reminder.assignedTo) });
  }
  const canChangeAssignee = !reminder || setup.isManager || reminder.createdBy === setup.userId;

  async function save() {
    setError('');
    setUpgrade(false);
    const instant = wallClockToInstant(due, timeZone);
    if (!title.trim()) { setError('Give the reminder a title.'); return; }
    if (!instant) { setError('Choose a due date and time.'); return; }

    setBusy(true);
    try {
      const common = {
        title,
        notes: notes.trim() ? notes : null,
        dueAt: instant.toISOString(),
        priority,
      };
      const saved = reminder
        ? await updateReminder(reminder.id, {
            ...common,
            ...(canChangeAssignee && (assignedTo || null) !== reminder.assignedTo ? { assignedTo: assignedTo || null } : {}),
          })
        : await createReminder({
            ...common,
            id: createId,
            assignedTo: assignedTo || null,
            customerId: preset?.link.kind === 'customer' ? preset.link.id : null,
            vehicleId: preset?.link.kind === 'vehicle' ? preset.link.id : null,
            jobCardId: preset?.link.kind === 'job_card' ? preset.link.id : null,
          });
      onSaved(saved);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'The reminder was not saved. Try again.');
      setUpgrade(e instanceof ReminderError && e.upgrade);
    } finally {
      setBusy(false);
    }
  }

  const titleLeft = REMINDER_TITLE_MAX - title.trim().length;

  return (
    <div style={overlay} onClick={() => { if (!busy) onClose(); }}>
      <div role="dialog" aria-modal="true" aria-labelledby={titleId} style={panel} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, marginBottom: 14 }}>
          <h2 id={titleId} style={{ margin: 0, fontSize: 19, fontWeight: 800 }}>
            {reminder ? 'Edit reminder' : 'New reminder'}
          </h2>
          <button type="button" onClick={onClose} disabled={busy} aria-label="Close"
            style={{ minWidth: 44, minHeight: 44, border: '1px solid var(--line)', borderRadius: 8, background: 'var(--surface-soft)', color: 'var(--text)', fontSize: 18, cursor: 'pointer' }}>✕</button>
        </div>

        {preset && (
          <p style={{ margin: '0 0 14px', fontSize: 13, color: 'var(--muted)' }}>
            For {preset.link.kind === 'job_card' ? 'job card' : preset.link.kind}: <strong style={{ color: 'var(--text)' }}>{preset.label}</strong>
          </p>
        )}

        <form onSubmit={e => { e.preventDefault(); void save(); }} noValidate>
          <div style={field}>
            <label htmlFor={titleId + '-title'} style={label}>What needs doing?</label>
            <input id={titleId + '-title'} ref={titleRef} style={input} value={title} maxLength={REMINDER_TITLE_MAX + 20}
              placeholder="e.g. Call supplier about brake pads"
              aria-invalid={!!error && !title.trim()} aria-describedby={error ? errorId : undefined}
              onChange={e => setTitle(e.target.value)} />
            {titleLeft < 20 && (
              <span style={{ fontSize: 12, color: titleLeft < 0 ? '#dc2626' : 'var(--muted)' }}>
                {titleLeft < 0 ? `${-titleLeft} characters too long` : `${titleLeft} characters left`}
              </span>
            )}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
            <div style={field}>
              <label htmlFor={titleId + '-due'} style={label}>Due</label>
              <input id={titleId + '-due'} type="datetime-local" style={input} value={due}
                onChange={e => setDue(e.target.value)} />
            </div>
            <div style={field}>
              <label htmlFor={titleId + '-priority'} style={label}>Priority</label>
              <select id={titleId + '-priority'} style={input} value={priority}
                onChange={e => setPriority(e.target.value as ReminderPriority)}>
                {(['low', 'normal', 'high'] as const).map(p => <option key={p} value={p}>{PRIORITY_LABEL[p]}</option>)}
              </select>
            </div>
          </div>

          <div style={field}>
            <label htmlFor={titleId + '-assignee'} style={label}>Who is doing it?</label>
            <select id={titleId + '-assignee'} style={input} value={assignedTo} disabled={!canChangeAssignee}
              onChange={e => setAssignedTo(e.target.value)}>
              {options.map(o => <option key={o.value || 'none'} value={o.value}>{o.text}</option>)}
            </select>
            {setup.isManager && setup.entitlements && !setup.entitlements.canAssignToOthers && (
              <span style={{ fontSize: 12, color: 'var(--muted)' }}>
                Your plan keeps reminders for yourself. Assigning to your team is part of Starter and above.
              </span>
            )}
          </div>

          <div style={field}>
            <label htmlFor={titleId + '-notes'} style={label}>Notes <span style={{ fontWeight: 400, color: 'var(--muted)' }}>(optional)</span></label>
            <textarea id={titleId + '-notes'} style={{ ...input, minHeight: 88, resize: 'vertical' }} value={notes}
              maxLength={REMINDER_NOTES_MAX} onChange={e => setNotes(e.target.value)} />
          </div>

          {error && (
            <div id={errorId} role="alert" style={{ padding: 12, marginBottom: 12, borderRadius: 8, background: 'rgba(220,38,38,0.1)', color: '#dc2626', fontSize: 13 }}>
              {error}
              {upgrade && (
                <div style={{ marginTop: 8 }}>
                  <button type="button" className="btn" style={{ fontSize: 12 }}
                    onClick={() => { onClose(); dispatch({ type: 'SET_MODULE', module: 'subscriptions' }); }}>
                    See plans
                  </button>
                </div>
              )}
            </div>
          )}

          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
            <button type="button" className="btn" onClick={onClose} disabled={busy} style={{ minHeight: 44 }}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={busy} style={{ minHeight: 44 }}>
              {busy ? 'Saving…' : reminder ? 'Save changes' : 'Add reminder'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
