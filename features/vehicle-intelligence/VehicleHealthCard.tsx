'use client';
import type { VehicleHealthStatus, VehicleIntelligenceProfile } from '@/intelligence/vehicle/types';

const COLOR: Record<VehicleHealthStatus, string> = {
  healthy:   'text-emerald-600 bg-emerald-50 border-emerald-200',
  monitor:   'text-yellow-600 bg-yellow-50 border-yellow-200',
  attention: 'text-orange-600 bg-orange-50 border-orange-200',
  high_risk: 'text-red-600 bg-red-50 border-red-200',
  unknown:   'text-gray-400 bg-gray-50 border-gray-200',
};

const LABEL: Record<VehicleHealthStatus, string> = {
  healthy:   'Healthy',
  monitor:   'Monitor',
  attention: 'Needs Attention',
  high_risk: 'High Risk',
  unknown:   'Unknown',
};

interface Props {
  profile: VehicleIntelligenceProfile;
  onRefresh?: () => void;
  refreshing?: boolean;
}

export function VehicleHealthCard({ profile, onRefresh, refreshing }: Props) {
  const status = profile.healthStatus ?? 'unknown';
  const score  = profile.healthScore;

  return (
    <div className={`rounded-lg border p-4 ${COLOR[status]}`}>
      <div className="flex items-center justify-between">
        <div>
          <div className="text-xs font-medium uppercase tracking-wide opacity-70">Vehicle Health</div>
          <div className="mt-1 flex items-end gap-2">
            {score != null && (
              <span className="text-3xl font-bold">{score}</span>
            )}
            <span className="text-base font-semibold">{LABEL[status]}</span>
          </div>
        </div>
        {onRefresh && (
          <button
            onClick={onRefresh}
            disabled={refreshing}
            className="text-xs px-3 py-1 rounded border border-current opacity-70 hover:opacity-100 disabled:opacity-40"
          >
            {refreshing ? 'Refreshing…' : 'Refresh'}
          </button>
        )}
      </div>
      <div className="mt-2 text-xs opacity-60">
        {profile.visitCount} visits · {profile.completedRepairCount} completed repairs
        {profile.lastVisitAt && (
          <> · Last visit {new Date(profile.lastVisitAt).toLocaleDateString()}</>
        )}
      </div>
    </div>
  );
}
