'use client';

/**
 * Overdue and due-today reminders, as two real counts.
 *
 * Counts only what the viewer can see — the whole shop for an owner or
 * manager, their own for everyone else — because the list comes through the
 * same RLS as the Reminders screen. "Today" is the viewer's calendar day.
 *
 * Checks the internal_reminders flag itself as well as through the catalogue:
 * requiredFlag only stops the widget being ADDED, and a layout saved while the
 * flag was on would otherwise keep showing it after the flag is turned off.
 */
import { useEffect, useState } from 'react';
import { useFeatureFlag } from '@/components/featureFlags/FeatureFlagProvider';
import { fetchReminders } from '@/services/reminderService';
import { dueCounts, viewerTimeZone } from '@/lib/reminders/dueClassification';
import type { WidgetProps } from '@/lib/dashboardWidgets/types';

export function RemindersDueWidget(props: WidgetProps) {
  const enabled = useFeatureFlag('internal_reminders');
  if (!enabled) {
    return <div style={{ fontSize: 12, color: 'var(--muted)' }}>Reminders are not turned on for this shop.</div>;
  }
  return <RemindersDueCounts {...props} />;
}

function RemindersDueCounts({ onNav }: WidgetProps) {
  const [counts, setCounts] = useState<{ overdue: number; today: number } | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    fetchReminders({ state: 'open' })
      .then(open => {
        if (cancelled) return;
        const c = dueCounts(open, new Date(), viewerTimeZone());
        setCounts({ overdue: c.overdue, today: c.today });
      })
      .catch(() => { if (!cancelled) setFailed(true); });
    return () => { cancelled = true; };
  }, [attempt]);

  if (failed) {
    return (
      <div style={{ fontSize: 12, color: 'var(--muted)' }}>
        Could not load reminders.{' '}
        <button className="btn" style={{ fontSize: 11, padding: '2px 8px' }} onClick={() => { setFailed(false); setAttempt(a => a + 1); }}>Retry</button>
      </div>
    );
  }
  if (!counts) return <div style={{ fontSize: 12, color: 'var(--muted)' }}>Loading…</div>;

  if (counts.overdue === 0 && counts.today === 0) {
    return (
      <div style={{ fontSize: 13, color: 'var(--muted)' }}>
        Nothing overdue or due today.{' '}
        <button className="btn" style={{ fontSize: 11, padding: '2px 8px' }} onClick={() => onNav('reminders')}>Open reminders</button>
      </div>
    );
  }

  return (
    <button type="button" onClick={() => onNav('reminders')}
      style={{ display: 'flex', gap: 20, background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: 'inherit', textAlign: 'left' }}
      aria-label={`${counts.overdue} overdue and ${counts.today} due today. Open reminders.`}>
      <div>
        <div style={{ fontSize: 24, fontWeight: 700, color: counts.overdue > 0 ? '#dc2626' : undefined }}>{counts.overdue}</div>
        <div style={{ fontSize: 11, color: 'var(--muted)' }}><span aria-hidden="true">! </span>Overdue</div>
      </div>
      <div>
        <div style={{ fontSize: 24, fontWeight: 700 }}>{counts.today}</div>
        <div style={{ fontSize: 11, color: 'var(--muted)' }}><span aria-hidden="true">● </span>Due today</div>
      </div>
    </button>
  );
}
