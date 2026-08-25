import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { z } from 'zod';
import { logger } from '@/lib/logger';
import { resolveProviderVehicle } from '@/lib/parts/vehicleResolution/resolver';
import { vehicleFingerprint } from '@/lib/parts/vehicleResolution/fingerprint';
import { writeMapping, vehicleBelongsToShop } from '@/lib/parts/vehicleResolution/mappingStore';
import { loadCanonicalVehicle } from '@/lib/parts/vehicleResolution/loadVehicle';

/**
 * POST /api/parts/vehicle-resolution/select-model
 *
 * A technician choosing which catalogue MODEL SERIES their vehicle is.
 *
 * ## Why this is separate from confirming a variant
 *
 * Choosing a series is not a resolution. A 2009 S-Class matches two catalogue
 * series, and picking one only narrows which variants exist — the vehicle may
 * still be ambiguous among those, or may pin exactly. So this endpoint
 * CONTINUES resolution and returns whatever comes next: a resolved mapping, or
 * the variant chooser, or an honest failure.
 *
 * A mapping is written only when the continuation actually resolves. Recording
 * a series alone would create a half-mapping that later reads as authoritative.
 *
 * ## Why the model id is not trusted
 *
 * It arrives from a browser. `resolveProviderVehicle` checks it against the
 * candidate list it derives itself and ignores it otherwise — the check lives
 * there rather than here so no caller can omit it. Same reasoning as
 * `candidateWasOffered` on the variant route: a confirmed mapping is the
 * strongest evidence in the fitment chain, so forging one forges VERIFIED FIT.
 */

const SelectModelSchema = z.object({
  shopId: z.string().uuid(),
  vehicleId: z.string().uuid(),
  modelId: z.number().int().positive(),
  /**
   * The fingerprint the browser resolved against. A technician can leave the
   * dialog open while somebody edits the vehicle in another tab; pinning a
   * series against an identity we no longer hold would be wrong permanently.
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
    .from('shop_users')
    .select('role')
    .eq('user_id', user.id)
    .eq('shop_id', shopId)
    .maybeSingle();

  if (!row) return null;
  return { userId: user.id };
}

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
  }

  const parsed = SelectModelSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid model selection request.' }, { status: 422 });
  }
  const input = parsed.data;

  // 1. Authenticated, and a member of THIS shop.
  const auth = await getAuth(input.shopId);
  if (!auth) {
    return NextResponse.json(
      { code: 'UNAUTHORIZED', error: 'Not authorised for this shop.' }, { status: 403 });
  }

  // 2. The vehicle is this shop's. Checked against the database, not the body.
  if (!await vehicleBelongsToShop(input.shopId, input.vehicleId)) {
    logger.warn('parts.select_model.foreign_vehicle', { shopId: input.shopId });
    return NextResponse.json(
      { code: 'UNAUTHORIZED', error: 'Not authorised for this vehicle.' }, { status: 403 });
  }

  const vehicle = await loadCanonicalVehicle(input.shopId, input.vehicleId);
  if (!vehicle) {
    return NextResponse.json(
      { code: 'UNAUTHORIZED', error: 'Not authorised for this vehicle.' }, { status: 403 });
  }

  // 3. The vehicle has not changed since the technician saw the series list.
  const current = vehicleFingerprint(vehicle);
  if (current !== input.fingerprint) {
    return NextResponse.json({
      code: 'VEHICLE_CHANGED',
      error: 'This vehicle changed since the catalogue search. Search again to pick a series.',
      fingerprint: current,
    }, { status: 409 });
  }

  try {
    /**
     * 4. Continue resolution with the chosen series.
     *
     * `bypassMapping` because a stored mapping is exactly what the technician
     * is overriding by choosing. The resolver validates `chosenModelId`
     * against its own candidate list.
     */
    const outcome = await resolveProviderVehicle(vehicle, {
      shopId: input.shopId,
      bypassMapping: true,
      chosenModelId: input.modelId,
    });

    // The series was not one the resolver offers for this vehicle.
    if (outcome.reasonCode === 'model_ambiguous') {
      return NextResponse.json({
        code: 'MODEL_INVALID',
        error: 'That model series is no longer one of the options. Search again.',
        modelCandidates: outcome.modelCandidates,
      }, { status: 409 });
    }

    // Resolved outright — the series was enough to pin one variant.
    if (outcome.resolution.resolutionStatus === 'resolved' && outcome.resolution.vehicleId) {
      const written = await writeMapping({
        shopId: input.shopId,
        vehicleId: input.vehicleId,
        resolution: { ...outcome.resolution, confirmedByUserId: auth.userId },
      });
      if (!written) {
        return NextResponse.json(
          { code: 'PERSIST_FAILED', error: 'The model series could not be saved.' },
          { status: 500 });
      }
      logger.info('parts.select_model.resolved', { shopId: input.shopId });
      return NextResponse.json({
        code: 'RESOLVED',
        resolution: {
          status: 'resolved',
          fingerprint: outcome.resolution.fingerprint,
          manufacturerName: outcome.resolution.manufacturerName,
          modelName: outcome.resolution.modelName,
          modificationDescription: outcome.resolution.modificationDescription,
        },
      });
    }

    /**
     * Still a choice to make, one level down. NOTHING is written: the vehicle
     * is not resolved, and a mapping recorded now would claim it is.
     */
    logger.info('parts.select_model.variant_required', { shopId: input.shopId });
    return NextResponse.json({
      code: 'VARIANT_REQUIRED',
      reasonCode: outcome.reasonCode,
      reason: outcome.resolution.evidence.at(-1)?.detail ?? '',
      modelName: outcome.resolution.modelName,
      candidates: outcome.candidates ?? [],
      fingerprint: outcome.resolution.fingerprint,
    });
  } catch {
    // Never the provider's words, and never a 5xx that reads like the
    // estimate is broken — manual entry still works.
    logger.warn('parts.select_model.provider_unavailable', { shopId: input.shopId });
    return NextResponse.json({
      code: 'PROVIDER_UNAVAILABLE',
      error: 'The parts catalogue could not be reached. You can still add parts manually.',
    }, { status: 200 });
  }
}
