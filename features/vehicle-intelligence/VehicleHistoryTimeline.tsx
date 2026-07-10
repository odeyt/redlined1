'use client';
import { useEffect, useState } from 'react';
import { getVehicleTimeline } from '@/services/vehicleIntelligenceService';

interface TimelineEvent {
  id: string;
  eventType: string;
  summary: string | null;
  eventDate: string;
}

interface Props { vehicleId: string }

export function VehicleHistoryTimeline({ vehicleId }: Props) {
  const [events, setEvents] = useState<TimelineEvent[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getVehicleTimeline(vehicleId)
      .then(setEvents)
      .catch(() => setEvents([]))
      .finally(() => setLoading(false));
  }, [vehicleId]);

  if (loading) return <div className="text-xs text-gray-400 py-2">Loading timeline…</div>;
  if (events.length === 0) return <div className="text-xs text-gray-400 py-2">No timeline events recorded.</div>;

  return (
    <div className="space-y-2">
      <h4 className="text-xs font-semibold uppercase tracking-wide text-gray-500">Intelligence Timeline</h4>
      <div className="relative pl-4 border-l border-gray-200 space-y-3">
        {events.map(e => (
          <div key={e.id} className="relative">
            <div className="absolute -left-5 top-1 w-2.5 h-2.5 rounded-full bg-indigo-300 border-2 border-white" />
            <div className="text-xs text-gray-400">{new Date(e.eventDate).toLocaleDateString()}</div>
            <div className="text-sm text-gray-700 capitalize">{e.eventType.replace(/_/g, ' ')}</div>
            {e.summary && <div className="text-xs text-gray-500">{e.summary}</div>}
          </div>
        ))}
      </div>
    </div>
  );
}
