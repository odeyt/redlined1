import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { z } from 'zod';
import { logger } from '@/lib/logger';
import { loadCanonicalVehicle } from '@/lib/parts/vehicleResolution/loadVehicle';
import { vehicleBelongsToShop } from '@/lib/parts/vehicleResolution/mappingStore';
import { vehicleFingerprint } from '@/lib/parts/vehicleResolution/fingerprint';
import { getAdminDb } from '@/lib/supabaseServer';
import { analyzeVehicleQuality, qualitySummary, type QualityVehicle } from '@/lib/vehicles/quality';
import { compareVehicleWithCatalog } from '@/lib/vehicles/catalogComparison';
import {
  planEnrichment, decideFingerprint, applyEnrichment,
} from '@/lib/vehicles/enrichment';

/**
 * Vehicle data quality — read the analysis, or apply a technician's choices.
 *
 * ## GET spends nothing
 *
 * The whole point of M-PARTS2C.4's cache design: analysis reads the vehicle,
 * the stored mapping and the persistent reference cache. Opening this panel
 * must never cost an AutoPartsAPI call, because a quality badge is the worst
 * imaginable reason to burn quota.
 *
 * ## POST trusts the browser for FIELD NAMES only
 *
 * The request says which fields the technician approved. It does not supply
 * values. The server rebuilds the comparison for the CURRENT fingerprint and
 * takes values from there, so a forged body cannot write an engine code that
 * no catalogue ever offered — and a vehicle's engine feeds fitment, so
 * forging one forges a parts recommendation.
 */

const GetSchema = z.object({
  shopId: z.string().uuid(),
  vehicleId: z.string().uuid(),
}).strict();

const ApplySchema = z.object({
  shopId: z.string().uuid(),
  vehicleId: z.string().uuid(),
  /**
   * Field NAMES the technician ticked. Never values. Bounded so a request
   * cannot ask for ten thousand fields.
   */
  fields: z.array(z.string().max(40)).min(1).max(12),
  /**
   * The fingerprint the technician was looking at. A vehicle edited in
   * another tab must not be enriched against a comparison for its old
   * identity.
   */
  fingerprint: z.string().min(8).max(64),
}).strict();

async function getAuth(shopId: string) {
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} } },
  );
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: row } = await supabase
    .from('shop_users').select('role')
    .eq('user_id', user.id).eq('shop_id', shopId).maybeSingle();
  if (!row) return null;
  return { userId: user.id, role: (row as { role?: string }).role ?? '' };
}

/** The canonical vehicle plus the three fields the fingerprint excludes. */
async function loadQualityVehicle(
  shopId: string, vehicleId: string,
): Promise<QualityVehicle | null> {
  const base = await loadCanonicalVehicle(shopId, vehicleId);
  if (!base) return null;

  const { data } = await getAdminDb()
    .from('vehicles')
    .select('engine_code, displacement_l, cylinders, label')
    .eq('id', vehicleId).eq('shop_id', shopId).maybeSingle();

  const extra = (data ?? {}) as Record<string, unknown>;
  return {
    ...base,
    engineCode: (extra.engine_code as string) || undefined,
    displacementL: extra.displacement_l != null ? Number(extra.displacement_l) : undefined,
    cylinders: extra.cylinders != null ? Number(extra.cylinders) : undefined,
    label: (extra.label as string) || undefined,
  };
}

