import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { z } from 'zod';
import { logger } from '@/lib/logger';
import { resolveProviderVehicle } from '@/lib/parts/vehicleResolution/resolver';
import { vehicleFingerprint } from '@/lib/parts/vehicleResolution/fingerprint';
import {
  writeMapping, candidateWasOffered,
} from '@/lib/parts/vehicleResolution/mappingStore';
import { loadCanonicalVehicle } from '@/lib/parts/vehicleResolution/loadVehicle';
import { readableShopIds } from '@/lib/shops/mirrorScope';

/**
 * POST /api/parts/vehicle-resolution/confirm
 *
 * A technician choosing which catalogue variant their vehicle is.
 *
 * ## Why this endpoint is security-sensitive
 *
 * A confirmed mapping is the strongest evidence in the fitment chain. Combined
 * with a part identity match and an applicability hit it produces VERIFIED
 * FIT — a green badge a shop fits brakes on. So a forged confirmation forges
 * the verdict, and `providerVehicleId` arrives from a browser.
 *
 * It is therefore treated as a REQUESTED selection, never as evidence. The
 * server re-derives the legitimate candidates itself and accepts the request
 * only if the requested id is among them. An integer that merely looks
 * plausible is refused.
 *
 * ## Not a generic mapping writer
 *
 * There is deliberately no endpoint that accepts a (vehicle, providerVehicleId)
 * pair and stores it. This one re-resolves, validates, and stores what IT
 * derived — the browser chooses between options the server produced.
 *
 * ## service_role does not authorise anything
 *
 * The mapping store runs as service_role and bypasses RLS entirely, so every
 * check below is the actual boundary. RLS protects a member's own SELECTs; it
 * has nothing to say about this route.
 */

