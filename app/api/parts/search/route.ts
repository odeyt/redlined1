import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { z } from 'zod';
import { logger } from '@/lib/logger';
import { searchAllProviders } from '@/lib/parts/partsService';
import { getAllProviderHealth, anyProviderEnabled } from '@/lib/parts/providerRegistry';
import { rankParts } from '@/lib/parts/recommendation';
import { resolveProviderVehicle } from '@/lib/parts/vehicleResolution/resolver';
import { readMapping, writeMapping } from '@/lib/parts/vehicleResolution/mappingStore';
import { searchPartsForVehicle } from '@/lib/parts/vehicleFirst/search';
import { vehicleFirstTarget } from '@/lib/parts/vehicleFirst/gate';

/**
 * POST /api/parts/search — the only way the browser reaches a provider.
 *
 * Provider credentials live on this side of the wire and never cross it. The
 * client sends a query and vehicle context; it gets back normalised, ranked,
 * already-sanitised results.
 *
 * ## Authorisation
 *
 * Two checks, both required. An authenticated user is not enough: membership
 * of the shop being searched on behalf of is verified against `shop_users`,
 * matching the pattern the feature-flags and AI routes already use. Source
 * cost is wholesale pricing, so who may see it is a real question — the role
 * is returned to the client so the UI can hide cost from a technician whose
 * shop hides costs, and the SERVER is what decided the role.
 *
 * ## Availability is not an error
 *
 * With no provider configured this returns 200 with an empty result set and a
 * provider list explaining why. It never returns 5xx for "eBay is off",
 * because the modal must open and manual entry must remain available.
 */

// Bounded, because this string reaches a third-party URL. Long queries are
// also useless to a search API and are the cheap way to burn a rate limit.
const SearchSchema = z.object({
  query: z.string().trim().min(2).max(120),
  shopId: z.string().uuid(),
  /** Redlined1's vehicle id, when the estimate names a real vehicle record. */
  vehicleId: z.string().uuid().optional(),
  vin: z.string().trim().max(32).optional(),
  year: z.number().int().min(1900).max(2100).optional(),
  make: z.string().trim().max(60).optional(),
  model: z.string().trim().max(60).optional(),
  trim: z.string().trim().max(60).optional(),
  engine: z.string().trim().max(60).optional(),
  oemNumber: z.string().trim().max(60).optional(),
  manufacturerPartNumber: z.string().trim().max(60).optional(),
  currency: z.string().trim().max(8).optional(),
  country: z.string().trim().max(8).optional(),
  bypassCache: z.boolean().optional(),
}).strict();

/**
 * Per-user, per-instance rate limit.
 *
 * Honest about what it is: serverless instances are separate, so this is a
 * brake rather than a global quota. The public API's `api_rate_limit_hit` RPC
 * is keyed on an api_keys row and does not apply to a cookie session. It is
 * still worth having — it stops one stuck client hammering a provider — and
 * the real backstop is that providers are called at most once per cache key.
 */
const RATE_LIMIT = 30;
const RATE_WINDOW_MS = 60_000;
const hits = new Map<string, { count: number; windowStart: number }>();

function rateLimited(userId: string, now = Date.now()): boolean {
  const entry = hits.get(userId);
  if (!entry || now - entry.windowStart >= RATE_WINDOW_MS) {
    hits.set(userId, { count: 1, windowStart: now });
    return false;
  }
  entry.count += 1;
  return entry.count > RATE_LIMIT;
}

/**
 * A VIN identifies a vehicle and, through it, a customer. There is no existing
 * masking helper in this codebase, so one is defined here and the full VIN is
 * never logged — only the last four, which is what a person recognises without
 * the value being re-identifiable on its own.
 */
function maskVin(vin?: string): string | undefined {
  if (!vin) return undefined;
  const v = vin.trim();
  if (v.length <= 4) return '****';
  return '*'.repeat(Math.max(0, v.length - 4)) + v.slice(-4);
}

