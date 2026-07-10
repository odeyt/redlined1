// SI-10: Vehicle Intelligence Service
// Client-facing wrapper. Flag-gated. Never throws to callers.

import type {
  VehicleIntelligenceBuildResult,
  VehicleIntelligenceProfile,
  VehicleIntelligenceSignal,
} from '@/intelligence/vehicle/types';

const BASE = '/api/intelligence/vehicle';
const TIMEOUT_MS = 8000;

async function fetchWithTimeout(url: string, options?: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

export async function getVehicleIntelligence(
  vehicleId: string,
): Promise<VehicleIntelligenceProfile | null> {
  try {
    const res = await fetchWithTimeout(`${BASE}/${vehicleId}`);
    if (!res.ok) return null;
    const json = await res.json() as { profile?: VehicleIntelligenceProfile };
    return json.profile ?? null;
  } catch { return null; }
}

export async function refreshVehicleIntelligence(
  vehicleId: string,
): Promise<VehicleIntelligenceBuildResult | null> {
  try {
    const res = await fetchWithTimeout(`${BASE}/${vehicleId}`, { method: 'POST' });
    if (!res.ok) return null;
    return (await res.json()) as VehicleIntelligenceBuildResult;
  } catch { return null; }
}

export async function getVehicleSignals(
  vehicleId: string,
): Promise<VehicleIntelligenceSignal[]> {
  try {
    const res = await fetchWithTimeout(`${BASE}/${vehicleId}?signals=true`);
    if (!res.ok) return [];
    const json = await res.json() as { signals?: VehicleIntelligenceSignal[] };
    return json.signals ?? [];
  } catch { return []; }
}

export async function getVehicleTimeline(
  vehicleId: string,
): Promise<Array<{ id: string; eventType: string; summary: string | null; eventDate: string }>> {
  try {
    const res = await fetchWithTimeout(`${BASE}/${vehicleId}/timeline`);
    if (!res.ok) return [];
    const json = await res.json() as { events?: Array<{ id: string; eventType: string; summary: string | null; eventDate: string }> };
    return json.events ?? [];
  } catch { return []; }
}