export async function GET(req: NextRequest) {
  const parsed = GetSchema.safeParse({
    shopId: req.nextUrl.searchParams.get('shopId'),
    vehicleId: req.nextUrl.searchParams.get('vehicleId'),
  });
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid request.' }, { status: 422 });
  }
  const input = parsed.data;

  const auth = await getAuth(input.shopId);
  if (!auth) {
    return NextResponse.json(
      { code: 'UNAUTHORIZED', error: 'Not authorised for this shop.' }, { status: 403 });
  }
  if (!await vehicleBelongsToShop(input.shopId, input.vehicleId)) {
    logger.warn('vehicles.quality.foreign_vehicle', { shopId: input.shopId });
    return NextResponse.json(
      { code: 'UNAUTHORIZED', error: 'Not authorised for this vehicle.' }, { status: 403 });
  }

  const vehicle = await loadQualityVehicle(input.shopId, input.vehicleId);
  if (!vehicle) {
    return NextResponse.json(
      { code: 'UNAUTHORIZED', error: 'Not authorised for this vehicle.' }, { status: 403 });
  }

  const fingerprint = vehicleFingerprint(vehicle);
  const quality = analyzeVehicleQuality(vehicle);
  // Cache and stored mapping only. No provider call.
  const catalog = await compareVehicleWithCatalog(input.shopId, vehicle, fingerprint);

  return NextResponse.json({
    fingerprint,
    quality,
    summary: qualitySummary(quality),
    catalog,
  });
}

export async function POST(req: NextRequest) {
  let body: unknown;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
  }

  const parsed = ApplySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid enrichment request.' }, { status: 422 });
  }
  const input = parsed.data;

  // 1. Authenticated and a member of THIS shop.
  const auth = await getAuth(input.shopId);
  if (!auth) {
    return NextResponse.json(
      { code: 'UNAUTHORIZED', error: 'Not authorised for this shop.' }, { status: 403 });
  }

  // 2. The vehicle is this shop's, checked against the database.
  if (!await vehicleBelongsToShop(input.shopId, input.vehicleId)) {
    logger.warn('vehicles.enrich.foreign_vehicle', { shopId: input.shopId });
    return NextResponse.json(
      { code: 'UNAUTHORIZED', error: 'Not authorised for this vehicle.' }, { status: 403 });
  }

  const vehicle = await loadQualityVehicle(input.shopId, input.vehicleId);
  if (!vehicle) {
    return NextResponse.json(
      { code: 'UNAUTHORIZED', error: 'Not authorised for this vehicle.' }, { status: 403 });
  }

  // 3. The vehicle has not changed since the technician saw the comparison.
  const fingerprint = vehicleFingerprint(vehicle);
  if (fingerprint !== input.fingerprint) {
    return NextResponse.json({
      code: 'VEHICLE_CHANGED',
      error: 'This vehicle changed since the comparison was shown. Review it again.',
      fingerprint,
    }, { status: 409 });
  }

  /**
   * 4. Rebuild the comparison SERVER-SIDE. This is the validation: values
   *    come from here and from nowhere else, so the request can only choose
   *    among options the server itself derived.
   */
  const catalog = await compareVehicleWithCatalog(input.shopId, vehicle, fingerprint);
  if (!catalog.available) {
    return NextResponse.json({
      code: 'NO_CATALOG_DATA',
      error: 'No current catalogue information is available for this vehicle.',
      reason: catalog.unavailableReason,
    }, { status: 409 });
  }

  const plan = planEnrichment(input.fields, catalog);
  if (!plan.entries.length) {
    return NextResponse.json({
      code: 'NOTHING_APPLIED',
      error: 'None of the selected fields could be applied.',
      refused: plan.refused,
    }, { status: 409 });
  }

  const decision = decideFingerprint(vehicle, plan, catalog.available);

  try {
    const result = await applyEnrichment({
      shopId: input.shopId,
      vehicle,
      plan,
      decision,
      comparison: catalog,
      actorUserId: auth.userId,
    });

    logger.info('vehicles.enriched', {
      shopId: input.shopId,
      fields: result.applied.map(e => e.field).join(','),
      mapping: decision.mapping,
    });

    return NextResponse.json({
      code: 'APPLIED',
      applied: result.applied.map(e => ({ field: e.field, before: e.before, after: e.after })),
      refused: result.refused,
      fingerprint: { before: decision.before, after: decision.after },
      mapping: decision.mapping,
      mappingReason: decision.reason,
    });
  } catch {
    logger.error('vehicles.enrich.failed', { shopId: input.shopId });
    return NextResponse.json(
      { code: 'UPDATE_FAILED', error: 'The vehicle could not be updated.' }, { status: 500 });
  }
}
