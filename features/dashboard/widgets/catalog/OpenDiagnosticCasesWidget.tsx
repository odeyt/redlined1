'use client';

import { useEffect, useState } from 'react';
import { Panel } from '@/components/Panel';
import { listRepairCases, type RepairCase } from '@/services/repairCaseService';
import type { WidgetProps } from '@/lib/dashboardWidgets/types';

export function OpenDiagnosticCasesWidget({ onNav: nav }: WidgetProps) {
  const [cases, setCases] = useState<RepairCase[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    listRepairCases()
      .then(all => setCases(all.filter(c => c.verificationStatus === 'pending').slice(0, 6)))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) return null;

  return (
    <Panel title="Open Diagnostic Cases" hint="Repair cases not yet verified">
      {cases.length === 0 ? (
        <p style={{ color: 'var(--muted)', fontSize: 13, padding: '12px 0' }}>No open diagnostic cases.</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {cases.map(c => (
            <div key={c.id} onClick={() => nav('diagnostics')} className="dash-row" style={{ display: 'flex', justifyContent: 'space-between', padding: '8px', borderRadius: 6, cursor: 'pointer', fontSize: 13 }}>
              <span style={{ fontWeight: 600 }}>{c.make} {c.model} {c.year}</span>
              <span style={{ color: 'var(--muted)', maxWidth: '55%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.complaint}</span>
            </div>
          ))}
        </div>
      )}
    </Panel>
  );
}
