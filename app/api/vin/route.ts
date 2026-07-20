import { NextRequest, NextResponse } from 'next/server';
import { requireShopRole } from '@/lib/serverAuth';
import { parseJsonBody } from '@/lib/apiHelpers';
import { reserveUsage, completeReservation, releaseReservation } from '@/lib/entitlements';
import { logger } from '@/lib/logger';
import { z } from 'zod';

/**
 * POST /api/vin — proxy NHTSA VIN lookup with atomic usage enforcement.
 *
 * Caller: must be authenticated and hold any role in the target shop.
 * Enforcement: VIN lookups are limited to 2/month on Free plan, enforced via
 * atomic reservation before the NHTSA call. Two simultaneous requests at the
 * limit cannot both succeed.
 *
 * VIN data is shop-private. The response is returned directly to the caller;
 * no data is stored or shared (share_to_network remains false).
 */

const VinRequestSchema = z.object({
  vin: z.string().min(17).max(17).regex(/^[A-HJ-NPR-Z0-9]{17}$/i, 'Invalid VIN format'),
  shopId: z.string().uuid(),
});

const NHTSA_BASE = 'https://vpic.nhtsa.dot.gov/api/vehicles/decodevin';
const TIMEOUT_MS = 10_000;

interface NHTSAVariable {
  Variable: string;
  Value: string | null;
}

const FIELD_MAP: Record<string, string> = {
  'Model Year':                 'year',
  'Make':                       'make',
  'Model':                      'model',
  'Trim':                       'trim',
  'Body Class':                 'bodyStyle',
  'Drive Type':                 'driveType',
  'Engine Number of Cylinders': 'engineCylinders',
  'Displacement (L)':           'engineDisplacement',
  'Engine Brake (hp) From':     'engineHP',
  'Fuel Type - Primary':        'fuelType',
  'Transmission Style':         'transmission',
  'Vehicle Type':               'vehicleType',
  'Plant City':                 'plantCity',
  'Plant Country':              'plantCountry',
  'Manufacturer Name':          'manufacturer',
  'Error Code':                 'errorCode',
  'Additional Error Text':      'errorText',
};

async function decodeVin(vin: string): Promise<Record<string, string>> {
  const clean = vin.trim().toUpperCase();
  const res = await fetch(`${NHTSA_BASE}/${clean}?format=json`, {
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`NHTSA API error: ${res.status}`);

  const json = await res.json();
  const results: NHTSAVariable[] = json.Results ?? [];

  const out: Record<string, string> = { vin: clean };
  for (const item of results) {
    const key = FIELD_MAP[item.Variable];
    if (key && item.Value && item.Value !== 'Not Applicable') {
      out[key] = item.Value;
    }
  }

  const parts = [out.year, out.make, out.model, out.trim].filter(Boolean);
  out.label = parts.join(' ') || clean;
  return out;
}

export async function POST(req: NextRequest) {
  const parsed = await parseJsonBody(req, VinRequestSchema);
  if (!parsed.ok) return parsed.response;
  const { vin, shopId } = parsed.data;

  const auth = await requireShopRole(req, shopId, ['owner', 'manager', 'advisor', 'technician']);
  if (!auth.ok) return auth.response;

  // Atomically reserve the VIN lookup before hitting NHTSA
  const idempotencyKey = `vin-${shopId}-${vin.toUpperCase()}`;
  const reservation = await reserveUsage(shopId, 'vin_lookups', 1, idempotencyKey);
  if (!reservation) {
    return NextResponse.json(
      { error: 'Service temporarily unavailable. Please try again.', retryable: true },
      { status: 503 },
    );
  }
  if (!reservation.allowed) {
    return NextResponse.json(
      { error: 'VIN lookup limit reached for this month. Upgrade to continue.', upgradeRequired: true },
      { status: 402 },
    );
  }

  const reservationId = reservation.idempotent ? '' : reservation.reservationId;

  let result: Record<string, string>;
  try {
    result = await decodeVin(vin);
  } catch (err) {
    if (reservationId) {
      try {
        await releaseReservation(reservationId);
      } catch (releaseErr) {
        logger.warn('Failed to release VIN reservation after NHTSA error', {
          module: 'api/vin',
          reservationId,
          error: String(releaseErr),
        });
      }
    }
    logger.warn('NHTSA VIN decode failed', { module: 'api/vin', error: String(err) });
    return NextResponse.json(
      { error: 'VIN lookup failed. Please try again.' },
      { status: 502 },
    );
  }

  if (reservationId) {
    try {
      await completeReservation(reservationId);
    } catch (completeErr) {
      logger.warn('Failed to complete VIN reservation', {
        module: 'api/vin',
        reservationId,
        error: String(completeErr),
      });
    }
  }

  return NextResponse.json({ result });
}
