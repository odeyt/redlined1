'use client';

import { useEffect, useState } from 'react';
import { Panel } from '@/components/Panel';
import { fetchJobCards, type JobCardFull } from '@/services/jobCardService';
import type { WidgetProps } from '@/lib/dashboardWidgets/types';

export function RecentJobCardsWidget({ onNav: nav }: WidgetProps) {
  const [jobs, setJobs] = useState<JobCardFull[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchJobCards()
      .then(all => setJobs(all.slice(0, 6)))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) return null;

  return (
    <Panel title="Recent Job Cards" hint="Latest 6 job cards — click to open Job Cards">
      {jobs.length === 0 ? (
        <p style={{ color: 'var(--muted)', fontSize: 13, padding: '12px 0' }}>No job cards yet.</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {jobs.map(j => (
            <div key={j.id} onClick={() => nav('job-cards')} className="dash-row" style={{ display: 'flex', justifyContent: 'space-between', padding: '8px', borderRadius: 6, cursor: 'pointer', fontSize: 13 }}>
              <span style={{ fontWeight: 600 }}>{j.customer}</span>
              <span style={{ color: 'var(--muted)' }}>{j.status}</span>
            </div>
          ))}
        </div>
      )}
    </Panel>
  );
}
