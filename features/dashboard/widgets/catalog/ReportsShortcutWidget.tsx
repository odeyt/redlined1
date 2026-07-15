'use client';

import { Panel } from '@/components/Panel';
import type { WidgetProps } from '@/lib/dashboardWidgets/types';

// There is no reports/report_history table — ReportsView computes everything
// on the fly, so there's no real "recent reports" history to show. This is a
// navigation shortcut into the Reports module instead of fabricated data.
const REPORT_CATEGORIES = ['Revenue', 'Technician Performance', 'Customer Activity', 'Inventory'];

export function ReportsShortcutWidget({ onNav: nav }: WidgetProps) {
  return (
    <Panel title="Reports" hint="Jump to a report category">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {REPORT_CATEGORIES.map(label => (
          <div key={label} onClick={() => nav('reports')} className="dash-row" style={{ padding: '8px', borderRadius: 6, cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>
            {label} →
          </div>
        ))}
      </div>
    </Panel>
  );
}
