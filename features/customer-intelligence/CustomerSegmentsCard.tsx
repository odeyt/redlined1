'use client';

import type { CustomerSegment } from '@/intelligence/customer/types';

interface Props {
  segments: CustomerSegment[];
}

const SEGMENT_BADGE_COLORS: Record<string, string> = {
  vip: 'bg-purple-100 text-purple-800',
  high_value: 'bg-blue-100 text-blue-800',
  loyal: 'bg-green-100 text-green-800',
  fleet: 'bg-cyan-100 text-cyan-800',
  commercial: 'bg-indigo-100 text-indigo-800',
  frequent: 'bg-emerald-100 text-emerald-800',
  new_customer: 'bg-sky-100 text-sky-800',
  occasional: 'bg-gray-100 text-gray-700',
  inactive: 'bg-yellow-100 text-yellow-800',
  at_risk: 'bg-orange-100 text-orange-800',
  lost: 'bg-red-100 text-red-800',
  unresolved_declined_work: 'bg-amber-100 text-amber-800',
  outstanding_balance: 'bg-red-100 text-red-700',
  maintenance_opportunity: 'bg-teal-100 text-teal-800',
  limited_data: 'bg-gray-100 text-gray-500',
};

export function CustomerSegmentsCard({ segments }: Props) {
  // price_sensitive filtered on API; just render what we receive
  const visible = segments.filter(s => s.isActive);

  if (visible.length === 0) {
    return (
      <div className="rounded-lg border p-4">
        <p className="text-xs text-muted-foreground">No segments assigned yet.</p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border p-4 space-y-3">
      <span className="text-sm font-medium">Segments</span>
      <div className="flex flex-wrap gap-2">
        {visible.map(s => (
          <span
            key={s.id}
            className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${SEGMENT_BADGE_COLORS[s.segmentKey] ?? 'bg-gray-100 text-gray-600'}`}
            title={s.segmentReason ?? undefined}
          >
            {s.isPrimary && <span className="mr-1">★</span>}
            {s.segmentLabel}
          </span>
        ))}
      </div>
    </div>
  );
}
