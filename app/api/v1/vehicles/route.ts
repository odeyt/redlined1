/**
 * GET  /api/v1/vehicles  — list, tenant-scoped, paginated, searchable
 * POST /api/v1/vehicles  — create, idempotent
 *
 * Same shape as the customers slice, deliberately: the auth, tenancy,
 * idempotency and rate-limit machinery is the machinery that was proven in
 * M13.1, not a second implementation of it.
 */
import { z } from 'zod';
import { withApi, apiSuccess, type ApiContext } from '@/lib/api/handler';
import { ApiError } from '@/lib/api/errors';
import { createVehicleDomain, VehicleError, type DomainVehicle } from '@/lib/domain/vehicles';
import { reserveIdempotency, completeReservation, releaseReservation, hashRequest } from '@/lib/api/idempotency';

const MAX_PAGE_SIZE = 100;
const DEFAULT_PAGE_SIZE = 25;
const ENDPOINT = 'POST /api/v1/vehicles';

/**
 * What a caller may set.
 *
 * `.strict()` rejects unknown fields rather than ignoring them, so `shop_id`,
 * `id`, `owner_id` or an audit column cannot be smuggled in. Tenancy comes
 * from the key; there is no field here that could redirect it.
 *
 * `label` is the only required field, matching the domain: a vehicle can exist
 * with no VIN and no customer, and 15 in production do.
 */
const createBody = z.object({
  label: z.string().trim().min(1).max(200),
  customerId: z.string().trim().max(100).nullable().optional(),
  vin: z.string().trim().max(32).default(''),
  plate: z.string().trim().max(30).default(''),
  make: z.string().trim().max(60).default(''),
  model: z.string().trim().max(60).default(''),
  year: z.string().trim().max(10).default(''),
  fuelType: z.string().trim().max(30).default(''),
  trim: z.string().trim().max(60).default(''),
  engine: z.string().trim().max(60).default(''),
  transmission: z.string().trim().max(60).default(''),
  mileage: z.string().trim().max(20).default(''),
  status: z.string().trim().max(40).optional(),
  recommendation: z.string().trim().max(1000).default(''),
}).strict();

/**
 * The public shape.
 *
 * The service-record columns — issues, damage_intake, parts_needed,
 * tech_pay_entries, flat_rate_lak, assigned_tech — are deliberately absent.
 * They are the workshop's internal notes and its labour cost, and an
 * integration syncing a fleet has no business reading either.
 */
export function present(v: DomainVehicle) {
  return {
    id: v.id,
    label: v.label,
    vin: v.vin,
    plate: v.plate,
    make: v.make,
    model: v.model,
    year: v.year,
    fuel_type: v.fuelType,
    trim: v.trim,
    engine: v.engine,
    transmission: v.transmission,
    mileage: v.mileage,
    status: v.status,
    customer_id: v.customerId,
  };
}

/** Domain refusals carry a reason; map it to the stable API vocabulary. */
export function toApiError(err: unknown): ApiError {
  if (err instanceof VehicleError) {
    if (err.reason === 'VIN_INVALID') return new ApiError('VALIDATION_FAILED', { reason: err.message });
    // A customer in another tenant is reported exactly as one that does not
    // exist. Saying "forbidden" would confirm the id is real.
    if (err.reason === 'CUSTOMER_NOT_FOUND') return new ApiError('NOT_FOUND', { reason: err.message });
    return new ApiError('VALIDATION_FAILED', { reason: err.message });
  }
  throw err;
}

export const GET = withApi({ scopes: ['vehicles:read'] }, async (ctx: ApiContext) => {
  const url = new URL(ctx.request.url);

  const pageSize = Math.min(
    Math.max(Number(url.searchParams.get('page_size') ?? DEFAULT_PAGE_SIZE) || DEFAULT_PAGE_SIZE, 1),
    MAX_PAGE_SIZE,
  );
  const page = Math.max(Number(url.searchParams.get('page') ?? 1) || 1, 1);
  const search = (url.searchParams.get('search') ?? '').trim().toUpperCase();

  const vehicles = createVehicleDomain({ db: ctx.db, context: ctx.domain });
  const all = await vehicles.list();

  // Filtered in memory, on fields the caller may already read. Pushing a
  // caller-supplied string into a SQL filter is how an ilike pattern becomes a
  // way to probe columns; at this scale the difference is not worth it.
  const matched = search
    ? all.filter(v =>
        v.vin.toUpperCase().includes(search) ||
        v.plate.toUpperCase().includes(search) ||
        v.label.toUpperCase().includes(search) ||
        v.make.toUpperCase().includes(search) ||
        v.model.toUpperCase().includes(search))
    : all;

  // Total ordering: label then id, so a page boundary cannot drop or repeat a
  // row when two vehicles share a label — and many do.
  const ordered = [...matched].sort((a, b) =>
    a.label === b.label ? a.id.localeCompare(b.id) : a.label.localeCompare(b.label));
  const start = (page - 1) * pageSize;

  return apiSuccess(ordered.slice(start, start + pageSize).map(present), ctx.requestId, {
    page, page_size: pageSize, total: ordered.length, has_more: start + pageSize < ordered.length,
  });
});

export const POST = withApi(
  { scopes: ['vehicles:write'], requiresWriteShop: true },
  async (ctx: ApiContext) => {
    let raw: unknown;
    try {
      raw = await ctx.request.json();
    } catch {
      throw new ApiError('VALIDATION_FAILED', { reason: 'Body is not valid JSON.' });
    }

    const parsed = createBody.safeParse(raw);
    if (!parsed.success) {
      throw new ApiError('VALIDATION_FAILED', {
        issues: parsed.error.issues.map(i => ({ path: i.path.join('.'), message: i.message })),
      });
    }

    const idempotencyKey = ctx.request.headers.get('idempotency-key');
    const requestHash = hashRequest(parsed.data);

    // Reserve BEFORE creating. The unique index picks one winner among
    // concurrent requests; checking first and creating after let three
    // simultaneous retries create three vehicles.
    if (idempotencyKey) {
      const reservation = await reserveIdempotency(ctx.db, ctx.principal.keyId, ENDPOINT, idempotencyKey, requestHash);
      if (reservation.mode === 'replay') {
        return apiSuccess(reservation.body, ctx.requestId, { idempotent_replay: true }, reservation.statusCode);
      }
    }

    const vehicles = createVehicleDomain({ db: ctx.db, context: ctx.domain });

    let created: DomainVehicle;
    try {
      // The domain verifies customerId against context.shopIds before it
      // attaches anything, so a foreign customer never reaches the insert.
      created = await vehicles.create(parsed.data);
    } catch (err) {
      // Release the reservation, or a corrected retry would be told the
      // original is still in progress forever.
      if (idempotencyKey) {
        await releaseReservation(ctx.db, ctx.principal.keyId, ENDPOINT, idempotencyKey);
      }
      throw toApiError(err);
    }

    const body = present(created);
    if (idempotencyKey) {
      await completeReservation(ctx.db, ctx.principal.keyId, ENDPOINT, idempotencyKey, 201, body);
    }
    return apiSuccess(body, ctx.requestId, undefined, 201);
  },
);