async function getAuthContext(req: NextRequest, shopId: string) {
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} } },
  );

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  // Membership of THIS shop, not merely a valid session. Without it any signed
  // in user could search on behalf of any shop id they typed.
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

  const parsed = SearchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid search request.', issues: parsed.error.issues.map(i => i.path.join('.')) },
      { status: 422 },
    );
  }
  const input = parsed.data;

  const auth = await getAuthContext(req, input.shopId);
  if (!auth) {
    // 404-style opacity is unnecessary here — the caller supplied the shop id —
    // but the message deliberately does not distinguish "not signed in" from
    // "not a member of that shop".
    return NextResponse.json({ error: 'Not authorised for this shop.' }, { status: 403 });
  }

  if (rateLimited(auth.userId)) {
    return NextResponse.json(
      { error: 'Too many searches. Wait a moment and try again.' },
      { status: 429 },
    );
  }

  // Vehicle context, never the VIN itself, and never the customer.
  logger.info('parts_search_started', {
    shopId: input.shopId,
    provider: 'all',
    hasVehicle: Boolean(input.year && input.make && input.model),
    vin: maskVin(input.vin),
  });

  if (!anyProviderEnabled()) {
    logger.info('parts_provider_unavailable', { shopId: input.shopId, reason: 'none_enabled' });
    return NextResponse.json({
      results: [],
      providers: getAllProviderHealth(),
      outcomes: [],
      searchedAt: new Date().toISOString(),
      role: auth.role,
    });
  }

  try {
    const response = await searchAllProviders(
      {
        // Carried so provider calls are attributed in usage accounting.
        shopId: input.shopId,
        query: input.query,
        vin: input.vin,
        year: input.year,
        make: input.make,
        model: input.model,
        trim: input.trim,
        engine: input.engine,
        oemNumber: input.oemNumber,
        manufacturerPartNumber: input.manufacturerPartNumber,
        currency: input.currency,
        country: input.country,
      },
      { bypassCache: input.bypassCache },
    );

    // The vehicle's marque decides which rows may carry a badge. A catalogue
    // row filed under another marque stays in the list — it is a candidate —
    // but it is not endorsed.
    /**
     * Resolve the estimate's vehicle to a catalogue variant.
     *
     * Deliberately AFTER the parts search and deliberately non-fatal: a
     * failure here costs the fitment claim, never the search. The technician
     * still gets their parts list.
     *
     * The persisted mapping is consulted first, so the manufacturer, model and
     * variant endpoints are hit once per vehicle rather than once per search —
     * the difference between four searches on one car spending three calls
     * and spending twelve.
     */
    let vehicleResolution: unknown;
    let resolvedProviderVehicleId: number | undefined;
    if (input.vehicleId && input.make && input.model) {
      try {
        const canonical = {
          id: input.vehicleId,
          vin: input.vin, year: input.year, make: input.make, model: input.model,
          trim: input.trim, engine: input.engine,
        };
        const existingMapping = await readMapping(input.shopId, input.vehicleId);
        const outcome = await resolveProviderVehicle(canonical, {
          shopId: input.shopId,
          existingMapping,
        });

        // Store what was resolved so the next search reuses it. A technician
        // confirmation is never overwritten by a weaker computed result.
        const alreadyConfirmed = Boolean(existingMapping?.confirmed_by_user_id);
        if (!alreadyConfirmed && outcome.externalCalls > 0) {
          await writeMapping({
            shopId: input.shopId,
            vehicleId: input.vehicleId,
            resolution: outcome.resolution,
          });
        }

        resolvedProviderVehicleId = vehicleFirstTarget(input, outcome.resolution);

        vehicleResolution = {
          status: outcome.resolution.resolutionStatus,
          reason: outcome.resolution.evidence.at(-1)?.detail ?? '',
          fingerprint: outcome.resolution.fingerprint,
          vehicleId: input.vehicleId,
          candidates: outcome.candidates,
          manufacturerName: outcome.resolution.manufacturerName,
          modelName: outcome.resolution.modelName,
          modificationDescription: outcome.resolution.modificationDescription,
          confirmedByTechnician: alreadyConfirmed,
        };
      } catch {
        // Silent by design. The parts list is still worth returning, and the
        // fitment fields already default to unverified.
        logger.warn('parts_vehicle_resolution_failed', { shopId: input.shopId });
      }
    }

    /**
     * Vehicle-first discovery. The gate that decides whether this runs at all
     * lives in `vehicleFirstTarget`, which returns the id to scope by.
     *
     * Non-fatal, like resolution: a failure here costs the vehicle-specific
     * results, never the search.
     */
    let productGroups: unknown;

    if (resolvedProviderVehicleId) {
      try {
        const vf = await searchPartsForVehicle({
          shopId: input.shopId,
          providerVehicleId: resolvedProviderVehicleId,
          query: input.query,
          currency: input.currency,
        });
        // Prepended: these are scoped to this vehicle, and a generic result
        // has no business above one the catalogue listed for the car itself.
        response.results.unshift(...vf.results);
        productGroups = vf.productGroups;
      } catch {
        logger.warn('parts_vehicle_first_search_failed', { shopId: input.shopId });
      }
    }

    const scored = rankParts(response.results, { vehicleMake: input.make });

    logger.info('parts_search_completed', {
      shopId: input.shopId,
      resultCount: scored.length,
      providers: response.outcomes.map(o => `${o.provider}:${o.ok ? o.count : 'fail'}`).join(','),
    });

    return NextResponse.json({
      results: scored.map(s => ({ ...s.part, recommendation: s.recommendation })),
      providers: response.providers,
      outcomes: response.outcomes,
      searchedAt: response.searchedAt,
      role: auth.role,
      vehicleResolution,
      productGroups,
    });
  } catch (err) {
    // Reaching here means the orchestrator itself failed, not a provider —
    // allSettled already absorbs those. Still a 200-shaped failure for the
    // client to render, because a broken search must not break the estimate.
    logger.error('parts_search_failed', {
      shopId: input.shopId,
      reason: err instanceof Error ? err.message : 'unknown',
    });
    return NextResponse.json(
      {
        results: [],
        providers: getAllProviderHealth(),
        outcomes: [],
        searchedAt: new Date().toISOString(),
        role: auth.role,
        error: 'Parts search is temporarily unavailable. You can still add the part manually.',
      },
      { status: 200 },
    );
  }
}
