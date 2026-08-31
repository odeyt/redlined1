import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { z } from 'zod';
import { logger } from '@/lib/logger';
import { loadCanonicalVehicle } from '@/lib/parts/vehicleResolution/loadVehicle';
import { readableShopIds } from '@/lib/shops/mirrorScope';
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

/**
 * The canonical vehicle plus the three fields the fingerprint excludes.
 *
 * Takes the caller's read scope, and reports which shop the vehicle turned out
 * to belong to: under mirroring that is not necessarily the shop asking, and
 * everything written afterwards — the vehicle row, its mapping, its audit
 * event — has to be keyed to the owner rather than to the visitor.
 */
async function loadQualityVehicle(
  shopIds: readonly string[], vehicleId: string,
): Promise<{ vehicle: QualityVehicle; ownerShopId: string } | null> {
  const base = await loadCanonicalVehicle(shopIds, vehicleId);
  if (!base) return null;

  // Scoped to the owner specifically, not the whole scope: the first query
  // already decided which shop's vehicle this is, and re-widening here could
  // only ever match a different row.
  const { data } = await getAdminDb()
    .from('vehicles')
    .select('engine_code, displacement_l, cylinders, label')
    .eq('id', vehicleId).eq('shop_id', base.ownerShopId).maybeSingle();

  const extra = (data ?? {}) as Record<string, unknown>;
  return {
    ownerShopId: base.ownerShopId,
    vehicle: {
      ...base.vehicle,
      engineCode: (extra.engine_code as string) || undefined,
      displacementL: extra.displacement_l != null ? Number(extra.displacement_l) : undefined,
      cylinders: extra.cylinders != null ? Number(extra.cylinders) : undefined,
      label: (extra.label as string) || undefined,
    },
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
  const scope = await readableShopIds(auth.userId, input.shopId);
  const loaded = await loadQualityVehicle(scope, input.vehicleId);
  if (!loaded) {
    logger.warn('vehicles.quality.foreign_vehicle', { shopId: input.shopId });
    return NextResponse.json(
      { code: 'UNAUTHORIZED', error: 'Not authorised for this vehicle.' }, { status: 403 });
  }
  const { vehicle, ownerShopId } = loaded;

  const fingerprint = vehicleFingerprint(vehicle);
  const quality = analyzeVehicleQuality(vehicle);
  // Cache and stored mapping only. No provider call. Keyed to the owner,
  // because that is where this vehicle's mapping row lives.
  const catalog = await compareVehicleWithCatalog(ownerShopId, vehicle, fingerprint);

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

  /**
   * 2. The vehicle is readable by this user, checked against the database.
   *
   *    Mirrored vehicles are enrichable, matching what the rest of the app
   *    already does: `services/vehicleService.ts` guards its update, delete
   *    and reassign paths with `.in('shop_id', getShopIds())` and pins only
   *    `insert` to the active shop. A mirror is a deliberate link between two
   *    branches of one business, not a read-only window.
   */
  const scope = await readableShopIds(auth.userId, input.shopId);
  const loaded = await loadQualityVehicle(scope, input.vehicleId);
  if (!loaded) {
    logger.warn('vehicles.enrich.foreign_vehicle', { shopId: input.shopId });
    return NextResponse.json(
      { code: 'UNAUTHORIZED', error: 'Not authorised for this vehicle.' }, { status: 403 });
  }
  const { vehicle, ownerShopId } = loaded;

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
  const catalog = await compareVehicleWithCatalog(ownerShopId, vehicle, fingerprint);
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
      // The owner throughout: the vehicle row, its mapping and its audit event
      // all belong where the vehicle does, not where the technician was
      // standing when they approved the change.
      shopId: ownerShopId,
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
