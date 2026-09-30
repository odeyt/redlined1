'use client';

/**
 * "Add reminder" for a customer, vehicle or job card, with that record
 * already linked.
 *
 * Renders nothing unless the internal_reminders flag is on, so the pages it
 * sits on are unchanged while the feature is off.
 */
import { useState } from 'react';
import { useFeatureFlag } from '@/components/featureFlags/FeatureFlagProvider';
import type { ReminderLink } from '@/services/reminderService';
import { ReminderFormDialog } from './ReminderFormDialog';
import { useReminderSetup } from './useReminderSetup';

interface Props {
  link: ReminderLink;
  /** How the record is named in the dialog, e.g. the customer's name. */
  label: string;
  style?: React.CSSProperties;
}

export function AddReminderButton(props: Props) {
  const enabled = useFeatureFlag('internal_reminders');
  if (!enabled) return null;
  return <AddReminderButtonInner {...props} />;
}

function AddReminderButtonInner({ link, label, style }: Props) {
  const [open, setOpen] = useState(false);
  const [saved, setSaved] = useState(false);
  const setup = useReminderSetup();

  return (
    <>
      <button type="button" className="btn" style={{ fontSize: 12, ...style }}
        onClick={() => { setSaved(false); setOpen(true); }}
        aria-label={`Add reminder for ${label}`}>
        {saved ? '✓ Reminder added' : '+ Reminder'}
      </button>
      {open && (
        <ReminderFormDialog
          setup={setup}
          preset={{ link, label }}
          onClose={() => setOpen(false)}
          onSaved={() => { setOpen(false); setSaved(true); }}
        />
      )}
    </>
  );
}