const ConfirmSchema = z.object({
  shopId: z.string().uuid(),
  vehicleId: z.string().uuid(),
  providerVehicleId: z.number().int().positive(),
  /**
   * The catalogue series chosen at the previous step, when the model was
   * ambiguous. Optional: most vehicles resolve a series without asking.
   */
  modelId: z.number().int().positive().optional(),
  /**
   * The fingerprint the browser resolved against.
   *
   * A technician can leave Search Parts open while somebody edits the vehicle
   * in another tab. Saving a mapping against the identity they SAW, when it is
   * no longer the identity we HAVE, would pin the wrong variant permanently.
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
  return { userId: user.id, role: (row as { role?: string }).role ?? '' };
}

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
  }

  const parsed = ConfirmSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid confirmation request.' }, { status: 422 });
  }
  const input = parsed.data;

  // 1. Authenticated, and a member of THIS shop.
  const auth = await getAuth(input.shopId);
  if (!auth) {
    return NextResponse.json({ code: 'UNAUTHORIZED', error: 'Not authorised for this shop.' }, { status: 403 });
  }

  /**
   * 2. The vehicle is readable by this user from this shop. Checked against
   *    the database, not the body.
   *
   *    This single load IS the ownership gate. It used to be preceded by a
   *    `vehicleBelongsToShop` call running the identical predicate — id plus
   *    shop — which returned false exactly when this returns null. Once the
   *    scope became a set rather than one id, keeping both would have meant
   *    writing the mirror rules twice and trusting them to stay in step. Two
   *    copies of the vehicle read is precisely the shape of the bug that made
   *    confirm reject 95 of 115 vehicles, so there is now one copy.
   *
   *    The store still re-checks ownership before it writes, which is the
   *    belt-and-braces layer and is unaffected.
   */
  const scope = await readableShopIds(auth.userId, input.shopId);
  const loaded = await loadCanonicalVehicle(scope, input.vehicleId);
  if (!loaded) {
    logger.warn('parts.confirm.foreign_vehicle', { shopId: input.shopId });
    return NextResponse.json({ code: 'UNAUTHORIZED', error: 'Not authorised for this vehicle.' }, { status: 403 });
  }
  const { vehicle, ownerShopId } = loaded;

  // 3. The vehicle has not changed since the technician saw the candidates.
  const current = vehicleFingerprint(vehicle);
  if (current !== input.fingerprint) {
    return NextResponse.json({
      code: 'VEHICLE_CHANGED',
      error: 'This vehicle changed since the catalogue search. Resolve the vehicle again.',
      fingerprint: current,
    }, { status: 409 });
  }

  // 4. Re-derive the legitimate candidates. THIS is the validation — the
  //    browser's id is checked against what the server itself produced, not
  //    against anything the browser sent alongside it.
  //
  //    Cheap in practice: the reference cache answers manufacturer, model and
  //    variant lookups without an upstream call once warm.
  let outcome;
  try {
    outcome = await resolveProviderVehicle(vehicle, {
      shopId: input.shopId,
      bypassMapping: true,
      /**
       * The series the technician already chose, when there was a choice.
       *
       * Found live: without it, re-derivation re-runs model matching, goes
       * ambiguous again, and produces NO modification candidates — so
       * `candidateWasOffered` rejected a variant the technician had just been
       * shown, and the two-stage flow dead-ended at its second step.
       *
       * The series is deliberately not persisted before the vehicle resolves,
       * so it has to travel with the request. It is untrusted exactly like
       * `providerVehicleId`, and the resolver checks it against the candidate
       * list it derives itself before honouring it.
       */
      chosenModelId: input.modelId,
    });
  } catch {
    return NextResponse.json({
      code: 'PROVIDER_UNAVAILABLE',
      error: 'The parts catalogue could not be reached. You can still add parts manually.',
    }, { status: 200 });
  }

  const offered = outcome.candidates ?? [];
  if (!offered.length) {
    return NextResponse.json({
      code: 'CANDIDATE_INVALID',
      error: 'That vehicle variant is no longer available. Resolve the vehicle again.',
    }, { status: 409 });
  }

  if (!candidateWasOffered(input.providerVehicleId, offered)) {
    // The interesting failure. Logged with the shop but never the id, which
    // is attacker-controlled input.
    logger.warn('parts.confirm.candidate_not_offered', { shopId: input.shopId });
    return NextResponse.json({
      code: 'CANDIDATE_INVALID',
      error: 'That vehicle variant is not one of the options for this vehicle.',
    }, { status: 409 });
  }

  const chosen = offered.find(c => c.vehicleId === input.providerVehicleId)!;

  // 5. Persist. Upsert, so choosing the same variant twice is idempotent and
  //    two concurrent confirmations converge on one row rather than racing.
  const written = await writeMapping({
    // The vehicle's own shop. A confirmation is a person stating what the CAR
    // is, so it belongs to the car's record and is honoured from whichever
    // mirrored location the next search happens at.
    shopId: ownerShopId,
    vehicleId: input.vehicleId,
    confirmedByUserId: auth.userId,
    resolution: {
      ...outcome.resolution,
      resolutionStatus: 'resolved',
      vehicleId: chosen.vehicleId,
      modificationDescription: chosen.description,
      evidence: [
        ...outcome.resolution.evidence,
        {
          step: 'modification',
          outcome: 'matched',
          detail: `Technician confirmed "${chosen.description}".`,
        },
      ],
    },
  });

  if (!written) {
    return NextResponse.json({
      code: 'PERSIST_FAILED',
      error: 'The vehicle variant could not be saved. Try again.',
    }, { status: 500 });
  }

  logger.info('parts_vehicle_variant_confirmed', {
    shopId: input.shopId,
    providerModelId: outcome.resolution.modelId,
  });

  return NextResponse.json({
    code: 'CONFIRMED',
    resolution: {
      status: 'resolved',
      manufacturerName: outcome.resolution.manufacturerName,
      modelName: outcome.resolution.modelName,
      modificationDescription: chosen.description,
      providerVehicleId: chosen.vehicleId,
      confirmedByTechnician: true,
      fingerprint: current,
    },
  });
}
