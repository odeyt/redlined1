'use client';
import { useCallback, useEffect, useState } from 'react';
import type { VehicleIntelligenceProfile } from '@/intelligence/vehicle/types';
import {
  getVehicleIntelligence,
  refreshVehicleIntelligence,
} from '@/services/vehicleIntelligenceService';
import { VehicleHealthCard }           from './VehicleHealthCard';
import { VehiclePatternsCard }          from './VehiclePatternsCard';
import { VehicleRiskSignals }           from './VehicleRiskSignals';
import { VehicleRecommendedChecks }     from './VehicleRecommendedChecks';
import { VehicleHistoryTimeline }       from './VehicleHistoryTimeline';
import { VehicleIntelligenceErrorBoundary } from './VehicleIntelligenceErrorBoundary';

interface Props {
  vehicleId: string;
  /** Caller must confirm both feature flags are ON before rendering */
}

export function VehicleIntelligencePanel({ vehicleId }: Props) {
  const [profile,    setProfile]    = useState<VehicleIntelligenceProfile | null>(null);
  const [loading,    setLoading]    = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error,      setError]      = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setError(null);
      const data = await getVehicleIntelligence(vehicleId);
      setProfile(data);
    } catch {
      setError('Intelligence data unavailable');
    } finally {
      setLoading(false);
    }
  }, [vehicleId]);

  useEffect(() => { void load(); }, [load]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      const result = await refreshVehicleIntelligence(vehicleId);
      if (result?.profile) setProfile(result.profile);
    } catch { /* silent */ }
    finally { setRefreshing(false); }
  }, [vehicleId]);

  if (loading) {
    return (
      <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 text-sm text-gray-400 animate-pulse">
        Loading vehicle intelligence…
      </div>
    );
  }

  if (error || !profile) {
    return (
      <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 text-xs text-gray-400">
        Vehicle intelligence data is not yet available for this vehicle.
      </div>
    );
  }

  return (
    <VehicleIntelligenceErrorBoundary>
      <div className="space-y-4">
        <VehicleHealthCard
          profile={profile}
          onRefresh={handleRefresh}
          refreshing={refreshing}
        />
        <VehicleRiskSignals signals={profile.riskSignals} />
        <VehicleRecommendedChecks checks={profile.recommendedChecks} />
        <VehiclePatternsCard profile={profile} />
        <VehicleHistoryTimeline vehicleId={vehicleId} />
      </div>
    </VehicleIntelligenceErrorBoundary>
  );
}
