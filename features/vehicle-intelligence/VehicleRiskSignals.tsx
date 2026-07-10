'use client';
import type { VehicleRiskSignal } from '@/intelligence/vehicle/types';

const SEVERITY_COLOR: Record<string, string> = {
  critical: 'bg-red-100 text-red-800 border-red-200',
  high:     'bg-orange-100 text-orange-800 border-orange-200',
  medium:   'bg-yellow-100 text-yellow-800 border-yellow-200',
  low:      'bg-blue-100 text-blue-800 border-blue-200',
  info:     'bg-gray-100 text-gray-700 border-gray-200',
};

interface Props { signals: VehicleRiskSignal[] }

export function VehicleRiskSignals({ signals }: Props) {
  if (signals.length === 0) return null;
  const active = signals.slice(0, 8);

  return (
    <div className="space-y-2">
      <h4 className="text-xs font-semibold uppercase tracking-wide text-gray-500">Risk Signals</h4>
      {active.map(s => (
        <div key={s.key} className={`rounded border px-3 py-2 text-sm ${SEVERITY_COLOR[s.severity] ?? SEVERITY_COLOR.info}`}>
          <div className="font-medium">{s.title}</div>
          {s.description && (
            <div className="mt-0.5 text-xs opacity-80">{s.description}</div>
          )}
          <div className="mt-0.5 text-xs opacity-50">
            Confidence: {Math.round(s.confidence * 100)}%
          </div>
        </div>
      ))}
    </div>
  );
}
