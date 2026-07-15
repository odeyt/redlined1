'use client';

import { Panel } from '@/components/Panel';
import { useAppDispatch } from '@/lib/store';
import type { WidgetProps } from '@/lib/dashboardWidgets/types';

// "New Job Card" opens the form directly (OPEN_NEW_JOB_CARD already does this
// elsewhere in the app). The rest navigate to the module that owns creation —
// no new creation flows are introduced here.
const ACTIONS: { label: string; icon: string; module: string }[] = [
  { label: 'New Customer', icon: '👤', module: 'customers' },
  { label: 'New Vehicle', icon: '🚗', module: 'vehicles' },
  { label: 'New Estimate', icon: '📄', module: 'estimates' },
  { label: 'New Invoice', icon: '🧾', module: 'invoices' },
  { label: 'Vehicle Intake', icon: '📋', module: 'triage' },
  { label: 'Start Diagnosis', icon: '🔍', module: 'diagnostics' },
  { label: 'Create Appointment', icon: '📅', module: 'appointments' },
];

export function QuickActionsWidget({ onNav: nav }: WidgetProps) {
  const dispatch = useAppDispatch();

  return (
    <Panel title="Quick Actions">
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', gap: 8 }}>
        <button
          className="btn"
          onClick={() => dispatch({ type: 'OPEN_NEW_JOB_CARD' })}
          style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, padding: '12px 8px' }}
        >
          <span style={{ fontSize: 20 }}>🛠️</span>
          <span style={{ fontSize: 12 }}>New Job Card</span>
        </button>
        {ACTIONS.map(a => (
          <button
            key={a.label}
            className="btn"
            onClick={() => nav(a.module)}
            style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, padding: '12px 8px' }}
          >
            <span style={{ fontSize: 20 }}>{a.icon}</span>
            <span style={{ fontSize: 12 }}>{a.label}</span>
          </button>
        ))}
      </div>
    </Panel>
  );
}
