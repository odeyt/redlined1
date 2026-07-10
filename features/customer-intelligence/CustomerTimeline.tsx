'use client';

import type { CustomerTimelineItem } from '@/intelligence/customer/types';

interface Props {
  items: CustomerTimelineItem[];
}

const EVENT_ICONS: Record<string, string> = {
  job_card: '🔧',
  estimate: '📋',
  invoice: '💰',
  appointment: '📅',
  declined_work: '✗',
};

function fmtDate(dateStr: string): string {
  try {
    return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  } catch {
    return dateStr;
  }
}

export function CustomerTimeline({ items }: Props) {
  if (items.length === 0) {
    return (
      <div className="rounded-lg border p-4">
        <p className="text-xs text-muted-foreground">No history available.</p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border p-4 space-y-3">
      <span className="text-sm font-medium">Service History</span>
      <ul className="space-y-2 max-h-80 overflow-y-auto pr-1">
        {items.slice(0, 30).map(item => (
          <li key={item.id} className="flex gap-3 text-xs">
            <span className="shrink-0 text-base leading-tight">{EVENT_ICONS[item.eventType] ?? '•'}</span>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium truncate">{item.title}</span>
                <span className="text-muted-foreground whitespace-nowrap">{fmtDate(item.eventDate)}</span>
              </div>
              {item.summary && (
                <p className="text-muted-foreground truncate">{item.summary}</p>
              )}
            </div>
            {item.amount != null && (
              <span className="shrink-0 text-muted-foreground">${Math.round(item.amount)}</span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
